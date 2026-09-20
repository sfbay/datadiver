// src/views/Last48/photoreal/immersive/ImmersiveScene.tsx
//
// The Cesium side of /live/immersive (Spec A2 §3–§5). Owns the viewer, the
// Google tileset, the dusk grade, the hero + the two queue discs, the screen
// -pinned <Beacon> over the hero, the ground-click handler, the dream
// director, the render-on-demand "breath" and the tune panel. Draws no
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
import type { PhotorealTarget } from '../useCesiumDirector'

/** Spec A2 §3: MSAA on. 4 is Cesium's default; stated, not assumed. */
export const IMMERSIVE_MSAA = 4
/** The hero breathes in colour only; in render-on-demand mode someone has to
 *  ask for the frames. 50 ms = the spec's "at most 20×/s". */
const BREATH_MS = 50
/** A press that travels further than this is a DRAG, not a click. Cesium's
 *  own LEFT_CLICK tolerance is generous enough that a slow orbit ends in a
 *  click — which would have re-aimed the tour under the reader's hand. */
const DRAG_PX = 6

interface Props {
  active: NormalizedEvent | null
  next: NormalizedEvent | null
  queue: NormalizedEvent[]
  pace: PaceValues
  hold: boolean
  reducedMotion: boolean
  todOverride: string | null
  tuneOn: boolean
  onArrived: () => void
  onPick: (id: string) => void
  /** A click on the GROUND (no marker under the pointer): the page snaps to
   *  the nearest stop. Round A's minimal click; Round B adds the "here" card. */
  onMapClick: (lng: number, lat: number) => void
  /** Pointer/wheel on the canvas: the page pauses play; the director yields. */
  onUserInput: () => void
  /** Google quota/auth refusal — the page leaves to /live (the resting note). */
  onRest: () => void
  hostRef: RefObject<HTMLDivElement | null>
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
      // The globe is hidden but its ellipsoid still picks; pickPosition reads
      // the depth buffer (the tiles themselves) and throws on hardware with
      // no depth texture. Same ladder as PhotorealMarkers.probeFocus.
      let hit = viewer.camera.pickEllipsoid(m.position, scene.globe.ellipsoid)
      if (!hit) { try { hit = scene.pickPosition(m.position) } catch { return } }
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
          pace={props.pace} hold={props.hold} reducedMotion={props.reducedMotion}
          onArrived={props.onArrived} onUserInput={props.onUserInput}
        />
      )}
      {/* The beacon rides the host div (a sibling of the tune panel), not the
          Cesium scene — it is screen space by design. The ground disc stays:
          the two split the job, anchoring below and visibility above. */}
      {viewer && props.active && (
        <Beacon
          viewer={viewer} tileset={tileset} event={props.active}
          color={DATASET_META[props.active.datasetId].color}
        />
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
  onArrived: () => void
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
  const { cancel } = useDreamDirector({
    viewer: p.viewer, tileset: p.tileset,
    target, next,
    pace: p.pace, hold: p.hold, reducedMotion: p.reducedMotion,
    onArrived: () => cb.current.onArrived(),
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
