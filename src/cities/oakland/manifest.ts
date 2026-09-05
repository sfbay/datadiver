// src/cities/oakland/manifest.ts
import type { ViewManifestEntry } from '../manifest'

/**
 * Six entries carrying Oakland's per-dataset era facts and ⌘K claims.
 * All six are now LIVE — stage 3 brought crime-incidents and 311-cases up
 * first; stage 3b flipped parking-citations and campaign-finance, so every
 * /oakland/* slug renders a real view; stage 5a adds demographics, the one
 * entry painting REGIONS rather than beats. navLabels/pigments mirror SF's
 * per-view values (same dataset family = same pigment in every city);
 * homeCard fields drive the /oakland landing grid (stage 4b);
 * underlayPreset stays absent because the five event views paint POLICE BEATS
 * while Oakland's ACS data lives on 10 planning regions — censusMatchesAreas()
 * is false for this city, so every area-keyed census affordance stands down.
 * Not because census is null: it isn't (stage 5a turned it on for the
 * region-based Demographics surface, which builds its own choropleth off
 * census.regions and never mounts the UnderlayPicker).
 */
export const OAKLAND_MANIFEST: readonly ViewManifestEntry[] = [
  {
    viewId: 'home',
    navLabel: 'Overview',
    navShortLabel: 'OV',
    navDescription: 'Oakland overview & view picker',
    accentColor: '#b85a33', // terracotta-600 — primary brand
    // A landing page consumes nothing date-scoped — without this flag the
    // header picker would be inert while ?start=&end= dirties every shared
    // link (declared delta from SF Home, which consumes dateRange).
    dateless: true,
    // No `sources`: Oakland's real entry point here is CityLanding.tsx (NOT
    // Home.tsx — src/views/Home holds both cities' unrelated top-level
    // components, and sources.test.ts's CITY_VIEW_ENTRY seeds the scan from
    // the right one per city). CityLanding.tsx's own tree fetches nothing
    // from the dataset registry — omitted rather than written as `[]`.
  },
  {
    viewId: 'crime-incidents',
    navLabel: 'Crime Incidents',
    navShortLabel: 'CI',
    navDescription: 'OPD incident reports on police beats',
    accentColor: '#963e30', // brick-600 — same pigment as SF crime
    homeCard: { title: 'Crime Incidents', subtitle: 'OPD reports across 59 named beats', order: 1 },
    eraSource: {
      datasetKey: 'policeIncidents',
      dateField: 'datetime',
      countExpr: 'count(distinct casenumber)',
      // Published rows run back to 1950, but 1950→2003 is a ~1,400-row
      // junk trickle; real data starts Aug 2004.
      clamp: [2004, null],
    },
    omniDatasetKeys: ['policeIncidents'],
    sources: ['policeIncidents'],
    staticSources: ['oak-beats'],
  },
  {
    viewId: '311-cases',
    navLabel: '311 Cases',
    navShortLabel: '311',
    navDescription: 'Oakland 311 service requests',
    accentColor: '#5c7a3d', // moss-600 — same as SF 311
    homeCard: { title: '311 Service Requests', subtitle: 'Next-day civic maintenance signals', order: 2 },
    eraSource: { datasetKey: 'cases311', dateField: 'datetimeinit', clamp: [2013, null] },
    omniDatasetKeys: ['cases311'],
    sources: ['cases311'],
    staticSources: ['oak-beats'],
  },
  {
    viewId: 'parking-citations',
    navLabel: 'Parking Citations',
    navShortLabel: 'PC',
    navDescription: 'Oakland parking citations',
    accentColor: '#d47149', // terracotta-500 — same as SF parking citations
    homeCard: { title: 'Parking Citations', subtitle: 'Enforcement patterns, beat by beat', order: 3 },
    eraSource: { datasetKey: 'parkingCitations', dateField: 'ticket_iss', clamp: [2018, null] },
    omniDatasetKeys: ['parkingCitations'],
    sources: ['parkingCitations'],
    staticSources: ['oak-beats'],
  },
  {
    viewId: 'campaign-finance',
    navLabel: 'Campaign Finance',
    navShortLabel: 'CF',
    navDescription: 'FPPC filings — contributions & spending',
    accentColor: '#8b6282', // plum-500 — same as SF campaign finance
    homeCard: { title: 'Campaign Finance', subtitle: 'FPPC money in Oakland elections', order: 4 },
    // No eraSource — parity with SF's entry (no era track on this view).
    // ⌘K claims the four sets the view READS. fppc460Summary is deliberately
    // absent — its amount_a is cumulative-ish (10–20× transaction sums;
    // summing it fabricates money).
    omniDatasetKeys: ['fppcSchA', 'fppcSchE', 'fppc496', 'fppc497'],
    sources: ['fppc496', 'fppc497', 'fppcSchA', 'fppcSchE'],
  },
  {
    viewId: 'demographics',
    navLabel: 'Demographics',
    navShortLabel: 'DM',
    navDescription: 'Census demographics by Oakland region',
    accentColor: '#8b6282', // plum-500 — same pigment as SF demographics
    homeCard: { title: 'Demographics Explorer', subtitle: 'ACS estimates across 10 Oakland regions', order: 5 },
    // DECLARED DELTA from SF's demographics entry, which is date-driven: SF's
    // scatter can plot civic metrics (crime, 311, crashes) against ACS values,
    // and those queries read the global dateRange. Oakland withholds that axis
    // — its event data is grouped by police beat, a different geography from
    // these regions — so nothing on this view consumes a date.
    // What the flag buys is the CLEAN URL: useUrlSync stops writing
    // start/end/tod/compare here, so a shared link is just
    // /oakland/demographics?nh=N instead of carrying date params no query
    // reads. It does NOT hide the picker — AppShell renders <DateRangePicker>
    // unconditionally, so the control stays visible and inert exactly as it
    // already does on /live and /oakland.
    dateless: true,
    // No `sources`: Demographics.tsx is the SAME component SF mounts, and it
    // imports useCivicMetrics (the civic-metric scatter's data hook), but
    // that scatter is WITHHELD on Oakland (censusMatchesAreas() gates it off
    // — beats ≠ regions). useCivicMetrics never fires a request here, so
    // policeIncidents/cases311/parkingCitations are deliberately absent even
    // though a static scan of the shared file would otherwise find them —
    // see sources.test.ts's NOT_FETCHED_HERE, which authors this exception
    // for the fetched⇔declared test. This view's real sources are the two
    // static ones below.
    staticSources: ['acs-2023-5yr', 'oak-neighborhoods'],
  },
]
