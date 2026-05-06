import type { CSSProperties } from 'react'

/**
 * VizCard — the notched exploration tile used on the Home / Overview grid.
 *
 * Two design-system signatures combined:
 *   1. Notched corner: 28px radius on three corners, square bottom-left.
 *   2. Top-right accent tab (38–44px) in the dataset's pigment with an arrow.
 * Plus the third unifying treatment: a top-left corner glow driven by the
 * dataset's pigment via the .glow-host / .glow-corner utility.
 *
 * Compact variant (default): badge / title / subtitle only — fits the 4-col
 * lg grid on the Home page. The kit's full-bodied variant with description
 * + stats is intentionally not adopted here to preserve the current Home
 * layout density.
 */
interface VizCardProps {
  title: string
  subtitle: string
  badge: string
  accentColor: string
  onClick: () => void
  /** Delay before the entrance animation starts, in ms. */
  delay?: number
  /** Toggled true once the parent has mounted, drives the entrance state. */
  mounted?: boolean
}

export default function VizCard({
  title,
  subtitle,
  badge,
  accentColor,
  onClick,
  delay = 0,
  mounted = false,
}: VizCardProps) {
  return (
    <button
      onClick={onClick}
      className={`
        group glow-host text-left
        rounded-[28px] rounded-bl-none
        bg-white/70 dark:bg-slate-950/30
        hover:bg-white/95 dark:hover:bg-slate-950/50
        border border-slate-300/60 dark:border-white/[0.04]
        hover:border-slate-400/70 dark:hover:border-white/[0.08]
        hover:shadow-md dark:hover:shadow-none
        transition-all duration-300
        pl-4 pr-[52px] py-3.5
        ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
      style={{ '--glow': accentColor, transitionDelay: `${delay}ms` } as CSSProperties}
    >
      <div className="glow-corner is-lg" />
      <div
        className="relative text-[10px] font-mono font-bold tracking-wider mb-1.5"
        style={{ color: accentColor, opacity: 0.95 }}
      >
        {badge}
      </div>
      <h3 className="relative font-display italic font-medium text-[15px] text-ink dark:text-slate-200 leading-tight mb-1">
        {title}
      </h3>
      <p className="relative text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {subtitle}
      </p>

      {/* Top-right accent notch with chevron — scales up slightly on hover */}
      <div
        className="absolute top-0 right-0 grid place-items-center z-10
                   w-[38px] h-[38px] rounded-tr-[28px] rounded-bl-[20px]
                   transition-[width,height] duration-300 ease-[cubic-bezier(0.22,0.8,0.3,1)]
                   group-hover:w-[44px] group-hover:h-[44px]"
        style={{ backgroundColor: accentColor }}
        aria-hidden
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="#fbf6ea"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-300 group-hover:translate-x-0.5"
        >
          <path d="M5 3 L11 8 L5 13" />
        </svg>
      </div>
    </button>
  )
}
