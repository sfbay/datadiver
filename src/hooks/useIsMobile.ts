// src/hooks/useIsMobile.ts
import { useEffect, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { effectiveViewportWidth, MOBILE_BREAKPOINT } from '@/hooks/effectiveViewport'

/** True when the EFFECTIVE viewport (innerWidth ÷ type-scale factor) is
 *  below the mobile breakpoint. Drives the JS-side mobile decisions that
 *  can't be expressed in CSS (sheet-vs-card render branches). CSS-side
 *  mobile styling uses the desk: custom variant (html[data-vp], stamped
 *  by syncViewportMode from the SAME effective width), so JS and CSS
 *  flip together — including when large type shrinks the effective
 *  viewport (e.g. a 900px window under 'large' is mobile: 900 ÷ 1.18 ≈
 *  763 < 768). Do NOT reintroduce a raw min-width media-query check here. */
export function useIsMobile(): boolean {
  const typeScale = useAppStore((s) => s.typeScale)
  const [isMobile, setIsMobile] = useState(() => isMobileViewport())
  useEffect(() => {
    const onResize = () => setIsMobile(isMobileViewport())
    onResize() // resync — covers both mount gaps and typeScale-change re-runs
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [typeScale])
  return isMobile
}

/** Imperative check for non-React call sites (e.g. fly-to handlers).
 *  Effective-width-based; returns false when no window exists (SSR),
 *  matching the old matchMedia guard's behavior. */
export function isMobileViewport(): boolean {
  const w = effectiveViewportWidth()
  return w > 0 && w < MOBILE_BREAKPOINT
}
