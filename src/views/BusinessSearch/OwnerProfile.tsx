/** OwnerProfile — Level 3b dossier at /business/owner/:name.
 *
 *  Aggregates by exact ownership_name (free-text). Renders a disambiguation
 *  banner the spec requires, BAN-cluster summary so the user can see how
 *  many distinct businesses this owner runs, sector spread, and a list
 *  of every location with deep links to authoritative registries via
 *  ExternalResourcesCard (entity & ownership sections only — no address-
 *  keyed property/maps links since "owner" isn't tied to one address).
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { fetchDataset } from '@/api/client'
import type { BusinessLocationRecord } from '@/types/datasets'
import { naicsSector } from '@/utils/naicsSector'
import { Skeleton } from '@/components/ui/Skeleton'
import ExternalResourcesCard from './components/ExternalResourcesCard'

export default function OwnerProfile() {
  const { name } = useParams<{ name: string }>()
  const decoded = name ? decodeURIComponent(name) : ''
  const navigate = useNavigate()
  const [locations, setLocations] = useState<BusinessLocationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!decoded) return
    let cancelled = false
    setLoading(true)
    fetchDataset<BusinessLocationRecord>('businessLocations', {
      $where: `ownership_name = '${decoded.replace(/'/g, "''")}'`,
      $order: 'dba_start_date ASC',
      $limit: 500,
    })
      .then((rows) => { if (!cancelled) setLocations(rows) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [decoded])

  // Group by BAN (certificate_number) — each BAN is one business under this owner.
  const banClusters = useMemo(() => {
    const map = new Map<string, BusinessLocationRecord[]>()
    for (const l of locations) {
      const ban = l.certificate_number || `__no-ban__${l.uniqueid}`
      const arr = map.get(ban) || []
      arr.push(l)
      map.set(ban, arr)
    }
    return Array.from(map.entries())
      .map(([ban, locs]) => ({
        ban: ban.startsWith('__no-ban__') ? null : ban,
        // Most-frequent dba_name as the cluster's primary
        primaryDba: mostCommon(locs.map((l) => l.dba_name).filter(Boolean) as string[]) || locs[0]?.dba_name || null,
        locations: locs,
      }))
      .sort((a, b) => b.locations.length - a.locations.length)
  }, [locations])

  const sectorMix = useMemo(() => {
    const map = new Map<string, number>()
    for (const l of locations) {
      const s = naicsSector(l.self_reported_naics_code)
      map.set(s, (map.get(s) || 0) + 1)
    }
    return Array.from(map.entries())
      .map(([sector, count]) => ({ sector, count }))
      .sort((a, b) => b.count - a.count)
  }, [locations])

  const distinctBANs = banClusters.filter((c) => c.ban).length

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="flex-shrink-0 px-6 py-3 border-b border-slate-200/50 dark:border-white/[0.04]">
        <button
          onClick={() => navigate(-1)}
          className="text-micro font-mono text-moss-500 hover:text-moss-400 transition-colors mb-2"
        >
          ← Back
        </button>
        {loading && <Skeleton className="h-6 w-1/2" />}
        {error && <p className="text-sm text-brick-400">{error}</p>}
        {!loading && decoded && (
          <>
            <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
              {decoded}
            </h1>
            <p className="text-label text-slate-500 dark:text-slate-400 mt-1">
              Owner profile · {distinctBANs} business{distinctBANs === 1 ? '' : 'es'}
              {' · '}
              {locations.length} location{locations.length === 1 ? '' : 's'}
            </p>
          </>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!loading && locations.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-6xl">
            <div className="lg:col-span-2 space-y-3">
              <DisambiguationBanner />

              {sectorMix.length > 0 && (
                <div className="glass-card rounded-xl p-4">
                  <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-2">
                    Sector mix
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {sectorMix.map((s) => (
                      <span
                        key={s.sector}
                        className="text-micro font-mono px-2 py-1 rounded-full
                          bg-teal-500/10 text-teal-400"
                      >
                        {s.sector} · {s.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="glass-card rounded-xl p-4">
                <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-3">
                  Businesses ({distinctBANs})
                </p>
                <ul className="space-y-2">
                  {banClusters.map((cluster) => (
                    <BanClusterRow key={cluster.ban || cluster.locations[0]?.uniqueid} cluster={cluster} />
                  ))}
                </ul>
              </div>
            </div>

            <div>
              <ExternalResourcesCard
                ownershipName={decoded}
                showAddressLinks={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DisambiguationBanner() {
  return (
    <div className="rounded-lg p-3 bg-ochre-500/5 border border-ochre-500/15">
      <p className="text-micro text-ochre-400/70 leading-relaxed">
        <span className="font-semibold">Note:</span> owner names in the SF business registry are free-text.
        This page groups by exact match on <span className="font-mono">ownership_name</span> only —
        variants like <em>“Smith John”</em> vs <em>“John Smith LLC”</em> are <em>not</em> combined here.
        For canonical chain groupings, follow the BAN (Business Account Number) link on each cluster below.
      </p>
    </div>
  )
}

function BanClusterRow({ cluster }: { cluster: { ban: string | null; primaryDba: string | null; locations: BusinessLocationRecord[] } }) {
  const active = cluster.locations.filter((l) => !l.dba_end_date).length
  const closed = cluster.locations.length - active

  // If only one location, link straight to the business profile.
  // Otherwise, link to the chain profile (BAN-keyed).
  const target = cluster.locations.length === 1
    ? `/business/${encodeURIComponent(cluster.locations[0].uniqueid)}`
    : cluster.ban
      ? `/business/chain/${encodeURIComponent(cluster.ban)}`
      : `/business/${encodeURIComponent(cluster.locations[0].uniqueid)}`

  return (
    <li>
      <Link
        to={target}
        className="block px-3 py-2 -mx-3 rounded-lg hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-slate-700 dark:text-slate-200 truncate">
              {cluster.primaryDba || 'Unknown'}
            </p>
            <p className="text-micro text-slate-500 dark:text-slate-500 font-mono mt-0.5">
              {cluster.locations.length} location{cluster.locations.length === 1 ? '' : 's'}
              {' · '}
              <span className="text-moss-400">{active} active</span>
              {closed > 0 && <>{' · '}<span className="text-brick-400">{closed} closed</span></>}
              {cluster.ban && <> · BAN <span className="text-slate-400">{cluster.ban}</span></>}
            </p>
          </div>
          <span className="text-slate-500 group-hover:text-slate-300 transition-colors">→</span>
        </div>
      </Link>
    </li>
  )
}

function mostCommon(arr: string[]): string | null {
  if (arr.length === 0) return null
  const counts = new Map<string, number>()
  for (const s of arr) counts.set(s, (counts.get(s) || 0) + 1)
  let best: string | null = null
  let bestCount = 0
  for (const [s, c] of counts) {
    if (c > bestCount) { best = s; bestCount = c }
  }
  return best
}
