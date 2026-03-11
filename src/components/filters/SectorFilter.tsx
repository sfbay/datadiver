import { useMemo, useCallback } from 'react'

interface SectorEntry {
  sector: string
  count: number
}

interface SectorFilterProps {
  categories: SectorEntry[]
  selected: Set<string>
  onChange: (selected: Set<string>) => void
}

// Accent colors for common NAICS sectors
const SECTOR_COLORS: Record<string, string> = {
  'Food Services': '#f59e0b',
  'Retail Trade': '#3b82f6',
  'Construction': '#f97316',
  'Professional, Scientific, and Technical Services': '#8b5cf6',
  'Real Estate and Rental and Leasing Services': '#10b981',
  'Arts, Entertainment, and Recreation': '#ec4899',
  'Accommodations': '#06b6d4',
  'Information': '#6366f1',
  'Private Education and Health Services': '#14b8a6',
  'Financial Services': '#84cc16',
}

function getSectorColor(sector: string): string {
  return SECTOR_COLORS[sector] || '#64748b'
}

export default function SectorFilter({ categories, selected, onChange }: SectorFilterProps) {
  const allSectors = useMemo(() => categories.map((c) => c.sector), [categories])
  const maxCount = useMemo(() => Math.max(...categories.map((c) => c.count), 1), [categories])
  const allSelected = selected.size === 0

  const toggle = useCallback((sector: string) => {
    const next = new Set(selected)
    if (allSelected) {
      // Switching from all → only this one excluded: select all EXCEPT this one
      allSectors.forEach((s) => { if (s !== sector) next.add(s) })
      onChange(next)
    } else if (next.has(sector)) {
      next.delete(sector)
      // If nothing left, go back to "all"
      onChange(next.size === 0 ? new Set() : next)
    } else {
      next.add(sector)
      // If all now selected, clear to mean "all"
      onChange(next.size === allSectors.length ? new Set() : next)
    }
  }, [selected, allSelected, allSectors, onChange])

  const solo = useCallback((sector: string) => {
    if (selected.size === 1 && selected.has(sector)) {
      onChange(new Set()) // un-solo
    } else {
      onChange(new Set([sector]))
    }
  }, [selected, onChange])

  const selectAll = useCallback(() => {
    onChange(new Set())
  }, [onChange])

  const isChecked = (sector: string) => allSelected || selected.has(sector)

  return (
    <div className="space-y-0.5">
      {/* Select all */}
      <button
        onClick={selectAll}
        className={`w-full text-left px-2 py-1 rounded text-[10px] font-mono transition-colors
          ${allSelected ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
      >
        {allSelected ? '✓ All sectors' : 'Show all sectors'}
      </button>

      {categories.map((entry) => {
        const checked = isChecked(entry.sector)
        const color = getSectorColor(entry.sector)
        const barWidth = (entry.count / maxCount) * 100
        return (
          <div
            key={entry.sector}
            className="relative flex items-center gap-1 px-2 py-1.5 rounded-md
              hover:bg-white/[0.04] transition-colors group/row"
          >
            {/* Background bar */}
            <div
              className="absolute inset-y-0 left-0 rounded-md opacity-[0.06]"
              style={{ width: `${barWidth}%`, backgroundColor: color }}
            />

            {/* Checkbox + solo */}
            <div className="flex items-center gap-1 relative z-10">
              <button
                onClick={() => toggle(entry.sector)}
                className={`w-3.5 h-3.5 rounded flex-shrink-0 border transition-colors flex items-center justify-center
                  ${checked
                    ? 'border-transparent'
                    : 'border-slate-600 bg-transparent'
                  }`}
                style={checked ? { backgroundColor: color } : undefined}
              >
                {checked && (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="1.5">
                    <path d="M1.5 4L3 5.5L6.5 2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); solo(entry.sector) }}
                className="opacity-0 group-hover/row:opacity-60 hover:!opacity-100 transition-opacity"
                title={`Solo: show only ${entry.sector}`}
              >
                <svg className="w-2.5 h-2.5 text-slate-400" viewBox="0 0 10 10" fill="currentColor">
                  <circle cx="5" cy="5" r="3" />
                </svg>
              </button>
            </div>

            {/* Label + count */}
            <button
              onClick={() => toggle(entry.sector)}
              className={`flex-1 flex items-center justify-between relative z-10 cursor-pointer
                ${checked ? '' : 'opacity-40'}`}
            >
              <span className="text-[10px] text-slate-300 truncate mr-2">
                {entry.sector || 'Uncategorized'}
              </span>
              <span className="text-[9px] font-mono text-slate-500 tabular-nums flex-shrink-0">
                {entry.count.toLocaleString()}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
