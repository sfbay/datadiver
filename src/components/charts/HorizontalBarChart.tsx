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
  /** Left margin in px — wider for long labels (default 150) */
  labelWidth?: number
  /** Cap outlier bars at this percentile to prevent scale compression (0 = off) */
  capPercentile?: number
  /** Click handler for individual bars */
  onBarClick?: (label: string) => void
}

export default function HorizontalBarChart({
  data,
  width = 280,
  height = 200,
  maxBars = 10,
  valueFormatter = (v) => String(v),
  labelWidth = 150,
  capPercentile = 0,
  onBarClick,
}: HorizontalBarChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDarkMode = useAppStore((s) => s.isDarkMode)
  const typeScale = useAppStore((s) => s.typeScale)

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const sliced = data.slice(0, maxBars)
    const margin = { top: 4, right: 40, bottom: 4, left: labelWidth }
    const w = width - margin.left - margin.right
    const h = height - margin.top - margin.bottom
    const barHeight = Math.min(h / sliced.length - 2, 18)

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const rawMax = d3.max(sliced, (d) => d.value) || 1
    // Cap the scale if an outlier compresses other bars
    let scaleCap = rawMax
    if (capPercentile > 0 && sliced.length >= 3) {
      const sorted = [...sliced].sort((a, b) => a.value - b.value)
      const idx = Math.floor(sorted.length * capPercentile / 100)
      const pVal = sorted[Math.min(idx, sorted.length - 1)].value
      if (pVal > 0 && rawMax > pVal * 2) {
        scaleCap = pVal * 1.3 // cap at 130% of the percentile value
      }
    }
    const x = d3.scaleLinear().domain([0, scaleCap]).range([0, w])
    const y = d3.scaleBand()
      .domain(sliced.map((d) => d.label))
      .range([0, sliced.length * (barHeight + 2)])
      .padding(0.1)

    // Bars — capped bars get a diagonal break pattern at the end
    const bars = g.selectAll('.bar')
      .data(sliced)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', 0)
      .attr('y', (d) => y(d.label) ?? 0)
      .attr('width', 0)
      .attr('height', barHeight)
      .attr('rx', 2)
      .attr('fill', (d) => d.color || '#8b6282')
      .attr('opacity', 0.8)

    if (onBarClick) {
      bars.attr('cursor', 'pointer')
        .on('click', (_, d) => onBarClick(d.label))
    }

    bars.transition()
      .duration(500)
      .delay((_, i) => i * 30)
      .ease(d3.easeCubicOut)
      .attr('width', (d) => Math.min(x(d.value), w))

    // Break indicator for capped bars (diagonal hash marks)
    if (scaleCap < rawMax) {
      sliced.filter((d) => d.value > scaleCap).forEach((d) => {
        const yPos = (y(d.label) ?? 0)
        const breakX = w - 3
        g.append('line')
          .attr('x1', breakX).attr('y1', yPos + 2)
          .attr('x2', breakX + 4).attr('y2', yPos + barHeight - 2)
          .attr('stroke', isDarkMode ? '#0f172a' : '#fff')
          .attr('stroke-width', 2)
        g.append('line')
          .attr('x1', breakX - 3).attr('y1', yPos + 2)
          .attr('x2', breakX + 1).attr('y2', yPos + barHeight - 2)
          .attr('stroke', isDarkMode ? '#0f172a' : '#fff')
          .attr('stroke-width', 2)
      })
    }

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
        .style('font-size', '0.5625rem')
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
          .style('font-size', '0.5625rem')
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

    // Value labels (right of bar) — capped bars get label inside the bar end
    g.selectAll('.val-label')
      .data(sliced)
      .join('text')
      .attr('class', 'val-label')
      .attr('x', (d) => {
        const barW = Math.min(x(d.value), w)
        // If bar is capped (fills full width), place label inside the bar
        return d.value > scaleCap ? barW - 4 : barW + 4
      })
      .attr('y', (d) => (y(d.label) ?? 0) + barHeight / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', (d) => d.value > scaleCap ? 'end' : 'start')
      .attr('fill', (d) => d.value > scaleCap ? '#fff' : valueColor)
      .style('font-size', '0.5625rem')
      .attr('font-weight', (d) => d.value > scaleCap ? '600' : '400')
      .attr('font-family', '"JetBrains Mono", monospace')
      .text((d) => valueFormatter(d.value))

  }, [data, width, height, maxBars, valueFormatter, isDarkMode, labelWidth, capPercentile, onBarClick, typeScale])

  return <svg ref={svgRef} className="w-full" />
}
