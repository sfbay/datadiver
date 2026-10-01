// src/views/Trees/trunkScale.ts
//
// The trunk-size scale mark (ruling R24): three equal steps — 10 inches or
// narrower · 11 to 20 · 21 or wider — with the tree's step filled and, when
// the inches are known, a tick at the tree's place inside that step. One pure
// spec + one geometry feed BOTH renderers: `trunkScaleHtml` (the Mapbox hover
// card, which is outside React) and `<TrunkScaleMark>` (the tree card). Not
// measured = three hollow dashed steps (the hollow idiom for "not known").
//
// Sizes are in 1/16-rem units (one unit = 1px at the default type scale) and
// emitted as rem, so Large Type scales the mark with the text around it.
// Colours are literal hex (the popup cannot read Tailwind classes); the tick
// is `currentColor`, so it takes the surrounding ink on either theme.

import { TRUNK_LABEL, type TrunkClass } from '@/lib/trees/trunk'
import { trunkScaleSentence } from './treesPhrase'

export type TrunkStep = Exclude<TrunkClass, 'unmeasured'>
export const TRUNK_STEPS: readonly TrunkStep[] = ['small', 'medium', 'large']

/** moss-500 — the tree's own step. */
export const SCALE_ACTIVE = '#7a9954'
/** paper-500 — the other steps (a dim fill) and the not-measured outline.
 *  A mid tone, so it reads on the cream AND the espresso tooltip. */
export const SCALE_MUTED = '#a8926a'
export const SCALE_MUTED_OPACITY = 0.4

/** Inches at the right end of each step. The last step clamps at 60, so a
 *  126-inch record sits at the right end instead of off the mark. */
const STEP_RANGE: Readonly<Record<TrunkStep, readonly [number, number]>> = {
  small: [0, 10],
  medium: [11, 20],
  large: [21, 60],
}

export interface TrunkScaleSpec {
  steps: { key: TrunkStep; label: string; active: boolean }[]
  /** 0..1 across the whole scale; only when the inches are known. */
  tick: number | null
  measured: boolean
  /** The sentence the mark replaces — its aria-label. */
  sentence: string
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

export function trunkScaleSpec(cls: TrunkClass, inches: number | null): TrunkScaleSpec {
  const measured = cls !== 'unmeasured'
  const steps = TRUNK_STEPS.map((key) => ({ key, label: TRUNK_LABEL[key], active: key === cls }))
  let tick: number | null = null
  if (measured && inches !== null && Number.isFinite(inches)) {
    const i = TRUNK_STEPS.indexOf(cls)
    const [lo, hi] = STEP_RANGE[cls]
    tick = (i + clamp01((inches - lo) / (hi - lo))) / 3
  }
  return { steps, tick, measured, sentence: trunkScaleSentence(cls, measured ? inches : null) }
}

// ── geometry (shared by both renderers) ────────────────────────────────────

export interface ScaleSize {
  /** Whole mark width, 1/16-rem units. */
  width: number
  /** Track height, 1/16-rem units. */
  track: number
  /** Gap between steps, 1/16-rem units. */
  gap: number
}
/** The hover card: 4.5rem × 0.375rem track. */
export const TOOLTIP_SCALE: ScaleSize = { width: 72, track: 6, gap: 3 }
/** The tree card: 9rem × 0.5rem track. */
export const CARD_SCALE: ScaleSize = { width: 144, track: 8, gap: 4 }

/** The tick rises this far above and below the track. */
const OVERHANG = 2
const TICK_W = 1.5

export interface ScaleGeometry {
  width: number
  height: number
  segments: { key: TrunkStep; x: number; y: number; w: number; h: number; active: boolean }[]
  tick: { x: number; y1: number; y2: number; w: number } | null
  /** Not measured: the steps draw as dashed outlines. */
  hollow: boolean
}

export function trunkScaleGeometry(spec: TrunkScaleSpec, size: ScaleSize): ScaleGeometry {
  const height = size.track + 2 * OVERHANG
  const w = (size.width - 2 * size.gap) / 3
  const segments = spec.steps.map((s, i) => ({
    key: s.key, x: i * (w + size.gap), y: OVERHANG, w, h: size.track, active: s.active,
  }))
  let tick: ScaleGeometry['tick'] = null
  const ai = spec.steps.findIndex((s) => s.active)
  if (spec.tick !== null && ai >= 0) {
    // Placed INSIDE the active step (never in a gap): 10 in sits at the small
    // step's right end, 11 in at the medium step's left end.
    const local = clamp01(spec.tick * 3 - ai)
    const seg = segments[ai]
    const x = seg.x + Math.min(seg.w - TICK_W / 2, Math.max(TICK_W / 2, local * seg.w))
    tick = { x, y1: 0, y2: height, w: TICK_W }
  }
  return { width: size.width, height, segments, tick, hollow: !spec.measured }
}

// ── the HTML renderer (Mapbox hover card) ──────────────────────────────────

const rem = (units: number) => `${+(units / 16).toFixed(4)}rem`
const n = (x: number) => +x.toFixed(3)
const attr = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/** An inline SVG string; `role="img"` with the sentence as its aria-label. */
export function trunkScaleHtml(spec: TrunkScaleSpec, size: ScaleSize = TOOLTIP_SCALE): string {
  const g = trunkScaleGeometry(spec, size)
  const rects = g.segments.map((s) => {
    if (g.hollow) {
      return `<rect data-step="${s.key}" x="${n(s.x + 0.5)}" y="${n(s.y + 0.5)}" width="${n(s.w - 1)}" height="${n(s.h - 1)}" rx="1" fill="none" stroke="${SCALE_MUTED}" stroke-width="1" stroke-dasharray="2 1.5"/>`
    }
    return s.active
      ? `<rect data-step="${s.key}" x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}" rx="1" fill="${SCALE_ACTIVE}"/>`
      : `<rect data-step="${s.key}" x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}" rx="1" fill="${SCALE_MUTED}" fill-opacity="${SCALE_MUTED_OPACITY}"/>`
  })
  const tick = g.tick
    ? `<line x1="${n(g.tick.x)}" x2="${n(g.tick.x)}" y1="${g.tick.y1}" y2="${g.tick.y2}" stroke="currentColor" stroke-width="${g.tick.w}" stroke-linecap="round"/>`
    : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${attr(spec.sentence)}" viewBox="0 0 ${g.width} ${g.height}" ` +
    `style="display:block;width:${rem(g.width)};height:${rem(g.height)};overflow:visible">${rects.join('')}${tick}</svg>`
  )
}
