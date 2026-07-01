// src/views/Pulse/SignalGlyph.tsx
//
// The visual that REPLACES the repeated word "unusually." Direction + how-much
// are read at a glance instead of re-read in prose on every card:
//
//   rise → 1–3 up-chevrons, warming with magnitude (ochre → terracotta → brick)
//   fall → 1–3 down-chevrons, cooling with magnitude (sand → teal → indigo)
//   live → a pulsing dot (present-tense tally, no direction)
//   milestone → a static diamond (a standing total, no direction)
//
// Magnitude is encoded TWICE — chevron count AND color — so it never relies on
// color alone (the spoken magnitude word rides on the card's aria-label).

import type { SignalType } from '@/lib/pulse/pulsePhrase'

const RISE = ['#d4a435', '#b85a33', '#963e30'] // ochre · terracotta · brick
const FALL = ['#a8926a', '#5c9693', '#616a96'] // sand · dusty teal · indigo

export function signalColor(type: SignalType, magnitude: 1 | 2 | 3): string {
  if (type === 'live') return '#b85a33'
  if (type === 'milestone') return '#8b6282'
  return (type === 'rise' ? RISE : FALL)[magnitude - 1]
}

export default function SignalGlyph({
  type,
  magnitude,
  size = 22,
  color,
}: {
  type: SignalType
  magnitude: 1 | 2 | 3
  size?: number
  /** Override the glyph colour (e.g. the card's feed pigment). When omitted,
   *  falls back to the direction-based signal colour. */
  color?: string
}) {
  const c = color ?? signalColor(type, magnitude)

  if (type === 'live') {
    return (
      <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} aria-hidden>
        <span className="absolute w-2.5 h-2.5 rounded-full animate-ping" style={{ backgroundColor: c, opacity: 0.45 }} />
        <span className="relative w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
      </span>
    )
  }

  if (type === 'milestone') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <rect x="7" y="7" width="10" height="10" transform="rotate(45 12 12)" fill={c} />
      </svg>
    )
  }

  const up = type === 'rise'
  const gap = 5
  const chevH = 6
  const stackH = (magnitude - 1) * gap + chevH
  const startY = (24 - stackH) / 2

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {Array.from({ length: magnitude }).map((_, i) => {
        const y = startY + i * gap
        const d = up ? `M5 ${y + chevH} L12 ${y} L19 ${y + chevH}` : `M5 ${y} L12 ${y + chevH} L19 ${y}`
        // Leading chevron brightest (top for rise, bottom for fall).
        const lead = up ? i : magnitude - 1 - i
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={c}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={1 - lead * 0.2}
          />
        )
      })}
    </svg>
  )
}
