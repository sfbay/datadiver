import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import MapSidebar from '@/components/layout/MapSidebar'
import PositionScale from '@/components/charts/PositionScale'
import { SkeletonSidebarRows } from '@/components/ui/Skeleton'
import type { Storefront, StorefrontSnapshot, TurnoverBucket, VisibleOwner } from '@/lib/storefronts/types'
import { CONTRACT_OPERATORS } from '@/lib/storefronts/ownerGroups'
import { apDate } from '@/utils/apDate'
import { sfLocalCutoff } from '@/utils/sfTime'
import StorefrontLookup from './StorefrontLookup'
import { feedWindow, type FeedWindowId } from './inspectionFeed'
import {
  BREAK_NOTICE,
  CARD_NOTE,
  DURATION_NOTE,
  MAILING_CITY_NOTE,
  MAILING_WITHHELD_LABEL,
  MAILING_WITHHELD_NOTE,
  NEIGHBORHOOD_RATES_NOTE,
  SEEN_ONCE,
  THIN_FEED_BADGE,
  TOO_FEW_TO_RATE,
  apCount,
  apCountStart,
  closuresLede,
  episodeFeedNote,
  episodeOutcome,
  mailingCityLabel,
  ownersNote,
  repeatSummary,
  sameMailingNote,
  sharedMailingSentence,
  turnoverLede,
  turnoverNote,
  verminSentence,
  windowLabel,
} from './restaurantPhrase'
import {
  BUCKET_LABEL,
  BUCKET_NOTE,
  BUCKET_ORDER,
  CHAIN_NOTE,
  CLOSURE_LEDE_NOTE,
  CLOSURE_LIST_NOTE,
  FRANCHISE_NOTE,
  OWNER_CLOSURES_NOTE,
  REPEAT_NOTE,
  bucketCounts,
  chainOperators,
  citywideRate,
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
  registryMatchPct,
  repeatClosureRows,
  shareRange,
  sharedAddressRows,
  sortRates,
  storefrontIndex,
  turnoverRows,
  groupEvidencePhrase,
  type LiveClosureItem,
  type RateBy,
} from './storylineRows'

/**
 * StorylineRail — the Storylines rail (spec §4.4 as amended by §11). The
 * three tabs ARE the view's lenses (one state, `?lens=`, owned by
 * Restaurants.tsx); the lookup box heads the rail. MapSidebar supplies the
 * desktop collapse and the mobile bottom sheet.
 *
 *   Turnover — the lede, bucket chips (`?bucket=`), storefronts ranked by
 *     strict chain, the chain inline with one-timers in muted italics.
 *   Closures — "Closed more than once since 2020" (snapshot, through asOf)
 *     first, then "Every closure, newest first" (live, window-scoped) with
 *     each closure's outcome, then neighborhood rates (places closed ÷ places
 *     inspected, denominator on every row, PositionScale vs citywide).
 *   Owners — company owners at 3+ storefronts (contract operators folded),
 *     "One sign, many owners", the shared-mailing-address FACT, and curated
 *     "same restaurant group" CLAIMS (section hidden while none are curated).
 *
 * Chrome stays clean; every simplified label's precision sits in the tab's
 * DATA NOTES turn-down (Jesse, 2026-09-24). Every list row is Tier 3 — no
 * glow. Owner names render as the registry publishes them, persons included;
 * a mailing city renders as the plain city name, no label.
 */

export type RestaurantLens = 'turnover' | 'closures' | 'owners'

const LENSES: readonly { id: RestaurantLens; label: string }[] = [
  { id: 'turnover', label: 'Turnover' },
  { id: 'closures', label: 'Closures' },
  { id: 'owners', label: 'Owners' },
]

export interface StorylineRailProps {
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

function Lede({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-ink dark:text-paper-200 mb-3">{children}</p>
}

/** The precision behind the tab's labels — body serif, collapsed by default. */
function DataNotes({ notes }: { notes: readonly (string | null | undefined | false)[] }) {
  const list = notes.filter((n): n is string => typeof n === 'string' && n.length > 0)
  return (
    <details className="mt-6 pt-3 border-t border-paper-200/70 dark:border-white/[0.06] group">
      <summary className="cursor-pointer list-none font-mono text-micro uppercase tracking-[0.18em] text-paper-600 dark:text-paper-400 hover:text-ink dark:hover:text-paper-200">
        <span className="inline-block transition-transform group-open:rotate-90 mr-1">›</span>Data notes
      </summary>
      <div className="mt-2 space-y-2">
        {list.map((n) => (
          <p key={n} className="text-label leading-relaxed text-paper-700 dark:text-paper-300">
            {n}
          </p>
        ))}
      </div>
    </details>
  )
}

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
  const { lens, onLens, snapshot, onSelect } = props

  return (
    <MapSidebar>
      <StorefrontLookup snapshot={snapshot} onSelect={onSelect} />

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
          <SkeletonSidebarRows count={8} />
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

function TurnoverTab({ snapshot, bucket: rawBucket, onBucket, selectedKey, onSelect }: StorylineRailProps & { snapshot: StorefrontSnapshot }) {
  const bucket = parseBucket(rawBucket)
  const nowYear = Number(snapshot.asOf.slice(0, 4))
  const counts = useMemo(() => bucketCounts(snapshot), [snapshot])
  const total = BUCKET_ORDER.reduce((n, b) => n + counts[b], 0)
  const rows = useMemo(() => turnoverRows(snapshot, bucket), [snapshot, bucket])

  return (
    <>
      <Lede>{turnoverLede(total, snapshot.asOf, nowYear)}</Lede>

      <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="Owner pattern">
        {BUCKET_ORDER.map((b: TurnoverBucket) => {
          const on = bucket === b
          return (
            <button
              key={b}
              type="button"
              aria-pressed={on}
              onClick={() => onBucket(on ? null : b)}
              className={`px-2 py-1 rounded-md text-micro font-mono transition-colors duration-150 ${on ? PILL_ON : PILL_OFF}`}
            >
              {BUCKET_LABEL[b]} <span className="tabular-nums opacity-70">{counts[b]}</span>
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
            const chain = chainOperators(s)
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => onSelect(s.key)}
                aria-current={selectedKey === s.key || undefined}
                className={`${ROW} ${selectedKey === s.key ? SELECTED : HOVER}`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[0.8125rem] font-medium text-ink dark:text-paper-100 break-words">{s.address}</span>
                  <span className="font-mono text-label tabular-nums text-teal-700 dark:text-teal-400 shrink-0" title="Operators counted">
                    {s.chainStrict}
                  </span>
                </span>
                {s.nhood && <span className={`block ${SUB}`}>{s.nhood}</span>}
                <span className="block mt-1 text-label leading-snug text-paper-800 dark:text-paper-300">
                  {chain.map((o, i) => (
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
                </span>
              </button>
            )
          }}
        />
      </div>

      <DataNotes notes={[turnoverNote(snapshot.asOf, snapshot.excludedAddresses, nowYear), CHAIN_NOTE, BUCKET_NOTE]} />
    </>
  )
}

// ── Closures ───────────────────────────────────────────────────────────────

function ClosuresTab({ snapshot, neighborhoodRates, ratesLoading, closuresList, closuresLoading, windowId, selectedKey, onSelect, nh, onNh }: StorylineRailProps) {
  const sfToday = sfLocalCutoff(Date.now()).slice(0, 10)
  const nowYear = Number(sfToday.slice(0, 4))
  const win = feedWindow(windowId, sfToday)
  const [rateBy, setRateBy] = useState<RateBy>('closed')

  const repeat = useMemo(() => (snapshot ? repeatClosureRows(snapshot) : null), [snapshot])
  const lede = useMemo(() => (snapshot ? closureLedeFigures(snapshot) : null), [snapshot])
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
      {lede ? (
        <Lede>
          {closuresLede({ ...lede, since: '2024-01-01' })}
          {vermin && vermin.m > 0 ? ` ${verminSentence({ cited: vermin.n, closureInspections: vermin.m, since: '2024-01-01' })}` : ''}
        </Lede>
      ) : (
        <SkeletonSidebarRows count={2} />
      )}

      {/* 1 · Closed more than once (snapshot, through asOf) */}
      <SectionLabel>Closed more than once since 2020</SectionLabel>
      {!repeat ? (
        <SkeletonSidebarRows count={4} />
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
                <span className="block text-[0.8125rem] font-medium text-ink dark:text-paper-100 break-words">{r.name}</span>
                <span className={`block ${SUB}`}>
                  {[r.storefront.address, r.storefront.nhood].filter(Boolean).join(' · ')}
                  {r.era === 2020 ? ' · 2020–23 records' : ''}
                </span>
                <span className="block mt-0.5 text-label text-paper-800 dark:text-paper-300">{repeatSummary(r.episodes)}</span>
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
      {!list ? (
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
              const note = episodeFeedNote(c.episode)
              const body = (
                <>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[0.8125rem] font-medium text-ink dark:text-paper-100 break-words">{c.name}</span>
                    <span className="font-mono text-micro tabular-nums text-paper-600 dark:text-paper-400 shrink-0">
                      {apDate(c.episode.start, nowYear)}
                    </span>
                  </span>
                  <span className={`block ${SUB}`}>
                    {c.storefront ? [c.storefront.address, c.storefront.nhood].filter(Boolean).join(' · ') : 'Not mapped'}
                  </span>
                  <span className="block mt-0.5 text-label text-paper-800 dark:text-paper-300">{episodeOutcome(c.episode, nowYear)}</span>
                  {note && <span className="block mt-0.5 text-micro italic text-paper-600 dark:text-paper-400">{note}</span>}
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
      {!rawRates ? (
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

      <DataNotes
        notes={[CLOSURE_LEDE_NOTE, REPEAT_NOTE, DURATION_NOTE, CLOSURE_LIST_NOTE, NEIGHBORHOOD_RATES_NOTE, CARD_NOTE, BREAK_NOTICE]}
      />
    </>
  )
}

function RateLine({ name, count, inspected, share, rateBy }: { name: string; count: number; inspected: number; share: number; rateBy: RateBy }) {
  return (
    <>
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-label text-ink dark:text-paper-200 break-words">{name}</span>
        <span className="font-mono text-label tabular-nums text-ink dark:text-paper-100 shrink-0">{pct(share)}</span>
      </span>
      <span className={`block ${SUB} tabular-nums`}>
        {count.toLocaleString('en-US')} of {inspected.toLocaleString('en-US')} places {rateBy === 'closed' ? 'closed' : 'given a yellow placard'}
      </span>
    </>
  )
}

// ── Owners ─────────────────────────────────────────────────────────────────

const CONTRACT_LABEL = new Map(CONTRACT_OPERATORS.map((c) => [c.id, c.label]))

function OwnersTab({ snapshot, owner, onOwner, selectedKey, onSelect }: StorylineRailProps & { snapshot: StorefrontSnapshot }) {
  const byKey = useMemo(() => storefrontIndex(snapshot), [snapshot])
  const { ranked, contract } = useMemo(() => ownerLists(snapshot), [snapshot])
  const franchises = useMemo(() => franchiseRows(snapshot), [snapshot])
  const shared = useMemo(() => sharedAddressRows(snapshot), [snapshot])
  const matchPct = useMemo(() => registryMatchPct(snapshot), [snapshot])
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
    const closures = ownerClosuresPhrase(ownerClosureTally(o, byKey))
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
          {city && <span className={`block ${SUB}`}>{city}</span>}
          {closures && <span className="block mt-0.5 text-label text-paper-800 dark:text-paper-300">{closures}</span>}
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
            Contract food-service companies · {contract.length}
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
                  <span className={`block ${SUB}`}>
                    {apCount(f.locations)} {f.locations === 1 ? 'location' : 'locations'} · {apCount(f.owners.length)} registered owners
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
                  <span className="block text-[0.8125rem] font-medium text-ink dark:text-paper-100 break-words">
                    {[a.address, mailingCityLabel(a.city)].filter(Boolean).join(', ')}
                  </span>
                  <span className="block mt-0.5 text-label text-paper-800 dark:text-paper-300">{sharedMailingSentence(a.companies.length)}</span>
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

      <DataNotes
        notes={[
          ownersNote(matchPct),
          OWNER_CLOSURES_NOTE,
          MAILING_CITY_NOTE,
          FRANCHISE_NOTE,
          sameMailingNote(groupEvidencePhrase(snapshot.groups)),
          MAILING_WITHHELD_NOTE,
        ]}
      />
    </>
  )
}
