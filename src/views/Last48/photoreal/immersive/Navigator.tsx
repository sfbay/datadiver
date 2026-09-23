// src/views/Last48/photoreal/immersive/Navigator.tsx
//
// The rail's GEOGRAPHIC NAVIGATOR (Jesse, 2026-09-23: "right bar becomes a
// geographic navigator bar ... probably needs a search box too"). It grew out
// of Round B's presets (§2) and keeps their idiom. Top to bottom:
//
//   - a SEARCH box. Empty, the lists below show in full; typed, every list
//     filters by name (matchesQuery) and an ADDRESSES group appears, fed by
//     Mapbox forward search (addressSearch.ts carries the terms: temporary
//     geocodes, no POI, never a latitude/longitude on screen, never stored —
//     so an address detour is page state, not a URL param).
//   - PLACES (authored, places.ts): a 40 px square — Jesse's own PHOTO when
//     the place has one, else a colour block — then the NAME in the display
//     italic (the serif is reserved for what you can click) and a plain
//     caption. First PLACES_SHOWN, then "More places".
//   - NEIGHBORHOODS (neighborhoods.ts): all 41, each flown to through the
//     flat map's own hand-tuned camera. Compact rows — name, then how many
//     events the last 48 hours put there. The busiest NBHD_SHOWN first;
//     "All 41 neighborhoods" lists them alphabetically.
//   - HOTSPOTS (computed, hotspots.ts). An empty list says so ("Nothing
//     unusual right now") — absence stated, never a blank; loading says it
//     is reading; when the engine itself failed, `hotspotsNote` says THAT
//     instead — never absence over a failure.
//
// Every row is a DETOUR: the page flies there, pauses play, keeps the active
// card. The active row wears the rail's ochre like a pressed control, and
// clicking it again clears the detour (`aria-pressed` promises a toggle).
import { useMemo, useState } from 'react'
import type { Place } from './places'
import { PLACES_SHOWN } from './places'
import { HOTSPOT_TIER_COLOR, type Hotspot } from './hotspots'
import { NEIGHBORHOODS, NBHD_SHOWN, matchesQuery, type NeighborhoodStop } from './neighborhoods'
import { ADDRESS_MIN_CHARS, type AddressHit } from './addressSearch'
import { useAddressSearch } from './useAddressSearch'

interface Props {
  places: readonly Place[]
  hotspots: readonly Hotspot[]
  hotspotsLoading: boolean
  /** Set when the anomaly engine couldn't produce a trustworthy hotspot list
   *  — a baseline fetch error, or a stream whose current counts didn't load.
   *  Transparency rule: never let an empty list read as "nothing unusual"
   *  when the truth is "we couldn't tell". */
  hotspotsNote: string | null
  /** Events per neighborhood in the loaded 48 h window (neighborhoodCounts). */
  nbhdCounts: ReadonlyMap<string, number>
  /** A stream's loaded rows fall short of its window: every count is a
   *  minimum, written "N+". */
  countsAreFloors: boolean
  /** The current detour's key (`place:` / `nbhd:` / `hot:` / `addr:`), or null. */
  activeKey: string | null
  onPlace: (id: string) => void
  onNeighborhood: (name: string) => void
  onHot: (neighborhood: string) => void
  onAddress: (hit: AddressHit) => void
  /** Clicking the ACTIVE row clears the detour rather than doing nothing. */
  onClear: () => void
}

/** Places and neighborhoods have no data tier — one house colour, the rail's ochre. */
const PLACE_COLOR = '#d4a435'

const HEADING = 'text-[min(1vw,0.9rem)] leading-none text-paper-800 dark:text-paper-200'
const ROW_BASE = `shrink-0 w-full rounded-lg flex items-center gap-3 px-2 text-left transition-colors
  hover:ring-1 hover:ring-paper-500/60 hover:bg-paper-200/40 dark:hover:bg-espresso-800/60`
const TILE = `${ROW_BASE} min-h-[3.5rem] py-2`
const LINE = `${ROW_BASE} min-h-[2.5rem] py-1.5`
const ROW_ON = 'bg-ochre-500/18 ring-1 ring-paper-400/40 dark:ring-paper-300/20'
const NAME = 'font-display italic text-[min(1.2vw,1.05rem)] leading-tight text-ink dark:text-paper-100'
const NAME_SM = 'font-display italic text-[min(1.05vw,0.95rem)] leading-tight text-ink dark:text-paper-100'
const CAPTION = 'text-label leading-tight text-paper-600 dark:text-paper-400'
const NOTE = 'px-2 py-2 text-label leading-snug text-paper-600 dark:text-paper-500'
const TOGGLE = 'mt-1 px-2 py-1 font-mono text-label uppercase tracking-wider text-paper-600 dark:text-paper-500 hover:text-ink dark:hover:text-paper-200'

function Tile({ color, thumb, name, caption, on, onClick }: { color: string; thumb?: string; name: string; caption: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`${TILE} ${on ? ROW_ON : ''}`} title={on ? 'Back to the stop' : `Fly to ${name}`}>
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

/** A compact row: no square, a small pigment dot, the name and one caption. */
function Line({ color, name, caption, on, onClick }: { color: string; name: string; caption: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`${LINE} ${on ? ROW_ON : ''}`} title={on ? 'Back to the stop' : `Fly to ${name}`}>
      <span aria-hidden className="w-1.5 h-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={NAME_SM}>{name}</span>
        {caption && <span className={CAPTION}>{caption}</span>}
      </span>
    </button>
  )
}

/** "823 events in last 48" — the page's own name for the window (Jesse,
 *  2026-09-23). */
function countCaption(n: number, floor: boolean): string {
  if (n === 0) return floor ? 'None loaded in last 48' : 'No events in last 48'
  return `${n.toLocaleString('en-US')}${floor ? '+' : ''} ${n === 1 && !floor ? 'event' : 'events'} in last 48`
}

export default function Navigator({
  places, hotspots, hotspotsLoading, hotspotsNote, nbhdCounts, countsAreFloors, activeKey,
  onPlace, onNeighborhood, onHot, onAddress, onClear,
}: Props) {
  const [query, setQuery] = useState('')
  const [morePlaces, setMorePlaces] = useState(false)
  const [allNbhd, setAllNbhd] = useState(false)
  const searching = query.trim() !== ''
  const { hits, searching: addrLoading } = useAddressSearch(query)

  const count = (name: string) => nbhdCounts.get(name) ?? 0
  const busiest = useMemo(
    () => [...NEIGHBORHOODS].sort((a, b) => (nbhdCounts.get(b.name) ?? 0) - (nbhdCounts.get(a.name) ?? 0) || a.name.localeCompare(b.name)),
    [nbhdCounts],
  )

  const shownPlaces = searching ? places.filter((p) => matchesQuery(`${p.name} ${p.caption}`, query)) : morePlaces ? places : places.slice(0, PLACES_SHOWN)
  const shownNbhd: readonly NeighborhoodStop[] = searching
    ? NEIGHBORHOODS.filter((n) => matchesQuery(n.name, query))
    : allNbhd ? NEIGHBORHOODS : busiest.slice(0, NBHD_SHOWN)
  const shownHot = searching ? hotspots.filter((h) => matchesQuery(h.neighborhood, query)) : hotspots

  const placeRows = shownPlaces.map((p) => {
    const on = activeKey === `place:${p.id}`
    return <Tile key={p.id} color={PLACE_COLOR} thumb={p.thumb} name={p.name} caption={p.caption} on={on} onClick={() => (on ? onClear() : onPlace(p.id))} />
  })
  const nbhdRows = shownNbhd.map((n) => {
    const on = activeKey === `nbhd:${n.name}`
    return <Line key={n.name} color={PLACE_COLOR} name={n.name} caption={countCaption(count(n.name), countsAreFloors)} on={on} onClick={() => (on ? onClear() : onNeighborhood(n.name))} />
  })
  const hotRows = shownHot.map((h) => {
    const on = activeKey === `hot:${h.neighborhood}`
    return <Tile key={h.neighborhood} color={HOTSPOT_TIER_COLOR[h.tier]} name={h.neighborhood} caption={h.caption} on={on} onClick={() => (on ? onClear() : onHot(h.neighborhood))} />
  })

  return (
    <div className="shrink-0 flex flex-col gap-3">
      <label className="block px-1">
        <span className="sr-only">Search places, neighborhoods and addresses</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur() } }}
          placeholder="Search"
          spellCheck={false}
          autoComplete="off"
          // Body face, loose leading: a tight line box clips descenders in an
          // input (memory: fraunces-input-descender-clip).
          className="w-full rounded-md px-3 py-2 text-[0.9rem] leading-normal
            bg-paper-50/80 dark:bg-espresso-800/80 text-ink dark:text-paper-100
            placeholder:text-paper-500 dark:placeholder:text-paper-500
            ring-1 ring-paper-400/40 dark:ring-paper-300/20 focus:outline-none focus:ring-ochre-500/70
            [&::-webkit-search-cancel-button]:appearance-none"
        />
      </label>

      {(!searching || placeRows.length > 0) && (
        <section aria-label="Places">
          <p className={`${HEADING} px-2 pb-2`}>Places</p>
          <div className="flex flex-col gap-1">{placeRows}</div>
          {!searching && places.length > PLACES_SHOWN && (
            <button type="button" onClick={() => setMorePlaces((v) => !v)} aria-expanded={morePlaces} className={TOGGLE}>
              {morePlaces ? 'Fewer places' : 'More places'}
            </button>
          )}
        </section>
      )}

      {(!searching || nbhdRows.length > 0) && (
        <section aria-label="Neighborhoods">
          <p className={`${HEADING} px-2 pb-2`}>{searching || allNbhd ? 'Neighborhoods' : 'Busiest neighborhoods'}</p>
          <div className="flex flex-col gap-0.5">{nbhdRows}</div>
          {!searching && (
            <button type="button" onClick={() => setAllNbhd((v) => !v)} aria-expanded={allNbhd} className={TOGGLE}>
              {allNbhd ? 'Busiest only' : `All ${NEIGHBORHOODS.length} neighborhoods`}
            </button>
          )}
        </section>
      )}

      {(!searching || hotRows.length > 0) && (
        <section aria-label="Hotspots">
          <p className={`${HEADING} px-2 pb-2`}>Hotspots</p>
          {!searching && hotspotsNote && <p className={NOTE}>{hotspotsNote}</p>}
          {hotRows.length > 0
            ? <div className="flex flex-col gap-1">{hotRows}</div>
            : !hotspotsNote && <p className={NOTE}>{hotspotsLoading ? 'Reading the last 48 hours…' : 'Nothing unusual right now'}</p>}
        </section>
      )}

      {searching && (
        <section aria-label="Addresses">
          <p className={`${HEADING} px-2 pb-2`}>Streets and addresses</p>
          {query.trim().length < ADDRESS_MIN_CHARS
            ? <p className={NOTE}>Type {ADDRESS_MIN_CHARS} letters to search streets.</p>
            : hits.length > 0
              ? (
                <div className="flex flex-col gap-0.5">
                  {hits.map((a) => {
                    const on = activeKey === `addr:${a.id}`
                    return <Line key={a.id} color={PLACE_COLOR} name={a.label} caption={a.sublabel} on={on} onClick={() => (on ? onClear() : onAddress(a))} />
                  })}
                </div>
              )
              : <p className={NOTE}>{addrLoading ? 'Searching…' : 'No street in San Francisco matches.'}</p>}
        </section>
      )}
    </div>
  )
}
