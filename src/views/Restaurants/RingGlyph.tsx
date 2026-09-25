// src/views/Restaurants/RingGlyph.tsx
//
// The map's tree-ring mark, at list size: one hollow ring per business
// counted at a storefront (1…5, clamped like the map's ringRank). The rail
// and the map now share ONE mark for the same fact, so a "5" in the list
// reads as the five-ring door on the map. A brick centre dot = the current
// permit meets the repeat-closure bar (D5), exactly as on the map.

import { RING_COLOR_DARK, RING_COLOR_LIGHT, BRICK_600 } from './mapLayers'
import { useAppStore } from '@/stores/appStore'

interface RingGlyphProps {
  rings: number
  /** Outer diameter in px. Default 18. */
  size?: number
  repeat?: boolean
  label?: string
  className?: string
}

export default function RingGlyph({ rings, size = 18, repeat = false, label, className = '' }: RingGlyphProps) {
  const isDark = useAppStore((s) => s.isDarkMode)
  const n = Math.max(1, Math.min(5, Math.round(rings)))
  const color = isDark ? RING_COLOR_DARK : RING_COLOR_LIGHT
  const c = size / 2
  // Rings step outward by a fixed gap from a small core — the same "tree
  // section, not a blob" rule the map uses.
  const step = (c - 1.5) / 5
  return (
    <svg
      width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      className={`block shrink-0 ${className}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
    >
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={c} cy={c} r={1.5 + (i + 1) * step - 0.6} fill="none" stroke={color} strokeWidth={n === 1 ? 0 : 1} opacity={0.9} />
      ))}
      {n === 1 && <circle cx={c} cy={c} r={1.6} fill={color} opacity={0.7} />}
      {repeat && <circle cx={c} cy={c} r={1.6} fill={BRICK_600} />}
    </svg>
  )
}
