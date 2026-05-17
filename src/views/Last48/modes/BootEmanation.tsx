// src/views/Last48/modes/BootEmanation.tsx
//
// Ambient sonar-ping pulse — sustained while The Last 48 is mid-cold-load,
// fades out once all streams have arrived.
//
// History: this used to be a one-shot 3-ring sequence that played for ~2.4s
// on view mount, then unmounted. That left a long visual void during the
// 5–15s tail while Fire/EMS + 311 finished fetching — the "slow then sudden"
// problem. Now it loops while `looping=true` and softly fades when the
// caller flips it to false (all streams loaded).
//
// Three staggered rings firing every 1.8s with 0.6s offsets give a
// continuous wave train — calm and breathing, not urgent. Matches the
// civic-observatory aesthetic: ambient, not alerting.

import { useEffect, useState } from 'react'

const RING_DURATION = 1800       // each ring's animation period
const FADE_OUT_MS    = 800       // container fade-out after looping turns off

interface Props {
  /** While true, the rings loop continuously. False → fade out + unmount. */
  looping: boolean
}

export default function BootEmanation({ looping }: Props) {
  // When looping flips false, hold the rings in the DOM long enough to fade
  // their opacity smoothly, then unmount.
  const [mounted, setMounted] = useState(looping)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (looping) {
      setMounted(true)
      setFading(false)
      return
    }
    if (!mounted) return
    setFading(true)
    const t = setTimeout(() => {
      setMounted(false)
      setFading(false)
    }, FADE_OUT_MS)
    return () => clearTimeout(t)
  }, [looping, mounted])

  if (!mounted) return null

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center motion-reduce:hidden"
      style={{
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_OUT_MS}ms ease-out`,
      }}
    >
      <svg width="220" height="220" viewBox="0 0 220 220" style={{ overflow: 'visible' }}>
        <circle cx="110" cy="110" r="20" fill="none" stroke="rgba(245,236,217,0.70)" strokeWidth="1"
          style={{
            transformBox: 'view-box',
            transformOrigin: '110px 110px',
            animation: `emanate ${RING_DURATION}ms ease-out 0s infinite`,
          }} />
        <circle cx="110" cy="110" r="20" fill="none" stroke="rgba(245,236,217,0.50)" strokeWidth="1"
          style={{
            transformBox: 'view-box',
            transformOrigin: '110px 110px',
            animation: `emanate ${RING_DURATION}ms ease-out 0.6s infinite`,
          }} />
        <circle cx="110" cy="110" r="20" fill="none" stroke="rgba(245,236,217,0.32)" strokeWidth="1"
          style={{
            transformBox: 'view-box',
            transformOrigin: '110px 110px',
            animation: `emanate ${RING_DURATION}ms ease-out 1.2s infinite`,
          }} />
      </svg>
    </div>
  )
}
