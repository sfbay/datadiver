// src/views/Last48/photoreal/quality.ts
//
// The photoreal renderer's PERFORMANCE knobs, in one place. Pure (no Cesium
// import) so the defaults and the clamps are node-tested; Last48Photoreal
// applies them to the viewer/tileset and the ?tune=1 panel edits them live.
//
// Why these five (measured on Jesse's M3 MacBook Pro, 2026-09-10: 25–45 fps
// in an orbit with the hero up, 67 without — readers' machines are slower):
//   fpsCap        Cesium otherwise races the display; at a 1°/s orbit nobody
//                 can tell 30 from 60, and the GPU rests half the time.
//   sseOrbit      tile detail while resting/orbiting (lower = finer = more
//                 tiles). In flight the director always uses SSE_FLIGHT (40).
//   resolution    render-buffer scale; retina pixels are the other big cost.
//   foveation     coarser tiles away from the screen centre (Cesium's
//                 foveated screen-space-error relaxation; 0 = off).
//   dynamicSse    coarser tiles toward the horizon at this pitch.
export interface Quality {
  fpsCap: number
  sseOrbit: number
  resolution: number
  foveation: number
  dynamicSse: boolean
}

export const QUALITY_DEFAULT: Quality = {
  fpsCap: 30,
  sseOrbit: 14,
  resolution: 0.55,
  foveation: 8,
  dynamicSse: true,
}

/** Slider ranges for the ?tune=1 panel. */
export const QUALITY_RANGE = {
  fpsCap: { min: 15, max: 60, step: 5 },
  sseOrbit: { min: 6, max: 30, step: 1 },
  resolution: { min: 0.35, max: 1, step: 0.05 },
  foveation: { min: 0, max: 20, step: 1 },
} as const

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Clamp a partial edit into a valid Quality (sliders + a future URL knob). */
export function normalizeQuality(q: Partial<Quality>, base: Quality = QUALITY_DEFAULT): Quality {
  const r = QUALITY_RANGE
  return {
    fpsCap: clamp(Number.isFinite(q.fpsCap ?? NaN) ? (q.fpsCap as number) : base.fpsCap, r.fpsCap.min, r.fpsCap.max),
    sseOrbit: clamp(Number.isFinite(q.sseOrbit ?? NaN) ? (q.sseOrbit as number) : base.sseOrbit, r.sseOrbit.min, r.sseOrbit.max),
    resolution: clamp(Number.isFinite(q.resolution ?? NaN) ? (q.resolution as number) : base.resolution, r.resolution.min, r.resolution.max),
    foveation: clamp(Number.isFinite(q.foveation ?? NaN) ? (q.foveation as number) : base.foveation, r.foveation.min, r.foveation.max),
    dynamicSse: typeof q.dynamicSse === 'boolean' ? q.dynamicSse : base.dynamicSse,
  }
}

/** The LIVE settings the director and the shell read. Module-level on
 *  purpose: the director sets tile detail inside a Cesium flight callback,
 *  outside React's render cycle, and must see the latest slider value. */
export const quality: Quality = { ...QUALITY_DEFAULT }

export function setQuality(patch: Partial<Quality>): Quality {
  Object.assign(quality, normalizeQuality(patch, quality))
  return quality
}
