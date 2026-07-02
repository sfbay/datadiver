// src/views/Last48/Last48.tsx
//
// Top-level page for The Last 48. Owns:
//   - Layer state from URL search params (?fill=, ?points=)
//     Legacy ?mode=hotspots URLs migrate at parse time → ?fill=anomaly
//   - The useLast48Window hook (single instance per page)
//   - Layout chrome (freshness chips, dataset filter chips, layer controls, scanner strip)
//   - Last48UnifiedView — single persistent MapView with composable layers

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLast48Window } from '@/hooks/useLast48Window'
import { useSummaryStore } from '@/stores/summaryStore'
import { LAST48_DATASETS, type DatasetId } from '@/types/last48'
import type { CensusVariable } from '@/types/census'
import Last48UnifiedView from './modes/Last48UnifiedView'
import AmbientToggle from './ambient/AmbientToggle'
import AmbientTunePanel from './ambient/AmbientTunePanel'
import { parsePaceId, PACE_PRESETS, DEFAULT_PACE_ID, type PaceId, type PaceValues } from './ambient/pace'
import LayerControls, { type BaseFill } from './chrome/LayerControls'
import DatasetSuperChips from './chrome/DatasetSuperChips'
import ScannerStrip from './chrome/ScannerStrip'
import ExportButton from '@/components/export/ExportButton'
import CivicTicker from '@/components/ui/CivicTicker'
import { useAnomalyBaseline } from '@/hooks/useAnomalyBaseline'
import { useLast48Heartbeat } from '@/hooks/useLast48Heartbeat'
import type { TickerItem } from '@/types/ticker'

// ── URL param parsers ──────────────────────────────────────────────────────

function parseFill(s: string | null, legacyMode: string | null): BaseFill {
  // Legacy ?mode=hotspots → anomaly. Otherwise read ?fill=.
  if (s === 'anomaly' || s === 'demographic' || s === 'none') return s
  if (legacyMode === 'hotspots') return 'anomaly'
  // Default: demographic underlay ON (home values — see underlayVariable
  // default below). The hollow-ring dots sit cleanly over the choropleth,
  // and leading with neighborhood context is the editorial intent. Opt out
  // via ?fill=none.
  return 'demographic'
}

function parsePoints(s: string | null): boolean {
  // Default on; only turn off if explicitly ?points=off.
  return s !== 'off'
}

function parseDatasets(s: string | null): DatasetId[] {
  if (!s) return LAST48_DATASETS
  const parts = s.split(',').map((p) => p.trim()) as DatasetId[]
  // Filter to known IDs to defend against URL tampering. Legacy URL params
  // with retired Tier 2 ids (911-historical, parking-revenue, police-incidents)
  // are silently dropped — they're no longer in LAST48_DATASETS.
  const known = new Set<DatasetId>(LAST48_DATASETS)
  return parts.filter((p) => known.has(p))
}

// ?ambient= parsing lives in ambient/pace.ts (parsePaceId): '1' arms at the
// default pace; 'stroll'|'drift'|'sweep' arms at that pace; null = off.

// ── Component ───────────────────────────────────────────────────────────────

export default function Last48() {
  const [searchParams, setSearchParams] = useSearchParams()

  const fill    = parseFill(searchParams.get('fill'), searchParams.get('mode'))
  const pointsOn = parsePoints(searchParams.get('points'))
  const datasets = useMemo(() => parseDatasets(searchParams.get('datasets')), [searchParams])

  // Sharable selected-event deep link. The URL is the source of truth for
  // "which event is open" so a copied link reopens the same event card on
  // another machine. `event` holds a NormalizedEvent.id (`datasetId:nativeId`).
  const selectedEventId = searchParams.get('event')

  const ambientPaceId = parsePaceId(searchParams.get('ambient'))
  const ambientOn = ambientPaceId !== null

  const setAmbientPace = useCallback((id: PaceId | null) => {
    setSearchParams((prev) => {
      const np = new URLSearchParams(prev)
      if (id) np.set('ambient', id)
      else np.delete('ambient')
      return np
    }, { replace: true })
  }, [setSearchParams])

  // The pace the pill re-arms with after an off/on cycle — survives the
  // URL param being cleared on exit so a chosen pace isn't forgotten.
  // A render-synced ref (not state): it only ever changes when
  // ambientPaceId changes, which is already a re-render.
  const preferredPaceRef = useRef<PaceId>(DEFAULT_PACE_ID)
  if (ambientPaceId) {
    // eslint-disable-next-line react-hooks/refs
    preferredPaceRef.current = ambientPaceId
  }
  // Render-time read is safe: the ref only changes when ambientPaceId
  // changes, which is itself a re-render (searchParams state).
  // eslint-disable-next-line react-hooks/refs
  const activePaceId = ambientPaceId ?? preferredPaceRef.current

  const setAmbientOn = useCallback(
    (next: boolean) => setAmbientPace(next ? preferredPaceRef.current : null),
    [setAmbientPace],
  )

  // Selecting a pace arms at that pace (when off) or switches live (when
  // on) — choosing from the menu IS intent to drift. The ref syncs on the
  // re-render the URL write triggers.
  const handlePaceSelect = useCallback(
    (id: PaceId) => setAmbientPace(id),
    [setAmbientPace],
  )

  // Dev-only live tuning (?tune=1): slider overrides merge over the active
  // preset; COPY in the panel exports the result for pace.ts.
  const tuneOn = searchParams.get('tune') === '1'
  const [tuneOverrides, setTuneOverrides] = useState<Partial<PaceValues>>({})
  const ambientPace = useMemo<PaceValues>(
    () => ({ ...PACE_PRESETS[activePaceId], ...tuneOverrides }),
    [activePaceId, tuneOverrides],
  )

  // Underlay variable is transient UI state — no reason to URL-persist it.
  // Defaults to median home value so the demographic underlay (on by default,
  // see parseFill) leads with home-value context.
  const [underlayVariable, setUnderlayVariable] = useState<CensusVariable | null>('medianHomeValue')

  const window48 = useLast48Window({ datasets })

  // DRIFT is armed only once every enabled stream has fully loaded or
  // terminally errored, and at least one ENABLED geo-bearing event exists —
  // ?ambient=1 must not fight the boot choreography (spec: arms AFTER the
  // stream curtain). The per-event check matters: window48.events keeps
  // already-fetched events for datasets whose chips were toggled off, so a
  // bare length check would leave the toggle armed over a tour with nothing
  // visible to visit.
  const ambientReady = useMemo(
    () =>
      window48.events.some(
        (e) => datasets.includes(e.datasetId) && e.longitude != null && e.latitude != null,
      ) &&
      LAST48_DATASETS.every(
        (id) =>
          !datasets.includes(id) ||
          window48.fullyLoadedByDataset[id] ||
          !!window48.errorByDataset[id],
      ),
    [datasets, window48.events, window48.fullyLoadedByDataset, window48.errorByDataset],
  )

  // Seed the cross-view summary store: when a stream finishes its FULL 48h
  // load, record its complete event count. The loading tips read these back on
  // the NEXT cold-load to show real per-stream volumes (a time-shifted cache —
  // see summaryStore). Only fully-loaded streams contribute; the store no-ops
  // when nothing changed, so this firing on every poll is cheap.
  const contributeLast48 = useSummaryStore((s) => s.contributeLast48)
  useEffect(() => {
    const counts: Partial<Record<DatasetId, number>> = {}
    for (const id of LAST48_DATASETS) {
      if (window48.fullyLoadedByDataset[id]) {
        counts[id] = window48.byDataset[id].length
      }
    }
    contributeLast48(counts)
  }, [window48.fullyLoadedByDataset, window48.byDataset, contributeLast48])

  // Sharable selected-neighborhood deep link (heartbeat surge items + the
  // anomaly rail both drive it). Mirrors the ?event= pattern.
  const selectedNeighborhoodId = searchParams.get('nh')

  const setSelectedNeighborhoodId = useCallback((nh: string | null) => {
    setSearchParams((prev) => {
      if ((prev.get('nh') ?? null) === nh) return prev
      const np = new URLSearchParams(prev)
      if (nh) np.set('nh', nh)
      else np.delete('nh')
      return np
    }, { replace: true })
  }, [setSearchParams])

  // Normalize a BARE ?nh= arrival (hand-typed or pre-Pulse-fix links) into the
  // full drill state. The param SET is the contract: the anomaly fill and the
  // neighborhood peek only mount under fill=anomaly + points=off, so an nh
  // arriving alone would be inert — the link promises evidence and delivers
  // the lobby. One-shot at mount: after arrival the user may toggle points or
  // fill away freely without this effect fighting them.
  const nhArrivalNormalized = useRef(false)
  useEffect(() => {
    if (nhArrivalNormalized.current) return
    nhArrivalNormalized.current = true
    // Closure values are the arrival values (this runs once, at mount). Skip
    // the setSearchParams call entirely when there's nothing to normalize —
    // react-router navigates even when the updater returns prev.
    if (!selectedNeighborhoodId || (fill === 'anomaly' && !pointsOn)) return
    setSearchParams((prev) => {
      if (!prev.get('nh')) return prev
      const np = new URLSearchParams(prev)
      np.set('fill', 'anomaly')
      np.set('points', 'off')
      np.delete('mode') // retire legacy param
      return np
    }, { replace: true })
  }, [selectedNeighborhoodId, fill, pointsOn, setSearchParams])

  // Reflect the open event into ?event= (replace, not push — selection isn't
  // a back-button waypoint). Guarded against redundant writes so the
  // UnifiedView's write-effect can fire freely without churning history.
  const setSelectedEventId = useCallback((id: string | null) => {
    setSearchParams((prev) => {
      if ((prev.get('event') ?? null) === id) return prev
      const np = new URLSearchParams(prev)
      if (id) np.set('event', id)
      else np.delete('event')
      return np
    }, { replace: true })
  }, [setSearchParams])

  // Heartbeat: anomalies (module-cached fetch, shared with the map view) +
  // the in-memory event window feed the detector registry.
  const { anomalies } = useAnomalyBaseline({ datasets, currentEvents: window48.events })
  const heartbeat = useLast48Heartbeat({ events: window48.events, anomalies, datasets })

  const handleHeartbeatClick = useCallback((item: TickerItem) => {
    const intent = item.intent
    if (!intent) return
    if (intent.type === 'event') {
      setSelectedEventId(intent.eventId)
    } else if (intent.type === 'neighborhood') {
      // Drill into the surge: enter HOTSPOTS (anomaly choropleth + points off)
      // and select the neighborhood, so BOTH the anomaly fill and the
      // neighborhood peek surface. The peek only mounts when fill=anomaly AND
      // points are off (Last48UnifiedView's railIsAnomaly), so set points=off
      // too. All in ONE update to avoid a setSearchParams race.
      setSearchParams((prev) => {
        const np = new URLSearchParams(prev)
        np.set('nh', intent.neighborhood)
        np.set('fill', 'anomaly')
        np.set('points', 'off')
        np.delete('mode') // retire legacy param
        return np
      }, { replace: true })
    }
  }, [setSelectedEventId, setSearchParams])

  const setFill = (next: BaseFill) => {
    const np = new URLSearchParams(searchParams)
    // 'demographic' is now the default (no param), so it's the value we omit
    // from the URL; every other choice (none / anomaly) is explicit. If we
    // omitted 'none' instead, turning the underlay off would delete the param
    // and snap right back to the demographic default.
    if (next === 'demographic') np.delete('fill')
    else np.set('fill', next)
    np.delete('mode')   // retire legacy param
    setSearchParams(np, { replace: true })
  }

  const setPointsOn = (next: boolean) => {
    const np = new URLSearchParams(searchParams)
    if (next) np.delete('points')
    else np.set('points', 'off')
    setSearchParams(np, { replace: true })
  }

  const setDatasets = (next: DatasetId[]) => {
    const np = new URLSearchParams(searchParams)
    const allDefault =
      LAST48_DATASETS.every((d) => next.includes(d)) &&
      next.length === LAST48_DATASETS.length
    if (allDefault) np.delete('datasets')
    else np.set('datasets', next.join(','))
    setSearchParams(np, { replace: true })
  }

  // Per-id toggle handler for DatasetSuperChips — adds the id if missing,
  // removes it if present. The pill is the whole click target.
  const toggleDataset = (id: DatasetId) => {
    setDatasets(
      datasets.includes(id)
        ? datasets.filter((d) => d !== id)
        : [...datasets, id]
    )
  }

  // ── Chip arrival sheen — two distinct states ──────────────────────────────
  // 'loading'   = fetching / queued behind earlier streams; quiet synchronized
  //               shimmer ("data on its way").
  // 'streaming' = THIS stream's chronological sweep is actively landing dots
  //               on the canvas; the pronounced beacon. The curtain
  //               serializes sweeps, so exactly one chip is streaming at a
  //               time — the chips perform the same 911 → Fire/EMS → 311
  //               baton pass as the map.
  // FlowMapLayer reports both transitions via onSweepPhase (including the
  // click-to-skip fast-forward). Reset whenever FLOW points toggle back on:
  // the layer remounts and replays the cascade, so the chips replay too.
  type SweepPhase = 'pending' | 'sweeping' | 'settled'
  const [sweepPhase, setSweepPhase] = useState<Record<DatasetId, SweepPhase>>(
    () => Object.fromEntries(LAST48_DATASETS.map((id) => [id, 'pending'])) as Record<DatasetId, SweepPhase>,
  )
  const handleSweepPhase = useCallback((id: DatasetId, phase: 'sweeping' | 'settled') => {
    setSweepPhase((prev) => {
      if (prev[id] === phase || prev[id] === 'settled') return prev
      return { ...prev, [id]: phase }
    })
  }, [])
  useEffect(() => {
    if (pointsOn) {
      setSweepPhase(
        Object.fromEntries(LAST48_DATASETS.map((id) => [id, 'pending'])) as Record<DatasetId, SweepPhase>,
      )
    }
  }, [pointsOn])

  // Per-chip arrival state. While FLOW is performing the cascade the chip
  // follows ITS stream's sweep phase — settling the moment its last dot
  // lands, not when the fetch returns (10-15s earlier). With points off
  // there is no sweep, so 'loading' until the data itself lands (never
  // 'streaming' — nothing is rendering). A terminal error anywhere stalls
  // the serialized sweep chain (later streams never get enabled), so any
  // error drops the healthy streams back to data-settled rather than
  // shimmering forever; the errored stream itself goes quiet (the failure
  // banner owns that story).
  const arrivalByDataset = useMemo(() => {
    const anyStreamError = LAST48_DATASETS.some(
      (id) => datasets.includes(id) && !!window48.errorByDataset[id],
    )
    const out = {} as Record<DatasetId, 'idle' | 'loading' | 'streaming'>
    for (const id of LAST48_DATASETS) {
      const enabled = datasets.includes(id)
      const errored = !!window48.errorByDataset[id]
      if (!enabled || errored) {
        out[id] = 'idle'
        continue
      }
      if (pointsOn && !anyStreamError) {
        const ph = sweepPhase[id]
        out[id] = ph === 'settled' ? 'idle' : ph === 'sweeping' ? 'streaming' : 'loading'
      } else {
        out[id] = window48.fullyLoadedByDataset[id] ? 'idle' : 'loading'
      }
    }
    return out
  }, [datasets, pointsOn, sweepPhase, window48.fullyLoadedByDataset, window48.errorByDataset])

  return (
    <div className="flex flex-col h-full">
      {/* Header — Phase 1's compact-blur chrome with the rule-leading LIVE
          eyebrow + italic display h1 + descriptive subtitle. The right
          cluster now hosts Phase 5's LayerControls (FLOW toggle + base-fill
          picker) in place of the retired ModeToggle, followed by ExportButton. */}
      <header className="flex-shrink-0 border-b border-paper-200/40 dark:border-espresso-700 px-[clamp(16px,3vw,64px)] py-3 bg-paper-50/50 dark:bg-espresso-950/50 backdrop-blur-xl z-20">
        {/* flex-wrap: on a phone the control cluster reflows below the masthead
            instead of overflowing the viewport (the cluster is wider than a
            375px phone on its own). */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <div className="font-mono text-[10px] tracking-widest text-paper-500 dark:text-paper-600">
                LIVE
              </div>
              {/* paper-100 (warm cream) vs sibling-standard text-white — intentional earth-tone purity */}
              <h1 className="font-display italic text-2xl text-ink dark:text-paper-100 leading-none whitespace-nowrap">
                The Last 48
              </h1>
              {/* Editorial subtitle — supplementary; the LIVE eyebrow + h1 carry
                  identity. Hidden below sm so it can't collapse to a one-word-per-line
                  column when the header is narrow (the only unprotected text line). */}
              <p className="hidden sm:block font-mono text-[10px] text-paper-500 dark:text-paper-600 mt-0.5">
                48 hours of civic data, updated continuously via official and public APIs
              </p>
            </div>
            {!window48.isLoading && window48.events.length > 0 && (
              <span className="inline-flex flex-shrink-0 items-center gap-1.5 text-[10px] font-mono text-moss-500/80 bg-moss-500/10 px-2 py-1 rounded-full whitespace-nowrap">
                <span className="w-1 h-1 rounded-full bg-moss-500 pulse-live" />
                {window48.events.length.toLocaleString()} events
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 flex-shrink-0">
            <LayerControls
              pointsOn={pointsOn}
              onPointsToggle={setPointsOn}
              fill={fill}
              onFillChange={setFill}
              underlayVariable={underlayVariable}
              onUnderlayChange={setUnderlayVariable}
            />
            <AmbientToggle
              on={ambientOn}
              disabled={!ambientReady}
              activePaceId={activePaceId}
              onToggle={setAmbientOn}
              onPaceSelect={handlePaceSelect}
            />
            <ExportButton targetSelector="#last48-capture" filename="last-48" />
          </div>
        </div>
      </header>

      {/* Cross-view ticker — signals from other datasets */}
      <div className="flex-shrink-0 border-b border-paper-200/40 dark:border-espresso-800 px-[clamp(16px,3vw,64px)] py-1 bg-paper-50/30 dark:bg-espresso-950/30 backdrop-blur-xl z-10">
        <CivicTicker
          items={heartbeat}
          size="compact"
          onItemClick={handleHeartbeatClick}
        />
      </div>

      {/* Super-chip row — unified per-dataset control:
          toggle + count + per-hour rate + 48h sparkline + twin freshness dots */}
      <div className="px-[clamp(16px,3vw,64px)] py-3 border-b border-paper-200/40 dark:border-espresso-700">
        <DatasetSuperChips
          enabled={datasets}
          onToggle={toggleDataset}
          byDataset={window48.byDataset}
          freshness={window48.freshness}
          initialLoadedByDataset={window48.initialLoadedByDataset}
          arrivalByDataset={arrivalByDataset}
        />
      </div>

      {/* Unified composable view */}
      <div id="last48-capture" className="flex-1 relative">
        <Last48UnifiedView
          window48={window48}
          datasets={datasets}
          pointsOn={pointsOn}
          fill={fill}
          underlayVariable={underlayVariable}
          selectedEventId={selectedEventId}
          onSelectedEventIdChange={setSelectedEventId}
          selectedNeighborhoodId={selectedNeighborhoodId}
          onSelectedNeighborhoodChange={setSelectedNeighborhoodId}
          onSweepPhase={handleSweepPhase}
          ambientOn={ambientOn}
          ambientReady={ambientReady}
          ambientPace={ambientPace}
          onAmbientExit={() => setAmbientOn(false)}
        />
        {/* Dev-only pace tuning (?tune=1) — finds preset values live;
            never discoverable in the UI. */}
        {tuneOn && (
          <AmbientTunePanel
            values={ambientPace}
            onChange={(patch) => setTuneOverrides((prev) => ({ ...prev, ...patch }))}
            onReset={() => setTuneOverrides({})}
          />
        )}
      </div>

      {/* Scanner launcher strip — desktop only; on mobile the bottom sheet would
          cover it, so the scanner links live in the rail's footer instead. */}
      <div className="hidden md:block">
        <ScannerStrip />
      </div>
    </div>
  )
}
