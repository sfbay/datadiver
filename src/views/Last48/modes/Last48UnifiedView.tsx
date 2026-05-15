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

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useAnomalyBaseline } from '@/hooks/useAnomalyBaseline'
import type { Last48WindowResult } from '@/hooks/useLast48Window'
import type { DatasetId, NormalizedEvent } from '@/types/last48'
import type { CensusVariable } from '@/types/census'
import type { BaseFill } from '../chrome/LayerControls'

import Last48Map from './Last48Map'
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
import { useCensusData } from '@/hooks/useCensusData'

interface Props {
  window48: Last48WindowResult
  datasets: DatasetId[]
  pointsOn: boolean
  fill: BaseFill
  underlayVariable: CensusVariable | null
}

export default function Last48UnifiedView({
  window48,
  datasets,
  pointsOn,
  fill,
  underlayVariable,
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

  // Clear ripples when FLOW is toggled off. Without this, in-flight ripple
  // ring components unmount mid-animation (their setTimeout for onDone gets
  // cancelled), leaving stale ripples in parent state. When FLOW toggles
  // back on, FlowArrivalRipples remounts and renders every accumulated
  // ripple at once — a visible ripple storm.
  useEffect(() => {
    if (!pointsOn) setRipples([])
  }, [pointsOn])

  // ── ANOMALY state ───────────────────────────────────────────────────────────
  const [selectedNh, setSelectedNh] = useState<string | null>(null)

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
                map.flyTo({ center: [ev.longitude, ev.latitude], zoom: 14, duration: 600 })
              }
            }}
          />
        )
      }}
      mapOverlay={(map) => (
        <>
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

          {/* ── FLOW dots (mount LAST — must render on top of fill layers) ── */}
          {pointsOn && (
            <FlowMapLayer
              map={map}
              events={visibleEvents}
              selectedId={selectedEvent?.id}
              onSelect={handleMapSelect}
              onNewRipples={handleNewRipples}
            />
          )}

          {/* ── Loading pills ─────────────────────────────────────────── */}
          {window48.isLoading && (
            <div className="absolute top-3 left-3 font-mono text-[10px] text-paper-500 bg-espresso-900/70 px-2 py-1 rounded">
              loading 48h window…
            </div>
          )}
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
