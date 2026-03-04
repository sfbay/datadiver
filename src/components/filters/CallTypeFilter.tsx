import { useMemo, useCallback } from 'react'
import { toTitleCase } from '@/utils/format'

export interface CallTypeEntry {
  callType: string
  count: number
  isSensitive: boolean
}

interface CallTypeFilterProps {
  callTypes: CallTypeEntry[]
  selected: Set<string>
  onChange: (selected: Set<string>) => void
}

export default function CallTypeFilter({ callTypes, selected, onChange }: CallTypeFilterProps) {
  const allTypes = useMemo(() => new Set(callTypes.map((c) => c.callType)), [callTypes])
  const maxCount = useMemo(() => Math.max(...callTypes.map((c) => c.count), 1), [callTypes])
  const allSelected = selected.size === 0 || selected.size === allTypes.size

  const handleToggle = useCallback((callType: string) => {
    const next = new Set(selected.size === 0 ? allTypes : selected)
    if (next.has(callType)) {
      next.delete(callType)
    } else {
      next.add(callType)
    }
    // If everything is selected, clear to represent "all"
    if (next.size === allTypes.size) {
      onChange(new Set())
    } else {
      onChange(next)
    }
  }, [selected, allTypes, onChange])

  const handleSolo = useCallback((callType: string) => {
    onChange(new Set([callType]))
  }, [onChange])

  const handleSelectAll = useCallback(() => {
    onChange(new Set())
  }, [onChange])

  const handleSensitiveOnly = useCallback(() => {
    const sensitiveTypes = new Set(
      callTypes.filter((c) => c.isSensitive).map((c) => c.callType)
    )
    onChange(sensitiveTypes)
  }, [callTypes, onChange])

  const isSelected = (callType: string) => selected.size === 0 || selected.has(callType)

  return (
    <div className="flex flex-col gap-2">
      {/* Quick actions */}
      <div className="flex gap-1">
        <button
          onClick={handleSelectAll}
          className={`px-2 py-1 rounded-md text-[10px] font-mono font-medium transition-all duration-150 ${
            allSelected
              ? 'bg-signal-blue/15 text-signal-blue'
              : 'bg-slate-100 dark:bg-white/[0.04] text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.08]'
          }`}
        >
          All Types
        </button>
        <button
          onClick={handleSensitiveOnly}
          className={`px-2 py-1 rounded-md text-[10px] font-mono font-medium transition-all duration-150 flex items-center gap-1 ${
            !allSelected && callTypes.filter((c) => c.isSensitive).every((c) => selected.has(c.callType)) && selected.size === callTypes.filter((c) => c.isSensitive).length
              ? 'bg-violet-500/15 text-violet-400'
              : 'bg-slate-100 dark:bg-white/[0.04] text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.08]'
          }`}
        >
          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
          Sensitive
        </button>
      </div>

      {/* Call type list */}
      <div className="space-y-0.5 max-h-[420px] overflow-y-auto pr-1">
        {callTypes.map((entry) => {
          const active = isSelected(entry.callType)
          const barWidth = (entry.count / maxCount) * 100
          return (
            <div
              key={entry.callType}
              className={`
                group w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-left
                transition-all duration-150 relative overflow-hidden
                ${active
                  ? 'hover:bg-white/80 dark:hover:bg-white/[0.04]'
                  : 'opacity-35 hover:opacity-60'
                }
              `}
            >
              {/* Background volume bar */}
              <div
                className="absolute inset-y-0 left-0 rounded-lg opacity-[0.06]"
                style={{
                  width: `${barWidth}%`,
                  backgroundColor: entry.isSensitive ? '#a78bfa' : '#60a5fa',
                }}
              />

              {/* Checkbox indicator */}
              <button
                onClick={() => handleToggle(entry.callType)}
                className={`
                  relative flex-shrink-0 w-3 h-3 rounded-sm border transition-all cursor-pointer
                  ${active
                    ? entry.isSensitive
                      ? 'bg-violet-500 border-violet-500'
                      : 'bg-blue-500 border-blue-500'
                    : 'border-slate-300 dark:border-slate-600'
                  }
                `}
              >
                {active && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M3 6l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>

              {/* Label + shield (click to toggle) */}
              <button
                onClick={() => handleToggle(entry.callType)}
                className="relative flex-1 min-w-0 flex items-center gap-1 cursor-pointer text-left"
              >
                {entry.isSensitive && (
                  <svg className="w-3 h-3 text-violet-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                  </svg>
                )}
                <span className="text-[11px] text-ink dark:text-slate-300 truncate leading-tight">
                  {toTitleCase(entry.callType)}
                </span>
              </button>

              {/* Solo button (visible on hover) */}
              <button
                onClick={(e) => { e.stopPropagation(); handleSolo(entry.callType) }}
                title="Show only this type"
                className="relative flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-0.5 rounded hover:bg-slate-200/60 dark:hover:bg-white/[0.08] cursor-pointer"
              >
                <svg className="w-3 h-3 text-slate-400 dark:text-slate-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="8" r="3" />
                  <path d="M8 1v2M8 13v2M1 8h2M13 8h2" strokeLinecap="round" />
                </svg>
              </button>

              {/* Count badge */}
              <span className="relative text-[10px] font-mono text-slate-400 dark:text-slate-500 tabular-nums flex-shrink-0">
                {entry.count.toLocaleString()}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
