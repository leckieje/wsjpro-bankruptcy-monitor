#!/usr/bin/env python3
"""
generate_scores.py - WSJ Pro Bankruptcy Risk Score Pipeline

Fetches company bankruptcy risk indicators from Dow Jones FSS API,
merges with S&P Global financial data, calculates Altman Z-Scores,
and outputs a scored CSV for the React frontend.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from time import sleep
from typing import Optional

import numpy as np
import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


@dataclass
class PipelineConfig:
    project_root: Path
    input_dir: Path
    output_dir: Path
    final_csv_path: Path
    fss_api_key: str
    fss_base_url: str = "https://api.dowjones.com/fss"
    fetch_fresh_codes: bool = False
    sp_csv_filename: str = ""
    sp_dir: Optional[Path] = None
    master_csv_filename: str = "bk_companyList_MASTER.csv"
    company_codes_filename: str = "FSS_company_codes.csv"
    score_lookback_days: int = 5
    chunk_size: int = 1000
    api_delay_seconds: int = 20
    industries: list[str] = field(default_factory=lambda: ["retail", "software"])
    all_industries: bool = False
    excluded_industries: list[str] = field(default_factory=lambda: ["Retail REITs"])
    min_company_threshold: int = 30
    regions: list[str] = field(default_factory=lambda: ["USA"])
    skip_api: bool = False
    list_status_filter: str = "L"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="WSJ Pro Bankruptcy Risk Score data pipeline"
    )
    parser.add_argument(
        "--sp-csv",
        help="S&P Global export CSV filename (in input/ directory)"
    )
    parser.add_argument(
        "--sp-dir",
        help="Directory containing S&P Global export CSVs (reads all .csv files)"
    )
    parser.add_argument(
        "--master-csv",
        default="fss-sp-sectors/master-list/sp-fss-masterlist-ID1296.csv",
        help="Master company list CSV (relative to get-data/)"
    )
    parser.add_argument(
        "--industries", default="retail,software",
        help="Comma-separated industry keywords to include (default: retail,software)"
    )
    parser.add_argument(
        "--all-industries", action="store_true",
        help="Include all industries meeting minimum threshold"
    )
    parser.add_argument(
        "--exclude-industries", default="Retail REITs",
        help="Comma-separated industries to exclude (default: 'Retail REITs')"
    )
    parser.add_argument(
        "--lookback-days", type=int, default=5,
        help="Days of FSS scores to fetch (default: 5)"
    )
    parser.add_argument(
        "--fetch-fresh-codes", action="store_true",
        help="Re-download company codes from FSS API instead of reading from file"
    )
    parser.add_argument(
        "--skip-api", action="store_true",
        help="Skip FSS API calls; use previously saved scores from output/"
    )
    parser.add_argument(
        "--list-status", default="L", choices=["L", "UL", "ALL"],
        help="Filter by list status: L=listed, UL=unlisted, ALL=both (default: L)"
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="Enable debug logging"
    )
    return parser.parse_args()


def build_config(args: argparse.Namespace) -> PipelineConfig:
    if not args.sp_csv and not args.sp_dir:
        sys.exit("ERROR: At least one of --sp-csv or --sp-dir is required.")

    api_key = os.environ.get("FSS_API_KEY", "")
    if not api_key and not args.skip_api:
        sys.exit(
            "ERROR: FSS_API_KEY environment variable is required.\n"
            "Set it with: export FSS_API_KEY='your-key-here'\n"
            "Or use --skip-api to use previously saved scores."
        )

    project_root = Path(__file__).resolve().parent.parent
    get_data_dir = Path(__file__).resolve().parent
    input_dir = get_data_dir / "input"
    output_dir = get_data_dir / "output"

    sp_dir = Path(args.sp_dir) if args.sp_dir else None
    if sp_dir and not sp_dir.is_absolute():
        sp_dir = get_data_dir / sp_dir

    master_csv_path = args.master_csv
    master_path = Path(master_csv_path)
    if not master_path.is_absolute():
        master_path = get_data_dir / master_path

    return PipelineConfig(
        project_root=project_root,
        input_dir=input_dir,
        output_dir=output_dir,
        final_csv_path=project_root / "src" / "data" / "sheet.csv",
        fss_api_key=api_key,
        fetch_fresh_codes=args.fetch_fresh_codes,
        sp_csv_filename=args.sp_csv or "",
        sp_dir=sp_dir,
        master_csv_filename=str(master_path),
        score_lookback_days=args.lookback_days,
        industries=[s.strip().lower() for s in args.industries.split(",")],
        all_industries=args.all_industries,
        excluded_industries=[s.strip() for s in args.exclude_industries.split(",")],
        skip_api=args.skip_api,
        list_status_filter=args.list_status,
    )


def setup_logging(verbose: bool = False) -> logging.Logger:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    return logging.getLogger("pipeline")


def get_http_session(retries: int = 3, backoff: float = 1.0) -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=retries,
        backoff_factor=backoff,
        status_forcelist=[429, 500, 502, 503, 504],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def clean_numeric_column(series: pd.Series) -> pd.Series:
    s = series.astype(str)
    s = s.str.replace(",", "", regex=False)
    s = s.str.replace(r"\((.*)\)", r"-\1", regex=True)
    s = s.str.strip().str.replace("$", "", regex=False)
    return pd.to_numeric(s, errors="coerce")


def save_intermediate(
    df: pd.DataFrame, path: Path, description: str, logger: logging.Logger
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, encoding="utf-8-sig", index=False)
    logger.info(f"Saved {description}: {path.name} ({len(df)} rows)")


def discover_column(
    columns: list[str], patterns: list[str], suffix: Optional[str] = None
) -> Optional[str]:
    """Find a column name matching any of the given patterns (case-insensitive).
    If suffix is provided, prefer columns ending with that suffix."""
    matches = []
    for col in columns:
        col_upper = col.upper()
        for pattern in patterns:
            if pattern.upper() in col_upper:
                matches.append(col)
                break

    if not matches:
        return None

    if suffix:
        suffixed = [m for m in matches if m.endswith(suffix)]
        if suffixed:
            return suffixed[0]

    return matches[0]


# =============================================================================
# STEP 1: Fetch/Load Company Codes
# =============================================================================

def fetch_company_codes(
    config: PipelineConfig,
    session: requests.Session,
    logger: logging.Logger,
) -> pd.DataFrame:
    if config.fetch_fresh_codes:
        logger.info("Fetching fresh company codes from FSS API...")
        url = f"{config.fss_base_url}/taxonomies/companies?format=json"
        headers = {"user-key": config.fss_api_key}

        response = session.get(url, headers=headers)
        response.raise_for_status()
        resp = response.json()

        get_job_url = resp["download_urls"][0]
        get_job_resp = session.get(get_job_url, headers=headers)
        get_job_resp.raise_for_status()

        lines = get_job_resp.text.strip().split("\n")
        records = []
        for line in lines:
            if line:
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError as e:
                    logger.warning(f"Skipping malformed line: {e}")

        codes = pd.DataFrame(records)
        save_path = config.input_dir / config.company_codes_filename
        codes.to_csv(save_path, encoding="utf-8-sig", index=False)
        logger.info(f"Saved fresh codes to {save_path}")
    else:
        codes_path = config.input_dir / config.company_codes_filename
        if not codes_path.exists():
            sys.exit(
                f"ERROR: Company codes file not found: {codes_path}\n"
                "Use --fetch-fresh-codes to download from FSS API."
            )
        logger.info(f"Loading company codes from {codes_path}")
        codes = pd.read_csv(codes_path, low_memory=False)

    codes = codes[codes.Region.isin(config.regions)].reset_index(drop=True)
    save_intermediate(codes, config.output_dir / "fss_company_codes.csv",
                      "filtered company codes", logger)
    return codes


# =============================================================================
# STEP 2: Filter Industries and Explode
# =============================================================================

def filter_and_explode_companies(
    codes_df: pd.DataFrame,
    config: PipelineConfig,
    logger: logging.Logger,
) -> pd.DataFrame:
    counts = codes_df.IndustryDescriptor.value_counts().reset_index()
    valid_industries = counts[counts["count"] >= config.min_company_threshold][
        "IndustryDescriptor"
    ].tolist()

    if config.all_industries:
        target_industries = valid_industries
    else:
        target_industries = []
        for ind in valid_industries:
            for keyword in config.industries:
                if keyword in ind.lower():
                    target_industries.append(ind)
                    break

    target_industries = [
        i for i in target_industries if i not in config.excluded_industries
    ]
    logger.info(f"Target industries ({len(target_industries)}): {target_industries}")

    industry_df = codes_df[codes_df.IndustryDescriptor.isin(target_industries)]

    # Build per-industry company lists
    industry_data = {
        "industry": [],
        "count": [],
        "company_code": [],
        "company_name": [],
        "ticker": [],
        "status": [],
        "list_status": [],
    }

    for ind in target_industries:
        subset = codes_df[codes_df.IndustryDescriptor == ind]
        industry_data["industry"].append(ind)
        industry_data["count"].append(len(subset))
        industry_data["company_code"].append(subset._CompanyCode.tolist())
        industry_data["company_name"].append(subset.CompanyName.tolist())
        industry_data["ticker"].append(subset.ExchangeTicker.tolist())
        industry_data["status"].append(subset.Status.tolist())
        industry_data["list_status"].append(subset.ListStatus.tolist())

    inds_df = pd.DataFrame(industry_data)

    cols_to_explode = ["company_name", "status", "list_status", "ticker", "company_code"]
    co_df = inds_df.explode(cols_to_explode).reset_index(drop=True)
    co_df = co_df[["industry", "company_name", "status", "list_status", "ticker", "company_code"]]
    co_df = co_df[co_df.status == "A"]

    if config.list_status_filter != "ALL":
        co_df = co_df[co_df.list_status == config.list_status_filter]

    co_df = co_df.reset_index(drop=True)
    logger.info(f"Active companies after filtering: {len(co_df)}")

    save_intermediate(co_df, config.output_dir / "co_df.csv",
                      "active company list", logger)
    return co_df


# =============================================================================
# STEP 3: Parse S&P Global Export CSV
# =============================================================================

def parse_sp_global_csv_from_path(
    sp_path: Path, logger: logging.Logger
) -> pd.DataFrame:
    """Parse a single S&P Global export CSV with multi-row headers."""
    logger.info(f"Parsing S&P Global export: {sp_path.name}")
    sandp = pd.read_csv(sp_path, low_memory=False)

    # Find the header row containing SP_ENTITY_NAME
    header_mask = sandp.eq("SP_ENTITY_NAME").any(axis=1)
    if not header_mask.any():
        # Already has proper column names (output of convert_sp_exports.py)
        if "SP_ENTITY_NAME" in sandp.columns:
            logger.info(f"S&P data loaded: {len(sandp)} rows, {len(sandp.columns)} columns")
            return sandp
        sys.exit(
            f"ERROR: Could not find 'SP_ENTITY_NAME' in {sp_path.name}. "
            "Verify the file is a valid S&P Global Platform export."
        )
    header_idx = header_mask.idxmax()
    time_idx = header_idx + 1

    header_labels = sandp.iloc[header_idx].fillna("").astype(str)
    time_labels = sandp.iloc[time_idx].fillna("").astype(str)

    # Build column names with time suffixes
    time_cols = []
    for header, time in zip(header_labels, time_labels):
        if time == "":
            time_cols.append(header)
        elif "quarter" in time.lower():
            time_cols.append(f"{header}_Q")
        elif "year" in time.lower():
            time_cols.append(f"{header}_Y")
        else:
            time_cols.append(f"{header}_{time}")

    # Slice to data rows only
    sandp = sandp.iloc[time_idx + 1:]
    sandp.columns = time_cols
    sandp = sandp[sandp["SP_ENTITY_NAME"].notna()].reset_index(drop=True)

    logger.info(f"S&P data loaded: {len(sandp)} rows, {len(sandp.columns)} columns")
    logger.debug(f"S&P columns: {list(sandp.columns)}")

    return sandp


def parse_sp_global_csv(
    config: PipelineConfig, logger: logging.Logger
) -> pd.DataFrame:
    """Legacy wrapper: parse a single S&P CSV from the input directory."""
    sp_path = config.input_dir / config.sp_csv_filename
    if not sp_path.exists():
        sys.exit(f"ERROR: S&P Global CSV not found: {sp_path}")
    return parse_sp_global_csv_from_path(sp_path, logger)


def normalize_sp_ciq_id(series: pd.Series) -> pd.Series:
    """Strip 'IQ' prefix from SP_CIQ_ID values and convert to numeric."""
    return pd.to_numeric(
        series.astype(str).str.replace("IQ", "", regex=False),
        errors="coerce",
    )


def load_sp_data(
    config: PipelineConfig, logger: logging.Logger
) -> pd.DataFrame:
    """Load S&P data from a directory of CSVs or a single CSV file."""
    if config.sp_dir:
        csv_files = sorted(config.sp_dir.glob("*.csv"))
        if not csv_files:
            sys.exit(f"ERROR: No CSV files found in {config.sp_dir}")
        logger.info(f"Loading {len(csv_files)} S&P files from {config.sp_dir}")
        frames = []
        for f in csv_files:
            df = parse_sp_global_csv_from_path(f, logger)
            frames.append(df)
        combined = pd.concat(frames, ignore_index=True)
        combined["SP_CIQ_ID"] = normalize_sp_ciq_id(combined["SP_CIQ_ID"])
        combined = combined.drop_duplicates(subset=["SP_CIQ_ID"], keep="last")
        logger.info(f"Combined S&P data: {len(combined)} rows (deduplicated)")
        return combined
    else:
        sp_df = parse_sp_global_csv(config, logger)
        sp_df["SP_CIQ_ID"] = normalize_sp_ciq_id(sp_df["SP_CIQ_ID"])
        return sp_df


# =============================================================================
# STEP 4: Merge FSS with S&P
# =============================================================================

def merge_fss_with_sp(
    config: PipelineConfig,
    sp_df: pd.DataFrame,
    logger: logging.Logger,
) -> pd.DataFrame:
    master_path = Path(config.master_csv_filename)
    if not master_path.exists():
        # Try relative to input dir for backward compat
        master_path = config.input_dir / config.master_csv_filename
    if not master_path.exists():
        sys.exit(f"ERROR: Master company list not found: {master_path}")

    logger.info(f"Loading master company list: {master_path.name}")
    fss_list = pd.read_csv(master_path, low_memory=False)

    # Detect master-list format (new vs old)
    is_new_format = "SPCIQ_ID" in fss_list.columns

    if is_new_format:
        logger.info("Detected new master-list format (SPCIQ_ID, Sector, SubSector)")
        fss_list = fss_list.rename(columns={"SPCIQ_ID": "SP_CIQ_ID"})

        # Map columns for downstream compatibility
        if "CompanyCode-fss" in fss_list.columns:
            fss_list = fss_list.rename(columns={
                "CompanyCode-fss": "company_code_FSS",
                "CompanyName-fss": "company_name_FSS",
            })
        if "Industry" in fss_list.columns and "industry_FSS" not in fss_list.columns:
            fss_list["industry_FSS"] = fss_list["Industry"]
        if "Ticker" in fss_list.columns and "ticker_FSS" not in fss_list.columns:
            fss_list["ticker_FSS"] = fss_list["Ticker"]
        if "ListStatus" in fss_list.columns and "list_status_FSS" not in fss_list.columns:
            fss_list["list_status_FSS"] = fss_list["ListStatus"]

        # Filter to target industries
        if not config.all_industries:
            industry_mask = pd.Series([False] * len(fss_list))
            for keyword in config.industries:
                industry_mask |= fss_list.industry_FSS.str.lower().str.contains(
                    keyword, na=False
                )
            fss_list = fss_list[industry_mask]

        # Exclude specific industries
        fss_list = fss_list[~fss_list.industry_FSS.isin(config.excluded_industries)]

        # Filter by list status
        if config.list_status_filter != "ALL":
            fss_list = fss_list[fss_list.list_status_FSS == config.list_status_filter]

    else:
        # Old format
        if not config.all_industries:
            industry_mask = pd.Series([False] * len(fss_list))
            for keyword in config.industries:
                industry_mask |= fss_list.industry_FSS.str.lower().str.contains(
                    keyword, na=False
                )
            fss_list = fss_list[industry_mask]

        fss_list = fss_list[~fss_list.industry_FSS.isin(config.excluded_industries)]

        if config.list_status_filter != "ALL":
            fss_list = fss_list[fss_list.list_status_FSS == config.list_status_filter]

    fss_list = fss_list.reset_index(drop=True)

    # Cast merge key to int for reliable join
    fss_list["SP_CIQ_ID"] = pd.to_numeric(fss_list["SP_CIQ_ID"], errors="coerce")
    sp_df["SP_CIQ_ID"] = pd.to_numeric(sp_df["SP_CIQ_ID"], errors="coerce")

    # Merge with S&P data on SP_CIQ_ID
    merged = fss_list.merge(sp_df, on="SP_CIQ_ID", how="left")
    logger.info(
        f"Merged FSS+S&P: {len(merged)} rows "
        f"({len(fss_list)} FSS companies, {len(sp_df)} S&P records)"
    )

    save_intermediate(merged, config.output_dir / "fss_sp_merged.csv",
                      "merged FSS+S&P company list", logger)
    return merged


# =============================================================================
# STEP 5: Fetch FSS Scores
# =============================================================================

def _fss_extraction_call(
    company_codes: list[str],
    start_date: str,
    end_date: str,
    config: PipelineConfig,
    session: requests.Session,
    logger: logging.Logger,
) -> pd.DataFrame:
    url = f"{config.fss_base_url}/extractions/"
    headers = {
        "Content-Type": "application/json",
        "user-key": config.fss_api_key,
    }
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
        get_job_url = f"{url}{job_id}"
        get_job_resp = session.get(get_job_url, headers=headers)
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
                logger.warning(f"Skipping malformed score line: {e}")

    if records:
        return pd.DataFrame(records)
    logger.warning("No score data returned from API")
    return pd.DataFrame()


def fetch_fss_scores(
    company_codes: list[str],
    config: PipelineConfig,
    session: requests.Session,
    logger: logging.Logger,
) -> pd.DataFrame:
    if config.skip_api:
        cached_path = config.output_dir / "fss_scores_raw.csv"
        if not cached_path.exists():
            sys.exit(
                f"ERROR: --skip-api specified but no cached scores found at {cached_path}"
            )
        logger.info(f"Loading cached FSS scores from {cached_path.name}")
        return pd.read_csv(cached_path, low_memory=False)

    end_date = date.today()
    start_date = end_date - timedelta(days=config.score_lookback_days)
    end_str = end_date.isoformat()
    start_str = start_date.isoformat()
    logger.info(f"Fetching FSS scores: {start_str} to {end_str} for {len(company_codes)} companies")

    all_results = []
    num_chunks = (len(company_codes) + config.chunk_size - 1) // config.chunk_size

    for i in range(num_chunks):
        start_idx = i * config.chunk_size
        end_idx = min((i + 1) * config.chunk_size, len(company_codes))
        chunk = company_codes[start_idx:end_idx]
        logger.info(f"Processing chunk {i + 1}/{num_chunks} ({len(chunk)} companies)")

        chunk_df = _fss_extraction_call(
            chunk, start_str, end_str, config, session, logger
        )
        if not chunk_df.empty:
            all_results.append(chunk_df)

        if i < num_chunks - 1:
            logger.debug(f"Waiting {config.api_delay_seconds}s before next chunk...")
            sleep(config.api_delay_seconds)

    if not all_results:
        sys.exit("ERROR: No FSS score data returned from any chunk.")

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

    save_intermediate(scores, config.output_dir / "fss_scores_raw.csv",
                      "raw FSS scores", logger)
    return scores


# =============================================================================
# STEP 6: Get Latest Score Per Company
# =============================================================================

def get_latest_scores(
    scores_df: pd.DataFrame, logger: logging.Logger
) -> pd.DataFrame:
    scores_df = scores_df.copy()
    scores_df["score_date"] = pd.to_datetime(scores_df["score_date"])

    idx = scores_df.groupby("_company_code")["score_date"].idxmax()
    latest = scores_df.loc[idx].reset_index(drop=True)
    logger.info(f"Latest scores: {len(latest)} companies (from {len(scores_df)} total records)")

    return latest


# =============================================================================
# STEP 7: Calculate Z-Scores
# =============================================================================

def calculate_z_scores(
    fss_sp_merged: pd.DataFrame,
    latest_scores: pd.DataFrame,
    config: PipelineConfig,
    logger: logging.Logger,
) -> pd.DataFrame:
    # Merge latest FSS scores into the FSS+S&P data
    latest_scores = latest_scores.rename(columns={"_company_code": "company_code_FSS"})
    merged = fss_sp_merged.merge(latest_scores, on="company_code_FSS", how="outer")

    # Identify numeric columns to clean
    numeric_patterns = [
        "IQ_TOTAL_REV", "IQ_TOTAL_ASSETS", "IQ_TOTAL_LIAB",
        "IQ_RETAINED_EARNINGS", "IQ_EBIT", "IQ_WORKING_CAP",
        "IQ_GP", "SP_MARKETCAP", "IQ_NET_INC_PARENT",
    ]

    cols_to_fix = []
    for pattern in numeric_patterns:
        cols_to_fix.extend([c for c in merged.columns if pattern in c.upper()])
    cols_to_fix = list(set(cols_to_fix))

    for col in cols_to_fix:
        merged[col] = clean_numeric_column(merged[col])

    # Handle zero denominators
    for col in merged.columns:
        if "TOTAL_ASSETS" in col.upper() or "TOTAL_LIAB" in col.upper():
            merged[col] = merged[col].replace(0, np.nan)

    # Fill missing market cap with 0
    marketcap_col = discover_column(list(merged.columns), ["SP_MARKETCAP"], "_Current")
    if marketcap_col:
        merged[marketcap_col] = merged[marketcap_col].fillna(0)

    # Proxy logic
    ebit_y = discover_column(list(merged.columns), ["IQ_EBIT"], "_Y")
    ebit_q = discover_column(list(merged.columns), ["IQ_EBIT"], "_Q")
    net_inc_y = discover_column(list(merged.columns), ["IQ_NET_INC_PARENT"], "_Y")
    net_inc_q = discover_column(list(merged.columns), ["IQ_NET_INC_PARENT"], "_Q")
    re_y = discover_column(list(merged.columns), ["IQ_RETAINED_EARNINGS"], "_Y")
    re_q = discover_column(list(merged.columns), ["IQ_RETAINED_EARNINGS"], "_Q")
    rev_y = discover_column(list(merged.columns), ["IQ_TOTAL_REV"], "_Y")
    rev_q = discover_column(list(merged.columns), ["IQ_TOTAL_REV"], "_Q")
    gp_y = discover_column(list(merged.columns), ["IQ_GP"], "_Y")
    gp_q = discover_column(list(merged.columns), ["IQ_GP"], "_Q")
    wc_y = discover_column(list(merged.columns), ["IQ_WORKING_CAP"], "_Y")
    wc_q = discover_column(list(merged.columns), ["IQ_WORKING_CAP"], "_Q")
    ta_y = discover_column(list(merged.columns), ["IQ_TOTAL_ASSETS"], "_Y")
    ta_q = discover_column(list(merged.columns), ["IQ_TOTAL_ASSETS"], "_Q")
    tl_y = discover_column(list(merged.columns), ["IQ_TOTAL_LIAB"], "_Y")
    tl_q = discover_column(list(merged.columns), ["IQ_TOTAL_LIAB"], "_Q")

    # EBIT Proxy
    if ebit_y and net_inc_y:
        merged["EBIT_PROXY_Y"] = merged[ebit_y].fillna(merged[net_inc_y])
    elif ebit_y:
        merged["EBIT_PROXY_Y"] = merged[ebit_y]

    if ebit_q and net_inc_q:
        merged["EBIT_PROXY_Q"] = merged[ebit_q].fillna(merged[net_inc_q])
    elif ebit_q:
        merged["EBIT_PROXY_Q"] = merged[ebit_q]

    # Retained Earnings Proxy
    if re_y:
        merged["RE_PROXY_Y"] = merged[re_y].fillna(0)
    if re_q:
        merged["RE_PROXY_Q"] = merged[re_q].fillna(0)

    # Revenue Proxy
    if rev_y and gp_y:
        merged["REV_PROXY_Y"] = merged[rev_y].fillna(merged[gp_y])
    elif rev_y:
        merged["REV_PROXY_Y"] = merged[rev_y]

    if rev_q and gp_q:
        merged["REV_PROXY_Q"] = merged[rev_q].fillna(merged[gp_q])
    elif rev_q:
        merged["REV_PROXY_Q"] = merged[rev_q]

    # Calculate Z-Scores (require at least 3 of 5 components to have data)
    # Yearly
    if all(v is not None for v in [wc_y, ta_y, tl_y]) and marketcap_col:
        z_x1 = merged[wc_y] / merged[ta_y]
        z_x2 = merged.get("RE_PROXY_Y", pd.Series(dtype=float)) / merged[ta_y]
        z_x3 = merged.get("EBIT_PROXY_Y", pd.Series(dtype=float)) / merged[ta_y]
        z_x4 = merged[marketcap_col] * 1000 / merged[tl_y]
        z_x5 = merged.get("REV_PROXY_Y", pd.Series(dtype=float)) / merged[ta_y]

        valid_count = sum(c.notna() for c in [z_x1, z_x2, z_x3, z_x4, z_x5])

        merged["Z_Yearly"] = (
            1.2 * z_x1.fillna(0)
            + 1.4 * z_x2.fillna(0)
            + 3.3 * z_x3.fillna(0)
            + 0.6 * z_x4.fillna(0)
            + 1.0 * z_x5.fillna(0)
        )
        merged.loc[valid_count < 3, "Z_Yearly"] = np.nan
        z_yearly_valid = merged["Z_Yearly"].notna().sum()
        logger.info(f"Z_Yearly calculated: {z_yearly_valid} valid scores")
    else:
        logger.warning("Missing columns for Z_Yearly calculation")
        merged["Z_Yearly"] = np.nan

    # Quarterly (annualized)
    if all(v is not None for v in [wc_q, ta_q, tl_q]) and marketcap_col:
        z_x1 = merged[wc_q] / merged[ta_q]
        z_x2 = merged.get("RE_PROXY_Q", pd.Series(dtype=float)) / merged[ta_q]
        z_x3 = merged.get("EBIT_PROXY_Q", pd.Series(dtype=float)) * 4 / merged[ta_q]
        z_x4 = merged[marketcap_col] * 1000 / merged[tl_q]
        z_x5 = merged.get("REV_PROXY_Q", pd.Series(dtype=float)) * 4 / merged[ta_q]

        valid_count = sum(c.notna() for c in [z_x1, z_x2, z_x3, z_x4, z_x5])

        merged["Z_Quarterly"] = (
            1.2 * z_x1.fillna(0)
            + 1.4 * z_x2.fillna(0)
            + 3.3 * z_x3.fillna(0)
            + 0.6 * z_x4.fillna(0)
            + 1.0 * z_x5.fillna(0)
        )
        merged.loc[valid_count < 3, "Z_Quarterly"] = np.nan
        z_quarterly_valid = merged["Z_Quarterly"].notna().sum()
        logger.info(f"Z_Quarterly calculated: {z_quarterly_valid} valid scores")
    else:
        logger.warning("Missing columns for Z_Quarterly calculation")
        merged["Z_Quarterly"] = np.nan

    # Receivables to Revenue
    ar_col = discover_column(list(merged.columns), ["RECEIV", "_AR_", "IQ_AR"], "_Y")
    if ar_col and rev_y:
        merged[ar_col] = clean_numeric_column(merged[ar_col])
        merged[rev_y] = pd.to_numeric(merged[rev_y], errors="coerce")
        merged["Receivables_to_Revenue"] = np.where(
            merged[rev_y] != 0,
            merged[ar_col] / merged[rev_y],
            np.nan,
        )
        logger.info(f"Receivables to Revenue calculated using {ar_col} / {rev_y}")
    else:
        logger.warning("Could not find receivables or revenue columns for ratio")
        merged["Receivables_to_Revenue"] = np.nan

    save_intermediate(merged, config.output_dir / "fss_sp_to_score.csv",
                      "full merged dataset with Z-Scores", logger)
    return merged


# =============================================================================
# STEP 8: Produce Final CSV
# =============================================================================

def produce_final_csv(
    fss_sp_to_score: pd.DataFrame,
    config: PipelineConfig,
    logger: logging.Logger,
) -> pd.DataFrame:
    cols = list(fss_sp_to_score.columns)

    # Build output mapping
    output = pd.DataFrame()

    # Company name (prefer FSS names over S&P names)
    if "company_name_FSS" in cols:
        output["Company"] = fss_sp_to_score["company_name_FSS"]
    elif "CompanyName-fss" in cols:
        output["Company"] = fss_sp_to_score["CompanyName-fss"]
    elif "SP_ENTITY_NAME" in cols:
        output["Company"] = fss_sp_to_score["SP_ENTITY_NAME"]
    else:
        output["Company"] = ""

    # Sector
    if "Sector" in cols:
        output["Sector"] = fss_sp_to_score["Sector"]
    else:
        output["Sector"] = ""

    # SubSector
    if "SubSector" in cols:
        output["SubSector"] = fss_sp_to_score["SubSector"]
    else:
        output["SubSector"] = ""

    # Industry
    if "industry_FSS" in cols:
        output["Industry"] = fss_sp_to_score["industry_FSS"]
    elif "Industry" in cols:
        output["Industry"] = fss_sp_to_score["Industry"]
    else:
        output["Industry"] = ""

    # Ticker
    if "ticker_FSS" in cols:
        output["Ticker"] = fss_sp_to_score["ticker_FSS"]
    elif "ExchangeTicker" in cols:
        output["Ticker"] = fss_sp_to_score["ExchangeTicker"]
    else:
        output["Ticker"] = ""

    # FSS Score
    if "score" in cols:
        output["FSS Score"] = fss_sp_to_score["score"]
    else:
        output["FSS Score"] = np.nan

    # FSS Weekly Change
    weekly_col = discover_column(cols, ["weekly_percentage_change", "weekly_pct_change"])
    if weekly_col:
        output["FSS Weekly Change"] = fss_sp_to_score[weekly_col]
    else:
        output["FSS Weekly Change"] = np.nan

    # Total Articles
    if "total_article_count" in cols:
        output["Total Articles"] = fss_sp_to_score["total_article_count"]
    else:
        output["Total Articles"] = np.nan

    # Negative Articles (proportion)
    if "prop_negative_article" in cols:
        output["Negative Articles"] = fss_sp_to_score["prop_negative_article"]
    elif "negative_article_count" in cols and "total_article_count" in cols:
        neg = pd.to_numeric(fss_sp_to_score["negative_article_count"], errors="coerce")
        total = pd.to_numeric(fss_sp_to_score["total_article_count"], errors="coerce")
        output["Negative Articles"] = np.where(total > 0, (neg / total * 100).round(2), np.nan)
    else:
        output["Negative Articles"] = np.nan

    # Z-Score (use yearly)
    if "Z_Yearly" in cols:
        output["Z-Score"] = fss_sp_to_score["Z_Yearly"]
    else:
        output["Z-Score"] = np.nan

    # Receivables to Revenue
    if "Receivables_to_Revenue" in cols:
        output["Receivables to Revenue"] = fss_sp_to_score["Receivables_to_Revenue"]
    else:
        output["Receivables to Revenue"] = np.nan

    # Debt to EBITDA (only meaningful when both debt and EBITDA are positive)
    debt_col = discover_column(cols, ["TOTAL_DEBT"], "_Y")
    ebitda_col = discover_column(cols, ["EBITDA"], "_Y")
    if debt_col and ebitda_col:
        debt_vals = clean_numeric_column(fss_sp_to_score[debt_col])
        ebitda_vals = clean_numeric_column(fss_sp_to_score[ebitda_col])
        output["Debt to EBITDA"] = np.where(
            (ebitda_vals > 0) & (debt_vals > 0),
            (debt_vals / ebitda_vals).round(4),
            np.nan,
        )
        logger.info(f"Debt to EBITDA calculated using {debt_col} / {ebitda_col}")
    else:
        logger.warning("Could not find debt or EBITDA columns for ratio")
        output["Debt to EBITDA"] = np.nan

    # Quick Ratio
    qr_col = discover_column(cols, ["QUICK_RATIO"], "_Y")
    if qr_col:
        output["Quick Ratio"] = clean_numeric_column(fss_sp_to_score[qr_col])
    else:
        output["Quick Ratio"] = np.nan

    # S&P Issuer Credit Rating
    rating_col = discover_column(cols, ["RATING", "CREDIT_RATING", "SP_RATING"])
    if rating_col:
        output["S&P Issuer Credit Rating"] = fss_sp_to_score[rating_col]
    else:
        output["S&P Issuer Credit Rating"] = ""

    # Market Capitalization
    mc_col = discover_column(cols, ["SP_MARKETCAP", "MARKETCAP"], "_Current")
    if mc_col:
        output["Market Capitalization"] = fss_sp_to_score[mc_col]
    else:
        output["Market Capitalization"] = np.nan

    # Current Open Price
    price_col = discover_column(cols, ["OPENPRICE", "OPEN_PRICE", "IQ_OPEN"])
    if price_col:
        output["Current Open Price"] = clean_numeric_column(fss_sp_to_score[price_col])
    else:
        output["Current Open Price"] = np.nan

    # 52-Week High
    high_col = discover_column(cols, ["52WK_HIGH", "52_WEEK_HIGH", "52WKHIGH"])
    if high_col:
        output["52-Week High Price"] = clean_numeric_column(fss_sp_to_score[high_col])
    else:
        output["52-Week High Price"] = np.nan

    # 52-Week Low
    low_col = discover_column(cols, ["52WK_LOW", "52_WEEK_LOW", "52WKLOW"])
    if low_col:
        output["52-Week Low Price"] = clean_numeric_column(fss_sp_to_score[low_col])
    else:
        output["52-Week Low Price"] = np.nan

    # Log column discovery results
    logger.info("--- Column Discovery Report ---")
    discovery_map = {
        "FSS Weekly Change": weekly_col,
        "Quick Ratio": qr_col,
        "S&P Credit Rating": rating_col,
        "Market Cap": mc_col,
        "Open Price": price_col,
        "52-Week High": high_col,
        "52-Week Low": low_col,
    }
    for name, found in discovery_map.items():
        status = f"-> {found}" if found else "-> NOT FOUND (blank)"
        logger.info(f"  {name}: {status}")

    # Save final CSV
    config.final_csv_path.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(config.final_csv_path, index=False)
    logger.info(f"Final CSV saved: {config.final_csv_path} ({len(output)} rows)")

    return output


# =============================================================================
# REPORT
# =============================================================================

def generate_run_report(
    config: PipelineConfig,
    row_counts: dict[str, int],
    logger: logging.Logger,
) -> None:
    report_lines = [
        "=" * 60,
        "WSJ Pro Bankruptcy Risk Score - Pipeline Run Report",
        f"Run timestamp: {datetime.now().isoformat()}",
        "=" * 60,
        "",
        "INPUT FILES:",
        f"  Company codes: {config.input_dir / config.company_codes_filename}",
        f"  S&P source:    {config.sp_dir or (config.input_dir / config.sp_csv_filename)}",
        f"  Master list:   {config.master_csv_filename}",
        f"  Fresh codes:   {'Yes' if config.fetch_fresh_codes else 'No (from file)'}",
        f"  Skip API:      {'Yes' if config.skip_api else 'No'}",
        "",
        "PARAMETERS:",
        f"  Industries:    {config.industries if not config.all_industries else 'ALL'}",
        f"  Excluded:      {config.excluded_industries}",
        f"  List status:   {config.list_status_filter}",
        f"  Lookback days: {config.score_lookback_days}",
        f"  Regions:       {config.regions}",
        "",
        "ROW COUNTS:",
    ]

    for step, count in row_counts.items():
        report_lines.append(f"  {step}: {count}")

    report_lines.extend([
        "",
        "OUTPUT FILES:",
        f"  Final CSV:           {config.final_csv_path}",
        f"  Intermediate dir:    {config.output_dir}/",
    ])

    # List output files with sizes
    if config.output_dir.exists():
        for f in sorted(config.output_dir.iterdir()):
            if f.is_file():
                size_kb = f.stat().st_size / 1024
                report_lines.append(f"    {f.name} ({size_kb:.1f} KB)")

    report_lines.append("")
    report_lines.append("=" * 60)

    report_text = "\n".join(report_lines)
    logger.info("\n" + report_text)

    report_path = config.output_dir / "run_report.txt"
    report_path.write_text(report_text)
    logger.info(f"Report saved: {report_path}")


# =============================================================================
# MAIN
# =============================================================================

def main() -> None:
    args = parse_args()
    logger = setup_logging(args.verbose)
    config = build_config(args)
    session = get_http_session()

    config.output_dir.mkdir(parents=True, exist_ok=True)
    row_counts: dict[str, int] = {}

    # Step 1: Company codes
    logger.info("=" * 40 + " STEP 1: Company Codes " + "=" * 40)
    codes_df = fetch_company_codes(config, session, logger)
    row_counts["Company codes (filtered)"] = len(codes_df)

    # Step 2: Filter and explode
    logger.info("=" * 40 + " STEP 2: Filter Industries " + "=" * 40)
    co_df = filter_and_explode_companies(codes_df, config, logger)
    row_counts["Active companies"] = len(co_df)

    # Step 3: Load S&P data (from directory or single file)
    logger.info("=" * 40 + " STEP 3: Load S&P Data " + "=" * 40)
    sp_df = load_sp_data(config, logger)
    row_counts["S&P records"] = len(sp_df)

    # Step 4: Merge FSS with S&P
    logger.info("=" * 40 + " STEP 4: Merge FSS + S&P " + "=" * 40)
    fss_sp_merged = merge_fss_with_sp(config, sp_df, logger)
    row_counts["Merged FSS+S&P"] = len(fss_sp_merged)

    # Step 5: Fetch FSS scores
    logger.info("=" * 40 + " STEP 5: FSS Scores " + "=" * 40)
    company_codes = fss_sp_merged["company_code_FSS"].dropna().tolist()
    scores_raw = fetch_fss_scores(company_codes, config, session, logger)
    row_counts["Raw FSS scores"] = len(scores_raw)

    # Step 6: Latest scores
    logger.info("=" * 40 + " STEP 6: Latest Scores " + "=" * 40)
    latest_scores = get_latest_scores(scores_raw, logger)
    row_counts["Latest scores (unique companies)"] = len(latest_scores)
    save_intermediate(latest_scores, config.output_dir / "latest_scores.csv",
                      "latest scores per company", logger)

    # Step 7: Z-Scores
    logger.info("=" * 40 + " STEP 7: Calculate Z-Scores " + "=" * 40)
    fss_sp_to_score = calculate_z_scores(fss_sp_merged, latest_scores, config, logger)
    row_counts["Final scored dataset"] = len(fss_sp_to_score)

    # Step 8: Final CSV
    logger.info("=" * 40 + " STEP 8: Final Output " + "=" * 40)
    final = produce_final_csv(fss_sp_to_score, config, logger)
    row_counts["Final CSV rows"] = len(final)

    # Report
    generate_run_report(config, row_counts, logger)
    logger.info("Pipeline complete.")


if __name__ == "__main__":
    main()
