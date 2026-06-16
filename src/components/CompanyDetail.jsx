import { useEffect, useState } from 'react'
import ForecastChart from './ForecastChart.jsx'
import DataTable from './DataTable.jsx'
import IndicatorToggles, { INDICATOR_LABELS, INDICATOR_COLORS } from './IndicatorToggles.jsx'
import { buildChartData } from '../utils/buildChartData.js'
import { getCompanyData, getToggleProbability, getIndicatorOrder, buildToggleKey } from '../utils/loadForecastData.js'

function getProbabilityColor(p) {
  if (p == null) return '#999'
  if (p >= 0.5) return '#DC2626'
  if (p >= 0.3) return '#B45309'
  if (p >= 0.1) return '#CA8A04'
  return '#16A34A'
}

function getInterpretationLabel(p, slope) {
  if (p == null) return ''
  let label = ''
  if (p < 0.1) label = 'Low risk — no signs of deterioration'
  else if (p < 0.3) label = 'Emerging risk — probability trending upward'
  else if (p < 0.5) label = 'Elevated risk — monitor closely'
  else label = 'High risk — significant probability of entering distress'

  if (slope != null) {
    if (slope > 0.05) label += ' · Rapidly deteriorating'
    else if (slope < -0.05) label += ' · Improving'
  }
  return label
}

function computeSlope(history) {
  if (!history || history.length < 2) return null
  const last = history[history.length - 1].probability
  const prev = history[history.length - 2].probability
  return last - prev
}

export default function CompanyDetail({ company, modelData, onClose, enabledIndicators: globalEnabled, onToggle: onGlobalToggle, onReset: onGlobalReset }) {
  const ticker = company?.Ticker
  const companyCode = company?.CompanyCode || company?.company_code
  const md = getCompanyData(modelData, companyCode) || getCompanyData(modelData, ticker)

  const indicatorOrder = getIndicatorOrder(modelData)

  // Use global toggles if provided, otherwise fall back to local state
  const [localEnabled, setLocalEnabled] = useState(indicatorOrder)
  const enabledIndicators = globalEnabled ?? localEnabled

  function handleToggle(ind) {
    if (onGlobalToggle) { onGlobalToggle(ind); return }
    setLocalEnabled(prev => {
      if (prev.includes(ind)) { if (prev.length <= 1) return prev; return prev.filter(i => i !== ind) }
      return [...prev, ind]
    })
  }

  function handleReset() {
    if (onGlobalReset) { onGlobalReset(); return }
    setLocalEnabled(indicatorOrder)
  }

  const toggleKey = buildToggleKey(enabledIndicators, indicatorOrder)
  const allOnKey = buildToggleKey(indicatorOrder, indicatorOrder)
  const isAllOn = toggleKey === allOnKey

  const currentProbability = isAllOn
    ? (md?.history?.length > 0 ? md.history[md.history.length - 1].probability : null)
    : getToggleProbability(md, toggleKey)

  const inDistress = md?.in_distress || false
  const insufficientData = md?.insufficient_data || false
  const sectorModel = md?.sector_model || null
  const sectorExcluded = md?.sector_excluded || false
  const accelerationFlag = md?.acceleration_flag || false

  const slope = computeSlope(md?.history)
  const changeFromLast = slope != null ? slope * 100 : null

  const chartData = buildChartData(md)

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  if (!company) return null

  return (
    <div className="company-detail-overlay" onClick={onClose}>
      <div className="company-detail-card" onClick={(e) => e.stopPropagation()}>
        <button className="company-detail-close" onClick={onClose}>×</button>

        <div className="company-detail-header">
          <h2>{company.Company}</h2>
          <div className="company-detail-meta">
            {ticker && <span className="detail-ticker">{ticker}</span>}
            {company.Industry && <span className="detail-industry">{company.Industry}</span>}
            {inDistress && (
              <span className="detail-tier detail-tier-distress">In Distress</span>
            )}
          </div>
        </div>

        {sectorExcluded && sectorModel ? (
          <SectorProbabilityHero sectorModel={sectorModel} md={md} />
        ) : inDistress ? (
          <div className="distress-banner">
            <div className="distress-banner-icon">⚠</div>
            <div className="distress-banner-text">
              <strong>Currently in Distress Zone</strong>
              <span>Z-Score: {md?.current_z_score?.toFixed(2) ?? '—'} (threshold: 1.81)</span>
            </div>
          </div>
        ) : insufficientData ? (
          <div className="probability-hero">
            <div className="probability-value" style={{ color: '#999' }}>—</div>
            <div className="probability-subtitle">Insufficient data for prediction</div>
          </div>
        ) : (
          <div className="probability-hero">
            <div className="probability-value" style={{ color: getProbabilityColor(currentProbability) }}>
              {currentProbability != null ? `${(currentProbability * 100).toFixed(1)}%` : '—'}
            </div>
            <div className="probability-label">Distress Probability</div>
            {changeFromLast != null && isAllOn && (
              <div className={`probability-change ${changeFromLast >= 0 ? 'change-up' : 'change-down'}`}>
                {changeFromLast >= 0 ? '▲' : '▼'} {Math.abs(changeFromLast).toFixed(1)}% from last quarter
              </div>
            )}
            {accelerationFlag && (
              <div className="acceleration-banner">
                Rapid Deterioration — probability jumped {changeFromLast != null ? `+${changeFromLast.toFixed(0)}pp` : '≥10pp'} in one quarter
              </div>
            )}
            <div className="probability-interpretation">
              {getInterpretationLabel(currentProbability, slope)}
            </div>
          </div>
        )}

        {!inDistress && !insufficientData && !sectorExcluded && md?.shap && (
          <BreakdownBar shap={md.shap} enabledIndicators={enabledIndicators} indicatorOrder={indicatorOrder} />
        )}

        {sectorExcluded && md?.sector_metrics && (
          <SectorMetrics metrics={md.sector_metrics} sector={sectorModel?.sector} />
        )}

        <ForecastChart data={chartData} inDistress={inDistress} />

        {!inDistress && !insufficientData && !sectorExcluded && md?.toggle_states && Object.keys(md.toggle_states).length > 0 && (
          <IndicatorToggles
            indicatorOrder={indicatorOrder}
            enabledIndicators={enabledIndicators}
            onToggle={handleToggle}
            onReset={handleReset}
            isAllOn={isAllOn}
          />
        )}


        <DataTable financials={md?.financials ? { ...md.financials, z_score: md.financials.z_score ?? md.current_z_score } : null} />
      </div>
    </div>
  )
}

function SectorProbabilityHero({ sectorModel, md }) {
  const hist = md?.history || []
  const latestProb = hist.length > 0 ? hist[hist.length - 1].probability : sectorModel.probability
  const prevProb = hist.length > 1 ? hist[hist.length - 2].probability : null
  const sectorChange = prevProb != null ? (latestProb - prevProb) * 100 : null
  const sectorLabel = sectorModel.sector === 'bank' ? 'bank' : sectorModel.sector === 'insurance' ? 'insurance' : sectorModel.sector === 'reit' ? 'REIT' : 'financial'

  return (
    <div className="probability-hero">
      <div className="probability-value" style={{ color: getProbabilityColor(latestProb) }}>
        {(latestProb * 100).toFixed(1)}%
      </div>
      <div className="probability-label">Sector Distress Probability</div>
      {sectorChange != null && (
        <div className={`probability-change ${sectorChange >= 0 ? 'change-up' : 'change-down'}`}>
          {sectorChange >= 0 ? '▲' : '▼'} {Math.abs(sectorChange).toFixed(1)}% from last quarter
        </div>
      )}
      <div className="probability-interpretation">
        {latestProb >= 0.30 ? 'High sector-specific distress risk' :
         latestProb >= 0.15 ? 'Elevated sector-specific risk — monitor' :
         'Low sector-specific risk'}
        {' · '}Scored by {sectorLabel} model
      </div>
      <div className="sector-model-note" style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
        Z-Score ({md?.current_z_score?.toFixed(2) ?? '—'}) is structurally inapplicable for this sector.
        Probability above uses sector-appropriate distress definitions.
      </div>
    </div>
  )
}

function SectorMetrics({ metrics, sector }) {
  if (!metrics) return null
  const items = []

  if (sector === 'bank' || !sector) {
    if (metrics.npl_ratio != null) items.push({ label: 'NPL Ratio', value: (metrics.npl_ratio * 100).toFixed(2) + '%', warn: metrics.npl_ratio > 0.05 })
    if (metrics.texas_ratio_proxy != null) items.push({ label: 'Texas Ratio', value: (metrics.texas_ratio_proxy * 100).toFixed(1) + '%', warn: metrics.texas_ratio_proxy > 1.0 })
  }
  if (metrics.roa != null) items.push({ label: 'ROA', value: (metrics.roa * 100).toFixed(2) + '%', warn: metrics.roa < -0.005 })
  if (metrics.interest_coverage != null) items.push({ label: 'Interest Coverage', value: metrics.interest_coverage.toFixed(1) + 'x', warn: metrics.interest_coverage < 1.5 })
  if (metrics.debt_assets != null) items.push({ label: 'Debt / Assets', value: (metrics.debt_assets * 100).toFixed(1) + '%', warn: metrics.debt_assets > 0.65 })
  if (sector === 'insurance' && metrics.combined_ratio != null) {
    items.push({ label: 'Combined Ratio', value: metrics.combined_ratio.toFixed(1) + '%', warn: metrics.combined_ratio > 120 })
  }

  if (items.length === 0) return null

  return (
    <div className="sector-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', margin: '1rem 0' }}>
      {items.map(item => (
        <div key={item.label} style={{ padding: '0.5rem 0.75rem', background: item.warn ? 'rgba(192,57,43,0.06)' : '#f8f9fa', borderRadius: '6px', borderLeft: item.warn ? '3px solid #c0392b' : '3px solid #27ae60' }}>
          <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase' }}>{item.label}</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: item.warn ? '#c0392b' : '#2c3e50' }}>{item.value}</div>
        </div>
      ))}
    </div>
  )
}

function BreakdownBar({ shap, enabledIndicators, indicatorOrder }) {
  const contributions = indicatorOrder
    .filter(ind => enabledIndicators.includes(ind))
    .map(ind => ({
      key: ind,
      label: INDICATOR_LABELS[ind],
      color: INDICATOR_COLORS[ind],
      value: shap[ind] || 0,
    }))

  const totalAbs = contributions.reduce((sum, c) => sum + Math.abs(c.value), 0)
  if (totalAbs === 0) return null

  return (
    <div className="breakdown-bar-container">
      <div className="breakdown-bar-label">What's driving the probability:</div>
      <div className="breakdown-bar">
        {contributions.map(c => {
          const width = (Math.abs(c.value) / totalAbs) * 100
          if (width < 2) return null
          return (
            <div
              key={c.key}
              className="breakdown-segment"
              style={{ width: `${width}%`, backgroundColor: c.color }}
              title={`${c.label}: ${(c.value * 100).toFixed(1)}pp`}
            />
          )
        })}
      </div>
      <div className="breakdown-legend">
        {contributions.filter(c => (Math.abs(c.value) / totalAbs) * 100 >= 2).map(c => (
          <span key={c.key} className="breakdown-legend-item">
            <span className="breakdown-dot" style={{ backgroundColor: c.color }} />
            {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}


