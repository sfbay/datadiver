// src/components/charts/SpanBar.tsx
//
// Two small time marks that replace "closed July 15 … cleared Aug. 1 — at
// most 17 days" sentences:
//
//   <DurationBar days={17} cap={30} />           a bar on a 0…cap day scale
//   <EpisodeStrip spans={…} axis={[a, b]} />    spans placed on a date axis
//
// An OPEN span (no later record) is hatched, never solid — the site's hatch
// idiom: hatched means "not comparable / no record", never "nothing
// happened". Visit ticks inside a span mark each inspection that found the
// place still closed. Layout math is pure in spanLayout.ts.

import { useId } from 'react'
import { durationWidth, layoutSpans, yearTicks, type SpanInput } from './spanLayout'

/** The hatch `<pattern>` every span mark shares (paper-500, −45°). */
function Hatch({ id, color }: { id: string; color: string }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width={4} height={4} patternTransform="rotate(-45)">
      <line x1={0} y1={0} x2={0} y2={4} stroke={color} strokeWidth={1} opacity={0.7} />
    </pattern>
  )
}

interface DurationBarProps {
  /** Days closed; null = no later record (drawn full-width, hatched). */
  days: number | null
  /** The scale's right end in days. Default 30. */
  cap?: number
  width?: number
  height?: number
  color: string
  /** Hatch + open-run colour. Default paper-500. */
  openColor?: string
  label?: string
  className?: string
}

export function DurationBar({
  days, cap = 30, width = 64, height = 6, color, openColor = '#a8926a', label, className = '',
}: DurationBarProps) {
  const id = `hatch-${useId().replace(/:/g, '')}`
  const { width: w, capped } = durationWidth(days, cap, width)
  const open = days === null
  return (
    <svg
      width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      className={`block shrink-0 ${className}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    >
      <defs><Hatch id={id} color={openColor} /></defs>
      <rect x={0} y={height / 2 - 0.5} width={width} height={1} fill={color} opacity={0.18} />
      <rect x={0} y={0} width={w} height={height} rx={1} fill={open ? `url(#${id})` : color} stroke={open ? openColor : 'none'} strokeWidth={open ? 0.5 : 0} opacity={open ? 0.9 : 1} />
      {capped && (
        // A break mark: the run is longer than the scale shows.
        <path d={`M${width - 5} ${height + 0.5} L${width - 2} -0.5`} stroke={color} strokeWidth={1.2} />
      )}
    </svg>
  )
}

interface EpisodeStripProps {
  spans: readonly SpanInput[]
  axis: readonly [string, string]
  width?: number
  height?: number
  color: string
  openColor?: string
  /** Draw a faint year rule under the spans. Default true. */
  years?: boolean
  label?: string
  className?: string
}

export function EpisodeStrip({
  spans, axis, width = 120, height = 10, color, openColor = '#a8926a', years = true, label, className = '',
}: EpisodeStripProps) {
  const id = `hatch-${useId().replace(/:/g, '')}`
  const boxes = layoutSpans(spans, axis, width)
  const ticks = years ? yearTicks(axis, width) : []
  const barY = 1
  const barH = height - 3
  return (
    <svg
      width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      className={`block shrink-0 ${className}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    >
      <defs><Hatch id={id} color={openColor} /></defs>
      <rect x={0} y={height - 1} width={width} height={1} fill={color} opacity={0.25} />
      {ticks.map((t) => <rect key={t.year} x={t.x} y={height - 3} width={1} height={3} fill={color} opacity={0.35} />)}
      {boxes.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={barY} width={b.width} height={barH} rx={1} fill={b.open ? `url(#${id})` : color} stroke={b.open ? openColor : 'none'} strokeWidth={b.open ? 0.5 : 0} />
          {b.tickXs.map((x, j) => <rect key={j} x={x - 0.5} y={barY - 1} width={1} height={barH + 2} fill={color} opacity={0.9} />)}
        </g>
      ))}
    </svg>
  )
}
