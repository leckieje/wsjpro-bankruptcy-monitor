const PERCENT_COLUMNS = new Set(['FSS Weekly Change', 'Negative Articles'])
const ROUND2_COLUMNS = new Set(['Z-Score', 'Receivables to Revenue'])
const DOLLAR_COLUMNS = new Set(['Current Open Price', '52-Week High Price', '52-Week Low Price'])

function formatCell(col, value, isScored) {
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

export default function ResultsTable({ rows, displayColumns, scoredRows }) {
  const data = scoredRows ?? rows
  const isScored = scoredRows !== null

  if (!data || data.length === 0) return <p className="empty-state">No data loaded.</p>

  const companyIndex = displayColumns.indexOf('Company')
  const scoreInsertIndex = companyIndex >= 0 ? companyIndex + 1 : 1
  const colsBefore = displayColumns.slice(0, scoreInsertIndex)
  const colsAfter = displayColumns.slice(scoreInsertIndex)

  return (
    <div>
      <div className="download-btn-row">
        <button className="btn btn-secondary" onClick={() => downloadCSV(data, displayColumns, isScored)}>
          Download CSV
        </button>
      </div>
      <div className="table-wrapper">
        <table className="results-table">
          <colgroup>
            {isScored && <col style={{ width: '2rem' }} />}
            {colsBefore.map((col) => (
              <col key={col} style={col === 'Company' ? { width: '200px' } : {}} />
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
              <tr key={i} className={isScored && i < 3 ? 'top-rank' : ''}>
                {isScored && <td className="rank-col sticky-rank">{i + 1}</td>}
                {colsBefore.map((col) => (
                  <td key={col} className={col === 'Company' ? 'sticky-company' : ''}>
                    {formatCell(col, row[col], isScored)}
                  </td>
                ))}
                {isScored && (
                  <td className="sticky-score score-value">
                    {row._score.toFixed(2)}
                  </td>
                )}
                {colsAfter.map((col) => (
                  <td key={col}>{formatCell(col, row[col], isScored)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
