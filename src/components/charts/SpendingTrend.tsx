/** Multi-line D3 chart: top N departments spending over time (FY2000-present) */

import { useRef, useEffect, useMemo } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'
import { formatBudgetAmount, formatFiscalYear } from '@/utils/fiscalYear'
import type { SpendingTrendRow } from '@/types/budget'

interface SpendingTrendProps {
  data: SpendingTrendRow[]
  width?: number
  height?: number
  topN?: number
  highlightDepartment?: string | null
  mode?: 'absolute' | 'percent'
}

interface DeptSeries {
  department: string
  values: { fy: number; amount: number }[]
  color: string
}

const DEPT_COLORS = [
  '#0ea5e9', '#a78bfa', '#f59e0b', '#10b981', '#ef4444',
  '#ec4899', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
]

export default function SpendingTrend({
  data,
  width = 600,
  height = 300,
  topN = 8,
  highlightDepartment,
  mode = 'absolute',
}: SpendingTrendProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  // Build per-department series
  const series = useMemo((): DeptSeries[] => {
    if (data.length === 0) return []

    // Sum by department across all years to rank
    const deptTotals = new Map<string, number>()
    for (const r of data) {
      const amt = parseFloat(r.total) || 0
      deptTotals.set(r.department, (deptTotals.get(r.department) || 0) + amt)
    }

    // Get top N departments
    const topDepts = [...deptTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map((d) => d[0])

    const topSet = new Set(topDepts)

    // Group by department
    const byDept = new Map<string, { fy: number; amount: number }[]>()
    const yearTotals = new Map<number, number>()

    for (const r of data) {
      const fy = parseInt(r.fiscal_year, 10)
      const amt = parseFloat(r.total) || 0
      if (!topSet.has(r.department)) continue
      if (!byDept.has(r.department)) byDept.set(r.department, [])
      byDept.get(r.department)!.push({ fy, amount: amt })
      yearTotals.set(fy, (yearTotals.get(fy) || 0) + amt)
    }

    return topDepts.map((dept, i) => {
      let values = byDept.get(dept) || []
      values.sort((a, b) => a.fy - b.fy)

      if (mode === 'percent') {
        values = values.map((v) => ({
          fy: v.fy,
          amount: yearTotals.get(v.fy) ? (v.amount / yearTotals.get(v.fy)!) * 100 : 0,
        }))
      }

      return { department: dept, values, color: DEPT_COLORS[i % DEPT_COLORS.length] }
    })
  }, [data, topN, mode])

  useEffect(() => {
    if (!svgRef.current || series.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 12, right: 140, bottom: 28, left: 60 }
    const w = width - margin.left - margin.right
    const h = height - margin.top - margin.bottom

    svg.attr('width', width).attr('height', height)
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    // Scales
    const allValues = series.flatMap((s) => s.values)
    const fyExtent = d3.extent(allValues, (d) => d.fy) as [number, number]
    const maxAmt = d3.max(allValues, (d) => d.amount) || 1

    const x = d3.scaleLinear().domain(fyExtent).range([0, w])
    const y = d3.scaleLinear().domain([0, maxAmt * 1.05]).range([h, 0]).nice()

    // Grid
    const gridColor = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
    g.selectAll('.grid-line')
      .data(y.ticks(5))
      .join('line')
      .attr('x1', 0).attr('x2', w)
      .attr('y1', (d) => y(d)).attr('y2', (d) => y(d))
      .attr('stroke', gridColor)

    // Axes
    const axisColor = isDarkMode ? '#64748b' : '#94a3b8'
    g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat((d) => `'${String(d).slice(-2)}`))
      .call((g) => g.select('.domain').attr('stroke', axisColor))
      .call((g) => g.selectAll('.tick text').attr('fill', axisColor).attr('font-size', '9px').attr('font-family', '"JetBrains Mono", monospace'))
      .call((g) => g.selectAll('.tick line').attr('stroke', axisColor))

    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat((d) => mode === 'percent' ? `${d}%` : formatBudgetAmount(d as number)))
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('.tick text').attr('fill', axisColor).attr('font-size', '9px').attr('font-family', '"JetBrains Mono", monospace'))
      .call((g) => g.selectAll('.tick line').remove())

    // Lines
    // .defined() guards against negative or zero amounts in the source data
    // (e.g. PUC bond refunds / expenditure recoveries). Without this guard,
    // curveMonotoneX faithfully draws through negative values and produces
    // a line that appears to rise from below the x-axis. Breaking the line
    // at non-positive values is more honest than filtering them out, which
    // would imply continuity across the gap.
    const line = d3.line<{ fy: number; amount: number }>()
      .defined((d) => d.amount > 0)
      .x((d) => x(d.fy))
      .y((d) => y(d.amount))
      .curve(d3.curveMonotoneX)

    for (const s of series) {
      const isHighlighted = !highlightDepartment || s.department === highlightDepartment
      const opacity = highlightDepartment ? (isHighlighted ? 1 : 0.15) : 0.8

      const path = g.append('path')
        .datum(s.values)
        .attr('fill', 'none')
        .attr('stroke', s.color)
        .attr('stroke-width', isHighlighted ? 2 : 1.5)
        .attr('opacity', opacity)
        .attr('d', line)

      // Animate draw
      const totalLength = path.node()?.getTotalLength() || 0
      path
        .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
        .attr('stroke-dashoffset', totalLength)
        .transition()
        .duration(800)
        .ease(d3.easeCubicOut)
        .attr('stroke-dashoffset', 0)
    }

    // Legend (right side)
    const legendG = svg.append('g')
      .attr('transform', `translate(${width - margin.right + 10},${margin.top})`)

    for (const [i, s] of series.entries()) {
      const isHighlighted = !highlightDepartment || s.department === highlightDepartment
      const yPos = i * 16

      legendG.append('rect')
        .attr('x', 0).attr('y', yPos)
        .attr('width', 8).attr('height', 8)
        .attr('rx', 1.5)
        .attr('fill', s.color)
        .attr('opacity', isHighlighted ? 0.9 : 0.2)

      legendG.append('text')
        .attr('x', 12).attr('y', yPos + 4)
        .attr('dy', '0.35em')
        .attr('fill', isHighlighted ? (isDarkMode ? '#e2e8f0' : '#334155') : (isDarkMode ? '#475569' : '#94a3b8'))
        .attr('font-size', '8px')
        .attr('font-family', '"JetBrains Mono", monospace')
        .text(s.department.length > 18 ? s.department.slice(0, 17) + '…' : s.department)
        .append('title')
        .text(s.department)
    }

  }, [series, width, height, isDarkMode, highlightDepartment, mode])

  if (series.length === 0) return null

  return <svg ref={svgRef} className="w-full" />
}
