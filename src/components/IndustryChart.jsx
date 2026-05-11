import { useState } from 'react'
import { getScoreColor } from '../utils/scoreColor.js'

function pct(sorted, p) {
  if (sorted.length === 0) return null
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo])
}

function buildTableData(scoredRows, groupByField, minCount) {
  const byGroup = {}
  for (const row of scoredRows) {
    const key = row[groupByField] || 'Unknown'
    if (!byGroup[key]) byGroup[key] = []
    byGroup[key].push(row._score)
  }
  return Object.entries(byGroup)
    .map(([group, scores]) => {
      const validScores = scores.filter(s => s > 0).sort((a, b) => a - b)
      const q1 = pct(validScores, 25)
      const q3 = pct(validScores, 75)
      const iqr = q1 != null && q3 != null ? q3 - q1 : 0
      const fence_lo = q1 - 1.5 * iqr
      const fence_hi = q3 + 1.5 * iqr
      const inliers  = validScores.filter(v => v >= fence_lo && v <= fence_hi)
      const outliers = validScores.filter(v => v < fence_lo || v > fence_hi)
      return {
        group,
        scores: validScores,
        outliers,
        avg: validScores.length
          ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 100) / 100
          : null,
        median: validScores.length ? Math.round(pct(validScores, 50) * 100) / 100 : null,
        p25:    q1  != null ? Math.round(q1  * 100) / 100 : null,
        p75:    q3  != null ? Math.round(q3  * 100) / 100 : null,
        // whisker tips = last non-outlier, not raw min/max
        wLow:  inliers.length ? Math.round(Math.min(...inliers) * 100) / 100 : null,
        wHigh: inliers.length ? Math.round(Math.max(...inliers) * 100) / 100 : null,
        high:  validScores.length ? Math.round(Math.max(...validScores) * 100) / 100 : null,
        low:   validScores.length ? Math.round(Math.min(...validScores) * 100) / 100 : null,
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

function getBreadcrumb(filters) {
  const parts = []
  if (filters.sector) parts.push(filters.sector)
  if (filters.subSector) parts.push(filters.subSector)
  if (filters.industry) parts.push(filters.industry)
  return parts.join(' / ')
}

function getGroupLabel(filters) {
  if (filters.subSector) return 'Industry'
  if (filters.sector) return 'Sub-Sector'
  return 'Sector'
}

// SVG uses a 1000-unit wide viewBox so percentage positions are clean integers.
// All text is set in CSS px via a <style> tag so it renders at the correct
// physical size regardless of how the viewBox scales to fill its container.
const VB_W  = 1000
const VB_H  = 80
const PL    = 18
const PR    = 18
const TW    = VB_W - PL - PR
const MID   = 30
const BOX_H = 18

function xOf(v) { return PL + (v / 100) * TW }

function ScatterDots({ row }) {
  const { scores } = row
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      style={{ display: 'block', overflow: 'visible', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}
    >
      <style>{`
        .bw-label { font-size: 10px; fill: #555; }
        .bw-tick  { font-size: 10px; fill: #555; }
      `}</style>

      {/* axis baseline */}
      <line x1={PL} x2={PL + TW} y1={MID + BOX_H / 2 + 8} y2={MID + BOX_H / 2 + 8} stroke="#e0e0e0" strokeWidth={1} />

      {/* axis ticks + labels */}
      {[0, 25, 50, 75, 100].map(v => (
        <g key={v}>
          <line x1={xOf(v)} x2={xOf(v)} y1={MID + BOX_H / 2 + 6} y2={MID + BOX_H / 2 + 12} stroke="#e0e0e0" strokeWidth={1} />
          <text x={xOf(v)} y={MID + BOX_H / 2 + 24} textAnchor="middle" className="bw-tick">{v}</text>
        </g>
      ))}

      {/* track line */}
      <line x1={PL} x2={PL + TW} y1={MID} y2={MID} stroke="#e0e0e0" strokeWidth={1} />

      {/* one circle per company */}
      {scores.map((v, i) => (
        <g key={i}>
          <circle cx={xOf(v)} cy={MID} r={5} fill="#EFF6FF" stroke="#2563EB" strokeWidth={1.5} />
          <text x={xOf(v)} y={MID - 12} textAnchor="middle" className="bw-label">{v.toFixed(1)}</text>
          <title>{v.toFixed(2)}</title>
        </g>
      ))}
    </svg>
  )
}

function BoxWhisker({ row }) {
  const { p25, p75, median, avg, wLow, wHigh, outliers, scores } = row
  if (p25 == null) return null

  if (scores.length <= 5) return <ScatterDots row={row} />

  const bL = xOf(p25)
  const bR = xOf(p75)

  const dedupedOutliers = []
  const seen = new Set()
  for (const v of outliers) {
    const key = v.toFixed(1)
    if (!seen.has(key)) { seen.add(key); dedupedOutliers.push(v) }
  }

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      style={{ display: 'block', overflow: 'visible', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}
    >
      <style>{`
        .bw-label { font-size: 10px; fill: #555; }
        .bw-tick  { font-size: 10px; fill: #555; }
        .bw-legend{ font-size: 10px; fill: #555; }
      `}</style>

      {/* axis baseline */}
      <line x1={PL} x2={PL + TW} y1={MID + BOX_H / 2 + 8} y2={MID + BOX_H / 2 + 8} stroke="#e0e0e0" strokeWidth={1} />

      {/* axis ticks + labels */}
      {[0, 25, 50, 75, 100].map(v => (
        <g key={v}>
          <line
            x1={xOf(v)} x2={xOf(v)}
            y1={MID + BOX_H / 2 + 6} y2={MID + BOX_H / 2 + 12}
            stroke="#e0e0e0" strokeWidth={1}
          />
          <text x={xOf(v)} y={MID + BOX_H / 2 + 24} textAnchor="middle" className="bw-tick">{v}</text>
        </g>
      ))}

      {/* whisker lines */}
      <line x1={xOf(wLow)} x2={bL}          y1={MID} y2={MID} stroke="#adb5bd" strokeWidth={1.5} />
      <line x1={bR}        x2={xOf(wHigh)}  y1={MID} y2={MID} stroke="#adb5bd" strokeWidth={1.5} />

      {/* whisker end caps */}
      <line x1={xOf(wLow)}  x2={xOf(wLow)}  y1={MID - 6} y2={MID + 6} stroke="#adb5bd" strokeWidth={1.5} />
      <line x1={xOf(wHigh)} x2={xOf(wHigh)} y1={MID - 6} y2={MID + 6} stroke="#adb5bd" strokeWidth={1.5} />

      {/* IQR box — matches histogram bar fill #2563EB at low opacity */}
      <rect
        x={bL} y={MID - BOX_H / 2}
        width={bR - bL} height={BOX_H}
        fill="#EFF6FF" stroke="#2563EB" strokeWidth={1.5} rx={2}
      />

      {/* median line */}
      <line
        x1={xOf(median)} x2={xOf(median)}
        y1={MID - BOX_H / 2} y2={MID + BOX_H / 2}
        stroke="#2563EB" strokeWidth={2.5}
      />

      {/* avg triangle above box, pointing down */}
      {avg != null && (
        <polygon
          points={`${xOf(avg)},${MID - BOX_H / 2} ${xOf(avg) - 5},${MID - BOX_H / 2 - 7} ${xOf(avg) + 5},${MID - BOX_H / 2 - 7}`}
          fill="#f59e0b"
        />
      )}

      {/* outlier dots */}
      {dedupedOutliers.map((v, i) => (
        <g key={i}>
          <circle cx={xOf(v)} cy={MID} r={4} fill="none" stroke="#DC2626" strokeWidth={1.5} />
          <title>{v.toFixed(2)}</title>
        </g>
      ))}

      {/* value labels above/below key points */}
      {[
        { v: wLow,   label: wLow?.toFixed(1),   dy: -14 },
        { v: p25,    label: p25?.toFixed(1),     dy:  26 },
        { v: median, label: median?.toFixed(1),  dy: -14 },
        { v: p75,    label: p75?.toFixed(1),     dy:  26 },
        { v: wHigh,  label: wHigh?.toFixed(1),   dy: -14 },
      ].map(({ v, label, dy }, i) =>
        v != null && (
          <text key={i} x={xOf(v)} y={MID + dy} textAnchor="middle" className="bw-label">{label}</text>
        )
      )}

      {/* legend — bottom right, same style as histogram axis labels */}
      <g transform={`translate(${VB_W - PR - 290}, ${VB_H - 2})`}>
        <rect x={0} y={-8} width={14} height={9} fill="#EFF6FF" stroke="#2563EB" strokeWidth={1} rx={1} />
        <text x={18} y={0} className="bw-legend">IQR (25–75)</text>

        <line x1={88} x2={88} y1={-8} y2={1} stroke="#2563EB" strokeWidth={2} />
        <text x={93} y={0} className="bw-legend">Median</text>

        <polygon points="154,1 149,-8 159,-8" fill="#f59e0b" transform="translate(0,-4)" />
        <text x={163} y={0} className="bw-legend">Avg</text>

        <circle cx={196} cy={-4} r={4} fill="none" stroke="#DC2626" strokeWidth={1.5} />
        <text x={204} y={0} className="bw-legend">Outlier (1.5× IQR)</text>
      </g>
    </svg>
  )
}

export default function IndustryChart({ scoredRows, filters, onFiltersChange }) {
  const [expanded, setExpanded] = useState(false)
  const [openRows, setOpenRows] = useState(new Set())

  if (!scoredRows) return null

  const groupByField = getGroupByField(filters)
  const groupLabel = getGroupLabel(filters)
  const minCount = groupByField === 'Sector' ? 20 : 1
  const data = buildTableData(scoredRows, groupByField, minCount)

  function toggleRow(group) {
    setOpenRows(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  function handleGroupClick(e, value) {
    e.stopPropagation()
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
        <span>Average Score by {groupLabel}</span>
        {canGoBack && (
          <div className="breadcrumb-row">
            <button className="back-link" onClick={handleBack}>&larr; Back</button>
            <span className="breadcrumb-path">{getBreadcrumb(filters)}</span>
          </div>
        )}
      </div>
      <table className={`results-table industry-table${expanded ? ' industry-table--expanded' : ''}`}>
        <thead>
          <tr>
            <th>#</th>
            <th>{groupLabel}</th>
            <th>Average*</th>
            <th>Median</th>
            <th>25%</th>
            <th>75%</th>
            <th>High</th>
            <th>Low</th>
            <th>Companies</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const isOpen = openRows.has(row.group)
            return [
              <tr
                key={row.group}
                className={`industry-data-row${isOpen ? ' industry-row--open' : ''}`}
                onClick={() => toggleRow(row.group)}
              >
                <td className="rank-col">{i + 1}</td>
                <td>
                  <span className="whisker-toggle-icon">{isOpen ? '▾' : '▸'}</span>
                  <span className="group-link" onClick={(e) => handleGroupClick(e, row.group)}>
                    {row.group}
                  </span>
                </td>
                <td className="score-col score-value" style={{ color: getScoreColor(row.avg) }}>
                  {row.avg !== null ? row.avg.toFixed(2) : '—'}
                </td>
                <td>{row.median !== null ? row.median.toFixed(2) : '—'}</td>
                <td>{row.p25    !== null ? row.p25.toFixed(2)    : '—'}</td>
                <td>{row.p75    !== null ? row.p75.toFixed(2)    : '—'}</td>
                <td>{row.high   !== null ? row.high.toFixed(2)   : '—'}</td>
                <td>{row.low    !== null ? row.low.toFixed(2)    : '—'}</td>
                <td>{row.count}</td>
              </tr>,
              isOpen && (
                <tr key={`${row.group}__whisker`} className="whisker-row">
                  <td colSpan={9}>
                    <div className="whisker-cell">
                      <BoxWhisker row={row} />
                    </div>
                  </td>
                </tr>
              ),
            ]
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={9} className="industry-footnote">
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
