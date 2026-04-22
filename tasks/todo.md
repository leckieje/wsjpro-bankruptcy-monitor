# WSJ Pro Bankruptcy Scorer — Task List

## Todo
- [x] Project scaffold (package.json, vite.config.js, index.html, main.jsx, .gitignore)
- [x] CSV data file (src/data/sheet.csv)
- [x] parseSheet.js utility
- [x] scoringModel.js utility
- [x] WeightSliders component
- [x] ResultsTable component
- [x] App.jsx + app.css
- [x] npm install + verify dev server

## Review
All tasks complete. Build produces a clean static `dist/` bundle (166 kB JS, 3.8 kB CSS).

Changes made:
- Greenfield React + Vite app in `src/`
- `src/data/sheet.csv` — sample 15-company bankruptcy dataset; replace with your Google Sheets CSV export to update data
- `src/utils/parseSheet.js` — PapaParse wrapper, auto-detects numeric columns (>80% numeric values)
- `src/utils/scoringModel.js` — min-max normalization + weighted sum scoring, `distributeEvenly` helper
- `src/components/WeightSliders.jsx` — sliders per numeric column, live total counter (red/green), Score button blocked until total = 100
- `src/components/ResultsTable.jsx` — table with rank column and highlighted Score column after scoring, top-3 rows highlighted
- `src/App.jsx` — CSV fetched on mount, all state wired together
- `src/app.css` — WSJ-inspired maroon/gray palette, responsive layout
