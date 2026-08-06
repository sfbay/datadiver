// src/cities/oakland/manifest.ts
import type { ViewManifestEntry } from '../manifest'

/**
 * Stage-2 manifest: four dormant entries whose job is to carry Oakland's
 * per-dataset era facts and ⌘K claims — /oakland/* still redirects Home,
 * so nothing here renders. navLabels/pigments mirror SF's per-view values
 * (same dataset family = same pigment in every city); homeCard and
 * underlayPreset are deliberately absent (the Home grid is SF's until
 * stage 4; census: null hides every ACS affordance). Stage 3 fleshes
 * these out with Oakland copy when the views go live.
 */
export const OAKLAND_MANIFEST: readonly ViewManifestEntry[] = [
  {
    viewId: 'crime-incidents',
    navLabel: 'Crime Incidents',
    navShortLabel: 'CI',
    navDescription: 'OPD incident reports on police beats',
    accentColor: '#963e30', // brick-600 — same pigment as SF crime
    eraSource: {
      datasetKey: 'policeIncidents',
      dateField: 'datetime',
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
    eraSource: { datasetKey: 'cases311', dateField: 'datetimeinit', clamp: [2013, null] },
    omniDatasetKeys: ['cases311'],
  },
  {
    viewId: 'parking-citations',
    navLabel: 'Parking Citations',
    navShortLabel: 'PC',
    navDescription: 'Oakland parking citations',
    accentColor: '#d47149', // terracotta-500 — same as SF parking citations
    eraSource: { datasetKey: 'parkingCitations', dateField: 'ticket_iss', clamp: [2018, null] },
    omniDatasetKeys: ['parkingCitations'],
  },
  {
    viewId: 'campaign-finance',
    navLabel: 'Campaign Finance',
    navShortLabel: 'CF',
    navDescription: 'FPPC filings — contributions & spending',
    accentColor: '#8b6282', // plum-500 — same as SF campaign finance
    // No eraSource — parity with SF's entry (no era track on this view).
    // ⌘K claims the core three of the 16 FPPC sets; 16 rows would be noise.
    omniDatasetKeys: ['fppcSchA', 'fppcSchE', 'fppc460Summary'],
  },
]
