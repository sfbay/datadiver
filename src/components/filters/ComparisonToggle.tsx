import { useAppStore } from '@/stores/appStore'

const OPTIONS = [
  { label: 'Off', value: null },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '180d', value: 180 },
  { label: '1yr', value: 360 },
] as const

export default function ComparisonToggle() {
  const { comparisonPeriod, setComparisonPeriod } = useAppStore()

  return (
    <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
      <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-600 px-1.5">
        vs
      </span>
      {OPTIONS.map((opt) => (
        <button
          key={opt.label}
          onClick={() => setComparisonPeriod(opt.value)}
          className={`px-2 py-1.5 rounded-md text-[11px] font-mono font-medium transition-all duration-200 ${
            comparisonPeriod === opt.value
              ? 'bg-white dark:bg-white/[0.08] text-ink dark:text-white shadow-sm'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
