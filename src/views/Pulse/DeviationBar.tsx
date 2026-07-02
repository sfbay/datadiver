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

  return (
    <div className="relative h-[22px] mt-2.5 mb-0.5" aria-hidden>
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-paper-200 dark:bg-espresso-800" />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full"
        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
      />
      <div
        className="absolute top-[calc(50%-10px)] h-5 w-[2px] bg-paper-500 dark:bg-paper-400"
        style={{ left: `${USUAL_PCT}%` }}
      >
        <span className="absolute left-1/2 -translate-x-1/2 -top-[11px] font-mono text-[8px] whitespace-nowrap text-paper-500 dark:text-paper-600">
          {tickLabel}
        </span>
      </div>
    </div>
  )
}
