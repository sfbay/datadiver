// src/views/Last48/ambient/orbit.ts
//
// Pure math for the ambient orbit. DRIFT no longer spins a full 360° — with
// the map pitched, a continuous rotation puts SOUTH at the top of the screen
// for a third of every cycle, which reads as disorienting (the city upside
// down). Instead the camera swings as a SINE PENDULUM across the north axis:
// west → north → east → north → west, never past ±amplitude. Sine (not a
// triangle) so the reversal at each extreme eases to a stop and turns back
// smoothly — no jarring flip — matching the calm observatory register.
//
// The director keeps a phase clock θ that advances linearly; the applied
// bearing is amplitude·sin(θ). Phase is the source of truth so flights can
// carry it forward and the hold resumes from it.

/** Half-width of the swing, degrees. ±90 = the full top 180° (due W ↔ due E
 *  through north), as specced. Lower it to keep the view more north-centric. */
export const ORBIT_AMPLITUDE_DEG = 90

/** Bearing (deg) for an oscillator phase: θ=0 → north (0°), θ=+π/2 → +amp
 *  (east), θ=−π/2 → −amp (west). */
export function orbitBearing(phaseRad: number, amplitudeDeg = ORBIT_AMPLITUDE_DEG): number {
  return amplitudeDeg * Math.sin(phaseRad)
}

/** Phase whose bearing matches `bearingDeg`, so ramp-in picks up from the
 *  user's current heading. Input is normalised to (−180, 180]; headings
 *  beyond ±amplitude clamp to the nearest extreme. */
export function seedOrbitPhase(bearingDeg: number, amplitudeDeg = ORBIT_AMPLITUDE_DEG): number {
  const signed = (((bearingDeg + 180) % 360) + 360) % 360 - 180 // → (−180, 180]
  return Math.asin(Math.max(-1, Math.min(1, signed / amplitudeDeg)))
}

/** Phase angular rate (rad/s) for a desired TIME-AVERAGE sweep speed. A sine's
 *  mean |velocity| is 2/π of its peak, so to make `avgDegPerS` the average we
 *  set the peak to avgDegPerS·π/2; peak = amplitude·(dθ/dt) ⟹ dθ/dt below. */
export function orbitPhaseRate(avgDegPerS: number, amplitudeDeg = ORBIT_AMPLITUDE_DEG): number {
  return (avgDegPerS * Math.PI / 2) / amplitudeDeg
}
