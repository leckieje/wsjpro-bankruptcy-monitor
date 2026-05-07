import { useState, useRef, useCallback, useEffect } from 'react'
import { getScoreColor } from '../utils/scoreColor.js'

const PERCENT_COLUMNS = new Set(['FSS Weekly Change', 'Negative Articles'])
const ROUND2_COLUMNS = new Set(['Z-Score', 'Receivables to Revenue'])
const DOLLAR_COLUMNS = new Set(['Current Open Price', '52-Week High Price', '52-Week Low Price'])

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

function formatCell(col, value, isScored, row) {
  if (col === 'Debt to EBITDA') {
    return formatDebtEbitda(value, row).text
  }
  if (value === null || value === undefined || value === '') return ''
  if (PERCENT_COLUMNS.has(col) && typeof value === 'number') return `${value}%`
  if (col === 'FSS Score' && isScored && typeof value === 'number')
    return (value * 100).toFixed(2)
  if (ROUND2_COLUMNS.has(col) && typeof value === 'number') return value.toFixed(2)
  if (col === 'Market Capitalization' && typeof value === 'number')
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`
  if (DOLLAR_COLUMNS.has(col) && typeof value === 'number')
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return value
}

function downloadCSV(data, displayColumns, isScored) {
  const headers = [...(isScored ? ['#'] : []), ...displayColumns, ...(isScored ? ['WSJ Pro Score'] : [])]
  const rows = data.map((row, i) => {
    const rank = isScored ? [i + 1] : []
    const cols = displayColumns.map(h => row[h] ?? '')
    const score = isScored ? [row._score?.toFixed(2) ?? ''] : []
    return [...rank, ...cols, ...score]
  })
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'wsj-pro-bankruptcy-scores.csv'
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

export default function ResultsTable({ rows, displayColumns, scoredRows, filters }) {
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

  const allData = scoredRows ?? rows
  const isScored = scoredRows !== null

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    dragState.current = { startX: e.clientX, startY: e.clientY, scrollLeft: wrapRef.current.scrollLeft, scrollTop: wrapRef.current.scrollTop, moved: false }
    e.preventDefault()
  }, [])

  const onMouseMove = useCallback((e) => {
    if (!dragState.current) return
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    if (!dragState.current.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return
    dragState.current.moved = true
    wrapRef.current.scrollLeft = dragState.current.scrollLeft - dx
    wrapRef.current.scrollTop = dragState.current.scrollTop - dy
  }, [])

  const onMouseUp = useCallback((e) => {
    if (dragState.current?.moved) e.stopPropagation()
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
            {colsAfter.map((col) => <col key={col} />)}
          </colgroup>
          <thead>
            <tr>
              {isScored && <th className="rank-col sticky-rank">#</th>}
              {colsBefore.map((col) => (
                <th key={col} className={col === 'Company' ? 'sticky-company' : ''}>
                  {col === 'Market Capitalization' ? 'Market Capitalization ($M)' : col}
                </th>
              ))}
              {isScored && <th className="sticky-score">WSJ Pro Score</th>}
              {colsAfter.map((col) => (
                <th key={col}>{col === 'Market Capitalization' ? 'Market Capitalization ($M)' : col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={i}
                className={highlightedRow === i ? 'highlighted-row' : ''}
              >
                {isScored && <td className="rank-col sticky-rank">{i + 1}</td>}
                {colsBefore.map((col) => {
                  const debtStyle = col === 'Debt to EBITDA' ? { color: formatDebtEbitda(row[col], row).color, fontWeight: formatDebtEbitda(row[col], row).color ? 600 : undefined } : undefined
                  return (
                    <td
                      key={col}
                      className={col === 'Company' ? 'sticky-company' : ''}
                      style={debtStyle}
                      onClick={col === 'Company' ? (e) => { e.stopPropagation(); setHighlightedRow(highlightedRow === i ? null : i) } : undefined}
                    >
                      {formatCell(col, row[col], isScored, row)}
                    </td>
                  )
                })}
                {isScored && (
                  <td
                    className="sticky-score score-value"
                    style={{ color: getScoreColor(row._score) }}
                    onClick={(e) => { e.stopPropagation(); setHighlightedRow(highlightedRow === i ? null : i) }}
                  >
                    {row._score.toFixed(2)}
                  </td>
                )}
                {colsAfter.map((col) => {
                  const debtStyle = col === 'Debt to EBITDA' ? { color: formatDebtEbitda(row[col], row).color, fontWeight: formatDebtEbitda(row[col], row).color ? 600 : undefined } : undefined
                  return (
                    <td key={col} style={debtStyle}>{formatCell(col, row[col], isScored, row)}</td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="expand-btn" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Collapse' : 'Expand'}
      </button>
    </div>
  )
}

