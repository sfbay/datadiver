// src/views/Last48/modes/FlowArrivalRipples.tsx
//
// Transient emanation rings for editorially-significant 911 arrivals
// (priority-A and newly-opened calls). Each ring is an SVG overlay
// positioned over the event's map dot, reusing the `emanate` keyframe
// from src/index.css.
//
// Design note (civic observatory aesthetic):
//   - One clean ring per event — not a burst, not a multi-ring storm.
//   - indigo-300 stroke to distinguish arrivals from the cream selection ring.
//   - motion-reduce:hidden — under prefers-reduced-motion, arrival emphasis
//     is conveyed by the priority-A dot's larger size alone.
//
// Lifecycle: each ripple receives a `bornAt` timestamp; after 1.9s (the
// animation duration) the ring fades to opacity-0 and calls `onDone`.
// The parent removes it from the ripples list.
//
// Mirror of FlowSelectedRadar for the per-ring SVG + map.project pattern.

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'

const RING_SIZE = 120
const RING_DURATION_MS = 1900

export interface Ripple {
  id: string
  lng: number
  lat: number
  bornAt: number
}

interface Props {
  map: mapboxgl.Map | null
  ripples: Ripple[]
  onDone: (id: string) => void
}

interface ProjectedRipple extends Ripple {
  x: number
  y: number
}

export default function FlowArrivalRipples({ map, ripples, onDone }: Props) {
  const [projected, setProjected] = useState<ProjectedRipple[]>([])
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  // Project all active ripples to screen coords. Re-project on map move/zoom.
  useEffect(() => {
    if (!map || ripples.length === 0) {
      setProjected([])
      return
    }

    const sync = () => {
      setProjected(
        ripples.map((r) => {
          const p = map.project([r.lng, r.lat])
          return { ...r, x: p.x, y: p.y }
        }),
      )
    }

    sync()
    map.on('move', sync)
    map.on('zoom', sync)
    return () => {
      map.off('move', sync)
      map.off('zoom', sync)
    }
  }, [map, ripples])

  if (projected.length === 0) return null

  const center = RING_SIZE / 2

  return (
    <>
      {projected.map((r) => (
        <RippleRing
          key={r.id}
          ripple={r}
          center={center}
          onDone={() => onDoneRef.current(r.id)}
        />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Single ring — self-times its own unmount signal via onDone.
// ---------------------------------------------------------------------------

interface RingProps {
  ripple: ProjectedRipple
  center: number
  onDone: () => void
}

function RippleRing({ ripple, center, onDone }: RingProps) {
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  // Schedule onDone after the animation completes.
  useEffect(() => {
    const elapsed = Date.now() - ripple.bornAt
    const remaining = Math.max(0, RING_DURATION_MS - elapsed)
    const t = setTimeout(() => doneRef.current(), remaining)
    return () => clearTimeout(t)
  }, [ripple.bornAt])

  return (
    <svg
      className="pointer-events-none absolute z-20 motion-reduce:hidden"
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      style={{ left: ripple.x - center, top: ripple.y - center }}
      aria-hidden
    >
      {/* Primary ring — indigo-300 to distinguish from the cream selection ring */}
      <circle
        cx={center}
        cy={center}
        r="18"
        fill="none"
        stroke="rgba(170,179,212,0.85)"
        strokeWidth="1.5"
        style={{
          transformBox: 'view-box',
          transformOrigin: `${center}px ${center}px`,
          animation: `emanate ${RING_DURATION_MS}ms ease-out forwards`,
        }}
      />
    </svg>
  )
}
