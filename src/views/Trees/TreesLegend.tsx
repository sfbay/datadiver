// src/views/Trees/TreesLegend.tsx
//
// The map legend, bottom-right on glass: the moss dot sizes for the three
// measured trunk classes (radii from mapLayers' zoom-15 stop, so the legend
// and the map cannot drift), the stump ring, and — with a species picked
// under Explore — that species' swatch. The Safety lens draws large trunks
// only, so it lists only that class. The Equity lens shows the choropleth's
// five moss steps instead (the dots are dimmed under it) and the hatch for
// flagged neighborhoods. Tier 3: no glow.

import type { ReactNode } from 'react'
import { TRUNK_LABEL, type TrunkClass } from '@/lib/trees/trunk'
import type { EquityRank, Lens } from './treesUrl'
import { BRICK_600, HATCH_SWATCH_CSS, LEGEND_DOT_RADII, MOSS_400, MOSS_500, selectedKeyline } from './mapLayers'
import { EQUITY_LEGEND_HEAD, FLAGGED_LEGEND, STUMP_LEGEND, TRUNK_HEADING, equityFigure } from './treesPhrase'

const MEASURED: readonly TrunkClass[] = ['small', 'medium', 'large']
const BOX = 14

function Swatch({ children }: { children: ReactNode }) {
  return (
    <svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`} className="shrink-0" aria-hidden>
      {children}
    </svg>
  )
}

export default function TreesLegend({ lens, speciesLabel, dark, equity }: {
  lens: Lens
  /** The picked species' display name, or null. */
  speciesLabel: string | null
  dark: boolean
  /** The choropleth's stops (equityView.choroplethStops) and its measure. */
  equity?: { stops: readonly (readonly [number, string])[]; by: EquityRank } | null
}) {
  const classes = lens === 'safety' ? MEASURED.filter((c) => c === 'large') : MEASURED
  const row = 'flex items-center gap-2'
  const text = 'font-serif text-label text-paper-800 dark:text-paper-200'
  if (lens === 'equity' && equity && equity.stops.length > 0) {
    const { stops, by } = equity
    return (
      <div className="absolute bottom-11 right-5 z-10 glass-card rounded-xl px-3 py-2 flex flex-col gap-1 max-w-[16rem]">
        <p className="font-mono text-nano uppercase tracking-[0.15em] text-paper-600 dark:text-paper-400">{EQUITY_LEGEND_HEAD[by]}</p>
        <div className="flex" aria-hidden>
          {stops.map(([, color], i) => <span key={i} className="h-2.5 w-7" style={{ background: color }} />)}
        </div>
        <div className="flex justify-between font-mono text-nano tabular-nums text-paper-700 dark:text-paper-300">
          <span>{equityFigure(stops[0][0])}</span>
          <span>{equityFigure(stops[stops.length - 1][0])}+</span>
        </div>
        <div className={row}>
          <span className="w-3.5 h-3.5 rounded-sm shrink-0" style={{ backgroundImage: HATCH_SWATCH_CSS }} aria-hidden />
          <span className={text}>{FLAGGED_LEGEND}</span>
        </div>
      </div>
    )
  }
  return (
    <div className="absolute bottom-11 right-5 z-10 glass-card rounded-xl px-3 py-2 flex flex-col gap-1 max-w-[16rem]">
      <p className="font-mono text-nano uppercase tracking-[0.15em] text-paper-600 dark:text-paper-400">{TRUNK_HEADING}</p>
      {classes.map((c) => (
        <div key={c} className={row}>
          <Swatch><circle cx={BOX / 2} cy={BOX / 2} r={LEGEND_DOT_RADII[MEASURED.indexOf(c)]} fill={MOSS_500} opacity={0.75} /></Swatch>
          <span className={text}>{TRUNK_LABEL[c]}</span>
        </div>
      ))}
      <div className={row}>
        <Swatch><circle cx={BOX / 2} cy={BOX / 2} r={4} fill="none" stroke={BRICK_600} strokeWidth={1.5} /></Swatch>
        <span className={text}>{STUMP_LEGEND}</span>
      </div>
      {lens === 'explore' && speciesLabel && (
        <div className={row}>
          <Swatch><circle cx={BOX / 2} cy={BOX / 2} r={4} fill={MOSS_400} stroke={selectedKeyline(dark)} strokeWidth={1} /></Swatch>
          <span className={`${text} break-words`}>{speciesLabel}</span>
        </div>
      )}
    </div>
  )
}
