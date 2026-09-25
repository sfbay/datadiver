import { useId, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import MapSidebar from '@/components/layout/MapSidebar'
import PositionScale from '@/components/charts/PositionScale'
import DotRow from '@/components/charts/DotRow'
import PartWhole from '@/components/charts/PartWhole'
import { DurationBar, EpisodeStrip } from '@/components/charts/SpanBar'
import { SkeletonSidebarRows } from '@/components/ui/Skeleton'
import type { Storefront, StorefrontSnapshot, TurnoverBucket, VisibleOwner } from '@/lib/storefronts/types'
import { CONTRACT_OPERATORS } from '@/lib/storefronts/ownerGroups'
import { apDate } from '@/utils/apDate'
import { sfLocalCutoff } from '@/utils/sfTime'
import NotesLink from './NotesLink'
import type { NoteSectionId } from './dataNotes'
import StorefrontLookup from './StorefrontLookup'
import RailStat from './RailStat'
import RingGlyph from './RingGlyph'
import { BRICK_400, BRICK_600, INDIGO_400, PAPER_500 } from './mapLayers'
import { REPEAT_BAR_FROM } from './closureEpisodes'
import { feedWindow, type FeedWindowId } from './inspectionFeed'
import {
  CLOSURES_CAPTION,
  FEED_NOTE,
  MAILING_WITHHELD_LABEL,
  SEEN_ONCE,
  THIN_FEED_BADGE,
  TOO_FEW_TO_RATE,
  TURNOVER_CAPTION,
  VERMIN_CAPTION,
  apCount,
  apCountStart,
  closuresFigure,
  closuresLede,
  companiesFigure,
  durationBinsLabel,
  durationFigure,
  episodeFeedNote,
  episodeOutcome,
  mailingCityLabel,
  ofInspected,
  ownersFigure,
  repeatSummary,
  sharedMailingSentence,
  turnoverLede,
  verminSentence,
  windowLabel,
} from './restaurantPhrase'
import {
  BUCKET_LABEL,
  BUCKET_ORDER,
  BUCKET_SHORT,
  DURATION_BIN_LABEL,
  DURATION_BIN_ORDER,
  bucketCounts,
  turnoverRowModel,
  citywideRate,
  closureDurationBins,
  closureLedeFigures,
  closureListRows,
  currentOperator,
  displayName,
  franchiseRows,
  normalizeRates,
  ownerClosureTally,
  ownerClosuresPhrase,
  ownerLists,
  parseBucket,
  pct,
  permitIndex,
  repeatClosureRows,
  shareRange,
  sharedAddressRows,
  sortRates,
  storefrontIndex,
  turnoverRows,
  type DurationBin,
  type LiveClosureItem,
  type RateBy,
} from './storylineRows'

/**
 * StorylineRail — the Storylines rail (spec §4.4 as amended by §11). The
 * three tabs ARE the view's lenses (one state, `?lens=`, owned by
 * Restaurants.tsx); the lookup box heads the rail. MapSidebar supplies the
 * desktop collapse and the mobile bottom sheet.
 *
 *   Turnover — a RailStat (count · bucket bar · caption) with the bucket
 *     legend as the `?bucket=` filter, then storefronts ranked by strict
 *     chain: the map's RingGlyph at the left edge, the chain inline with
 *     one-timers in muted italics.
 *   Closures — two RailStats (cleared closures · length histogram; vermin ·
 *     part-whole), then "Closed more than once since 2020" (snapshot, an
 *     EpisodeStrip per row), "Every closure, newest first" (live, a
 *     DurationBar + figure per row), then neighborhood rates (places closed ÷
 *     places inspected, "of N" on every row, PositionScale vs citywide).
 *   Owners — company owners at 3+ storefronts (contract operators folded; a
 *     DotRow says checked / closures), "One sign, many owners" (dots per
 *     location), the shared-mailing-address FACT, and curated "same
 *     restaurant group" CLAIMS (section hidden while none are curated).
 *
 * Readouts follow the Last 48 rule (Sept. 2026): NUMBER first, MARK second,
 * WORDS last. Every sentence a mark replaced rides that mark's `label` (and
 * the chip's InfoTip), so screen readers lose nothing. Chrome stays clean;
 * every simplified label's precision sits in the tab's DATA NOTES turn-down
 * (Jesse, 2026-09-24). Every list row is Tier 3 — no glow. Owner names render
 * as the registry publishes them, persons included; a mailing city renders as
 * the plain city name, no label.
 */

export type RestaurantLens = 'turnover' | 'closures' | 'owners'

const LENSES: readonly { id: RestaurantLens; label: string }[] = [
  { id: 'turnover', label: 'Turnover' },
  { id: 'closures', label: 'Closures' },
  { id: 'owners', label: 'Owners' },
]

export interface StorylineRailProps {
  /** Opens the header's data-notes popover at a section (the notes live once, in dataNotes.ts). */
  onOpenNotes?: (section: NoteSectionId) => void
  lens: RestaurantLens
  onLens: (l: RestaurantLens) => void
  snapshot: StorefrontSnapshot | null
  /** Q2 rows (window-scoped); null while loading. */
  neighborhoodRates: readonly object[] | null | undefined
  /** True while Q2 is in flight — an empty array is then "loading", never
   *  "no neighborhoods". */
  ratesLoading?: boolean
  /** The window-scoped every-closure list; null while loading. */
  closuresList: readonly LiveClosureItem[] | null | undefined
  /** True while the closure list is in flight — without it an empty list
   *  would read "No closures published in this window" during the load. */
  closuresLoading?: boolean
  /** A failed surface names itself — never a skeleton forever, never the
   *  absence copy ("No closures published in this window"). */
  snapshotError?: string | null
  ratesError?: string | null
  closuresError?: string | null
  windowId: FeedWindowId
  selectedKey: string | null
  onSelect: (key: string) => void
  bucket: string | null
  onBucket: (b: string | null) => void
  owner: string | null
  onOwner: (o: string | null) => void
  /** The selected neighborhood (`?nh=`); a rates row toggles it. */
  nh?: string | null
  onNh?: (n: string | null) => void
  /** Re-request whatever failed (snapshot and live queries). */
  onRetry?: () => void
}

// ── shared bits ────────────────────────────────────────────────────────────

const SELECTED = 'bg-teal-700/10 ring-1 ring-teal-700/30 dark:bg-teal-500/10 dark:ring-teal-500/30'
const HOVER = 'hover:bg-paper-100/80 dark:hover:bg-white/[0.04]'
const ROW = 'w-full text-left py-2 px-3 rounded-lg transition-colors duration-150'
const SUB = 'font-mono text-micro text-paper-600 dark:text-paper-400 leading-snug'
const PILL_ON = 'bg-teal-700/15 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400'
const PILL_OFF = 'bg-paper-100 dark:bg-white/[0.04] text-paper-600 dark:text-paper-400 hover:bg-paper-200 dark:hover:bg-white/[0.08]'

/** Rule-leading micro label: ── LABEL. */
function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-5 mb-2 first:mt-0">
      <span aria-hidden className="h-px w-4 bg-paper-400/70 dark:bg-white/20 shrink-0" />
      <h3 className="font-mono text-micro uppercase tracking-[0.18em] text-paper-700 dark:text-paper-300">{children}</h3>
      {right && <span className="ml-auto">{right}</span>}
    </div>
  )
}

/** A named failure where a list would be — the failed-read ≠ absence rule. */
function DidNotLoad({ what, retry }: { what: string; retry?: () => void }) {
  return (
    <p role="status" className="text-label text-paper-700 dark:text-paper-300 px-3">
      {what} did not load.{' '}
      {retry && (
        <button type="button" onClick={retry} className="font-mono text-micro underline decoration-dotted underline-offset-2 hover:text-ink dark:hover:text-paper-100">
          Try again
        </button>
      )}
    </p>
  )
}

/** The mono figure that rides beside a mark ("3 closures", "≤17 d", "of 254"). */
const FIGURE = 'font-mono text-nano tabular-nums whitespace-nowrap text-paper-600 dark:text-paper-400'

/** A long list folds behind a show-all turn-down — never paged. */
function Folded<T>({ items, first, render, noun }: { items: readonly T[]; first: number; render: (t: T) => ReactNode; noun: string }) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, first)
  return (
    <>
      {shown.map(render)}
      {items.length > first && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-1 px-3 py-1.5 font-mono text-micro text-paper-600 dark:text-paper-400 hover:text-ink dark:hover:text-paper-200"
        >
          {all ? 'Show fewer' : `Show all ${items.length.toLocaleString('en-US')} ${noun}`}
        </button>
      )}
    </>
  )
}

/** A storefront a reader can fly to (its key is in the file). */
function StorefrontLink({ s, onSelect, selected }: { s: Storefront; onSelect: (k: string) => void; selected: boolean }) {
  const now = currentOperator(s)
  return (
    <button type="button" onClick={() => onSelect(s.key)} className={`${ROW} py-1.5 ${selected ? SELECTED : HOVER}`}>
      <span className="block text-label text-ink dark:text-paper-200 break-words">{s.address}</span>
      {now && <span className={`block ${SUB}`}>{displayName(now.name)}</span>}
    </button>
  )
}

// ── the rail ───────────────────────────────────────────────────────────────

export default function StorylineRail(props: StorylineRailProps) {
  const { lens, onLens, snapshot, onSelect, snapshotError, onRetry } = props

  return (
    <MapSidebar>
      <StorefrontLookup snapshot={snapshot} onSelect={onSelect} failed={!snapshot && !!snapshotError} />

      <div role="tablist" aria-label="Storylines" className="flex border-b border-paper-200/60 dark:border-white/[0.04] flex-shrink-0">
        {LENSES.map((l) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={lens === l.id}
            onClick={() => onLens(l.id)}
            className={`flex-1 py-2.5 text-micro font-mono uppercase tracking-[0.15em] transition-colors duration-200 ${
              lens === l.id
                ? 'text-ink dark:text-white border-b-2 border-teal-700 dark:border-teal-400'
                : 'text-paper-500 dark:text-paper-600 hover:text-paper-700 dark:hover:text-paper-400'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="p-4 flex-1">
        {!snapshot && lens !== 'closures' ? (
          snapshotError ? <DidNotLoad what="The storefront histories" retry={onRetry} /> : <SkeletonSidebarRows count={8} />
        ) : lens === 'turnover' && snapshot ? (
          <TurnoverTab {...props} snapshot={snapshot} />
        ) : lens === 'closures' ? (
          <ClosuresTab {...props} />
        ) : snapshot ? (
          <OwnersTab {...props} snapshot={snapshot} />
        ) : null}
      </div>
    </MapSidebar>
  )
}

// ── Turnover ───────────────────────────────────────────────────────────────

/** One teal ramp for the three matched buckets (darkest = most owners) and
 *  paper for "not matched" — the registry has no record there, which is the
 *  site's paper/hatch register, not a fourth pigment. Bar and legend share
 *  these classes so they can't drift. */
const BUCKET_SWATCH: Readonly<Record<TurnoverBucket, string>> = {
  'three-owners': 'bg-teal-700 dark:bg-teal-400',
  'same-owner': 'bg-teal-700/65 dark:bg-teal-400/65',
  'owner-returned': 'bg-teal-700/40 dark:bg-teal-400/40',
  'owners-unknown': 'bg-paper-500/50',
}

/** The stacked bar in the Turnover chip: each bucket's share of the total.
 *  With a bucket selected the others fade so the bar reads as the filter. */
function BucketBar({ counts, total, active }: { counts: Record<TurnoverBucket, number>; total: number; active: TurnoverBucket | null }) {
  if (total <= 0) return null
  const parts = BUCKET_ORDER.map((b) => `${BUCKET_LABEL[b]} ${counts[b]}`).join(', ')
  return (
    <span role="img" aria-label={parts} className="flex h-1.5 w-full gap-px overflow-hidden rounded-sm">
      {BUCKET_ORDER.map((b) =>
        counts[b] > 0 ? (
          <span
            key={b}
            className={`block h-full transition-opacity duration-150 ${BUCKET_SWATCH[b]} ${active !== null && active !== b ? 'opacity-25' : ''}`}
            style={{ flexGrow: counts[b], flexBasis: 0 }}
          />
        ) : null,
      )}
    </span>
  )
}

function TurnoverTab({ snapshot, bucket: rawBucket, onBucket, selectedKey, onSelect, onOpenNotes }: StorylineRailProps & { snapshot: StorefrontSnapshot }) {
  const bucket = parseBucket(rawBucket)
  const nowYear = Number(snapshot.asOf.slice(0, 4))
  const counts = useMemo(() => bucketCounts(snapshot), [snapshot])
  const total = BUCKET_ORDER.reduce((n, b) => n + counts[b], 0)
  const rows = useMemo(() => turnoverRows(snapshot, bucket), [snapshot, bucket])
  const lede = turnoverLede(total, snapshot.asOf, nowYear)

  return (
    <>
      <RailStat
        value={total}
        caption={TURNOVER_CAPTION}
        tip={lede}
        label={lede}
        mark={<BucketBar counts={counts} total={total} active={bucket} />}
        className="mb-2"
      />

      {/* The four buckets are still the `?bucket=` filter — now a legend
          under the bar: swatch · short label · count. */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3 px-1" role="group" aria-label="Owner pattern">
        {BUCKET_ORDER.map((b: TurnoverBucket) => {
          const on = bucket === b
          const dim = bucket !== null && !on
          return (
            <button
              key={b}
              type="button"
              aria-pressed={on}
              aria-label={`${BUCKET_LABEL[b]} · ${counts[b]}`}
              onClick={() => onBucket(on ? null : b)}
              className={`inline-flex items-center gap-1.5 py-0.5 rounded-sm font-mono text-nano transition-opacity duration-150 hover:opacity-100 ${
                dim ? 'opacity-45' : 'opacity-100'
              } ${on ? 'text-ink dark:text-paper-100 underline decoration-dotted underline-offset-2' : 'text-paper-700 dark:text-paper-300'}`}
            >
              <span aria-hidden className={`inline-block w-2 h-2 rounded-[2px] ${BUCKET_SWATCH[b]}`} />
              <span>{BUCKET_SHORT[b]}</span>
              <span className="tabular-nums opacity-70">{counts[b]}</span>
            </button>
          )
        })}
      </div>

      <div className="space-y-0.5">
        <Folded
          items={rows}
          first={40}
          noun="storefronts"
          render={(s) => {
            const m = turnoverRowModel(s)
            const selected = selectedKey === s.key
            return (
              // A div, not a button: the turn-down is its own control and a
              // control inside a button is invalid markup.
              <div key={s.key} className={`rounded-lg transition-colors duration-150 ${selected ? SELECTED : HOVER}`}>
                <button
                  type="button"
                  onClick={() => onSelect(s.key)}
                  aria-current={selected || undefined}
                  className="w-full text-left py-2 px-3"
                >
                  <span className="flex items-start gap-2">
                    {/* The map's tree rings at the FlowRail dot position — a
                        "5" in the list is the five-ring door on the map. */}
                    <RingGlyph
                      rings={s.chainStrict}
                      repeat={s.repeatCurrent}
                      className="mt-px"
                      label={`${s.chainStrict} names counted${s.repeatCurrent ? '; the current permit was closed more than once' : ''}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        {/* The current business leads (Jesse, Sept. 25 2026).
                            "Last" — never "Now" — when its latest sighting
                            is older than the live records. */}
                        <span className="text-[0.8125rem] font-medium text-ink dark:text-paper-100 break-words">
                          {m.current ? (
                            <>
                              {!m.isNow && <span className={`${SUB} not-italic mr-1`}>Last:</span>}
                              {displayName(m.current.name)}
                            </>
                          ) : s.address}
                        </span>
                        <span className={FIGURE}>{m.names} names</span>
                      </span>
                      <span className={`block ${SUB} italic`}>
                        {s.address}{s.nhood ? ` · ${s.nhood}` : ''}
                        {m.current && !m.isNow ? ` · last seen ${apDate(m.current.lastDate, nowYear)}` : ''}
                      </span>
                    </span>
                  </span>
                </button>
                {m.earlier.length > 0 && (
                  <details className="px-3 pb-2 -mt-1 group">
                    <summary className={`${SUB} cursor-pointer list-none inline-flex items-center gap-1 ml-[1.625rem]`}>
                      <span className="inline-block transition-transform group-open:rotate-90">›</span>
                      {m.earlier.length} earlier {m.earlier.length === 1 ? 'name' : 'names'}
                    </summary>
                    <span className="block mt-1 ml-[1.625rem] text-label leading-snug text-paper-800 dark:text-paper-300">
                      {m.earlier.map((o, i) => (
                        <span key={`${o.name}-${o.firstDate}`}>
                          {i > 0 && <span className="text-paper-500 dark:text-paper-600"> → </span>}
                          <span
                            className={o.seenOnce ? 'italic text-paper-500 dark:text-paper-500' : ''}
                            title={o.seenOnce ? SEEN_ONCE : undefined}
                          >
                            {displayName(o.name)}
                          </span>
                        </span>
                      ))}
                      <span className="text-paper-500 dark:text-paper-600"> → </span>
                      <span className="text-ink dark:text-paper-100">{displayName(m.current!.name)}</span>
                    </span>
                  </details>
                )}
              </div>
            )
          }}
        />
      </div>

      <NotesLink section="turnover" onOpen={onOpenNotes} className="mt-6 px-3" />
    </>
  )
}

// ── Closures ───────────────────────────────────────────────────────────────

function ClosuresTab({
  snapshot, neighborhoodRates, ratesLoading, closuresList, closuresLoading, windowId, selectedKey, onSelect, nh, onNh,
  snapshotError, ratesError, closuresError, onRetry, onOpenNotes,
}: StorylineRailProps) {
  const sfToday = sfLocalCutoff(Date.now()).slice(0, 10)
  const nowYear = Number(sfToday.slice(0, 4))
  const win = feedWindow(windowId, sfToday)
  const [rateBy, setRateBy] = useState<RateBy>('closed')

  const repeat = useMemo(() => (snapshot ? repeatClosureRows(snapshot) : null), [snapshot])
  const lede = useMemo(() => (snapshot ? closureLedeFigures(snapshot) : null), [snapshot])
  const bins = useMemo(() => (snapshot ? closureDurationBins(snapshot) : null), [snapshot])
  const vermin = snapshot?.stats?.vermin
  const byPermit = useMemo(() => (snapshot ? permitIndex(snapshot) : new Map<string, Storefront>()), [snapshot])
  const list = useMemo(
    () => (closuresList && !closuresLoading ? closureListRows(closuresList, byPermit) : null),
    [closuresList, closuresLoading, byPermit],
  )

  const rawRates = (neighborhoodRates && !ratesLoading ? neighborhoodRates : null) as readonly Record<string, unknown>[] | null
  const rates = useMemo(() => sortRates(normalizeRates(rawRates), rateBy), [rawRates, rateBy])
  const city = useMemo(() => citywideRate(rawRates), [rawRates])
  const range = shareRange(rates, rateBy)
  const cityShare = rateBy === 'closed' ? city.closedShare : city.yellowShare

  return (
    <>
      {lede && bins ? (
        <div className="grid grid-cols-2 gap-2 mb-2">
          <RailStat
            value={lede.cleared}
            caption={CLOSURES_CAPTION}
            tip={closuresLede({ ...lede, since: '2024-01-01' })}
            mark={<DurationHistogram bins={bins} />}
          />
          {vermin && vermin.m > 0 && (
            <RailStat
              value={vermin.n}
              caption={VERMIN_CAPTION}
              tip={verminSentence({ cited: vermin.n, closureInspections: vermin.m, since: '2024-01-01' })}
              mark={
                <PartWhole
                  part={vermin.n}
                  whole={vermin.m}
                  color={BRICK_600}
                  width={72}
                  className="text-paper-600 dark:text-paper-400"
                  label={verminSentence({ cited: vermin.n, closureInspections: vermin.m, since: '2024-01-01' })}
                />
              }
            />
          )}
        </div>
      ) : snapshotError ? null : (
        <SkeletonSidebarRows count={2} />
      )}

      {/* 1 · Closed more than once (snapshot, through asOf) */}
      <SectionLabel>Closed more than once since 2020</SectionLabel>
      {!repeat ? (
        snapshotError ? <DidNotLoad what="The storefront histories" retry={onRetry} /> : <SkeletonSidebarRows count={4} />
      ) : (
        <div className="space-y-0.5">
          <Folded
            items={repeat}
            first={15}
            noun="places"
            render={(r) => (
              <button
                key={`${r.storefront.key}|${r.era}|${r.permit}`}
                type="button"
                onClick={() => onSelect(r.storefront.key)}
                className={`${ROW} ${selectedKey === r.storefront.key ? SELECTED : HOVER}`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[0.8125rem] font-medium text-ink dark:text-paper-100 break-words">{r.name}</span>
                  <span className={`${FIGURE} shrink-0`}>{closuresFigure(r.episodes.length)}</span>
                </span>
                <span className={`block ${SUB} italic`}>
                  {[r.storefront.address, r.storefront.nhood].filter(Boolean).join(' · ')}
                  {r.era === 2020 ? ' · 2020–23 records' : ''}
                </span>
                {/* Each closure as a span on the 2020→asOf axis; an open one
                    (no later record) runs hatched to the axis end. */}
                <span className="block mt-1.5">
                  <EpisodeStrip
                    spans={r.episodes.map((e) => ({ start: e.start, end: e.clearedOn }))}
                    axis={[REPEAT_BAR_FROM, snapshot!.asOf]}
                    width={160}
                    color={BRICK_600}
                    openColor={PAPER_500}
                    label={repeatSummary(r.episodes)}
                  />
                </span>
              </button>
            )}
          />
          {snapshot && (
            <p className={`${SUB} px-3 pt-1`}>Through {apDate(snapshot.asOf, nowYear)}</p>
          )}
        </div>
      )}

      {/* 2 · Every closure, newest first (live, window-scoped) */}
      <SectionLabel
        right={
          windowId === 'since' ? (
            <span className="px-1 rounded-sm bg-paper-200/80 dark:bg-white/[0.06] text-paper-700 dark:text-paper-300 font-mono text-nano uppercase tracking-[0.12em]">
              {THIN_FEED_BADGE}
            </span>
          ) : undefined
        }
      >
        Every closure, newest first
      </SectionLabel>
      <p className={`${SUB} mb-1.5`}>{windowLabel(win)}</p>
      {closuresError ? (
        <DidNotLoad what="This window’s closures" retry={onRetry} />
      ) : !list ? (
        <SkeletonSidebarRows count={5} />
      ) : list.length === 0 ? (
        <p className="text-label text-paper-700 dark:text-paper-300 px-3">No closures published in this window.</p>
      ) : (
        <div className="space-y-0.5">
          <Folded
            items={list}
            first={20}
            noun="closures"
            render={(c) => {
              const ep = c.episode
              const body = (
                <>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[0.8125rem] font-medium text-ink dark:text-paper-100 break-words">{c.name}</span>
                    <span className="font-mono text-micro tabular-nums text-paper-600 dark:text-paper-400 shrink-0">
                      {apDate(ep.start, nowYear)}
                    </span>
                  </span>
                  <span className={`block ${SUB} italic`}>
                    {c.storefront ? [c.storefront.address, c.storefront.nhood].filter(Boolean).join(' · ') : 'Not mapped'}
                  </span>
                  {/* Length on a 0…30-day scale: same day = a hairline at 0,
                      no later record = hatched full width (never "still
                      closed"), longer than 30 days = the break mark. */}
                  <span className="mt-1.5 flex items-center gap-2">
                    <DurationBar
                      days={ep.sameDay ? 0 : ep.days}
                      cap={30}
                      color={BRICK_400}
                      openColor={PAPER_500}
                      label={episodeOutcome(ep, nowYear)}
                    />
                    <span className={FIGURE}>{durationFigure(ep)}</span>
                  </span>
                </>
              )
              return c.storefront ? (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c.storefront!.key)}
                  className={`${ROW} ${selectedKey === c.storefront.key ? SELECTED : HOVER}`}
                >
                  {body}
                </button>
              ) : (
                <div key={c.id} className={ROW}>
                  {body}
                </div>
              )
            }}
          />
          {/* ONE feed note for the list, not one per row: it applies to every
              hatched bar that began after the July 2025 break. */}
          {list.some((c) => episodeFeedNote(c.episode) !== null) && (
            <p className="px-3 pt-1 text-micro italic text-paper-600 dark:text-paper-400">{FEED_NOTE}</p>
          )}
        </div>
      )}

      {/* 3 · Neighborhood rates (live, window-scoped) */}
      <SectionLabel>Closure rates by neighborhood</SectionLabel>
      <div className="flex items-center gap-1.5 mb-2" role="group" aria-label="Rank by">
        <span className="text-nano font-mono uppercase tracking-[0.18em] text-paper-500 dark:text-paper-600 mr-0.5">Rank by</span>
        {(
          [
            ['closed', 'Closed share'],
            ['yellow', 'Yellow share'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={rateBy === key}
            onClick={() => setRateBy(key)}
            className={`px-2 py-1 rounded-md text-micro font-mono transition-colors duration-150 ${rateBy === key ? PILL_ON : PILL_OFF}`}
          >
            {label}
          </button>
        ))}
      </div>
      {ratesError ? (
        <DidNotLoad what="The neighborhood figures" retry={onRetry} />
      ) : !rawRates ? (
        <SkeletonSidebarRows count={8} />
      ) : rates.length === 0 ? (
        <p className="text-label text-paper-700 dark:text-paper-300 px-3">No neighborhood figures for this window.</p>
      ) : (
        <div className="space-y-0.5">
          {city.rated && cityShare !== null && (
            <div className={`${ROW} border border-dashed border-paper-300/70 dark:border-white/10`}>
              <RateLine
                name="Citywide"
                count={rateBy === 'closed' ? city.closed : city.yellow}
                inspected={city.inspected}
                share={cityShare}
                rateBy={rateBy}
              />
              {/* The reference row carries the same mark as every other row —
                  its dot sits ON the reference tick, which is the point. */}
              <span className="block mt-1">
                <PositionScale value={cityShare} range={range} reference={cityShare} width={120} height={10} color={rateBy === 'closed' ? '#963e30' : '#d4a435'} />
              </span>
            </div>
          )}
          {rates.map((r) => {
            const share = rateBy === 'closed' ? r.closedShare : r.yellowShare
            const on = nh === r.nhood
            // A row selects its neighborhood (`?nh=`) when the page wires it;
            // a second click clears it.
            const Row = onNh ? 'button' : 'div'
            return (
              <Row
                key={r.nhood}
                {...(onNh ? { type: 'button' as const, 'aria-pressed': on, onClick: () => onNh(on ? null : r.nhood) } : {})}
                className={`${ROW} block ${on ? SELECTED : onNh ? HOVER : ''}`}
              >
                {r.rated && share !== null ? (
                  <>
                    <RateLine name={r.nhood} count={rateBy === 'closed' ? r.closed : r.yellow} inspected={r.inspected} share={share} rateBy={rateBy} />
                    <span className="block mt-1">
                      <PositionScale
                        value={share}
                        range={range}
                        reference={cityShare ?? undefined}
                        width={120}
                        height={10}
                        color={rateBy === 'closed' ? '#963e30' : '#d4a435'}
                      />
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block text-label text-ink dark:text-paper-200">{r.nhood}</span>
                    <span className={`block ${SUB}`}>
                      {apCountStart(r.inspected)} inspected · {TOO_FEW_TO_RATE}
                    </span>
                  </>
                )}
              </Row>
            )
          })}
        </div>
      )}

      <NotesLink section="closures" onOpen={onOpenNotes} className="mt-6 px-3" />
    </>
  )
}

/** name · "6.7% of 254" — the share, then its denominator as a mono figure.
 *  The sentence it replaced is the aria-label. */
function RateLine({ name, count, inspected, share, rateBy }: { name: string; count: number; inspected: number; share: number; rateBy: RateBy }) {
  const sentence = `${count.toLocaleString('en-US')} of ${inspected.toLocaleString('en-US')} places ${rateBy === 'closed' ? 'closed' : 'given a yellow placard'}`
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span className="text-label text-ink dark:text-paper-200 break-words">{name}</span>
      <span className="flex items-baseline gap-1.5 shrink-0" aria-label={`${pct(share)}: ${sentence}`}>
        <span className="font-mono text-label tabular-nums text-ink dark:text-paper-100" aria-hidden>{pct(share)}</span>
        <span className={FIGURE} aria-hidden>{ofInspected(inspected)}</span>
      </span>
    </span>
  )
}

/** The Closures chip's mark: six bins of closure length, the "no later
 *  record" bin hatched paper (the hatch idiom — no record, never "still
 *  closed"). End labels only; the full count per bin is the aria sentence. */
function DurationHistogram({ bins }: { bins: Record<DurationBin, number> }) {
  const W = 120
  const H = 22
  const n = DURATION_BIN_ORDER.length
  const slot = W / n
  const barW = slot - 2
  const max = Math.max(1, ...DURATION_BIN_ORDER.map((b) => bins[b]))
  const rows = DURATION_BIN_ORDER.map((b) => ({ id: b, label: DURATION_BIN_LABEL[b], count: bins[b] }))
  const hatch = `hatch-${useId().replace(/:/g, '')}`
  return (
    <span className="block">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={durationBinsLabel(rows)}>
        <defs>
          <pattern id={hatch} patternUnits="userSpaceOnUse" width={4} height={4} patternTransform="rotate(-45)">
            <line x1={0} y1={0} x2={0} y2={4} stroke={PAPER_500} strokeWidth={1} opacity={0.7} />
          </pattern>
        </defs>
        <rect x={0} y={H - 1} width={W} height={1} fill={BRICK_600} opacity={0.25} />
        {rows.map((r, i) => {
          const h = r.count > 0 ? Math.max(1, (r.count / max) * (H - 2)) : 0
          const open = r.id === 'no-record'
          return (
            <rect
              key={r.id}
              x={i * slot + 1}
              y={H - 1 - h}
              width={barW}
              height={h}
              rx={1}
              fill={open ? `url(#${hatch})` : BRICK_600}
              stroke={open ? PAPER_500 : 'none'}
              strokeWidth={open ? 0.5 : 0}
            />
          )
        })}
      </svg>
      <span className="flex justify-between font-mono text-nano text-paper-500 dark:text-paper-500 leading-none mt-0.5" aria-hidden>
        <span>{DURATION_BIN_LABEL['same-day']}</span>
        <span>{DURATION_BIN_LABEL.longer} · no record</span>
      </span>
    </span>
  )
}

// ── Owners ─────────────────────────────────────────────────────────────────

const CONTRACT_LABEL = new Map(CONTRACT_OPERATORS.map((c) => [c.id, c.label]))

function OwnersTab({ snapshot, owner, onOwner, selectedKey, onSelect, onOpenNotes }: StorylineRailProps & { snapshot: StorefrontSnapshot }) {
  const byKey = useMemo(() => storefrontIndex(snapshot), [snapshot])
  const { ranked, contract } = useMemo(() => ownerLists(snapshot), [snapshot])
  const franchises = useMemo(() => franchiseRows(snapshot), [snapshot])
  const shared = useMemo(() => sharedAddressRows(snapshot), [snapshot])
  const [openBrand, setOpenBrand] = useState<string | null>(null)
  const [openAddress, setOpenAddress] = useState<string | null>(null)

  const storefrontList = (keys: readonly string[]) => {
    const known = keys.map((k) => byKey.get(k)).filter((s): s is Storefront => !!s)
    const missing = keys.length - known.length
    return (
      <div className="mt-1 ml-2 pl-2 border-l border-paper-200 dark:border-white/[0.06] space-y-0.5">
        {known.map((s) => (
          <StorefrontLink key={s.key} s={s} onSelect={onSelect} selected={selectedKey === s.key} />
        ))}
        {missing > 0 && (
          <p className={`${SUB} px-3 py-1`}>
            {apCountStart(missing)} more not on the map
          </p>
        )}
      </div>
    )
  }

  const ownerRow = (o: VisibleOwner, label?: string) => {
    const active = owner === o.name
    const tally = ownerClosureTally(o, byKey)
    const closures = ownerClosuresPhrase(tally)
    const city = mailingCityLabel(o.mailCity)
    const brands = o.brands.slice(0, 3).join(', ') + (o.brands.length > 3 ? ` +${o.brands.length - 3}` : '')
    return (
      <div key={o.name}>
        <button
          type="button"
          aria-pressed={active}
          onClick={() => onOwner(active ? null : o.name)}
          className={`${ROW} ${active ? SELECTED : HOVER}`}
        >
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[0.8125rem] font-medium text-ink dark:text-paper-100 break-words">{label ?? o.name}</span>
            <span className="font-mono text-label tabular-nums text-indigo-500 dark:text-indigo-300 shrink-0">{o.storefronts.length}</span>
          </span>
          {label && <span className={`block ${SUB}`}>{o.name}</span>}
          {city && <span className={`block ${SUB} italic`}>{city}</span>}
          {/* One dot per storefront: solid = on the map (checked), hollow =
              not, brick = a closure since 2020. The sentence is the label. */}
          {closures && (
            <span className="block mt-1">
              <DotRow
                total={tally.storefronts}
                filled={tally.checked}
                accent={Array.from({ length: Math.min(tally.closures, tally.checked) }, (_, i) => i)}
                color={INDIGO_400}
                accentColor={BRICK_600}
                size={6}
                label={closures}
                className={FIGURE}
              />
            </span>
          )}
          {brands && <span className="block mt-0.5 text-micro text-paper-600 dark:text-paper-400 break-words">{brands}</span>}
        </button>
        {active && (
          <>
            {storefrontList(o.storefronts)}
            <Link
              to={`/business/owner/${encodeURIComponent(o.name)}`}
              className="inline-block mt-1 ml-5 font-mono text-micro text-teal-700 dark:text-teal-400 hover:underline"
            >
              Registry profile →
            </Link>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      {/* 1 · Visible ownership */}
      <SectionLabel>Registered to one company at 3+ storefronts</SectionLabel>
      <div className="space-y-0.5">
        <Folded items={ranked} first={25} noun="companies" render={(o) => ownerRow(o)} />
      </div>
      {contract.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer px-3 py-1.5 font-mono text-micro text-paper-600 dark:text-paper-400 hover:text-ink dark:hover:text-paper-200">
            Contract food-service and event-market companies · {contract.length}
          </summary>
          <div className="space-y-0.5 mt-1">{contract.map((o) => ownerRow(o, CONTRACT_LABEL.get(o.contract ?? '') ?? o.name))}</div>
        </details>
      )}

      {/* 2 · One sign, many owners */}
      <SectionLabel>One sign, many owners</SectionLabel>
      <div className="space-y-0.5">
        <Folded
          items={franchises}
          first={15}
          noun="brands"
          render={(f) => {
            const open = openBrand === f.brand
            return (
              <div key={f.brand}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenBrand(open ? null : f.brand)}
                  className={`${ROW} ${open ? SELECTED : HOVER}`}
                >
                  <span className="block text-[0.8125rem] font-medium text-ink dark:text-paper-100 break-words">{f.brand}</span>
                  <span className="mt-1 flex items-center gap-2">
                    <DotRow
                      total={f.locations}
                      color={INDIGO_400}
                      size={6}
                      label={`${apCountStart(f.locations)} ${f.locations === 1 ? 'location' : 'locations'}, ${apCount(f.owners.length)} registered owners`}
                      className={FIGURE}
                    />
                    <span className={FIGURE} aria-hidden>{ownersFigure(f.owners.length)}</span>
                  </span>
                </button>
                {open && (
                  <div className="mt-1 ml-2 pl-2 border-l border-paper-200 dark:border-white/[0.06] space-y-1.5">
                    {f.owners.map((fo) => (
                      <div key={fo.name}>
                        <p className="px-3 text-label text-ink dark:text-paper-200 break-words">
                          {fo.kind === 'company' ? (
                            <Link to={`/business/owner/${encodeURIComponent(fo.name)}`} className="hover:underline">
                              {fo.name}
                            </Link>
                          ) : (
                            fo.name
                          )}
                        </p>
                        {fo.storefronts
                          .map((k) => byKey.get(k))
                          .filter((s): s is Storefront => !!s)
                          .map((s) => (
                            <StorefrontLink key={s.key} s={s} onSelect={onSelect} selected={selectedKey === s.key} />
                          ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          }}
        />
      </div>

      {/* 3 · The shared-mailing-address FACT (never worded as common ownership) */}
      <SectionLabel>Same mailing address</SectionLabel>
      <div className="space-y-0.5">
        <Folded
          items={shared}
          first={15}
          noun="addresses"
          render={(a) => {
            const open = openAddress === a.key
            return (
              <div key={a.key}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenAddress(open ? null : a.key)}
                  className={`${ROW} ${open ? SELECTED : HOVER}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[0.8125rem] font-medium text-ink dark:text-paper-100 break-words">
                      {[a.address, mailingCityLabel(a.city)].filter(Boolean).join(', ')}
                    </span>
                    {/* The FACT as a badge; the sentence stays the label. */}
                    <span
                      className="shrink-0 px-1.5 py-0.5 rounded-sm bg-indigo-500/10 dark:bg-indigo-400/15 font-mono text-nano tabular-nums text-indigo-600 dark:text-indigo-300"
                      aria-label={sharedMailingSentence(a.companies.length)}
                    >
                      {companiesFigure(a.companies.length)}
                    </span>
                  </span>
                  {a.brands.length > 0 && (
                    <span className="block mt-0.5 text-micro text-paper-600 dark:text-paper-400 break-words">
                      {a.brands.slice(0, 4).join(', ')}
                      {a.brands.length > 4 ? ` +${a.brands.length - 4}` : ''}
                    </span>
                  )}
                </button>
                {open && (
                  <>
                    <ul className="mt-1 ml-5 space-y-0.5">
                      {a.companies.map((c) => (
                        <li key={c} className="text-label text-ink dark:text-paper-200 break-words">
                          <Link to={`/business/owner/${encodeURIComponent(c)}`} className="hover:underline">
                            {c}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {storefrontList(a.storefronts)}
                  </>
                )}
              </div>
            )
          }}
        />
        {snapshot.withheldSharedCount > 0 && (
          <p className={`${SUB} px-3 pt-1`}>
            {MAILING_WITHHELD_LABEL} · {apCount(snapshot.withheldSharedCount)} more shared{' '}
            {snapshot.withheldSharedCount === 1 ? 'address' : 'addresses'}
          </p>
        )}
      </div>

      {/* 4 · Curated "same restaurant group" claims — hidden while none exist */}
      {snapshot.groups.length > 0 && (
        <>
          <SectionLabel>Same restaurant group</SectionLabel>
          <div className="space-y-2">
            {snapshot.groups.map((g) => (
              <div key={g.id} className="px-3">
                <p className="text-[0.8125rem] font-medium text-ink dark:text-paper-100 break-words">{g.label}</p>
                <p className={SUB}>{g.companies.join(' · ')}</p>
                <ul className="mt-1 space-y-0.5">
                  {g.evidence.map((e) => (
                    <li key={`${e.kind}-${e.url}`} className="text-micro text-paper-700 dark:text-paper-300">
                      <a href={e.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {e.detail}
                      </a>
                    </li>
                  ))}
                </ul>
                {storefrontList(g.storefronts)}
              </div>
            ))}
          </div>
        </>
      )}

      <NotesLink section="owners" onOpen={onOpenNotes} className="mt-6 px-3" />
    </>
  )
}
