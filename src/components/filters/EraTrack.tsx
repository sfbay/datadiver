// src/components/filters/EraTrack.tsx
// The header time strip: one bar per year of the record, with a brush that
// snaps to whole years. Presentational — no store access, no fetching.
//
// Honesty requirements baked in here, per the spec:
//  - the partial current year is hatched, never drawn as a solid collapse
//  - seams (definitional discontinuities) get a dashed rule, and their PROSE
//    lives in the view that owns them, next to the data it qualifies —
//    CrimeIncidents states the 2018 category change on its Total card, which
//    is where a reader looking at pre-2018 counts is actually looking. The
//    axis carries year ticks only; it was too narrow to hold both.
//  - a clamp that hides published rows still discloses here, because it has no
//    view-level home
//  - loading shows skeleton bars, never an empty strip

import { useRef, useCallback, useState, useEffect, useMemo } from 'react'
import { snapBrushToRange, type YearCount } from '@/utils/eraStrip'
import type { EraSeam } from '@/api/eraSources'

interface Props {
  years: YearCount[]
  domain: { start: string; end: string }
  seams: EraSeam[]
  /** Rendered on the axis when the domain clamp hides published rows. */
  value: { start: string; end: string }
  onChange: (w: { start: string; end: string }) => void
  isLoading?: boolean
  compact?: boolean
}

const yearOf = (iso: string) => Number(iso.slice(0, 4))

export default function EraTrack({
  years, domain, seams, value, onChange, isLoading, compact,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragAnchor, setDragAnchor] = useState<number | null>(null)
  // In-progress drag span, local only — the overlay renders from this while
  // dragging so the selection visibly follows the pointer, but `onChange`
  // (a global state write that refires ~11 dataset queries per view) fires
  // exactly once, on release. See Housing's EraStrip, whose d3 brush commits
  // on `.on('end')` rather than every intermediate move.
  const [dragPreview, setDragPreview] = useState<{ start: string; end: string } | null>(null)

  const minYear = yearOf(domain.start)
  const maxYear = yearOf(domain.end)
  const span = Math.max(1, maxYear - minYear + 1)
  const maxCount = Math.max(1, ...years.map((y) => y.count))
  const currentYear = yearOf(domain.end)

  /** Pointer x → fractional year position within the domain. */
  const xToYear = useCallback((clientX: number): number => {
    const el = ref.current
    if (!el) return minYear
    const r = el.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    return minYear + frac * span
  }, [minYear, span])

  const commit = useCallback((a: number, b: number) => {
    onChange(snapBrushToRange(Math.min(a, b), Math.max(a, b), domain.end, minYear))
  }, [onChange, domain.end, minYear])

  // Same snap math as `commit`, but returns the range instead of dispatching
  // it — used to compute the live drag preview without writing global state.
  const previewRange = useCallback(
    (a: number, b: number) => snapBrushToRange(Math.min(a, b), Math.max(a, b), domain.end, minYear),
    [domain.end, minYear],
  )

  /** Half-width of each edge's grab zone, in px. Wide enough to hit with a
   *  fingertip on the compact mobile strip, narrow enough that a press in the
   *  middle of a selection still starts a fresh one. */
  const HANDLE_GRAB_PX = 12

  const clampPct = (n: number) => Math.max(0, Math.min(100, n))
  const pct = (year: number) => ((year - minYear) / span) * 100

  // Tick density is a PIXEL problem, not a percentage one — the same 24-year
  // domain is legible in the expanded rail and cramped in the collapsed one —
  // so measure the rail rather than guessing a breakpoint.
  const [railW, setRailW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setRailW(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(([entry]) => setRailW(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /** Width a 4-digit Space Mono label needs at text-nano, plus breathing room. */
  const LABEL_PX = 26

  /** Both domain bounds always, plus interior ticks on a 5- or 10-year grid —
   *  whichever the measured rail can hold. An interior tick too close to a
   *  bound is dropped rather than overlapped: at ~10px/year, 2005 sits 20px
   *  from 2003 and would collide. */
  const tickYears = useMemo(() => {
    const bounds = [
      { year: minYear, align: 'start' as const, leftPct: 0 },
      { year: maxYear, align: 'end' as const, leftPct: 100 },
    ]
    if (railW <= 0) return bounds
    const pxPerYear = railW / span
    const stepYears = pxPerYear * 5 >= LABEL_PX ? 5 : 10
    const interior: Array<{ year: number; align: 'mid'; leftPct: number }> = []
    for (let y = Math.ceil(minYear / stepYears) * stepYears; y <= maxYear; y += stepYears) {
      if ((y - minYear) * pxPerYear < LABEL_PX) continue          // too near the left bound
      if ((maxYear + 1 - y) * pxPerYear < LABEL_PX) continue      // too near the right bound
      // Centered under the year's own band, so the label points at the bar it names.
      interior.push({ year: y, align: 'mid', leftPct: pct(y) + 100 / span / 2 })
    }
    return [bounds[0], ...interior, bounds[1]]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railW, minYear, maxYear, span])
  const activeRange = dragAnchor != null && dragPreview ? dragPreview : value
  // Clamped so a selection outside the current domain (e.g. arriving from a
  // different view with a wider era) shows a pinned sliver at the edge
  // instead of a selection that renders entirely off-strip.
  const selLeft = clampPct(pct(yearOf(activeRange.start)))
  const selRight = clampPct(pct(yearOf(activeRange.end) + 1))

  return (
    <div className="relative pt-1 pb-3">
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="History range"
        aria-valuemin={minYear}
        aria-valuemax={maxYear}
        // This control models a RANGE with a single slider role: aria-valuenow
        // carries the range's leading edge (the required numeric prop) while
        // aria-valuetext carries both edges for the announced string — don't
        // "simplify" by dropping valuetext.
        aria-valuenow={yearOf(value.start)}
        aria-valuetext={`${value.start} to ${value.end}`}
        className={`relative ${compact ? 'h-6' : 'h-9'} rounded
                    bg-slate-200/50 dark:bg-white/[0.05] cursor-crosshair
                    touch-none select-none`}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          const rect = e.currentTarget.getBoundingClientRect()
          const x = e.clientX - rect.left
          const y = xToYear(e.clientX)

          // Grab the nearer EDGE when the press lands on one, and anchor the
          // OPPOSITE edge so it stays put. Without this, every press started a
          // fresh zero-width brush at the cursor, so reaching for one edge
          // collapsed the selection and the far edge appeared to rush over to
          // meet it. Anchoring is expressed in the same fractional-year space
          // snapBrushToRange consumes: the left edge round-trips as its own
          // year, the right edge as year+1 (that function derives its end from
          // `round(x1) - 1`), so a held edge lands back on exactly itself.
          const leftPx = (clampPct(pct(yearOf(value.start))) / 100) * rect.width
          const rightPx = (clampPct(pct(yearOf(value.end) + 1)) / 100) * rect.width
          const nearLeft = Math.abs(x - leftPx) <= HANDLE_GRAB_PX
          const nearRight = Math.abs(x - rightPx) <= HANDLE_GRAB_PX

          // Ties go to whichever edge is genuinely closer — on a very narrow
          // selection both zones overlap.
          const grabLeft = nearLeft && (!nearRight || Math.abs(x - leftPx) <= Math.abs(x - rightPx))
          const anchor = grabLeft
            ? yearOf(value.end) + 1          // dragging the LEFT edge; right edge held
            : nearRight
              ? yearOf(value.start)          // dragging the RIGHT edge; left edge held
              : y                            // fresh selection from the press point

          setDragAnchor(anchor)
          setDragPreview(previewRange(anchor, y))
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (dragAnchor == null) return
          setDragPreview(previewRange(dragAnchor, xToYear(e.clientX)))
        }}
        onPointerUp={(e) => {
          if (dragAnchor != null) commit(dragAnchor, xToYear(e.clientX))
          setDragAnchor(null)
          setDragPreview(null)
        }}
        onPointerCancel={() => { setDragAnchor(null); setDragPreview(null) }}
        onLostPointerCapture={() => { setDragAnchor(null); setDragPreview(null) }}
      >
        {/* bars */}
        <div className="absolute inset-0 flex items-end gap-px px-px">
          {isLoading
            ? Array.from({ length: span }, (_, i) => (
                <div key={i} className="flex-1 rounded-t-[1px] bg-slate-300/40
                                        dark:bg-white/[0.07] animate-pulse"
                     style={{ height: '40%' }} />
              ))
            : years.map((y) => {
                const partial = y.year === currentYear
                return (
                  <div
                    key={y.year}
                    className={`flex-1 rounded-t-[1px] ${
                      partial ? 'bg-[repeating-linear-gradient(135deg,rgba(212,113,73,.32)_0_3px,transparent_3px_6px)]'
                              : 'bg-[#d47149]/30'}`}
                    style={{ height: `${Math.max(8, (y.count / maxCount) * 100)}%` }}
                    title={`${y.year}: ${y.count.toLocaleString()}${partial ? ' (partial year)' : ''}`}
                  />
                )
              })}
        </div>

        {/* seams — definitional discontinuities, labeled */}
        {seams.map((s) => (
          <div key={s.year}
               className="absolute top-0 bottom-0 border-l border-dashed border-paper-500/80"
               style={{ left: `${pct(s.year)}%` }}
               title={s.label} />
        ))}

        {/* selection */}
        <div className="absolute top-0 bottom-0 rounded-sm border-x-2
                        border-[#5c9693] bg-[#5c9693]/15 pointer-events-none
                        transition-all duration-150"
             style={{ left: `${selLeft}%`, width: `${Math.max(1, selRight - selLeft)}%` }} />

        {/* Edge affordances. Cursor only — they carry no listeners, because the
            parent's onPointerDown already decides intent from proximity. Their
            job is to make the handles DISCOVERABLE: without a cursor change,
            edge-dragging is a hidden gesture. Width matches HANDLE_GRAB_PX so
            what the cursor promises is what the hit test actually does. */}
        {!isLoading && (
          <>
            <div className="absolute top-0 bottom-0 w-6 -ml-3 cursor-ew-resize"
                 style={{ left: `${selLeft}%` }} aria-hidden="true" />
            <div className="absolute top-0 bottom-0 w-6 -ml-3 cursor-ew-resize"
                 style={{ left: `${selRight}%` }} aria-hidden="true" />
          </>
        )}
      </div>

      {/* Year ticks. Seam prose used to occupy this row and left space for only
          the two bounds, which made a 24-year strip impossible to read
          positionally. */}
      <div className="relative h-3 mt-0.5 text-nano font-mono tabular-nums
                      text-slate-400/60 dark:text-slate-600">
        {tickYears.map((t) => (
          <span
            key={t.year}
            className="absolute top-0"
            style={
              t.align === 'start' ? { left: 0 }
              : t.align === 'end' ? { right: 0 }
              : { left: `${t.leftPct}%`, transform: 'translateX(-50%)' }
            }
          >
            {t.year}
          </span>
        ))}
      </div>

      {/* A clamp that hides published rows is the one disclosure with no
          view-level home, so it stays — but only when it exists, and no longer
          competing with the year grid. */}
    </div>
  )
}
