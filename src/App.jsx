import { useState, useEffect } from 'react'
import { parseCSVText } from './utils/parseSheet.js'
import { computeScores } from './utils/scoringModel.js'
import WeightSliders from './components/WeightSliders.jsx'
import ResultsTable from './components/ResultsTable.jsx'
import IndustryChart from './components/IndustryChart.jsx'
import ScoreHistogram from './components/ScoreHistogram.jsx'
import csvText from './data/sheet.csv?raw'

const WEIGHT_COLUMNS = [
  'Z-Score',
  'Quick Ratio',
  'Receivables to Revenue',
  'FSS Score',
  'FSS Weekly Change',
]

const DEFAULT_WEIGHTS = {
  'Z-Score': 35,
  'Quick Ratio': 25,
  'Receivables to Revenue': 15,
  'FSS Score': 10,
  'FSS Weekly Change': 15,
}

export default function App() {
  const [parsedData, setParsedData] = useState(null)
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS)
  const [optionalColumns, setOptionalColumns] = useState([])
  const [scoredRows, setScoredRows] = useState(null)
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
    setScoredRows(null)
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
    setScoredRows(null)
  }

  function handleReset() {
    setOptionalColumns([])
    setWeights({ ...DEFAULT_WEIGHTS })
    setScoredRows(null)
  }

  const allWeightColumns = [...WEIGHT_COLUMNS, ...optionalColumns]

  function handleScore() {
    setScoredRows(computeScores(parsedData.rows, weights, allWeightColumns))
  }

  const availableOptionalColumns = (parsedData?.numericColumns ?? []).filter(
    (col) => !WEIGHT_COLUMNS.includes(col)
  )

  const displayColumns = parsedData?.headers ?? []

  return (
    <div className="app">
      <header className="app-header">

        {/* Band 1: black top bar */}
        <div className="header-topbar">
          <div className="header-topbar-inner">
            <nav className="header-sitenav">
              <span>WSJ</span>
              <span>Barron's</span>
              <span>MarketWatch</span>
              <span>IBD</span>
            </nav>
            <div className="header-buyside">WSJ | Buy Side</div>
          </div>
        </div>

        {/* Band 2: ticker bar */}
        <div className="header-ticker">
          <div className="header-ticker-inner">
            <span className="ticker-item"><span className="ticker-label">DJIA</span> <span className="ticker-val up">47919.77</span> <span className="ticker-chg down">-0.55%</span></span>
            <span className="ticker-item"><span className="ticker-label">S&amp;P 500</span> <span className="ticker-val up">6820.02</span> <span className="ticker-chg down">-0.07%</span></span>
            <span className="ticker-item"><span className="ticker-label">Nasdaq</span> <span className="ticker-val up">22914.23</span> <span className="ticker-chg up">0.40%</span></span>
            <span className="ticker-item"><span className="ticker-label">Russell 2000</span> <span className="ticker-val up">2632.71</span> <span className="ticker-chg down">-0.14%</span></span>
            <span className="ticker-item"><span className="ticker-label">U.S. 10 Yr</span> <span className="ticker-val">-3/32</span> <span className="ticker-chg up">4.318%</span></span>
            <span className="ticker-item"><span className="ticker-label">VIX</span> <span className="ticker-val up">19.60</span> <span className="ticker-chg up">0.56%</span></span>
          </div>
        </div>

        {/* Band 3: masthead + nav */}
        <div className="header-masthead">
          <div className="header-masthead-inner">
            <div className="header-masthead-logo">THE WALL STREET JOURNAL.</div>
            <div className="header-masthead-edition">English Edition</div>
            <nav className="header-mainnav">
              <span>World</span><span>Business</span><span>U.S.</span><span>Politics</span>
              <span>Economy</span><span>Tech</span><span>Markets &amp; Finance</span>
              <span>Opinion</span><span>Arts</span><span>Lifestyle</span>
              <span>Real Estate</span><span>Personal Finance</span><span>Health</span>
              <span>Style</span><span>Sports</span>
            </nav>
          </div>
        </div>

        {/* Band 4: dark teal WSJ Pro Bankruptcy section banner */}
        <div className="header-pro-banner">
          <div className="header-pro-inner">
            <div className="header-pro-top">
              <span className="wsj-pro-badge">WSJ</span>
              <span className="wsj-pro-tag">PRO</span>
            </div>
            <h1 className="header-pro-title">Bankruptcy</h1>
            <nav className="header-pro-nav">
              <span>Home</span>
              <span>News ›</span>
              <span>Data ›</span>
              <span>Newsletters</span>
              <span>Sectors ›</span>
            </nav>
          </div>
        </div>

      </header>

      <main className="app-main">
        {error && <div className="error-banner">{error}</div>}

        {!parsedData && !error && (
          <div className="loading">Loading data...</div>
        )}

        {parsedData && (
          <>
            {/* 1. Methodology */}
            <div className="methodology-text">
              <h3 className="methodology-title">WSJ Pro Bankruptcy Risk Score</h3>
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

            {/* 2. Sliders */}
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

            {/* 3. Histogram */}
            <ScoreHistogram scoredRows={scoredRows} />

            {/* 4. Industry averages */}
            <IndustryChart scoredRows={scoredRows} />

            {/* 5. Full table */}
            <ResultsTable
              rows={parsedData.rows}
              displayColumns={displayColumns}
              scoredRows={scoredRows}
            />
          </>
        )}
      </main>
    </div>
  )
}
