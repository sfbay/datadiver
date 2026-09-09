// The credit must fit the pill, on every live view.
//
// The pill's whole job is to carry the credit into a screenshot, so a face that
// overflows its clamp does not degrade gracefully — it truncates mid-phrase and
// the words "via DataDiver" are the first thing lost. That shipped: measured in
// Chrome on 2026-09-09, business-activity's face wanted 340px inside a 224px
// clamp, and nine of the twenty-four live faces were being cut off.
//
// This test is a cheap proxy for that measurement — it cannot run a browser, so
// it budgets characters instead of pixels, using a per-character width measured
// from the real rendered pill (31 chars of text-micro mono = 180px, so 5.81px
// per character) plus the pill's fixed furniture (padding, gap, chevron = 33px).
// If a new publisher name or portal name pushes a face past the desktop clamp,
// this fails here rather than in a reader's exported PNG.
import { describe, it, expect } from 'vitest'
import { CITIES } from '@/cities/registry'
import { liveManifest } from '@/cities/manifest'
import { summarizeSources, pillFace } from './sourceLine'

/** Measured in Chrome, text-micro (10px) Space Mono, 2026-09-09. */
const PX_PER_CHAR = 5.81
/** px-2.5 ×2 + gap-1.5 + the 7px chevron, measured on the same pill. */
const PILL_FURNITURE_PX = 33
/** `desk:max-w-[22rem]` on the trigger. */
const DESKTOP_CLAMP_PX = 22 * 16

const faces = () => {
  const out: { view: string; face: string; px: number }[] = []
  for (const city of Object.values(CITIES)) {
    for (const entry of liveManifest(city.manifest)) {
      if (!entry.sources?.length && !entry.staticSources?.length) continue
      const face = pillFace(summarizeSources(city.id, entry))
      out.push({
        view: `${city.id}/${entry.viewId}`,
        face,
        px: Math.ceil(face.length * PX_PER_CHAR) + PILL_FURNITURE_PX,
      })
    }
  }
  return out
}

describe('pill face width', () => {
  it('every live view\'s credit fits the desktop clamp', () => {
    const tooWide = faces()
      .filter((f) => f.px > DESKTOP_CLAMP_PX)
      .map((f) => `${f.view}: ~${f.px}px > ${DESKTOP_CLAMP_PX}px — "${f.face}"`)
    expect(tooWide, 'shorten the publisher short form, or raise the clamp').toEqual([])
  })

  it('every face still ends in the credit, so a clip would be visible', () => {
    for (const f of faces()) expect(f.face.endsWith('via DataDiver'), f.view).toBe(true)
  })
})
