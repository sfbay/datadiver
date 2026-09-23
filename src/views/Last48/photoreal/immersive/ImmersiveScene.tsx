// src/views/Last48/photoreal/immersive/ImmersiveScene.tsx
//
// The Cesium side of /live/immersive (Spec A2 §3–§5). Owns the viewer, the
// Google tileset, the dusk grade, the hero + the two queue discs, the screen
// -pinned <Beacon> over the hero, the ground-click handler, the dream
// director, the reader's camera floor, the render-on-demand "breath", the
// camera TELEMETRY the top strip reads, and the tune panel. Draws no
// marker field, no bubble and no stem — the card lives in the band.
// Same lifecycle rules as Last48Photoreal: viewer.destroy() deferred one
// microtask (children clean up parent-first), isDestroyed() on every touch.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as Cesium from 'cesium'
import '../photoreal.css'
import type { NormalizedEvent } from '@/types/last48'
import type { PaceValues } from '../../ambient/pace'
import { createViewer, loadGoogleTileset, applyGrade, applyQuality } from '../viewerHost'
import { quality, resetQuality, QUALITY_IMMERSIVE } from '../quality'
import { PhotorealMarkers } from '../PhotorealMarkers'
import PhotorealTunePanel from '../PhotorealTunePanel'
import { DATASET_META } from '../../detail/eventCardModel'
import Beacon from './Beacon'
import { useDreamDirector } from './useDreamDirector'
import { useCameraFloor } from './useCameraFloor'
import type { PhotorealTarget } from '../useCesiumDirector'
import { sameDetour, type DetourTarget } from './detour'
import type { HerePoint } from './useHereCard'

/** Spec A2 §3: MSAA on. 4 is Cesium's default; stated, not assumed. */
export const IMMERSIVE_MSAA = 4
/** The hero breathes in colour only; in render-on-demand mode someone has to
 *  ask for the frames. 50 ms = the spec's "at most 20×/s". */
const BREATH_MS = 50
/** How often the camera is SAMPLED for the telemetry strip. Four times a
 *  second is fast enough to read as live and slow enough to stay off the
 *  frame budget — the alternative, a postRender listener, would re-render
 *  the page at the frame rate. */
const TELEMETRY_MS = 250

/** A press that travels further than this is a DRAG, not a click. Cesium's
 *  own LEFT_CLICK tolerance is generous enough that a slow orbit ends in a
 *  click — which would have re-aimed the tour under the reader's hand. */
const DRAG_PX = 6

/** One sample of what the camera is doing. `groundLat`/`groundLng` are the
 *  point directly under the camera — the strip's fallback for "where are we"
 *  before the first stop lands. */
export interface Telemetry {
  headingDeg: number
  tiltDeg: number
  altitudeM: number
  tilesLoaded: boolean
  groundLat: number
  groundLng: number
}

interface Props {
  active: NormalizedEvent | null
  next: NormalizedEvent | null
  queue: NormalizedEvent[]
  pace: PaceValues
  hold: boolean
  reducedMotion: boolean
  /** ?range= dev knob; undefined = RANGE_M.immersive. */
  rangeM?: number
  /** Round B: a preset destination. Replaces the active stop as the camera's
   *  target while set. */
  detour: DetourTarget | null
  todOverride: string | null
  tuneOn: boolean
  /** The screen-pinned mark over the active stop (rail: View · Beacon). */
  beaconOn: boolean
  /** Sample only while the strip that reads it is on screen. */
  telemetryOn: boolean
  onTelemetry: (t: Telemetry) => void
  onArrived: (dwellMs: number) => void
  onPick: (id: string) => void
  /** A click on the GROUND (no marker under the pointer): the page snaps to
   *  the nearest stop. Round A's minimal click; Round B adds the "here" card. */
  onMapClick: (lng: number, lat: number) => void
  /** Pointer/wheel on the canvas: the page pauses play; the director yields. */
  onUserInput: () => void
  /** Google quota/auth refusal — the page leaves to /live (the resting note). */
  onRest: () => void
  hostRef: RefObject<HTMLDivElement | null>
  /** Round B §3: the here card's point — a small paper ring marks it. */
  probe: HerePoint | null
}

const toTarget = (e: NormalizedEvent | null): PhotorealTarget =>
  e && e.longitude != null && e.latitude != null ? { lng: e.longitude, lat: e.latitude } : null

export default function ImmersiveScene(props: Props) {
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null)
  const [tileset, setTileset] = useState<Cesium.Cesium3DTileset | null>(null)
  const [markers, setMarkers] = useState<PhotorealMarkers | null>(null)
  const [tileLoads, setTileLoads] = useState(0)
  const cb = useRef(props)
  // eslint-disable-next-line react-hooks/refs
  cb.current = props

  // ── Viewer + tileset ──────────────────────────────────────────────────
  useEffect(() => {
    const host = props.hostRef.current
    if (!host) return
    const v = createViewer(host, { requestRenderMode: true, msaaSamples: IMMERSIVE_MSAA })
    // This renderer's defaults, every mount — the live object is module-level
    // and Spec A's scene loads ITS defaults into the same object.
    resetQuality(QUALITY_IMMERSIVE)
    applyQuality(v, null, quality)
    setViewer(v)
    const m = new PhotorealMarkers(v)
    setMarkers(m)
    let cancelled = false
    void loadGoogleTileset(v, () => cancelled, {
      onRest: () => { if (!cancelled) cb.current.onRest() },
      // The counter feeds the tune panel and nothing else, so only count when
      // the panel is open — otherwise every streamed tile re-rendered the
      // scene (hundreds of renders per flight, for a number nobody reads).
      onTileLoad: () => { if (cb.current.tuneOn) setTileLoads((n) => n + 1) },
    }).then((ts) => {
      if (!ts) return
      applyQuality(v, ts, quality)
      setTileset(ts)
    })
    return () => {
      // Same two-belt teardown as Last48Photoreal: flip `cancelled` now, defer
      // the destroy one microtask so the director's cleanup sees a live viewer.
      cancelled = true
      queueMicrotask(() => { m.destroy(); v.destroy() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Always dusk (Spec A2 §5); ?tod= still overrides ────────────────────
  useEffect(() => {
    if (viewer && tileset) applyGrade(viewer, tileset, true, props.todOverride)
  }, [viewer, tileset, props.todOverride])

  // ── Hero + queue discs; click = pick ──────────────────────────────────
  // Each ends with a render request: in render-on-demand mode a queue-only
  // change (or a hero swap while nothing is breathing) would otherwise sit
  // unpainted until the next breath tick or camera move.
  useEffect(() => {
    if (!markers) return
    // Disc-only: no column of light on this page (Jesse, 2026-09-13).
    markers.setHero(props.active, 'disc')
    if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender()
  }, [markers, viewer, props.active])
  useEffect(() => {
    if (!markers) return
    markers.setQueue(props.queue)
    if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender()
  }, [markers, viewer, props.queue])
  useEffect(() => {
    if (!markers) return
    markers.onPick = (id) => cb.current.onPick(id)
    return () => { markers.onPick = undefined }
  }, [markers])

  // ── Click the GROUND → the nearest stop ───────────────────────────────
  // A second LEFT_CLICK handler beside PhotorealMarkers' own: that one owns
  // the entity hits (it reads `eventId` off the picked primitive), this one
  // owns the misses. Both are attached to the same canvas and both see every
  // click, so the miss test here is exactly the hit test there, inverted.
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return
    const scene = viewer.scene
    const canvas = scene.canvas
    // Cesium reports a drag that ends where it started as a click, and an
    // orbit often does. Measure the travel ourselves.
    let downAt: { x: number; y: number } | null = null
    let dragged = false
    const onDown = (e: PointerEvent) => { downAt = { x: e.clientX, y: e.clientY }; dragged = false }
    const onMove = (e: PointerEvent) => {
      if (!downAt || dragged) return
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > DRAG_PX) dragged = true
    }
    const onUp = () => { downAt = null }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)

    const handler = new Cesium.ScreenSpaceEventHandler(canvas)
    handler.setInputAction((m: { position: Cesium.Cartesian2 }) => {
      if (dragged) return
      // An entity under the pointer belongs to the marker layer.
      if (scene.pick(m.position)?.id) return
      // The depth buffer (the tile surface itself) goes FIRST now: Round B §3
      // prints a street and a neighborhood from this point, and pickEllipsoid
      // alone puts it at SEA LEVEL — at a grazing pitch the ellipsoid-vs-
      // rooftop gap projects to well over 300 m of horizontal error, enough
      // to print the wrong street. pickPosition throws on hardware with no
      // depth texture, so the ellipsoid pick (the globe is hidden but still
      // picks) is the fallback there — same ladder as
      // PhotorealMarkers.probeFocus, just reordered for this handler.
      let hit: Cesium.Cartesian3 | undefined
      try { hit = scene.pickPosition(m.position) } catch { hit = undefined }
      if (!hit) hit = viewer.camera.pickEllipsoid(m.position, scene.globe.ellipsoid)
      if (!hit) return
      const c = Cesium.Cartographic.fromCartesian(hit)
      if (!c) return
      cb.current.onMapClick(Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude))
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      handler.destroy()
    }
  }, [viewer])

  // ── The reader's camera floor + pitch clamp ───────────────────────────
  // Collision detection is off in viewerHost (it re-pitched the camera
  // mid-drag); this is what keeps a hand-flown camera above the tiles and
  // out of the horizon. Stands down during director flights.
  useCameraFloor({ viewer, tileset })

  // ── Telemetry for the top strip ───────────────────────────────────────
  // Polled, not per-frame, and only emitted when a displayed figure actually
  // changes: every emit is a page render, and the page renders the band and
  // the rail. A parked camera therefore costs nothing at all.
  useEffect(() => {
    if (!viewer || !props.telemetryOn) return
    let last = ''
    const sample = () => {
      if (viewer.isDestroyed()) return
      const scene = viewer.scene
      const cam = scene.camera
      const c = cam.positionCartographic
      if (!c) return
      const headingDeg = ((Math.round(Cesium.Math.toDegrees(cam.heading)) % 360) + 360) % 360
      const tiltDeg = Math.round(-Cesium.Math.toDegrees(cam.pitch))
      // Height above the TILES, not above the ellipsoid: over downtown the
      // two differ by the height of the building under you, and the second
      // number is the one a reader can feel. No tile loaded yet ⇒ no
      // correction, which is the same fallback the camera floor makes.
      let surface: number | undefined
      try { surface = tileset?.getHeight(c, scene) } catch { surface = undefined }
      // Mid-flight, coarse tiles can report a "surface" ABOVE the camera
      // (measured 2026-09-23: "Altitude −928 m" over SoMa). A camera cannot
      // be under the tile it is looking down at, so such a reading is
      // treated like no reading at all.
      if (surface != null && surface >= c.height) surface = undefined
      const altitudeM = Math.round(c.height - (surface ?? 0))
      const tilesLoaded = tileset ? tileset.tilesLoaded : false
      const groundLat = Cesium.Math.toDegrees(c.latitude)
      const groundLng = Cesium.Math.toDegrees(c.longitude)
      const key = `${headingDeg}|${tiltDeg}|${altitudeM}|${tilesLoaded}|${groundLat.toFixed(4)}|${groundLng.toFixed(4)}`
      if (key === last) return
      last = key
      cb.current.onTelemetry({ headingDeg, tiltDeg, altitudeM, tilesLoaded, groundLat, groundLng })
    }
    sample()
    const id = setInterval(sample, TELEMETRY_MS)
    return () => clearInterval(id)
  }, [viewer, tileset, props.telemetryOn])

  // ── Breath: request frames for the colour animation, tab visible only ──
  useEffect(() => {
    if (!viewer || !props.active) return
    const id = setInterval(() => { if (!document.hidden && !viewer.isDestroyed()) viewer.scene.requestRender() }, BREATH_MS)
    return () => clearInterval(id)
  }, [viewer, props.active])

  // ── The band toggling changes the host size: ask for a frame ──────────
  useEffect(() => {
    const host = props.hostRef.current
    if (!viewer || !host) return
    const ro = new ResizeObserver(() => { if (!viewer.isDestroyed()) viewer.scene.requestRender() })
    ro.observe(host)
    return () => ro.disconnect()
  }, [viewer, props.hostRef])

  return (
    <>
      {viewer && tileset && (
        <Director
          viewer={viewer} tileset={tileset}
          active={props.active} next={props.next}
          pace={props.pace} hold={props.hold} reducedMotion={props.reducedMotion} rangeM={props.rangeM}
          detour={props.detour}
          onArrived={props.onArrived} onUserInput={props.onUserInput}
        />
      )}
      {/* The beacon rides the host div (a sibling of the tune panel), not the
          Cesium scene — it is screen space by design. The ground disc stays:
          the two split the job, anchoring below and visibility above. */}
      {/* Not during a detour: the camera is at a Place / neighborhood /
          address, not the stop, and a pin on a stop you are not looking at
          read as "the current event is here" (Jesse, 2026-09-23). */}
      {viewer && props.active && props.active.longitude != null && props.active.latitude != null && props.beaconOn && !props.detour && (
        <Beacon
          viewer={viewer} tileset={tileset}
          lng={props.active.longitude} lat={props.active.latitude}
          color={DATASET_META[props.active.datasetId].color}
        />
      )}
      {/* Deliberately ignores props.beaconOn (the rail's Beacon toggle): that
          switch is about the HERO mark following the tour, while the probe
          answers one explicit click and should mark it regardless. */}
      {viewer && props.probe && (
        <Beacon viewer={viewer} tileset={tileset} lng={props.probe.lng} lat={props.probe.lat} color="#f5ecd9" variant="probe" />
      )}
      {props.tuneOn && viewer && (
        <PhotorealTunePanel viewer={viewer} tileset={tileset} tileLoads={tileLoads} onApply={applyQuality} side="left" />
      )}
    </>
  )
}

/** The director is a hook. This null-rendering MODULE-LEVEL child gives it a
 *  mount point that exists only once the tileset does (declaring it inside
 *  ImmersiveScene would make React remount it — and restart the flight — on
 *  every parent render). The canvas input handler lives here so it can reach
 *  the hook's cancel(). */
function Director(p: {
  viewer: Cesium.Viewer
  tileset: Cesium.Cesium3DTileset
  active: NormalizedEvent | null
  next: NormalizedEvent | null
  pace: PaceValues
  hold: boolean
  reducedMotion: boolean
  rangeM?: number
  detour: DetourTarget | null
  onArrived: (dwellMs: number) => void
  onUserInput: () => void
}) {
  const cb = useRef(p)
  // eslint-disable-next-line react-hooks/refs
  cb.current = p
  // The hook's leg effect depends on `target` by identity — memoise so a
  // parent render with the same event does not re-fly. Keyed on the PRIMITIVE
  // fields, not the event object: the page stabilises event identity by value,
  // and this is the belt to that braces (a fresh object with the same id and
  // coordinates must never restart an 18 s flight).
  const aId = p.active?.id, aLng = p.active?.longitude, aLat = p.active?.latitude
  const nId = p.next?.id, nLng = p.next?.longitude, nLat = p.next?.latitude
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const target = useMemo(() => toTarget(p.active), [aId, aLng, aLat])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const next = useMemo(() => toTarget(p.next), [nId, nLng, nLat])
  // Same belt-and-braces as `target`/`next`: memoise the detour BY VALUE so a
  // parent render carrying an equal-but-fresh DetourTarget never re-flies.
  const detourRef = useRef<DetourTarget | null>(null)
  const detour = useMemo(() => {
    const cur = sameDetour(detourRef.current, p.detour) ? detourRef.current : p.detour
    detourRef.current = cur
    return cur
  }, [p.detour])
  const { cancel } = useDreamDirector({
    viewer: p.viewer, tileset: p.tileset,
    target, next,
    pace: p.pace, hold: p.hold, reducedMotion: p.reducedMotion, rangeM: p.rangeM,
    detour,
    onArrived: (ms) => cb.current.onArrived(ms),
  })
  const cancelRef = useRef(cancel)
  // eslint-disable-next-line react-hooks/refs
  cancelRef.current = cancel
  useEffect(() => {
    const { viewer } = p
    if (viewer.isDestroyed()) return
    const canvas = viewer.scene.canvas
    const onInput = () => { cancelRef.current(); cb.current.onUserInput() }
    canvas.addEventListener('pointerdown', onInput)
    canvas.addEventListener('wheel', onInput, { passive: true })
    return () => {
      canvas.removeEventListener('pointerdown', onInput)
      canvas.removeEventListener('wheel', onInput)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.viewer])
  return null
}
