/** D3 stacked bar chart: year-over-year ad spend composition.
 *
 *  Each FY is represented as a vertical stack with three layers
 *  (agency-managed, direct ad placements, p-card). Inside the direct
 *  ad placements segment, we overlay the community-media share so the
 *  viewer can see both the composition of total spend AND the compliance
 *  signal in a single visualization.
 *
 *  This replaces the older single-line ComplianceTrendChart.
 */

import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'
import { formatFiscalYear, formatBudgetAmount } from '@/utils/fiscalYear'
import type { ComplianceTrendPoint } from '@/hooks/useComplianceData'

interface AdSpendCompositionChartProps {
  data: ComplianceTrendPoint[]
  width?: number
  height?: number
  currentFY?: number
}

// Layer colors — intentionally aligned with the compliance card bars above
const COLOR_AGENCY = '#a855f7'        // purple — agency-managed
const COLOR_DIRECT = '#0ea5e9'        // sky — direct ad placements (legal+discretionary container)
const COLOR_DIRECT_LEGAL = '#64748b'  // slate — legal notices (within direct)
const COLOR_PCARD = '#ef4444'         // red — p-card untraceable
const COLOR_COMMUNITY = '#10b981'     // emerald — community media share inside direct
const COLOR_TARGET = '#f59e0b'        // amber — 50% target reference

// Hoisted module-level margins (re-rendering optimization: stable reference)
const MARGIN = { top: 24, right: 56, bottom: 38, left: 56 }

export default function AdSpendCompositionChart({
  data,
  width = 700,
  height = 320,
  currentFY,
}: AdSpendCompositionChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const w = width - MARGIN.left - MARGIN.right
    const h = height - MARGIN.top - MARGIN.bottom

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    const textColor = isDarkMode ? '#94a3b8' : '#64748b'
    const subtleColor = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'

    // Filter to FYs with any spending data at all
    const active = data.filter(
      (d) => (d.discretionaryTotal + d.legalNoticeTotal + d.agencyTotal + d.pcardTotal) > 0
    )
    if (active.length === 0) return

    // Compute total per year for scaling (agency + tagged + pcard)
    const totalsByFY = active.map((d) => ({
      ...d,
      taggedTotal: d.discretionaryTotal + d.legalNoticeTotal,
      grandTotal: d.discretionaryTotal + d.legalNoticeTotal + d.agencyTotal + d.pcardTotal,
    }))

    const maxTotal = d3.max(totalsByFY, (d) => d.grandTotal) || 0

    // Scales
    const x = d3.scaleBand<number>()
      .domain(totalsByFY.map((d) => d.fiscalYear))
      .range([0, w])
      .padding(0.28)

    const y = d3.scaleLinear()
      .domain([0, maxTotal * 1.08])
      .range([h, 0])
      .nice()

    // Grid lines (horizontal)
    const yTicks = y.ticks(5)
    g.selectAll('.grid-line')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('x1', 0).attr('x2', w)
      .attr('y1', (d) => y(d)).attr('y2', (d) => y(d))
      .attr('stroke', subtleColor)
      .attr('stroke-width', 1)

    // ── Stacked bars ──
    // Stack order from BOTTOM to TOP: agency (largest, foundation) → direct → p-card
    totalsByFY.forEach((d) => {
      const cx = x(d.fiscalYear) ?? 0
      const bw = x.bandwidth()
      let yCursor = h // start at bottom in screen coords, work upward

      // 1. Agency segment (bottom)
      if (d.agencyTotal > 0) {
        const segH = h - y(d.agencyTotal)
        const segY = yCursor - segH
        g.append('rect')
          .attr('x', cx)
          .attr('y', segY)
          .attr('width', bw)
          .attr('height', segH)
          .attr('fill', COLOR_AGENCY)
          .attr('fill-opacity', 0.4)
          .attr('stroke', COLOR_AGENCY)
          .attr('stroke-opacity', 0.5)
          .attr('stroke-width', 0.5)
          .append('title')
          .text(`Agencies: ${formatBudgetAmount(d.agencyTotal)}`)
        yCursor = segY
      }

      // 2. Direct ad placements segment — sub-divided into legal (slate) + discretionary (sky)
      if (d.taggedTotal > 0) {
        const segH = h - y(d.taggedTotal)
        const segY = yCursor - segH

        // Legal sub-portion (drawn at the bottom of the direct segment, slate hatched-look via opacity)
        if (d.legalNoticeTotal > 0) {
          const legalH = (d.legalNoticeTotal / d.taggedTotal) * segH
          g.append('rect')
            .attr('x', cx)
            .attr('y', segY + (segH - legalH))
            .attr('width', bw)
            .attr('height', legalH)
            .attr('fill', COLOR_DIRECT_LEGAL)
            .attr('fill-opacity', 0.28)
            .attr('stroke', COLOR_DIRECT_LEGAL)
            .attr('stroke-opacity', 0.4)
            .attr('stroke-width', 0.5)
            .append('title')
            .text(`Legal notices (excluded): ${formatBudgetAmount(d.legalNoticeTotal)}`)
        }

        // Discretionary sub-portion (sky)
        if (d.discretionaryTotal > 0) {
          const discH = (d.discretionaryTotal / d.taggedTotal) * segH
          g.append('rect')
            .attr('x', cx)
            .attr('y', segY)
            .attr('width', bw)
            .attr('height', discH)
            .attr('fill', COLOR_DIRECT)
            .attr('fill-opacity', 0.32)
            .attr('stroke', COLOR_DIRECT)
            .attr('stroke-opacity', 0.5)
            .attr('stroke-width', 0.5)
            .append('title')
            .text(`Discretionary: ${formatBudgetAmount(d.discretionaryTotal)}`)

          // Community-media inset — fills from the BOTTOM of the discretionary slice upward,
          // proportional to the share of discretionary that went to community/ethnic outlets.
          if (d.ethnicMediaSpend > 0) {
            const commH = Math.min(d.ethnicMediaSpend / d.discretionaryTotal, 1) * discH
            g.append('rect')
              .attr('x', cx)
              .attr('y', segY + discH - commH)
              .attr('width', bw)
              .attr('height', commH)
              .attr('fill', COLOR_COMMUNITY)
              .attr('fill-opacity', 0.78)
              .append('title')
              .text(`Community media: ${formatBudgetAmount(d.ethnicMediaSpend)} (${d.compliancePct.toFixed(1)}% of discretionary)`)
          }

          // 50%-of-discretionary marker — a thin amber tick across this bar's width,
          // positioned at half the discretionary height.
          const halfMarkY = segY + discH / 2
          g.append('line')
            .attr('x1', cx - 1)
            .attr('x2', cx + bw + 1)
            .attr('y1', halfMarkY)
            .attr('y2', halfMarkY)
            .attr('stroke', COLOR_TARGET)
            .attr('stroke-width', 1.25)
            .attr('stroke-dasharray', '3,2')
            .attr('opacity', 0.7)
        }

        yCursor = segY
      }

      // 3. P-card segment (top sliver, often invisible-small)
      if (d.pcardTotal > 0) {
        const segH = Math.max(h - y(d.pcardTotal), 1.5) // floor 1.5px so it never disappears
        const segY = yCursor - segH
        g.append('rect')
          .attr('x', cx)
          .attr('y', segY)
          .attr('width', bw)
          .attr('height', segH)
          .attr('fill', COLOR_PCARD)
          .attr('fill-opacity', 0.55)
          .append('title')
          .text(`P-card (untraceable to outlet): ${formatBudgetAmount(d.pcardTotal)}`)
        yCursor = segY
      }

      // Compliance % label above the bar
      const labelY = y(d.grandTotal) - 6
      g.append('text')
        .attr('x', cx + bw / 2)
        .attr('y', labelY)
        .attr('text-anchor', 'middle')
        .attr('font-size', 9)
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('fill', d.compliancePct >= 50 ? COLOR_COMMUNITY : COLOR_TARGET)
        .attr('opacity', 0.85)
        .text(`${d.compliancePct.toFixed(0)}%`)

      // Highlight ring around the current FY
      if (d.fiscalYear === currentFY) {
        g.append('rect')
          .attr('x', cx - 2)
          .attr('y', y(d.grandTotal) - 2)
          .attr('width', bw + 4)
          .attr('height', h - y(d.grandTotal) + 4)
          .attr('fill', 'none')
          .attr('stroke', isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)')
          .attr('stroke-width', 1)
          .attr('rx', 3)
      }
    })

    // ── Resolution 240210 marker line at FY2025 ──
    const resolutionFY = 2025
    if (resolutionFY >= totalsByFY[0].fiscalYear && resolutionFY <= totalsByFY[totalsByFY.length - 1].fiscalYear) {
      // Draw between bars: midway between FY2024 and FY2025 bandwidth midpoints
      const fy24 = totalsByFY.find((d) => d.fiscalYear === 2024)
      const fy25 = totalsByFY.find((d) => d.fiscalYear === 2025)
      if (fy24 && fy25) {
        const x24 = (x(2024) ?? 0) + x.bandwidth()
        const x25 = x(2025) ?? 0
        const rx = (x24 + x25) / 2
        g.append('line')
          .attr('x1', rx).attr('x2', rx)
          .attr('y1', -8).attr('y2', h)
          .attr('stroke', isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '3,3')
        g.append('text')
          .attr('x', rx + 4)
          .attr('y', -10)
          .attr('font-size', 8)
          .attr('font-family', 'JetBrains Mono, monospace')
          .attr('fill', textColor)
          .attr('opacity', 0.6)
          .text('Res. 240210 →')
      }
    }

    // ── X axis: fiscal years ──
    const xAxis = d3.axisBottom(x)
      .tickFormat((d) => formatFiscalYear(d as number).replace('FY', ''))

    g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(xAxis)
      .call((sel) => sel.select('.domain').attr('stroke', subtleColor))
      .call((sel) => sel.selectAll('.tick line').attr('stroke', subtleColor))
      .call((sel) => sel.selectAll('.tick text')
        .attr('fill', textColor)
        .attr('font-size', 9)
        .attr('font-family', 'JetBrains Mono, monospace'))

    // ── Y axis: dollars ──
    const yAxis = d3.axisLeft(y)
      .ticks(5)
      .tickFormat((d) => formatBudgetAmount(d as number))

    g.append('g')
      .call(yAxis)
      .call((sel) => sel.select('.domain').remove())
      .call((sel) => sel.selectAll('.tick line').remove())
      .call((sel) => sel.selectAll('.tick text')
        .attr('fill', textColor)
        .attr('font-size', 8)
        .attr('font-family', 'JetBrains Mono, monospace'))

    // Y axis title
    g.append('text')
      .attr('x', -8).attr('y', -10)
      .attr('font-size', 8)
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('fill', textColor)
      .attr('opacity', 0.6)
      .text('Annual ad-related spending')

    // Right-side legend (small, vertical)
    const legendItems: { label: string; color: string; opacity: number }[] = [
      { label: 'Agencies', color: COLOR_AGENCY, opacity: 0.4 },
      { label: 'Direct (discr.)', color: COLOR_DIRECT, opacity: 0.32 },
      { label: 'Legal (excl.)', color: COLOR_DIRECT_LEGAL, opacity: 0.28 },
      { label: 'P-card', color: COLOR_PCARD, opacity: 0.55 },
      { label: 'Community $', color: COLOR_COMMUNITY, opacity: 0.78 },
    ]
    const legend = g.append('g').attr('transform', `translate(${w + 10},0)`)
    legendItems.forEach((item, i) => {
      const yPos = i * 14
      legend.append('rect')
        .attr('x', 0).attr('y', yPos)
        .attr('width', 8).attr('height', 8)
        .attr('fill', item.color)
        .attr('fill-opacity', item.opacity)
        .attr('stroke', item.color)
        .attr('stroke-opacity', 0.6)
        .attr('stroke-width', 0.5)
      legend.append('text')
        .attr('x', 12).attr('y', yPos + 7)
        .attr('font-size', 7)
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('fill', textColor)
        .attr('opacity', 0.7)
        .text(item.label)
    })

  }, [data, width, height, isDarkMode, currentFY])

  return <svg ref={svgRef} className="w-full" />
}
