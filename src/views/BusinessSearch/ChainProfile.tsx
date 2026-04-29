/** ChainProfile — Level 3a dossier at /business/chain/:ban.
 *  Aggregates all locations sharing one certificate_number (BAN).
 *  Wave 1 stub: counts and a list. Map + cohort timeline land in Wave 3.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { fetchDataset } from '@/api/client'
import type { BusinessLocationRecord } from '@/types/datasets'
import { Skeleton } from '@/components/ui/Skeleton'

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
      $limit: 200,
    })
      .then((rows) => { if (!cancelled) setLocations(rows) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ban])

  // Use the most-frequent dba_name as the chain's primary name. Falls back to
  // the first location's name. Most chains have consistent naming, but franchise
  // setups can vary location-to-location.
  const primaryName = locations.length > 0
    ? mostCommon(locations.map((l) => l.dba_name).filter(Boolean) as string[]) || locations[0].dba_name
    : null

  const active = locations.filter((l) => !l.dba_end_date).length
  const closed = locations.length - active
  const oldestStart = locations.length > 0
    ? locations.reduce((min, l) => l.dba_start_date < min ? l.dba_start_date : min, locations[0].dba_start_date)
    : null

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="flex-shrink-0 px-6 py-3 border-b border-slate-200/50 dark:border-white/[0.04]">
        <button
          onClick={() => navigate(-1)}
          className="text-[10px] font-mono text-emerald-500 hover:text-emerald-400 transition-colors mb-2"
        >
          ← Back
        </button>
        {loading && <Skeleton className="h-5 w-1/2" />}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!loading && primaryName && (
          <>
            <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
              {primaryName}
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Chain · BAN <span className="font-mono">{ban}</span>
              {' · '}
              {locations.length} location{locations.length !== 1 ? 's' : ''}
              {' · '}
              <span className="text-emerald-400">{active} active</span>
              {closed > 0 && (
                <>{' · '}<span className="text-red-400">{closed} closed</span></>
              )}
              {oldestStart && (
                <> · since <span className="font-mono">{oldestStart.split('T')[0].slice(0, 4)}</span></>
              )}
            </p>
          </>
        )}
        {!loading && locations.length === 0 && !error && (
          <p className="text-sm text-slate-500">No locations found for BAN {ban}</p>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl space-y-2">
          {locations.map((l) => (
            <Link
              key={l.uniqueid}
              to={`/business/${encodeURIComponent(l.uniqueid)}`}
              className="block px-4 py-3 rounded-xl
                bg-white/40 dark:bg-white/[0.02] hover:bg-white/60 dark:hover:bg-white/[0.04]
                border border-slate-200/40 dark:border-white/[0.04] hover:border-slate-300/60 dark:hover:border-white/[0.08]
                transition-all duration-150"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-slate-700 dark:text-slate-200 truncate">
                    {l.dba_name || 'Unknown'}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-500 font-mono mt-0.5 truncate">
                    {l.full_business_address}
                    {l.business_corridor && ` · ${l.business_corridor}`}
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-[10px] font-mono tabular-nums text-slate-500">
                    {l.dba_start_date?.split('T')[0]?.slice(0, 4)}
                    {l.dba_end_date ? ` – ${l.dba_end_date.split('T')[0].slice(0, 4)}` : ' – open'}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function mostCommon(arr: string[]): string | null {
  if (arr.length === 0) return null
  const counts = new Map<string, number>()
  for (const s of arr) counts.set(s, (counts.get(s) || 0) + 1)
  let best: string | null = null
  let bestCount = 0
  for (const [s, c] of counts) {
    if (c > bestCount) {
      best = s
      bestCount = c
    }
  }
  return best
}
