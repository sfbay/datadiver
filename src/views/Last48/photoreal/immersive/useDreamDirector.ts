// src/views/Last48/photoreal/immersive/useDreamDirector.ts
//
// The immersive camera (Spec A2 §3). Round B: an optional `detour` (a Place
// or a Hotspot) replaces the target as the leg's destination with its own
// pitch/range (and, for a Place, its own heading — a Hotspot arrives facing
// travel like a stop); the preload still aims at `next`. Unlike
// useCesiumDirector there is no per-frame orbit. A stop is:
//   1. a 3 s turn on the spot toward the travel bearing (TURN_S; skipped
//      within TURN_MIN_DEG, on the first leg and under reduced motion), then
//      ONE flight (pace.tweenMs less the turn, eased) to the arrival pose,
//      aimed at the TRUE ground sampled during the turn (PRESAMPLE_CAP_MS);
//   2. the settle gate (tiles loaded, or SETTLE_CAP_MS) → onArrived;
//   3. ONE slow flight across the whole dwell (constant speed, ramped up
//      from and back down to rest at its ends — rampedLinear) — a few degrees of
//      heading. To the eye it is a barely-moving camera; to Cesium it is a
//      flight, and a flight is the ONLY time the tileset runs its
//      PRELOAD_FLIGHT pass (Camera.canPreloadFlight, 1.145). That pass reads
//      scene.preloadFlightCamera + scene.preloadFlightCullingVolume, which
//      flyTo sets to ITS destination. Right after the drift starts, this hook
//      overwrites both with the NEXT stop's pose, so the next stop's tiles
//      stream during this dwell. Neither field is in Cesium's d.ts — hence
//      the one cast below. If a Cesium upgrade removes them, the cast finds
//      `undefined` and the preload silently does nothing (the fallback the
//      spec names — a second hidden Viewer — is a separate, disclosed change).
// Every pose comes from the pure cameraPose.ts, as before.
import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import type { PaceValues } from '../../ambient/pace'
import { orbitPose, bearingDeg, rampedLinear, RANGE_M, ORBIT_PITCH_DEG } from '../cameraPose'
import { quality } from '../quality'
import { SSE_FLIGHT, SETTLE_CAP_MS, type PhotorealTarget } from '../useCesiumDirector'
import { arrivalHeadingDeg, type DetourTarget } from './detour'

/** Metres ABOVE THE TILE SURFACE the camera aims at. Round B walk
 *  (2026-09-20, Jesse: "strange that this one ended up kind of high in the
 *  frame"): this used to be height above the ELLIPSOID, so on the Sunset's
 *  60 m slope — let alone Twin Peaks — the look point was underground and the
 *  real stop rode up the frame. The surface is sampled from the tileset. */
const TARGET_HEIGHT_M = 30
/** A settle-time re-probe that differs from the arrival aim by more than
 *  this re-aims the camera with a short correction glide before the drift. */
const REAIM_M = 10
const REAIM_S = 1.5
/** ONE motion per arrival (Jesse, 2026-09-23: the camera "comes in for a
 *  landing, slows down, then speeds up again"). That second motion was the
 *  REAIM glide: the take-off aim read `tileset.getHeight` at a place whose
 *  tiles were not resident (often 0 m on a detour), so nearly every new-area
 *  arrival missed by > REAIM_M and flew a second eased move after landing.
 *  Now each leg asks Cesium for the TRUE ground height at take-off
 *  (`sampleHeightMostDetailed`, which loads the tiles it needs) and holds
 *  the main flight for it — at most this long from the leg's start, which
 *  the 3 s turn usually covers. A leg that got the true height skips the
 *  re-aim; one that timed out keeps it as the fallback. */
const PRESAMPLE_CAP_MS = 2500
/** The drift's speed ramps up from rest (and back down to rest) over this
 *  long at each end of the dwell (rampedLinear) — no jolt into or out of it. */
const DRIFT_RAMP_S = 4
/** The FIRST leg of a session starts from Cesium's default camera, far away
 *  with no tiles under the stop. It arrives this many times further out than
 *  the hero range and then DESCENDS to the hero frame once the ground is
 *  known (Jesse, 2026-09-21: "went high, looked at the east bay, crashed
 *  under the ground" — aiming the first leg at an unknown surface put the
 *  camera below it, and the floor snapped it back up). */
const FIRST_LEG_RANGE_X = 3
const FIRST_LEG_DESCENT_S = 4
/** The high first arrival looks DOWN more steeply than the hero pitch — from
 *  600 m out, the hero's −30° stares at the horizon. */
const FIRST_LEG_PITCH_DEG = -45
/** "Look where you're flying" (Jesse, 2026-09-21). A leg is TWO flights:
 *  a short turn ON THE SPOT toward the destination's bearing, then the
 *  flight itself with that heading held, so the camera faces its own travel
 *  from the first metre instead of slewing round over 18 s. Skipped when the
 *  camera already faces within TURN_MIN_DEG of the bearing. Cesium's
 *  `pitchAdjustHeight` was tried first and tipped the camera straight down
 *  on the climb, then swivelled back up on arrival — deleted. */
const TURN_S = 3
const TURN_MIN_DEG = 15
/** Cap on the arc Cesium's flyTo climbs between stops (m above the
 *  ellipsoid) — high enough to clear the hills, low enough that a −30°
 *  camera keeps looking at the city, not the horizon. */
const MAX_ARC_M = 700
const toC3 = (v: [number, number, number]) => new Cesium.Cartesian3(v[0], v[1], v[2])
type Center = { lng: number; lat: number; height: number }

/** The two undocumented scene fields the preload pass reads. */
interface PreloadScene {
  preloadFlightCamera?: Cesium.Camera
  preloadFlightCullingVolume?: Cesium.CullingVolume
}

/** A running drift: enough to stop it mid-way and resume from that heading. */
interface Drift { from: number; to: number; t0: number; ms: number; center: Center; ease: (t: number) => number }

/** A type predicate rather than a bare `'key' in d` check — TS's structural
 *  narrowing on `{lng,lat} | DetourTarget` widens the true branch to an
 *  intersection instead of `DetourTarget` (the two types share too much
 *  shape for control-flow analysis alone), so an explicit guard is needed.
 *  The `headingDeg` KEY is always present on a DetourTarget (its value may be
 *  null — a Hotspot), and never on a stop, so `in` still tells them apart. */
function isDetourDest(d: Exclude<PhotorealTarget, null> | DetourTarget): d is DetourTarget {
  return 'headingDeg' in d
}

export function useDreamDirector(opts: {
  viewer: Cesium.Viewer
  tileset: Cesium.Cesium3DTileset
  /** The active stop. null = nothing selected; the camera stays where it is. */
  target: PhotorealTarget
  /** The stop after it — its tiles are preloaded during this dwell. */
  next: PhotorealTarget
  pace: PaceValues
  /** `H` hold: freeze the drift; release resumes it from where it stopped. */
  hold: boolean
  /** prefers-reduced-motion: instant legs, no drift. */
  reducedMotion: boolean
  /** Flight done + tiles settled (or the cap). The page starts the dwell on it. */
  onArrived: () => void
  /** Camera distance from the stop, metres. Default RANGE_M.immersive; the
   *  page passes ?range= as a dev knob (Jesse 2026-09-20: closer). */
  rangeM?: number
  /** Round B: a detour (a Place or a Hotspot). When set it REPLACES the
   *  target as the camera's destination — same flight, same settle gate,
   *  same drift — but with its own pitch/range, and its own heading when it
   *  has one (a Place; a Hotspot's is null → arrive facing travel). The
   *  preload still aims at `next` (the chain resumes from the active card). */
  detour?: DetourTarget | null
}): { cancel: () => void } {
  const { viewer, tileset, target, hold } = opts
  const detour = opts.detour ?? null
  // The leg's destination: a detour when there is one, else the stop. This is
  // the identity the leg effect keys on — NOT `target`/`detour` separately —
  // so a `?event=` write-back that changes `target` while a detour is engaged
  // cannot re-run the effect and re-fly a flight already in progress.
  const dest: PhotorealTarget | DetourTarget | null = detour ?? target
  const headingRef = useRef(35)
  const cbRef = useRef(opts)
  // eslint-disable-next-line react-hooks/refs
  cbRef.current = opts
  const driftRef = useRef<Drift | null>(null)
  const arrivedRef = useRef(false)
  const centerRef = useRef<Center | null>(null)
  /** The pitch/range of the CURRENT leg — a detour's own, or the house
   *  hero pose. startDrift and the hold-release read it so a detour drifts
   *  at its own distance rather than snapping back to 200 m. */
  const legRef = useRef<{ pitchDeg: number; rangeM: number } | null>(null)
  /** Set by cancel() (user camera input). cancelFlight() fires a running
   *  flight's `cancel` callback, not `complete` — the one path where
   *  `complete` fires synchronously (in the same tick cancel() could run)
   *  is a duration<=0 flight, i.e. the reducedMotion arrival leg. Without
   *  this flag that synchronous completion would start the settle gate and
   *  then the drift on top of the reader's own camera. Cleared when a new
   *  target starts a new leg. */
  const cancelledRef = useRef(false)
  /** True until the first leg has flown — see FIRST_LEG_RANGE_X. */
  const firstLegRef = useRef(true)

  // Stable helpers in a ref so the effects below never re-run for them.
  const api = useRef({
    alive: () => !viewer.isDestroyed(),
    pitch: () => legRef.current?.pitchDeg ?? Math.min(ORBIT_PITCH_DEG, -cbRef.current.pace.pitchMin),
    range: () => legRef.current?.rangeM ?? cbRef.current.rangeM ?? RANGE_M.immersive,
    /** `headingDeg` is where the camera will actually BE for this dwell —
     *  callers must pass the drift's end heading, not its start. */
    preloadNext(headingDeg: number) {
      const nxt = cbRef.current.next
      if (!nxt || viewer.isDestroyed()) return
      const s = viewer.scene as unknown as PreloadScene
      const cam = s.preloadFlightCamera
      if (!cam) return
      // The next stop is a STOP, not a detour — always the house hero pose.
      const p = orbitPose({ lng: nxt.lng, lat: nxt.lat, height: TARGET_HEIGHT_M + surfaceM(nxt.lng, nxt.lat) }, headingDeg, Math.min(ORBIT_PITCH_DEG, -cbRef.current.pace.pitchMin), (cbRef.current.rangeM ?? RANGE_M.immersive))
      cam.setView({ destination: toC3(p.position), orientation: { direction: toC3(p.direction), up: toC3(p.up) } })
      // Camera.frustum is a union in the d.ts; every member has computeCullingVolume.
      s.preloadFlightCullingVolume = (cam.frustum as Cesium.PerspectiveFrustum)
        .computeCullingVolume(cam.positionWC, cam.directionWC, cam.upWC)
    },
    startDrift(center: Center) {
      if (viewer.isDestroyed()) return
      const { pace, reducedMotion } = cbRef.current
      if (reducedMotion) return
      const from = headingRef.current
      const to = from + pace.orbitDegPerS * (pace.dwellMs / 1000)
      const end = orbitPose(center, to, this.pitch(), this.range())
      // Speed ramps up from rest and back down (rampedLinear), so the dwell
      // neither jolts into motion after the arrival nor stops dead when the
      // next leg starts. Still ONE flight, so the preload pass is unchanged.
      const ease = rampedLinear(DRIFT_RAMP_S * 1000 / pace.dwellMs)
      const me: Drift = { from, to, t0: performance.now(), ms: pace.dwellMs, center, ease }
      driftRef.current = me
      viewer.camera.flyTo({
        destination: toC3(end.position),
        orientation: { direction: toC3(end.direction), up: toC3(end.up) },
        duration: pace.dwellMs / 1000,
        easingFunction: ease,
        // cancelFlight() (stopDrift/cancel) fires this flight's `cancel`
        // callback, not `complete` — `complete` only fires on a genuine
        // full-duration finish. Guard by identity anyway: a stale `me`
        // (a callback from a drift already superseded by a newer leg) must
        // not commit a heading or null out the current drift.
        complete: () => { if (driftRef.current === me) { headingRef.current = to % 360; driftRef.current = null } },
        cancel: () => { if (driftRef.current === me) driftRef.current = null },
      })
      // flyTo just pointed the preload camera at the drift's own end —
      // overwrite it with the NEXT stop for the whole dwell. Use the
      // heading the camera will actually reach (`to`), not the one it's
      // leaving (`from`/headingRef.current).
      this.preloadNext(to)
    },
    /** Stop the drift where it is and record the heading reached. */
    stopDrift() {
      const d = driftRef.current
      if (!d) return
      const f = Math.min(1, (performance.now() - d.t0) / d.ms)
      headingRef.current = (d.from + (d.to - d.from) * d.ease(f)) % 360
      driftRef.current = null
      if (!viewer.isDestroyed()) viewer.camera.cancelFlight()
    },
  })

  /** Google surface height under a point, or 0 while no tile there has
   *  loaded yet (the settle gate re-probes once they have). getHeight is the
   *  one tileset call that can throw; keep the leg alive. */
  const surfaceM = (lng: number, lat: number): number => {
    if (viewer.isDestroyed()) return 0
    try { return tileset.getHeight(Cesium.Cartographic.fromDegrees(lng, lat), viewer.scene) ?? 0 } catch { return 0 }
  }

  /** The TRUE ground height at a point: Cesium loads the most detailed tiles
   *  there and samples them. The markers are entities standing ON the stop
   *  (a 311 column would read as the ground), so every entity is excluded.
   *  null when unsupported, nothing was hit, or the call fails. */
  const sampleGround = async (lng: number, lat: number): Promise<number | null> => {
    if (viewer.isDestroyed() || !viewer.scene.sampleHeightSupported) return null
    try {
      const [c] = await viewer.scene.sampleHeightMostDetailed([Cesium.Cartographic.fromDegrees(lng, lat)], viewer.entities.values)
      return c && Number.isFinite(c.height) ? c.height : null
    } catch { return null }
  }

  /** The bearing from where the camera is now to a destination — the heading
   *  every leg's flight holds, and the one a stop or a Hotspot arrives with,
   *  so the camera always faces the destination (Jesse's walk, 2026-09-20:
   *  keeping the old heading flew a stop behind us backward). It reads as
   *  forward flight beyond the arrival's ground offset and as a pull-back
   *  inside it (arrivalHeadingDeg in detour.ts has the numbers). The turn to
   *  it is the 3 s pivot before the flight (TURN_S). Falls back to the last
   *  heading when the camera has no position yet, or is already over the
   *  destination (a degenerate bearing). */
  const travelHeading = (lng: number, lat: number): number => {
    if (viewer.isDestroyed()) return headingRef.current
    const c = viewer.camera.positionCartographic
    if (!c) return headingRef.current
    const fromLng = Cesium.Math.toDegrees(c.longitude), fromLat = Cesium.Math.toDegrees(c.latitude)
    if (Math.abs(fromLng - lng) < 1e-4 && Math.abs(fromLat - lat) < 1e-4) return headingRef.current
    return bearingDeg(fromLng, fromLat, lng, lat)
  }

  // One leg per DESTINATION IDENTITY (`dest`, hoisted above): a detour when
  // there is one, else the stop. Deliberately NOT `[target, detour, ...]` —
  // that let a `?event=` write-back (which changes `target` but not the
  // engaged `detour`) restart this effect and re-fly a flight already in
  // progress on top of the reader.
  useEffect(() => {
    const a = api.current
    const detourDest = dest != null && isDetourDest(dest) ? dest : null
    const legDest = dest == null ? null : {
      lng: dest.lng, lat: dest.lat,
      // One rule for every leg (detour.ts arrivalHeadingDeg): a Place's
      // authored heading wins; a stop or a Hotspot arrives facing the way it
      // flew; the first leg of a session keeps the house heading (a bearing
      // from Cesium's default camera, out over the Bay, faces the East Bay).
      headingDeg: arrivalHeadingDeg(detourDest ? detourDest.headingDeg : null, {
        firstLeg: firstLegRef.current,
        houseDeg: headingRef.current,
        travelDeg: () => travelHeading(dest.lng, dest.lat),
      }),
      pitchDeg: detourDest ? detourDest.pitchDeg : Math.min(ORBIT_PITCH_DEG, -cbRef.current.pace.pitchMin),
      rangeM: detourDest ? detourDest.rangeM : cbRef.current.rangeM ?? RANGE_M.immersive,
    }
    if (!legDest) {
      a.stopDrift()
      arrivedRef.current = false
      centerRef.current = null
      legRef.current = null
      return
    }
    let disposed = false
    let settle: ReturnType<typeof setInterval> | undefined
    let presampleCap: ReturnType<typeof setTimeout> | undefined
    arrivedRef.current = false
    cancelledRef.current = false
    a.stopDrift()
    // A Place brings its own heading; a stop or a Hotspot ARRIVES facing the
    // way it travelled (travelHeading), so the leg reads as flying forward.
    headingRef.current = legDest.headingDeg
    legRef.current = { pitchDeg: legDest.pitchDeg, rangeM: legDest.rangeM }
    const highLeg = firstLegRef.current
    firstLegRef.current = false
    const center: Center = { lng: legDest.lng, lat: legDest.lat, height: TARGET_HEIGHT_M + surfaceM(legDest.lng, legDest.lat) }
    centerRef.current = center
    const { pace, reducedMotion } = cbRef.current
    tileset.maximumScreenSpaceError = SSE_FLIGHT
    // The true ground under the destination (PRESAMPLE_CAP_MS). Not on the
    // first leg — it arrives high and descends once the ground is known, by
    // design — and not under reduced motion (instant legs, nothing to hide).
    let trueGround: number | null = null
    const groundReady: Promise<void> = highLeg || reducedMotion ? Promise.resolve() : Promise.race([
      sampleGround(legDest.lng, legDest.lat).then((g) => { trueGround = g }),
      new Promise<void>((res) => { presampleCap = setTimeout(res, PRESAMPLE_CAP_MS) }),
    ])
    /** Set when the main flight aimed at the sampled ground: its arrival IS
     *  the true frame, so the settle gate must not fly a second move. */
    let aimedTrue = false
    // The heading the FLIGHT holds: the bearing to the destination. A stop or
    // a Hotspot arrives at this same bearing, so the heading is held end to
    // end; a Place still flies facing travel and slerps to its authored
    // heading over the main flight (its postcard view is the point).
    const flightHeading = highLeg ? legDest.headingDeg : travelHeading(legDest.lng, legDest.lat)
    const flyMain = () => {
      if (disposed || cancelledRef.current || !a.alive()) return
      if (trueGround != null) { center.height = TARGET_HEIGHT_M + trueGround; aimedTrue = true }
      const arrival = orbitPose(center, legDest.headingDeg, highLeg ? FIRST_LEG_PITCH_DEG : legDest.pitchDeg, highLeg ? legDest.rangeM * FIRST_LEG_RANGE_X : legDest.rangeM)
      viewer.camera.flyTo({
      destination: toC3(arrival.position),
      orientation: { direction: toC3(arrival.direction), up: toC3(arrival.up) },
      duration: reducedMotion ? 0 : Math.max(0, pace.tweenMs / 1000 - (turned ? TURN_S : 0)),
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      maximumHeight: MAX_ARC_M,
      complete: () => {
        if (disposed || cancelledRef.current || !a.alive()) return
        tileset.maximumScreenSpaceError = quality.sseOrbit
        const t0 = Date.now()
        settle = setInterval(() => {
          if (disposed || cancelledRef.current || !a.alive()) { clearInterval(settle); return }
          // Settle on tiles loaded, OR as soon as the tileset can answer a
          // height under the stop (coarse tiles are enough to get the
          // camera above the ground), OR the cap.
          let heightKnown = false
          try { heightKnown = tileset.getHeight(Cesium.Cartographic.fromDegrees(center.lng, center.lat), viewer.scene) != null } catch { heightKnown = false }
          if (tileset.tilesLoaded || heightKnown || Date.now() - t0 > SETTLE_CAP_MS) {
            clearInterval(settle)
            if (cancelledRef.current) return
            // Arrived at the sampled true ground: this IS the frame. Never
            // re-aim from getHeight here — at a coarser tile level it can
            // disagree with the most-detailed sample by more than REAIM_M,
            // and that re-aim was the second motion this change removes.
            if (aimedTrue && !highLeg) {
              arrivedRef.current = true
              cbRef.current.onArrived()
              if (!cbRef.current.hold) a.startDrift(center)
              return
            }
            // Fallback (sample timed out or failed): re-measure the ground
            // under the stop. The arrival aim used whatever was resident at
            // take-off (often 0 for a fresh area); a big miss gets a short
            // glide to the true frame before the drift starts from it.
            const trueH = TARGET_HEIGHT_M + surfaceM(center.lng, center.lat)
            if ((highLeg || Math.abs(trueH - center.height) > REAIM_M) && !cbRef.current.reducedMotion) {
              center.height = trueH
              const fix = orbitPose(center, headingRef.current, legDest.pitchDeg, legDest.rangeM)
              viewer.camera.flyTo({
                destination: toC3(fix.position),
                orientation: { direction: toC3(fix.direction), up: toC3(fix.up) },
                duration: highLeg ? FIRST_LEG_DESCENT_S : REAIM_S,
                easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
                complete: () => {
                  if (disposed || cancelledRef.current || !a.alive()) return
                  arrivedRef.current = true
                  cbRef.current.onArrived()
                  if (!cbRef.current.hold) a.startDrift(center)
                },
              })
              return
            }
            center.height = trueH
            arrivedRef.current = true
            cbRef.current.onArrived()
            if (!cbRef.current.hold) a.startDrift(center)
          }
        }, 150)
      },
    })
    }
    // Turn first, then fly — unless already facing the way, or it's the
    // first (far, high) leg, or reduced motion wants instant legs.
    const cam = viewer.camera
    const curHeading = ((Cesium.Math.toDegrees(cam.heading) % 360) + 360) % 360
    const dh = Math.abs(((flightHeading - curHeading + 540) % 360) - 180)
    const turned = !highLeg && !reducedMotion && dh > TURN_MIN_DEG
    if (turned) {
      cam.flyTo({
        destination: Cesium.Cartesian3.clone(cam.positionWC),
        orientation: { heading: Cesium.Math.toRadians(flightHeading), pitch: Math.min(cam.pitch, Cesium.Math.toRadians(-20)), roll: 0 },
        duration: TURN_S,
        easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
        // The ground sample runs during the turn; take off once it is in.
        complete: () => { void groundReady.then(flyMain) },
      })
    } else {
      void groundReady.then(flyMain)
    }
    return () => {
      disposed = true
      if (settle) clearInterval(settle)
      if (presampleCap) clearTimeout(presampleCap)
      a.stopDrift()
      if (a.alive()) viewer.camera.cancelFlight()
    }
  }, [dest, viewer, tileset])

  // Hold / release. Release resumes the drift only once the stop has arrived
  // (a hold pressed mid-flight lets the flight finish; the settle gate then
  // sees `hold` and does not start the drift).
  useEffect(() => {
    const a = api.current
    if (hold) { a.stopDrift(); return }
    const c = centerRef.current
    if (arrivedRef.current && c && !driftRef.current && !cancelledRef.current) a.startDrift(c)
  }, [hold])

  return {
    cancel: () => {
      const a = api.current
      cancelledRef.current = true
      a.stopDrift()
      if (a.alive()) { viewer.camera.cancelFlight(); tileset.maximumScreenSpaceError = quality.sseOrbit }
    },
  }
}
