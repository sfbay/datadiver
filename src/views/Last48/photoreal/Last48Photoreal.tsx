// src/views/Last48/photoreal/Last48Photoreal.tsx
//
// The photoreal renderer for The Last 48 — a SIBLING of Last48UnifiedView,
// mounted lazily by Last48.tsx when the effective map engine is 'photoreal'.
// This file is the ONLY module allowed to import Cesium outside this
// directory's siblings; scripts/check-entry-bundle.mjs enforces that the
// entry chunk never references it.
//
// Owns: the Cesium viewer, the Google Photorealistic 3D tileset (+ key,
// + quota fallback), the credit bar, the theme grade, performance defaults.
// Delegates: markers (PhotorealMarkers), the tour (PhotorealConductor), the
// bubble (PhotorealBubble).
import { useEffect, useMemo, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import './photoreal.css'
import { useAppStore } from '@/stores/appStore'
import type { Last48WindowResult } from '@/hooks/useLast48Window'
import type { DatasetId, NormalizedEvent } from '@/types/last48'
import type { PaceValues } from '../ambient/pace'
import { GRADES, GRADE_CLOCK_ISO, GRADE_FRAGMENT_GLSL, gradeForTheme } from './grade'
import { PhotorealMarkers } from './PhotorealMarkers'
import PhotorealConductor from './PhotorealConductor'
import PhotorealBubble from './PhotorealBubble'
import PhotorealTunePanel from './PhotorealTunePanel'
import { quality, type Quality } from './quality'
import Last48EventCard from '../detail/Last48EventCard'

;(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = '/cesium/'


export interface Last48PhotorealProps {
  window48: Last48WindowResult
  datasets: DatasetId[]
  pointsOn: boolean
  selectedEventId: string | null
  onSelectedEventIdChange: (id: string | null) => void
  ambientOn: boolean
  ambientReady: boolean
  ambientPace: PaceValues
  onAmbientExit: () => void
  /** ?tod= override (day|dusk|night) — hidden dev/editor knob. */
  todOverride: string | null
  /** ?tune=1 — show the tile-load gauge. */
  tuneOn: boolean
}

/** Whether Photoreal can be offered at all — read by the picker via the
 *  page, never by importing this chunk (that would defeat the lazy split). */
export const GOOGLE_TILES_KEY: string = import.meta.env.VITE_GOOGLE_TILES_KEY || ''

/** Push the live quality knobs onto the viewer and (once it exists) the
 *  tileset. Called at mount, when the tileset lands, and from the ?tune=1
 *  sliders. Orbit tile detail is applied by the director at each phase
 *  change (it reads quality.sseOrbit), not here. */
export function applyQuality(v: Cesium.Viewer, ts: Cesium.Cesium3DTileset | null, q: Quality) {
  if (v.isDestroyed()) return
  v.targetFrameRate = q.fpsCap
  v.resolutionScale = q.resolution
  if (ts && !ts.isDestroyed()) {
    ts.foveatedScreenSpaceError = q.foveation > 0
    ts.foveatedMinimumScreenSpaceErrorRelaxation = q.foveation
    ts.dynamicScreenSpaceError = q.dynamicSse
  }
}

export default function Last48Photoreal(props: Last48PhotorealProps) {
  const isDarkMode = useAppStore((s) => s.isDarkMode)
  const hostRef = useRef<HTMLDivElement>(null)
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null)
  const [tileset, setTileset] = useState<Cesium.Cesium3DTileset | null>(null)
  const [markers, setMarkers] = useState<PhotorealMarkers | null>(null)
  const [tileLoads, setTileLoads] = useState(0)

  // ── Viewer + tileset lifecycle ─────────────────────────────────────────
  useEffect(() => {
    if (!hostRef.current) return
    const v = new Cesium.Viewer(hostRef.current, {
      animation: false, timeline: false, geocoder: false, homeButton: false, sceneModePicker: false,
      baseLayerPicker: false, navigationHelpButton: false, infoBox: false, selectionIndicator: false,
      baseLayer: false, requestRenderMode: false,
    })
    v.scene.globe.show = false
    if (v.scene.skyAtmosphere) v.scene.skyAtmosphere.show = true
    v.scene.fog.enabled = true
    v.scene.fog.density = 0.00025
    v.scene.postProcessStages.fxaa.enabled = true
    v.clock.shouldAnimate = false
    v.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(-122.42, 37.70, 7000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-40), roll: 0 },
    })
    applyQuality(v, null, quality)
    setViewer(v)
    const m = new PhotorealMarkers(v)
    setMarkers(m)

    let cancelled = false
    ;(async () => {
      try {
        const ts = await Cesium.createGooglePhotorealistic3DTileset(
          { key: GOOGLE_TILES_KEY },
          { maximumScreenSpaceError: 40, preloadFlightDestinations: true, skipLevelOfDetail: true },
        )
        if (cancelled) { ts.destroy(); return }
        // Quota/auth refusals surface here per tile; one is enough to rest.
        // tileFailed's payload is { url, message }; a quota/auth refusal
        // carries the HTTP status in the message text.
        ts.tileFailed.addEventListener((e: { url?: string; message?: string }) => {
          if (/\b(403|429)\b/.test(e?.message ?? '')) rest()
        })
        ts.tileLoad.addEventListener(() => setTileLoads((n) => n + 1))
        applyQuality(v, ts, quality)
        v.scene.primitives.add(ts)
        setTileset(ts)
      } catch (err) {
        console.error('[photoreal] tileset failed', err)
        rest()
      }
    })()

    function rest() {
      if (cancelled) return
      // Session-only: the STORE flips to classic so the page swaps renderers;
      // the persisted preference is left alone (Photoreal comes back tomorrow).
      // setMapEngine persists, so write the store field directly. The note
      // itself CANNOT live here — this same write unmounts this component
      // before it could paint — so it rides the store as photorealResting and
      // Last48.tsx renders it over the classic map.
      useAppStore.setState({ mapEngine: 'classic', photorealResting: true })
    }

    return () => {
      // `cancelled` must flip SYNCHRONOUSLY — the in-flight tileset promise
      // above reads it to decide whether to attach to a viewer that is going
      // away. The DESTROY, though, is deferred one microtask: React runs
      // passive-effect cleanups PARENT-first on a deleted subtree, so the
      // bubble's postRender listener and the director's cancelFlight/preRender
      // cleanups all run AFTER this one, and viewer.scene/camera are undefined
      // the instant destroy() returns. A microtask scheduled during the commit
      // pass runs after the whole pass, so the children unhook from a live
      // viewer first. (Belt two: each of those cleanups also gates on
      // viewer.isDestroyed().)
      cancelled = true
      queueMicrotask(() => { m.destroy(); v.destroy() })
    }
  }, [])

  // ── Theme grade + sun ─────────────────────────────────────────────────
  useEffect(() => {
    if (!tileset || !viewer) return
    const grade = gradeForTheme(isDarkMode, props.todOverride)
    const g = GRADES[grade]
    tileset.customShader = new Cesium.CustomShader({
      uniforms: {
        u_tint: { type: Cesium.UniformType.VEC3, value: new Cesium.Cartesian3(...g.tint) },
        u_mul: { type: Cesium.UniformType.FLOAT, value: g.mul },
        u_win: { type: Cesium.UniformType.FLOAT, value: g.win },
      },
      fragmentShaderText: GRADE_FRAGMENT_GLSL,
    })
    viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(GRADE_CLOCK_ISO[grade])
  }, [tileset, viewer, isDarkMode, props.todOverride])

  // ── Events visible to markers + tour ──────────────────────────────────
  const events: NormalizedEvent[] = useMemo(
    () => props.window48.events.filter(
      (e) => props.datasets.includes(e.datasetId) && e.longitude != null && e.latitude != null,
    ),
    [props.window48.events, props.datasets],
  )
  // The OPEN event is derived from the UNFILTERED window (still dataset-gated),
  // not from `events` above: a sensitive 911 call publishes no coordinates, and
  // deriving it from the coordinate-filtered list made ?event=<that call> a
  // silent no-op in photoreal. Markers, the conductor and the bubble stay
  // coordinate-guarded; the coordinate-less case renders the flat event card.
  //
  // Identity is STABILISED: useLast48Window re-creates every event object on
  // each poll (911 every 2 min), so an unchanged open event used to arrive as
  // a brand-new object — restarting the bubble's settle gate (a blink),
  // re-staggering its rows and resetting the hero's breathing. Return the
  // PREVIOUS object whenever the fields anything downstream reads are equal.
  const stableSelected = useRef<NormalizedEvent | null>(null)
  const selected = useMemo(() => {
    const next = props.selectedEventId
      ? props.window48.events.find(
          (e) => e.id === props.selectedEventId && props.datasets.includes(e.datasetId),
        ) ?? null
      : null
    const prev = stableSelected.current
    const unchanged =
      prev != null && next != null &&
      prev.id === next.id &&
      prev.longitude === next.longitude && prev.latitude === next.latitude &&
      prev.receivedAt === next.receivedAt && prev.state === next.state
    // Ref write inside the memo: the memo IS the identity cache, and it only
    // ever stores the value it is about to return, so a re-run with the same
    // inputs is a no-op (the house pattern used for preferredPaceRef).
    const out = unchanged ? prev : next
    stableSelected.current = out
    return out
  }, [props.window48.events, props.datasets, props.selectedEventId])
  const selectedHasCoords = selected?.longitude != null && selected?.latitude != null

  // The marker layer clamps its hero's band core by hand (polylines carry no
  // heightReference) and needs the tileset to sample the surface height.
  useEffect(() => { markers?.setTileset(tileset) }, [markers, tileset])
  useEffect(() => { markers?.setVisible(props.pointsOn) }, [markers, props.pointsOn])
  useEffect(() => { markers?.setEvents(events) }, [markers, events])
  useEffect(() => { markers?.setHero(selected) }, [markers, selected])

  return (
    <div className="relative w-full h-full">
      <div ref={hostRef} className="w-full h-full" data-photoreal-host />
      {props.tuneOn && viewer && (
        <PhotorealTunePanel viewer={viewer} tileset={tileset} tileLoads={tileLoads} onApply={applyQuality} />
      )}
      {viewer && tileset && markers && (
        <PhotorealConductor
          viewer={viewer}
          tileset={tileset}
          markers={markers}
          events={events}
          ambientOn={props.ambientOn}
          ready={props.ambientReady}
          pace={props.ambientPace}
          pointsOn={props.pointsOn}
          onExit={props.onAmbientExit}
          onVisit={(ev: NormalizedEvent) => props.onSelectedEventIdChange(ev.id)}
          onClearSelection={() => props.onSelectedEventIdChange(null)}
          selectedEvent={selected}
        />
      )}
      {viewer && (
        <PhotorealBubble viewer={viewer} tileset={tileset} event={selected} onClose={() => props.onSelectedEventIdChange(null)} />
      )}
      {/* A selected event with no published coordinates (a sensitive 911 call)
          has nothing to pin a bubble to — it gets the flat map's own top-right
          card, mounted exactly as Last48UnifiedView mounts it. */}
      {selected && !selectedHasCoords && (
        <Last48EventCard event={selected} onClose={() => props.onSelectedEventIdChange(null)} />
      )}
    </div>
  )
}
