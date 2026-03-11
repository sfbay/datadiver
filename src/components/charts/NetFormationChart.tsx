import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'

export interface FormationDataPoint {
  month: string   // ISO date string e.g. "2025-03-01T00:00:00.000"
  openings: number
  closures: number
}

interface NetFormationChartProps {
  data: FormationDataPoint[]
  priorYear?: FormationDataPoint[]
  width?: number
  height?: number
}

export default function NetFormationChart({
  data,
  priorYear,
  width = 320,
  height = 140,
}: NetFormationChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 8, right: 8, bottom: 20, left: 32 }
    const w = width - margin.left - margin.right
    const h = height - margin.top - margin.bottom

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const maxOpen = d3.max(data, (d) => d.openings) || 1
    const maxClose = d3.max(data, (d) => d.closures) || 1
    const maxVal = Math.max(maxOpen, maxClose)

    const x = d3.scaleBand()
      .domain(data.map((d) => d.month))
      .range([0, w])
      .padding(0.2)

    const yUp = d3.scaleLinear().domain([0, maxVal]).range([h / 2, 0])
    const yDown = d3.scaleLinear().domain([0, maxVal]).range([h / 2, h])

    const labelColor = isDarkMode ? '#64748b' : '#94a3b8'
    const zeroColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'

    // Zero line
    g.append('line')
      .attr('x1', 0).attr('x2', w)
      .attr('y1', h / 2).attr('y2', h / 2)
      .attr('stroke', zeroColor)

    // Ghost prior-year bars
    if (priorYear && priorYear.length > 0) {
      const ghostOpacity = isDarkMode ? 0.15 : 0.1
      priorYear.forEach((d, i) => {
        if (i >= data.length) return
        const xPos = x(data[i].month)
        if (xPos == null) return
        const bw = x.bandwidth()
        g.append('rect')
          .attr('x', xPos).attr('y', yUp(d.openings))
          .attr('width', bw).attr('height', h / 2 - yUp(d.openings))
          .attr('rx', 1.5).attr('fill', '#10b981').attr('opacity', ghostOpacity)
        g.append('rect')
          .attr('x', xPos).attr('y', h / 2)
          .attr('width', bw).attr('height', yDown(d.closures) - h / 2)
          .attr('rx', 1.5).attr('fill', '#ef4444').attr('opacity', ghostOpacity)
      })
    }

    // Openings bars (above zero)
    g.selectAll('.bar-open')
      .data(data)
      .join('rect')
      .attr('class', 'bar-open')
      .attr('x', (d) => x(d.month) ?? 0)
      .attr('y', h / 2)
      .attr('width', x.bandwidth())
      .attr('height', 0)
      .attr('rx', 1.5)
      .attr('fill', '#10b981')
      .attr('opacity', 0.8)
      .transition()
      .duration(500)
      .delay((_, i) => i * 20)
      .ease(d3.easeCubicOut)
      .attr('y', (d) => yUp(d.openings))
      .attr('height', (d) => h / 2 - yUp(d.openings))

    // Closures bars (below zero)
    g.selectAll('.bar-close')
      .data(data)
      .join('rect')
      .attr('class', 'bar-close')
      .attr('x', (d) => x(d.month) ?? 0)
      .attr('y', h / 2)
      .attr('width', x.bandwidth())
      .attr('height', 0)
      .attr('rx', 1.5)
      .attr('fill', '#ef4444')
      .attr('opacity', 0.8)
      .transition()
      .duration(500)
      .delay((_, i) => i * 20)
      .ease(d3.easeCubicOut)
      .attr('height', (d) => yDown(d.closures) - h / 2)

    // X-axis labels (every 2nd or 3rd month depending on count)
    const step = data.length > 8 ? 3 : data.length > 4 ? 2 : 1
    data.forEach((d, i) => {
      if (i % step !== 0) return
      const xPos = (x(d.month) ?? 0) + x.bandwidth() / 2
      const label = new Date(d.month).toLocaleDateString('en-US', { month: 'short' })
      g.append('text')
        .attr('x', xPos).attr('y', h + 12)
        .attr('text-anchor', 'middle')
        .attr('fill', labelColor)
        .attr('font-size', '8px')
        .attr('font-family', '"JetBrains Mono", monospace')
        .text(label)
    })

    // Y-axis labels
    g.append('text')
      .attr('x', -4).attr('y', 6)
      .attr('text-anchor', 'end')
      .attr('fill', '#10b981').attr('font-size', '7px')
      .attr('font-family', '"JetBrains Mono", monospace')
      .text(`+${maxVal}`)
    g.append('text')
      .attr('x', -4).attr('y', h)
      .attr('text-anchor', 'end')
      .attr('fill', '#ef4444').attr('font-size', '7px')
      .attr('font-family', '"JetBrains Mono", monospace')
      .text(`-${maxVal}`)

  }, [data, priorYear, width, height, isDarkMode])

  return <svg ref={svgRef} className="w-full" />
}
