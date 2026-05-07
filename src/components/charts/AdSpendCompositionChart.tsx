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

// Layer colors — intentionally aligned with the compliance card bars above.
// Visual progression narrows scope: purple (all agencies) → slate-hatched
// (legal, excluded) → teal (discretionary, the compliance basis) → emerald
// (community media, the goal).
const COLOR_AGENCY = '#8b6282'        // purple — agency-managed
const COLOR_LEGAL = '#64748b'         // slate — legal notices (within direct, excluded)
const COLOR_DISCRETIONARY = '#2dd4bf' // teal — discretionary (within direct, the compliance basis)
const COLOR_PCARD = '#b85545'         // red — p-card untraceable
const COLOR_COMMUNITY = '#7a9954'     // emerald — community media share inside discretionary
// Target line uses the SAME hue as community media on purpose: the 50% line
// is "where community media should reach." Green dashed line = community's goal.
const COLOR_TARGET = '#7a9954'
// Resolution 240210 took effect in FY2024-25 (our internal fiscalYear = 2025).
// Any year strictly before that is shown with a faint "advisory" target line.
const RESOLUTION_EFFECTIVE_FY = 2025

// Hoisted module-level margins (re-rendering optimization: stable reference)
const MARGIN = { top: 24, right: 56, bottom: 38, left: 56 }

export default function AdSpendCompositionChart({
  data,
  width = 700,
  height = 400,
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

    // Compute total per year for scaling — sum of all four stack layers.
    const totalsByFY = active.map((d) => ({
      ...d,
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
    // Stack order from BOTTOM to TOP:
    //   1. Legal (slate)        — excluded foundation, set below the active stack
    //   2. Agencies (purple)    — the opaque majority of active ad spend
    //   3. Discretionary (teal) — the compliance basis, with community green inset
    //   4. P-card (red sliver)  — untraceable residual at the top
    // Placing legal at the bottom keeps the compliance-relevant layers (agencies
    // + discretionary + community) visually continuous, so the eye doesn't have
    // to skip over a "dismissed" band mid-stack to reconnect the active story.
    totalsByFY.forEach((d) => {
      const cx = x(d.fiscalYear) ?? 0
      const bw = x.bandwidth()
      let yCursor = h // start at bottom in screen coords, work upward

      // 1. Legal notices (BOTTOM — excluded foundation, slate hatched-look)
      if (d.legalNoticeTotal > 0) {
        const segH = h - y(d.legalNoticeTotal)
        const segY = yCursor - segH
        g.append('rect')
          .attr('x', cx)
          .attr('y', segY)
          .attr('width', bw)
          .attr('height', segH)
          .attr('fill', COLOR_LEGAL)
          .attr('fill-opacity', 0.28)
          .attr('stroke', COLOR_LEGAL)
          .attr('stroke-opacity', 0.4)
          .attr('stroke-width', 0.5)
          .append('title')
          .text(`Legal notices (excluded): ${formatBudgetAmount(d.legalNoticeTotal)}`)
        yCursor = segY
      }

      // 2. Agencies (above legal)
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

      // 3. Discretionary (above agencies) — the compliance basis, with community
      //    media emerald inset and 50%-of-discretionary target tick.
      if (d.discretionaryTotal > 0) {
        const segH = h - y(d.discretionaryTotal)
        const segY = yCursor - segH
        g.append('rect')
          .attr('x', cx)
          .attr('y', segY)
          .attr('width', bw)
          .attr('height', segH)
          .attr('fill', COLOR_DISCRETIONARY)
          .attr('fill-opacity', 0.35)
          .attr('stroke', COLOR_DISCRETIONARY)
          .attr('stroke-opacity', 0.55)
          .attr('stroke-width', 0.5)
          .append('title')
          .text(`Discretionary: ${formatBudgetAmount(d.discretionaryTotal)}`)

        // Community-media inset — fills from the BOTTOM of the discretionary
        // slice upward, proportional to the community/ethnic share.
        if (d.ethnicMediaSpend > 0) {
          const commH = Math.min(d.ethnicMediaSpend / d.discretionaryTotal, 1) * segH
          g.append('rect')
            .attr('x', cx)
            .attr('y', segY + segH - commH)
            .attr('width', bw)
            .attr('height', commH)
            .attr('fill', COLOR_COMMUNITY)
            .attr('fill-opacity', 0.78)
            .append('title')
            .text(`Community media: ${formatBudgetAmount(d.ethnicMediaSpend)} (${d.compliancePct.toFixed(1)}% of discretionary)`)
        }

        // 50%-of-discretionary marker — green dashed tick at half the
        // discretionary height. Prominent post-resolution, faint advisory
        // pre-resolution.
        const halfMarkY = segY + segH / 2
        const isPostResolution = d.fiscalYear >= RESOLUTION_EFFECTIVE_FY
        g.append('line')
          .attr('x1', cx - 1)
          .attr('x2', cx + bw + 1)
          .attr('y1', halfMarkY)
          .attr('y2', halfMarkY)
          .attr('stroke', COLOR_TARGET)
          .attr('stroke-width', isPostResolution ? 1.5 : 1)
          .attr('stroke-dasharray', '3,2')
          .attr('opacity', isPostResolution ? 0.85 : 0.2)

        yCursor = segY
      }

      // 4. P-card (TOP — untraceable residual, often an invisible sliver)
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

      // Compliance % label above the bar — green when hitting target, warning
      // amber when below. For pre-resolution years we render it neutral slate
      // since the compliance target wasn't in force.
      const labelY = y(d.grandTotal) - 6
      const isPostRes = d.fiscalYear >= RESOLUTION_EFFECTIVE_FY
      const labelColor = !isPostRes
        ? '#64748b'                                // neutral slate pre-resolution
        : d.compliancePct >= 50 ? COLOR_COMMUNITY  // green when hitting 50%+
        : '#d4a435'                                // amber warning below target
      g.append('text')
        .attr('x', cx + bw / 2)
        .attr('y', labelY)
        .attr('text-anchor', 'middle')
        .attr('font-size', 9)
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('fill', labelColor)
        .attr('opacity', isPostRes ? 0.95 : 0.55)
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

    // ── Resolution 240210 marker line — drawn between FY2024 and FY2025 bars.
    // This visually separates "pre-resolution" years (faded target ticks) from
    // "in force" years (prominent target ticks).
    {
      const preFY = RESOLUTION_EFFECTIVE_FY - 1
      const postFY = RESOLUTION_EFFECTIVE_FY
      const pre = totalsByFY.find((d) => d.fiscalYear === preFY)
      const post = totalsByFY.find((d) => d.fiscalYear === postFY)
      if (pre || post) {
        const preRight = pre ? (x(preFY) ?? 0) + x.bandwidth() : null
        const postLeft = post ? (x(postFY) ?? 0) : null
        const rx = preRight !== null && postLeft !== null
          ? (preRight + postLeft) / 2
          : (preRight ?? postLeft ?? 0)
        g.append('line')
          .attr('x1', rx).attr('x2', rx)
          .attr('y1', -10).attr('y2', h)
          .attr('stroke', COLOR_TARGET)
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '2,3')
          .attr('opacity', 0.35)
        g.append('text')
          .attr('x', rx + 4)
          .attr('y', -12)
          .attr('font-size', 8)
          .attr('font-family', 'JetBrains Mono, monospace')
          .attr('fill', COLOR_TARGET)
          .attr('opacity', 0.7)
          .text('Res. 240210 in force →')
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

    // Right-side legend — ordered TOP-to-BOTTOM to match the visual stack
    // order in each bar: p-card (top) → discretionary (with community inset) →
    // agencies → legal (bottom, excluded). Reading the legend top-down
    // mirrors reading a bar top-down.
    const legendItems: { label: string; color: string; opacity: number }[] = [
      { label: 'P-card', color: COLOR_PCARD, opacity: 0.55 },
      { label: 'Discretionary', color: COLOR_DISCRETIONARY, opacity: 0.35 },
      { label: 'Community $', color: COLOR_COMMUNITY, opacity: 0.78 },
      { label: 'Agencies', color: COLOR_AGENCY, opacity: 0.4 },
      { label: 'Legal (excl.)', color: COLOR_LEGAL, opacity: 0.28 },
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
