// Columns where a higher raw value means lower bankruptcy risk — normalization is flipped
const INVERTED_COLUMNS = new Set([
  'Z-Score',
  'Quick Ratio',
  'Market Capitalization',
  'Current Open Price',
  '52-Week High Price',
  '52-Week Low Price',
])

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0
  const idx = (p / 100) * (sortedValues.length - 1)
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  if (lower === upper) return sortedValues[lower]
  return sortedValues[lower] + (idx - lower) * (sortedValues[upper] - sortedValues[lower])
}

function getDebtEbitdaNormalized(row) {
  const ebitda = row['_ebitda']
  const debt = row['_totalDebt']
  if (ebitda !== undefined && ebitda < 0) return 1
  if (debt !== undefined && debt < 0) return 0
  return null
}

export function computeScores(rows, weights, weightColumns) {
  const stats = {}
  for (const col of weightColumns) {
    let filtered = rows
    if (col === 'Debt to EBITDA') {
      filtered = rows.filter((r) => {
        const ebitda = r['_ebitda']
        const debt = r['_totalDebt']
        return !(typeof ebitda === 'number' && ebitda < 0) && !(typeof debt === 'number' && debt < 0)
      })
    }
    const values = filtered
      .map((r) => r[col])
      .filter((v) => typeof v === 'number' && isFinite(v))
      .sort((a, b) => a - b)

    const p5 = percentile(values, 5)
    const p95 = percentile(values, 95)

    stats[col] = { min: p5, max: p95 }
  }

  const scored = rows.map((row) => {
    let score = 0
    let activeWeightTotal = 0

    // First pass: determine which columns have valid data
    for (const col of weightColumns) {
      if (col === 'Debt to EBITDA') {
        const override = getDebtEbitdaNormalized(row)
        const value = row[col]
        if (override !== null || (typeof value === 'number' && isFinite(value))) {
          if (weights[col] > 0) activeWeightTotal += weights[col]
        }
        continue
      }
      const value = row[col]
      if (typeof value === 'number' && isFinite(value) && weights[col] > 0) {
        activeWeightTotal += weights[col]
      }
    }

    // Second pass: compute normalized score with rescaled weights
    if (activeWeightTotal > 0) {
      for (const col of weightColumns) {
        if (col === 'Debt to EBITDA') {
          const override = getDebtEbitdaNormalized(row)
          if (override !== null) {
            score += (weights[col] / activeWeightTotal) * override
            continue
          }
        }

        const { min, max } = stats[col]
        const value = row[col]
        if (max === min || typeof value !== 'number' || !isFinite(value)) continue

        const clipped = Math.max(min, Math.min(max, value))
        const raw = (clipped - min) / (max - min)
        const normalized = INVERTED_COLUMNS.has(col) ? 1 - raw : raw

        // Rescale: this column's weight relative to the active total
        score += (weights[col] / activeWeightTotal) * normalized
      }
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
