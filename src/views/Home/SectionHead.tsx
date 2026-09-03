/** SectionHead — the Home page's section LEDGE.
 *
 *  Jesse's rule (Sept. 2 2026): "if it's worth an eyebrow it's worth doing at
 *  normal size." The rule-leading micro labels above each Home section are
 *  the footholds a reader uses to find their place on a dense page; at
 *  text-micro slate-500 they were swallowed. So a ledge is body-size mono
 *  (text-sm — scales with Large Type), full ink, carries a pigment-coloured
 *  glyph, keeps the thin rule and the Tier-1 corner glow, and has a right
 *  slot for a link or a hint.
 *
 *  Only the Pulse glyph moves (that section is live data) and its ring is
 *  `.ledge-ping`, which index.css turns off under prefers-reduced-motion.
 *  Card-internal eyebrows (a StatCard's TREND) are a different register and
 *  do NOT use this.
 */

import type { CSSProperties, ReactNode } from 'react'

export type LedgeIcon = 'search' | 'pulse' | 'viz' | 'explore' | 'city' | 'mail'

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** A 18px pigment glyph. Exported on its own for heads that need custom
 *  chrome beside the label (the newsletter card's NEW chip). */
export function LedgeGlyph({ icon, color }: { icon: LedgeIcon; color: string }) {
  if (icon === 'pulse') {
    return (
      <span
        className="relative flex h-[18px] w-[18px] items-center justify-center shrink-0"
        style={{ color }}
        aria-hidden
      >
        <span className="ledge-ping absolute h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
        <span className="relative h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      </span>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" className="shrink-0" style={{ color }} aria-hidden {...STROKE}>
      {icon === 'search' && (<><circle cx="8.5" cy="8.5" r="5.5" /><path d="M12.6 12.6l4.4 4.4" /></>)}
      {icon === 'viz' && <path d="M4 17V10M10 17V4M16 17V8" />}
      {icon === 'explore' && (<><circle cx="10" cy="10" r="7.5" /><path d="M13.2 6.8l-2 5.2-5.2 2 2-5.2z" /></>)}
      {icon === 'city' && <path d="M2 17.5h16M4 17.5V9h4v8.5M9 17.5V4.5h4v13M14 17.5v-6h3v6" />}
      {icon === 'mail' && (<><rect x="2.5" y="5" width="15" height="10.5" rx="1.5" /><path d="M2.5 6.2l7.5 5.3 7.5-5.3" /></>)}
    </svg>
  )
}

export default function SectionHead({
  label,
  icon,
  color,
  right,
  glow = true,
  className = '',
}: {
  label: string
  icon: LedgeIcon
  /** The section's pigment — drives the glyph AND the corner glow. */
  color: string
  /** Right-aligned slot: a link or a hint. */
  right?: ReactNode
  /** Tier-1 corner glow (default). The hero eyebrow sits on art and skips it. */
  glow?: boolean
  /** Margin / transition classes from the caller (mb-*, entrance stagger). */
  className?: string
}) {
  return (
    <div
      className={`${glow ? 'glow-host ' : ''}flex items-center gap-3 py-1 ${className}`}
      style={{ '--glow': color } as CSSProperties}
    >
      {glow && <div className="glow-corner is-sm" />}
      <span className="relative flex items-center">
        <LedgeGlyph icon={icon} color={color} />
      </span>
      <p className="relative font-mono text-sm uppercase tracking-[0.2em] leading-none text-ink dark:text-paper-100 whitespace-nowrap">
        {label}
      </p>
      <div className="relative flex-1 h-[1px] bg-ink/[0.12] dark:bg-white/[0.08]" />
      {right && <div className="relative shrink-0 flex items-center">{right}</div>}
    </div>
  )
}
