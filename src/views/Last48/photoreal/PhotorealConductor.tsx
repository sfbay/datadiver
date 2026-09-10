// src/views/Last48/photoreal/PhotorealConductor.tsx
//
// Null-rendering orchestrator — the Cesium twin of ambient/AmbientConductor.
// Same phase machine, same exit-on-any-input (except inside
// [data-ambient-toggle]), same reduced-motion + boot-curtain gates. The tour
// hook is reused verbatim with chainTour as its ORDER strategy; the camera
// is driven by useCesiumDirector; the hero marker + bubble follow the visit.
import { useEffect, useRef, useState } from 'react'
import type * as Cesium from 'cesium'
import type { AmbientPhase } from '../ambient/useAmbientDirector'
import { useAmbientTour } from '../ambient/useAmbientTour'
import type { PaceValues } from '../ambient/pace'
import type { NormalizedEvent } from '@/types/last48'
import { chainTour } from './tourChain'
import { useCesiumDirector, type PhotorealTarget } from './useCesiumDirector'
import type { PhotorealMarkers } from './PhotorealMarkers'

interface Props {
  viewer: Cesium.Viewer
  tileset: Cesium.Cesium3DTileset
  markers: PhotorealMarkers
  events: NormalizedEvent[]
  ambientOn: boolean
  ready: boolean
  pace: PaceValues
  pointsOn: boolean
  onExit: () => void
  onVisit: (ev: NormalizedEvent) => void
  onClearSelection: () => void
  /** The open event (URL ?event= or a marker click). When the tour is OFF a
   *  change here flies to it once and orbits — the deep-link contract. */
  selectedEvent: NormalizedEvent | null
}

export default function PhotorealConductor({ viewer, tileset, markers, events, ambientOn, ready, pace, pointsOn, onExit, onVisit, onClearSelection, selectedEvent }: Props) {
  const [phase, setPhase] = useState<AmbientPhase>('off')
  const [target, setTarget] = useState<PhotorealTarget>(null)
  // Free-look / deep-link selection: a one-stop "tour" of the chosen event.
  // Mirrors Last48UnifiedView's DeepLinkLander, which bails while ambientOn.
  const [freeTarget, setFreeTarget] = useState<PhotorealTarget>(null)
  // The id already landed (by the tour or a prior free-look leg) — guards
  // against re-arming a fresh flight to the event the user just exited on.
  // `onAmbientExit` doesn't clear the selected event, so without this guard
  // exiting the tour re-triggers this effect with the SAME selectedEvent and
  // launches a fresh 9s flight + orbit to it.
  const landedRef = useRef<string | null>(null)
  useEffect(() => {
    if (ambientOn) {
      // The tour itself lands the camera — just remember where, so exiting
      // right after doesn't re-fly to the same spot.
      landedRef.current = selectedEvent?.id ?? null
      return
    }
    if (selectedEvent?.longitude == null || selectedEvent?.latitude == null) {
      landedRef.current = null
      setFreeTarget(null)
      return
    }
    if (selectedEvent.id === landedRef.current) return // already there — no new leg
    landedRef.current = selectedEvent.id
    markers.setFocus(selectedEvent.longitude, selectedEvent.latitude)
    setFreeTarget({ lng: selectedEvent.longitude, lat: selectedEvent.latitude })
  }, [ambientOn, selectedEvent, markers])
  const onExitRef = useRef(onExit)
  // eslint-disable-next-line react-hooks/refs
  onExitRef.current = onExit

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (ambientOn && ready && !reduced && phase === 'off') setPhase('ramp-in')
    if (!ambientOn && (phase === 'ramp-in' || phase === 'on')) { setPhase('ramp-out'); setTarget(null) }
  }, [ambientOn, ready, phase])

  useEffect(() => {
    // Any input during the tour OR during a free-look leg hands the camera back.
    const legRunning = phase === 'ramp-in' || phase === 'on' || freeTarget !== null
    if (!legRunning) return
    const exit = (e: Event) => {
      if (!ambientOn) { setFreeTarget(null); return }
      const t = e.target as HTMLElement | null
      if (t?.closest('[data-ambient-toggle]')) return
      onExitRef.current()
    }
    const opts = { capture: true } as const
    for (const ev of ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const) window.addEventListener(ev, exit, opts)
    return () => { for (const ev of ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const) window.removeEventListener(ev, exit, opts) }
  }, [phase, freeTarget, ambientOn])

  // Click-to-open in free look (and during the tour, which the click also stops).
  useEffect(() => {
    markers.onPick = (id) => { const ev = events.find((e) => e.id === id); if (ev) onVisit(ev) }
    return () => { markers.onPick = undefined }
  }, [markers, events, onVisit])

  useAmbientTour({
    active: phase === 'on' && pointsOn,
    events,
    dwellMs: pace.dwellMs,
    breathMs: pace.breathMs,
    order: chainTour,
    onVisit: (ev) => {
      onVisit(ev)
      markers.setFocus(ev.longitude!, ev.latitude!)
      setTarget({ lng: ev.longitude!, lat: ev.latitude! })
    },
    onBreath: () => { onClearSelection(); setTarget(null) },
  })

  // The director runs the tour when armed; otherwise it runs the free-look
  // one-stop leg (phase 'on' with the selected target) and yields on input.
  // The free-look substitution only applies AT REST ('off') — while the
  // machine is mid-ramp-out it must keep seeing 'ramp-out' through to
  // completion (as AmbientConductor does), or the director never fires
  // onRampOutDone and `phase` sticks, swallowing the next AUTO click.
  useCesiumDirector({
    viewer, tileset,
    phase: phase !== 'off' ? phase : (freeTarget ? 'on' : 'off'),
    target: ambientOn ? target : freeTarget,
    pace,
    onRampInDone: () => setPhase('on'),
    onRampOutDone: () => { setPhase('off'); onExitRef.current() },
  })

  return null
}
