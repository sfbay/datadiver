import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'

interface TimelinePoint {
  period: string
  total: number
}

interface Props {
  data: TimelinePoint[]
  width?: number
  height?: number
  accentColor?: string
}

export default function ContributionTimeline({ data, width = 400, height = 160, accentColor = '#10b981' }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDark = useAppStore((s) => s.isDarkMode)

  useEffect(() => {
    if (data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 8, right: 8, bottom: 32, left: 50 }
    const innerW = width - margin.left - margin.right
    const innerH = height - margin.top - margin.bottom

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const dates = data.map(d => new Date(d.period))
    const x = d3.scaleTime()
      .domain(d3.extent(dates) as [Date, Date])
      .range([0, innerW])

    const maxVal = Math.max(...data.map(d => d.total), 1)
    const y = d3.scaleLinear().domain([0, maxVal * 1.1]).range([innerH, 0])

    // Area
    const area = d3.area<TimelinePoint>()
      .x(d => x(new Date(d.period)))
      .y0(innerH)
      .y1(d => y(d.total))
      .curve(d3.curveMonotoneX)

    const line = d3.line<TimelinePoint>()
      .x(d => x(new Date(d.period)))
      .y(d => y(d.total))
      .curve(d3.curveMonotoneX)

    // Gradient fill
    const gradientId = `cf-timeline-grad-${Math.random().toString(36).slice(2, 8)}`
    const defs = svg.append('defs')
    const gradient = defs.append('linearGradient')
      .attr('id', gradientId)
      .attr('x1', '0%').attr('y1', '0%').attr('x2', '0%').attr('y2', '100%')
    gradient.append('stop').attr('offset', '0%').attr('stop-color', accentColor).attr('stop-opacity', 0.3)
    gradient.append('stop').attr('offset', '100%').attr('stop-color', accentColor).attr('stop-opacity', 0.02)

    g.append('path')
      .datum(data)
      .attr('d', area)
      .attr('fill', `url(#${gradientId})`)

    g.append('path')
      .datum(data)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', accentColor)
      .attr('stroke-width', 1.5)

    // X axis — JFMAMJJASOND single-letter months
    const MONTH_LETTERS = 'JFMAMJJASOND'
    const xAxis = d3.axisBottom(x)
      .ticks(d3.timeMonth.every(1))
      .tickFormat(d => MONTH_LETTERS[(d as Date).getMonth()])
    const xAxisG = g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(xAxis)
    xAxisG.selectAll('text')
      .attr('fill', isDark ? '#94a3b8' : '#64748b')
      .attr('font-size', '8px')
      .attr('font-family', "'JetBrains Mono', monospace")
    xAxisG.selectAll('.domain, .tick line').attr('stroke', isDark ? '#1e293b' : '#e2e8f0')

    // Year labels below month letters (at January ticks or first tick)
    const yearTicks = dates.filter(d => d.getMonth() === 0)
    if (yearTicks.length === 0 && dates.length > 0) yearTicks.push(dates[0])
    xAxisG.selectAll('text.year-label')
      .data(yearTicks)
      .join('text')
      .attr('class', 'year-label')
      .attr('x', d => x(d))
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .attr('fill', isDark ? '#64748b' : '#94a3b8')
      .attr('font-size', '7px')
      .attr('font-family', "'JetBrains Mono', monospace")
      .text(d => d.getFullYear().toString())

    // Y axis
    const yAxis = d3.axisLeft(y)
      .ticks(4)
      .tickFormat(d => {
        const v = d as number
        if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
        if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
        return `$${v}`
      })
    const yAxisG = g.append('g')
      .call(yAxis)
    yAxisG.selectAll('text')
      .attr('fill', isDark ? '#94a3b8' : '#64748b')
      .attr('font-size', '8px')
      .attr('font-family', "'JetBrains Mono', monospace")
    yAxisG.selectAll('.domain, .tick line').attr('stroke', isDark ? '#1e293b' : '#e2e8f0')
  }, [data, width, height, accentColor, isDark])

  return <svg ref={svgRef} width={width} height={height} />
}
