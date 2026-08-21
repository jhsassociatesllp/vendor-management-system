/** Direct port of the old static site's buildProgressRingSvg (static/js/api.js) — Phase
 * 2B's vendor KYC completion ring. `percent` is 0-100. */
export function ProgressRing({
  percent,
  size = 140,
  strokeWidth = 10,
}: {
  percent: number
  size?: number
  strokeWidth?: number
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, percent))
  const offset = circumference * (1 - clamped / 100)
  const center = size / 2
  const isComplete = clamped >= 100

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${center} ${center})`}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          className="stroke-border"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={isComplete ? 'stroke-success transition-all duration-500' : 'stroke-primary transition-all duration-500'}
        />
      </g>
      <text
        x={center}
        y={center}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-foreground font-heading text-size-1 font-bold"
      >
        {Math.round(clamped)}%
      </text>
    </svg>
  )
}
