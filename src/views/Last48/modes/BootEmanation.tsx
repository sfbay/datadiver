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
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import Last48LoadingTips from './Last48LoadingTips'

const FADE_OUT_MS = 800

// Hold the tip cards back for a beat so a few seconds of bare radar sweep
// prime the eye before the cards' "distraction" arrives — calmer than having
// everything appear at once. Skipped under reduced-motion (no radar to prime
// with, so don't make those users wait on a blank screen).
const TIP_DELAY_MS = 3000

interface Props {
  /** While true, the scanner renders. False → fade out + unmount. */
  looping: boolean
}

export default function BootEmanation({ looping }: Props) {
  const [mounted, setMounted] = useState(looping)
  const [fading, setFading] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  // Tips appear after TIP_DELAY_MS of radar-only — unless reduced-motion, where
  // there's no radar, so show them right away.
  const [tipsReady, setTipsReady] = useState(reducedMotion)

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

  // Arm the tip cards a few seconds after the scanner mounts (radar primes the
  // eye first). Reset whenever the overlay unmounts so a later cold-load
  // re-primes from scratch.
  useEffect(() => {
    if (!mounted) { setTipsReady(false); return }
    if (reducedMotion) { setTipsReady(true); return }
    const t = setTimeout(() => setTipsReady(true), TIP_DELAY_MS)
    return () => clearTimeout(t)
  }, [mounted, reducedMotion])

  if (!mounted) return null

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      style={{
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_OUT_MS}ms ease-out`,
      }}
    >
      {/* The radar sweep IS the motion — hide it under prefers-reduced-motion.
          (Was on the wrapper, which also took the tips down with it.) */}
      <div className="motion-reduce:hidden">
        <MapScanOverlay color="#a8926a" label="Scanning the last 48 hours" />
      </div>
      {/* Rotating data + usability tips fill the cold-load wait. These are text,
          not motion, so they stay visible under reduced-motion (the tip
          component itself drops the cross-fade in that case). Gated on:
          - !fading      → don't linger as the map takes over
          - tipsReady    → a few seconds of radar-only prime the eye first */}
      {!fading && tipsReady && <Last48LoadingTips />}
    </div>
  )
}
