import { useId, useMemo, useRef, useState, useEffect, type KeyboardEvent } from 'react'
import type { Storefront, StorefrontSnapshot } from '@/lib/storefronts/types'
import { storefrontKey } from '@/lib/storefronts/storefrontKey'
import { currentOperator, displayName } from './storylineRows'

/**
 * StorefrontLookup — the box at the head of the Storylines rail (spec §4.4).
 *
 * A client-side prefix/substring filter over the snapshot: every storefront
 * address, every business name seen at a door in any era (except a trade
 * name that repeats the door's individual owner's own name), and COMPANY owner
 * names. Individual owners are NOT indexed (Jesse, 2026-09-24, §11): their
 * names are shown on the storefront biography, but no feature turns a
 * person's name into their holdings and locations. An owner whose kind is
 * 'unknown' is treated as a possible person, so it is not indexed either.
 *
 * Combobox markup after HomeSearch.tsx: role=combobox on the input, a
 * listbox of options, aria-activedescendant, keyboard on the INPUT's
 * onKeyDown only (AppShell and OmniSearch own document-level Escape). The
 * results render INLINE under the input, not as a floating panel — the rail
 * is a scroll container (and a draggable sheet on mobile), and an absolutely
 * positioned panel inside one is clipped or scrolls away.
 *
 * Sample pills are promises: StorefrontLookup.test.ts runs each through the
 * real index built from the committed JSON and pins its FIRST row (the
 * searchSamples.test.ts pattern). A tap fills and runs; it never selects.
 */

// ── the index (pure; pinned by StorefrontLookup.test.ts) ───────────────────

export type LookupMatchKind = 'address' | 'business' | 'owner'

export interface LookupEntry {
  key: string
  kind: LookupMatchKind
  /** The matched text as displayed. */
  text: string
  /** Normalized for matching. */
  norm: string
}

export interface LookupResult {
  key: string
  storefront: Storefront
  kind: LookupMatchKind
  /** The matched text (an address, a business name or a company owner). */
  text: string
  tier: number
}

/** A pill: label = pill text; query = what a tap types; expectKey = the
 *  storefront key its first row must be. */
export interface LookupSample {
  label: string
  query: string
  expectKey: string
}

export const LOOKUP_SAMPLES: readonly LookupSample[] = [
  { label: '2704 24th St', query: '2704 24th St', expectKey: '2704 24TH ST' },
  { label: 'Pica Pica', query: 'Pica Pica', expectKey: '401 VALENCIA ST' },
  { label: '570 Green St', query: '570 Green St', expectKey: '570 GREEN ST' },
]

export const LOOKUP_LIMIT = 8
const MIN_QUERY = 2

/** Lower-case, straight apostrophes and periods dropped, whitespace collapsed. */
export function normalizeLookup(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[’'`.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A name's words, normalized and SORTED — the registry files people
 *  surname-first ('Chen Yibo') while a sign reads 'YIBO CHEN'. */
function nameWords(s: string): string {
  return normalizeLookup(s).split(' ').filter(Boolean).sort().join(' ')
}

/** Every searchable string, one entry per (text, storefront). */
export function buildLookupIndex(snapshot: Pick<StorefrontSnapshot, 'storefronts'>): LookupEntry[] {
  const out: LookupEntry[] = []
  for (const s of snapshot.storefronts) {
    const seen = new Set<string>()
    const add = (kind: LookupMatchKind, text: string) => {
      const norm = normalizeLookup(text)
      if (!norm || seen.has(`${kind}|${norm}`)) return
      seen.add(`${kind}|${norm}`)
      out.push({ key: s.key, kind, text, norm })
    }
    // A trade name that IS an individual owner's own name at this door (1415
    // Stockton St: 'YIBO CHEN', owned by the individual Yibo Chen) is not
    // indexed — typing the person's name would otherwise turn it into their
    // location (§11). The door stays findable by its address.
    const people = new Set(
      s.operators.filter((o) => o.owner?.kind === 'individual').map((o) => nameWords(o.owner!.name)),
    )
    add('address', s.address)
    for (const o of s.operators) {
      if (!people.has(nameWords(o.name))) add('business', o.name)
      // Company owners only — never a natural person's name (§11).
      if (o.owner && o.owner.kind === 'company') add('owner', o.owner.name)
    }
  }
  return out
}

const KIND_RANK: Readonly<Record<LookupMatchKind, number>> = { address: 0, business: 1, owner: 2 }

/**
 * Rows for a query, one per storefront (its best match), best first.
 * Tiers: 0 address prefix (also the storefront-key form of the query, so
 * '2704 24th Street' finds '2704 24TH ST') · 1 name prefix · 2 a word inside
 * starts with the query · 3 substring anywhere. Ties: address before name
 * before owner, then turnover storefronts, then the address.
 */
export function lookupMatches(
  index: readonly LookupEntry[],
  byKey: ReadonlyMap<string, Storefront>,
  query: string,
  limit = LOOKUP_LIMIT,
): LookupResult[] {
  const q = normalizeLookup(query)
  if (q.length < MIN_QUERY) return []
  const qKey = /^\d/.test(q) ? storefrontKey(query) : ''
  const best = new Map<string, LookupResult>()
  for (const e of index) {
    let tier = -1
    if (e.kind === 'address' && (e.norm.startsWith(q) || (qKey && e.key.startsWith(qKey)))) tier = 0
    else if (e.norm.startsWith(q)) tier = 1
    else if (e.norm.includes(` ${q}`)) tier = 2
    else if (e.norm.includes(q)) tier = 3
    if (tier < 0) continue
    const s = byKey.get(e.key)
    if (!s) continue
    const prev = best.get(e.key)
    if (prev && (prev.tier < tier || (prev.tier === tier && KIND_RANK[prev.kind] <= KIND_RANK[e.kind]))) continue
    best.set(e.key, { key: e.key, storefront: s, kind: e.kind, text: e.text, tier })
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
        Number(b.storefront.turnoverBucket !== null) - Number(a.storefront.turnoverBucket !== null) ||
        (a.storefront.address < b.storefront.address ? -1 : a.storefront.address > b.storefront.address ? 1 : 0),
    )
    .slice(0, limit)
}

// ── the component ──────────────────────────────────────────────────────────

const PILL =
  'rounded-full border border-paper-300/60 dark:border-white/[0.08] bg-paper-100/60 dark:bg-white/[0.03] ' +
  'font-mono text-micro text-ink dark:text-paper-200 px-2.5 py-1 whitespace-nowrap transition-colors ' +
  // Tier 2 — hover / keyboard focus only, the view's teal-700 pigment.
  'hover:border-[#2e5856]/40 hover:bg-[#2e5856]/[0.14] hover:text-[#2e5856] dark:hover:text-[#8bb5b2] ' +
  'focus-visible:outline-none focus-visible:border-[#2e5856]/40 focus-visible:bg-[#2e5856]/[0.14] ' +
  'focus-visible:text-[#2e5856] dark:focus-visible:text-[#8bb5b2]'

const NO_MATCHES_COPY = 'No storefront matches. Try an address, a business name or a company.'

/** Current tenant's name for a result row's first line. */
function tenantName(s: Storefront): string | null {
  const now = currentOperator(s)
  return now ? displayName(now.name) : null
}

export default function StorefrontLookup({
  snapshot,
  onSelect,
  failed = false,
}: {
  snapshot: StorefrontSnapshot | null
  onSelect: (key: string) => void
  /** The snapshot failed to load — say so instead of "Loading storefronts…". */
  failed?: boolean
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const uid = useId()
  const listboxId = `${uid}-listbox`
  const optionId = (i: number) => `${uid}-opt-${i}`

  // Built on the first keystroke, not at mount — 5,900 storefronts × names —
  // then kept for the snapshot's life.
  const hasQuery = query.trim().length > 0
  const indexCache = useRef<{ snapshot: StorefrontSnapshot; index: LookupEntry[] } | null>(null)
  const index = useMemo(() => {
    if (!snapshot || !hasQuery) return null
    if (indexCache.current?.snapshot !== snapshot) indexCache.current = { snapshot, index: buildLookupIndex(snapshot) }
    return indexCache.current.index
  }, [snapshot, hasQuery])
  const byKey = useMemo(() => new Map((snapshot?.storefronts ?? []).map((s) => [s.key, s])), [snapshot])
  const results = useMemo(() => (index ? lookupMatches(index, byKey, query) : []), [index, byKey, query])
  const open = focused && hasQuery

  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  const pick = (r: LookupResult | undefined) => {
    if (!r) return
    onSelect(r.key)
    setQuery('')
    inputRef.current?.blur()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = results.length
    switch (e.key) {
      case 'ArrowDown':
        if (!n) return
        e.preventDefault()
        setActiveIdx((i) => (i + 1) % n)
        return
      case 'ArrowUp':
        if (!n) return
        e.preventDefault()
        setActiveIdx((i) => (i - 1 + n) % n)
        return
      case 'Enter':
        e.preventDefault()
        pick(results[activeIdx] ?? results[0])
        return
      case 'Escape':
        if (query) {
          e.preventDefault()
          setQuery('')
        } else {
          inputRef.current?.blur()
        }
        return
      default:
        return
    }
  }

  return (
    <div className="px-4 pt-4 pb-3 border-b border-paper-200/60 dark:border-white/[0.04] flex-shrink-0">
      <div className="flex items-center gap-2 rounded-lg border border-paper-300/60 dark:border-white/10 bg-paper-50 dark:bg-espresso-950/80 px-3 py-1.5 transition-colors focus-within:border-paper-500 dark:focus-within:border-white/30">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden className="shrink-0 text-paper-500 dark:text-paper-400">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && results.length ? optionId(activeIdx) : undefined}
          aria-autocomplete="list"
          aria-label="Find a storefront"
          autoComplete="off"
          spellCheck={false}
          disabled={!snapshot}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          placeholder={snapshot ? 'An address, a business, a company…' : failed ? 'Storefront histories did not load' : 'Loading storefronts…'}
          // Fraunces italic; leading-[1.3] is load-bearing — an input clips
          // italic descenders at its box edge.
          className="flex-1 min-w-0 bg-transparent outline-none font-display italic text-base leading-[1.3] text-ink dark:text-paper-100 placeholder:text-paper-500 dark:placeholder:text-paper-600"
        />
      </div>

      <div hidden={!open} className="mt-2 rounded-lg border border-paper-300/60 dark:border-white/10 bg-paper-50 dark:bg-espresso-950 overflow-hidden">
        <div role="listbox" id={listboxId} aria-label="Storefronts" hidden={results.length === 0}>
          {results.map((r, i) => {
            const now = tenantName(r.storefront)
            const first = r.kind === 'address' ? (now ? now : r.storefront.address) : r.kind === 'business' ? displayName(r.text) : r.text
            const second =
              r.kind === 'owner'
                ? `${r.storefront.address} · registered to this company`
                : r.kind === 'business' && now && now !== displayName(r.text)
                  ? `${r.storefront.address} · now ${now}`
                  : [r.storefront.address, r.storefront.nhood].filter(Boolean).join(' · ')
            return (
              <div
                key={r.key}
                id={optionId(i)}
                role="option"
                aria-selected={i === activeIdx}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => pick(r)}
                className={`px-3 py-2 cursor-pointer ${i === activeIdx ? 'bg-teal-700/10 dark:bg-teal-500/10' : ''}`}
              >
                <p className="text-sm leading-snug text-ink dark:text-paper-100 break-words">{first}</p>
                <p className="font-mono text-micro text-paper-600 dark:text-paper-400 break-words">{second}</p>
              </div>
            )
          })}
        </div>
        {results.length === 0 && <p aria-hidden className="px-3 py-2 text-label text-paper-700 dark:text-paper-300">{NO_MATCHES_COPY}</p>}
      </div>

      <p role="status" className="sr-only">
        {!open ? '' : results.length ? `${results.length} storefront${results.length === 1 ? '' : 's'}` : NO_MATCHES_COPY}
      </p>

      {!hasQuery && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {LOOKUP_SAMPLES.map((s) => (
            <button
              key={s.label}
              type="button"
              disabled={!snapshot}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQuery(s.query)
                inputRef.current?.focus()
              }}
              className={PILL}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
