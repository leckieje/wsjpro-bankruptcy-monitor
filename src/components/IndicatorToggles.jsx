export const INDICATOR_LABELS = {
  z_score: 'Z-Score',
  quick_ratio: 'Quick Ratio',
  ebit_ta: 'EBIT / Assets',
  debt_ebitda: 'Debt / EBITDA',
  tl_ta: 'Liabilities / Assets',
  fss_score: 'Sentiment',
}

export const INDICATOR_COLORS = {
  z_score: '#2563EB',
  quick_ratio: '#0891B2',
  ebit_ta: '#7C3AED',
  debt_ebitda: '#DC2626',
  tl_ta: '#EA580C',
  fss_score: '#059669',
}

const CATEGORY_ORDER = ['Solvency', 'Liquidity', 'Profitability', 'Leverage', 'Sentiment']

const INDICATOR_CATEGORIES = {
  z_score:     'Solvency',
  quick_ratio: 'Liquidity',
  ebit_ta:     'Profitability',
  debt_ebitda: 'Leverage',
  tl_ta:       'Leverage',
  fss_score:   'Sentiment',
}

export default function IndicatorToggles({ indicatorOrder, enabledIndicators, onToggle, onReset, isAllOn }) {
  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const inds = indicatorOrder.filter(ind => INDICATOR_CATEGORIES[ind] === cat)
    if (inds.length) acc.push({ cat, inds })
    return acc
  }, [])

  return (
    <div className="indicator-toggles">
      <div className="chart-title" style={{ marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Model Indicators</span>
        {!isAllOn && (
          <button className="indicator-toggles-reset" onClick={onReset}>Reset</button>
        )}
      </div>
      <div className="indicator-radio-grid">
        {grouped.map(({ cat, inds }) => (
          <div key={cat} className="indicator-radio-group">
            <div className="indicator-radio-inline">
              <div className="indicator-radio-group-heading">{cat}</div>
              <label className={`indicator-radio ${enabledIndicators.includes(inds[0]) ? 'indicator-radio--on' : 'indicator-radio--off'}`}>
                <input type="checkbox" checked={enabledIndicators.includes(inds[0])} onChange={() => onToggle(inds[0])} />
                <span className="indicator-radio-name">{INDICATOR_LABELS[inds[0]]}</span>
                <span className="indicator-radio-dot" />
              </label>
            </div>
            {inds.slice(1).map(ind => {
              const on = enabledIndicators.includes(ind)
              return (
                <label key={ind} className={`indicator-radio indicator-radio--continuation ${on ? 'indicator-radio--on' : 'indicator-radio--off'}`}>
                  <input type="checkbox" checked={on} onChange={() => onToggle(ind)} />
                  <span className="indicator-radio-name">{INDICATOR_LABELS[ind]}</span>
                  <span className="indicator-radio-dot" />
                </label>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
