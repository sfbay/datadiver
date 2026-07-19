// src/views/Pulse/DeviationBar.tsx
//
// Turns "usual ≈ 90" into a picture: a horizontal track with a pale "usual"
// tick and a signal-coloured fill running from usual to the current reading.
// A glance gives direction (fill left of usual = quiet, right = hot) and how
// far. The precise numbers still live in the caption beneath — bar for feel,
// text for precision.
//
// Scale: 0 → 2.5× on the track, "usual" (1×) fixed at 40%. Ratios past 2.5×
// clamp to the end (the number still shows the true value).

const USUAL_PCT = 40
const MAX_RATIO = 2.5

// tickLabel names what the tick IS for this card's ratio: volume anomalies
// compare to "usual" (the 12-week typical stretch); trend cards compare to
// "last yr". One bar, two honest reference points — the label must match.
export default function DeviationBar({
  ratio,
  color,
  tickLabel = 'usual',
}: {
  ratio: number
  color: string
  tickLabel?: string
}) {
  const cur = (Math.min(Math.max(ratio, 0), MAX_RATIO) / MAX_RATIO) * 100
  const left = Math.min(USUAL_PCT, cur)
  const width = Math.abs(cur - USUAL_PCT)

  // Radar-ping stagger, derived from the data itself: a prime multiple of the
  // ratio folded into 0–4s, so neighbouring cards flare out of phase with no
  // index plumbing. Deterministic — the same wire renders the same rhythm.
  const pingDelay = ((Math.abs(ratio) * 997) % 4).toFixed(2)

  return (
    <div className="relative h-[1.375rem] mt-2.5 mb-0.5" aria-hidden>
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-paper-200 dark:bg-espresso-800" />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full"
        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
      />
      {/* Usual tick — dotted, so the REFERENCE reads as construction lines
          while the solid marker below owns "this is the reading". */}
      <div
        className="absolute top-[calc(50%-0.625rem)] h-5 w-0 border-l-2 border-dotted border-paper-500 dark:border-paper-400"
        style={{ left: `${USUAL_PCT}%` }}
      >
        <span className="absolute left-1/2 -translate-x-1/2 -top-[0.6875rem] font-mono text-[0.5rem] whitespace-nowrap text-paper-500 dark:text-paper-600">
          {tickLabel}
        </span>
      </div>
      {/* The reading itself — a filled circle with a pale core, so the fill's
          far end reads as a data point, not a mere cutoff. Rendered after the
          usual tick so it paints on top when the reading IS typical (that
          overlap is the message). */}
      <div
        className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${cur}%`, backgroundColor: color }}
      >
        {/* Radar emanation — a ring flares off the marker a handful of times
            (staggered per card, then permanently at rest). Inline opacity 0
            keeps it invisible before its delay and after the final cycle. */}
        <div
          className="absolute inset-0 rounded-full motion-reduce:hidden"
          style={{
            border: `1.5px solid ${color}`,
            opacity: 0,
            animation: `datumPing 7s ease-out ${pingDelay}s 5`,
          }}
        />
        <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper-50" />
      </div>
    </div>
  )
}
