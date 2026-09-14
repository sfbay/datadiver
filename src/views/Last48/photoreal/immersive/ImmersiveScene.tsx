// src/views/Last48/photoreal/immersive/ImmersiveScene.tsx
//
// The Cesium side of /live/immersive (Spec A2 §3–§5). Owns the viewer, the
// Google tileset, the dusk grade, the hero + the two queue discs, the dream
// director, the render-on-demand "breath" and the tune panel. Draws NOTHING
// else: no marker field, no bubble, no stem — the card lives in the band.
// Same lifecycle rules as Last48Photoreal: viewer.destroy() deferred one
// microtask (children clean up parent-first), isDestroyed() on every touch.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type * as Cesium from 'cesium'
import '../photoreal.css'
import type { NormalizedEvent } from '@/types/last48'
import type { PaceValues } from '../../ambient/pace'
import { createViewer, loadGoogleTileset, applyGrade, applyQuality } from '../viewerHost'
import { quality, resetQuality, QUALITY_IMMERSIVE } from '../quality'
import { PhotorealMarkers } from '../PhotorealMarkers'
import PhotorealTunePanel from '../PhotorealTunePanel'
import { useDreamDirector } from './useDreamDirector'
import type { PhotorealTarget } from '../useCesiumDirector'

/** Spec A2 §3: MSAA on. 4 is Cesium's default; stated, not assumed. */
export const IMMERSIVE_MSAA = 4
/** The hero breathes in colour only; in render-on-demand mode someone has to
 *  ask for the frames. 50 ms = the spec's "at most 20×/s". */
const BREATH_MS = 50

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
      onTileLoad: () => setTileLoads((n) => n + 1),
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
  useEffect(() => { markers?.setHero(props.active) }, [markers, props.active])
  useEffect(() => { markers?.setQueue(props.queue) }, [markers, props.queue])
  useEffect(() => {
    if (!markers) return
    markers.onPick = (id) => cb.current.onPick(id)
    return () => { markers.onPick = undefined }
  }, [markers])

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
      {props.tuneOn && viewer && (
        <PhotorealTunePanel viewer={viewer} tileset={tileset} tileLoads={tileLoads} onApply={applyQuality} />
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
  // parent render with the same event does not re-fly.
  const target = useMemo(() => toTarget(p.active), [p.active])
  const next = useMemo(() => toTarget(p.next), [p.next])
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
