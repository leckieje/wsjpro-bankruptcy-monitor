import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine } from 'recharts'

const FSS_BANDS = [
  { x1:  0, x2: 17,  fill: '#16A34A', color: '#16A34A', label: null },
  { x1: 17, x2: 25,  fill: '#4ADE80', color: '#16A34A', label: 'Low' },
  { x1: 25, x2: 31,  fill: '#F59E0B', color: '#D97706', label: 'Mod.' },
  { x1: 31, x2: 40,  fill: '#F87171', color: '#DC2626', label: 'High' },
  { x1: 40, x2: 100, fill: '#DC2626', color: '#991B1B', label: 'Very High' },
]

const INDICATOR_OPTIONS = [
  { key: 'z_score',     label: 'Z-Score',                  unit: '',  scale: 1   },
  { key: 'quick_ratio', label: 'Quick Ratio',               unit: 'x', scale: 1,   log: true },
  { key: 'ebit_ta',     label: 'EBIT / Assets',             unit: '%', scale: 100, transform: 'cube' },
  { key: 'debt_ebitda', label: 'Debt / EBITDA',             unit: 'x', scale: 1   },
  { key: 'tl_ta',       label: 'Liabilities / Assets',      unit: '%', scale: 100, log: true },
  { key: 'fss_score',   label: 'Sentiment',                 unit: '',  scale: 100 },
]

export const FINANCE_INDICATOR_OPTIONS = [
  { key: 'roa',               label: 'ROA',               unit: '%', scale: 100, source: 'sector_metrics' },
  { key: 'interest_coverage', label: 'Int. Coverage',     unit: 'x', scale: 1,   source: 'sector_metrics', log: true },
  { key: 'debt_assets',       label: 'Debt / Assets',     unit: '%', scale: 100, source: 'sector_metrics', log: true },
  { key: 'npl_ratio',         label: 'NPL Ratio',         unit: '%', scale: 100, source: 'sector_metrics' },
  { key: 'combined_ratio',    label: 'Combined Ratio',    unit: '%', scale: 100, source: 'sector_metrics' },
]

function getBreadcrumb(filters) {
  const parts = []
  if (filters.sector) parts.push(filters.sector)
  if (filters.subSector) parts.push(filters.subSector)
  if (filters.industry) parts.push(filters.industry)
  return parts.join(' / ')
}

function pct(sorted, p) {
  if (!sorted.length) return null
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo])
}

// Log-scale buckets for probability: evenly spaced on log axis
function buildLogBuckets(scoredRows, numBuckets = 40) {
  const values = scoredRows.map(r => r._score).filter(v => typeof v === 'number' && v > 0)
  if (!values.length) return []
  const lo = Math.log(Math.max(0.1, Math.min(...values)))
  const hi = Math.log(Math.max(...values) + 0.01)
  const step = (hi - lo) / numBuckets
  const buckets = Array.from({ length: numBuckets }, (_, i) => {
    const edgeLo = Math.exp(lo + i * step)
    const edgeHi = Math.exp(lo + (i + 1) * step)
    return { lo: edgeLo, hi: edgeHi, mid: Math.exp(lo + (i + 0.5) * step), count: 0 }
  })
  for (const v of values) {
    const idx = Math.min(Math.floor((Math.log(v) - lo) / step), numBuckets - 1)
    buckets[idx].count++
  }
  return buckets
}

// Log-scale buckets for raw values, clipped to p2–p98 of positive values
function buildLogBucketsFromValues(values, numBuckets = 40) {
  const vals = [...values.filter(v => typeof v === 'number' && v > 0)].sort((a, b) => a - b)
  if (vals.length < 4) return []
  const p2  = Math.max(pct(vals, 2),  0.0001)
  const p98 = pct(vals, 98)
  if (p98 <= p2) return []
  const lo = Math.log(p2)
  const hi = Math.log(p98)
  const step = (hi - lo) / numBuckets
  const buckets = Array.from({ length: numBuckets }, (_, i) => {
    const edgeLo = Math.exp(lo + i * step)
    const edgeHi = Math.exp(lo + (i + 1) * step)
    return { lo: edgeLo, hi: edgeHi, mid: Math.exp(lo + (i + 0.5) * step), count: 0 }
  })
  for (const v of vals) {
    if (v < p2 || v > p98) continue
    const idx = Math.min(Math.floor((Math.log(v) - lo) / step), numBuckets - 1)
    buckets[idx].count++
  }
  return buckets
}

// Linear buckets for indicator values, clipped to p2–p98
function buildLinearBuckets(values, numBuckets = 30) {
  if (!values.length) return []
  const sorted = [...values].sort((a, b) => a - b)
  const lo = pct(sorted, 2)
  const hi = pct(sorted, 98)
  if (hi <= lo) return []
  const step = (hi - lo) / numBuckets
  const buckets = Array.from({ length: numBuckets }, (_, i) => ({
    lo: lo + i * step,
    hi: lo + (i + 1) * step,
    mid: lo + (i + 0.5) * step,
    count: 0,
  }))
  for (const v of values) {
    if (v < lo || v > hi) continue
    const idx = Math.min(Math.floor((v - lo) / step), numBuckets - 1)
    buckets[idx].count++
  }
  return buckets
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

function buildIndSummary(values, unit) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length
  const fmt = v => {
    if (v == null) return '—'
    const abs = Math.abs(v)
    const s = abs >= 100 ? v.toFixed(1) : abs >= 10 ? v.toFixed(2) : v.toFixed(3)
    return unit === '%' ? `${s}%` : unit ? `${s}${unit}` : s
  }
  return {
    count: sorted.length,
    avg:    fmt(avg),
    median: fmt(pct(sorted, 50)),
    p25:    fmt(pct(sorted, 25)),
    p75:    fmt(pct(sorted, 75)),
    high:   fmt(sorted[sorted.length - 1]),
    low:    fmt(sorted[0]),
  }
}

// Round a value to nearest 0-or-5 step at the appropriate magnitude
function roundToNice(v) {
  if (v === 0) return 0
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v))))
  const step = mag >= 10 ? mag : mag / 2  // step is 10, 1, 0.1, etc or half
  return Math.round(v / step) * step
}

// Generate ~n evenly-spaced ticks across [lo, hi] snapped to 0s and 5s
function niceLinearTicks(lo, hi, n = 6) {
  const range = hi - lo
  if (range === 0) return [lo]
  const rawStep = range / (n - 1)
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const candidates = [1, 2, 2.5, 5, 10].map(f => f * mag)
  const step = candidates.find(s => s >= rawStep) || candidates[candidates.length - 1]
  const start = Math.ceil(lo / step) * step
  const ticks = []
  for (let t = start; t <= hi + step * 0.01; t += step) {
    ticks.push(parseFloat(t.toPrecision(10)))
  }
  return ticks
}

// Generate ~n log-spaced ticks snapped to round numbers (0s and 5s)
function niceLogTicks(lo, hi, n = 6) {
  if (lo <= 0 || hi <= 0) return []
  const tLo = Math.log10(lo), tHi = Math.log10(hi)
  const candidates = []
  // Walk through candidate values: 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100...
  for (let exp = Math.floor(tLo) - 1; exp <= Math.ceil(tHi) + 1; exp++) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, exp)
      if (v >= lo * 0.99 && v <= hi * 1.01) candidates.push(v)
    }
  }
  if (candidates.length <= n) return candidates
  // Sub-sample evenly
  const step = (candidates.length - 1) / (n - 1)
  return Array.from({ length: n }, (_, i) => candidates[Math.round(i * step)])
}

function fmtTick(v, unit) {
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '')
  return unit === '%' ? `${s}%` : unit ? `${s}${unit}` : s
}

const ProbTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const b = payload[0].payload
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{b.lo.toFixed(1)}–{b.hi.toFixed(1)}%</div>
      <div className="chart-tooltip-value"><strong>{payload[0].value}</strong> {payload[0].value === 1 ? 'company' : 'companies'}</div>
    </div>
  )
}

const IndTooltip = ({ active, payload, unit, invertTransform = v => v }) => {
  if (!active || !payload?.length) return null
  const b = payload[0].payload
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{fmtTick(invertTransform(b.lo), unit)}–{fmtTick(invertTransform(b.hi), unit)}</div>
      <div className="chart-tooltip-value"><strong>{payload[0].value}</strong> {payload[0].value === 1 ? 'company' : 'companies'}</div>
    </div>
  )
}

export default function ScoreHistogram({ scoredRows, filters, modelData, indicatorOptions: indicatorOptionsProp }) {
  const indicatorOptions = indicatorOptionsProp || INDICATOR_OPTIONS
  const [selectedInd, setSelectedInd] = useState(indicatorOptions[0].key)
  const [view, setView] = useState('probability') // 'probability' | 'indicator'
  const [linearInds, setLinearInds] = useState(new Set()) // indicators forced to linear
  const [probLinear, setProbLinear] = useState(false)

  if (!scoredRows) return null

  const summary    = buildSummary(scoredRows)
  const breadcrumb = filters ? getBreadcrumb(filters) : ''
  const probScores = scoredRows.map(r => r._score).filter(v => typeof v === 'number' && v > 0)
  const probData   = probLinear ? buildLinearBuckets(probScores) : buildLogBuckets(scoredRows)

  const indMeta    = indicatorOptions.find(o => o.key === selectedInd) || indicatorOptions[0]
  const isLinear   = linearInds.has(selectedInd)
  const useLog     = indMeta.log && !isLinear
  const useTransform = indMeta.transform && !isLinear

  // Finance rows carry sector_metrics indicators as pre-scaled flat columns;
  // monitor rows require a ticker lookup into modelData.
  const FINANCE_IND_COL = {
    roa: 'ROA', interest_coverage: 'Int. Coverage', debt_assets: 'Debt/Assets',
    npl_ratio: 'NPL Ratio', combined_ratio: 'Combined Ratio',
  }
  const indRaw = scoredRows.flatMap(row => {
    if (indMeta.source === 'sector_metrics') {
      // Finance row: value is already stored at display scale in the flat column
      const col = FINANCE_IND_COL[indMeta.key]
      const v = col != null ? row[col] : null
      return typeof v === 'number' && isFinite(v) ? [v] : []
    }
    // Monitor row: look up from model data
    const entry = modelData?.companiesByTicker?.[row.Ticker]
    if (!entry) return []
    const v = indMeta.key === 'z_score'
      ? (entry.current_z_score ?? entry.financials?.z_score)
      : entry.financials?.[indMeta.key]
    return typeof v === 'number' && isFinite(v) ? [v * indMeta.scale] : []
  })
  const applyTransform  = v => indMeta.transform === 'cube' ? Math.cbrt(v) : indMeta.transform === 'square' ? Math.sign(v) * Math.sqrt(Math.abs(v)) : v
  const invertTransform = v => indMeta.transform === 'cube' ? v ** 3 : indMeta.transform === 'square' ? Math.sign(v) * v * v : v
  const indTransformed  = useTransform ? indRaw.map(applyTransform) : indRaw
  const indData         = useLog ? buildLogBucketsFromValues(indRaw) : buildLinearBuckets(indTransformed)
  const indSummary      = buildIndSummary(indRaw, indMeta.unit)

  const probTicks = probData.length
    ? (probLinear
        ? niceLinearTicks(probData[0].lo, probData[probData.length - 1].hi)
        : niceLogTicks(probData[0].lo, probData[probData.length - 1].hi))
    : []
  const indTicks = indData.length
    ? (useLog
        ? niceLogTicks(Math.max(indData[0].lo, 0.0001), indData[indData.length - 1].hi)
        : niceLinearTicks(indData[0].lo, indData[indData.length - 1].hi))
    : []

  const scaleType  = indMeta.log ? 'log' : indMeta.transform ? indMeta.transform : null
  const chartTitle = view === 'probability'
    ? 'Distress Probability Distribution'
    : `${indMeta.label} Distribution`

  function toggleLinear() {
    setLinearInds(prev => {
      const next = new Set(prev)
      next.has(selectedInd) ? next.delete(selectedInd) : next.add(selectedInd)
      return next
    })
  }

  return (
    <div>
      <div className="histogram-panel-header">
        <div className="hist-header-left">
          <div className="hist-title-row">
            <span className="hist-title">{chartTitle}</span>
            {view === 'probability' && (
              <button
                className={`violin-log-badge violin-log-badge--clickable${probLinear ? ' violin-log-badge--off' : ''}`}
                onClick={() => setProbLinear(p => !p)}
                title={probLinear ? 'Switch to log scale' : 'Switch to linear scale'}
              >log</button>
            )}
            {view === 'indicator' && scaleType && (
              <button
                className={`violin-log-badge violin-log-badge--clickable${isLinear ? ' violin-log-badge--off' : ''}`}
                onClick={toggleLinear}
                title={isLinear ? 'Switch to transformed scale' : 'Switch to linear scale'}
              >{scaleType}</button>
            )}
            {breadcrumb && <span className="breadcrumb-path">{breadcrumb}</span>}
          </div>
        </div>
        <div className="hist-header-right">
          <div className="hist-view-toggle">
            <button
              className={`hist-view-btn${view === 'probability' ? ' hist-view-btn--active' : ''}`}
              onClick={() => setView('probability')}
            >
              Probability
            </button>
            <button
              className={`hist-view-btn${view === 'indicator' ? ' hist-view-btn--active' : ''}`}
              onClick={() => setView('indicator')}
            >
              Indicator
            </button>
          </div>
          {view === 'indicator' && (
            <select
              className="violin-ind-select"
              value={selectedInd}
              onChange={e => setSelectedInd(e.target.value)}
            >
              {indicatorOptions.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="histogram-layout">
        <div className="histogram-chart">
          {view === 'probability' ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={probData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e0e0" />
                <XAxis
                  dataKey="mid"
                  type="number"
                  scale={probLinear ? 'auto' : 'log'}
                  domain={['dataMin', 'dataMax']}
                  ticks={probTicks}
                  tickFormatter={v => `${v}%`}
                  tick={{ fontSize: 9, fill: '#555' }}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#555' }} tickLine={false} axisLine={false} width={24} />
                <Tooltip content={<ProbTooltip />} cursor={{ fill: '#f0f4ff' }} />
                <Bar dataKey="count" fill="#2563EB" radius={[2, 2, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={indData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e0e0" />
                <XAxis
                  dataKey="mid"
                  type="number"
                  scale={useLog ? 'log' : 'auto'}
                  domain={['dataMin', 'dataMax']}
                  ticks={indTicks}
                  tickFormatter={v => fmtTick(useTransform ? invertTransform(v) : v, indMeta.unit)}
                  tick={{ fontSize: 9, fill: '#555' }}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#555' }} tickLine={false} axisLine={false} width={24} />
                <Tooltip content={<IndTooltip unit={indMeta.unit} invertTransform={useTransform ? invertTransform : v => v} />} cursor={{ fill: '#f0f4ff' }} />
                {selectedInd === 'fss_score' && <>
                  {FSS_BANDS.map(b => (
                    <ReferenceArea
                      key={b.x1}
                      x1={b.x1} x2={b.x2}
                      fill={b.fill} fillOpacity={0.04}
                      ifOverflow="hidden"
                      label={b.label ? {
                        value: b.label,
                        position: 'insideTopLeft',
                        fontSize: 9,
                        fontWeight: 600,
                        fill: b.color,
                        dy: 4,
                        dx: 4,
                      } : undefined}
                    />
                  ))}
                  {[17, 25, 31, 40].map(x => (
                    <ReferenceLine key={x} x={x} stroke="#9CA3AF" strokeWidth={1} strokeDasharray="3 3" ifOverflow="hidden" />
                  ))}
                </>}
                <Bar dataKey="count" fill="#6366F1" radius={[2, 2, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {view === 'probability' && summary && (
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

        {view === 'indicator' && indSummary && (
          <div className="histogram-stats">
            <div className="hstat-row hstat-row--primary">
              <span className="hstat-label">Avg</span>
              <span className="hstat-value hstat-value--large">{indSummary.avg}</span>
            </div>
            <div className="hstat-row">
              <span className="hstat-label">Median</span>
              <span className="hstat-value">{indSummary.median}</span>
            </div>
            <div className="hstat-divider" />
            <div className="hstat-row">
              <span className="hstat-label">25th pct</span>
              <span className="hstat-value">{indSummary.p25}</span>
            </div>
            <div className="hstat-row">
              <span className="hstat-label">75th pct</span>
              <span className="hstat-value">{indSummary.p75}</span>
            </div>
            <div className="hstat-divider" />
            <div className="hstat-row">
              <span className="hstat-label">High</span>
              <span className="hstat-value">{indSummary.high}</span>
            </div>
            <div className="hstat-row">
              <span className="hstat-label">Low</span>
              <span className="hstat-value">{indSummary.low}</span>
            </div>
            <div className="hstat-divider" />
            <div className="hstat-row">
              <span className="hstat-label">Total companies</span>
              <span className="hstat-value">{indSummary.count}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
