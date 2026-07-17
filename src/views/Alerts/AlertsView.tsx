// src/views/Alerts/AlertsView.tsx
//
// The Alerts builder — DataDiver's first user-facing backend surface.
// An editorial "newsroom desk" composition, map-first:
//
//   ┌─ HERO BAND ──────────────────────────────────────────────────┐
//   │ DAILY NEWSLETTER eyebrow · Fraunces italic display ·          │
//   │ pull-quote margin note (future home of Dana art)              │
//   └───────────────────────────────────────────────────────────────┘
//   ┌─ ① WHERE TO WATCH — full-width map station ──────────────────┐
//   │ step pill + headline · explainer rides right · search +      │
//   │ radius aligned under the headline                             │
//   │ hero-scale Mapbox (click to pin, circles render live)        │
//   │ footer: dropped-pin chips with remove                         │
//   └───────────────────────────────────────────────────────────────┘
//   ┌─ ② WHAT TO WATCH FOR — full-width, two panes ────────────────┐
//   │ streams + sub-layers (only   │ LIVE PREVIEW pane — real      │
//   │ these kinds · released ·     │ matched events, reacts as     │
//   │ neighborhood pulse)          │ chips toggle                  │
//   └───────────────────────────────────────────────────────────────┘
//   ┌─ ③ WHERE TO SEND — full-width closer ────────────────────────┐
//   │ email slip (50%) + Subscribe · fine print · error rail       │
//   └───────────────────────────────────────────────────────────────┘
//   ┌─ COLOPHON ────────────────────────────────────────────────────┐
//
// On narrow viewports everything stacks in reading order:
// hero → map → streams (preview below) → email → colophon. The funnel
// is deliberate —
// pinning the map is play (zero commitment), streams/categories are
// configuration, email is commitment, and by then the preview has
// already shown the reader what they'll get.
//
// Layout grammar: `clamp()` everywhere instead of breakpoint jumps,
// echoing the Liquid layout pattern established on Home.

import { useState, useEffect, type CSSProperties } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { AlertStreamId } from '@/lib/alerts/streams'
import type { AlertLocation, SubscriptionDraft } from '@/lib/alerts/types'
import { ALERT_RADII } from '@/lib/alerts/radii'
import { LocationPicker } from './LocationPicker'
import { LivePreview } from './LivePreview'

// ─── Stream pigments — same earth-tone identity each dataset wears
//     everywhere else in DataDiver (CLAUDE.md pigment vocabulary). ────
const LIVE_STREAM_OPTIONS: {
  id: AlertStreamId
  label: string
  sublabel: string
  pigment: { dot: string; border: string; tintLight: string; tintDark: string }
}[] = [
  {
    id: '911-realtime',
    label: '911 calls',
    sublabel: 'SFPD · dispatch radio',
    pigment: {
      dot: '#616a96',
      border: '#7a83af',
      tintLight: 'rgba(97, 106, 150, 0.10)',
      tintDark: 'rgba(122, 131, 175, 0.18)',
    },
  },
  {
    id: 'fire-ems-dispatch',
    label: 'Fire & EMS',
    sublabel: 'SFFD · emergency response',
    pigment: {
      dot: '#b85a33',
      border: '#d47149',
      tintLight: 'rgba(184, 90, 51, 0.10)',
      tintDark: 'rgba(212, 113, 73, 0.18)',
    },
  },
  {
    id: '311-cases',
    label: '311 reports',
    sublabel: 'SF311 · service requests',
    pigment: {
      dot: '#7a9954',
      border: '#9db87a',
      tintLight: 'rgba(122, 153, 84, 0.10)',
      tintDark: 'rgba(157, 184, 122, 0.18)',
    },
  },
]

// Released-tier streams: the city publishes these when it publishes them —
// crash data lands in batches weeks behind; the business registry refreshes
// nightly. Dot hexes are the registry canon (streams.ts); borders follow the
// hand-derived lighter-ramp convention of the live entries above.
const RELEASED_STREAM_OPTIONS: typeof LIVE_STREAM_OPTIONS = [
  {
    id: 'traffic-crashes',
    label: 'Traffic crashes',
    sublabel: 'Vision Zero · in batches, wks behind',
    pigment: {
      dot: '#963e30',
      border: '#b5624f',
      tintLight: 'rgba(150, 62, 48, 0.10)',
      tintDark: 'rgba(181, 98, 79, 0.18)',
    },
  },
  {
    id: 'business-openings',
    label: 'Business openings',
    sublabel: 'City registry · refreshed nightly',
    pigment: {
      dot: '#5c9693',
      border: '#8bb5b2',
      tintLight: 'rgba(92, 150, 147, 0.10)',
      tintDark: 'rgba(139, 181, 178, 0.18)',
    },
  },
]

const CATEGORY_OPTIONS: { key: string; label: string }[] = [
  { key: 'shooting', label: 'Shootings' },
  { key: 'stabbing', label: 'Stabbings' },
  { key: 'homicide', label: 'Homicides' },
  { key: 'robbery', label: 'Robberies' },
  { key: 'weapon', label: 'Weapons calls' },
  { key: 'assault', label: 'Assaults' },
  { key: 'fire', label: 'Fires' },
]
const RADII = ALERT_RADII // single source of truth shared with the server validator

/** "¼", "½", "1", "2" — the radius vocabulary used everywhere on this page. */
const radiusLabel = (r: number) => (r === 0.125 ? '⅛' : r === 0.25 ? '¼' : r === 0.5 ? '½' : String(r))

// ─────────────────────────────────────────────────────────────────────────────

export default function AlertsView() {
  const [email, setEmail] = useState('')
  const [streams, setStreams] = useState<AlertStreamId[]>(['911-realtime', 'fire-ems-dispatch'])
  const [categories, setCategories] = useState<string[]>([])
  const [pulse, setPulse] = useState(true)
  const [radiusMiles, setRadiusMiles] = useState(0.5)
  const [locations, setLocations] = useState<AlertLocation[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ name: string; lat: number; lng: number }[]>([])
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const toggle = <T,>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]

  async function searchAddress() {
    if (!query.trim()) return
    const token = import.meta.env.VITE_MAPBOX_TOKEN
    const url = new URL('https://api.mapbox.com/search/geocode/v6/forward')
    url.searchParams.set('q', query)
    url.searchParams.set('access_token', token)
    url.searchParams.set('proximity', '-122.4400,37.7600')
    url.searchParams.set('bbox', '-123.0,37.6,-122.3,37.85')
    url.searchParams.set('limit', '5')
    const res = await fetch(url)
    if (!res.ok) return
    const j = (await res.json()) as {
      features: { properties: { full_address?: string; name?: string }; geometry: { coordinates: [number, number] } }[]
    }
    setResults(
      j.features.map((f) => ({
        name: f.properties.full_address || f.properties.name || 'Result',
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      })),
    )
  }

  // Auto-search: fire the geocoder ~400ms after typing stops, so results appear
  // without an explicit Search click (Enter + the button still fire instantly).
  // Gated at 3+ chars so we don't spam the geocoder on the first keystrokes.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) {
      setResults([])
      return
    }
    const t = setTimeout(() => searchAddress(), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // Add a geocoder result as a pin (and clear the search). Shared by the result
  // list click AND Enter, so the top match can be picked without the mouse.
  function selectResult(r: { name: string; lat: number; lng: number }) {
    setLocations((a) => [...a, { label: r.name, lat: r.lat, lng: r.lng }])
    setResults([])
    setQuery('')
  }

  async function submit() {
    setErrorMsg('')
    // Validation order mirrors the page's reading order: places → streams → email.
    if (locations.length === 0) return setErrorMsg('Drop at least one pin on the map.')
    if (streams.length === 0) return setErrorMsg('Pick at least one stream.')
    if (!email.trim()) return setErrorMsg('Enter your email.')
    setStatus('sending')
    const draft: SubscriptionDraft = {
      email: email.trim(),
      cadence: 'daily',
      filters: { streams, categories, pulse },
      radiusMiles,
      locations,
    }
    try {
      const res = await fetch('/api/alerts/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || 'Something went wrong.')
      }
      setStatus('sent')
    } catch (e) {
      setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }

  if (status === 'sent') return <ConfirmationScreen email={email} />

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] px-[clamp(16px,3vw,48px)] pt-[clamp(20px,3vw,40px)] pb-16">
        <HeroBand />

        {/* ─── ① WHERE TO WATCH — full-width map station ───────────────
            The map is the first question the page asks. Search + radius
            live here too: both are direct-manipulation controls whose
            feedback (pins, circles) renders on this very map. */}
        <section
          className="mt-8 glass-card relative rounded-[28px] rounded-bl-none overflow-hidden glow-host"
          style={{ '--glow': '#5c9693' } as CSSProperties}
        >
          <div className="glow-corner is-lg" style={{ opacity: 0.32 }} />

          {/* Header: chapter mark + bridge copy + search + radius */}
          <div className="relative px-[clamp(20px,3vw,32px)] pt-5 pb-4">
            {/* Row 1: step + headline, explainer riding to the right */}
            <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
              <div className="flex flex-shrink-0 items-center gap-3.5">
                <StepMark n={1} />
                <h2 className="font-display italic text-[clamp(20px,2vw,24px)] text-ink dark:text-paper-100">
                  Where to watch
                </h2>
              </div>
              <p className="min-w-[260px] flex-1 max-w-[44rem] text-[13px] leading-relaxed text-ink/60 dark:text-slate-400">
                Click anywhere on the map to drop a pin — home, work, school, the
                corner you worry about. Each pin watches its own circle; your
                digest covers all of them.
              </p>
            </div>

            {/* Row 2: search + radius, aligned under the headline text */}
            <div className="mt-4 sm:ml-[58px] flex flex-wrap items-center gap-3">
                {/* Address search — anchors its results dropdown */}
                <div className="relative w-[min(320px,72vw)]">
                  <div className="flex gap-2">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return
                        e.preventDefault()
                        // if results are already up (auto-search), Enter picks the
                        // top match; otherwise it triggers a search.
                        if (results.length > 0) selectResult(results[0])
                        else searchAddress()
                      }}
                      placeholder="Search an address…"
                      aria-label="Search an address"
                      className="flex-1 min-w-0 rounded-md border border-ink/15 dark:border-white/[0.12] bg-paper-100/60 dark:bg-espresso-900/60 px-3.5 py-2 text-[14px] text-ink dark:text-paper-100 placeholder:text-ink/35 dark:placeholder:text-slate-500 focus:border-teal-500 focus:outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={searchAddress}
                      className="rounded-md border border-ink/15 dark:border-white/[0.12] bg-paper-100/40 dark:bg-espresso-900/40 px-3.5 py-2 text-[12px] font-mono uppercase tracking-wider text-ink/70 dark:text-slate-300 hover:bg-ink/[0.04] dark:hover:bg-white/[0.04] transition-colors"
                    >
                      Search
                    </button>
                  </div>

                  {results.length > 0 && (
                    <ul className="absolute left-0 right-0 top-full z-20 mt-1.5 rounded-md border border-ink/10 dark:border-white/[0.08] bg-paper-100 dark:bg-espresso-800 text-[13px] text-ink dark:text-paper-100 overflow-hidden shadow-lg">
                      {results.map((r, i) => (
                        <li key={i} className={i > 0 ? 'border-t border-ink/[0.06] dark:border-white/[0.04]' : ''}>
                          <button
                            type="button"
                            onClick={() => selectResult(r)}
                            className="block w-full px-3.5 py-2 text-left hover:bg-teal-500/10 transition-colors"
                          >
                            {r.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Radius — lives with the map because its feedback (the
                    circles) renders here. */}
                <div className="flex items-center gap-2.5">
                  <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-ink/45 dark:text-slate-500">
                    Radius
                  </span>
                  <div className="inline-flex rounded-md border border-ink/15 dark:border-white/[0.12] overflow-hidden">
                    {RADII.map((r, i) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRadiusMiles(r)}
                        className={`
                          px-3.5 py-2 text-[13px] font-mono tabular-nums transition-colors
                          ${i > 0 ? 'border-l border-ink/15 dark:border-white/[0.12]' : ''}
                          ${radiusMiles === r
                            ? 'bg-terracotta-500 text-white'
                            : 'bg-paper-100/40 dark:bg-espresso-900/40 text-ink/70 dark:text-slate-300 hover:bg-ink/[0.04] dark:hover:bg-white/[0.04]'}
                        `}
                      >
                        {radiusLabel(r)} <span className="opacity-60">mi</span>
                      </button>
                    ))}
                  </div>
                </div>
            </div>
          </div>

          <LocationPicker
            locations={locations}
            radiusMiles={radiusMiles}
            onAdd={(loc) => setLocations((a) => [...a, loc])}
            className="w-full h-[clamp(380px,46vh,560px)]"
          />

          {/* Footer: dropped-pin chips */}
          <div className="relative px-[clamp(20px,3vw,32px)] py-3 border-t border-ink/[0.06] dark:border-white/[0.04]">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {locations.length === 0 ? (
                <p className="text-[11px] font-mono text-ink/45 dark:text-slate-500 italic">
                  No pins yet — click the map, or search an address above.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {locations.map((l, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 rounded-full border border-ink/[0.10] dark:border-white/[0.08] bg-paper-100/50 dark:bg-espresso-900/40 pl-3 pr-1.5 py-1.5"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-terracotta-500 flex-shrink-0" aria-hidden />
                      <span className="max-w-[240px] truncate text-[12px] text-ink dark:text-paper-100">
                        {l.label || `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLocations((a) => a.filter((_, j) => j !== i))}
                        className="grid place-items-center w-5 h-5 rounded-full text-[11px] leading-none text-ink/40 dark:text-slate-500 hover:text-brick-500 hover:bg-brick-500/[0.08] transition-colors"
                        aria-label={`Remove ${l.label || 'pin'}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <span className="ml-auto text-[9px] font-mono uppercase tracking-wider text-ink/45 dark:text-slate-500 tabular-nums whitespace-nowrap">
                {locations.length} {locations.length === 1 ? 'pin' : 'pins'} · {radiusLabel(radiusMiles)} mi each
              </span>
            </div>
          </div>
        </section>

        {/* ─── ② + ③ — full-width stations. The live preview is a pane
            INSIDE ② so it reacts right beside the chips being toggled;
            ③ closes the page at full width. One <form> spans both cards
            so Enter in the email field still submits. ──────────────── */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="mt-[clamp(20px,2.5vw,32px)] space-y-[clamp(20px,2.5vw,32px)]"
        >
          <section
            className="glass-card relative rounded-[28px] rounded-bl-none overflow-hidden glow-host"
            style={{ '--glow': '#5c9693' } as CSSProperties}
          >
            <div className="glow-corner is-lg" style={{ opacity: 0.3 }} />

            {/* ② — What to watch for: streams (identity chips) + the
                only-these-kinds / released / pulse sub-layers on the left,
                live preview pane on the right.
                NB: track list uses underscores, not commas — a comma-
                separated grid-template-columns is invalid CSS and
                silently stacks. */}
            <FormSection n={2} label="What to watch for" isFirst>
              <div className="grid items-start gap-[clamp(20px,2.5vw,32px)] lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]">
                <div className="min-w-0">
              {(() => {
                const chip = (s: (typeof LIVE_STREAM_OPTIONS)[number]) => {
                  const selected = streams.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStreams((a) => toggle(a, s.id))}
                      aria-pressed={selected}
                      className={`
                        group relative flex items-start gap-2.5 rounded-[12px] border px-3.5 py-3 text-left
                        transition-all duration-200
                        ${selected
                          ? 'border-transparent shadow-sm'
                          : 'border-ink/15 dark:border-white/[0.10] hover:border-ink/30 dark:hover:border-white/[0.20]'}
                      `}
                      style={selected ? {
                        backgroundColor: s.pigment.tintLight,
                        borderColor: s.pigment.border,
                      } : undefined}
                    >
                      <span
                        className="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform"
                        style={{
                          backgroundColor: s.pigment.dot,
                          boxShadow: selected ? `0 0 0 3px ${s.pigment.tintLight}` : undefined,
                          transform: selected ? 'scale(1.1)' : undefined,
                        }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`font-display italic text-[14px] leading-tight ${selected ? 'text-ink dark:text-paper-100' : 'text-ink/75 dark:text-paper-100/80'}`}>
                          {s.label}
                        </p>
                        <p className="mt-0.5 text-[9px] font-mono uppercase tracking-[0.14em] text-ink/45 dark:text-slate-400">
                          {s.sublabel}
                        </p>
                      </div>
                    </button>
                  )
                }
                return (
                  <>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {LIVE_STREAM_OPTIONS.map(chip)}
                    </div>

                    {/* Sub-layer: significance filters — narrows 911 + Fire & EMS
                        only, so it lives right under the live chips it refines. */}
                    <div className="mt-4 mb-1.5 flex items-center gap-2">
                      <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-ink/45 dark:text-slate-400">
                        ── Only these kinds
                      </span>
                      <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-ink/35 dark:text-slate-500">
                        · optional
                      </span>
                      <div className="flex-1 h-px bg-ink/[0.08] dark:bg-white/[0.06]" />
                    </div>
                    <p className="mb-2.5 text-[12.5px] leading-relaxed text-ink/60 dark:text-slate-400">
                      Leave these empty to get every event on your chosen streams — or
                      narrow 911 and Fire &amp; EMS to just the kinds that matter to you.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {CATEGORY_OPTIONS.map((c) => {
                        const selected = categories.includes(c.key)
                        return (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => setCategories((a) => toggle(a, c.key))}
                            aria-pressed={selected}
                            className={`
                              rounded-full px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider
                              border transition-colors
                              ${selected
                                ? 'border-brick-500 bg-brick-500/12 text-brick-500'
                                : 'border-ink/15 dark:border-white/[0.10] text-ink/55 dark:text-slate-400 hover:border-ink/25 dark:hover:border-white/[0.20]'}
                            `}
                          >
                            {c.label}
                          </button>
                        )
                      })}
                    </div>

                    <div className="mt-4 mb-1.5 flex items-center gap-2">
                      <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-ink/45 dark:text-slate-400">
                        ── Released on a delay
                      </span>
                      <div className="flex-1 h-px bg-ink/[0.08] dark:bg-white/[0.06]" />
                    </div>
                    <p className="mb-2.5 text-[12.5px] leading-relaxed text-ink/60 dark:text-slate-400">
                      These arrive when the city publishes new data, not in real time — crash
                      reports land in batches roughly 4–6 weeks behind; business registrations
                      refresh nightly. Your digest includes them as they're released.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {RELEASED_STREAM_OPTIONS.map(chip)}
                    </div>
                    <div className="mt-4 mb-1.5 flex items-center gap-2">
                      <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-ink/45 dark:text-slate-400">
                        ── Neighborhood pulse
                      </span>
                      <div className="flex-1 h-px bg-ink/[0.08] dark:bg-white/[0.06]" />
                    </div>
                    <p className="mb-2.5 text-[12.5px] leading-relaxed text-ink/60 dark:text-slate-400">
                      A short read on how the neighborhoods around your pins are running —
                      included when activity climbs well above its usual pace. Quiet
                      neighborhoods say nothing.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setPulse((p) => !p)}
                        aria-pressed={pulse}
                        className={`
                          group relative flex items-start gap-2.5 rounded-[12px] border px-3.5 py-3 text-left
                          transition-all duration-200
                          ${pulse
                            ? 'border-transparent shadow-sm'
                            : 'border-ink/15 dark:border-white/[0.10] hover:border-ink/30 dark:hover:border-white/[0.20]'}
                        `}
                        style={pulse ? {
                          backgroundColor: 'rgba(212, 164, 53, 0.10)',
                          borderColor: '#e0bc5e',
                        } : undefined}
                      >
                        <span
                          className="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform"
                          style={{
                            backgroundColor: '#d4a435',
                            boxShadow: pulse ? '0 0 0 3px rgba(212, 164, 53, 0.10)' : undefined,
                            transform: pulse ? 'scale(1.1)' : undefined,
                          }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`font-display italic text-[14px] leading-tight ${pulse ? 'text-ink dark:text-paper-100' : 'text-ink/75 dark:text-paper-100/80'}`}>
                            Neighborhood pulse
                          </p>
                          <p className="mt-0.5 text-[9px] font-mono uppercase tracking-[0.14em] text-ink/45 dark:text-slate-400">
                            busier than usual · nearby areas
                          </p>
                        </div>
                      </button>
                    </div>
                  </>
                )
              })()}
                </div>

                {/* The reactive proof, in the same card as the controls it
                    answers. Pane variant: inset frame, no glow — the parent
                    card stays the single glowing surface. */}
                <LivePreview
                  variant="pane"
                  email={email}
                  streams={streams}
                  categories={categories}
                  radiusMiles={radiusMiles}
                  locations={locations}
                  pulse={pulse}
                />
              </div>
            </FormSection>
          </section>

          <section
            className="glass-card relative rounded-[28px] rounded-bl-none overflow-hidden glow-host"
            style={{ '--glow': '#5c9693' } as CSSProperties}
          >
            <div className="glow-corner is-lg" style={{ opacity: 0.3 }} />

            {/* ③ — Email — the commitment, asked for last, closing the page
                at full width. Input + button share the row: the act of typing
                and the act of committing sit together, like a masthead
                subscription slip. The input holds to half the card — a
                slip-sized field, not a form-sized one. */}
            <FormSection n={3} label="Where to send" isFirst>
              <div className="flex items-stretch gap-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-label="Your email address"
                  className="min-w-0 flex-1 max-w-[50%] rounded-md border border-ink/15 dark:border-white/[0.12] bg-paper-100/60 dark:bg-espresso-900/60 px-3.5 py-2.5 text-[15px] text-ink dark:text-paper-100 placeholder:text-ink/35 dark:placeholder:text-slate-500 focus:border-teal-500 focus:outline-none transition-colors"
                />
                <SubscribeButton
                  onClick={submit}
                  sending={status === 'sending'}
                  disabled={status === 'sending'}
                />
              </div>
              {/* Read-me text, not a label — body serif, not mono (house rule:
                  mono is for labels/data; prose in mono reads robotic). */}
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink/55 dark:text-slate-400">
                First we email you a confirmation link — nothing starts until you click it.
                Every digest includes a one-click unsubscribe, which also deletes your info.
              </p>
              {/* Error rail */}
              {errorMsg && (
                <div className="mt-4 rounded-md border border-brick-500/30 bg-brick-500/[0.06] px-3.5 py-2.5">
                  <p className="text-[12px] font-mono text-brick-500">{errorMsg}</p>
                </div>
              )}
            </FormSection>
          </section>
        </form>

        <Colophon />
      </div>
    </div>
  )
}

// ─── Hero band ───────────────────────────────────────────────────────────────

// Dana hero-art placement, shared by both theme variants: anchored to the card's
// right edge at full card height, bleeding past the right/bottom (the card's
// overflow-hidden clips it), with a left-edge mask that dissolves the art into
// the copy so the text never fights the swirl at narrow widths.
//
// The two assets differ in how they meet the card:
//   • dark  — keeps its espresso ground (#261512), which matches the dark
//             glass-card surface (~#261a11) to within a few units, so its edges
//             simply vanish into the card.
//   • light — ground is knocked out to TRANSPARENT. Its cream ground (#f7ebd3)
//             is 36 blue-levels off the near-white light card (#fdfbf7), which
//             would have shown as a warm rectangle; the card's own surface now
//             shows through instead. (Cut by edge-connected flood fill, so
//             Dana's interior cream belly survives — colour alone would have
//             punched a hole in it.)
const HERO_ART =
  'pointer-events-none select-none absolute inset-y-0 right-0 h-full w-auto ' +
  'max-w-[54%] xl:max-w-[60%] object-cover object-right ' +
  '[mask-image:linear-gradient(to_right,transparent,#000_50%)] ' +
  '[-webkit-mask-image:linear-gradient(to_right,transparent,#000_50%)]'

function HeroBand() {
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  return (
    <header
      className="glass-card relative rounded-[28px] rounded-bl-none overflow-hidden glow-host lg:flex lg:items-start lg:min-h-[clamp(380px,38vw,560px)]"
      style={{ '--glow': '#b85a33' } as CSSProperties}
    >
      <div className="glow-corner is-lg" style={{ opacity: 0.55 }} />

      {/* Dana — one asset per theme, swapped through `src` rather than two
          CSS-toggled <img>s. A display:none image is still DOWNLOADED, so the
          CSS approach fetched BOTH grounds (~480kB) just to show one; this
          fetches only the active theme's. loading="lazy" additionally skips the
          fetch below lg, where the art is hidden and the copy takes full width. */}
      <img
        src={isDarkMode ? '/dana-alerts-hero.webp' : '/dana-alerts-hero-light.webp'}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className={`hidden lg:block ${HERO_ART}`}
      />

      <div className="relative px-[clamp(20px,3vw,40px)] py-[clamp(24px,3vw,40px)]">
        <div className="max-w-[38rem]">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-px w-7 bg-terracotta-500/60" />
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-terracotta-500">
              Daily Newsletter · The Last 48
            </p>
          </div>

          <h1
            className="font-display text-ink dark:text-paper-100 leading-[0.95]"
            style={{ fontSize: 'clamp(2.75rem, 5vw + 0.5rem, 6rem)' }}
          >
            <em>Your block,</em>
            <br />
            <span className="text-ink/55 dark:text-slate-400">in your inbox.</span>
          </h1>

          <p className="mt-5 text-[15px] leading-relaxed text-ink/70 dark:text-slate-300">
            A daily brief when events on 911, Fire&nbsp;&amp;&nbsp;EMS, or 311 happen
            near the places you choose. Pin a corner, set a radius, pick what
            counts. Quiet days send nothing.
          </p>

          {/* Editorial pull-quote — stacked under the copy so the right of the
              card stays open for Dana. */}
          <aside className="mt-7 border-l-2 border-terracotta-500/30 pl-5">
            <p className="font-display italic text-[15px] leading-snug text-ink/75 dark:text-paper-100/85">
              “Most blocks have quiet days. We never fill an inbox just to prove we’re
              working — silence is the signal that nothing matched.”
            </p>
            <p className="mt-2 text-[9px] font-mono uppercase tracking-[0.22em] text-ink/40 dark:text-slate-500">
              ── Editor’s note
            </p>
          </aside>
        </div>
      </div>
    </header>
  )
}

// ─── Numbered editorial step mark ────────────────────────────────────────────
// The sequence pill is the page's wayfinding device (feedback from a real
// first-time reader: the old 11px "01/02" mono marks were invisible, and the
// page read as one undifferentiated wall). Three big numbered steps guide the
// eye; everything else is a sub-layer. Numerals are bare (1, not 01) and set
// in the same display italic as the labels so pill + label read as one voice.

function StepMark({ n }: { n: number }) {
  return (
    <span
      className="grid w-11 h-11 flex-shrink-0 place-items-center rounded-full bg-terracotta-500 text-white shadow-sm"
      aria-hidden
    >
      <span className="font-display italic text-[22px] leading-none">{n}</span>
    </span>
  )
}

function FormSection({
  n,
  label,
  isFirst,
  children,
}: {
  n: number
  label: string
  isFirst?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={`relative px-6 py-6 ${isFirst ? '' : 'border-t border-ink/[0.06] dark:border-white/[0.04]'}`}
    >
      <div className="flex items-center gap-3.5 mb-4">
        <StepMark n={n} />
        <h2 className="font-display italic text-[clamp(20px,2vw,24px)] text-ink dark:text-paper-100">
          {label}
        </h2>
      </div>
      {children}
    </section>
  )
}

// ─── Subscribe button — sits beside the email input; deliberately plain ─────
// No notch tab here (Jesse, July 2026): beside an input the accent plate read
// as a second control. The display-italic label carries the identity alone.

function SubscribeButton({
  onClick,
  sending,
  disabled,
}: {
  onClick: () => void
  sending: boolean
  disabled: boolean
}) {
  return (
    <button
      type="submit"
      onClick={onClick}
      disabled={disabled}
      className="
        inline-flex items-center justify-center
        rounded-md
        bg-terracotta-500 hover:bg-terracotta-600
        text-white
        px-6
        shadow-sm hover:shadow-md
        transition-all duration-300
        disabled:opacity-60 disabled:cursor-not-allowed
        whitespace-nowrap
      "
    >
      <span className="font-display italic text-[17px] leading-tight">
        {sending ? 'Sending…' : 'Subscribe'}
      </span>
    </button>
  )
}

// ─── Colophon — newspaper-style fine print ──────────────────────────────────

function Colophon() {
  return (
    <footer className="mt-12 pt-6 border-t border-ink/[0.06] dark:border-white/[0.04]">
      <div className="grid gap-3 sm:grid-cols-[1fr,auto] items-baseline">
        <p className="text-[10px] font-mono text-ink/45 dark:text-slate-500 leading-relaxed max-w-[40rem]">
          DataDiver Alerts is a free public-interest service. The matcher
          running in your browser right now is the same code that decides
          what the daily digest sends — there is no separate preview pipeline
          to drift from. Data flows from{' '}
          <a
            href="https://data.sfgov.org"
            target="_blank" rel="noopener noreferrer"
            className="underline underline-offset-2 text-ink/55 dark:text-slate-400 hover:text-terracotta-500 transition-colors"
          >
            data.sfgov.org
          </a>{' '}
          via the Socrata SODA API.
        </p>
        <p className="text-[9px] font-mono uppercase tracking-[0.22em] text-ink/40 dark:text-slate-500">
          DataDiver · jlabsf.org
        </p>
      </div>
    </footer>
  )
}

// ─── Confirmation screen — same editorial register as the hero ──────────────

function ConfirmationScreen({ email }: { email: string }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[640px] px-[clamp(16px,3vw,48px)] pt-[clamp(48px,8vw,120px)]">
        <div
          className="glass-card relative rounded-[28px] rounded-bl-none overflow-hidden glow-host"
          style={{ '--glow': '#7a9954' } as CSSProperties}
        >
          <div className="glow-corner is-lg" style={{ opacity: 0.55 }} />

          <div className="relative px-[clamp(24px,4vw,48px)] py-[clamp(28px,4vw,52px)]">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="h-px w-7 bg-moss-500/60" />
              <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-moss-500">
                One more step
              </p>
            </div>

            <h1
              className="font-display text-ink dark:text-paper-100 leading-[0.95] mb-5"
              style={{ fontSize: 'clamp(2rem, 3.5vw + 0.5rem, 3.5rem)' }}
            >
              <em>Check your inbox.</em>
            </h1>

            <p className="text-[15px] leading-relaxed text-ink/70 dark:text-slate-300 mb-3">
              We sent a confirmation link to{' '}
              <strong className="text-ink dark:text-paper-100 font-normal">{email}</strong>.
              Click it to activate your daily alerts.
            </p>

            <p className="text-[12px] font-mono text-ink/50 dark:text-slate-400 leading-relaxed">
              Didn’t arrive in a few minutes? Check spam, or your filters. The sender is{' '}
              <span className="text-ink/70 dark:text-paper-100/80">alerts@jlabsf.org</span>.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
