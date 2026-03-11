import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'
import { formatCurrency } from './TopRecipientsChart'

interface SourceDatum {
  label: string
  value: number
  color: string
}

interface Props {
  data: SourceDatum[]
  width?: number
  height?: number
}

const SOURCE_COLORS: Record<string, string> = {
  Individual: '#60a5fa',
  Committee: '#a78bfa',
  Other: '#64748b',
  Self: '#f59e0b',
}

const SOURCE_LABELS: Record<string, string> = {
  IND: 'Individual',
  COM: 'Committee',
  OTH: 'Other',
  SCC: 'Small Committee',
}

/** Transform raw source agg rows + self-funding total into chart data. */
export function buildSourceData(
  sourceRows: { entity_code: string; total: string }[],
  selfFundingTotal: number
): SourceDatum[] {
  const items: SourceDatum[] = []
  for (const row of sourceRows) {
    const label = SOURCE_LABELS[row.entity_code] || row.entity_code || 'Unknown'
    let value = parseFloat(row.total) || 0
    // Subtract self-funding from Individual bucket to avoid double-counting
    if (row.entity_code === 'IND' && selfFundingTotal > 0) {
      value = Math.max(0, value - selfFundingTotal)
    }
    if (value > 0) {
      items.push({ label, value, color: SOURCE_COLORS[label] || '#64748b' })
    }
  }
  if (selfFundingTotal > 0) {
    items.push({ label: 'Self', value: selfFundingTotal, color: SOURCE_COLORS.Self })
  }
  return items.sort((a, b) => b.value - a.value)
}

export default function FundingSourcesChart({ data, width = 300, height }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDark = useAppStore((s) => s.isDarkMode)
  const barHeight = 24
  const gap = 6
  const computedHeight = height || Math.max(100, data.length * (barHeight + gap) + 8)
  const margin = { top: 4, right: 70, bottom: 4, left: 80 }
  const innerW = width - margin.left - margin.right

  useEffect(() => {
    if (data.length === 0) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)
    const maxVal = Math.max(...data.map(d => d.value), 1)
    const x = d3.scaleLinear().domain([0, maxVal]).range([0, innerW])
    const y = d3.scaleBand<number>()
      .domain(d3.range(data.length))
      .range([0, computedHeight - margin.top - margin.bottom])
      .padding(0.2)

    g.selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', 0)
      .attr('y', (_, i) => y(i)!)
      .attr('height', y.bandwidth())
      .attr('rx', 3)
      .attr('fill', d => d.color)
      .attr('opacity', 0.75)
      .attr('width', 0)
      .transition().duration(500).delay((_, i) => i * 60)
      .attr('width', d => x(d.value))

    g.selectAll('text.label')
      .data(data)
      .join('text')
      .attr('x', -8)
      .attr('y', (_, i) => y(i)! + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('fill', isDark ? '#cbd5e1' : '#475569')
      .attr('font-size', '11px')
      .text(d => d.label)

    g.selectAll('text.value')
      .data(data)
      .join('text')
      .attr('x', d => x(d.value) + 6)
      .attr('y', (_, i) => y(i)! + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('fill', isDark ? '#94a3b8' : '#64748b')
      .attr('font-size', '10px')
      .attr('font-family', "'JetBrains Mono', monospace")
      .text(d => formatCurrency(d.value))
  }, [data, width, computedHeight, isDark, innerW, margin.left, margin.top])

  return <svg ref={svgRef} width={width} height={computedHeight} />
}
