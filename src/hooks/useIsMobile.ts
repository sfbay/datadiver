// src/hooks/useIsMobile.ts
import { useEffect, useState } from 'react'

// Below Tailwind `md` (768px). MUST stay in sync with the `md:` variants used
// across the mobile shell. Phones / small screens get the drawer + bottom sheets.
const MOBILE_QUERY = '(max-width: 767px)'

/** True when the viewport is below `md`. Drives the JS-side mobile decisions
 *  that can't be expressed in pure CSS (sheet-vs-card render branches). SSR-safe. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => isMobileViewport())
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    onChange() // resync in case it changed between render and effect
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return isMobile
}

/** Imperative check for non-React call sites (e.g. fly-to handlers). Reads
 *  `globalThis.matchMedia` so it works identically in the browser
 *  (globalThis === window) and is mockable in the node test env. */
export function isMobileViewport(): boolean {
  return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia(MOBILE_QUERY).matches
}
