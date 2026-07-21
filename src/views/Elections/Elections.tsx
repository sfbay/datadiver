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
  useCVRManifest,
  useCVRBallots,
} from '@/hooks/useElectionResults'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { useRcvTransport } from '@/hooks/useRcvTransport'
import CardTray, { type CardDef } from '@/components/ui/CardTray'
import ExportButton from '@/components/export/ExportButton'
import { SkeletonStatCards, SkeletonSidebarRows } from '@/components/ui/Skeleton'
import { ACCENT, buildCandidateColorMap, turnoutColor } from '@/utils/electionColors'
import type { Race } from '@/types/elections'
import RCVRoundChart from '@/components/charts/RCVRoundChart'
import RCVComposition from '@/components/charts/RCVComposition'
import ElectionTimeline from '@/components/filters/ElectionTimeline'
import { useElectionTimeline } from '@/hooks/useElectionTimeline'
import BallotMeasureExplorer from '@/components/charts/BallotMeasureExplorer'
import { useBallotPropositions } from '@/hooks/useElectionResults'
import { toSentenceCase } from '@/utils/format'
import { cleanCandidateName, displayNhood, leaderDisplayName, nhoodKey } from '@/utils/electionData'
import { isProposition, leaderOf, leaderShareQuartiles } from './map/precinctPaint'
import { candidateShares, type PaintBundle } from './map/precinctJoin'
import { parseLens, SHIPPED_LENSES, type RcvLens } from './rcvLens'
import { useReplayModel } from './useReplayModel'
import { computeReplayRounds, replayPaintRows } from '@/lib/rcv/replay'
import { tabulateWhatIf } from '@/lib/rcv/whatIf'
import { COALITION_FLOOR, computeSecondChoices, computeHeadToHead, coalitionPaintRows } from '@/lib/rcv/coalition'
import { useEraFadedBundle } from './map/useEraFadedBundle'
import PrecinctFillLayer from './map/PrecinctFillLayer'
import NeighborhoodFrameLayer from './map/NeighborhoodFrameLayer'
import PrecinctLegend from './map/PrecinctLegend'
import CoverageChip from './map/CoverageChip'
import NeighborhoodElectionPanel from './panels/NeighborhoodElectionPanel'
import PrecinctDetailPanel from './panels/PrecinctDetailPanel'
import NeighborhoodsSidebarContent from './panels/NeighborhoodsSidebarContent'
import CoalitionPanel from './panels/CoalitionPanel'

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

const LENS_LABELS: Record<RcvLens, string> = {
  replay: 'Replay',
  coalition: 'Coalition',
  whatif: 'What-if',
}

export default function Elections() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedElection = searchParams.get('election') || null
  const selectedRaceId = searchParams.get('race') || null
  const selectedNeighborhood = searchParams.get('neighborhood') || null
  const focusedCandidate = searchParams.get('candidate') || null
  // ?strike= is repeatable (getAll) — certified names can carry commas, so a
  // joined single param would be ambiguous. Values are RAW artifact
  // candidate spellings. Memo keyed on searchParams identity.
  const strikeParams = useMemo(() => searchParams.getAll('strike'), [searchParams])
  // URL-level lens intent — unknown/unshipped values degrade to null.
  // Whether it's SHOWN is gated further down (`activeLens`) on CVR
  // availability + Time Machine.
  const rcvLens = parseLens(searchParams.get('lens'))

  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('races')
  const [raceFilter, setRaceFilter] = useState<RaceFilter>('all')
  const mapHandleRef = useRef<MapHandle>(null)

  const [rcvViewMode, setRcvViewMode] = useState<'rounds' | 'flow'>('rounds')
  const [rcvCollapsed, setRcvCollapsed] = useState(false)
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
      next.delete('lens') // lens + round are per-race state — neither carries over
      next.delete('round')
      next.delete('strike')
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

  const setLens = useCallback((lens: RcvLens | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (lens) next.set('lens', lens)
      else next.delete('lens')
      next.delete('round') // deleted on EVERY lens change (spec §4.1)
      if (lens !== 'whatif') next.delete('strike')
      return next
    }, { replace: true })
  }, [setSearchParams])

  // Rewrites the FULL strike set in one write (toggle callers compute the
  // next set from the current one). Deleting then re-appending keeps the
  // repeatable-param form canonical.
  const setStrikes = useCallback((names: string[]) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('strike')
      for (const n of names) next.append('strike', n)
      return next
    }, { replace: true })
  }, [setSearchParams])

  // Base-mode click while a lens is active EXITS the lens and activates that
  // mode in ONE search-params write — two sequential setSearchParams calls in
  // the same tick each compute from the same pre-click params, so the second
  // would clobber the first (the functional updater reads the hook's memoized
  // params, not same-tick writes — see [[react-router-redirect-clobber]]).
  const exitLensToMode = useCallback((mode: MapMode) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('lens')
      next.delete('round')
      next.delete('strike')
      if (mode === 'results') next.delete('map_mode')
      else next.set('map_mode', mode)
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

  // ── REPLAY lens availability ───────────────────────────────────────
  // `?lens=` is honored only when the active race has a committed CVR
  // artifact (manifest `races` is a Record keyed by race id) and Time
  // Machine is off. The lens PARAM survives suspension — TM entry
  // suspends the lens, TM exit restores it.
  const { data: cvrManifest } = useCVRManifest(activeElection)
  // dateCode identity guard: useStaticJSON keeps the PREVIOUS election's
  // manifest on a 404, which would leave a phantom Replay strip on another
  // election's RCV races after switching.
  const lensAvailable = Boolean(
    activeRace?.isRCV &&
      cvrManifest?.dateCode === activeElection &&
      cvrManifest?.races[activeRace.id] &&
      !timeMachineActive,
  )
  const activeLens = lensAvailable ? rcvLens : null

  // RCV data for the active race
  const rcvSlug = activeRace?.isRCV ? activeRace.id : null
  const { data: rcvData } = useRCVRounds(activeElection, rcvSlug)

  // `?round=` (1-based) seeds the transport ONCE at mount, and ONLY when a
  // shipped lens is in the URL too — a bare `?round=` must not defeat the
  // chart's opens-on-round-1 rule. Ref-initializer pattern: computed on the
  // first render, then cleared once the first contest consumes it (below)
  // so a race/election switch never re-applies the seed.
  const initialRoundRef = useRef<{ round: number | undefined } | null>(null)
  if (initialRoundRef.current === null) {
    const parsed = Number.parseInt(searchParams.get('round') ?? '', 10)
    initialRoundRef.current = {
      round: rcvLens === 'replay' && Number.isFinite(parsed) && parsed >= 1 ? parsed - 1 : undefined,
    }
  }

  // Separate mount seed for the WHATIF transport — same ref-initializer
  // pattern. Consumed on the first counterfactual contest; later strike
  // changes open on the (new) final round.
  const whatIfSeedRef = useRef<{ round: number | undefined } | null>(null)
  if (whatIfSeedRef.current === null) {
    const parsed = Number.parseInt(searchParams.get('round') ?? '', 10)
    whatIfSeedRef.current = {
      round: rcvLens === 'whatif' && Number.isFinite(parsed) && parsed >= 1 ? parsed - 1 : undefined,
    }
  }

  // Shared transport clock for the RCV round chart + replay map — resets to
  // round 1 on a new rcvData identity (a race/election switch) internally.
  const rcvTransport = useRcvTransport(rcvData ?? null, {
    initialRound: initialRoundRef.current.round,
  })

  // The transport re-reads its opts on every rcvData identity change — clear
  // the mount seed once the FIRST contest has consumed it, so later race
  // switches open on round 1 as always. (The transport's own reset effect is
  // registered earlier in hook order, so it reads this render's still-seeded
  // opts before this clears the ref for subsequent renders.)
  useEffect(() => {
    if (rcvData) initialRoundRef.current = { round: undefined }
  }, [rcvData])

  // Settled-position `?round=` writes — the URL records where the replay is
  // PARKED, never every autoplay frame. searchParamsRef keeps the has/value
  // checks out of that effect's dep list so it never fires a same-URL
  // replace navigation. The effect itself lives further down (after the
  // WHAT-IF transport is defined — it derives `roundTransport` from BOTH
  // round-bearing lenses).
  const searchParamsRef = useRef(searchParams)
  searchParamsRef.current = searchParams

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

  // ── REPLAY lens data (CVR ballots → per-round precinct paint) ──────
  // The multi-MB artifact fetch is gated on lens ENTRY (gate the fetch,
  // not just the DOM); identity-guard against useStaticJSON's
  // stale-previous-data refetch window, same as raceFile above.
  const { data: cvrArtifactRaw } = useCVRBallots(
    displayDateCode, activeRace?.id ?? null, activeLens !== null,
  )
  const cvrArtifact =
    cvrArtifactRaw?.dateCode === displayDateCode && cvrArtifactRaw?.raceId === activeRace?.id
      ? cvrArtifactRaw : null // stale-during-refetch identity guard
  const replayModel = useReplayModel(cvrArtifact, rcvData ?? null)
  const replayRows = useMemo(
    () => replayModel && cvrArtifact
      ? replayPaintRows(replayModel.states, rcvTransport.activeRound, cvrArtifact)
      : null,
    [replayModel, cvrArtifact, rcvTransport.activeRound],
  )
  // Replay quartile cutpoints are FIXED per race (spec §4.3): computed ONCE
  // from ROUND-1 rows over painted (turnout-joined) precincts and held
  // constant as the transport advances. Per-round recomputation would let
  // other precincts move the yardstick — reads as phantom motion; fixed
  // means late-round firming is a true consolidation signal. Same
  // leader-shares loop shape as the join's results-mode precompute.
  const replayQuartiles = useMemo((): [number, number, number] | null => {
    if (!replayModel || !cvrArtifact || !turnoutFile) return null
    const round1Rows = replayPaintRows(replayModel.states, 0, cvrArtifact)
    const shares: number[] = []
    for (const [label, row] of Object.entries(turnoutFile.precincts)) {
      if (row.unmapped) continue
      const replayRow = round1Rows[label]
      if (!replayRow || replayRow.total === 0) continue
      const leader = leaderOf(replayRow.votes)
      if (leader) shares.push(leader.share)
    }
    return leaderShareQuartiles(shares)
  }, [replayModel, cvrArtifact, turnoutFile])
  // While the artifact is still loading (replayRows null) this stays
  // undefined and the map keeps painting base mode — progressive, never
  // blank. Memoized: an unmemoized object literal here was rebuilt on
  // every render (any unrelated state change while the lens was active),
  // and buildPrecinctFeatures + setData downstream re-ran on that new
  // identity even though nothing replay-relevant had changed.
  const replayOption = useMemo(
    () =>
      activeLens === 'replay' && replayRows && rcvData
        ? { rows: replayRows, quartiles: replayQuartiles, round: rcvTransport.activeRound + 1, totalRounds: rcvData.rounds.length, lift: rcvTransport.inTransferWindow }
        : undefined,
    [activeLens, replayRows, replayQuartiles, rcvData, rcvTransport.activeRound, rcvTransport.inTransferWindow],
  )

  // Legend's replay-variant disclosure state: top-5 continuing candidates +
  // citywide drain (how much of round 1's continuing count no longer holds
  // a live vote) + the withheld-precinct count from the CVR artifact's own
  // reconciliation gate. Built off the committed rcvData (not the CVR
  // replay model) — the legend speaks to the same certified round numbers
  // the rounds chart does.
  const replayLegendState = useMemo(() => {
    if (activeLens !== 'replay' || !rcvData) return undefined
    const round = rcvData.rounds[rcvTransport.activeRound]
    const round1 = rcvData.rounds[0]
    if (!round || !round1) return undefined
    // The full continuing-candidates count (votes > 0) — the legend's
    // subtitle N, NOT the top-5 slice length below.
    const continuingAll = round.candidates.filter((c) => c.votes > 0)
    const continuing = [...continuingAll]
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 5)
      .map((c) => ({ name: c.name, votes: c.votes, pct: c.percentage }))
    const drainPct = ((round.exhausted + round.overvotes - round1.overvotes) / round1.continuingTotal) * 100
    return {
      round: rcvTransport.activeRound + 1,
      totalRounds: rcvData.rounds.length,
      continuing,
      continuingCount: continuingAll.length,
      drainPct,
      withheldCount: cvrArtifact?.sovSuppressed.length ?? 0,
    }
  }, [activeLens, rcvData, rcvTransport.activeRound, cvrArtifact])

  // ── COALITION lens data (CVR ballots → second-choice geography) ────
  const coalitionFocus = useMemo(() => {
    if (activeLens !== 'coalition' || !cvrArtifact || !focusedCandidate) return null
    const clean = cleanCandidateName(focusedCandidate)
    const idx = cvrArtifact.candidates.findIndex((c) => cleanCandidateName(c) === clean)
    if (idx < 0) return null
    return { idx, display: leaderDisplayName(clean) }
  }, [activeLens, cvrArtifact, focusedCandidate])

  const secondChoices = useMemo(
    () => (coalitionFocus && replayModel ? computeSecondChoices(replayModel.ballots, coalitionFocus.idx) : null),
    [coalitionFocus, replayModel],
  )

  const coalitionPaint = useMemo(
    () => (secondChoices && cvrArtifact ? coalitionPaintRows(secondChoices, cvrArtifact) : null),
    [secondChoices, cvrArtifact],
  )

  // Race-relative quartiles over PAINTED rows + the floor-suppressed count the
  // legend discloses. Mirrors the replayQuartiles memo above: filter both
  // through the SAME turnout-label set it uses (turnoutFile.precincts minus
  // unmapped rows), so withheld/"0000" ids in the artifact can't skew the
  // cutpoints or inflate the disclosure.
  const coalitionQuartiles = useMemo((): [number, number, number] | null => {
    if (!coalitionPaint || !turnoutFile) return null
    const shares: number[] = []
    for (const [label, row] of Object.entries(coalitionPaint.rows)) {
      const turnoutRow = turnoutFile.precincts[label]
      if (!turnoutRow || turnoutRow.unmapped) continue
      shares.push(row.dominantShare)
    }
    return leaderShareQuartiles(shares)
  }, [coalitionPaint, turnoutFile])

  const coalitionSuppressedShown = useMemo(() => {
    if (!coalitionPaint || !turnoutFile) return 0
    return coalitionPaint.suppressedIds.filter((id) => {
      const turnoutRow = turnoutFile.precincts[id]
      return turnoutRow && !turnoutRow.unmapped
    }).length
  }, [coalitionPaint, turnoutFile])

  const headToHead = useMemo(
    () =>
      activeLens === 'coalition' && replayModel && cvrArtifact
        ? computeHeadToHead(replayModel.ballots, cvrArtifact.candidates)
        : null,
    [activeLens, replayModel, cvrArtifact],
  )

  const coalitionOption = useMemo(
    () =>
      activeLens === 'coalition' && coalitionPaint && coalitionFocus
        ? { rows: coalitionPaint.rows, quartiles: coalitionQuartiles, focusDisplay: coalitionFocus.display }
        : undefined,
    [activeLens, coalitionPaint, coalitionQuartiles, coalitionFocus],
  )

  const coalitionLegendState = useMemo(() => {
    if (activeLens !== 'coalition' || !coalitionFocus || !secondChoices || !cvrArtifact) return undefined
    const total = secondChoices.total
    const recipients = Array.from(secondChoices.next, (votes, i) => ({ name: cvrArtifact.candidates[i], votes }))
      .filter((r) => r.votes > 0)
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 5)
      .map((r) => ({ ...r, pct: total > 0 ? (r.votes / total) * 100 : 0 }))
    return {
      focusDisplay: coalitionFocus.display,
      cohort: total,
      recipients,
      nonePct: total > 0 ? (secondChoices.none / total) * 100 : 0,
      overvoteCount: secondChoices.overvote,
      suppressedCount: coalitionSuppressedShown,
      withheldCount: cvrArtifact.sovSuppressed.length,
    }
  }, [activeLens, coalitionFocus, secondChoices, cvrArtifact, coalitionSuppressedShown])

  // ── WHAT-IF lens data (strike candidates → counterfactual count) ──────
  // Sanitized strike indices: unknown names dropped, duplicates dropped,
  // capped at candidates.length − 2 in URL order — min-2-remaining holds
  // even against a hand-typed query string. Matched via cleanCandidateName
  // (the coalitionFocus precedent).
  const struckIdx = useMemo(() => {
    if (activeLens !== 'whatif' || !cvrArtifact) return []
    const out: number[] = []
    for (const raw of strikeParams) {
      const clean = cleanCandidateName(raw)
      const i = cvrArtifact.candidates.findIndex((c) => cleanCandidateName(c) === clean)
      if (i >= 0 && !out.includes(i)) out.push(i)
      if (out.length >= cvrArtifact.candidates.length - 2) break
    }
    return out
  }, [activeLens, cvrArtifact, strikeParams])

  // The counterfactual count. Zero strikes → null (the resting state shows
  // the certified rounds — adjudication 4); tabulateWhatIf is pure and
  // ~15–30ms for mayor, so a plain memo suffices.
  const whatIfModel = useMemo(() => {
    if (activeLens !== 'whatif' || !replayModel || !cvrArtifact || struckIdx.length === 0) return null
    try {
      return tabulateWhatIf(
        replayModel.ballots,
        { raceId: cvrArtifact.raceId, title: cvrArtifact.title, candidates: cvrArtifact.candidates, precincts: cvrArtifact.precincts },
        struckIdx,
        replayModel.tab,
      )
    } catch (err) {
      console.error('[whatif] tabulation failed', err)
      return null
    }
  }, [activeLens, replayModel, cvrArtifact, struckIdx])

  // The contest the whatif chart/transport run on: counterfactual when
  // strikes exist, certified otherwise (resting state), null off-lens
  // (an inert totalRounds-0 transport).
  const whatIfChartData = activeLens === 'whatif' ? (whatIfModel?.contest ?? rcvData ?? null) : null

  const whatIfTransport = useRcvTransport(whatIfChartData, {
    // Opens on the FINAL round — whatif's question is "how does it end"
    // (replay's is "how it unfolds"). The mount seed wins once, for
    // ?lens=whatif&round=K deep links.
    initialRound: whatIfSeedRef.current.round ?? (whatIfChartData ? whatIfChartData.totalRounds - 1 : undefined),
  })

  useEffect(() => {
    if (whatIfChartData) whatIfSeedRef.current = { round: undefined }
  }, [whatIfChartData])

  // Counterfactual per-round precinct states — certified states when no
  // strikes (whatIfModel null), so the resting state still paints.
  const whatIfStates = useMemo(() => {
    if (activeLens !== 'whatif' || !replayModel) return null
    return whatIfModel ? computeReplayRounds(replayModel.ballots, whatIfModel) : replayModel.states
  }, [activeLens, replayModel, whatIfModel])

  const whatIfRows = useMemo(
    () => whatIfStates && cvrArtifact
      ? replayPaintRows(whatIfStates, whatIfTransport.activeRound, cvrArtifact)
      : null,
    [whatIfStates, cvrArtifact, whatIfTransport.activeRound],
  )

  // FIXED from the COUNTERFACTUAL's round 1 over painted precincts
  // (adjudication 3): cutpoints are fixed per tabulation — certified-R1
  // cutpoints on a shrunken roster would mis-band the counterfactual.
  const whatIfQuartiles = useMemo((): [number, number, number] | null => {
    if (!whatIfStates || !cvrArtifact || !turnoutFile) return null
    const round1Rows = replayPaintRows(whatIfStates, 0, cvrArtifact)
    const shares: number[] = []
    for (const [label, row] of Object.entries(turnoutFile.precincts)) {
      if (row.unmapped) continue
      const r = round1Rows[label]
      if (!r || r.total === 0) continue
      const leader = leaderOf(r.votes)
      if (leader) shares.push(leader.share)
    }
    return leaderShareQuartiles(shares)
  }, [whatIfStates, cvrArtifact, turnoutFile])

  // Divergence outline set — changedPrecincts filtered through the SAME
  // painted turnout-label set every quartile memo uses (6 of mayor−Lurie's
  // 356 are SOV-withheld and must stay unmarked).
  const whatIfChangedShown = useMemo(() => {
    const shown = new Set<string>()
    if (!whatIfModel || !turnoutFile) return shown
    for (const label of whatIfModel.changedPrecincts) {
      const row = turnoutFile.precincts[label]
      if (row && !row.unmapped) shown.add(label)
    }
    return shown
  }, [whatIfModel, turnoutFile])

  const whatIfOnFinalRound =
    whatIfChartData !== null && whatIfTransport.activeRound === whatIfChartData.totalRounds - 1

  const whatIfOption = useMemo(
    () =>
      activeLens === 'whatif' && whatIfRows && whatIfChartData
        ? {
            rows: whatIfRows,
            quartiles: whatIfQuartiles,
            round: whatIfTransport.activeRound + 1,
            totalRounds: whatIfChartData.totalRounds,
            lift: whatIfTransport.inTransferWindow,
            // Outline only on the counterfactual FINAL round (spec §4.5).
            changedLabels: whatIfOnFinalRound && whatIfChangedShown.size > 0 ? whatIfChangedShown : undefined,
          }
        : undefined,
    [activeLens, whatIfRows, whatIfChartData, whatIfQuartiles, whatIfTransport.activeRound, whatIfTransport.inTransferWindow, whatIfOnFinalRound, whatIfChangedShown],
  )

  // Which transport owns ?round= — replay and whatif are the round-bearing
  // lenses (coalition has no clock).
  const roundTransport = activeLens === 'replay' ? rcvTransport : activeLens === 'whatif' ? whatIfTransport : null
  useEffect(() => {
    if (roundTransport) {
      if (roundTransport.isPlaying || roundTransport.totalRounds === 0) return
      const value = String(roundTransport.activeRound + 1)
      if (searchParamsRef.current.get('round') === value) return
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('round', value)
        return next
      }, { replace: true })
      return
    }
    if (!searchParamsRef.current.has('round')) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('round')
      return next
    }, { replace: true })
    // Scalar deps only — the transport OBJECT is a fresh identity every
    // render and would make this run per-render; activeLens covers the
    // null↔transport switch (the original PR 1 effect's dep discipline).
  }, [activeLens, roundTransport?.activeRound, roundTransport?.isPlaying, roundTransport?.totalRounds, setSearchParams])

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

  // Precinct-click detail: the selected precinct's next-choice stacked
  // composition (per-precinct detail = a bar, never a per-precinct sankey).
  const coalitionDetail = useMemo(() => {
    if (!secondChoices || !cvrArtifact || !coalitionFocus || !selectedPrecinct) return undefined
    const p = cvrArtifact.precincts.indexOf(selectedPrecinct)
    if (p < 0) return undefined
    const pp = secondChoices.byPrecinct[p]
    // The map's n<10 floor holds here too — a suppressed precinct's full
    // composition in the detail panel would be single-digit-ballot
    // storytelling through the side door.
    if (pp.total < COALITION_FLOOR) return undefined
    const segments = Array.from(pp.next, (votes, i) => ({ name: cvrArtifact.candidates[i], votes }))
      .filter((s) => s.votes > 0)
      .sort((a, b) => b.votes - a.votes)
      .map((s) => ({
        name: leaderDisplayName(cleanCandidateName(s.name)),
        votes: s.votes,
        color: candidateColors.get(s.name) ?? '#a8926a',
      }))
    return { focusDisplay: coalitionFocus.display, cohort: pp.total, segments, none: pp.none, overvote: pp.overvote }
  }, [secondChoices, cvrArtifact, coalitionFocus, selectedPrecinct, candidateColors])

  // ── Candidate focus mode ────────────────────────────────────────────
  // Focus is a results-mode lens; Time Machine beats have a different
  // candidate set per era so focus is suspended during a TM scrub. An
  // active RCV lens preempts focus — a deep link carrying both paints
  // replay, not the focus ramp.
  const activeFocusCandidate =
    mapMode === 'results' && !timeMachineActive && activeLens === null ? focusedCandidate : null

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
      <div style="color:#a8926a;font-size:0.625rem;margin-top:4px">${turnoutLine}</div>
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

          <div className="flex flex-wrap items-center gap-2">
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
                      next.delete('lens')
                      next.delete('round')
                      next.delete('strike')
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

            {/* Map mode toggle — while a lens is active all three render
                unhighlighted (the lens supersedes the base mode); clicking
                one exits the lens and activates that mode in one write. */}
            <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
              {(['results', 'turnout', 'margin'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => (activeLens !== null ? exitLensToMode(mode) : setMapMode(mode))}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                    mapMode === mode && activeLens === null
                      ? 'bg-white dark:bg-white/[0.08] text-ink dark:text-white shadow-sm'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {mode === 'results' ? 'Results' : mode === 'turnout' ? 'Turnout' : 'Margin'}
                </button>
              ))}
            </div>

            {/* RCV lens strip — CVR-backed lenses for the active race
                (Replay + Coalition shipped; What-if named but unshipped) */}
            {lensAvailable && (
              <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
                <span className="text-nano font-mono px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-500">
                  RCV
                </span>
                {SHIPPED_LENSES.map((lens) => (
                  <button
                    key={lens}
                    onClick={() => setLens(activeLens === lens ? null : lens)}
                    className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                      activeLens === lens
                        ? 'bg-ochre-500/15 text-ink dark:text-paper-100'
                        : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                  >
                    {LENS_LABELS[lens]}
                  </button>
                ))}
              </div>
            )}

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
              replay={activeLens === 'whatif' ? whatIfOption : replayOption}
              coalition={coalitionOption}
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
              <div
                className={`absolute bottom-6 left-5 z-10 glass-card rounded-xl max-w-[calc(100vw-2.5rem)] ${rcvCollapsed ? 'px-3 py-2 cursor-pointer' : 'p-4'}`}
                style={{
                  // min() keeps the viewport guard live in the expanded states
                  // too — a plain inline maxWidth would override the class
                  // (the DetailPanelShell precedent guard, spec §4.6).
                  maxWidth: rcvCollapsed
                    ? undefined
                    : (activeLens === null && rcvViewMode === 'flow') || activeLens === 'coalition'
                      ? 'min(648px, 100vw - 2.5rem)'
                      : 'min(448px, 100vw - 2.5rem)',
                }}
                onClick={rcvCollapsed ? () => setRcvCollapsed(false) : undefined}
                title={rcvCollapsed ? 'Expand RCV panel' : undefined}
              >
                <div className={`flex items-center gap-2 ${rcvCollapsed ? '' : 'mb-3'}`}>
                  <span className="text-nano font-mono px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-500">
                    RCV
                  </span>
                  <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 flex-1">
                    {rcvData.totalRounds} Rounds &middot; Winner: {rcvData.winner.split(' ').pop()}
                    {rcvCollapsed && activeLens === 'replay' && (
                      <> &middot; REPLAY &middot; R{rcvTransport.activeRound + 1}/{rcvTransport.totalRounds}</>
                    )}
                    {rcvCollapsed && activeLens === 'coalition' && (
                      <> &middot; COALITION{coalitionFocus ? <> &middot; {coalitionFocus.display}</> : null}</>
                    )}
                  </p>
                  {/* View toggle — hidden while minimized (the chip stays a
                      one-line summary) AND while a lens is active (Flow is
                      round-blind; the replay arm is transport-driven). */}
                  {!rcvCollapsed && activeLens === null && (
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
                        onClick={() => setRcvViewMode('flow')}
                        className={`px-2 py-0.5 rounded text-nano font-mono transition-all ${
                          rcvViewMode === 'flow'
                            ? 'bg-ochre-500/20 text-ochre-400'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        Flow
                      </button>
                    </div>
                  )}
                  {/* Minimize / expand — stopPropagation so the collapsed
                      chip's whole-surface expand click doesn't double-toggle. */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setRcvCollapsed((v) => !v) }}
                    aria-expanded={!rcvCollapsed}
                    aria-label={rcvCollapsed ? 'Expand RCV panel' : 'Minimize RCV panel'}
                    title={rcvCollapsed ? 'Expand' : 'Minimize'}
                    className="w-6 h-6 rounded-md bg-indigo-500/10 flex items-center justify-center hover:bg-indigo-500/20 transition-colors flex-shrink-0"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="#616a96" aria-hidden>
                      {rcvCollapsed
                        ? <path d="M1 5.5L4 2L7 5.5Z" />
                        : <path d="M1 2.5L4 6L7 2.5Z" />}
                    </svg>
                  </button>
                </div>

                {!rcvCollapsed && (() => {
                  switch (activeLens) {
                    case 'replay':
                      // Lens arm: the SAME chart on the SAME shared transport
                      // (same key — no remount on lens toggle); only the
                      // Rounds/Flow toggle above is hidden.
                      return (
                        <RCVRoundChart
                          key={`${activeElection}-${rcvData.raceId}`}
                          rcvData={rcvData}
                          candidateColors={candidateColors}
                          width={400}
                          transport={rcvTransport}
                        />
                      )
                    case 'coalition':
                      return cvrArtifact ? (
                        <CoalitionPanel
                          rcvData={rcvData}
                          artifact={cvrArtifact}
                          candidateColors={candidateColors}
                          focusedCandidate={focusedCandidate}
                          onFocusCandidate={setFocusedCandidate}
                          secondChoices={secondChoices}
                          headToHead={headToHead}
                          focusDisplay={coalitionFocus?.display ?? null}
                        />
                      ) : (
                        <p className="text-micro text-slate-400 px-2 py-3">Loading ballots…</p>
                      )
                    default:
                      return rcvViewMode === 'rounds' ? (
                        <RCVRoundChart
                          key={`${activeElection}-${rcvData.raceId}`}
                          rcvData={rcvData}
                          candidateColors={candidateColors}
                          width={400}
                          transport={rcvTransport}
                        />
                      ) : (
                        <RCVComposition
                          rcvData={rcvData}
                          candidateColors={candidateColors}
                          width={600}
                        />
                      )
                  }
                })()}
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
              coalition={coalitionDetail}
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
                replayState={activeLens === 'replay' ? replayLegendState : undefined}
                coalitionState={activeLens === 'coalition' ? coalitionLegendState : undefined}
                coalitionPrompt={activeLens === 'coalition' && !coalitionFocus}
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
