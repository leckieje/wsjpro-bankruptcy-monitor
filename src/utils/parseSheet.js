import Papa from 'papaparse'

function coerceValue(v) {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    // Strip comma-formatted numbers like "4,580.95"
    const stripped = v.replace(/,/g, '')
    const n = Number(stripped)
    if (stripped !== '' && isFinite(n)) return n
  }
  return v
}

export function parseCSVText(csvString) {
  const result = Papa.parse(csvString, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  })

  const headers = result.meta.fields || []

  // Coerce comma-formatted numeric strings to numbers
  const rows = result.data.map((row) => {
    const cleaned = {}
    for (const key of headers) {
      cleaned[key] = coerceValue(row[key])
    }
    return cleaned
  })

  const numericColumns = headers.filter((col) => {
    const values = rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined && v !== '')
    if (values.length === 0) return false
    const numericCount = values.filter((v) => typeof v === 'number' && isFinite(v)).length
    return numericCount / values.length > 0.8
  })

  return { headers, rows, numericColumns }
}
