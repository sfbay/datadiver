// src/views/Demographics/Demographics.tsx
// Demographics Explorer — choropleth map + Dorling cartogram + correlation scatter + demographic cards.

import { useState, useMemo, useCallback, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { useCensusData } from '@/hooks/useCensusData'
import { NON_RESIDENTIAL_NEIGHBORHOODS } from '@/utils/geo'
import { useCivicMetric } from '@/hooks/useCivicMetrics'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useDemographicsData } from './useDemographicsData'
import MapView from '@/components/maps/MapView'
import CorrelationScatter from '@/components/charts/CorrelationScatter'
import DorlingCartogram from '@/components/charts/DorlingCartogram'
import DemographicCard from '@/components/charts/DemographicCard'
import DataSourceLine from '@/components/ui/DataSourceLine'
import ExportButton from '@/components/export/ExportButton'
import { SkeletonStatCards, SkeletonChart } from '@/components/ui/Skeleton'
import {
  getVariableConfig,
  CENSUS_VARIABLES,
  CIVIC_METRICS,
} from '@/utils/censusVariables'
import type { CensusVariable } from '@/types/census'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type MapMode = 'choropleth' | 'cartogram'

const DEFAULT_ACTIVE_VARIABLE: CensusVariable = 'medianIncome'
const DEFAULT_SCATTER_Y = 'crimeCount'

const DEFAULT_EXPANDED: CensusVariable[] = [
  'totalPopulation',
  'medianIncome',
  'povertyRate',
  'rentBurden',
]

/** All Census variables usable as scatter Y-axis options */
const SCATTER_CENSUS_OPTIONS = CENSUS_VARIABLES.filter(
  v => v.format === 'percent' || v.format === 'currency' || v.key === 'totalPopulation' || v.key === 'populationDensity'
)

/** Civic metrics that can be fetched from Socrata (not client-side) */
const SCATTER_CIVIC_OPTIONS = CIVIC_METRICS.filter(m => !m.isClientSide)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(value: number | null | undefined, format: 'currency' | 'percent' | 'number' | 'density'): string {
  if (value === null || value === undefined || !isFinite(value)) return '\u2014'
  switch (format) {
    case 'currency':
      if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
      if (value >= 1_000) return `$${Math.round(value / 1_000)}K`
      return `$${value.toFixed(0)}`
    case 'percent':
      return `${Math.round(value)}%`
    case 'density':
      return `${Math.round(value).toLocaleString()}/mi\u00B2`
    case 'number':
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
      if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
      return Math.round(value).toLocaleString()
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Demographics() {
  // --- State ---
  const [activeVariable, setActiveVariable] = useState<CensusVariable>(DEFAULT_ACTIVE_VARIABLE)
  const [scatterYMetric, setScatterYMetric] = useState<string | null>(DEFAULT_SCATTER_Y)
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null)
  const [mapMode, setMapMode] = useState<MapMode>('choropleth')
  const [expandedCards, setExpandedCards] = useState<Set<CensusVariable>>(new Set(DEFAULT_EXPANDED))
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const mapHandleRef = useRef(null)

  // --- Data (filter out non-residential areas like parks) ---
  const { neighborhoods: allNeighborhoods } = useCensusData()
  const neighborhoods = useMemo(
    () => allNeighborhoods.filter(n => !NON_RESIDENTIAL_NEIGHBORHOODS.has(n.name as any)),
    [allNeighborhoods],
  )
  const { boundaries } = useNeighborhoodBoundaries()

  // Determine if scatter Y is a Census variable or civic metric
  const isCensusY = useMemo(() => {
    return scatterYMetric ? CENSUS_VARIABLES.some(v => v.key === scatterYMetric) : false
  }, [scatterYMetric])

  const civicMetricKey = isCensusY ? null : scatterYMetric
  const { data: civicYData, isLoading: civicLoading } = useCivicMetric(civicMetricKey)

  // When scatter Y is a Census variable, build the Map from neighborhoods directly
  const scatterYData = useMemo(() => {
    if (!isCensusY || !scatterYMetric) return civicYData
    const map = new Map<string, number>()
    for (const n of neighborhoods) {
      const val = n[scatterYMetric as CensusVariable]
      if (val !== undefined && val !== null && isFinite(val as number)) {
        map.set(n.name, val as number)
      }
    }
    return map
  }, [isCensusY, scatterYMetric, neighborhoods, civicYData])

  const {
    cityAverages,
    scatterData,
    pearsonR,
    rankedNeighborhoods,
    cartogramData,
    choroplethGeoJSON,
  } = useDemographicsData(
    neighborhoods,
    activeVariable,
    selectedNeighborhood,
    scatterYData,
    boundaries,
  )

  const activeConfig = useMemo(() => getVariableConfig(activeVariable), [activeVariable])

  // --- Scatter axis labels ---
  const xLabel = activeConfig?.shortLabel ?? 'Demographic Variable'
  const yLabel = useMemo(() => {
    if (!scatterYMetric) return 'Civic Metric'
    if (isCensusY) {
      const cfg = getVariableConfig(scatterYMetric as CensusVariable)
      return cfg?.shortLabel ?? scatterYMetric
    }
    const civic = CIVIC_METRICS.find(m => m.key === scatterYMetric)
    return civic?.label ?? scatterYMetric
  }, [scatterYMetric, isCensusY])

  // --- Choropleth map layers ---
  const choroplethLayers = useMemo((): mapboxgl.AnyLayer[] => {
    const ramp = activeConfig?.colorRamp ?? ['#1e293b', '#7c3aed']
    // Build a Mapbox interpolation expression for fill-color
    const vals = rankedNeighborhoods.map(n => n[activeVariable] as number)
    const minVal = vals.length > 0 ? Math.min(...vals) : 0
    const maxVal = vals.length > 0 ? Math.max(...vals) : 1

    // Build stops from ramp
    const stops: (number | string)[] = []
    for (let i = 0; i < ramp.length; i++) {
      const t = ramp.length === 1 ? minVal : minVal + (i / (ramp.length - 1)) * (maxVal - minVal)
      stops.push(t, ramp[i])
    }

    return [
      {
        id: 'demographics-choropleth-fill',
        type: 'fill',
        source: 'demographics-choropleth',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', activeVariable], 0],
            ...stops,
          ],
          'fill-opacity': 0.7,
        },
      } as mapboxgl.AnyLayer,
      {
        id: 'demographics-choropleth-line',
        type: 'line',
        source: 'demographics-choropleth',
        paint: {
          'line-color': '#ffffff',
          'line-width': 1,
          'line-opacity': 0.3,
        },
      } as mapboxgl.AnyLayer,
    ]
  }, [activeConfig, activeVariable, rankedNeighborhoods])

  // Bind choropleth layer only when in choropleth mode
  const choroplethGeo = mapMode === 'choropleth' ? choroplethGeoJSON : null
  useMapLayer(mapInstance, 'demographics-choropleth', choroplethGeo, choroplethLayers)

  // Choropleth tooltip
  useMapTooltip(mapInstance, 'demographics-choropleth-fill', (props) => {
    const nhood = props.nhood || 'Unknown'
    const value = props[activeVariable]
    const config = activeConfig
    const formatted = config ? formatValue(Number(value), config.format) : String(value)
    const pop = props.population ? Number(props.population).toLocaleString() : '?'
    return `
      <div class="tooltip-value">${nhood}</div>
      <div class="tooltip-label" style="margin-top:6px">${config?.shortLabel ?? activeVariable}</div>
      <div style="color:#e2e8f0;font-family:'JetBrains Mono',monospace">${formatted}</div>
      <div class="tooltip-label" style="margin-top:6px">Population</div>
      <div style="color:#94a3b8;font-family:'JetBrains Mono',monospace">${pop}</div>
    `
  })

  // --- Cartogram color scale ---
  const cartogramColorScale = useCallback(
    (value: number) => {
      const ramp = activeConfig?.colorRamp ?? ['#7c3aed']
      const vals = rankedNeighborhoods.map(n => n[activeVariable] as number)
      const minVal = vals.length > 0 ? Math.min(...vals) : 0
      const maxVal = vals.length > 0 ? Math.max(...vals) : 1
      if (maxVal === minVal) return ramp[Math.floor(ramp.length / 2)]
      const t = Math.max(0, Math.min(1, (value - minVal) / (maxVal - minVal)))
      const idx = t * (ramp.length - 1)
      return ramp[Math.min(Math.round(idx), ramp.length - 1)]
    },
    [activeConfig, rankedNeighborhoods, activeVariable],
  )

  // --- Handlers ---
  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    setMapInstance(map)
  }, [])

  const handleActivateVariable = useCallback((variable: CensusVariable) => {
    setActiveVariable(variable)
    setExpandedCards(prev => {
      const next = new Set(prev)
      next.add(variable)
      return next
    })
  }, [])

  const handleToggleExpand = useCallback((variable: CensusVariable) => {
    setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(variable)) {
        next.delete(variable)
      } else {
        next.add(variable)
      }
      return next
    })
  }, [])

  const handleScatterSelect = useCallback((name: string) => {
    setSelectedNeighborhood(prev => (prev === name ? null : name))
  }, [])

  const handleNeighborhoodHover = useCallback((_name: string | null) => {
    // Could highlight on map — for now a no-op placeholder
  }, [])

  // --- Determine which cards are expanded vs collapsed ---
  const allCardVariables: CensusVariable[] = useMemo(() => {
    // All variables with verified ACS 5-Year source data (Census API)
    return [
      'totalPopulation',
      'medianIncome',
      'povertyRate',
      'rentBurden',
      'medianRent',
      'pctBachelorsPlus',
      'medianAge',
      'unemploymentRate',
      'pctAsian',
      'pctHispanic',
      'pctWhite',
      'pctBlack',
      'pctMultiracial',
      'pctUnder18',
      'pctOver65',
    ]
  }, [])

  const expandedVars = useMemo(
    () => allCardVariables.filter(v => expandedCards.has(v)),
    [allCardVariables, expandedCards],
  )
  const collapsedVars = useMemo(
    () => allCardVariables.filter(v => !expandedCards.has(v)),
    [allCardVariables, expandedCards],
  )

  // --- Color legend stops ---
  const legendStops = useMemo(() => {
    if (!activeConfig) return []
    const ramp = activeConfig.colorRamp
    const vals = rankedNeighborhoods.map(n => n[activeVariable] as number)
    const minVal = vals.length > 0 ? Math.min(...vals) : 0
    const maxVal = vals.length > 0 ? Math.max(...vals) : 1
    return ramp.map((color, i) => ({
      color,
      value: ramp.length === 1 ? minVal : minVal + (i / (ramp.length - 1)) * (maxVal - minVal),
    }))
  }, [activeConfig, rankedNeighborhoods, activeVariable])

  // --- Loading state ---
  const isEmpty = neighborhoods.length === 0

  return (
    <div className="h-full flex flex-col">
      {/* ── Header / Toolbar ──────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                Demographics Explorer
              </h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                U.S. Census Bureau &middot; ACS 5-Year Estimates
              </p>
            </div>
            {!isEmpty && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-purple-400/80 bg-purple-500/10 px-2 py-1 rounded-full">
                {neighborhoods.length} neighborhoods
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ExportButton targetSelector="#demographics-capture" filename="demographics-explorer" />
          </div>
        </div>

        {/* Source attribution */}
        <div className="mt-1">
          <DataSourceLine
            dataset="American Community Survey 5-Year Estimates"
            source="U.S. Census Bureau"
            vintage="2019-2023"
            caveats={['Neighborhood values aggregated from census tracts — tract boundaries do not align precisely with neighborhood borders']}
          />
        </div>
      </header>

      {/* ── Content ───────────────────────────────────────────────── */}
      <div id="demographics-capture" className="flex-1 overflow-hidden flex flex-col">
        {/* Top row: Map/Cartogram + Scatter */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left panel: Map or Cartogram */}
          <div className="flex-1 relative">
            {isEmpty ? (
              <div className="h-full flex items-center justify-center">
                <SkeletonStatCards count={4} />
              </div>
            ) : mapMode === 'choropleth' ? (
              <MapView ref={mapHandleRef} onMapReady={handleMapReady}>
                {/* Map/Cartogram toggle */}
                <div className="absolute top-4 right-4 z-10">
                  <div className="flex items-center gap-1 bg-slate-900/80 backdrop-blur-sm rounded-lg p-0.5 border border-white/[0.06]">
                    {(['choropleth', 'cartogram'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setMapMode(mode)}
                        className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 ${
                          mapMode === mode
                            ? 'bg-white/[0.1] text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {mode === 'choropleth' ? 'Map' : 'Cartogram'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color legend */}
                {legendStops.length > 0 && activeConfig && (
                  <div className="absolute bottom-6 left-5 z-10 glass-card rounded-xl p-3">
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                      {activeConfig.shortLabel}
                    </p>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-mono text-slate-400">
                        {formatValue(legendStops[0].value, activeConfig.format)}
                      </span>
                      <div className="flex h-2.5 rounded-full overflow-hidden" style={{ width: 100 }}>
                        {legendStops.map((stop, i) => (
                          <div key={i} className="flex-1" style={{ backgroundColor: stop.color }} />
                        ))}
                      </div>
                      <span className="text-[9px] font-mono text-slate-400">
                        {formatValue(legendStops[legendStops.length - 1].value, activeConfig.format)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Selected neighborhood info */}
                {selectedNeighborhood && (
                  <div className="absolute top-4 left-5 z-10 glass-card rounded-xl px-4 py-3 max-w-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[12px] font-medium text-white">{selectedNeighborhood}</p>
                        <p className="text-[10px] font-mono text-slate-400">
                          {(() => {
                            const n = neighborhoods.find(n => n.name === selectedNeighborhood)
                            if (!n || !activeConfig) return ''
                            const val = n[activeVariable]
                            return val !== undefined ? formatValue(val as number, activeConfig.format) : '\u2014'
                          })()}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedNeighborhood(null)}
                        className="text-slate-500 hover:text-slate-300 text-xs"
                      >
                        {'\u2715'}
                      </button>
                    </div>
                  </div>
                )}
              </MapView>
            ) : (
              /* Cartogram mode */
              <div className="h-full bg-slate-950 relative flex items-center justify-center">
                {/* Toggle back to map */}
                <div className="absolute top-4 right-4 z-10">
                  <div className="flex items-center gap-1 bg-slate-900/80 backdrop-blur-sm rounded-lg p-0.5 border border-white/[0.06]">
                    {(['choropleth', 'cartogram'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setMapMode(mode)}
                        className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 ${
                          mapMode === mode
                            ? 'bg-white/[0.1] text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {mode === 'choropleth' ? 'Map' : 'Cartogram'}
                      </button>
                    ))}
                  </div>
                </div>

                {cartogramData.length > 0 ? (
                  <DorlingCartogram
                    data={cartogramData}
                    colorScale={cartogramColorScale}
                    width={520}
                    height={400}
                    onHover={handleNeighborhoodHover}
                    onSelect={handleScatterSelect}
                  />
                ) : (
                  <p className="text-slate-500 text-sm">No cartogram data</p>
                )}

                {/* Legend (same as choropleth) */}
                {legendStops.length > 0 && activeConfig && (
                  <div className="absolute bottom-6 left-5 z-10 glass-card rounded-xl p-3">
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                      {activeConfig.shortLabel}
                    </p>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-mono text-slate-400">
                        {formatValue(legendStops[0].value, activeConfig.format)}
                      </span>
                      <div className="flex h-2.5 rounded-full overflow-hidden" style={{ width: 100 }}>
                        {legendStops.map((stop, i) => (
                          <div key={i} className="flex-1" style={{ backgroundColor: stop.color }} />
                        ))}
                      </div>
                      <span className="text-[9px] font-mono text-slate-400">
                        {formatValue(legendStops[legendStops.length - 1].value, activeConfig.format)}
                      </span>
                    </div>
                    <p className="text-[8px] font-mono text-slate-500/60 mt-1.5">
                      Source: U.S. Census Bureau via DataDiver
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right panel: Scatter plot */}
          <div className="w-[420px] flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl flex flex-col overflow-hidden">
            {/* Y-axis selector */}
            <div className="flex-shrink-0 px-4 pt-3 pb-2 border-b border-slate-200/50 dark:border-white/[0.04]">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 whitespace-nowrap">
                  Scatter Y
                </span>
                <select
                  value={scatterYMetric ?? ''}
                  onChange={e => setScatterYMetric(e.target.value || null)}
                  className="flex-1 text-[11px] bg-slate-900 border border-white/[0.06] rounded-md px-2 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                  style={{ colorScheme: 'dark' }}
                >
                  <optgroup label="Civic Metrics">
                    {SCATTER_CIVIC_OPTIONS.map(m => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Census Variables">
                    {SCATTER_CENSUS_OPTIONS.map(v => (
                      <option key={v.key} value={v.key}>
                        {v.shortLabel}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            {/* Scatter chart */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {isEmpty ? (
                <SkeletonChart width={380} height={260} />
              ) : civicLoading && !isCensusY ? (
                <div className="flex items-center justify-center h-64">
                  <p className="text-[11px] font-mono text-slate-500 animate-pulse">
                    Loading civic metrics...
                  </p>
                </div>
              ) : scatterData.length >= 2 ? (
                <CorrelationScatter
                  data={scatterData}
                  xLabel={xLabel}
                  yLabel={yLabel}
                  width={385}
                  height={280}
                  onHover={handleNeighborhoodHover}
                  onSelect={handleScatterSelect}
                />
              ) : (
                <div className="flex items-center justify-center h-64">
                  <p className="text-[11px] text-slate-500">
                    {scatterYData.size === 0
                      ? 'Select a Y-axis metric to see correlations'
                      : 'Not enough data points for scatter plot'}
                  </p>
                </div>
              )}

              {/* Neighborhood ranking below scatter */}
              {rankedNeighborhoods.length > 0 && activeConfig && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                      Ranked by {activeConfig.shortLabel}
                    </p>
                    <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                  </div>
                  <div className="space-y-0.5">
                    {rankedNeighborhoods.slice(0, 15).map((n, idx) => {
                      const value = n[activeVariable] as number
                      const maxVal = rankedNeighborhoods[0]?.[activeVariable] as number ?? 1
                      const barWidth = maxVal > 0 ? (value / maxVal) * 100 : 0
                      const isSelected = selectedNeighborhood === n.name
                      return (
                        <div
                          key={n.name}
                          onClick={() => setSelectedNeighborhood(isSelected ? null : n.name)}
                          className={`relative py-1.5 px-3 rounded-lg cursor-pointer transition-all duration-200 ${
                            isSelected
                              ? 'bg-purple-500/10 ring-1 ring-purple-500/30'
                              : 'hover:bg-white/[0.04]'
                          }`}
                        >
                          <div
                            className="absolute inset-y-0 left-0 rounded-lg opacity-[0.06] bar-grow"
                            style={{ width: `${barWidth}%`, backgroundColor: '#7c3aed' }}
                          />
                          <div className="relative flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-mono text-slate-500 w-4 shrink-0">
                                {idx + 1}
                              </span>
                              <span className="text-[12px] font-medium text-slate-200 truncate">
                                {n.name}
                              </span>
                            </div>
                            <span className="text-[11px] font-mono text-slate-400 shrink-0 ml-2">
                              {formatValue(value, activeConfig.format)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom: Demographic Cards ────────────────────────────── */}
        <div className="flex-shrink-0 border-t border-slate-200/50 dark:border-white/[0.04] bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl px-6 py-4">
          {isEmpty ? (
            <SkeletonStatCards count={4} />
          ) : (
            <>
              {/* Expanded cards (grid) */}
              {expandedVars.length > 0 && (
                <div className="grid grid-cols-4 gap-3 mb-2">
                  {expandedVars.map(v => (
                    <DemographicCard
                      key={v}
                      variable={v}
                      neighborhoods={neighborhoods}
                      isActive={activeVariable === v}
                      isExpanded={true}
                      onActivate={handleActivateVariable}
                      onToggleExpand={handleToggleExpand}
                    />
                  ))}
                </div>
              )}

              {/* Collapsed cards (small buttons) */}
              {collapsedVars.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {collapsedVars.map(v => (
                    <DemographicCard
                      key={v}
                      variable={v}
                      neighborhoods={neighborhoods}
                      isActive={activeVariable === v}
                      isExpanded={false}
                      onActivate={handleActivateVariable}
                      onToggleExpand={handleToggleExpand}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
