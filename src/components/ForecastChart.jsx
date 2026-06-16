import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  const data = payload[0]?.payload
  if (!data) return null

  return (
    <div className="forecast-tooltip">
      <div className="forecast-tooltip-label">{label}</div>
      {data.probability != null && (
        <div>Probability: <strong>{data.probability.toFixed(1)}%</strong></div>
      )}
      {data.isProjection && data.center != null && (
        <div>Trend: <strong>{data.center.toFixed(1)}%</strong></div>
      )}
      {data.isProjection && data.lower != null && data.upper != null && (
        <div>Range: <strong>{data.lower.toFixed(1)}% – {data.upper.toFixed(1)}%</strong></div>
      )}
    </div>
  )
}

export default function ForecastChart({ data, inDistress }) {
  if (!data || data.length === 0) {
    return (
      <div className="forecast-chart-empty">
        {inDistress
          ? 'No historical probability data available'
          : 'Insufficient historical data for trajectory analysis'}
      </div>
    )
  }

  const hasProjection = data.some((d) => d.isProjection)
  const maxVal = Math.max(
    ...data.map(d => Math.max(d.probability ?? 0, d.upper ?? 0, d.center ?? 0))
  )
  const yMax = Math.max(50, Math.ceil((maxVal + 10) / 10) * 10)

  return (
    <div className="forecast-chart-container">
      <div className="forecast-chart-title">
        {inDistress ? 'Historical Distress Probability' : 'Distress Probability — 2Q Projection'}
      </div>
      {hasProjection && (
        <div className="forecast-chart-subtitle">
          Shaded area shows projected confidence range
        </div>
      )}
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 10, right: 50, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="coneGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366F1" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#6366F1" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />

          <ReferenceLine y={30} stroke="#B45309" strokeDasharray="4 4" strokeWidth={1} label={{ value: '30%', position: 'right', fontSize: 10, fill: '#B45309' }} />

          <XAxis
            dataKey="quarter"
            tick={{ fontSize: 11 }}
            interval={0}
            angle={-45}
            textAnchor="end"
            height={50}
          />
          <YAxis
            domain={[0, yMax]}
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `${v}%`}
            label={{ value: 'Distress Probability', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
          />

          <Tooltip content={<CustomTooltip />} />

          {hasProjection && (
            <Area
              type="monotone"
              dataKey="upper"
              stroke="none"
              fill="url(#coneGradient)"
              fillOpacity={1}
              baseValue="dataMin"
              connectNulls={false}
              isAnimationActive={false}
            />
          )}

          {hasProjection && (
            <Area
              type="monotone"
              dataKey="lower"
              stroke="none"
              fill="#ffffff"
              fillOpacity={1}
              baseValue="dataMin"
              connectNulls={false}
              isAnimationActive={false}
            />
          )}

          <Line
            type="monotone"
            dataKey="probability"
            stroke="#2563EB"
            strokeWidth={2.5}
            dot={{ r: 4, fill: '#2563EB' }}
            activeDot={{ r: 6 }}
            connectNulls={false}
            isAnimationActive={false}
          />

          {hasProjection && (
            <Line
              type="monotone"
              dataKey="center"
              stroke="#6366F1"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="forecast-chart-legend">
        <span className="legend-item">
          <span className="legend-line legend-solid" /> Historical
        </span>
        {hasProjection && (
          <>
            <span className="legend-item">
              <span className="legend-line legend-dashed-blue" /> Trend projection
            </span>
            <span className="legend-item">
              <span className="legend-swatch" /> Confidence range
            </span>
          </>
        )}
      </div>
    </div>
  )
}
