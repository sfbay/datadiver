/**
 * SparkBars — tiny inline bar chart for showing trends at a glance.
 *
 * Renders a row of proportional bars, optionally highlighting the last bar
 * with a distinct color. Useful for showing 5-year trends, monthly patterns,
 * or any small-multiples comparison inline in a sidebar or table row.
 *
 * Usage:
 *   <SparkBars values={[422, 498, 534, 414, 609, 712]} />
 *   <SparkBars values={[100, 120, 90, 110]} highlightLast accentColor="#ef4444" />
 *   <SparkBars values={monthlyData} labels={['J','F','M','A']} height={20} />
 */

interface SparkBarsProps {
  /** The data values to render as bars. */
  values: number[]
  /** Optional labels below each bar. */
  labels?: string[]
  /** Height of the chart area in pixels. Default 16. */
  height?: number
  /** Gap between bars in pixels. Default 1. */
  gap?: number
  /** Base bar color. Default slate-500. */
  barColor?: string
  /** Accent color for the highlighted bar. Default emerald-400. */
  accentColor?: string
  /** Whether to highlight the last bar with accentColor. Default true. */
  highlightLast?: boolean
  /** Optional className for the container. */
  className?: string
}

export default function SparkBars({
  values,
  labels,
  height = 16,
  gap = 1,
  barColor = '#64748b',
  accentColor = '#34d399',
  highlightLast = true,
  className = '',
}: SparkBarsProps) {
  if (values.length === 0) return null

  const max = Math.max(...values, 1)
  const hasLabels = labels && labels.length === values.length

  return (
    <div className={`inline-flex flex-col ${className}`}>
      <div
        className="flex items-end"
        style={{ height, gap }}
      >
        {values.map((v, i) => {
          const barHeight = Math.max(1, (v / max) * height)
          const isLast = highlightLast && i === values.length - 1
          return (
            <div
              key={i}
              className="flex-1 rounded-sm transition-all duration-300"
              style={{
                height: barHeight,
                backgroundColor: isLast ? accentColor : barColor,
                opacity: isLast ? 1 : 0.5,
                minWidth: 3,
              }}
            />
          )
        })}
      </div>
      {hasLabels && (
        <div className="flex" style={{ gap }}>
          {labels.map((label, i) => (
            <span
              key={i}
              className="flex-1 text-center text-[6px] font-mono text-slate-600 leading-tight mt-0.5"
              style={{ minWidth: 3 }}
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
