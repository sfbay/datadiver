/** UnderlayLegend — floating glass-card legend for the active demographic
 *  underlay. Renders nothing when no underlay is active.
 *
 *  Editorial intent: a colored choropleth without a key is a Rorschach test,
 *  not a visualization. The user needs to know what dark vs light *means* —
 *  this component closes that gap with a compact panel showing the variable's
 *  label, the color ramp, and the min/max value at the actual rendered
 *  extremes. Mirrors the percentile-based color stops used in
 *  DemographicUnderlay (0/33/66/100) so the legend gradient lines up with
 *  what the map is actually painting.
 */

import { CENSUS_VARIABLES } from '@/utils/censusVariables'
import type { CensusVariable, NeighborhoodCensusData } from '@/types/census'

interface UnderlayLegendProps {
  /** Active underlay variable; null/undefined hides the legend. */
  variable: CensusVariable | null
  /** Census data for the population being colored — neighborhoods, tracts, etc. */
  data: NeighborhoodCensusData[]
}

function formatValue(v: number, format: 'currency' | 'percent' | 'number' | 'density'): string {
  if (!Number.isFinite(v)) return '—'
  switch (format) {
    case 'currency':
      // Million-scale values render compactly as "$X.Xm" — the home-value
      // ramp tops out around $2m, which read awkwardly as "$2000k" in the
      // legend. Sub-million still uses the thousands-suffix form.
      if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}m`
      if (v >= 1000) return `$${Math.round(v / 1000)}k`
      return `$${Math.round(v)}`
    case 'percent':
      return `${v.toFixed(1)}%`
    case 'density':
      return `${Math.round(v).toLocaleString()}/sq mi`
    case 'number':
    default:
      return Math.abs(v) >= 10000
        ? `${(v / 1000).toFixed(1)}k`
        : v.toLocaleString(undefined, { maximumFractionDigits: 0 })
  }
}

export default function UnderlayLegend({ variable, data }: UnderlayLegendProps) {
  if (!variable) return null

  const config = CENSUS_VARIABLES.find((v) => v.key === variable)
  if (!config) return null

  // Collect numeric values for this variable across the population.
  const values: number[] = []
  for (const d of data) {
    const v = d[variable]
    if (typeof v === 'number' && Number.isFinite(v)) values.push(v)
  }
  if (values.length === 0) return null

  values.sort((a, b) => a - b)
  const min = values[0]
  const max = values[values.length - 1]

  // Build CSS gradient that matches DemographicUnderlay's 0/33/66/100
  // percentile stops. If the colorRamp has fewer than 4 entries, fall back
  // to a simple two-stop gradient between first and last.
  const ramp = config.colorRamp
  const gradient = ramp.length >= 4
    ? `linear-gradient(to right, ${ramp[0]} 0%, ${ramp[1]} 33%, ${ramp[2]} 66%, ${ramp[3]} 100%)`
    : `linear-gradient(to right, ${ramp[0] ?? '#475569'}, ${ramp[ramp.length - 1] ?? '#8b6282'})`

  return (
    <div className="absolute bottom-4 right-4 z-[3] pointer-events-auto">
      <div className="rounded-lg px-3 py-2 backdrop-blur-xl
        bg-white/85 dark:bg-slate-900/80
        ring-1 ring-slate-200/60 dark:ring-white/[0.08]
        shadow-md shadow-slate-900/10 dark:shadow-black/40">
        <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 mb-1.5 whitespace-nowrap">
          {config.label}
        </p>
        <div
          className="h-2 w-32 rounded-full mb-1 ring-1 ring-slate-300/40 dark:ring-white/[0.06]"
          style={{ background: gradient }}
        />
        <div className="flex justify-between text-[9px] font-mono text-slate-600 dark:text-slate-300 tabular-nums">
          <span>{formatValue(min, config.format)}</span>
          <span>{formatValue(max, config.format)}</span>
        </div>
      </div>
    </div>
  )
}
