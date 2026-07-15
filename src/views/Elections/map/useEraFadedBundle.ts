import { useEffect, useState } from 'react'
import type { PaintBundle } from './precinctJoin'

const FADE_MS = 150

/** Era-swap choreography for the precinct fill (calm, civic-observatory
 *  register — no morphing, no camera moves):
 *    same era        → swap instantly (scrubbing within an era repaints live)
 *    era boundary    → fade fill to 0 over ~150 ms, swap data+geometry, fade back
 *    reduced motion  → instant swaps (house convention)
 *  While `next` is null (a beat still loading) the PREVIOUS bundle keeps
 *  painting — progressive, never blank. */
export function useEraFadedBundle(
  next: PaintBundle | null,
  reducedMotion: boolean,
): { bundle: PaintBundle | null; fade: number; fadeMs: number } {
  const [bundle, setBundle] = useState<PaintBundle | null>(next)
  const [fade, setFade] = useState(1)

  useEffect(() => {
    if (!next || next === bundle) return
    if (!bundle || next.era === bundle.era || reducedMotion) {
      setBundle(next)
      setFade(1)
      return
    }
    setFade(0)
    const timer = setTimeout(() => {
      setBundle(next)
      setFade(1)
    }, FADE_MS)
    return () => clearTimeout(timer)
  }, [next, bundle, reducedMotion])

  return { bundle, fade, fadeMs: reducedMotion ? 0 : FADE_MS }
}
