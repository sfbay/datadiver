// src/views/Last48/photoreal/immersive/glyphs.tsx
//
// The rail's icon set — five authored 24 px glyphs in ONE stroke weight
// (1.75, round caps/joins, `currentColor`, never a fill). The rail used to
// spend Unicode characters (▶ ❚❚ ▭ ✕) as icons; the design critique of
// 2026-09-13 called the rail "a dead slab of word buttons", and a glyph
// system drawn at one weight is what turns the four controls into tiles a
// viewer reads at a glance. Drawn here rather than pulled from a library
// because five shapes do not earn a dependency — but they DO have to look
// like one family, which is what the shared <G> wrapper enforces.

import type { ReactNode } from 'react'

interface GlyphProps {
  /** Square edge in px. 24 is the rail tile's size. */
  size?: number
  className?: string
}

/** Every glyph rides the same viewBox, stroke weight and joins. */
function G({ size = 24, className, children }: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  )
}

export function PlayGlyph(props: GlyphProps) {
  return <G {...props}><path d="M9 6.5 17.5 12 9 17.5Z" /></G>
}

export function PauseGlyph(props: GlyphProps) {
  return <G {...props}><path d="M9.5 7v10M14.5 7v10" /></G>
}

/** A ring with a small pause bar inside it. The rail's countdown arc is a
 *  SECOND svg stacked on top at the same geometry (cx/cy 12, r 9), so the
 *  ring here is drawn faint — it is the track, the arc is the reading. */
export function HoldGlyph(props: GlyphProps) {
  return (
    <G {...props}>
      <circle cx="12" cy="12" r="9" strokeOpacity="0.35" />
      <path d="M10.4 9.6v4.8M13.6 9.6v4.8" />
    </G>
  )
}

/** A frame with a band along its bottom edge — the lower third itself. */
export function OverlayGlyph(props: GlyphProps) {
  return (
    <G {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="M3.5 14.5h17" />
    </G>
  )
}

/** An arrow leaving an open bracket — back out to the classic view. */
export function LeaveGlyph(props: GlyphProps) {
  return (
    <G {...props}>
      <path d="M13 5.5H6.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1H13" />
      <path d="M11 12h7.5" />
      <path d="M16 9.5 18.5 12 16 14.5" />
    </G>
  )
}

/** The ring geometry the countdown arc must match. */
export const HOLD_RING_R = 9
export const HOLD_RING_LEN = 2 * Math.PI * HOLD_RING_R
