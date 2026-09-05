// src/views/About/corrections.ts
//
// The corrections log. APPEND-ONLY: `corrections.test.ts` pins every entry's
// id, so deleting one fails the build. Quietly dropping an old correction is
// the same failure as never publishing it.
//
// THE THRESHOLD — an entry is earned when a reader could have QUOTED us and
// would now be wrong. Two tests, both required:
//
//   1. A figure, definition, or verdict changed — not a visual, a feature, or
//      a bug that never put a false number on screen.
//   2. The wrong version was SERVED. Deployed to production from `main`, not
//      caught inside a development cycle. `liveFrom`/`liveTo` are the merge
//      dates that bracket it, and `window` states the span in the entry
//      itself — a reader deserves the odds it reached them, not just the
//      admission.
//
// A change we make because an upstream source moved (a dropped column, a
// renumbered precinct) is a FINDING, not a correction: we did not get it
// wrong. Mixing the two lets us hide behind the city.
//
// Voice: `change` is active and present tense — what is true now. `before` is
// what a reader who cited the old figure needs in order to fix their work.
// Anything vaguer than a number in `before` and the log stops doing its job.

export interface Correction {
  /** Stable anchor: /about#correction-<id>. Never renamed, never reused. */
  id: string
  /** ISO date the correction shipped. */
  date: string
  /** Human date, AP style. */
  dateLabel: string
  /** Which surfaces carried the wrong figure. */
  views: string
  /** How long the wrong version was live on production. */
  window: string
  /** Active, present tense: what is true now. */
  change: string
  /** What a reader who quoted the old figure needs to know. */
  before: string
}

/** Newest first. Append at the top; never edit or remove an existing entry. */
export const CORRECTIONS: readonly Correction[] = [
  {
    id: '2026-09-05-acs-vintage-label',
    date: '2026-09-05',
    dateLabel: 'Sept. 5, 2026',
    views:
      'Census sidebar on Emergency Response · Crime Incidents · Traffic Safety · 311 Cases · Parking Revenue · Parking Citations · Business Activity',
    window: 'live from March 17, 2026 to Sept. 5, 2026',
    change:
      'The neighborhood census sidebar now names its source as the American Community Survey 2019–2023 5-year estimates.',
    before:
      'It read "ACS 2020-2024". No 2020–2024 vintage exists in the data DataDiver serves; every figure on those seven sidebars was and is from the 2019–2023 5-year estimates, the same vintage the Demographics view and the About page already named.',
  },
  {
    id: '2026-08-31-sf-crime-counts',
    date: '2026-08-31',
    dateLabel: 'Aug. 31, 2026',
    views: 'Crime Incidents · Overview · Neighborhoods',
    window: 'live since launch',
    change:
      'San Francisco crime totals now count cases, not charge rows. Totals drop about 30%, unevenly. Trends are unaffected.',
    before:
      'SFPD publishes one row per charge, and a case can also carry follow-up reports with their own charge rows — so a single event was counted several times. One case we examined was published as 16 rows. Every SF crime figure before this date was too high: about 44% for drug offenses and 53% for weapons offenses, under 1% for car break-ins. Year-over-year changes were not affected, because the over-count held steady from year to year.',
  },
  {
    id: '2026-08-11-oakland-homicide',
    date: '2026-08-11',
    dateLabel: 'Aug. 11, 2026',
    views: 'Crime Incidents (Oakland)',
    window: 'live for six days',
    change:
      'Oakland’s homicide figure now counts charged murder and manslaughter only. Coroner death investigations are counted and shown separately.',
    before:
      'Oakland police file both under one code. The page reported 427 homicides for a 12-month window when about 92% of that number were investigations of sudden or unexplained deaths, not killings.',
  },
  {
    id: '2026-07-15-rcv-winners',
    date: '2026-07-15',
    dateLabel: 'July 15, 2026',
    views: 'Elections',
    window: 'live for one day',
    change:
      'Ranked-choice results now match each race to its own certified file by race identity.',
    before:
      'The results generator matched races by name similarity and flagged the wrong winner in Districts 1, 5 and 11 of the November 2024 election. Nine of eleven ranked-choice race files were also missing, and the panel failed silently rather than saying so.',
  },
]
