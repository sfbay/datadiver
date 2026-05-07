import { useCallback, useRef, useState } from 'react'
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

/** Check if hour `h` is in the range [start, end], handling wrap-around */
function hourInRange(h: number, start: number, end: number): boolean {
  if (start <= end) return h >= start && h <= end
  return h >= start || h <= end
}

export default function TimeOfDayFilter({ hourTotals }: TimeOfDayFilterProps) {
  const { timeOfDayFilter, setTimeOfDayFilter } = useAppStore()
  const dragging = useRef(false)
  const dragStart = useRef<number | null>(null)
  const [dragPreview, setDragPreview] = useState<{ start: number; end: number } | null>(null)

  const maxCount = Math.max(...hourTotals, 1)

  const isHourSelected = (h: number): boolean => {
    if (!timeOfDayFilter) return true
    return hourInRange(h, timeOfDayFilter.startHour, timeOfDayFilter.endHour)
  }

  const isHourInPreview = (h: number): boolean => {
    if (!dragPreview) return false
    return hourInRange(h, dragPreview.start, dragPreview.end)
  }

  const handleMouseDown = useCallback((h: number) => {
    dragging.current = true
    dragStart.current = h
    setDragPreview({ start: h, end: h })
  }, [])

  const handleMouseEnter = useCallback((h: number) => {
    if (!dragging.current || dragStart.current === null) return
    const anchor = dragStart.current
    // Normalize: always put the lower hour as start for intuitive bi-directional drag
    const lo = Math.min(anchor, h)
    const hi = Math.max(anchor, h)
    setDragPreview({ start: lo, end: hi })
  }, [])

  const handleMouseUp = useCallback((h: number) => {
    if (!dragging.current || dragStart.current === null) return
    dragging.current = false
    const anchor = dragStart.current
    dragStart.current = null
    setDragPreview(null)
    if (anchor !== h) {
      const lo = Math.min(anchor, h)
      const hi = Math.max(anchor, h)
      if (lo === 0 && hi === 23) {
        setTimeOfDayFilter(null)
      } else {
        setTimeOfDayFilter({ startHour: lo, endHour: hi })
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

  const handleMouseLeave = useCallback(() => {
    dragging.current = false
    dragStart.current = null
    setDragPreview(null)
  }, [])

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
      <div className="flex gap-px" onMouseLeave={handleMouseLeave}>
        {Array.from({ length: 24 }, (_, h) => {
          const intensity = hourTotals[h] / maxCount
          const selected = isHourSelected(h)
          const inPreview = isHourInPreview(h)
          return (
            <button
              key={h}
              onMouseDown={() => handleMouseDown(h)}
              onMouseEnter={() => handleMouseEnter(h)}
              onMouseUp={() => handleMouseUp(h)}
              onClick={() => handleClick(h)}
              className={`
                flex-1 h-7 rounded-sm transition-all relative group
                ${dragPreview
                  ? inPreview
                    ? 'opacity-100 ring-1 ring-inset ring-amber-400/60'
                    : 'opacity-20'
                  : selected
                    ? 'opacity-100'
                    : 'opacity-25'
                }
                ${inPreview ? 'scale-y-110' : ''}
              `}
              style={{
                backgroundColor: inPreview
                  ? `rgba(251, 191, 36, ${0.35 + intensity * 0.55})`
                  : `rgba(251, 191, 36, ${0.15 + intensity * 0.7})`,
                transitionDuration: dragPreview ? '50ms' : '150ms',
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

      {/* Drag hint */}
      <div className="h-3 relative">
        {dragPreview && dragPreview.start !== dragPreview.end && (
          <span className="absolute left-1/2 -translate-x-1/2 top-0 text-[9px] font-mono text-ochre-500/80 animate-pulse">
            {formatHour(dragPreview.start)} – {formatHour(dragPreview.end)}
          </span>
        )}
      </div>

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
