// src/views/Last48/modes/anomalyRamp.ts
//
// Pure module for the anomaly choropleth: the stream-combine math and the
// continuous color ramp presets. No React, no mapbox-gl import — everything
// here is plain data + arithmetic so it can be unit-tested.
//
// Each preset is defined ONCE as a stops array; both the Mapbox
// ['interpolate'] expression and the legend's CSS gradient derive from it,
// so the map and its legend cannot drift apart.
//
// The z stops are deliberately consonant with the Pulse thresholds
// documented at /about#whats-unusual (pulsePhrase.ts): a fill reaches full
// ochre at z 1.5 (where Pulse starts reporting a volume anomaly), shifts
// terracotta at 1.9 and brick at 2.6 (the Pulse magnitude tiers), and the
// quiet side saturates teal toward −2.6. Same color = same deviation,
// every day — which is why these are FIXED stops, not percentile-anchored
// like the demographic underlay (home value is a relative story; an
// anomaly z has absolute meaning on an evidence view).

/** Combine per-stream z-scores into one neighborhood score — Stouffer's
 *  method: sum / √k. Unlike the arithmetic mean (which shrinks the spread
 *  by 1/√k and made the old choropleth near-flat), the combined value is
 *  itself a z-score under independence, so the ramp's absolute stops keep
 *  their meaning regardless of how many streams contributed. */
export function combineZ(zs: number[]): number {
  if (zs.length === 0) return 0
  const sum = zs.reduce((a, b) => a + b, 0)
  return sum / Math.sqrt(zs.length)
}

/** One color stop on the ramp. `color` must be an rgba() string — fades to
 *  transparent MUST use the same hue at alpha 0 (never fade toward a dark
 *  color: the alpha-only-fade lesson from the compliance trapezoids). */
export interface RampStop {
  z: number
  color: string
}

export interface AnomalyRampPreset {
  id: string
  label: string
  /** One-line intent note, shown in the dev switcher. */
  note: string
  stops: RampStop[]
  /** Master fill opacity. Anomaly mode is the HERO fill (dots are off on a
   *  Pulse arrival), not an underlay — so these run above the demographic
   *  underlay's 0.22. */
  fillOpacity: number
  /** Whether the ramp paints the quiet (below-typical) side. Drives the
   *  legend labels. */
  quietSide: boolean
}

// Pigments (earth-tone tokens): teal-500 #5c9693, ochre-500 #d4a435,
// terracotta (bright, dark-basemap-legible) #d47149, brick-600 #963e30,
// brick-700 #6f2b20.
const TEAL = (a: number) => `rgba(92,150,147,${a})`
const OCHRE = (a: number) => `rgba(212,164,53,${a})`
const TERRACOTTA = (a: number) => `rgba(212,113,73,${a})`
const BRICK = (a: number) => `rgba(150,62,48,${a})`
const BRICK_DEEP = (a: number) => `rgba(111,43,32,${a})`

// The 2026-07-02 ramp study (in-map ?ramp= switcher, live data, dark + light)
// settled on DIVERGING. What the losing candidates taught, so nobody
// re-proposes them: "diverging-soft" (same stops @ 0.24) was too wispy for a
// hero fill — the underlay's 0.22 register only works UNDER dots; and both
// warm-only presets were functionally INVISIBLE, because on a typical
// afternoon no neighborhood sits far enough above usual to paint — the quiet
// side carries the map's texture much of the time. A busy-only anomaly map
// reads as broken, not calm.
export const RAMP_PRESETS: AnomalyRampPreset[] = [
  {
    id: 'diverging',
    label: 'Diverging',
    note: 'teal quiet ↔ warm busy, anchored transparent at typical',
    stops: [
      { z: -2.6, color: TEAL(1) },
      { z: -0.5, color: TEAL(0) },
      { z: 0.5, color: OCHRE(0) },
      { z: 1.5, color: OCHRE(1) },
      { z: 1.9, color: TERRACOTTA(1) },
      { z: 2.6, color: BRICK(1) },
    ],
    fillOpacity: 0.35,
    quietSide: true,
  },
]

export const DEFAULT_RAMP_ID = 'diverging'

export function getRampPreset(id?: string | null): AnomalyRampPreset {
  return RAMP_PRESETS.find((p) => p.id === id) ?? RAMP_PRESETS.find((p) => p.id === DEFAULT_RAMP_ID)!
}

/** The Mapbox fill-color expression for a preset — a continuous linear
 *  interpolate over the feature's zScore (values beyond the end stops
 *  clamp, per Mapbox interpolate semantics). Plain array, no mapbox-gl
 *  types, so this module stays pure; the layer casts at the call site. */
export function rampFillColor(preset: AnomalyRampPreset): unknown[] {
  return [
    'interpolate',
    ['linear'],
    ['get', 'zScore'],
    ...preset.stops.flatMap((s) => [s.z, s.color]),
  ]
}

/** CSS linear-gradient mirroring the same stops, for the legend. Positions
 *  map the z domain [first stop, last stop] onto 0–100%. */
export function rampCssGradient(preset: AnomalyRampPreset): string {
  const min = preset.stops[0].z
  const max = preset.stops[preset.stops.length - 1].z
  const span = max - min || 1
  const parts = preset.stops.map(
    (s) => `${s.color} ${(((s.z - min) / span) * 100).toFixed(1)}%`,
  )
  return `linear-gradient(to right, ${parts.join(', ')})`
}

/** Where "typical" (z = 0) sits on the legend gradient, as a 0–100 %.
 *  Null when the ramp doesn't include z 0 in its domain (warm-only ramps
 *  start above it — their legend anchors "typical" at the left edge). */
export function rampTypicalPercent(preset: AnomalyRampPreset): number | null {
  const min = preset.stops[0].z
  const max = preset.stops[preset.stops.length - 1].z
  if (min > 0 || max < 0) return null
  return ((0 - min) / (max - min || 1)) * 100
}
