import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'
import { formatHour, DAY_LABELS } from '@/utils/time'

const TEXT_COLORS = { light: '#64748b', dark: '#94a3b8' } as const

interface HourlyHeatgridProps {
  /** 7x24 grid: grid[dow][hour] = call count (0=Sun) */
  grid: number[][]
  width?: number
  height?: number
}

export default function HourlyHeatgrid({ grid, width = 240, height = 160 }: HourlyHeatgridProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const setTimeOfDayFilter = useAppStore((s) => s.setTimeOfDayFilter)
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  useEffect(() => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 14, right: 4, bottom: 4, left: 28 }
    const w = width - margin.left - margin.right
    const h = height - margin.top - margin.bottom
    const cellW = w / 24
    const cellH = h / 7

    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Find max value for color scale
    const allValues = grid.flat()
    const maxVal = d3.max(allValues) || 1

    const colorScale = d3.scaleSequential()
      .domain([0, maxVal])
      .interpolator(d3.interpolateYlOrRd)

    // Draw cells
    for (let dow = 0; dow < 7; dow++) {
      for (let hour = 0; hour < 24; hour++) {
        const value = grid[dow][hour]
        g.append('rect')
          .attr('x', hour * cellW)
          .attr('y', dow * cellH)
          .attr('width', cellW - 1)
          .attr('height', cellH - 1)
          .attr('rx', 1.5)
          .attr('fill', value > 0 ? colorScale(value) : 'rgba(100,116,139,0.08)')
          .attr('opacity', 0)
          .attr('cursor', 'pointer')
          .on('click', () => {
            setTimeOfDayFilter({ startHour: hour, endHour: hour })
          })
          .append('title')
          .text(`${DAY_LABELS[dow]} ${formatHour(hour)}: ${value} calls`)

        // Animate in
        g.selectAll('rect')
          .transition()
          .duration(400)
          .delay((_, i) => i * 2)
          .attr('opacity', 1)
      }
    }

    const textColor = isDarkMode ? TEXT_COLORS.dark : TEXT_COLORS.light

    // Row labels (day of week)
    for (let dow = 0; dow < 7; dow++) {
      g.append('text')
        .attr('x', -4)
        .attr('y', dow * cellH + cellH / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'end')
        .attr('fill', textColor)
        .attr('font-size', '8px')
        .attr('font-family', '"JetBrains Mono", monospace')
        .text(DAY_LABELS[dow].charAt(0))
    }

    // Column labels (hours, every 6th)
    for (let h = 0; h < 24; h += 6) {
      g.append('text')
        .attr('x', h * cellW + cellW / 2)
        .attr('y', -4)
        .attr('text-anchor', 'middle')
        .attr('fill', textColor)
        .attr('font-size', '8px')
        .attr('font-family', '"JetBrains Mono", monospace')
        .text(formatHour(h))
    }
  }, [grid, width, height, setTimeOfDayFilter, isDarkMode])

  return (
    <div className="relative">
      <svg ref={svgRef} className="w-full" />
    </div>
  )
}
