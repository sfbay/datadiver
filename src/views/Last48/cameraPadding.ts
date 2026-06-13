// src/views/Last48/cameraPadding.ts
//
// "Center on the event" should mean the center of the VISIBLE map, not the
// viewport. The event detail card (DetailPanelShell, top-right, up to 80vh
// tall) covers a right-side band of the map; on squarish viewports (e.g. an
// unfolded Pixel) a viewport-centered dot lands underneath it.
//
// The band is computed from the card's known width formula rather than
// measured from the DOM: at flyTo time the card for a fresh selection hasn't
// been committed by React yet, so there is nothing to measure. The constants
// MUST mirror Last48EventCard's widthClass (w-[clamp(260px,22vw,320px)])
// and DetailPanelShell's right-5 anchor.
//
// The ambient-drift camera director (see spec 2026-06-12) reuses
// obstructedRightBand for its own per-frame framing math.

import type mapboxgl from 'mapbox-gl'

const CARD_MIN_PX = 260
const CARD_MAX_PX = 320
const CARD_VW = 0.22
const CARD_RIGHT_ANCHOR_PX = 20 // DetailPanelShell `right-5`
const GUTTER_PX = 24

/** Width of the right-side map band covered by the event detail card,
 *  clamped to half the map so narrow viewports keep a usable center. */
export function obstructedRightBand(map: mapboxgl.Map): number {
  const cardW = Math.min(CARD_MAX_PX, Math.max(CARD_MIN_PX, window.innerWidth * CARD_VW))
  const mapW = map.getContainer().clientWidth
  return Math.min(cardW + CARD_RIGHT_ANCHOR_PX + GUTTER_PX, Math.floor(mapW * 0.5))
}

/** Offset for map.flyTo so the target lands centered in the unobstructed
 *  region left of the detail card. Stateless — unlike camera `padding`,
 *  an offset applies to this animation only, so nothing needs resetting
 *  when the card closes. */
export function eventFlyToOffset(map: mapboxgl.Map): [number, number] {
  return [-obstructedRightBand(map) / 2, 0]
}
