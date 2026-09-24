// ZERO-IMPORT LEAF — the schema of the committed snapshot
// `public/data/restaurants/storefronts.json`, written by
// `scripts/build-storefronts.ts` and read by the Restaurants view.
//
// Spec: docs/superpowers/specs/2026-09-24-restaurant-inspections-design.md
// §3.4 (output shape) AS AMENDED BY §11 (Jesse's rulings, 2026-09-24):
//   · owner names are published for EVERY owner, persons included, exactly as
//     the city registry publishes them — `kind` no longer gates the name, it
//     gates address display and `/business/owner/` link eligibility;
//   · the owner's mailing CITY is carried as a plain city name ('Daly City');
//     the undeliverable-placeholder rows carry `mailCity: null`, never
//     'San Francisco' (the placeholder's own city field);
//   · a natural person's mailing STREET or ZIP never enters this file — there
//     is no field for it on StorefrontOwner, by construction;
//   · a company mailing address appears only on SharedMailingAddress, and only
//     when every owner registered at it is a company (ownerGroups.ts).
//
// All dates are 'YYYY-MM-DD' strings (DataSF floating SF-local dates cut to
// the day) — compare them lexicographically, never `Date.parse` them.

/** The three inspection datasets, named by the year each era's records begin:
 *  2016 = `pyih-qa8i` scores, 2020 = `5tti-66ds` placards, 2024 = `tvy3-wexg`. */
export type InspectionEra = 2016 | 2020 | 2024

/** Company vs individual, from `ownerLabel.ownerKind`. 'unknown' = no
 *  registered company suffix but not person-shaped either ('Kungfu Noodle
 *  Express', a blank name). Every non-'company' kind is treated as a possible
 *  person: no mailing address, no owner link, not indexed for search. */
export type OwnerKind = 'company' | 'individual' | 'unknown'

/** Spec §3.7 rule 8 — how the registry explains a parade of names. */
export type TurnoverBucket = 'three-owners' | 'same-owner' | 'owner-returned' | 'owners-unknown'

/** SF's 2016–19 score bands (spec §6). null on an unscored inspection. */
export type ScoreBand = 'Good' | 'Adequate' | 'Needs Improvement' | 'Poor'

/** The placard vocabulary after `CONDI*` misspellings are normalized. */
export type PlacardStatus = 'Pass' | 'Conditional Pass' | 'Closure'

export interface StorefrontOwner {
  /** `ownership_name` exactly as the registry publishes it (whitespace collapsed only). */
  name: string
  kind: OwnerKind
  /** Plain city name from the registration's mailing address, e.g. 'Daly City'.
   *  null for the `0000 Undeliverable Mail` placeholder rows. What a mailing
   *  city means (correspondence, not residence; head offices for big
   *  operators) is DATA-NOTES copy, never chrome. */
  mailCity: string | null
  /** Registry `location_start_date` of the picked registration (the owner bar's start). */
  registeredFrom?: string | null
  /** Registry `location_end_date`; null = still registered at this storefront. */
  registeredTo?: string | null
}

export interface StorefrontOperator {
  /** The name as most often written on its inspection records. */
  name: string
  firstDate: string
  lastDate: string
  /** Distinct inspection dates this operator was seen on. */
  dates: number
  eras: InspectionEra[]
  /** Seen on a single inspection date — rendered "seen once". */
  seenOnce: boolean
  /** Counts toward `chainStrict` (2+ inspection dates or ≥90 days of registry
   *  tenure — the ghost rule, spec §3.7 rule 6). Differs from !seenOnce when
   *  a one-inspection operator was registered for months. */
  strict: boolean
  /** Member of the longest no-overlap sequence over ALL operators (`chainAll`). */
  inChain: boolean
  /** Owner of record by date window; null when no registry row matched. */
  owner: StorefrontOwner | null
}

export interface ScoreReading {
  date: string
  /** Raw `inspection_type` as published in pyih-qa8i. */
  type: string
  /** null = not scored (47.4% of pyih inspections by design, B trap 3). */
  score: number | null
  band: ScoreBand | null
  /** Violations recorded (count of violation rows) — never a severity. */
  violations: number
  /** The name on this inspection. */
  name: string
}

export interface PlacardReading {
  date: string
  status: PlacardStatus
  /** Raw `inspection_type` (the 2020–23 set is routine-only in scope). */
  type: string
  /** 5tti facility id (= `inspection_id` minus its last 8 characters). */
  facility: string
  name: string
}

export interface ClosureEpisode {
  /** tvy3 permit number (era 2024) or 5tti facility id (era 2020). */
  permit: string
  era: 2020 | 2024
  /** First Closure date of the run. */
  start: string
  /** Next published Pass / Conditional Pass on the same permit; null = no later
   *  inspection published (never "still closed"). */
  clearedOn: string | null
  /** clearedOn − start in days ("at most N days"); null when same-day or uncleared. */
  days: number | null
  closureVisits: number
  /** Closed and cleared on the same date — excluded from every day figure. */
  sameDay: boolean
  /** Started on/after FEED_BREAK (2025-07-01) — carries the thin-feed note. */
  afterBreak: boolean
  /** Violation-family ids cited at the closure visits (violationFamilies.ts). */
  familyIds: string[]
}

export interface Storefront {
  /** storefrontKey() of the door — the `?at=` value. */
  key: string
  /** Display address. */
  address: string
  nhood: string | null
  lat: number | null
  lng: number | null
  /** 2024+ permit numbers seen at this door — what Q4 fetches live and how a
   *  live map row (keyed by permit) finds its storefront. */
  permits: string[]
  /** Every operator ever seen here, all eras, oldest first. */
  operators: StorefrontOperator[]
  chainStrict: number
  chainAll: number
  /** null when the storefront does not meet the turnover bar (chainStrict ≥ 3
   *  across ≥ 2 eras) or failed an eligibility filter. */
  turnoverBucket: TurnoverBucket | null
  lanes: {
    scores2016: ScoreReading[]
    placards2020: PlacardReading[]
  }
  /** 2020+ closure episodes at this door, all permits (the biography). */
  episodes: ClosureEpisode[]
  /** The CURRENT permit meets the repeat bar (D5 — a storefront never inherits
   *  a closure from an earlier tenant). */
  repeatCurrent: boolean
}

/** "Registered to one company at 3+ storefronts" — company owners only (a
 *  list of a PERSON's holdings is exactly the tool §11 rules out). */
export interface VisibleOwner {
  name: string
  kind: 'company'
  mailCity: string | null
  /** Distinct storefront keys among the owner's open food registrations. */
  storefronts: string[]
  /** Distinct trade names across those registrations. */
  brands: string[]
  /** CONTRACT_OPERATORS id when this is a contract food-service company
   *  (rendered under a turn-down, not in the ranking); null otherwise. */
  contract: string | null
}

/** "One sign, many owners" — the franchise inversion. */
export interface FranchiseBrand {
  brand: string
  /** Distinct storefront keys under the brand. */
  locations: number
  owners: { name: string; kind: OwnerKind; storefronts: string[] }[]
}

/** The shared-mailing-address FACT, published automatically after filters
 *  F1–F5 — never worded as common ownership. Present only when EVERY owner
 *  registered at the address is a company. */
export interface SharedMailingAddress {
  /** ownerGroups.mailingKey — the `?group=`-style id for this address. */
  key: string
  /** The street line as most often registered. */
  address: string
  city: string | null
  zip: string | null
  /** Distinct food-business companies registered to this mailing address. */
  companies: string[]
  brands: string[]
  storefronts: string[]
  /** F4: the mailing address is itself a building with 3+ food tenants (flag, don't drop). */
  foodBuilding: boolean
}

export type GroupEvidenceKind =
  | 'registry-mailing-address'
  | 'shared-trade-name'
  | 'group-website'
  | 'abc-licensee-address'
  | 'sos-agent-address'

export interface GroupEvidence {
  kind: GroupEvidenceKind
  /** Where a reader can check it (https). */
  url: string
  /** 'YYYY-MM-DD' the evidence was last checked by hand. */
  checked: string
  /** One plain sentence: what this source shows. */
  detail: string
}

/** A curated "same restaurant group" CLAIM (src/cities/sf/restaurantGroups.ts). */
export interface CuratedGroup {
  /** Slug, the `?group=` value. */
  id: string
  /** Reader-facing label, by brands: "Super Duper, Beretta, Delarosa +10". */
  label: string
  brands: string[]
  /** Registered owner names, exactly as the registry publishes them. */
  companies: string[]
  /** ≥ 2 distinct evidence kinds (gate G6). */
  evidence: GroupEvidence[]
}

/** A curated group as copied into the snapshot, storefronts resolved. */
export interface SnapshotGroup extends CuratedGroup {
  storefronts: string[]
}

/** One bar of the publishing strip (spec §4.1) — each era in its own unit. */
export interface PublishingCount {
  era: InspectionEra
  year: number
  inspections: number
}

export interface StorefrontSnapshot {
  /** 'YYYY-MM-DD' the generator ran against the live portal. */
  asOf: string
  storefronts: Storefront[]
  owners: VisibleOwner[]
  franchises: FranchiseBrand[]
  sharedAddresses: SharedMailingAddress[]
  /** Shared-address clusters that survived F1–F5 but are withheld because at
   *  least one registration there is not a company (possibly a home). */
  withheldSharedCount: number
  groups: SnapshotGroup[]
  publishing: PublishingCount[]
  /** Addresses left out of turnover as venues, multi-tenant or mostly
   *  non-storefront permits — the {N} in the Turnover tab disclosure. */
  excludedAddresses: number
  /** The generator's build figures. The full shape is `SnapshotStats` in
   *  scripts/build-storefronts.ts (it names generator-side types); these are
   *  the fields the page reads. */
  stats?: SnapshotReaderStats
}

/** The build figures the page reads off the snapshot. */
export interface SnapshotReaderStats {
  /** Storefront permits whose current operator matched a registration. */
  registryMatch?: { matched: number; total: number }
  /** Vermin cited at {n} of the {m} closure inspections since January 2024. */
  vermin?: { n: number; m: number }
}
