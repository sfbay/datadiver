// src/views/Last48/cameraPadding.ts
//
// Last48-flavored wrapper over the shared camera-padding util
// (src/utils/cameraPadding.ts). The shared util takes an explicit card width;
// The Last 48's event card is the one RESPONSIVE panel in the app
// (Last48EventCard widthClass = w-[clamp(260px,22vw,320px)]), so this wrapper
// computes that width and forwards it — preserving the zero-arg call sites in
// Last48UnifiedView and the ambient-drift director (useAmbientDirector reuses
// obstructedRightBand for its own per-frame framing math).
//
// The constants below MUST mirror Last48EventCard's widthClass and
// DetailPanelShell's right-5 anchor (the anchor + gutter now live in the
// shared util).

import type mapboxgl from 'mapbox-gl'
import {
  obstructedRightBand as sharedObstructedRightBand,
  eventFlyToOffset as sharedEventFlyToOffset,
} from '@/utils/cameraPadding'

const CARD_MIN_PX = 260
const CARD_MAX_PX = 320
const CARD_VW = 0.22

/** Last48EventCard's responsive width: clamp(260px, 22vw, 320px). */
function last48CardWidthPx(): number {
  return Math.min(CARD_MAX_PX, Math.max(CARD_MIN_PX, window.innerWidth * CARD_VW))
}

/** Width of the right-side map band covered by The Last 48's event card. */
export function obstructedRightBand(map: mapboxgl.Map): number {
  return sharedObstructedRightBand(map, last48CardWidthPx())
}

/** Offset for map.flyTo so the target lands clear of the event card. */
export function eventFlyToOffset(map: mapboxgl.Map): [number, number] {
  return sharedEventFlyToOffset(map, last48CardWidthPx())
}
