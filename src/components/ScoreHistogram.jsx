import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function buildBuckets(scoredRows) {
  const buckets = []
  for (let i = 0; i < 100; i += 5) {
    buckets.push({ label: `${i}–${i + 5}`, min: i, max: i + 5, count: 0 })
  }
  for (const row of scoredRows) {
    const score = row._score
    if (typeof score !== 'number') continue
    const idx = Math.min(Math.floor(score / 5), 19)
    buckets[idx].count++
  }
  return buckets
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">Score {payload[0].payload.label}</div>
      <div className="chart-tooltip-value"><strong>{payload[0].value}</strong> {payload[0].value === 1 ? 'company' : 'companies'}</div>
    </div>
  )
}

export default function ScoreHistogram({ scoredRows }) {
  if (!scoredRows) return null

  const data = buildBuckets(scoredRows)

  return (
    <div className="histogram-panel">
      <h2 className="chart-title">Score Distribution</h2>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e0e0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#555' }}
            angle={-45}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: '#555' }}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f0f4ff' }} />
          <Bar dataKey="count" fill="#004f9f" radius={[2, 2, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
