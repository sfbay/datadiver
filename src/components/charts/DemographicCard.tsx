// src/components/charts/DemographicCard.tsx
// Expandable card showing a Census variable's citywide value and neighborhood distribution.
// Clicking the expanded card promotes the variable to the active map choropleth.

import SparkBars from './SparkBars'
import { getVariableConfig } from '../../utils/censusVariables'
import type { CensusVariable, NeighborhoodCensusData } from '../../types/census'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DemographicCardProps {
  variable: CensusVariable
  neighborhoods: NeighborhoodCensusData[]
  isActive: boolean
  isExpanded: boolean
  onActivate: (variable: CensusVariable) => void
  onToggleExpand: (variable: CensusVariable) => void
}

// ---------------------------------------------------------------------------
// Value formatting
// ---------------------------------------------------------------------------

function formatValue(value: number, format: 'currency' | 'percent' | 'number' | 'density'): string {
  if (!isFinite(value)) return '—'

  switch (format) {
    case 'currency': {
      if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
      if (value >= 1_000) {
        // Use compact notation for values >= 100K; otherwise show with comma
        if (value >= 100_000) return `$${Math.round(value / 1_000)}K`
        return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      }
      return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    }
    case 'percent':
      return `${Math.round(value)}%`
    case 'density':
      return `${Math.round(value).toLocaleString('en-US')}/mi²`
    case 'number': {
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
      if (value >= 100_000) return `${Math.round(value / 1_000)}K`
      if (value >= 1_000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
      return Math.round(value).toString()
    }
  }
}

// ---------------------------------------------------------------------------
// Citywide aggregate computation
// ---------------------------------------------------------------------------

/**
 * Compute a citywide aggregate for a variable across neighborhoods.
 *
 * - 'totalPopulation': simple sum across all neighborhoods
 * - All other variables: population-weighted average
 *
 * Returns null if no valid data points exist.
 */
function computeCitywideValue(
  variable: CensusVariable,
  neighborhoods: NeighborhoodCensusData[],
): number | null {
  const valid = neighborhoods.filter(n => {
    const v = n[variable]
    return v !== undefined && v !== null && isFinite(v as number)
  })
  if (valid.length === 0) return null

  if (variable === 'totalPopulation') {
    return valid.reduce((sum, n) => sum + (n[variable] as number), 0)
  }

  // Population-weighted average
  let weightedSum = 0
  let totalWeight = 0
  for (const n of valid) {
    const val = n[variable] as number
    const weight = n.population > 0 ? n.population : 1
    weightedSum += val * weight
    totalWeight += weight
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DemographicCard({
  variable,
  neighborhoods,
  isActive,
  isExpanded,
  onActivate,
  onToggleExpand,
}: DemographicCardProps) {
  const config = getVariableConfig(variable)
  if (!config) return null

  // ── Collapsed state ──────────────────────────────────────────────────────
  if (!isExpanded) {
    return (
      <button
        onClick={() => onToggleExpand(variable)}
        className="w-full text-left px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 transition-colors text-xs text-slate-600 hover:text-ink dark:text-slate-300 dark:hover:text-white flex items-center gap-1.5"
      >
        <span className="font-medium">{config.shortLabel}</span>
        <span className="text-slate-500 ml-auto">▸</span>
      </button>
    )
  }

  // ── Expanded: compute data ───────────────────────────────────────────────
  const citywideValue = computeCitywideValue(variable, neighborhoods)

  // Build sorted neighborhood values for SparkBars (high to low)
  const neighborhoodValues = neighborhoods
    .map(n => ({
      name: n.name,
      value: n[variable] as number | undefined,
    }))
    .filter(
      (n): n is { name: string; value: number } =>
        n.value !== undefined && n.value !== null && isFinite(n.value),
    )
    .sort((a, b) => b.value - a.value)

  const sparkValues = neighborhoodValues.map(n => n.value)
  const highNeighborhood = neighborhoodValues[0]
  const lowNeighborhood = neighborhoodValues[neighborhoodValues.length - 1]

  // ── Expanded state ───────────────────────────────────────────────────────
  return (
    <div
      className={[
        'rounded-lg bg-white/5 border transition-colors cursor-pointer',
        isActive ? 'border-plum-500/40' : 'border-white/5 hover:border-white/10',
      ].join(' ')}
      onClick={() => onActivate(variable)}
    >
      {/* Collapse toggle — chevron at top-right */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-200 truncate">{config.shortLabel}</span>
          {isActive && (
            <span className="flex items-center gap-1 text-micro text-plum-500 font-mono shrink-0">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-plum-400" />
              active
            </span>
          )}
        </div>
        <button
          onClick={e => {
            e.stopPropagation()
            onToggleExpand(variable)
          }}
          className="shrink-0 ml-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors text-xs"
          aria-label="Collapse"
        >
          ▾
        </button>
      </div>

      {/* Citywide value */}
      <div className="px-3 pb-1">
        {citywideValue !== null ? (
          <span className="font-mono text-lg font-semibold text-ink dark:text-white leading-none">
            {formatValue(citywideValue, config.format)}
          </span>
        ) : (
          <span className="font-mono text-lg text-slate-500">—</span>
        )}
        <span className="ml-2 text-micro text-slate-500 font-mono">SF · ACS 2019–2023</span>
      </div>

      {/* SparkBars — neighborhood distribution */}
      {sparkValues.length > 0 && (
        <div className="px-3 pb-2.5">
          <SparkBars
            values={sparkValues}
            height={20}
            gap={1}
            barColor="#7c3aed"
            accentColor="#8b6282"
            highlightLast={false}
            className="w-full"
          />
          {/* High / low labels */}
          {highNeighborhood && lowNeighborhood && (
            <div className="flex justify-between mt-1">
              <span className="text-nano text-slate-500 truncate max-w-[45%]" title={highNeighborhood.name}>
                ▲ {highNeighborhood.name.replace(' ', '\u00A0')}
              </span>
              <span className="text-nano text-slate-500 truncate max-w-[45%] text-right" title={lowNeighborhood.name}>
                {lowNeighborhood.name.replace(' ', '\u00A0')} ▼
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
