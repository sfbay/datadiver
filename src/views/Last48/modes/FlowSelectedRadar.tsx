// src/views/Last48/modes/FlowSelectedRadar.tsx
//
// SVG overlay positioned over the selected event's map dot. Two staggered
// cream rings emanate outward (scale up + fade), creating a sonar-ping
// rhythm that says "this one is selected" without the busier rotation of
// a radar sweep. The static cream ring on the map dot (from FlowMapLayer's
// SELECTED_RING_ID layer) provides the anchor; this overlay adds the
// breathing motion on top.
//
// motion-reduce:hidden — under prefers-reduced-motion, only the static
// cream ring remains. The emanation is decorative reinforcement.
//
// transformBox: view-box is critical for SVG scaling to pivot on the
// viewBox center (60,60) rather than each circle's bounding box.

import { useEffect, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import type { NormalizedEvent } from '@/types/last48'

interface Props {
  map: mapboxgl.Map | null
  event: NormalizedEvent | null
}

const RING_SIZE = 120

export default function FlowSelectedRadar({ map, event }: Props) {
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

  if (!pos || !event) return null

  const center = RING_SIZE / 2

  // Clip to the map bounds (see FlowArrivalRipples for the rationale): a
  // selected dot near an edge would otherwise emanate its ring ~60px past the
  // map and over the rail. This inset-0 overflow-hidden layer masks it.
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg
        className="pointer-events-none absolute z-20 motion-reduce:hidden"
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        style={{ left: pos.x - center, top: pos.y - center }}
        aria-hidden
      >
        {/* First emanation — leading ping */}
        <circle
          cx={center}
          cy={center}
          r="18"
          fill="none"
          stroke="rgba(245,236,217,0.75)"
          strokeWidth="1.5"
          style={{
            transformBox: 'view-box',
            transformOrigin: `${center}px ${center}px`,
            animation: 'emanate 1.9s ease-out infinite',
          }}
        />

        {/* Second emanation — staggered, slightly fainter */}
        <circle
          cx={center}
          cy={center}
          r="18"
          fill="none"
          stroke="rgba(245,236,217,0.55)"
          strokeWidth="1"
          style={{
            transformBox: 'view-box',
            transformOrigin: `${center}px ${center}px`,
            animation: 'emanate 1.9s ease-out 0.95s infinite',
          }}
        />
      </svg>
    </div>
  )
}
