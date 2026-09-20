// src/views/Last48/photoreal/immersive/FrameTicks.tsx
//
// Faint 1 px corner ticks marking the largest centred 16:9 frame in the map
// host — the b-roll plate (Spec A2 §6). Rendered only while the overlay is
// hidden (the page decides); measures the host with a ResizeObserver.
import { useEffect, useState, type RefObject } from 'react'
import { frame169, type Frame } from './frame'

const TICK = 24

export default function FrameTicks({ hostRef }: { hostRef: RefObject<HTMLDivElement | null> }) {
  const [f, setF] = useState<Frame>({ x: 0, y: 0, w: 0, h: 0 })
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const measure = () => setF(frame169(el.clientWidth, el.clientHeight))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hostRef])
  if (f.w === 0) return null
  const corners: Array<[number, number, 1 | -1, 1 | -1]> = [
    [f.x, f.y, 1, 1], [f.x + f.w, f.y, -1, 1], [f.x, f.y + f.h, 1, -1], [f.x + f.w, f.y + f.h, -1, -1],
  ]
  return (
    <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden>
      {corners.map(([x, y, sx, sy], i) => (
        <path key={i} d={`M ${x + sx * TICK} ${y} H ${x} V ${y + sy * TICK}`} fill="none" stroke="#f5ecd9" strokeOpacity="0.55" strokeWidth="1" />
      ))}
    </svg>
  )
}
