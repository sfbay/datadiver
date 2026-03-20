/** Horizontal bar chart: departments sorted by spending with budget ghost bars */

import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'
import { formatBudgetAmount } from '@/utils/fiscalYear'
import type { BudgetVsActualRow } from '@/types/budget'

interface DepartmentBarsProps {
  data: BudgetVsActualRow[]
  width?: number
  height?: number
  maxBars?: number
  onSelectDepartment?: (dept: string) => void
  selectedDepartment?: string | null
}

export default function DepartmentBars({
  data,
  width = 600,
  height = 500,
  maxBars = 20,
  onSelectDepartment,
  selectedDepartment,
}: DepartmentBarsProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const sliced = data.slice(0, maxBars)
    const margin = { top: 8, right: 70, bottom: 8, left: 180 }
    const w = width - margin.left - margin.right
    const barHeight = 20
    const barGap = 3
    const h = sliced.length * (barHeight + barGap)

    svg.attr('width', width).attr('height', h + margin.top + margin.bottom)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const maxVal = d3.max(sliced, (d) => Math.max(d.budget_total, d.spending_total)) || 1
    const x = d3.scaleLinear().domain([0, maxVal]).range([0, w])
    const y = d3.scaleBand()
      .domain(sliced.map((d) => d.department))
      .range([0, h])
      .padding(0.15)

    // Ghost budget bars (behind)
    g.selectAll('.budget-bar')
      .data(sliced)
      .join('rect')
      .attr('class', 'budget-bar')
      .attr('x', 0)
      .attr('y', (d) => y(d.department) ?? 0)
      .attr('height', y.bandwidth())
      .attr('rx', 2)
      .attr('fill', isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)')
      .attr('stroke', isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,2')
      .attr('width', 0)
      .transition()
      .duration(400)
      .attr('width', (d) => x(d.budget_total))

    // Actual spending bars
    g.selectAll('.spending-bar')
      .data(sliced)
      .join('rect')
      .attr('class', 'spending-bar')
      .attr('x', 0)
      .attr('y', (d) => y(d.department) ?? 0)
      .attr('height', y.bandwidth())
      .attr('rx', 2)
      .attr('fill', (d) => {
        if (d.variance_pct > 5) return '#ef4444' // over budget
        if (d.variance_pct < -5) return '#22c55e' // under budget
        return '#0ea5e9' // on track
      })
      .attr('opacity', (d) => (selectedDepartment && d.department !== selectedDepartment ? 0.3 : 0.75))
      .attr('cursor', 'pointer')
      .attr('width', 0)
      .on('click', (_, d) => onSelectDepartment?.(d.department))
      .transition()
      .duration(500)
      .delay((_, i) => i * 20)
      .ease(d3.easeCubicOut)
      .attr('width', (d) => x(d.spending_total))

    // Department labels (left)
    const labelColor = isDarkMode ? '#94a3b8' : '#64748b'
    const maxChars = Math.floor(margin.left / 6.5)
    const clipId = `dept-clip-${Math.random().toString(36).slice(2, 8)}`

    // Department labels (drawn in the SVG root, not inside the translated group)
    svg.selectAll('.dept-label')
      .data(sliced)
      .join('text')
      .attr('class', 'dept-label')
      .attr('x', margin.left - 8)
      .attr('y', (d) => margin.top + (y(d.department) ?? 0) + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('fill', (d) => (selectedDepartment === d.department ? (isDarkMode ? '#fff' : '#0f172a') : labelColor))
      .attr('font-size', '9px')
      .attr('font-family', '"JetBrains Mono", monospace')
      .attr('cursor', 'pointer')
      .text((d) => d.department.length > maxChars ? d.department.slice(0, maxChars - 1) + '…' : d.department)
      .on('click', (_, d) => onSelectDepartment?.(d.department))
      .append('title')
      .text((d) => d.department)

    // Value labels + variance indicator (right of bar)
    const valueColor = isDarkMode ? '#cbd5e1' : '#334155'
    g.selectAll('.val-label')
      .data(sliced)
      .join('text')
      .attr('class', 'val-label')
      .attr('x', (d) => x(Math.max(d.spending_total, d.budget_total)) + 6)
      .attr('y', (d) => (y(d.department) ?? 0) + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('fill', valueColor)
      .attr('font-size', '9px')
      .attr('font-family', '"JetBrains Mono", monospace')
      .text((d) => {
        const amt = formatBudgetAmount(d.spending_total)
        const pct = d.variance_pct
        if (Math.abs(pct) < 1) return amt
        const sign = pct > 0 ? '+' : ''
        return `${amt} ${sign}${pct.toFixed(0)}%`
      })

  }, [data, width, height, maxBars, isDarkMode, onSelectDepartment, selectedDepartment])

  return <svg ref={svgRef} className="w-full" />
}
