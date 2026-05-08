/** PositionScale — a small "you are here" microvisualization.
 *
 *  Renders a horizontal track with three markers:
 *    1. The two endpoints of the population (min and max) as muted dots
 *    2. An optional reference value (typically the citywide / population
 *       average) as a vertical tick on the track
 *    3. The selected entity's value as a colored dot — the focal point
 *
 *  Reads as "this neighborhood lies HERE on the citywide gap from
 *  fastest to slowest response time" (or any analogous comparison).
 *  Editorial intent: a number alone is meaningless without context;
 *  a number's *position on a scale* is a story.
 *
 *  Reusable across any "entity vs. population" comparison — response
 *  time per neighborhood, 311 cases per neighborhood, parking revenue
 *  per meter, etc. The component knows nothing about the underlying
 *  metric; callers supply the value, range, and color.
 */

interface PositionScaleProps {
  /** The selected entity's value — where to place the focal marker. */
  value: number
  /** The full range of values across the population. */
  range: [number, number]
  /** Optional reference value rendered as a vertical tick on the track —
   *  typically the citywide / population average or median. */
  reference?: number
  /** Width of the SVG in pixels. Default: 80px. */
  width?: number
  /** Height of the SVG in pixels. Default: 12px. */
  height?: number
  /** Color of the focal marker dot. Default: a neutral teal that works
   *  on both light and dark surfaces. Pass a per-value color (e.g.,
   *  responseTimeColor(value)) when the metric has a goodness ramp. */
  color?: string
  /** When true, the focal marker pulses subtly to draw the eye. Reserve
   *  for first-render cases where the comparison is the hero of a card. */
  pulse?: boolean
}

export default function PositionScale({
  value,
  range,
  reference,
  width = 80,
  height = 12,
  color = '#5c9693',
  pulse = false,
}: PositionScaleProps) {
  const [min, max] = range
  const denom = max - min || 1
  const midY = height / 2
  const padX = 4

  // Clamp positions to keep markers inside the track even if value is
  // outside the supplied range (defensive — e.g., if a neighborhood is
  // an outlier beyond the displayed [min, max]).
  const clamp = (v: number) => Math.max(0, Math.min(1, (v - min) / denom))
  const valuePct = clamp(value)
  const refPct = reference !== undefined ? clamp(reference) : null

  const valueX = padX + valuePct * (width - 2 * padX)
  const refX = refPct !== null ? padX + refPct * (width - 2 * padX) : null

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="text-slate-500 dark:text-slate-400"
      aria-hidden
    >
      {/* Track line — muted neutral, spans full width minus end padding */}
      <line
        x1={padX}
        y1={midY}
        x2={width - padX}
        y2={midY}
        stroke="currentColor"
        strokeWidth={1}
        opacity={0.25}
        strokeLinecap="round"
      />

      {/* Endpoint dots — anchor the user's sense of scale at min/max */}
      <circle cx={padX} cy={midY} r={1.75} fill="currentColor" opacity={0.4} />
      <circle cx={width - padX} cy={midY} r={1.75} fill="currentColor" opacity={0.4} />

      {/* Reference tick — usually citywide average. Vertical line crossing
          the track so the eye reads "this is the baseline." */}
      {refX !== null && (
        <line
          x1={refX}
          y1={midY - 3.5}
          x2={refX}
          y2={midY + 3.5}
          stroke="currentColor"
          strokeWidth={1.25}
          opacity={0.55}
          strokeLinecap="round"
        />
      )}

      {/* Focal marker — the selected entity's position. Colored by the
          caller, with a subtle stroke ring to lift it off the track. */}
      <circle
        cx={valueX}
        cy={midY}
        r={3.25}
        fill={color}
        stroke="currentColor"
        strokeOpacity={0.15}
        strokeWidth={1}
        className={pulse ? 'position-scale-pulse' : undefined}
      />
    </svg>
  )
}
