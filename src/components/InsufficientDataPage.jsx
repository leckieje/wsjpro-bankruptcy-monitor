import { useMemo } from 'react'

function formatMarketCap(val) {
  if (val == null) return '—'
  if (val >= 1e9) return '$' + (val / 1e9).toFixed(1) + 'B'
  if (val >= 1e6) return '$' + (val / 1e6).toFixed(1) + 'M'
  return '$' + Math.round(val).toLocaleString()
}

export default function InsufficientDataPage({ modelData, onRowClick }) {
  const companies = useMemo(() => {
    if (!modelData?.companiesByCode) return []
    return Object.entries(modelData.companiesByCode)
      .filter(([, entry]) => entry.insufficient_data)
      .map(([code, entry]) => ({
        code,
        company_name: entry.company_name,
        ticker: entry.ticker,
        industry: entry.financials?.industry || '',
        market_cap: entry.financials?.market_cap,
      }))
      .sort((a, b) => (a.company_name || '').localeCompare(b.company_name || ''))
  }, [modelData])

  return (
    <div className="secondary-page">
      <div className="secondary-page-header">
        <h2>{companies.length} companies with insufficient data for prediction</h2>
        <p>
          These companies lack the minimum financial history (valid Z-Score across multiple quarters)
          required for the model to produce a distress probability estimate. Financial data that is
          available can still be viewed by clicking a row.
        </p>
      </div>
      <div className="table-card">
        <table className="secondary-page-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Ticker</th>
              <th>Industry</th>
              <th>Market Cap</th>
            </tr>
          </thead>
          <tbody>
            {companies.map(c => (
              <tr key={c.code} onClick={() => onRowClick({ Ticker: c.ticker, Company: c.company_name })}>
                <td>{c.company_name}</td>
                <td>{c.ticker}</td>
                <td>{c.industry}</td>
                <td>{formatMarketCap(c.market_cap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
