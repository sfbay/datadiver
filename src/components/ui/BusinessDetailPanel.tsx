import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { fetchDataset } from '@/api/client'
import type { BusinessLocationRecord } from '@/types/datasets'
import { naicsSector } from '@/utils/naicsSector'
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
  supervisorDistrict: string | null
  mailingAddress: string | null
  isFoodBusiness: boolean
}

/** Detect food/restaurant businesses by NAICS code prefix or text match.
 *  NAICS 722 = Food Services and Drinking Places. Used to surface a
 *  placeholder for inspection data that PR 5 will resolve to a real link. */
function isLikelyFoodBusiness(record: BusinessLocationRecord): boolean {
  if (naicsSector(record.self_reported_naics_code) === 'Food Services') return true
  const text = (record.lic_code_description || '').toLowerCase()
  return /(restaurant|food service|drinking place|caterer|bar |tavern|coffee|bakery)/i.test(text)
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

  const sector = naicsSector(record.self_reported_naics_code)

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
    supervisorDistrict: record.supervisor_district?.trim() || null,
    mailingAddress: buildMailingAddress(record),
    isFoodBusiness: isLikelyFoodBusiness(record),
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
      mobileCompact
    >
      {detail && (
        <>
          <div>
            <p className="text-[13px] font-semibold text-ink dark:text-slate-100">{detail.name}</p>
            <p className="text-micro text-slate-500 dark:text-slate-400">{detail.owner}</p>
          </div>

          <div className="space-y-2 mt-3">
            {detail.ban && (
              <div className="flex justify-between items-baseline gap-3 desk:block">
                <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500 shrink-0">Business Account #</p>
                <p className="text-label font-mono text-slate-700 dark:text-slate-300 tabular-nums text-right desk:text-left">{detail.ban}</p>
              </div>
            )}
            <div className="flex justify-between items-baseline gap-3 desk:block">
              <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500 shrink-0">Sector</p>
              <p className="text-label text-slate-700 dark:text-slate-300 text-right desk:text-left">{detail.sector}</p>
            </div>
            {detail.licenseCode && (
              <div className="flex justify-between items-baseline gap-3 desk:block">
                <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500 shrink-0">License</p>
                <p className="text-label text-slate-700 dark:text-slate-300 text-right desk:text-left">{detail.licenseCode}</p>
              </div>
            )}
            <div>
              <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500">Address</p>
              <p className="text-label text-slate-700 dark:text-slate-300">{detail.address}</p>
              {(detail.corridor || detail.cbd || detail.supervisorDistrict) && (
                <p className="text-micro text-slate-500 dark:text-slate-500 mt-0.5">
                  {[
                    detail.corridor && `${detail.corridor} corridor`,
                    detail.cbd,
                    detail.supervisorDistrict && `District ${detail.supervisorDistrict}`,
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            {detail.mailingAddress && (
              <div className="flex justify-between items-baseline gap-3 desk:block">
                <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500 shrink-0">Mailing</p>
                <p className="text-label text-slate-700 dark:text-slate-300 text-right desk:text-left">{detail.mailingAddress}</p>
              </div>
            )}
            <div className="flex gap-4">
              <div>
                <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500">Status</p>
                <p className={`text-label font-semibold ${
                  detail.status === 'Active' ? 'text-moss-400'
                    : detail.status === 'Forced closure' ? 'text-ochre-500'
                    : 'text-brick-400'
                }`}>
                  {detail.status}
                </p>
              </div>
              <div>
                <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500">Duration</p>
                <p className="text-label text-slate-700 dark:text-slate-300">{detail.duration}</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500">Opened</p>
                <p className="text-label text-slate-700 dark:text-slate-300">{formatDate(detail.openedDate)}</p>
              </div>
              {detail.closedDate && (
                <div>
                  <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500">Closed</p>
                  <p className="text-label text-slate-700 dark:text-slate-300">{formatDate(detail.closedDate)}</p>
                </div>
              )}
            </div>
            {(detail.status === 'Forced closure' || detail.parkingTax || detail.transientTax) && (
              <div className="flex gap-2 pt-1 flex-wrap">
                {detail.status === 'Forced closure' && (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-ochre-500/10 text-ochre-500">
                    Administratively closed
                  </span>
                )}
                {detail.parkingTax && (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-ochre-500/10 text-ochre-500">
                    Parking Tax
                  </span>
                )}
                {detail.transientTax && (
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400">
                    Hotel Tax
                  </span>
                )}
              </div>
            )}

            {/* Food businesses get a placeholder pointing to inspection data —
                resolves to a real link when the Restaurants view (PR 5) ships. */}
            {detail.isFoodBusiness && (
              <div className="mt-1 pt-2 border-t border-slate-200/40 dark:border-white/[0.04]">
                <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500">Health inspections</p>
                <p className="text-micro text-slate-400 dark:text-slate-500 italic mt-0.5">
                  Restaurant inspection data coming with the Restaurants view
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </DetailPanelShell>
  )
}
