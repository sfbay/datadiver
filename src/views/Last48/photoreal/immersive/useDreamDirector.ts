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
//      aimed at the TRUE ground sampled during the turn (PRESAMPLE_CAP_MS),
//      with the stop's ground point held on its final screen spot through
//      the approach (holdAim) — one motion, no re-aim after landing;
//   2. the settle gate (tiles loaded, or SETTLE_CAP_MS) → onArrived;
//   3. a slow ORBIT across the whole dwell — a chain of short flights around
//      the stop (DRIFT_SEG_MS), ramped up from and back down to rest at the
//      dwell's two ends (rampedLinear). To Cesium each segment is a
//      flight, and a flight is the ONLY time the tileset runs its
//      PRELOAD_FLIGHT pass (Camera.canPreloadFlight, 1.145). That pass reads
//      scene.preloadFlightCamera + scene.preloadFlightCullingVolume, which
//      flyTo sets to ITS destination. Right after each segment starts, this
//      hook overwrites both with the NEXT stop's pose, so the next stop's
//      tiles stream during this dwell. Neither field is in Cesium's d.ts —
//      hence the one cast below. If a Cesium upgrade removes them, the cast
//      finds `undefined` and the preload silently does nothing (the fallback
//      the spec names — a second hidden Viewer — is a separate, disclosed
//      change).
// Every pose comes from the pure cameraPose.ts, as before.
import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import { tileGroundM, plausibleGround } from '../groundHeight'
import type { PaceValues } from '../../ambient/pace'
import { orbitPose, bearingDeg, rampedLinear, sliceEase, orbitSweepDeg, glideHeight, RANGE_M, ORBIT_PITCH_DEG, type CameraPose } from '../cameraPose'
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
/** The dwell's orbit is flown as a chain of short flights, each this long.
 *  ONE flight across the whole 47° sweep (Jesse, 2026-09-23: "dot is
 *  drifting") flew the straight CHORD between its two orbit poses — Cesium
 *  interpolates position in lon/lat/height, not around a circle — so mid-way
 *  the camera sat 8% closer and the stop slid ~34 px down the frame and back
 *  (measured). At ~1.6° per segment the chord error is under a metre. Every
 *  segment is still a flight, so the next-stop preload pass keeps running. */
const DRIFT_SEG_MS = 2500
/** Fraction of the main flight over which the view turns from Cesium's own
 *  interpolated orientation to looking straight at the stop; from then on
 *  the stop holds the middle of the frame. Measured 2026-09-23 without it:
 *  Cesium interpolates heading/pitch separately from the 700 m arc, so the
 *  stop slid down past the bottom edge mid-flight and the camera tipped back
 *  down onto it in the last ~4 s — the "double dip". */
const AIM_BLEND_UNTIL = 0.35
/** The main flight's own height profile (glideHeight): climb out at this
 *  angle, cruise no higher than MAX_ARC_M (and no more than this share of the
 *  leg's length above the higher end), then glide in down the arrival's line
 *  of sight (Jesse, 2026-09-23: arrivals were "tilting down and dropping all
 *  at the end of flight" — Cesium's own parabola fell steepest right at the
 *  end). */
const CLIMB_DEG = 20
const CRUISE_OVER_FRAC = 0.25
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
  /** Flight done + tiles settled (or the cap). The page starts the dwell on
   *  it, for `dwellMs` — the orbit's own length (orbitSweepDeg at
   *  pace.orbitDegPerS), so the stop ends when the camera faces the next. */
  onArrived: (dwellMs: number) => void
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
  /** This stop's orbit: the heading it ends on (facing the next stop) and
   *  the time still to fly. Set on arrival; a hold banks the remainder and a
   *  release flies it, so the camera still ends facing the next stop exactly
   *  when the page's clock (paused for the same hold) runs out. */
  const planRef = useRef<{ to: number; ms: number } | null>(null)

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
    /** The stop has arrived: plan its orbit, tell the page how long the
     *  dwell is, and start orbiting unless a hold is on. */
    arrive(center: Center) {
      const { pace, reducedMotion, next } = cbRef.current
      let ms = pace.dwellMs
      if (!reducedMotion) {
        const from = headingRef.current
        // The heading that faces the next stop from this one. The camera then
        // sits on the line from the next stop through this one, so the next
        // leg's travel bearing IS this heading — take-off needs no turn.
        const faceNext = next && (Math.abs(next.lng - center.lng) > 1e-5 || Math.abs(next.lat - center.lat) > 1e-5)
          ? bearingDeg(center.lng, center.lat, next.lng, next.lat) : null
        const sweep = orbitSweepDeg(from, faceNext)
        ms = (Math.abs(sweep) / pace.orbitDegPerS) * 1000
        planRef.current = { to: from + sweep, ms }
      }
      arrivedRef.current = true
      cbRef.current.onArrived(ms)
      if (!cbRef.current.hold) this.startDrift(center)
    },
    /** Fly what is left of this stop's orbit (planRef) from where the camera
     *  is now — the whole orbit on arrival, the remainder after a hold. */
    startDrift(center: Center) {
      if (viewer.isDestroyed()) return
      const plan = planRef.current
      if (cbRef.current.reducedMotion || !plan || plan.ms < 50) return
      const from = headingRef.current
      const { to, ms } = plan
      // Speed ramps up from rest and back down (rampedLinear), so the dwell
      // neither jolts into motion after the arrival nor stops dead when the
      // next leg starts.
      const ease = rampedLinear(DRIFT_RAMP_S * 1000 / ms)
      const me: Drift = { from, to, t0: performance.now(), ms, center, ease }
      driftRef.current = me
      // A true ORBIT as a chain of short flights (DRIFT_SEG_MS). Segment i
      // covers the time slice [a, b] of the whole dwell; its easing is the
      // matching slice of the dwell's ONE speed profile (rampedLinear), so
      // speed is continuous across the joins and the ramps still sit at the
      // two ends of the dwell.
      const n = Math.max(1, Math.round(ms / DRIFT_SEG_MS))
      const pitch = this.pitch(), range = this.range()
      const flySeg = (i: number) => {
        if (driftRef.current !== me || viewer.isDestroyed()) return
        if (i >= n) { headingRef.current = to % 360; driftRef.current = null; planRef.current = { to, ms: 0 }; return }
        const a = i / n, b = (i + 1) / n
        const end = orbitPose(center, from + (to - from) * ease(b), pitch, range)
        viewer.camera.flyTo({
          destination: toC3(end.position),
          orientation: { direction: toC3(end.direction), up: toC3(end.up) },
          duration: ms / n / 1000,
          easingFunction: sliceEase(ease, a, b),
          // cancelFlight() (stopDrift/cancel) fires `cancel`, never
          // `complete`; `complete` chains the next segment. Guard by
          // identity: a stale `me` must not commit a heading or null out a
          // newer drift.
          complete: () => flySeg(i + 1),
          cancel: () => { if (driftRef.current === me) driftRef.current = null },
        })
        // Each flyTo points the preload camera at its own end — overwrite it
        // with the NEXT stop, at the heading the dwell will reach (`to`).
        api.current.preloadNext(to)
      }
      flySeg(0)
    },
    /** Stop the drift where it is and record the heading reached. */
    stopDrift() {
      const d = driftRef.current
      if (!d) return
      const f = Math.min(1, (performance.now() - d.t0) / d.ms)
      headingRef.current = (d.from + (d.to - d.from) * d.ease(f)) % 360
      driftRef.current = null
      // Bank the rest of the orbit: a release flies it (planRef).
      if (planRef.current) planRef.current = { to: d.to, ms: d.ms * (1 - f) }
      if (!viewer.isDestroyed()) viewer.camera.cancelFlight()
    },
  })

  /** Google surface height under a point, or 0 while no tile there has
   *  loaded yet (the settle gate re-probes once they have). getHeight is the
   *  one tileset call that can throw; keep the leg alive. */
  const surfaceM = (lng: number, lat: number): number => {
    if (viewer.isDestroyed()) return 0
    return tileGroundM(tileset, Cesium.Cartographic.fromDegrees(lng, lat), viewer.scene) ?? 0
  }

  /** The TRUE ground height at a point: Cesium loads the most detailed tiles
   *  there and samples them. The markers are entities standing ON the stop
   *  (a 311 column would read as the ground), so every entity is excluded.
   *  null when unsupported, nothing was hit, or the call fails. */
  const sampleGround = async (lng: number, lat: number): Promise<number | null> => {
    if (viewer.isDestroyed() || !viewer.scene.sampleHeightSupported) return null
    try {
      const [c] = await viewer.scene.sampleHeightMostDetailed([Cesium.Cartographic.fromDegrees(lng, lat)], viewer.entities.values)
      return plausibleGround(c?.height) ?? null
    } catch { return null }
  }

  /** Keep the stop's GROUND point on its FINAL screen spot through the main
   *  flight (AIM_BLEND_UNTIL). Runs on scene.preUpdate — after Cesium's
   *  flight tween has set this frame's pose, before the frame is drawn — and
   *  turns the tween's view direction: gradually over the first
   *  AIM_BLEND_UNTIL of the flight, fully after. The arrival pose looks at
   *  a point TARGET_HEIGHT_M above the ground, so the ground point (where
   *  the Beacon sits) ends a fixed angle `delta` below the view centre; the
   *  hold keeps that same angle all the way in. Aiming at the 30 m point
   *  instead let the Beacon slide ~80 px down the frame in the last 3 s
   *  (measured 2026-09-23) as the gap grew with closeness. At arrival the
   *  held direction IS the arrival direction, so the hand-off is seamless.
   *  Position is never touched. Returns the detach function. */
  const holdAim = (center: Center, arrival: CameraPose, arrivalPitchDeg: number, flightMs: number): (() => void) => {
    if (viewer.isDestroyed()) return () => {}
    const cam = viewer.camera
    // The glide profile (glideHeight): measured once from where the flight
    // starts to where it ends. Horizontal progress is read off the camera's
    // own lon/lat each frame, so the profile follows Cesium's path exactly.
    const startC = Cesium.Cartographic.clone(cam.positionCartographic)
    const endC = Cesium.Cartographic.fromCartesian(toC3(arrival.position))
    const d = new Cesium.EllipsoidGeodesic(startC, endC).surfaceDistance
    const hs = startC.height, he = endC.height
    const profile = { hs, he, d, cruise: Math.min(MAX_ARC_M, Math.max(hs, he) + CRUISE_OVER_FRAC * d),
      climbTan: Math.tan(Cesium.Math.toRadians(CLIMB_DEG)), glideTan: Math.tan(Cesium.Math.toRadians(Math.abs(arrivalPitchDeg))) }
    const geo = new Cesium.EllipsoidGeodesic()
    const camC = new Cesium.Cartographic()
    const ground = Cesium.Cartesian3.fromDegrees(center.lng, center.lat, center.height - TARGET_HEIGHT_M)
    const toGroundAtArrival = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(ground, toC3(arrival.position), new Cesium.Cartesian3()), new Cesium.Cartesian3())
    const delta = Cesium.Cartesian3.angleBetween(toC3(arrival.direction), toGroundAtArrival)
    const cosD = Math.cos(delta), sinD = Math.sin(delta)
    const t0 = performance.now()
    const look = new Cesium.Cartesian3(), dir = new Cesium.Cartesian3(), upPerp = new Cesium.Cartesian3()
    const localUp = new Cesium.Cartesian3(), right = new Cesium.Cartesian3(), up = new Cesium.Cartesian3()
    const tmp = new Cesium.Cartesian3()
    const remove = viewer.scene.preUpdate.addEventListener(() => {
      if (viewer.isDestroyed()) return
      // Height first (the aim below reads the corrected position): keep the
      // tween's lon/lat, replace its parabola with the glide profile.
      Cesium.Cartographic.fromCartesian(cam.positionWC, Cesium.Ellipsoid.WGS84, camC)
      if (camC && d > 1) {
        geo.setEndPoints(startC, camC)
        const h = glideHeight({ ...profile, x: geo.surfaceDistance })
        Cesium.Cartesian3.fromRadians(camC.longitude, camC.latitude, h, Cesium.Ellipsoid.WGS84, cam.position)
      }
      const s = Math.min(1, (performance.now() - t0) / flightMs)
      const x = Math.min(1, s / AIM_BLEND_UNTIL)
      const w = x * x * (3 - 2 * x) // smoothstep: no kink at either end of the blend
      Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(cam.positionWC, localUp)
      // Toward the ground point, then tipped UP by `delta` in the vertical
      // plane, so the ground point sits `delta` below the view centre.
      Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(ground, cam.positionWC, look), look)
      Cesium.Cartesian3.subtract(localUp, Cesium.Cartesian3.multiplyByScalar(look, Cesium.Cartesian3.dot(localUp, look), tmp), upPerp)
      Cesium.Cartesian3.normalize(upPerp, upPerp)
      Cesium.Cartesian3.add(Cesium.Cartesian3.multiplyByScalar(look, cosD, look), Cesium.Cartesian3.multiplyByScalar(upPerp, sinD, tmp), look)
      Cesium.Cartesian3.normalize(look, look)
      Cesium.Cartesian3.normalize(Cesium.Cartesian3.lerp(cam.directionWC, look, w, dir), dir)
      // Roll-free up: perpendicular to the view, in the plane of view + local up.
      Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(dir, localUp, right), right)
      Cesium.Cartesian3.cross(right, dir, up)
      Cesium.Cartesian3.clone(dir, cam.direction)
      Cesium.Cartesian3.clone(up, cam.up)
      Cesium.Cartesian3.clone(right, cam.right)
    })
    let done = false
    return () => { if (!done) { done = true; remove() } }
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
    planRef.current = null
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
    // The true ground under the destination (PRESAMPLE_CAP_MS). Not under
    // reduced motion (instant legs, nothing to hide). The FIRST leg samples
    // too: with the true ground it flies straight to the hero frame in one
    // motion, and only falls back to arrive-high-then-descend without it.
    let trueGround: number | null = null
    const groundReady: Promise<void> = reducedMotion ? Promise.resolve() : Promise.race([
      sampleGround(legDest.lng, legDest.lat).then((g) => { trueGround = g }),
      new Promise<void>((res) => { presampleCap = setTimeout(res, PRESAMPLE_CAP_MS) }),
    ])
    /** Set when the main flight aimed at the sampled ground: its arrival IS
     *  the true frame, so the settle gate must not fly a second move. */
    let aimedTrue = false
    /** The first leg's arrive-high-then-descend fallback — only when the
     *  ground sample did not come back (FIRST_LEG_RANGE_X). */
    let high = highLeg
    /** Detaches the main flight's aim hold (AIM_BLEND_UNTIL). */
    let stopAim = () => {}
    // The heading the FLIGHT holds: the bearing to the destination. A stop or
    // a Hotspot arrives at this same bearing, so the heading is held end to
    // end; a Place still flies facing travel and slerps to its authored
    // heading over the main flight (its postcard view is the point).
    const flightHeading = highLeg ? legDest.headingDeg : travelHeading(legDest.lng, legDest.lat)
    const flyMain = () => {
      if (disposed || cancelledRef.current || !a.alive()) return
      if (trueGround != null) { center.height = TARGET_HEIGHT_M + trueGround; aimedTrue = true; high = false }
      const arrival = orbitPose(center, legDest.headingDeg, high ? FIRST_LEG_PITCH_DEG : legDest.pitchDeg, high ? legDest.rangeM * FIRST_LEG_RANGE_X : legDest.rangeM)
      const durationS = reducedMotion ? 0 : Math.max(0, pace.tweenMs / 1000 - (turned ? TURN_S : 0))
      viewer.camera.flyTo({
      destination: toC3(arrival.position),
      orientation: { direction: toC3(arrival.direction), up: toC3(arrival.up) },
      duration: durationS,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      maximumHeight: MAX_ARC_M,
      cancel: () => stopAim(),
      complete: () => {
        stopAim()
        if (disposed || cancelledRef.current || !a.alive()) return
        tileset.maximumScreenSpaceError = quality.sseOrbit
        const t0 = Date.now()
        /** The orbit (the hero) starts only once the tiles have SETTLED, or
         *  at the cap (Jesse, 2026-09-23: "I thought we don't start hero
         *  until tiles settle?"). At 3.6°/s a sweep over half-loaded tiles
         *  shows blur spinning. The camera holds still in the arrival frame
         *  meanwhile; the page's stop clock starts with the orbit. */
        const arriveSettled = () => {
          const go = () => { if (!disposed && !cancelledRef.current && a.alive()) a.arrive(center) }
          if (tileset.tilesLoaded) { go(); return }
          settle = setInterval(() => {
            if (disposed || cancelledRef.current || !a.alive()) { clearInterval(settle); return }
            if (tileset.tilesLoaded || Date.now() - t0 > SETTLE_CAP_MS) { clearInterval(settle); go() }
          }, 150)
        }
        settle = setInterval(() => {
          if (disposed || cancelledRef.current || !a.alive()) { clearInterval(settle); return }
          // Settle on tiles loaded, OR as soon as the tileset can answer a
          // height under the stop (coarse tiles are enough to get the
          // camera above the ground), OR the cap.
          let heightKnown = false
          heightKnown = tileGroundM(tileset, Cesium.Cartographic.fromDegrees(center.lng, center.lat), viewer.scene) != null
          if (tileset.tilesLoaded || heightKnown || Date.now() - t0 > SETTLE_CAP_MS) {
            clearInterval(settle)
            if (cancelledRef.current) return
            // Arrived at the sampled true ground: this IS the frame. Never
            // re-aim from getHeight here — at a coarser tile level it can
            // disagree with the most-detailed sample by more than REAIM_M,
            // and that re-aim was the second motion this change removes.
            if (aimedTrue) { arriveSettled(); return }
            // Fallback (sample timed out or failed): re-measure the ground
            // under the stop. The arrival aim used whatever was resident at
            // take-off (often 0 for a fresh area); a big miss gets a short
            // glide to the true frame before the drift starts from it.
            const trueH = TARGET_HEIGHT_M + surfaceM(center.lng, center.lat)
            if ((high || Math.abs(trueH - center.height) > REAIM_M) && !cbRef.current.reducedMotion) {
              center.height = trueH
              const fix = orbitPose(center, headingRef.current, legDest.pitchDeg, legDest.rangeM)
              viewer.camera.flyTo({
                destination: toC3(fix.position),
                orientation: { direction: toC3(fix.direction), up: toC3(fix.up) },
                duration: high ? FIRST_LEG_DESCENT_S : REAIM_S,
                easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
                complete: () => {
                  if (disposed || cancelledRef.current || !a.alive()) return
                  arriveSettled()
                },
              })
              return
            }
            center.height = trueH
            arriveSettled()
          }
        }, 150)
      },
    })
      if (durationS > 0) stopAim = holdAim(center, arrival, high ? FIRST_LEG_PITCH_DEG : legDest.pitchDeg, durationS * 1000)
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
      stopAim()
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
