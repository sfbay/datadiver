# Crime Subcategory Drill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface SFPD's already-published `incident_subcategory` (71 values) as a sidebar drill, a curated "What's moving" strip, a separate enforcement lens, a ticker card, and a deep-linkable `?sub=` param — SF only.

**Architecture:** Two pure, node-tested leaves do the thinking — an authored watch table (`subcategoryWatch.ts`) that says what each bucket *measures*, and a ranker (`subcategoryMovers.ts`) that scores movement damped by volume. One hook (`useSubcategoryMovers.ts`) fires two grouped Socrata queries (current window, comparison window) and feeds BOTH the sidebar turn-down and the strips. The view gains a `?sub=` selection OR'd into its existing category WHERE.

**Tech Stack:** Vite + React 18 + TypeScript + Tailwind v4, Socrata SODA, Vitest (node-only, no DOM).

**Spec:** `docs/superpowers/specs/2026-08-31-crime-subcategory-drill-design.md` (commit `100e417`, amended `0b0d308` and `f98099a`). Read §2.0, §4, §5, §6, §8, §9, §10 before starting.

**One deviation from the spec, deliberate.** Spec §7 puts the two grouped queries inside `useCrimeEraData.ts`. They live in a new `useSubcategoryMovers.ts` instead: that file is already 452 lines, the current-window query serves the sidebar drill *and* both strips (one fetch, one source of truth for a subcategory's count), and the clamp math wants its own pure module to be node-testable. The spec's intent — two grouped queries carrying the view's context, `enabled`-gated to SF-without-history — is preserved exactly.

**Branch:** `feat/crime-subcategory-drill`, already checked out and rebased onto `main`. The prerequisite count fix (#167, spec §12) is MERGED — `SF_CRIME_COUNT` exists and every SF crime count already uses it.

## Global Constraints

- **A subcategory's identity is the PAIR** `` `${incident_category}|${incident_subcategory}` ``, never the subcategory string alone. `Vandalism` exists under both `Malicious Mischief` and `Vandalism`; `Drug Violation` under both `Drug Offense` and `Disorderly Conduct`; `Other` under seven parents.
- **SF only.** Oakland's dialect has no subcategory column. Every new prop is optional and every new query is `enabled`-gated; Oakland's render must be byte-identical.
- **Withheld on pre-2018 ranges.** When `hasHistorical` is true the drill, both strips, and the chevrons do not render. The historical extract normalises `incident_subcategory` to `''`.
- **Counts are cases.** Every new aggregate uses `SF_CRIME_COUNT` from `@/views/CrimeIncidents/crimeCount` — never `count(*)`.
- **Display names are display-only.** The published string stays canonical in state, URL, WHERE clauses, and the detail panel.
- **Muting is a headline gate only.** `admin` pairs stay in the sidebar list, stay selectable, stay in every total.
- **`md:` is BANNED** in app code — write `desk:`. Physical-px `sm:/lg:/xl:/2xl:` are fine.
- **Micro type uses tokens**: `text-nano` (9px) / `text-micro` (10px) / `text-label` (11px). Never `text-[9px]`.
- **Vitest is node-only.** No DOM, no `window`. A pure module that transitively imports `appStore` is unusable in tests — keep the leaves import-free. Use the source-read idiom (`readFileSync` + regex, see `src/views/CampaignFinance/funderParams.test.ts`) when a test must assert against a React module.
- **SQL escaping** is `.replace(/'/g, "''")` — the codebase's `esc` helper in `crimeDialect.ts`.
- Commit trailers on every commit:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DmjQatPF7YLhcicFYe2VtB
  ```
- Verify with `npx vitest run` and `~/dev/devman/tools/devman-build.mjs pnpm build`. **Never run `pnpm dev`** — Tarmac owns dev servers.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/views/CrimeIncidents/subcategoryWatch.ts` **(new)** | Authored table: what each pair measures (`crime`/`enforcement`/`admin`), its display label, its merges. Zero imports. |
| `src/views/CrimeIncidents/subcategoryWatch.test.ts` **(new)** | Table integrity: key shape, merge sanity, no `admin` + `watch`. |
| `src/views/CrimeIncidents/subcategoryMovers.ts` **(new)** | Pure ranker: merge folding, eligibility, score, slot allocation. Imports only the watch table. |
| `src/views/CrimeIncidents/subcategoryMovers.test.ts` **(new)** | Ranker behaviour incl. the pair-identity fixture. |
| `src/views/CrimeIncidents/useSubcategoryMovers.ts` **(new)** | Two grouped queries + the lag clamp. Feeds the sidebar AND both strips. |
| `src/views/CrimeIncidents/subcategoryWindows.ts` **(new)** | The clamp math, pure so it can be node-tested. |
| `src/views/CrimeIncidents/SubcategoryStrip.tsx` **(new)** | The chip row. Rendered twice: crime lens, enforcement lens. |
| `src/components/filters/IncidentCategoryFilter.tsx` | Gains optional turn-down subcategory rows. |
| `src/views/CrimeIncidents/CrimeIncidents.tsx` | `?sub=` state, OR'd WHERE, strip + filter wiring. |
| `src/views/CrimeIncidents/crimeSubcategoryParams.test.ts` **(new)** | `useUrlSync` never touches `sub`. |
| `src/hooks/useCivicIndicators.ts` | New mover ticker card. |
| `src/views/About/About.tsx`, `docs/data-insights.md`, `CLAUDE.md` | Disclosure. |

---

### Task 1: The authored watch table

**Files:**
- Create: `src/views/CrimeIncidents/subcategoryWatch.ts`
- Test: `src/views/CrimeIncidents/subcategoryWatch.test.ts`

**Interfaces:**
- Consumes: nothing. This is a zero-import leaf.
- Produces: `SubcategoryKind`, `WatchEntry`, `SUBCATEGORY_WATCH`, `pairKey(category, subcategory): string`, `splitPairKey(key): { category, subcategory }`, `watchEntry(key): WatchEntry | undefined`, `kindOf(key): SubcategoryKind`, `isWatched(key): boolean`, `subcategoryLabel(category, subcategory): string`, `isEcho(category, subcategory): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/views/CrimeIncidents/subcategoryWatch.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  SUBCATEGORY_WATCH, pairKey, splitPairKey, kindOf, isWatched,
  subcategoryLabel, isEcho, watchEntry,
} from './subcategoryWatch'

describe('pair keys', () => {
  it('joins and splits on the first pipe only', () => {
    const k = pairKey('Larceny Theft', 'Larceny Theft - Shoplifting')
    expect(k).toBe('Larceny Theft|Larceny Theft - Shoplifting')
    expect(splitPairKey(k)).toEqual({
      category: 'Larceny Theft', subcategory: 'Larceny Theft - Shoplifting',
    })
  })

  it('keeps the two Vandalism parents apart', () => {
    expect(pairKey('Malicious Mischief', 'Vandalism'))
      .not.toBe(pairKey('Vandalism', 'Vandalism'))
  })
})

describe('kinds', () => {
  it('defaults an unlisted pair to crime', () => {
    expect(kindOf('Nothing|Listed')).toBe('crime')
    expect(isWatched('Nothing|Listed')).toBe(false)
  })

  it('files drug violations as enforcement, not crime', () => {
    // Arrest-generated: the number moves when policing changes.
    expect(kindOf('Drug Offense|Drug Violation')).toBe('enforcement')
  })

  it('files loitering as enforcement', () => {
    expect(kindOf('Other Miscellaneous|Loitering')).toBe('enforcement')
  })

  it('files record-keeping as admin', () => {
    expect(kindOf('Case Closure|Case Closure')).toBe('admin')
    expect(kindOf('Other|Other')).toBe('admin')
  })
})

describe('table integrity', () => {
  const keys = Object.keys(SUBCATEGORY_WATCH)

  it('every key is a well-formed pair', () => {
    for (const k of keys) {
      const parts = k.split('|')
      expect(parts).toHaveLength(2)
      expect(parts[0].length).toBeGreaterThan(0)
      expect(parts[1].length).toBeGreaterThan(0)
    }
  })

  it('never marks an admin bucket as watched — it could never be shown', () => {
    for (const [k, e] of Object.entries(SUBCATEGORY_WATCH)) {
      if (e.kind === 'admin') expect(e.watch, k).toBeUndefined()
    }
  })

  it('has at least one watched crime beat, or the strip is silently empty', () => {
    const watchedCrime = Object.entries(SUBCATEGORY_WATCH)
      .filter(([, e]) => e.watch && (e.kind ?? 'crime') === 'crime')
    expect(watchedCrime.length).toBeGreaterThan(0)
  })

  it('every merge target is well-formed and is not itself a table key', () => {
    // A merge target that is also a top-level key would double-count.
    for (const [k, e] of Object.entries(SUBCATEGORY_WATCH)) {
      for (const m of e.merge ?? []) {
        expect(m.split('|'), `${k} -> ${m}`).toHaveLength(2)
        expect(SUBCATEGORY_WATCH[m], `${m} is merged into ${k} AND a key`).toBeUndefined()
      }
    }
  })

  it('merges vehicle break-ins, which SFPD publishes under two strings', () => {
    const e = watchEntry('Larceny Theft|Larceny - From Vehicle')!
    expect(e.merge).toContain('Larceny Theft|Theft From Vehicle')
  })
})

describe('labels', () => {
  it('strips the redundant parent prefix', () => {
    expect(subcategoryLabel('Larceny Theft', 'Larceny Theft - Shoplifting')).toBe('Shoplifting')
  })

  it('prefers an authored label over the strip', () => {
    expect(subcategoryLabel('Larceny Theft', 'Larceny - From Vehicle')).toBe('Car break-ins')
  })

  it('falls back to the raw string when no prefix matches', () => {
    expect(subcategoryLabel('Traffic Collision', 'Weird New Thing')).toBe('Weird New Thing')
  })

  it('never returns an empty label when subcategory echoes the category', () => {
    expect(subcategoryLabel('Motor Vehicle Theft', 'Motor Vehicle Theft')).toBe('Car theft')
    expect(subcategoryLabel('Suspicious Occ', 'Suspicious Occ')).toBe('Suspicious Occ')
  })

  it('flags echo rows so the sidebar can skip a pointless chevron', () => {
    expect(isEcho('Suspicious Occ', 'Suspicious Occ')).toBe(true)
    expect(isEcho('Larceny Theft', 'Larceny Theft - Shoplifting')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/views/CrimeIncidents/subcategoryWatch.test.ts`
Expected: FAIL — `Failed to resolve import "./subcategoryWatch"`.

- [ ] **Step 3: Write the table**

Create `src/views/CrimeIncidents/subcategoryWatch.ts`. Copy this file exactly — the kind assignments are editorial rulings from spec §4.3, not defaults to re-derive:

```ts
// src/views/CrimeIncidents/subcategoryWatch.ts
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
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/views/CrimeIncidents/subcategoryWatch.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/views/CrimeIncidents/subcategoryWatch.ts src/views/CrimeIncidents/subcategoryWatch.test.ts
git commit -m "feat(crime): authored subcategory watch table — crime / enforcement / admin"
```

---

### Task 2: The ranker

**Files:**
- Create: `src/views/CrimeIncidents/subcategoryMovers.ts`
- Test: `src/views/CrimeIncidents/subcategoryMovers.test.ts`

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces: `MIN_COUNT = 150`, `STRIP_SLOTS = 3`, `WATCH_SLOTS = 2`, `MoverInput`, `Mover`, `moverScore(delta, current): number`, `foldMerges(rows: MoverInput[]): MoverInput[]`, `rankMovers(rows: MoverInput[], lens?: SubcategoryKind, slots?: number): Mover[]`.

`Mover.keys` is every pair key the chip's filter must match (itself plus any authored merges) — Task 4's `?sub=` writer and Task 6's chip both use it.

- [ ] **Step 1: Write the failing test**

Create `src/views/CrimeIncidents/subcategoryMovers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rankMovers, foldMerges, moverScore, MIN_COUNT, type MoverInput } from './subcategoryMovers'

function row(category: string, subcategory: string, current: number, prior: number): MoverInput {
  return { key: `${category}|${subcategory}`, category, subcategory, current, prior }
}

describe('the pair is the identity', () => {
  it('keeps Vandalism under two parents as two rows with their own scores', () => {
    const out = rankMovers([
      row('Malicious Mischief', 'Vandalism', 4867, 6186),
      row('Vandalism', 'Vandalism', 152, 218),
      row('Traffic Collision', 'Traffic Collision - Hit & Run', 349, 155),
    ], 'crime', 3)
    const keys = out.map((m) => m.key)
    expect(keys).toContain('Malicious Mischief|Vandalism')
    // Vandalism|Vandalism has prior 218 >= 150 and current 152 >= 150, so it
    // is eligible and must NOT have been merged into the other parent.
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('eligibility', () => {
  it('rejects a bucket below the floor on the CURRENT side', () => {
    const out = rankMovers([row('A', 'a', MIN_COUNT - 1, 1000)], 'crime', 3)
    expect(out).toHaveLength(0)
  })

  it('rejects a bucket below the floor on the PRIOR side', () => {
    // A percent off a tiny prior window is noise in both directions.
    const out = rankMovers([row('A', 'a', 1000, MIN_COUNT - 1)], 'crime', 3)
    expect(out).toHaveLength(0)
  })

  it('rejects prior 0 rather than rendering +Infinity%', () => {
    const out = rankMovers([row('A', 'a', 1000, 0)], 'crime', 3)
    expect(out).toHaveLength(0)
  })

  it('rejects an empty subcategory — it carries nothing the category does not', () => {
    const out = rankMovers([row('A', '', 1000, 500)], 'crime', 3)
    expect(out).toHaveLength(0)
  })

  it('never lets an admin bucket win a slot, however high it scores', () => {
    const out = rankMovers([
      row('Case Closure', 'Case Closure', 5000, 500),   // +900%, admin
      row('Burglary', 'Burglary - Commercial', 320, 697),
    ], 'crime', 3)
    expect(out.map((m) => m.key)).not.toContain('Case Closure|Case Closure')
    expect(out).toHaveLength(1)
  })

  it('keeps each lens to its own kind', () => {
    const rows = [
      row('Drug Offense', 'Drug Violation', 6019, 3701),          // enforcement
      row('Burglary', 'Burglary - Commercial', 320, 697),          // crime
    ]
    expect(rankMovers(rows, 'crime', 3).map((m) => m.key))
      .toEqual(['Burglary|Burglary - Commercial'])
    expect(rankMovers(rows, 'enforcement', 3).map((m) => m.key))
      .toEqual(['Drug Offense|Drug Violation'])
  })

  it('returns [] for empty input rather than throwing', () => {
    expect(rankMovers([], 'crime', 3)).toEqual([])
  })
})

describe('authored merges', () => {
  it('sums the two vehicle break-in strings and drops the merged row', () => {
    const out = foldMerges([
      row('Larceny Theft', 'Larceny - From Vehicle', 4166, 6586),
      row('Larceny Theft', 'Theft From Vehicle', 894, 1577),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].current).toBe(4166 + 894)
    expect(out[0].prior).toBe(6586 + 1577)
    expect(out[0].key).toBe('Larceny Theft|Larceny - From Vehicle')
  })

  it('carries both keys so the chip filters on both', () => {
    const out = rankMovers([
      row('Larceny Theft', 'Larceny - From Vehicle', 4166, 6586),
      row('Larceny Theft', 'Theft From Vehicle', 894, 1577),
    ], 'crime', 3)
    expect(out[0].keys).toEqual([
      'Larceny Theft|Larceny - From Vehicle',
      'Larceny Theft|Theft From Vehicle',
    ])
  })

  it('survives a merge target that never arrived in the data', () => {
    const out = foldMerges([row('Larceny Theft', 'Larceny - From Vehicle', 4166, 6586)])
    expect(out).toHaveLength(1)
    expect(out[0].current).toBe(4166)
  })
})

describe('scoring — movement damped by volume', () => {
  it('prefers a smaller move on a much bigger bucket', () => {
    // 40% of 8,786 is a story; 60% of 200 is noise with a big percentage.
    expect(moverScore(40, 8786)).toBeGreaterThan(moverScore(60, 200))
  })

  it('is sign-blind: a fall ranks like a rise of the same size', () => {
    expect(moverScore(-37, 4000)).toBeCloseTo(moverScore(37, 4000), 6)
  })
})

describe('slot allocation', () => {
  const watched = row('Burglary', 'Burglary - Commercial', 320, 697)      // watch, crime
  const watched2 = row('Motor Vehicle Theft', 'Motor Vehicle Theft', 3211, 4747)
  const watched3 = row('Malicious Mischief', 'Vandalism', 4867, 6186)
  const wild = row('Traffic Collision', 'Traffic Collision - Hit & Run', 349, 155)

  it('reserves two slots for watched beats and one for an unlisted mover', () => {
    const out = rankMovers([watched, watched2, watched3, wild], 'crime', 3)
    expect(out).toHaveLength(3)
    expect(out.filter((m) => m.watched)).toHaveLength(2)
    expect(out.filter((m) => !m.watched).map((m) => m.key))
      .toEqual(['Traffic Collision|Traffic Collision - Hit & Run'])
  })

  it('does not let the highest-scoring unlisted mover displace a followed beat', () => {
    // Hit & Run outscores both watched beats here; the reserved slots are
    // exactly what stop it taking all three.
    const out = rankMovers([watched, watched2, wild], 'crime', 3)
    expect(out.filter((m) => m.watched)).toHaveLength(2)
  })

  it('falls back to a third watched beat when nothing unlisted qualifies', () => {
    const out = rankMovers([watched, watched2, watched3], 'crime', 3)
    expect(out).toHaveLength(3)
    expect(out.every((m) => m.watched)).toBe(true)
  })

  it('returns fewer than the slot count rather than padding', () => {
    expect(rankMovers([watched], 'crime', 3)).toHaveLength(1)
  })

  it('breaks ties deterministically — bigger bucket, then key', () => {
    // Same delta and same score shape; the larger current must come first.
    const a = row('Zed', 'Zed - One', 1000, 2000)
    const b = row('Alpha', 'Alpha - One', 1000, 2000)
    const out = rankMovers([a, b], 'crime', 3)
    expect(out.map((m) => m.key)).toEqual(['Alpha|Alpha - One', 'Zed|Zed - One'])
  })
})

describe('the rendered row', () => {
  it('carries an authored label, a signed delta, and the note', () => {
    const [m] = rankMovers([row('Drug Offense', 'Drug Violation', 6019, 3701)], 'enforcement', 3)
    expect(m.label).toBe('Drug enforcement')
    expect(Math.round(m.delta)).toBe(63)
    expect(m.note).toMatch(/arrest-generated/)
    expect(m.kind).toBe('enforcement')
  })

  it('signs a fall negative', () => {
    const [m] = rankMovers([row('Burglary', 'Burglary - Commercial', 320, 697)], 'crime', 3)
    expect(m.delta).toBeLessThan(0)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/views/CrimeIncidents/subcategoryMovers.test.ts`
Expected: FAIL — `Failed to resolve import "./subcategoryMovers"`.

- [ ] **Step 3: Write the ranker**

Create `src/views/CrimeIncidents/subcategoryMovers.ts`:

```ts
// src/views/CrimeIncidents/subcategoryMovers.ts
//
// Pure ranker behind the "What's moving" strip, the enforcement lens, and the
// mover ticker card. No React, no network — one function every surface shares,
// so the three can never rank the same data differently.
//
// SCORE = |delta| x log10(current). Volume is a DAMPER, not a rank: a 40%
// move on 8,786 incidents outranks a 60% move on 200. Both of the signals
// Jesse asked for live in that one number, which is why there is no separate
// "biggest volume" mode — a big flat bucket has no story, and a big moving
// one wins anyway.
//
// SLOTS. Two go to watched beats of the lens's kind, one prefers an UNLISTED
// mover. Measured on live data the open slot routinely OUTSCORES both curated
// ones (Hit & Run 318 vs Car break-ins 140), which is the whole point:
// curation cannot crowd out discovery, and discovery cannot leave a hole.
import {
  isWatched, kindOf, pairKey, splitPairKey, subcategoryLabel,
  watchEntry, SUBCATEGORY_WATCH, type SubcategoryKind,
} from './subcategoryWatch'

/** Both windows must clear this. A percent off a tiny prior window is noise. */
export const MIN_COUNT = 150
export const STRIP_SLOTS = 3
export const WATCH_SLOTS = 2

export interface MoverInput {
  /** `${category}|${subcategory}` */
  key: string
  category: string
  subcategory: string
  current: number
  prior: number
}

export interface Mover {
  key: string
  category: string
  subcategory: string
  /** Authored label, else the prefix-stripped published string. */
  label: string
  current: number
  prior: number
  /** Signed percent change. */
  delta: number
  kind: SubcategoryKind
  watched: boolean
  note?: string
  /** Every pair key this chip's filter must match (self + authored merges). */
  keys: string[]
}

export function moverScore(delta: number, current: number): number {
  return Math.abs(delta) * Math.log10(Math.max(current, 10))
}

/** Sum authored merges into their target and drop the merged rows. */
export function foldMerges(rows: MoverInput[]): MoverInput[] {
  const mergedAway = new Set<string>()
  const targetOf = new Map<string, string>()
  for (const [target, entry] of Object.entries(SUBCATEGORY_WATCH)) {
    for (const m of entry.merge ?? []) {
      mergedAway.add(m)
      targetOf.set(m, target)
    }
  }
  const byKey = new Map<string, MoverInput>()
  for (const r of rows) {
    if (mergedAway.has(r.key)) continue
    byKey.set(r.key, { ...r })
  }
  for (const r of rows) {
    const target = targetOf.get(r.key)
    if (!target) continue
    const t = byKey.get(target)
    if (!t) continue // target absent from this window — nothing to fold into
    t.current += r.current
    t.prior += r.prior
  }
  return [...byKey.values()]
}

function keysFor(key: string): string[] {
  return [key, ...(watchEntry(key)?.merge ?? [])]
}

function toMover(r: MoverInput): Mover {
  const { category, subcategory } = splitPairKey(r.key)
  return {
    key: r.key,
    category, subcategory,
    label: subcategoryLabel(category, subcategory),
    current: r.current,
    prior: r.prior,
    delta: ((r.current - r.prior) / r.prior) * 100,
    kind: kindOf(r.key),
    watched: isWatched(r.key),
    note: watchEntry(r.key)?.note,
    keys: keysFor(r.key),
  }
}

/** Descending score; ties break on the bigger bucket, then the key. */
function byScore(a: Mover, b: Mover): number {
  const d = moverScore(b.delta, b.current) - moverScore(a.delta, a.current)
  if (Math.abs(d) > 1e-9) return d
  if (b.current !== a.current) return b.current - a.current
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

export function rankMovers(
  rows: MoverInput[],
  lens: SubcategoryKind = 'crime',
  slots: number = STRIP_SLOTS,
): Mover[] {
  const eligible = foldMerges(rows)
    .filter((r) => r.subcategory !== '' && r.prior >= MIN_COUNT && r.current >= MIN_COUNT)
    .map(toMover)
    // 'admin' is muted from headlines only — the row still lives in the
    // sidebar and in every total.
    // 'admin' is never passed as a lens, so this one predicate also mutes it.
    .filter((m) => m.kind === lens)
    .sort(byScore)

  const chosen: Mover[] = []
  for (const m of eligible) {
    if (chosen.length >= WATCH_SLOTS) break
    if (m.watched) chosen.push(m)
  }
  const taken = new Set(chosen.map((m) => m.key))
  const remaining = slots - chosen.length
  if (remaining > 0) {
    const wild = eligible.filter((m) => !taken.has(m.key) && !m.watched)
    const fallback = eligible.filter((m) => !taken.has(m.key))
    const pool = wild.length > 0 ? wild : fallback
    for (const m of pool) {
      if (chosen.length >= slots) break
      if (taken.has(m.key)) continue
      chosen.push(m)
      taken.add(m.key)
    }
    // The open slot prefers an unlisted mover, but must never leave a hole:
    // top up from anything still eligible.
    if (chosen.length < slots) {
      for (const m of eligible) {
        if (chosen.length >= slots) break
        if (taken.has(m.key)) continue
        chosen.push(m)
        taken.add(m.key)
      }
    }
  }
  return chosen.sort(byScore)
}

/** Convenience for callers that only need the top row (the ticker card). */
export function topMover(rows: MoverInput[], lens: SubcategoryKind = 'crime'): Mover | null {
  return rankMovers(rows, lens, 1)[0] ?? null
}

export { pairKey }
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/views/CrimeIncidents/subcategoryMovers.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Full suite + commit**

```bash
npx vitest run
git add src/views/CrimeIncidents/subcategoryMovers.ts src/views/CrimeIncidents/subcategoryMovers.test.ts
git commit -m "feat(crime): subcategory mover ranker — score, floor, reserved slots"
```

---

### Task 3: The data hook

**Files:**
- Create: `src/views/CrimeIncidents/useSubcategoryMovers.ts`
- Create: `src/views/CrimeIncidents/subcategoryWindows.ts`
- Test: `src/views/CrimeIncidents/subcategoryWindows.test.ts`

The clamp math goes in its own pure module so it can be node-tested; the hook is thin orchestration around it.

**Interfaces:**
- Consumes: `rankMovers`, `MoverInput`, `Mover` (Task 2); `subcategoryLabel`, `isEcho`, `pairKey` (Task 1); `SF_CRIME_COUNT` from `@/views/CrimeIncidents/crimeCount`; `buildSfCrimeDateOnly` from `./crimeDialect`; `resolveComparisonRange`, `comparisonLabel`, `describeWindow`, `rangeLengthDays`, `addDays` from `@/utils/comparisonMode`; `useDataset` from `@/hooks/useDataset`.
- Produces: `resolveMoverWindows(...)` and `SubcategoryData` / `useSubcategoryMovers(opts)`.

- [ ] **Step 1: Write the failing test for the window math**

Create `src/views/CrimeIncidents/subcategoryWindows.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveMoverWindows } from './subcategoryWindows'

const range = { start: '2025-08-01', end: '2026-08-01' }

describe('the lag clamp', () => {
  it('clamps the current window to the data’s real last day', () => {
    // SFPD publishes days behind. An unclamped current window is SHORT while
    // the prior window is full, which fabricates a decline on every bucket at
    // once — the single most likely way this feature ships a confident lie.
    const w = resolveMoverWindows(range, { kind: 'preset', preset: '1yr' }, '2026-07-28')
    expect(w!.current.end).toBe('2026-07-28')
  })

  it('leaves the end alone when the data reaches it', () => {
    const w = resolveMoverWindows(range, { kind: 'preset', preset: '1yr' }, '2026-08-05')
    expect(w!.current.end).toBe('2026-08-01')
  })

  it('shifts the comparison by the CLAMPED length, not the requested one', () => {
    const w = resolveMoverWindows(range, { kind: 'preset', preset: 'prev' }, '2026-07-28')
    const days = (a: string, b: string) =>
      (Date.parse(b) - Date.parse(a)) / 86_400_000
    expect(days(w!.comparison.start, w!.comparison.end))
      .toBe(days(w!.current.start, w!.current.end))
  })

  it('survives a null latestDate by not clamping', () => {
    const w = resolveMoverWindows(range, { kind: 'preset', preset: '1yr' }, null)
    expect(w!.current.end).toBe('2026-08-01')
  })
})

describe('compare off', () => {
  it('falls back to the immediately preceding window of equal length', () => {
    const w = resolveMoverWindows(range, null, null)
    expect(w!.comparison.end).toBe('2025-07-31')
    expect(w!.label).toMatch(/^vs the previous \d+ days$/)
  })

  it('labels a resolved compare window with concrete dates', () => {
    const w = resolveMoverWindows(range, { kind: 'preset', preset: '1yr' }, null)
    expect(w!.label).toMatch(/^vs /)
    expect(w!.label).not.toMatch(/previous/)
  })
})

describe('degenerate ranges', () => {
  it('returns null when the clamp empties the window', () => {
    // latestDate before the range start: there is no current window at all.
    expect(resolveMoverWindows(range, null, '2025-01-01')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/views/CrimeIncidents/subcategoryWindows.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the window math**

Create `src/views/CrimeIncidents/subcategoryWindows.ts`:

```ts
// src/views/CrimeIncidents/subcategoryWindows.ts
//
// Where the strip's two windows come from. Pure, so the clamp can be tested
// without a network or a DOM.
//
// THE CLAMP IS LOAD-BEARING. SFPD publishes a few days behind. If the current
// window runs to the range end while the prior window is full, every bucket
// shows a decline that is an artifact of the calendar. Clamp the current end
// to MAX(incident_datetime) and shift the comparison by the CLAMPED length —
// the same rule Traffic Safety uses for YoY (CLAUDE.md -> Trend
// Infrastructure).
import {
  addDays, rangeLengthDays, resolveComparisonRange, comparisonLabel,
  type ComparisonMode, type DateRange,
} from '@/utils/comparisonMode'

export interface MoverWindows {
  current: DateRange
  comparison: DateRange
  /** "vs July 4, 2025" or "vs the previous 365 days". */
  label: string
}

export function resolveMoverWindows(
  range: DateRange,
  mode: ComparisonMode,
  latestDate: string | null,
): MoverWindows | null {
  const end = latestDate && latestDate < range.end ? latestDate : range.end
  if (end < range.start) return null
  const current: DateRange = { start: range.start, end }

  const resolved = resolveComparisonRange(mode, current)
  if (resolved) {
    return { current, comparison: resolved, label: comparisonLabel(mode, current) }
  }
  // Compare is off. Fall back to the window immediately before this one.
  const len = rangeLengthDays(current)
  const comparison: DateRange = {
    start: addDays(current.start, -(len + 1)),
    end: addDays(current.start, -1),
  }
  return { current, comparison, label: `vs the previous ${len + 1} days` }
}
```

`rangeLengthDays` (`src/utils/comparisonMode.ts:34`) returns the EXCLUSIVE day difference — `2025-08-01 → 2026-08-01` is 365 — so the inclusive span a reader counts is `len + 1`, which is what the label prints and what the fallback window spans. The test pins the shape `vs the previous N days`, not N.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/views/CrimeIncidents/subcategoryWindows.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the hook**

Create `src/views/CrimeIncidents/useSubcategoryMovers.ts`:

```ts
// src/views/CrimeIncidents/useSubcategoryMovers.ts
//
// Two grouped queries — the active window and its comparison — feeding BOTH
// the sidebar turn-down and the two strips, so a subcategory's count can
// never disagree between them. SF only; the historical extract publishes no
// subcategory at all, so a range that touches it disables the hook entirely.
//
// The queries carry the view's neighborhood + time-of-day context but NOT its
// category/subcategory selection: a strip that re-ranked what you had already
// filtered to would only ever tell you about your own click.
import { useMemo } from 'react'
import { useDataset } from '@/hooks/useDataset'
import { buildSfCrimeDateOnly } from './crimeDialect'
import { SF_CRIME_COUNT } from './crimeCount'
import { pairKey, subcategoryLabel, isEcho } from './subcategoryWatch'
import { rankMovers, type Mover, type MoverInput } from './subcategoryMovers'
import { resolveMoverWindows } from './subcategoryWindows'
import type { ComparisonMode, DateRange } from '@/utils/comparisonMode'

interface SubcatAggRow {
  incident_category: string
  incident_subcategory: string
  n: string
}

export interface SubcategoryRow {
  key: string
  subcategory: string
  label: string
  count: number
}

export interface SubcategoryData {
  /** Current-window rows per category, biggest first — the sidebar drill. */
  byCategory: Map<string, SubcategoryRow[]>
  crimeMovers: Mover[]
  enforcementMovers: Mover[]
  /** "vs July 4, 2025". Empty when no comparison was possible. */
  comparisonLabel: string
  /** False when the comparison window could not be resolved or returned
   *  nothing — the strip says so rather than showing thin numbers. */
  compared: boolean
  isLoading: boolean
}

const EMPTY: SubcategoryData = {
  byCategory: new Map(), crimeMovers: [], enforcementMovers: [],
  comparisonLabel: '', compared: false, isLoading: false,
}

export function useSubcategoryMovers(opts: {
  /** isSF && !hasHistorical. */
  enabled: boolean
  dateRange: DateRange
  comparisonMode: ComparisonMode
  /** MAX(incident_datetime) from useDataFreshness — the clamp source. */
  latestDate: string | null
  selectedNeighborhood: string | null
  timeOfDayFilter: { startHour: number; endHour: number } | null
}): SubcategoryData {
  const { enabled, dateRange, comparisonMode, latestDate } = opts

  const windows = useMemo(
    () => (enabled ? resolveMoverWindows(dateRange, comparisonMode, latestDate) : null),
    [enabled, dateRange, comparisonMode, latestDate],
  )

  const currentWhere = useMemo(() => (windows ? buildSfCrimeDateOnly({
    dateRange: windows.current, timeOfDayFilter: opts.timeOfDayFilter,
  }) + (opts.selectedNeighborhood
    ? ` AND analysis_neighborhood = '${opts.selectedNeighborhood.replace(/'/g, "''")}'`
    : '') : ''), [windows, opts.selectedNeighborhood, opts.timeOfDayFilter])

  const priorWhere = useMemo(() => (windows ? buildSfCrimeDateOnly({
    dateRange: windows.comparison, timeOfDayFilter: opts.timeOfDayFilter,
  }) + (opts.selectedNeighborhood
    ? ` AND analysis_neighborhood = '${opts.selectedNeighborhood.replace(/'/g, "''")}'`
    : '') : ''), [windows, opts.selectedNeighborhood, opts.timeOfDayFilter])

  const QUERY = {
    $select: `incident_category, incident_subcategory, ${SF_CRIME_COUNT} as n`,
    $group: 'incident_category, incident_subcategory',
    $order: 'n DESC',
    $limit: 200,
  }

  const cur = useDataset<SubcatAggRow>(
    'policeIncidents', { ...QUERY, $where: currentWhere }, [currentWhere],
    { enabled: enabled && !!windows },
  )
  const pri = useDataset<SubcatAggRow>(
    'policeIncidents', { ...QUERY, $where: priorWhere }, [priorWhere],
    { enabled: enabled && !!windows },
  )

  return useMemo(() => {
    if (!enabled || !windows) return EMPTY

    const byCategory = new Map<string, SubcategoryRow[]>()
    for (const r of cur.data) {
      const category = r.incident_category ?? ''
      const subcategory = r.incident_subcategory ?? ''
      if (!category || !subcategory) continue
      if (isEcho(category, subcategory)) continue
      const list = byCategory.get(category) ?? []
      list.push({
        key: pairKey(category, subcategory),
        subcategory,
        label: subcategoryLabel(category, subcategory),
        count: parseInt(r.n, 10) || 0,
      })
      byCategory.set(category, list)
    }
    for (const list of byCategory.values()) list.sort((a, b) => b.count - a.count)

    const priorByKey = new Map<string, number>()
    for (const r of pri.data) {
      priorByKey.set(
        pairKey(r.incident_category ?? '', r.incident_subcategory ?? ''),
        parseInt(r.n, 10) || 0,
      )
    }

    // A comparison side that never arrived is ABSENCE, not zero: rank nothing
    // rather than reporting every bucket as newly invented.
    const compared = !pri.isLoading && pri.data.length > 0
    const inputs: MoverInput[] = compared ? cur.data.flatMap((r) => {
      const category = r.incident_category ?? ''
      const subcategory = r.incident_subcategory ?? ''
      if (!category || !subcategory) return []
      const key = pairKey(category, subcategory)
      return [{
        key, category, subcategory,
        current: parseInt(r.n, 10) || 0,
        prior: priorByKey.get(key) ?? 0,
      }]
    }) : []

    return {
      byCategory,
      crimeMovers: rankMovers(inputs, 'crime'),
      enforcementMovers: rankMovers(inputs, 'enforcement'),
      comparisonLabel: windows.label,
      compared,
      isLoading: cur.isLoading || pri.isLoading,
    }
  }, [enabled, windows, cur.data, cur.isLoading, pri.data, pri.isLoading])
}
```

- [ ] **Step 6: Typecheck, full suite, commit**

```bash
npx tsc -b
npx vitest run
git add src/views/CrimeIncidents/useSubcategoryMovers.ts src/views/CrimeIncidents/subcategoryWindows.ts src/views/CrimeIncidents/subcategoryWindows.test.ts
git commit -m "feat(crime): subcategory aggregation hook with the publish-lag clamp"
```

---

### Task 4: `?sub=` grammar and the OR'd WHERE

**Files:**
- Modify: `src/views/CrimeIncidents/CrimeIncidents.tsx:92-140` (params + `categoryClause`)
- Create: `src/views/CrimeIncidents/crimeSubcategoryParams.test.ts`

**Interfaces:**
- Consumes: `splitPairKey` (Task 1).
- Produces: in-component `selectedSubs: Set<string>`, `setSelectedSubs(subs: Set<string>): void`, and a `categoryClause` that OR's the two grains. Tasks 5 and 6 consume these.

- [ ] **Step 1: Write the failing test**

Create `src/views/CrimeIncidents/crimeSubcategoryParams.test.ts`:

```ts
// ?sub= is wired entirely inside CrimeIncidents.tsx — useUrlSync must never
// set or delete it, or the global param sync clobbers the view's own
// navigation (the react-router-redirect-clobber class).
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

describe('the ?sub= param', () => {
  const sync = readFileSync('src/hooks/useUrlSync.ts', 'utf8')
  const view = readFileSync('src/views/CrimeIncidents/CrimeIncidents.tsx', 'utf8')

  it('is never touched by useUrlSync', () => {
    expect(sync).not.toMatch(/set\('sub'/)
    expect(sync).not.toMatch(/delete\('sub'/)
  })

  it('is read and written by the view', () => {
    expect(view).toMatch(/searchParams\.get\('sub'\)/)
    expect(view).toMatch(/next\.set\('sub'/)
    expect(view).toMatch(/next\.delete\('sub'/)
  })

  it('encodes each pair key, so a comma inside a name cannot split a value', () => {
    expect(view).toMatch(/map\(encodeURIComponent\)\.join\(','\)/)
  })

  it('is SF-only — Oakland has no subcategory column', () => {
    expect(view).toMatch(/isSF && selectedSubs\.size > 0/)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/views/CrimeIncidents/crimeSubcategoryParams.test.ts`
Expected: FAIL on the view assertions.

- [ ] **Step 3: Add the param state**

In `src/views/CrimeIncidents/CrimeIncidents.tsx`, directly after the existing `selectedCategories` memo (around line 98), add:

```tsx
  /** Subcategory selection. A subcategory's identity is the PAIR
   *  `category|subcategory` — `Vandalism` exists under both `Malicious
   *  Mischief` and `Vandalism`, so the string alone would merge two different
   *  things. encodeURIComponent encodes both `|` and `,`, so the comma join
   *  is safe for any published name. */
  const selectedSubs = useMemo(() => {
    const param = searchParams.get('sub')
    if (!param) return new Set<string>()
    return new Set(param.split(',').map(decodeURIComponent))
  }, [searchParams])

  const setSelectedSubs = useCallback((subs: Set<string>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (subs.size === 0) next.delete('sub')
      else next.set('sub', Array.from(subs).map(encodeURIComponent).join(','))
      return next
    }, { replace: true })
  }, [setSearchParams])

  /** Toggle one pair, used by both the sidebar rows and the strip chips. */
  const toggleSub = useCallback((keys: string[]) => {
    const next = new Set(selectedSubs)
    const allOn = keys.every((k) => next.has(k))
    for (const k of keys) { if (allOn) next.delete(k); else next.add(k) }
    setSelectedSubs(next)
  }, [selectedSubs, setSelectedSubs])
```

- [ ] **Step 4: Make a checked category drop its own subcategories**

Replace the existing `setSelectedCategories` callback body so it also clears now-redundant subs:

```tsx
  const setSelectedCategories = useCallback((cats: Set<string>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (cats.size === 0) next.delete('categories')
      else next.set('categories', Array.from(cats).map(encodeURIComponent).join(','))
      // Checking a whole category makes its own subcategory picks redundant;
      // leaving them would OR a subset into a superset for no visible reason.
      const keptSubs = Array.from(selectedSubs)
        .filter((k) => !cats.has(splitPairKey(k).category))
      if (keptSubs.length === 0) next.delete('sub')
      else next.set('sub', keptSubs.map(encodeURIComponent).join(','))
      return next
    }, { replace: true })
  }, [setSearchParams, selectedSubs])
```

Add `import { splitPairKey } from './subcategoryWatch'` to the imports.

- [ ] **Step 5: OR the two grains into the WHERE**

Replace the `categoryClause` memo (currently lines 131–139) with:

```tsx
  // Two grains, ONE selection, OR'd: check a whole category, check a single
  // subcategory, or mix. An AND would return the empty set whenever the two
  // picks did not overlap — plausible, silent, and wrong.
  const categoryClause = useMemo(() => {
    const esc = (v: string) => v.replace(/'/g, "''")
    const parts: string[] = []
    if (selectedCategories.size > 0) {
      const escaped = Array.from(selectedCategories).map((c) => `'${esc(c)}'`)
      // Oakland's category is the DERIVED CASE expr (the HOMICIDE split), not
      // raw crimetype — filtering on the same expr the count groups by keeps
      // the sidebar row and its own filter in agreement.
      const lhs = isSF ? 'incident_category' : `(${oaklandCategoryExpr()})`
      parts.push(`${lhs} IN (${escaped.join(',')})`)
    }
    if (isSF && selectedSubs.size > 0) {
      const pairs = Array.from(selectedSubs).map((k) => {
        const { category, subcategory } = splitPairKey(k)
        return `(incident_category = '${esc(category)}' AND incident_subcategory = '${esc(subcategory)}')`
      })
      parts.push(`(${pairs.join(' OR ')})`)
    }
    if (parts.length === 0) return ''
    return parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`
  }, [selectedCategories, selectedSubs, isSF])
```

- [ ] **Step 6: Verify**

Run: `npx tsc -b && npx vitest run src/views/CrimeIncidents/crimeSubcategoryParams.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/views/CrimeIncidents/CrimeIncidents.tsx src/views/CrimeIncidents/crimeSubcategoryParams.test.ts
git commit -m "feat(crime): ?sub= pair grammar, OR'd with the category filter"
```

---

### Task 5: Sidebar turn-down rows

**Files:**
- Modify: `src/components/filters/IncidentCategoryFilter.tsx`
- Modify: `src/views/CrimeIncidents/CrimeIncidents.tsx` (pass the new props)

**Interfaces:**
- Consumes: `SubcategoryData.byCategory` (Task 3), whose values are `SubcategoryRow[]`; `selectedSubs` / `toggleSub` (Task 4).
- Produces: `SubcategoryEntry`, declared locally in the filter component. It is structurally identical to Task 3's `SubcategoryRow` **on purpose** — a shared `src/components/` primitive must not import a type from a single view, and TypeScript's structural typing makes the two interchangeable at the call site. Keep the fields identical: `key`, `subcategory`, `label`, `count`.

- [ ] **Step 1: Add the props**

In `src/components/filters/IncidentCategoryFilter.tsx`, extend the props interface:

```tsx
export interface SubcategoryEntry {
  key: string
  subcategory: string
  label: string
  count: number
}

interface IncidentCategoryFilterProps {
  categories: IncidentCategoryEntry[]
  selected: Set<string>
  onChange: (selected: Set<string>) => void
  groups?: Record<string, string[]>
  formatLabel?: (name: string) => string
  /** SF only. Keyed by category; a category absent here renders no chevron.
   *  Oakland passes nothing and its render is byte-identical. */
  subcategories?: Map<string, SubcategoryEntry[]>
  selectedSubs?: Set<string>
  onToggleSub?: (keys: string[]) => void
}
```

Add local open state at the top of the component body, beside the existing hooks:

```tsx
  const [openCats, setOpenCats] = useState<Set<string>>(() => new Set())
  const toggleOpen = useCallback((name: string) => {
    setOpenCats((prev) => {
      const n = new Set(prev)
      if (n.has(name)) n.delete(name); else n.add(name)
      return n
    })
  }, [])
```

Add `useState` to the existing `react` import.

- [ ] **Step 2: Render the chevron and the rows**

Inside the category `.map((entry) => {...})`, compute the subs and add a chevron button as the FIRST child of the "Controls cluster" div (before the checkbox):

```tsx
          const subs = subcategories?.get(entry.category) ?? []
          const canDrill = subs.length > 0 && !!onToggleSub
          const isOpen = openCats.has(entry.category)
```

Chevron, immediately inside `<div className="relative flex items-center gap-1 flex-shrink-0">`:

```tsx
                {canDrill ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleOpen(entry.category) }}
                    aria-expanded={isOpen}
                    aria-label={isOpen
                      ? `Hide subcategories of ${entry.category}`
                      : `Show subcategories of ${entry.category}`}
                    className="flex-shrink-0 w-3 text-nano font-mono leading-none text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                  >
                    {isOpen ? '▾' : '▸'}
                  </button>
                ) : (
                  <span className="flex-shrink-0 w-3" aria-hidden />
                )}
```

Then, immediately AFTER the closing `</div>` of the category row (still inside the `.map` return, so wrap both in a fragment keyed on the category), render the open rows:

```tsx
              {isOpen && subs.map((s) => {
                const on = selectedSubs?.has(s.key) ?? false
                return (
                  <div
                    key={s.key}
                    className="flex items-center gap-2 py-1 pl-8 pr-2 rounded-lg hover:bg-white/60 dark:hover:bg-white/[0.03]"
                  >
                    <button
                      onClick={() => onToggleSub?.([s.key])}
                      aria-pressed={on}
                      className={`flex-shrink-0 w-2.5 h-2.5 rounded-sm border transition-all cursor-pointer ${
                        on ? 'bg-brick-500 border-brick-500' : 'border-slate-300 dark:border-slate-600'
                      }`}
                    />
                    <button
                      onClick={() => onToggleSub?.([s.key])}
                      title={s.subcategory}
                      className="flex-1 min-w-0 text-micro text-slate-500 dark:text-slate-400 truncate text-left cursor-pointer"
                    >
                      {s.label}
                    </button>
                    <span className="text-nano font-mono text-slate-400 dark:text-slate-500 tabular-nums flex-shrink-0">
                      {s.count.toLocaleString()}
                    </span>
                  </div>
                )
              })}
```

The `title={s.subcategory}` is the honesty hook: the friendly label is ours, the published string is always one hover away.

- [ ] **Step 3: Wire the view**

In `CrimeIncidents.tsx`, call the hook near the other data hooks (after `freshness` so `latestDate` exists):

```tsx
  const subcats = useSubcategoryMovers({
    enabled: isSF && !hasHistorical,
    dateRange,
    comparisonMode,
    latestDate: freshness.latestDate,
    selectedNeighborhood,
    timeOfDayFilter,
  })
```

Add the import, then pass the props at the `<IncidentCategoryFilter>` call site (currently around line 929):

```tsx
                  <IncidentCategoryFilter
                    categories={categoryEntries}
                    selected={selectedCategories}
                    onChange={setSelectedCategories}
                    groups={isSF ? undefined : OAKLAND_CRIME_GROUPS}
                    formatLabel={isSF ? undefined : titleCaseCrimetype}
                    subcategories={isSF ? subcats.byCategory : undefined}
                    selectedSubs={isSF ? selectedSubs : undefined}
                    onToggleSub={isSF ? toggleSub : undefined}
                  />
```

- [ ] **Step 4: Verify**

```bash
npx tsc -b
npx vitest run
~/dev/devman/tools/devman-build.mjs pnpm build
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/filters/IncidentCategoryFilter.tsx src/views/CrimeIncidents/CrimeIncidents.tsx
git commit -m "feat(crime): sidebar turn-down opens each category into its subcategories"
```

---

### Task 6: The strips

**Files:**
- Create: `src/views/CrimeIncidents/SubcategoryStrip.tsx`
- Modify: `src/views/CrimeIncidents/CrimeIncidents.tsx` (render two instances)

**Interfaces:**
- Consumes: `Mover` (Task 2), `SubcategoryData` (Task 3), `toggleSub` / `selectedSubs` (Task 4).
- Produces: nothing for later tasks.

- [ ] **Step 1: Write the component**

Create `src/views/CrimeIncidents/SubcategoryStrip.tsx`:

```tsx
// The "What's moving" strip, rendered twice: once over crime buckets and once
// over enforcement. Same idiom, deliberately separate rankings — mixing an
// arrest-generated number into a crime headline is the error this whole
// design exists to avoid.
import type { Mover } from './subcategoryMovers'

function signed(pct: number): string {
  const n = Math.round(pct)
  return `${n > 0 ? '+' : ''}${n}%`
}

export default function SubcategoryStrip({
  eyebrow, movers, comparisonLabel, compared, selectedSubs, onSelect, emptyNote,
}: {
  eyebrow: string
  movers: Mover[]
  comparisonLabel: string
  /** False = no usable comparison window. Say so; never show thin numbers. */
  compared: boolean
  selectedSubs: Set<string>
  onSelect: (keys: string[]) => void
  emptyNote: string
}) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-2 mb-2">
        <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
          {eyebrow}
        </p>
        <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
        {compared && comparisonLabel && (
          <span className="text-nano font-mono text-slate-400 dark:text-slate-500 shrink-0">
            {comparisonLabel}
          </span>
        )}
      </div>

      {!compared || movers.length === 0 ? (
        <p className="text-micro text-slate-400 dark:text-slate-500 italic leading-snug">
          {emptyNote}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {movers.map((m) => {
              const on = m.keys.every((k) => selectedSubs.has(k))
              return (
                <button
                  key={m.key}
                  onClick={() => onSelect(m.keys)}
                  title={[
                    m.note,
                    `${m.current.toLocaleString()} now · ${m.prior.toLocaleString()} in the comparison window`,
                    m.subcategory,
                  ].filter(Boolean).join('\n')}
                  className={`flex items-baseline gap-1.5 px-2 py-1 rounded-md text-micro transition-all duration-150 cursor-pointer ${
                    on
                      ? 'bg-brick-500/15 text-brick-600 dark:text-brick-400 ring-1 ring-brick-500/30'
                      : 'bg-slate-100 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.08]'
                  }`}
                >
                  <span className="truncate max-w-[9rem]">{m.label}</span>
                  <span className="font-mono tabular-nums text-brick-500 dark:text-brick-400">
                    {signed(m.delta)}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-nano text-slate-400 dark:text-slate-500 leading-snug">
            Ranked by change, on buckets with 150+ incidents in both windows.
            Record-keeping categories are excluded.
          </p>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Render both strips**

In `CrimeIncidents.tsx`, inside the `sidebarTab === 'categories'` block, immediately BEFORE the `Incident Categories` eyebrow (currently around line 909), and only when the drill is available:

```tsx
                {isSF && !hasHistorical && (
                  <>
                    <SubcategoryStrip
                      eyebrow="What's moving"
                      movers={subcats.crimeMovers}
                      comparisonLabel={subcats.comparisonLabel}
                      compared={subcats.compared}
                      selectedSubs={selectedSubs}
                      onSelect={toggleSub}
                      emptyNote="Too few incidents in this range to rank movers."
                    />
                    {subcats.enforcementMovers.length > 0 && (
                      <SubcategoryStrip
                        eyebrow="Enforcement activity · what police chose to act on"
                        movers={subcats.enforcementMovers}
                        comparisonLabel={subcats.comparisonLabel}
                        compared={subcats.compared}
                        selectedSubs={selectedSubs}
                        onSelect={toggleSub}
                        emptyNote=""
                      />
                    )}
                  </>
                )}
```

The enforcement strip renders only when it has rows — an empty second eyebrow is clutter, while the crime strip's own empty note is load-bearing (present / suppressed / absent must stay distinguishable).

- [ ] **Step 3: Verify**

```bash
npx tsc -b
npx vitest run
~/dev/devman/tools/devman-build.mjs pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add src/views/CrimeIncidents/SubcategoryStrip.tsx src/views/CrimeIncidents/CrimeIncidents.tsx
git commit -m "feat(crime): What's moving strip + a separate enforcement lens"
```

---

### Task 7: The ticker mover card

**Files:**
- Modify: `src/hooks/useCivicIndicators.ts`
- Test: extend `src/views/CrimeIncidents/crimeCount.test.ts`

**Interfaces:**
- Consumes: `topMover`, `MoverInput` (Task 2); `SF_CRIME_COUNT`; the existing `QueryContext`, `TickerItem`, `fetchSparkline`, `deltaCategory`, `deltaSeverity`, `formatCount`, `formatPct`, `priorityFromCategory` already in the file.
- Produces: one more `TickerItem`.

- [ ] **Step 1: Write the failing test**

Append to `src/views/CrimeIncidents/crimeCount.test.ts`:

```ts
describe('the subcategory mover ticker card', () => {
  const ind = readFileSync('src/hooks/useCivicIndicators.ts', 'utf8')

  it('exists and is registered in the fetch fan-out', () => {
    expect(ind).toContain('fetchCrimeSubcategoryMover')
    expect(ind).toMatch(/fetchCrimeSubcategoryMover\(ctx\),/)
  })

  it('counts cases, like every other SF crime query', () => {
    const fn = ind.slice(ind.indexOf('function fetchCrimeSubcategoryMover'))
      .slice(0, 2000)
    expect(fn).toContain('SF_CRIME_COUNT')
    expect(fn).not.toContain('count(*)')
  })

  it('ranks with the shared ranker rather than its own arithmetic', () => {
    expect(ind).toMatch(/topMover\(/)
  })

  it('deep-links with ?sub= pair keys', () => {
    expect(ind).toMatch(/params: \{ sub:/)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/views/CrimeIncidents/crimeCount.test.ts`
Expected: FAIL on the four new assertions.

- [ ] **Step 3: Add the transformer**

In `src/hooks/useCivicIndicators.ts`, add the import beside the existing `SF_CRIME_COUNT` one:

```ts
import { topMover, type MoverInput } from '@/views/CrimeIncidents/subcategoryMovers'
```

Add the function immediately after `fetchCrimeIncidents`:

```ts
// 3b. Crime Incidents — the biggest mover among SFPD's own subcategories.
// Same ranker as the in-view strip (subcategoryMovers.ts), deliberately a
// DIFFERENT window: the strip follows the view's date range, this follows the
// indicator engine's year-over-year context. Two callers, one ranking rule.
async function fetchCrimeSubcategoryMover(ctx: QueryContext): Promise<TickerItem | null> {
  const select = `incident_category, incident_subcategory, ${SF_CRIME_COUNT} as cnt`
  const group = 'incident_category, incident_subcategory'
  type Row = { incident_category: string; incident_subcategory: string; cnt: string }

  const [curRows, priRows] = await Promise.all([
    fetchDataset<Row>('policeIncidents', {
      $select: select, $group: group, $limit: 200,
      $where: `incident_datetime >= '${ctx.curStart}' AND incident_datetime <= '${ctx.curEnd}'`,
    }),
    fetchDataset<Row>('policeIncidents', {
      $select: select, $group: group, $limit: 200,
      $where: `incident_datetime >= '${ctx.priStart}' AND incident_datetime <= '${ctx.priEnd}'`,
    }),
  ])
  // A missing comparison side is ABSENCE, not zero — emit no card rather than
  // announcing every bucket as newly invented.
  if (priRows.length === 0 || curRows.length === 0) return null

  const prior = new Map<string, number>()
  for (const r of priRows) {
    prior.set(`${r.incident_category}|${r.incident_subcategory}`, parseInt(r.cnt, 10) || 0)
  }
  const inputs: MoverInput[] = curRows.flatMap((r) => {
    const category = r.incident_category ?? ''
    const subcategory = r.incident_subcategory ?? ''
    if (!category || !subcategory) return []
    const key = `${category}|${subcategory}`
    return [{ key, category, subcategory, current: parseInt(r.cnt, 10) || 0, prior: prior.get(key) ?? 0 }]
  })

  const top = topMover(inputs, 'crime')
  if (!top) return null

  const spark = await fetchSparkline(
    'policeIncidents', 'incident_datetime', ctx.curStart, ctx.curEnd,
    `incident_category = '${top.category.replace(/'/g, "''")}' AND incident_subcategory = '${top.subcategory.replace(/'/g, "''")}'`,
    SF_CRIME_COUNT,
  )
  const category = deltaCategory(top.delta)

  return {
    id: 'civic-crime-subcategory-mover',
    headline: `${top.label} ${top.delta >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(top.delta))}% vs a year ago`,
    detail: `${formatCount(top.prior)} in the prior year period`,
    category,
    severity: deltaSeverity(top.delta, true),
    source: {
      view: '/crime-incidents',
      // Every key the chip folds, so a merged bucket filters to all of them.
      params: { sub: top.keys.map(encodeURIComponent).join(',') },
      label: `Crime Incidents · ${top.label}`,
      datasetId: 'wg3w-h783',
    },
    sparkData: spark,
    delta: top.delta,
    value: formatCount(top.current),
    priorValue: formatCount(top.prior),
    freshness: 'daily',
    computedAt: ctx.now,
    priority: priorityFromCategory(category),
  }
}
```

Register it in the fan-out beside `fetchCrimeIncidents(ctx),` (currently line 155):

```ts
    fetchCrimeIncidents(ctx),
    fetchCrimeSubcategoryMover(ctx),
```

If `formatCount` / `deltaCategory` / `deltaSeverity` / `priorityFromCategory` have different names in the file, use the ones `fetchCrimeIncidents` already calls — read it first (around line 409).

- [ ] **Step 4: Verify, including live**

```bash
npx tsc -b && npx vitest run
```

Then confirm the two queries actually run against Socrata:

```bash
curl -s "https://data.sfgov.org/resource/wg3w-h783.json?\$select=incident_category,incident_subcategory,count(distinct%20incident_number)%20as%20cnt&\$where=incident_datetime%3E%3D'2025-08-01'&\$group=incident_category,incident_subcategory&\$limit=5"
```
Expected: JSON rows, no `400`.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCivicIndicators.ts src/views/CrimeIncidents/crimeCount.test.ts
git commit -m "feat(crime): ticker card for the biggest subcategory mover"
```

---

### Task 8: Disclosure

**Files:**
- Modify: `src/views/About/About.tsx`
- Modify: `docs/data-insights.md`
- Modify: `CLAUDE.md`

**Interfaces:** none.

- [ ] **Step 1: Add the About finding**

Insert immediately after the existing `<Finding title="An SF crime row is a charge, not a crime">` block:

```tsx
            <Finding title="Subcategories are SFPD’s; the plain-English names and the watch list are ours">
              <p>
                SFPD publishes a second level below its 49 crime categories &mdash; 71
                subcategories, including shoplifting and vehicle break-ins. Those are the
                city&rsquo;s own labels, not our inference, and the published string is
                always one hover away from the friendly name we show. We rename only where
                the official wording is opaque: &ldquo;Larceny - From Vehicle&rdquo; reads
                here as &ldquo;Car break-ins.&rdquo;
              </p>
              <p className="mt-2">
                A subcategory is identified by its <em>pair</em> with its parent category,
                never by name alone. &ldquo;Vandalism&rdquo; exists under two different
                categories, and so do &ldquo;Drug Violation&rdquo; and
                &ldquo;Fraud.&rdquo; SFPD also publishes two live labels for vehicle
                break-ins; we add them together and say so, because showing only the
                larger understates the real figure by about 17%.
              </p>
              <p className="mt-2">
                The &ldquo;what&rsquo;s moving&rdquo; strip ranks change against a matched
                earlier window, on buckets with at least 150 incidents on both sides. Two
                slots are reserved for the beats we follow and one is always open to
                whatever the data turns up, so curation cannot crowd out discovery. We
                keep police-activity measures &mdash; warrants served, traffic-stop
                arrests, drug violations, loitering citations &mdash; in a separate
                &ldquo;enforcement&rdquo; strip. Those numbers move when policing changes,
                not when crime does, and reading them as crime is a mistake we made in an
                early draft of this feature. Record-keeping categories such as case
                closures are excluded from headlines only; they remain in the list, remain
                selectable, and remain in every total. None of this applies before 2018,
                where SFPD published no subcategory at all.
              </p>
            </Finding>
```

- [ ] **Step 2: Add the data-insights section**

Insert immediately before `## Police Incidents — a row is a CHARGE, not a crime`:

````markdown
## Police Incidents — a subcategory's identity is its PAIR with the category

`wg3w-h783` publishes three levels: `incident_category` (49 values),
`incident_subcategory` (71) and `incident_description` (753). DataDiver ranked
only the first until Aug 31 2026.

**The trap: subcategory strings repeat across parents.** Measured over the 12
months to 2026-08-01:

| Subcategory string | Parents it appears under |
|---|---|
| `Vandalism` | `Malicious Mischief` (4,867) **and** `Vandalism` (152) |
| `Drug Violation` | `Drug Offense` (8,663) **and** `Disorderly Conduct` (591) |
| `Weapons Offense` | `Weapons Offense` (752) **and** `Weapons Carrying Etc` (664) |
| `Other` | seven different parents |

So the key is `` `${incident_category}|${incident_subcategory}` `` everywhere —
grouping, URL, watch table, filter. A flat list keyed on the string alone
merges unlike things or emits duplicate-looking rows.

**Two live strings for one crime.** `Larceny Theft | Larceny - From Vehicle`
(4,166 cases) and `Larceny Theft | Theft From Vehicle` (894) are the same
concept, both populated, both declining. Rendering only the larger understates
by ~17%. Handled by an authored `merge` field in `subcategoryWatch.ts` — never
by an inferred string-similarity rule.

**Why a mechanical mover scan is not shippable.** Ranked by change on cases,
floor 150 both sides, the top movers include `Traffic Violation Arrest` +93%,
`Warrant` +34% and `Other Offenses | Other` +63%. Those measure police activity
and record-keeping, not crime. Meanwhile shoplifting is FLAT (3,269 vs 3,245)
and would never surface, though it is among the most contested crime figures in
SF politics. Newsworthiness is not a function the data carries.

The authored `kind` answers one question of every bucket: **who generates this
row, a victim or an officer?** A burglary exists because someone reported it; a
loitering citation exists because an officer chose to write it. `crime` ranks
the main strip, `enforcement` gets its own, and only `admin` (case closures,
lost property, `Other | Other`) is muted — from headlines only, never from the
list or the totals.

**Publish lag is the failure mode to guard.** SFPD runs days behind. An
unclamped current window is short while the comparison window is full, which
fabricates a decline across every bucket at once. The current window's end
clamps to `MAX(incident_datetime)` and the comparison shifts by the clamped
length (`subcategoryWindows.ts`).

Nothing here applies before 2018: the historical extract normalises
`incident_subcategory` to `''`.

````

- [ ] **Step 3: Extend the CLAUDE.md CrimeIncidents bullet**

Append this sentence to the CrimeIncidents bullet, immediately after the counting-unit sentences added by #167:

```
**Subcategory drill (SF only)**: identity is the PAIR `` `${category}|${subcategory}` `` — `Vandalism`/`Drug Violation`/`Weapons Offense`/`Other` each appear under 2+ parents, so NEVER key on the subcategory string. Authored `subcategoryWatch.ts` (ZERO-IMPORT leaf) assigns each pair a `kind` — `crime` ranks the strip, `enforcement` (warrants, traffic-stop arrests, drug violations, loitering, vehicle recoveries) gets its OWN lens and is never mixed into a crime headline, `admin` is muted FROM HEADLINES ONLY (still listed, still selectable, still in totals); the test is "who generates this row, a victim or an officer?" and mis-filing `Drug Offense|Drug Violation` as crime was a shipped-in-draft error. `merge` folds SFPD's TWO live vehicle-break-in strings (`Larceny - From Vehicle` + `Theft From Vehicle`, ~17% understated alone) — authored, never string-similarity. `subcategoryMovers.ts` scores `|delta| × log10(current)` with a 150 floor on BOTH sides, 2 reserved watch slots + 1 open slot (the open slot routinely outscores both — that's the point). `useSubcategoryMovers` fires the two grouped queries and feeds the sidebar turn-down AND both strips from one result; its `subcategoryWindows.ts` clamp is load-bearing (unclamped = a fabricated decline on every bucket at once). `?sub=` holds encoded pair keys, OR'd with `?categories=` (an AND returns empty on any non-overlapping mix); `useUrlSync` never touches it. Everything withheld when `hasHistorical` (pre-2018 has no subcategory) and on Oakland. `incident_description` (753 values, charge-level) stays in the detail panel and OUT of the filter — matching words in free text would make DataDiver the author of a classification SFPD never made.
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc -b && npx vitest run && ~/dev/devman/tools/devman-build.mjs pnpm build
git add src/views/About/About.tsx docs/data-insights.md CLAUDE.md
git commit -m "docs(crime): disclose the subcategory drill, the watch list, and the lag clamp"
```

---

## Manual acceptance walk

Run `vite preview` against the built bundle (never `pnpm dev` — Tarmac owns dev servers), then check:

1. `/crime-incidents` with a 2025–2026 range: the Categories tab opens with a **What's moving** strip of up to three chips and a separate **Enforcement activity** strip beneath it.
2. Clicking a chip filters the map and puts `?sub=…` in the address bar. Reload — the selection survives.
3. `Larceny Theft` has a chevron; opening it shows `Shoplifting`, `Car break-ins`, `From Building` with counts. `Suspicious Occ` has no chevron.
4. Hovering a subcategory row shows SFPD's published string.
5. Checking the `Larceny Theft` category unchecks its subcategories and leaves one clause in the URL.
6. Set the range to 2015: strips and chevrons disappear, and the existing 2018 note is the only thing in the sidebar.
7. `/oakland/crime-incidents`: no strips, no chevrons, no change of any kind.
8. The ticker's subcategory card lands on a **non-empty** crime view.
