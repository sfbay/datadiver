// src/hooks/usePrefersReducedMotion.ts
//
// Reactive read of the `prefers-reduced-motion: reduce` media query.
//
// useSyncExternalStore is the correct React 18 primitive here: it subscribes
// to an external mutable source (the MediaQueryList) and re-renders on change
// WITHOUT the useState+useEffect dance that flickers on first paint. The third
// arg (server snapshot → false) keeps it SSR-safe / matchMedia-undefined-safe.
//
// Lifted out of CivicTicker (where it started life as a private function) so
// the loading-tip rotation, the ticker scroll, and any future motion-bearing
// component all read the SAME source of truth. See memory: BootEmanation
// previously hid BOTH the radar AND the text tips under reduced-motion — the
// tips are text, not motion, and should stay visible.

import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(QUERY)
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}

export default usePrefersReducedMotion
