export function getScoreColor(score) {
  if (score === null || score === undefined) return undefined
  const t = Math.max(0, Math.min(100, score)) / 100
  if (t <= 0.5) {
    const ratio = t / 0.5
    const r = Math.round(22 * ratio)
    const g = Math.round(163 * (1 - ratio))
    const b = Math.round(74 * (1 - ratio))
    return `rgb(${r}, ${g}, ${b})`
  }
  const ratio = (t - 0.5) / 0.5
  const r = Math.round(220 * ratio)
  const g = Math.round(38 * (1 - ratio))
  const b = Math.round(38 * (1 - ratio))
  return `rgb(${r}, ${g}, ${b})`
}
