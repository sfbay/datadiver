// Funder card masthead (spec §4A). Name + org chip + muted city/employer
// line come off the `variants` section; the common-name guard + ZIP
// narrowing chips live here too (spec §2). All display formatting for the
// name goes through `displayName()` (funderKey.ts) — the one place that
// turns the folded UPPER-CASE identity key into a readable name.
import { displayName } from '@/lib/funders/funderKey'
import type { FunderProfile } from '@/lib/funders/types'

const ORG_CHIP: Record<string, string> = { COM: 'committee', OTH: 'business', PTY: 'party' }

export default function FunderMasthead({ profile, failed, onSetZip, fzip }: {
  profile: FunderProfile | null
  failed: string[]
  onSetZip: (zip: string | null) => void
  fzip: string | null
}) {
  if (!profile) return null

  const bar = profile.key.indexOf('|')
  const isPerson = bar >= 0 && profile.key.slice(0, bar) !== ''
  const name = displayName(profile.key)

  // "Top" variant by dollars — the query has no $order, so the ranking is
  // done here rather than assumed off arrival order.
  const topVariant = [...profile.variants].sort((a, b) => b.total - a.total)[0]
  const orgChip = !isPerson
    ? (topVariant?.entityCode && ORG_CHIP[topVariant.entityCode]) || 'organization'
    : undefined

  const mutedParts = [
    profile.primaryCity,
    profile.topEmployers.length > 0 ? profile.topEmployers.join(', ') : undefined,
  ].filter(Boolean)

  const variantsFailed = failed.includes('variants')

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-display text-xl text-ink dark:text-white leading-tight">{name}</h2>
        {orgChip && (
          <span className="px-1.5 py-0.5 rounded text-nano font-mono uppercase tracking-widest bg-plum-500/10 text-plum-500">
            {orgChip}
          </span>
        )}
      </div>

      {!variantsFailed && mutedParts.length > 0 && (
        <p className="text-micro font-mono text-slate-400 dark:text-slate-500 mt-0.5">
          {mutedParts.join(' · ')}
        </p>
      )}

      {profile.guard.tripped && (
        <div className="mt-2">
          <p className="text-micro font-mono text-ochre-500">
            {/* I3: `variants` groups on 8 columns incl. employer/occupation, so the SAME
                city+ZIP address repeats across several rows whenever a donor reports a
                different employer over time — `variants.length` overstated the address
                count. `guard.addresses` is the distinct (city, ZIP) pair count instead. */}
            This name appears at {profile.guard.addresses} addresses in {profile.guard.cities.length} cities and may be more than one person.
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {profile.guard.zips.map((zip) => {
              const active = fzip === zip
              return (
                <button
                  key={zip}
                  type="button"
                  onClick={() => onSetZip(active ? null : zip)}
                  className={`px-1.5 py-0.5 rounded text-nano font-mono transition-colors ${
                    active
                      ? 'bg-plum-500/20 text-plum-500'
                      : 'bg-slate-200/60 dark:bg-white/[0.06] text-slate-500 hover:text-plum-500'
                  }`}
                >
                  {zip}
                  {active ? ' ×' : ''}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {fzip && !profile.guard.tripped && (
        <p className="text-micro font-mono text-slate-400 dark:text-slate-500 mt-1">
          <button type="button" onClick={() => onSetZip(null)} className="hover:text-plum-500 dark:hover:text-plum-400 transition-colors">
            showing ZIP {fzip} only ×
          </button>
        </p>
      )}
    </div>
  )
}
