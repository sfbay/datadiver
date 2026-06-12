// src/views/Last48/ambient/pace.ts
//
// Pace presets for ambient DRIFT — named, curated bundles instead of
// user-facing sliders (editorial taste encoded, same instinct as pigment
// names over hex). One dimension — pace — bundles orbit speed, dwell,
// breath, and tween together; the moment presets grow independent knobs
// they're sliders with extra steps.
//
// URL contract: ?ambient=<paceId> arms DRIFT at that pace (the URL is the
// real kiosk control panel — a wall display is configured once by whoever
// sets it up). ?ambient=1 is accepted as the default pace for the original
// arm syntax. Dev tuning happens via ?tune=1 (AmbientTunePanel), which
// overrides the active preset's values live.

export type PaceId = 'stroll' | 'drift' | 'sweep'

export interface PaceValues {
  /** Orbit angular velocity, degrees per second. */
  orbitDegPerS: number
  /** Per-event dwell, ms (includes the flight). */
  dwellMs: number
  /** Citywide breath between passes, ms. */
  breathMs: number
  /** S-curve leg duration between camera targets, ms. */
  tweenMs: number
  /** Ambient pitch floor — cruise pitch = max(armed pitch, this). */
  pitchMin: number
}

export interface PacePreset extends PaceValues {
  id: PaceId
  label: string
  hint: string
}

export const PACE_PRESETS: Record<PaceId, PacePreset> = {
  stroll: {
    id: 'stroll',
    label: 'Stroll',
    hint: 'gallery wall',
    orbitDegPerS: 0.8,
    dwellMs: 18000,
    breathMs: 14000,
    tweenMs: 3400,
    pitchMin: 50,
  },
  drift: {
    id: 'drift',
    label: 'Drift',
    hint: 'default',
    orbitDegPerS: 1.2,
    dwellMs: 12000,
    breathMs: 10000,
    tweenMs: 2600,
    pitchMin: 50,
  },
  sweep: {
    id: 'sweep',
    label: 'Sweep',
    hint: 'wire desk',
    orbitDegPerS: 1.8,
    dwellMs: 7000,
    breathMs: 7000,
    tweenMs: 1800,
    pitchMin: 50,
  },
}

export const DEFAULT_PACE_ID: PaceId = 'drift'

/** Parse ?ambient= → pace id, or null when DRIFT is off.
 *  '1' (the original arm syntax) maps to the default pace. */
export function parsePaceId(s: string | null): PaceId | null {
  if (s === '1') return DEFAULT_PACE_ID
  if (s === 'stroll' || s === 'drift' || s === 'sweep') return s
  return null
}
