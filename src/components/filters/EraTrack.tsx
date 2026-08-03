// src/components/filters/EraTrack.tsx
// The header time strip: one bar per year of the record, with a brush that
// snaps to whole years. Presentational — no store access, no fetching.
//
// Honesty requirements baked in here, per the spec:
//  - the partial current year is hatched, never drawn as a solid collapse
//  - seams (definitional discontinuities) get a dashed rule and a label
//  - loading shows skeleton bars, never an empty strip

import { useRef, useCallback, useState } from 'react'
import { snapBrushToRange, type YearCount } from '@/utils/eraStrip'
import type { EraSeam } from '@/api/eraSources'

interface Props {
  years: YearCount[]
  domain: { start: string; end: string }
  seams: EraSeam[]
  /** Rendered on the axis when the domain clamp hides published rows. */
  clampNote?: string
  value: { start: string; end: string }
  onChange: (w: { start: string; end: string }) => void
  isLoading?: boolean
  compact?: boolean
}

const yearOf = (iso: string) => Number(iso.slice(0, 4))

export default function EraTrack({
  years, domain, seams, clampNote, value, onChange, isLoading, compact,
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

  const clampPct = (n: number) => Math.max(0, Math.min(100, n))
  const pct = (year: number) => ((year - minYear) / span) * 100
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
          const y = xToYear(e.clientX)
          setDragAnchor(y)
          setDragPreview(previewRange(y, y))
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
      </div>

      {/* axis — the middle slot discloses, in priority order: a clamp that
          hides published rows, then a seam label. Both are honesty copy, so
          the clamp wins when a view somehow has both. */}
      <div className="flex justify-between mt-0.5 text-nano font-mono
                      text-slate-400/60 dark:text-slate-600">
        <span>{minYear}</span>
        {clampNote
          ? <span className="truncate px-2" title={clampNote}>{clampNote}</span>
          : seams.length > 0
            ? <span className="truncate px-2" title={seams[0].label}>{seams[0].label}</span>
            : null}
        <span>{maxYear}</span>
      </div>
    </div>
  )
}
