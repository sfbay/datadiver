// StorefrontPanel — the storefront biography (spec §4.5 as amended by §11,
// Jesse's rulings of 2026-09-24). A top-right DetailPanelShell, teal-700
// glow, opened by `?at=<storefront key>` (Restaurants.tsx owns the param).
//
// Sections, in order:
//   1. Header — address, neighborhood, the latest reading. The ONLY part a
//      PNG export keeps; everything below carries data-export-ignore.
//   2. Placard ribbon (PlacardRibbon.tsx).
//   3. Who has run this storefront — every name, oldest first, with the
//      owner of record under each. Owner names are shown for EVERY owner,
//      persons included, exactly as the registry publishes them; the mailing
//      city is the plain city name (mailingCityLabel — no label, no state);
//      only company owners link to /business/owner/.
//   4. Closures since March 2020 — every episode, single closures included,
//      each with its outcome; the 2024+ ones recomputed live from the lane.
//   5. Inspections since 2024 — each row names its inspector (shown, never
//      ranked: nothing here sorts, filters or counts by inspector).
//   6. Same owner elsewhere — visible company owners' other storefronts.
//   7. Mailing address — the shared-address FACT when every owner there is a
//      company; the withheld line when a shared address listing this door
//      was withheld (snapshot.withheldSharedStorefronts), or when nothing is
//      published and the current owner is not a company.
//   8. Also at this mailing address — curated group CLAIMS only (may be none).
//   9. Data notes — the precision behind every simplified label, plus the
//      city's own inspection lookup.
//
// Long lists fold behind show-all turn-downs (the funder-card pattern), never
// paging. No `truncate` anywhere: exported text must survive the capture.

import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import DetailPanelShell from '@/components/ui/DetailPanelShell'
import type { Storefront, StorefrontSnapshot } from '@/lib/storefronts/types'
import { apDate } from '@/utils/apDate'
import PlacardRibbon from './PlacardRibbon'
import { normalizePlacard, PLACARD_COLOR, PLACARD_LABEL } from './placard'
import {
  apCount,
  apCountStart,
  BREAK_NOTICE,
  closureStory,
  DURATION_NOTE,
  episodeFeedNote,
  INSPECTOR_NOTE,
  MAILING_CITY_NOTE,
  MAILING_WITHHELD_LABEL,
  MAILING_WITHHELD_NOTE,
  mailingCityLabel,
  namesLede,
  OWNER_RETURNED_CHIP,
  ownerReturnedLede,
  SAME_OWNER_CHIP,
  sameMailingNote,
  scoreBadge,
  SEEN_ONCE,
  SHARED_WITHHELD_NOTE,
  sharedMailingSentence,
} from './restaurantPhrase'
import { familyLabel, parseViolationItems } from './violationFamilies'
import {
  businessOwnerHref,
  dedupeLane,
  displayBusinessName,
  DPH_LOOKUP_URL,
  evidenceKinds,
  groupsHere,
  INSPECTIONS_URL,
  latestReading,
  mailingLine,
  mailingWithheldHere,
  namesLedeInput,
  operatorSpan,
  ownerChips,
  ownerReturnedInput,
  ownersHere,
  ownerYears,
  panelEpisodes,
  REGISTRY_URL,
  sharedAddressesHere,
  statusLine,
  storefrontLabel,
  violationsRecorded,
  type InspectionRow,
  type PanelEpisode,
} from './storefrontBiography'

export type { InspectionRow } from './storefrontBiography'

/** teal-700 — the view's pigment (spec D7). */
const TEAL = '#2e5856'

const LINK =
  'underline decoration-dotted underline-offset-2 hover:text-teal-600 dark:hover:text-teal-400 transition-colors'

// ── small pieces ───────────────────────────────────────────────────────────

/** Rule-leading micro label: "── CLOSURES SINCE MARCH 2020". */
function SectionHead({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 mt-5 mb-1.5">
      <h3 className="flex items-center gap-2 text-nano font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
        <span aria-hidden className="inline-block h-px w-4 bg-current opacity-60" />
        {children}
      </h3>
      {aside}
    </div>
  )
}

/** The funder-card turn-down: first `limit` items in a list, then a
 *  "show all N ▾" button AFTER the list (never inside an <ol>/<ul>). */
function Folded<T>({
  items,
  limit,
  render,
  noun,
  ordered = false,
  className = '',
}: {
  items: readonly T[]
  limit: number
  render: (t: T, i: number) => ReactNode
  noun: string
  ordered?: boolean
  className?: string
}) {
  const [all, setAll] = useState(false)
  const folded = !all && items.length > limit
  const shown = folded ? items.slice(0, limit) : items
  const List = ordered ? 'ol' : 'ul'
  return (
    <>
      <List className={className}>{shown.map(render)}</List>
      {items.length > limit && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-1 text-nano font-mono uppercase tracking-widest text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
        >
          {all ? 'show fewer ▴' : `show all ${items.length} ${noun} ▾`}
        </button>
      )}
    </>
  )
}

function PlacardChip({ status }: { status: string | null | undefined }) {
  const p = normalizePlacard(status)
  if (!p) return <span className="text-nano font-mono text-slate-400 dark:text-slate-500">no placard recorded</span>
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-nano font-mono bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300">
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: PLACARD_COLOR[p] }} />
      {PLACARD_LABEL[p]}
    </span>
  )
}

function Muted({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`text-slate-500 dark:text-slate-400 ${className}`}>{children}</span>
}

function Shimmer({ className }: { className: string }) {
  return <div className={`rounded-md bg-slate-200/60 dark:bg-white/[0.06] skeleton ${className}`} />
}

/** "The city's text ▸" — the raw violation items, verbatim. */
function CityText({ items, notices }: { items: readonly string[]; notices: readonly string[] }) {
  if (items.length === 0 && notices.length === 0) return null
  return (
    <details className="mt-1 group">
      <summary className="text-nano font-mono uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 cursor-pointer select-none hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
        the city’s text
      </summary>
      <ul className="mt-1 space-y-1 text-micro font-serif text-slate-600 dark:text-slate-300 leading-snug">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {notices.length > 0 && (
        <details className="mt-1">
          <summary className="text-nano font-mono uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 cursor-pointer select-none hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
            closure notice
          </summary>
          {notices.map((t) => (
            <p key={t} className="mt-1 text-micro font-serif text-slate-600 dark:text-slate-300 leading-snug">
              {t}
            </p>
          ))}
        </details>
      )}
    </details>
  )
}

/** One inspection's violation text, split by the pinned splitter; the
 *  suspension notice folds on its own. */
function RowText({ codes }: { codes: string }) {
  const parsed = parseViolationItems(codes)
  const notice = (i: { families: string[] }) => i.families.includes('closure-notice')
  return <CityText items={parsed.filter((i) => !notice(i)).map((i) => i.raw)} notices={parsed.filter(notice).map((i) => i.raw)} />
}

// ── sections ───────────────────────────────────────────────────────────────

function Operators({ storefront }: { storefront: Storefront }) {
  const chips = useMemo(() => ownerChips(storefront.operators), [storefront])
  const lede = useMemo(() => {
    const ret = ownerReturnedInput(storefront)
    if (ret) return ownerReturnedLede(ret)
    const names = namesLedeInput(storefront)
    return names ? namesLede(names) : null
  }, [storefront])

  return (
    <>
      {lede && <p className="text-micro font-serif text-slate-700 dark:text-slate-200 leading-snug mb-2">{lede}</p>}
      <Folded
          ordered
          className="space-y-2"
          items={storefront.operators}
          limit={6}
          noun="names"
          render={(op, i) => {
            const owner = op.owner
            const href = businessOwnerHref(owner)
            const city = owner ? mailingCityLabel(owner.mailCity) : null
            const years = owner ? ownerYears(owner) : ''
            const chip = chips[i]
            return (
              <li key={`${op.name}|${op.firstDate}`} className="text-micro leading-snug">
                <div className="flex flex-wrap items-baseline gap-x-1.5">
                  <span
                    className={`font-display italic text-sm ${op.strict ? 'text-ink dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                  >
                    {displayBusinessName(op.name)}
                  </span>
                  <Muted className="font-mono text-nano tabular-nums">{operatorSpan(op)}</Muted>
                  {op.seenOnce && <Muted className="font-mono text-nano italic">{SEEN_ONCE}</Muted>}
                </div>
                <div className="pl-3 mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                  {owner ? (
                    <>
                      {href ? (
                        <Link to={href} className={`font-serif text-slate-700 dark:text-slate-200 ${LINK}`}>
                          {owner.name}
                        </Link>
                      ) : (
                        <span className="font-serif text-slate-700 dark:text-slate-200">{owner.name}</span>
                      )}
                      {city && <Muted>· {city}</Muted>}
                      {years && <Muted className="font-mono text-nano tabular-nums">· {years}</Muted>}
                      {chip && (
                        <span className="px-1.5 rounded-full text-nano font-mono bg-teal-700/10 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400">
                          {chip === 'same-owner' ? SAME_OWNER_CHIP : OWNER_RETURNED_CHIP}
                        </span>
                      )}
                    </>
                  ) : (
                    <Muted className="font-serif italic">No registered owner matched</Muted>
                  )}
                </div>
              </li>
            )
          }}
        />
    </>
  )
}

function EpisodeRow({ ep, nowYear }: { ep: PanelEpisode; nowYear: number }) {
  const note = episodeFeedNote(ep.episode)
  return (
    <li className="text-micro leading-snug">
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        {ep.name && <span className="font-display italic text-slate-700 dark:text-slate-200">{ep.name}</span>}
        <Muted className="font-mono text-nano">
          {ep.era === 2020 ? `2020–23 records · facility ${ep.permit}` : `permit ${ep.permit}`}
        </Muted>
      </div>
      <p className="font-serif text-slate-700 dark:text-slate-200 mt-0.5">{closureStory(ep.episode, nowYear)}</p>
      {note && <p className="text-nano font-mono text-slate-500 dark:text-slate-400 mt-0.5">{note}</p>}
      {ep.familyIds.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-1">
          {ep.familyIds.map((f) => (
            <span key={f} className="px-1.5 rounded-full text-nano font-mono bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300">
              {familyLabel(f)}
            </span>
          ))}
        </p>
      )}
      <CityText items={ep.items.map((i) => i.raw)} notices={ep.notices} />
    </li>
  )
}

function InspectionList({ rows, nowYear }: { rows: readonly InspectionRow[]; nowYear: number }) {
  const newest = useMemo(() => [...dedupeLane(rows)].reverse(), [rows])
  const names = new Set(newest.map((r) => displayBusinessName(r.dba)))
  if (newest.length === 0) {
    return <p className="text-micro font-serif italic text-slate-500 dark:text-slate-400">No inspections published since January 2024.</p>
  }
  return (
    <Folded
        ordered
        className="space-y-1.5"
        items={newest}
        limit={5}
        noun="inspections"
        render={(r, i) => {
          const n = violationsRecorded(r)
          return (
            <li key={`${r.inspection_date}|${r.permit_number}|${i}`} className="text-micro leading-snug border-b border-slate-100/60 dark:border-white/[0.04] pb-1.5">
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">{apDate((r.inspection_date ?? '').slice(0, 10), nowYear)}</span>
                <PlacardChip status={r.facility_rating_status} />
                {names.size > 1 && r.dba && <span className="font-display italic text-slate-700 dark:text-slate-200">{displayBusinessName(r.dba)}</span>}
                {r.inspection_type && <Muted>· {r.inspection_type}</Muted>}
              </div>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-slate-500 dark:text-slate-400">
                {n !== null && <span>{n === 0 ? 'No violations recorded' : `${apCountStart(n)} ${n === 1 ? 'violation' : 'violations'} recorded`}</span>}
                {r.inspector && <span>· inspected by {r.inspector}</span>}
              </div>
              {r.violation_codes && <RowText codes={r.violation_codes} />}
            </li>
          )
        }}
      />
  )
}

function EarlierRecords({ storefront, nowYear }: { storefront: Storefront; nowYear: number }) {
  const scores = storefront.lanes.scores2016
  const placards = storefront.lanes.placards2020
  if (scores.length + placards.length === 0) return null
  const rows = [
    ...scores.map((s) => ({ date: s.date, name: s.name, what: <span className="font-mono tabular-nums">{scoreBadge(s.score)}</span>, type: s.type })),
    ...placards.map((p) => ({ date: p.date, name: p.name, what: <PlacardChip status={p.status} />, type: p.type })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return (
    <details className="mt-2">
      <summary className="text-nano font-mono uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 cursor-pointer select-none hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
        {`earlier records, 2016–23 · ${rows.length}`}
      </summary>
      <ol className="mt-1 space-y-0.5">
        {rows.map((r, i) => (
          <li key={`${r.date}|${i}`} className="flex flex-wrap items-baseline gap-x-1.5 text-micro text-slate-600 dark:text-slate-300">
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">{apDate(r.date, nowYear)}</span>
            {r.what}
            <span className="font-display italic">{displayBusinessName(r.name)}</span>
            <Muted>· {r.type}</Muted>
          </li>
        ))}
      </ol>
    </details>
  )
}

function StorefrontLinks({
  keys,
  index,
  onFlyTo,
  exclude,
}: {
  keys: readonly string[]
  index: ReadonlyMap<string, Storefront>
  onFlyTo: (key: string) => void
  exclude: string
}) {
  const others = keys.filter((k) => k !== exclude)
  if (others.length === 0) return null
  return (
    <Folded
        className="mt-1 space-y-0.5"
        items={others}
        limit={6}
        noun="storefronts"
        render={(k) => {
          const s = storefrontLabel(index, k)
          const body = (
            <>
              <span className="font-serif">{s.address}</span>
              {s.name && <Muted className="font-display italic"> · {s.name}</Muted>}
            </>
          )
          return (
            <li key={k} className="text-micro text-slate-700 dark:text-slate-200">
              {s.known ? (
                <button type="button" onClick={() => onFlyTo(k)} className={`text-left ${LINK}`}>
                  {body}
                </button>
              ) : (
                body
              )}
            </li>
          )
        }}
      />
  )
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-micro font-serif text-slate-600 dark:text-slate-300 leading-snug mt-1.5">{children}</p>
}

// ── the panel ──────────────────────────────────────────────────────────────

export interface StorefrontPanelProps {
  storefront: Storefront
  /** Q4's rows for this storefront's permits; null while loading or on failure. */
  lane: InspectionRow[] | null
  laneLoading: boolean
  /** The snapshot's date (generator run). */
  asOf: string
  onClose(): void
  onFlyTo(key: string): void
  snapshot: StorefrontSnapshot
  /** Extra selectors treated as inside the panel for outside-click dismiss
   *  (e.g. the storylines rail, which re-targets `?at=`). */
  insideSelectors?: string[]
}

export default function StorefrontPanel({
  storefront,
  lane,
  laneLoading,
  asOf,
  onClose,
  onFlyTo,
  snapshot,
  insideSelectors,
}: StorefrontPanelProps) {
  const nowYear = Number(asOf.slice(0, 4))
  const key = storefront.key
  const hasPermits = storefront.permits.length > 0
  // A storefront with no 2024+ permit has an empty live lane by definition.
  const effectiveLane = useMemo(() => (hasPermits ? lane : []), [hasPermits, lane])
  const laneFailed = hasPermits && !laneLoading && lane === null

  const index = useMemo(() => new Map(snapshot.storefronts.map((s) => [s.key, s] as const)), [snapshot])
  const status = useMemo(
    () => statusLine(latestReading(storefront, laneLoading ? null : effectiveLane), nowYear),
    [storefront, effectiveLane, laneLoading, nowYear],
  )
  const closures = useMemo(
    () => panelEpisodes(storefront, laneLoading ? null : effectiveLane),
    [storefront, effectiveLane, laneLoading],
  )
  const owners = useMemo(() => ownersHere(snapshot, key), [snapshot, key])
  const shared = useMemo(() => sharedAddressesHere(snapshot, key), [snapshot, key])
  const groups = useMemo(() => groupsHere(snapshot, key), [snapshot, key])
  const withheld = mailingWithheldHere(snapshot, storefront)

  return (
    <DetailPanelShell
      open
      onClose={onClose}
      isLoading={false}
      widthClass="w-[28rem]"
      mobileCompact
      glowColor={TEAL}
      spinnerClass="border-teal-500"
      buildShareUrl={() => window.location.href}
      shareAccentClass="text-teal-600"
      additionalInsideSelectors={insideSelectors}
    >
      <article id="storefront-panel" data-storefront={key}>
        {/* 1 · Header — the only part a PNG export keeps. */}
        <header className="pr-14">
          <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1">Storefront</p>
          <h2 className="font-display text-xl leading-tight text-ink dark:text-white">{storefront.address}</h2>
          {storefront.nhood && <p className="text-micro font-mono text-slate-500 dark:text-slate-400 mt-0.5">{storefront.nhood}</p>}
          {laneLoading && hasPermits ? (
            <Shimmer className="h-3 w-4/5 mt-2" />
          ) : status ? (
            <p className="text-micro font-serif text-slate-700 dark:text-slate-200 mt-1.5 leading-snug">{status}</p>
          ) : null}
        </header>

        <div data-export-ignore>
          {/* 2 · Placard ribbon */}
          <SectionHead>Names, placards and owners</SectionHead>
          <PlacardRibbon storefront={storefront} lane={effectiveLane} asOf={asOf} />

          {/* 3 · Who has run this storefront */}
          <SectionHead>Who has run this storefront</SectionHead>
          <Operators storefront={storefront} />

          {/* 4 · Closures, 2020 on */}
          <SectionHead
            aside={
              closures.updatedSinceAsOf ? (
                <span className="text-nano font-mono text-teal-700 dark:text-teal-400">updated since {apDate(asOf, nowYear)}</span>
              ) : laneLoading && hasPermits ? (
                <span className="text-nano font-mono text-slate-400 dark:text-slate-500">checking the latest records…</span>
              ) : null
            }
          >
            Closures since March 2020
          </SectionHead>
          {closures.episodes.length === 0 ? (
            <p className="text-micro font-serif italic text-slate-500 dark:text-slate-400">No closures published since March 2020.</p>
          ) : (
            <Folded
                ordered
                className="space-y-2.5"
                items={closures.episodes}
                limit={4}
                noun="closures"
                render={(ep) => <EpisodeRow key={`${ep.permit}|${ep.episode.start}`} ep={ep} nowYear={nowYear} />}
              />
          )}

          {/* 5 · Inspections since 2024 (live) */}
          <SectionHead>Inspections since 2024</SectionHead>
          {laneLoading && hasPermits ? (
            <div className="space-y-1.5">
              <Shimmer className="h-3 w-full" />
              <Shimmer className="h-3 w-5/6" />
              <Shimmer className="h-3 w-2/3" />
            </div>
          ) : laneFailed ? (
            <p className="text-micro font-mono text-slate-500 dark:text-slate-400">
              The 2024-on inspections did not load. <a href={INSPECTIONS_URL} target="_blank" rel="noopener noreferrer" className={LINK}>See them on data.sf.gov</a>
            </p>
          ) : (
            <InspectionList rows={effectiveLane ?? []} nowYear={nowYear} />
          )}
          <EarlierRecords storefront={storefront} nowYear={nowYear} />

          {/* 6 · Same owner elsewhere */}
          {owners.length > 0 && (
            <>
              <SectionHead>Same owner elsewhere</SectionHead>
              {owners.map((o) => {
                const href = businessOwnerHref(o)
                const city = mailingCityLabel(o.mailCity)
                const others = o.storefronts.filter((k) => k !== key).length
                return (
                  <div key={o.name} className="mb-2">
                    <p className="text-micro leading-snug">
                      {href ? (
                        <Link to={href} className={`font-serif text-slate-700 dark:text-slate-200 ${LINK}`}>
                          {o.name}
                        </Link>
                      ) : (
                        <span className="font-serif text-slate-700 dark:text-slate-200">{o.name}</span>
                      )}
                      {city && <Muted> · {city}</Muted>}
                    </p>
                    <p className="text-micro font-serif text-slate-600 dark:text-slate-300">
                      Registered to the same company at {apCount(others)} other {others === 1 ? 'storefront' : 'storefronts'}
                      {o.contract ? ', as a contract food-service company' : ''}.
                    </p>
                    <StorefrontLinks keys={o.storefronts} index={index} onFlyTo={onFlyTo} exclude={key} />
                  </div>
                )
              })}
            </>
          )}

          {/* 7 · Mailing address — the FACT, or the withheld line. */}
          {shared.length > 0 && (
            <>
              <SectionHead>Mailing address</SectionHead>
              {shared.map((a) => (
                <div key={a.key} className="mb-2">
                  <p className="text-micro font-mono text-slate-700 dark:text-slate-200">{mailingLine(a)}</p>
                  <p className="text-micro font-serif text-slate-700 dark:text-slate-200 mt-0.5">{sharedMailingSentence(a.companies.length)}</p>
                  <p className="text-micro font-serif text-slate-600 dark:text-slate-300 mt-0.5">{a.companies.join(' · ')}</p>
                  {a.foodBuilding && (
                    <p className="text-nano font-mono text-slate-500 dark:text-slate-400 mt-0.5">This address is itself a building with food businesses in it.</p>
                  )}
                  <StorefrontLinks keys={a.storefronts} index={index} onFlyTo={onFlyTo} exclude={key} />
                </div>
              ))}
            </>
          )}
          {withheld && (
            <>
              {shared.length === 0 && <SectionHead>Mailing address</SectionHead>}
              <p className="text-micro font-mono text-slate-500 dark:text-slate-400">{MAILING_WITHHELD_LABEL}</p>
            </>
          )}

          {/* 8 · Also at this mailing address — curated claims only. */}
          {groups.length > 0 && (
            <>
              <SectionHead>Also at this mailing address</SectionHead>
              {groups.map((g) => (
                <div key={g.id} className="mb-2">
                  <p className="font-display italic text-sm text-slate-700 dark:text-slate-200">{g.label}</p>
                  <StorefrontLinks keys={g.storefronts} index={index} onFlyTo={onFlyTo} exclude={key} />
                  <ul className="mt-1 space-y-0.5">
                    {g.evidence.map((e) => (
                      <li key={`${e.kind}|${e.url}`} className="text-nano font-mono text-slate-500 dark:text-slate-400">
                        <a href={e.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                          {e.detail}
                        </a>{' '}
                        · checked {apDate(e.checked, nowYear)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}

          {/* 9 · Data notes + the city's own lookup. */}
          <details className="mt-5">
            <summary className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 cursor-pointer select-none hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
              Data notes
            </summary>
            <Note>{MAILING_CITY_NOTE}</Note>
            <Note>
              {MAILING_WITHHELD_NOTE}{' '}
              <a href={REGISTRY_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
                Open the business registry
              </a>
              .
            </Note>
            {withheld === 'shared' && (
              <Note>
                {SHARED_WITHHELD_NOTE}{' '}
                <a href={REGISTRY_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
                  Open the business registry
                </a>
                .
              </Note>
            )}
            {(shared.length > 0 || groups.length > 0) && (
              <Note>{sameMailingNote(groups.length > 0 ? groups.map(evidenceKinds).join('; ') : undefined)}</Note>
            )}
            <Note>{DURATION_NOTE}</Note>
            <Note>{INSPECTOR_NOTE}</Note>
            <Note>{BREAK_NOTICE}</Note>
            <Note>
              Names come from inspection records in three city datasets, each published in its own vocabulary: scores
              for 2016–19, placards since 2020. The city published nothing from late November 2019 to early March 2020
              or from early August through December 2023, so a business that opened and closed inside those gaps is missing.
              Owners are the city Treasurer’s registrations, matched to this address by name and dates.
            </Note>
          </details>

          <p className="mt-4 text-micro font-mono">
            <a href={DPH_LOOKUP_URL} target="_blank" rel="noopener noreferrer" className={`text-teal-700 dark:text-teal-400 ${LINK}`}>
              See the city’s inspection reports ↗
            </a>
          </p>
        </div>
      </article>
    </DetailPanelShell>
  )
}
