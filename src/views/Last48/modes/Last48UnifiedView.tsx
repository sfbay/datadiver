// src/views/Last48/modes/Last48UnifiedView.tsx
//
// Unified map host for The Last 48 — replaces the binary FlowMode /
// HotspotsMode conditional render. Mounts a single persistent MapView
// via Last48Map and composes layers based on the `fill` and `pointsOn`
// props:
//
//   pointsOn   → FlowMapLayer (+ FlowSelectedRadar, FlowArrivalRipples)
//   fill=anomaly      → AnomalyFillLayer
//   fill=demographic  → DemographicFillLayer
//
// Rail slot follows pointsOn (FLOW rail when points are on; AnomalyRail
// when anomaly fill is active without points; no rail otherwise).
//
// Last48NeighborhoodPeek — the anomaly neighborhood click-target — mounts
// in the rail slot alongside AnomalyRail when a neighborhood is selected.

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type mapboxgl from 'mapbox-gl'
import { useAnomalyBaseline } from '@/hooks/useAnomalyBaseline'
import type { Last48WindowResult } from '@/hooks/useLast48Window'
import { LAST48_DATASETS, type DatasetId, type NormalizedEvent } from '@/types/last48'
import type { CensusVariable } from '@/types/census'
import type { BaseFill } from '../chrome/LayerControls'

import Last48Map from './Last48Map'
import AmbientConductor from '../ambient/AmbientConductor'
import type { PaceValues } from '../ambient/pace'
import { eventFlyToOffset } from '../cameraPadding'
import FlowMapLayer from './FlowMapLayer'
import FlowRail from './FlowRail'
import FlowSelectedRadar from './FlowSelectedRadar'
import FlowArrivalRipples from './FlowArrivalRipples'
import AnomalyFillLayer from './AnomalyFillLayer'
import DemographicFillLayer from './DemographicFillLayer'
import AnomalyRail from './AnomalyRail'
import Last48EventCard from '../detail/Last48EventCard'
import Last48NeighborhoodPeek from '../detail/Last48NeighborhoodPeek'
import UnderlayLegend from '@/components/maps/UnderlayLegend'
import StreamProgressBar from '../chrome/StreamProgressBar'
import BootEmanation from './BootEmanation'
import { useCensusData } from '@/hooks/useCensusData'

interface Props {
  window48: Last48WindowResult
  datasets: DatasetId[]
  pointsOn: boolean
  fill: BaseFill
  underlayVariable: CensusVariable | null
  /** Selected-event id from the URL (?event=). Source of truth for "which
   *  event card is open" so a shared link reopens the same event. */
  selectedEventId: string | null
  /** Push the open event's id back to the URL (or null to clear it). */
  onSelectedEventIdChange: (id: string | null) => void
  /** Selected neighborhood from ?nh= (heartbeat surge deep-link). */
  selectedNeighborhoodId: string | null
  /** Push the selected neighborhood back to ?nh= (or null to clear). */
  onSelectedNeighborhoodChange: (nh: string | null) => void
  /** Forwarded to FlowMapLayer — fires on each stream's sweep phase
   *  transition ('sweeping' when its dots start landing, 'settled' when
   *  done). Last48 uses it to drive the chip arrival sheen states. */
  onSweepPhase?: (id: DatasetId, phase: 'sweeping' | 'settled') => void
  /** ?ambient= — DRIFT armed (URL is the source of truth). */
  ambientOn: boolean
  /** Streams booted + events present — ramp-in gate. */
  ambientReady: boolean
  /** Resolved pace values (preset + any ?tune=1 overrides). */
  ambientPace: PaceValues
  /** Disarm (clears ?ambient=) — called when ramp-out completes or input exits. */
  onAmbientExit: () => void
}

export default function Last48UnifiedView({
  window48,
  datasets,
  pointsOn,
  fill,
  underlayVariable,
  selectedEventId,
  onSelectedEventIdChange,
  selectedNeighborhoodId,
  onSelectedNeighborhoodChange,
  onSweepPhase,
  ambientOn,
  ambientReady,
  ambientPace,
  onAmbientExit,
}: Props) {
  // ── FLOW state ─────────────────────────────────────────────────────────────
  const [selectedEvent, setSelectedEvent] = useState<NormalizedEvent | null>(null)
  const [ripples, setRipples] = useState<Array<{ id: string; lng: number; lat: number; bornAt: number }>>([])

  const visibleEvents = useMemo(
    () => window48.events.filter((e) => datasets.includes(e.datasetId)),
    [window48.events, datasets],
  )

  const handleMapSelect = useCallback((ev: NormalizedEvent) => {
    setSelectedEvent((prev) => (prev?.id === ev.id ? null : ev))
  }, [])

  const handleClose = useCallback(() => setSelectedEvent(null), [])

  // Page-level Esc to deselect event (coexists with DetailPanelShell's own handler).
  useEffect(() => {
    if (!selectedEvent) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedEvent(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedEvent])

  // ── URL sync (write) ───────────────────────────────────────────────────────
  // Mirror the local selection into ?event= so the open card is sharable.
  // Write-only here; the READ side (deep-link landing + fly-to) lives in
  // <DeepLinkLander> below, which needs the map instance. The id guard means
  // a user click (selection leads, URL follows) and a deep-link (URL leads,
  // selection follows) never ping-pong: once they agree, neither side fires.
  useEffect(() => {
    const id = selectedEvent?.id ?? null
    if (id !== selectedEventId) onSelectedEventIdChange(id)
  }, [selectedEvent, selectedEventId, onSelectedEventIdChange])

  // Clear ripples when FLOW is toggled off. Without this, in-flight ripple
  // ring components unmount mid-animation (their setTimeout for onDone gets
  // cancelled), leaving stale ripples in parent state. When FLOW toggles
  // back on, FlowArrivalRipples remounts and renders every accumulated
  // ripple at once — a visible ripple storm.
  useEffect(() => {
    if (!pointsOn) setRipples([])
  }, [pointsOn])

  // ── ANOMALY state ───────────────────────────────────────────────────────────
  const selectedNh = selectedNeighborhoodId
  const setSelectedNh = onSelectedNeighborhoodChange

  // Always compute anomalies — so the choropleth is ready immediately when the
  // user toggles fill=anomaly, without a cold-start wait.
  const { anomalies, isLoading: anomalyLoading } = useAnomalyBaseline({
    datasets,
    currentEvents: visibleEvents,
  })

  // Census data — fed to UnderlayLegend below when fill=demographic so the
  // legend pill ("MEDIAN HOME VALUE $X → $Y") renders the same as it does in
  // EmergencyResponse. DemographicFillLayer fetches its own copy internally;
  // this duplication is a known cost of keeping each component self-contained.
  const { neighborhoods: censusNeighborhoods } = useCensusData()

  const combinedAnomalies = useMemo(() => {
    const sums: Record<string, { total: number; n: number }> = {}
    for (const a of anomalies) {
      if (!sums[a.neighborhood]) sums[a.neighborhood] = { total: 0, n: 0 }
      sums[a.neighborhood].total += a.zScore
      sums[a.neighborhood].n += 1
    }
    const result: Record<string, number> = {}
    for (const [nh, s] of Object.entries(sums)) {
      result[nh] = s.n > 0 ? s.total / s.n : 0
    }
    return result
  }, [anomalies])

  // ── Ripple handler — called by FlowMapLayer when significant events arrive ──
  const handleNewRipples = useCallback(
    (incoming: Array<{ id: string; lng: number; lat: number; bornAt: number }>) => {
      if (incoming.length === 0) return
      setRipples((prev) => [...prev, ...incoming])
    },
    [],
  )

  const handleRippleDone = useCallback((id: string) => {
    setRipples((prev) => prev.filter((r) => r.id !== id))
  }, [])

  // ── Rail resolution ─────────────────────────────────────────────────────────
  // FlowRail is the default — the events list is the editorial canvas of
  // Last 48 and stays useful even when FLOW dots are off (browsing the
  // stream still works, clicking still flies the map). AnomalyRail only
  // takes over when the user has explicitly entered anomaly-without-points
  // mode (fill=anomaly AND !pointsOn) — the narrow case where the
  // editorial focus shifts from event-stream to neighborhood-anomaly.

  const railIsAnomaly = fill === 'anomaly' && !pointsOn

  // ── Loading state for BootEmanation ─────────────────────────────────────
  // True while any enabled stream has not yet SETTLED — settled = fully loaded
  // OR terminally errored. Counting errored streams as settled is what stops
  // the radar from spinning forever when a stream fails to load (the failure
  // banner below surfaces the error + a retry). Disabled streams don't gate.
  const isLoadingAny = useMemo(
    () =>
      LAST48_DATASETS.some(
        (id) =>
          datasets.includes(id) &&
          !window48.fullyLoadedByDataset[id] &&
          !window48.errorByDataset[id],
      ),
    [datasets, window48.fullyLoadedByDataset, window48.errorByDataset],
  )

  // Streams that failed to load (terminal error) — drives the failure banner.
  const failedDatasets = useMemo(
    () => datasets.filter((id) => window48.errorByDataset[id]),
    [datasets, window48.errorByDataset],
  )

  return (
    <Last48Map
      rail={(map) => {
        if (railIsAnomaly) {
          return (
            <>
              <AnomalyRail
                combinedAnomalies={combinedAnomalies}
                selectedNeighborhood={selectedNh ?? undefined}
                onSelect={setSelectedNh}
              />
              {/* Neighborhood detail peek — positioned absolute against Last48Map's
                  outer flex container. AnomalyRail must NOT be position:relative. */}
              {selectedNh && (
                <Last48NeighborhoodPeek
                  neighborhood={selectedNh}
                  anomalies={anomalies.filter((a) => a.neighborhood === selectedNh)}
                  events={window48.events.filter(
                    (e) => e.neighborhood === selectedNh && datasets.includes(e.datasetId),
                  )}
                  onClose={() => setSelectedNh(null)}
                />
              )}
            </>
          )
        }

        return (
          <FlowRail
            events={visibleEvents}
            selectedId={selectedEvent?.id}
            onSelect={(ev) => {
              if (selectedEvent?.id === ev.id) {
                setSelectedEvent(null)
                return
              }
              setSelectedEvent(ev)
              if (map && ev.longitude != null && ev.latitude != null) {
                // offset: land the dot in the visible-map center, clear of
                // the detail card's right-side band (see cameraPadding.ts).
                map.flyTo({ center: [ev.longitude, ev.latitude], zoom: 14, duration: 600, offset: eventFlyToOffset(map) })
              }
            }}
          />
        )
      }}
      mapOverlay={(map) => (
        <>
          {/* ── Boot emanation — loops while any stream is loading, fades
              cleanly once all three streams have arrived. ─────────────── */}
          <BootEmanation looping={isLoadingAny} />

          {/* ── Stream progress bar — slim top band, fades when complete ─── */}
          <StreamProgressBar
            initialLoadedByDataset={window48.initialLoadedByDataset}
            enabled={datasets}
          />

          {/* ── Failure banner — appears only when a stream terminally errors
              (radar has already settled). Names the failed streams and offers
              a retry, instead of an indefinite spin with no explanation. ── */}
          {failedDatasets.length > 0 && (
            <Last48FailureBanner
              datasetIds={failedDatasets}
              onRetry={() => failedDatasets.forEach((id) => window48.retryDataset(id))}
            />
          )}

          {/* ── Base fill layers (mount FIRST so FLOW dots render on top) ── */}
          {fill === 'anomaly' && (
            <AnomalyFillLayer
              map={map}
              combinedAnomalies={combinedAnomalies}
              selectedNeighborhood={selectedNh ?? undefined}
              onNeighborhoodClick={setSelectedNh}
            />
          )}

          {fill === 'demographic' && (
            <>
              <DemographicFillLayer
                map={map}
                variable={underlayVariable}
              />
              {/* Legend pill ("MEDIAN HOME VALUE $X → $Y") — matches the
                  visual register used in EmergencyResponse's underlay so
                  reviewers see the same data legend across views. */}
              <UnderlayLegend
                variable={underlayVariable}
                data={censusNeighborhoods}
              />
            </>
          )}

          {/* ── Deep-link lander ──────────────────────────────────────────
              Consumes ?event=<id> on load: once the target event has arrived
              in the 48h window (it may not exist yet mid-cold-load), selects
              it and flies the map there — exactly once. Distinguishes a
              deep-link (URL id ≠ current selection) from a map-click (selection
              already matches), so map-clicks never trigger an auto-fly. */}
          <DeepLinkLander
            map={map}
            eventId={selectedEventId}
            selectedId={selectedEvent?.id ?? null}
            events={visibleEvents}
            onLand={setSelectedEvent}
            ambientOn={ambientOn}
          />

          {/* ── Ambient conductor — DRIFT phase machine + camera (renders null) ── */}
          <AmbientConductor
            map={map}
            ambientOn={ambientOn}
            pace={ambientPace}
            ready={ambientReady}
            onExit={onAmbientExit}
            events={visibleEvents}
            pointsOn={pointsOn}
            onVisit={(ev) => setSelectedEvent(ev)}
            onClearSelection={() => setSelectedEvent(null)}
          />

          {/* ── FLOW dots (mount LAST — must render on top of fill layers) ── */}
          {pointsOn && (
            <FlowMapLayer
              map={map}
              events={visibleEvents}
              selectedId={selectedEvent?.id}
              onSelect={handleMapSelect}
              onNewRipples={handleNewRipples}
              fullyLoadedByDataset={window48.fullyLoadedByDataset}
              onSweepPhase={onSweepPhase}
            />
          )}

          {/* ── Loading pills ─────────────────────────────────────────── */}
          {/* isLoading gate REMOVED — events paint per-stream as they arrive.
              The StreamProgressBar (Task 6.3) replaces this inline pill. */}
          {fill === 'anomaly' && anomalyLoading && (
            <div className="absolute top-10 left-3 font-mono text-[10px] text-paper-500 bg-espresso-900/70 px-2 py-1 rounded">
              computing 12-week baseline…
            </div>
          )}

          {/* ── Selected-event ring + detail card ────────────────────── */}
          {pointsOn && (
            <>
              <FlowSelectedRadar map={map} event={selectedEvent} />
              <Last48EventCard event={selectedEvent} onClose={handleClose} />
            </>
          )}

          {/* ── Arrival ripples ──────────────────────────────────────── */}
          {pointsOn && (
            <FlowArrivalRipples map={map} ripples={ripples} onDone={handleRippleDone} />
          )}
        </>
      )}
    />
  )
}

// ── Deep-link lander ───────────────────────────────────────────────────────
// Renders nothing; its job is the side effect. When ?event=<id> points at an
// event we don't yet have selected, wait for that event to arrive in the 48h
// window (it may be absent for the first 30-60s of a cold-load), then select
// it and fly the map there — once. The `eventId !== selectedId` guard is what
// keeps this from re-firing on ordinary map-clicks (where selection already
// matches the URL): only a genuine deep-link has the URL leading the selection.
function DeepLinkLander({
  map,
  eventId,
  selectedId,
  events,
  onLand,
  ambientOn,
}: {
  map: mapboxgl.Map | null
  eventId: string | null
  selectedId: string | null
  events: NormalizedEvent[]
  onLand: (ev: NormalizedEvent) => void
  /** Drift owns selection + camera while armed; its per-visit ?event= writes
   *  are output, NOT deep-links to chase. Suppress the lander then — otherwise
   *  the URL lags one render behind drift's state, the eventId≠selectedId guard
   *  momentarily passes, and the lander fires a second flyTo that fights the
   *  director (the "lands offset → drifts to center → jumps" bug). */
  ambientOn: boolean
}) {
  // Tracks the id we've already landed, so a transient events-array identity
  // change between onLand and the selection state commit can't double-fire.
  const landedRef = useRef<string | null>(null)

  useEffect(() => {
    // While drift is armed it is the sole camera + selection driver; ignore the
    // ?event= it writes each visit (see prop doc above).
    if (ambientOn) return
    if (!eventId) {
      landedRef.current = null // link cleared — allow a future deep-link to land
      return
    }
    if (eventId === selectedId) return // already selected (user click or post-land)
    if (landedRef.current === eventId) return // already consumed this id
    const found = events.find((e) => e.id === eventId)
    if (!found) return // not in the window yet (still loading, or aged out)

    landedRef.current = eventId
    onLand(found)
    if (map && found.longitude != null && found.latitude != null) {
      map.flyTo({ center: [found.longitude, found.latitude], zoom: 14, duration: 600, offset: eventFlyToOffset(map) })
    }
  }, [map, eventId, selectedId, events, onLand, ambientOn])

  return null
}

// ── Failure banner ──────────────────────────────────────────────────────────
// Bottom-center glass card naming the stream(s) that failed to load, with a
// single Retry. Shown only after a terminal error (radar already settled), so
// a failed cold-load reads as an explained, recoverable state — not a frozen
// scanner. pointer-events-auto so the Retry button is clickable through the
// otherwise pass-through overlay plane.
const DATASET_LABELS: Record<DatasetId, string> = {
  '911-realtime': '911',
  'fire-ems-dispatch': 'Fire/EMS',
  '311-cases': '311',
}

function Last48FailureBanner({
  datasetIds,
  onRetry,
}: {
  datasetIds: DatasetId[]
  onRetry: () => void
}) {
  const names = datasetIds.map((id) => DATASET_LABELS[id]).join(' and ')
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-6">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl bg-espresso-900/90 dark:bg-espresso-900/90 px-4 py-2.5 ring-1 ring-brick-500/40 shadow-xl shadow-espresso-950/30 backdrop-blur-sm">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-brick-500" aria-hidden />
        <span className="font-mono text-[11px] text-paper-200">
          Couldn’t load {names}
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="font-mono text-[11px] tracking-wider text-ochre-400 hover:text-ochre-300 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ochre-500 rounded px-1"
        >
          Retry →
        </button>
      </div>
    </div>
  )
}
