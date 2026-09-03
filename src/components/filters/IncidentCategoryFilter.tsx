import { useMemo, useCallback, useState, Fragment } from 'react'
import { availableInGroup, groupDisabled } from './categoryGroups'
import { SF_CRIME_GROUPS } from '@/views/CrimeIncidents/crimeGroups'

export interface IncidentCategoryEntry {
  category: string
  count: number
}

/** Structurally identical to `SubcategoryRow` (useSubcategoryMovers.ts) ON
 *  PURPOSE — a shared src/components/ primitive must not import a type from
 *  a single view, and TypeScript's structural typing makes the two
 *  interchangeable at the call site. */
export interface SubcategoryEntry {
  key: string
  subcategory: string
  label: string
  count: number
  /** Every pair key this row's checkbox must filter on (self + authored
   *  merges) — e.g. SFPD's two live vehicle-break-in strings fold into one
   *  displayed row, so toggling it must filter on BOTH or the map undercounts
   *  against the number shown right next to the checkbox. */
  keys: string[]
}

interface IncidentCategoryFilterProps {
  categories: IncidentCategoryEntry[]
  selected: Set<string>
  onChange: (selected: Set<string>) => void
  groups?: Record<string, string[]>
  formatLabel?: (name: string) => string
  /** SF only. Keyed by category; a category absent here renders no chevron.
   *  Oakland passes nothing and its render is byte-identical. */
  subcategories?: Map<string, SubcategoryEntry[]>
  selectedSubs?: Set<string>
  onToggleSub?: (keys: string[]) => void
}

export default function IncidentCategoryFilter({
  categories, selected, onChange, groups, formatLabel,
  subcategories, selectedSubs, onToggleSub,
}: IncidentCategoryFilterProps) {
  const categoryGroups = groups ?? SF_CRIME_GROUPS
  const allTypes = useMemo(() => new Set(categories.map((c) => c.category)), [categories])
  const maxCount = useMemo(() => Math.max(...categories.map((c) => c.count), 1), [categories])
  const allSelected = selected.size === 0 || selected.size === allTypes.size

  const [openCats, setOpenCats] = useState<Set<string>>(() => new Set())
  const toggleOpen = useCallback((name: string) => {
    setOpenCats((prev) => {
      const n = new Set(prev)
      if (n.has(name)) n.delete(name); else n.add(name)
      return n
    })
  }, [])

  const handleToggle = useCallback((name: string) => {
    const next = new Set(selected.size === 0 ? allTypes : selected)
    if (next.has(name)) {
      next.delete(name)
    } else {
      next.add(name)
    }
    if (next.size === allTypes.size) {
      onChange(new Set())
    } else {
      onChange(next)
    }
  }, [selected, allTypes, onChange])

  const handleSolo = useCallback((name: string) => {
    onChange(new Set([name]))
  }, [onChange])

  const handleSelectAll = useCallback(() => {
    onChange(new Set())
  }, [onChange])

  const handleGroup = useCallback((groupName: string) => {
    const available = availableInGroup(categoryGroups[groupName] ?? [], allTypes)
    if (available.length === 0) return // disabled — never SELECT ALL by accident
    onChange(new Set(available))
  }, [allTypes, categoryGroups, onChange])

  const isGroupActive = useCallback((groupName: string) => {
    if (allSelected) return false
    const available = availableInGroup(categoryGroups[groupName] ?? [], allTypes)
    return available.length > 0 && available.every((t) => selected.has(t)) && selected.size === available.length
  }, [selected, allTypes, allSelected, categoryGroups])

  const isSelected = (name: string) => selected.size === 0 || selected.has(name)

  return (
    <div className="flex flex-col gap-2">
      {/* Quick group buttons */}
      <div className="flex flex-wrap gap-1">
        <button
          onClick={handleSelectAll}
          className={`px-2 py-1 rounded-md text-micro font-mono font-medium transition-all duration-150 ${
            allSelected
              ? 'bg-brick-500/15 text-brick-500'
              : 'bg-slate-100 dark:bg-white/[0.04] text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.08]'
          }`}
        >
          All
        </button>
        {Object.keys(categoryGroups).map((groupName) => {
          const empty = groupDisabled(
            categories.length > 0,
            availableInGroup(categoryGroups[groupName] ?? [], allTypes)
          )
          return (
            <button
              key={groupName}
              onClick={() => handleGroup(groupName)}
              disabled={empty}
              title={empty ? 'No matching categories in this range' : undefined}
              className={`px-2 py-1 rounded-md text-micro font-mono font-medium transition-all duration-150 ${
                empty
                  ? 'bg-slate-100/50 dark:bg-white/[0.02] text-slate-300 dark:text-slate-700 cursor-not-allowed'
                  : isGroupActive(groupName)
                    ? 'bg-brick-500/15 text-brick-500'
                    : 'bg-slate-100 dark:bg-white/[0.04] text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.08]'
              }`}
            >
              {groupName}
            </button>
          )
        })}
      </div>

      {/* Category list */}
      <div className="space-y-0.5 max-h-[420px] overflow-y-auto pr-1">
        {categories.map((entry) => {
          const active = isSelected(entry.category)
          const barWidth = (entry.count / maxCount) * 100
          const subs = subcategories?.get(entry.category) ?? []
          const canDrill = subs.length > 0 && !!onToggleSub
          const isOpen = openCats.has(entry.category)
          // The gutter itself (chevron OR its alignment placeholder) only
          // exists when the caller passed `subcategories` at all — i.e. SF.
          // Oakland never passes it, so Oakland's controls cluster keeps its
          // original two-button markup, byte-identical to before this task.
          const showGutter = subcategories !== undefined
          return (
            <Fragment key={entry.category}>
            <div
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
                  backgroundColor: '#b85545',
                }}
              />

              {/* Controls cluster: chevron + checkbox + solo */}
              <div className="relative flex items-center gap-1 flex-shrink-0">
                {showGutter && (
                  canDrill ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleOpen(entry.category) }}
                      aria-expanded={isOpen}
                      aria-label={isOpen
                        ? `Hide subcategories of ${entry.category}`
                        : `Show subcategories of ${entry.category}`}
                      className="flex-shrink-0 w-3 text-nano font-mono leading-none text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                    >
                      {isOpen ? '▾' : '▸'}
                    </button>
                  ) : (
                    <span className="flex-shrink-0 w-3" aria-hidden />
                  )
                )}
                <button
                  onClick={() => handleToggle(entry.category)}
                  className={`
                    flex-shrink-0 w-3 h-3 rounded-sm border transition-all cursor-pointer
                    ${active
                      ? 'bg-brick-500 border-brick-500'
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
                <button
                  onClick={(e) => { e.stopPropagation(); handleSolo(entry.category) }}
                  title="Show only this category"
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-0.5 rounded hover:bg-slate-200/60 dark:hover:bg-white/[0.08] cursor-pointer"
                >
                  <svg className="w-2.5 h-2.5 text-slate-400 dark:text-slate-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="8" cy="8" r="3" />
                    <path d="M8 1v2M8 13v2M1 8h2M13 8h2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Label (click to toggle) */}
              <button
                onClick={() => handleToggle(entry.category)}
                className="relative flex-1 min-w-0 text-label text-ink dark:text-slate-300 truncate leading-tight cursor-pointer text-left"
              >
                {formatLabel ? formatLabel(entry.category) : entry.category}
              </button>

              {/* Count badge */}
              <span className="relative text-micro font-mono text-slate-400 dark:text-slate-500 tabular-nums flex-shrink-0">
                {entry.count.toLocaleString()}
              </span>
            </div>
            {isOpen && subs.map((s) => {
              const on = selectedSubs?.has(s.key) ?? false
              return (
                <div
                  key={s.key}
                  className="flex items-center gap-2 py-1 pl-8 pr-2 rounded-lg hover:bg-white/60 dark:hover:bg-white/[0.03]"
                >
                  <button
                    onClick={() => onToggleSub?.(s.keys)}
                    aria-pressed={on}
                    className={`flex-shrink-0 w-2.5 h-2.5 rounded-sm border transition-all cursor-pointer ${
                      on ? 'bg-brick-500 border-brick-500' : 'border-slate-300 dark:border-slate-600'
                    }`}
                  />
                  <button
                    onClick={() => onToggleSub?.(s.keys)}
                    title={s.subcategory}
                    className="flex-1 min-w-0 text-micro text-slate-500 dark:text-slate-400 truncate text-left cursor-pointer"
                  >
                    {s.label}
                  </button>
                  <span className="text-nano font-mono text-slate-400 dark:text-slate-500 tabular-nums flex-shrink-0">
                    {s.count.toLocaleString()}
                  </span>
                </div>
              )
            })}
            {/* A case charged with two subcategories of one category counts
                once in the parent row and once in EACH child, so the children
                can total more than the number directly above them. Verified on
                the built page: Larceny Theft read 1,168 over children summing
                to 1,181. The same arithmetic already sits between category
                counts and the citywide total, but never this close together —
                two bare numbers an inch apart need the sentence. */}
            {isOpen && subs.length > 1 &&
              subs.reduce((sum, s) => sum + s.count, 0) > entry.count && (
              <p className="pl-8 pr-2 pt-0.5 pb-1 text-nano text-slate-400 dark:text-slate-500 leading-snug italic">
                These total more than {entry.category} above: a case charged with
                two of them counts in each.
              </p>
            )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
