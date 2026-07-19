/** Single row in the BusinessSearch results list. Compact, clickable.
 *  Click navigates to the per-business profile route at /business/:uniqueid.
 */

import { useNavigate } from 'react-router-dom'
import type { BusinessSearchResult } from '@/hooks/useBusinessSearch'

interface BusinessRowProps {
  result: BusinessSearchResult
}

const STATUS_COLOR: Record<BusinessSearchResult['status'], string> = {
  active: '#7a9954',
  closed: '#b85545',
  'admin-closed': '#d4a435',
}

const STATUS_LABEL: Record<BusinessSearchResult['status'], string> = {
  active: 'Active',
  closed: 'Closed',
  'admin-closed': 'Forced closure',
}

function formatStartYear(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return String(d.getFullYear())
}

export default function BusinessRow({ result }: BusinessRowProps) {
  const navigate = useNavigate()
  const statusColor = STATUS_COLOR[result.status]
  const statusLabel = STATUS_LABEL[result.status]

  return (
    <button
      onClick={() => navigate(`/business/${encodeURIComponent(result.uniqueid)}`)}
      className="w-full text-left px-4 py-3 rounded-xl
        bg-white/40 dark:bg-white/[0.02] hover:bg-white/60 dark:hover:bg-white/[0.04]
        border border-slate-200/40 dark:border-white/[0.04] hover:border-slate-300/60 dark:hover:border-white/[0.08]
        transition-all duration-150 group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="font-display italic text-[15px] text-ink dark:text-slate-100 truncate group-hover:text-slate-50">
              {result.dbaName}
            </h3>
            <span
              className="text-nano font-mono uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-full"
              style={{
                color: statusColor,
                backgroundColor: `${statusColor}1A`,
              }}
            >
              {statusLabel}
            </span>
            {result.ageYears >= 10 && (
              <span className="text-nano font-mono text-ochre-500 bg-ochre-500/10 px-1.5 py-0.5 rounded-full">
                {result.ageYears}y
              </span>
            )}
          </div>
          {result.ownershipName && (
            <p className="text-label text-slate-500 dark:text-slate-500 mt-0.5 truncate">
              {result.ownershipName}
            </p>
          )}
          <p className="text-micro text-slate-400 dark:text-slate-500 font-mono mt-1 truncate">
            {result.sector} · {result.address || 'Unknown address'}
            {result.corridor && ` · ${result.corridor}`}
          </p>
        </div>

        <div className="flex-shrink-0 text-right">
          <p className="text-nano font-mono uppercase tracking-wider text-slate-400 dark:text-slate-600">
            since
          </p>
          <p className="text-label font-mono tabular-nums text-slate-600 dark:text-slate-300">
            {formatStartYear(result.startDate)}
          </p>
          {result.certificateNumber && (
            <p className="text-nano font-mono text-slate-400 dark:text-slate-600 mt-0.5">
              BAN {result.certificateNumber}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}
