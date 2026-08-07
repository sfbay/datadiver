// src/cities/oakland/manifest.ts
import type { ViewManifestEntry } from '../manifest'

/**
 * Four entries carrying Oakland's per-dataset era facts and ⌘K claims.
 * All four are now LIVE — stage 3 brought crime-incidents and 311-cases up
 * first; stage 3b flips parking-citations and campaign-finance, so every
 * /oakland/* slug renders a real view. navLabels/pigments mirror SF's
 * per-view values (same dataset family = same pigment in every city);
 * homeCard fields drive the /oakland landing grid (stage 4b);
 * underlayPreset stays absent (census: null hides every ACS affordance).
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
      clampNote: 'range clamped — published dates run back to 1950',
    },
    omniDatasetKeys: ['policeIncidents'],
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
  },
]
