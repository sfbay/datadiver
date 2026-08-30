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

export default function FunderTiles({ profile, failed }: { profile: FunderProfile; failed: string[] }) {
  const hasGifts = profile.gifts > 0
  const showNotice = profile.pending.count > 0
  if (!hasGifts && !showNotice) return null

  const noticeTile = showNotice ? (
    <StatCard
      label="By Notice"
      value={`+${formatCurrency(profile.pending.total)}`}
      color={PLUM}
      subtitle="not yet on a statement"
    />
  ) : null

  // Zero itemized gifts but a pending notice exists — only the notice tile
  // earned its place (the card's empty-state line, rendered by FunderCard,
  // carries the rest of the message).
  if (!hasGifts) {
    return <div className="grid grid-cols-2 gap-2 mt-3">{noticeTile}</div>
  }

  const byYearFailed = failed.includes('byYear')
  const recipientsFailed = failed.includes('recipients')

  const totalSub = byYearFailed
    ? undefined
    : profile.inKind > 0
      ? `${formatCurrency(profile.cash)} cash + ${formatCurrency(profile.inKind)} in-kind`
      : `${formatCurrency(profile.cash)} cash`

  const medianSub = profile.median != null
    ? `median ${formatCurrency(profile.median)}`
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
