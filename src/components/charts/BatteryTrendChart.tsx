import { useRef, useEffect } from 'react'
import * as d3 from 'd3'

interface Props {
  data: { year: string; count: number }[]
  width?: number
  height?: number
}

export default function BatteryTrendChart({ data, width = 320, height = 140 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 12, right: 12, bottom: 24, left: 32 }
    const w = width - margin.left - margin.right
    const h = height - margin.top - margin.bottom

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleBand<string>()
      .domain(data.map(d => d.year))
      .range([0, w])
      .padding(0.3)

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.count) || 1])
      .nice()
      .range([h, 0])

    // Bars with amber gradient
    g.selectAll('.bar')
      .data(data)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.year)!)
      .attr('width', x.bandwidth())
      .attr('y', h)
      .attr('height', 0)
      .attr('rx', 2)
      .attr('fill', '#f59e0b')
      .attr('opacity', 0.8)
      .transition()
      .duration(500)
      .delay((_, i) => i * 60)
      .attr('y', d => y(d.count))
      .attr('height', d => h - y(d.count))

    // Value labels on bars
    g.selectAll('.value')
      .data(data)
      .join('text')
      .attr('class', 'value')
      .attr('x', d => x(d.year)! + x.bandwidth() / 2)
      .attr('y', d => y(d.count) - 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#f59e0b')
      .attr('font-size', '9px')
      .attr('font-family', "'JetBrains Mono', monospace")
      .attr('opacity', 0)
      .text(d => d.count)
      .transition()
      .duration(400)
      .delay((_, i) => i * 60 + 300)
      .attr('opacity', 1)

    // X-axis (years)
    g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x).tickSize(0))
      .call(g => g.select('.domain').remove())
      .selectAll('text')
      .attr('fill', 'rgba(148,163,184,0.6)')
      .attr('font-size', '8px')
      .attr('font-family', "'JetBrains Mono', monospace")

    // Y-axis (count)
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickSize(-w))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick line')
        .attr('stroke', 'rgba(148,163,184,0.08)')
        .attr('stroke-dasharray', '2,2'))
      .selectAll('text')
      .attr('fill', 'rgba(148,163,184,0.5)')
      .attr('font-size', '8px')
      .attr('font-family', "'JetBrains Mono', monospace")
  }, [data, width, height])

  if (data.length === 0) return null

  return <svg ref={svgRef} />
}
