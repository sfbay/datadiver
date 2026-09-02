// ZERO-IMPORT LEAF. The SF crime quick groups — the three checkbox groups the
// category picker offers (IncidentCategoryFilter) AND the source of the ⌘K /
// Home-search "topic" rows (useOmniSearch.buildTopicRows). One table, two
// readers: a member string that drifts here drifts on both surfaces at once,
// which is the point — a search row must deep-link to exactly the set the
// picker would tick.
//
// Members are SFPD's published `incident_category` strings, verbatim. Not
// every member is in the LIVE vocabulary ('Weapons Offence', 'Vandalism',
// 'Drug Violation' are legacy spellings); they are harmless inside an `IN()`
// and kept so old share links keep working. Never advertise those three in
// reader-facing copy.
export const SF_CRIME_GROUPS: Record<string, string[]> = {
  Violent: ['Assault', 'Robbery', 'Homicide', 'Weapons Carrying Etc', 'Weapons Offence', 'Rape', 'Sex Offense'],
  Property: ['Larceny Theft', 'Burglary', 'Motor Vehicle Theft', 'Vandalism', 'Arson', 'Stolen Property'],
  'Quality of Life': ['Drug Offense', 'Drug Violation', 'Disorderly Conduct', 'Liquor Laws', 'Prostitution', 'Warrant'],
}
