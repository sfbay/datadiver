// src/hooks/effectiveViewport.ts
//
// Effective-viewport math for the Large Type edition. A leaf module (it
// imports only the pure stores/typeScale) so the node-only Vitest env can
// test it with stubbed globals — the same isolation recipe that keeps
// stores/typeScale.ts importable while appStore.ts is not.
import { SCALE_FACTORS, parseTypeScale } from '@/stores/typeScale'

/** The mobile-shell boundary, in EFFECTIVE px. Replaces the old
 *  matchMedia('(max-width: 767px)') check — CSS-side equivalents use the
 *  desk: custom variant (html[data-vp], stamped by syncViewportMode), not
 *  md: media queries, so JS and CSS key off this single number. */
export const MOBILE_BREAKPOINT = 768

/** innerWidth divided by the active type-scale factor. Large type shrinks
 *  how much CONTENT fits per physical pixel, so every JS density
 *  threshold compares against this, not raw innerWidth. Reads the
 *  data-type-scale DOM attribute (applied at appStore module eval)
 *  rather than the store so this stays store-free and node-testable.
 *  Returns 0 when there is no window (SSR/test guard). */
export function effectiveViewportWidth(): number {
  if (typeof globalThis.window === 'undefined' || typeof globalThis.document === 'undefined') return 0
  const raw = globalThis.document.documentElement.getAttribute('data-type-scale')
  return globalThis.window.innerWidth / SCALE_FACTORS[parseTypeScale(raw)]
}

/** Stamp html[data-vp="mobile"|"desk"] — the single source the desk:
 *  Tailwind variant (src/index.css @custom-variant) styles against.
 *  Called at appStore module eval (pre-first-paint), from setTypeScale
 *  (a scale change moves the effective breakpoint), and from App.tsx's
 *  resize listener. An unreadable width (0) stamps desk, matching the
 *  old hook's SSR-desktop default. */
export function syncViewportMode(): void {
  if (typeof globalThis.document === 'undefined') return
  const w = effectiveViewportWidth()
  const mode = w > 0 && w < MOBILE_BREAKPOINT ? 'mobile' : 'desk'
  globalThis.document.documentElement.setAttribute('data-vp', mode)
}
