function buildTableData(scoredRows) {
  const byIndustry = {}
  for (const row of scoredRows) {
    const industry = row['Industry'] || 'Unknown'
    if (!byIndustry[industry]) byIndustry[industry] = []
    byIndustry[industry].push(row._score)
  }
  return Object.entries(byIndustry)
    .map(([industry, scores]) => {
      const validScores = scores.filter(s => s > 0)
      return {
        industry,
        avg: validScores.length
          ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 100) / 100
          : null,
        high: validScores.length ? Math.round(Math.max(...validScores) * 100) / 100 : null,
        low: validScores.length ? Math.round(Math.min(...validScores) * 100) / 100 : null,
        count: scores.length,
      }
    })
    .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
}

export default function IndustryChart({ scoredRows }) {
  if (!scoredRows) return null

  const data = buildTableData(scoredRows)
  const maxAvg = data.find(d => d.avg !== null)?.avg

  return (
    <div className="chart-panel">
      <h2 className="chart-title">Average Score by Industry</h2>
      <table className="results-table industry-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Industry</th>
            <th>WSJ Pro Score*</th>
            <th>High</th>
            <th>Low</th>
            <th>Companies</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row.industry} className={i === 0 ? 'top-rank' : ''}>
              <td className="rank-col">{i + 1}</td>
              <td>{row.industry}</td>
              <td className={`score-col score-value${row.avg === maxAvg ? ' score-top' : ''}`}>
                {row.avg !== null ? row.avg.toFixed(2) : '—'}
              </td>
              <td>{row.high !== null ? row.high.toFixed(2) : '—'}</td>
              <td>{row.low !== null ? row.low.toFixed(2) : '—'}</td>
              <td>{row.count}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6} className="industry-footnote">
              * Companies with a WSJ Pro Score of 0 are excluded from averages, highs, and lows.
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
