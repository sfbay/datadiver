// src/views/Trees/TreesLegend.tsx
//
// The map legend, bottom-right on glass: the moss dot sizes for the three
// measured trunk classes (radii from mapLayers' zoom-15 stop, so the legend
// and the map cannot drift), the stump ring, and — with a species picked
// under Explore — that species' swatch. The Safety lens draws large trunks
// only, so it lists only that class. Tier 3: no glow.

import type { ReactNode } from 'react'
import { TRUNK_LABEL, type TrunkClass } from '@/lib/trees/trunk'
import type { Lens } from './treesUrl'
import { BRICK_600, LEGEND_DOT_RADII, MOSS_400, MOSS_500, selectedKeyline } from './mapLayers'
import { STUMP_LEGEND, TRUNK_HEADING } from './treesPhrase'

const MEASURED: readonly TrunkClass[] = ['small', 'medium', 'large']
const BOX = 14

function Swatch({ children }: { children: ReactNode }) {
  return (
    <svg width={BOX} height={BOX} viewBox={`0 0 ${BOX} ${BOX}`} className="shrink-0" aria-hidden>
      {children}
    </svg>
  )
}

export default function TreesLegend({ lens, speciesLabel, dark }: {
  lens: Lens
  /** The picked species' display name, or null. */
  speciesLabel: string | null
  dark: boolean
}) {
  const classes = lens === 'safety' ? MEASURED.filter((c) => c === 'large') : MEASURED
  const row = 'flex items-center gap-2'
  const text = 'font-serif text-label text-paper-800 dark:text-paper-200'
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
