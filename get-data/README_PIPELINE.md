# Bankruptcy Risk Score Data Pipeline

## Overview

`generate_scores.py` fetches bankruptcy risk indicators from Dow Jones FSS and S&P Global,
calculates Altman Z-Scores, and produces the CSV consumed by the React frontend app.

## Setup

```bash
cd get-data
pip install -r requirements.txt
export FSS_API_KEY="your-dow-jones-api-key"
```

## Required Input Files

Place these in the `get-data/input/` directory:

| File | Source | Description |
|------|--------|-------------|
| `FSS_company_codes.csv` | Dow Jones FSS API | Company taxonomy (codes, industries, tickers, regions) |
| `bk_companyList_MASTER.csv` | Pre-built mapping | Links FSS company_code to S&P SP_CIQ_ID |
| `SPGlobal_Export_*.csv` | S&P Global Platform | Financial data export (multi-row header format) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FSS_API_KEY` | Yes (unless --skip-api) | Dow Jones FSS API authentication key |

## Usage

```bash
# Standard run (retail + software, last 5 days of scores)
python generate_scores.py --sp-csv "SPGlobal_Export_4-3-2026_POC_LISTED_RETAIL_V6.csv"

# Skip API calls (use cached scores from prior run)
python generate_scores.py --sp-csv "SPGlobal_Export_*.csv" --skip-api

# All industries
python generate_scores.py --sp-csv "SPGlobal_Export_*.csv" --all-industries

# Custom industries with more history
python generate_scores.py --sp-csv "SPGlobal_Export_*.csv" --industries "retail,software,banking" --lookback-days 30

# Verbose logging
python generate_scores.py --sp-csv "SPGlobal_Export_*.csv" --verbose
```

## Output Files

| File | Location | Description |
|------|----------|-------------|
| `sheet.csv` | `src/data/sheet.csv` | **Final app input** — loaded by React at build time |
| `fss_company_codes.csv` | `get-data/output/` | Filtered FSS company codes for target regions |
| `co_df.csv` | `get-data/output/` | Active companies after industry filtering |
| `fss_retail_listed.csv` | `get-data/output/` | Merged FSS + S&P company data |
| `fss_scores_raw.csv` | `get-data/output/` | All FSS scores from API (multi-day) |
| `latest_scores.csv` | `get-data/output/` | Latest score per company |
| `fss_sp_to_score.csv` | `get-data/output/` | Full dataset with Z-Scores (all columns) |
| `run_report.txt` | `get-data/output/` | Summary of run parameters and row counts |

## Pipeline Steps

1. **Load company codes** — from file or fresh from FSS API
2. **Filter industries** — match keywords, explode nested lists, keep active companies
3. **Parse S&P export** — dynamic multi-row header parsing with time suffixes (_Y, _Q, _Current)
4. **Merge FSS + S&P** — join on SP_CIQ_ID via master company list
5. **Fetch FSS scores** — API call (chunked, rate-limited) or load from cache
6. **Latest scores** — keep most recent date per company
7. **Calculate Z-Scores** — Altman 5-factor model (yearly + quarterly), proxy logic for missing data
8. **Final CSV** — select/rename columns, dynamic column discovery for S&P fields

## Column Discovery

S&P columns are discovered dynamically by pattern matching (e.g., searching for "QUICK_RATIO",
"OPENPRICE", "52WK"). This makes the pipeline resilient to different S&P export configurations.
Missing columns produce warnings but don't crash the pipeline.

## Final CSV Columns

| Column | Source |
|--------|--------|
| Company | SP_ENTITY_NAME |
| Industry | industry_FSS |
| Ticker | ticker_FSS |
| FSS Score | FSS API `score` field |
| FSS Weekly Change | FSS API `weekly_percentage_change` |
| Total Articles | FSS API `total_article_count` |
| Negative Articles | Calculated: negative/total * 100 |
| Z-Score | Calculated: Altman yearly Z-Score |
| Receivables to Revenue | Calculated: AR / Revenue from S&P |
| Quick Ratio | S&P `IQ_QUICK_RATIO_Y` |
| S&P Issuer Credit Rating | S&P rating field |
| Market Capitalization | S&P `SP_MARKETCAP_Current` |
| Current Open Price | S&P open price field |
| 52-Week High Price | S&P 52-week high field |
| 52-Week Low Price | S&P 52-week low field |
