// src/views/Last48/modes/BootEmanation.tsx
//
// Ambient loading affordance — unified with the radar-sweep idiom used
// across DataDiver's other map views (Emergency Response, CrimeIncidents,
// BusinessActivity, ParkingCitations, TrafficSafety). The thin sonar pulse
// that lived here previously was too small to carry a 60-second cold-load
// gracefully; the radar sweep fills the time better.
//
// History: this used to be a one-shot 3-ring sonar burst (pre-Stream Curtain),
// then an ambient looping sonar pulse (Stream Curtain v1). Now it wraps
// MapScanOverlay with the same fade-out lifecycle: looping=true mounts the
// scanner; looping=false fades it to opacity 0 over 800ms then unmounts.
//
// Component name kept as-is for backward compatibility with Last48UnifiedView's
// import. (We're not renaming the file because the component IS still "the
// boot-loading affordance" — the implementation just changed.)

import { useEffect, useState } from 'react'
import { MapScanOverlay } from '@/components/ui/Skeleton'

const FADE_OUT_MS = 800

interface Props {
  /** While true, the scanner renders. False → fade out + unmount. */
  looping: boolean
}

export default function BootEmanation({ looping }: Props) {
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
      className="pointer-events-none absolute inset-0 z-20 motion-reduce:hidden"
      style={{
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_OUT_MS}ms ease-out`,
      }}
    >
      <MapScanOverlay color="#a8926a" label="Scanning the last 48 hours" />
    </div>
  )
}
