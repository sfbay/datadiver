/** ComparisonPopover — "vs July 4, 2025 ▾" pill that opens a dropdown of
 *  comparison presets resolved to concrete dates, plus a pinned-date picker.
 *  Lives in the CardTray's pill bar.
 *
 *  Presets follow the global date range ('1yr' = same calendar day last
 *  year, leap-aware); a picked date stays pinned when the range moves.
 *  State: appStore.comparisonMode (URL: ?compare=1yr | ?compare=YYYY-MM-DD).
 */

import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import {
  type ComparisonPreset,
  resolveComparisonRange, describeWindow, comparisonLabel,
} from '@/utils/comparisonMode'

const PRESET_ROWS: Array<{ preset: ComparisonPreset; label: string; multiDayLabel?: string }> = [
  { preset: 'prev', label: 'Previous day', multiDayLabel: 'Previous period' },
  { preset: '30d', label: '30 days earlier' },
  { preset: '90d', label: '90 days earlier' },
  { preset: '180d', label: '180 days earlier' },
  { preset: '1yr', label: 'Same day last year', multiDayLabel: 'Same dates last year' },
]

export default function ComparisonPopover() {
  const comparisonMode = useAppStore((s) => s.comparisonMode)
  const setComparisonMode = useAppStore((s) => s.setComparisonMode)
  const dateRange = useAppStore((s) => s.dateRange)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const activeLabel = comparisonLabel(comparisonMode, dateRange)
  const isActive = comparisonMode !== null
  const isMultiDay = dateRange.start !== dateRange.end
  const pinnedDate = comparisonMode?.kind === 'date' ? comparisonMode.start : ''
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-2 py-1 rounded-full transition-all duration-150 cursor-pointer
          ${isActive
            ? 'bg-slate-800/80 dark:bg-white/[0.06] border border-white/[0.12] text-slate-700 dark:text-slate-200'
            : 'bg-slate-900/50 dark:bg-white/[0.02] border border-white/[0.04] text-slate-500 hover:bg-slate-800/60 dark:hover:bg-white/[0.04] hover:border-white/[0.08]'
          }`}
        title={isActive ? `Comparing ${activeLabel}` : 'Compare against another date'}
      >
        <span className="text-[9px] font-mono whitespace-nowrap">
          {isActive ? activeLabel : 'Compare'}
        </span>
        <svg
          width="8" height="8" viewBox="0 0 8 8"
          fill="none" stroke="currentColor"
          strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 3l2 2 2-2" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-64 rounded-lg
          bg-slate-900/95 backdrop-blur-sm border border-white/[0.08]
          shadow-xl shadow-black/40 p-1 space-y-0.5 z-50"
        >
          <button
            onClick={() => { setComparisonMode(null); setOpen(false) }}
            className={`w-full flex items-center justify-between px-2 py-1 rounded text-[10px] font-mono transition-colors ${
              !isActive
                ? 'bg-ochre-500/15 ring-1 ring-ochre-500/30 text-white'
                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
            }`}
          >
            <span>Off</span>
          </button>

          {PRESET_ROWS.map(({ preset, label, multiDayLabel }) => {
            const win = resolveComparisonRange({ kind: 'preset', preset }, dateRange)
            const selected = comparisonMode?.kind === 'preset' && comparisonMode.preset === preset
            return (
              <button
                key={preset}
                onClick={() => { setComparisonMode({ kind: 'preset', preset }); setOpen(false) }}
                className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                  selected
                    ? 'bg-ochre-500/15 ring-1 ring-ochre-500/30 text-white'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                <span className="whitespace-nowrap">{isMultiDay && multiDayLabel ? multiDayLabel : label}</span>
                <span className="text-[9px] text-slate-500 whitespace-nowrap">{win ? describeWindow(win) : ''}</span>
              </button>
            )
          })}

          {/* Pinned date — a fact, not a relationship: stays put when the range moves */}
          <div
            className={`flex items-center justify-between gap-2 px-2 py-1 rounded text-[10px] font-mono ${
              comparisonMode?.kind === 'date'
                ? 'bg-ochre-500/15 ring-1 ring-ochre-500/30 text-white'
                : 'text-slate-400'
            }`}
          >
            <span className="whitespace-nowrap">Pick a date</span>
            <input
              type="date"
              value={pinnedDate}
              max={today}
              onChange={(e) => {
                if (e.target.value) {
                  setComparisonMode({ kind: 'date', start: e.target.value })
                  setOpen(false)
                }
              }}
              className="bg-transparent text-[10px] font-mono text-slate-300 outline-none
                [color-scheme:dark] cursor-pointer w-[110px]"
              aria-label="Pinned comparison date"
            />
          </div>
        </div>
      )}
    </div>
  )
}
