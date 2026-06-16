import { useState } from 'react'

const CATEGORIES = [
  {
    key: 'composite',
    label: 'Composite Score',
    fields: [
      { key: 'z_score', label: 'Altman Z-Score', format: 'decimal2', active: true, statusFn: zScoreStatus },
    ],
  },
  {
    key: 'liquidity',
    label: 'Liquidity',
    fields: [
      { key: 'quick_ratio', label: 'Quick Ratio', format: 'decimal2', active: true, statusFn: (v) => v != null && v < 1.0 ? 'Low' : null },
      { key: 'current_ratio', label: 'Current Ratio', format: 'decimal2' },
      { key: 'working_capital', label: 'Working Capital', format: 'dollars' },
      { key: 'cash_equiv', label: 'Cash & Equivalents', format: 'dollars' },
    ],
  },
  {
    key: 'leverage',
    label: 'Leverage',
    fields: [
      { key: 'debt_ebitda', label: 'Debt / EBITDA', format: 'ratio', active: true, statusFn: (v) => v != null && v > 5 ? 'High' : null },
      { key: 'tl_ta', label: 'Liabilities / Assets', format: 'percent', active: true },
      { key: 'interest_coverage', label: 'Interest Coverage', format: 'ratio', statusFn: (v) => v != null && v < 1.5 ? 'Critical' : null },
      { key: 'total_debt', label: 'Total Debt', format: 'dollars' },
      { key: 'total_liabilities', label: 'Total Liabilities', format: 'dollars' },
      { key: 'current_liabilities', label: 'Current Liabilities', format: 'dollars' },
      { key: 'interest_expense', label: 'Interest Expense', format: 'dollars' },
      { key: 'total_equity', label: 'Total Equity', format: 'dollars' },
    ],
  },
  {
    key: 'profitability',
    label: 'Profitability',
    fields: [
      { key: 'ebit_ta', label: 'EBIT / Assets', format: 'percent', active: true, statusFn: (v) => v != null && v < 0 ? 'Negative' : null },
      { key: 'ebitda', label: 'EBITDA', format: 'dollars' },
      { key: 'ebit', label: 'EBIT', format: 'dollars' },
      { key: 'gross_profit', label: 'Gross Profit', format: 'dollars' },
      { key: 'net_income', label: 'Net Income', format: 'dollars' },
      { key: 'operating_income', label: 'Operating Income', format: 'dollars' },
      { key: 'retained_earnings', label: 'Retained Earnings', format: 'dollars' },
    ],
  },
  {
    key: 'cashflow',
    label: 'Cash Flow',
    fields: [
      { key: 'cf_operations', label: 'Net CF from Operations', format: 'dollars' },
      { key: 'cf_tl', label: 'Cash Flow / Liabilities', format: 'percent' },
    ],
  },
  {
    key: 'efficiency',
    label: 'Efficiency',
    fields: [
      { key: 'sales_ta', label: 'Asset Turnover', format: 'ratio' },
      { key: 'recv_revenue', label: 'Receivables / Revenue', format: 'percent' },
      { key: 'total_revenue', label: 'Total Revenue', format: 'dollars' },
      { key: 'accounts_receivable', label: 'Accounts Receivable', format: 'dollars' },
      { key: 'total_receivables', label: 'Total Receivables', format: 'dollars' },
    ],
  },
  {
    key: 'sentiment',
    label: 'Sentiment',
    fields: [
      { key: 'fss_score', label: 'Sentiment Score', format: 'score100', active: true },
      { key: 'fss_max', label: 'Sentiment (Peak Negative)', format: 'score100' },
      { key: 'fss_weekly_change', label: 'Sentiment Trend', format: 'decimal2' },
      { key: 'fss_articles', label: 'Total Articles', format: 'integer' },
      { key: 'fss_negative', label: 'Negative Articles', format: 'integer' },
      { key: 'fss_positive', label: 'Positive Articles', format: 'integer' },
    ],
  },
  {
    key: 'market',
    label: 'Market',
    fields: [
      { key: 'market_cap', label: 'Market Cap', format: 'dollars_raw' },
      { key: 'price_high', label: 'Price (Quarter High)', format: 'price' },
      { key: 'price_low', label: 'Price (Quarter Low)', format: 'price' },
      { key: 'price_open', label: 'Price (Quarter Open)', format: 'price' },
    ],
  },
  {
    key: 'size',
    label: 'Size',
    fields: [
      { key: 'total_assets', label: 'Total Assets', format: 'dollars' },
      { key: 'current_assets', label: 'Current Assets', format: 'dollars' },
      { key: 'employees', label: 'Employees', format: 'integer' },
    ],
  },
]

function zScoreStatus(v) {
  if (v == null) return null
  if (v <= 1.81) return 'Distress'
  if (v <= 2.99) return 'Gray Zone'
  return 'Safe'
}

function formatValue(value, format) {
  if (value == null || (typeof value === 'number' && !isFinite(value))) return '—'

  switch (format) {
    case 'decimal2':
      return value.toFixed(2)
    case 'percent':
      return `${(value * 100).toFixed(1)}%`
    case 'ratio':
      return `${value.toFixed(1)}x`
    case 'integer':
      return Math.round(value).toLocaleString()
    case 'score100':
      return Math.round(value * 100)
    case 'price':
      return `$${value.toFixed(2)}`
    case 'dollars': {
      // Values from LSEG are in millions
      const abs = Math.abs(value)
      if (abs >= 1000) {
        const formatted = `$${(abs / 1000).toFixed(1)}B`
        return value < 0 ? `(${formatted})` : formatted
      }
      const formatted = `$${abs.toFixed(1)}M`
      return value < 0 ? `(${formatted})` : formatted
    }
    case 'dollars_raw': {
      // market_cap is in raw dollars
      const abs = Math.abs(value)
      if (abs >= 1e9) {
        const formatted = `$${(abs / 1e9).toFixed(1)}B`
        return value < 0 ? `(${formatted})` : formatted
      }
      const formatted = `$${(abs / 1e6).toFixed(0)}M`
      return value < 0 ? `(${formatted})` : formatted
    }
    default:
      return String(value)
  }
}

function getStatusClass(status) {
  if (!status) return ''
  if (status === 'Distress' || status === 'Critical' || status === 'Negative' || status === 'High' || status === 'Low')
    return 'status-danger'
  if (status === 'Gray Zone')
    return 'status-warning'
  if (status === 'Safe')
    return 'status-safe'
  return ''
}

export default function DataTable({ financials }) {
  const [expandedSections, setExpandedSections] = useState(new Set(['composite']))

  if (!financials) return null

  function toggleSection(key) {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function expandAll() {
    setExpandedSections(new Set(CATEGORIES.map(c => c.key)))
  }

  function collapseAll() {
    setExpandedSections(new Set())
  }

  return (
    <div className="data-table">
      <div className="data-table-header">
        <h3>Financial Data</h3>
        <div className="data-table-actions">
          <button className="data-table-action" onClick={expandAll}>Expand All</button>
          <button className="data-table-action" onClick={collapseAll}>Collapse All</button>
        </div>
      </div>

      {CATEGORIES.map(category => {
        const activeCount = category.fields.filter(f => f.active).length
        const totalCount = category.fields.length
        const hasData = category.fields.some(f => financials[f.key] != null)
        if (!hasData) return null

        const isExpanded = expandedSections.has(category.key)

        return (
          <div key={category.key} className="data-table-section">
            <button
              className="data-table-section-header"
              onClick={() => toggleSection(category.key)}
            >
              <span className="section-chevron">{isExpanded ? '▾' : '▸'}</span>
              <span className="section-label">{category.label}</span>
              {activeCount > 0 && (
                <span className="section-badge">{activeCount} active</span>
              )}
              <span className="section-count">{totalCount} fields</span>
            </button>

            {isExpanded && (
              <div className="data-table-rows">
                {category.fields.map(field => {
                  const value = financials[field.key]
                  if (value == null && !field.active) return null
                  const status = field.statusFn ? field.statusFn(value) : null

                  return (
                    <div key={field.key} className={`data-table-row ${field.active ? 'row-active' : ''}`}>
                      <span className="data-row-name">
                        {field.active && <span className="active-star">★</span>}
                        {field.label}
                      </span>
                      <span className={`data-row-value ${value != null && typeof value === 'number' && value < 0 ? 'value-negative' : ''}`}>
                        {formatValue(value, field.format)}
                      </span>
                      {status && (
                        <span className={`data-row-status ${getStatusClass(status)}`}>
                          {status}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
