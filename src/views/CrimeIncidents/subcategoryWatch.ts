//
// ZERO-IMPORT LEAF. The ranker, the view, and the ticker engine all read it.
//
// WHY AN AUTHORED TABLE AT ALL. A purely mechanical mover scan over SFPD's
// subcategories is not shippable. Measured 2026-08-31 on cases, the top
// movers included "Traffic Violation Arrest" +93%, "Warrant" +34% and "Other
// Offenses | Other" +63% — police activity and record-keeping, not crime.
// Meanwhile shoplifting was FLAT (+1%) and so would never surface, though it
// is one of the most contested crime figures in SF politics. Newsworthiness
// is not a function the data carries.
//
// THE TEST THAT DECIDES `kind` — who generates this row, a victim or an
// officer? A burglary exists because someone reported it. A drug violation, a
// loitering citation, a warrant service and a traffic-stop arrest exist
// because an officer chose to act. Both are real; they are not the same
// variable, and averaging them into one ranking makes each unreadable.
//
//   'crime'       offences reported. Ranks the "What's moving" strip.
//   'enforcement' DISCRETIONARY police activity. Its own lens and eyebrow,
//                 never mixed into a crime headline, NEVER silenced — this is
//                 the more interesting variable, not the noise.
//   'admin'       record-keeping with no civic reading. The only kind muted,
//                 and muting is a HEADLINE gate only: admin pairs stay in the
//                 sidebar, stay selectable, stay in every total.
//
// A pair absent from this table is 'crime' and unwatched — eligible through
// the mover scan only. That default is what lets the machine still surprise
// us; the reserved slots (subcategoryMovers.ts) are what stop it from
// crowding out a followed beat.

export type SubcategoryKind = 'crime' | 'enforcement' | 'admin'

export interface WatchEntry {
  /** Display name. Overrides the mechanical prefix strip. Display ONLY — the
   *  published string stays canonical in state, URL, and every WHERE. */
  label?: string
  /** What this bucket measures. Absent = 'crime'. */
  kind?: SubcategoryKind
  /** A curated beat: always eligible, owns a reserved slot in its own lens. */
  watch?: true
  /** One editorial line, rendered as the chip's title attribute. */
  note?: string
  /** Additional pair keys folded into this display bucket. Counts are summed
   *  and the merged rows are hidden from the drill, or they double-report.
   *  AUTHORED and disclosed — never inferred from string similarity. */
  merge?: string[]
}

/** The canonical identity of a subcategory. NEVER the subcategory alone. */
export function pairKey(category: string, subcategory: string): string {
  return `${category}|${subcategory}`
}

export function splitPairKey(key: string): { category: string; subcategory: string } {
  const i = key.indexOf('|')
  if (i < 0) return { category: key, subcategory: '' }
  return { category: key.slice(0, i), subcategory: key.slice(i + 1) }
}

export const SUBCATEGORY_WATCH: Record<string, WatchEntry> = {
  // ── crime, watched: the eight beats the strip ranks ──────────────────────
  'Larceny Theft|Larceny - From Vehicle': {
    label: 'Car break-ins',
    watch: true,
    note: 'SF’s signature property crime.',
    // SFPD publishes two live strings for the same thing. Rendering only the
    // larger understates the real figure by about 17%.
    merge: ['Larceny Theft|Theft From Vehicle'],
  },
  'Larceny Theft|Larceny Theft - Shoplifting': {
    label: 'Shoplifting',
    watch: true,
    note: 'Retail theft — a live policy fight.',
  },
  'Motor Vehicle Theft|Motor Vehicle Theft': { label: 'Car theft', watch: true },
  'Burglary|Burglary - Residential': { label: 'Home burglaries', watch: true },
  'Burglary|Burglary - Commercial': { label: 'Business burglaries', watch: true },
  'Assault|Aggravated Assault': { label: 'Aggravated assault', watch: true },
  'Robbery|Robbery - Street': { label: 'Street robberies', watch: true },
  'Malicious Mischief|Vandalism': { label: 'Vandalism', watch: true },

  // ── enforcement: what police CHOSE to act on ────────────────────────────
  'Drug Offense|Drug Violation': {
    label: 'Drug enforcement', kind: 'enforcement', watch: true,
    note: 'Almost entirely arrest-generated — this moves with policing, not with drug use.',
  },
  'Warrant|Warrant': { label: 'Warrants served', kind: 'enforcement', watch: true },
  'Warrant|Other': { label: 'Warrant arrests', kind: 'enforcement', watch: true },
  'Traffic Violation Arrest|Traffic Violation Arrest': {
    label: 'Traffic-stop arrests', kind: 'enforcement', watch: true,
  },
  'Recovered Vehicle|Recovered Vehicle': {
    label: 'Vehicles recovered', kind: 'enforcement', watch: true,
    note: 'A recovery outcome, not an offence.',
  },
  'Other Miscellaneous|Trespass': { label: 'Trespass enforcement', kind: 'enforcement', watch: true },
  'Other Miscellaneous|Loitering': {
    label: 'Loitering enforcement', kind: 'enforcement', watch: true,
    note: 'Nobody reports a loitering — this moves when officers decide to cite.',
  },

  // ── admin: record-keeping, muted from headlines only ────────────────────
  'Other Miscellaneous|Other': { kind: 'admin' },
  'Other|Other': { kind: 'admin' },
  'Other Offenses|Other': { kind: 'admin' },
  'Other Offenses|Other Offenses': { kind: 'admin' },
  'Non-Criminal|Non-Criminal': { kind: 'admin' },
  'Non-Criminal|Other': { kind: 'admin' },
  'Lost Property|Lost Property': { kind: 'admin' },
  'Case Closure|Case Closure': { kind: 'admin' },
  // Miscellaneous Investigation and Suspicious Occ stay 'crime' and unwatched:
  // they are genuine calls for service, merely vague.
}

/** `?sub=` is a comma-joined list of encodeURIComponent'd pair keys.
 *  encodeURIComponent encodes both `|` and `,`, so any published SFPD name
 *  survives the round trip. One parser, shared by the memo and both setters —
 *  a second copy is how the two drift. */
export function parseSubParam(param: string | null): Set<string> {
  if (!param) return new Set()
  return new Set(param.split(',').map(decodeURIComponent))
}

export function formatSubParam(subs: Set<string> | readonly string[]): string {
  return Array.from(subs).map(encodeURIComponent).join(',')
}

export function watchEntry(key: string): WatchEntry | undefined {
  return SUBCATEGORY_WATCH[key]
}

export function kindOf(key: string): SubcategoryKind {
  return SUBCATEGORY_WATCH[key]?.kind ?? 'crime'
}

export function isWatched(key: string): boolean {
  return SUBCATEGORY_WATCH[key]?.watch === true
}

/** True when the subcategory merely repeats its category — no drill value. */
export function isEcho(category: string, subcategory: string): boolean {
  return category.trim() === subcategory.trim()
}

/** Authored label, else the parent prefix stripped, else the raw string.
 *  Display ONLY. */
/** Residues that carry no meaning once the parent category is stripped away.
 *  "Larceny Theft - Other" shortens to "Other", which reads fine in the
 *  sidebar (its parent row sits directly above it) and says nothing at all on
 *  a chip that travels alone. Kept small and authored rather than inferred. */
const GENERIC_RESIDUES = new Set(['other', 'other offenses', 'misc', 'miscellaneous', 'unknown'])

/** The label for a surface that shows a subcategory WITHOUT its parent beside
 *  it — the mover chips and the ticker card. Same as `subcategoryLabel`,
 *  except it refuses to shorten a name down to a generic residue: there it
 *  falls back to SFPD's full published string, which is self-describing.
 *
 *  Found by looking at the built page: the crime strip's open slot surfaced
 *  `Larceny Theft | Larceny Theft - Other` (492 cases) and rendered it as a
 *  headline reading "Other -14%". */
export function subcategoryChipLabel(category: string, subcategory: string): string {
  const authored = SUBCATEGORY_WATCH[pairKey(category, subcategory)]?.label
  if (authored) return authored
  const short = subcategoryLabel(category, subcategory)
  if (!GENERIC_RESIDUES.has(short.trim().toLowerCase())) return short
  // The name means nothing on its own. Put the parent back — either by
  // un-shortening SFPD's own string, or by qualifying one that never carried
  // the parent to begin with (`Offences Against The Family And Children |
  // Other`). Long, and truncated with the full text in the chip's tooltip;
  // a chip that reads "Other" is worse than a chip that reads long.
  if (subcategory.toLowerCase().startsWith(category.toLowerCase())) return subcategory
  return `${category} - ${subcategory}`
}

export function subcategoryLabel(category: string, subcategory: string): string {
  const authored = SUBCATEGORY_WATCH[pairKey(category, subcategory)]?.label
  if (authored) return authored
  for (const prefix of [`${category} - `, `${category} `]) {
    if (subcategory.startsWith(prefix)) {
      const rest = subcategory.slice(prefix.length).trim()
      if (rest) return rest
    }
  }
  return subcategory
}
