interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

/** Base skeleton block — a rounded shimmer rectangle */
export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      className={`rounded-md bg-slate-200/60 dark:bg-white/[0.06] skeleton ${className}`}
      style={style}
    />
  )
}

/** Skeleton matching StatCard dimensions — glass card with label + value placeholders */
export function SkeletonStatCard({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="glass-card rounded-xl px-4 py-3 min-w-[120px] animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    >
      <Skeleton className="h-2.5 w-16 mb-3" />
      <Skeleton className="h-6 w-20" />
      <div className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-slate-300/20 dark:bg-white/[0.04]" />
    </div>
  )
}

/** Row of skeleton stat cards for the map overlay position */
export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <div className="absolute top-5 left-5 z-10 flex gap-2.5">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonStatCard key={i} delay={i * 60} />
      ))}
    </div>
  )
}

/** Skeleton rows for sidebar neighborhood/ranking lists */
export function SkeletonSidebarRows({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="py-2 px-3 flex items-center justify-between" style={{ opacity: 1 - i * 0.08 }}>
          <div className="flex items-center gap-2 flex-1">
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3" style={{ width: `${65 - i * 4}%` }} />
          </div>
          <Skeleton className="h-3 w-12 ml-2" />
        </div>
      ))}
    </div>
  )
}

/** Skeleton for a chart area (histogram, heatgrid, etc.) */
export function SkeletonChart({ width = '100%', height = 120 }: { width?: number | string; height?: number }) {
  return (
    <div className="glass-card rounded-xl p-3">
      <Skeleton className="h-2 w-24 mb-3" />
      <div className="flex items-end gap-[3px]" style={{ width, height }}>
        {Array.from({ length: 14 }, (_, i) => {
          const h = 20 + Math.sin(i * 0.8) * 30 + Math.random() * 25
          return (
            <Skeleton
              key={i}
              className="flex-1 rounded-sm"
              style={{ height: `${Math.min(h, 90)}%` }}
            />
          )
        })}
      </div>
    </div>
  )
}

/** Skeleton for sidebar payment/breakdown sections */
export function SkeletonBreakdownList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="flex justify-between mb-1">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-1 rounded-full" style={{ width: `${90 - i * 15}%` }} />
        </div>
      ))}
    </div>
  )
}

/** Subtle map data loading indicator — corner pill instead of full overlay */
export function MapLoadingIndicator({ label = 'Loading data', color = '#94a3b8' }: { label?: string; color?: string }) {
  return (
    <div className="absolute top-5 right-5 z-20 flex items-center gap-2 glass-card rounded-full px-3 py-1.5">
      <div
        className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: `${color}40`, borderTopColor: 'transparent', borderRightColor: color }}
      />
      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </span>
    </div>
  )
}

/** Full-map radar sweep overlay — sharp leading line with gradient trail */
export function MapScanOverlay({ color = '#06b6d4', label = 'Scanning' }: { color?: string; label?: string }) {
  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center overflow-hidden">
      {/* Outer ring */}
      <div
        className="absolute rounded-full"
        style={{
          width: '70%',
          height: '70%',
          border: `1px solid ${color}20`,
          boxShadow: `0 0 15px ${color}08`,
        }}
      />

      {/* Sweep: sharp leading edge + gradient trail fading ~60deg back */}
      <div
        className="absolute rounded-full radar-sweep"
        style={{
          width: '70%',
          height: '70%',
          background: `conic-gradient(from 0deg, ${color}50 0deg, ${color}30 2deg, ${color}18 15deg, ${color}08 35deg, transparent 60deg, transparent 360deg)`,
        }}
      />

      {/* Sweep line — thin bright radial line at the leading edge */}
      <div
        className="absolute radar-sweep"
        style={{
          width: '35%',
          height: '1px',
          background: `linear-gradient(to right, ${color}10, ${color}cc, ${color})`,
          transformOrigin: 'left center',
          boxShadow: `0 0 6px ${color}60`,
        }}
      />

      {/* Center glow dot */}
      <div
        className="absolute w-2 h-2 rounded-full radar-center-dot"
        style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}80, 0 0 40px ${color}30` }}
      />

      {/* Label */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2">
        <div
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}80` }}
        />
        <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500">
          {label}
        </span>
      </div>
    </div>
  )
}
