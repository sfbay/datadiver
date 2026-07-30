import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { ERA_START_YEAR, ERA_ANNOTATIONS, snapBrushToRange, rangeToYearSpan } from './eraStripMath'
import type { YearCount } from './eraStripMath'

/** EraStrip — a slim always-visible band of annual eviction (terracotta) and
 *  buyout (ochre) bars, 1997–present, with a d3.brushX that snaps to whole
 *  years and drives the app's global date range.
 *
 *  Presentational only: props in, callback out. No store imports, no
 *  fetching — the parent (Housing view) owns data + the global dateRange. */

interface EraStripProps {
  evictionYears: YearCount[]
  buyoutYears: YearCount[]
  range: { start: string; end: string }
  onRangeChange: (start: string, end: string) => void
  isLoading: boolean
}

/** Buyouts publish zero pre-ordinance — no bars, just the annotation. */
const BUYOUT_START_YEAR = 2015

const MARGIN = { top: 2, right: 2, bottom: 2, left: 2 }

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

export default function EraStrip({ evictionYears, buyoutYears, range, onRangeChange, isLoading }: EraStripProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  // Refs bridging the draw effect and the range-sync effect — the brush and
  // scale are recreated only when data/size change; range changes (picker
  // edits, brush drags) are applied to the existing brush/highlight without
  // a full rebuild.
  const xScaleRef = useRef<d3.ScaleLinear<number, number> | null>(null)
  const brushRef = useRef<d3.BrushBehavior<unknown> | null>(null)
  const brushGRef = useRef<SVGGElement | null>(null)
  const highlightRef = useRef<SVGRectElement | null>(null)

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

    const brush = brushRef.current
    if (!brush) return
    const current = d3.brushSelection(brushG) as PxSpan | null
    if (selectionsDiffer(current, target)) {
      d3.select(brushG).call(brush.move, target)
    }
  }

  // Main draw effect — bars, era annotations, and the brush behavior itself.
  // Deliberately does NOT depend on `range`: rebuilding the whole strip on
  // every date-range edit would redraw static bars for no reason and could
  // fight the in-progress brush gesture. Range application is syncToRange().
  useEffect(() => {
    if (isLoading || !svgRef.current || size.width === 0 || size.height === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const w = Math.max(0, size.width - MARGIN.left - MARGIN.right)
    const h = Math.max(0, size.height - MARGIN.top - MARGIN.bottom)
    if (w <= 0 || h <= 0) return

    const x = d3.scaleLinear().domain([ERA_START_YEAR, currentYear + 1]).range([0, w])
    xScaleRef.current = x

    const g = svg
      .attr('width', size.width)
      .attr('height', size.height)
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    // Highlight window rect — appended FIRST so it renders under the bars.
    // Position gets set for real by syncToRange() right after this effect;
    // start at zero width to avoid a one-frame flash at the wrong span.
    const highlight = g
      .append('rect')
      .attr('class', 'fill-cream-300 dark:fill-espresso-700')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', 0)
      .attr('height', h)
      .attr('opacity', 0.5)
    highlightRef.current = highlight.node()

    const evictionByYear = new Map(evictionYears.map((d) => [d.year, d.count]))
    const buyoutByYear = new Map(
      buyoutYears.filter((d) => d.year >= BUYOUT_START_YEAR).map((d) => [d.year, d.count]),
    )
    const maxEviction = d3.max(evictionYears, (d) => d.count) || 1
    const maxBuyout = d3.max(Array.from(buyoutByYear.values())) || 1

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

    // Buyout bars — slimmer, right side, 2015 on only.
    g.selectAll('.era-bar-buyout')
      .data(years.filter((yr) => yr >= BUYOUT_START_YEAR))
      .enter()
      .append('rect')
      .attr('class', 'era-bar-buyout')
      .attr('x', (yr) => x(yr) + bandWidth(yr) * 0.68)
      .attr('width', (yr) => bandWidth(yr) * 0.26)
      .attr('y', (yr) => yBuyout(buyoutByYear.get(yr) ?? 0))
      .attr('height', (yr) => h - yBuyout(buyoutByYear.get(yr) ?? 0))
      .attr('fill', '#d4a435')
      .attr('opacity', 0.85)

    // Era annotations — thin vertical tick + a rotated mono micro-label,
    // hidden below `desk:` (labels only; the tick stays visible).
    const annoG = g
      .selectAll('.era-annotation')
      .data(ERA_ANNOTATIONS)
      .enter()
      .append('g')
      .attr('class', 'era-annotation')

    annoG
      .append('line')
      .attr('x1', (d) => x(d.year))
      .attr('x2', (d) => x(d.year))
      .attr('y1', 0)
      .attr('y2', h)
      .attr('class', 'stroke-ink dark:stroke-paper-300')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2,2')
      .attr('opacity', 0.35)

    annoG
      .append('text')
      .attr('x', (d) => x(d.year) + 3)
      .attr('y', h - 3)
      .attr('transform', (d) => `rotate(-90, ${x(d.year) + 3}, ${h - 3})`)
      .attr('class', 'fill-ink dark:fill-paper-200 opacity-60 hidden desk:block font-mono uppercase tracking-wider')
      .style('font-size', '0.5rem')
      .text((d) => d.label)

    // Buyout-ordinance annotation at 2015 — rule-leading micro label idiom.
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
      .attr('y', 9)
      .attr('class', 'fill-ink dark:fill-paper-200 opacity-60 hidden desk:block font-mono uppercase tracking-wider')
      .style('font-size', '0.5rem')
      .text('── BUYOUT ORDINANCE')

    // Brush — snaps to whole years on release.
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

    syncToRange()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evictionYears, buyoutYears, size.width, size.height, currentYear, isLoading])

  // Keep the highlight + brush selection synced to `range` — e.g. edits from
  // the global date picker — without rebuilding the bars.
  useEffect(() => {
    syncToRange()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  return (
    <div ref={containerRef} className="relative w-full h-14 desk:h-20">
      {isLoading ? (
        <div className="absolute inset-0 rounded-md bg-cream-200/60 dark:bg-white/[0.06] skeleton" />
      ) : (
        <svg ref={svgRef} className="w-full h-full" />
      )}
    </div>
  )
}
