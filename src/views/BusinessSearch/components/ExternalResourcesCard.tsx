/** ExternalResourcesCard — deep-link card pointing journalists to authoritative
 *  public registries where current contact, ownership, and litigation data
 *  lives. DataDiver does not republish phone numbers / personal emails;
 *  instead, this card walks users directly to source-of-truth registries.
 *
 *  Renders up to three sections depending on what context fields are
 *  available:
 *    1. Entity & ownership records   (CA SOS, FTB, FBN, SF Treasurer)
 *    2. Property, location & history (SF Property Map, planning, Google Maps, Wayback)
 *    3. Public presence & records    (Google, Yelp, LinkedIn, USPTO, CourtListener)
 *
 *  Every link opens in a new tab with rel="noopener". URLs are deterministic
 *  query-string templates — no fetching, no scraping, no rate limit concerns.
 */

interface ExternalResourcesCardProps {
  dbaName?: string | null
  ownershipName?: string | null
  address?: string | null
  /** Show address-keyed links (Section 2). Hide when used on OwnerProfile. */
  showAddressLinks?: boolean
}

interface ResourceLink {
  label: string
  description: string
  url: string
}

export default function ExternalResourcesCard({
  dbaName,
  ownershipName,
  address,
  showAddressLinks = true,
}: ExternalResourcesCardProps) {
  const dba = dbaName?.trim() || ''
  const owner = ownershipName?.trim() || ''
  const dbaOrOwner = dba || owner

  const entitySection: ResourceLink[] = []
  if (dbaOrOwner) {
    entitySection.push({
      label: 'CA Secretary of State Business Search',
      description: 'Registered agent, officers, principal address, filing history',
      url: `https://bizfileonline.sos.ca.gov/search/business?SearchType=CORP&SearchCriteria=${encodeURIComponent(dbaOrOwner)}`,
    })
  }
  entitySection.push({
    label: 'CA Franchise Tax Board entity status',
    description: 'Tax suspension / forfeiture status — a major story signal',
    url: 'https://www.ftb.ca.gov/help/business/entity-status-letter.html',
  })
  entitySection.push({
    label: 'SF Clerk — Fictitious Business Name (FBN) statements',
    description: 'DBA filings signed by the owner with home address on record',
    url: 'https://sfclerk.org/county-services/fictitious-business-name-statements/',
  })
  entitySection.push({
    label: 'SF Treasurer — Business search',
    description: 'Tax delinquency, license status',
    url: 'https://sftreasurer.org/business/business-search',
  })

  const locationSection: ResourceLink[] = []
  if (showAddressLinks && address) {
    locationSection.push({
      label: 'SF Property Information Map',
      description: 'Building owner, lot/block, zoning, recorded sales',
      url: `https://propertymap.sfplanning.org/?searchAddress=${encodeURIComponent(address)}`,
    })
    locationSection.push({
      label: 'Google Maps / Street View',
      description: 'Current visual condition, signage, hours',
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    })
    if (dba) {
      locationSection.push({
        label: 'Wayback Machine',
        description: 'Archived web pages for the business name + address',
        url: `https://web.archive.org/web/*/${encodeURIComponent(dba)}`,
      })
    }
  }

  const presenceSection: ResourceLink[] = []
  if (dba) {
    presenceSection.push({
      label: 'Google web search',
      description: 'News coverage, web presence, social handles',
      url: `https://www.google.com/search?q=${encodeURIComponent(dba + ' San Francisco')}`,
    })
    if (showAddressLinks) {
      presenceSection.push({
        label: 'Yelp business search',
        description: 'Reviews, photos, hours, phone (where published)',
        url: `https://www.yelp.com/search?find_desc=${encodeURIComponent(dba)}&find_loc=San+Francisco%2C+CA`,
      })
    }
    presenceSection.push({
      label: 'USPTO trademark search (TESS)',
      description: 'Trademark filings (often have owner contact on record)',
      url: `https://tmsearch.uspto.gov/search/search-information?searchText=${encodeURIComponent(dba)}`,
    })
  }
  if (owner) {
    presenceSection.push({
      label: 'LinkedIn (owner)',
      description: 'Owner’s professional presence and network',
      url: `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(owner)}`,
    })
  }
  if (dbaOrOwner) {
    presenceSection.push({
      label: 'CourtListener (party search)',
      description: 'Federal litigation involving entity or owner',
      url: `https://www.courtlistener.com/?q=${encodeURIComponent(dbaOrOwner)}&type=r`,
    })
  }

  return (
    <div className="glass-card rounded-xl p-4">
      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-1">
        External Resources
      </p>
      <p className="text-[10px] text-slate-500 dark:text-slate-500 leading-relaxed mb-3">
        Open registries where current contact info, ownership filings, and litigation are kept.
        DataDiver doesn&rsquo;t mirror these — they&rsquo;re authoritative when you need to verify or reach someone.
      </p>

      {entitySection.length > 0 && (
        <ResourceSection title="Entity & ownership" links={entitySection} />
      )}
      {locationSection.length > 0 && (
        <ResourceSection title="Property & location" links={locationSection} />
      )}
      {presenceSection.length > 0 && (
        <ResourceSection title="Public presence & records" links={presenceSection} />
      )}
    </div>
  )
}

function ResourceSection({ title, links }: { title: string; links: ResourceLink[] }) {
  return (
    <div className="mt-3 first:mt-0">
      <p className="text-[8px] font-mono uppercase tracking-[0.18em] text-slate-500 dark:text-slate-600 mb-1.5">
        {title}
      </p>
      <ul className="space-y-1.5">
        {links.map((link) => (
          <li key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener"
              className="block px-2 py-1.5 -mx-2 rounded-md
                hover:bg-white/[0.04] transition-colors group"
            >
              <p className="text-[11px] text-emerald-400 group-hover:text-emerald-300 transition-colors flex items-center gap-1">
                {link.label}
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" className="opacity-60">
                  <path d="M3 7l4-4M3 3h4v4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </p>
              <p className="text-[9px] text-slate-500 dark:text-slate-600 mt-0.5">
                {link.description}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
