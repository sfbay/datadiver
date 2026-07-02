/** AnomalyLegend — floating glass-card key for the anomaly choropleth.
 *
 *  Mirrors UnderlayLegend's register (bottom-right glass card, gradient
 *  bar) so the two fills feel like one system, but the labels are the
 *  dejargoned Pulse vocabulary: quieter · typical · busier — never a σ.
 *  The gradient derives from the SAME stops array that builds the Mapbox
 *  paint expression (anomalyRamp.ts), so map and legend cannot drift.
 *
 *  The gradient's transparent middle is honest — near-typical
 *  neighborhoods really are unpainted on the map — but it needs a ground
 *  to read against, so the bar sits on a faint checker-free neutral wash
 *  rather than the card's own background.
 */

import {
  getRampPreset,
  rampCssGradient,
  rampTypicalPercent,
} from './anomalyRamp'

interface AnomalyLegendProps {
  /** Active ramp preset id (anomalyRamp.ts); omit for the default. */
  rampId?: string | null
}

export default function AnomalyLegend({ rampId }: AnomalyLegendProps) {
  const preset = getRampPreset(rampId)
  const gradient = rampCssGradient(preset)
  const typicalPct = rampTypicalPercent(preset)

  return (
    <div className="absolute bottom-4 right-4 z-[3] pointer-events-auto">
      <div className="rounded-lg px-3 py-2 backdrop-blur-xl
        bg-white/85 dark:bg-slate-900/80
        ring-1 ring-slate-200/60 dark:ring-white/[0.08]
        shadow-md shadow-slate-900/10 dark:shadow-black/40">
        <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 mb-1.5 whitespace-nowrap">
          vs a typical 48h
        </p>
        <div className="relative mb-1">
          <div
            className="h-2 w-36 rounded-full ring-1 ring-slate-300/40 dark:ring-white/[0.06]
              bg-slate-200/50 dark:bg-white/[0.04]"
            style={{ backgroundImage: gradient }}
          />
          {/* "typical" tick — where z = 0 sits on the ramp's domain */}
          {typicalPct !== null && (
            <span
              className="absolute -top-0.5 h-3 w-px bg-slate-400/70 dark:bg-slate-300/50"
              style={{ left: `${typicalPct}%` }}
              aria-hidden
            />
          )}
        </div>
        <div className="flex justify-between text-[9px] font-mono text-slate-600 dark:text-slate-300">
          {preset.quietSide ? (
            <>
              <span>quieter</span>
              <span>typical</span>
              <span>busier</span>
            </>
          ) : (
            <>
              <span>typical</span>
              <span>busier</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
