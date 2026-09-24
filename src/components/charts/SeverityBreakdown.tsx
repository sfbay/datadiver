import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'
import { CRASH_SEVERITY_COLORS } from '@/utils/colors'

export interface SeverityDatum {
  severity: string
  count: number
}

interface SeverityBreakdownProps {
  data: SeverityDatum[]
  width?: number
  height?: number
  /** Severities the view is filtered to; the rest dim. Empty = none. */
  selected?: ReadonlySet<string>
  /** Makes each row a control (a second way into the Traffic Safety
   *  severity filter, beside the stat cards). */
  onSelect?: (severity: string) => void
}

export default function SeverityBreakdown({ data, width = 260, height = 120, selected, onSelect }: SeverityBreakdownProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 4, right: 40, bottom: 4, left: 100 }
    const w = width - margin.left - margin.right
    const h = height - margin.top - margin.bottom
    const barHeight = Math.min(h / data.length - 2, 20)

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const maxVal = d3.max(data, (d) => d.count) || 1
    const x = d3.scaleLinear().domain([0, maxVal]).range([0, w])
    const y = d3.scaleBand()
      .domain(data.map((d) => d.severity))
      .range([0, data.length * (barHeight + 2)])
      .padding(0.1)

    g.selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', 0)
      .attr('y', (d) => y(d.severity) ?? 0)
      .attr('width', 0)
      .attr('height', barHeight)
      .attr('rx', 2)
      .attr('fill', (d) => CRASH_SEVERITY_COLORS[d.severity] || '#64748b')
      .attr('opacity', (d) => (!selected || selected.size === 0 || selected.has(d.severity) ? 0.8 : 0.25))
      .transition()
      .duration(500)
      .delay((_, i) => i * 40)
      .ease(d3.easeCubicOut)
      .attr('width', (d) => x(d.count))

    const labelColor = isDarkMode ? '#64748b' : '#94a3b8'
    const valueColor = isDarkMode ? '#94a3b8' : '#64748b'

    g.selectAll('.bar-label')
      .data(data)
      .join('text')
      .attr('class', 'bar-label')
      .attr('x', -4)
      .attr('y', (d) => (y(d.severity) ?? 0) + barHeight / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('fill', (d) => (selected?.has(d.severity) ? valueColor : labelColor))
      .attr('font-weight', (d) => (selected?.has(d.severity) ? 700 : 400))
      .style('font-size', '0.5625rem')
      .attr('font-family', '"JetBrains Mono", monospace')
      .text((d) => d.severity.length > 14 ? d.severity.slice(0, 13) + '\u2026' : d.severity)
      .append('title')
      .text((d) => d.severity)

    g.selectAll('.val-label')
      .data(data)
      .join('text')
      .attr('class', 'val-label')
      .attr('x', (d) => x(d.count) + 4)
      .attr('y', (d) => (y(d.severity) ?? 0) + barHeight / 2)
      .attr('dy', '0.35em')
      .attr('fill', valueColor)
      .style('font-size', '0.5625rem')
      .attr('font-family', '"JetBrains Mono", monospace')
      .text((d) => d.count.toLocaleString())

    if (onSelect) {
      // One transparent hit row per severity, label to value — bigger than
      // the bar, so a 1-crash Fatal bar is as easy to press as the longest.
      g.selectAll('.hit')
        .data(data)
        .join('rect')
        .attr('class', 'hit')
        .attr('x', -margin.left)
        .attr('y', (d) => (y(d.severity) ?? 0) - 1)
        .attr('width', width)
        .attr('height', barHeight + 2)
        .attr('fill', 'transparent')
        .style('cursor', 'pointer')
        .attr('tabindex', 0)
        .attr('role', 'button')
        .attr('aria-pressed', (d) => String(!!selected?.has(d.severity)))
        .attr('aria-label', (d) => `${d.severity}: ${d.count.toLocaleString()} crashes`)
        .on('click', (_, d) => onSelect(d.severity))
        .on('keydown', (e: KeyboardEvent, d) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(d.severity) }
        })
        .append('title')
        .text((d) => selected?.has(d.severity) ? `${d.severity} — click to clear` : `Show ${d.severity} crashes only`)
    }

  }, [data, width, height, isDarkMode, selected, onSelect])

  return <svg ref={svgRef} className="w-full" />
}
