// src/cities/sf/manifest.ts
// SF's view registration — ARRAY ORDER IS NAV ORDER (Overview · Alerts ·
// Last 48 · Pulse · … · About, per CLAUDE.md). Each entry's pigment comes
// from the design-system palette (terracotta / ochre / moss / teal / brick /
// indigo / plum); same color = same dataset across every surface.
// homeCard.order is the Home grid's own historical sequence — independent of
// nav order on purpose. homeCard copy is editorial and migrates verbatim;
// the '/live' card's pre-rebrand text is a KNOWN stale artifact fixed in the
// visible-fixes follow-up PR, never here (zero-visible-change gate).

import type { ViewManifestEntry } from '../manifest'

export const SF_MANIFEST: readonly ViewManifestEntry[] = [
  {
    viewId: 'home',
    navLabel: 'Overview',
    navShortLabel: 'OV',
    navDescription: 'Data stories & viz picker',
    accentColor: '#b85a33', // terracotta-600 — primary brand
  },
  {
    viewId: 'alerts',
    navLabel: 'Alerts',
    navShortLabel: 'ALRT',
    navDescription: 'Email me events near my places',
    accentColor: '#b85a33', // terracotta-600 — the "alert" pigment
  },
  {
    viewId: 'live',
    navLabel: 'The Last 48',
    navShortLabel: 'LIVE',
    navDescription: '48 hours of live civic data',
    accentColor: '#d4a435', // ochre-500 — live / warm yellow
    navPulse: true,
    dateless: true,
    homeCard: { title: 'Live Feeds', subtitle: 'Scanner Radio · SFPD, SFFD, EMS', order: 14 },
    underlayPreset: ['medianHomeValue', 'medianRent', 'rentBurden', 'pctOver65'],
  },
  {
    viewId: 'pulse',
    navLabel: 'Pulse',
    navShortLabel: 'PULSE',
    navDescription: 'Trending now in S.F.',
    accentColor: '#b85a33', // terracotta-600 — signal / front-door surface
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
      clamp: [2003, null],
      // 2003–2017 lives in a separate extract with a different schema.
      // untilYear 2018 is also the modern query's lower bound, so the
      // 4.5-month overlap between the two datasets is never double-counted.
      historical: { datasetKey: 'policeIncidentsHistorical', dateField: 'date', untilYear: 2018 },
      // A definitional discontinuity, not a data gap: same city, same
      // phenomenon, different counting system. An unmarked continuous run
      // would imply the two eras are like-for-like.
      seams: [{ year: 2018, label: 'SFPD changed its category system' }],
    },
    underlayPreset: ['medianIncome', 'pctAsian', 'populationDensity'],
    omniDatasetKeys: ['policeIncidents'],
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
  },
  {
    viewId: 'housing',
    navLabel: 'Housing',
    navShortLabel: 'HO',
    navDescription: 'Evictions & buyouts',
    accentColor: '#b85a33', // terracotta-600 — kin to the primary brand pigment
    homeCard: { title: 'Housing', subtitle: 'SF Rent Board · Evictions & Buyouts', order: 8 },
    eraSource: { datasetKey: 'evictionNotices', dateField: 'file_date', clamp: [1997, null] },
    underlayPreset: ['evictionRate', 'medianRent', 'rentBurden', 'renterPct', 'medianHomeValue'],
    omniDatasetKeys: ['evictionNotices', 'buyoutAgreements'],
  },
  {
    viewId: 'elections',
    navLabel: 'Elections',
    navShortLabel: 'EL',
    navDescription: 'Live results, RCV & historical playback',
    accentColor: '#616a96', // indigo-500 — civic ceremony
    homeCard: { title: 'Elections', subtitle: 'SF Dept of Elections · Results & RCV', order: 11 },
  },
  {
    viewId: 'city-budget',
    navLabel: 'City Budget',
    navShortLabel: 'BU',
    navDescription: 'Budget, spending, vendor & ad tracking',
    accentColor: '#b58620', // ochre-600 — money / traditional ledger
    homeCard: { title: 'City Budget', subtitle: 'SF Controller · Spending & Vendors', order: 13 },
    omniDatasetKeys: ['vendorPayments', 'budget', 'spendingRevenue'],
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
  },
  {
    viewId: 'dispatch-911',
    navLabel: '911 Dispatch',
    navShortLabel: '911',
    navDescription: 'Sensitive call temporal patterns',
    accentColor: '#474e74', // indigo-600 — rare cool, sensitivity
    homeCard: { title: '911 Dispatch: Sensitive Calls', subtitle: 'SFPD Temporal Pattern Analysis', order: 3 },
    omniDatasetKeys: ['dispatch911Realtime', 'dispatch911Historical'],
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
  },
  {
    viewId: 'parking-citations',
    navLabel: 'Parking Citations',
    navShortLabel: 'PC',
    navDescription: 'SFMTA citation patterns & fines',
    accentColor: '#d47149', // terracotta-500 — kin to PR teal but warmer
    homeCard: { title: 'Parking Citations', subtitle: 'SFMTA Citation Analysis', order: 6 },
    // Published range is 1951-01-21 → 2044-12-21; BOTH ends are data-entry
    // junk. The only source whose clamp hides published rows — hence the note.
    eraSource: {
      datasetKey: 'parkingCitations',
      dateField: 'citation_issued_datetime',
      clamp: [2012, 2026],
      clampNote: 'range clamped — published dates run to 2044',
    },
    underlayPreset: ['medianIncome', 'renterPct', 'pctDriveAlone'],
    omniDatasetKeys: ['parkingCitations'],
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
  },
  {
    viewId: 'business',
    navLabel: 'Business Search',
    navShortLabel: 'BS',
    navDescription: 'Search businesses, chains, and owners',
    accentColor: '#3f7573', // teal-600 — info, twin to BA but cooler
  },
  {
    viewId: 'campaign-finance',
    navLabel: 'Campaign Finance',
    navShortLabel: 'CF',
    navDescription: 'Campaign contributions & spending',
    accentColor: '#8b6282', // plum-500 — campaign finance / agency routing
    homeCard: { title: 'Campaign Finance', subtitle: 'SF Ethics Commission Filings', order: 12 },
    omniDatasetKeys: ['campaignFinance'],
  },
  {
    viewId: 'demographics',
    navLabel: 'Demographics',
    navShortLabel: 'DM',
    navDescription: 'Census demographics & civic correlations',
    accentColor: '#8b6282', // plum-500 — editorial cool, civic profiling
    homeCard: { title: 'Demographics Explorer', subtitle: 'U.S. Census Bureau · ACS Estimates', order: 10 },
  },
  {
    viewId: 'neighborhood',
    navLabel: 'Neighborhoods',
    navShortLabel: 'NH',
    navDescription: 'Cross-dataset civic profiles',
    accentColor: '#5c9693', // teal-500 — Dana's color, civic-place
  },
  {
    viewId: 'about',
    navLabel: 'About',
    navShortLabel: 'AB',
    navDescription: 'Methods, sources & disclosure',
    accentColor: '#a8926a', // paper-500 — the colophon/meta pigment
  },
]
