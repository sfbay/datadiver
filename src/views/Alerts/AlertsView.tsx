// src/views/Alerts/AlertsView.tsx
//
// The Alerts builder — DataDiver's first user-facing backend surface.
// An editorial "newsroom desk" composition, map-first:
//
//   ┌─ HERO BAND ──────────────────────────────────────────────────┐
//   │ DAILY NEWSLETTER eyebrow · Fraunces italic display ·          │
//   │ pull-quote margin note (future home of Dana art)              │
//   └───────────────────────────────────────────────────────────────┘
//   ┌─ 01 · PLACES YOU WATCH — full-width map station ─────────────┐
//   │ chapter mark + bridge copy · address search · radius pills   │
//   │ hero-scale Mapbox (click to pin, circles render live)        │
//   │ footer: dropped-pin chips with remove                         │
//   └───────────────────────────────────────────────────────────────┘
//   ┌─ ENTRY (left) ────────────┐  ┌─ SAMPLE (right) ──────────────┐
//   │ 02 · Streams              │  │ LIVE PREVIEW                  │
//   │ 03 · Only these kinds     │  │ real recent matched events —  │
//   │ 04 · Your email           │  │ reacts as chips toggle        │
//   │ [ Subscribe ▸ notch ]     │  │                               │
//   └───────────────────────────┘  └───────────────────────────────┘
//   ┌─ COLOPHON ────────────────────────────────────────────────────┐
//
// On narrow viewports everything stacks in reading order:
// hero → map → entry → sample → colophon. The funnel is deliberate —
// pinning the map is play (zero commitment), streams/categories are
// configuration, email is commitment, and by then the preview has
// already shown the reader what they'll get.
//
// Layout grammar: `clamp()` everywhere instead of breakpoint jumps,
// echoing the Liquid layout pattern established on Home.

import { useState, type CSSProperties } from 'react'
import type { DatasetId } from '@/types/last48'
import type { AlertLocation, SubscriptionDraft } from '@/lib/alerts/types'
import { ALERT_RADII } from '@/lib/alerts/radii'
import { LocationPicker } from './LocationPicker'
import { LivePreview } from './LivePreview'

// ─── Stream pigments — same earth-tone identity each dataset wears
//     everywhere else in DataDiver (CLAUDE.md pigment vocabulary). ────
const STREAM_OPTIONS: {
  id: DatasetId
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
  const [streams, setStreams] = useState<DatasetId[]>(['911-realtime', 'fire-ems-dispatch'])
  const [categories, setCategories] = useState<string[]>([])
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
      filters: { streams, categories },
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

        {/* ─── 01 · PLACES YOU WATCH — full-width map station ──────────
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
            <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
              <div className="min-w-[260px] flex-1 max-w-[36rem]">
                <div className="flex items-baseline gap-3">
                  <span
                    className="font-mono text-[11px] tabular-nums text-terracotta-500/85 font-bold tracking-wider"
                    aria-hidden
                  >
                    01
                  </span>
                  <h2 className="font-display italic text-[19px] text-ink dark:text-paper-100">
                    Places you watch
                  </h2>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink/60 dark:text-slate-400">
                  Click anywhere on the map to drop a pin — home, work, school, the
                  corner you worry about. Each pin watches its own circle; your
                  digest covers all of them.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Address search — anchors its results dropdown */}
                <div className="relative w-[min(320px,72vw)]">
                  <div className="flex gap-2">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchAddress())}
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
                            onClick={() => {
                              setLocations((a) => [...a, { label: r.name, lat: r.lat, lng: r.lng }])
                              setResults([])
                              setQuery('')
                            }}
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

        {/* ─── ENTRY + SAMPLE — side by side at desktop width so the
            preview visibly reacts as chips toggle; stacks entry-then-
            sample on narrow viewports. ─────────────────────────────── */}
        <div className="mt-[clamp(20px,2.5vw,32px)] grid gap-[clamp(20px,2.5vw,32px)] lg:grid-cols-[minmax(0,1fr),minmax(0,1.08fr)]">
          {/* ENTRY — what counts, and where to send it */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
            className="glass-card relative rounded-[28px] rounded-bl-none overflow-hidden glow-host self-start"
            style={{ '--glow': '#5c9693' } as CSSProperties}
          >
            <div className="glow-corner is-lg" style={{ opacity: 0.3 }} />

            {/* 02 — Streams (identity chips) */}
            <FormSection n={2} label="Streams" isFirst>
              <div className="grid gap-2 sm:grid-cols-3">
                {STREAM_OPTIONS.map((s) => {
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
                })}
              </div>
            </FormSection>

            {/* 03 — Categories (only when relevant streams selected) */}
            <FormSection n={3} label="Only these kinds" optional>
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
              <p className="mt-2 text-[10px] font-mono text-ink/40 dark:text-slate-500 italic leading-relaxed">
                Leave empty to get every event on the chosen streams. Significance filters apply to 911 + Fire & EMS only.
              </p>
            </FormSection>

            {/* 04 — Email — the commitment, asked for last */}
            <FormSection n={4} label="Your email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Your email address"
                className="w-full rounded-md border border-ink/15 dark:border-white/[0.12] bg-paper-100/60 dark:bg-espresso-900/60 px-3.5 py-2.5 text-[15px] text-ink dark:text-paper-100 placeholder:text-ink/35 dark:placeholder:text-slate-500 focus:border-teal-500 focus:outline-none transition-colors"
              />
            </FormSection>

            {/* Error rail */}
            {errorMsg && (
              <div className="mx-6 mb-4 rounded-md border border-brick-500/30 bg-brick-500/[0.06] px-3.5 py-2.5">
                <p className="text-[12px] font-mono text-brick-500">{errorMsg}</p>
              </div>
            )}

            {/* Subscribe — notched corner accent matching VizCard idiom */}
            <div className="px-6 pb-6">
              <SubscribeButton
                onClick={submit}
                sending={status === 'sending'}
                disabled={status === 'sending'}
              />
              <p className="mt-3 text-[10px] font-mono text-ink/40 dark:text-slate-500 leading-relaxed">
                Double opt-in · we email a confirmation link first. One-click unsubscribe in every digest. We delete everything on the way out.
              </p>
            </div>
          </form>

          {/* SAMPLE — the editorial proof, reacting live to the entry card */}
          <aside className="min-w-0">
            <LivePreview
              email={email}
              streams={streams}
              categories={categories}
              radiusMiles={radiusMiles}
              locations={locations}
            />
          </aside>
        </div>

        <Colophon />
      </div>
    </div>
  )
}

// ─── Hero band ───────────────────────────────────────────────────────────────

function HeroBand() {
  return (
    <header
      className="glass-card relative rounded-[28px] rounded-bl-none overflow-hidden glow-host"
      style={{ '--glow': '#b85a33' } as CSSProperties}
    >
      <div className="glow-corner is-lg" style={{ opacity: 0.55 }} />

      <div className="relative grid gap-6 lg:grid-cols-[1fr,auto] lg:items-center px-[clamp(20px,3vw,40px)] py-[clamp(24px,3vw,40px)]">
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-px w-7 bg-terracotta-500/60" />
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-terracotta-500">
              Daily Newsletter · The Last 48
            </p>
          </div>

          <h1
            className="font-display text-ink dark:text-paper-100 leading-[0.95]"
            style={{ fontSize: 'clamp(2.25rem, 4vw + 0.5rem, 4.5rem)' }}
          >
            <em>Your block,</em>
            <br />
            <span className="text-ink/55 dark:text-slate-400">in your inbox.</span>
          </h1>

          <p className="mt-5 max-w-[34rem] text-[15px] leading-relaxed text-ink/70 dark:text-slate-300">
            A daily brief when events on 911, Fire&nbsp;&amp;&nbsp;EMS, or 311 happen
            near the places you choose. Pin a corner, set a radius, pick what
            counts. Quiet days send nothing.
          </p>
        </div>

        {/* Pull-quote margin note — editorial sidebar. Hidden on narrow viewports
            where the hero card needs vertical room rather than horizontal split.
            FUTURE: this slot is reserved for Dana art (harbor seal chasing
            anchovies down Valencia St) — swap the quote into a caption then. */}
        <aside className="hidden lg:block max-w-[18rem] border-l-2 border-terracotta-500/30 pl-5">
          <p className="font-display italic text-[15px] leading-snug text-ink/75 dark:text-paper-100/85">
            “Most blocks have quiet days. We never fill an inbox just to prove we’re
            working — silence is the signal that nothing matched.”
          </p>
          <p className="mt-2 text-[9px] font-mono uppercase tracking-[0.22em] text-ink/40 dark:text-slate-500">
            ── Editor’s note
          </p>
        </aside>
      </div>
    </header>
  )
}

// ─── Numbered editorial section mark ─────────────────────────────────────────

function FormSection({
  n,
  label,
  isFirst,
  optional,
  children,
}: {
  n: number
  label: string
  isFirst?: boolean
  optional?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={`relative px-6 py-5 ${isFirst ? '' : 'border-t border-ink/[0.06] dark:border-white/[0.04]'}`}
    >
      <div className="flex items-baseline gap-3 mb-3">
        <span
          className="font-mono text-[11px] tabular-nums text-terracotta-500/85 font-bold tracking-wider"
          aria-hidden
        >
          {String(n).padStart(2, '0')}
        </span>
        <div className="flex items-baseline gap-2">
          <h2 className="font-display italic text-[15px] text-ink dark:text-paper-100">
            {label}
          </h2>
          {optional && (
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-ink/40 dark:text-slate-500">
              optional
            </span>
          )}
        </div>
      </div>
      {children}
    </section>
  )
}

// ─── Subscribe button — notched-corner accent in DataDiver's tab idiom ──────

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
        group relative w-full inline-flex items-center justify-between gap-4
        rounded-[20px] rounded-bl-none
        bg-terracotta-500 hover:bg-terracotta-600
        text-white
        pl-5 pr-[60px] py-4
        shadow-sm hover:shadow-md
        transition-all duration-300
        disabled:opacity-60 disabled:cursor-not-allowed
        overflow-hidden
      "
    >
      <span className="font-display italic text-[19px] leading-tight">
        {sending ? 'Sending…' : 'Subscribe'}
      </span>
      <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-white/75 hidden sm:inline">
        confirm via email
      </span>

      {/* Top-right notched accent tab — paper / espresso plate with chevron */}
      <span
        className="
          absolute top-0 right-0 grid place-items-center
          w-[46px] h-[46px] rounded-tr-[20px] rounded-bl-[18px]
          bg-paper-100 dark:bg-espresso-700
          transition-[width,height] duration-300
          group-hover:w-[54px] group-hover:h-[54px]
        "
        aria-hidden
      >
        <svg
          width="14" height="14" viewBox="0 0 16 16" fill="none"
          stroke="#b85a33" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"
          className="transition-transform duration-300 group-hover:translate-x-0.5"
        >
          <path d="M5 3 L11 8 L5 13" />
        </svg>
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
