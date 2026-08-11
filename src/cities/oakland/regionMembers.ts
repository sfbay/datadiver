// src/cities/oakland/regionMembers.ts
//
// GENERATED — re-run `python3 scripts/build-oakland-regions.py --members`.
// code -> the sb4q-6bkc `neighbhd` names dissolved into that region. Drives
// the neighborhood-name label + ⌘K search layer (each of the 129 familiar
// names resolves to its region on the Demographics view). 131 total feature
// memberships; 129 unique names — "Coliseum Industrial Complex" and
// "East 14th Street Business" each appear under CE AND E (the Coliseum
// industrial edge straddles the CE/E planning line). Pinned in regions.test.ts.

export const OAKLAND_REGION_MEMBERS: Record<string, string[]> = {
  C: ['Adams Point', 'Chinatown', 'Civic Center', 'Downtown', 'Lakeside', 'Northgate/Waverly', 'Oakland Avenue/Harrison Street', 'Old City', 'Peralta/Laney', 'Pill Hill', 'Produce and Waterfront', 'San Pablo Gateway'],
  CE: ['Bancroft Business', 'Coliseum', 'Coliseum Industrial Complex', 'East 14th Street Business', 'Fairfax', 'Fairfax Business', 'Fremont', 'Frick', 'Havenscourt', 'Hegenberger', 'Lockwood-Tevis', 'Maxwell Park', 'Melrose', 'Mills College', 'Millsmont', 'Seminary', 'Wentworth Holland'],
  E: ['Arroyo Viejo', 'Brookfield Village', 'Castlemont', 'Coliseum Industrial Complex', 'Columbia Gardens', 'Cox', 'Durant Manor', 'East 14th Street Business', 'Eastmont', 'Eastmont Hills', 'Elmhurst Park', 'Fitchburg', 'Foothill Square', 'Highland', 'Iveywood', 'Las Palmas', 'North Stonehurst', 'Oak Knoll-Golf Links', 'Sobrante Park', 'South Stonehurst', 'Toler Heights', 'Webster', 'Woodland'],
  F: ['Allendale', 'Bartlett', 'Dimond', 'Fruitvale Station', 'Harrington', 'Hawthorne', 'Jefferson', 'Laurel', 'North Kennedy Tract', 'Patten', 'Peralta Hacienda', 'Saint Elizabeth', 'Sausal Creek', 'School', 'South Kennedy', 'Upper Peralta Creek'],
  L: ['Crocker Highland', 'Glenview', 'Grand Lake', 'Lakeshore', 'Lincoln Highlands', 'Redwood Heights', 'Trestle Glen', 'Upper Diamond'],
  N: ['Bushrod', 'Fairview Park', 'Gaskill', 'Golden Gate', 'Longfellow', 'Mosswood', 'Paradise Park', 'Piedmont Avenue', 'Rockridge', 'Santa Fe', 'Shafter', 'Temescal'],
  NW: ['Claremont', 'Forestland', 'Glen Highlands', 'Hiller Highlands', 'Merriwood', 'Montclair', 'Montclair Business', 'Oakmore', 'Panoramic Hill', 'Piedmont Pines', 'Shepherd Canyon', 'Upper Rockridge'],
  S: ['Bella Vista', 'Cleveland Heights', 'Clinton', 'East Peralta', 'Highland Park', 'Highland Terrace', 'Ivy Hill', 'Lynn', 'Meadow Brook', 'Merritt', 'Oak Tree', 'Rancho San Antonio', 'Reservoir Hill', 'Tuxedo'],
  SE: ['Caballo Hills', 'Chabot Park', 'Crestmont', 'Leona Heights', 'Sequoyah', 'Sheffield', 'Skyline-Hillcrest Estates', 'Woodminster'],
  W: ['Acorn', 'Acorn Industrial', 'Clawson', 'Hoover/Foster', 'McClymonds', 'Oak Center', 'Prescott', 'Ralph Bunche', 'South Prescott'],
}
