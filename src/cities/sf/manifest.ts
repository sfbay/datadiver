// src/cities/sf/manifest.ts
// SF's view registration — ARRAY ORDER IS NAV ORDER (Overview · Alerts ·
// Last 48 · Pulse · … · About, per CLAUDE.md). Each entry's pigment comes
// from the design-system palette (terracotta / ochre / moss / teal / brick /
// indigo / plum); same color = same dataset across every surface.
// homeCard.order is the Home grid's own historical sequence — independent of
// nav order on purpose. homeCard copy is editorial: keep it in sync with the
// view's actual identity (title = the brand name users see in nav).

import type { ViewManifestEntry } from '../manifest'

export const SF_MANIFEST: readonly ViewManifestEntry[] = [
  {
    viewId: 'home',
    navLabel: 'Overview',
    navShortLabel: 'OV',
    navDescription: 'Data stories & viz picker',
    accentColor: '#b85a33', // terracotta-600 — primary brand
    // Real front-page fetches, via the investigation cards Home.tsx mounts:
    // dispatch911Realtime/fireEMSDispatch/cases311 (Last48Pulse → the pulse
    // teaser's useLast48Pulse), fireEMSDispatch again (ResponseEquity),
    // trafficCrashes (VisionZeroCounter), spendingRevenue (DeficitCounter),
    // vendorPayments (ComplianceTracker's useAdvertisingData/
    // useComplianceData). NOT included: everything usePreloadCache warms
    // (budget/policeIncidents/businessLocations/campaignFinance/…) — that's a
    // background cache-warmer for OTHER views' future navigation, not Home's
    // own content, and is CROSS_CUTTING for exactly that reason
    // (sources.test.ts).
    sources: ['cases311', 'dispatch911Realtime', 'fireEMSDispatch', 'spendingRevenue', 'trafficCrashes', 'vendorPayments'],
    staticSources: ['sf-analysis-neighborhoods', 'acs-2023-5yr'],
  },
  {
    viewId: 'alerts',
    navLabel: 'Alerts',
    navShortLabel: 'ALRT',
    navDescription: 'Email me events near my places',
    accentColor: '#b85a33', // terracotta-600 — the "alert" pigment
    sources: ['cases311', 'dispatch911Realtime', 'fireEMSDispatch'],
    staticSources: ['sf-analysis-neighborhoods'],
  },
  {
    viewId: 'live',
    navLabel: 'The Last 48',
    navShortLabel: 'LIVE',
    navDescription: '48 hours of live civic data',
    accentColor: '#d4a435', // ochre-500 — live / warm yellow
    navPulse: true,
    dateless: true,
    homeCard: { title: 'The Last 48', subtitle: 'SF 911, Fire/EMS & 311 · Live Flow Map', order: 14 },
    // Socioeconomic context that pairs with live 911/Fire/311 streams:
    // property values, monthly rent, household rent-stress, and elderly
    // concentration (the last correlates with EMS demand).
    underlayPreset: ['medianHomeValue', 'medianRent', 'rentBurden', 'pctOver65'],
    sources: ['cases311', 'dispatch911Realtime', 'fireEMSDispatch'],
    staticSources: ['sf-analysis-neighborhoods'],
  },
  {
    viewId: 'pulse',
    navLabel: 'Pulse',
    navShortLabel: 'PULSE',
    navDescription: 'Trending now in S.F.',
    accentColor: '#b85a33', // terracotta-600 — signal / front-door surface
    sources: ['cases311', 'dispatch911Realtime', 'fireEMSDispatch'],
    staticSources: ['sf-analysis-neighborhoods'],
  },
  {
    viewId: 'emergency-response',
    navLabel: 'Emergency Response',
    navShortLabel: 'ER',
    navDescription: 'Fire, Police, EMS response times',
    accentColor: '#b85a33', // terracotta-600 — emergency / alert
    homeCard: { title: 'Emergency Response Times', subtitle: 'SFFD / EMS Dispatch Analysis', order: 1 },
    eraSource: { datasetKey: 'fireEMSDispatch', dateField: 'received_dttm', clamp: [2000, null] },
    underlayPreset: ['rentBurden', 'pctOver65', 'pctBlack'],
    omniDatasetKeys: ['fireEMSDispatch'],
    sources: ['fireEMSDispatch', 'fireIncidents'],
    staticSources: ['sf-analysis-neighborhoods', 'acs-2023-5yr'],
  },
  {
    viewId: 'crime-incidents',
    navLabel: 'Crime Incidents',
    navShortLabel: 'CI',
    navDescription: 'SFPD incidents & 911 cross-ref',
    accentColor: '#963e30', // brick-600 — danger / critical
    homeCard: { title: 'Crime Incidents', subtitle: 'SFPD Reports & 911 Cross-Reference', order: 5 },
    eraSource: {
      datasetKey: 'policeIncidents',
      dateField: 'incident_datetime',
      // Rows are charge-level and cases carry supplemental reports, so
      // count(*) counts charges-times-reports. Literal rather than an import:
      // this manifest is a pure data leaf. Pinned to SF_CRIME_COUNT /
      // HIST_CRIME_COUNT (src/views/CrimeIncidents/crimeCount.ts) by test.
      countExpr: 'count(distinct incident_number)',
      clamp: [2003, null],
      // 2003–2017 lives in a separate extract with a different schema.
      // untilYear 2018 is also the modern query's lower bound, so the
      // 4.5-month overlap between the two datasets is never double-counted.
      historical: {
        datasetKey: 'policeIncidentsHistorical',
        dateField: 'date',
        untilYear: 2018,
        countExpr: 'count(distinct incidntnum)',
      },
      // A definitional discontinuity, not a data gap: same city, same
      // phenomenon, different counting system. An unmarked continuous run
      // would imply the two eras are like-for-like.
      seams: [{ year: 2018, label: 'SFPD changed its category system' }],
    },
    underlayPreset: ['medianIncome', 'pctAsian', 'populationDensity'],
    omniDatasetKeys: ['policeIncidents'],
    // dispatch911Historical IS fetched here, one level deeper than the row
    // above once claimed: CrimeIncidents → CrimeDetailPanel.tsx →
    // useDispatchCrossRef.ts, which fetches the matching 911 dispatch call
    // for a selected incident carrying a CAD number (cad_number itself is
    // still just a column on policeIncidents/policeIncidentsHistorical — the
    // detail panel's cross-reference is the actual second fetch).
    sources: ['dispatch911Historical', 'policeIncidents', 'policeIncidentsHistorical'],
    staticSources: ['sf-analysis-neighborhoods', 'acs-2023-5yr'],
  },
  {
    viewId: 'traffic-safety',
    navLabel: 'Traffic Safety',
    navShortLabel: 'TS',
    navDescription: 'Vision Zero crash & speed analysis',
    accentColor: '#963e30', // brick-600 — danger semantic, twin to Crime
    homeCard: { title: 'Traffic Safety', subtitle: 'Vision Zero Crash & Speed Analysis', order: 7 },
    eraSource: { datasetKey: 'trafficCrashes', dateField: 'collision_datetime', clamp: [2005, null] },
    underlayPreset: ['medianAge', 'populationDensity', 'pctTransit'],
    omniDatasetKeys: ['trafficCrashes'],
    // highInjuryNetwork is NOT here yet: TrafficSafety.tsx still fetches it
    // via a raw `fetch()` (not fetchDataset) — the scan can't see it and the
    // registry entry has no consumer today.
    sources: ['pavementCondition', 'redLightCameras', 'speedCameras', 'trafficCrashes'],
    staticSources: ['sf-analysis-neighborhoods', 'acs-2023-5yr'],
  },
  {
    viewId: 'housing',
    navLabel: 'Housing',
    navShortLabel: 'HO',
    navDescription: 'Evictions & buyouts',
    accentColor: '#b85a33', // terracotta-600 — kin to the primary brand pigment
    homeCard: { title: 'Housing', subtitle: 'SF Rent Board · Evictions & Buyouts', order: 8 },
    eraSource: { datasetKey: 'evictionNotices', dateField: 'file_date', clamp: [1997, null] },
    // evictionRate (the site's first derived census variable) leads, then the
    // four ACS variables most directly explanatory of eviction/buyout
    // pressure: what rent costs, how burdened renters already are, how many
    // households are exposed (renter share), and what a bought-out unit is
    // worth to convert.
    underlayPreset: ['evictionRate', 'medianRent', 'rentBurden', 'renterPct', 'medianHomeValue'],
    omniDatasetKeys: ['evictionNotices', 'buyoutAgreements'],
    sources: ['buyoutAgreements', 'evictionNotices'],
    staticSources: ['sf-analysis-neighborhoods', 'acs-2023-5yr'],
  },
  {
    viewId: 'elections',
    navLabel: 'Elections',
    navShortLabel: 'EL',
    navDescription: 'Live results, RCV & historical playback',
    accentColor: '#616a96', // indigo-500 — civic ceremony
    homeCard: { title: 'Elections', subtitle: 'SF Dept of Elections · Results & RCV', order: 11 },
    // No `sources` — Elections is NOT Socrata (see CLAUDE.md); it reads
    // static JSON built by scripts/build-election-results.mjs etc., never
    // useDataset/fetchDataset against the city registry.
    staticSources: ['sf-elections-results', 'sf-precincts-2012', 'sf-precincts-2022', 'sf-cvr-20241105', 'sf-analysis-neighborhoods'],
  },
  {
    viewId: 'campaign-finance',
    navLabel: 'Campaign Finance',
    navShortLabel: 'CF',
    navDescription: 'Campaign contributions & spending',
    accentColor: '#8b6282', // plum-500 — campaign finance / agency routing
    homeCard: { title: 'Campaign Finance', subtitle: 'SF Ethics Commission Filings', order: 12 },
    omniDatasetKeys: ['campaignFinance'],
    sources: ['campaignFinance'],
  },
  {
    viewId: 'city-budget',
    navLabel: 'City Budget',
    navShortLabel: 'BU',
    navDescription: 'Budget, spending, vendor & ad tracking',
    accentColor: '#b58620', // ochre-600 — money / traditional ledger
    homeCard: { title: 'City Budget', subtitle: 'SF Controller · Spending & Vendors', order: 13 },
    omniDatasetKeys: ['vendorPayments', 'budget', 'spendingRevenue'],
    sources: ['budget', 'spendingRevenue', 'supplierContracts', 'vendorPayments'],
  },
  {
    viewId: 'parking-revenue',
    navLabel: 'Parking Revenue',
    navShortLabel: 'PR',
    navDescription: 'Meter revenue & patterns',
    accentColor: '#3f7573', // teal-600 — info / Dana's color
    homeCard: { title: 'Parking Meter Revenue', subtitle: 'SFMTA Revenue Patterns', order: 2 },
    eraSource: { datasetKey: 'parkingRevenue', dateField: 'session_start_dt', clamp: [2017, null] },
    underlayPreset: ['medianIncome', 'populationDensity'],
    omniDatasetKeys: ['parkingRevenue'],
    sources: ['parkingMeters', 'parkingRevenue'],
    staticSources: ['sf-analysis-neighborhoods', 'acs-2023-5yr'],
  },
  {
    viewId: 'dispatch-911',
    navLabel: '911 Dispatch',
    navShortLabel: '911',
    navDescription: 'Sensitive call temporal patterns',
    accentColor: '#474e74', // indigo-600 — rare cool, sensitivity
    homeCard: { title: '911 Dispatch: Sensitive Calls', subtitle: 'SFPD Temporal Pattern Analysis', order: 3 },
    // omniDatasetKeys is a ROUTING table, not a fetching one: the realtime
    // 911 feed has no view of its own, so a ⌘K search for it sensibly lands
    // here even though this view charts the historical extract only.
    // `sources` reflects what the view actually fetches; the routing-only
    // divergence on dispatch911Realtime is authored in sources.test.ts's
    // OMNI_ROUTING_ONLY (pinned by useOmniSearch.test.ts's ⌘K route).
    omniDatasetKeys: ['dispatch911Realtime', 'dispatch911Historical'],
    sources: ['dispatch911Historical'],
  },
  {
    viewId: '311-cases',
    navLabel: '311 Cases',
    navShortLabel: '311',
    navDescription: '311 service request patterns',
    accentColor: '#5c7a3d', // moss-600 — civic upkeep / growth
    homeCard: { title: '311 Service Requests', subtitle: 'SF311 Civic Complaint Analysis', order: 4 },
    eraSource: { datasetKey: 'cases311', dateField: 'requested_datetime', clamp: [2008, null] },
    underlayPreset: ['rentBurden', 'lepRate', 'pctHispanic'],
    omniDatasetKeys: ['cases311'],
    sources: ['cases311'],
    staticSources: ['sf-analysis-neighborhoods', 'acs-2023-5yr'],
  },
  {
    viewId: 'parking-citations',
    navLabel: 'Parking Citations',
    navShortLabel: 'PC',
    navDescription: 'SFMTA citation patterns & fines',
    accentColor: '#d47149', // terracotta-500 — kin to PR teal but warmer
    homeCard: { title: 'Parking Citations', subtitle: 'SFMTA Citation Analysis', order: 6 },
    // Published range is 1951-01-21 → 2044-12-21; BOTH ends are data-entry
    // junk. The only SF source whose clamp HIDES published rows — disclosed in
    // About's sources table, not on the axis (a warning on the chrome reads as
    // a warning about the data on screen; see the note in EraTrack).
    eraSource: {
      datasetKey: 'parkingCitations',
      dateField: 'citation_issued_datetime',
      clamp: [2012, 2026],
    },
    underlayPreset: ['medianIncome', 'renterPct', 'pctDriveAlone'],
    omniDatasetKeys: ['parkingCitations'],
    sources: ['parkingCitations'],
    staticSources: ['sf-analysis-neighborhoods', 'acs-2023-5yr'],
  },
  {
    viewId: 'business-activity',
    navLabel: 'Business Activity',
    navShortLabel: 'BA',
    navDescription: 'Business opening & closing trends',
    accentColor: '#5c7a3d', // moss-600 — formation / success
    homeCard: { title: 'Business Activity', subtitle: 'Opening & Closing Trends', order: 9 },
    underlayPreset: ['medianIncome', 'pctBachelorsPlus', 'pctAsian'],
    omniDatasetKeys: ['businessLocations'],
    sources: ['businessLocations'],
    staticSources: ['sf-analysis-neighborhoods', 'acs-2023-5yr'],
  },
  {
    viewId: 'business',
    navLabel: 'Business Search',
    navShortLabel: 'BS',
    navDescription: 'Search businesses, chains, and owners',
    accentColor: '#3f7573', // teal-600 — info, twin to BA but cooler
    sources: ['businessLocations'],
  },
  {
    viewId: 'demographics',
    navLabel: 'Demographics',
    navShortLabel: 'DM',
    navDescription: 'Census demographics & civic correlations',
    accentColor: '#8b6282', // plum-500 — editorial cool, civic profiling
    homeCard: { title: 'Demographics Explorer', subtitle: 'U.S. Census Bureau · ACS Estimates', order: 10 },
    // Six keys behind the civic-metric scatter's Y axis (useCivicMetrics).
    sources: ['businessLocations', 'cases311', 'fireIncidents', 'parkingCitations', 'policeIncidents', 'trafficCrashes'],
    // ACS FIRST: this is a static-led view (no map-sample/window-sample
    // citable purpose) — the panel and pill face lead with the first entry.
    staticSources: ['acs-2023-5yr', 'sf-analysis-neighborhoods', 'sf-tract-assignment'],
  },
  {
    viewId: 'neighborhood',
    navLabel: 'Neighborhoods',
    navShortLabel: 'NH',
    navDescription: 'Cross-dataset civic profiles',
    accentColor: '#5c9693', // teal-500 — Dana's color, civic-place
    sources: ['cases311', 'fireEMSDispatch', 'parkingCitations', 'policeIncidents', 'trafficCrashes'],
    staticSources: ['sf-analysis-neighborhoods', 'acs-2023-5yr'],
  },
  {
    viewId: 'about',
    navLabel: 'About',
    navShortLabel: 'AB',
    navDescription: 'Methods, sources & disclosure',
    accentColor: '#a8926a', // paper-500 — the colophon/meta pigment
  },
]
