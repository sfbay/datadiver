// src/views/Alerts/LivePreview.tsx
//
// Live editorial preview of the email that would arrive today, given the
// user's current subscription draft. Wires three pieces together:
//
//   1. useLast48Window — the same 48h sliding-window data engine that powers
//      The Last 48 view. Polls Socrata, normalizes rows, holds them in a
//      ref-backed store.
//   2. eventMatchesSubscription — the same pure matcher imported by the cron
//      (src/lib/alerts/match.ts). One source of truth: the preview cannot
//      drift from what the daily digest actually sends.
//   3. classifySignificant + utility formatters — same significance taxonomy
//      the heartbeat ticker uses, so labels read consistently across the app.
//
// The watermark is set to (now - 24h) so the preview mirrors a daily digest
// cadence: "what would have arrived this morning?" When the user picks a
// quiet block, the preview is empty by design — that's the editorial
// promise made elsewhere on the page ("we send nothing on quiet days")
// concretely demonstrated, not just claimed.

import { useMemo } from 'react'
import { useLast48Window } from '@/hooks/useLast48Window'
import type { DatasetId, NormalizedEvent } from '@/types/last48'
import type { AlertStreamId } from '@/lib/alerts/streams'
import { isLiveStream } from '@/lib/alerts/streams'
import type { AlertLocation } from '@/lib/alerts/types'
import { eventMatchesSubscription } from '@/lib/alerts/match'
import { classifySignificant, timeAgo } from '@/lib/alerts/significance'
import { humanizeCallType, humanizeStreamName } from '@/utils/humanizeCivic'

const PIGMENT: Record<DatasetId, { dot: string; eyebrow: string; soft: string }> = {
  '911-realtime':      { dot: '#616a96', eyebrow: '#7a83af', soft: 'rgba(97, 106, 150, 0.10)' },   // indigo
  'fire-ems-dispatch': { dot: '#b85a33', eyebrow: '#d47149', soft: 'rgba(184, 90, 51, 0.10)' },    // terracotta
  '311-cases':         { dot: '#7a9954', eyebrow: '#9db87a', soft: 'rgba(122, 153, 84, 0.10)' },   // moss
}

const ALL_STREAMS: DatasetId[] = ['911-realtime', 'fire-ems-dispatch', '311-cases']

interface LivePreviewProps {
  email: string
  streams: AlertStreamId[]
  categories: string[]
  radiusMiles: number
  locations: AlertLocation[]
  pulse: boolean
  /** 'card' = standalone glass card (default); 'pane' = inset frame for
      embedding inside a parent card — no glow, the parent card carries it. */
  variant?: 'card' | 'pane'
}

export function LivePreview({ email, streams, categories, radiusMiles, locations, pulse, variant = 'card' }: LivePreviewProps) {
  // Always pull all three streams so the user can toggle without re-fetching.
  // The engine itself short-circuits per-stream when the enabledSet shrinks,
  // but for the preview we want every stream's events available so toggling
  // chips is instantaneous and never blocked on a new network round trip.
  const window48 = useLast48Window({ datasets: ALL_STREAMS })

  // 24h watermark — mirrors a daily digest's coverage window. Re-derived
  // when the events array's identity changes (every poll mutation gives a
  // new array reference) so timestamps don't go stale.
  const watermark = useMemo(() => Date.now() - 24 * 60 * 60 * 1000, [window48.events])

  // Run the cron's matcher against every event in the 48h window.
  // Empty locations OR empty streams short-circuits to no matches.
  // `events` arrives newest-first already; we filter then slice.
  const matched: NormalizedEvent[] = useMemo(() => {
    if (locations.length === 0 || streams.length === 0) return []
    const sub = {
      filters: { streams, categories },
      radiusMiles,
      locations,
    }
    const out: NormalizedEvent[] = []
    for (const e of window48.events) {
      if (eventMatchesSubscription(e, sub, watermark)) out.push(e)
      if (out.length >= 6) break
    }
    return out
  }, [window48.events, streams, categories, radiusMiles, locations, watermark])

  const locationLabel = composeLocationLabel(locations)
  const subject = composeSubjectLine({
    matchedCount: matched.length,
    streams,
    locations,
    locationLabel,
    loading: window48.isLoading,
  })

  const now = Date.now()
  const isLoading = window48.isLoading && locations.length > 0 && streams.length > 0
  const liveSelected = streams.some(isLiveStream)

  const isPane = variant === 'pane'

  return (
    <div
      className={
        isPane
          ? 'relative min-w-0 rounded-2xl border border-ink/[0.08] dark:border-white/[0.06] bg-paper-100/45 dark:bg-espresso-900/35 overflow-hidden'
          : 'glass-card glow-host rounded-2xl overflow-hidden relative'
      }
      style={isPane ? undefined : ({ '--glow': '#b85a33' } as React.CSSProperties)}
    >
      {!isPane && <div className="glow-corner is-lg" style={{ opacity: 0.35 }} />}

      {/* Eyebrow rule + label */}
      <div className="relative px-5 pt-4 pb-3 border-b border-ink/[0.06] dark:border-white/[0.04]">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="w-[5px] h-[5px] rounded-full"
            style={{
              backgroundColor: '#b85a33',
              animation: 'pulse 2.5s ease-in-out infinite',
            }}
          />
          <span className="text-nano font-mono uppercase tracking-[0.22em] text-terracotta-500">
            Preview · Today's edition
          </span>
          <div className="flex-1 h-px bg-ink/[0.08] dark:bg-white/[0.06]" />
        </div>

        {/* Mock email envelope: From / To / Subject */}
        <div className="space-y-0.5 font-mono text-micro text-ink/55 dark:text-slate-400 tabular-nums">
          <p>
            <span className="inline-block w-12 opacity-60">FROM</span>
            <span>DataDiver Alerts &lt;alerts@jlabsf.org&gt;</span>
          </p>
          <p>
            <span className="inline-block w-12 opacity-60">TO</span>
            <span className="text-ink/75 dark:text-slate-300">
              {email.trim() || 'you@…'}
            </span>
          </p>
        </div>

        {/* Subject — Fraunces italic, fades when subject text changes */}
        <h3
          key={subject /* re-mount triggers fade-in */}
          className="mt-2 font-display italic text-[18px] leading-tight text-ink dark:text-paper-100 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
        >
          {subject}
        </h3>
      </div>

      {/* Body */}
      <div className="relative px-5 py-4 min-h-[180px]">
        {locations.length === 0 ? (
          <EmptyPrompt
            line1="Add a place to watch."
            line2="Drop a pin on the map, or search an address."
          />
        ) : streams.length === 0 ? (
          <EmptyPrompt
            line1="Choose what to watch."
            line2="Pick at least one stream — 911, Fire & EMS, or 311."
          />
        ) : !liveSelected ? (
          <EmptyPrompt
            line1="These streams arrive in batches."
            line2="The preview shows live streams; released data lands in your digest when the city publishes it."
          />
        ) : isLoading ? (
          <LoadingShimmer />
        ) : matched.length === 0 ? (
          <QuietDayMessage locationLabel={locationLabel} />
        ) : (
          <ul className="space-y-3">
            {matched.map((e) => (
              <EventRow key={e.id} event={e} now={now} />
            ))}
          </ul>
        )}

        {pulse && locations.length > 0 && streams.length > 0 && (
          <p className="mt-4 pt-3 border-t border-ink/[0.06] dark:border-white/[0.04] text-[12px] leading-relaxed text-ink/55 dark:text-slate-400">
            <span style={{ color: '#d4a435' }} aria-hidden>▲ </span>
            Your digest also carries a neighborhood pulse — flagged when areas
            near your pins run busier than usual.
          </p>
        )}
      </div>

      {/* Footer rule — keeps the kraft-paper edge */}
      <div className="relative px-5 py-2.5 border-t border-ink/[0.06] dark:border-white/[0.04] flex items-center justify-between text-nano font-mono uppercase tracking-wider text-ink/45 dark:text-slate-500">
        <span>{matched.length > 0 ? `${matched.length} match${matched.length === 1 ? '' : 'es'} · last 24h` : 'Showing what arrived in the last 24h'}</span>
        <span>The Last 48 · jlabsf.org</span>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function composeLocationLabel(locations: AlertLocation[]): string {
  if (locations.length === 0) return 'your block'
  const primary = locations[0].label || `${locations[0].lat.toFixed(3)}, ${locations[0].lng.toFixed(3)}`
  // Strip "San Francisco, California, United States" tails to keep it tight.
  const trimmed = primary.replace(/,\s*San Francisco,?.*/i, '').trim()
  if (locations.length === 1) return trimmed
  return `${trimmed} +${locations.length - 1} more`
}

function composeSubjectLine(args: {
  matchedCount: number
  streams: AlertStreamId[]
  locations: AlertLocation[]
  locationLabel: string
  loading: boolean
}): string {
  const { matchedCount, streams, locations, locationLabel, loading } = args
  if (locations.length === 0) return 'Set up your daily brief'
  if (streams.length === 0) return 'Pick what to watch'
  if (loading) return 'Tuning in to The Last 48…'
  if (matchedCount === 0) return `A quiet day near ${locationLabel}`
  const n = matchedCount
  const word = n === 1 ? 'event' : 'events'
  return `DataDiver · ${n} ${word} near ${locationLabel}`
}

// ── Sub-components ───────────────────────────────────────────────────────────

function EventRow({ event, now }: { event: NormalizedEvent; now: number }) {
  const pigment = PIGMENT[event.datasetId]
  const sig = classifySignificant(event)

  // Title — significance plural wins; else humanized callType; else stream name.
  const title = sig
    ? sig.plural.charAt(0).toUpperCase() + sig.plural.slice(1)
    : event.callType
      ? humanizeCallType(event.callType)
      : humanizeStreamName(event.datasetId)

  const where = event.neighborhood
    ? event.neighborhood
    : (typeof event.latitude === 'number' && typeof event.longitude === 'number'
        ? `${event.latitude.toFixed(3)}, ${event.longitude.toFixed(3)}`
        : '')

  return (
    <li className="flex items-start gap-3">
      <span
        className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: pigment.dot }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="font-display italic text-[14px] leading-tight text-ink dark:text-paper-100 truncate">
          {title}
        </p>
        <p className="mt-0.5 text-micro font-mono text-ink/55 dark:text-slate-400 tabular-nums">
          <span style={{ color: pigment.eyebrow }}>{humanizeStreamName(event.datasetId)}</span>
          {where && <> · {where}</>}
          {' · '}
          {timeAgo(event.receivedAt, now)}
        </p>
      </div>
    </li>
  )
}

function EmptyPrompt({ line1, line2 }: { line1: string; line2: string }) {
  return (
    <div className="flex flex-col items-start gap-1 py-4">
      <p className="font-display italic text-[15px] text-ink/75 dark:text-paper-100/85 leading-tight">
        {line1}
      </p>
      <p className="text-label font-mono text-ink/50 dark:text-slate-400">{line2}</p>
    </div>
  )
}

function LoadingShimmer() {
  return (
    <div className="space-y-3 py-1" aria-busy="true" aria-live="polite">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start gap-3">
          <span className="mt-1.5 w-2 h-2 rounded-full bg-ink/10 dark:bg-white/10 flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 rounded bg-ink/[0.06] dark:bg-white/[0.06]" style={{ width: `${85 - i * 10}%` }} />
            <div className="h-2 rounded bg-ink/[0.04] dark:bg-white/[0.04]" style={{ width: `${55 - i * 5}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function QuietDayMessage({ locationLabel }: { locationLabel: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5 py-2">
      <p className="font-display italic text-[15px] text-ink/85 dark:text-paper-100/90 leading-snug">
        No matches in the last 24 hours.
      </p>
      <p className="text-label font-mono text-ink/55 dark:text-slate-400 leading-relaxed">
        Most blocks have quiet days. <span className="text-ink/75 dark:text-paper-100/85">{locationLabel}</span> seems to be having one today. <br />
        The Last 48 sends nothing when this is the case.
      </p>
    </div>
  )
}
