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
    <div className="glass-card rounded-2xl overflow-hidden">
      {/* Header skeleton */}
      <div className="px-4 pt-4 pb-3">
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
      <div className="px-4 py-3 border-t border-white/[0.03] flex items-center justify-between">
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
      className="glass-card rounded-2xl hover:bg-white/[0.04] transition-all duration-300 text-left w-full overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
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
        <h3
          className="text-[15px] leading-snug text-white mb-1.5"
          style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontStyle: 'italic' }}
        >
          {headline}
        </h3>

        {/* Subtitle */}
        <p className="text-[9px] font-mono text-slate-500">
          {subtitle}
        </p>
      </div>

      {/* Card body — hero viz injected by parent */}
      <div className="px-4 pb-3">
        {children}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-white/[0.03] flex items-center justify-between">
        <span className="text-[7px] font-mono uppercase tracking-wider text-slate-700">
          {sourceName}
        </span>
        <span className="text-[9px] font-mono text-slate-500 group-hover:text-slate-300 transition-colors">
          Explore →
        </span>
      </div>
    </button>
  )
}
