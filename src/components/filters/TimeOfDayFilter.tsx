import { useCallback, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import { formatHour } from '@/utils/time'

interface TimeOfDayFilterProps {
  /** Call counts per hour (24-element array) for intensity coloring */
  hourTotals: number[]
}

const PRESETS = [
  { label: 'All Day', start: null as number | null, end: null as number | null },
  { label: 'Morning', start: 6, end: 10 },
  { label: 'Midday', start: 10, end: 14 },
  { label: 'Evening', start: 18, end: 22 },
  { label: 'Overnight', start: 22, end: 6 },
  { label: 'Shift Chg', start: 7, end: 8 },
] as const

export default function TimeOfDayFilter({ hourTotals }: TimeOfDayFilterProps) {
  const { timeOfDayFilter, setTimeOfDayFilter } = useAppStore()
  const dragging = useRef(false)
  const dragStart = useRef<number | null>(null)

  const maxCount = Math.max(...hourTotals, 1)

  const isHourSelected = (h: number): boolean => {
    if (!timeOfDayFilter) return true
    const { startHour, endHour } = timeOfDayFilter
    if (startHour <= endHour) return h >= startHour && h <= endHour
    // Wrap-around (e.g., 22-6)
    return h >= startHour || h <= endHour
  }

  const handleMouseDown = useCallback((h: number) => {
    dragging.current = true
    dragStart.current = h
  }, [])

  const handleMouseUp = useCallback((h: number) => {
    if (!dragging.current || dragStart.current === null) return
    dragging.current = false
    const start = dragStart.current
    dragStart.current = null
    // Only use drag handler for multi-hour ranges; single-hour handled by click
    if (start !== h) {
      if (start === 0 && h === 23) {
        setTimeOfDayFilter(null)
      } else {
        setTimeOfDayFilter({ startHour: start, endHour: h })
      }
    }
  }, [setTimeOfDayFilter])

  const handleClick = useCallback((h: number) => {
    if (timeOfDayFilter && timeOfDayFilter.startHour === h && timeOfDayFilter.endHour === h) {
      setTimeOfDayFilter(null)
    } else {
      setTimeOfDayFilter({ startHour: h, endHour: h })
    }
  }, [timeOfDayFilter, setTimeOfDayFilter])

  const handlePreset = useCallback((start: number | null, end: number | null) => {
    if (start === null || end === null) {
      setTimeOfDayFilter(null)
    } else {
      setTimeOfDayFilter({ startHour: start, endHour: end })
    }
  }, [setTimeOfDayFilter])

  const isPresetActive = (preset: typeof PRESETS[number]): boolean => {
    if (preset.start === null) return timeOfDayFilter === null
    if (!timeOfDayFilter) return false
    return timeOfDayFilter.startHour === preset.start && timeOfDayFilter.endHour === preset.end
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Hour blocks */}
      <div className="flex gap-px" onMouseLeave={() => { dragging.current = false }}>
        {Array.from({ length: 24 }, (_, h) => {
          const intensity = hourTotals[h] / maxCount
          const selected = isHourSelected(h)
          return (
            <button
              key={h}
              onMouseDown={() => handleMouseDown(h)}
              onMouseUp={() => handleMouseUp(h)}
              onClick={() => handleClick(h)}
              className={`
                flex-1 h-7 rounded-sm transition-all duration-150 relative group
                ${selected ? '' : 'opacity-25'}
              `}
              style={{
                backgroundColor: `rgba(251, 191, 36, ${0.15 + intensity * 0.7})`,
              }}
              title={`${formatHour(h)}: ${hourTotals[h]} calls`}
            >
              {h % 6 === 0 && (
                <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] font-mono text-slate-400 dark:text-slate-600">
                  {formatHour(h)}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Bottom spacing for hour labels */}
      <div className="h-3" />

      {/* Presets */}
      <div className="flex gap-1 flex-wrap">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => handlePreset(preset.start, preset.end)}
            className={`
              px-2 py-1 rounded-md text-[10px] font-mono font-medium transition-all duration-150
              ${isPresetActive(preset)
                ? 'bg-signal-amber/20 text-signal-amber'
                : 'bg-slate-100 dark:bg-white/[0.04] text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.08]'
              }
            `}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  )
}
