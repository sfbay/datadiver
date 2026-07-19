import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import { useAppStore } from '@/stores/appStore'

interface CorrelationScatterProps {
  data: { name: string; x: number; y: number; population: number; color: string }[]
  xLabel: string
  yLabel: string
  width?: number
  height?: number
  onHover?: (name: string | null) => void
  onSelect?: (name: string) => void
}

interface TooltipState {
  visible: boolean
  x: number
  y: number
  name: string
  xVal: number
  yVal: number
}

function formatAxisValue(value: number, label: string): string {
  const lowerLabel = label.toLowerCase()
  const isCurrency = lowerLabel.includes('income') || lowerLabel.includes('revenue') ||
    lowerLabel.includes('$') || lowerLabel.includes('median') || lowerLabel.includes('earning') ||
    lowerLabel.includes('wage') || lowerLabel.includes('salary')
  const isPercent = lowerLabel.includes('%') || lowerLabel.includes('percent') ||
    lowerLabel.includes('rate') || lowerLabel.includes('share')

  if (isCurrency) {
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
    return `$${value.toFixed(0)}`
  }
  if (isPercent) {
    return `${value.toFixed(0)}%`
  }
  // Counts
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return `${value}`
}

function formatTooltipValue(value: number, label: string): string {
  const lowerLabel = label.toLowerCase()
  const isCurrency = lowerLabel.includes('income') || lowerLabel.includes('revenue') ||
    lowerLabel.includes('$') || lowerLabel.includes('median') || lowerLabel.includes('earning') ||
    lowerLabel.includes('wage') || lowerLabel.includes('salary')
  const isPercent = lowerLabel.includes('%') || lowerLabel.includes('percent') ||
    lowerLabel.includes('rate') || lowerLabel.includes('share')

  if (isCurrency) {
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
    return `$${value.toFixed(0)}`
  }
  if (isPercent) {
    return `${value.toFixed(1)}%`
  }
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  // Whole numbers (counts like crime incidents) should not show decimals
  return Number.isInteger(value) ? `${value}` : `${value.toFixed(1)}`
}

function computeOLS(data: { x: number; y: number }[]): { slope: number; intercept: number; r: number } {
  const n = data.length
  if (n < 2) return { slope: 0, intercept: 0, r: 0 }

  const xMean = d3.mean(data, (d) => d.x) ?? 0
  const yMean = d3.mean(data, (d) => d.y) ?? 0

  let ssXY = 0
  let ssXX = 0
  let ssYY = 0

  for (const d of data) {
    const dx = d.x - xMean
    const dy = d.y - yMean
    ssXY += dx * dy
    ssXX += dx * dx
    ssYY += dy * dy
  }

  const slope = ssXX === 0 ? 0 : ssXY / ssXX
  const intercept = yMean - slope * xMean
  const r = ssXX === 0 || ssYY === 0 ? 0 : ssXY / Math.sqrt(ssXX * ssYY)

  return { slope, intercept, r }
}

export default function CorrelationScatter({
  data,
  xLabel,
  yLabel,
  width = 400,
  height = 280,
  onHover,
  onSelect,
}: CorrelationScatterProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDark = useAppStore((s) => s.isDarkMode)

  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    name: '',
    xVal: 0,
    yVal: 0,
  })

  const [pearsonR, setPearsonR] = useState<number>(0)

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 16, right: 20, bottom: 44, left: 54 }
    const w = width - margin.left - margin.right
    const h = height - margin.top - margin.bottom

    svg.attr('width', width).attr('height', height)

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Scales
    const xExtent = d3.extent(data, (d) => d.x) as [number, number]
    const yExtent = d3.extent(data, (d) => d.y) as [number, number]

    const xPad = (xExtent[1] - xExtent[0]) * 0.08 || 1
    const yPad = (yExtent[1] - yExtent[0]) * 0.08 || 1

    const xScale = d3.scaleLinear()
      .domain([xExtent[0] - xPad, xExtent[1] + xPad])
      .range([0, w])
      .nice()

    const yScale = d3.scaleLinear()
      .domain([yExtent[0] - yPad, yExtent[1] + yPad])
      .range([h, 0])
      .nice()

    const popExtent = d3.extent(data, (d) => d.population) as [number, number]
    const rScale = d3.scaleSqrt()
      .domain([0, popExtent[1]])
      .range([3, 14])

    // Grid lines
    const gridColor = isDark ? '#1e293b' : '#e2e8f0'

    g.append('g')
      .attr('class', 'grid-x')
      .attr('transform', `translate(0,${h})`)
      .call(
        d3.axisBottom(xScale)
          .ticks(5)
          .tickSize(-h)
          .tickFormat(() => '')
      )
      .call((g) => g.select('.domain').remove())
      .selectAll('line')
      .attr('stroke', gridColor)
      .attr('stroke-dasharray', '2,3')

    g.append('g')
      .attr('class', 'grid-y')
      .call(
        d3.axisLeft(yScale)
          .ticks(5)
          .tickSize(-w)
          .tickFormat(() => '')
      )
      .call((g) => g.select('.domain').remove())
      .selectAll('line')
      .attr('stroke', gridColor)
      .attr('stroke-dasharray', '2,3')

    // Axes
    const axisColor = isDark ? '#cbd5e1' : '#475569'
    const axisMuted = isDark ? '#94a3b8' : '#64748b'

    const xAxis = d3.axisBottom(xScale)
      .ticks(5)
      .tickFormat((d) => formatAxisValue(d as number, xLabel))
      .tickSize(4)

    g.append('g')
      .attr('transform', `translate(0,${h})`)
      .call(xAxis)
      .call((g) => g.select('.domain').attr('stroke', gridColor))
      .selectAll('text')
      .attr('fill', axisMuted)
      .attr('font-size', '9px')
      .attr('font-family', '"JetBrains Mono", monospace')

    g.selectAll('.grid-x .tick line, .grid-y .tick line')
      .attr('stroke', gridColor)

    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickFormat((d) => formatAxisValue(d as number, yLabel))
      .tickSize(4)

    g.append('g')
      .call(yAxis)
      .call((g) => g.select('.domain').attr('stroke', gridColor))
      .selectAll('text')
      .attr('fill', axisMuted)
      .attr('font-size', '9px')
      .attr('font-family', '"JetBrains Mono", monospace')

    // Axis labels
    g.append('text')
      .attr('x', w / 2)
      .attr('y', h + 36)
      .attr('text-anchor', 'middle')
      .attr('fill', axisColor)
      .attr('font-size', '10px')
      .attr('font-family', "'Inter', sans-serif")
      .text(xLabel)

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -h / 2)
      .attr('y', -42)
      .attr('text-anchor', 'middle')
      .attr('fill', axisColor)
      .attr('font-size', '10px')
      .attr('font-family', "'Inter', sans-serif")
      .text(yLabel)

    // OLS trend line
    const { slope, intercept, r } = computeOLS(data)
    setPearsonR(r)

    if (data.length >= 2) {
      const xDomain = xScale.domain()
      const x0 = xDomain[0]
      const x1 = xDomain[1]
      const y0 = slope * x0 + intercept
      const y1 = slope * x1 + intercept

      g.append('line')
        .attr('x1', xScale(x0))
        .attr('y1', yScale(y0))
        .attr('x2', xScale(x1))
        .attr('y2', yScale(y1))
        .attr('stroke', '#7c3aed')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '5,4')
        .attr('opacity', 0.4)
    }

    // Data points
    g.selectAll('circle.point')
      .data(data)
      .join('circle')
      .attr('class', 'point')
      .attr('cx', (d) => xScale(d.x))
      .attr('cy', (d) => yScale(d.y))
      .attr('r', 0)
      .attr('fill', (d) => d.color)
      .attr('opacity', 0.75)
      .attr('stroke', isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)')
      .attr('stroke-width', 0.75)
      .style('cursor', onSelect ? 'pointer' : 'default')
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('opacity', 1).attr('stroke-width', 1.5)
        onHover?.(d.name)

        const containerRect = containerRef.current?.getBoundingClientRect()
        const svgRect = svgRef.current?.getBoundingClientRect()
        if (containerRect && svgRect) {
          const px = margin.left + xScale(d.x)
          const py = margin.top + yScale(d.y)
          const svgOffsetX = svgRect.left - containerRect.left
          const svgOffsetY = svgRect.top - containerRect.top
          setTooltip({
            visible: true,
            x: svgOffsetX + px,
            y: svgOffsetY + py,
            name: d.name,
            xVal: d.x,
            yVal: d.y,
          })
        }
      })
      .on('mouseleave', function () {
        d3.select(this).attr('opacity', 0.75).attr('stroke-width', 0.75)
        onHover?.(null)
        setTooltip((prev) => ({ ...prev, visible: false }))
      })
      .on('click', (_, d) => onSelect?.(d.name))
      .transition()
      .duration(500)
      .delay((_, i) => i * 8)
      .ease(d3.easeCubicOut)
      .attr('r', (d) => rScale(d.population))

  }, [data, width, height, isDark, xLabel, yLabel, onHover, onSelect])

  const rStrength =
    Math.abs(pearsonR) >= 0.7 ? 'strong' :
    Math.abs(pearsonR) >= 0.4 ? 'moderate' :
    Math.abs(pearsonR) >= 0.2 ? 'weak' : 'very weak'
  const rDirection = pearsonR >= 0 ? 'positive' : 'negative'
  const rColor =
    Math.abs(pearsonR) >= 0.7 ? '#7a9954' :
    Math.abs(pearsonR) >= 0.4 ? '#d4a435' : '#94a3b8'

  return (
    <div ref={containerRef} className="relative select-none overflow-visible">
      <svg ref={svgRef} className="w-full overflow-visible" />

      {/* Tooltip — flips below bubble when near top edge, always above parent overflow */}
      {tooltip.visible && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: Math.min(tooltip.x + 10, width - 140),
            top: tooltip.y < 60 ? tooltip.y + 15 : tooltip.y - 10,
            transform: tooltip.y < 60 ? 'none' : 'translateY(-100%)',
            zIndex: 50,
          }}
        >
          <div className={`
            text-xs rounded-lg px-2.5 py-1.5 shadow-xl border backdrop-blur-sm
            bg-slate-900/95 border-slate-700 text-slate-200
          `}>
            <div className="font-medium font-display mb-0.5">{tooltip.name}</div>
            <div className="font-mono text-micro space-y-0.5">
              <div>
                <span className="text-slate-400">{xLabel}: </span>
                <span>{formatTooltipValue(tooltip.xVal, xLabel)}</span>
              </div>
              <div>
                <span className="text-slate-400">{yLabel}: </span>
                <span>{formatTooltipValue(tooltip.yVal, yLabel)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pearson r display */}
      {data.length >= 2 && (
        <div className={`
          mt-1 px-2 flex items-center gap-2 text-micro font-mono
          ${isDark ? 'text-slate-400' : 'text-slate-500'}
        `}>
          <span
            className="font-semibold"
            style={{ color: rColor }}
          >
            r = {pearsonR.toFixed(3)}
          </span>
          <span>—</span>
          <span>{rStrength} {rDirection} correlation</span>
          <span className="ml-auto flex items-center gap-1">
            <span
              className="inline-block w-5 border-t border-dashed"
              style={{ borderColor: '#7c3aed', opacity: 0.6 }}
            />
            <span style={{ color: isDark ? '#8b6282' : '#7c3aed' }}>OLS trend</span>
          </span>
        </div>
      )}
    </div>
  )
}
