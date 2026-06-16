import TaxonomyFilter from './TaxonomyFilter.jsx'
import ScoreHistogram, { FINANCE_INDICATOR_OPTIONS } from './ScoreHistogram.jsx'
import IndustryChart from './IndustryChart.jsx'
import ResultsTable from './ResultsTable.jsx'

const EXCLUDED_SECTOR_KEYWORDS = ['bank', 'saving', 'insur', 'reit', 'mortgage', 'trust', 'investment']
export function isExcludedSector(industry) {
  if (!industry) return false
  const lower = industry.toLowerCase()
  return EXCLUDED_SECTOR_KEYWORDS.some(k => lower.includes(k))
}

export const FINANCE_TIER_THRESHOLDS = {
  high: 0.30, elevated: 0.15,
  highLabel: 'Warning', elevatedLabel: 'Alert', lowLabel: 'Monitor',
}

const FINANCE_SIGNAL_GROUPS = [
  {
    cat: 'Profitability',
    signals: [
      { key: 'roa',               label: 'Return on Assets (ROA)',     note: 'All sectors' },
    ],
  },
  {
    cat: 'Debt Service',
    signals: [
      { key: 'interest_coverage', label: 'Interest Coverage',          note: 'All sectors' },
      { key: 'debt_assets',       label: 'Debt / Assets',              note: 'All sectors' },
    ],
  },
  {
    cat: 'Sector-Specific',
    signals: [
      { key: 'npl_ratio',         label: 'NPL Ratio',                  note: 'Banks' },
      { key: 'combined_ratio',    label: 'Combined Ratio',             note: 'Insurance' },
    ],
  },
]

function FinanceIndicatorPanel() {
  return (
    <div className="indicator-toggles">
      <div className="chart-title" style={{ marginBottom: 6 }}>
        <span>Sector Model Signals</span>
      </div>
      <div className="indicator-radio-grid">
        {FINANCE_SIGNAL_GROUPS.map(({ cat, signals }) => (
          <div key={cat} className="indicator-radio-group">
            <div className="indicator-radio-inline">
              <div className="indicator-radio-group-heading">{cat}</div>
              <div className="indicator-radio indicator-radio--on">
                <span className="indicator-radio-name">{signals[0].label}</span>
                <span className="indicator-radio-note">{signals[0].note}</span>
                <span className="indicator-radio-dot" />
              </div>
            </div>
            {signals.slice(1).map(s => (
              <div key={s.key} className="indicator-radio indicator-radio--continuation indicator-radio--on">
                <span className="indicator-radio-name">{s.label}</span>
                <span className="indicator-radio-note">{s.note}</span>
                <span className="indicator-radio-dot" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ExcludedSectorsPage({
  modelData, onRowClick,
  allRows, filteredRows, displayColumns,
  filters, onFiltersChange,
  sortCol, sortDir, onSortChange,
}) {
  if (!allRows) return null

  const nScored = allRows.filter(r => r._score != null).length
  const nWarning = allRows.filter(r => r._tier === 'Warning').length
  const nAlert = allRows.filter(r => r._tier === 'Alert').length

  return (
    <>
      <div className="methodology-text">
        <h3 className="methodology-title">
          <span className="methodology-title-badge">WSJ Pro</span>
          Finance Sector Monitor
        </h3>
        <p>
          Financial institutions are scored by a dedicated sector-specific model (XGBoost + Random Forest,
          AUC 0.884) using domain-appropriate distress definitions. Banks, insurers, REITs, and other
          financial companies have tailored thresholds calibrated to their unique balance sheet structures.
          Risk tiers: <strong style={{ color: '#c0392b' }}>Warning ≥30%</strong>,{' '}
          <strong style={{ color: '#e67e22' }}>Alert ≥15%</strong>,{' '}
          <strong style={{ color: '#27ae60' }}>Monitor &lt;15%</strong>.
        </p>
        <p>
          {nScored} companies scored — {nWarning} Warning, {nAlert} Alert,{' '}
          {nScored - nWarning - nAlert} Monitor. Click any row for the full detail view.
        </p>
      </div>

      <div className="controls-card controls-row">
        <TaxonomyFilter
          rows={allRows}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      </div>

      <div className="charts-row">
        <div className="chart-card chart-card--toggles">
          <FinanceIndicatorPanel />
        </div>
        <div className="chart-card">
          <ScoreHistogram
            scoredRows={filteredRows}
            filters={filters}
            modelData={modelData}
            indicatorOptions={FINANCE_INDICATOR_OPTIONS}
          />
        </div>
      </div>

      <div className="chart-card">
        <IndustryChart
          scoredRows={filteredRows}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      </div>

      <div className="table-card">
        <ResultsTable
          rows={allRows}
          displayColumns={displayColumns}
          scoredRows={filteredRows}
          filters={filters}
          modelData={modelData}
          onRowClick={onRowClick}
          sortCol={sortCol}
          sortDir={sortDir}
          onSortChange={onSortChange}
          tierThresholds={FINANCE_TIER_THRESHOLDS}
        />
      </div>
    </>
  )
}
