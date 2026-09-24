import type { CSSProperties } from 'react'
import type { InspectionEra, PublishingCount, StorefrontSnapshot } from '@/lib/storefronts/types'
import { sfLocalCutoff } from '@/utils/sfTime'
import { FEED_BREAK, feedWindow, type FeedWindowId } from './inspectionFeed'
import { windowLabel, THIN_FEED_BADGE } from './restaurantPhrase'

/**
 * PublishingStrip — "What the city published" (spec §4.1). Replaces the
 * EraTrack on this dateless view.
 *
 * Inspections per year, 2016 → today, one lane per era IN ITS OWN UNIT:
 * the 2016–19 and 2020–23 sets count inspections (they publish one row per
 * violation), the live 2024+ set counts records (≈ one per visit). Each era's
 * bars are scaled to that era's own largest year and every bar carries its
 * figure, so no height is ever compared across eras. Hatched bands mark the
 * two stretches the city never published; a dotted tick marks July 1 2025,
 * where the live feed thins. Disclosure, not a trend: no line, no delta.
 *
 * The two card-window pills sit at its right end. Layout is HTML with
 * percentage positions (not SVG), so text sizes follow the rem root under
 * Large Type with nothing to re-measure.
 */

// ── geometry (pure) ────────────────────────────────────────────────────────

/** Where the axis starts: pyih-qa8i's first month. */
export const AXIS_START = '2016-10-01'

/** Each era's published span, [start, end) as 'YYYY-MM-DD'. `null` end =
 *  the axis end (the live feed runs to today). pyih-qa8i holds 99 inspections
 *  in October 2019 and one in November; 5tti-66ds ends Aug. 3, 2023. */
export const ERA_SPANS: Readonly<Record<InspectionEra, { start: string; end: string | null; unit: string; name: string }>> = {
  2016: { start: '2016-10-01', end: '2019-11-01', unit: 'inspections', name: 'Scores' },
  2020: { start: '2020-03-01', end: '2023-08-04', unit: 'inspections', name: 'Placards' },
  2024: { start: '2024-01-02', end: null, unit: 'records', name: 'Placards, live feed' },
}

/** The two stretches no dataset covers. */
export const NOT_PUBLISHED: readonly { start: string; end: string }[] = [
  { start: '2019-11-01', end: '2020-03-01' },
  { start: '2023-08-04', end: '2024-01-02' },
]

/** The COVID trough note sits over April–May 2020. */
export const COVID_NOTE = { start: '2020-04-01', end: '2020-06-01', label: 'COVID trough' }

/** Fractional months since year 0 — integer math on the digits, never Date. */
function monthPos(d: string): number {
  const y = Number(d.slice(0, 4))
  const m = Number(d.slice(5, 7))
  const day = Number(d.slice(8, 10)) || 1
  return y * 12 + (m - 1) + (day - 1) / 31
}

/** 0–100 position of a date on [AXIS_START, axisEnd]. */
export function axisPct(date: string, axisEnd: string): number {
  const a = monthPos(AXIS_START)
  const b = monthPos(axisEnd)
  const span = b - a || 1
  return Math.max(0, Math.min(100, ((monthPos(date) - a) / span) * 100))
}

export interface StripBar {
  era: InspectionEra
  year: number
  inspections: number
  /** 0–100 on the axis. */
  left: number
  width: number
  /** 0–1 of this era's own largest year. */
  height: number
  /** 'Jan.–Oct.' style note when the year is partly published; null when whole. */
  partial: string | null
}

const MONTH = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.']

/** The day before an exclusive 'YYYY-MM-DD' end, as a month index 0–11. */
function lastMonthBefore(end: string): number {
  const m = Number(end.slice(5, 7)) - 1
  return Number(end.slice(8, 10)) === 1 ? (m + 11) % 12 : m
}

/** Bars for the strip: each year clipped to its era's published span. */
export function stripBars(publishing: readonly PublishingCount[], axisEnd: string): StripBar[] {
  const eraMax = new Map<InspectionEra, number>()
  for (const p of publishing) eraMax.set(p.era, Math.max(eraMax.get(p.era) ?? 0, p.inspections))
  return publishing
    .slice()
    .sort((a, b) => a.year - b.year || a.era - b.era)
    .map((p) => {
      const span = ERA_SPANS[p.era]
      const spanEnd = span.end ?? axisEnd
      const from = `${p.year}-01-01` > span.start ? `${p.year}-01-01` : span.start
      const to = `${p.year + 1}-01-01` < spanEnd ? `${p.year + 1}-01-01` : spanEnd
      const left = axisPct(from, axisEnd)
      const width = Math.max(0, axisPct(to, axisEnd) - left)
      // A span opening Jan. 2 (the live feed) still covers the whole year.
      const whole = from.slice(5, 7) === '01' && to === `${p.year + 1}-01-01`
      const partial = whole ? null : `${MONTH[Number(from.slice(5, 7)) - 1]}–${MONTH[lastMonthBefore(to)]}`
      return { era: p.era, year: p.year, inspections: p.inspections, left, width, height: p.inspections / (eraMax.get(p.era) || 1), partial }
    })
}

/** The screen-reader sentence: every figure, in its era's unit. */
export function stripSummary(bars: readonly StripBar[]): string {
  return bars
    .map((b) => `${b.year}${b.partial ? ` (${b.partial})` : ''}: ${b.inspections.toLocaleString('en-US')} ${ERA_SPANS[b.era].unit}`)
    .join('; ')
}

// ── the component ──────────────────────────────────────────────────────────

const TEAL = '#2e5856'
const HATCH: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(135deg, rgba(168,146,106,0.35) 0 1px, transparent 1px 5px)',
}

const WINDOW_IDS: readonly FeedWindowId[] = ['since', 'before']

export default function PublishingStrip({
  snapshot,
  windowId,
  onWindow,
  edge,
}: {
  snapshot: StorefrontSnapshot | null
  windowId: FeedWindowId
  onWindow: (w: FeedWindowId) => void
  edge: string | null
}) {
  const sfToday = sfLocalCutoff(Date.now()).slice(0, 10)
  const axisEnd = (edge ?? snapshot?.asOf ?? sfToday).slice(0, 10)
  const bars = snapshot ? stripBars(snapshot.publishing, axisEnd) : []
  const breakPct = axisPct(FEED_BREAK, axisEnd)
  const eras = ([2016, 2020, 2024] as const).map((era) => {
    const s = ERA_SPANS[era]
    const left = axisPct(s.start, axisEnd)
    return { era, ...s, left, width: axisPct(s.end ?? axisEnd, axisEnd) - left }
  })

  return (
    <div className="flex flex-col desk:flex-row desk:items-end gap-3 desk:gap-5 px-4 desk:px-6 py-2.5 border-b border-slate-200/50 dark:border-white/[0.04] bg-white/40 dark:bg-slate-900/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <p className="font-mono text-micro uppercase tracking-[0.18em] text-paper-600 dark:text-paper-400">
            What the city published
          </p>
          <span className="flex items-center gap-1 font-mono text-nano text-paper-600 dark:text-paper-400">
            <span aria-hidden className="inline-block w-3 h-2.5 rounded-[2px]" style={HATCH} />
            not published
          </span>
        </div>

        <div
          role="img"
          aria-label={snapshot ? `Inspections published per year, each era in its own unit. ${stripSummary(bars)}.` : 'Loading'}
          className="relative h-12 desk:h-14"
        >
          {/* Not-published bands */}
          {NOT_PUBLISHED.map((g) => {
            const left = axisPct(g.start, axisEnd)
            return (
              <div
                key={g.start}
                className="absolute inset-y-0 rounded-sm"
                style={{ left: `${left}%`, width: `${axisPct(g.end, axisEnd) - left}%`, ...HATCH }}
                title="Not published"
              />
            )
          })}

          {/* Bars — one era, one scale; the figure rides on top (desk). */}
          <div className="absolute inset-x-0 top-3 bottom-0">
            {bars.map((b) => (
              <div
                key={`${b.era}-${b.year}`}
                className="absolute bottom-0 flex flex-col items-center justify-end"
                style={{ left: `${b.left}%`, width: `${b.width}%`, height: '100%' }}
                title={`${b.year}${b.partial ? ` (${b.partial})` : ''}: ${b.inspections.toLocaleString('en-US')} ${ERA_SPANS[b.era].unit}`}
              >
                <span className="hidden desk:block font-mono text-nano tabular-nums text-paper-700 dark:text-paper-300 leading-none mb-0.5 whitespace-nowrap">
                  {b.inspections.toLocaleString('en-US')}
                </span>
                <div
                  className="w-[calc(100%-2px)] rounded-t-sm"
                  style={{ height: `${Math.max(4, b.height * 72)}%`, backgroundColor: TEAL, opacity: b.era === 2024 ? 0.85 : 0.6 }}
                />
              </div>
            ))}
            {!snapshot && <div className="absolute inset-0 rounded-sm bg-paper-200/50 dark:bg-white/[0.04] animate-pulse" />}
          </div>

          {/* The feed break — a dotted tick, labelled. */}
          <div className="absolute inset-y-0 border-l border-dotted border-paper-600/80 dark:border-paper-400/70" style={{ left: `${breakPct}%` }}>
            <span className="absolute -top-0.5 left-1 font-mono text-nano text-paper-700 dark:text-paper-300 whitespace-nowrap leading-none">
              feed thins
            </span>
          </div>

          {/* COVID note */}
          {snapshot && (
            <span
              className="hidden desk:block absolute top-0 font-mono text-nano italic text-paper-600 dark:text-paper-400 whitespace-nowrap leading-none"
              style={{ left: `${axisPct(COVID_NOTE.start, axisEnd)}%` }}
            >
              {COVID_NOTE.label}
            </span>
          )}
        </div>

        {/* Era rail — name + unit under each era's span; years at the ends. */}
        <div className="relative h-4 mt-0.5">
          {eras.map((e) => (
            <span
              key={e.era}
              className="absolute top-0 border-t border-paper-400/60 dark:border-white/15 pt-0.5 font-mono text-nano text-paper-600 dark:text-paper-400 leading-none whitespace-nowrap"
              style={{ left: `${e.left}%`, width: `${e.width}%` }}
            >
              <span className="hidden desk:inline">{e.name} · </span>
              {e.unit}
            </span>
          ))}
        </div>
        <div className="flex justify-between font-mono text-nano tabular-nums text-paper-500 dark:text-paper-500 leading-none mt-0.5">
          <span>2016</span>
          <span>{axisEnd.slice(0, 4)}</span>
        </div>
      </div>

      {/* Card windows — never compared, never crossing the break. */}
      <div className="flex flex-wrap desk:flex-col gap-1.5 desk:items-stretch shrink-0" role="radiogroup" aria-label="Card window">
        {WINDOW_IDS.map((id) => {
          const active = id === windowId
          const w = feedWindow(id, sfToday)
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onWindow(id)}
              className={`relative px-2.5 py-1 rounded-md text-left font-mono text-micro transition-all duration-150 ${
                active
                  ? 'glow-host border border-[#2e5856]/40 bg-[#2e5856]/[0.14] text-[#2e5856] dark:text-[#8bb5b2]'
                  : 'border border-transparent bg-slate-100/80 dark:bg-white/[0.04] text-slate-500 hover:bg-slate-200/80 dark:hover:bg-white/[0.08]'
              }`}
              style={active ? ({ '--glow': TEAL } as CSSProperties) : undefined}
            >
              {active && <div className="glow-corner is-sm" style={{ top: -14, left: -14, width: 38, height: 38, opacity: 0.6, filter: 'blur(12px)' }} />}
              <span className="relative">{windowLabel(w)}</span>
              {id === 'since' && (
                <span className="relative ml-1.5 px-1 rounded-sm bg-paper-200/80 dark:bg-white/[0.06] text-paper-700 dark:text-paper-300 text-nano uppercase tracking-[0.12em]">
                  {THIN_FEED_BADGE}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
