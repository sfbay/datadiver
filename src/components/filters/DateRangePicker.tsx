import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'

const PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '180d', days: 180 },
  { label: 'YTD', days: 0 },
  { label: '1Y', days: 365 },
  { label: '2Y', days: 730 },
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

/** How many days between two YYYY-MM-DD strings */
function daysBetween(a: string, b: string): number {
  const msDay = 86_400_000
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / msDay)
}

/** Visual timeline track — shows where the selected range sits within the past 2 years */
function TimelineTrack({
  start,
  end,
  onDragEnd,
}: {
  start: string
  end: string
  onDragEnd: (start: string, end: string) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const TRACK_SPAN_DAYS = 730 // 2 years of context
  const todayStr = today()
  const originDate = daysAgo(TRACK_SPAN_DAYS)

  // Compute positions as fractions of the track
  const startFrac = Math.max(0, Math.min(1, daysBetween(originDate, start) / TRACK_SPAN_DAYS))
  const endFrac = Math.max(0, Math.min(1, daysBetween(originDate, end) / TRACK_SPAN_DAYS))

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const track = trackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const clickFrac = (e.clientX - rect.left) / rect.width
      const clickDay = Math.round(clickFrac * TRACK_SPAN_DAYS)
      const rangeDays = daysBetween(start, end)
      const halfRange = Math.round(rangeDays / 2)

      // Center the current range width around the click point
      let newStartDay = clickDay - halfRange
      let newEndDay = clickDay + halfRange
      if (newStartDay < 0) { newStartDay = 0; newEndDay = rangeDays }
      if (newEndDay > TRACK_SPAN_DAYS) { newEndDay = TRACK_SPAN_DAYS; newStartDay = TRACK_SPAN_DAYS - rangeDays }

      const origin = new Date(originDate + 'T12:00:00')
      const newStart = new Date(origin.getTime() + newStartDay * 86_400_000).toISOString().split('T')[0]
      const newEnd = new Date(origin.getTime() + newEndDay * 86_400_000).toISOString().split('T')[0]
      onDragEnd(newStart, newEnd > todayStr ? todayStr : newEnd)
    },
    [start, end, originDate, todayStr, onDragEnd, TRACK_SPAN_DAYS]
  )

  // Year markers
  const yearMarkers: { label: string; frac: number }[] = []
  const currentYear = new Date().getFullYear()
  for (let y = currentYear - 2; y <= currentYear; y++) {
    const janFirst = `${y}-01-01`
    const frac = daysBetween(originDate, janFirst) / TRACK_SPAN_DAYS
    if (frac >= 0 && frac <= 1) yearMarkers.push({ label: String(y), frac })
  }

  return (
    <div className="relative pt-1 pb-3 cursor-pointer" ref={trackRef} onClick={handleClick}>
      {/* Track background */}
      <div className="h-2 rounded-full bg-slate-200/60 dark:bg-white/[0.06] relative overflow-hidden">
        {/* Selected range highlight */}
        <div
          className="absolute top-0 bottom-0 rounded-full bg-signal-blue/50 dark:bg-signal-blue/40 transition-all duration-300"
          style={{
            left: `${startFrac * 100}%`,
            width: `${Math.max(0.5, (endFrac - startFrac) * 100)}%`,
          }}
        />
        {/* Range edge markers */}
        <div
          className="absolute top-[-1px] w-1 h-[10px] rounded-full bg-signal-blue shadow-sm shadow-signal-blue/40 transition-all duration-300"
          style={{ left: `${startFrac * 100}%` }}
        />
        <div
          className="absolute top-[-1px] w-1 h-[10px] rounded-full bg-signal-blue shadow-sm shadow-signal-blue/40 transition-all duration-300"
          style={{ left: `${endFrac * 100}%` }}
        />
      </div>
      {/* Year tick marks */}
      {yearMarkers.map((m) => (
        <div
          key={m.label}
          className="absolute text-[7px] font-mono text-slate-400/50 dark:text-slate-600"
          style={{ left: `${m.frac * 100}%`, top: '14px', transform: 'translateX(-50%)' }}
        >
          {m.label}
        </div>
      ))}
    </div>
  )
}

export default function DateRangePicker() {
  const { dateRange, setDateRange } = useAppStore()
  const [isCustomOpen, setIsCustomOpen] = useState(false)
  const [localStart, setLocalStart] = useState(dateRange.start)
  const [localEnd, setLocalEnd] = useState(dateRange.end)
  const customRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLocalStart(dateRange.start)
    setLocalEnd(dateRange.end)
  }, [dateRange.start, dateRange.end])

  // Close custom panel on outside click
  useEffect(() => {
    if (!isCustomOpen) return
    const handleClick = (e: MouseEvent) => {
      if (customRef.current && !customRef.current.contains(e.target as Node)) {
        setIsCustomOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isCustomOpen])

  const applyRange = useCallback((start: string, end: string) => {
    setDateRange(start, end)
    setLocalStart(start)
    setLocalEnd(end)
    setIsCustomOpen(false)
  }, [setDateRange])

  const applyPreset = (preset: typeof PRESETS[number]) => {
    const start = preset.days === 0 ? yearStart() : daysAgo(preset.days)
    applyRange(start, today())
  }

  const handleApply = () => {
    if (localStart && localEnd && localStart <= localEnd) {
      applyRange(localStart, localEnd)
    }
  }

  // Detect active preset
  const activePreset = PRESETS.find((p) => {
    const expectedStart = p.days === 0 ? yearStart() : daysAgo(p.days)
    return dateRange.start === expectedStart && dateRange.end === today()
  })

  const formatDisplay = (start: string, end: string) => {
    const s = new Date(start + 'T12:00:00')
    const e = new Date(end + 'T12:00:00')
    const fmt = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const yearSuffix = s.getFullYear() !== e.getFullYear()
      ? `, ${s.getFullYear()}`
      : ''
    return `${fmt(s)}${yearSuffix} \u2013 ${fmt(e)}`
  }

  const rangeDays = daysBetween(dateRange.start, dateRange.end)

  return (
    <div className="relative" ref={customRef}>
      {/* Current range display */}
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-sm font-mono font-semibold text-ink dark:text-white tracking-tight">
          {formatDisplay(dateRange.start, dateRange.end)}
        </p>
        <span className="text-[9px] font-mono text-slate-400/60 dark:text-slate-600">
          {rangeDays}d
        </span>
      </div>

      {/* Visual timeline track */}
      <TimelineTrack start={dateRange.start} end={dateRange.end} onDragEnd={applyRange} />

      {/* Preset pills — always visible */}
      <div className="flex gap-0.5 mb-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => applyPreset(preset)}
            className={`
              flex-1 py-1 rounded-md text-[9px] font-mono font-medium
              transition-all duration-150
              ${activePreset?.label === preset.label
                ? 'bg-signal-blue text-white shadow-sm shadow-signal-blue/30'
                : 'bg-slate-100/80 dark:bg-white/[0.04] text-slate-500 dark:text-slate-500 hover:bg-slate-200/80 dark:hover:bg-white/[0.08]'
              }
            `}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Custom range toggle */}
      <button
        onClick={() => setIsCustomOpen(!isCustomOpen)}
        className="w-full text-center py-0.5 text-[9px] font-mono text-slate-400/60 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
      >
        {isCustomOpen ? 'close' : 'custom range'}
      </button>

      {/* Custom date inputs (expandable) */}
      {isCustomOpen && (
        <div className="mt-1.5 p-2.5 rounded-lg bg-slate-50/80 dark:bg-white/[0.03] border border-slate-200/50 dark:border-white/[0.06] space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[8px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-0.5">
                From
              </label>
              <input
                type="date"
                value={localStart}
                max={localEnd}
                onChange={(e) => setLocalStart(e.target.value)}
                className="
                  w-full px-2 py-1 rounded-md text-[10px] font-mono
                  bg-white dark:bg-white/[0.04]
                  border border-slate-200/80 dark:border-white/[0.08]
                  text-ink dark:text-slate-200
                  focus:outline-none focus:ring-1 focus:ring-signal-blue/30
                  transition-all
                "
              />
            </div>
            <div>
              <label className="text-[8px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-0.5">
                To
              </label>
              <input
                type="date"
                value={localEnd}
                min={localStart}
                onChange={(e) => setLocalEnd(e.target.value)}
                className="
                  w-full px-2 py-1 rounded-md text-[10px] font-mono
                  bg-white dark:bg-white/[0.04]
                  border border-slate-200/80 dark:border-white/[0.08]
                  text-ink dark:text-slate-200
                  focus:outline-none focus:ring-1 focus:ring-signal-blue/30
                  transition-all
                "
              />
            </div>
          </div>
          <button
            onClick={handleApply}
            disabled={!localStart || !localEnd || localStart > localEnd}
            className="
              w-full py-1 rounded-md text-[10px] font-mono font-medium
              bg-signal-blue text-white
              hover:bg-signal-blue/90
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-150
            "
          >
            Apply
          </button>
        </div>
      )}
    </div>
  )
}
