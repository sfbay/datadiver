import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'
import type { DailyTrendPoint } from '@/types/datasets'

interface TrendChartProps {
  current: DailyTrendPoint[]
  comparison?: DailyTrendPoint[]
  width?: number
  height?: number
}

type Metric = 'calls' | 'avgResponse'

export default function TrendChart({ current, comparison, width = 260, height = 120 }: TrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [metric, setMetric] = useState<Metric>('calls')
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  useEffect(() => {
    if (!svgRef.current || current.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 8, right: 8, bottom: 22, left: 32 }
    const w = width - margin.left - margin.right
    const h = height - margin.top - margin.bottom

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const getValue = (d: DailyTrendPoint) =>
      metric === 'calls' ? d.callCount : d.avgResponseTime

    // X scale: index-based so current and comparison align
    const x = d3.scaleLinear().domain([0, current.length - 1]).range([0, w])

    // Y scale: encompass both series
    const allValues = current.map(getValue)
    if (comparison && comparison.length > 0) {
      allValues.push(...comparison.map(getValue))
    }
    const y = d3.scaleLinear()
      .domain([0, d3.max(allValues) || 1])
      .range([h, 0])
      .nice()

    // Area for current period
    const area = d3.area<DailyTrendPoint>()
      .x((_, i) => x(i))
      .y0(h)
      .y1((d) => y(getValue(d)))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(current)
      .attr('fill', 'rgba(59,130,246,0.12)')
      .attr('d', area)

    // Line for current period
    const line = d3.line<DailyTrendPoint>()
      .x((_, i) => x(i))
      .y((d) => y(getValue(d)))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(current)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 1.5)
      .attr('d', line)

    // Comparison line (dashed)
    if (comparison && comparison.length > 0) {
      const compX = d3.scaleLinear().domain([0, comparison.length - 1]).range([0, w])

      const compLine = d3.line<DailyTrendPoint>()
        .x((_, i) => compX(i))
        .y((d) => y(getValue(d)))
        .curve(d3.curveMonotoneX)

      g.append('path')
        .datum(comparison)
        .attr('fill', 'none')
        .attr('stroke', isDarkMode ? '#cbd5e1' : '#94a3b8')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,3')
        .attr('opacity', 0.6)
        .attr('d', compLine)
    }

    const textColor = isDarkMode ? '#94a3b8' : '#64748b'

    // Y axis
    const yAxis = d3.axisLeft(y)
      .ticks(4)
      .tickSize(0)
      .tickFormat((d) => metric === 'calls' ? String(d) : `${Number(d).toFixed(0)}m`)

    g.append('g')
      .call(yAxis)
      .call((g) => g.select('.domain').remove())
      .selectAll('text')
      .attr('fill', textColor)
      .attr('font-size', '8px')
      .attr('font-family', '"JetBrains Mono", monospace')

    // X axis (show a few date labels)
    const tickIndices = [0, Math.floor(current.length / 2), current.length - 1]
    const xAxis = d3.axisBottom(x)
      .tickValues(tickIndices)
      .tickSize(0)
      .tickFormat((d) => {
        const point = current[d as number]
        if (!point) return ''
        const date = new Date(point.day + 'T12:00:00')
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      })

    g.append('g')
      .attr('transform', `translate(0,${h + 4})`)
      .call(xAxis)
      .call((g) => g.select('.domain').remove())
      .selectAll('text')
      .attr('fill', textColor)
      .attr('font-size', '8px')
      .attr('font-family', '"JetBrains Mono", monospace')

  }, [current, comparison, metric, width, height, isDarkMode])

  return (
    <div>
      {/* Metric toggle */}
      <div className="flex gap-1 mb-2">
        {([['calls', 'Calls'], ['avgResponse', 'Avg Time']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMetric(key)}
            className={`px-2 py-0.5 rounded text-[9px] font-mono font-medium transition-all ${
              metric === key
                ? 'bg-signal-blue/15 text-signal-blue'
                : 'text-slate-400 dark:text-slate-600 hover:text-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <svg ref={svgRef} className="w-full" />
      {comparison && comparison.length > 0 && (
        <div className="flex items-center gap-3 mt-1.5">
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 bg-blue-500 rounded" />
            <span className="text-[8px] font-mono text-slate-400">Current</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 bg-slate-400 rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #94a3b8 0 3px, transparent 3px 6px)' }} />
            <span className="text-[8px] font-mono text-slate-400">Comparison</span>
          </div>
        </div>
      )}
    </div>
  )
}
