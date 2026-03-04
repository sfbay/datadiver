import { useAppStore } from '@/stores/appStore'
import { formatDate } from '@/utils/time'

interface DataFreshnessAlertProps {
  latestDate: string | null
  latestGeoDate?: string | null
  suggestedRange: { start: string; end: string } | null
  accentColor?: string
}

export default function DataFreshnessAlert({
  latestDate,
  latestGeoDate,
  suggestedRange,
  accentColor = '#f59e0b',
}: DataFreshnessAlertProps) {
  const setDateRange = useAppStore((s) => s.setDateRange)

  const hasGeoGap = latestGeoDate && latestDate && latestGeoDate < latestDate

  return (
    <div className="absolute inset-0 flex items-center justify-center z-20 bg-slate-950/30 backdrop-blur-sm">
      <div className="glass-card rounded-xl p-6 max-w-sm text-center">
        <div
          className="w-10 h-10 rounded-full mx-auto mb-3 flex items-center justify-center"
          style={{ backgroundColor: `${accentColor}15` }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M10 6v4m0 4h.01M3 10a7 7 0 1114 0 7 7 0 01-14 0z"
              stroke={accentColor}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <p className="text-sm font-medium text-ink dark:text-white mb-1">
          No data in selected range
        </p>

        {latestDate && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
            Latest available: <span className="font-mono text-slate-300">{formatDate(latestDate, 'long')}</span>
          </p>
        )}

        {hasGeoGap && (
          <p className="text-[10px] text-slate-500 dark:text-slate-600 mb-3 font-mono">
            Map data ends {formatDate(latestGeoDate)}.
            Stats available through {formatDate(latestDate)}.
          </p>
        )}

        {suggestedRange && (
          <button
            onClick={() => setDateRange(suggestedRange.start, suggestedRange.end)}
            className="px-4 py-2 rounded-lg text-xs font-medium text-white transition-all hover:brightness-110"
            style={{ backgroundColor: accentColor }}
          >
            Show latest data
            <span className="ml-1.5 opacity-70 font-mono">
              {formatDate(suggestedRange.start)} - {formatDate(suggestedRange.end)}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
