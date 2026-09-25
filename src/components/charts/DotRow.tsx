// src/components/charts/DotRow.tsx
//
// DotRow — "N things, M of them one way, K of them marked" as a row of
// dots instead of a sentence. Filled = the subset (e.g. storefronts on the
// map), hollow = the rest, accent = the highlight (e.g. a closure). Text
// carries only the overflow ("+15") when the row is capped; the counts
// belong in the caller's mono line or an aria-label. Spec math is pure in
// dotRowSpec.ts. Colours are the caller's pigment — the component has none.

import { dotRowSpec, type Dot } from './dotRowSpec'

interface DotRowProps {
  total: number
  /** How many of `total` are drawn solid (the subset). Default: all. */
  filled?: number
  /** 0-based indices drawn in `accentColor`. */
  accent?: readonly number[]
  color: string
  accentColor?: string
  /** Dot diameter in px. Default 6. */
  size?: number
  /** Cap on dots drawn before "+N". Default 40. */
  cap?: number
  /** Screen-reader sentence — the one place the counts are spelled out. */
  label?: string
  className?: string
}

const fill = (d: Dot, color: string, accentColor: string) => (d === 'accent' ? accentColor : color)

export default function DotRow({
  total, filled = total, accent = [], color, accentColor = color, size = 6, cap = 40, label, className = '',
}: DotRowProps) {
  const { dots, overflow } = dotRowSpec(total, filled, accent, cap)
  if (!dots.length) return null
  const gap = Math.max(1, Math.round(size / 3))
  const r = size / 2
  const w = dots.length * (size + gap) - gap
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg width={w} height={size} viewBox={`0 0 ${w} ${size}`} className="block shrink-0" aria-hidden>
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={i * (size + gap) + r}
            cy={r}
            r={d === 'hollow' ? r - 0.6 : r}
            fill={d === 'hollow' ? 'none' : fill(d, color, accentColor)}
            stroke={d === 'hollow' ? color : 'none'}
            strokeWidth={1}
            opacity={d === 'hollow' ? 0.55 : 1}
          />
        ))}
      </svg>
      {overflow > 0 && <span className="font-mono text-nano tabular-nums opacity-70">+{overflow}</span>}
    </span>
  )
}
