import { useState } from 'react'
import { getScoreColor } from '../utils/scoreColor.js'

function buildTableData(scoredRows, groupByField, minCount) {
  const byGroup = {}
  for (const row of scoredRows) {
    const key = row[groupByField] || 'Unknown'
    if (!byGroup[key]) byGroup[key] = []
    byGroup[key].push(row._score)
  }
  return Object.entries(byGroup)
    .map(([group, scores]) => {
      const validScores = scores.filter(s => s > 0)
      return {
        group,
        avg: validScores.length
          ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 100) / 100
          : null,
        high: validScores.length ? Math.round(Math.max(...validScores) * 100) / 100 : null,
        low: validScores.length ? Math.round(Math.min(...validScores) * 100) / 100 : null,
        count: scores.length,
      }
    })
    .filter(d => d.count >= minCount)
    .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
}

function getGroupByField(filters) {
  if (filters.subSector) return 'Industry'
  if (filters.sector) return 'SubSector'
  return 'Sector'
}

function getGroupLabel(filters) {
  if (filters.subSector) return 'Industry'
  if (filters.sector) return 'Sub-Sector'
  return 'Sector'
}

export default function IndustryChart({ scoredRows, filters, onFiltersChange }) {
  const [expanded, setExpanded] = useState(false)

  if (!scoredRows) return null

  const groupByField = getGroupByField(filters)
  const groupLabel = getGroupLabel(filters)
  const minCount = groupByField === 'Sector' ? 20 : 1
  const data = buildTableData(scoredRows, groupByField, minCount)
  const maxAvg = data.find(d => d.avg !== null)?.avg

  function handleGroupClick(value) {
    if (groupByField === 'Sector') {
      onFiltersChange({ sector: value, subSector: '', industry: '' })
    } else if (groupByField === 'SubSector') {
      onFiltersChange({ ...filters, subSector: value, industry: '' })
    } else if (groupByField === 'Industry') {
      onFiltersChange({ ...filters, industry: value })
    }
  }

  function handleBack() {
    if (filters.industry) {
      onFiltersChange({ ...filters, industry: '' })
    } else if (filters.subSector) {
      onFiltersChange({ ...filters, subSector: '', industry: '' })
    } else if (filters.sector) {
      onFiltersChange({ sector: '', subSector: '', industry: '' })
    }
  }

  const canGoBack = filters.sector || filters.subSector || filters.industry

  return (
    <div className="expandable-block">
      <div className="chart-title">
        {canGoBack && (
          <button className="back-link" onClick={handleBack}>&larr; Back</button>
        )}
        <span>Average Score by {groupLabel}</span>
      </div>
      <table className={`results-table industry-table${expanded ? ' industry-table--expanded' : ''}`}>
        <thead>
          <tr>
            <th>#</th>
            <th>{groupLabel}</th>
            <th>WSJ Pro Score*</th>
            <th>High</th>
            <th>Low</th>
            <th>Companies</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row.group}>
              <td className="rank-col">{i + 1}</td>
              <td>
                <span
                  className="group-link"
                  onClick={() => handleGroupClick(row.group)}
                >
                  {row.group}
                </span>
              </td>
              <td className="score-col score-value" style={{ color: getScoreColor(row.avg) }}>
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
      <button className="expand-btn" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Collapse' : 'Expand'}
      </button>
    </div>
  )
}
