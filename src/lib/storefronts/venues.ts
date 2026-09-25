// ZERO-IMPORT LEAF — the authored venue list (spec §3.7 rule 4, F5).
//
// WHY AN AUTHORED LIST. A naive "most names at one address" ranking is 25 of
// 25 venues (E §2): the ballpark, Chase Center, the Permit Center's placeholder
// address, Stonestown, the Ferry Building, La Cocina's incubator kitchen. Many
// businesses at one of these doors is the building's job, not turnover. The
// single-tenant test (nameChain.isMultiTenant) catches most of them from the
// data; this list is the belt to that test's braces, and it is also filter F5
// on the shared-mailing-address side (an incubator's tenants share its
// address for the same reason they share its kitchen).
//
// Entries are STOREFRONT KEYS (storefrontKey.ts output), so a new spelling in
// the data is handled by the normalizer, not by a new row here.
// venues.test.ts pins every raw spelling the probes saw to its entry.
//
//   match 'exact'   the key equals `key`
//   match 'prefix'  the key is `key` or starts with `key + ' '` — for doors
//                   the city writes with and without a suffix ('24 WILLIE
//                   MAYS', '24 WILLIE MAYS PL', '24 WILLIE MAYS PLZ')

export type VenueKind =
  | 'placeholder'
  | 'stadium'
  | 'mall'
  | 'food-hall'
  | 'incubator'
  | 'commissary'
  | 'campus'
  | 'transit'
  | 'convention'
  | 'market'

export interface Venue {
  key: string
  match: 'exact' | 'prefix'
  label: string
  kind: VenueKind
}

export const VENUES: readonly Venue[] = [
  { key: '49 S VAN NESS AVE', match: 'exact', label: 'Permit Center (placeholder address for plan-check permits)', kind: 'placeholder' },
  { key: '3RD ST & KING ST', match: 'exact', label: 'Oracle Park (stadium concessions)', kind: 'stadium' },
  { key: '24 WILLIE MAYS', match: 'prefix', label: 'Oracle Park', kind: 'stadium' },
  { key: '1 WARRIORS WAY', match: 'exact', label: 'Chase Center', kind: 'stadium' },
  { key: '300 TONI STONE', match: 'prefix', label: 'Chase Center plaza', kind: 'stadium' },
  { key: '3251 20TH AVE', match: 'exact', label: 'Stonestown Galleria', kind: 'mall' },
  { key: '1 FERRY BLDG', match: 'exact', label: 'Ferry Building', kind: 'food-hall' },
  { key: '2948 FOLSOM ST', match: 'exact', label: 'La Cocina (incubator kitchen)', kind: 'incubator' },
  { key: '103 HORNE AVE', match: 'exact', label: 'Food-truck base (Hunters Point)', kind: 'commissary' },
  { key: '428 11TH ST', match: 'exact', label: 'SoMa StrEat Food Park', kind: 'food-hall' },
  { key: '90 CHARTER OAK AVE', match: 'exact', label: 'Shared kitchen complex', kind: 'commissary' },
  { key: '601 MISSION BAY BLVD', match: 'prefix', label: 'Mission Bay food-truck stop', kind: 'market' },
  { key: '601 N MISSION BAY BLVD', match: 'exact', label: 'Mission Bay food-truck stop', kind: 'market' },
  { key: '601 MISSION BLVD', match: 'exact', label: 'Mission Bay food-truck stop', kind: 'market' },
  { key: '845 MARKET ST', match: 'exact', label: 'Westfield San Francisco Centre', kind: 'mall' },
  { key: '865 MARKET ST', match: 'exact', label: 'Westfield San Francisco Centre', kind: 'mall' },
  { key: '1737 POST ST', match: 'exact', label: 'Japan Center', kind: 'mall' },
  { key: '1581 WEBSTER ST', match: 'exact', label: 'Japan Center', kind: 'mall' },
  { key: '22 PEACE PLZ', match: 'exact', label: 'Japan Center', kind: 'mall' },
  { key: '900 N POINT ST', match: 'exact', label: 'Ghirardelli Square', kind: 'mall' },
  { key: '2801 LEAVENWORTH ST', match: 'exact', label: 'The Cannery', kind: 'mall' },
  { key: '1000 VAN NESS AVE', match: 'exact', label: '1000 Van Ness (multi-tenant building)', kind: 'mall' },
  { key: 'PIER 39', match: 'exact', label: 'Pier 39', kind: 'mall' },
  { key: '1 MARKET PLZ', match: 'exact', label: 'One Market Plaza', kind: 'mall' },
  { key: '1 MARKET PL', match: 'exact', label: 'One Market Plaza', kind: 'mall' },
  { key: '50 POST ST', match: 'exact', label: 'Crocker Galleria', kind: 'mall' },
  { key: '135 4TH ST', match: 'exact', label: 'Metreon', kind: 'mall' },
  { key: '170 OFARRELL ST', match: 'exact', label: "Macy's Union Square", kind: 'mall' },
  { key: '55 MUSIC CONCOURSE', match: 'prefix', label: 'Golden Gate Park museums', kind: 'campus' },
  { key: '301 VAN NESS AVE', match: 'exact', label: 'War Memorial Opera House', kind: 'campus' },
  { key: '425 MISSION ST', match: 'exact', label: 'Salesforce Transit Center', kind: 'transit' },
  { key: '747 HOWARD ST', match: 'exact', label: 'Moscone Center', kind: 'convention' },
  { key: '2 MARINA BLVD', match: 'exact', label: 'Fort Mason Center', kind: 'convention' },
]

/** The venue entry a storefront key falls under, or null. */
export function venueFor(key: string): Venue | null {
  for (const v of VENUES) {
    if (key === v.key) return v
    if (v.match === 'prefix' && key.startsWith(`${v.key} `)) return v
  }
  return null
}

export function isVenue(key: string): boolean {
  return venueFor(key) !== null
}
