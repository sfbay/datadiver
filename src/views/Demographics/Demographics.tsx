// src/views/Demographics/Demographics.tsx
// Demographics Explorer — choropleth map + Dorling cartogram + correlation scatter + demographic cards.

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import { useCensusData } from '@/hooks/useCensusData'
import { useActiveCity } from '@/cities/useActiveCity'
import { censusMatchesAreas } from '@/cities/registry'
import { censusUnitLabel, censusUnitNoun } from '@/cities/areaLabel'
import { useCivicMetric } from '@/hooks/useCivicMetrics'
import { useCensusCoarseBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { useMapCameraPresets } from '@/hooks/useMapCameraPresets'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useAppStore } from '@/stores/appStore'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useDemographicsData } from './useDemographicsData'
import { SCATTER_CENSUS_OPTIONS, isPlottable } from './scatterOptions'
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

/** Y-axis default where the civic metrics are withheld — a Census variable,
 *  so the scatter still plots something real instead of an empty frame. */
const DEFAULT_SCATTER_Y_NO_CIVIC: CensusVariable = 'rentBurden'

/** URL param carrying the selected unit's CANONICAL id (SF: the neighborhood
 *  name; Oakland: the region code). Same vocabulary as SF's ⌘K place rows. */
const SELECTION_PARAM = 'nh'

const DEFAULT_EXPANDED: CensusVariable[] = [
  'totalPopulation',
  'medianIncome',
  'povertyRate',
  'rentBurden',
]

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
      if (value >= 100_000) return `$${Math.round(value / 1_000)}K`
      return `$${Math.round(value).toLocaleString()}`
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
  const city = useActiveCity()

  // Can the civic-metric Y axis join to the units this view paints? True only
  // where the census spine IS the areas spine — useCivicMetric reads SF's
  // dataset registry and groups by SF-only neighborhood fields, so on a
  // two-geography city it would throw on four of eight metrics and return
  // unjoinable SF keys for the rest. The affordance is WITHHELD, and said.
  const civicMetricsJoin = censusMatchesAreas(city)
  const unitNoun = censusUnitNoun(city)

  // Counts for the header's method line — derived, never typed twice: the
  // region total and the neighborhood memberships it dissolves both come
  // from the city's own census block, so a regeneration can't leave the
  // disclosure claiming a number the data no longer has. Absent on
  // one-geography cities (SF), where there is no dissolve to disclose.
  const regionDissolve = useMemo(() => {
    const regions = city.census?.regions
    if (!regions) return null
    return {
      regions: Object.keys(regions.names).length,
      members: Object.values(regions.members).reduce((n, list) => n + list.length, 0),
    }
  }, [city])

  // --- State ---
  const [activeVariable, setActiveVariable] = useState<CensusVariable>(DEFAULT_ACTIVE_VARIABLE)
  const [scatterYMetric, setScatterYMetric] = useState<string | null>(
    civicMetricsJoin ? DEFAULT_SCATTER_Y : DEFAULT_SCATTER_Y_NO_CIVIC,
  )
  const [mapMode, setMapMode] = useState<MapMode>('choropleth')
  const [expandedCards, setExpandedCards] = useState<Set<CensusVariable>>(new Set(DEFAULT_EXPANDED))
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const mapHandleRef = useRef(null)

  // --- Selection lives in the URL so a view can be shared / deep-linked ---
  // Carries the CANONICAL id, never the display label. useUrlSync only ever
  // writes the date params here and copies the rest forward, so ?nh= survives.
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedNeighborhood = searchParams.get(SELECTION_PARAM) || null
  // react-router rebuilds setSearchParams on EVERY location change, so a
  // useCallback that closes over it churns identity — and the cartogram's d3
  // effect lists onSelect in its deps, so that churn would clear the SVG and
  // replay the entrance stagger on every click. The ref keeps the handler
  // stable while still calling the current setter.
  const setSearchParamsRef = useRef(setSearchParams)
  useEffect(() => {
    setSearchParamsRef.current = setSearchParams
  }, [setSearchParams])

  const setSelectedNeighborhood = useCallback(
    (next: string | null | ((prev: string | null) => string | null)) => {
      setSearchParamsRef.current(
        prev => {
          const params = new URLSearchParams(prev)
          const current = params.get(SELECTION_PARAM) || null
          const value = typeof next === 'function' ? next(current) : next
          if (value) params.set(SELECTION_PARAM, value)
          else params.delete(SELECTION_PARAM)
          return params
        },
        { replace: true },
      )
    },
    [],
  )

  // --- Data (filter out non-residential units like parks) ---
  const { neighborhoods: allNeighborhoods } = useCensusData()
  const excluded = city.areas.excluded
  const neighborhoods = useMemo(
    () => allNeighborhoods.filter(n => !excluded.has(n.name)),
    [allNeighborhoods, excluded],
  )
  // The COARSE CENSUS tier's polygons — Oakland's 10 regions, not its 59
  // beats. Joining region-keyed rows onto beat polygons paints nothing.
  const { boundaries } = useCensusCoarseBoundaries()

  // ?nh= is user-editable, so the id in it is UNTRUSTED: resolve it against the
  // loaded rows and let a stale or malformed link be a silent no-op. Before the
  // param existed this state was unreachable (selection could only come from a
  // real row); the URL made it reachable, and an unresolvable id would
  // otherwise render a card headed with the junk string over an empty value and
  // hand the camera a selection matching no polygon. The rows are static JSON,
  // so this is decided on the first render — no loading race.
  const selectedUnit = useMemo(
    () =>
      selectedNeighborhood
        ? neighborhoods.find(n => n.name === selectedNeighborhood) ?? null
        : null,
    [neighborhoods, selectedNeighborhood],
  )
  const selectedUnitId = selectedUnit?.name ?? null

  // Determine if scatter Y is a Census variable or civic metric
  const isCensusY = useMemo(() => {
    return scatterYMetric ? CENSUS_VARIABLES.some(v => v.key === scatterYMetric) : false
  }, [scatterYMetric])

  const civicMetricKey = isCensusY || !civicMetricsJoin ? null : scatterYMetric
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
    scatterYData,
    boundaries,
    excluded,
  )

  // Every reader-facing surface carries the authored label; `name` stays the
  // canonical id that selection, the URL and the joins run on. Identical
  // strings on SF, where a neighborhood's name IS its key.
  const labelFor = useCallback((id: string) => censusUnitLabel(city, id), [city])
  const cartogramLabelled = useMemo(
    () => cartogramData.map(d => ({ ...d, label: labelFor(d.name) })),
    [cartogramData, labelFor],
  )
  const scatterLabelled = useMemo(
    () => scatterData.map(d => ({ ...d, label: labelFor(d.name) })),
    [scatterData, labelFor],
  )

  // A Census Y the city's ACS payload simply doesn't publish. Both cities have
  // some (SF more than Oakland — the gap is a data-coverage fact, not a city
  // one), and the generic empty frame reads as a bug. Named below instead.
  const scatterYUnpublished =
    isCensusY && scatterYMetric !== null && !isPlottable(neighborhoods, scatterYMetric)

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

  const isDarkMode = useAppStore((s) => s.isDarkMode)

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
          // Theme-aware opacity. Dark mode reads richly at 0.5 (the dark
          // basemap lets the fill's color dominate); the cream light-mode
          // basemap washes that same 0.5 to pastel, so light gets 0.8 to
          // read with equal weight. Labels stay legible either way — they're
          // rendered above the fill (belowLabels) with a soft halo. Both sit
          // above Last 48's 0.22 underlay register (there dots are the
          // subject; here the fill is).
          'fill-opacity': isDarkMode ? 0.5 : 0.8,
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
  }, [activeConfig, activeVariable, rankedNeighborhoods, isDarkMode])

  // Bind choropleth layer only when in choropleth mode
  const choroplethGeo = mapMode === 'choropleth' ? choroplethGeoJSON : null
  // Insert the choropleth BENEATH the basemap labels so neighborhood/street
  // labels render crisply on top of the full-coverage fill. Added on top (the
  // default), the 0.7-opacity fill muddies every label + halo into a hard border.
  useMapLayer(mapInstance, 'demographics-choropleth', choroplethGeo, choroplethLayers, { belowLabels: true })

  // Camera presets — reactively glides to the matching neighborhood preset
  // (or fits the polygon when no preset). Cross-view consistent.
  // The RESOLVED id — an unresolvable ?nh= must not fly the camera anywhere.
  useMapCameraPresets(mapInstance, {
    selectedNeighborhood: selectedUnitId,
    neighborhoodBoundaries: boundaries,
  })

  // Choropleth tooltip
  useMapTooltip(mapInstance, 'demographics-choropleth-fill', (props) => {
    // props.nhood is the canonical id; readers see the authored label.
    const nhood = props.nhood ? censusUnitLabel(city, String(props.nhood)) : 'Unknown'
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
  }, [setSelectedNeighborhood])

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
              <p className="text-micro font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                U.S. Census Bureau &middot; ACS 5-Year Estimates
              </p>
            </div>
            {!isEmpty && (
              <span className="inline-flex items-center gap-1.5 text-micro font-mono text-plum-500/80 bg-plum-500/10 px-2 py-1 rounded-full">
                {neighborhoods.length} {unitNoun.many}
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
          />
          {/* Two-geography cities only: the coarse census units are OURS, not
              the city's — say so where the reader meets them, not only in
              About. Mirrors CityLanding's beat-name disclosure line. Counts are
              derived; the /about anchor is Oakland's, the only two-geography
              city today — a second one needs a per-city anchor, not a copy. */}
          {regionDissolve && (
            <p className="text-micro text-slate-500 dark:text-slate-500 mt-0.5">
              These {regionDissolve.regions} regions are DataDiver&rsquo;s, not{' '}
              {city.name}&rsquo;s &mdash; we merged the city&rsquo;s {regionDissolve.members}{' '}
              official neighborhoods into them &mdash;{' '}
              <Link
                to="/about#oakland-regions"
                className="underline underline-offset-2 hover:text-ink dark:hover:text-slate-300 transition-colors"
              >
                method in About
              </Link>
            </p>
          )}
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
                        className={`px-3 py-1.5 rounded-md text-label font-medium transition-all duration-200 ${
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
                  <div className="absolute bottom-6 right-5 z-10 glass-card rounded-xl p-3">
                    <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                      {activeConfig.shortLabel}
                    </p>
                    <div className="flex items-center gap-1">
                      <span className="text-nano font-mono text-slate-400">
                        {formatValue(legendStops[0].value, activeConfig.format)}
                      </span>
                      <div className="flex h-2.5 rounded-full overflow-hidden" style={{ width: 100 }}>
                        {legendStops.map((stop, i) => (
                          <div key={i} className="flex-1" style={{ backgroundColor: stop.color }} />
                        ))}
                      </div>
                      <span className="text-nano font-mono text-slate-400">
                        {formatValue(legendStops[legendStops.length - 1].value, activeConfig.format)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Selected unit info \u2014 gated on the RESOLVED row, so a stale
                    or malformed ?nh= renders nothing rather than a card headed
                    with the junk id over a blank value. */}
                {selectedUnit && (
                  <div className="absolute top-4 left-5 z-10 glass-card rounded-xl px-4 py-3 max-w-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[12px] font-medium text-ink dark:text-white">
                          {censusUnitLabel(city, selectedUnit.name)}
                        </p>
                        <p className="text-micro font-mono text-slate-400">
                          {(() => {
                            if (!activeConfig) return ''
                            const val = selectedUnit[activeVariable]
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
                        className={`px-3 py-1.5 rounded-md text-label font-medium transition-all duration-200 ${
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

                {cartogramLabelled.length > 0 ? (
                  <DorlingCartogram
                    data={cartogramLabelled}
                    colorScale={cartogramColorScale}
                    width={520}
                    height={400}
                    onSelect={handleScatterSelect}
                  />
                ) : (
                  <p className="text-slate-500 text-sm">No cartogram data</p>
                )}

                {/* Legend (same as choropleth) */}
                {legendStops.length > 0 && activeConfig && (
                  <div className="absolute bottom-6 right-5 z-10 glass-card rounded-xl p-3">
                    <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                      {activeConfig.shortLabel}
                    </p>
                    <div className="flex items-center gap-1">
                      <span className="text-nano font-mono text-slate-400">
                        {formatValue(legendStops[0].value, activeConfig.format)}
                      </span>
                      <div className="flex h-2.5 rounded-full overflow-hidden" style={{ width: 100 }}>
                        {legendStops.map((stop, i) => (
                          <div key={i} className="flex-1" style={{ backgroundColor: stop.color }} />
                        ))}
                      </div>
                      <span className="text-nano font-mono text-slate-400">
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
          <div className="w-[26.25rem] flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl flex flex-col overflow-hidden">
            {/* Y-axis selector */}
            <div className="flex-shrink-0 px-4 pt-3 pb-2 border-b border-slate-200/50 dark:border-white/[0.04]">
              <div className="flex items-center gap-2">
                <span className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 whitespace-nowrap">
                  Scatter Y
                </span>
                <select
                  value={scatterYMetric ?? ''}
                  onChange={e => setScatterYMetric(e.target.value || null)}
                  className="flex-1 text-label bg-slate-900 border border-white/[0.06] rounded-md px-2 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-plum-500/40"
                  style={{ colorScheme: 'dark' }}
                >
                  {civicMetricsJoin && (
                    <optgroup label="Civic Metrics">
                      {SCATTER_CIVIC_OPTIONS.map(m => (
                        <option key={m.key} value={m.key}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Census Variables">
                    {SCATTER_CENSUS_OPTIONS.map(v => (
                      <option key={v.key} value={v.key}>
                        {v.shortLabel}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
              {/* Withholding is only honest if it says WHY — an option list
                  that quietly lost half its entries reads as a bug. */}
              {!civicMetricsJoin && (
                <p className="mt-1.5 text-micro font-mono text-slate-400/60 dark:text-slate-600 leading-snug">
                  Civic correlations stay San Francisco-only for now: {city.name}&rsquo;s
                  {' '}incident records are filed by {city.areas.nounPlural}, a different
                  {' '}geography from the census {unitNoun.many} mapped here.
                </p>
              )}
            </div>

            {/* Scatter chart */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {isEmpty ? (
                <SkeletonChart width={380} height={260} />
              ) : civicLoading && !isCensusY ? (
                <div className="flex items-center justify-center h-64">
                  <p className="text-label font-mono text-slate-500 animate-pulse">
                    Loading civic metrics...
                  </p>
                </div>
              ) : scatterData.length >= 2 ? (
                <CorrelationScatter
                  data={scatterLabelled}
                  xLabel={xLabel}
                  yLabel={yLabel}
                  width={385}
                  height={280}
                  onSelect={handleScatterSelect}
                />
              ) : (
                <div className="flex items-center justify-center h-64 px-4">
                  <p className="text-label text-slate-500 text-center">
                    {scatterYUnpublished
                      ? `No ${yLabel} figures are loaded for ${city.name}'s ${unitNoun.many} — pick another Y axis.`
                      : scatterYMetric === null
                        ? 'Select a Y-axis metric to see correlations'
                        : 'Not enough data points for scatter plot'}
                  </p>
                </div>
              )}

              {/* Neighborhood ranking below scatter */}
              {rankedNeighborhoods.length > 0 && activeConfig && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                      Ranked by {activeConfig.shortLabel}
                    </p>
                    <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                  </div>
                  <div className="space-y-0.5">
                    {rankedNeighborhoods.map((n, idx) => {
                      const value = n[activeVariable] as number
                      const maxVal = rankedNeighborhoods[0]?.[activeVariable] as number ?? 1
                      const barWidth = maxVal > 0 ? (value / maxVal) * 100 : 0
                      const isSelected = selectedUnitId === n.name
                      // Name truncates, the code NEVER clips (the beat idiom —
                      // see AreaRowLabel). Identical strings on SF, so no span.
                      const label = censusUnitLabel(city, n.name)
                      return (
                        <div
                          key={n.name}
                          onClick={() => setSelectedNeighborhood(isSelected ? null : n.name)}
                          className={`relative py-1.5 px-3 rounded-lg cursor-pointer transition-all duration-200 ${
                            isSelected
                              ? 'bg-plum-500/10 ring-1 ring-plum-500/30'
                              : 'hover:bg-white/[0.04]'
                          }`}
                        >
                          <div
                            className="absolute inset-y-0 left-0 rounded-lg opacity-[0.06] bar-grow"
                            style={{ width: `${barWidth}%`, backgroundColor: '#7c3aed' }}
                          />
                          <div className="relative flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-micro font-mono text-slate-500 w-4 shrink-0">
                                {idx + 1}
                              </span>
                              <span className="text-[12px] font-medium text-slate-600 dark:text-slate-200 truncate">
                                {label}
                              </span>
                              {label !== n.name && (
                                <span className="shrink-0 text-micro font-mono text-slate-500">
                                  {n.name}
                                </span>
                              )}
                            </div>
                            <span className="text-label font-mono text-slate-400 shrink-0 ml-2">
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
                      labelFor={labelFor}
                      cityLabel={city.abbrev}
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
                      labelFor={labelFor}
                      cityLabel={city.abbrev}
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
