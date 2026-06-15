// src/views/Last48/modes/Last48LoadingTips.tsx
//
// Rotating tips shown during The Last 48's cold-load wait. Cold-load latency
// is inherent to Socrata (the full-48h queries take 30-60s on cold caches,
// and the Stream Curtain now waits for full data before sweeping). Rather
// than leave that wait empty, we fill it with editorial value: a gently
// rotating card that mixes DATA factoids with USABILITY tips.
//
// The site is dense — many Last 48 interactions (click-to-skip, priority-A
// solid dots, FlowRail click-to-fly, the AUTO ambient tour, demographic
// underlays) are easy to miss. A captive loading moment is the natural place
// to teach them. See memory: seeded-summary-architecture.
//
// DATA tips with a volume figure read from the seeded summaryStore (the real
// per-stream 48h counts from your LAST visit, since this load's numbers don't
// exist yet — that's what we're waiting for). First-time visitors, or streams
// that never finished a full load, fall back to approximate "roughly N"
// phrasing. The provenance shows in the phrasing: real → specific + past
// tense ("logged 2,847 calls in the last 48 hours"); fallback → approximate +
// habitual ("dispatches roughly 2,800 ... every 48 hours").
//
// Register: "civic observatory" calm — one tip at a time, slow 400ms cross-
// fade, ~5s dwell. No glow (Tier 3: prose). Eyebrow in mono, body in serif.

import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { useSummaryStore, type Last48Counts } from '@/stores/summaryStore'

type TipKind = 'data' | 'usage'

interface LoadingTip {
  kind: TipKind
  /** Tip text — a static string, or a builder that templates the seeded 48h
   *  counts (real last-visit volumes) with a graceful approximate fallback. */
  text: string | ((counts: Last48Counts) => string)
}

/**
 * Volume-tip helper: render the SPECIFIC last-visit figure when we have a real
 * seeded count, else the approximate habitual `fallback`. Keeps the two voices
 * (precise/past vs approximate/habitual) consistent across the count tips.
 */
function volumeTip(
  n: number | undefined,
  real: (formatted: string) => string,
  fallback: string,
): string {
  return typeof n === 'number' ? real(n.toLocaleString()) : fallback
}

// Mixed deck — data factoids interleaved with usability tips so the rotation
// alternates "here's what's in the data" with "here's how to read it."
const TIPS: LoadingTip[] = [
  { kind: 'usage', text: 'Click anywhere on the map to skip ahead and jump straight to the loaded view.' },
  { kind: 'data',  text: (c) => volumeTip(
    c['911-realtime'],
    (n) => `In the last 48 hours, San Francisco logged ${n} emergency 911 calls.`,
    'San Francisco dispatches roughly 2,800 emergency 911 calls every 48 hours.',
  ) },
  { kind: 'usage', text: 'Solid dots are priority-A emergencies — the calls that matter most. Everything else is a hollow ring.' },
  { kind: 'data',  text: (c) => volumeTip(
    c['fire-ems-dispatch'],
    (n) => `Fire & EMS responded to ${n} incidents in the last 48 hours.`,
    'Fire & EMS responds to about 600 incidents in a typical two-day window.',
  ) },
  { kind: 'usage', text: 'A dot’s color fades as the event ages — fresh events glow in full pigment, older ones drift toward paper.' },
  { kind: 'usage', text: 'Click any dot to open full incident details in the side panel.' },
  { kind: 'data',  text: (c) => volumeTip(
    c['311-cases'],
    (n) => `311 logged ${n} service requests in the last 48 hours — encampments, graffiti, street cleaning, noise.`,
    '311 logs around 2,400 service requests every 48 hours — encampments, graffiti, street cleaning, noise.',
  ) },
  { kind: 'usage', text: 'Click an event in the side rail to fly the map straight to its location.' },
  { kind: 'usage', text: 'Switch on AUTO and the map tours itself — a slow orbit gliding through the freshest events, hands-free. Made for a wall display.' },
  { kind: 'usage', text: 'In AUTO, each new event is selected, its details open, and the camera drifts to the next — any click hands control back to you.' },
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
  const reducedMotion = usePrefersReducedMotion()
  // Seeded 48h counts from the user's last visit (empty {} for first-timers).
  const counts = useSummaryStore((s) => s.last48.counts)

  useEffect(() => {
    // fadeTimer is tracked at effect scope so the cleanup actually clears it.
    // (The inner `return () => clearTimeout(t)` it replaces lived inside the
    // setInterval callback, where its return value was silently discarded.)
    let fadeTimer: ReturnType<typeof setTimeout> | undefined
    const interval = setInterval(() => {
      if (reducedMotion) {
        // Instant swap — reduced-motion users still get the rotating tips,
        // just without the opacity cross-fade.
        setIdx((i) => (i + 1) % TIPS.length)
        return
      }
      setVisible(false)
      fadeTimer = setTimeout(() => {
        setIdx((i) => (i + 1) % TIPS.length)
        setVisible(true)
      }, FADE_MS)
    }, DWELL_MS)
    return () => {
      clearInterval(interval)
      if (fadeTimer) clearTimeout(fadeTimer)
    }
  }, [reducedMotion])

  const tip = TIPS[idx]
  const text = typeof tip.text === 'function' ? tip.text(counts) : tip.text
  const isData = tip.kind === 'data'
  const eyebrow = isData ? 'In the data' : 'Tip'
  // Accent encodes kind (data = dusty-teal/info, usage = moss/do-this) AND
  // inverts with the pill: the pill is DARK in light mode, LIGHT in dark mode,
  // so the accent flips too — light accent shade on the dark pill, dark accent
  // shade on the light pill.
  const accentClass = isData
    ? 'text-teal-400 dark:text-teal-600'
    : 'text-moss-400 dark:text-moss-600'
  const ruleClass = isData
    ? 'bg-teal-400 dark:bg-teal-600'
    : 'bg-moss-400 dark:bg-moss-600'

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-6"
      style={{ top: '68%' }}
    >
      {/* Inverted-contrast pill — dark espresso in light mode, light paper in
          dark mode. Makes the tip read as a deliberate card over the map.
          NO backdrop-blur on purpose: a blur frosts the map behind into a
          flat, opaque-looking tone, so a 65% alpha read ~90% solid. Plain
          alpha lets the map genuinely show through at its true opacity. Tune
          via the /65 alpha (lower = more map shows through); only add a small
          `backdrop-blur-[2px]` back if the bright radar sweep hurts text
          legibility. */}
      <div
        className="max-w-md rounded-2xl px-7 py-5 text-center bg-espresso-900/65 dark:bg-paper-100/65 shadow-xl shadow-espresso-950/20 ring-1 ring-paper-100/10 dark:ring-espresso-900/10"
        style={{
          opacity: visible ? 1 : 0,
          transition: reducedMotion ? 'none' : `opacity ${FADE_MS}ms ease-out`,
        }}
      >
        {/* Rule-leading eyebrow (── LABEL) — mono, uppercase, tracked. */}
        <div className="mb-2 flex items-center justify-center gap-2">
          <span className={`h-px w-5 ${ruleClass}`} />
          <span className={`font-mono text-[10px] uppercase tracking-[0.25em] ${accentClass}`}>
            {eyebrow}
          </span>
        </div>
        {/* Body — display serif, inverted text: light on dark pill, dark on
            light pill. */}
        <p className="font-display text-[15px] leading-snug text-paper-50 dark:text-espresso-900">
          {text}
        </p>
      </div>
    </div>
  )
}
