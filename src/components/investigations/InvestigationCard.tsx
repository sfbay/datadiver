import { useNavigate } from 'react-router-dom'
import { Skeleton } from '@/components/ui/Skeleton'

export interface InvestigationCardProps {
  eyebrow: string
  accentColor: string
  headline: string
  subtitle: string
  explorePath: string
  sourceName: string
  isLoading: boolean
  children: React.ReactNode
}

function InvestigationSkeleton({ accentColor }: { accentColor: string }) {
  return (
    <div
      className="glow-host glass-card rounded-2xl overflow-hidden flex flex-col h-full relative isolate"
      style={{ '--glow': accentColor } as React.CSSProperties}
    >
      {/* Pigment arrives before the data does — the skeleton glows too,
          so the grid is colorful from first paint, not after queries land.
          Same for the corner notch: it's structural chrome, so it renders
          from first paint instead of popping in when data arrives. */}
      <span className="glow-corner is-lg" style={{ opacity: 0.45 }} aria-hidden />
      <div
        className="absolute top-0 right-0 grid place-items-center z-10 w-[34px] h-[34px] rounded-tr-2xl rounded-bl-[18px]"
        style={{ backgroundColor: accentColor, opacity: 0.7 }}
        aria-hidden
      >
        <svg
          width="12" height="12" viewBox="0 0 16 16" fill="none"
          stroke="#fbf6ea" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M5 3 L11 8 L5 13" />
        </svg>
      </div>
      {/* Header skeleton */}
      <div className="relative px-4 pt-4 pb-3">
        {/* Eyebrow */}
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-[5px] h-[5px] rounded-full flex-shrink-0 animate-pulse"
            style={{ backgroundColor: accentColor }}
          />
          <Skeleton className="h-2 w-32" />
        </div>
        {/* Headline */}
        <Skeleton className="h-4 w-4/5 mb-1.5" />
        <Skeleton className="h-4 w-3/5" />
        {/* Subtitle */}
        <Skeleton className="h-2 w-48 mt-2" />
      </div>

      {/* Body skeleton */}
      <div className="px-4 pb-4">
        <Skeleton className="w-full rounded-lg" style={{ height: 120 }} />
      </div>

      {/* Footer skeleton */}
      <div className="mt-auto px-4 py-3 border-t border-white/[0.03] flex items-center justify-between">
        <Skeleton className="h-2 w-28" />
        <Skeleton className="h-2 w-16" />
      </div>
    </div>
  )
}

export function InvestigationCard({
  eyebrow,
  accentColor,
  headline,
  subtitle,
  explorePath,
  sourceName,
  isLoading,
  children,
}: InvestigationCardProps) {
  const navigate = useNavigate()

  if (isLoading) {
    return <InvestigationSkeleton accentColor={accentColor} />
  }

  return (
    <button
      onClick={() => navigate(explorePath)}
      className="glow-host glass-card rounded-2xl hover:bg-white/[0.04] transition-all duration-300 text-left w-full overflow-hidden flex flex-col h-full relative isolate group"
      style={{ '--glow': accentColor } as React.CSSProperties}
    >
      {/* Corner-glow signature, Tier 1 — each card wears its destination
          view's pigment (teal=Last48, ochre=budget, terracotta=ER, brick=
          traffic, moss=compliance), breaking up the wall of espresso.
          Top-left (the house anchor, matching the explorations tiles) —
          the notch tab owns the top-right. Bolder than the default
          (0.65) per editorial direction. */}
      <span className="glow-corner is-lg" style={{ opacity: 0.8 }} aria-hidden />

      {/* Top-right accent notch with chevron — same idiom as VizCard /
          AlertsRibbon, sized to this card's 16px radius. The notch sits on
          the glow's anchor corner: the light draws the eye, the tab gives
          it somewhere to go. Replaces the footer's "Explore →" text. */}
      <div
        className="absolute top-0 right-0 grid place-items-center z-10
                   w-[34px] h-[34px] rounded-tr-2xl rounded-bl-[18px]
                   transition-[width,height] duration-300 ease-[cubic-bezier(0.22,0.8,0.3,1)]
                   group-hover:w-[40px] group-hover:h-[40px]"
        style={{ backgroundColor: accentColor }}
        aria-hidden
      >
        <svg
          width="12"
          height="12"
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

      {/* Header */}
      <div className="relative px-4 pt-4 pb-3">
        {/* Eyebrow */}
        <div className="flex items-center gap-2 mb-2.5">
          <span
            className="w-[5px] h-[5px] rounded-full flex-shrink-0"
            style={{
              backgroundColor: accentColor,
              animation: 'pulse 2.5s ease-in-out infinite',
            }}
          />
          <span
            className="text-[8px] font-mono uppercase tracking-[0.18em]"
            style={{ color: accentColor }}
          >
            {eyebrow}
          </span>
        </div>

        {/* Headline */}
        <h3 className="font-display italic text-[15px] leading-snug text-ink dark:text-white mb-1.5">
          {headline}
        </h3>

        {/* Subtitle */}
        <p className="text-micro font-mono text-slate-500 dark:text-slate-400">
          {subtitle}
        </p>
      </div>

      {/* Card body — hero viz injected by parent */}
      <div className="relative px-4 pb-3">
        {children}
      </div>

      {/* Footer — mt-auto pushes it to the bottom of the card so when the
          grid row stretches taller than the natural content (e.g., one card
          has a small error state while siblings have rich viz), the empty
          space settles BELOW the body content rather than centering or
          floating awkwardly. Content top-aligns; void anchors bottom. */}
      <div className="relative mt-auto px-4 py-2.5 border-t border-slate-200/50 dark:border-white/[0.04] flex items-center">
        <span className="text-[8px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-500">
          {sourceName}
        </span>
      </div>
    </button>
  )
}

/** Graceful error state for an investigation card body. Shows a small,
 *  fixed-height placeholder rather than dumping the raw error text into
 *  the layout (which can leak server-side SOQL strings, JSON, etc. into
 *  the public UI). The full error is logged to the console and shown in
 *  the title attribute for debugging. */
export function ErrorState({ error }: { error: string }) {
  if (typeof console !== 'undefined' && console.warn) {
    // eslint-disable-next-line no-console
    console.warn('[Investigation card] Failed to load:', error)
  }
  return (
    <div
      className="flex flex-col items-center justify-center text-center py-6 px-2 gap-1"
      title={error}
    >
      <svg
        width="18" height="18" viewBox="0 0 18 18" fill="none"
        stroke="#a8926a" strokeWidth="1.5"
        className="opacity-50"
      >
        <circle cx="9" cy="9" r="7" />
        <path d="M9 5v4M9 12v.01" strokeLinecap="round" />
      </svg>
      <p className="text-micro font-mono text-slate-500">
        This view didn’t load
      </p>
      <p className="text-nano text-slate-600 max-w-[14rem]">
        Hover for details, or click Explore for the full dataset.
      </p>
    </div>
  )
}
