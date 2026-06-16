import { useState } from 'react'

// Horizontal violin: data axis = x (log scale), density spreads on y around centre.
const VB_W = 600
const VB_H = 120
const MID  = VB_H / 2
const PL   = 4
const PR   = 4
const TW   = VB_W - PL - PR

function xOfLog(v, lo, hi) {
  return PL + ((Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * TW
}

function pct(sorted, p) {
  if (!sorted.length) return null
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo])
}

function gaussKDE(values, bandwidth, points) {
  const k = 1 / (bandwidth * Math.sqrt(2 * Math.PI))
  return points.map(x => {
    let sum = 0
    for (const v of values) {
      const z = (x - v) / bandwidth
      sum += Math.exp(-0.5 * z * z)
    }
    return (sum / values.length) * k
  })
}

function buildViolin(rawValues, numPoints = 120) {
  if (!rawValues || rawValues.length < 4) return null
  const sorted = [...rawValues].sort((a, b) => a - b)

  const p2  = pct(sorted, 2)
  const p98 = pct(sorted, 98)
  if (p98 <= p2 || p2 <= 0) return null

  const clipped = sorted.filter(v => v >= p2 && v <= p98)
  if (clipped.length < 4) return null

  // work in log space
  const tClipped = clipped.map(Math.log)
  const tLo = Math.log(p2), tHi = Math.log(p98)

  const iqr = (pct(tClipped, 75) - pct(tClipped, 25)) || (tHi - tLo) * 0.5
  const mid = tClipped[Math.floor(tClipped.length / 2)]
  const std = Math.sqrt(tClipped.reduce((a, v) => a + (v - mid) ** 2, 0) / tClipped.length)
  const bw  = Math.max(
    0.9 * Math.min(std, iqr / 1.34) * Math.pow(tClipped.length, -0.2),
    (tHi - tLo) * 0.02
  )

  const step = (tHi - tLo) / (numPoints - 1)
  const ts   = Array.from({ length: numPoints }, (_, i) => tLo + i * step)
  const dens = gaussKDE(tClipped, bw, ts)
  const maxD = Math.max(...dens)
  if (maxD === 0) return null

  const halfH = (VB_H / 2) * 0.82

  const pts = ts.map((t, i) => {
    const px = xOfLog(Math.exp(t), p2, p98)
    const h  = (dens[i] / maxD) * halfH
    return { px, h }
  })

  // top edge left→right, bottom edge right→left
  const top = pts.map(p => `${p.px.toFixed(1)},${(MID - p.h).toFixed(1)}`).join(' ')
  const bot = [...pts].reverse().map(p => `${p.px.toFixed(1)},${(MID + p.h).toFixed(1)}`).join(' ')
  const pathD = `M ${PL},${MID} L ${top} L ${bot} Z`

  return {
    pathD,
    lo: p2, hi: p98,
    median: pct(sorted, 50),
    q1: pct(sorted, 25),
    q3: pct(sorted, 75),
    n: sorted.length,
  }
}

function buildSummary(scoredRows) {
  const valid = scoredRows.map(r => r._score).filter(s => typeof s === 'number' && s > 0).sort((a, b) => a - b)
  if (!valid.length) return null
  const avg    = valid.reduce((a, b) => a + b, 0) / valid.length
  const high25 = valid.filter(s => s >= 25).length
  const high50 = valid.filter(s => s >= 50).length
  return {
    scored: valid.length,
    avg:    avg.toFixed(1),
    median: pct(valid, 50)?.toFixed(1) ?? '—',
    p25:    pct(valid, 25)?.toFixed(1) ?? '—',
    p75:    pct(valid, 75)?.toFixed(1) ?? '—',
    high:   valid[valid.length - 1]?.toFixed(1) ?? '—',
    low:    valid[0]?.toFixed(1) ?? '—',
    high25,
    high50,
  }
}

const INDICATOR_OPTIONS = [
  { key: 'z_score',     label: 'Z-Score',        unit: '',  scale: 1   },
  { key: 'quick_ratio', label: 'Quick Ratio',     unit: 'x', scale: 1   },
  { key: 'ebit_ta',     label: 'EBIT / Assets',   unit: '%', scale: 100 },
  { key: 'debt_ebitda', label: 'Debt / EBITDA',   unit: 'x', scale: 1   },
  { key: 'tl_ta',       label: 'Liab / Assets',   unit: '%', scale: 100 },
  { key: 'fss_score',   label: 'Sentiment',        unit: '',  scale: 100 },
]

function fmtPct(v) {
  if (v == null) return '—'
  return `${parseFloat(v).toFixed(1)}%`
}

export default function ViolinPanel({ filteredRows, modelData, enabledIndicators }) {
  const [selectedInd, setSelectedInd] = useState('z_score')

  if (!filteredRows || !modelData) return null

  const probValues = filteredRows
    .map(r => r._score)
    .filter(v => typeof v === 'number' && v > 0)

  const violin  = buildViolin(probValues)
  const summary = buildSummary(filteredRows)
  const color   = '#2563EB'

  // log-scale axis tick positions
  const axisTicks = violin
    ? [violin.lo, violin.q1, violin.median, violin.q3, violin.hi].filter(Boolean)
    : []

  return (
    <div className="violin-panel">
      <div className="violin-panel-header">
        <div className="chart-title" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>
          <span>Distress Probability Distribution</span>
          <span className="violin-log-badge">log scale</span>
        </div>
        <div className="violin-ind-selector">
          <label className="violin-ind-label">Indicator</label>
          <select
            className="violin-ind-select"
            value={selectedInd}
            onChange={e => setSelectedInd(e.target.value)}
          >
            {INDICATOR_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="violin-h-layout">
        <div className="violin-h-chart">
          {violin ? (
            <>
              <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height="100%" preserveAspectRatio="none">
                {/* violin body */}
                <path d={violin.pathD} fill={`${color}22`} stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
                {/* IQR box */}
                <rect
                  x={xOfLog(violin.q1, violin.lo, violin.hi)}
                  y={MID - VB_H * 0.18}
                  width={xOfLog(violin.q3, violin.lo, violin.hi) - xOfLog(violin.q1, violin.lo, violin.hi)}
                  height={VB_H * 0.36}
                  fill={`${color}28`}
                  stroke={color}
                  strokeWidth={1}
                />
                {/* median line */}
                <line
                  x1={xOfLog(violin.median, violin.lo, violin.hi)}
                  x2={xOfLog(violin.median, violin.lo, violin.hi)}
                  y1={MID - VB_H * 0.28}
                  y2={MID + VB_H * 0.28}
                  stroke={color}
                  strokeWidth={2}
                />
              </svg>
              {/* axis labels */}
              <div className="violin-h-axis">
                {axisTicks.map((v, i) => (
                  <span
                    key={i}
                    className="violin-h-tick"
                    style={{ left: `${((xOfLog(v, violin.lo, violin.hi) - PL) / TW) * 100}%` }}
                  >
                    {v.toFixed(1)}%
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="violin-col-empty">insufficient data</div>
          )}
        </div>

        {summary && (
          <div className="histogram-stats">
            <div className="hstat-row hstat-row--primary">
              <span className="hstat-label">Avg</span>
              <span className="hstat-value hstat-value--large">{summary.avg}%</span>
            </div>
            <div className="hstat-row">
              <span className="hstat-label">Median</span>
              <span className="hstat-value">{summary.median}%</span>
            </div>
            <div className="hstat-divider" />
            <div className="hstat-row">
              <span className="hstat-label">25th pct</span>
              <span className="hstat-value">{summary.p25}%</span>
            </div>
            <div className="hstat-row">
              <span className="hstat-label">75th pct</span>
              <span className="hstat-value">{summary.p75}%</span>
            </div>
            <div className="hstat-divider" />
            <div className="hstat-row">
              <span className="hstat-label">High</span>
              <span className="hstat-value">{summary.high}%</span>
            </div>
            <div className="hstat-row">
              <span className="hstat-label">Low</span>
              <span className="hstat-value">{summary.low}%</span>
            </div>
            <div className="hstat-divider" />
            <div className="hstat-row">
              <span className="hstat-label">≥ 25% risk</span>
              <span className="hstat-value">{summary.high25}</span>
            </div>
            <div className="hstat-row">
              <span className="hstat-label">≥ 50% risk</span>
              <span className="hstat-value hstat-value--alert">{summary.high50}</span>
            </div>
            <div className="hstat-divider" />
            <div className="hstat-row">
              <span className="hstat-label">Total companies</span>
              <span className="hstat-value">{summary.scored}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
