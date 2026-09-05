// The authored "Known limitations" overlay for the generated sources tables.
// Keys are Socrata 4×4 ids or NON_SOCRATA ids; sourceRows.test.ts fails on a
// key that resolves to no source. Text is reader-facing — keep it in the
// About voice. Two notes are test-pinned (the era clamps).
export const SOURCE_NOTES: Readonly<Record<string, string>> = {
  'nuek-vuh3': 'Publishes with ~12h intrinsic lag',
  'gnap-fj3t': 'Rolling 48h window; ~30min lag; no coordinates',
  '2zdj-bwza': 'Closed law-enforcement calls; no coordinates',
  'wg3w-h783': '~39h publish lag; rows are charge-level and cases carry supplemental reports — counts are distinct cases (see findings)',
  'tmnf-yvry': 'The 2003–May 2018 extract: a different schema and category vocabulary, read only for ranges before 2018 (see findings)',
  'vw6y-z8j6': '~15h intrinsic lag',
  'ubvf-ztfx': 'Double lag: ~4–6wk publish + longer fatality coding (see findings)',
  'enwt-3u8m': 'Vision Zero street segments; updated annually',
  'ab4h-6ztd': 'No coordinates after ~Oct 2025 (see findings); published dates run 1951–2044 at both ends and are data-entry errors, so charts and queries are clamped to 2012–2026',
  'g8m3-pdis': 'DataSF dropped industry labels (Jul 2026) — sectors derived from the raw NAICS code; ~96% of new registrations have no code (see findings)',
  '5cei-gny5': 'Notices filed with the SF Rent Board since 1997 — not completed evictions (see findings)',
  'wmam-7g8d': 'Disclosed tenant buyout agreements since March 2015; declarations excluded, amounts ~96% covered (see findings)',
  'pitq-e56w': 'SF filings only — excludes state FPPC/CAL-ACCESS',
  'n9pm-xkyq': '7.9M rows, FY2007+; basis of the ad-spend compliance work',
  'cqi5-hm2d': 'FY2018+',
  'sf-elections-results': 'NOT on DataSF — the Department of Elections publishes no results to the open data portal. Certified spreadsheets, read from the Department’s own archive (see findings)',
  'sf-precincts-2022': 'Precinct geometry, Nov 2022 onward',
  'sf-precincts-2012': 'Precinct geometry through Jun 2022 — precinct numbers are NOT comparable across the 2022 renumbering (see findings)',
  // Merged from two near-duplicate per-city notes in the old hand-maintained
  // tables (SF's said "NOT on DataSF ... 41 Analysis Neighborhoods"; Oakland's
  // said "NOT on the city portal ... 10 demographic regions") — acs-2023-5yr
  // is one NON_SOCRATA entry shared by both cities, so one key must now carry
  // both. See task-10-report.md for the full note.
  'acs-2023-5yr': 'NOT on either portal — U.S. Census Bureau estimates, published by block group (San Francisco) and census tract (Oakland) and summed here to the neighborhoods and regions each map is drawn on. Six SF measures (poverty, unemployment and the four commute shares) are averaged up from census tracts using the city’s official tract-to-neighborhood assignment',
  'ppgh-7dqv': 'Charge-level rows — every count dedupes by case number; the HOMICIDE code (mostly coroner death investigations) is split so it does not read as a murder count; ~3.4% carry no-location beat codes (77X/99X); clamped to 2004+ (earlier rows are a junk trickle)',
  'quth-gb8e': 'Coordinates from the srx/sry fields — the dataset’s own address point is junk; publishes next-day',
  '58em-y96b': 'Publishes ~11 weeks behind; violation descriptions carry a 10-character truncation era, so codes are grouped instead',
  'oak-beats': 'Vendored as the 59-beat spine; the layer names only 2 of its 59 polygons',
  'oak-neighborhoods': 'The official 131-polygon layer — it names DataDiver’s beat labels and, dissolved by its own code prefixes, defines the 10 demographic regions (see findings)',
  '3xq4-ermg': 'FPPC filings arrive in semiannual lumps — recent months are structurally incomplete until the next deadline',
  'bvfu-nq99': '1,553 rows carry no date ($3.39M) — disclosed in the view',
  'jkj3-8yq3': 'Its date field differs from every sibling schedule (exp_date, not expn_date)',
  'rsxe-vvuw': 'Registered, not yet read by a view; deliberately never summed (its cumulative-ish figures fabricate money)',
  '4fu2-d832': 'Registered, not yet read by a view; published empty',
  'qaa7-q29f': 'Registered, not yet read by a view',
  'ba44-jqtm': 'Registered, not yet read by a view',
  'x5eg-xkea': 'Registered, not yet read by a view',
  '9gcg-vghr': 'Registered, not yet read by a view',
  'xuui-k2nt': 'Registered, not yet read by a view',
  'qunm-zyau': 'Registered, not yet read by a view',
  'jft9-u9bd': 'Registered, not yet read by a view',
  'ub5g-m92u': 'Registered, not yet read by a view',
  '6ejr-39gh': 'Registered, not yet read by a view',
  'eted-3m9d': 'Registered, not yet read by a view',
}
