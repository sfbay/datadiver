import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { ERA_START_YEAR, ERA_ANNOTATIONS, snapBrushToRange, rangeToYearSpan } from './eraStripMath'
import type { YearCount, BuyoutYearCount } from './eraStripMath'

/** EraStrip — a slim always-visible band of annual eviction (terracotta) and
 *  buyout (ochre, stacked: disclosed + gray pending-amount) bars,
 *  1997–present, with a d3.brushX that snaps to whole years and drives the
 *  app's global date range. Era beats render as hoverable annotation markers
 *  (dot + HTML card), never as on-viz text; a year axis runs underneath.
 *
 *  Presentational only: props in, callback out. No store imports, no
 *  fetching — the parent (Housing view) owns data + the global dateRange. */

interface EraStripProps {
  evictionYears: YearCount[]
  buyoutYears: BuyoutYearCount[]
  range: { start: string; end: string }
  onRangeChange: (start: string, end: string) => void
  isLoading: boolean
}

/** Buyouts publish zero pre-ordinance — no bars, just the annotation. */
const BUYOUT_START_YEAR = 2015

/** Height reserved under the bars for the year axis labels. */
const AXIS_H = 13

/** Height of the count-label lane above the bars — a fixed horizontal row of
 *  annual eviction totals (empirical context; high/low emphasized). */
const LABEL_H = 12

const MARGIN = { top: 2, right: 2, bottom: 2, left: 2 }

/** Warm neutral for pending-amount bar segments — paper-500, the palette's
 *  "excluded/neutral" pigment (same family as the map's pending rings). */
const PENDING_GRAY = '#a8926a'

/** Date-only YYYY-MM-DD from local `Date` parts — this bounds a UI control
 *  (the brush's max-drag day), not data, so the viewer's clock is fine.
 *  Never toISOString() here (see sfTime.ts for why, for DATA timestamps). */
function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type PxSpan = [number, number]

function selectionsDiffer(a: PxSpan | null, b: PxSpan): boolean {
  if (!a) return true
  return Math.abs(a[0] - b[0]) > 0.5 || Math.abs(a[1] - b[1]) > 0.5
}

interface ActiveAnnotation {
  year: number
  label: string
  detail: string
  /** Marker center in container px (post-margin). */
  px: number
}

export default function EraStrip({ evictionYears, buyoutYears, range, onRangeChange, isLoading }: EraStripProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [activeAnno, setActiveAnno] = useState<ActiveAnnotation | null>(null)

  // Refs bridging the draw effect and the range-sync effect — the brush and
  // scale are recreated only when data/size change; range changes (picker
  // edits, brush drags) are applied to the existing brush/highlight without
  // a full rebuild.
  const xScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null)
  const brushRef = useRef<d3.BrushBehavior<unknown> | null>(null)
  const brushGRef = useRef<SVGGElement | null>(null)
  const highlightRef = useRef<SVGRectElement | null>(null)
  const glowRectRef = useRef<SVGRectElement | null>(null)

  // Always-fresh refs so effects that don't list these as deps (by design)
  // never read a stale closure.
  const rangeRef = useRef(range)
  rangeRef.current = range
  const onRangeChangeRef = useRef(onRangeChange)
  onRangeChangeRef.current = onRangeChange

  const currentYear = useMemo(() => new Date().getFullYear(), [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /** Position the highlight rect + brush selection to match rangeRef.current.
   *  Guarded: only calls brush.move when the snapped pixel span actually
   *  differs from the brush's current selection — this is what keeps the
   *  range-prop → brush sync from looping against the brush's own 'end'
   *  handler (which also checks event.sourceEvent before firing). */
  function syncToRange() {
    const x = xScaleRef.current
    const brushG = brushGRef.current
    if (!x || !brushG) return

    const { y0, y1 } = rangeToYearSpan(rangeRef.current)
    const target: PxSpan = [x(y0), x(y1 + 1)]

    if (highlightRef.current) {
      d3.select(highlightRef.current)
        .attr('x', target[0])
        .attr('width', Math.max(0, target[1] - target[0]))
    }
    if (glowRectRef.current) {
      d3.select(glowRectRef.current)
        .attr('x', target[0])
        .attr('width', Math.max(0, target[1] - target[0]))
    }

    const brush = brushRef.current
    if (!brush) return
    const current = d3.brushSelection(brushG) as PxSpan | null
    if (selectionsDiffer(current, target)) {
      d3.select(brushG).call(brush.move, target)
    }
  }

  // Main draw effect — bars, axis, annotation markers, and the brush itself.
  // Deliberately does NOT depend on `range`: rebuilding the whole strip on
  // every date-range edit would redraw static bars for no reason and could
  // fight the in-progress brush gesture. Range application is syncToRange().
  useEffect(() => {
    if (isLoading || !svgRef.current || size.width === 0 || size.height === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const w = Math.max(0, size.width - MARGIN.left - MARGIN.right)
    const fullH = Math.max(0, size.height - MARGIN.top - MARGIN.bottom)
    // Vertical layout: count-label lane (LABEL_H) / bars (h) / year axis (AXIS_H).
    const h = Math.max(0, fullH - AXIS_H - LABEL_H)
    if (w <= 0 || h <= 0) return

    const x = d3.scaleLinear().domain([ERA_START_YEAR, currentYear + 1]).range([0, w])
    xScaleRef.current = x

    const outerG = svg
      .attr('width', size.width)
      .attr('height', size.height)
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    // Bars, axis, annotations and the brush all live below the label lane.
    const g = outerG.append('g').attr('transform', `translate(0,${LABEL_H})`)

    // Highlight window rects — appended FIRST so they render under the bars.
    // Two layers: a base tint + the corner-glow signature RELOCATED onto the
    // selection itself (top-left-anchored teal radial, objectBoundingBox so
    // it stretches with the selected span) — the selected era reads as the
    // lit part of the strip. Positions get set for real by syncToRange()
    // right after this effect; start at zero width to avoid a one-frame
    // flash at the wrong span.
    const defs = svg.append('defs')
    const grad = defs
      .append('radialGradient')
      .attr('id', 'era-selection-glow')
      .attr('gradientUnits', 'objectBoundingBox')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', 1)
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#5c9693').attr('stop-opacity', 0.42)
    grad.append('stop').attr('offset', '55%').attr('stop-color', '#5c9693').attr('stop-opacity', 0.14)
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#5c9693').attr('stop-opacity', 0)

    const highlight = g
      .append('rect')
      .attr('class', 'fill-cream-300 dark:fill-espresso-700')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', 0)
      .attr('height', h)
      .attr('opacity', 0.45)
    highlightRef.current = highlight.node()

    const glowRect = g
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', 0)
      .attr('height', h)
      .attr('fill', 'url(#era-selection-glow)')
    glowRectRef.current = glowRect.node()

    const evictionByYear = new Map(evictionYears.map((d) => [d.year, d.count]))
    const buyoutByYear = new Map(
      buyoutYears.filter((d) => d.year >= BUYOUT_START_YEAR).map((d) => [d.year, d]),
    )
    const maxEviction = d3.max(evictionYears, (d) => d.count) || 1
    const maxBuyout = d3.max(Array.from(buyoutByYear.values()), (d) => d.count) || 1

    const yEvict = d3.scaleLinear().domain([0, maxEviction]).range([h, 0])
    const yBuyout = d3.scaleLinear().domain([0, maxBuyout]).range([h, 0])

    const years = d3.range(ERA_START_YEAR, currentYear + 1)
    const bandWidth = (yr: number) => x(yr + 1) - x(yr)

    // Eviction bars — left ~58% of each year's band.
    g.selectAll('.era-bar-eviction')
      .data(years)
      .enter()
      .append('rect')
      .attr('class', 'era-bar-eviction')
      .attr('x', (yr) => x(yr) + bandWidth(yr) * 0.06)
      .attr('width', (yr) => bandWidth(yr) * 0.56)
      .attr('y', (yr) => yEvict(evictionByYear.get(yr) ?? 0))
      .attr('height', (yr) => h - yEvict(evictionByYear.get(yr) ?? 0))
      .attr('fill', '#b85a33')
      .attr('opacity', 0.75)

    // Buyout bars — slimmer, right side, 2015 on. STACKED: ochre bottom
    // segment = amounts entered; gray top segment = pending entry (the Rent
    // Board keys amounts ~3 months behind — the tally still counts them).
    const buyoutSlice = years.filter((yr) => buyoutByYear.has(yr))
    const bx = (yr: number) => x(yr) + bandWidth(yr) * 0.68
    const bw = (yr: number) => bandWidth(yr) * 0.26

    g.selectAll('.era-bar-buyout-disclosed')
      .data(buyoutSlice)
      .enter()
      .append('rect')
      .attr('class', 'era-bar-buyout-disclosed')
      .attr('x', bx)
      .attr('width', bw)
      .attr('y', (yr) => {
        const d = buyoutByYear.get(yr)!
        // Disclosed segment sits at the bottom of the full-count bar.
        return yBuyout(d.disclosed)
      })
      .attr('height', (yr) => {
        const d = buyoutByYear.get(yr)!
        return h - yBuyout(d.disclosed)
      })
      .attr('fill', '#d4a435')
      .attr('opacity', 0.85)

    g.selectAll('.era-bar-buyout-pending')
      .data(buyoutSlice.filter((yr) => buyoutByYear.get(yr)!.count > buyoutByYear.get(yr)!.disclosed))
      .enter()
      .append('rect')
      .attr('class', 'era-bar-buyout-pending')
      .attr('x', bx)
      .attr('width', bw)
      .attr('y', (yr) => yBuyout(buyoutByYear.get(yr)!.count))
      .attr('height', (yr) => {
        const d = buyoutByYear.get(yr)!
        return yBuyout(d.disclosed) - yBuyout(d.count)
      })
      .attr('fill', PENDING_GRAY)
      .attr('opacity', 0.6)

    // Count-label lane — a fixed horizontal row of annual eviction totals
    // above the bars (empirical context). High/low years are emphasized
    // (terracotta peak / dusty-teal floor, matching the busy-warm ↔
    // quiet-teal site semantics) and always visible; the rest are dimmed and
    // desk-only. The current PARTIAL year is excluded from high/low
    // emphasis — a year-to-date count must never masquerade as a record.
    const completeYears = evictionYears.filter((d) => d.year < currentYear)
    const peakYear = d3.greatest(completeYears, (d) => d.count)?.year
    const floorYear = d3.least(completeYears, (d) => d.count)?.year

    outerG.selectAll('.era-count-label')
      .data(years.filter((yr) => evictionByYear.has(yr)))
      .enter()
      .append('text')
      .attr('class', (yr) => {
        if (yr === peakYear) return 'era-count-label fill-terracotta-500 font-mono'
        if (yr === floorYear) return 'era-count-label fill-teal-600 dark:fill-teal-400 font-mono'
        return 'era-count-label fill-ink dark:fill-paper-300 font-mono hidden desk:block'
      })
      .attr('x', (yr) => x(yr) + bandWidth(yr) * 0.34)
      .attr('y', LABEL_H - 4)
      .attr('text-anchor', 'middle')
      .attr('opacity', (yr) => (yr === peakYear || yr === floorYear ? 0.95 : yr === currentYear ? 0.35 : 0.5))
      .attr('font-weight', (yr) => (yr === peakYear || yr === floorYear ? 700 : 400))
      .style('font-size', '0.5rem')
      .text((yr) => (evictionByYear.get(yr) ?? 0).toLocaleString('en-US'))

    // Year axis under the bars — decade labels always visible, the
    // in-between fives desk-only (mobile keeps a readable sparse axis).
    const axisYears = d3.range(2000, currentYear + 1, 5)
    g.selectAll('.era-axis-year')
      .data(axisYears)
      .enter()
      .append('text')
      .attr('class', (yr) =>
        `era-axis-year fill-ink dark:fill-paper-300 font-mono ${yr % 10 === 0 ? '' : 'hidden desk:block'}`)
      .attr('x', (yr) => x(yr) + bandWidth(yr) * 0.34)
      .attr('y', h + AXIS_H - 3)
      .attr('text-anchor', 'middle')
      .attr('opacity', 0.55)
      .style('font-size', '0.5625rem')
      .text((yr) => String(yr))

    // Era annotation markers — dashed tick + a hoverable dot near the top;
    // the label + detail render as an HTML card via React state (never
    // on-viz SVG text). Click works where hover doesn't (touch).
    const annoG = g
      .selectAll('.era-annotation')
      .data(ERA_ANNOTATIONS)
      .enter()
      .append('g')
      .attr('class', 'era-annotation')

    annoG
      .append('line')
      .attr('x1', (d) => x(d.year) + bandWidth(d.year) * 0.34)
      .attr('x2', (d) => x(d.year) + bandWidth(d.year) * 0.34)
      .attr('y1', 10)
      .attr('y2', h)
      .attr('class', 'stroke-ink dark:stroke-paper-300')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2,2')
      .attr('opacity', 0.3)

    const markerCx = (d: (typeof ERA_ANNOTATIONS)[number]) => x(d.year) + bandWidth(d.year) * 0.34

    annoG
      .append('circle')
      .attr('class', 'era-annotation-dot fill-cream-100 dark:fill-espresso-900 stroke-ink dark:stroke-paper-200')
      .attr('cx', markerCx)
      .attr('cy', 5)
      .attr('r', 3.5)
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.9)

    // Oversized invisible hit target so the 7px dot is actually hoverable.
    annoG
      .append('circle')
      .attr('cx', markerCx)
      .attr('cy', 6)
      .attr('r', 10)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .on('mouseenter', (_evt, d) => setActiveAnno({ year: d.year, label: d.label, detail: d.detail, px: markerCx(d) + MARGIN.left }))
      .on('mouseleave', () => setActiveAnno(null))
      .on('click', (evt, d) => {
        evt.stopPropagation()
        setActiveAnno((cur) => (cur?.year === d.year ? null : { year: d.year, label: d.label, detail: d.detail, px: markerCx(d) + MARGIN.left }))
      })

    // Buyout-ordinance annotation at 2015 — rule-leading micro label idiom.
    // Stays TEXT at all widths: it is the disclosure that keeps pre-2015
    // emptiness from reading as "zero buyouts" (honesty ledger item 3).
    const buyoutX = x(BUYOUT_START_YEAR)
    g.append('line')
      .attr('x1', buyoutX)
      .attr('x2', buyoutX)
      .attr('y1', 0)
      .attr('y2', h)
      .attr('class', 'stroke-ochre-500')
      .attr('stroke-width', 1)
      .attr('opacity', 0.45)

    g.append('text')
      .attr('x', buyoutX + 3)
      .attr('y', 20) // one line below the annotation-dot lane — the 2016 marker sits at y≈5
      .attr('class', 'fill-ink dark:fill-paper-200 opacity-60 font-mono uppercase tracking-wider')
      .style('font-size', '0.5rem')
      .text('── BUYOUT ORDINANCE')

    // Brush — snaps to whole years on release. Extent covers the bar area
    // only; the axis strip below stays inert.
    const brush = d3
      .brushX()
      .extent([
        [0, 0],
        [w, h],
      ])
      .on('end', (event: d3.D3BrushEvent<unknown>) => {
        // Programmatic moves (from syncToRange) have no sourceEvent — bail
        // so this handler never re-fires onRangeChange for its own writes.
        if (!event.sourceEvent || !event.selection) return
        const [x0px, x1px] = event.selection as PxSpan
        const x0 = x.invert(x0px)
        const x1 = x.invert(x1px)
        const { start, end } = snapBrushToRange(x0, x1, todayIso())

        // Snap the visual selection to the exact whole-year pixel bounds
        // (the raw drag rarely lands on a year boundary).
        const { y0: sy0, y1: sy1 } = rangeToYearSpan({ start, end })
        const snappedPx: PxSpan = [x(sy0), x(sy1 + 1)]
        if (selectionsDiffer(event.selection as PxSpan, snappedPx)) {
          brushGSel.call(brush.move, snappedPx)
        }

        onRangeChangeRef.current(start, end)
      })

    const brushGSel = g.append('g').attr('class', 'era-strip-brush').call(brush)
    brushGSel.selectAll<SVGRectElement, unknown>('.selection').attr('fill', '#b85a33').attr('fill-opacity', 0.1).attr('stroke', '#b85a33').attr('stroke-opacity', 0.4)
    brushGSel.selectAll<SVGRectElement, unknown>('.handle').attr('fill', '#b85a33').attr('fill-opacity', 0.3)

    brushRef.current = brush
    brushGRef.current = brushGSel.node()

    // The brush overlay rect captures pointer events across the whole strip —
    // raise the annotation groups above it so their dots stay hoverable.
    // (Trade-off: a brush drag can't START on a dot's 10px hit circle.)
    g.selectAll('.era-annotation').raise()

    syncToRange()
  }, [evictionYears, buyoutYears, size.width, size.height, currentYear, isLoading])

  // Keep the highlight + brush selection synced to `range` — e.g. edits from
  // the global date picker — without rebuilding the bars.
  useEffect(() => {
    syncToRange()
  }, [range])

  // Annotation card sits BESIDE the marker (right by default, flipping left
  // near the strip's right edge) so the cursor hovering the dot never
  // obscures the card's text.
  const annoCardStyle = useMemo(() => {
    if (!activeAnno) return undefined
    const cardW = 240
    const gap = 14
    const left = activeAnno.px + gap + cardW <= size.width - 8
      ? activeAnno.px + gap
      : Math.max(8, activeAnno.px - gap - cardW)
    return { left, width: cardW }
  }, [activeAnno, size.width])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-20 desk:h-28 rounded-md bg-paper-50/70 dark:bg-espresso-900/60"
    >
      {isLoading ? (
        <div className="absolute inset-0 rounded-md bg-cream-200/60 dark:bg-white/[0.06] skeleton" />
      ) : (
        <>
          <svg ref={svgRef} className="w-full h-full" />
          {activeAnno && (
            <div
              className="absolute top-3 z-10 pointer-events-none rounded-md border border-paper-300/40 dark:border-espresso-700 bg-cream-100/95 dark:bg-espresso-900/95 px-2.5 py-1.5 shadow-lg"
              style={annoCardStyle}
            >
              <div className="font-mono uppercase tracking-wider text-micro text-ink dark:text-paper-200 opacity-80">
                {activeAnno.year} — {activeAnno.label}
              </div>
              <div className="text-label text-ink dark:text-paper-300 opacity-90 leading-snug mt-0.5">
                {activeAnno.detail}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
