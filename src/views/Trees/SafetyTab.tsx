// src/views/Trees/SafetyTab.tsx
//
// The Safety lens's rail body — a dispassionate ledger, not an alarm (spec
// §3.4 as amended by §10.1.6–§10.1.8). Two signals, never combined into a
// score and never a list of individual trees:
//
//   1. Three RailStat chips: street trees with a recorded trunk 21 inches or
//      wider, stumps, and the latest FULL year's fallen-tree reports (its
//      year in the caption).
//   2. Fall reports by year, citywide: EVERY year on one shared scale
//      (fallBars), the two kinds stacked but never summed — fallen tree in
//      brick, about to fall in ochre. The partial year is HATCHED and
//      captioned "so far"; a year too few of whose reports carry a map point
//      is captioned "citywide only" (ruling R1). The busiest day beneath is
//      citywide and is never split by neighborhood.
//   3. Fallen-tree reports by neighborhood for one year. The pills offer
//      only placeable FULL years (neighborhoodYears); one line names the
//      years left out and why, from the data, and a second line that rows
//      count only reports with a map point (so they sum to less than the
//      bar). A list head names the right column's two figures. A row: name
//      · that year's mapped fallen-tree reports · the neighborhood's street
//      trees, as a plain figure BESIDE the reports and never divided into a
//      rate (ruling R17: a report may concern any tree, park and private
//      trees included) · large trunks · stumps. Selecting a row sets `?nh=`;
//      it never filters.
//   4. Removal notices: a PartWhole of sites still in the inventory, then
//      what those sites are listed as NOW (street tree / stump / empty site /
//      shrub — final review I2; needs the snapshot, so the bar shows first and
//      the line joins it when the big file lands), the types under their
//      published names, and the replanted-after line.
//   5. Sites that left the inventory: the generator's log, fetched only when
//      this tab mounts.
//
// The rail itself prints the one "Data notes ›" link (section 'safety').
// Every mark's sentence rides its aria-label.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import RailStat from '@/components/charts/RailStat'
import PartWhole from '@/components/charts/PartWhole'
import { useMapSidebarMode } from '@/components/layout/MapSidebar'
import { Skeleton } from '@/components/ui/Skeleton'
import { useIsMobile } from '@/hooks/useIsMobile'
import { noticedSitesByKind } from '@/lib/trees/siteNotices'
import type { TreesAggregates, TreesSnapshot } from '@/lib/trees/types'
import {
  ABOUT_KEY, CAPTION_LARGE_TRUNKS, CAPTION_STUMPS, DISAPPEARED_ERROR, FALLEN_KEY, FALLS_BY_YEAR_HEAD,
  FORMER_HEAD, LARGE_TRUNKS_UNIT, NEIGHBORHOOD_FALLS_HEAD, NEIGHBORHOOD_YEARS_LABEL, NOTICES_HEAD,
  NOTICES_LISTED_CAPTION, NO_FALL_YEARS, ROWS_COUNT_HEAD, ROWS_MAPPED_ONLY, ROWS_TREES_HEAD, STREET_TREES_UNIT, STUMPS_UNIT,
  TRUNK_NOTE, apCount, busiestDayLine, disappearedLine, fallBarCaptions, fallBarLabel, fallChipCaption,
  fallChipTip, largeTrunksLine, noticeTypeLabel, noticedKindsLine, noticedKindsPendingLine, noticesListedLabel, noticesTotalLine,
  replantedAfterLine, safetyRowLabel, stumpsLine, yearsLeftOutLine,
} from './treesPhrase'
import { fallBars, latestFullYear, neighborhoodYears, safetyRows } from './safetyView'
import { barShare } from './exploreRows'
import { BRICK_600, LEGEND_DOT_RADII, MOSS_500, OCHRE_500 } from './mapLayers'
import { useTreesDisappeared } from './useTrees'

const MONO_HEAD = 'font-mono text-nano uppercase tracking-[0.15em] text-paper-600 dark:text-paper-400'
const SELECTED = 'rounded-lg bg-ochre-500/10 ring-1 ring-ochre-500/30'
/** The year strip's plot height in rem (scales with Large Type). */
const STRIP_REM = 4.5

/** The open-span hatch, in the bar's own pigment (the site's hatch idiom:
 *  hatched = not comparable yet, never "nothing happened"). */
const hatch = (color: string): string =>
  `repeating-linear-gradient(-45deg, ${color} 0 1.5px, transparent 1.5px 4px)`

export interface SafetyTabProps {
  agg: TreesAggregates
  /** The 144k-site snapshot, or null while it loads: only the notices'
   *  listed-as-now line needs it, and it simply waits for it. */
  snap: TreesSnapshot | null
  /** The snapshot request failed: the pending line says the breakdown did not load. */
  snapFailed: boolean
  /** The resolved `?nh=` name, or null. */
  neighborhood: string | null
  /** Toggle: the selected row's own click passes null. */
  onSelect(name: string | null): void
  nowYear: number
}

function Mark({ children }: { children: ReactNode }) {
  return <svg width={14} height={14} viewBox="0 0 14 14" className="block" aria-hidden>{children}</svg>
}

export default function SafetyTab({ agg, snap, snapFailed, neighborhood, onSelect, nowYear }: SafetyTabProps) {
  const { isCompressed } = useMapSidebarMode()
  const isMobile = useIsMobile()
  const t = agg.totals
  const years = agg.falls.years

  const bars = useMemo(() => fallBars(years), [years])
  const full = useMemo(() => latestFullYear(years), [years])
  const nbYears = useMemo(() => neighborhoodYears(years), [years])
  const leftOut = useMemo(() => yearsLeftOutLine(years), [years])

  // Default = the latest placeable full year; a stale pick falls back to it.
  const [picked, setPicked] = useState<number | null>(null)
  const year = picked !== null && nbYears.includes(picked) ? picked : nbYears[nbYears.length - 1] ?? null
  const rows = useMemo(() => (year === null ? [] : safetyRows(agg.neighborhoods, year, years)), [agg.neighborhoods, year, years])
  const topFallen = rows[0]?.fallen ?? 0

  const notices = agg.notices
  const firstNoticeYear = notices.byYear.length ? Math.min(...notices.byYear.map(([y]) => y)) : null
  const topType = notices.byType.reduce((m, [, n]) => Math.max(m, n), 0)
  // Never the bare bar (CLAUDE.md contract 2): the breakdown once the
  // snapshot lands, a pending line while it loads or after it failed.
  const kindsLine = useMemo(
    () => (snap ? noticedKindsLine(noticedSitesByKind(snap)) : noticedKindsPendingLine(snapFailed)),
    [snap, snapFailed],
  )

  // A neighborhood chosen elsewhere scrolls into view. Desktop only: the
  // mobile sheet is translateY'd, where scrollIntoView misbehaves.
  const listRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    if (isMobile || neighborhood === null || !listRef.current) return
    const el = Array.from(listRef.current.querySelectorAll<HTMLElement>('[data-nhood]'))
      .find((n) => n.dataset.nhood === neighborhood)
    try { el?.scrollIntoView({ block: 'nearest' }) } catch { /* no layout */ }
  }, [neighborhood, isMobile, year])

  return (
    <div className="flex flex-col gap-5">
      {/* ── opener: three chips ── */}
      <div className={`grid gap-2 ${isCompressed ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <RailStat
          value={t.largeTrunks}
          caption={CAPTION_LARGE_TRUNKS}
          tip={TRUNK_NOTE}
          label={`${largeTrunksLine(t.largeTrunks)} ${TRUNK_NOTE}`}
          mark={<Mark><circle cx={7} cy={7} r={LEGEND_DOT_RADII[2]} fill={MOSS_500} opacity={0.75} /></Mark>}
        />
        <RailStat
          value={t.stumps}
          caption={CAPTION_STUMPS}
          tip={stumpsLine(t.stumps)}
          mark={<Mark><circle cx={7} cy={7} r={4} fill="none" stroke={BRICK_600} strokeWidth={1.5} /></Mark>}
        />
        {full && (
          <RailStat
            className={isCompressed ? '' : 'col-span-2'}
            value={full.fallen}
            caption={fallChipCaption(full.year)}
            tip={fallChipTip(full.year, full.fallen, full.aboutToFall)}
          />
        )}
      </div>

      {/* ── fall reports by year: every year, one scale, never summed ── */}
      {bars.length > 0 && (
        <section className="flex flex-col gap-2" aria-label={FALLS_BY_YEAR_HEAD}>
          <div className="flex items-center justify-between gap-2">
            <p className={MONO_HEAD}>{FALLS_BY_YEAR_HEAD}</p>
            <span className="flex items-center gap-3" aria-hidden>
              <span className="flex items-center gap-1 font-serif text-nano text-paper-700 dark:text-paper-300">
                <span className="w-2 h-2 rounded-sm" style={{ background: BRICK_600 }} />{FALLEN_KEY}
              </span>
              <span className="flex items-center gap-1 font-serif text-nano text-paper-700 dark:text-paper-300">
                <span className="w-2 h-2 rounded-sm" style={{ background: OCHRE_500 }} />{ABOUT_KEY}
              </span>
            </span>
          </div>
          <div className="flex items-end gap-1.5">
            {bars.map((b) => {
              const fallenH = b.max > 0 ? (b.fallen / b.max) * STRIP_REM : 0
              const aboutH = b.max > 0 ? (b.aboutToFall / b.max) * STRIP_REM : 0
              return (
                <div key={b.year} role="img" aria-label={fallBarLabel(b)} className="flex-1 min-w-0 flex flex-col items-center">
                  <div className="w-full flex flex-col justify-end" style={{ height: `${STRIP_REM}rem` }} aria-hidden>
                    {[{ h: aboutH, color: OCHRE_500 }, { h: fallenH, color: BRICK_600 }].map(({ h, color }, i) => (
                      <div
                        key={i}
                        className="w-full first:rounded-t-sm"
                        style={b.partial
                          ? { height: `${h}rem`, backgroundImage: hatch(color), boxShadow: `inset 0 0 0 0.5px ${color}` }
                          : { height: `${h}rem`, background: color }}
                      />
                    ))}
                  </div>
                  <span className="mt-1 font-mono text-nano tabular-nums text-paper-700 dark:text-paper-300" aria-hidden>{b.year}</span>
                  {fallBarCaptions(b).map((c) => (
                    <span key={c} className="font-serif italic text-nano leading-tight text-center text-paper-600 dark:text-paper-400" aria-hidden>
                      {c}
                    </span>
                  ))}
                </div>
              )
            })}
          </div>
          <p className="font-serif text-xs text-paper-800 dark:text-paper-200">{busiestDayLine(agg.falls.busiestDay, nowYear)}</p>
        </section>
      )}

      {/* ── by neighborhood: placeable full years only (R1) ── */}
      <section className="flex flex-col gap-2" aria-label={NEIGHBORHOOD_FALLS_HEAD}>
        <p className={MONO_HEAD}>{NEIGHBORHOOD_FALLS_HEAD}</p>
        {year === null ? (
          <p className="font-serif text-xs text-paper-700 dark:text-paper-300">{NO_FALL_YEARS}</p>
        ) : (
          <>
            <div role="radiogroup" aria-label={NEIGHBORHOOD_YEARS_LABEL} className="flex gap-1">
              {nbYears.map((y) => (
                <button
                  key={y}
                  type="button"
                  role="radio"
                  aria-checked={year === y}
                  onClick={() => setPicked(y)}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-mono text-label tabular-nums transition-colors duration-200 ${
                    year === y
                      ? 'bg-ochre-500/10 ring-1 ring-ochre-500/30 text-ink dark:text-white'
                      : 'text-paper-500 dark:text-paper-600 hover:text-paper-700 dark:hover:text-paper-400'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
            {leftOut && <p className="font-serif italic text-xs text-paper-700 dark:text-paper-300">{leftOut}</p>}
            <p className="font-serif italic text-xs text-paper-700 dark:text-paper-300">{ROWS_MAPPED_ONLY}</p>

            {/* The right column's two figures, top to bottom — side by side, never divided (R17). */}
            <div className="flex justify-end px-2" aria-hidden>
              <span className="text-right font-mono text-nano uppercase tracking-[0.15em] text-paper-600 dark:text-paper-400">
                <span className="block">{ROWS_COUNT_HEAD}</span>
                <span className="block">{ROWS_TREES_HEAD}</span>
              </span>
            </div>
            <ol ref={listRef} className="flex flex-col gap-0.5">
              {rows.map((r) => {
                const on = r.name === neighborhood
                return (
                  <li key={r.name} data-nhood={r.name} className={on ? SELECTED : ''}>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={safetyRowLabel(r, year)}
                      onClick={() => onSelect(on ? null : r.name)}
                      className={`w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                        on ? '' : 'hover:bg-paper-100/70 dark:hover:bg-espresso-800/50'
                      }`}
                    >
                      <span className="flex-1 min-w-0" aria-hidden>
                        <span className="block text-label text-ink dark:text-paper-100 break-words">{r.name}</span>
                        <span className="mt-1 block h-[3px] w-full rounded-full" style={{ background: `${BRICK_600}26` }}>
                          <span className="block h-full rounded-full" style={{ width: `${barShare(r.fallen, topFallen) * 100}%`, background: BRICK_600 }} />
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-nano tabular-nums text-paper-600 dark:text-paper-400">
                          <span className="inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: OCHRE_500 }} />
                            {apCount(r.aboutToFall)} {ABOUT_KEY.toLowerCase()}
                          </span>
                          <span>{apCount(r.largeTrunks)} {LARGE_TRUNKS_UNIT}</span>
                          <span>{apCount(r.stumps)} {STUMPS_UNIT}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right pt-px" aria-hidden>
                        <span className="block font-mono text-label tabular-nums text-ink dark:text-paper-200">{apCount(r.fallen)}</span>
                        <span className="block font-mono text-nano tabular-nums text-paper-500 dark:text-paper-500 whitespace-nowrap">
                          {apCount(r.trees)} {STREET_TREES_UNIT}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </>
        )}
      </section>

      {/* ── removal notices: a notice, never a removal ── */}
      <section className="flex flex-col gap-2" aria-label={NOTICES_HEAD}>
        <p className={MONO_HEAD}>{NOTICES_HEAD}</p>
        <p className="font-serif text-xs text-paper-800 dark:text-paper-200">
          {noticesTotalLine(notices.rows, firstNoticeYear, notices.sites, notices.unjoinable)}
        </p>
        <div className="flex flex-col gap-0.5">
          <PartWhole
            part={notices.listed}
            whole={notices.sites}
            color={OCHRE_500}
            width={120}
            label={noticesListedLabel(notices.listed, notices.sites)}
            className="text-paper-700 dark:text-paper-300"
          />
          <span className="font-mono text-nano uppercase tracking-[0.15em] text-paper-600 dark:text-paper-400" aria-hidden>
            {NOTICES_LISTED_CAPTION}
          </span>
          {kindsLine && <p className="mt-0.5 font-serif text-xs text-paper-800 dark:text-paper-200">{kindsLine}</p>}
        </div>
        <ul className="flex flex-col gap-1">
          {notices.byType.map(([type, n]) => (
            <li key={type} role="img" aria-label={noticeTypeLabel(type, n)} className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-label text-ink dark:text-paper-100 break-words" aria-hidden>{type}</span>
              <span className="flex-1 h-[3px] rounded-full" style={{ background: `${OCHRE_500}2e` }} aria-hidden>
                <span className="block h-full rounded-full" style={{ width: `${barShare(n, topType) * 100}%`, background: OCHRE_500 }} />
              </span>
              <span className="shrink-0 font-mono text-nano tabular-nums text-paper-700 dark:text-paper-300" aria-hidden>{apCount(n)}</span>
            </li>
          ))}
        </ul>
        {notices.replantedAfter > 0 && (
          <p className="font-serif text-xs text-paper-800 dark:text-paper-200">{replantedAfterLine(notices.replantedAfter)}</p>
        )}
      </section>

      {/* ── sites that left the inventory: the generator's log ── */}
      <section className="flex flex-col gap-2" aria-label={FORMER_HEAD}>
        <p className={MONO_HEAD}>{FORMER_HEAD}</p>
        <FormerTrees nowYear={nowYear} />
      </section>
    </div>
  )
}

function FormerTrees({ nowYear }: { nowYear: number }) {
  const { data, error, retry } = useTreesDisappeared()
  if (data) return <p className="font-serif text-xs text-paper-800 dark:text-paper-200">{disappearedLine(data, nowYear)}</p>
  if (error) {
    return (
      <div className="flex flex-col items-start gap-1">
        <p className="font-serif text-xs text-paper-700 dark:text-paper-300">{DISAPPEARED_ERROR}</p>
        <button type="button" onClick={retry} className="font-mono text-micro uppercase tracking-[0.15em] text-moss-700 dark:text-moss-400 hover:underline">
          Retry
        </button>
      </div>
    )
  }
  return <Skeleton className="h-3 w-3/4" />
}
