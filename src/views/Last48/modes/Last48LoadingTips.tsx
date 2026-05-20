// src/views/Last48/modes/Last48LoadingTips.tsx
//
// Rotating tips shown during The Last 48's cold-load wait. Cold-load latency
// is inherent to Socrata (the full-48h queries take 30-60s on cold caches,
// and the Stream Curtain now waits for full data before sweeping). Rather
// than leave that wait empty, we fill it with editorial value: a gently
// rotating card that mixes DATA factoids with USABILITY tips.
//
// The site is dense — many Last 48 interactions (click-to-skip, priority-A
// solid dots, FlowRail click-to-fly, HOTSPOTS mode, demographic underlays)
// are easy to miss. A captive loading moment is the natural place to teach
// them. See memory: seeded-summary-architecture (this is the hardcoded MVP
// that precedes the cross-view summaryStore plumbing).
//
// Register: "civic observatory" calm — one tip at a time, slow 400ms cross-
// fade, ~5s dwell. No glow (Tier 3: prose). Eyebrow in mono, body in serif.

import { useEffect, useState } from 'react'

type TipKind = 'data' | 'usage'

interface LoadingTip {
  kind: TipKind
  /** The tip text. One non-obvious idea per tip; pair numbers with context. */
  text: string
}

// Mixed deck — data factoids interleaved with usability tips so the rotation
// alternates "here's what's in the data" with "here's how to read it."
// DATA figures are approximate typical-window volumes; phrased as "roughly"
// so they read as orientation, not precise claims.
const TIPS: LoadingTip[] = [
  { kind: 'usage', text: 'Click anywhere on the map to skip ahead and jump straight to the loaded view.' },
  { kind: 'data',  text: 'San Francisco dispatches roughly 2,800 emergency 911 calls every 48 hours.' },
  { kind: 'usage', text: 'Solid dots are priority-A emergencies — the calls that matter most. Everything else is a hollow ring.' },
  { kind: 'data',  text: 'Fire & EMS responds to about 600 incidents in a typical two-day window.' },
  { kind: 'usage', text: 'A dot’s color fades as the event ages — fresh events glow in full pigment, older ones drift toward paper.' },
  { kind: 'usage', text: 'Click any dot to open full incident details in the side panel.' },
  { kind: 'data',  text: '311 logs around 2,400 service requests every 48 hours — encampments, graffiti, street cleaning, noise.' },
  { kind: 'usage', text: 'Click an event in the side rail to fly the map straight to its location.' },
  { kind: 'usage', text: 'Switch to HOTSPOTS mode to see which neighborhoods are running statistically hot.' },
  { kind: 'data',  text: '911 activity clusters densest in the Tenderloin, SoMa, and the Mission.' },
  { kind: 'usage', text: 'Layer a demographic underlay — home value, income, density — to read events against neighborhood context.' },
  { kind: 'usage', text: 'Toggle individual streams with the chips up top; each shows its live rate and a 48-hour sparkline.' },
  { kind: 'data',  text: 'No civic dataset is truly real-time — SF data publishes with hours of intrinsic lag. “The Last 48” names that honestly.' },
  { kind: 'usage', text: 'Streams reveal in order — 911 first, then Fire/EMS, then 311 — newest events arriving last.' },
]

const DWELL_MS = 5000
const FADE_MS = 400

export default function Last48LoadingTips() {
  // Random start so repeat cold-loads don't always open on the same tip.
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * TIPS.length))
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      const t = setTimeout(() => {
        setIdx((i) => (i + 1) % TIPS.length)
        setVisible(true)
      }, FADE_MS)
      return () => clearTimeout(t)
    }, DWELL_MS)
    return () => clearInterval(interval)
  }, [])

  const tip = TIPS[idx]
  const eyebrow = tip.kind === 'data' ? 'In the data' : 'Tip'
  // Data tips lean dusty-teal (info); usage tips lean moss (do-this).
  const accent = tip.kind === 'data' ? '#5c9693' : '#7a9954'

  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex justify-center px-6"
      style={{ top: '68%' }}
    >
      <div
        className="max-w-md text-center"
        style={{ opacity: visible ? 1 : 0, transition: `opacity ${FADE_MS}ms ease-out` }}
      >
        {/* Rule-leading eyebrow (── LABEL) — mono, uppercase, tracked. */}
        <div className="mb-2 flex items-center justify-center gap-2">
          <span className="h-px w-5" style={{ backgroundColor: accent }} />
          <span
            className="font-mono text-[10px] uppercase tracking-[0.25em]"
            style={{ color: accent }}
          >
            {eyebrow}
          </span>
        </div>
        {/* Body — display serif, calm size, paper-toned. */}
        <p className="font-display text-[15px] leading-snug text-paper-700 dark:text-paper-200">
          {tip.text}
        </p>
      </div>
    </div>
  )
}
