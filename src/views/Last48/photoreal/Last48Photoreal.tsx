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

;(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = '/cesium/'

export const RESOLUTION_SCALE = 0.65

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

export default function Last48Photoreal(props: Last48PhotorealProps) {
  const isDarkMode = useAppStore((s) => s.isDarkMode)
  const hostRef = useRef<HTMLDivElement>(null)
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null)
  const [tileset, setTileset] = useState<Cesium.Cesium3DTileset | null>(null)
  const [markers, setMarkers] = useState<PhotorealMarkers | null>(null)
  const [resting, setResting] = useState(false)
  const [tileLoads, setTileLoads] = useState(0)

  // ── Viewer + tileset lifecycle ─────────────────────────────────────────
  useEffect(() => {
    if (!hostRef.current) return
    const v = new Cesium.Viewer(hostRef.current, {
      animation: false, timeline: false, geocoder: false, homeButton: false, sceneModePicker: false,
      baseLayerPicker: false, navigationHelpButton: false, infoBox: false, selectionIndicator: false,
      baseLayer: false, requestRenderMode: false,
    })
    v.resolutionScale = RESOLUTION_SCALE
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
        v.scene.primitives.add(ts)
        setTileset(ts)
      } catch (err) {
        console.error('[photoreal] tileset failed', err)
        rest()
      }
    })()

    function rest() {
      if (cancelled) return
      setResting(true)
      // Session-only: the STORE flips to classic so the page swaps renderers;
      // the persisted preference is left alone (Photoreal comes back tomorrow).
      // setMapEngine persists, so write the store field directly.
      useAppStore.setState({ mapEngine: 'classic' })
    }

    return () => {
      cancelled = true
      m.destroy()
      v.destroy()
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
  const selected = useMemo(
    () => (props.selectedEventId ? events.find((e) => e.id === props.selectedEventId) ?? null : null),
    [events, props.selectedEventId],
  )

  useEffect(() => { markers?.setVisible(props.pointsOn) }, [markers, props.pointsOn])
  useEffect(() => { markers?.setEvents(events) }, [markers, events])
  useEffect(() => { markers?.setHero(selected) }, [markers, selected])

  return (
    <div className="relative w-full h-full">
      <div ref={hostRef} className="w-full h-full" data-photoreal-host />
      {resting && (
        <p className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-paper-50/90 dark:bg-espresso-900/90 px-3 py-1 text-label font-mono text-paper-700 dark:text-paper-300">
          Photoreal is resting for today — showing the classic map.
        </p>
      )}
      {props.tuneOn && (
        <div className="absolute right-4 top-4 rounded-md bg-espresso-900/80 px-2 py-1 text-micro font-mono text-paper-200">
          tiles loaded {tileLoads}
        </div>
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
    </div>
  )
}
