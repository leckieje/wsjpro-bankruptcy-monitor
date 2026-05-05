#!/usr/bin/env python3
"""
build_test_sheet.py - Generate sheet.csv from S&P exports + master list + FSS API.

Fetches FSS sentiment scores for all companies in the dataset, then saves:
1. A combined master file (get-data/output/sp_fss_combined_master.csv) for future --skip-api runs
2. The final sheet.csv for the frontend

Usage:
    python build_test_sheet.py              # Fetch from FSS API
    python build_test_sheet.py --skip-api   # Use cached sp_fss_combined_master.csv
"""

import argparse
import json
import logging
import os
import re
import sys
from datetime import date, timedelta
from pathlib import Path
from time import sleep

import numpy as np
import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("build_sheet")


FSS_BASE_URL = "https://api.dowjones.com/fss"
CHUNK_SIZE = 1000
API_DELAY_SECONDS = 20
LOOKBACK_DAYS = 5


def get_http_session():
    session = requests.Session()
    retry = Retry(total=3, backoff_factor=1.0, status_forcelist=[429, 500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def fss_extraction_call(company_codes, start_date, end_date, api_key, session):
    """Call FSS extraction API and return DataFrame of scores."""
    url = f"{FSS_BASE_URL}/extractions/"
    headers = {"Content-Type": "application/json", "user-key": api_key}
    payload = {
        "query": {
            "companies": company_codes,
            "start": start_date,
            "end": end_date,
            "articles": False,
            "format": "json",
        }
    }

    response = session.post(url, headers=headers, json=payload)
    if response.status_code != 201:
        logger.error(f"FSS API error: {response.status_code} - {response.text}")
        response.raise_for_status()

    resp = response.json()
    job_id = resp["extraction_id"]
    current_state = resp["state"]

    while current_state != "JOB_STATE_DONE":
        sleep(10)
        get_job_resp = session.get(f"{url}{job_id}", headers=headers)
        get_job_resp.raise_for_status()
        job_data = get_job_resp.json()
        current_state = job_data["state"]
        logger.debug(f"Job {job_id}: {current_state}")

    if "destination" not in job_data:
        logger.warning(f"Job {job_id} completed but no destination URL")
        return pd.DataFrame()

    data_resp = session.get(job_data["destination"][0], headers=headers)
    data_resp.raise_for_status()

    lines = data_resp.text.strip().split("\n")
    records = []
    for line in lines:
        if line:
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as e:
                logger.warning(f"Skipping malformed line: {e}")

    if records:
        return pd.DataFrame(records)
    logger.warning("No score data returned from API")
    return pd.DataFrame()


def fetch_fss_scores(company_codes, api_key, session):
    """Fetch FSS scores for all company codes, chunked."""
    end_dt = date.today()
    start_dt = end_dt - timedelta(days=LOOKBACK_DAYS)
    end_str = end_dt.isoformat()
    start_str = start_dt.isoformat()

    logger.info(f"Fetching FSS scores: {start_str} to {end_str} for {len(company_codes)} companies")

    all_results = []
    num_chunks = (len(company_codes) + CHUNK_SIZE - 1) // CHUNK_SIZE

    for i in range(num_chunks):
        start_idx = i * CHUNK_SIZE
        end_idx = min((i + 1) * CHUNK_SIZE, len(company_codes))
        chunk = company_codes[start_idx:end_idx]
        logger.info(f"Processing chunk {i + 1}/{num_chunks} ({len(chunk)} companies)")

        chunk_df = fss_extraction_call(chunk, start_str, end_str, api_key, session)
        if not chunk_df.empty:
            all_results.append(chunk_df)

        if i < num_chunks - 1:
            logger.info(f"Waiting {API_DELAY_SECONDS}s before next chunk...")
            sleep(API_DELAY_SECONDS)

    if not all_results:
        logger.error("No FSS score data returned from any chunk.")
        return pd.DataFrame()

    scores = pd.concat(all_results, ignore_index=True)

    # Calculate proportion of negative articles
    if "negative_article_count" in scores.columns and "total_article_count" in scores.columns:
        scores["negative_article_count"] = pd.to_numeric(
            scores["negative_article_count"], errors="coerce"
        ).fillna(0).astype(int)
        scores["total_article_count"] = pd.to_numeric(
            scores["total_article_count"], errors="coerce"
        ).fillna(0).astype(int)
        scores["prop_negative_article"] = np.where(
            scores["total_article_count"] > 0,
            (scores["negative_article_count"] / scores["total_article_count"] * 100).round(2),
            0,
        )

    logger.info(f"FSS scores fetched: {len(scores)} total records")
    return scores


def get_latest_scores(scores_df):
    """Get the most recent score per company."""
    scores_df = scores_df.copy()
    scores_df["score_date"] = pd.to_datetime(scores_df["score_date"])
    idx = scores_df.groupby("_company_code")["score_date"].idxmax()
    latest = scores_df.loc[idx].reset_index(drop=True)
    logger.info(f"Latest scores: {len(latest)} unique companies (from {len(scores_df)} records)")
    return latest


def clean_numeric(series):
    s = series.astype(str).str.replace(",", "", regex=False)
    s = s.str.replace(r"\((.*)\)", r"-\1", regex=True)
    s = s.str.strip().str.replace("$", "", regex=False)
    return pd.to_numeric(s, errors="coerce")


def main():
    parser = argparse.ArgumentParser(description="Build sheet.csv with S&P + FSS data")
    parser.add_argument("--skip-api", action="store_true",
                        help="Use cached sp_fss_combined_master.csv instead of calling FSS API")
    parser.add_argument("--no-fss", action="store_true",
                        help="Skip FSS entirely (generate sheet with S&P data only)")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent.parent
    get_data_dir = Path(__file__).resolve().parent
    output_dir = get_data_dir / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    master_cache_path = output_dir / "sp_fss_combined_master.csv"

    # --- Load and combine S&P data ---
    sp_dir = get_data_dir / "fss-sp-sectors" / "sp-exports"
    frames = []
    for f in sorted(sp_dir.glob("*.csv")):
        df = pd.read_csv(f, low_memory=False)
        frames.append(df)
    combined = pd.concat(frames, ignore_index=True)
    combined["SP_CIQ_ID"] = pd.to_numeric(
        combined["SP_CIQ_ID"].astype(str).str.replace("IQ", "", regex=False),
        errors="coerce",
    )
    combined = combined.drop_duplicates(subset=["SP_CIQ_ID"], keep="last")
    logger.info(f"S&P data: {len(combined)} companies from {len(frames)} files")

    # --- Load master list ---
    master_path = get_data_dir / "fss-sp-sectors" / "master-list" / "sp-fss-masterlist-ID1296.csv"
    master = pd.read_csv(master_path, low_memory=False)
    master = master.rename(columns={"SPCIQ_ID": "SP_CIQ_ID"})
    master["SP_CIQ_ID"] = pd.to_numeric(master["SP_CIQ_ID"], errors="coerce")

    # --- Merge master + S&P ---
    merged = master.merge(combined, on="SP_CIQ_ID", how="inner")
    logger.info(f"Merged master+S&P (by CIQ ID): {len(merged)} companies")

    # --- Ticker fallback for unmatched S&P rows ---
    matched_sp_ids = set(merged["SP_CIQ_ID"].dropna())
    unmatched_sp = combined[~combined["SP_CIQ_ID"].isin(matched_sp_ids)].copy()
    if len(unmatched_sp) > 0:
        unmatched_sp["_ticker"] = unmatched_sp["SP_ENTITY_NAME"].apply(
            lambda x: (re.search(r":([A-Z.]+)\)", str(x)) or [None, None])[1]
        )
        unmatched_sp = unmatched_sp[unmatched_sp["_ticker"].notna()]
        if len(unmatched_sp) > 0:
            fallback = master.merge(
                unmatched_sp, left_on="Ticker", right_on="_ticker",
                how="inner", suffixes=("", "_sp"),
            )
            if len(fallback) > 0:
                sp_cols = [c for c in fallback.columns if c.endswith("_sp")]
                fallback = fallback.drop(columns=sp_cols + ["_ticker"])
                merged = pd.concat([merged, fallback], ignore_index=True)
                logger.info(f"Ticker fallback matched {len(fallback)} additional companies")
    logger.info(f"Total merged: {len(merged)} companies")

    # --- FSS Scores ---
    if args.no_fss:
        logger.info("Skipping FSS (--no-fss). Sheet will have empty FSS columns.")
    elif args.skip_api:
        if not master_cache_path.exists():
            sys.exit(f"ERROR: --skip-api specified but cache not found: {master_cache_path}")
        logger.info(f"Loading cached combined master from {master_cache_path.name}")
        merged = pd.read_csv(master_cache_path, low_memory=False)
    else:
        api_key = os.environ.get("FACTIVA_SENTIMENT_API_KEY", "").strip("'\"")
        if not api_key:
            sys.exit(
                "ERROR: FACTIVA_SENTIMENT_API_KEY not set.\n"
                "Set it in .env or use --skip-api to use cached data."
            )

        session = get_http_session()
        company_codes = merged["CompanyCode-fss"].dropna().unique().tolist()
        logger.info(f"Company codes for FSS: {len(company_codes)}")

        scores_raw = fetch_fss_scores(company_codes, api_key, session)

        if scores_raw.empty:
            logger.warning("No FSS scores returned. Continuing with empty FSS data.")
        else:
            # Save raw scores
            scores_raw.to_csv(output_dir / "fss_scores_raw.csv", index=False, encoding="utf-8-sig")
            logger.info(f"Saved raw FSS scores: {len(scores_raw)} records")

            # Get latest per company
            latest = get_latest_scores(scores_raw)

            # Merge FSS scores into the S&P+master data
            latest = latest.rename(columns={"_company_code": "CompanyCode-fss"})
            merged = merged.merge(latest, on="CompanyCode-fss", how="left")

        # Save combined master
        merged.to_csv(master_cache_path, index=False, encoding="utf-8-sig")
        logger.info(f"Saved combined master: {master_cache_path} ({len(merged)} rows)")

    # --- Build final sheet.csv ---
    output = pd.DataFrame()
    output["Company"] = merged.get("CompanyName-fss", merged.get("SP_ENTITY_NAME", ""))
    output["Sector"] = merged["Sector"]
    output["SubSector"] = merged["SubSector"]
    output["Industry"] = merged["Industry"]
    output["Ticker"] = merged["Ticker"]

    # FSS scores
    if "score" in merged.columns:
        output["FSS Score"] = pd.to_numeric(merged["score"], errors="coerce")
    else:
        output["FSS Score"] = np.nan

    if "weekly_percentage_change" in merged.columns:
        output["FSS Weekly Change"] = pd.to_numeric(merged["weekly_percentage_change"], errors="coerce")
    else:
        output["FSS Weekly Change"] = np.nan

    if "total_article_count" in merged.columns:
        output["Total Articles"] = pd.to_numeric(merged["total_article_count"], errors="coerce")
    else:
        output["Total Articles"] = np.nan

    if "prop_negative_article" in merged.columns:
        output["Negative Articles"] = pd.to_numeric(merged["prop_negative_article"], errors="coerce")
    elif "negative_article_count" in merged.columns and "total_article_count" in merged.columns:
        neg = pd.to_numeric(merged["negative_article_count"], errors="coerce")
        total = pd.to_numeric(merged["total_article_count"], errors="coerce")
        output["Negative Articles"] = np.where(total > 0, (neg / total * 100).round(2), np.nan)
    else:
        output["Negative Articles"] = np.nan

    # Z-Score (Altman 5-factor)
    ta = clean_numeric(merged.get("IQ_TOTAL_ASSETS_Y", pd.Series(dtype=str)))
    tl = clean_numeric(merged.get("IQ_TOTAL_LIAB_Y", pd.Series(dtype=str)))
    wc = clean_numeric(merged.get("IQ_WORKING_CAP_Y", pd.Series(dtype=str)))
    retained = clean_numeric(merged.get("IQ_RETAINED_EARNINGS_Y", pd.Series(dtype=str)))
    ebit = clean_numeric(merged.get("IQ_EBIT_Y", pd.Series(dtype=str)))
    rev = clean_numeric(merged.get("IQ_TOTAL_REV_Y", pd.Series(dtype=str)))
    mc = clean_numeric(merged.get("SP_MARKETCAP_Current", pd.Series(dtype=str)))

    x1 = np.where(ta != 0, wc / ta, np.nan)
    x2 = np.where(ta != 0, retained / ta, np.nan)
    x3 = np.where(ta != 0, ebit / ta, np.nan)
    x4 = np.where(tl != 0, mc / tl, np.nan)
    x5 = np.where(ta != 0, rev / ta, np.nan)

    # Require at least 3 of 5 components to have data
    components = np.array([x1, x2, x3, x4, x5])
    valid_count = np.sum(~np.isnan(components), axis=0)

    z_score = (
        1.2 * np.nan_to_num(x1)
        + 1.4 * np.nan_to_num(x2)
        + 3.3 * np.nan_to_num(x3)
        + 0.6 * np.nan_to_num(x4)
        + 1.0 * np.nan_to_num(x5)
    )
    z_score = np.where(valid_count >= 3, z_score, np.nan)
    output["Z-Score"] = np.round(z_score, 4)

    # Receivables to Revenue
    receiv = clean_numeric(merged.get("IQ_TOTAL_RECEIV_Y", pd.Series(dtype=str)))
    output["Receivables to Revenue"] = np.where(
        rev != 0, np.round(receiv / rev, 4), np.nan
    )

    # Debt to EBITDA
    total_debt = clean_numeric(merged.get("IQ_TOTAL_DEBT_Y", pd.Series(dtype=str)))
    ebitda = clean_numeric(merged.get("IQ_EBITDA_Y", pd.Series(dtype=str)))
    debt_to_ebitda = np.where(
        (ebitda != 0) & total_debt.notna() & ebitda.notna(),
        np.round(total_debt / ebitda, 4),
        np.nan,
    )
    output["Debt to EBITDA"] = debt_to_ebitda
    output["_ebitda"] = ebitda
    output["_totalDebt"] = total_debt

    # Quick Ratio
    output["Quick Ratio"] = clean_numeric(
        merged.get("IQ_QUICK_RATIO_Y", pd.Series(dtype=str))
    )

    # Credit Rating
    rating_col = next(
        (c for c in merged.columns if c.startswith("RD_CREDIT_RATING_GLOBAL")),
        None,
    )
    if rating_col:
        output["S&P Issuer Credit Rating"] = merged[rating_col]
    else:
        output["S&P Issuer Credit Rating"] = ""

    # Market Cap
    output["Market Capitalization"] = mc

    # Prices
    output["Current Open Price"] = clean_numeric(
        merged.get("SP_PRICE_OPEN_Current", pd.Series(dtype=str))
    )
    output["52-Week High Price"] = clean_numeric(
        merged.get("SP_PRICE_HIGH_Current", pd.Series(dtype=str))
    )
    output["52-Week Low Price"] = clean_numeric(
        merged.get("SP_PRICE_LOW_Current", pd.Series(dtype=str))
    )

    # Save
    out_path = project_root / "src" / "data" / "sheet.csv"
    output.to_csv(out_path, index=False)

    # Report
    fss_filled = output["FSS Score"].notna().sum()
    logger.info(f"Saved {out_path}: {len(output)} rows, {len(output.columns)} columns")
    logger.info(f"FSS coverage: {fss_filled}/{len(output)} companies have FSS scores")
    logger.info(f"Sectors: {sorted(output['Sector'].unique().tolist())}")


if __name__ == "__main__":
    main()
