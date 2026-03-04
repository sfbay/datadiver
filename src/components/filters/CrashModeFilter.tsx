import { useMemo, useCallback } from 'react'
import { CRASH_MODE_COLORS } from '@/utils/colors'

export interface CrashModeEntry {
  mode: string
  count: number
}

interface CrashModeFilterProps {
  categories: CrashModeEntry[]
  selected: Set<string>
  onChange: (selected: Set<string>) => void
}

const MODE_GROUPS: Record<string, string[]> = {
  'Pedestrian': ['Vehicle-Pedestrian'],
  'Bicycle': ['Vehicle-Bicycle'],
  'Vehicle-Only': ['Vehicle(s) Only Involved'],
}

export default function CrashModeFilter({ categories, selected, onChange }: CrashModeFilterProps) {
  const allTypes = useMemo(() => new Set(categories.map((c) => c.mode)), [categories])
  const maxCount = useMemo(() => Math.max(...categories.map((c) => c.count), 1), [categories])
  const allSelected = selected.size === 0 || selected.size === allTypes.size

  const handleToggle = useCallback((name: string) => {
    const next = new Set(selected.size === 0 ? allTypes : selected)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    if (next.size === allTypes.size) onChange(new Set())
    else onChange(next)
  }, [selected, allTypes, onChange])

  const handleSolo = useCallback((name: string) => {
    onChange(new Set([name]))
  }, [onChange])

  const handleSelectAll = useCallback(() => {
    onChange(new Set())
  }, [onChange])

  const handleGroup = useCallback((groupName: string) => {
    const groupTypes = MODE_GROUPS[groupName] || []
    const available = new Set(groupTypes.filter((t) => allTypes.has(t)))
    onChange(available)
  }, [allTypes, onChange])

  const isGroupActive = useCallback((groupName: string) => {
    if (allSelected) return false
    const groupTypes = MODE_GROUPS[groupName] || []
    const available = groupTypes.filter((t) => allTypes.has(t))
    return available.length > 0 && available.every((t) => selected.has(t)) && selected.size === available.length
  }, [selected, allTypes, allSelected])

  const isSelected = (name: string) => selected.size === 0 || selected.has(name)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        <button
          onClick={handleSelectAll}
          className={`px-2 py-1 rounded-md text-[10px] font-mono font-medium transition-all duration-150 ${
            allSelected
              ? 'bg-red-500/15 text-red-500'
              : 'bg-slate-100 dark:bg-white/[0.04] text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.08]'
          }`}
        >
          All
        </button>
        {Object.keys(MODE_GROUPS).map((groupName) => (
          <button
            key={groupName}
            onClick={() => handleGroup(groupName)}
            className={`px-2 py-1 rounded-md text-[10px] font-mono font-medium transition-all duration-150 ${
              isGroupActive(groupName)
                ? 'bg-red-500/15 text-red-500'
                : 'bg-slate-100 dark:bg-white/[0.04] text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.08]'
            }`}
          >
            {groupName}
          </button>
        ))}
      </div>

      <div className="space-y-0.5 max-h-[420px] overflow-y-auto pr-1">
        {categories.map((entry) => {
          const active = isSelected(entry.mode)
          const barWidth = (entry.count / maxCount) * 100
          const modeColor = CRASH_MODE_COLORS[entry.mode] || '#64748b'
          return (
            <div
              key={entry.mode}
              className={`
                group w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-left
                transition-all duration-150 relative overflow-hidden
                ${active
                  ? 'hover:bg-white/80 dark:hover:bg-white/[0.04]'
                  : 'opacity-35 hover:opacity-60'
                }
              `}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-lg opacity-[0.06]"
                style={{ width: `${barWidth}%`, backgroundColor: modeColor }}
              />

              <button
                onClick={() => handleToggle(entry.mode)}
                className={`
                  relative flex-shrink-0 w-3 h-3 rounded-sm border transition-all cursor-pointer
                  ${active ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'}
                `}
                style={active ? { backgroundColor: modeColor, borderColor: modeColor } : undefined}
              >
                {active && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M3 6l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>

              <button
                onClick={() => handleToggle(entry.mode)}
                className="relative flex-1 min-w-0 text-[11px] text-ink dark:text-slate-300 truncate leading-tight cursor-pointer text-left"
              >
                {entry.mode}
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); handleSolo(entry.mode) }}
                title="Show only this mode"
                className="relative flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-0.5 rounded hover:bg-slate-200/60 dark:hover:bg-white/[0.08] cursor-pointer"
              >
                <svg className="w-3 h-3 text-slate-400 dark:text-slate-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="8" r="3" />
                  <path d="M8 1v2M8 13v2M1 8h2M13 8h2" strokeLinecap="round" />
                </svg>
              </button>

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
