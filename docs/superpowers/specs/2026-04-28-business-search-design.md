# Business Search & Owner/Chain Drill-Down — Design Spec

**Date:** 2026-04-28
**Author:** Jesse Garnier + Claude
**Status:** Draft for review
**Branches:** Each PR ships separately off `main`.

## Motivation

The Business Activity view shows aggregate openings/closures patterns well, but a journalist following a specific lead — *"who owns the building that just lost three businesses?"*, *"what else does Boudin Bakery operate?"*, *"where did Mission Pie go?"* — currently has no path through the data. There is also no addressable detail page per business (only a sidebar panel that opens via map click on the existing view).

This spec covers the foundational schema work and the new search-and-drill experience. Longevity visualization (PR 4) and a standalone Restaurants viz (PR 5) are tracked separately.

## PR sequence

| PR | Branch | Scope | Dependencies |
|---|---|---|---|
| 1 | `fix/card-tray-compact-viewport` | Pill bug — expanded cards force-minimize globally | None |
| 2 | `feat/business-schema-enrichment` | New fields (BAN, location dates, admin closure, corridor, multi-NAICS) wired through types + Business Activity view | None |
| 3 | `feat/business-search` | New `/business` route: search → profile → chain/owner profile | PR 2 |
| 4 | `feat/business-longevity` | Longevity map mode + Old Guard sidebar in Business Activity | PR 2 (uses tenure logic) |
| 5 | `feat/restaurants-view` | New `/restaurants` view + integration with business profile | PR 3 |

## Decisions confirmed

- **Owner clustering (Q1)**: BAN (`certificate_number`) is canonical. `ownership_name` is advisory and surfaced through a "Similar names" expander in the chain/owner profile, not used for primary clustering.
- **Chain definition (Q2)**: BAN-based — same `certificate_number` across multiple `uniqueid` records is one chain. DBA-similarity-based franchise grouping is a future enhancement.
- **Anomaly mode rename**: In PR 4, rename Business Activity's "Anomaly" map mode to "Net Growth" to disambiguate from temporal-anomaly modes used elsewhere. (Defer for PR 4 since it ships alongside Longevity.)
- **Contact information stance (Q3)**: DataDiver does **not republish phone numbers, personal emails, or other personal contact data**. Instead, every Business / Chain / Owner profile includes an `ExternalResourcesCard` that deep-links to authoritative public registries (CA SOS, FTB, property records, court filings, FBN statements) where current contact info lives. Mailing addresses from the registered-business dataset *are* surfaced because (a) the SF business registry is itself a public registry, (b) the mailing address is administrative rather than personal, and (c) divergence from physical address is a journalistically meaningful signal.

---

## PR 2 — Schema enrichment

Foundation work that makes PR 3 possible.

### Type changes
`src/types/datasets.ts` — extend `BusinessLocationRecord`:
```ts
interface BusinessLocationRecord {
  uniqueid: string
  certificate_number: string             // NEW — BAN, canonical entity ID
  ttxid?: string                          // NEW — per-location ID
  dba_name?: string
  ownership_name?: string
  full_business_address?: string
  city?: string
  business_zip?: string
  dba_start_date: string
  dba_end_date?: string
  location_start_date?: string            // NEW — relocation tracking
  location_end_date?: string              // NEW
  administratively_closed?: string        // NEW — "Yes" / "No" / null
  naic_code?: string
  naic_code_description?: string
  naics_code_descriptions_list?: string   // NEW — comma-separated list
  lic?: string                            // NEW — SF license code
  lic_code_description?: string           // NEW
  parking_tax: boolean
  transient_occupancy_tax: boolean
  business_corridor?: string              // NEW — SF corridor name
  community_benefit_district?: string     // NEW — CBD member
  supervisor_district?: string
  mailing_address_1?: string              // NEW — owner mailing address (often differs from physical)
  mail_city?: string                      // NEW
  mail_state?: string                     // NEW
  mail_zipcode?: string                   // NEW
  location?: { coordinates: [number, number]; type: string }
}
```

### Business Activity view changes
1. **`BusinessDetailPanel`** — add fields: BAN, license code, corridor, CBD, "Forced closure" badge when `administratively_closed === "Yes"`. Surface mailing address as a separate line when it differs from the physical address (a journalistic signal: absentee owner, registered-agent forwarding, out-of-state holding company).
2. **Closure stat card** — add a chevron expansion that splits closures into "Voluntary" vs "Administrative". Continues showing combined total at the top level.
3. **New filter chip — Corridor** — alongside neighborhoods, single-select dropdown of distinct `business_corridor` values.
4. **`useBusinessActivityData`** — add per-neighborhood admin-closure count. Other math unchanged in this PR.
5. **Multi-NAICS in `SectorFilter`** — when `naics_code_descriptions_list` is present, count the business in *each* listed sector (not just the primary). This is a behavior change — call out in the existing "About this data" explainer.

### Migration consideration
The `$select` field list in `BusinessActivity.tsx` (line 40) needs the new fields. Existing aggregation queries unchanged — sectors still group by `naic_code_description` for now (multi-list is client-side enrichment in v1).

### Estimated scope
1–2 days. One subagent for the type + view-update work, no parallel split needed.

---

## PR 3 — Business Search + Profile + Chain/Owner Profile

### Routes
| Route | Component | Purpose |
|---|---|---|
| `/business?q=...&sector=...&corridor=...&status=...&tenure=...` | `BusinessSearch` | Level 1 — search & filter list |
| `/business/:uniqueid` | `BusinessProfile` | Level 2 — single business |
| `/business/chain/:ban` | `ChainProfile` | Level 3a — BAN cluster |
| `/business/owner/:name` | `OwnerProfile` | Level 3b — owner-name cluster (advisory) |

The existing `?detail=uniqueid` URL param on `/business-activity` continues to open the side panel (no change). It also adds an "Open full profile →" link that routes to `/business/:uniqueid`.

### File layout
```
src/views/BusinessSearch/
  BusinessSearch.tsx        — Level 1 landscape
  BusinessProfile.tsx       — Level 2 dossier
  ChainProfile.tsx          — Level 3a BAN cluster
  OwnerProfile.tsx          — Level 3b owner cluster
  components/
    BusinessRow.tsx         — search result row
    BusinessTimelineStrip.tsx — open → close timeline
    SiblingLocationsTable.tsx — chain locations table
    SimilarNamesExpander.tsx  — owner advisory expander
    AddressNeighborsTable.tsx — same-address turnover

src/hooks/
  useBusinessSearch.ts      — debounced LIKE on dba_name + ownership_name + address + BAN
  useBusinessProfile.ts     — single business + sibling locations + same-address neighbors
  useChainProfile.ts        — BAN aggregation
  useOwnerProfile.ts        — ownership_name aggregation (with disambiguation count)
  useBusinessFeatured.ts    — top oldest, recent notable closures, biggest chains (for empty state)
```

### Level 1 — `BusinessSearch` UX

**Layout** (mirrors `VendorExplorer` shape but with table-style rows since there's no "spend" amount to bar-chart):
- Top: search input (debounced 300ms), filter chip row, sort dropdown
- Middle: results list — virtual scroll if > 200 rows
- When query is empty: featured collections — "SF's oldest active businesses", "Notable recent closures", "Largest chains", "Recent newcomers"

**Search fields** (single text query, OR'd across):
- `UPPER(dba_name) LIKE '%Q%'`
- `UPPER(ownership_name) LIKE '%Q%'`
- `UPPER(full_business_address) LIKE '%Q%'`
- `certificate_number = 'Q'` (exact, only if Q is all digits)

**Filter chips** (URL-synced, all optional):
- Sector (multi via existing `SectorFilter` rendered as compact dropdown)
- Neighborhood (single)
- Business corridor (single)
- Status: Active | Closed (voluntary) | Closed (administrative) | All
- Tenure: Any | 5+ years | 10+ years | 25+ years
- Tax flags: Parking tax | Hotel tax (toggle pills)

**Sort options**:
- Relevance (default when query present — matches in dba_name first)
- Tenure DESC (oldest first)
- Recent activity (sorted by most recent of dba_start_date/dba_end_date)
- Alphabetical

**Empty state collections** (no query):
- *SF's old guard* — top 30 currently-active businesses by tenure
- *Recent notable closures* — top 20 most-tenured businesses closed in last 90 days
- *Largest chains* — top 15 BANs by location count, with link to chain profile

### Level 2 — `BusinessProfile` UX

Two-column dossier layout, same as `VendorProfile`.

**Header**:
- Eyebrow: status pill ("Active since 2003" / "Closed Mar 2024" / "Forced closure Mar 2024")
- H2 italic display: DBA name
- Subline: owner · BAN · sector
- ShareLinkButton + CSV export (export this business + sibling locations of same BAN)

**Baseball card row** (compact stats):
- Opened FY · Age · Sector(s) · Neighborhood · Corridor · Tax flags · Admin-closed flag

**Left column**:
1. **Mini map** — location with neighborhood + corridor outline highlighted
2. **Lifecycle timeline** — horizontal strip showing `dba_start_date → dba_end_date` (or "ongoing"), with location moves marked when `location_start_date / location_end_date` differ
3. **Same-address neighbors table** — what else operated at this address, by year. Click → that business profile

**Right column**:
1. **Other locations of this business (chain)** — only renders if same BAN has multiple `uniqueid`s. Mini map + table. "View full chain profile →" link
2. **Same owner's other businesses** — only renders if `ownership_name` matches 2+ distinct BANs. Compact table with caveat tooltip ("Owner names are free-text; use the chain link for canonical groupings"). "View owner profile →" link
3. **Health inspections** — placeholder in PR 3 (renders only when PR 5 ships); shows "Restaurant inspection data available — view restaurant profile" link
4. **Mailing address** — only renders if mailing address differs from physical address. Shown as a labeled line; surfaces absentee/registered-agent setups
5. **External resources** — see "Journalist resources & external deep links" section below. This is the single most important section for journalist workflow: walks users from the business directly to the source-of-truth registries (CA SOS, FTB, property records, court filings) where contact information and corporate filings live
6. **Source attribution** — `DataSourceLine`

### Level 3a — `ChainProfile` UX

**Header**: H2 italic = primary DBA name (mode of all locations under BAN); subline = BAN, total locations.

**Body**:
- Map of all locations under BAN (closed locations dimmed)
- Stats row: total locations · active · closed · oldest open · neighborhoods covered
- Locations table: dba_name, address, neighborhood, opened, closed/active, click → BusinessProfile
- Sector mix donut (in case of multi-sector chain)
- Open vs closed cohort over time (stacked area)

### Level 3b — `OwnerProfile` UX

**Header**: H2 italic = owner name (toSentenceCase); subline = "X distinct businesses, Y locations".

**Disambiguation banner** (always shown):
> Owner names in the SF business registry are free-text. This page groups by the exact `ownership_name` field. Variants like "Smith John" vs "John Smith LLC" are *not* combined.

**Body**:
- All BANs owned by this name, each linking to ChainProfile (or directly to single profile if BAN has only one location)
- Sectors operated in
- Geographic spread (list of neighborhoods)
- *Similar names* expander — runs a fuzzy LIKE on the surname/first-token, lists candidate matches with location counts. Each is a link to that owner's profile.
- **External resources** — same component as on `BusinessProfile`, but keyed on owner name rather than DBA. Emphasizes person-and-entity registries (CA SOS, LinkedIn, court filings, FBN statements) and de-emphasizes address-keyed links

### Hook contracts

```ts
// useBusinessSearch.ts
interface BusinessSearchResult {
  uniqueid: string
  certificate_number: string
  dba_name: string
  ownership_name: string
  address: string
  neighborhood?: string
  sector: string
  status: 'active' | 'closed' | 'admin-closed'
  startDate: string
  endDate?: string
  ageYears: number
}
function useBusinessSearch(
  query: string,
  filters: SearchFilters,
  sort: SortKey
): { results: BusinessSearchResult[], totalCount: number, isLoading: boolean, error: string | null }
```

```ts
// useBusinessProfile.ts
function useBusinessProfile(uniqueid: string): {
  business: BusinessDetail | null
  siblingLocations: BusinessLocationRecord[]    // same BAN, other uniqueids
  ownerOtherBusinesses: BusinessLocationRecord[] // same ownership_name, different BAN
  addressNeighbors: BusinessLocationRecord[]     // same address, different uniqueid
  isLoading: boolean
  error: string | null
}
```

```ts
// useChainProfile.ts
function useChainProfile(ban: string): {
  primaryDbaName: string
  locations: BusinessLocationRecord[]
  stats: {
    total: number
    active: number
    closed: number
    oldestActive: string | null
    neighborhoods: string[]
    sectors: { sector: string; count: number }[]
  }
  cohortByYear: { year: number; opened: number; closed: number; netActive: number }[]
  isLoading: boolean
}
```

```ts
// useOwnerProfile.ts
function useOwnerProfile(ownershipName: string): {
  bans: { ban: string; primaryDba: string; locationCount: number }[]
  totalLocations: number
  sectors: string[]
  neighborhoods: string[]
  similarNameMatches: { name: string; locationCount: number }[]
  isLoading: boolean
}
```

### OmniSearch index extension
`src/components/search/useOmniSearch.ts` — extend `buildIndex()` to include:
- Top 200 currently-active businesses by tenure (label = DBA name, sublabel = "Business · " + neighborhood, path = `/business/:uniqueid`)
- Top 50 BANs with the most locations (chains) (label = primary DBA, sublabel = "Chain · X locations", path = `/business/chain/:ban`)
- These pull from a small pre-computed JSON manifest, not live Socrata, to keep the OmniSearch index instant. The manifest is regenerated periodically (separate concern, deferred to PR 3.5).

For PR 3, OmniSearch can do **live LIKE search via Socrata** behind the static index — when a query has no matches in the static index, fire a debounced query to find businesses by name and inject them as live results. This adds ~1 query per search but keeps the experience seamless.

### Estimated scope
3–5 days. Subagent-friendly split:
1. Schema + types (PR 2, prerequisite — already separate)
2. `BusinessSearch` + `useBusinessSearch` + result row component
3. `BusinessProfile` + `useBusinessProfile` + sibling/neighbor tables
4. `ChainProfile` + `useChainProfile`
5. `OwnerProfile` + `useOwnerProfile` + similar-names fuzzy
6. OmniSearch index extension
7. Top-nav route entry + AppShell wiring

Tasks 2–5 can run in parallel after 1 lands. Task 6 + 7 land last.

---

### Journalist resources & external deep links

A guiding principle for DataDiver: **personal and corporate contact information is essential for journalism, but DataDiver should not republish it**. Instead, the application walks users directly to the authoritative public registries where current, sourceable contact data lives. This avoids staleness, privacy harm, and the "DataDiver scraped my phone number" failure mode while still serving the journalist's actual need: getting a callable number, a registered agent address, or a litigation history in two clicks.

The `ExternalResourcesCard` component is reused by `BusinessProfile`, `ChainProfile`, and `OwnerProfile`. It accepts the entity context as props and renders a compact 3-section card.

#### Section 1 — Entity & ownership records

| Label | URL template | What it answers |
|---|---|---|
| CA Secretary of State Business Search | `https://bizfileonline.sos.ca.gov/search/business?SearchCriteria={dbaOrOwner}&SearchType=CORP` | Registered agent name + address (callable contact for legal/press inquiries), officers, principal address, filing history, dissolution status |
| CA Franchise Tax Board entity status | `https://www.ftb.ca.gov/help/business/entity-status-letter.html` (search form, prefill where possible) | Tax suspension/forfeiture — a major story signal |
| Fictitious Business Name (FBN) — SF Clerk | `https://sfclerk.org/county-services/fictitious-business-name-statements/` | DBA filings; the document signed by the owner with home address (legally) |
| SF Treasurer & Tax Collector — Business search | `https://sftreasurer.org/business/business-search` (BAN-keyed if URL pattern allows; otherwise generic) | Tax delinquency, license status |

#### Section 2 — Property, location & physical history

| Label | URL template | What it answers |
|---|---|---|
| SF Property Information Map (by address) | `https://propertymap.sfplanning.org/?searchAddress={address}` | Building owner, lot/block, zoning, recorded sales |
| SF Planning permits (by address) | `https://sfplanninggis.org/PIM/?address={address}` | Use changes, planning history |
| Google Maps / Street View | `https://www.google.com/maps/search/?api=1&query={addressEncoded}` | Current visual condition; signage; hours; phone (when published) |
| Wayback Machine (DBA + address) | `https://web.archive.org/web/*/{dbaSlug}` | Archived web presence — finding old business URL with then-current contact info |

#### Section 3 — Public presence & records (research)

| Label | URL template | What it answers |
|---|---|---|
| Google web search | `https://www.google.com/search?q={dba}+{neighborhood}+San+Francisco` | News coverage, web presence, social handles |
| Yelp business search | `https://www.yelp.com/search?find_desc={dba}&find_loc=San+Francisco%2C+CA` | Reviews, photos, hours, phone (where published) |
| LinkedIn (owner) | `https://www.linkedin.com/search/results/all/?keywords={ownerName}` | Owner's professional presence and network |
| USPTO trademark search (TESS) | `https://tmsearch.uspto.gov/search/search-information?searchText={dba}` | Trademark filings (often have owner contact info on record) |
| CourtListener (party search) | `https://www.courtlistener.com/?q={dbaOrOwner}&type=r` | Federal litigation involving entity or owner |
| SF Superior Court Smart Search | `https://sfsuperiorcourt.org/online-services/case-information` | Local civil/small-claims actions |

#### Implementation notes

- All links open in new tabs (`target="_blank" rel="noopener"`).
- URL templates are deterministic — no fetching, no scraping, no rate limit concerns.
- Each link has a small label *under* it explaining what to expect there (e.g., "Free, requires search confirmation"). This helps journalists not waste time.
- For `OwnerProfile` (no specific address), Section 2 is collapsed/hidden; Section 3's Yelp link is omitted.
- The card has a one-line preamble: *"Open registries where current contact info, ownership filings, and litigation are kept. DataDiver doesn't mirror these — they're authoritative when you need to verify or reach someone."*

#### Future enhancements (not in PR 3)

- **SF Sheriff's Department civil filings** — eviction and writ of possession lookups, if a public-search URL exists
- **CA Department of Consumer Affairs license lookup** — for licensed trades (contractor, salon, etc.) keyed by `lic_code`
- **OpenCorporates** (paid tier has free search) — multi-jurisdiction corporate filings
- **EEOC charge search** — federal employment cases (limited public access)

## Open considerations (do not block PR 3)

- **Address normalization** — "123 Main St" vs "123 Main Street" vs "123 MAIN ST". Same-address neighbors and address-based joins (PR 5) need a canonical form. Probably defer until PR 5 forces the issue.
- **Stale BAN data** — `data_as_of` field is on the dataset. Show on profile footer.
- **Chain ownership over time** — BAN can change hands without showing in this dataset. Out of scope.
- **Performance** — Single-business profile fires ~3 Socrata queries (business + siblings + address neighbors). Owner profile may fire more. Module-level cache with 15min TTL keyed on `(uniqueid|ban|name)`, mirroring `useDeficitData` and `useNeighborhoodProfiles`.
- **CSV export from search results** — useful but defer to PR 3.5 unless trivial.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Free-text owner clustering produces misleading groupings | Medium | Medium | Always show the disambiguation banner; lead users to chain (BAN) profile when possible |
| Multi-NAICS double-counting in sector filter | Low | Low | Document in "About this data"; toggleable behavior if it confuses users |
| Same-address neighbors query is expensive (ILIKE on full_business_address) | Medium | Medium | Index by exact-string match first; fall back to UPPER LIKE; cache aggressively |
| `certificate_number` not always populated on older records | Low | Medium | Fall back to `(dba_name, ownership_name)` tuple for old records; surface caveat in profile |

## Self-review checklist (before "ready for implementation")

- [ ] All four route patterns are unique and not in conflict with existing routes
- [ ] Hook return shapes are consistent with existing hooks (loading/error pattern)
- [ ] No new top-level CSS variables or color tokens
- [ ] Detail panel deep-link (`?detail=`) on Business Activity view continues to work
- [ ] OmniSearch results stay under 8 visible entries even with business additions
- [ ] All new components are explanatory-style commentable (clear purpose, well-named)
