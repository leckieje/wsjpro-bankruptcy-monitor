// Columns where a higher raw value means lower bankruptcy risk — normalization is flipped
const INVERTED_COLUMNS = new Set([
  'Z-Score',
  'Quick Ratio',
  'Market Capitalization',
  'Current Open Price',
  '52-Week High Price',
  '52-Week Low Price',
])

export function computeScores(rows, weights, weightColumns) {
  // Compute min and max for each weighted column across all rows
  const stats = {}
  for (const col of weightColumns) {
    const values = rows
      .map((r) => r[col])
      .filter((v) => typeof v === 'number' && isFinite(v))
    stats[col] = {
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 0,
    }
  }

  const scored = rows.map((row) => {
    let score = 0
    for (const col of weightColumns) {
      const { min, max } = stats[col]
      const value = row[col]
      let normalized = 0
      if (max !== min && typeof value === 'number' && isFinite(value)) {
        const raw = (value - min) / (max - min)
        normalized = INVERTED_COLUMNS.has(col) ? 1 - raw : raw
      }
      score += (weights[col] / 100) * normalized
    }
    return {
      ...row,
      _score: Math.round(score * 10000) / 100, // 0–100 scale, 2 decimal places
    }
  })

  return scored.sort((a, b) => b._score - a._score)
}

export function distributeEvenly(columns) {
  if (columns.length === 0) return {}
  const base = Math.floor(100 / columns.length)
  const remainder = 100 - base * columns.length
  const weights = {}
  columns.forEach((col, i) => {
    weights[col] = i === 0 ? base + remainder : base
  })
  return weights
}

export function getTotal(weights) {
  return Object.values(weights).reduce((sum, w) => sum + w, 0)
}
