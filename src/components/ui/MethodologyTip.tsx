/** MethodologyTip — reusable disclosure for any computed metric.
 * Shows a "How is this calculated?" trigger that expands to reveal formula, inputs, and exclusions. */

import { useState } from 'react'

interface MethodologyTipProps {
  /** Short description of the formula (e.g., "ethnic media spend / discretionary ad total × 100") */
  formula: string
  /** Named inputs used in the computation */
  inputs?: { label: string; value: string }[]
  /** Items excluded from the computation */
  exclusions?: { label: string; reason: string }[]
  /** Additional context or caveats */
  note?: string
  className?: string
}

export default function MethodologyTip({ formula, inputs, exclusions, note, className = '' }: MethodologyTipProps) {
  const [open, setOpen] = useState(false)

  return (
    <span className={`inline-block relative ${className}`} style={{ zIndex: open ? 999 : 'auto' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[9px] font-mono text-slate-400 hover:text-teal-500 dark:hover:text-teal-500 transition-colors underline decoration-dotted underline-offset-2"
      >
        How is this calculated?
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 glass-card rounded-lg p-3 shadow-lg border border-slate-200/30 dark:border-white/[0.06] text-left" style={{ zIndex: 999 }}>
          <div className="space-y-2">
            <div>
              <p className="text-[8px] font-mono uppercase tracking-wider text-slate-400/60 mb-0.5">Formula</p>
              <p className="text-[10px] font-mono text-slate-600 dark:text-slate-300">{formula}</p>
            </div>

            {inputs && inputs.length > 0 && (
              <div>
                <p className="text-[8px] font-mono uppercase tracking-wider text-slate-400/60 mb-0.5">Inputs</p>
                <div className="space-y-0.5">
                  {inputs.map((inp) => (
                    <div key={inp.label} className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-500">{inp.label}</span>
                      <span className="font-mono text-slate-600 dark:text-slate-300 tabular-nums">{inp.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {exclusions && exclusions.length > 0 && (
              <div>
                <p className="text-[8px] font-mono uppercase tracking-wider text-slate-400/60 mb-0.5">Exclusions</p>
                <div className="space-y-0.5">
                  {exclusions.map((ex) => (
                    <div key={ex.label} className="text-[10px]">
                      <span className="text-slate-500">{ex.label}</span>
                      <span className="text-slate-400/60"> — {ex.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {note && (
              <p className="text-[9px] text-slate-400/70 italic">{note}</p>
            )}
          </div>

          <button
            onClick={() => setOpen(false)}
            className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 2l6 6M8 2l-6 6" />
            </svg>
          </button>
        </div>
      )}
    </span>
  )
}
