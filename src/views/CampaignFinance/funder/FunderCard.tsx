// The funder "baseball card" — spec §4. A top-right DetailPanelShell over
// the committee view (never a column takeover), mounted by CampaignFinance
// only when `?funder=` parses and the active city's builders carry a
// `funder` block (SF; Oakland's is null and the card never mounts there).
import { useMemo, useState } from 'react'
import DetailPanelShell from '@/components/ui/DetailPanelShell'
import ExportButton from '@/components/export/ExportButton'
import { useFunderProfile } from '@/hooks/useFunderProfile'
import { displayName } from '@/lib/funders/funderKey'
import { parseStance, stanceChip } from '@/lib/funders/stance'
import type { FunderProfile, FunderRecipient } from '@/lib/funders/types'
import FunderList, { apDay, type Funder } from '@/components/charts/FunderList'
import { formatCurrency } from '@/components/charts/TopRecipientsChart'
import { toSentenceCase } from '@/utils/format'
import type { FunderBuilders } from '../fppcDialect'
import FunderMasthead from './FunderMasthead'
import FunderTiles from './FunderTiles'
import YearStrip from './YearStrip'
import FiledAs from './FiledAs'
import GiftList from './GiftList'
import FunderFooter from './FunderFooter'

/** One recipient row's turn-down line: "N gift(s) · first–last · $x by notice"
 *  — the date span is omitted when either end is missing, and the notice
 *  clause only when `pending` is nonzero. Shared by both the full
 *  (byYear-derived) and year-filtered (giftList-derived) recipient lists so
 *  the two rendering paths can't drift in wording. */
function recipientDetail(gifts: number, firstDate: string | undefined, lastDate: string | undefined, pending: number): string {
  const parts = [`${gifts} gift${gifts === 1 ? '' : 's'}`]
  const first = apDay(firstDate)
  const last = apDay(lastDate)
  if (first && last) parts.push(`${first}–${last}`)
  if (pending > 0) parts.push(`${formatCurrency(pending)} by notice`)
  return parts.join(' · ')
}

function toFunder(r: { filerNid: string; filerName: string; stance: FunderRecipient['stance']; gifts: number; total: number; firstDate?: string; lastDate?: string; pending: number }): Funder {
  return {
    key: r.filerNid,
    name: toSentenceCase(r.filerName),
    chip: stanceChip(r.stance),
    amount: r.total,
    detail: recipientDetail(r.gifts, r.firstDate, r.lastDate, r.pending),
  }
}

/** Recipients narrowed to one calendar year (spec §4D year-filter rule) —
 *  derived from the itemized gift rows (cash + in-kind ONLY, never
 *  `notice`: a pending notice isn't a gift yet) rather than re-querying, so
 *  it works offline of the server-aggregate `recipients`/`byYear` builders.
 *  Stance comes from the full (unfiltered) `recipients` list keyed by
 *  filer_nid; a filer that somehow has gift rows but no recipients row
 *  (shouldn't happen — recipients is a superset) falls back to parsing its
 *  own name with no filer_type, which reads as `pac` worst case. Pending
 *  notices aren't year-scoped here — the year-filtered total is deliberately
 *  gift-only, so `pending` stays 0 on these rows. */
function recipientsForYear(profile: FunderProfile, year: number): Funder[] {
  const stanceByFiler = new Map(profile.recipients.map((r) => [r.filerNid, r.stance] as const))
  const agg = new Map<string, { filerNid: string; filerName: string; total: number; gifts: number; firstDate?: string; lastDate?: string }>()
  for (const g of profile.giftList) {
    if (g.kind === 'notice' || g.year !== year) continue
    const entry = agg.get(g.filerNid) ?? { filerNid: g.filerNid, filerName: g.filerName, total: 0, gifts: 0 }
    entry.total += g.amount
    entry.gifts += 1
    const d = g.date.slice(0, 10)
    if (d) {
      if (!entry.firstDate || d < entry.firstDate) entry.firstDate = d
      if (!entry.lastDate || d > entry.lastDate) entry.lastDate = d
    }
    agg.set(g.filerNid, entry)
  }
  return Array.from(agg.values())
    .sort((a, b) => b.total - a.total)
    .map((r) =>
      toFunder({
        ...r,
        stance: stanceByFiler.get(r.filerNid) ?? parseStance(r.filerName, undefined),
        pending: 0,
      })
    )
}

export default function FunderCard({ keyParam, fzip, builders, onClose, onSetZip }: {
  keyParam: string
  fzip: string | null
  builders: FunderBuilders
  onClose: () => void
  onSetZip: (zip: string | null) => void
}) {
  const { profile, failed, isLoading, retry } = useFunderProfile(keyParam, fzip, builders)
  // Owned here (not in YearStrip) so Task 7's Recipients/GiftList sections
  // can narrow to the same selection.
  const [year, setYear] = useState<number | null>(null)

  // profile.gifts is entirely byYear-derived — a failed byYear also reads
  // gifts === 0, which is an ARTIFACT of the failure, not a fact. The empty
  // line must never render off a section that didn't load; the byYear-retry
  // line below takes its place instead.
  const isEmpty = !!profile && !isLoading && !failed.includes('byYear') && profile.gifts === 0

  // A per-year Recipients breakdown is derived client-side from `giftList`
  // (spec §4D) — that's unavailable both when the list hit the 5K cap (the
  // rows on hand aren't the whole year) and when the `gifts` fetch itself
  // failed (no rows to derive from at all). Either way the full
  // (byYear-derived) recipients list stands in, with a note.
  const giftsFailed = failed.includes('gifts')
  const yearFilterUnavailable = !!profile && (profile.capped || giftsFailed)
  const recipientFunders = useMemo<Funder[]>(() => {
    if (!profile) return []
    if (year !== null && !yearFilterUnavailable) return recipientsForYear(profile, year)
    return profile.recipients.map((r) => toFunder(r))
  }, [profile, year, yearFilterUnavailable])

  return (
    <DetailPanelShell
      open
      onClose={onClose}
      isLoading={isLoading && !profile}
      widthClass="w-[26rem]"
      mobileCompact
      glowColor="#8b6282"
      spinnerClass="border-plum-400"
      buildShareUrl={() => window.location.href}
    >
      <div id="funder-card" data-year={year ?? ''}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0 flex-1">
            <FunderMasthead profile={profile} failed={failed} onSetZip={onSetZip} fzip={fzip} />
          </div>
          <ExportButton targetSelector="#funder-card" filename={displayName(keyParam)} />
        </div>

        {failed.includes('variants') && (
          <p className="text-micro font-mono text-slate-400 dark:text-slate-500 mt-1">
            Filed-as details did not load —{' '}
            <button
              type="button"
              onClick={() => retry('variants')}
              className="underline decoration-dotted underline-offset-2 hover:text-plum-500 dark:hover:text-plum-400 transition-colors"
            >
              retry
            </button>
          </p>
        )}

        {failed.includes('byYear') && (
          <p className="text-micro font-mono text-slate-400 dark:text-slate-500 mt-1">
            Totals did not load —{' '}
            <button
              type="button"
              onClick={() => retry('byYear')}
              className="underline decoration-dotted underline-offset-2 hover:text-plum-500 dark:hover:text-plum-400 transition-colors"
            >
              retry
            </button>
          </p>
        )}

        {isEmpty && (
          <p className="text-micro font-serif italic text-slate-500 dark:text-slate-400 mt-3">
            No itemized gifts found under this name — {displayName(profile!.key)}
          </p>
        )}

        {profile && <FunderTiles profile={profile} failed={failed} retry={retry} />}

        {profile && !isEmpty && !failed.includes('byYear') && (
          <>
            <YearStrip years={profile.byYear} selected={year} onSelect={setYear} />
            {year !== null && (
              <button
                type="button"
                onClick={() => setYear(null)}
                className="mt-1 text-nano font-mono uppercase tracking-widest text-slate-400 hover:text-plum-500 dark:hover:text-plum-400 transition-colors"
              >
                all years ×
              </button>
            )}
          </>
        )}

        {profile && !isEmpty && (
          <>
            {failed.includes('recipients') ? (
              <p className="text-micro font-mono text-slate-400 dark:text-slate-500 mt-3">
                Recipients did not load —{' '}
                <button
                  type="button"
                  onClick={() => retry('recipients')}
                  className="underline decoration-dotted underline-offset-2 hover:text-plum-500 dark:hover:text-plum-400 transition-colors"
                >
                  retry
                </button>
              </p>
            ) : (
              <>
                <FunderList label="Recipients" color="#8b6282" funders={recipientFunders} />
                {year !== null && yearFilterUnavailable && (
                  <p className="text-nano font-mono text-slate-400 dark:text-slate-500 mt-1">
                    year filter unavailable — gift list {profile.capped ? 'capped' : 'did not load'}
                  </p>
                )}
                <p className="text-nano font-mono text-slate-400 dark:text-slate-500 mt-1">
                  stance read from the committee's registered name
                </p>
              </>
            )}

            <FiledAs variants={profile.variants} />

            {failed.includes('notices') && (
              <p className="text-micro font-mono text-slate-400 dark:text-slate-500 mt-3">
                Late-contribution notices did not load — pending amounts unknown —{' '}
                <button
                  type="button"
                  onClick={() => retry('notices')}
                  className="underline decoration-dotted underline-offset-2 hover:text-plum-500 dark:hover:text-plum-400 transition-colors"
                >
                  retry
                </button>
              </p>
            )}

            {giftsFailed ? (
              <p className="text-micro font-mono text-slate-400 dark:text-slate-500 mt-1">
                Gift list did not load —{' '}
                <button
                  type="button"
                  onClick={() => retry('gifts')}
                  className="underline decoration-dotted underline-offset-2 hover:text-plum-500 dark:hover:text-plum-400 transition-colors"
                >
                  retry
                </button>
              </p>
            ) : (
              <GiftList gifts={profile.giftList} capped={profile.capped} year={year} />
            )}

            <FunderFooter />
          </>
        )}
      </div>
    </DetailPanelShell>
  )
}
