/** OwnerProfile — Level 3b dossier at /business/owner/:name.
 *  Aggregates by ownership_name (free-text). Wave 1 stub: counts and a list
 *  with the disambiguation banner. Similar-names fuzzy search lands later.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { fetchDataset } from '@/api/client'
import type { BusinessLocationRecord } from '@/types/datasets'
import { Skeleton } from '@/components/ui/Skeleton'

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
      $limit: 200,
    })
      .then((rows) => { if (!cancelled) setLocations(rows) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [decoded])

  const distinctBANs = new Set(locations.map((l) => l.certificate_number).filter(Boolean))

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
        {!loading && decoded && (
          <>
            <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
              {decoded}
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Owner profile · {distinctBANs.size} business{distinctBANs.size === 1 ? '' : 'es'}
              {' · '}
              {locations.length} location{locations.length === 1 ? '' : 's'}
            </p>
          </>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl space-y-4">
          <div className="rounded-lg p-3 bg-amber-500/5 border border-amber-500/15">
            <p className="text-[10px] text-amber-200/70 leading-relaxed">
              <span className="font-semibold">Note:</span> owner names in the SF business registry are free-text.
              This page groups by exact match on <span className="font-mono">ownership_name</span> only —
              variants like “Smith John” vs “John Smith LLC” are <em>not</em> combined here.
              For canonical chain groupings, use the BAN-based{' '}
              <Link to="/business" className="text-emerald-400 hover:text-emerald-300">chain profile</Link>{' '}
              instead.
            </p>
          </div>

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
                    {l.naic_code_description && ` · ${l.naic_code_description}`}
                  </p>
                </div>
                <p className="text-[10px] font-mono tabular-nums text-slate-500 flex-shrink-0">
                  {l.dba_start_date?.split('T')[0]?.slice(0, 4)}
                  {l.dba_end_date ? ` – ${l.dba_end_date.split('T')[0].slice(0, 4)}` : ' – open'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
