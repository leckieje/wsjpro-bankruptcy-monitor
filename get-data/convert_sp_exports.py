#!/usr/bin/env python3
"""
convert_sp_exports.py - Convert S&P Global .xlsx exports to normalized CSVs.

Handles mixed inputs: .xlsx files are converted using the multi-row header
parsing logic; .csv files are validated and passed through. Outputs are
written to the same directory as the source files.
"""

import argparse
import logging
import os
import sys
from pathlib import Path

import pandas as pd

try:
    import openpyxl  # noqa: F401
except ImportError:
    sys.exit("ERROR: openpyxl is required. Install with: pip install openpyxl")


def setup_logging(verbose: bool = False) -> logging.Logger:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    return logging.getLogger("convert_sp")


def parse_sp_xlsx(path: Path, logger: logging.Logger) -> pd.DataFrame:
    """Parse an S&P Global .xlsx export with multi-row headers into a flat DataFrame."""
    logger.info(f"Reading Excel file: {path.name}")
    raw = pd.read_excel(path, header=None, engine="openpyxl")

    header_mask = raw.eq("SP_ENTITY_NAME").any(axis=1)
    if not header_mask.any():
        logger.error(f"Could not find 'SP_ENTITY_NAME' in {path.name}")
        return pd.DataFrame()

    header_idx = header_mask.idxmax()
    time_idx = header_idx + 1

    header_labels = raw.iloc[header_idx].fillna("").astype(str)
    time_labels = raw.iloc[time_idx].fillna("").astype(str)

    time_cols = []
    for header, time_val in zip(header_labels, time_labels):
        if time_val == "":
            time_cols.append(header)
        elif "quarter" in time_val.lower():
            time_cols.append(f"{header}_Q")
        elif "year" in time_val.lower():
            time_cols.append(f"{header}_Y")
        else:
            time_cols.append(f"{header}_{time_val}")

    df = raw.iloc[time_idx + 1:].copy()
    df.columns = time_cols
    df = df[df["SP_ENTITY_NAME"].notna()].reset_index(drop=True)

    logger.info(f"  Parsed {len(df)} rows, {len(df.columns)} columns")
    return df


def validate_sp_csv(path: Path, logger: logging.Logger) -> bool:
    """Check that a CSV has the expected S&P structure (SP_CIQ_ID column)."""
    try:
        cols = pd.read_csv(path, nrows=0).columns.tolist()
        if "SP_CIQ_ID" in cols:
            return True
        logger.warning(f"  {path.name}: missing SP_CIQ_ID column, skipping")
        return False
    except Exception as e:
        logger.warning(f"  {path.name}: could not read - {e}")
        return False


def convert_directory(input_dir: Path, logger: logging.Logger, force: bool = False) -> list[Path]:
    """Convert all .xlsx files in a directory; validate .csv files. Returns list of output CSVs."""
    if not input_dir.exists():
        sys.exit(f"ERROR: Directory not found: {input_dir}")

    xlsx_files = sorted(input_dir.glob("*.xlsx"))
    csv_files = sorted(input_dir.glob("*.csv"))

    logger.info(f"Found {len(xlsx_files)} .xlsx and {len(csv_files)} .csv files in {input_dir}")

    output_csvs = []

    for xlsx_path in xlsx_files:
        csv_output = xlsx_path.with_suffix(".csv")

        if csv_output.exists() and not force:
            xlsx_mtime = xlsx_path.stat().st_mtime
            csv_mtime = csv_output.stat().st_mtime
            if csv_mtime >= xlsx_mtime:
                logger.info(f"  Skipping {xlsx_path.name} (CSV is up-to-date)")
                output_csvs.append(csv_output)
                continue

        df = parse_sp_xlsx(xlsx_path, logger)
        if df.empty:
            continue

        df.to_csv(csv_output, index=False, encoding="utf-8-sig")
        logger.info(f"  Wrote {csv_output.name}")
        output_csvs.append(csv_output)

    for csv_path in csv_files:
        if csv_path.stem in [x.stem for x in xlsx_files]:
            continue
        if validate_sp_csv(csv_path, logger):
            output_csvs.append(csv_path)
            logger.info(f"  Validated existing CSV: {csv_path.name}")

    return output_csvs


def convert_single_file(file_path: Path, logger: logging.Logger) -> Path | None:
    """Convert a single .xlsx file or validate a .csv file."""
    if not file_path.exists():
        sys.exit(f"ERROR: File not found: {file_path}")

    if file_path.suffix.lower() == ".xlsx":
        df = parse_sp_xlsx(file_path, logger)
        if df.empty:
            return None
        csv_output = file_path.with_suffix(".csv")
        df.to_csv(csv_output, index=False, encoding="utf-8-sig")
        logger.info(f"Wrote {csv_output.name}")
        return csv_output
    elif file_path.suffix.lower() == ".csv":
        if validate_sp_csv(file_path, logger):
            logger.info(f"CSV is valid: {file_path.name}")
            return file_path
        return None
    else:
        sys.exit(f"ERROR: Unsupported file type: {file_path.suffix}")


def main():
    parser = argparse.ArgumentParser(
        description="Convert S&P Global .xlsx exports to normalized CSVs"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--input-dir",
        help="Directory containing .xlsx/.csv files to process"
    )
    group.add_argument(
        "--file",
        help="Single .xlsx or .csv file to process"
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Re-convert even if CSV is newer than XLSX"
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="Enable debug logging"
    )

    args = parser.parse_args()
    logger = setup_logging(args.verbose)

    if args.input_dir:
        input_dir = Path(args.input_dir)
        results = convert_directory(input_dir, logger, force=args.force)
        logger.info(f"\nDone. {len(results)} CSV files ready for pipeline.")
    else:
        file_path = Path(args.file)
        result = convert_single_file(file_path, logger)
        if result:
            logger.info(f"\nDone. Output: {result}")
        else:
            sys.exit("ERROR: Conversion failed.")


if __name__ == "__main__":
    main()
