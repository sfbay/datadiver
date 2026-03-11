import { useMemo, useCallback, useState } from 'react'
import ZScoreBar from '@/components/charts/ZScoreBar'

export interface SectorEntry {
  sector: string
  count: number
  openings: number
  closures: number
  net: number
}

interface SectorFilterProps {
  categories: SectorEntry[]
  selected: Set<string>
  onChange: (selected: Set<string>) => void
  /** Per-sector closure z-scores (positive = more closures than baseline). */
  zScores?: Map<string, number>
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
  'Uncategorized': '#94a3b8',
}

function getSectorColor(sector: string): string {
  return SECTOR_COLORS[sector] || '#64748b'
}

/** Translate a z-score into a human-readable closure health label */
function closureLabel(z: number): { text: string; className: string } {
  if (z >= 2.5) return { text: 'historically high closures', className: 'text-red-400' }
  if (z >= 1.5) return { text: 'elevated closures', className: 'text-red-400/70' }
  if (z >= 0.5) return { text: 'slightly elevated', className: 'text-amber-400/60' }
  if (z > -0.5) return { text: 'typical', className: 'text-slate-500' }
  if (z > -1.5) return { text: 'below average closures', className: 'text-emerald-400/70' }
  return { text: 'historically low closures', className: 'text-emerald-400' }
}

export default function SectorFilter({ categories, selected, onChange, zScores }: SectorFilterProps) {
  const [showExplainer, setShowExplainer] = useState(false)
  const allSectors = useMemo(() => categories.map((c) => c.sector), [categories])
  const allSelected = selected.size === 0

  const toggle = useCallback((sector: string) => {
    const next = new Set(selected)
    if (allSelected) {
      allSectors.forEach((s) => { if (s !== sector) next.add(s) })
      onChange(next)
    } else if (next.has(sector)) {
      next.delete(sector)
      onChange(next.size === 0 ? new Set() : next)
    } else {
      next.add(sector)
      onChange(next.size === allSectors.length ? new Set() : next)
    }
  }, [selected, allSelected, allSectors, onChange])

  const solo = useCallback((sector: string) => {
    if (selected.size === 1 && selected.has(sector)) {
      onChange(new Set())
    } else {
      onChange(new Set([sector]))
    }
  }, [selected, onChange])

  const selectAll = useCallback(() => {
    onChange(new Set())
  }, [onChange])

  const isChecked = (sector: string) => allSelected || selected.has(sector)

  // Find the uncategorized entry to render specially
  const uncategorized = categories.find((c) => c.sector === 'Uncategorized')
  const categorized = categories.filter((c) => c.sector !== 'Uncategorized')

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

      {/* Uncategorized banner */}
      {uncategorized && (
        <div className="mb-2">
          <div
            className={`relative px-2 py-2 rounded-lg transition-colors
              ${isChecked('Uncategorized') ? '' : 'opacity-40'}
              hover:bg-white/[0.04] group/row`}
          >
            <div className="flex items-center gap-1 mb-1.5">
              <button
                onClick={() => toggle('Uncategorized')}
                className={`w-3.5 h-3.5 rounded flex-shrink-0 border transition-colors flex items-center justify-center
                  ${isChecked('Uncategorized')
                    ? 'border-transparent bg-slate-500'
                    : 'border-slate-600 bg-transparent'
                  }`}
              >
                {isChecked('Uncategorized') && (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="1.5">
                    <path d="M1.5 4L3 5.5L6.5 2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => toggle('Uncategorized')}
                className="flex-1 flex items-center justify-between cursor-pointer"
              >
                <span className="text-[10px] text-slate-400 italic">
                  Uncategorized
                </span>
                <span className="text-[9px] font-mono text-slate-500 tabular-nums">
                  {uncategorized.count.toLocaleString()}
                </span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); solo('Uncategorized') }}
                className="opacity-0 group-hover/row:opacity-60 hover:!opacity-100 transition-opacity"
                title="Solo: show only Uncategorized"
              >
                <svg className="w-2.5 h-2.5 text-slate-400" viewBox="0 0 10 10" fill="currentColor">
                  <circle cx="5" cy="5" r="3" />
                </svg>
              </button>
            </div>
            {/* Proportion bar: openings (green) vs closures (red) */}
            <ProportionBar openings={uncategorized.openings} closures={uncategorized.closures} />
            <div className="flex justify-between mt-0.5">
              <span className="text-[8px] font-mono text-emerald-500/70">
                {uncategorized.openings.toLocaleString()} opened
              </span>
              <span className={`text-[8px] font-mono ${uncategorized.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                net {uncategorized.net >= 0 ? '+' : ''}{uncategorized.net.toLocaleString()}
              </span>
              <span className="text-[8px] font-mono text-red-500/70">
                {uncategorized.closures.toLocaleString()} closed
              </span>
            </div>
          </div>

          {/* Data quality note */}
          <button
            onClick={() => setShowExplainer(!showExplainer)}
            className="flex items-center gap-1 px-2 mt-1 text-[8px] font-mono text-amber-500/60 hover:text-amber-400/80 transition-colors"
          >
            <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 12 12" fill="currentColor">
              <path d="M6 1a5 5 0 100 10A5 5 0 006 1zm.5 7.5h-1v-1h1v1zm0-2h-1v-3h1v3z" />
            </svg>
            About this data
          </button>
          {showExplainer && (
            <div className="mx-2 mt-1 p-2 rounded-md bg-amber-500/5 border border-amber-500/10">
              <p className="text-[9px] text-amber-200/60 leading-relaxed">
                New business registrations often lack industry (NAICS) codes — codes are assigned later or not at all.
                This means most recent openings appear as "Uncategorized" while closures (older, established businesses) almost always have codes.
                Individual sectors may appear to be declining when the overall trend is growth.
              </p>
              <p className="text-[9px] text-amber-200/60 leading-relaxed mt-1.5">
                The health bars below compare each sector's closure rate against its own 5-year historical baseline (2019–2023).
                Green = fewer closures than typical. Red = more closures than typical. This normalizes for the data bias.
              </p>
            </div>
          )}

          <div className="mt-2 h-[1px] bg-white/[0.04]" />
        </div>
      )}

      {/* Z-score legend — compact with arrowheads */}
      {zScores && zScores.size > 0 && (
        <div className="px-2 pb-2">
          <div className="flex items-center justify-between text-[7px] font-mono text-slate-600 mb-0.5">
            <span className="flex items-center gap-0.5">
              <span className="text-red-500/40">◂</span>
              more closures
            </span>
            <span>typical</span>
            <span className="flex items-center gap-0.5">
              fewer closures
              <span className="text-emerald-500/40">▸</span>
            </span>
          </div>
          <ZScoreBar zScore={0} height={2} showCenter={false} />
        </div>
      )}

      {/* Categorized sector rows */}
      {categorized.map((entry) => {
        const checked = isChecked(entry.sector)
        const color = getSectorColor(entry.sector)
        const z = zScores?.get(entry.sector) ?? null
        const label = z !== null ? closureLabel(z) : null
        return (
          <div
            key={entry.sector}
            className={`relative px-2 py-1.5 rounded-md
              hover:bg-white/[0.04] transition-colors group/row
              ${checked ? '' : 'opacity-40'}`}
          >
            {/* Top line: checkbox + name + closure count */}
            <div className="flex items-center gap-1 mb-1">
              <div className="flex items-center gap-1">
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

              <button
                onClick={() => toggle(entry.sector)}
                className="flex-1 flex items-center justify-between cursor-pointer min-w-0"
              >
                <span className="text-[10px] text-slate-300 truncate mr-2">
                  {entry.sector}
                </span>
                <span className="text-[9px] font-mono text-slate-500 tabular-nums flex-shrink-0">
                  {entry.closures.toLocaleString()} closed
                </span>
              </button>
            </div>

            {/* Z-score bar + label */}
            <div className="ml-5">
              <ZScoreBar zScore={z} height={4} />
              {label && z !== null && (
                <p className={`text-[8px] font-mono mt-0.5 ${label.className}`}>
                  {z >= 0 ? '+' : ''}{z.toFixed(1)}σ · {label.text}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Simple proportion bar for Uncategorized: openings (green) vs closures (red) */
function ProportionBar({ openings, closures }: { openings: number; closures: number }) {
  const total = openings + closures
  if (total === 0) return <div className="h-1.5 rounded-full bg-slate-700/30 mt-1.5" />
  const openPct = (openings / total) * 100

  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-700/20 mt-1.5">
      <div
        className="h-full transition-all duration-500 rounded-l-full"
        style={{
          width: `${openPct}%`,
          background: 'linear-gradient(90deg, #10b981, #34d399)',
        }}
      />
      <div
        className="h-full transition-all duration-500 rounded-r-full"
        style={{
          width: `${100 - openPct}%`,
          background: 'linear-gradient(90deg, #f87171, #ef4444)',
        }}
      />
    </div>
  )
}
