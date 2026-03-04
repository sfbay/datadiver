import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'
import type { PeriodDataPoint, PeriodGranularity } from '@/types/trends'

interface PeriodBreakdownChartProps {
  current: PeriodDataPoint[]
  priorYear?: PeriodDataPoint[]
  granularity: PeriodGranularity
  width?: number
  height?: number
  accentColor?: string
}

export default function PeriodBreakdownChart({
  current,
  priorYear,
  granularity,
  width = 260,
  height = 140,
  accentColor = '#3b82f6',
}: PeriodBreakdownChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  useEffect(() => {
    if (!svgRef.current || current.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 4, right: 4, bottom: 20, left: 28 }
    const w = width - margin.left - margin.right
    const h = height - margin.top - margin.bottom

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Build aligned prior-year map (index-based alignment)
    const priorMap = new Map<number, number>()
    if (priorYear) {
      priorYear.forEach((p, i) => priorMap.set(i, p.count))
    }

    const x = d3.scaleBand<number>()
      .domain(current.map((_, i) => i))
      .range([0, w])
      .padding(0.15)

    const allValues = current.map(d => d.count)
    if (priorYear) allValues.push(...priorYear.map(d => d.count))
    const maxVal = d3.max(allValues) || 1

    const y = d3.scaleLinear()
      .domain([0, maxVal])
      .range([h, 0])
      .nice()

    const textColor = isDarkMode ? '#64748b' : '#94a3b8'
    const bandwidth = x.bandwidth()

    // Ghost bars (prior year) — full bandwidth, behind
    if (priorYear && priorYear.length > 0) {
      g.selectAll('.ghost-bar')
        .data(current.map((_, i) => priorMap.get(i) ?? 0))
        .enter()
        .append('rect')
        .attr('class', 'ghost-bar')
        .attr('x', (_, i) => x(i)!)
        .attr('y', d => y(d))
        .attr('width', bandwidth)
        .attr('height', d => h - y(d))
        .attr('fill', accentColor)
        .attr('opacity', 0.12)
        .attr('rx', 1.5)
    }

    // Current bars — 65% bandwidth, centered
    const barWidth = bandwidth * 0.65
    const barOffset = (bandwidth - barWidth) / 2

    g.selectAll('.current-bar')
      .data(current)
      .enter()
      .append('rect')
      .attr('class', 'current-bar')
      .attr('x', (_, i) => x(i)! + barOffset)
      .attr('y', d => y(d.count))
      .attr('width', barWidth)
      .attr('height', d => h - y(d.count))
      .attr('fill', accentColor)
      .attr('opacity', 0.75)
      .attr('rx', 1.5)

    // Y axis
    const yAxis = d3.axisLeft(y)
      .ticks(4)
      .tickSize(0)
      .tickFormat(d => {
        const n = Number(d)
        if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
        return String(n)
      })

    g.append('g')
      .call(yAxis)
      .call(g => g.select('.domain').remove())
      .selectAll('text')
      .attr('fill', textColor)
      .attr('font-size', '8px')
      .attr('font-family', '"JetBrains Mono", monospace')

    // X axis — show subset of labels to avoid crowding
    const maxLabels = granularity === 'monthly' ? 12 : granularity === 'weekly' ? 8 : 7
    const step = Math.max(1, Math.ceil(current.length / maxLabels))
    const tickIndices = current.map((_, i) => i).filter(i => i % step === 0)

    const xAxis = d3.axisBottom(x)
      .tickValues(tickIndices)
      .tickSize(0)
      .tickFormat(d => current[d as number]?.periodLabel ?? '')

    g.append('g')
      .attr('transform', `translate(0,${h + 3})`)
      .call(xAxis)
      .call(g => g.select('.domain').remove())
      .selectAll('text')
      .attr('fill', textColor)
      .attr('font-size', '8px')
      .attr('font-family', '"JetBrains Mono", monospace')

  }, [current, priorYear, granularity, width, height, accentColor, isDarkMode])

  return (
    <div>
      <svg ref={svgRef} className="w-full" />
      {priorYear && priorYear.length > 0 && (
        <div className="flex items-center gap-3 mt-1">
          <div className="flex items-center gap-1">
            <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: accentColor, opacity: 0.75 }} />
            <span className="text-[8px] font-mono text-slate-400">Current</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: accentColor, opacity: 0.12 }} />
            <span className="text-[8px] font-mono text-slate-400">Prior Year</span>
          </div>
        </div>
      )}
    </div>
  )
}
