/**
 * CivicTicker — the living heartbeat of DataDiver.
 *
 * Three size modes:
 *   - hero:     Card carousel with sparklines, category badges, click-to-navigate
 *   - standard: Single-line scrolling text with pipe separators and colored dots
 *   - compact:  Minimal pills — dot + label + delta
 *
 * Scroll: CSS transform + requestAnimationFrame at ~40px/sec.
 * Pauses on hover, edge-fades via CSS mask-image gradients.
 */
import { useRef, useEffect, useCallback, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TickerItem, TickerSize } from '@/types/ticker'
import TickerCard from '@/components/ui/TickerCard'

// ─── Responsive Size Helper ─────────────────────────────

/** Returns the ideal ticker size based on viewport width. */
export function useResponsiveTickerSize(
  preferred: TickerSize,
): TickerSize {
  const width = useSyncExternalStore(
    (cb) => {
      window.addEventListener('resize', cb)
      return () => window.removeEventListener('resize', cb)
    },
    () => window.innerWidth,
    () => 1200,
  )

  if (preferred === 'hero') {
    if (width < 768) return 'compact'
    if (width < 1024) return 'standard'
    return 'hero'
  }
  if (preferred === 'standard') {
    if (width < 768) return 'compact'
    return 'standard'
  }
  return 'compact'
}

/** Detect prefers-reduced-motion */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  )
}

// ─── Helpers ────────────────────────────────────────────

const SCROLL_SPEED = 40 // px per second

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

/** Category → dot color */
const DOT_COLORS: Record<string, string> = {
  anomaly: '#ef4444',
  compliance: '#f59e0b',
  trend: '#60a5fa',
  milestone: '#6366f1',
  live: '#ef4444',
}

/** Severity → delta text color */
const DELTA_COLORS: Record<string, string> = {
  positive: '#10b981',
  negative: '#ef4444',
  neutral: '#94a3b8',
  alert: '#f59e0b',
}

// ─── Scroll Hook ────────────────────────────────────────

function useTickerScroll(paused: boolean, speed: number, reducedMotion: boolean) {
  const containerRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  const lastTimeRef = useRef(0)
  const rafRef = useRef(0)

  const tick = useCallback((time: number) => {
    if (lastTimeRef.current === 0) lastTimeRef.current = time
    const dt = (time - lastTimeRef.current) / 1000
    lastTimeRef.current = time

    const container = containerRef.current
    if (!container) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    // The inner track is duplicated — reset when first copy scrolls out
    const halfWidth = container.scrollWidth / 2
    if (halfWidth > 0) {
      offsetRef.current += speed * dt
      if (offsetRef.current >= halfWidth) {
        offsetRef.current -= halfWidth
      }
      container.style.transform = `translateX(-${offsetRef.current}px)`
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [speed])

  useEffect(() => {
    if (paused || reducedMotion) {
      cancelAnimationFrame(rafRef.current)
      lastTimeRef.current = 0
      return
    }
    lastTimeRef.current = 0
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [paused, reducedMotion, tick])

  return containerRef
}

// ─── Props ──────────────────────────────────────────────

interface CivicTickerProps {
  items: TickerItem[]
  size: TickerSize
  isLoading?: boolean
  lastUpdated?: Date
  className?: string
}

// ─── Hero Mode ──────────────────────────────────────────

function HeroTicker({ items, lastUpdated, className = '' }: Omit<CivicTickerProps, 'size'>) {
  const [hovered, setHovered] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const trackRef = useTickerScroll(hovered, SCROLL_SPEED, reducedMotion)

  // Duplicate items for seamless loop
  const doubled = [...items, ...items]

  return (
    <div className={`relative ${className}`}>
      {/* Header: LIVE CIVIC DATA + timestamp */}
      <div className="flex items-center gap-3 mb-3 px-1">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] font-bold text-emerald-500">
            Live Civic Data
          </span>
        </div>
        {lastUpdated && (
          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
            Updated {timeAgo(lastUpdated)}
          </span>
        )}
      </div>

      {/* Scrolling card track with edge fades */}
      <div
        className="overflow-hidden"
        style={{
          maskImage: 'linear-gradient(to right, transparent, black 60px, black calc(100% - 60px), transparent)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 60px, black calc(100% - 60px), transparent)',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          ref={trackRef}
          className="flex gap-4 will-change-transform"
          style={{ width: 'max-content' }}
        >
          {doubled.map((item, i) => (
            <TickerCard key={`${item.id}-${i}`} item={item} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Standard Mode ──────────────────────────────────────

function StandardTicker({ items, className = '' }: Omit<CivicTickerProps, 'size'>) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const trackRef = useTickerScroll(hovered, SCROLL_SPEED, reducedMotion)

  const doubled = [...items, ...items]

  return (
    <div
      className={`relative h-10 flex items-center overflow-hidden glass-card rounded-lg ${className}`}
      style={{
        maskImage: 'linear-gradient(to right, transparent, black 40px, black calc(100% - 40px), transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 40px, black calc(100% - 40px), transparent)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        ref={trackRef}
        className="flex items-center gap-0 will-change-transform whitespace-nowrap"
        style={{ width: 'max-content' }}
      >
        {doubled.map((item, i) => {
          const dot = DOT_COLORS[item.category] ?? '#94a3b8'
          const delta = item.delta != null
            ? `${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)}%`
            : null
          const deltaColor = DELTA_COLORS[item.severity] ?? '#94a3b8'

          return (
            <button
              key={`${item.id}-${i}`}
              onClick={() => navigate(item.source.view)}
              className="flex items-center gap-1.5 px-4 hover:bg-white/10 dark:hover:bg-white/5 h-full transition-colors cursor-pointer"
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: dot }}
              />
              <span className="text-[12px] text-slate-600 dark:text-slate-300">
                {item.headline}
              </span>
              {delta && (
                <span
                  className="text-[11px] font-mono font-semibold"
                  style={{ color: deltaColor }}
                >
                  {delta}
                </span>
              )}
              {/* Pipe separator */}
              <span className="text-slate-300 dark:text-slate-600 ml-2 select-none">|</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Compact Mode ───────────────────────────────────────

function CompactTicker({ items, className = '' }: Omit<CivicTickerProps, 'size'>) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const trackRef = useTickerScroll(hovered, SCROLL_SPEED * 0.8, reducedMotion)

  const doubled = [...items, ...items]

  return (
    <div
      className={`relative h-6 flex items-center overflow-hidden ${className}`}
      style={{
        maskImage: 'linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        ref={trackRef}
        className="flex items-center gap-2 will-change-transform whitespace-nowrap"
        style={{ width: 'max-content' }}
      >
        {doubled.map((item, i) => {
          const dot = DOT_COLORS[item.category] ?? '#94a3b8'
          const delta = item.delta != null
            ? `${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)}%`
            : null
          const deltaColor = DELTA_COLORS[item.severity] ?? '#94a3b8'

          // Compact: short label from headline (first ~25 chars)
          const shortLabel = item.headline.length > 28
            ? item.headline.slice(0, 25) + '…'
            : item.headline

          return (
            <button
              key={`${item.id}-${i}`}
              onClick={() => navigate(item.source.view)}
              className="
                inline-flex items-center gap-1 px-2 py-0.5
                rounded-full
                bg-white/40 dark:bg-white/[0.06]
                hover:bg-white/60 dark:hover:bg-white/[0.1]
                transition-colors cursor-pointer
              "
            >
              <span
                className="w-1 h-1 rounded-full flex-shrink-0"
                style={{ backgroundColor: dot }}
              />
              <span className="text-[10px] text-slate-600 dark:text-slate-400">
                {shortLabel}
              </span>
              {delta && (
                <span
                  className="text-[10px] font-mono font-bold"
                  style={{ color: deltaColor }}
                >
                  {delta}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Loading Skeleton ───────────────────────────────────

function TickerSkeleton({ size }: { size: TickerSize }) {
  if (size === 'hero') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 px-1">
          <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700 animate-pulse" />
          <div className="w-24 h-2.5 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
        </div>
        <div className="flex gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-[220px] h-[160px] rounded-xl bg-slate-200/50 dark:bg-slate-800/50 animate-pulse flex-shrink-0" />
          ))}
        </div>
      </div>
    )
  }
  if (size === 'standard') {
    return <div className="h-10 rounded-lg bg-slate-200/50 dark:bg-slate-800/50 animate-pulse" />
  }
  return <div className="h-6 rounded-full bg-slate-200/30 dark:bg-slate-800/30 animate-pulse" />
}

// ─── Main Export ─────────────────────────────────────────

export default function CivicTicker({ items, size, isLoading, lastUpdated, className }: CivicTickerProps) {
  if (isLoading || items.length === 0) {
    return <TickerSkeleton size={size} />
  }

  switch (size) {
    case 'hero':
      return <HeroTicker items={items} lastUpdated={lastUpdated} className={className} />
    case 'standard':
      return <StandardTicker items={items} className={className} />
    case 'compact':
      return <CompactTicker items={items} className={className} />
  }
}
