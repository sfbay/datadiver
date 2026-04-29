/** BusinessProfile — Level 2 dossier at /business/:uniqueid.
 *  Wave 1 stub: shows the business identity + a "coming soon" placeholder
 *  for sibling locations, owner-other-businesses, mailing address, etc.
 *  The real dossier lands in Wave 2.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { fetchDataset } from '@/api/client'
import type { BusinessLocationRecord } from '@/types/datasets'
import { Skeleton } from '@/components/ui/Skeleton'

export default function BusinessProfile() {
  const { uniqueid } = useParams<{ uniqueid: string }>()
  const navigate = useNavigate()
  const [record, setRecord] = useState<BusinessLocationRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!uniqueid) return
    let cancelled = false
    setLoading(true)
    fetchDataset<BusinessLocationRecord>('businessLocations', {
      $where: `uniqueid = '${uniqueid.replace(/'/g, "''")}'`,
      $limit: 1,
    })
      .then((rows) => {
        if (cancelled) return
        if (rows[0]) setRecord(rows[0])
        else setError('Business not found')
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [uniqueid])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="flex-shrink-0 px-6 py-3 border-b border-slate-200/50 dark:border-white/[0.04]">
        <button
          onClick={() => navigate(-1)}
          className="text-[10px] font-mono text-emerald-500 hover:text-emerald-400 transition-colors mb-2"
        >
          ← Back to search
        </button>
        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        )}
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
        {record && (
          <>
            <h1
              className="font-display text-2xl italic text-ink dark:text-white leading-none"
            >
              {record.dba_name || 'Unknown'}
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              {record.ownership_name || 'Unknown owner'}
              {record.certificate_number && (
                <> · BAN <span className="font-mono">{record.certificate_number}</span></>
              )}
            </p>
          </>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {record && (
          <div className="max-w-4xl space-y-4">
            <div className="glass-card rounded-xl p-4">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-2">
                Identity
              </p>
              <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-[12px]">
                <dt className="text-slate-500">Sector</dt>
                <dd className="text-slate-700 dark:text-slate-300">
                  {record.naics_code_descriptions_list || record.naic_code_description || 'Uncategorized'}
                </dd>
                <dt className="text-slate-500">Address</dt>
                <dd className="text-slate-700 dark:text-slate-300">{record.full_business_address || '—'}</dd>
                {record.business_corridor && (
                  <>
                    <dt className="text-slate-500">Corridor</dt>
                    <dd className="text-slate-700 dark:text-slate-300">{record.business_corridor}</dd>
                  </>
                )}
                <dt className="text-slate-500">Opened</dt>
                <dd className="text-slate-700 dark:text-slate-300 font-mono">{record.dba_start_date?.split('T')[0]}</dd>
                {record.dba_end_date && (
                  <>
                    <dt className="text-slate-500">Closed</dt>
                    <dd className="text-slate-700 dark:text-slate-300 font-mono">{record.dba_end_date.split('T')[0]}</dd>
                  </>
                )}
              </dl>
            </div>

            {record.certificate_number && (
              <div className="glass-card rounded-xl p-4">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-2">
                  Chain
                </p>
                <p className="text-[11px] text-slate-500 mb-2">
                  Other locations under this BAN (if any) appear in the chain profile.
                </p>
                <Link
                  to={`/business/chain/${encodeURIComponent(record.certificate_number)}`}
                  className="text-[11px] font-mono text-emerald-500 hover:text-emerald-400 transition-colors"
                >
                  View chain → /business/chain/{record.certificate_number}
                </Link>
              </div>
            )}

            <div className="glass-card rounded-xl p-4">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-2">
                Coming next
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Sibling locations map · same-owner other businesses ·
                same-address neighbors · external-resource deep links (CA SOS, FTB, court records).
                These land in subsequent waves of this PR.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
