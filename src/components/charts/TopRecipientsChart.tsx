import { useRef, useEffect, useMemo } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'

interface RecipientDatum {
  filerName: string
  filerNid: string
  filerType: string
  total: number
}

interface Props {
  data: RecipientDatum[]
  width?: number
  height?: number
  onSelect?: (d: RecipientDatum) => void
}

const FILER_TYPE_COLORS: Record<string, string> = {
  'Candidate or Officeholder': '#60a5fa',
  'Primarily Formed Measure': '#10b981',
  'General Purpose': '#a78bfa',
  'Primarily Formed Candidate': '#60a5fa',
  'Major Donor': '#f59e0b',
  'Independent Expenditure': '#f97316',
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

export default function TopRecipientsChart({ data, width = 600, height, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDark = useAppStore((s) => s.isDarkMode)
  const barHeight = 22
  const gap = 4
  const computedHeight = height || Math.max(200, data.length * (barHeight + gap) + 30)
  const margin = { top: 4, right: 80, bottom: 4, left: 180 }
  const innerW = width - margin.left - margin.right
  const innerH = computedHeight - margin.top - margin.bottom

  const maxVal = useMemo(() => Math.max(...data.map(d => d.total), 1), [data])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleLinear().domain([0, maxVal]).range([0, innerW])
    const y = d3.scaleBand<number>()
      .domain(d3.range(data.length))
      .range([0, innerH])
      .padding(0.15)

    // Bars
    g.selectAll('rect.bar')
      .data(data)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', 0)
      .attr('y', (_, i) => y(i)!)
      .attr('width', 0)
      .attr('height', y.bandwidth())
      .attr('rx', 3)
      .attr('fill', d => FILER_TYPE_COLORS[d.filerType] || '#64748b')
      .attr('opacity', 0.75)
      .style('cursor', onSelect ? 'pointer' : 'default')
      .on('click', (_, d) => onSelect?.(d))
      .on('mouseenter', function() { d3.select(this).attr('opacity', 1) })
      .on('mouseleave', function() { d3.select(this).attr('opacity', 0.75) })
      .transition()
      .duration(600)
      .delay((_, i) => i * 30)
      .attr('width', d => x(d.total))

    // Labels (left — filer name)
    g.selectAll('text.label')
      .data(data)
      .join('text')
      .attr('class', 'label')
      .attr('x', -8)
      .attr('y', (_, i) => y(i)! + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('fill', isDark ? '#cbd5e1' : '#475569')
      .attr('font-size', '11px')
      .attr('font-family', "'Inter', sans-serif")
      .text(d => d.filerName.length > 30 ? d.filerName.slice(0, 28) + '…' : d.filerName)
      .style('cursor', onSelect ? 'pointer' : 'default')
      .on('click', (_, d) => onSelect?.(d))

    // Values (right — dollar amount)
    g.selectAll('text.value')
      .data(data)
      .join('text')
      .attr('class', 'value')
      .attr('x', d => x(d.total) + 6)
      .attr('y', (_, i) => y(i)! + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('fill', isDark ? '#94a3b8' : '#64748b')
      .attr('font-size', '10px')
      .attr('font-family', "'JetBrains Mono', monospace")
      .text(d => formatCurrency(d.total))
      .attr('opacity', 0)
      .transition()
      .duration(400)
      .delay((_, i) => i * 30 + 400)
      .attr('opacity', 1)
  }, [data, width, innerW, innerH, maxVal, isDark, onSelect, margin.left, margin.top])

  return <svg ref={svgRef} width={width} height={computedHeight} />
}

export { formatCurrency }
export type { RecipientDatum }
