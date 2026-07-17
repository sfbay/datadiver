/** ComparisonPopover — compact "Compare vs ▾" pill that opens a small
 *  dropdown of prior-period comparison options. Lives in the CardTray's
 *  pill bar (above the stat cards) — replaces the wide "vs Off / 30d /
 *  90d / 180d / 1yr" toggle that previously dominated the global header.
 *
 *  NOTE: this is a minimal rename shim onto the date-anchored ComparisonMode
 *  model (Task 3) — a full rewrite of this component (real preset UI +
 *  pinned-date picker) lands in Task 4. Don't extend it further here.
 */

import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { ComparisonMode } from '@/utils/comparisonMode'

const OPTIONS: Array<{ label: string; value: ComparisonMode }> = [
  { label: 'Off', value: null },
  { label: '30d', value: { kind: 'preset', preset: '30d' } },
  { label: '90d', value: { kind: 'preset', preset: '90d' } },
  { label: '180d', value: { kind: 'preset', preset: '180d' } },
  { label: '1yr', value: { kind: 'preset', preset: '1yr' } },
]

function periodLabel(mode: ComparisonMode): string | null {
  if (!mode) return null
  if (mode.kind === 'date') return mode.start
  return mode.preset
}

function sameMode(a: ComparisonMode, b: ComparisonMode): boolean {
  if (a === null || b === null) return a === b
  if (a.kind !== b.kind) return false
  if (a.kind === 'preset' && b.kind === 'preset') return a.preset === b.preset
  if (a.kind === 'date' && b.kind === 'date') return a.start === b.start
  return false
}

export default function ComparisonPopover() {
  const comparisonMode = useAppStore((s) => s.comparisonMode)
  const setComparisonMode = useAppStore((s) => s.setComparisonMode)
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

  const activeLabel = periodLabel(comparisonMode)
  const isActive = activeLabel !== null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-2 py-1 rounded-full transition-all duration-150 cursor-pointer
          ${isActive
            ? 'bg-slate-800/80 dark:bg-white/[0.06] border border-white/[0.12] text-slate-700 dark:text-slate-200'
            : 'bg-slate-900/50 dark:bg-white/[0.02] border border-white/[0.04] text-slate-500 hover:bg-slate-800/60 dark:hover:bg-white/[0.04] hover:border-white/[0.08]'
          }`}
        title={isActive ? `Currently comparing vs prior ${activeLabel}` : 'Compare against a prior period'}
      >
        <span className="text-[9px] font-mono whitespace-nowrap">
          {isActive ? `vs ${activeLabel}` : 'Compare'}
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
        <div className="absolute top-full left-0 mt-1.5 w-36 rounded-lg
          bg-slate-900/95 backdrop-blur-sm border border-white/[0.08]
          shadow-xl shadow-black/40 p-1 space-y-0.5 z-50"
        >
          {OPTIONS.map((opt) => {
            const selected = sameMode(comparisonMode, opt.value)
            return (
              <button
                key={opt.label}
                onClick={() => { setComparisonMode(opt.value); setOpen(false) }}
                className={`w-full flex items-center justify-between px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                  selected
                    ? 'bg-white/[0.08] text-white'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                <span>{opt.label === 'Off' ? 'Off' : `vs prior ${opt.label}`}</span>
                {selected && <span className="text-[9px] text-moss-400">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
