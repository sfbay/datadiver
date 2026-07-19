/** BusinessProfile — Level 2 dossier at /business/:uniqueid.
 *
 *  Two-column layout:
 *    Left   — identity facts, lifecycle dates, mailing address, status badge
 *    Right  — sibling-locations chain, same-owner businesses, same-address
 *             neighbors, and the ExternalResourcesCard with deep links to
 *             authoritative public registries.
 */

import { useParams, useNavigate, Link } from 'react-router-dom'
import { useBusinessProfile } from '@/hooks/useBusinessProfile'
import type { BusinessLocationRecord } from '@/types/datasets'
import { naicsSector } from '@/utils/naicsSector'
import { Skeleton } from '@/components/ui/Skeleton'
import ExternalResourcesCard from './components/ExternalResourcesCard'

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function computeDuration(start: string, end: string | null | undefined): string {
  const s = new Date(start)
  const e = end ? new Date(end) : new Date()
  const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  if (months < 1) return 'Less than a month'
  if (months < 12) return `${months} month${months > 1 ? 's' : ''}`
  const years = Math.floor(months / 12)
  const rem = months % 12
  return `${years} yr${years > 1 ? 's' : ''}${rem > 0 ? ` ${rem} mo` : ''}`
}

function buildMailing(r: BusinessLocationRecord): string | null {
  const line1 = r.mailing_address_1?.trim()
  if (!line1) return null
  const physical = r.full_business_address?.trim().toLowerCase()
  if (physical && line1.toLowerCase() === physical) return null
  const tail = [r.mail_city, r.mail_state, r.mail_zipcode].filter((s) => s && s.trim()).join(' ')
  return tail ? `${line1}, ${tail}` : line1
}

function statusFor(r: BusinessLocationRecord): { label: string; color: string } {
  const isAdmin = r.administratively_closed?.trim().toLowerCase() === 'yes'
  if (r.dba_end_date) {
    return isAdmin
      ? { label: 'Forced closure', color: '#d4a435' }
      : { label: 'Closed', color: '#b85545' }
  }
  return { label: 'Active', color: '#7a9954' }
}

export default function BusinessProfile() {
  const { uniqueid } = useParams<{ uniqueid: string }>()
  const navigate = useNavigate()
  const profile = useBusinessProfile(uniqueid)
  const { business, siblingLocations, ownerOtherBusinesses, addressNeighbors, isLoading, error } = profile

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-3 border-b border-slate-200/50 dark:border-white/[0.04]">
        <button
          onClick={() => navigate(-1)}
          className="text-micro font-mono text-moss-500 hover:text-moss-400 transition-colors mb-2"
        >
          ← Back
        </button>
        {isLoading && !business && (
          <div className="space-y-2">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        )}
        {error && (
          <p className="text-sm text-brick-400">{error}</p>
        )}
        {business && (
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
              {business.dba_name || 'Unknown'}
            </h1>
            <StatusPill status={statusFor(business)} />
            <span className="text-micro font-mono text-slate-500 dark:text-slate-500">
              {business.ownership_name || 'Unknown owner'}
              {business.certificate_number && (
                <> · BAN <span className="text-slate-700 dark:text-slate-300">{business.certificate_number}</span></>
              )}
            </span>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {business && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-6xl">
            {/* Left column — identity */}
            <div className="space-y-3">
              <IdentityCard record={business} />
              <LifecycleCard record={business} />
            </div>

            {/* Right column — context */}
            <div className="space-y-3">
              {siblingLocations.length > 0 && (
                <ChainCard
                  ban={business.certificate_number}
                  primaryDba={business.dba_name}
                  locations={siblingLocations}
                />
              )}
              {ownerOtherBusinesses.length > 0 && (
                <OwnerOtherCard
                  ownerName={business.ownership_name}
                  businesses={ownerOtherBusinesses}
                />
              )}
              {addressNeighbors.length > 0 && (
                <AddressNeighborsCard
                  address={business.full_business_address}
                  neighbors={addressNeighbors}
                />
              )}
              <ExternalResourcesCard
                dbaName={business.dba_name}
                ownershipName={business.ownership_name}
                address={business.full_business_address}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Pills + small atoms ────────────────────────────────────────

function StatusPill({ status }: { status: { label: string; color: string } }) {
  return (
    <span
      className="text-nano font-mono uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-full"
      style={{ color: status.color, backgroundColor: `${status.color}1A` }}
    >
      {status.label}
    </span>
  )
}

// ── Cards ──────────────────────────────────────────────────────

function IdentityCard({ record }: { record: BusinessLocationRecord }) {
  const sector = naicsSector(record.self_reported_naics_code)
  const license = record.lic
    ? (record.lic_code_description ? `${record.lic} — ${record.lic_code_description}` : record.lic)
    : null
  const mailing = buildMailing(record)

  return (
    <div className="glass-card rounded-xl p-4">
      <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-3">
        Identity
      </p>
      <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-[12px]">
        <Row label="Sector" value={sector} />
        {license && <Row label="License" value={license} />}
        <Row label="Address" value={record.full_business_address || '—'} />
        {(record.business_corridor || record.community_benefit_district || record.supervisor_district) && (
          <Row
            label=""
            value={[
              record.business_corridor && `${record.business_corridor} corridor`,
              record.community_benefit_district,
              record.supervisor_district && `District ${record.supervisor_district}`,
            ].filter(Boolean).join(' · ')}
            muted
          />
        )}
        {mailing && <Row label="Mailing" value={mailing} />}
      </dl>
      {(record.parking_tax || record.transient_occupancy_tax || record.administratively_closed?.toLowerCase() === 'yes') && (
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {record.administratively_closed?.toLowerCase() === 'yes' && (
            <Badge color="amber" label="Administratively closed" />
          )}
          {record.parking_tax && <Badge color="amber" label="Parking Tax" />}
          {record.transient_occupancy_tax && <Badge color="cyan" label="Hotel Tax" />}
        </div>
      )}
    </div>
  )
}

function LifecycleCard({ record }: { record: BusinessLocationRecord }) {
  const status = statusFor(record)
  return (
    <div className="glass-card rounded-xl p-4">
      <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-3">
        Lifecycle
      </p>
      <div className="grid grid-cols-3 gap-3 text-[12px]">
        <div>
          <p className="text-nano uppercase tracking-wider text-slate-500 mb-0.5">Opened</p>
          <p className="text-slate-700 dark:text-slate-300 font-mono">{formatDate(record.dba_start_date)}</p>
        </div>
        {record.dba_end_date && (
          <div>
            <p className="text-nano uppercase tracking-wider text-slate-500 mb-0.5">Closed</p>
            <p className="text-slate-700 dark:text-slate-300 font-mono">{formatDate(record.dba_end_date)}</p>
          </div>
        )}
        <div>
          <p className="text-nano uppercase tracking-wider text-slate-500 mb-0.5">Tenure</p>
          <p className="font-semibold" style={{ color: status.color }}>
            {computeDuration(record.dba_start_date, record.dba_end_date)}
          </p>
        </div>
      </div>
    </div>
  )
}

function ChainCard({ ban, primaryDba, locations }: { ban: string | null; primaryDba: string | null; locations: BusinessLocationRecord[] }) {
  const active = locations.filter((l) => !l.dba_end_date).length
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
          Other locations of this business
        </p>
        {ban && (
          <Link
            to={`/business/chain/${encodeURIComponent(ban)}`}
            className="text-micro font-mono text-moss-500 hover:text-moss-400 transition-colors"
          >
            View full chain →
          </Link>
        )}
      </div>
      <p className="text-micro text-slate-500 mb-3">
        {primaryDba && <span className="text-slate-300">{primaryDba} </span>}
        operates from {locations.length + 1} locations under the same Business Account Number.
        <span className="text-moss-400"> {active + (locations.find((l) => !l.dba_end_date) ? 0 : 1)} active.</span>
      </p>
      <ul className="space-y-1">
        {locations.slice(0, 8).map((l) => (
          <li key={l.uniqueid}>
            <Link
              to={`/business/${encodeURIComponent(l.uniqueid)}`}
              className="block px-2 py-1.5 -mx-2 rounded-md hover:bg-white/[0.04] transition-colors"
            >
              <p className="text-label text-slate-700 dark:text-slate-200 truncate">
                {l.dba_name || 'Unknown'}
              </p>
              <p className="text-nano text-slate-500 font-mono truncate">
                {l.full_business_address}
                {l.dba_end_date ? <span className="text-brick-400"> · closed {l.dba_end_date.split('T')[0].slice(0, 4)}</span> : ''}
              </p>
            </Link>
          </li>
        ))}
        {locations.length > 8 && (
          <li className="text-micro text-slate-500 italic px-2">
            …and {locations.length - 8} more — see the chain profile.
          </li>
        )}
      </ul>
    </div>
  )
}

function OwnerOtherCard({ ownerName, businesses }: { ownerName: string | undefined; businesses: BusinessLocationRecord[] }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
          Same owner, different businesses
        </p>
        {ownerName && (
          <Link
            to={`/business/owner/${encodeURIComponent(ownerName)}`}
            className="text-micro font-mono text-moss-500 hover:text-moss-400 transition-colors"
          >
            View owner →
          </Link>
        )}
      </div>
      <p className="text-micro text-slate-500 italic mb-3">
        Free-text owner-name match (different BAN). May include unrelated entities with similar names — verify before reporting.
      </p>
      <ul className="space-y-1">
        {businesses.slice(0, 6).map((b) => (
          <li key={b.uniqueid}>
            <Link
              to={`/business/${encodeURIComponent(b.uniqueid)}`}
              className="block px-2 py-1.5 -mx-2 rounded-md hover:bg-white/[0.04] transition-colors"
            >
              <p className="text-label text-slate-700 dark:text-slate-200 truncate">{b.dba_name || 'Unknown'}</p>
              <p className="text-nano text-slate-500 font-mono truncate">
                {naicsSector(b.self_reported_naics_code)} · {b.full_business_address}
              </p>
            </Link>
          </li>
        ))}
        {businesses.length > 6 && (
          <li className="text-micro text-slate-500 italic px-2">
            …and {businesses.length - 6} more — see the owner profile.
          </li>
        )}
      </ul>
    </div>
  )
}

function AddressNeighborsCard({ address, neighbors }: { address: string | undefined; neighbors: BusinessLocationRecord[] }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-1">
        At this address (turnover history)
      </p>
      <p className="text-micro text-slate-500 mb-3">
        Other businesses that have operated at <span className="text-slate-300">{address}</span>.
        High turnover at one address can be a story.
      </p>
      <ul className="space-y-1">
        {neighbors.slice(0, 6).map((n) => (
          <li key={n.uniqueid}>
            <Link
              to={`/business/${encodeURIComponent(n.uniqueid)}`}
              className="block px-2 py-1.5 -mx-2 rounded-md hover:bg-white/[0.04] transition-colors"
            >
              <p className="text-label text-slate-700 dark:text-slate-200 truncate">{n.dba_name || 'Unknown'}</p>
              <p className="text-nano text-slate-500 font-mono truncate">
                {naicsSector(n.self_reported_naics_code)} ·{' '}
                {n.dba_start_date?.split('T')[0]?.slice(0, 4)}
                {n.dba_end_date ? `–${n.dba_end_date.split('T')[0].slice(0, 4)}` : '–open'}
              </p>
            </Link>
          </li>
        ))}
        {neighbors.length > 6 && (
          <li className="text-micro text-slate-500 italic px-2">
            …and {neighbors.length - 6} more.
          </li>
        )}
      </ul>
    </div>
  )
}

// ── Atoms ──────────────────────────────────────────────────────

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <>
      <dt className="text-nano font-mono uppercase tracking-[0.18em] text-slate-500 dark:text-slate-600 self-center">
        {label}
      </dt>
      <dd className={muted ? 'text-label text-slate-500 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}>
        {value}
      </dd>
    </>
  )
}

function Badge({ color, label }: { color: 'amber' | 'cyan'; label: string }) {
  const cls = color === 'amber'
    ? 'bg-ochre-500/10 text-ochre-500'
    : 'bg-teal-500/10 text-teal-400'
  return (
    <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${cls}`}>
      {label}
    </span>
  )
}
