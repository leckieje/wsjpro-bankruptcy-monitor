import { useState, useEffect, useMemo } from 'react'
import { parseCSVText } from './utils/parseSheet.js'
import { loadModelData, getIndicatorOrder, buildToggleKey } from './utils/loadForecastData.js'
import TaxonomyFilter from './components/TaxonomyFilter.jsx'
import ResultsTable from './components/ResultsTable.jsx'
import IndustryChart from './components/IndustryChart.jsx'
import ScoreHistogram from './components/ScoreHistogram.jsx'
import CompanyDetail from './components/CompanyDetail.jsx'
import AboutPage from './components/AboutPage.jsx'
import DistressedPage from './components/DistressedPage.jsx'
import ExcludedSectorsPage from './components/ExcludedSectorsPage.jsx'
import InsufficientDataPage from './components/InsufficientDataPage.jsx'
import IndicatorToggles from './components/IndicatorToggles.jsx'
import LabPage from './components/LabPage.jsx'
import csvText from './data/sheet.csv?raw'


function getCompanyProbability(row, modelData, toggleKey, indicatorOrder) {
  if (!modelData || !row?.Ticker) return null
  const entry = modelData.companiesByTicker?.[row.Ticker]
  if (!entry) return null
  if (entry.in_distress) return null
  if (entry.insufficient_data) return null
  const hist = entry.history
  if (!hist || hist.length === 0) return null
  const allOnKey = indicatorOrder ? indicatorOrder.map(() => '1').join('') : null
  if (!toggleKey || !allOnKey || toggleKey === allOnKey) {
    return hist[hist.length - 1].probability
  }
  return entry.toggle_states?.[toggleKey] ?? hist[hist.length - 1].probability
}

function getCompanyZScore(row, modelData) {
  if (!modelData || !row?.Ticker) return null
  const entry = modelData.companiesByTicker?.[row.Ticker]
  return entry?.current_z_score ?? null
}

function sectorLabel(sector) {
  if (sector === 'bank') return 'Bank'
  if (sector === 'insurance') return 'Insurance'
  if (sector === 'reit') return 'REIT'
  return 'Other Financial'
}

export default function App() {
  const [page, setPage] = useState('monitor')
  const [parsedData, setParsedData] = useState(null)
  const [sortCol, setSortCol] = useState('probability')
  const [sortDir, setSortDir] = useState('desc')
  const [filters, setFilters] = useState({ sector: '', subSector: '', industry: '' })
  const [error, setError] = useState(null)
  const [modelDataResult, setModelDataResult] = useState(null)
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [enabledIndicators, setEnabledIndicators] = useState(null)
  const [financeFilters, setFinanceFilters] = useState({ sector: '', subSector: '', industry: '' })
  const [financeSortCol, setFinanceSortCol] = useState('probability')
  const [financeSortDir, setFinanceSortDir] = useState('desc')

  useEffect(() => {
    try {
      const parsed = parseCSVText(csvText)
      setParsedData(parsed)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    try {
      const result = loadModelData()
      setModelDataResult(result)
      setEnabledIndicators(getIndicatorOrder(result))
    } catch (e) {
      console.error('[loadModelData] failed:', e)
    }
  }, [])

  const indicatorOrder = useMemo(() => getIndicatorOrder(modelDataResult), [modelDataResult])

  const toggleKey = useMemo(() => {
    if (!enabledIndicators || !indicatorOrder) return null
    return buildToggleKey(enabledIndicators, indicatorOrder)
  }, [enabledIndicators, indicatorOrder])

  const isAllOn = useMemo(() => {
    if (!toggleKey || !indicatorOrder) return true
    return toggleKey === indicatorOrder.map(() => '1').join('')
  }, [toggleKey, indicatorOrder])

  function handleToggle(ind) {
    setEnabledIndicators(prev => {
      if (!prev) return prev
      if (prev.includes(ind)) {
        if (prev.length <= 1) return prev
        return prev.filter(i => i !== ind)
      }
      return [...prev, ind]
    })
  }

  function handleReset() {
    setEnabledIndicators(indicatorOrder)
  }

  const sortedRows = useMemo(() => {
    if (!parsedData) return null
    const rows = parsedData.rows.map(row => {
      const prob = getCompanyProbability(row, modelDataResult, toggleKey, indicatorOrder)
      const entry = modelDataResult?.companiesByTicker?.[row.Ticker]
      const f = entry?.financials || {}
      return {
        ...row,
        _score: prob != null ? prob * 100 : null,
        'Liabilities/Assets': f.tl_ta != null ? f.tl_ta * 100 : null,
      }
    })

    const FORECAST_RANK = { 'Distress': 4, 'High': 3, 'Elevated': 2, 'Accelerating': 1 }
    const getForecastRank = row => {
      const entry = modelDataResult?.companiesByTicker?.[row.Ticker]
      if (!entry) return 0
      if (entry.in_distress) return FORECAST_RANK['Distress']
      const hist = entry.history
      const prob = hist?.length ? hist[hist.length - 1].probability : null
      if (prob >= 0.5) return FORECAST_RANK['High']
      if (prob >= 0.3) return FORECAST_RANK['Elevated']
      if (entry.acceleration_flag) return FORECAST_RANK['Accelerating']
      return 0
    }

    rows.sort((a, b) => {
      let av, bv
      if (sortCol === 'probability') {
        const nullVal = sortDir === 'desc' ? -1 : 2
        av = getCompanyProbability(a, modelDataResult, toggleKey, indicatorOrder) ?? nullVal
        bv = getCompanyProbability(b, modelDataResult, toggleKey, indicatorOrder) ?? nullVal
      } else if (sortCol === 'forecast') {
        av = getForecastRank(a)
        bv = getForecastRank(b)
      } else if (sortCol === 'Company') {
        return sortDir === 'asc'
          ? (a.Company || '').localeCompare(b.Company || '')
          : (b.Company || '').localeCompare(a.Company || '')
      } else {
        const nullVal = sortDir === 'desc' ? -Infinity : Infinity
        av = typeof a[sortCol] === 'number' ? a[sortCol] : nullVal
        bv = typeof b[sortCol] === 'number' ? b[sortCol] : nullVal
      }
      return sortDir === 'desc' ? bv - av : av - bv
    })

    return rows
  }, [parsedData, modelDataResult, toggleKey, indicatorOrder, sortCol, sortDir])

  const filteredRows = useMemo(() => {
    if (!sortedRows) return null
    return sortedRows.filter(row => {
      const entry = modelDataResult?.companiesByTicker?.[row.Ticker]
      if (entry?.in_distress) return false
      if (entry?.sector_excluded) return false
      if (filters.sector) {
        const val = row.Sector || 'Unknown'
        if (val !== filters.sector) return false
      }
      if (filters.subSector) {
        const val = row.SubSector || 'Unknown'
        if (val !== filters.subSector) return false
      }
      if (filters.industry) {
        const val = row.Industry || 'Unknown'
        if (val !== filters.industry) return false
      }
      return true
    })
  }, [sortedRows, filters, modelDataResult])

  const displayColumns = [
    'Company', 'Ticker', 'Sector', 'SubSector', 'Industry',
    'Z-Score',
    'Quick Ratio',
    'Debt to EBITDA',
    'Liabilities/Assets',
    'FSS Score',
    'Market Capitalization',
  ]

  const FINANCE_DISPLAY_COLUMNS = [
    'Company', 'Ticker', 'Sector', 'SubSector', 'Industry',
    'ROA',
    'Quick Ratio',
    'Debt/EBITDA',
    'Liabilities/Assets',
    'Debt/Assets',
    'Int. Coverage',
    'NPL Ratio',
    'Combined Ratio',
    'Sentiment',
    'Market Cap',
  ]

  const FINANCE_FORECAST_RANK = { 'Warning': 3, 'Alert': 2, 'Monitor': 1 }

  const financeBaseRows = useMemo(() => {
    if (!modelDataResult?.companiesByCode) return []
    return Object.entries(modelDataResult.companiesByCode)
      .filter(([, entry]) => entry.sector_excluded)
      .map(([code, entry]) => {
        const sm = entry.sector_model
        const hist = entry.history || []
        const latestProb = hist.length > 0 ? hist[hist.length - 1].probability : (sm?.probability ?? null)
        const tier = latestProb != null
          ? (latestProb >= 0.30 ? 'Warning' : latestProb >= 0.15 ? 'Alert' : 'Monitor')
          : null
        const f = entry.financials || {}
        const m = entry.sector_metrics || {}
        return {
          Company: entry.company_name,
          Ticker: entry.ticker,
          Sector: sectorLabel(sm?.sector),
          SubSector: f.industry || '',
          Industry: f.industry || '',
          'ROA': m.roa != null ? m.roa * 100 : null,
          'Int. Coverage': m.interest_coverage ?? null,
          'Debt/Assets': m.debt_assets != null ? m.debt_assets * 100 : null,
          'NPL Ratio': m.npl_ratio != null ? m.npl_ratio * 100 : null,
          'Combined Ratio': m.combined_ratio != null ? m.combined_ratio * 100 : null,
          'Quick Ratio': f.quick_ratio ?? null,
          'Debt/EBITDA': f.debt_ebitda ?? null,
          'Liabilities/Assets': f.tl_ta != null ? f.tl_ta * 100 : null,
          'Sentiment': f.fss_score != null ? f.fss_score * 100 : null,
          'Market Cap': f.market_cap ?? null,
          _score: latestProb != null ? latestProb * 100 : null,
          _tier: tier,
          _accelerating: entry.acceleration_flag || false,
          _ebitda: f.ebitda ?? null,
          _totalDebt: f.total_debt ?? null,
          _code: code,
        }
      })
  }, [modelDataResult])

  const financeSortedRows = useMemo(() => {
    if (!financeBaseRows.length) return []
    const rows = [...financeBaseRows]
    rows.sort((a, b) => {
      let av, bv
      if (financeSortCol === 'probability') {
        const nullVal = financeSortDir === 'desc' ? -1 : 101
        av = a._score ?? nullVal
        bv = b._score ?? nullVal
      } else if (financeSortCol === 'forecast') {
        av = FINANCE_FORECAST_RANK[a._tier] ?? 0
        bv = FINANCE_FORECAST_RANK[b._tier] ?? 0
      } else if (financeSortCol === 'Company') {
        return financeSortDir === 'asc'
          ? (a.Company || '').localeCompare(b.Company || '')
          : (b.Company || '').localeCompare(a.Company || '')
      } else {
        const nullVal = financeSortDir === 'desc' ? -Infinity : Infinity
        av = typeof a[financeSortCol] === 'number' ? a[financeSortCol] : nullVal
        bv = typeof b[financeSortCol] === 'number' ? b[financeSortCol] : nullVal
      }
      return financeSortDir === 'desc' ? bv - av : av - bv
    })
    return rows
  }, [financeBaseRows, financeSortCol, financeSortDir])

  const financeFilteredRows = useMemo(() => {
    return financeSortedRows.filter(row => {
      if (financeFilters.sector) {
        const val = row.Sector || 'Unknown'
        if (val !== financeFilters.sector) return false
      }
      if (financeFilters.subSector) {
        const val = row.SubSector || 'Unknown'
        if (val !== financeFilters.subSector) return false
      }
      if (financeFilters.industry) {
        const val = row.Industry || 'Unknown'
        if (val !== financeFilters.industry) return false
      }
      return true
    })
  }, [financeSortedRows, financeFilters])

  return (
    <div className="app">
      <header className="app-header">
        <a className="app-logo" href="#" onClick={(e) => { e.preventDefault(); setPage('monitor') }}>
          <span>WSJ Pro</span> Bankruptcy
        </a>
        <nav className="header-nav">
          <button
            className={`header-nav-link ${page === 'monitor' ? 'active' : ''}`}
            onClick={() => setPage('monitor')}
          >Monitor</button>
          <button
            className={`header-nav-link ${page === 'excluded' ? 'active' : ''}`}
            onClick={() => setPage('excluded')}
          >Finance</button>
          <button
            className={`header-nav-link ${page === 'distressed' ? 'active' : ''}`}
            onClick={() => setPage('distressed')}
          >In Distress</button>
          <button
            className={`header-nav-link ${page === 'insufficient' ? 'active' : ''}`}
            onClick={() => setPage('insufficient')}
          >Insufficient Data</button>
          <button
            className={`header-nav-link ${page === 'lab' ? 'active' : ''}`}
            onClick={() => setPage('lab')}
          >Lab</button>
          <button
            className={`header-nav-link ${page === 'about' ? 'active' : ''}`}
            onClick={() => setPage('about')}
          >About</button>
        </nav>
      </header>

      <main className="app-main">
        {page === 'about' && <AboutPage onBack={() => setPage('monitor')} />}
        {page === 'distressed' && <DistressedPage modelData={modelDataResult} onRowClick={setSelectedCompany} />}
        {page === 'excluded' && (
          <ExcludedSectorsPage
            modelData={modelDataResult}
            onRowClick={setSelectedCompany}
            allRows={financeSortedRows}
            filteredRows={financeFilteredRows}
            displayColumns={FINANCE_DISPLAY_COLUMNS}
            filters={financeFilters}
            onFiltersChange={setFinanceFilters}
            sortCol={financeSortCol}
            sortDir={financeSortDir}
            onSortChange={(col, dir) => { setFinanceSortCol(col); setFinanceSortDir(dir) }}
          />
        )}
        {page === 'insufficient' && <InsufficientDataPage modelData={modelDataResult} onRowClick={setSelectedCompany} />}
        {page === 'lab' && (
          <LabPage
            monitorRows={filteredRows}
            financeRows={financeBaseRows}
            modelData={modelDataResult}
          />
        )}

        {page === 'monitor' && error && <div className="error-banner">{error}</div>}

        {page === 'monitor' && !parsedData && !error && (
          <div className="loading">
            <div className="spin-ring" />
            Loading data…
          </div>
        )}

        {page === 'monitor' && parsedData && (
          <>
            {/* 1. Methodology */}
            <div className="methodology-text">
              <h3 className="methodology-title">
                <span className="methodology-title-badge">WSJ Pro</span>
                Bankruptcy Distress Monitor
              </h3>
              <p>
                The Distress Monitor uses an ML ensemble (Random Forest + Gradient Boosting) trained
                on 26 quarters of financial data to predict the probability that a company will enter
                the Altman Z-Score Distress Zone (≤1.81) within 2 quarters. The model uses a 6-quarter
                lookback window across 6 indicators: Z-Score, Quick Ratio, EBIT/Assets, Debt/EBITDA,
                Liabilities/Assets, and Factiva Sentiment Signals.
              </p>
              <p>
                Click any company row to see the full detail view with probability chart,
                indicator breakdown, projection cone, and configurable indicator toggles.
              </p>
            </div>

            {/* 2. Filters */}
            <div className="controls-card controls-row">
              <TaxonomyFilter
                rows={sortedRows}
                filters={filters}
                onFiltersChange={setFilters}
              />
            </div>

            {/* 3. Toggles + Violin side by side */}
            <div className="charts-row">
              <div className="chart-card chart-card--toggles">
                {enabledIndicators && (
                  <IndicatorToggles
                    indicatorOrder={indicatorOrder}
                    enabledIndicators={enabledIndicators}
                    onToggle={handleToggle}
                    onReset={handleReset}
                    isAllOn={isAllOn}
                  />
                )}
              </div>
              <div className="chart-card">
                <ScoreHistogram
                  scoredRows={filteredRows}
                  filters={filters}
                  modelData={modelDataResult}
                />
              </div>
            </div>

            {/* 4. Average score table */}
            <div className="chart-card">
              <IndustryChart scoredRows={filteredRows} filters={filters} onFiltersChange={setFilters} />
            </div>

            {/* 5. Full table */}
            <div className="table-card">
              <ResultsTable
                rows={parsedData.rows}
                displayColumns={displayColumns}
                scoredRows={filteredRows}
                filters={filters}
                modelData={modelDataResult}
                onRowClick={setSelectedCompany}
                sortCol={sortCol}
                sortDir={sortDir}
                onSortChange={(col, dir) => { setSortCol(col); setSortDir(dir) }}
              />
            </div>
          </>
        )}

        {selectedCompany && (
          <CompanyDetail
            company={selectedCompany}
            modelData={modelDataResult}
            onClose={() => setSelectedCompany(null)}
            enabledIndicators={enabledIndicators}
            onToggle={handleToggle}
            onReset={handleReset}
          />
        )}
      </main>
    </div>
  )
}
