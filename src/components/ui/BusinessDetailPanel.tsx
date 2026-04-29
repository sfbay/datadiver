import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { fetchDataset } from '@/api/client'
import type { BusinessLocationRecord } from '@/types/datasets'
import DetailPanelShell from '@/components/ui/DetailPanelShell'

interface BusinessDetail {
  name: string
  owner: string
  address: string
  sector: string
  status: 'Active' | 'Closed' | 'Forced closure'
  openedDate: string
  closedDate: string | null
  duration: string
  parkingTax: boolean
  transientTax: boolean
  ban: string | null
  licenseCode: string | null
  corridor: string | null
  cbd: string | null
  mailingAddress: string | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function computeDuration(start: string, end: string | null): string {
  const s = new Date(start)
  const e = end ? new Date(end) : new Date()
  const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  if (months < 1) return 'Less than a month'
  if (months < 12) return `${months} month${months > 1 ? 's' : ''}`
  const years = Math.floor(months / 12)
  const rem = months % 12
  return `${years} yr${years > 1 ? 's' : ''}${rem > 0 ? ` ${rem} mo` : ''}`
}

function buildMailingAddress(record: BusinessLocationRecord): string | null {
  const line1 = record.mailing_address_1?.trim()
  if (!line1) return null
  const physical = record.full_business_address?.trim().toLowerCase()
  if (physical && line1.toLowerCase() === physical) return null
  const cityStateZip = [record.mail_city, record.mail_state, record.mail_zipcode]
    .filter((s) => s && s.trim())
    .join(' ')
  return cityStateZip ? `${line1}, ${cityStateZip}` : line1
}

function buildDetail(record: BusinessLocationRecord): BusinessDetail {
  const isAdminClosed = record.administratively_closed?.trim().toLowerCase() === 'yes'
  const status: BusinessDetail['status'] = record.dba_end_date
    ? (isAdminClosed ? 'Forced closure' : 'Closed')
    : 'Active'

  // Prefer the multi-NAICS list if present (often richer than the single primary)
  const sector = record.naics_code_descriptions_list?.trim() || record.naic_code_description || 'Uncategorized'

  // Compose license code label: "G45 — Online retail" if both fields present
  const licenseCode = record.lic
    ? (record.lic_code_description ? `${record.lic} — ${record.lic_code_description}` : record.lic)
    : null

  return {
    name: record.dba_name || 'Unknown',
    owner: record.ownership_name || 'Unknown',
    address: record.full_business_address || 'Unknown',
    sector,
    status,
    openedDate: record.dba_start_date,
    closedDate: record.dba_end_date,
    duration: computeDuration(record.dba_start_date, record.dba_end_date),
    parkingTax: record.parking_tax,
    transientTax: record.transient_occupancy_tax,
    ban: record.certificate_number || null,
    licenseCode,
    corridor: record.business_corridor?.trim() || null,
    cbd: record.community_benefit_district?.trim() || null,
    mailingAddress: buildMailingAddress(record),
  }
}

export default function BusinessDetailPanel() {
  const { selectedBusiness, setSelectedBusiness } = useAppStore()
  const [detail, setDetail] = useState<BusinessDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedBusiness) { setDetail(null); return }
    let cancelled = false
    setLoading(true)

    fetchDataset<BusinessLocationRecord>('businessLocations', {
      $where: `uniqueid = '${selectedBusiness.replace(/'/g, "''")}'`,
      $limit: 1,
    }).then((rows) => {
      if (cancelled) return
      if (rows[0]) setDetail(buildDetail(rows[0]))
      setLoading(false)
    }).catch(() => {
      if (!cancelled) { setDetail(null); setLoading(false) }
    })

    return () => { cancelled = true }
  }, [selectedBusiness])

  const close = useCallback(() => setSelectedBusiness(null), [setSelectedBusiness])

  return (
    <DetailPanelShell
      open={!!selectedBusiness}
      onClose={close}
      isLoading={loading}
      spinnerClass="border-slate-400"
    >
      {detail && (
        <>
          <div>
            <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{detail.name}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">{detail.owner}</p>
            {detail.ban && (
              <p className="text-[9px] font-mono text-slate-400 dark:text-slate-600 mt-0.5">
                BAN <span className="text-slate-500 dark:text-slate-500">{detail.ban}</span>
              </p>
            )}
          </div>

          <div className="space-y-2 mt-3">
            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500">Sector</p>
              <p className="text-[11px] text-slate-700 dark:text-slate-300">{detail.sector}</p>
            </div>
            {detail.licenseCode && (
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500">License</p>
                <p className="text-[11px] text-slate-700 dark:text-slate-300">{detail.licenseCode}</p>
              </div>
            )}
            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500">Address</p>
              <p className="text-[11px] text-slate-700 dark:text-slate-300">{detail.address}</p>
              {detail.corridor && (
                <p className="text-[10px] text-slate-500 dark:text-slate-500 mt-0.5">
                  {detail.corridor} corridor
                  {detail.cbd && ` · ${detail.cbd}`}
                </p>
              )}
              {!detail.corridor && detail.cbd && (
                <p className="text-[10px] text-slate-500 dark:text-slate-500 mt-0.5">{detail.cbd}</p>
              )}
            </div>
            {detail.mailingAddress && (
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500">Mailing</p>
                <p className="text-[11px] text-slate-700 dark:text-slate-300">{detail.mailingAddress}</p>
              </div>
            )}
            <div className="flex gap-4">
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500">Status</p>
                <p className={`text-[11px] font-semibold ${
                  detail.status === 'Active' ? 'text-emerald-400'
                    : detail.status === 'Forced closure' ? 'text-amber-400'
                    : 'text-red-400'
                }`}>
                  {detail.status}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500">Duration</p>
                <p className="text-[11px] text-slate-700 dark:text-slate-300">{detail.duration}</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500">Opened</p>
                <p className="text-[11px] text-slate-700 dark:text-slate-300">{formatDate(detail.openedDate)}</p>
              </div>
              {detail.closedDate && (
                <div>
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500">Closed</p>
                  <p className="text-[11px] text-slate-700 dark:text-slate-300">{formatDate(detail.closedDate)}</p>
                </div>
              )}
            </div>
            {(detail.status === 'Forced closure' || detail.parkingTax || detail.transientTax) && (
              <div className="flex gap-2 pt-1 flex-wrap">
                {detail.status === 'Forced closure' && (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                    Administratively closed
                  </span>
                )}
                {detail.parkingTax && (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                    Parking Tax
                  </span>
                )}
                {detail.transientTax && (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400">
                    Hotel Tax
                  </span>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </DetailPanelShell>
  )
}
