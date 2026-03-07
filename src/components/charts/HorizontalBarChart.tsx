import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'

export interface BarDatum {
  label: string
  value: number
  color?: string
}

interface HorizontalBarChartProps {
  data: BarDatum[]
  width?: number
  height?: number
  maxBars?: number
  valueFormatter?: (v: number) => string
}

export default function HorizontalBarChart({
  data,
  width = 280,
  height = 200,
  maxBars = 10,
  valueFormatter = (v) => String(v),
}: HorizontalBarChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const sliced = data.slice(0, maxBars)
    const margin = { top: 4, right: 40, bottom: 4, left: 90 }
    const w = width - margin.left - margin.right
    const h = height - margin.top - margin.bottom
    const barHeight = Math.min(h / sliced.length - 2, 18)

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const maxVal = d3.max(sliced, (d) => d.value) || 1
    const x = d3.scaleLinear().domain([0, maxVal]).range([0, w])
    const y = d3.scaleBand()
      .domain(sliced.map((d) => d.label))
      .range([0, sliced.length * (barHeight + 2)])
      .padding(0.1)

    // Bars
    g.selectAll('rect')
      .data(sliced)
      .join('rect')
      .attr('x', 0)
      .attr('y', (d) => y(d.label) ?? 0)
      .attr('width', 0)
      .attr('height', barHeight)
      .attr('rx', 2)
      .attr('fill', (d) => d.color || '#a78bfa')
      .attr('opacity', 0.8)
      .transition()
      .duration(500)
      .delay((_, i) => i * 30)
      .ease(d3.easeCubicOut)
      .attr('width', (d) => x(d.value))

    const labelColor = isDarkMode ? '#94a3b8' : '#64748b'
    const valueColor = isDarkMode ? '#cbd5e1' : '#334155'

    // Labels (left)
    g.selectAll('.bar-label')
      .data(sliced)
      .join('text')
      .attr('class', 'bar-label')
      .attr('x', -4)
      .attr('y', (d) => (y(d.label) ?? 0) + barHeight / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('fill', labelColor)
      .attr('font-size', '9px')
      .attr('font-family', '"JetBrains Mono", monospace')
      .text((d) => d.label.length > 12 ? d.label.slice(0, 11) + '\u2026' : d.label)
      .append('title')
      .text((d) => d.label)

    // Value labels (right of bar)
    g.selectAll('.val-label')
      .data(sliced)
      .join('text')
      .attr('class', 'val-label')
      .attr('x', (d) => x(d.value) + 4)
      .attr('y', (d) => (y(d.label) ?? 0) + barHeight / 2)
      .attr('dy', '0.35em')
      .attr('fill', valueColor)
      .attr('font-size', '9px')
      .attr('font-family', '"JetBrains Mono", monospace')
      .text((d) => valueFormatter(d.value))

  }, [data, width, height, maxBars, valueFormatter, isDarkMode])

  return <svg ref={svgRef} className="w-full" />
}
