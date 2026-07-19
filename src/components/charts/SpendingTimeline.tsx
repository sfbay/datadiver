/** SpendingTimeline — shared D3 area chart for year-by-year spending.
 *
 *  Originally extracted from VendorProfile.tsx; now used there AND for
 *  department and category detail pages in the Advertising & Media view.
 *
 *  Pure read-only visualization. Answers the question "how has this
 *  entity's spending evolved over time?" The current fiscal year is
 *  highlighted with a larger dot; the peak year gets an amber dot.
 */

import { useRef, useEffect, useMemo } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'
import { formatBudgetAmount } from '@/utils/fiscalYear'
import type { FiscalYear } from '@/types/budget'

/** Minimum shape of an input row — any additional fields are ignored. */
export interface SpendingTimelineRow {
  fiscal_year: string
  total_paid: string
}

interface SpendingTimelineProps {
  data: SpendingTimelineRow[]
  currentFY: FiscalYear
  /** Stroke/fill color (default ACCENT sky). Callers can override for theming. */
  color?: string
  /** Override the default fixed height. */
  height?: number
}

const DEFAULT_COLOR = '#5c9693' // sky

export default function SpendingTimeline({
  data,
  currentFY,
  color = DEFAULT_COLOR,
  height = 180,
}: SpendingTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  const points = useMemo(
    () => data
      .map((r) => ({ fy: parseInt(r.fiscal_year, 10), amount: parseFloat(r.total_paid) || 0 }))
      .filter((p) => !isNaN(p.fy) && p.amount >= 0)
      .sort((a, b) => a.fy - b.fy),
    [data],
  )

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || points.length < 2) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = containerRef.current.clientWidth || 460
    const margin = { top: 12, right: 16, bottom: 28, left: 52 }
    const w = width - margin.left - margin.right
    const h = height - margin.top - margin.bottom

    svg.attr('width', width).attr('height', height)
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleLinear()
      .domain(d3.extent(points, (d) => d.fy) as [number, number])
      .range([0, w])
    const y = d3.scaleLinear()
      .domain([0, (d3.max(points, (d) => d.amount) || 1) * 1.1])
      .range([h, 0])
      .nice()

    // Grid lines
    const gridColor = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
    g.selectAll('.grid')
      .data(y.ticks(4))
      .join('line')
      .attr('x1', 0).attr('x2', w)
      .attr('y1', (d) => y(d)).attr('y2', (d) => y(d))
      .attr('stroke', gridColor)

    // Area fill
    const area = d3.area<{ fy: number; amount: number }>()
      .x((d) => x(d.fy))
      .y0(h)
      .y1((d) => y(d.amount))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(points)
      .attr('fill', `${color}18`)
      .attr('d', area)

    // Line
    const line = d3.line<{ fy: number; amount: number }>()
      .x((d) => x(d.fy))
      .y((d) => y(d.amount))
      .curve(d3.curveMonotoneX)

    const path = g.append('path')
      .datum(points)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 2)
      .attr('d', line)

    // Animate line draw
    const totalLength = path.node()?.getTotalLength() || 0
    path
      .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
      .attr('stroke-dashoffset', totalLength)
      .transition()
      .duration(800)
      .ease(d3.easeCubicOut)
      .attr('stroke-dashoffset', 0)

    // Highlight current FY dot — larger than the peak indicator so the
    // reader sees "here's where you are in the trend" at a glance.
    const currentPoint = points.find((p) => p.fy === currentFY)
    if (currentPoint) {
      g.append('circle')
        .attr('cx', x(currentPoint.fy))
        .attr('cy', y(currentPoint.amount))
        .attr('r', 4.5)
        .attr('fill', color)
        .attr('stroke', isDarkMode ? '#0f172a' : '#fff')
        .attr('stroke-width', 2)
    }

    // Highlight peak year (amber) — only if it's different from the current FY
    const peak = points.reduce((best, p) => p.amount > best.amount ? p : best, points[0])
    if (peak && peak.fy !== currentFY) {
      g.append('circle')
        .attr('cx', x(peak.fy))
        .attr('cy', y(peak.amount))
        .attr('r', 3)
        .attr('fill', '#d4a435')
        .attr('opacity', 0.7)
    }

    // Axes
    const axisColor = isDarkMode ? '#64748b' : '#94a3b8'
    g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat((d) => `'${String(d).slice(-2)}`))
      .call((g) => g.select('.domain').attr('stroke', axisColor))
      .call((g) => g.selectAll('.tick text').attr('fill', axisColor).style('font-size', '0.5rem').attr('font-family', '"JetBrains Mono", monospace'))
      .call((g) => g.selectAll('.tick line').attr('stroke', axisColor))

    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat((d) => formatBudgetAmount(d as number)))
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('.tick text').attr('fill', axisColor).style('font-size', '0.5rem').attr('font-family', '"JetBrains Mono", monospace'))
      .call((g) => g.selectAll('.tick line').remove())

  }, [points, currentFY, isDarkMode, color, height])

  if (points.length < 2) {
    return <p className="text-xs text-slate-400 font-mono py-4">Insufficient data for timeline</p>
  }

  return (
    <div ref={containerRef} className="w-full">
      <svg ref={svgRef} className="w-full" />
    </div>
  )
}
