import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'
import { dorlingLabel } from './dorlingLabel'
import { SCALE_FACTORS } from '@/stores/typeScale'

interface DorlingCartogramDatum {
  name: string
  value: number
  population: number
  lat: number
  lng: number
}

interface DorlingCartogramProps {
  data: DorlingCartogramDatum[]
  colorScale: (value: number) => string
  width?: number
  height?: number
  onHover?: (name: string | null) => void
  onSelect?: (name: string) => void
}

interface TooltipState {
  x: number
  y: number
  name: string
  value: number
  population: number
}

export default function DorlingCartogram({
  data,
  colorScale,
  width = 500,
  height = 400,
  onHover,
  onSelect,
}: DorlingCartogramProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDarkMode = useAppStore((s) => s.isDarkMode)
  const typeScale = useAppStore((s) => s.typeScale)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [hoveredName, setHoveredName] = useState<string | null>(null)

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    svg.attr('width', width).attr('height', height)

    const padding = 40

    // --- Coordinate projection (simple linear, NOT Mercator) ---
    const lngs = data.map((d) => d.lng)
    const lats = data.map((d) => d.lat)
    const minLng = d3.min(lngs) as number
    const maxLng = d3.max(lngs) as number
    const minLat = d3.min(lats) as number
    const maxLat = d3.max(lats) as number

    const xScale = d3.scaleLinear()
      .domain([minLng, maxLng])
      .range([padding, width - padding])

    // Inverted: higher lat → lower y (north at top)
    const yScale = d3.scaleLinear()
      .domain([maxLat, minLat])
      .range([padding, height - padding])

    // --- Radius scale ---
    const minPop = d3.min(data, (d) => d.population) as number
    const maxPop = d3.max(data, (d) => d.population) as number
    const radiusScale = d3.scaleSqrt()
      .domain([minPop, maxPop])
      .range([8, 40])

    // --- Build simulation nodes ---
    type SimNode = d3.SimulationNodeDatum & DorlingCartogramDatum & { r: number }
    const nodes: SimNode[] = data.map((d) => ({
      ...d,
      r: radiusScale(d.population),
      x: xScale(d.lng),
      y: yScale(d.lat),
    }))

    // --- Force simulation (run to completion, no animation) ---
    const simulation = d3.forceSimulation<SimNode>(nodes)
      .force('x', d3.forceX<SimNode>((d) => xScale(d.lng)).strength(0.8))
      .force('y', d3.forceY<SimNode>((d) => yScale(d.lat)).strength(0.8))
      .force('collide', d3.forceCollide<SimNode>((d) => d.r + 2).strength(1))
      .stop()

    // Run ~100 ticks synchronously then freeze
    for (let i = 0; i < 100; i++) {
      simulation.tick()
    }

    // --- Render ---
    const strokeColor = isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'
    const labelColor = isDarkMode ? '#f1f5f9' : '#1e293b'
    const subLabelColor = isDarkMode ? '#cbd5e1' : '#475569'
    const labelFactor = SCALE_FACTORS[typeScale]

    const g = svg.append('g')

    const circleGroups = g
      .selectAll<SVGGElement, SimNode>('g.node')
      .data(nodes)
      .join('g')
      .attr('class', 'node')
      .attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
      .attr('cursor', onSelect ? 'pointer' : 'default')

    // Circle
    circleGroups
      .append('circle')
      .attr('r', (d) => d.r)
      .attr('fill', (d) => colorScale(d.value))
      .attr('stroke', strokeColor)
      .attr('stroke-width', 1)
      .attr('opacity', 0)
      .transition()
      .duration(500)
      .delay((_, i) => i * 8)
      .ease(d3.easeCubicOut)
      .attr('opacity', 0.9)

    // Name label (only when the scaled label still fits the circle)
    circleGroups
      .filter((d) => dorlingLabel(d.r, labelFactor).showName)
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', (d) => (dorlingLabel(d.r, labelFactor).showPop ? 'auto' : 'middle'))
      .attr('dy', (d) => (dorlingLabel(d.r, labelFactor).showPop ? '-0.2em' : '0'))
      .attr('fill', labelColor)
      .style('font-size', (d) => dorlingLabel(d.r, labelFactor).nameFontRem)
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-weight', '600')
      .attr('pointer-events', 'none')
      .text((d) => {
        // Truncate long names to fit — budget shrinks as the root scale grows
        const maxChars = dorlingLabel(d.r, labelFactor).nameMaxChars
        return d.name.length > maxChars ? d.name.slice(0, maxChars - 1) + '…' : d.name
      })

    // Population sub-label (only when radius fits both labels at this scale)
    circleGroups
      .filter((d) => dorlingLabel(d.r, labelFactor).showPop)
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'hanging')
      .attr('dy', '0.4em')
      .attr('fill', subLabelColor)
      .style('font-size', (d) => dorlingLabel(d.r, labelFactor).popFontRem)
      .attr('font-family', '"JetBrains Mono", monospace')
      .attr('pointer-events', 'none')
      .text((d) => {
        const pop = d.population
        return pop >= 1000 ? (pop / 1000).toFixed(1) + 'k' : String(pop)
      })

    // Interaction overlay (transparent hit-target circle)
    circleGroups
      .append('circle')
      .attr('r', (d) => d.r)
      .attr('fill', 'transparent')
      .on('mouseenter', function (event: MouseEvent, d: SimNode) {
        // Highlight
        d3.select(this.parentNode as SVGGElement)
          .select('circle:first-of-type')
          .transition()
          .duration(120)
          .attr('opacity', 1)
          .attr('stroke-width', 2)

        const svgRect = svgRef.current?.getBoundingClientRect()
        if (svgRect) {
          setTooltip({
            x: event.clientX - svgRect.left,
            y: event.clientY - svgRect.top,
            name: d.name,
            value: d.value,
            population: d.population,
          })
        }
        setHoveredName(d.name)
        onHover?.(d.name)
      })
      .on('mousemove', function (event: MouseEvent) {
        const svgRect = svgRef.current?.getBoundingClientRect()
        if (svgRect) {
          setTooltip((prev) =>
            prev ? { ...prev, x: event.clientX - svgRect.left, y: event.clientY - svgRect.top } : prev
          )
        }
      })
      .on('mouseleave', function (_event: MouseEvent, _d: SimNode) {
        d3.select(this.parentNode as SVGGElement)
          .select('circle:first-of-type')
          .transition()
          .duration(150)
          .attr('opacity', 0.9)
          .attr('stroke-width', 1)

        setTooltip(null)
        setHoveredName(null)
        onHover?.(null)
      })
      .on('click', (_event: MouseEvent, d: SimNode) => {
        onSelect?.(d.name)
      })

    return () => {
      simulation.stop()
    }
  }, [data, colorScale, width, height, isDarkMode, onHover, onSelect, typeScale])

  // Re-highlight hovered circle when hoveredName changes from outside
  // (internal state is sufficient — no external highlight needed beyond the tooltip)

  const tooltipBg = isDarkMode ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.95)'
  const tooltipBorder = isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(100,116,139,0.2)'
  const tooltipText = isDarkMode ? '#f1f5f9' : '#0f172a'
  const tooltipSub = isDarkMode ? '#94a3b8' : '#64748b'

  return (
    <div className="relative select-none" style={{ width, height }}>
      <svg ref={svgRef} />

      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 rounded-lg px-3 py-2 text-sm shadow-lg"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 8,
            background: tooltipBg,
            border: `1px solid ${tooltipBorder}`,
            color: tooltipText,
            backdropFilter: 'blur(8px)',
            maxWidth: 200,
          }}
        >
          <div className="font-semibold" style={{ fontFamily: 'Inter, sans-serif' }}>
            {tooltip.name}
          </div>
          <div
            className="mt-0.5 font-mono text-xs"
            style={{ color: tooltipSub, fontFamily: '"JetBrains Mono", monospace' }}
          >
            Value: {typeof tooltip.value === 'number' ? tooltip.value.toLocaleString() : tooltip.value}
          </div>
          <div
            className="font-mono text-xs"
            style={{ color: tooltipSub, fontFamily: '"JetBrains Mono", monospace' }}
          >
            Pop: {tooltip.population.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  )
}
