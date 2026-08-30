// Funder card big numbers (spec §4B). Six StatCard tiles — 3+2 grid, plus
// BY NOTICE only when a pending (unmatched) notice exists. TOTAL/GIFTS/
// AVERAGE/SPAN read off the server-aggregate `byYear` builder — never the
// capped `gifts` rows — so they stay correct even past the 5,000-row cap;
// only the median (AVERAGE's subtitle) is capped-list-derived and disclosed
// as such. A tile whose source section failed to load reads "—" rather than
// a fabricated zero.
import StatCard from '@/components/ui/StatCard'
import { formatCurrency } from '@/components/charts/TopRecipientsChart'
import type { FunderProfile } from '@/lib/funders/types'

const PLUM = '#8b6282'

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export default function FunderTiles({ profile, failed, retrying = [], retry }: {
  profile: FunderProfile
  failed: string[]
  /** Sections currently re-fetching — disables the BY NOTICE tile's own
   *  retry affordance the same way FunderCard's RetryLine does (I1). */
  retrying?: string[]
  /** Per-section retry — only 'notices' is wired here (the BY NOTICE tile's
   *  own failure affordance); byYear/variants retries live on FunderCard. */
  retry?: (section: 'notices') => void
}) {
  const byYearFailed = failed.includes('byYear')
  const recipientsFailed = failed.includes('recipients')
  const giftsFailed = failed.includes('gifts')
  const noticesFailed = failed.includes('notices')
  const noticesRetrying = retrying.includes('notices')

  // I2: a failed `gifts` fetch (or the profile's own `pending.unknown` flag —
  // funderStats sets it for the identical reason) leaves matchNotices with no
  // gift rows to compare against, so pending is genuinely UNKNOWN rather than
  // zero. Read it the same way `noticesFailed` is read below — never as "no
  // pending", which would silently hide notices that may still be outstanding.
  const pendingUnknown = profile.pending.unknown === true || giftsFailed

  const hasGifts = profile.gifts > 0
  // A failed notices fetch is indistinguishable from zero pending inside
  // `buildFunderProfile` (both collapse to pending.count === 0) — surface it
  // here instead of letting the tile silently vanish. Same for a failed
  // `gifts` fetch: buildFunderProfile can't tell "no pending" from "unknown"
  // either, so the tile must render even when profile.pending.count is 0.
  const showNotice = profile.pending.count > 0 || noticesFailed || pendingUnknown
  // Only collapse to "no tiles" when byYear actually LOADED and confirmed
  // zero gifts — a failed byYear also reads profile.gifts === 0, but that's
  // an artifact of the failure, not a fact, so it must not suppress the
  // other tiles (which show their own "—" below).
  if (!byYearFailed && !hasGifts && !showNotice) return null

  const noticeSubtitle = noticesFailed
    ? (noticesRetrying ? 'notices retrying…' : 'notices did not load — retry')
    : pendingUnknown
      ? 'pending unknown — gift list did not load'
      : 'not yet on a statement'

  const noticeTile = showNotice ? (
    <StatCard
      label="By Notice"
      value={noticesFailed || pendingUnknown ? '—' : `+${formatCurrency(profile.pending.total)}`}
      color={PLUM}
      subtitle={noticeSubtitle}
      subtitleAction={noticesFailed && !noticesRetrying && retry ? () => retry('notices') : undefined}
    />
  ) : null

  // Zero itemized gifts (byYear loaded and confirmed it) but a pending
  // notice exists — only the notice tile earned its place (the card's
  // empty-state line, rendered by FunderCard, carries the rest of the
  // message).
  if (!byYearFailed && !hasGifts) {
    return <div className="grid grid-cols-2 gap-2 mt-3">{noticeTile}</div>
  }

  const totalSub = byYearFailed
    ? undefined
    : profile.inKind > 0
      ? `${formatCurrency(profile.cash)} cash + ${formatCurrency(profile.inKind)} in-kind`
      : `${formatCurrency(profile.cash)} cash`

  const medianSub = profile.median != null
    ? `median ${formatCurrency(profile.median)}`
    : giftsFailed
      ? 'median n/a (gifts did not load)'
      : 'median n/a (list capped)'

  const spanValue = byYearFailed || profile.firstYear == null
    ? '—'
    : `${profile.firstYear}–${profile.lastYear}`
  const spanSub = byYearFailed ? undefined : plural(profile.activeYears, 'active year')

  const rc = profile.recipientCounts
  const recipientsSub = recipientsFailed
    ? undefined
    : `${plural(rc.candidate, 'candidate')} · ${plural(rc.measure, 'measure')} · ${plural(rc.pac, 'PAC')}`

  return (
    <div className="mt-3">
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="Total"
          value={byYearFailed ? '—' : formatCurrency(profile.total)}
          color={PLUM}
          subtitle={totalSub}
        />
        <StatCard
          label="Gifts"
          value={byYearFailed ? '—' : profile.gifts.toLocaleString()}
          color={PLUM}
        />
        <StatCard
          label="Average"
          value={byYearFailed ? '—' : profile.average != null ? formatCurrency(profile.average) : '—'}
          color={PLUM}
          subtitle={medianSub}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <StatCard label="Span" value={spanValue} color={PLUM} subtitle={spanSub} />
        <StatCard
          label="Recipients"
          value={recipientsFailed ? '—' : profile.recipients.length.toLocaleString()}
          color={PLUM}
          subtitle={recipientsSub}
        />
        {noticeTile}
      </div>
      {profile.capped && (
        <p className="text-nano font-mono text-slate-400 dark:text-slate-500 mt-1.5">
          gift list capped at 5,000 — totals are server sums
        </p>
      )}
    </div>
  )
}
