import { useState, useEffect, useMemo } from 'react'
import { parseCSVText } from './utils/parseSheet.js'
import { computeScores } from './utils/scoringModel.js'
import TaxonomyFilter from './components/TaxonomyFilter.jsx'
import WeightSliders from './components/WeightSliders.jsx'
import ResultsTable from './components/ResultsTable.jsx'
import IndustryChart from './components/IndustryChart.jsx'
import ScoreHistogram from './components/ScoreHistogram.jsx'
import csvText from './data/sheet.csv?raw'

const WEIGHT_COLUMNS = [
  'Z-Score',
  'Quick Ratio',
  'Receivables to Revenue',
  'Debt to EBITDA',
  'FSS Weekly Change',
]

const DEFAULT_WEIGHTS = {
  'Z-Score': 30,
  'Quick Ratio': 25,
  'Receivables to Revenue': 20,
  'Debt to EBITDA': 15,
  'FSS Weekly Change': 10,
}

export default function App() {
  const [parsedData, setParsedData] = useState(null)
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS)
  const [optionalColumns, setOptionalColumns] = useState([])
  const [scoredRows, setScoredRows] = useState(null)
  const [scoresStale, setScoresStale] = useState(false)
  const [filters, setFilters] = useState({ sector: '', subSector: '', industry: '' })
  const [error, setError] = useState(null)

  useEffect(() => {
    try {
      const parsed = parseCSVText(csvText)
      setParsedData(parsed)
      setScoredRows(computeScores(parsed.rows, DEFAULT_WEIGHTS, WEIGHT_COLUMNS))
    } catch (err) {
      setError(err.message)
    }
  }, [])

  function handleWeightsChange(newWeights) {
    setWeights(newWeights)
    setScoresStale(true)
  }

  function handleOptionalColumnsChange(newCols) {
    const newWeights = {}
    for (const col of WEIGHT_COLUMNS) {
      newWeights[col] = weights[col] ?? DEFAULT_WEIGHTS[col]
    }
    for (const col of newCols) {
      newWeights[col] = weights[col] ?? 0
    }
    setOptionalColumns(newCols)
    setWeights(newWeights)
    setScoresStale(true)
  }

  function handleReset() {
    setOptionalColumns([])
    setWeights({ ...DEFAULT_WEIGHTS })
    setScoresStale(true)
  }

  const allWeightColumns = [...WEIGHT_COLUMNS, ...optionalColumns]

  function handleScore() {
    setScoredRows(computeScores(parsedData.rows, weights, allWeightColumns))
    setScoresStale(false)
  }

  const availableOptionalColumns = (parsedData?.numericColumns ?? []).filter(
    (col) => !WEIGHT_COLUMNS.includes(col) && !col.startsWith('_')
  )

  const filteredRows = useMemo(() => {
    if (!scoredRows) return null
    return scoredRows.filter(row => {
      if (filters.sector && row.Sector !== filters.sector) return false
      if (filters.subSector && row.SubSector !== filters.subSector) return false
      if (filters.industry && row.Industry !== filters.industry) return false
      return true
    })
  }, [scoredRows, filters])

  const displayColumns = (parsedData?.headers ?? []).filter(h => !h.startsWith('_'))

  return (
    <div className="app">
      <header className="app-header">
        <a className="app-logo" href="#"><span>WSJ Pro</span> Bankruptcy</a>
        <span className="header-sub">Risk Score</span>
      </header>

      <main className="app-main">
        {error && <div className="error-banner">{error}</div>}

        {!parsedData && !error && (
          <div className="loading">
            <div className="spin-ring" />
            Loading data…
          </div>
        )}

        {parsedData && (
          <>
            {/* 1. Methodology */}
            <div className="methodology-text">
              <h3 className="methodology-title">
                <span className="methodology-title-badge">WSJ Pro</span>
                Bankruptcy Risk Score
              </h3>
              <p>
                The WSJ Pro Bankruptcy Risk Score is a weighted composite of up to five financial
                indicators: Z-Score, Quick Ratio, Receivables to Revenue, FSS Score, and FSS
                Weekly Change. Each indicator is normalized to a 0–100 scale using min-max
                normalization — the company with the highest value in a given metric scores 100,
                the lowest scores 0, and all others are scaled proportionally between them.
              </p>
              <p>
                The final score is the weighted sum of these normalized values, where the weights
                are set by the sliders below and must total 100%. A higher WSJ Pro Score indicates
                greater relative bankruptcy risk within this dataset.
              </p>
              <p className="methodology-missing">
                <strong>Missing values:</strong> If a company is missing data for one or more
                indicators, those indicators contribute 0 to that company's score. Companies with
                incomplete data may score artificially low and should be interpreted with caution.
              </p>
            </div>

            {/* 2. Taxonomy filter */}
            <div className="controls-card">
              <TaxonomyFilter
                rows={scoredRows}
                filters={filters}
                onFiltersChange={setFilters}
              />
            </div>

            {/* 3. Sliders + Histogram side by side */}
            <div className="sliders-histogram-row">
              <div className="controls-card">
                <WeightSliders
                  weightColumns={WEIGHT_COLUMNS}
                  weights={weights}
                  defaultWeights={DEFAULT_WEIGHTS}
                  onWeightsChange={handleWeightsChange}
                  onScore={handleScore}
                  optionalColumns={optionalColumns}
                  availableOptionalColumns={availableOptionalColumns}
                  onOptionalColumnsChange={handleOptionalColumnsChange}
                  onReset={handleReset}
                />
              </div>
              <div className={`chart-card${scoresStale ? ' stale' : ''}`}>
                <ScoreHistogram scoredRows={filteredRows} />
              </div>
            </div>

            {/* 4. Industry averages */}
            <div className={`chart-card${scoresStale ? ' stale' : ''}`}>
              <IndustryChart scoredRows={filteredRows} filters={filters} onFiltersChange={setFilters} />
            </div>

            {/* 5. Full table */}
            <div className={`table-card${scoresStale ? ' stale' : ''}`}>
              <ResultsTable
                rows={parsedData.rows}
                displayColumns={displayColumns}
                scoredRows={filteredRows}
              />
            </div>
          </>
        )}
      </main>
    </div>
  )
}
