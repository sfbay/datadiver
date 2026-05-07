/** ChainProfile — Level 3a dossier at /business/chain/:ban.
 *
 *  Aggregates all locations sharing one certificate_number (BAN). Renders a
 *  map showing the cluster, a sector mix, header counts (active / closed /
 *  oldest-since), and a clickable list of every location.
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { fetchDataset } from '@/api/client'
import type { BusinessLocationRecord } from '@/types/datasets'
import { Skeleton } from '@/components/ui/Skeleton'
import ChainMap from './components/ChainMap'
import ExternalResourcesCard from './components/ExternalResourcesCard'

export default function ChainProfile() {
  const { ban } = useParams<{ ban: string }>()
  const navigate = useNavigate()
  const [locations, setLocations] = useState<BusinessLocationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ban) return
    let cancelled = false
    setLoading(true)
    fetchDataset<BusinessLocationRecord>('businessLocations', {
      $where: `certificate_number = '${ban.replace(/'/g, "''")}'`,
      $order: 'dba_start_date ASC',
      $limit: 500,
    })
      .then((rows) => { if (!cancelled) setLocations(rows) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ban])

  const stats = useMemo(() => {
    const active = locations.filter((l) => !l.dba_end_date).length
    const closed = locations.length - active
    const oldestStart = locations.length > 0
      ? locations.reduce((min, l) =>
        l.dba_start_date && (!min || l.dba_start_date < min) ? l.dba_start_date : min,
        locations[0].dba_start_date)
      : null
    return { active, closed, oldestStart }
  }, [locations])

  // Sector mix — count businesses per sector (using primary NAICS).
  // Multi-NAICS expansion is overkill here; chains are typically same-sector.
  const sectorMix = useMemo(() => {
    const map = new Map<string, number>()
    for (const l of locations) {
      const s = l.naic_code_description?.trim() || 'Uncategorized'
      map.set(s, (map.get(s) || 0) + 1)
    }
    return Array.from(map.entries())
      .map(([sector, count]) => ({ sector, count }))
      .sort((a, b) => b.count - a.count)
  }, [locations])

  // Pick a representative ownership name (mode) so the External Resources
  // card has something to feed into CA SOS / LinkedIn lookups.
  const primaryOwner = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of locations) {
      const o = l.ownership_name?.trim()
      if (o) counts.set(o, (counts.get(o) || 0) + 1)
    }
    let best: string | null = null
    let bestCount = 0
    for (const [name, c] of counts) {
      if (c > bestCount) { best = name; bestCount = c }
    }
    return best
  }, [locations])

  const primaryName = useMemo(() => {
    if (locations.length === 0) return null
    const counts = new Map<string, number>()
    for (const l of locations) {
      const n = l.dba_name?.trim()
      if (n) counts.set(n, (counts.get(n) || 0) + 1)
    }
    let best: string | null = locations[0].dba_name || null
    let bestCount = 0
    for (const [name, c] of counts) {
      if (c > bestCount) { best = name; bestCount = c }
    }
    return best
  }, [locations])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-3 border-b border-slate-200/50 dark:border-white/[0.04]">
        <button
          onClick={() => navigate(-1)}
          className="text-[10px] font-mono text-moss-500 hover:text-moss-400 transition-colors mb-2"
        >
          ← Back
        </button>
        {loading && <Skeleton className="h-6 w-1/2" />}
        {error && <p className="text-sm text-brick-400">{error}</p>}
        {!loading && primaryName && (
          <>
            <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
              {primaryName}
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Chain · BAN <span className="font-mono">{ban}</span>
              {' · '}
              <span className="text-slate-700 dark:text-slate-300">{locations.length}</span> location{locations.length !== 1 ? 's' : ''}
              {' · '}
              <span className="text-moss-400">{stats.active} active</span>
              {stats.closed > 0 && (
                <>{' · '}<span className="text-brick-400">{stats.closed} closed</span></>
              )}
              {stats.oldestStart && (
                <> · since <span className="font-mono">{stats.oldestStart.split('T')[0].slice(0, 4)}</span></>
              )}
            </p>
          </>
        )}
        {!loading && locations.length === 0 && !error && (
          <p className="text-sm text-slate-500">No locations found for BAN {ban}</p>
        )}
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!loading && locations.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-6xl">
            {/* Left two columns — map + locations list */}
            <div className="lg:col-span-2 space-y-3">
              <ChainMap locations={locations} />

              {sectorMix.length > 0 && (
                <div className="glass-card rounded-xl p-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-2">
                    Sector mix
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {sectorMix.map((s) => (
                      <span
                        key={s.sector}
                        className="text-[10px] font-mono px-2 py-1 rounded-full
                          bg-teal-500/10 text-teal-400"
                      >
                        {s.sector} · {s.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="glass-card rounded-xl p-4">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-3">
                  All locations ({locations.length})
                </p>
                <ul className="space-y-1">
                  {locations.map((l) => (
                    <li key={l.uniqueid}>
                      <Link
                        to={`/business/${encodeURIComponent(l.uniqueid)}`}
                        className="block px-3 py-2 -mx-3 rounded-lg
                          hover:bg-white/[0.04] transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] text-slate-700 dark:text-slate-200 truncate group-hover:text-slate-50">
                              {l.dba_name || 'Unknown'}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-500 font-mono mt-0.5 truncate">
                              {l.full_business_address}
                              {l.business_corridor && ` · ${l.business_corridor}`}
                            </p>
                          </div>
                          <p className="text-[10px] font-mono tabular-nums text-slate-500 flex-shrink-0">
                            {l.dba_start_date?.split('T')[0]?.slice(0, 4)}
                            {l.dba_end_date
                              ? <span className="text-brick-400"> – {l.dba_end_date.split('T')[0].slice(0, 4)}</span>
                              : <span className="text-moss-400"> – open</span>}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Right column — external resources */}
            <div>
              <ExternalResourcesCard
                dbaName={primaryName}
                ownershipName={primaryOwner}
                showAddressLinks={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
