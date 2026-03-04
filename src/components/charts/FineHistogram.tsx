import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'
import { fineAmountColor } from '@/utils/colors'

interface FineHistogramProps {
  data: number[] // fine amounts in dollars
  width?: number
  height?: number
}

export default function FineHistogram({ data, width = 300, height = 120 }: FineHistogramProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 8, right: 4, bottom: 22, left: 4 }
    const w = width - margin.left - margin.right
    const h = height - margin.top - margin.bottom

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Clamp to $500
    const clamped = data.map((d) => Math.min(d, 500))

    const x = d3.scaleLinear().domain([0, 500]).range([0, w])

    const bins = d3.bin().domain([0, 500]).thresholds(20)(clamped)

    const y = d3.scaleLinear()
      .domain([0, d3.max(bins, (d) => d.length) || 0])
      .range([h, 0])

    // Bars colored by fine amount
    g.selectAll('rect')
      .data(bins)
      .join('rect')
      .attr('x', (d) => x(d.x0 ?? 0) + 0.5)
      .attr('y', h)
      .attr('width', (d) => Math.max(0, x(d.x1 ?? 0) - x(d.x0 ?? 0) - 1))
      .attr('height', 0)
      .attr('rx', 1.5)
      .attr('fill', (d) => {
        const midpoint = ((d.x0 ?? 0) + (d.x1 ?? 0)) / 2
        return fineAmountColor(midpoint)
      })
      .attr('opacity', 0.85)
      .transition()
      .duration(600)
      .delay((_, i) => i * 25)
      .ease(d3.easeCubicOut)
      .attr('y', (d) => y(d.length))
      .attr('height', (d) => h - y(d.length))

    // X axis — labeled in dollars
    const xAxis = d3.axisBottom(x)
      .tickValues([0, 50, 100, 200, 300, 500])
      .tickFormat((d) => `$${d}`)
      .tickSize(0)

    g.append('g')
      .attr('transform', `translate(0,${h + 4})`)
      .call(xAxis)
      .call((g) => g.select('.domain').remove())
      .selectAll('text')
      .attr('fill', isDarkMode ? '#94a3b8' : '#64748b')
      .attr('font-size', '9px')
      .attr('font-family', '"JetBrains Mono", monospace')

  }, [data, width, height, isDarkMode])

  return (
    <div className="relative">
      <svg ref={svgRef} className="w-full" />
    </div>
  )
}
