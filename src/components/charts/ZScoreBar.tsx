/**
 * ZScoreBar — a green/red balance bar calibrated to a z-score.
 *
 * The bar is always fully filled: green (left) = healthier than baseline,
 * red (right) = more stressed than baseline. The split point shifts based
 * on the z-score, so a sector at its historical average shows 50/50,
 * while an outlier shows mostly one color.
 *
 * Clamped to ±3σ so extreme values don't collapse the minority color.
 * A thin center tick marks the "normal" midpoint for visual anchoring.
 *
 * Usage:
 *   <ZScoreBar zScore={2.1} />                    // mostly red
 *   <ZScoreBar zScore={-0.5} />                   // slightly more green
 *   <ZScoreBar zScore={0} />                      // 50/50
 *   <ZScoreBar zScore={1.8} height={6} />         // taller variant
 *   <ZScoreBar zScore={null} />                   // loading/no data → gray
 */

interface ZScoreBarProps {
  /** Z-score value. Positive = above baseline (more closures / worse). Null = no data. */
  zScore: number | null
  /** Bar height in pixels. Default 4. */
  height?: number
  /** Maximum σ to clamp to. Default 3. */
  maxSigma?: number
  /** Override green color. Default emerald-400. */
  greenColor?: string
  /** Override red color. Default red-400. */
  redColor?: string
  /** Show the center "normal" tick mark. Default true. */
  showCenter?: boolean
}

export default function ZScoreBar({
  zScore,
  height = 4,
  maxSigma = 3,
  greenColor = '#34d399',
  redColor = '#f87171',
  showCenter = true,
}: ZScoreBarProps) {
  if (zScore === null) {
    return (
      <div
        className="w-full rounded-full bg-slate-700/30"
        style={{ height }}
      />
    )
  }

  // Clamp z-score to [-maxSigma, +maxSigma]
  const clamped = Math.max(-maxSigma, Math.min(maxSigma, zScore))

  // Map to red percentage: z=-3 → 2%, z=0 → 50%, z=+3 → 98%
  // Red on LEFT, green on RIGHT. "Elevated" = bigger red bar = visually "more".
  // Always leave at least 2% so both colors are always visible.
  const redPct = Math.max(2, Math.min(98, ((maxSigma + clamped) / (2 * maxSigma)) * 100))

  return (
    <div className="relative w-full" style={{ height }}>
      <div className="absolute inset-0 flex rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${redPct}%`,
            background: `linear-gradient(90deg, ${redColor}cc, ${redColor})`,
          }}
        />
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${100 - redPct}%`,
            background: `linear-gradient(90deg, ${greenColor}, ${greenColor}cc)`,
          }}
        />
      </div>
      {/* Center tick = "normal" */}
      {showCenter && (
        <div
          className="absolute top-0 w-[1px] bg-white/20"
          style={{ left: '50%', height }}
        />
      )}
    </div>
  )
}
