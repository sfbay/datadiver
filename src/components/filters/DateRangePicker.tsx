import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'

const PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'YTD', days: 0 }, // special: year-to-date
] as const

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

function yearStart(): string {
  return `${new Date().getFullYear()}-01-01`
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

export default function DateRangePicker() {
  const { dateRange, setDateRange } = useAppStore()
  const [isOpen, setIsOpen] = useState(false)
  const [localStart, setLocalStart] = useState(dateRange.start)
  const [localEnd, setLocalEnd] = useState(dateRange.end)
  const panelRef = useRef<HTMLDivElement>(null)

  // Sync local state when store changes
  useEffect(() => {
    setLocalStart(dateRange.start)
    setLocalEnd(dateRange.end)
  }, [dateRange.start, dateRange.end])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  const applyRange = (start: string, end: string) => {
    setDateRange(start, end)
    setLocalStart(start)
    setLocalEnd(end)
    setIsOpen(false)
  }

  const applyPreset = (preset: typeof PRESETS[number]) => {
    const start = preset.days === 0 ? yearStart() : daysAgo(preset.days)
    applyRange(start, today())
  }

  const handleApply = () => {
    if (localStart && localEnd && localStart <= localEnd) {
      applyRange(localStart, localEnd)
    }
  }

  // Compute which preset is active
  const activePreset = PRESETS.find((p) => {
    const expectedStart = p.days === 0 ? yearStart() : daysAgo(p.days)
    return dateRange.start === expectedStart && dateRange.end === today()
  })

  const formatDisplay = (start: string, end: string) => {
    const s = new Date(start + 'T12:00:00')
    const e = new Date(end + 'T12:00:00')
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmt(s)} \u2013 ${fmt(e)}`
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="
          group flex items-center gap-2 text-left w-full
          hover:bg-slate-50 dark:hover:bg-white/[0.03]
          rounded-lg px-3 py-2 transition-all duration-200
        "
      >
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
            Date Range
          </p>
          <p className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate">
            {formatDisplay(dateRange.start, dateRange.end)}
          </p>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-600 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen && (
        <div className="
          absolute bottom-full left-0 mb-2 w-64
          bg-white dark:bg-slate-900
          border border-slate-200/80 dark:border-white/[0.08]
          rounded-xl shadow-xl shadow-black/10 dark:shadow-black/40
          p-3 z-50
          animate-in fade-in slide-in-from-bottom-2
        ">
          {/* Presets */}
          <div className="flex gap-1 mb-3">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset)}
                className={`
                  flex-1 py-1.5 rounded-md text-[11px] font-mono font-medium
                  transition-all duration-150
                  ${activePreset?.label === preset.label
                    ? 'bg-signal-blue text-white shadow-sm shadow-signal-blue/30'
                    : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.1]'
                  }
                `}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-px bg-slate-200/60 dark:bg-white/[0.06]" />
            <span className="text-[9px] font-mono text-slate-400/60 dark:text-slate-600 uppercase tracking-wider">Custom</span>
            <div className="flex-1 h-px bg-slate-200/60 dark:bg-white/[0.06]" />
          </div>

          {/* Date inputs */}
          <div className="space-y-2 mb-3">
            <div>
              <label className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                From
              </label>
              <input
                type="date"
                value={localStart}
                max={localEnd}
                onChange={(e) => setLocalStart(e.target.value)}
                className="
                  w-full px-2.5 py-1.5 rounded-lg text-xs font-mono
                  bg-slate-50 dark:bg-white/[0.04]
                  border border-slate-200/80 dark:border-white/[0.08]
                  text-ink dark:text-slate-200
                  focus:outline-none focus:ring-2 focus:ring-signal-blue/30 focus:border-signal-blue/50
                  transition-all
                "
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                To
              </label>
              <input
                type="date"
                value={localEnd}
                min={localStart}
                onChange={(e) => setLocalEnd(e.target.value)}
                className="
                  w-full px-2.5 py-1.5 rounded-lg text-xs font-mono
                  bg-slate-50 dark:bg-white/[0.04]
                  border border-slate-200/80 dark:border-white/[0.08]
                  text-ink dark:text-slate-200
                  focus:outline-none focus:ring-2 focus:ring-signal-blue/30 focus:border-signal-blue/50
                  transition-all
                "
              />
            </div>
          </div>

          {/* Apply button */}
          <button
            onClick={handleApply}
            disabled={!localStart || !localEnd || localStart > localEnd}
            className="
              w-full py-1.5 rounded-lg text-[11px] font-medium
              bg-signal-blue text-white
              hover:bg-signal-blue/90
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-150
              shadow-sm shadow-signal-blue/20
            "
          >
            Apply Range
          </button>
        </div>
      )}
    </div>
  )
}
