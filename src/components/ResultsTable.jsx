import { useState, useRef, useCallback, useEffect } from 'react'
import { getScoreColor } from '../utils/scoreColor.js'

const PERCENT_COLUMNS = new Set(['FSS Weekly Change', 'Negative Articles'])
const ROUND2_COLUMNS = new Set(['Z-Score', 'Receivables to Revenue'])
const DOLLAR_COLUMNS = new Set(['Current Open Price', '52-Week High Price', '52-Week Low Price'])
const NUMERIC_COLUMNS = new Set([
  'FSS Score', 'FSS Weekly Change', 'Total Articles', 'Negative Articles',
  'Z-Score', 'Receivables to Revenue', 'Debt to EBITDA', 'Debt/EBITDA', 'Quick Ratio',
  'Market Capitalization', 'Market Cap', 'Current Open Price', '52-Week High Price', '52-Week Low Price',
  'Liabilities/Assets', 'ROA', 'Int. Coverage', 'Sentiment',
  'Debt/Assets', 'NPL Ratio', 'Combined Ratio',
])

function formatDebtEbitda(value, row) {
  const ebitda = row?.['_ebitda']
  const debt = row?.['_totalDebt']
  if (typeof ebitda === 'number' && ebitda < 0)
    return { text: 'Neg. EBITDA', color: '#DC2626' }
  if (typeof debt === 'number' && debt < 0)
    return { text: 'Net Cash', color: '#16A34A' }
  if (value === null || value === undefined || value === '')
    return { text: '', color: undefined }
  if (typeof value === 'number')
    return { text: value.toFixed(2), color: undefined }
  return { text: value, color: undefined }
}

const PERCENT2_COLUMNS = new Set(['Liabilities/Assets', 'ROA', 'Sentiment', 'Debt/Assets', 'NPL Ratio', 'Combined Ratio'])
const ROUND2X_COLUMNS = new Set(['Quick Ratio', 'Debt/EBITDA', 'Int. Coverage'])

function formatCell(col, value, isScored, row) {
  if (col === 'Debt to EBITDA') return formatDebtEbitda(value, row).text
  if (col === 'Debt/EBITDA') return formatDebtEbitda(value, row).text
  if (value === null || value === undefined || value === '') return ''
  if (PERCENT_COLUMNS.has(col) && typeof value === 'number') return `${value}%`
  if (PERCENT2_COLUMNS.has(col) && typeof value === 'number') return `${value.toFixed(2)}%`
  if (col === 'FSS Score' && isScored && typeof value === 'number')
    return (value * 100).toFixed(2)
  if (ROUND2_COLUMNS.has(col) && typeof value === 'number') return value.toFixed(2)
  if (ROUND2X_COLUMNS.has(col) && typeof value === 'number') return value.toFixed(2)
  if ((col === 'Market Capitalization' || col === 'Market Cap') && typeof value === 'number')
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`
  if (DOLLAR_COLUMNS.has(col) && typeof value === 'number')
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return value
}

function downloadCSV(data, displayColumns, isScored) {
  const headers = [...(isScored ? ['#'] : []), ...displayColumns, ...(isScored ? ['Distress Probability (%)'] : [])]
  const rows = data.map((row, i) => {
    const rank = isScored ? [i + 1] : []
    const cols = displayColumns.map(h => row[h] ?? '')
    const score = isScored ? [row._score != null ? row._score.toFixed(1) : ''] : []
    return [...rank, ...cols, ...score]
  })
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'wsj-pro-distress-monitor.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function getBreadcrumb(filters) {
  if (!filters) return ''
  const parts = []
  if (filters.sector) parts.push(filters.sector)
  if (filters.subSector) parts.push(filters.subSector)
  if (filters.industry) parts.push(filters.industry)
  return parts.join(' / ')
}

const DEFAULT_THRESHOLDS = { high: 0.5, elevated: 0.3, highLabel: 'High', elevatedLabel: 'Elevated', lowLabel: null }

function getDistressStatus(row, modelData, thresholds = DEFAULT_THRESHOLDS) {
  // Finance rows carry _tier directly
  if (row._tier !== undefined) return row._tier || null
  if (!modelData || !row?.Ticker) return null
  const entry = modelData.companiesByTicker?.[row.Ticker]
  if (!entry) return null
  if (entry.in_distress) return 'Distress'
  if (entry.insufficient_data) return null
  const hist = entry.history
  if (!hist || hist.length === 0) return null
  const prob = hist[hist.length - 1].probability
  if (prob >= thresholds.high) return thresholds.highLabel
  if (prob >= thresholds.elevated) return thresholds.elevatedLabel
  return thresholds.lowLabel
}

function hasAccelerationFlag(row, modelData) {
  if (row._accelerating !== undefined) return row._accelerating || false
  if (!modelData || !row?.Ticker) return false
  const entry = modelData.companiesByTicker?.[row.Ticker]
  return entry?.acceleration_flag || false
}

function getRowTintStyle(status, accelerating) {
  if (status === 'Distress' || status === 'Warning') return { backgroundColor: 'rgba(220, 38, 38, 0.06)' }
  if (status === 'High') return { backgroundColor: 'rgba(220, 38, 38, 0.06)' }
  if (status === 'Elevated' || status === 'Alert') return { backgroundColor: 'rgba(245, 158, 11, 0.06)' }
  if (accelerating) return { backgroundColor: 'rgba(245, 158, 11, 0.04)' }
  return undefined
}

export default function ResultsTable({ rows, displayColumns, scoredRows, filters, modelData, onRowClick, sortCol, sortDir, onSortChange, tierThresholds }) {
  const thresholds = tierThresholds || DEFAULT_THRESHOLDS
  function handleColClick(col) {
    if (col === sortCol) {
      onSortChange(col, sortDir === 'desc' ? 'asc' : 'desc')
    } else {
      onSortChange(col, col === 'Company' ? 'asc' : 'desc')
    }
  }

  function SortArrow({ col }) {
    if (col !== sortCol) return <span className="th-sort-arrow"> ↕</span>
    return <span className="th-sort-arrow th-sort-arrow--active">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
  }
  const [expanded, setExpanded] = useState(false)
  const [highlightedRow, setHighlightedRow] = useState(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [pendingSet, setPendingSet] = useState(new Set())
  const [appliedSet, setAppliedSet] = useState(new Set())
  const compareRef = useRef(null)

  useEffect(() => {
    setPendingSet(new Set())
    setAppliedSet(new Set())
    setCompareOpen(false)
  }, [filters?.industry])

  function openCompare() {
    setPendingSet(new Set(appliedSet))
    setCompareOpen(true)
  }

  function applyCompare() {
    setAppliedSet(new Set(pendingSet))
    setCompareOpen(false)
  }

  function clearCompare() {
    setPendingSet(new Set())
    setAppliedSet(new Set())
    setCompareOpen(false)
  }

  useEffect(() => {
    if (!compareOpen) return
    function handleClick(e) {
      if (compareRef.current && !compareRef.current.contains(e.target)) applyCompare()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [compareOpen, pendingSet])
  const wrapRef = useRef(null)
  const dragState = useRef(null)
  const didDrag = useRef(false)

  const allData = scoredRows ?? rows
  const isScored = scoredRows !== null

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    if (e.target.closest('th')) return
    didDrag.current = false
    dragState.current = { startX: e.clientX, startY: e.clientY, scrollLeft: wrapRef.current.scrollLeft, scrollTop: wrapRef.current.scrollTop, moved: false }
  }, [])

  const onMouseMove = useCallback((e) => {
    if (!dragState.current) return
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    if (!dragState.current.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return
    dragState.current.moved = true
    didDrag.current = true
    wrapRef.current.scrollLeft = dragState.current.scrollLeft - dx
    wrapRef.current.scrollTop = dragState.current.scrollTop - dy
  }, [])

  const onMouseUp = useCallback(() => {
    dragState.current = null
  }, [])
  const showCompare = !!filters?.industry
  const data = (showCompare && appliedSet.size > 0)
    ? allData.filter(row => appliedSet.has(row.Company))
    : allData
  const companyNames = showCompare ? allData.map(r => r.Company).filter(Boolean) : []

  if (!allData || allData.length === 0) return <p className="empty-state">No data loaded.</p>

  function toggleCompany(name) {
    setPendingSet(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const companyIndex = displayColumns.indexOf('Company')
  const scoreInsertIndex = companyIndex >= 0 ? companyIndex + 1 : 1
  const colsBefore = displayColumns.slice(0, scoreInsertIndex)
  const colsAfter = displayColumns.slice(scoreInsertIndex)

  return (
    <div className="expandable-block">
      <div className="table-card-header">
        <div className="table-card-title-group">
          <span className="table-card-title">Results</span>
          {getBreadcrumb(filters) && (
            <span className="breadcrumb-path">{getBreadcrumb(filters)}</span>
          )}
        </div>
        <div className="download-links">
          {showCompare && (
            <div className="compare-dropdown" ref={compareRef}>
              <button
                className={`download-link compare-btn${appliedSet.size > 0 ? ' compare-btn--active' : ''}`}
                onClick={() => compareOpen ? applyCompare() : openCompare()}
              >
                Compare{appliedSet.size > 0 ? ` (${appliedSet.size})` : ''} ▾
              </button>
              {compareOpen && (
                <div className="compare-panel">
                  <div className="compare-panel-actions">
                    <button className="compare-action-link" onClick={clearCompare}>Clear</button>
                    <button className="compare-action-link compare-action-apply" onClick={applyCompare}>Apply</button>
                  </div>
                  <ul className="compare-list">
                    {companyNames.map(name => (
                      <li key={name} className="compare-item" onClick={() => toggleCompany(name)}>
                        <input type="checkbox" readOnly checked={pendingSet.has(name)} className="compare-checkbox" />
                        <span>{name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <button className="download-link" onClick={() => downloadCSV(data, displayColumns, isScored)}>
            &#8659; Download CSV
          </button>
        </div>
      </div>
      <div
        ref={wrapRef}
        className={`table-wrap${expanded ? ' table-wrap--expanded' : ''}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <table className="results-table">
          <colgroup>
            {isScored && <col style={{ width: '40px' }} />}
            {colsBefore.map((col) => (
              <col key={col} style={col === 'Company' ? { width: '280px' } : undefined} />
            ))}
            {isScored && <col style={{ width: '120px' }} />}
            {isScored && modelData && <col style={{ width: '80px' }} />}
            {colsAfter.map((col) => <col key={col} />)}
          </colgroup>
          <thead>
            <tr>
              {isScored && <th className="rank-col sticky-rank">#</th>}
              {colsBefore.map((col) => {
                const label = col === 'Market Capitalization' ? 'Market Capitalization ($M)' : col
                const sortable = col === 'Company' || NUMERIC_COLUMNS.has(col)
                return (
                  <th key={col} className={`${col === 'Company' ? 'sticky-company' : ''}${sortable ? ' th-sortable' : ''}`}
                    onClick={sortable ? () => handleColClick(col) : undefined}>
                    {label}{sortable && <SortArrow col={col} />}
                  </th>
                )
              })}
              {isScored && (
                <th className="sticky-score th-sortable" onClick={() => handleColClick('probability')}>
                  Probability<SortArrow col="probability" />
                </th>
              )}
              {isScored && modelData && (
                <th className="forecast-col th-sortable" onClick={() => handleColClick('forecast')}>
                  Forecast<SortArrow col="forecast" />
                </th>
              )}
              {colsAfter.map((col) => {
                const label = col === 'Market Capitalization' ? 'Market Capitalization ($M)' : col
                const sortable = NUMERIC_COLUMNS.has(col)
                return (
                  <th key={col} className={sortable ? 'th-sortable' : ''}
                    onClick={sortable ? () => handleColClick(col) : undefined}>
                    {label}{sortable && <SortArrow col={col} />}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const tier = getDistressStatus(row, modelData, thresholds)
              const accelerating = hasAccelerationFlag(row, modelData)
              const tintStyle = getRowTintStyle(tier, accelerating)
              return (
                <tr
                  key={i}
                  className={`${highlightedRow === i ? 'highlighted-row' : ''} ${onRowClick ? 'clickable-row' : ''}`}
                  style={tintStyle}
                  onClick={() => { if (!didDrag.current && onRowClick) onRowClick(row) }}
                >
                  {isScored && <td className="rank-col sticky-rank">{i + 1}</td>}
                  {colsBefore.map((col) => {
                    const debtStyle = (col === 'Debt to EBITDA' || col === 'Debt/EBITDA') ? { color: formatDebtEbitda(row[col], row).color, fontWeight: formatDebtEbitda(row[col], row).color ? 600 : undefined } : undefined
                    return (
                      <td
                        key={col}
                        className={col === 'Company' ? 'sticky-company' : ''}
                        style={debtStyle}
                      >
                        {formatCell(col, row[col], isScored, row)}
                      </td>
                    )
                  })}
                  {isScored && (
                    <td
                      className="sticky-score score-value"
                      style={{ color: row._score != null ? getScoreColor(row._score) : '#999' }}
                    >
                      {row._score != null ? `${row._score.toFixed(1)}%` : '—'}
                    </td>
                  )}
                  {isScored && modelData && (
                    <td className="forecast-col">
                      {tier && (
                        <span className={`forecast-badge forecast-badge-${tier.toLowerCase()}`}>
                          {tier}
                        </span>
                      )}
                      {accelerating && (
                        <span className="forecast-badge forecast-badge-accelerating">
                          Accelerating
                        </span>
                      )}
                    </td>
                  )}
                  {colsAfter.map((col) => {
                    const debtStyle = (col === 'Debt to EBITDA' || col === 'Debt/EBITDA') ? { color: formatDebtEbitda(row[col], row).color, fontWeight: formatDebtEbitda(row[col], row).color ? 600 : undefined } : undefined
                    return (
                      <td key={col} style={debtStyle}>{formatCell(col, row[col], isScored, row)}</td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <button className="expand-btn" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Collapse' : 'Expand'}
      </button>
    </div>
  )
}

