// src/views/Trees/hoverCard.ts
//
// The map's hover card (ruling R24), as an HTML string for useMapTooltip.
// A tree: the species as a small display headline (Fraunces, upright like the
// tree card's title — no mono eyebrow), the trunk-size scale mark, then the
// words once — the label in the mono label register, the value in the body
// serif. A stump: the headline "Stump" and one body line. Every data string
// is escaped; every size is rem (Large Type scales it).

import { TRUNK_LABEL, type TrunkClass } from '@/lib/trees/trunk'
import { STUMP_LEGEND, TRUNK_HEADING, kindTitle } from './treesPhrase'
import { trunkScaleHtml, trunkScaleSpec } from './trunkScale'

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

const HEADLINE =
  "font-family:var(--font-display,'Fraunces Variable',Georgia,serif);font-size:1.1rem;line-height:1.15;" +
  'letter-spacing:-0.02em;font-weight:500;color:inherit;max-width:12rem;text-transform:none'
const BODY = "font-family:var(--font-body,'Roboto Serif Variable',Georgia,serif);font-size:0.75rem;line-height:1.35;color:inherit"

const headline = (text: string) => `<div style="${HEADLINE}">${esc(text)}</div>`

/** A tree's card. `cls` undefined (no trunk class on the feature) → headline only. */
export function treeHoverHtml(name: string, cls: TrunkClass | undefined): string {
  if (!cls) return headline(name)
  return (
    headline(name) +
    `<div style="margin-top:0.4rem">${trunkScaleHtml(trunkScaleSpec(cls, null))}</div>` +
    `<div class="tooltip-label" style="margin-top:0.35rem;margin-bottom:0">${esc(TRUNK_HEADING)}</div>` +
    `<div style="${BODY}">${esc(TRUNK_LABEL[cls])}</div>`
  )
}

export function stumpHoverHtml(): string {
  return headline(kindTitle('stump')) + `<div style="${BODY};margin-top:0.2rem">${esc(STUMP_LEGEND)}</div>`
}
