// src/utils/cameraPadding.ts
//
// "Center the map on a selection" should mean the center of the VISIBLE map,
// not the viewport. Every map view in DataDiver opens a click-driven detail
// panel (DetailPanelShell, anchored `absolute top-5 right-5`) that covers a
// right-side band of the map; a viewport-centered selection lands underneath
// the very card describing it.
//
// This is the generalized form of the fix first built for The Last 48
// (src/views/Last48/cameraPadding.ts, now a thin wrapper over this). The band
// is computed from the card's known width rather than measured from the DOM:
// at flyTo time the card for a fresh selection hasn't been committed by React
// yet, so there is nothing to measure.
//
// The one knob that varies per view is the card width: Last48EventCard is
// responsive (clamp(260px,22vw,320px)); the other panels are fixed
// (DetailPanelShell defaults to w-72 = 288px, CrimeDetailPanel overrides to
// w-80 = 320px). Callers pass their card's pixel width.

import type mapboxgl from 'mapbox-gl'
import { isMobileViewport } from '@/hooks/useIsMobile'

const CARD_RIGHT_ANCHOR_PX = 20 // DetailPanelShell `right-5`
const GUTTER_PX = 24
const SHEET_VH = 0.7 // detail bottom-sheet height on mobile (DetailPanelShell max-h-[70vh])

/** Pure core (no DOM): the width of the right-side map band a top-right card
 *  of `cardWidthPx` occludes, clamped to half the map so narrow viewports keep
 *  a usable center. Split out so the band math is unit-testable without a real
 *  Mapbox map. */
export function rightBandWidth(cardWidthPx: number, mapWidthPx: number): number {
  return Math.min(cardWidthPx + CARD_RIGHT_ANCHOR_PX + GUTTER_PX, Math.floor(mapWidthPx * 0.5))
}

/** Pure core (no DOM): the height of the bottom band a bottom-sheet of
 *  `sheetHeightPx` occludes, clamped to 60% of the map so the band above it
 *  stays usable. The mobile counterpart of {@link rightBandWidth}. */
export function bottomBandHeight(sheetHeightPx: number, mapHeightPx: number): number {
  return Math.min(sheetHeightPx, Math.floor(mapHeightPx * 0.6))
}

/** Map adapter for {@link rightBandWidth}. */
export function obstructedRightBand(map: mapboxgl.Map, cardWidthPx: number): number {
  return rightBandWidth(cardWidthPx, map.getContainer().clientWidth)
}

/** Offset for map.flyTo so the target lands centered in the unobstructed
 *  region left of the detail card. Stateless — unlike camera `padding`, an
 *  offset applies to this animation only, so nothing needs resetting when the
 *  card closes. */
export function eventFlyToOffset(map: mapboxgl.Map, cardWidthPx: number): [number, number] {
  // Mobile: the detail panel is a BOTTOM sheet, not a right-side card. Shift the
  // target UP so it lands in the visible band above the sheet (a vertical offset
  // instead of the desktop horizontal one).
  if (isMobileViewport()) {
    const mapH = map.getContainer().clientHeight
    const band = bottomBandHeight(mapH * SHEET_VH, mapH)
    return [0, -band / 2]
  }
  return [-obstructedRightBand(map, cardWidthPx) / 2, 0]
}
