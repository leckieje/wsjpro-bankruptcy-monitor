import { useMemo } from 'react'

function sectorLabel(sector) {
  if (sector === 'bank') return 'Bank'
  if (sector === 'insurance') return 'Insurance'
  if (sector === 'reit') return 'REIT'
  return 'Other Financial'
}

export default function DistressedPage({ modelData, onRowClick }) {
  const { nonFinancial, financial } = useMemo(() => {
    if (!modelData?.companiesByCode) return { nonFinancial: [], financial: [] }

    const nonFinancial = []
    const financial = []

    for (const [code, entry] of Object.entries(modelData.companiesByCode)) {
      if (!entry.sector_excluded && entry.in_distress) {
        nonFinancial.push({
          code,
          company_name: entry.company_name,
          ticker: entry.ticker,
          industry: entry.financials?.industry || '',
          z_score: entry.current_z_score,
          tl_ta: entry.financials?.tl_ta,
          _sectorDistressed: false,
        })
      } else if (entry.sector_excluded && entry.sector_metrics?.distressed_by_sector === true) {
        financial.push({
          code,
          company_name: entry.company_name,
          ticker: entry.ticker,
          industry: entry.financials?.industry || '',
          sector: sectorLabel(entry.sector_model?.sector),
          z_score: entry.current_z_score,
          tl_ta: entry.financials?.tl_ta,
          _sectorDistressed: true,
        })
      }
    }

    nonFinancial.sort((a, b) => (a.z_score ?? 999) - (b.z_score ?? 999))
    financial.sort((a, b) => (a.z_score ?? 999) - (b.z_score ?? 999))

    return { nonFinancial, financial }
  }, [modelData])

  const all = [...nonFinancial, ...financial]

  return (
    <div className="secondary-page">
      <div className="secondary-page-header">
        <h2>
          {nonFinancial.length} companies in Z-Score Distress Zone (Z ≤ 1.81)
          {financial.length > 0 && <> + {financial.length} financial companies flagged by sector model</>}
        </h2>
        <p>
          These companies have already crossed into the distress zone.
          The monitor's probability model predicts <em>transitions into</em> distress — since
          these companies are already there, they are shown separately. Financial companies
          are included when flagged as distressed by their sector-specific model.
        </p>
      </div>
      <div className="table-card">
        <table className="secondary-page-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Ticker</th>
              <th>Industry</th>
              <th>Sector</th>
              <th>Z-Score</th>
              <th>TL / TA</th>
            </tr>
          </thead>
          <tbody>
            {all.map(c => (
              <tr
                key={c.code}
                onClick={() => onRowClick({ Ticker: c.ticker, Company: c.company_name })}
                style={c._sectorDistressed ? { backgroundColor: 'rgba(245, 158, 11, 0.06)' } : undefined}
              >
                <td>{c.company_name}</td>
                <td>{c.ticker}</td>
                <td>{c.industry}</td>
                <td>{c._sectorDistressed ? <span className="forecast-badge forecast-badge-warning">{c.sector}</span> : ''}</td>
                <td>{c.z_score != null ? c.z_score.toFixed(2) : '—'}</td>
                <td>{c.tl_ta != null ? (c.tl_ta * 100).toFixed(1) + '%' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
