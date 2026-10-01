// src/views/Trees/ExploreTab.tsx
//
// The Explore lens's rail body. Marks first (the Last 48 rule — number,
// mark, words): three RailStat chips, then one search box, then the species
// ranking. Choosing a row sets `?species=` (toggle) and expands that row IN
// PLACE into the species card; the map lights the species up (lensPaint).
//
// Everything here reads the small aggregates file — never the 144k-site
// snapshot — except the address search, which is a live prefix read kept in
// its own block below and its own hook (useTreeAddressSearch.ts) so it can be
// removed whole if the browser walk times it over 1.5 s.
//
// No fall-report figure appears per species: 311 reports carry no species.

import { useEffect, useMemo, useRef, useState } from 'react'
import RailStat from '@/components/charts/RailStat'
import PartWhole from '@/components/charts/PartWhole'
import { useMapSidebarMode } from '@/components/layout/MapSidebar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { TRUNK_CLASSES, TRUNK_LABEL } from '@/lib/trees/trunk'
import { parseSpecies, speciesLabel } from '@/lib/trees/species'
import type { SpeciesAggregate, TreesAggregates } from '@/lib/trees/types'
import {
  ADDRESS_ERROR, ADDRESS_SEARCHING, CAPTION_SHARE, CAPTION_SPECIES, NO_ADDRESS, CAPTION_STREET_TREES, CAPTION_TOP_FIVE, SEARCH_LABEL,
  PINNED_SELECTION, SEARCH_PLACEHOLDER, SHOW_FEWER, TOP_NEIGHBORHOODS_HEADING, TRUNK_HEADING, apCount, neighborhoodCountLabel,
  noAddressLine, noSpeciesMatchLine, shareLine, showAllLine, speciesCountTip, speciesPlantedLine, speciesRankLine,
  speciesRowLabel, streetTreesTip, topFiveLine, trunkMixLabel,
} from './treesPhrase'
import { barShare, sharePercent, speciesListRows } from './exploreRows'
import { MOSS_500 } from './mapLayers'
import { useTreeAddressSearch } from './useTreeAddressSearch'

/** Rows drawn before the "Show all" turn-down (~640 rows of plain DOM is
 *  fine; the cut is for reading, not speed). */
const FIRST_ROWS = 60

const MONO_HEAD = 'font-mono text-nano uppercase tracking-[0.15em] text-paper-600 dark:text-paper-400'
const SELECTED = 'rounded-lg bg-ochre-500/10 ring-1 ring-ochre-500/30'

export interface ExploreTabProps {
  agg: TreesAggregates
  /** The selected species' published string (resolved), or null. */
  species: string | null
  onSpecies(name: string | null): void
  onTree(id: number): void
  onNeighborhood(name: string): void
}

const titleOf = (s: SpeciesAggregate): string => s.common ?? s.latin ?? s.name

export default function ExploreTab({ agg, species, onSpecies, onTree, onNeighborhood }: ExploreTabProps) {
  const { isCompressed } = useMapSidebarMode()
  const isMobile = useIsMobile()
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const t = agg.totals
  const top = agg.species[0]?.count ?? 0

  // A selection the search filters out stays drawn, pinned at the top.
  const { matches, rows, pinned } = useMemo(
    () => speciesListRows(agg.species, query, showAll, species, FIRST_ROWS),
    [agg.species, query, showAll, species],
  )
  const address = useTreeAddressSearch(query)

  // A species chosen elsewhere (the tree card's rank line) scrolls into view.
  // Desktop only: the mobile sheet is a translateY'd full-height panel, where
  // scrollIntoView misbehaves (CLAUDE.md, Mobile).
  const listRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    if (isMobile || species === null || !listRef.current) return
    const el = Array.from(listRef.current.querySelectorAll<HTMLElement>('[data-species]'))
      .find((n) => n.dataset.species === species)
    try { el?.scrollIntoView({ block: 'nearest' }) } catch { /* no layout */ }
  }, [species, isMobile])

  return (
    <div className="flex flex-col gap-4">
      {/* ── opener: three chips ── */}
      <div className={`grid gap-2 ${isCompressed ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {/* "142,014" overflows a half-width chip: the street-tree count takes
            the full row, the other two share the next. */}
        <RailStat
          className={isCompressed ? '' : 'col-span-2'}
          value={t.trees}
          caption={CAPTION_STREET_TREES}
          tip={streetTreesTip(t.trees)}
        />
        <RailStat value={agg.species.length} caption={CAPTION_SPECIES} tip={speciesCountTip(agg.species.length)} />
        <RailStat
          value={`${t.topFiveShare}%`}
          caption={CAPTION_TOP_FIVE}
          tip={topFiveLine(t.topFiveShare)}
          mark={<PartWhole part={t.topFive} whole={t.trees} color={MOSS_500} width={120} label={topFiveLine(t.topFiveShare)} className="text-paper-700 dark:text-paper-300" />}
        />
      </div>

      {/* ── search ── */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={SEARCH_PLACEHOLDER}
        aria-label={SEARCH_LABEL}
        className="w-full rounded-lg bg-paper-100/60 dark:bg-espresso-800/50 px-3 py-2 font-serif text-xs leading-normal text-ink dark:text-paper-100
          placeholder:text-paper-500 dark:placeholder:text-paper-600 outline-none focus:ring-1 focus:ring-ochre-500/40"
      />

      {/* ── address search (live; removable as a block — see the hook) ── */}
      {address.active && (
        <div className="flex flex-col gap-1" aria-live="polite">
          {address.loading ? (
            <p className={MONO_HEAD}>{ADDRESS_SEARCHING}</p>
          ) : address.error ? (
            <p className="font-serif text-xs text-paper-700 dark:text-paper-300">{ADDRESS_ERROR}</p>
          ) : address.rows.length === 0 ? (
            <p className="font-serif text-xs text-paper-700 dark:text-paper-300">{noAddressLine(query)}</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {address.rows.map((r) => {
                const id = Number(r.treeid)
                if (!Number.isInteger(id) || id <= 0) return null
                return (
                  <li key={r.treeid}>
                    <button
                      type="button"
                      onClick={() => onTree(id)}
                      className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-paper-100/70 dark:hover:bg-espresso-800/50 transition-colors"
                    >
                      <span className="block text-label text-ink dark:text-paper-100 break-words">{r.description || NO_ADDRESS}</span>
                      <span className="block font-serif italic text-nano text-paper-600 dark:text-paper-400 break-words">
                        {speciesLabel(parseSpecies(r.species ?? null))}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
      {/* ── end address search ── */}

      {/* ── species ranking ── */}
      {matches.length === 0 && !address.active && (
        <p className="font-serif text-xs text-paper-700 dark:text-paper-300">{noSpeciesMatchLine(query)}</p>
      )}
      {rows.length > 0 && (
        <ol ref={listRef} className="flex flex-col gap-0.5">
          {rows.map((s) => {
            const on = s.name === species
            return (
              <li key={s.name} data-species={s.name} className={on ? `${SELECTED} pb-3` : ''}>
                {s.name === pinned && (
                  <p className={`px-2 pt-1.5 ${MONO_HEAD}`}>{PINNED_SELECTION}</p>
                )}
                <button
                  type="button"
                  aria-expanded={on}
                  aria-label={speciesRowLabel(s.rank, titleOf(s), s.count)}
                  onClick={() => onSpecies(on ? null : s.name)}
                  className={`w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                    on ? '' : 'hover:bg-paper-100/70 dark:hover:bg-espresso-800/50'
                  }`}
                >
                  <span className="w-7 shrink-0 font-mono text-nano tabular-nums text-paper-500 dark:text-paper-500 pt-0.5" aria-hidden>
                    {s.rank}
                  </span>
                  <span className="flex-1 min-w-0" aria-hidden>
                    <span className={`block text-label text-ink dark:text-paper-100 break-words ${s.common ? '' : 'italic font-serif'}`}>
                      {titleOf(s)}
                    </span>
                    {s.common && s.latin && (
                      <span className="block font-serif italic text-nano text-paper-600 dark:text-paper-400 break-words">{s.latin}</span>
                    )}
                    <span className="mt-1 block h-[3px] w-full rounded-full bg-moss-500/15">
                      <span className="block h-full rounded-full bg-moss-500" style={{ width: `${barShare(s.count, top) * 100}%` }} />
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-label tabular-nums text-ink dark:text-paper-200 pt-px" aria-hidden>
                    {apCount(s.count)}
                  </span>
                </button>
                {on && <SpeciesCard s={s} of={agg.species.length} trees={t.trees} onNeighborhood={onNeighborhood} />}
              </li>
            )
          })}
        </ol>
      )}

      {matches.length > FIRST_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className={`self-start ${MONO_HEAD} hover:text-ink dark:hover:text-paper-200`}
        >
          {showAll ? SHOW_FEWER : showAllLine(matches.length)}
        </button>
      )}
    </div>
  )
}

// ── the species card (the selected row, expanded in place) ─────────────────

function SpeciesCard({ s, of, trees, onNeighborhood }: {
  s: SpeciesAggregate; of: number; trees: number; onNeighborhood(name: string): void
}) {
  const pct = sharePercent(s.count, trees)
  return (
    <div className="px-2 pt-1 flex flex-col gap-3">
      <p className={MONO_HEAD}>{speciesRankLine(s.rank, of)}</p>

      <div className="flex items-end gap-5">
        <div role="group" aria-label={speciesRowLabel(s.rank, titleOf(s), s.count)}>
          <span className="block font-display italic text-2xl leading-none tabular-nums text-paper-900 dark:text-paper-100" aria-hidden>
            {apCount(s.count)}
          </span>
          <span className={`block mt-1 ${MONO_HEAD}`} aria-hidden>{CAPTION_STREET_TREES}</span>
        </div>
        <div role="group" aria-label={shareLine(pct)}>
          <span className="block font-display italic text-2xl leading-none tabular-nums text-paper-900 dark:text-paper-100" aria-hidden>
            {pct}
          </span>
          <span className={`block mt-1 ${MONO_HEAD}`} aria-hidden>{CAPTION_SHARE}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className={MONO_HEAD}>{TRUNK_HEADING}</p>
        {TRUNK_CLASSES.map((cls, i) => (
          <div key={cls} className="flex flex-col gap-0.5">
            <span className="font-serif text-label text-paper-800 dark:text-paper-200" aria-hidden>{TRUNK_LABEL[cls]}</span>
            <PartWhole
              part={s.trunk[i]}
              whole={s.count}
              color={MOSS_500}
              width={120}
              label={trunkMixLabel(TRUNK_LABEL[cls], s.trunk[i], s.count)}
              className="text-paper-700 dark:text-paper-300"
            />
          </div>
        ))}
      </div>

      <p className="font-serif text-xs text-paper-800 dark:text-paper-200">
        {speciesPlantedLine(s.plantedYears, s.plantedRecorded, s.count)}
      </p>

      {s.topNeighborhoods.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <p className={MONO_HEAD}>{TOP_NEIGHBORHOODS_HEADING}</p>
          {s.topNeighborhoods.map(([name, n]) => (
            <button
              key={name}
              type="button"
              onClick={() => onNeighborhood(name)}
              aria-label={neighborhoodCountLabel(name, n)}
              className="flex items-baseline gap-2 text-left rounded px-1 -mx-1 py-0.5 hover:bg-paper-100/70 dark:hover:bg-espresso-800/50"
            >
              <span className="flex-1 min-w-0 text-label text-ink dark:text-paper-100 break-words underline decoration-moss-500/40 underline-offset-2" aria-hidden>
                {name}
              </span>
              <span className="shrink-0 font-mono text-nano tabular-nums text-paper-700 dark:text-paper-300" aria-hidden>{apCount(n)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
