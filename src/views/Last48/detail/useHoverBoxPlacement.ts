// src/views/Last48/detail/useHoverBoxPlacement.ts
//
// Two exports:
//   useHoverBoxTracking — keeps a viewport position in sync with a geo
//     coordinate as the user pans / zooms the map.
//   computePlacement — given an anchor point (x,y) and the popover
//     element's current dimensions, returns the top-left translate3d
//     offset that keeps the popover fully visible within the viewport.

import { useEffect, useState } from 'react'
import type mapboxgl from 'mapbox-gl'
import type { NormalizedEvent } from '@/types/last48'

// ---------------------------------------------------------------------------
// Tracking hook — re-projects when map moves/zooms
// ---------------------------------------------------------------------------

export function useHoverBoxTracking(
  map: mapboxgl.Map | null,
  event: NormalizedEvent | null,
): { x: number; y: number } | null {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!map || !event || event.longitude == null || event.latitude == null) {
      setPos(null)
      return
    }
    const sync = () => {
      const p = map.project([event.longitude!, event.latitude!])
      setPos({ x: p.x, y: p.y })
    }
    sync()
    map.on('move', sync)
    map.on('zoom', sync)
    return () => {
      map.off('move', sync)
      map.off('zoom', sync)
    }
  }, [map, event])

  return pos
}

// ---------------------------------------------------------------------------
// Placement helper — viewport-edge-aware positioning
// ---------------------------------------------------------------------------

/**
 * Given an anchor (the map dot's screen position) and the popover element,
 * return the {x,y} top-left offset to pass to `translate3d` so the popover:
 * - appears to the right of the anchor by default (or to the left if needed)
 * - is clamped so it never overflows the viewport edges
 */
export function computePlacement(
  anchor: { x: number; y: number },
  popoverEl: HTMLElement | null,
  preferredSide: 'right' | 'left' | 'top' | 'bottom' = 'right',
): { x: number; y: number } {
  const POPOVER_WIDTH  = popoverEl?.offsetWidth  ?? 280
  const POPOVER_HEIGHT = popoverEl?.offsetHeight ?? 240
  const GAP  = 14   // px between anchor and popover edge
  const EDGE = 8    // minimum clearance from viewport edge
  const vw   = window.innerWidth
  const vh   = window.innerHeight

  let x: number
  let y: number

  if (preferredSide === 'right' || preferredSide === 'left') {
    // Attempt preferred side, flip if it would overflow.
    const rightX = anchor.x + GAP
    const leftX  = anchor.x - POPOVER_WIDTH - GAP

    if (preferredSide === 'right' && rightX + POPOVER_WIDTH <= vw - EDGE) {
      x = rightX
    } else if (leftX >= EDGE) {
      x = leftX
    } else {
      // Neither side fits cleanly — prefer right, clamp to viewport.
      x = Math.max(EDGE, Math.min(rightX, vw - POPOVER_WIDTH - EDGE))
    }

    // Vertically centred on the dot, clamped to viewport.
    y = anchor.y - POPOVER_HEIGHT / 2
  } else {
    // top / bottom: centre horizontally on anchor.
    x = anchor.x - POPOVER_WIDTH / 2

    const belowY = anchor.y + GAP
    const aboveY = anchor.y - POPOVER_HEIGHT - GAP

    if (preferredSide === 'bottom' && belowY + POPOVER_HEIGHT <= vh - EDGE) {
      y = belowY
    } else if (aboveY >= EDGE) {
      y = aboveY
    } else {
      y = Math.max(EDGE, belowY)
    }
  }

  // Final clamp — keeps the popover fully on-screen regardless of side.
  x = Math.max(EDGE, Math.min(x, vw - POPOVER_WIDTH - EDGE))
  y = Math.max(EDGE, Math.min(y, vh - POPOVER_HEIGHT - EDGE))

  return { x, y }
}

// ---------------------------------------------------------------------------
// Media-query hook — one-liner used by HoverBox for bottom-sheet detection
// ---------------------------------------------------------------------------

import { useCallback } from 'react'

export function useMediaQuery(query: string): boolean {
  const getMatch = useCallback(() => window.matchMedia(query).matches, [query])
  const [matches, setMatches] = useState(getMatch)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    setMatches(mql.matches)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}
