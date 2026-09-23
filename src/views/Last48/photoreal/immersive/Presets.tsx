// src/views/Last48/photoreal/immersive/Presets.tsx
//
// The rail's middle (Round B §2) — the empty air Round A reserved. Two
// stacked groups: PLACES (authored, places.ts) and HOTSPOTS (computed,
// hotspots.ts). A tile is a 3.5rem row like the controls above it: a 40 px
// square on the left — a Place's PHOTO when it has one (Jesse's own
// photographs, places.ts `thumb`; a Mapbox or Google capture is barred by
// their terms), else a colour block (Hotspots always; a Place with no
// photo yet) — then the NAME in the display italic (the third
// class of serif-italic clickable, after the rail buttons and the DataDiver
// return — Jesse: "the Name of Location preset headings") and a one-line
// plain caption. Group headings and captions stay plain: the serif is for
// what you can click.
//
// A tile is a DETOUR: the page flies there, pauses play, keeps the active
// card. The active tile wears the rail's ochre like a pressed control, and
// clicking it again clears the detour (`aria-pressed` promises a toggle).
// Hotspots: an empty list says so ("Nothing unusual right now") — absence
// stated, never a blank; loading says it is reading; and when the engine
// itself failed (a baseline error, or a stream whose current counts didn't
// load), `hotspotsNote` says THAT instead — never absence over a failure.
import { useState } from 'react'
import type { Place } from './places'
import { PLACES_SHOWN } from './places'
import { HOTSPOT_TIER_COLOR, type Hotspot } from './hotspots'

interface Props {
  places: readonly Place[]
  hotspots: readonly Hotspot[]
  hotspotsLoading: boolean
  /** Set when the anomaly engine couldn't produce a trustworthy hotspot list
   *  — a baseline fetch error, or a stream whose current counts didn't load.
   *  Transparency rule: never let an empty list read as "nothing unusual"
   *  when the truth is "we couldn't tell". */
  hotspotsNote: string | null
  /** The current detour's key (`place:<id>` / `hot:<neighborhood>`), or null. */
  activeKey: string | null
  onPlace: (id: string) => void
  onHot: (neighborhood: string) => void
  /** Clicking the ACTIVE tile clears the detour rather than doing nothing —
   *  `aria-pressed` promises a toggle. */
  onClear: () => void
}

/** Places have no data tier — one house colour, the rail's ochre. */
const PLACE_COLOR = '#d4a435'

const HEADING = 'text-[min(1vw,0.9rem)] leading-none text-paper-800 dark:text-paper-200'
const TILE = `min-h-[3.5rem] shrink-0 py-2 w-full rounded-lg flex items-center gap-3 px-2 text-left transition-colors
  hover:ring-1 hover:ring-paper-500/60 hover:bg-paper-200/40 dark:hover:bg-espresso-800/60`
const TILE_ON = 'bg-ochre-500/18 ring-1 ring-paper-400/40 dark:ring-paper-300/20'
const NAME = 'font-display italic text-[min(1.2vw,1.05rem)] leading-tight text-ink dark:text-paper-100'
const CAPTION = 'text-label leading-tight text-paper-600 dark:text-paper-400'
const NOTE = 'px-2 py-2 text-label leading-snug text-paper-600 dark:text-paper-500'

function Tile({ color, thumb, name, caption, on, onClick }: { color: string; thumb?: string; name: string; caption: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`${TILE} ${on ? TILE_ON : ''}`} title={on ? 'Back to the stop' : `Fly to ${name}`}>
      {thumb
        // Decorative: the name beside it is the label. width/height hold the
        // slot before the file arrives; the class sizes it (rem, so it grows
        // with Large Type — the file is 160 px, sharp to 3× at 40 px).
        ? <img src={thumb} alt="" width={40} height={40} loading="lazy" decoding="async" className="w-10 h-10 shrink-0 rounded-md object-cover" />
        : <span aria-hidden className="w-10 h-10 shrink-0 rounded-md" style={{ background: color, opacity: 0.85 }} />}
      <span className="flex min-w-0 flex-col gap-1">
        <span className={NAME}>{name}</span>
        <span className={CAPTION}>{caption}</span>
      </span>
    </button>
  )
}

export default function Presets({ places, hotspots, hotspotsLoading, hotspotsNote, activeKey, onPlace, onHot, onClear }: Props) {
  const [more, setMore] = useState(false)
  const shown = more ? places : places.slice(0, PLACES_SHOWN)

  return (
    <div className="mt-4 shrink-0 flex flex-col gap-3">
      <section aria-label="Places">
        <p className={`${HEADING} px-2 pb-2`}>Places</p>
        <div className="flex flex-col gap-1">
          {shown.map((p) => {
            const on = activeKey === `place:${p.id}`
            return (
              <Tile key={p.id} color={PLACE_COLOR} thumb={p.thumb} name={p.name} caption={p.caption}
                on={on} onClick={() => (on ? onClear() : onPlace(p.id))} />
            )
          })}
        </div>
        {places.length > PLACES_SHOWN && (
          <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more}
            className="mt-1 px-2 py-1 font-mono text-label uppercase tracking-wider text-paper-600 dark:text-paper-500 hover:text-ink dark:hover:text-paper-200">
            {more ? 'Fewer places' : 'More places'}
          </button>
        )}
      </section>

      <section aria-label="Hotspots">
        <p className={`${HEADING} px-2 pb-2`}>Hotspots</p>
        {hotspotsNote && <p className={NOTE}>{hotspotsNote}</p>}
        {hotspots.length > 0 ? (
          <div className="flex flex-col gap-1">
            {hotspots.map((h) => {
              const on = activeKey === `hot:${h.neighborhood}`
              return (
                <Tile key={h.neighborhood} color={HOTSPOT_TIER_COLOR[h.tier]} name={h.neighborhood} caption={h.caption}
                  on={on} onClick={() => (on ? onClear() : onHot(h.neighborhood))} />
              )
            })}
          </div>
        ) : (
          !hotspotsNote && <p className={NOTE}>{hotspotsLoading ? 'Reading the last 48 hours…' : 'Nothing unusual right now'}</p>
        )}
      </section>
    </div>
  )
}
