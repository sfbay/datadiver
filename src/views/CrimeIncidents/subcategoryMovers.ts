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

/** Chip-scale signed percent for the strip. Whole numbers normally
 *  ("-38%"), but a delta that ROUNDS to zero keeps one decimal place and its
 *  sign instead of printing a bare "0%" — `Math.round(-0.4)` is `-0`, and a
 *  chip reading "0%" under a bucket that genuinely moved -0.4% asserts no
 *  change when there was one. Never prints a signed zero: an actual-zero
 *  delta (current === prior) still renders as the unsigned "0%". */
export function formatMoverDelta(pct: number): string {
  const rounded = Math.round(pct)
  if (rounded === 0 && pct !== 0) {
    return `${pct > 0 ? '+' : '-'}${Math.abs(pct).toFixed(1)}%`
  }
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

/** Sum authored merges into their target and drop the merged rows.
 *
 *  A duplicate `key` across input rows is SUMMED, not overwritten — callers
 *  pass Socrata `GROUP BY` output, which cannot contain a duplicate group,
 *  but a caller that pre-merges rows itself (or a future test fixture) could
 *  hand this two rows for the same pair. Overwriting would silently keep
 *  only the last one; a bucket's count must never depend on row order. */
export function foldMerges(rows: MoverInput[]): MoverInput[] {
  const mergedAway = new Set<string>()
  const targetOf = new Map<string, string>()
  for (const [target, entry] of Object.entries(SUBCATEGORY_WATCH)) {
    for (const m of entry.merge ?? []) {
      mergedAway.add(m)
      targetOf.set(m, target)
    }
  }
  const present = new Set(rows.map((r) => r.key))
  const byKey = new Map<string, MoverInput>()
  for (const r of rows) {
    const target = targetOf.get(r.key)
    // Fold only into a target that is in THIS window. Otherwise the row
    // survives on its own — a merged pair with no canonical row to join is
    // still real data, and dropping it manufactures absence.
    if (target && present.has(target)) continue
    const existing = byKey.get(r.key)
    if (existing) {
      existing.current += r.current
      existing.prior += r.prior
    } else {
      byKey.set(r.key, { ...r })
    }
  }
  for (const r of rows) {
    const target = targetOf.get(r.key)
    if (!target) continue
    const t = byKey.get(target)
    if (!t) continue
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
    if (chosen.length >= Math.min(WATCH_SLOTS, slots)) break
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
