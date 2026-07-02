/** AnomalyRampSwitcher — DEV-ONLY in-map picker for choosing the anomaly
 *  ramp treatment on live data (roadmap item 6's design gate).
 *
 *  Appears only when the URL carries a ?ramp= param (same spirit as the
 *  ?tune=1 ambient sliders): visit /live?fill=anomaly&points=off&ramp=diverging
 *  and flip between presets on the real basemap, dark + light mode.
 *
 *  ⚠️ STRIP THIS COMPONENT (and its mount + the ?ramp= plumb-through in
 *  Last48UnifiedView) once the winning preset is chosen — the presets
 *  themselves stay in anomalyRamp.ts, collapsed to the winner.
 */

import { useSearchParams } from 'react-router-dom'
import { RAMP_PRESETS } from './anomalyRamp'

export default function AnomalyRampSwitcher() {
  const [searchParams, setSearchParams] = useSearchParams()
  const active = searchParams.get('ramp')
  if (active === null) return null

  const pick = (id: string) => {
    setSearchParams((prev) => {
      if (prev.get('ramp') === id) return prev
      const np = new URLSearchParams(prev)
      np.set('ramp', id)
      return np
    }, { replace: true })
  }

  return (
    <div className="absolute bottom-4 left-4 z-[3] pointer-events-auto">
      <div className="rounded-lg px-2.5 py-2 backdrop-blur-xl
        bg-white/85 dark:bg-slate-900/80
        ring-1 ring-slate-200/60 dark:ring-white/[0.08]
        shadow-md shadow-slate-900/10 dark:shadow-black/40">
        <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 mb-1.5">
          ramp study (dev)
        </p>
        <div className="flex flex-col gap-1">
          {RAMP_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p.id)}
              aria-pressed={p.id === active}
              className={`text-left font-mono text-[10px] px-2 py-1 rounded transition-colors
                ${p.id === active
                  ? 'bg-ochre-500/20 ring-1 ring-ochre-500 text-slate-800 dark:text-paper-200'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/40 dark:hover:bg-white/[0.06]'}`}
              title={p.note}
            >
              {p.label}
              <span className="block text-[8px] text-slate-400 dark:text-slate-500">{p.note}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
