/** D3 line chart: compliance % by fiscal year + outlet count + 50% target line */

import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'
import { formatFiscalYear } from '@/utils/fiscalYear'
import type { ComplianceTrendPoint } from '@/hooks/useComplianceData'

interface ComplianceTrendChartProps {
  data: ComplianceTrendPoint[]
  width?: number
  height?: number
  currentFY?: number
}

export default function ComplianceTrendChart({
  data,
  width = 600,
  height = 260,
  currentFY,
}: ComplianceTrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 20, right: 52, bottom: 32, left: 42 }
    const w = width - margin.left - margin.right
    const h = height - margin.top - margin.bottom

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const textColor = isDarkMode ? '#94a3b8' : '#64748b'
    const gridColor = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'

    // Filter to FYs with actual data (discretionary > 0)
    const active = data.filter((d) => d.discretionaryTotal > 0)
    if (active.length === 0) return

    // Scales
    const x = d3.scaleLinear()
      .domain(d3.extent(active, (d) => d.fiscalYear) as [number, number])
      .range([0, w])

    const yPct = d3.scaleLinear()
      .domain([0, Math.max(100, d3.max(active, (d) => d.compliancePct)! * 1.15)])
      .range([h, 0])

    const yCount = d3.scaleLinear()
      .domain([0, d3.max(active, (d) => d.outletCount)! * 1.3 || 10])
      .range([h, 0])

    // Grid lines
    const yTicks = yPct.ticks(5)
    g.selectAll('.grid-line')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('x1', 0).attr('x2', w)
      .attr('y1', (d) => yPct(d)).attr('y2', (d) => yPct(d))
      .attr('stroke', gridColor)

    // 50% target line
    g.append('line')
      .attr('x1', 0).attr('x2', w)
      .attr('y1', yPct(50)).attr('y2', yPct(50))
      .attr('stroke', '#f59e0b')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '6,4')
      .attr('opacity', 0.7)

    g.append('text')
      .attr('x', w + 4)
      .attr('y', yPct(50))
      .attr('dy', '0.35em')
      .attr('font-size', 9)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('fill', '#f59e0b')
      .attr('opacity', 0.8)
      .text('50%')

    // Outlet count bars (background)
    const barWidth = Math.max(4, w / active.length * 0.4)
    g.selectAll('.outlet-bar')
      .data(active)
      .enter()
      .append('rect')
      .attr('x', (d) => x(d.fiscalYear) - barWidth / 2)
      .attr('y', (d) => yCount(d.outletCount))
      .attr('width', barWidth)
      .attr('height', (d) => h - yCount(d.outletCount))
      .attr('fill', isDarkMode ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.12)')
      .attr('rx', 2)

    // Compliance % line
    const line = d3.line<ComplianceTrendPoint>()
      .x((d) => x(d.fiscalYear))
      .y((d) => yPct(d.compliancePct))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(active)
      .attr('fill', 'none')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 2.5)
      .attr('d', line)

    // Dots
    g.selectAll('.dot')
      .data(active)
      .enter()
      .append('circle')
      .attr('cx', (d) => x(d.fiscalYear))
      .attr('cy', (d) => yPct(d.compliancePct))
      .attr('r', (d) => d.fiscalYear === currentFY ? 5 : 3.5)
      .attr('fill', (d) => d.compliancePct >= 50 ? '#10b981' : d.compliancePct >= 30 ? '#f59e0b' : '#ef4444')
      .attr('stroke', isDarkMode ? '#0f172a' : '#fff')
      .attr('stroke-width', 1.5)

    // % labels on dots
    g.selectAll('.pct-label')
      .data(active)
      .enter()
      .append('text')
      .attr('x', (d) => x(d.fiscalYear))
      .attr('y', (d) => yPct(d.compliancePct) - 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', 9)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('fill', (d) => d.compliancePct >= 50 ? '#10b981' : d.compliancePct >= 30 ? '#f59e0b' : '#ef4444')
      .text((d) => `${d.compliancePct.toFixed(0)}%`)

    // X axis — fiscal years
    const xAxis = d3.axisBottom(x)
      .tickValues(active.map((d) => d.fiscalYear))
      .tickFormat((d) => formatFiscalYear(d as number).replace('FY', ''))

    g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(xAxis)
      .call((g) => g.select('.domain').attr('stroke', gridColor))
      .call((g) => g.selectAll('.tick line').attr('stroke', gridColor))
      .call((g) => g.selectAll('.tick text')
        .attr('fill', textColor)
        .attr('font-size', 8)
        .attr('font-family', 'JetBrains Mono, monospace'))

    // Y axis — percentage
    const yAxis = d3.axisLeft(yPct)
      .ticks(5)
      .tickFormat((d) => `${d}%`)

    g.append('g')
      .call(yAxis)
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('.tick line').remove())
      .call((g) => g.selectAll('.tick text')
        .attr('fill', textColor)
        .attr('font-size', 8)
        .attr('font-family', 'JetBrains Mono, monospace'))

    // Right axis — outlet count
    const yAxisRight = d3.axisRight(yCount)
      .ticks(4)
      .tickFormat((d) => String(d))

    g.append('g')
      .attr('transform', `translate(${w},0)`)
      .call(yAxisRight)
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('.tick line').remove())
      .call((g) => g.selectAll('.tick text')
        .attr('fill', 'rgba(139,92,246,0.5)')
        .attr('font-size', 8)
        .attr('font-family', 'JetBrains Mono, monospace'))

    // Axis labels
    g.append('text')
      .attr('x', -8).attr('y', -8)
      .attr('font-size', 8)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('fill', textColor)
      .attr('opacity', 0.6)
      .text('Compliance %')

    g.append('text')
      .attr('x', w + 8).attr('y', -8)
      .attr('font-size', 8)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('fill', 'rgba(139,92,246,0.5)')
      .attr('text-anchor', 'end')
      .text('Outlets')

  }, [data, width, height, isDarkMode, currentFY])

  return <svg ref={svgRef} className="w-full" />
}
