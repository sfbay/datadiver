// YearStrip — spec §4C. One vertical bar per calendar year, first gift year
// through the current year (zero-filled gaps already baked into
// `profile.byYear` by funderStats — a gap here is a fact, not a hole).
// Bars stack by recipient TYPE (candidate bottom → measure → pac top) when
// `byType` is known; when the underlying gift list hit the 5K row cap,
// `byType` is null and the bar renders solid with a legend disclosure.
// Click toggles the year filter FunderCard hands down to Task 7's sections;
// the current (partial) year is hatched, never silently presented as final.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { formatCurrency } from '@/components/charts/TopRecipientsChart'
import type { FunderYear } from '@/lib/funders/types'

const PLOT_H = 90
const AXIS_H = 18
const SVG_H = PLOT_H + AXIS_H
const BAR_MIN = 22
const SCROLL_THRESHOLD = 16

const CANDIDATE = '#6b4563' // plum-600
const MEASURE = '#8b6282' // plum-500
const PAC = '#b08aa8' // plum-400
const HAIRLINE = '#a8926a' // paper-500
const RING = '#6b4563' // plum-600 — no plum-700 exists in the ramp

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function buildTitle(y: FunderYear): string {
  const total = y.cash + y.inKind
  const parts = [String(y.year), plural(y.gifts, 'gift'), formatCurrency(total)]
  if (y.byType) {
    if (y.byType.candidate > 0) parts.push(`${formatCurrency(y.byType.candidate)} candidates`)
    if (y.byType.measure > 0) parts.push(`${formatCurrency(y.byType.measure)} measures`)
    if (y.byType.pac > 0) parts.push(`${formatCurrency(y.byType.pac)} PACs`)
  }
  return parts.join(' · ')
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-nano font-mono uppercase tracking-widest text-slate-500 dark:text-slate-400">
      <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

export default function YearStrip({ years, selected, onSelect }: {
  years: FunderYear[]
  selected: number | null
  onSelect: (y: number | null) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const patternId = useId()

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setContainerWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Scrolled all the way right (newest year) on mount and whenever the
  // underlying data changes — never on a mere selection click.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    }
  }, [years])

  const scrolling = years.length > SCROLL_THRESHOLD
  const rawSlot = containerWidth > 0 ? containerWidth / Math.max(1, years.length) : BAR_MIN
  const slot = scrolling ? BAR_MIN : Math.max(BAR_MIN, rawSlot)
  const svgWidth = Math.max(containerWidth, slot * years.length)

  const maxTotal = useMemo(() => Math.max(1, d3.max(years, (y) => y.cash + y.inKind) ?? 1), [years])
  const yScale = useMemo(() => d3.scaleLinear().domain([0, maxTotal]).range([0, PLOT_H]), [maxTotal])

  const capped = years.some((y) => y.byType === null)

  if (years.length === 0) return null

  const stackSegments = (byType: NonNullable<FunderYear['byType']>, barX: number, bw: number) => {
    const order: Array<{ key: 'candidate' | 'measure' | 'pac'; color: string }> = [
      { key: 'candidate', color: CANDIDATE },
      { key: 'measure', color: MEASURE },
      { key: 'pac', color: PAC },
    ]
    let cum = 0
    return order.map(({ key, color }) => {
      const value = byType[key]
      if (value <= 0) return null
      const yTop = PLOT_H - yScale(cum + value)
      const yBottom = PLOT_H - yScale(cum)
      cum += value
      return <rect key={key} x={barX} y={yTop} width={bw} height={Math.max(0, yBottom - yTop)} fill={color} opacity={0.9} />
    })
  }

  const svgEl = (
    <svg width={svgWidth} height={SVG_H} className="overflow-visible">
      <defs>
        <pattern id={patternId} patternUnits="userSpaceOnUse" width={5} height={5} patternTransform="rotate(-45)">
          <line x1={0} y1={0} x2={0} y2={5} stroke={HAIRLINE} strokeWidth={0.6} opacity={0.35} />
        </pattern>
      </defs>
      {years.map((y, i) => {
        const bw = Math.max(4, slot - 4)
        const barX = i * slot + (slot - bw) / 2
        const total = y.cash + y.inKind
        const barH = total > 0 ? yScale(total) : 0
        const barTop = PLOT_H - barH
        const isSelected = selected === y.year
        const title = buildTitle(y)
        const showLabel = !scrolling || i === years.length - 1 || (years.length - 1 - i) % 2 === 0

        return (
          <g
            key={y.year}
            role="button"
            tabIndex={0}
            aria-label={title}
            onClick={() => onSelect(isSelected ? null : y.year)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(isSelected ? null : y.year)
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <title>{title}</title>
            {total === 0 ? (
              <rect x={barX} y={PLOT_H - 1} width={bw} height={1} fill={HAIRLINE} />
            ) : y.byType ? (
              stackSegments(y.byType, barX, bw)
            ) : (
              <rect x={barX} y={barTop} width={bw} height={barH} fill={MEASURE} opacity={0.9} />
            )}
            {y.partial && total > 0 && (
              <rect x={barX} y={barTop} width={bw} height={barH} fill={`url(#${patternId})`} opacity={0.35} />
            )}
            {isSelected && (
              <rect
                x={barX - 2}
                y={2}
                width={bw + 4}
                height={PLOT_H - 4}
                rx={2}
                fill="none"
                stroke={RING}
                strokeWidth={1.5}
              />
            )}
            {showLabel && (
              <text
                x={barX + bw / 2}
                y={PLOT_H + 10}
                textAnchor="middle"
                className="fill-ink dark:fill-paper-300 font-mono"
                style={{ fontSize: '0.5625rem' }}
                opacity={0.7}
              >
                {y.year}
              </text>
            )}
            {showLabel && y.partial && (
              <text
                x={barX + bw / 2}
                y={PLOT_H + AXIS_H - 1}
                textAnchor="middle"
                className="fill-ink dark:fill-paper-300 font-mono uppercase"
                style={{ fontSize: '0.5rem' }}
                opacity={0.55}
              >
                partial
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )

  return (
    <div ref={containerRef} className="mt-3">
      {scrolling ? (
        <div
          ref={scrollRef}
          className="overflow-x-auto"
          style={{
            maskImage: 'linear-gradient(to right, transparent, black 24px)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 24px)',
          }}
        >
          {svgEl}
        </div>
      ) : (
        svgEl
      )}

      <div className="flex flex-wrap items-center gap-3 mt-1.5">
        <LegendSwatch color={CANDIDATE} label="candidates" />
        <LegendSwatch color={MEASURE} label="measures" />
        <LegendSwatch color={PAC} label="PACs" />
        <span className="inline-flex items-center gap-1 text-nano font-mono uppercase tracking-widest text-slate-500 dark:text-slate-400">
          <svg width={10} height={10} className="shrink-0">
            <rect width={10} height={10} fill={`url(#${patternId})`} />
          </svg>
          partial
        </span>
        {capped && (
          <span className="text-nano font-mono text-slate-400 dark:text-slate-500 italic">
            type split unavailable — gift list capped
          </span>
        )}
      </div>
    </div>
  )
}
