// ZERO-IMPORT LEAF — the ONE address normalizer for the Restaurants view.
// The generator (scripts/build-storefronts.ts) and the browser both import
// it, so a storefront key computed at build time is the same string the
// lookup box computes from what a reader types. Never fork a second copy.
//
// WHY THIS EXISTS. DPH's `street_address_clean` is not clean: 7,875 raw
// values collapse to 6,200 on whitespace alone (spec §3.5, A trap 3), and
// the three inspection eras spell one door many ways — '1350 04TH ST',
// '3251 20TH AVENUE, SUITE 158, #OP184A', '39   PIER  213', "1740
// O'FARRELL ST". A turnover chain is built by grouping sightings on this key,
// so every split here is a chain cut in half and every false merge is two
// storefronts' tenants counted as one parade.
//
// THE RULES (each pinned by a fixture in storefrontKey.test.ts):
//   · upper-case, apostrophes dropped (O'FARRELL → OFARRELL), '.' → space,
//     everything after the first ',' or '#' dropped (city/state tails, units)
//   · zero-padded ordinals stripped: 03RD → 3RD (240 keys split on this, E T7)
//   · a bare numbered street gains its ordinal: '428 11 ST' → '428 11TH ST'
//   · suffix spellings standardized (STREET/STR → ST, AVENUE/AV → AVE, …)
//   · `O FARRELL` → `OFARRELL`, `O SHAUGHNESSY` → `OSHAUGHNESSY`
//   · `39 PIER` ↔ `PIER 39` → one key, 'PIER 39' (units and stray numbers dropped)
//   · a house-number LETTER is KEPT: 455A ≠ 455B (E T7b). A lone letter
//     token right after the number joins it ('201 A TURK ST' → '201A TURK ST')
//     unless it is a directional N/S/E/W ('900 N POINT ST' stays).
//   · unit tokens dropped: anything after the suffix, and STE/UNIT/APT/RM/…
//     before one. `ST ST` is guarded — the second ST is a unit residue.
//   · a directional that trails the street name moves after the suffix, so
//     '601 MISSION BAY N BLVD' and '601 MISSION BAY BLVD NORTH' agree.
//   · a missing suffix is filled ONLY where the evidence is unambiguous —
//     see buildSuffixFill (126 splits, E T7). storefrontKey itself never
//     guesses.

/** Registered suffix spellings → the canonical suffix. */
export const SUFFIXES: Readonly<Record<string, string>> = {
  ST: 'ST', STREET: 'ST', STR: 'ST',
  AVE: 'AVE', AVENUE: 'AVE', AV: 'AVE',
  BLVD: 'BLVD', BOULEVARD: 'BLVD', BL: 'BLVD',
  DR: 'DR', DRIVE: 'DR',
  PL: 'PL', PLACE: 'PL',
  PLZ: 'PLZ', PLAZA: 'PLZ',
  RD: 'RD', ROAD: 'RD',
  TER: 'TER', TERRACE: 'TER',
  CT: 'CT', COURT: 'CT',
  LN: 'LN', LANE: 'LN',
  ALY: 'ALY', ALLEY: 'ALY', AL: 'ALY',
  WAY: 'WAY', WY: 'WAY',
  CIR: 'CIR', CIRCLE: 'CIR',
  HWY: 'HWY', HIGHWAY: 'HWY',
  SQ: 'SQ', SQUARE: 'SQ',
  BLDG: 'BLDG', BUILDING: 'BLDG',
  CTR: 'CTR', CENTER: 'CTR',
}

/** Canonical street suffixes a STOREFRONT address may end in (rule 1, spec
 *  §3.7). BLDG and CTR are normalized like suffixes but name a building or a
 *  complex ('1 FERRY BLDG', '4 EMBARCADERO CTR'), not a street door, so they
 *  never pass the storefront pattern. */
export const STREET_SUFFIXES: ReadonlySet<string> = new Set([
  'ST', 'AVE', 'BLVD', 'DR', 'PL', 'PLZ', 'RD', 'TER', 'CT', 'LN', 'ALY', 'WAY', 'CIR', 'HWY', 'SQ',
])

/** SF streets whose addresses carry no suffix at all. */
export const SUFFIXLESS_STREETS: ReadonlySet<string> = new Set(['BROADWAY', 'EMBARCADERO'])

const UNIT_WORDS = new Set([
  'STE', 'SUITE', 'UNIT', 'APT', 'APTS', 'SPACE', 'SPC', 'SP', 'STALL', 'KIOSK',
  'FL', 'FLR', 'FLOOR', 'RM', 'ROOM', 'LEVEL', 'LVL', 'SEC', 'SECT', 'BSMT', 'BASEMENT', 'PMB',
])
const ORDINAL_WORDS: Readonly<Record<string, string>> = {
  FIRST: '1ST', SECOND: '2ND', THIRD: '3RD', FOURTH: '4TH', FIFTH: '5TH',
  SIXTH: '6TH', SEVENTH: '7TH', EIGHTH: '8TH', NINTH: '9TH', TENTH: '10TH',
}
const DIRECTION_WORDS: Readonly<Record<string, string>> = {
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W',
}
const DIRECTIONS = new Set(['N', 'S', 'E', 'W'])
/** Irish-O streets DPH writes with a space once the apostrophe is gone. */
const O_STREETS = /\bO (FARRELL|SHAUGHNESSY)\b/g

const HOUSE_NUMBER = /^(\d+)([A-Z½]?)$/

function ordinalFor(n: string): string {
  const v = Number(n)
  const tens = v % 100
  if (tens >= 11 && tens <= 13) return `${v}TH`
  switch (v % 10) {
    case 1: return `${v}ST`
    case 2: return `${v}ND`
    case 3: return `${v}RD`
    default: return `${v}TH`
  }
}

function normalizeStreetToken(t: string): string {
  if (ORDINAL_WORDS[t]) return ORDINAL_WORDS[t]
  if (DIRECTION_WORDS[t]) return DIRECTION_WORDS[t]
  const padded = /^0+(\d+(?:ST|ND|RD|TH)?)$/.exec(t)
  return padded ? padded[1] : t
}

/**
 * Normalize one raw address string to its storefront key. Pure and
 * idempotent: `storefrontKey(storefrontKey(x)) === storefrontKey(x)`.
 * Returns '' for a blank input. Non-numbered strings (intersections such as
 * '3RD ST & KING ST', 'OFF THE GRID') come back upper-cased and
 * whitespace-collapsed only — `isStorefrontAddress` rejects them.
 */
export function storefrontKey(raw: string | null | undefined): string {
  if (!raw) return ''
  let s = raw.toUpperCase().replace(/[’'`]/g, '').replace(/[.\t]/g, ' ')
  s = s.split(',')[0].split('#')[0]
  // A half-number door is its own door: '1007 1/2 VALENCIA ST' → '1007½ VALENCIA ST'.
  s = s.replace(/^\s*(\d+)\s*1\/2\b/, '$1½')
  s = s.replace(/&/g, ' & ').replace(/[^A-Z0-9 &½-]/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  // House-number ranges keep their first number: '1290-1292 9TH AVE', '90 -92 …', '1120-30 4TH ST'.
  s = s.replace(/^(\d+[A-Z]?)\s*-\s*\d+[A-Z]?\b/, '$1')
  s = s.replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
  // A split ordinal right after the house number: '3348 18 TH ST' → '3348 18TH ST'
  // (only the number's own ordinal, so '2300 16 ST' — 16th St, no TH — is untouched).
  s = s.replace(/^(\d+[A-Z]? )(\d+) (ST|ND|RD|TH)(?= \S)/, (m, head: string, n: string, suf: string) =>
    ordinalFor(n) === `${Number(n)}${suf}` ? `${head}${n}${suf}` : m)
  // A range written with a space or slash keeps its first number: '1196 1198
  // FOLSOM', '1 1 WARRIORS WAY', '522 522 COLUMBUS'. Only when a street NAME
  // follows — '2300 16 ST' is a numbered street, not a range.
  s = s.replace(/^(\d+) (\d+) (?=([A-Z]+)\b)/, (m, a: string, b: string, next: string) =>
    Number(b) >= Number(a) && !SUFFIXES[next] && !/^(ST|ND|RD|TH)$/.test(next) ? `${a} ` : m)
  s = s.replace(O_STREETS, 'O$1')
  if (!s) return ''

  // PIER 39 in either order, wherever it sits in the string.
  const pier = /(?:^|\s)(\d+) PIER\b/.exec(s) ?? /\bPIER (\d+)\b/.exec(s)
  if (pier) return `PIER ${Number(pier[1])}`

  const tokens = s.split(' ')
  const house = HOUSE_NUMBER.exec(tokens[0])
  if (!house) return s

  let letter = house[2]
  let i = 1
  if (
    !letter &&
    tokens.length > 2 &&
    /^[A-Z]$/.test(tokens[1]) &&
    !DIRECTIONS.has(tokens[1])
  ) {
    letter = tokens[1]
    i = 2
  }
  const number = `${Number(house[1])}${letter}`

  const street: string[] = []
  let suffix: string | null = null
  let trailingDir: string | null = null
  for (; i < tokens.length; i++) {
    const raw = tokens[i]
    if (raw === '&') { street.length = 0; break }
    if (street.length > 0 && UNIT_WORDS.has(raw)) {
      // '100 MAIN 2ND FLOOR' — the ordinal belonged to the floor, not the street.
      if ((raw === 'FL' || raw === 'FLR' || raw === 'FLOOR') && street.length > 1 &&
        /^\d+(ST|ND|RD|TH)$/.test(street[street.length - 1])) street.pop()
      break
    }
    // BLDG after a multi-word street is a building designator ('1750 CESAR
    // CHAVEZ BLDG H'); after one word it IS the address ('1 FERRY BLDG').
    if (street.length > 1 && SUFFIXES[raw] === 'BLDG') break
    if (street.length > 0 && SUFFIXES[raw]) {
      suffix = SUFFIXES[raw]
      const next = tokens[i + 1]
      // 'MISSION BAY BLVD NORTH' ≠ 'MISSION BAY BLVD SOUTH' — two streets, keep it.
      if (next && DIRECTION_WORDS[next]) trailingDir = DIRECTION_WORDS[next]
      else if (next && DIRECTIONS.has(next) && tokens.length === i + 2) trailingDir = next
      break
    }
    // A bare trailing unit number with no suffix yet ('24 WILLIE MAYS 3232').
    if (street.length > 0 && /^\d+[A-Z]?$/.test(raw) && !SUFFIXES[tokens[i + 1] ?? '']) break
    street.push(normalizeStreetToken(raw))
  }
  if (street[0] === 'THE' && street.length > 1) street.shift()
  // No suffix and a trailing lone letter: a unit ('1750 CESAR CHAVEZ D').
  if (!suffix && street.length > 2 && /^[A-Z]$/.test(street[street.length - 1])) street.pop()
  // A directional stranded between the street name and its suffix trails the suffix.
  if (suffix && !trailingDir && street.length > 1 && DIRECTIONS.has(street[street.length - 1])) {
    trailingDir = street.pop()!
  }
  // '428 11 ST' → '428 11TH ST' (numbered streets are ST or AVE in SF).
  if (street.length === 1 && /^\d+$/.test(street[0]) && (suffix === 'ST' || suffix === 'AVE')) {
    street[0] = ordinalFor(street[0])
  }
  return [number, ...street, suffix, trailingDir].filter(Boolean).join(' ')
}

export interface KeyParts {
  /** House number with its letter, e.g. '455A'. */
  number: string
  /** Street name without suffix or trailing directional, e.g. 'CASTRO'. */
  street: string
  suffix: string | null
  direction: string | null
}

/** Split a storefront key (the output of storefrontKey) into its parts;
 *  null when the key has no leading house number. */
export function keyParts(key: string): KeyParts | null {
  const t = key.split(' ')
  if (t.length < 2 || !HOUSE_NUMBER.test(t[0])) return null
  let end = t.length
  let direction: string | null = null
  let suffix: string | null = null
  if (end > 2 && DIRECTIONS.has(t[end - 1]) && SUFFIXES[t[end - 2]]) {
    direction = t[end - 1]
    end--
  }
  if (end > 2 && SUFFIXES[t[end - 1]] === t[end - 1]) {
    suffix = t[end - 1]
    end--
  }
  return { number: t[0], street: t.slice(1, end).join(' '), suffix, direction }
}

/** Rule 1 (spec §3.7): street number + street name + street suffix — or a
 *  suffixless SF street such as BROADWAY. Rejects intersections, bare
 *  numbers, piers, buildings and complexes. */
export function isStorefrontAddress(key: string): boolean {
  const p = keyParts(key)
  if (!p || !p.street) return false
  if (!/^[A-Z0-9 ]+$/.test(p.street)) return false
  if (p.suffix) return STREET_SUFFIXES.has(p.suffix)
  return !p.direction && SUFFIXLESS_STREETS.has(p.street)
}

/** Unambiguous suffixes, learned from every key the generator has seen. */
export interface SuffixFill {
  /** '4517 3RD' → 'ST' when that exact door was only ever seen with one suffix. */
  byAddress: ReadonlyMap<string, string>
  /** 'HAYES' → 'ST' when the street name only ever appears with one suffix citywide. */
  byStreet: ReadonlyMap<string, string>
}

/** The house number without its letter: '2475A' → '2475'. */
function bareNumber(n: string): string {
  return n.replace(/[A-Z½]$/, '')
}

/**
 * Learn the suffix-fill tables from a corpus of storefront keys. A suffix is
 * recorded ONLY where exactly one suffix was ever seen — at that door first
 * (with its letter, then without: '2475A MISSION' learns from '2475 MISSION
 * ST'), then for that street name citywide. '3RD' is both 3rd St and 3rd Ave, so a
 * suffixless '100 3RD' is filled only if that door itself was seen with one.
 */
export function buildSuffixFill(keys: Iterable<string>): SuffixFill {
  const byAddr = new Map<string, Set<string>>()
  const byStreet = new Map<string, Set<string>>()
  for (const key of keys) {
    const p = keyParts(key)
    if (!p || !p.suffix || !STREET_SUFFIXES.has(p.suffix)) continue
    for (const a of new Set([`${p.number} ${p.street}`, `${bareNumber(p.number)} ${p.street}`])) {
      ;(byAddr.get(a) ?? byAddr.set(a, new Set()).get(a)!).add(p.suffix)
    }
    ;(byStreet.get(p.street) ?? byStreet.set(p.street, new Set()).get(p.street)!).add(p.suffix)
  }
  const unique = (m: Map<string, Set<string>>) =>
    new Map([...m].filter(([, v]) => v.size === 1).map(([k, v]) => [k, [...v][0]]))
  return { byAddress: unique(byAddr), byStreet: unique(byStreet) }
}

/** Fill a missing suffix from the learned tables; a key that already has one,
 *  or whose street is ambiguous, comes back unchanged. */
export function applySuffixFill(key: string, fill: SuffixFill): string {
  const p = keyParts(key)
  if (!p || p.suffix || p.direction || !p.street || SUFFIXLESS_STREETS.has(p.street)) return key
  const suffix =
    fill.byAddress.get(`${p.number} ${p.street}`) ??
    fill.byAddress.get(`${bareNumber(p.number)} ${p.street}`) ??
    fill.byStreet.get(p.street)
  return suffix ? `${p.number} ${p.street} ${suffix}` : key
}
