// ZERO-IMPORT LEAF. The SF 311 quick groups — the three checkbox groups the
// service picker offers (ServiceCategoryFilter) AND the source of the ⌘K /
// Home-search "topic" rows (useOmniSearch.buildTopicRows). One table, two
// readers, so a search row deep-links to exactly the set the picker ticks.
//
// Members are 311's published `service_name` strings, verbatim. The live
// vocabulary is fetched per view (GROUP BY service_name); these authored
// lists are the only static knowledge of it, so a member absent from today's
// feed is harmless inside an `IN()` but should not be advertised in copy.
export const SF_SERVICE_GROUPS: Record<string, string[]> = {
  'Quality of Life': ['Street and Sidewalk Cleaning', 'Graffiti', 'Graffiti Public', 'Graffiti Private', 'Noise Report', 'Litter Receptacles', 'Illegal Postings'],
  'Infrastructure': ['Streetlights', 'Street Defects', 'Sidewalk or Curb', 'Sewer Issues', 'Sign Repair', 'MUNI Feedback', 'Damaged Property'],
  'Enforcement': ['Parking Enforcement', 'Abandoned Vehicle', 'Encampments', 'Encampment', 'Blocked Street or SideWalk'],
}
