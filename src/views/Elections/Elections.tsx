import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { usePrecinctBoundaries } from '@/hooks/usePrecinctBoundaries'
import { useElectionManifest, useElectionResults, useRCVRounds } from '@/hooks/useElectionResults'
import CardTray, { type CardDef } from '@/components/ui/CardTray'
import DetailPanelShell from '@/components/ui/DetailPanelShell'
import ExportButton from '@/components/export/ExportButton'
import { SkeletonStatCards, SkeletonSidebarRows } from '@/components/ui/Skeleton'
import { ACCENT, buildCandidateColorMap, turnoutColor, marginColor } from '@/utils/electionColors'
import type { Race } from '@/types/elections'
import RCVRoundChart from '@/components/charts/RCVRoundChart'
import RCVSankey from '@/components/charts/RCVSankey'
import ElectionTimeline from '@/components/filters/ElectionTimeline'
import { useElectionTimeline } from '@/hooks/useElectionTimeline'
import BallotMeasureExplorer from '@/components/charts/BallotMeasureExplorer'
import { useBallotPropositions } from '@/hooks/useElectionResults'
import { toSentenceCase } from '@/utils/format'

type MapMode = 'results' | 'turnout' | 'margin'
type SidebarTab = 'races' | 'neighborhoods' | 'measures'
type RaceFilter = 'all' | 'federal' | 'state' | 'local' | 'measure'

export default function Elections() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedElection = searchParams.get('election') || null
  const selectedRaceId = searchParams.get('race') || null
  const selectedNeighborhood = searchParams.get('neighborhood') || null

  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('races')
  const [raceFilter, setRaceFilter] = useState<RaceFilter>('all')
  const mapHandleRef = useRef<MapHandle>(null)

  const [rcvViewMode, setRcvViewMode] = useState<'rounds' | 'sankey'>('rounds')
  const [rcvActiveRound, setRcvActiveRound] = useState<number | undefined>(undefined)
  const [timeMachineActive, setTimeMachineActive] = useState(false)

  const mapMode = (searchParams.get('map_mode') as MapMode) || 'results'

  const setMapMode = useCallback((mode: MapMode) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (mode === 'results') next.delete('map_mode')
      else next.set('map_mode', mode)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setSelectedRace = useCallback((raceId: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (!raceId) next.delete('race')
      else next.set('race', raceId)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setSelectedNeighborhood = useCallback((n: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (!n) next.delete('neighborhood')
      else next.set('neighborhood', n)
      return next
    }, { replace: true })
  }, [setSearchParams])

  // ── Data loading ──────────────────────────────────────────────────
  const { data: manifest, isLoading: manifestLoading, error: manifestError } = useElectionManifest()

  const activeElection = useMemo(() => {
    if (selectedElection) return selectedElection
    return manifest?.elections[0]?.dateCode ?? null
  }, [selectedElection, manifest])

  const { data: results, isLoading: resultsLoading, error: resultsError } = useElectionResults(activeElection)
  const isLoading = manifestLoading || resultsLoading
  const error = manifestError || resultsError

  // Default to first "interesting" race (mayor, president, or first local)
  const activeRace = useMemo((): Race | null => {
    if (!results) return null
    if (selectedRaceId) {
      const match = results.races.find((r) => r.id === selectedRaceId)
      if (match) return match
    }
    // Auto-select: mayor > president > first local > first race
    const mayor = results.races.find((r) => r.id === 'mayor')
    if (mayor) return mayor
    const president = results.races.find((r) => r.id.startsWith('president'))
    if (president) return president
    const firstLocal = results.races.find((r) => r.type === 'local')
    if (firstLocal) return firstLocal
    return results.races[0] ?? null
  }, [results, selectedRaceId])

  // RCV data for the active race
  const rcvSlug = activeRace?.isRCV ? activeRace.id : null
  const { data: rcvData } = useRCVRounds(activeElection, rcvSlug)

  // ── Ballot measures ────────────────────────────────────────────────
  const { data: ballotMeasures } = useBallotPropositions()

  // ── Time Machine ───────────────────────────────────────────────────
  const timeline = useElectionTimeline({ enabled: timeMachineActive })

  // When Time Machine is active, override the displayed results
  const displayResults = timeMachineActive && timeline.activeResults
    ? timeline.activeResults
    : results
  const displayElectionLabel = timeMachineActive && timeline.activeElection
    ? timeline.activeElection.label
    : results?.election.label || ''

  // ── Geo data ──────────────────────────────────────────────────────
  const { boundaries: neighborhoodBoundaries } = useNeighborhoodBoundaries()
  const { precincts, precinctToNeighborhood } = usePrecinctBoundaries()

  // ── Candidate colors ──────────────────────────────────────────────
  const candidateColors = useMemo(() => {
    if (!activeRace) return new Map<string, string>()
    return buildCandidateColorMap(activeRace.candidates)
  }, [activeRace])

  // ── Neighborhood choropleth ─────────────────────────────────────
  // Per-neighborhood results data (neighborhoods.json) doesn't exist yet —
  // we use precinct supervisor-district data to create visual variation.
  // Each neighborhood gets a different shade based on its dominant supe district.
  const hasCitywideFallback = true // TODO: set false when neighborhoods.json exists

  // Build a lookup: neighborhood → dominant supervisor district
  const nhoodToDistrict = useMemo(() => {
    if (!precincts || !precinctToNeighborhood) return new Map<string, number>()
    const districtVotes = new Map<string, Map<number, number>>()
    for (const f of precincts.features) {
      const prec = String(f.properties?.Prec_2025)
      const nhood = precinctToNeighborhood[prec] || (f.properties?.Neigh22 as string)
      const dist = Number(f.properties?.Supe22) || 0
      if (!nhood) continue
      if (!districtVotes.has(nhood)) districtVotes.set(nhood, new Map())
      const dv = districtVotes.get(nhood)!
      dv.set(dist, (dv.get(dist) || 0) + 1)
    }
    const result = new Map<string, number>()
    for (const [nhood, dv] of districtVotes) {
      let maxDist = 0, maxCount = 0
      for (const [dist, count] of dv) {
        if (count > maxCount) { maxDist = dist; maxCount = count }
      }
      result.set(nhood, maxDist)
    }
    return result
  }, [precincts, precinctToNeighborhood])

  const choroplethGeojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!neighborhoodBoundaries || !activeRace || !displayResults) return null

    const winner = activeRace.candidates.find((c) => c.isWinner)
    const winnerColor = winner ? candidateColors.get(winner.name) || ACCENT : ACCENT
    const topTwo = [...activeRace.candidates].sort((a, b) => b.totalVotes - a.totalVotes)
    const cityMargin = topTwo.length >= 2
      ? (topTwo[0].totalVotes - topTwo[1].totalVotes) / activeRace.totalBallotsCast
      : 0.5
    const cityTurnout = displayResults.registration.turnoutPct

    const features = neighborhoodBoundaries.features.map((f) => {
      const nhood = f.properties?.nhood as string || ''
      const district = nhoodToDistrict.get(nhood) || 0

      // Create visual variation: use district number to vary opacity/shade
      // This gives each neighborhood a distinct look even with citywide data
      const distFactor = (district % 11) / 11 // 0-1 based on district
      const fillOpacity = 0.15 + distFactor * 0.35 // range: 0.15 - 0.50

      let fillColor: string
      if (mapMode === 'turnout') {
        fillColor = turnoutColor(cityTurnout)
      } else if (mapMode === 'margin') {
        fillColor = marginColor(cityMargin)
      } else {
        fillColor = winnerColor
      }

      return {
        ...f,
        properties: {
          ...f.properties,
          fillColor,
          fillOpacity,
          winnerName: winner ? toSentenceCase(winner.name) : 'TBD',
          margin: cityMargin,
          turnoutPct: cityTurnout,
          district,
        },
      }
    })

    return { type: 'FeatureCollection', features }
  }, [neighborhoodBoundaries, activeRace, displayResults, candidateColors, nhoodToDistrict, mapMode])

  // ── Map layers ────────────────────────────────────────────────────
  const choroplethLayers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'election-nhood-fill',
      type: 'fill',
      source: 'election-choropleth',
      paint: {
        'fill-color': ['get', 'fillColor'],
        'fill-opacity': ['get', 'fillOpacity'],
      },
    },
    {
      id: 'election-nhood-outline',
      type: 'line',
      source: 'election-choropleth',
      paint: {
        'line-color': mapMode === 'turnout' ? '#e2e8f0' : mapMode === 'margin' ? '#d4a435' : (
          activeRace?.candidates.find((c) => c.isWinner)
            ? candidateColors.get(activeRace.candidates.find((c) => c.isWinner)!.name) || ACCENT
            : ACCENT
        ),
        'line-width': 1.5,
        'line-opacity': 0.6,
      },
    },
  ], [mapMode, activeRace, candidateColors])

  useMapLayer(mapInstance, 'election-choropleth', choroplethGeojson, choroplethLayers)

  // Tooltip for neighborhood hover
  useMapTooltip(mapInstance, 'election-nhood-fill', (props) => {
    const nhood = props.nhood || props.Neigh22 || 'Unknown'
    const dist = props.district ? `District ${props.district}` : ''
    if (mapMode === 'turnout') {
      return `
        <div class="tooltip-label">Neighborhood</div>
        <div class="tooltip-value">${nhood}</div>
        ${dist ? `<div style="color:#64748b;font-size:10px">${dist}</div>` : ''}
        <div class="tooltip-label" style="margin-top:6px">City Turnout</div>
        <div style="color:#7a9954;font-weight:600">${(Number(props.turnoutPct) * 100).toFixed(1)}%</div>
      `
    }
    if (mapMode === 'margin') {
      return `
        <div class="tooltip-label">Neighborhood</div>
        <div class="tooltip-value">${nhood}</div>
        ${dist ? `<div style="color:#64748b;font-size:10px">${dist}</div>` : ''}
        <div class="tooltip-label" style="margin-top:6px">City Margin</div>
        <div style="color:#d4a435;font-weight:600">${(Number(props.margin) * 100).toFixed(1)}%</div>
      `
    }
    return `
      <div class="tooltip-label">Neighborhood</div>
      <div class="tooltip-value">${nhood}</div>
      ${dist ? `<div style="color:#64748b;font-size:10px">${dist}</div>` : ''}
      <div class="tooltip-label" style="margin-top:6px">Winner (Citywide)</div>
      <div style="color:${props.fillColor || ACCENT};font-weight:600">${props.winnerName || 'TBD'}</div>
    `
  })

  // Click handler for neighborhood selection
  useEffect(() => {
    if (!mapInstance) return

    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return
      const nhood = e.features[0].properties?.nhood || e.features[0].properties?.Neigh22
      if (nhood) {
        setSelectedNeighborhood(selectedNeighborhood === nhood ? null : nhood)
        setSidebarTab('neighborhoods')
      }
    }

    const tryAttach = () => {
      try {
        if (mapInstance.getLayer('election-nhood-fill')) {
          mapInstance.on('click', 'election-nhood-fill', handleClick)
          return true
        }
      } catch { /* */ }
      return false
    }

    if (!tryAttach()) {
      const interval = setInterval(() => { if (tryAttach()) clearInterval(interval) }, 500)
      return () => {
        clearInterval(interval)
        try { mapInstance.off('click', 'election-nhood-fill', handleClick) } catch { /* */ }
      }
    }

    return () => {
      try { mapInstance.off('click', 'election-nhood-fill', handleClick) } catch { /* */ }
    }
  }, [mapInstance, selectedNeighborhood, setSelectedNeighborhood])

  const handleMapReady = useCallback((map: mapboxgl.Map) => { setMapInstance(map) }, [])

  // ── Card definitions ──────────────────────────────────────────────
  const cardDefs = useMemo((): CardDef[] => {
    const r = displayResults
    if (!r || !activeRace) return []
    const winner = activeRace.candidates.find((c) => c.isWinner)
    const topTwo = [...activeRace.candidates].sort((a, b) => b.totalVotes - a.totalVotes)
    const margin = topTwo.length >= 2
      ? ((topTwo[0].totalVotes - topTwo[1].totalVotes) / activeRace.totalBallotsCast * 100)
      : null

    const cards: CardDef[] = [
      {
        id: 'winner',
        label: 'Winner',
        shortLabel: 'Winner',
        value: winner ? toSentenceCase(winner.name.split(' ').pop() || winner.name) : 'TBD',
        color: winner ? candidateColors.get(winner.name) || ACCENT : ACCENT,
        defaultExpanded: true,
        subtitle: winner ? `${(winner.percentage * 100).toFixed(1)}%` : undefined,
      },
      {
        id: 'turnout',
        label: 'Turnout',
        shortLabel: 'Turnout',
        value: `${(r.registration.turnoutPct * 100).toFixed(1)}%`,
        color: turnoutColor(r.registration.turnoutPct),
        defaultExpanded: true,
        subtitle: `${r.registration.totalBallotsCast.toLocaleString()} ballots`,
      },
    ]

    if (margin !== null) {
      cards.push({
        id: 'margin',
        label: 'Margin',
        shortLabel: 'Margin',
        value: `${margin.toFixed(1)}%`,
        color: margin < 5 ? '#b85545' : '#64748b',
        subtitle: margin < 5 ? 'Competitive' : undefined,
      })
    }

    cards.push({
      id: 'registered',
      label: 'Registered',
      shortLabel: 'Reg',
      value: r.registration.totalRegistered.toLocaleString(),
      color: '#64748b',
    })

    if (activeRace.isRCV && rcvData) {
      cards.push({
        id: 'rcv-rounds',
        label: 'RCV Rounds',
        shortLabel: 'Rounds',
        value: String(rcvData.totalRounds),
        color: ACCENT,
        subtitle: `Decided round ${rcvData.totalRounds}`,
      })
    }

    return cards
  }, [displayResults, activeRace, candidateColors, rcvData])

  // ── Filtered races for sidebar ────────────────────────────────────
  const filteredRaces = useMemo(() => {
    if (!displayResults) return []
    if (raceFilter === 'all') return displayResults.races
    return displayResults.races.filter((r) => r.type === raceFilter)
  }, [displayResults, raceFilter])

  const electionMeta = useMemo(() => {
    if (!manifest || !activeElection) return null
    return manifest.elections.find((e) => e.dateCode === activeElection)
  }, [manifest, activeElection])

  // Count races by type for filter badges
  const raceCounts = useMemo(() => {
    if (!displayResults) return {} as Record<RaceFilter, number>
    const counts: Record<string, number> = { all: displayResults.races.length }
    for (const r of displayResults.races) {
      counts[r.type] = (counts[r.type] || 0) + 1
    }
    return counts as Record<RaceFilter, number>
  }, [displayResults])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                Elections
              </h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                SF Dept of Elections &middot; Results &amp; RCV
              </p>
            </div>
            {!isLoading && displayResults && (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-indigo-500/80 bg-indigo-500/10 px-2 py-1 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-indigo-500" />
                  {displayResults.races.length} races
                </span>
                {displayResults.races.filter((r) => r.isRCV).length > 0 && (
                  <span className="text-[10px] font-mono text-indigo-500/80 bg-indigo-400/10 px-2 py-1 rounded-full">
                    {displayResults.races.filter((r) => r.isRCV).length} RCV
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Election picker */}
            {manifest && (
              <select
                value={activeElection ?? ''}
                onChange={(e) => {
                  setSearchParams(
                    (prev) => {
                      const next = new URLSearchParams(prev)
                      next.set('election', e.target.value)
                      next.delete('race')
                      next.delete('neighborhood')
                      return next
                    },
                    { replace: true },
                  )
                }}
                className="text-sm bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-ink dark:text-white backdrop-blur"
              >
                {manifest.elections.map((e) => (
                  <option key={e.dateCode} value={e.dateCode}>
                    {e.label}
                  </option>
                ))}
              </select>
            )}

            {/* Map mode toggle */}
            <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
              {(['results', 'turnout', 'margin'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setMapMode(mode)}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                    mapMode === mode
                      ? 'bg-white dark:bg-white/[0.08] text-ink dark:text-white shadow-sm'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {mode === 'results' ? 'Results' : mode === 'turnout' ? 'Turnout' : 'Margin'}
                </button>
              ))}
            </div>

            {/* Time Machine toggle */}
            <button
              onClick={() => setTimeMachineActive(!timeMachineActive)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200 border ${
                timeMachineActive
                  ? 'bg-indigo-500/20 text-indigo-500 border-indigo-500/30'
                  : 'text-slate-400 border-slate-200 dark:border-white/10 hover:text-slate-300 hover:border-white/20'
              }`}
              title="Cross-election playback"
            >
              Time Machine
            </button>

            <ExportButton targetSelector="#elections-capture" filename="elections" />
          </div>
        </div>
      </header>

      {/* Time Machine banner */}
      {timeMachineActive && (
        <div className="flex-shrink-0 px-6 py-1.5 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <p className="text-[10px] font-mono text-indigo-500">
            TIME MACHINE — {displayElectionLabel}
          </p>
          {timeline.isLoading && (
            <span className="text-[10px] font-mono text-slate-500 ml-auto">Loading…</span>
          )}
        </div>
      )}

      {/* Content */}
      <div id="elections-capture" className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-hidden flex">
        {/* Map area */}
        <div className="flex-1 relative">
          <MapView ref={mapHandleRef} onMapReady={handleMapReady}>
            {/* Error state */}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className="glass-card rounded-xl p-6 max-w-sm">
                  <p className="text-sm font-medium text-brick-400 mb-1">Failed to load election data</p>
                  <p className="text-xs text-slate-400">{error}</p>
                </div>
              </div>
            )}

            {/* Citywide-only indicator */}
            {!isLoading && hasCitywideFallback && displayResults && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-sm border border-white/[0.08] text-[10px] font-mono text-slate-400">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#64748b" strokeWidth="1.5">
                    <circle cx="6" cy="6" r="4.5" />
                    <path d="M6 4v3M6 8.5v.01" strokeLinecap="round" />
                  </svg>
                  Citywide results — neighborhood-level data coming soon
                </div>
              </div>
            )}

            {/* Stat cards */}
            {isLoading && <SkeletonStatCards count={4} />}
            {!isLoading && displayResults && cardDefs.length > 0 && (
              <CardTray viewId="elections" cards={cardDefs} />
            )}

            {/* RCV visualization panel — bottom-left when an RCV race is selected */}
            {!isLoading && activeRace?.isRCV && rcvData && (
              <div className="absolute bottom-6 left-5 z-10 glass-card rounded-xl p-4" style={{ maxWidth: rcvViewMode === 'sankey' ? 620 : 420 }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-500">
                    RCV
                  </span>
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 flex-1">
                    {rcvData.totalRounds} Rounds &middot; Winner: {rcvData.winner.split(' ').pop()}
                  </p>
                  {/* View toggle */}
                  <div className="flex items-center gap-0.5 bg-slate-800/60 rounded-md p-0.5">
                    <button
                      onClick={() => setRcvViewMode('rounds')}
                      className={`px-2 py-0.5 rounded text-[9px] font-mono transition-all ${
                        rcvViewMode === 'rounds'
                          ? 'bg-indigo-500/20 text-indigo-500'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      Rounds
                    </button>
                    <button
                      onClick={() => setRcvViewMode('sankey')}
                      className={`px-2 py-0.5 rounded text-[9px] font-mono transition-all ${
                        rcvViewMode === 'sankey'
                          ? 'bg-indigo-500/20 text-indigo-500'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      Flow
                    </button>
                  </div>
                </div>

                {rcvViewMode === 'rounds' ? (
                  <RCVRoundChart
                    rcvData={rcvData}
                    candidateColors={candidateColors}
                    width={400}
                    currentRound={rcvActiveRound}
                    onRoundChange={setRcvActiveRound}
                  />
                ) : (
                  <RCVSankey
                    rcvData={rcvData}
                    candidateColors={candidateColors}
                    width={600}
                    height={300}
                  />
                )}
              </div>
            )}

            {/* Neighborhood detail panel */}
            <NeighborhoodElectionPanel
              neighborhood={selectedNeighborhood}
              results={displayResults}
              candidateColors={candidateColors}
              onClose={() => setSelectedNeighborhood(null)}
            />

            {/* Map legend */}
            {!isLoading && activeRace && mapMode === 'results' && (
              <div className="absolute bottom-6 right-5 z-10 glass-card rounded-xl p-3">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                  {activeRace.title}
                </p>
                <div className="space-y-1">
                  {activeRace.candidates.slice(0, 5).map((c) => (
                    <div key={c.name} className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: candidateColors.get(c.name) || '#64748b' }}
                      />
                      <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                        {toSentenceCase(c.name.split(',')[0])}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 ml-auto">
                        {(c.percentage * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </MapView>
        </div>

        {/* Sidebar */}
        <aside className="w-80 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] overflow-y-auto bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl flex flex-col">
          {/* Tab bar */}
          <div className="flex border-b border-slate-200/50 dark:border-white/[0.04] flex-shrink-0">
            {([['races', 'Races'], ['neighborhoods', 'Neighborhoods'], ['measures', 'Measures']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSidebarTab(key)}
                className={`flex-1 py-2.5 text-[10px] font-mono uppercase tracking-[0.15em] transition-all duration-200 ${
                  sidebarTab === key
                    ? 'text-ink dark:text-white border-b-2 border-indigo-500'
                    : 'text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-4 flex-1 overflow-y-auto">
            {sidebarTab === 'races' && (
              <>
                {/* Race type filter pills */}
                <div className="flex flex-wrap gap-1 mb-4">
                  {(['all', 'local', 'federal', 'state', 'measure'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setRaceFilter(filter)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-mono transition-all ${
                        raceFilter === filter
                          ? 'bg-indigo-500/20 text-indigo-500 border border-indigo-500/30'
                          : 'text-slate-400 hover:text-slate-300 border border-transparent hover:border-slate-700'
                      }`}
                    >
                      {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                      {raceCounts[filter] ? ` (${raceCounts[filter]})` : ''}
                    </button>
                  ))}
                </div>

                {isLoading && <SkeletonSidebarRows count={10} />}
                {!isLoading && (
                  <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                    {filteredRaces.map((race) => {
                      const winner = race.candidates.find((c) => c.isWinner)
                      const isActive = activeRace?.id === race.id
                      return (
                        <button
                          key={race.id}
                          onClick={() => setSelectedRace(race.id)}
                          className={`w-full text-left px-3 py-3 transition-all duration-200 ${
                            isActive
                              ? 'bg-indigo-500/10 border-l-2 border-indigo-500'
                              : 'hover:bg-slate-50 dark:hover:bg-white/[0.03] border-l-2 border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <p className="text-[13px] font-semibold text-ink dark:text-white truncate flex-1 capitalize">
                              {race.title.toLowerCase()}
                            </p>
                            {race.isRCV && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-500 flex-shrink-0">
                                RCV
                              </span>
                            )}
                          </div>
                          {winner && (
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: candidateColors.get(winner.name) || '#64748b' }}
                              />
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                {toSentenceCase(winner.name)}
                              </p>
                              <span className="text-xs font-mono text-slate-400 ml-auto">
                                {(winner.percentage * 100).toFixed(1)}%
                              </span>
                            </div>
                          )}
                          {/* Vote bar for top candidates */}
                          {race.candidates.length > 0 && (
                            <div className="flex h-1.5 rounded-full overflow-hidden mt-2 bg-slate-200/50 dark:bg-white/[0.04]">
                              {race.candidates
                                .filter((c) => c.percentage > 0.01)
                                .slice(0, 6)
                                .map((c, i) => (
                                  <div
                                    key={i}
                                    className="h-full transition-all duration-500"
                                    style={{
                                      width: `${c.percentage * 100}%`,
                                      backgroundColor: candidateColors.get(c.name) || '#64748b',
                                      opacity: c.isWinner ? 1 : 0.5,
                                    }}
                                  />
                                ))}
                            </div>
                          )}
                          {/* Campaign Finance cross-link */}
                          {isActive && winner && race.type === 'local' && (
                            <Link
                              to={`/campaign-finance?search=${encodeURIComponent(winner.name.split(',')[0])}`}
                              onClick={(e) => e.stopPropagation()}
                              className="block mt-1.5 text-[9px] font-mono text-indigo-500/70 hover:text-indigo-500 transition-colors"
                            >
                              See who funded this campaign →
                            </Link>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {sidebarTab === 'neighborhoods' && (
              <NeighborhoodsSidebarContent
                selectedNeighborhood={selectedNeighborhood}
                setSelectedNeighborhood={setSelectedNeighborhood}
              />
            )}

            {sidebarTab === 'measures' && ballotMeasures && (
              <BallotMeasureExplorer measures={ballotMeasures} />
            )}
          </div>

          {/* Data source attribution + 1996 SFSU nod */}
          <div className="flex-shrink-0 px-4 py-3 border-t border-slate-200/50 dark:border-white/[0.04]">
            <p className="text-[9px] text-slate-400 dark:text-slate-600">
              Source: SF Dept of Elections &middot; sfelections.org
              {electionMeta && (
                <> &middot; {electionMeta.type.charAt(0).toUpperCase() + electionMeta.type.slice(1)} election</>
              )}
            </p>
            <p className="text-[8px] text-slate-500/60 dark:text-slate-700 mt-1 italic">
              One of SF's first live election results websites was hand-built at SFSU in 1996. DataDiver continues that tradition.
            </p>
          </div>
        </aside>
      </div>

      {/* Time Machine timeline scrubber */}
      {timeMachineActive && timeline.elections.length > 1 && (
        <ElectionTimeline
          elections={timeline.elections}
          activeIndex={timeline.activeIndex}
          onIndexChange={timeline.setActiveIndex}
          isPlaying={timeline.isPlaying}
          onPlayToggle={timeline.togglePlay}
          speed={timeline.speed}
          onSpeedChange={timeline.setSpeed}
        />
      )}
      </div>
    </div>
  )
}

// ── Neighborhood sidebar content ────────────────────────────────────

function NeighborhoodsSidebarContent({
  selectedNeighborhood,
  setSelectedNeighborhood,
}: {
  selectedNeighborhood: string | null
  setSelectedNeighborhood: (n: string | null) => void
}) {
  const { precinctToNeighborhood } = usePrecinctBoundaries()

  // Build list of neighborhoods from precinct mapping
  const neighborhoods = useMemo(() => {
    if (!precinctToNeighborhood) return []
    const countMap = new Map<string, number>()
    for (const nhood of Object.values(precinctToNeighborhood)) {
      countMap.set(nhood, (countMap.get(nhood) || 0) + 1)
    }
    return Array.from(countMap.entries())
      .map(([name, precinctCount]) => ({ name, precinctCount }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [precinctToNeighborhood])

  const handleClick = useCallback((nhood: string) => {
    setSelectedNeighborhood(selectedNeighborhood === nhood ? null : nhood)
  }, [selectedNeighborhood, setSelectedNeighborhood])

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
          {neighborhoods.length} Neighborhoods
        </p>
        <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
      </div>

      {selectedNeighborhood && (
        <button
          onClick={() => setSelectedNeighborhood(null)}
          className="mb-3 text-[10px] font-mono text-indigo-500 hover:text-indigo-500 transition-colors"
        >
          ← Clear filter: {selectedNeighborhood}
        </button>
      )}

      <div className="space-y-0.5">
        {neighborhoods.map((n) => {
          const isActive = selectedNeighborhood === n.name
          return (
            <div
              key={n.name}
              onClick={() => handleClick(n.name)}
              className={`py-2 px-3 rounded-lg cursor-pointer transition-all duration-200 ${
                isActive
                  ? 'bg-indigo-500/10 ring-1 ring-indigo-500/30'
                  : 'hover:bg-white/80 dark:hover:bg-white/[0.04]'
              }`}
            >
              <p className="text-[12px] font-medium text-ink dark:text-slate-200 leading-tight">
                {n.name}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">
                {n.precinctCount} precincts
              </p>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── Neighborhood election detail panel ──────────────────────────────

function NeighborhoodElectionPanel({
  neighborhood,
  results,
  candidateColors,
  onClose,
}: {
  neighborhood: string | null
  results: import('@/types/elections').ElectionResults | null
  candidateColors: Map<string, string>
  onClose: () => void
}) {
  if (!neighborhood || !results) return null

  // Show top 5 races with their winners for this election
  const topRaces = results.races.filter(
    (r) => r.type === 'local' || r.type === 'federal'
  ).slice(0, 8)

  return (
    <DetailPanelShell
      open={!!neighborhood}
      onClose={onClose}
      isLoading={false}
      spinnerClass="border-indigo-400"
      widthClass="w-80"
    >
      <div className="pr-6">
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-1">
          Neighborhood
        </p>
        <h3 className="text-lg font-display italic text-ink dark:text-white mb-1">
          {neighborhood}
        </h3>
        <p className="text-[10px] font-mono text-slate-500 mb-4">
          {results.election.label}
        </p>

        {/* Turnout */}
        <div className="mb-4">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-1">
            City Turnout
          </p>
          <p className="text-lg font-mono font-bold" style={{ color: turnoutColor(results.registration.turnoutPct) }}>
            {(results.registration.turnoutPct * 100).toFixed(1)}%
          </p>
          <p className="text-[10px] text-slate-500">
            {results.registration.totalBallotsCast.toLocaleString()} of {results.registration.totalRegistered.toLocaleString()} registered
          </p>
        </div>

        {/* Key races */}
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
          Key Races
        </p>
        <div className="space-y-3">
          {topRaces.map((race) => {
            const winner = race.candidates.find((c) => c.isWinner)
            return (
              <div key={race.id}>
                <p className="text-[11px] font-semibold text-ink dark:text-white capitalize mb-1">
                  {race.title.toLowerCase()}
                </p>
                {race.candidates.slice(0, 3).map((c) => (
                  <div key={c.name} className="flex items-center gap-2 py-0.5">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: candidateColors.get(c.name) || '#64748b' }}
                    />
                    <span className={`text-[10px] truncate flex-1 ${c.isWinner ? 'text-white font-semibold' : 'text-slate-400'}`}>
                      {toSentenceCase(c.name)}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {(c.percentage * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
                {race.isRCV && (
                  <p className="text-[9px] font-mono text-indigo-500 mt-0.5">Ranked Choice Voting</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </DetailPanelShell>
  )
}
