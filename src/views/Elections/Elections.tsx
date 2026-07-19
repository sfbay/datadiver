import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import {
  useElectionManifest,
  useElectionResults,
  useRCVRounds,
  usePrecinctTurnout,
  usePrecinctRace,
  useNeighborhoodResults,
  useElectionGeo,
  useLegacyNeighborhoodGeo,
  preloadTimeMachineData,
} from '@/hooks/useElectionResults'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import CardTray, { type CardDef } from '@/components/ui/CardTray'
import ExportButton from '@/components/export/ExportButton'
import { SkeletonStatCards, SkeletonSidebarRows } from '@/components/ui/Skeleton'
import { ACCENT, buildCandidateColorMap, turnoutColor } from '@/utils/electionColors'
import type { Race } from '@/types/elections'
import RCVRoundChart from '@/components/charts/RCVRoundChart'
import RCVSankey from '@/components/charts/RCVSankey'
import ElectionTimeline from '@/components/filters/ElectionTimeline'
import { useElectionTimeline } from '@/hooks/useElectionTimeline'
import BallotMeasureExplorer from '@/components/charts/BallotMeasureExplorer'
import { useBallotPropositions } from '@/hooks/useElectionResults'
import { toSentenceCase } from '@/utils/format'
import { displayNhood, leaderDisplayName, nhoodKey } from '@/utils/electionData'
import { isProposition, leaderOf } from './map/precinctPaint'
import { candidateShares, type PaintBundle } from './map/precinctJoin'
import { useEraFadedBundle } from './map/useEraFadedBundle'
import PrecinctFillLayer from './map/PrecinctFillLayer'
import NeighborhoodFrameLayer from './map/NeighborhoodFrameLayer'
import PrecinctLegend from './map/PrecinctLegend'
import CoverageChip from './map/CoverageChip'
import NeighborhoodElectionPanel from './panels/NeighborhoodElectionPanel'
import PrecinctDetailPanel from './panels/PrecinctDetailPanel'
import NeighborhoodsSidebarContent from './panels/NeighborhoodsSidebarContent'

type MapMode = 'results' | 'turnout' | 'margin'
type SidebarTab = 'races' | 'neighborhoods' | 'measures'
type RaceFilter = 'all' | 'federal' | 'state' | 'local' | 'measure'

const FILTER_LABELS: Record<RaceFilter, string> = {
  all: 'All',
  local: 'Local',
  federal: 'Federal',
  state: 'State',
  measure: 'Propositions',
}

export default function Elections() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedElection = searchParams.get('election') || null
  const selectedRaceId = searchParams.get('race') || null
  const selectedNeighborhood = searchParams.get('neighborhood') || null
  const focusedCandidate = searchParams.get('candidate') || null

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
      next.delete('candidate') // a new race has a different candidate set — focus doesn't carry over
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setFocusedCandidate = useCallback((name: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (!name) next.delete('candidate')
      else next.set('candidate', name)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setSelectedNeighborhood = useCallback((n: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (!n) next.delete('neighborhood')
      else {
        next.set('neighborhood', n)
        next.delete('precinct') // selections are mutually exclusive
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

  const selectedPrecinct = searchParams.get('precinct') || null

  const setSelectedPrecinct = useCallback((label: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (!label) next.delete('precinct')
      else {
        next.set('precinct', label)
        next.delete('neighborhood') // selections are mutually exclusive
      }
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

  // Warm the module cache on activation so scrubbing is fetch-free after
  // the first pass (all _turnout files + both era geometries).
  useEffect(() => {
    if (timeMachineActive && manifest) {
      preloadTimeMachineData(manifest.elections.map((e) => e.dateCode))
    }
  }, [timeMachineActive, manifest])

  // When Time Machine is active, override the displayed results
  const displayResults = timeMachineActive && timeline.activeResults
    ? timeline.activeResults
    : results
  const displayElectionLabel = timeMachineActive && timeline.activeElection
    ? timeline.activeElection.label
    : results?.election.label || ''

  // ── Geo data ──────────────────────────────────────────────────────
  const { boundaries: neighborhoodBoundaries } = useNeighborhoodBoundaries()

  // ── Precinct paint inputs ──────────────────────────────────────────
  const displayDateCode = timeMachineActive
    ? timeline.activeElection?.dateCode ?? null
    : activeElection

  // In Time Machine, the beat's race is auto-picked from that election's own
  // summary; outside it, activeRace already is the auto-pick.
  const displayRace = useMemo((): Race | null => {
    if (!timeMachineActive) return activeRace
    const races = timeline.activeResults?.races
    if (!races) return null
    return (
      races.find((r) => r.id === 'mayor') ??
      races.find((r) => r.id.startsWith('president')) ??
      races.find((r) => r.type === 'local') ??
      races[0] ?? null
    )
  }, [timeMachineActive, activeRace, timeline.activeResults])

  const raceIsProp = displayRace
    ? displayRace.type === 'measure' || isProposition(displayRace.id, displayRace.title)
    : false

  const { data: turnoutFileRaw } = usePrecinctTurnout(displayDateCode)
  // useStaticJSON keeps the PREVIOUS url's data during a refetch — identity-guard.
  const turnoutFile = turnoutFileRaw?.dateCode === displayDateCode ? turnoutFileRaw : null

  // Both results AND margin need per-precinct votes (margin = leaderOf().lead);
  // only turnout mode paints without a race file.
  const raceIdForPaint = mapMode !== 'turnout' && displayRace ? displayRace.id : null
  const { data: raceFileRaw } = usePrecinctRace(displayDateCode, raceIdForPaint)
  const raceFile =
    raceFileRaw?.dateCode === displayDateCode && raceFileRaw?.raceId === raceIdForPaint
      ? raceFileRaw
      : null

  // Race still loading (or 404 → error) → race: null → the join paints turnout
  // for that beat instead of a blank. Progressive, never empty.
  const nextBundle = useMemo((): PaintBundle | null => {
    if (!displayDateCode || !turnoutFile) return null
    return { dateCode: displayDateCode, era: turnoutFile.era, turnout: turnoutFile, race: raceFile }
  }, [displayDateCode, turnoutFile, raceFile])

  // Time Machine drives the precinct fill: same-era scrubs swap instantly,
  // era boundaries fade out/in (~150ms), reduced motion swaps instantly.
  // Everything downstream reads `paintBundle` — geometry + frame + fill all
  // swap in the same faded beat.
  const prefersReducedMotion = usePrefersReducedMotion()
  const { bundle: paintBundle, fade, fadeMs } = useEraFadedBundle(nextBundle, prefersReducedMotion)

  const { data: activeGeo } = useElectionGeo(paintBundle?.era ?? null)
  const { data: legacyFrame } = useLegacyNeighborhoodGeo(paintBundle?.era === 'prec_2012')
  const frameBoundaries = paintBundle?.era === 'prec_2012' ? legacyFrame : neighborhoodBoundaries

  const { data: neighborhoodResults } = useNeighborhoodResults(displayDateCode)

  // ── Candidate colors ──────────────────────────────────────────────
  const candidateColors = useMemo(() => {
    if (!displayRace) return new Map<string, string>()
    return buildCandidateColorMap(displayRace.candidates)
  }, [displayRace])

  // ── Candidate focus mode ────────────────────────────────────────────
  // Focus is a results-mode lens; Time Machine beats have a different
  // candidate set per era so focus is suspended during a TM scrub.
  const activeFocusCandidate = mapMode === 'results' && !timeMachineActive ? focusedCandidate : null

  const focusExtent = useMemo((): [number, number] | null => {
    if (!focusedCandidate || !raceFile) return null
    return candidateShares(raceFile, focusedCandidate).extent
  }, [focusedCandidate, raceFile])

  // Real per-precinct tooltip — replaces the old citywide-caveat tooltip.
  useMapTooltip(mapInstance, 'election-precinct-fill', (props) => {
    const scheme = paintBundle?.era === 'prec_2012' ? 'legacy26' : 'analysis41'
    const nhood = displayNhood(String(props.nhood ?? ''), scheme)
    const turnoutLine = `${Math.round(Number(props.turnoutPct) * 100)}% turned out · ${Number(props.votes).toLocaleString()} votes cast`
    const leaderLine = props.tipLeaderName
      ? `<div style="color:${ACCENT};font-weight:600;margin-top:4px">${props.tipLeaderName} — ${props.tipLeaderPhrase}</div>`
      : ''
    return `
      <div class="tooltip-label">Precinct ${props.label}</div>
      <div class="tooltip-value">${nhood}</div>
      ${leaderLine}
      <div style="color:#a8926a;font-size:10px;margin-top:4px">${turnoutLine}</div>
    `
  })

  // Precinct click handler — same retry-attach shape as the old neighborhood one.
  useEffect(() => {
    if (!mapInstance) return
    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return
      const label = e.features[0].properties?.label as string | undefined
      if (label) setSelectedPrecinct(selectedPrecinct === label ? null : label)
    }
    const tryAttach = () => {
      try {
        if (mapInstance.getLayer('election-precinct-fill')) {
          mapInstance.on('click', 'election-precinct-fill', handleClick)
          return true
        }
      } catch { /* */ }
      return false
    }
    if (!tryAttach()) {
      const interval = setInterval(() => { if (tryAttach()) clearInterval(interval) }, 500)
      return () => {
        clearInterval(interval)
        try { mapInstance.off('click', 'election-precinct-fill', handleClick) } catch { /* */ }
      }
    }
    return () => {
      try { mapInstance.off('click', 'election-precinct-fill', handleClick) } catch { /* */ }
    }
  }, [mapInstance, selectedPrecinct, setSelectedPrecinct])

  const handleMapReady = useCallback((map: mapboxgl.Map) => { setMapInstance(map) }, [])

  // ── Card definitions ──────────────────────────────────────────────
  const cardDefs = useMemo((): CardDef[] => {
    const r = displayResults
    if (!r || !displayRace) return []
    const winner = displayRace.candidates.find((c) => c.isWinner)
    const topTwo = [...displayRace.candidates].sort((a, b) => b.totalVotes - a.totalVotes)
    const margin = topTwo.length >= 2
      ? ((topTwo[0].totalVotes - topTwo[1].totalVotes) / displayRace.totalBallotsCast * 100)
      : null

    const cards: CardDef[] = [
      {
        id: 'winner',
        label: 'Winner',
        shortLabel: 'Winner',
        value: winner ? leaderDisplayName(winner.name) : 'TBD',
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
        color: margin < 5 ? '#b85545' : '#a8926a',
        subtitle: margin < 5 ? 'Competitive' : undefined,
      })
    }

    cards.push({
      id: 'registered',
      label: 'Registered',
      shortLabel: 'Reg',
      value: r.registration.totalRegistered.toLocaleString(),
      color: '#a8926a',
    })

    if (!timeMachineActive && displayRace.isRCV && rcvData) {
      cards.push({
        id: 'rcv-rounds',
        label: 'RCV Rounds',
        shortLabel: 'Rounds',
        value: String(rcvData.totalRounds),
        color: ACCENT,
        subtitle: `Decided round ${rcvData.totalRounds}`,
      })
    }

    // ── Selection-aware overrides (comparison-framed, citywide = reference) ──
    const nfile = neighborhoodResults?.dateCode === displayDateCode ? neighborhoodResults : null

    if (selectedPrecinct && paintBundle) {
      const row = paintBundle.turnout.precincts[selectedPrecinct]
      if (row) {
        const allTurnouts = Object.values(paintBundle.turnout.precincts)
          .filter((p) => !p.unmapped && p.registered > 0)
          .map((p) => p.turnout)
        cards[1] = {
          ...cards[1],
          label: `Turnout — precinct ${selectedPrecinct}`,
          value: `${(row.turnout * 100).toFixed(1)}%`,
          color: turnoutColor(row.turnout),
          subtitle: `citywide ${(r.registration.turnoutPct * 100).toFixed(1)}%`,
          positionScale: {
            value: row.turnout,
            range: allTurnouts.length > 0
              ? [Math.min(...allTurnouts), Math.max(...allTurnouts)]
              : [row.turnout, row.turnout],
            reference: r.registration.turnoutPct,
          },
        }
        const raceRow = paintBundle.race?.precincts[selectedPrecinct]
        const leader = raceRow ? leaderOf(raceRow.votes) : null
        if (leader) {
          cards[0] = {
            ...cards[0],
            label: 'Leads this precinct',
            value: leaderDisplayName(leader.name),
            color: candidateColors.get(leader.name) || ACCENT,
            subtitle: `${(leader.share * 100).toFixed(1)}% here`,
          }
        }
      }
    } else if (selectedNeighborhood && nfile) {
      const key = Object.keys(nfile.neighborhoods).find((k) => nhoodKey(k) === nhoodKey(selectedNeighborhood))
      const nrow = key ? nfile.neighborhoods[key] : null
      if (nrow) {
        const allTurnouts = Object.values(nfile.neighborhoods)
          .filter((n) => n.registered > 0)
          .map((n) => n.turnout)
        cards[1] = {
          ...cards[1],
          label: `Turnout — ${displayNhood(key!, nfile.scheme)}`,
          value: `${(nrow.turnout * 100).toFixed(1)}%`,
          color: turnoutColor(nrow.turnout),
          subtitle: `${nrow.ballots.toLocaleString()} ballots · citywide ${(r.registration.turnoutPct * 100).toFixed(1)}%`,
          positionScale: {
            value: nrow.turnout,
            range: allTurnouts.length > 0
              ? [Math.min(...allTurnouts), Math.max(...allTurnouts)]
              : [nrow.turnout, nrow.turnout],
            reference: r.registration.turnoutPct,
          },
        }
      }
    }

    return cards
  }, [
    displayResults,
    displayRace,
    candidateColors,
    rcvData,
    timeMachineActive,
    selectedPrecinct,
    selectedNeighborhood,
    paintBundle,
    neighborhoodResults,
    displayDateCode,
  ])

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
              <p className="text-micro font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                SF Dept of Elections &middot; Results &amp; RCV
              </p>
            </div>
            {!isLoading && displayResults && (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-micro font-mono text-indigo-500/80 bg-indigo-500/10 px-2 py-1 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-indigo-500" />
                  {displayResults.races.length} races
                </span>
                {displayResults.races.filter((r) => r.isRCV).length > 0 && (
                  <span className="text-micro font-mono text-indigo-500/80 bg-indigo-400/10 px-2 py-1 rounded-full">
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
                      next.delete('precinct')
                      next.delete('candidate')
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
                  ? 'bg-ochre-500/15 text-ink dark:text-paper-100 border-ochre-500/30'
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
        <div className="flex-shrink-0 px-6 py-1.5 bg-ochre-500/10 border-b border-ochre-500/20 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-ochre-500 animate-pulse" />
          <p className="text-micro font-mono text-ochre-600 dark:text-ochre-500">
            TIME MACHINE — {displayElectionLabel}
          </p>
          {mapMode === 'results' && displayRace && (
            <span className="text-micro font-mono text-slate-500">
              · {toSentenceCase(displayRace.title)}
            </span>
          )}
          {paintBundle?.era === 'prec_2012' && (
            <span className="text-micro font-mono text-slate-500 italic">
              · boundaries as drawn for this election era
            </span>
          )}
          {timeline.isLoading && (
            <span className="text-micro font-mono text-slate-500 ml-auto">Loading…</span>
          )}
        </div>
      )}

      {/* Content */}
      <div id="elections-capture" className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-hidden flex">
        {/* Map area */}
        <div className="flex-1 relative">
          <MapView ref={mapHandleRef} onMapReady={handleMapReady}>
            {/* Precinct fill + neighborhood frame — always mounted (useMapLayer
                cleanup depends on it); both no-op on null data */}
            <PrecinctFillLayer
              map={mapInstance}
              bundle={paintBundle}
              geometry={activeGeo}
              mode={mapMode}
              colorMap={candidateColors}
              raceIsProp={raceIsProp}
              raceIsRCV={displayRace?.isRCV ?? false}
              selectedNeighborhood={selectedNeighborhood}
              focusCandidate={activeFocusCandidate}
              fade={fade}
              fadeMs={fadeMs}
            />
            <NeighborhoodFrameLayer
              map={mapInstance}
              boundaries={frameBoundaries}
              selectedNeighborhood={selectedNeighborhood}
            />

            {/* Error state */}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className="glass-card rounded-xl p-6 max-w-sm">
                  <p className="text-sm font-medium text-brick-400 mb-1">Failed to load election data</p>
                  <p className="text-xs text-slate-400">{error}</p>
                </div>
              </div>
            )}

            {/* Coverage chip — explains gaps (unmapped precincts, sparse elections) */}
            {!isLoading && (
              <CoverageChip turnout={paintBundle?.turnout ?? null} geometryCount={activeGeo?.features.length ?? null} />
            )}

            {/* Stat cards */}
            {isLoading && <SkeletonStatCards count={4} />}
            {!isLoading && displayResults && cardDefs.length > 0 && (
              <CardTray viewId="elections" cards={cardDefs} hideComparison />
            )}

            {/* RCV visualization panel — bottom-left when an RCV race is selected */}
            {/* maxWidth = chart width + p-4 padding (32px) + 16px spare — 420
                used to squeeze the 400px chart's padding to zero on the right
                (Jesse: callout butted against the panel edge). */}
            {!isLoading && !timeMachineActive && activeRace?.isRCV && rcvData && (
              <div className="absolute bottom-6 left-5 z-10 glass-card rounded-xl p-4" style={{ maxWidth: rcvViewMode === 'sankey' ? 648 : 448 }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-nano font-mono px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-500">
                    RCV
                  </span>
                  <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 flex-1">
                    {rcvData.totalRounds} Rounds &middot; Winner: {rcvData.winner.split(' ').pop()}
                  </p>
                  {/* View toggle */}
                  <div className="flex items-center gap-0.5 bg-slate-800/60 rounded-md p-0.5">
                    <button
                      onClick={() => setRcvViewMode('rounds')}
                      className={`px-2 py-0.5 rounded text-nano font-mono transition-all ${
                        rcvViewMode === 'rounds'
                          ? 'bg-ochre-500/20 text-ochre-400'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      Rounds
                    </button>
                    <button
                      onClick={() => setRcvViewMode('sankey')}
                      className={`px-2 py-0.5 rounded text-nano font-mono transition-all ${
                        rcvViewMode === 'sankey'
                          ? 'bg-ochre-500/20 text-ochre-400'
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
              dateCode={displayDateCode}
              race={displayRace}
              citywideTurnout={displayResults?.registration.turnoutPct ?? null}
              candidateColors={candidateColors}
              onClose={() => setSelectedNeighborhood(null)}
            />
            <PrecinctDetailPanel
              label={selectedPrecinct}
              dateCode={displayDateCode}
              race={displayRace}
              candidateColors={candidateColors}
              geometry={activeGeo}
              onSelectNeighborhood={(n) => setSelectedNeighborhood(n)}
              onClose={() => setSelectedPrecinct(null)}
              focusedCandidate={activeFocusCandidate}
              onFocusCandidate={setFocusedCandidate}
            />

            {/* Map legend — decodes the active precinct fill */}
            {!isLoading && displayRace && (
              <PrecinctLegend
                mode={mapMode}
                race={displayRace}
                raceIsProp={raceIsProp}
                candidateColors={candidateColors}
                focusedCandidate={activeFocusCandidate}
                focusExtent={focusExtent}
                onFocusCandidate={setFocusedCandidate}
              />
            )}
          </MapView>
        </div>

        {/* Sidebar */}
        <aside className="w-80 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] overflow-y-auto bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl flex flex-col">
          {/* Tab bar */}
          <div className="flex border-b border-slate-200/50 dark:border-white/[0.04] flex-shrink-0">
            {([['races', 'Races'], ['neighborhoods', 'Neighborhoods'], ['measures', 'Props']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSidebarTab(key)}
                className={`flex-1 py-2.5 text-micro font-mono uppercase tracking-[0.15em] transition-all duration-200 ${
                  sidebarTab === key
                    ? 'text-ink dark:text-white border-b-2 border-ochre-500'
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
                      className={`px-2.5 py-1 rounded-full text-micro font-mono transition-all ${
                        raceFilter === filter
                          ? 'bg-ochre-500/15 text-ink dark:text-paper-100 border border-transparent'
                          : 'text-slate-400 hover:text-slate-300 border border-transparent hover:border-slate-700'
                      }`}
                    >
                      {FILTER_LABELS[filter]}
                      {raceCounts[filter] ? ` (${raceCounts[filter]})` : ''}
                    </button>
                  ))}
                </div>

                {isLoading && <SkeletonSidebarRows count={10} />}
                {!isLoading && (
                  <div className="space-y-0.5">
                    {filteredRaces.map((race) => {
                      const winner = race.candidates.find((c) => c.isWinner)
                      const isActive = activeRace?.id === race.id
                      return (
                        <button
                          key={race.id}
                          onClick={() => setSelectedRace(race.id)}
                          className={`w-full text-left px-3 py-3 rounded-lg transition-all duration-200 ${
                            isActive
                              ? 'bg-ochre-500/10 ring-1 ring-ochre-500/30'
                              : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <p className="text-[13px] font-semibold text-ink dark:text-white truncate flex-1 capitalize">
                              {race.title.toLowerCase()}
                            </p>
                            {race.isRCV && (
                              <span className="text-nano font-mono px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-500 flex-shrink-0">
                                RCV
                              </span>
                            )}
                          </div>
                          {winner && (
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: candidateColors.get(winner.name) || '#a8926a' }}
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
                                      backgroundColor: candidateColors.get(c.name) || '#a8926a',
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
                              className="block mt-1.5 text-nano font-mono text-indigo-500/70 hover:text-indigo-500 transition-colors"
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
                dateCode={displayDateCode}
                citywideTurnout={displayResults?.registration.turnoutPct ?? null}
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
            <p className="text-nano text-slate-400 dark:text-slate-600">
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
