/**
 * The 59 beat labels — DataDiver's editorial synthesis, NOT an OPD product
 * (OPD names 2 of 59 beat polygons). Method + per-beat evidence:
 * scripts/oakland-beat-names-evidence.json (regenerate via
 * scripts/build-oakland-beat-names.py); full story in the spec
 * (2026-08-06-oakland-front-door-design.md §A) and data-insights.md →
 * Oakland → "How beats get their names".
 *
 * Rules this table was authored under (spec §A3): ≤2 names joined " & ";
 * names come only from the city's official neighborhoods layer, the OPD
 * dispatch layer, or 78s7-673i `fullname`; order follows forward-share
 * order except declared promotions (reverse-share majority or dispatch
 * attestation). Spelling curations, each deliberate:
 *  - 'Lake Merritt'        — city publishes 'LAKE MERRIT' (typo)
 *  - 'Crocker Highlands'   — layer says 'Crocker Highland'
 *  - 'Upper Dimond'        — layer says 'Upper Diamond'; the district's
 *                            accepted spelling is Dimond (the city layer
 *                            contains BOTH spellings)
 *  - 'Hoover-Foster'       — layer says 'Hoover/Foster' (slash collides
 *                            with the " & " joiner register)
 * beatNames.test.ts pins this table bijective against OAKLAND_BEATS.
 * Display-only: state/URL/query keys hold beat CODES everywhere.
 */
export const OAKLAND_BEAT_NAMES: Record<string, string> = {
  '01X': 'Jack London & Waterfront',
  '02X': 'Acorn & Oak Center',
  '02Y': 'Prescott & Port of Oakland',
  '03X': 'Chinatown & Civic Center',
  '03Y': 'Old Oakland',
  '04X': 'Uptown & Gold Coast',
  '05X': 'Ralph Bunche & Oak Center',
  '05Y': 'Outer Harbor & Army Base',
  '06X': 'Hoover-Foster & Longfellow',
  '07X': 'McClymonds & Clawson',
  '08X': 'Pill Hill & Mosswood',
  '09X': 'Piedmont Avenue',
  '10X': 'Golden Gate & Paradise Park',
  '10Y': 'Santa Fe & Longfellow',
  '11X': 'Bushrod',
  '12X': 'Temescal',
  '12Y': 'Rockridge & Shafter',
  '13X': 'Upper Rockridge',
  '13Y': 'Claremont & North Hills',
  '13Z': 'Montclair & Piedmont Pines',
  '14X': 'Adams Point',
  '14Y': 'Grand Lake & Lakeshore',
  '15X': 'Cleveland Heights',
  '16X': 'Trestle Glen & Crocker Highlands',
  '16Y': 'Glenview',
  '17X': 'Clinton & Ivy Hill',
  '17Y': 'Lynn & Bella Vista',
  '18X': 'Rancho San Antonio',
  '18Y': 'Highland Terrace & Tuxedo',
  '19X': 'East Peralta & Waterfront',
  '20X': 'North Kennedy Tract & Hawthorne',
  '21X': 'Meadow Brook & Reservoir Hill',
  '21Y': 'Upper Peralta Creek & Patten',
  '22X': 'Oakmore & Upper Dimond',
  '22Y': 'Joaquin Miller & Woodminster',
  '23X': 'Saint Elizabeth & Fruitvale Station',
  '24X': 'Jefferson & Harrington',
  '24Y': 'Allendale & Bartlett',
  '25X': 'Laurel & Redwood Heights',
  '25Y': 'Caballo Hills & Skyline',
  '26X': 'Melrose',
  '26Y': 'Coliseum & Fitchburg',
  '27X': 'Fairfax & Fremont',
  '27Y': 'Seminary & Havenscourt',
  '28X': 'Maxwell Park & Mills College',
  '29X': 'Millsmont & Frick',
  '30X': 'Arroyo Viejo & Havenscourt',
  '30Y': 'Eastmont & Eastmont Hills',
  '31X': 'Airport & Coliseum Complex',
  '31Y': 'Brookfield Village & Columbia Gardens',
  '31Z': 'Sobrante Park & South Stonehurst',
  '32X': 'North Stonehurst & Iveywood',
  '32Y': 'Foothill Square & Las Palmas',
  '33X': 'Highland & Elmhurst Park',
  '34X': 'Webster & Cox',
  '35X': 'Oak Knoll & Castlemont',
  '35Y': 'Sequoyah & Chabot Park',
  // The two dispatch carve-outs (78s7-673i fullname, curated):
  LKM1: 'Lake Merritt', // the lake itself — 0% neighborhood coverage by design
  PDT2: 'Piedmont', // the enclave CITY (own police force) — OPD events here are edge-rare
}
