import type { CityAreas } from '@/cities/types'
import { BEAT_NAME_DISCLOSURE } from '@/cities/areaLabel'

/**
 * Ranking-row label: the name truncates, the beat code NEVER clips
 * (spec decision 6 — the code must survive every viewport × type-scale
 * combination; a single truncating string eats the code tail under Large
 * Type). Parent <p> must be `flex items-baseline gap-1.5 min-w-0`.
 * Cities without displayName (SF) render the id exactly as today.
 */
export function AreaRowLabel({ areas, id }: { areas: CityAreas; id: string }) {
  if (!areas.displayName) return <span className="truncate">{id}</span>
  return (
    <>
      <span className="truncate">{areas.displayName(id)}</span>
      <span className="shrink-0 text-slate-300 dark:text-slate-600" aria-hidden>
        ·
      </span>
      <span className="shrink-0 text-micro font-mono text-slate-400 dark:text-slate-500">
        {id}
      </span>
    </>
  )
}

/**
 * Detail-panel location lines: the human name, then the precise unit on
 * its own line carrying the provenance tooltip (spec §A7 — disclosure
 * ships with the labels). SF panels never render this (no displayName).
 */
export function BeatPanelLabel({ areas, id }: { areas: CityAreas; id: string }) {
  if (!areas.displayName) return <>{id}</>
  return (
    <>
      {areas.displayName(id)}
      <span
        title={BEAT_NAME_DISCLOSURE}
        className="block text-nano font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500"
      >
        Police Beat {id}
      </span>
    </>
  )
}
