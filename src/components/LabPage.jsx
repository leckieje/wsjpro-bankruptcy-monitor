import { useState, useMemo } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ZAxis, Legend } from 'recharts'

const SECTOR_COLORS = [
  '#2563EB', '#DC2626', '#059669', '#7C3AED', '#EA580C',
  '#0891B2', '#D97706', '#4F46E5', '#BE185D', '#065F46',
  '#6D28D9', '#B91C1C', '#0E7490', '#92400E', '#6366F1',
  '#DB2777', '#047857', '#7C2D12', '#1D4ED8', '#991B1B',
]

const TIER_COLORS = {
  'High': '#DC2626',
  'Elevated': '#EA580C',
  'Emerging': '#D97706',
  'Low': '#059669',
  'Warning': '#DC2626',
  'Alert': '#EA580C',
  'Monitor': '#059669',
}

function getTier(prob, isFinance) {
  if (prob == null) return null
  if (isFinance) {
    if (prob >= 0.30) return 'Warning'
    if (prob >= 0.15) return 'Alert'
    return 'Monitor'
  }
  if (prob >= 0.50) return 'High'
  if (prob >= 0.30) return 'Elevated'
  if (prob >= 0.10) return 'Emerging'
  return 'Low'
}

function ScatterPlot({ monitorData, financeData }) {
  const monitorBySector = useMemo(() => {
    const sectors = {}
    monitorData.forEach(d => {
      const s = d.sector || 'Unknown'
      if (!sectors[s]) sectors[s] = []
      sectors[s].push(d)
    })
    return Object.entries(sectors).slice(0, 12)
  }, [monitorData])

  const financeByType = useMemo(() => {
    const types = {}
    financeData.forEach(d => {
      const s = d.sector || 'Other Financial'
      if (!types[s]) types[s] = []
      types[s].push(d)
    })
    return Object.entries(types)
  }, [financeData])

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="lab-tooltip">
        <strong>{d.company}</strong> ({d.ticker})
        <br />Probability: {(d.probability * 100).toFixed(1)}%
        <br />{d.zScore != null ? `Z-Score: ${d.zScore.toFixed(2)}` : `ROA: ${d.roa?.toFixed(1)}%`}
        <br />Sector: {d.sector}
      </div>
    )
  }

  return (
    <div className="lab-section">
      <h3 className="lab-section-title">Scatter: Probability vs Z-Score / ROA</h3>
      <div className="lab-split">
        <div className="lab-panel">
          <h4 className="lab-panel-title">Monitor Companies</h4>
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 40, left: 50 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" dataKey="zScore" name="Z-Score" domain={[0, 'auto']} label={{ value: 'Z-Score', position: 'bottom', offset: 20 }} />
              <YAxis type="number" dataKey="probability" name="Probability" domain={[0, 1]} tickFormatter={v => `${(v * 100).toFixed(0)}%`} label={{ value: 'Distress Probability', angle: -90, position: 'insideLeft', offset: -35 }} />
              <ReferenceLine x={1.81} stroke="#DC2626" strokeDasharray="4 4" label={{ value: 'Z=1.81', position: 'top', fill: '#DC2626', fontSize: 11 }} />
              <ReferenceLine y={0.30} stroke="#EA580C" strokeDasharray="4 4" label={{ value: '30%', position: 'right', fill: '#EA580C', fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              {monitorBySector.map(([sector, points], i) => (
                <Scatter key={sector} name={sector} data={points} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} opacity={0.7} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="lab-panel">
          <h4 className="lab-panel-title">Finance Companies</h4>
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 40, left: 50 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" dataKey="roa" name="ROA %" domain={['auto', 'auto']} label={{ value: 'ROA (%)', position: 'bottom', offset: 20 }} />
              <YAxis type="number" dataKey="probability" name="Probability" domain={[0, 1]} tickFormatter={v => `${(v * 100).toFixed(0)}%`} label={{ value: 'Distress Probability', angle: -90, position: 'insideLeft', offset: -35 }} />
              <ReferenceLine y={0.30} stroke="#DC2626" strokeDasharray="4 4" label={{ value: '30%', position: 'right', fill: '#DC2626', fontSize: 11 }} />
              <ReferenceLine y={0.15} stroke="#EA580C" strokeDasharray="4 4" label={{ value: '15%', position: 'right', fill: '#EA580C', fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              {financeByType.map(([type, points], i) => (
                <Scatter key={type} name={type} data={points} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} opacity={0.7} />
              ))}
              <Legend />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function BubbleChart({ monitorData, financeData }) {
  const monitorBubbles = useMemo(() => {
    return monitorData
      .filter(d => d.marketCap > 0)
      .map(d => ({ ...d, logCap: Math.log10(d.marketCap) }))
  }, [monitorData])

  const financeBubbles = useMemo(() => {
    return financeData
      .filter(d => d.marketCap > 0)
      .map(d => ({ ...d, logCap: Math.log10(d.marketCap) }))
  }, [financeData])

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    const capStr = d.marketCap >= 1e9
      ? `$${(d.marketCap / 1e9).toFixed(1)}B`
      : `$${(d.marketCap / 1e6).toFixed(0)}M`
    return (
      <div className="lab-tooltip">
        <strong>{d.company}</strong> ({d.ticker})
        <br />Probability: {(d.probability * 100).toFixed(1)}%
        <br />Market Cap: {capStr}
        <br />Sector: {d.sector}
        <br />Tier: {d.tier}
      </div>
    )
  }

  return (
    <div className="lab-section">
      <h3 className="lab-section-title">Bubble: Market Cap x Probability x Sector</h3>
      <div className="lab-split">
        <div className="lab-panel">
          <h4 className="lab-panel-title">Monitor Companies</h4>
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 40, left: 50 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" dataKey="probability" domain={[0, 1]} tickFormatter={v => `${(v * 100).toFixed(0)}%`} label={{ value: 'Distress Probability', position: 'bottom', offset: 20 }} />
              <YAxis type="number" dataKey="logCap" domain={['auto', 'auto']} tickFormatter={v => {
                const val = Math.pow(10, v)
                return val >= 1e9 ? `$${(val / 1e9).toFixed(0)}B` : `$${(val / 1e6).toFixed(0)}M`
              }} label={{ value: 'Market Cap (log)', angle: -90, position: 'insideLeft', offset: -35 }} />
              <ZAxis type="number" dataKey="logCap" range={[20, 400]} />
              <ReferenceLine x={0.30} stroke="#EA580C" strokeDasharray="4 4" />
              <ReferenceLine x={0.50} stroke="#DC2626" strokeDasharray="4 4" />
              <Tooltip content={<CustomTooltip />} />
              <Scatter data={monitorBubbles} opacity={0.6}>
                {monitorBubbles.map((entry, i) => (
                  <circle key={i} fill={TIER_COLORS[entry.tier] || '#6B7280'} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="lab-panel">
          <h4 className="lab-panel-title">Finance Companies</h4>
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 40, left: 50 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" dataKey="probability" domain={[0, 1]} tickFormatter={v => `${(v * 100).toFixed(0)}%`} label={{ value: 'Distress Probability', position: 'bottom', offset: 20 }} />
              <YAxis type="number" dataKey="logCap" domain={['auto', 'auto']} tickFormatter={v => {
                const val = Math.pow(10, v)
                return val >= 1e9 ? `$${(val / 1e9).toFixed(0)}B` : `$${(val / 1e6).toFixed(0)}M`
              }} label={{ value: 'Market Cap (log)', angle: -90, position: 'insideLeft', offset: -35 }} />
              <ZAxis type="number" dataKey="logCap" range={[20, 400]} />
              <ReferenceLine x={0.15} stroke="#EA580C" strokeDasharray="4 4" />
              <ReferenceLine x={0.30} stroke="#DC2626" strokeDasharray="4 4" />
              <Tooltip content={<CustomTooltip />} />
              <Scatter data={financeBubbles} opacity={0.6}>
                {financeBubbles.map((entry, i) => (
                  <circle key={i} fill={TIER_COLORS[entry.tier] || '#6B7280'} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

function HeatmapGrid({ monitorData, financeData }) {
  const MONITOR_TIERS = ['High', 'Elevated', 'Emerging', 'Low']

  const monitorGrid = useMemo(() => {
    const sectors = [...new Set(monitorData.map(d => d.sector))].filter(Boolean).sort()
    const grid = {}
    sectors.forEach(s => {
      grid[s] = { count: 0, sum: 0, tiers: {} }
      MONITOR_TIERS.forEach(t => { grid[s].tiers[t] = 0 })
    })
    monitorData.forEach(d => {
      if (!d.sector || !d.tier || !grid[d.sector]) return
      grid[d.sector].count++
      grid[d.sector].sum += d.probability || 0
      grid[d.sector].tiers[d.tier] = (grid[d.sector].tiers[d.tier] || 0) + 1
    })
    return { sectors, grid }
  }, [monitorData])

  const financeStats = useMemo(() => {
    const sectors = [...new Set(financeData.map(d => d.sector))].filter(Boolean).sort()
    const stats = {}
    sectors.forEach(s => { stats[s] = { count: 0, sum: 0, max: 0, warning: 0, alert: 0 } })
    financeData.forEach(d => {
      if (!d.sector || !stats[d.sector]) return
      stats[d.sector].count++
      stats[d.sector].sum += d.probability || 0
      if (d.probability > stats[d.sector].max) stats[d.sector].max = d.probability
      if (d.probability >= 0.30) stats[d.sector].warning++
      else if (d.probability >= 0.15) stats[d.sector].alert++
    })
    return { sectors, stats }
  }, [financeData])

  function intensityColor(value, max) {
    if (value === 0 || max === 0) return '#F9FAFB'
    const intensity = Math.min(value / max, 1)
    const r = Math.round(255 - intensity * 36)
    const g = Math.round(255 - intensity * 200)
    const b = Math.round(255 - intensity * 217)
    return `rgb(${r},${g},${b})`
  }

  const maxMonitorCount = Math.max(...monitorGrid.sectors.map(s => monitorGrid.grid[s]?.count || 0), 1)

  return (
    <div className="lab-section">
      <h3 className="lab-section-title">Heatmap: Sector Risk Concentration</h3>
      <div className="lab-split">
        <div className="lab-panel">
          <h4 className="lab-panel-title">Monitor — Tier Distribution by Sector</h4>
          <div className="heatmap-container">
            <table className="heatmap-table">
              <thead>
                <tr>
                  <th className="heatmap-corner">Sector</th>
                  <th className="heatmap-header">Count</th>
                  <th className="heatmap-header">Avg Prob</th>
                  {MONITOR_TIERS.map(t => <th key={t} className="heatmap-header">{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {monitorGrid.sectors.map(s => {
                  const row = monitorGrid.grid[s]
                  const avg = row.count > 0 ? row.sum / row.count : 0
                  return (
                    <tr key={s}>
                      <td className="heatmap-label">{s}</td>
                      <td className="heatmap-cell" style={{ backgroundColor: intensityColor(row.count, maxMonitorCount) }}>{row.count}</td>
                      <td className="heatmap-cell" style={{ backgroundColor: intensityColor(avg, 0.5) }}>{(avg * 100).toFixed(1)}%</td>
                      {MONITOR_TIERS.map(t => {
                        const count = row.tiers[t] || 0
                        const pct = row.count > 0 ? count / row.count : 0
                        return (
                          <td key={t} className="heatmap-cell" style={{ backgroundColor: intensityColor(pct, 0.3) }}>
                            {count > 0 ? `${count} (${(pct * 100).toFixed(0)}%)` : ''}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="lab-panel">
          <h4 className="lab-panel-title">Finance — Risk Concentration by Sector</h4>
          <div className="heatmap-container">
            <table className="heatmap-table">
              <thead>
                <tr>
                  <th className="heatmap-corner">Sector</th>
                  <th className="heatmap-header">Count</th>
                  <th className="heatmap-header">Avg Prob</th>
                  <th className="heatmap-header">% Warning</th>
                  <th className="heatmap-header">% Alert</th>
                  <th className="heatmap-header">Highest</th>
                </tr>
              </thead>
              <tbody>
                {financeStats.sectors.map(s => {
                  const st = financeStats.stats[s]
                  const avg = st.count > 0 ? st.sum / st.count : 0
                  const pctWarning = st.count > 0 ? st.warning / st.count : 0
                  const pctAlert = st.count > 0 ? st.alert / st.count : 0
                  return (
                    <tr key={s}>
                      <td className="heatmap-label">{s}</td>
                      <td className="heatmap-cell">{st.count}</td>
                      <td className="heatmap-cell" style={{ backgroundColor: intensityColor(avg, 0.3) }}>{(avg * 100).toFixed(1)}%</td>
                      <td className="heatmap-cell" style={{ backgroundColor: intensityColor(pctWarning, 0.25) }}>{(pctWarning * 100).toFixed(0)}%</td>
                      <td className="heatmap-cell" style={{ backgroundColor: intensityColor(pctAlert, 0.30) }}>{(pctAlert * 100).toFixed(0)}%</td>
                      <td className="heatmap-cell" style={{ backgroundColor: intensityColor(st.max, 0.7) }}>{(st.max * 100).toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function pearsonR(xs, ys) {
  const pairs = []
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] != null && ys[i] != null && isFinite(xs[i]) && isFinite(ys[i])) {
      pairs.push([xs[i], ys[i]])
    }
  }
  if (pairs.length < 5) return null
  const n = pairs.length
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n
  const my = pairs.reduce((s, p) => s + p[1], 0) / n
  let num = 0, dx = 0, dy = 0
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my)
    dx += (x - mx) ** 2
    dy += (y - my) ** 2
  }
  const denom = Math.sqrt(dx) * Math.sqrt(dy)
  return denom === 0 ? null : num / denom
}

function corrColor(r) {
  if (r == null) return '#F9FAFB'
  const abs = Math.min(Math.abs(r), 1)
  const intensity = abs
  if (r > 0) {
    return `rgba(220, 38, 38, ${intensity * 0.6})`
  }
  return `rgba(37, 99, 235, ${intensity * 0.6})`
}

function CorrelationMatrix({ monitorRows, financeRows, modelData }) {
  const MONITOR_INDICATORS = [
    { key: 'Z-Score', label: 'Z-Score' },
    { key: 'Quick Ratio', label: 'Quick Ratio' },
    { key: 'Debt to EBITDA', label: 'Debt/EBITDA' },
    { key: 'Receivables to Revenue', label: 'Recv/Rev' },
    { key: 'FSS Score', label: 'FSS Score' },
    { key: 'FSS Weekly Change', label: 'FSS Change' },
    { key: 'Market Capitalization', label: 'Market Cap' },
  ]

  const FINANCE_INDICATORS = [
    { key: 'ROA', label: 'ROA' },
    { key: 'Int. Coverage', label: 'Int. Coverage' },
    { key: 'Debt/Assets', label: 'Debt/Assets' },
    { key: 'NPL Ratio', label: 'NPL Ratio' },
    { key: 'Combined Ratio', label: 'Combined Ratio' },
    { key: 'Quick Ratio', label: 'Quick Ratio' },
    { key: 'Debt/EBITDA', label: 'Debt/EBITDA' },
  ]

  const monitorMatrix = useMemo(() => {
    if (!monitorRows || !modelData) return null
    const rows = monitorRows.filter(r => {
      const entry = modelData.companiesByTicker?.[r.Ticker]
      return entry && !entry.sector_excluded && !entry.in_distress && !entry.insufficient_data
    })
    const indicators = [...MONITOR_INDICATORS, { key: '_prob', label: 'Probability' }]
    const values = {}
    indicators.forEach(ind => {
      if (ind.key === '_prob') {
        values[ind.key] = rows.map(r => {
          const entry = modelData.companiesByTicker?.[r.Ticker]
          const hist = entry?.history || []
          return hist.length > 0 ? hist[hist.length - 1].probability : null
        })
      } else {
        values[ind.key] = rows.map(r => {
          const v = r[ind.key]
          return typeof v === 'number' ? v : null
        })
      }
    })
    const matrix = []
    for (const row of indicators) {
      const matRow = []
      for (const col of indicators) {
        matRow.push(pearsonR(values[row.key], values[col.key]))
      }
      matrix.push(matRow)
    }
    return { indicators, matrix }
  }, [monitorRows, modelData])

  const financeMatrix = useMemo(() => {
    if (!financeRows) return null
    const rows = financeRows.filter(r => r._score != null)
    const indicators = [...FINANCE_INDICATORS, { key: '_prob', label: 'Probability' }]
    const values = {}
    indicators.forEach(ind => {
      if (ind.key === '_prob') {
        values[ind.key] = rows.map(r => r._score != null ? r._score / 100 : null)
      } else {
        values[ind.key] = rows.map(r => {
          const v = r[ind.key]
          return typeof v === 'number' ? v : null
        })
      }
    })
    const matrix = []
    for (const row of indicators) {
      const matRow = []
      for (const col of indicators) {
        matRow.push(pearsonR(values[row.key], values[col.key]))
      }
      matrix.push(matRow)
    }
    return { indicators, matrix }
  }, [financeRows])

  function renderMatrix(data, title) {
    if (!data) return null
    const { indicators, matrix } = data
    return (
      <div className="lab-panel">
        <h4 className="lab-panel-title">{title}</h4>
        <div className="heatmap-container">
          <table className="corr-table">
            <thead>
              <tr>
                <th className="corr-corner"></th>
                {indicators.map(ind => (
                  <th key={ind.key} className="corr-header">{ind.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {indicators.map((row, ri) => (
                <tr key={row.key}>
                  <td className="corr-label">{row.label}</td>
                  {matrix[ri].map((r, ci) => (
                    <td key={ci} className="corr-cell" style={{ backgroundColor: corrColor(ri === ci ? null : r) }}>
                      {ri === ci ? '—' : (r != null ? r.toFixed(2) : '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="lab-section">
      <h3 className="lab-section-title">Correlation Matrix: Indicator Independence</h3>
      <p className="lab-section-desc">
        Values near zero confirm indicators provide independent signals. Red = positive correlation, blue = negative.
        The "Probability" row shows each indicator's linear relationship with the model output.
      </p>
      <div className="lab-split">
        {renderMatrix(monitorMatrix, 'Monitor Indicators')}
        {renderMatrix(financeMatrix, 'Finance Indicators')}
      </div>
    </div>
  )
}

export default function LabPage({ monitorRows, financeRows, modelData }) {
  const monitorData = useMemo(() => {
    if (!monitorRows || !modelData) return []
    return monitorRows
      .map(row => {
        const entry = modelData.companiesByTicker?.[row.Ticker]
        if (!entry) return null
        const hist = entry.history || []
        const prob = hist.length > 0 ? hist[hist.length - 1].probability : null
        if (prob == null) return null
        return {
          company: row.Company,
          ticker: row.Ticker,
          sector: row.Sector || 'Unknown',
          probability: prob,
          zScore: entry.current_z_score ?? null,
          marketCap: row['Market Capitalization'] || 0,
          tier: getTier(prob, false),
        }
      })
      .filter(d => d && d.probability != null)
  }, [monitorRows, modelData])

  const financeData = useMemo(() => {
    if (!financeRows || !modelData) return []
    return financeRows
      .map(row => {
        const prob = row._score != null ? row._score / 100 : null
        if (prob == null) return null
        return {
          company: row.Company,
          ticker: row.Ticker,
          sector: row.Sector || 'Other Financial',
          probability: prob,
          roa: row['ROA'] ?? null,
          marketCap: row['Market Cap'] || 0,
          tier: getTier(prob, true),
        }
      })
      .filter(d => d && d.probability != null)
  }, [financeRows, modelData])

  return (
    <div className="lab-page">
      <div className="methodology-text">
        <h3 className="methodology-title">
          <span className="methodology-title-badge">Lab</span>
          Visualization Experiments
        </h3>
        <p>
          Experimental chart views for exploring risk distribution patterns across the Monitor
          and Finance company populations. These visualizations are under development.
        </p>
      </div>

      <ScatterPlot monitorData={monitorData} financeData={financeData} />
      <BubbleChart monitorData={monitorData} financeData={financeData} />
      <HeatmapGrid monitorData={monitorData} financeData={financeData} />
      <CorrelationMatrix monitorRows={monitorRows} financeRows={financeRows} modelData={modelData} />
    </div>
  )
}
