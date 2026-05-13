// src/views/Last48/modes/FlowSelectedRadar.tsx
//
// Single SVG element positioned over the selected event's map dot.
// Synced to map.project() on every move/zoom. Reuses the radar-sweep
// keyframe from src/index.css (PR #21 precedent). Decorative only —
// motion-reduce:hidden so reduced-motion users get the simple cream
// ring from FlowMapLayer instead.
//
// transformOrigin must be set inline — SVG transform-origin semantics
// differ from CSS box-model. Without it the wedge rotates from a corner.

import { useEffect, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import type { NormalizedEvent } from '@/types/last48'

interface Props {
  map: mapboxgl.Map | null
  event: NormalizedEvent | null
}

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

  return (
    <svg
      className="pointer-events-none fixed z-20 motion-reduce:hidden"
      width="96"
      height="96"
      viewBox="0 0 96 96"
      style={{ left: pos.x - 48, top: pos.y - 48 }}
      aria-hidden
    >
      <defs>
        <radialGradient id="radar-grad" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="rgba(245,236,217,0)" />
          <stop offset="88%" stopColor="rgba(245,236,217,0.5)" />
          <stop offset="100%" stopColor="rgba(245,236,217,0)" />
        </radialGradient>
      </defs>

      {/* Outer ring */}
      <circle
        cx="48"
        cy="48"
        r="34"
        fill="none"
        stroke="rgba(245,236,217,0.45)"
        strokeWidth="1"
      />

      {/* Faint farther ring */}
      <circle
        cx="48"
        cy="48"
        r="44"
        fill="none"
        stroke="rgba(245,236,217,0.2)"
        strokeWidth="0.5"
      />

      {/* Rotating sweep wedge — transformOrigin must be the SVG center */}
      <g
        className="radar-sweep"
        style={{ transformOrigin: '48px 48px' }}
      >
        <path
          d="M48,48 L48,4 A44,44 0 0,1 84,28 Z"
          fill="url(#radar-grad)"
        />
      </g>
    </svg>
  )
}
