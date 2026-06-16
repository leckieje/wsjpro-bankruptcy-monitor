function getProbabilityColor(probability) {
  if (probability == null) return '#999'
  if (probability >= 0.5) return '#DC2626'
  if (probability >= 0.3) return '#B45309'
  if (probability >= 0.1) return '#CA8A04'
  return '#16A34A'
}

function getLabel(probability) {
  if (probability == null) return 'Insufficient data for prediction'
  if (probability >= 0.5) return 'High risk — significant probability of entering distress'
  if (probability >= 0.3) return 'Elevated risk — monitor closely'
  if (probability >= 0.1) return 'Emerging risk — probability trending upward'
  return 'Low risk — no signs of deterioration'
}

export default function ScoreTrio({ probability, insufficientData }) {
  if (insufficientData) {
    return (
      <div className="score-trio">
        <div className="score-card score-card-large">
          <div className="score-card-label">Distress Probability</div>
          <div className="score-card-value" style={{ color: '#999' }}>—</div>
          <div className="score-card-subtitle">Insufficient data for prediction</div>
        </div>
      </div>
    )
  }

  const pct = probability != null ? (probability * 100) : null
  const display = pct != null ? `${pct.toFixed(1)}%` : '—'

  return (
    <div className="score-trio">
      <div className="score-card score-card-large">
        <div className="score-card-label">Distress Probability</div>
        <div className="score-card-value" style={{ color: getProbabilityColor(probability) }}>
          {display}
        </div>
        <div className="score-card-subtitle">{getLabel(probability)}</div>
      </div>
    </div>
  )
}
