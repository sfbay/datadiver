// PlacardRibbon — the storefront biography's signature visual (spec §4.5
// item 2). One fixed axis, Oct. 2016 → the snapshot date:
//
//   ┌ names     ── bars of the names on inspection records (Fraunces italic)
//   │ readings  ── 2016–19 scores as tabular numerals ("92"; hollow = not
//   │              scored); 2020+ placards as moss / ochre / brick dots
//   └ owners    ── registered-owner bars (teal-700)
//
// Where name bars break but an owner bar runs through, the reader SEES "new
// name, same owner"; where an owner bar stops and later resumes, "owner came
// back". Hatched bands = the two stretches the city published nothing
// (hatched means "not comparable", never "nothing happened" — the site's
// hatch idiom); the dotted tick = July 2025, when the feed thins.
//
// Geometry is px; every SVG text size is rem via INLINE STYLE (never the
// font-size attribute, never a text-* token) so Large Type scales the labels,
// and the packing re-measures them against the live root font size. Wider
// than its container, the ribbon scrolls sideways (mobile) and opens scrolled
// to the present.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Storefront } from '@/lib/storefronts/types'
import { ownerGroupKey } from '@/lib/storefronts/ownerGroups'
import { apDate } from '@/utils/apDate'
import { normalizePlacard, PLACARD_COLOR, PLACARD_LABEL, type Placard } from './placard'
import { scoreBadge } from './restaurantPhrase'
import { dedupeLane, displayBusinessName, type InspectionRow } from './storefrontBiography'
import {
  FEED_THINS,
  labelWidth,
  labelledSpan,
  packRows,
  placeLabel,
  PUBLISHING_GAPS,
  RIBBON_START,
  ribbonScale,
  ribbonWidth,
  rowCount,
  yearTicks,
} from './placardRibbonLayout'

// Rem sizes (inline style) and their px-at-default twins for label estimates.
const NAME_REM = 0.625
const OWNER_REM = 0.5625
const READ_REM = 0.5
const AXIS_REM = 0.5

const PAD_L = 2
const PAD_R = 6
const TOP = 12 // room for the "feed thins" label
const ROW_H = 18
const READ_ROW_H = 11
const MAX_READ_ROWS = 3
const AXIS_H = 14
const DOT_R = 3

/** The live root font size in px (Large Type changes it), re-read when the
 *  html[data-type-scale] attribute flips. 16 on the server / in tests. */
function useRootFontPx(): number {
  const [px, setPx] = useState(16)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const read = () => {
      const v = parseFloat(getComputedStyle(document.documentElement).fontSize)
      if (Number.isFinite(v) && v > 0) setPx(v)
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-type-scale', 'style', 'class'] })
    return () => mo.disconnect()
  }, [])
  return px
}

/** The wrapper's content width, tracked by ResizeObserver. */
function useWidth(ref: React.RefObject<HTMLDivElement | null>, fallback: number): number {
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const next = Math.floor(entry.contentRect.width)
      if (next > 0) setW(next)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

interface Reading {
  date: string
  x: number
  kind: 'score' | 'unscored' | 'placard'
  text?: string
  placard?: Placard
  title: string
}

export default function PlacardRibbon({
  storefront,
  lane,
  asOf,
}: {
  storefront: Storefront
  lane: InspectionRow[] | null
  asOf: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const container = useWidth(wrapRef, 384)
  const rootPx = useRootFontPx()
  const hatchId = `ribbon-hatch-${useId().replace(/:/g, '')}`

  const layout = useMemo(() => {
    const width = ribbonWidth(container, RIBBON_START, asOf)
    const x = ribbonScale({ start: RIBBON_START, end: asOf, left: PAD_L, right: width - PAD_R })
    const namePx = NAME_REM * rootPx
    const ownerPx = OWNER_REM * rootPx
    const readPx = READ_REM * rootPx

    // Names register — one bar per operator, a one-date operator a short tick.
    const names = storefront.operators.map((op) => {
      const label = displayBusinessName(op.name)
      const x0 = x(op.firstDate)
      const x1 = Math.max(x0 + 3, x(op.lastDate))
      const lw = labelWidth(label, namePx)
      return { op, label, x0, x1, lw, span: labelledSpan(x0, x1, lw, width) }
    })
    const nameRows = packRows(names.map((n) => n.span), 6)

    // Owners register — one bar per registration (the same owner registered
    // twice, as at 2077 Hayes St, draws two bars with the gap between).
    const ownerBars: { name: string; from: string; to: string; open: boolean }[] = []
    const seenReg = new Set<string>()
    for (const op of storefront.operators) {
      const o = op.owner
      if (!o) continue
      const from = o.registeredFrom ?? op.firstDate
      const k = `${ownerGroupKey(o.name)}|${from}`
      if (seenReg.has(k)) continue
      seenReg.add(k)
      ownerBars.push({ name: o.name, from, to: o.registeredTo ?? asOf, open: !o.registeredTo })
    }
    const owners = ownerBars.map((b) => {
      const x0 = x(b.from)
      const x1 = Math.max(x0 + 3, x(b.to))
      const lw = labelWidth(b.name, ownerPx)
      return { ...b, x0, x1, lw, span: labelledSpan(x0, x1, lw, width) }
    })
    const ownerRows = packRows(owners.map((o) => o.span), 6)

    // Readings — each era in its own vocabulary, never converted.
    const readings: Reading[] = []
    for (const s of storefront.lanes.scores2016) {
      const when = apDate(s.date, 0)
      if (s.score === null) {
        readings.push({ date: s.date, x: x(s.date), kind: 'unscored', title: `${when} · ${s.type} · not scored` })
      } else {
        readings.push({ date: s.date, x: x(s.date), kind: 'score', text: String(s.score), title: `${when} · ${s.type} · ${scoreBadge(s.score)}` })
      }
    }
    const dots = new Set<string>()
    const pushPlacard = (date: string, p: Placard | null, what: string) => {
      if (!p || dots.has(`${date}|${p}`)) return
      dots.add(`${date}|${p}`)
      readings.push({ date, x: x(date), kind: 'placard', placard: p, title: `${apDate(date, 0)} · ${what} · ${PLACARD_LABEL[p]}` })
    }
    for (const r of storefront.lanes.placards2020) pushPlacard(r.date, normalizePlacard(r.status), displayBusinessName(r.name))
    for (const r of dedupeLane(lane ?? [])) {
      pushPlacard((r.inspection_date ?? '').slice(0, 10), normalizePlacard(r.facility_rating_status), displayBusinessName(r.dba))
    }
    const readSpans = readings.map((r) => {
      const half = r.kind === 'score' ? labelWidth(r.text!, readPx, 0.6) / 2 : DOT_R
      return { x0: r.x - half, x1: r.x + half }
    })
    const readRows = packRows(readSpans, 1, MAX_READ_ROWS)

    const nNameRows = Math.max(1, rowCount(nameRows))
    const nReadRows = Math.max(1, rowCount(readRows))
    const nOwnerRows = Math.max(1, rowCount(ownerRows))
    const namesTop = TOP
    const readTop = namesTop + nNameRows * ROW_H
    const ownersTop = readTop + nReadRows * READ_ROW_H + 4
    const axisTop = ownersTop + nOwnerRows * ROW_H
    const height = axisTop + AXIS_H

    return {
      width,
      height,
      x,
      names,
      nameRows,
      owners,
      ownerRows,
      readings,
      readRows,
      namesTop,
      readTop,
      ownersTop,
      axisTop,
      ticks: yearTicks(RIBBON_START, asOf),
    }
  }, [storefront, lane, asOf, container, rootPx])

  // Open scrolled to the present when the ribbon is wider than its box.
  useEffect(() => {
    const el = wrapRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [storefront.key, layout.width])

  const { width, height, x, axisTop } = layout
  const breakX = x(FEED_THINS)

  return (
    <div>
      <div ref={wrapRef} className="overflow-x-auto overscroll-x-contain -mx-1 px-1">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Inspection history at ${storefront.address}, October 2016 to ${apDate(asOf, 0)}`}
          className="block text-paper-800 dark:text-paper-200"
        >
          <defs>
            <pattern id={hatchId} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
              <line x1={0} y1={0} x2={0} y2={6} stroke="#a8926a" strokeWidth={1.4} opacity={0.55} />
            </pattern>
          </defs>

          {/* Not published — paper-500 wash + stripes, full register height. */}
          {PUBLISHING_GAPS.map((g) => {
            const gx0 = x(g.from)
            const gx1 = x(g.to)
            if (gx1 - gx0 < 0.5) return null
            return (
              <g key={g.from}>
                <title>{`Not published: ${apDate(g.from, 0)} – ${apDate(g.to, 0)}`}</title>
                <rect x={gx0} y={TOP - 2} width={gx1 - gx0} height={axisTop - TOP + 2} fill="#a8926a" opacity={0.1} />
                <rect x={gx0} y={TOP - 2} width={gx1 - gx0} height={axisTop - TOP + 2} fill={`url(#${hatchId})`} />
              </g>
            )
          })}

          {/* Feed thins — dotted reference tick (reference dotted, data solid). */}
          <line x1={breakX} x2={breakX} y1={2} y2={axisTop} stroke="currentColor" strokeWidth={1} strokeDasharray="1.5 2.5" opacity={0.6} />
          <text
            x={breakX - 3}
            y={9}
            textAnchor="end"
            className="font-mono fill-current"
            opacity={0.75}
            style={{ fontSize: `${AXIS_REM}rem` }}
          >
            feed thins
          </text>

          {/* Names register. */}
          {layout.names.map((n, i) => {
            const top = layout.namesTop + layout.nameRows[i] * ROW_H
            const lx = placeLabel(n.x0, n.lw, width)
            const once = !n.op.strict
            return (
              <g key={`${n.op.name}|${n.op.firstDate}`}>
                <title>{`${n.label} · ${apDate(n.op.firstDate, 0)}${n.op.lastDate !== n.op.firstDate ? ` – ${apDate(n.op.lastDate, 0)}` : ''}${n.op.seenOnce ? ' · seen once' : ''}`}</title>
                <text
                  x={lx}
                  y={top + 9}
                  className="font-display italic fill-current"
                  opacity={once ? 0.55 : 1}
                  style={{ fontSize: `${NAME_REM}rem` }}
                >
                  {n.label}
                </text>
                <rect
                  x={n.x0}
                  y={top + 12}
                  width={n.x1 - n.x0}
                  height={4}
                  rx={2}
                  className="fill-paper-700 dark:fill-paper-300"
                  opacity={once ? 0.45 : 0.9}
                />
              </g>
            )
          })}

          {/* Readings band — hairline guide, then scores / placard dots. */}
          <line
            x1={PAD_L}
            x2={width - PAD_R}
            y1={layout.readTop + READ_ROW_H / 2}
            y2={layout.readTop + READ_ROW_H / 2}
            stroke="currentColor"
            strokeWidth={0.5}
            opacity={0.2}
          />
          {layout.readings.map((r, i) => {
            const cy = layout.readTop + layout.readRows[i] * READ_ROW_H + READ_ROW_H / 2
            if (r.kind === 'score') {
              return (
                <text
                  key={`s${i}`}
                  x={r.x}
                  y={cy + 3}
                  textAnchor="middle"
                  className="font-mono fill-current"
                  style={{ fontSize: `${READ_REM}rem`, fontVariantNumeric: 'tabular-nums lining-nums' }}
                >
                  <title>{r.title}</title>
                  {r.text}
                </text>
              )
            }
            if (r.kind === 'unscored') {
              return (
                <circle key={`u${i}`} cx={r.x} cy={cy} r={2} fill="none" stroke="currentColor" strokeWidth={0.8} opacity={0.5}>
                  <title>{r.title}</title>
                </circle>
              )
            }
            return (
              <circle key={`p${i}`} cx={r.x} cy={cy} r={DOT_R} fill={PLACARD_COLOR[r.placard!]}>
                <title>{r.title}</title>
              </circle>
            )
          })}

          {/* Owners register — bar first, the registered name under it. */}
          {layout.owners.length === 0 ? (
            <text
              x={PAD_L}
              y={layout.ownersTop + 12}
              className="font-serif italic fill-current"
              opacity={0.6}
              style={{ fontSize: `${OWNER_REM}rem` }}
            >
              No registered owner matched
            </text>
          ) : (
            layout.owners.map((o, i) => {
              const top = layout.ownersTop + layout.ownerRows[i] * ROW_H
              return (
                <g key={`${o.name}|${o.from}`}>
                  <title>{`${o.name} · registered ${apDate(o.from, 0)}${o.open ? ' – still registered' : ` – ${apDate(o.to, 0)}`}`}</title>
                  <rect x={o.x0} y={top + 2} width={o.x1 - o.x0} height={5} rx={2.5} className="fill-teal-700 dark:fill-teal-500" />
                  <text
                    x={placeLabel(o.x0, o.lw, width)}
                    y={top + 15}
                    className="font-serif fill-current"
                    style={{ fontSize: `${OWNER_REM}rem` }}
                  >
                    {o.name}
                  </text>
                </g>
              )
            })
          )}

          {/* Year axis. */}
          <line x1={PAD_L} x2={width - PAD_R} y1={axisTop} y2={axisTop} stroke="currentColor" strokeWidth={0.5} opacity={0.35} />
          {layout.ticks.map((t) => {
            const tx = x(t.date)
            return (
              <g key={t.year}>
                <line x1={tx} x2={tx} y1={axisTop} y2={axisTop + 3} stroke="currentColor" strokeWidth={0.5} opacity={0.5} />
                <text
                  x={tx}
                  y={axisTop + AXIS_H - 2}
                  textAnchor="middle"
                  className="font-mono fill-current"
                  opacity={0.7}
                  style={{ fontSize: `${AXIS_REM}rem`, fontVariantNumeric: 'tabular-nums lining-nums' }}
                >
                  {t.year}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Key — plain words, no verdict colors in the chrome. */}
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-nano font-mono text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-1 rounded-full bg-paper-700 dark:bg-paper-300" /> names
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-1 rounded-full bg-teal-700 dark:bg-teal-500" /> registered owners
        </span>
        <span className="inline-flex items-center gap-1">
          {(['pass', 'conditional', 'closure'] as const).map((p) => (
            <span key={p} className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: PLACARD_COLOR[p] }} />
          ))}{' '}
          placards · numbers = 2016–19 scores
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block w-3 h-2"
            style={{ background: 'repeating-linear-gradient(45deg, rgba(168,146,106,0.55) 0 1.4px, rgba(168,146,106,0.1) 1.4px 4px)' }}
          />{' '}
          not published
        </span>
      </p>
    </div>
  )
}
