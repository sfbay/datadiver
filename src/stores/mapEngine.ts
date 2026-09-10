//
// Pure hydration + coercion logic for the map-engine preference, split out
// of appStore.ts for the same reason as typeScale.ts: appStore touches
// window/localStorage at module eval and is unimportable under the
// node-only Vitest; this leaf has no DOM dependency, so it is testable.
//
// Three engines: 'classic' (today's Mapbox dark/light v11), 'standard'
// (Mapbox Standard 3D — Spec B, not shipped), 'photoreal' (Cesium + Google
// Photorealistic 3D Tiles — a mode of The Last 48 only). The PREFERENCE is
// what the reader picked; the EFFECTIVE engine is what this route, device
// and key can honour. Never render from the preference directly.
export type MapEngine = 'classic' | 'standard' | 'photoreal'

const VALID: MapEngine[] = ['classic', 'standard', 'photoreal']

export const MAP_ENGINE_STORAGE_KEY = 'dd-map-engine'

/** Flip to true when Spec B (Mapbox Standard site-wide) ships. Until then a
 *  stored 'standard' preference renders classic and the picker hides it. */
export const STANDARD_SHIPPED = false

/** Allow-list parse of the raw localStorage value; anything else → classic. */
export function parseMapEngine(raw: string | null): MapEngine {
  return VALID.includes(raw as MapEngine) ? (raw as MapEngine) : 'classic'
}

export interface EngineContext {
  /** Effective-width mobile (useIsMobile). Photoreal is desktop-only. */
  isMobile: boolean
  /** Route-derived view id (RouteIdentity.viewId is a plain string);
   *  photoreal exists only on The Last 48. */
  viewId: string | null
  /** VITE_GOOGLE_TILES_KEY present. No key → photoreal is never offered. */
  hasKey: boolean
}

/** The engine this route/device/key can actually honour. */
export function effectiveMapEngine(pref: MapEngine, ctx: EngineContext): MapEngine {
  if (pref === 'photoreal') {
    return ctx.viewId === 'live' && !ctx.isMobile && ctx.hasKey ? 'photoreal' : 'classic'
  }
  if (pref === 'standard') return STANDARD_SHIPPED ? 'standard' : 'classic'
  return 'classic'
}
