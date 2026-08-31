// src/views/CrimeIncidents/crimeCount.ts
//
// ZERO-IMPORT LEAF. Both constants are read by the view's data hook AND by
// src/cities/sf/manifest.ts (the era strip). The manifest is a pure data leaf
// that rides the entry bundle, so it cannot import crimeEra.ts — hence this
// file rather than a home next to HISTORICAL_FIELDS. `crimeCount.test.ts`
// pins HIST_CRIME_COUNT against HISTORICAL_FIELDS.incidentNumber so the two
// spellings cannot drift apart.

// ── Counting unit ───────────────────────────────────────────────────────────
// SF crime rows are CHARGE-level, and a case carries SUPPLEMENTAL reports.
// Both facts are DataSF's, not ours (wg3w-h783 columns.json):
//
//   incident_code            "A single incident report can have one or more
//                             incident types associated. In those cases you
//                             will see multiple rows representing a unique
//                             combination of the Incident ID and Incident
//                             Code."
//   report_type_description  "Initial; Initial Supplement; Vehicle Initial;
//                             Vehicle Supplement; Coplogic Initial;
//                             Coplogic Supplement"
//
// Measured 2026-08-31 over the 12 months to 2026-08-01: 92,622 rows /
// 72,287 incident_ids / 64,414 incident_numbers. Case 260084806 alone is 16
// rows across 6 report ids and 7 categories, with Robbery repeated 4x inside
// its own bucket. count(*) therefore counts charges-times-reports, not
// crimes, and the inflation is UNEVEN (Weapons +53%, Drug Violation +44%,
// car break-ins +0.2%) because it tracks charges-per-arrest — so a raw-row
// ranking systematically promotes heavily-charged enforcement buckets.
//
// incident_number is the case. A supplement is the same event re-reported; a
// second charge on one arrest is not a second crime. Identical in kind to
// OAKLAND_CRIME_COUNT (count(distinct casenumber), PR #154).
//
// Year-over-year DELTAS are unaffected (<=4 points across every bucket
// measured) because the ratio is stable year to year — this corrects the
// absolute figures, not the trends.
export const SF_CRIME_COUNT = 'count(distinct incident_number)'

/** The historical extract duplicates too (tmnf-yvry 2015: 146,675 rows /
 *  116,370 incidntnum, +26%). Both eras must count the same way or the 2018
 *  seam gains a ~10-point step that is an artifact of the unit, not SFPD. */
export const HIST_CRIME_COUNT = 'count(distinct incidntnum)'
