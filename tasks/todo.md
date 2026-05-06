# WSJ Pro Bankruptcy Scorer — Task List

## Completed (Original Build)
- [x] Project scaffold (package.json, vite.config.js, index.html, main.jsx, .gitignore)
- [x] CSV data file (src/data/sheet.csv)
- [x] parseSheet.js utility
- [x] scoringModel.js utility
- [x] WeightSliders component
- [x] ResultsTable component
- [x] App.jsx + app.css
- [x] npm install + verify dev server

## S&P Sector Data Integration

- [x] Create `get-data/convert_sp_exports.py` — preprocessing script for .xlsx/.csv
- [x] Modify `generate_scores.py` — add `--sp-dir`, `load_sp_data()`, new master-list support
- [x] Add Sector/SubSector to `produce_final_csv()` output
- [x] Generate test `sheet.csv` with 941 companies from 4 sector files
- [x] Create `src/components/TaxonomyFilter.jsx` — cascading Sector > SubSector > Industry filter
- [x] Wire TaxonomyFilter into App.jsx with `filteredRows` logic
- [x] Add taxonomy filter CSS styles
- [x] Verify production build succeeds
- [ ] Test in browser (dev server blocked by sandbox — needs manual verification)

## Review
All code changes complete. Build produces clean output (669 kB JS, 10.6 kB CSS).

Changes made:
- `get-data/convert_sp_exports.py` — converts .xlsx S&P exports to normalized CSVs, handles mixed input types, idempotent (skips if CSV newer)
- `get-data/build_test_sheet.py` — generates sheet.csv from S&P + master-list data without FSS API
- `get-data/generate_scores.py` — added `--sp-dir` for directory scanning, `normalize_sp_ciq_id()` to strip IQ prefix, `load_sp_data()` for multi-file concat, new master-list format detection, Sector/SubSector in final output
- `src/components/TaxonomyFilter.jsx` — three cascading dropdowns with useMemo for derived options
- `src/App.jsx` — added filter state, filteredRows (post-scoring filter), TaxonomyFilter component
- `src/app.css` — taxonomy filter styles matching existing design system
- `src/data/sheet.csv` — updated with 941 companies, 17 columns (added Sector, SubSector)
