/** ComparisonPopover — compact "Compare vs ▾" pill that opens a small
 *  dropdown of prior-period comparison options. Lives in the CardTray's
 *  pill bar (above the stat cards) — replaces the wide "vs Off / 30d /
 *  90d / 180d / 1yr" toggle that previously dominated the global header.
 *
 *  Same semantics as the legacy ComparisonToggle: drives Zustand
 *  comparisonPeriod, off = no comparison, the integer values map to
 *  days-ago for the prior-period query.
 */

import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'

const OPTIONS = [
  { label: 'Off', value: null },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '180d', value: 180 },
  { label: '1yr', value: 360 },
] as const

function periodLabel(value: number | null): string | null {
  switch (value) {
    case null: return null
    case 30: return '30d'
    case 90: return '90d'
    case 180: return '180d'
    case 360: return '1yr'
    default: return null
  }
}

export default function ComparisonPopover() {
  const comparisonPeriod = useAppStore((s) => s.comparisonPeriod)
  const setComparisonPeriod = useAppStore((s) => s.setComparisonPeriod)
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

  const activeLabel = periodLabel(comparisonPeriod)
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
            const selected = comparisonPeriod === opt.value
            return (
              <button
                key={opt.label}
                onClick={() => { setComparisonPeriod(opt.value); setOpen(false) }}
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
