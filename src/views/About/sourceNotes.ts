// The authored "Known limitations" overlay for the generated sources tables.
// Keys are Socrata 4×4 ids or NON_SOCRATA ids; sourceRows.test.ts fails on a
// key that resolves to no source. Text is reader-facing — keep it in the
// About voice. Two notes are test-pinned (the era clamps).
export const SOURCE_NOTES: Readonly<Record<string, string>> = {
  'nuek-vuh3': 'Publishes with ~12h intrinsic lag; locations are the nearest intersection (~half-block precision)',
  'gnap-fj3t': 'Rolling 48h window; ~30min lag; locations are the nearest intersection (~half-block precision), suppressed on sensitive calls',
  '2zdj-bwza': 'Closed law-enforcement calls; no coordinates',
  'wg3w-h783': '~39h publish lag; rows are charge-level and cases carry supplemental reports — counts are distinct cases (see findings)',
  'tmnf-yvry': 'The 2003–May 2018 extract: a different schema and category vocabulary, read only for ranges before 2018 (see findings)',
  'vw6y-z8j6': '~15h intrinsic lag; locations are address-level',
  'ubvf-ztfx': 'Double lag: ~4–6wk publish + longer fatality coding (see findings)',
  'enwt-3u8m': 'Vision Zero street segments; not updated (historical only)',
  'ab4h-6ztd': 'No coordinates after ~Oct 2025 (see findings); published dates run 1951–2044 at both ends and are data-entry errors, so charts and queries are clamped to 2012–2026',
  'g8m3-pdis': 'DataSF dropped industry labels (Jul 2026) — sectors derived from the raw NAICS code; ~96% of new registrations have no code (see findings)',
  '5cei-gny5': 'Notices filed with the SF Rent Board since 1997 — not completed evictions (see findings)',
  'wmam-7g8d': 'Disclosed tenant buyout agreements since March 2015; declarations excluded, amounts ~96% covered (see findings)',
  // ── Restaurant inspections (Restaurants view) ───────────────────
  // Figures re-measured on data.sf.gov 2026-09-24. Chrome labels on the view
  // stay plain; the specifics behind them live HERE (Jesse's ruling, spec §11).
  'tvy3-wexg': 'Jan. 2, 2024 on, about one row per visit, published about a day behind. On July 1, 2025 the feed thinned: about 1,011 rows a month before, about 297 since (−71%), and the inspection type and census fields went blank on every row. Because the lag is only a day this is a change in what is published, not a delay, and we can’t yet tell whether it means fewer inspections or fewer published — the view never compares the two periods and never draws a trend across the date. One row is dated May 16, 2031 (a data-entry error); every query stops at today. A closed place gets a Closure row at every reinspection until it passes, so closures are counted as episodes and places, never rows. There is no severity flag, so violations are counts, not grades; the notes columns are published empty. Inspectors are named on each inspection as published, and never ranked, filtered or searched — closure rates track an inspector’s territory, not the inspector. Tobacco, massage, pet, laundry and other non-food permits are left out by an authored permit list; food trucks, carts and home kitchens are counted but never mapped',
  '5tti-66ds': 'March 9, 2020 to Aug. 3, 2023, one row per violation, so inspections are counted by distinct ID. Placards (Pass, Conditional Pass, Closure) replaced numeric scores; Conditional Pass is spelled four ways in the data and normalized. Nearly all rows are routine inspections and their follow-ups — complaint and new-ownership visits appear only a handful of times. April and May 2020 hold 10 inspections (COVID), and nothing covers Aug. 2023 to Jan. 2024. No longer updated. Read when DataDiver builds its storefront histories, not live',
  'pyih-qa8i': 'Oct. 2016 to Oct. 2019 (one straggler in Nov.), one row per violation — 26,663 inspections. Scores use the city’s bands (Good 91–100, Adequate 86–90, Needs Improvement 71–85, Poor 70 and under) and are given only on routine inspections, so 47.4% of inspections carry no score by design. No closures are recorded. Scores are never converted to placards or compared with them. Nothing covers mid-October 2019 to March 2020. 3,497 of 6,253 businesses have no coordinates; DataDiver places them by matching the address to the 2024+ set. No longer updated. Read when DataDiver builds its storefront histories, not live',
  'dd-storefront-histories': 'Built by DataDiver from the three inspection sets above and the city business registry (g8m3-pdis), matched by cleaned-up address and name — the two share no ID number. Owners are named exactly as the registry publishes them, including people who own a business in their own name. Search never indexes an individual owner’s name, nor a business name that repeats its individual owner’s name; a business with no registry match is searchable by the name it traded under, even when that name is a person’s. Beside each owner we show only the CITY of its registered mailing address. That is where the city sends the business’s tax and license mail — not where anyone lives, and not where the business is run. Large food-service companies register a head office: Aramark in Philadelphia (259 open food registrations), Compass and Levy in Charlotte (316), Sodexo in Cheektowaga, N.Y. (28), Starbucks in Seattle (32). Of 5,776 open food registrations, 69% list San Francisco and 86% California. Of those 5,776, 47 carry the city’s “0000 Undeliverable Mail” placeholder (about 5,900 across the whole registry), filed under San Francisco; we show no city for them. Ended registrations mostly carry no mailing city at all (38,110 of the registry’s 240,355 ended rows have one, measured Sept. 24, 2026), so a past owner often shows none. Withheld: the mailing street and ZIP of any owner who is a private person — never stored in our file, still public in the registry record at data.sf.gov/d/g8m3-pdis. A company’s mailing address is shown only when every owner registered there — under any spelling of the address — is a company; if any owner registered there is not a company, it is withheld as possibly a home, and the storefronts it lists say so. Where several companies list one mailing address we say only that, after removing undeliverable placeholders, addresses shared by 15 or more mostly non-food owners (registered agents, accountants, mailbox stores), known agent addresses and kitchen incubators, and flagging addresses that are themselves food buildings; we call them one restaurant group only after checking by hand against at least one other public source. Turnover leaves out food halls, stadiums, malls and shared kitchens, and counts an operator only when it was inspected on two or more dates or registered for 90 days or more. Every turnover count is a minimum: a business that opened and closed inside a publishing gap is missing. A closure episode is a run of Closure inspections ending at the next passing inspection; “at most N days” runs to that published pass, and a closure and pass on the same date reads as cleared the same day',
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
  'google-3d-tiles': 'Daylight photo tiles; the dusk look in dark mode is a colour grade, not a night photo',
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
