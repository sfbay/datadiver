import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'

export interface BarDatum {
  label: string
  value: number
  color?: string
}

interface HorizontalBarChartProps {
  data: BarDatum[]
  width?: number
  height?: number
  maxBars?: number
  valueFormatter?: (v: number) => string
}

export default function HorizontalBarChart({
  data,
  width = 280,
  height = 200,
  maxBars = 10,
  valueFormatter = (v) => String(v),
}: HorizontalBarChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const sliced = data.slice(0, maxBars)
    const margin = { top: 4, right: 40, bottom: 4, left: 90 }
    const w = width - margin.left - margin.right
    const h = height - margin.top - margin.bottom
    const barHeight = Math.min(h / sliced.length - 2, 18)

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const maxVal = d3.max(sliced, (d) => d.value) || 1
    const x = d3.scaleLinear().domain([0, maxVal]).range([0, w])
    const y = d3.scaleBand()
      .domain(sliced.map((d) => d.label))
      .range([0, sliced.length * (barHeight + 2)])
      .padding(0.1)

    // Bars
    g.selectAll('rect')
      .data(sliced)
      .join('rect')
      .attr('x', 0)
      .attr('y', (d) => y(d.label) ?? 0)
      .attr('width', 0)
      .attr('height', barHeight)
      .attr('rx', 2)
      .attr('fill', (d) => d.color || '#a78bfa')
      .attr('opacity', 0.8)
      .transition()
      .duration(500)
      .delay((_, i) => i * 30)
      .ease(d3.easeCubicOut)
      .attr('width', (d) => x(d.value))

    const labelColor = isDarkMode ? '#94a3b8' : '#64748b'
    const valueColor = isDarkMode ? '#cbd5e1' : '#334155'
    const maxLabelChars = Math.floor(margin.left / 7) // ~7px per mono char at 9px
    const clipId = `label-clip-${Math.random().toString(36).slice(2, 8)}`

    // Clip path for label area
    svg.append('defs')
      .append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('x', -margin.left)
      .attr('y', 0)
      .attr('width', margin.left - 6)
      .attr('height', height)

    // Labels (left) — marquee scroll on hover for long labels
    const labelGroups = g.selectAll<SVGGElement, (typeof sliced)[0]>('.bar-label-group')
      .data(sliced)
      .join('g')
      .attr('class', 'bar-label-group')
      .attr('clip-path', `url(#${clipId})`)

    labelGroups.each(function (d) {
      const labelG = d3.select(this)
      const isTruncated = d.label.length > maxLabelChars
      const displayText = isTruncated ? d.label.slice(0, maxLabelChars - 1) + '\u2026' : d.label
      const yPos = (y(d.label) ?? 0) + barHeight / 2

      const textEl = labelG.append('text')
        .attr('x', -4)
        .attr('y', yPos)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'end')
        .attr('fill', labelColor)
        .attr('font-size', '9px')
        .attr('font-family', '"JetBrains Mono", monospace')
        .attr('cursor', isTruncated ? 'default' : null)
        .text(displayText)

      if (isTruncated) {
        let hoverTimer: ReturnType<typeof setTimeout> | null = null
        let scrolling = false

        // Measure overflow once (hidden off-screen to avoid flash)
        let overflow = 0
        const measureEl = labelG.append('text')
          .attr('x', -9999).attr('y', -9999)
          .attr('font-size', '9px')
          .attr('font-family', '"JetBrains Mono", monospace')
          .text(d.label)
        const fullWidth = (measureEl.node()?.getComputedTextLength() ?? 0) + 4
        overflow = fullWidth - (margin.left - 10)
        measureEl.remove()

        const startScroll = () => {
          if (overflow <= 0) return
          scrolling = true
          // Swap to full text but pre-offset so visually nothing changes
          textEl.text(d.label).attr('x', -4 + overflow)

          const doScroll = () => {
            if (!scrolling) return
            textEl
              .attr('x', -4 + overflow)
              .transition()
              .duration(1200)
              .ease(d3.easeCubicOut)
              .attr('x', -4)
              .transition()
              .duration(overflow * 40) // ~25px/sec
              .ease(d3.easeLinear)
              .attr('x', -4 - overflow)
              .transition()
              .duration(1200)
              .delay(400)
              .ease(d3.easeCubicInOut)
              .attr('x', -4 + overflow)
              .on('end', () => { if (scrolling) doScroll() })
          }
          doScroll()
        }

        labelG.on('mouseenter', function () {
          hoverTimer = setTimeout(startScroll, 500)
        })

        labelG.on('mouseleave', function () {
          if (hoverTimer) clearTimeout(hoverTimer)
          scrolling = false
          textEl.interrupt()
          textEl.attr('x', -4).text(displayText)
        })
      }
    })

    // Value labels (right of bar)
    g.selectAll('.val-label')
      .data(sliced)
      .join('text')
      .attr('class', 'val-label')
      .attr('x', (d) => x(d.value) + 4)
      .attr('y', (d) => (y(d.label) ?? 0) + barHeight / 2)
      .attr('dy', '0.35em')
      .attr('fill', valueColor)
      .attr('font-size', '9px')
      .attr('font-family', '"JetBrains Mono", monospace')
      .text((d) => valueFormatter(d.value))

  }, [data, width, height, maxBars, valueFormatter, isDarkMode])

  return <svg ref={svgRef} className="w-full" />
}
