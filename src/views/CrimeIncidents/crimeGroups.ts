// ZERO-IMPORT LEAF. The SF crime quick groups — the three checkbox groups the
// category picker offers (IncidentCategoryFilter) AND the source of the ⌘K /
// Home-search "topic" rows (useOmniSearch.buildTopicRows). One table, two
// readers: a member string that drifts here drifts on both surfaces at once,
// which is the point — a search row must deep-link to exactly the set the
// picker would tick.
//
// Members are SFPD's published `incident_category` strings, verbatim.
// Probed 2026-09-02 (12 months, distinct incidents): the dominant weapons
// spelling is 'Weapons Offense' (681) — 'Weapons Offence' (3), 'Vandalism'
// (145) and 'Drug Violation' (53) are live but rare tails, kept so old
// share links keep working. Search-row sublabels name only the headline
// members; the long tail stays inside the `IN()`.
export const SF_CRIME_GROUPS: Record<string, string[]> = {
  Violent: ['Assault', 'Robbery', 'Homicide', 'Weapons Carrying Etc', 'Weapons Offense', 'Weapons Offence', 'Rape', 'Sex Offense'],
  Property: ['Larceny Theft', 'Burglary', 'Motor Vehicle Theft', 'Vandalism', 'Arson', 'Stolen Property'],
  'Quality of Life': ['Drug Offense', 'Drug Violation', 'Disorderly Conduct', 'Liquor Laws', 'Prostitution', 'Warrant'],
}
