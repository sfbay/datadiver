// src/views/Trees/EquityTab.tsx
//
// The Equity lens's rail body: street trees against neighborhood income,
// counted TWO ways side by side (spec §10.2 — per resident punishes density,
// per area does not, and one measure alone would let the page assert what
// the other does not support).
//
//   1. Two RailStat chips: the median neighborhood under each measure,
//      unflagged rows only (equityView.unflaggedMedian). The tab OPENS with
//      them (ruling R22, Jesse: "lead with the big numbers") — the summary
//      sentence (`equityLead`, ruling R18) and the parks line live in the
//      data notes, which the rail's one "Data notes ›" link opens at the
//      Equity section.
//   2. The measure pills → `?rank=perK|perKm2`. They re-rank this list AND
//      re-paint the map (the page reads the same param for the choropleth).
//   3. The list: position · name · figure · bar, the median-income dot on
//      the city's range beneath, and the OTHER measure's rank printed small
//      beside the figure — so the flip is visible without switching.
//      Flagged neighborhoods are listed last, never ranked: a hatched swatch
//      where the position would be, and their flag note beneath.
//
// Selecting a row sets `?nh=` (the page flies the camera and outlines it on
// the map). Selection does NOT filter the list — comparison framing, not
// drill-down. Every mark's sentence rides the row's aria-label.

import { useEffect, useMemo, useRef } from 'react'
import RailStat from '@/components/charts/RailStat'
import PositionScale from '@/components/charts/PositionScale'
import InfoTip from '@/components/ui/InfoTip'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { TreesAggregates } from '@/lib/trees/types'
import {
  EQUITY_MEASURE, INCOME_KEY, INCOME_KEY_TIP, MEDIAN_CAPTION, NO_CENSUS, RANK_BY_LABEL,
  equityFigure, equityFlagNote, equityRowLabel, incomeShort, medianTip, otherRankLine,
} from './treesPhrase'
import { OTHER_MEASURE, rankNeighborhoods, unflaggedCount, unflaggedMedian, unflaggedRange } from './equityView'
import { RAIL_STAT_GRID, barShare } from './exploreRows'
import { HATCH_SWATCH_CSS, MOSS_500 } from './mapLayers'
import type { EquityRank } from './treesUrl'

const MONO_HEAD = 'font-mono text-nano uppercase tracking-[0.15em] text-paper-600 dark:text-paper-400'
const SELECTED = 'rounded-lg bg-ochre-500/10 ring-1 ring-ochre-500/30'
const RANKS: readonly EquityRank[] = ['perK', 'perKm2']

export interface EquityTabProps {
  agg: TreesAggregates
  rank: EquityRank
  onRank(rank: EquityRank): void
  /** The resolved `?nh=` name, or null. */
  neighborhood: string | null
  /** Toggle: the selected row's own click passes null. */
  onSelect(name: string | null): void
}

export default function EquityTab({ agg, rank, onRank, neighborhood, onSelect }: EquityTabProps) {
  const isMobile = useIsMobile()
  const rows = agg.neighborhoods

  const ranked = useMemo(() => rankNeighborhoods(rows, rank), [rows, rank])
  const medians = useMemo(() => ({ perK: unflaggedMedian(rows, 'perK'), perKm2: unflaggedMedian(rows, 'perKm2') }), [rows])
  const income = useMemo(() => ({ range: unflaggedRange(rows, 'medianIncome'), median: unflaggedMedian(rows, 'medianIncome') }), [rows])
  // Bars run against the top UNFLAGGED figure (a park's per-resident figure
  // can be ten times any ranked row's).
  const top = ranked[0]?.position !== null ? ranked[0]?.value ?? 0 : 0
  const other = OTHER_MEASURE[rank]

  // A neighborhood chosen elsewhere (the tree card, a species' top list)
  // scrolls into view. Desktop only: the mobile sheet is translateY'd, where
  // scrollIntoView misbehaves (CLAUDE.md, Mobile).
  const listRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    if (isMobile || neighborhood === null || !listRef.current) return
    const el = Array.from(listRef.current.querySelectorAll<HTMLElement>('[data-nhood]'))
      .find((n) => n.dataset.nhood === neighborhood)
    try { el?.scrollIntoView({ block: 'nearest' }) } catch { /* no layout */ }
    // `rank` too: switching the measure moves the selected row.
  }, [neighborhood, isMobile, rank])

  return (
    <div className="flex flex-col gap-4">
      {/* ── opener: the two medians, one per measure (R22 — numbers first;
          the summary sentence lives in the data notes) ── */}
      <div className={RAIL_STAT_GRID}>
        {RANKS.map((by) => {
          const m = medians[by]
          return (
            <RailStat
              key={by}
              value={m === null ? '—' : equityFigure(m)}
              caption={MEDIAN_CAPTION[by]}
              tip={m === null ? undefined : medianTip(by, m, unflaggedCount(rows))}
            />
          )
        })}
      </div>

      {/* ── the measure: re-ranks the list AND re-paints the map ── */}
      <div role="radiogroup" aria-label={RANK_BY_LABEL} className="flex gap-1">
        {RANKS.map((by) => (
          <button
            key={by}
            type="button"
            role="radio"
            aria-checked={rank === by}
            onClick={() => onRank(by)}
            className={`flex-1 py-1.5 px-2 rounded-lg text-label transition-colors duration-200 ${
              rank === by
                ? 'bg-ochre-500/10 ring-1 ring-ochre-500/30 text-ink dark:text-white'
                : 'text-paper-500 dark:text-paper-600 hover:text-paper-700 dark:hover:text-paper-400'
            }`}
          >
            {EQUITY_MEASURE[by]}
          </button>
        ))}
      </div>

      {/* ── the key for the dot under each row ── */}
      <div className="flex items-center gap-2 px-2">
        {income.range && income.median !== null && (
          <PositionScale value={income.median} range={income.range} reference={income.median} color={MOSS_500} />
        )}
        <span className={MONO_HEAD}>{INCOME_KEY}</span>
        <InfoTip term={INCOME_KEY} text={INCOME_KEY_TIP} />
      </div>

      {/* ── the list: citywide always; a selection highlights, never filters ── */}
      <ol ref={listRef} className="flex flex-col gap-0.5">
        {ranked.map((r) => {
          const on = r.name === neighborhood
          const flagged = r.flag !== null
          return (
            <li key={r.name} data-nhood={r.name} className={on ? SELECTED : ''}>
              <button
                type="button"
                aria-pressed={on}
                aria-label={equityRowLabel(r, rank)}
                onClick={() => onSelect(on ? null : r.name)}
                className={`w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                  on ? '' : 'hover:bg-paper-100/70 dark:hover:bg-espresso-800/50'
                }`}
              >
                <span className="w-7 shrink-0 font-mono text-nano tabular-nums text-paper-500 dark:text-paper-500 pt-0.5" aria-hidden>
                  {flagged ? (
                    <span className="inline-block w-3.5 h-3.5 rounded-sm align-middle" style={{ backgroundImage: HATCH_SWATCH_CSS }} />
                  ) : r.position}
                </span>

                <span className="flex-1 min-w-0" aria-hidden>
                  <span className="block text-label text-ink dark:text-paper-100 break-words">{r.name}</span>
                  {!flagged && (
                    <span className="mt-1 block h-[3px] w-full rounded-full bg-moss-500/15">
                      <span className="block h-full rounded-full bg-moss-500" style={{ width: `${barShare(r.value, top) * 100}%` }} />
                    </span>
                  )}
                  <span className="mt-1 flex items-center gap-2">
                    {r.medianIncome === null ? (
                      <span className="font-serif italic text-nano text-paper-600 dark:text-paper-400">{NO_CENSUS}</span>
                    ) : (
                      <>
                        {/* Flagged rows sit outside the comparison: their income
                            is printed, not placed on the unflagged range. */}
                        {!flagged && income.range && (
                          <PositionScale
                            value={r.medianIncome}
                            range={income.range}
                            reference={income.median ?? undefined}
                            color={MOSS_500}
                          />
                        )}
                        <span className="font-mono text-nano tabular-nums text-paper-600 dark:text-paper-400">{incomeShort(r.medianIncome)}</span>
                      </>
                    )}
                  </span>
                  {flagged && r.flag !== null && (
                    <span className="mt-1 block font-serif italic text-nano text-paper-700 dark:text-paper-300 break-words">
                      {equityFlagNote(r.flag, r.name)}
                    </span>
                  )}
                </span>

                <span className="shrink-0 text-right pt-px" aria-hidden>
                  <span className="block font-mono text-label tabular-nums text-ink dark:text-paper-200">{equityFigure(r.value)}</span>
                  {r.otherPosition !== null && (
                    <span className="block font-mono text-nano tabular-nums text-paper-500 dark:text-paper-500 whitespace-nowrap">
                      {otherRankLine(r.otherPosition, other)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
