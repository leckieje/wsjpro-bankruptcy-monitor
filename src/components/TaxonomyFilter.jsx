import { useMemo } from 'react'

export default function TaxonomyFilter({ rows, filters, onFiltersChange }) {
  const taxonomy = useMemo(() => {
    if (!rows) return { sectors: [], subSectors: [] }

    const sectorCounts = {}
    for (const r of rows) {
      if (r.Sector) sectorCounts[r.Sector] = (sectorCounts[r.Sector] || 0) + 1
    }
    const sectors = Object.entries(sectorCounts)
      .filter(([, count]) => count >= 20)
      .map(([sector]) => sector)
      .sort()

    const subSectors = filters.sector
      ? [...new Set(
          rows.filter(r => r.Sector === filters.sector)
            .map(r => r.SubSector)
            .filter(Boolean)
        )].sort()
      : []

    return { sectors, subSectors }
  }, [rows, filters.sector])

  function handleSectorChange(e) {
    onFiltersChange({ sector: e.target.value, subSector: '', industry: '' })
  }

  function handleSubSectorChange(e) {
    onFiltersChange({ ...filters, subSector: e.target.value, industry: '' })
  }

  return (
    <div className="taxonomy-filter">
      <div className="taxonomy-filter-group">
        <label htmlFor="filter-sector">Sector</label>
        <select
          id="filter-sector"
          value={filters.sector}
          onChange={handleSectorChange}
        >
          <option value="">All Sectors</option>
          {taxonomy.sectors.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="taxonomy-filter-group">
        <label htmlFor="filter-subsector">Sub-Sector</label>
        <select
          id="filter-subsector"
          value={filters.subSector}
          onChange={handleSubSectorChange}
          disabled={!filters.sector}
        >
          <option value="">All Sub-Sectors</option>
          {taxonomy.subSectors.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="taxonomy-filter-attribution">
        Powered by Factiva Sentiment Signals, LSEG, and WSJ Pro Data
      </div>
    </div>
  )
}
