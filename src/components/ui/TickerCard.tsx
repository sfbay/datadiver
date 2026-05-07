/**
 * TickerCard — a single indicator card for the hero-mode civic ticker.
 *
 * Displays: category badge (colored dot + label), headline, delta badge,
 * sparkline via SparkBars, source label. Clicks navigate to source view.
 */
import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import SparkBars from '@/components/charts/SparkBars'
import type { TickerItem } from '@/types/ticker'

/** Maps category → accent color for badges and sparklines (earth-tone). */
const CATEGORY_COLORS: Record<string, string> = {
  anomaly: '#963e30',     // brick-600 — danger
  compliance: '#d4a435',  // ochre-500 — money / ledger
  trend: '#5c9693',       // teal-500 — info
  milestone: '#616a96',   // indigo-500 — civic ceremony
  live: '#b85a33',        // terracotta-600 — primary brand
}

/** Maps severity → delta badge color (earth-tone). */
const SEVERITY_COLORS: Record<string, string> = {
  positive: '#5c7a3d',  // moss-600 — success / formation
  negative: '#963e30',  // brick-600 — danger
  neutral: '#7a5f42',   // ink-500 — muted
  alert: '#d4a435',     // ochre-500 — warning
}

const CATEGORY_LABELS: Record<string, string> = {
  anomaly: 'Anomaly',
  compliance: 'Compliance',
  trend: 'Trend',
  milestone: 'Milestone',
  live: 'Live',
}

interface TickerCardProps {
  item: TickerItem
}

export default function TickerCard({ item }: TickerCardProps) {
  const navigate = useNavigate()
  const accent = CATEGORY_COLORS[item.category] ?? '#5c9693'
  const severityColor = SEVERITY_COLORS[item.severity] ?? '#94a3b8'

  const handleClick = () => {
    const path = item.source.params
      ? `${item.source.view}?${new URLSearchParams(item.source.params).toString()}`
      : item.source.view
    navigate(path)
  }

  const deltaText = item.delta != null
    ? `${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)}%`
    : null

  return (
    <button
      onClick={handleClick}
      className="
        group glow-host flex-shrink-0 w-[220px]
        glass-card rounded-xl
        cursor-pointer select-none
        transition-all duration-300 ease-out
        hover:scale-[1.03] hover:shadow-lg
        active:scale-[0.98]
      "
      style={{ '--glow': accent } as CSSProperties}
    >
      <div className="glow-corner is-sm" />
      <div className="relative p-4 flex flex-col h-full">
        {/* Category badge */}
        <div className="flex items-center gap-1.5 mb-2.5">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor: accent,
              boxShadow: item.category === 'anomaly' || item.category === 'live'
                ? `0 0 6px ${accent}80`
                : undefined,
            }}
          />
          <span
            className="text-[9px] font-mono uppercase tracking-[0.2em] font-semibold"
            style={{ color: accent }}
          >
            {CATEGORY_LABELS[item.category] ?? item.category}
          </span>
        </div>

        {/* Headline */}
        <p className="text-[13px] font-medium text-ink dark:text-white leading-snug mb-1.5 text-left line-clamp-2">
          {item.headline}
        </p>

        {/* Value + delta row */}
        <div className="flex items-baseline gap-2 mb-2">
          {item.value && (
            <span className="text-lg font-mono font-bold tracking-tight text-ink dark:text-white">
              {item.value}
            </span>
          )}
          {deltaText && (
            <span
              className="text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded-md"
              style={{
                color: severityColor,
                backgroundColor: severityColor + '15',
              }}
            >
              {deltaText}
            </span>
          )}
        </div>

        {/* Sparkline */}
        {item.sparkData && item.sparkData.length > 0 && (
          <div className="mb-2.5 mt-auto">
            <SparkBars
              values={item.sparkData}
              height={18}
              barColor={accent + '50'}
              accentColor={accent}
              className="w-full"
            />
          </div>
        )}

        {/* Source label */}
        <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 tracking-wide truncate text-left mt-auto">
          {item.source.label}
        </p>
      </div>
    </button>
  )
}
