function formatQuarterLabel(quarter) {
  if (!quarter) return ''
  const [q, year] = quarter.split('_')
  return `${q} '${year.slice(2)}`
}

function nextQuarter(quarter) {
  const [q, year] = quarter.split('_')
  const num = parseInt(q.replace('Q', ''))
  if (num === 4) return `Q1_${parseInt(year) + 1}`
  return `Q${num + 1}_${year}`
}

export function buildChartData(companyData) {
  if (!companyData || !companyData.history || companyData.history.length === 0) return null

  const points = []

  for (const entry of companyData.history) {
    points.push({
      quarter: formatQuarterLabel(entry.quarter),
      probability: entry.probability * 100,
      lower: null,
      upper: null,
      center: null,
      isProjection: false,
    })
  }

  if (companyData.projection && companyData.projection.center) {
    const lastQuarter = companyData.history[companyData.history.length - 1].quarter
    const lastProb = companyData.history[companyData.history.length - 1].probability * 100
    const proj = companyData.projection

    const lastIdx = points.length - 1
    points[lastIdx].lower = lastProb
    points[lastIdx].upper = lastProb
    points[lastIdx].center = lastProb

    let q = lastQuarter
    for (let i = 0; i < proj.center.length; i++) {
      q = nextQuarter(q)
      points.push({
        quarter: formatQuarterLabel(q),
        probability: null,
        center: Math.max(0, Math.min(100, proj.center[i] * 100)),
        lower: Math.max(0, Math.min(100, proj.lower[i] * 100)),
        upper: Math.max(0, Math.min(100, proj.upper[i] * 100)),
        isProjection: true,
      })
    }
  }

  return points
}
