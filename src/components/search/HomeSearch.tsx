import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type FocusEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { useOmniSearch, type SearchResult } from './useOmniSearch'
import { ResultRow, SearchIcon } from './ResultRow'
import { SEARCH_SAMPLES, type SearchSample } from './searchSamples'
import { useIsMobile } from '@/hooks/useIsMobile'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'

/**
 * The Home page's hero-scale search box — the ⌘K index, INLINE.
 *
 * Same hook, same rows, same navigate contract as the ⌘K modal
 * (OmniSearch.tsx); what differs is the chrome: an always-visible combobox
 * under the hero with a listbox panel, arrow keys, Enter-to-top-result, and
 * a row of sample pills. Every pill is a test-pinned promise
 * (searchSamples.test.ts): tapping one FILLS the box and RUNS the search —
 * it never navigates (Jesse's ruling; the reader sees the rows and chooses).
 *
 * Costs nothing at first paint: the static index builds on the first
 * non-empty keystroke, and the funder typeahead (the only network here) is
 * gated on the input's focus via `active`.
 *
 * STACKING — READ BEFORE RESTYLING. The <section> wrapper carries `z-20`
 * and NOTHING that scopes z-index (no backdrop-blur, no `.glow-host`, no
 * isolation): the results panel is absolutely positioned and must paint
 * over every later `relative z-10` sibling on Home (the newsletter row).
 * The decorated head row IS a glow-host, so it is a sibling that does not
 * contain the panel. `.glow-host` also sets overflow:hidden — a panel
 * inside one is clipped, not just hidden.
 *
 * Keyboard lives on the INPUT's onKeyDown only. AppShell and OmniSearch
 * already own document-level Escape; a third document listener here would
 * fight them.
 */

const WINDOW = 5
const ROTATE_MS = 6000
const FADE_MS = 400

// One string each, shared by the visible panel line and the live region so
// what a sighted reader sees and what a screen reader hears cannot drift.
const SEARCHING_COPY = 'Searching donors…'
const NO_MATCHES_COPY = 'No matches. Try a neighborhood, a dataset or a donor’s name.'

const PILL =
  'rounded-full border border-paper-300/60 dark:border-white/[0.08] bg-paper-100/60 dark:bg-white/[0.03] ' +
  'font-mono text-micro text-ink dark:text-paper-200 px-3 py-1.5 whitespace-nowrap transition-colors ' +
  // Tier 2 — the active date-preset chip's treatment (DateRangePicker), on
  // hover / keyboard focus only. No glow-corner on a pill.
  'hover:border-[#b85a33]/40 hover:bg-[#b85a33]/[0.18] hover:text-[#b85a33] dark:hover:text-[#d47149] ' +
  'focus-visible:outline-none focus-visible:border-[#b85a33]/40 focus-visible:bg-[#b85a33]/[0.18] ' +
  'focus-visible:text-[#b85a33] dark:focus-visible:text-[#d47149]'

export default function HomeSearch({ mounted }: { mounted: boolean }) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const reducedMotion = usePrefersReducedMotion()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [focused, setFocused] = useState(false)
  // `omitViewId: 'home'` — Enter must never "navigate" to the page the
  // reader is already on.
  const { query, setQuery, results, searching } = useOmniSearch({ active: focused, omitViewId: 'home' })
  const [activeIdx, setActiveIdx] = useState(0)
  const uid = useId()
  const listboxId = `${uid}-listbox`
  const optionId = (i: number) => `${uid}-opt-${i}`
  const open = focused && query.trim() !== ''

  // The active row belongs to the reader until they TYPE: a new query starts
  // at the top; a new `results` array does not. `results` is re-created when
  // the funder typeahead resolves (~250 ms debounce + network, even with zero
  // donor rows), and keying the reset on that identity snapped a reader who
  // had already arrowed to row 3 back to row 0 — Enter then took a row they
  // never chose. Static rows keep priority in the composition, so rows the
  // typeahead appends never displace the one under the cursor.
  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  // …but the index can never point past the end of a list that shrank.
  useEffect(() => {
    setActiveIdx((i) => Math.min(i, Math.max(0, results.length - 1)))
  }, [results.length])

  // Navigate contract = OmniSearch.handleSelect.
  const select = useCallback(
    (r: SearchResult) => {
      const params = r.params ? '?' + new URLSearchParams(r.params).toString() : ''
      navigate(r.path + params)
      setQuery('')
    },
    [navigate, setQuery]
  )

  const runEnter = () => {
    // A still-loading empty list is not "no results" — never navigate on it.
    if (searching && results.length === 0) return
    const r = results[activeIdx] ?? results[0]
    if (!r) return
    // `searching` means a NEW donor query is scheduled or in flight, so any
    // funder row on screen right now answered an EARLIER query — the hook
    // keeps the previous answer up while the next one loads (the modal shows
    // it the same way). Static rows are filtered synchronously and are
    // always current; a funder row is only Enter-able once its query has
    // settled. 'luriez' must not land on Lurie's card.
    if (searching && r.category === 'funder') return
    select(r)
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
      case 'Home':
        if (!n) return
        e.preventDefault()
        setActiveIdx(0)
        return
      case 'End':
        if (!n) return
        e.preventDefault()
        setActiveIdx(n - 1)
        return
      case 'Enter':
        e.preventDefault()
        runEnter()
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

  // ── Sample pills ─────────────────────────────────────────────────────
  // Tap = fill + run. The mousedown preventDefault keeps the input from
  // blurring (which would close the panel) before focus() re-lands on it.
  const fillAndRun = (sample: SearchSample) => {
    setQuery(sample.query)
    inputRef.current?.focus()
  }

  // Desk: a circular window of WINDOW pills advances by WINDOW every
  // ROTATE_MS with a FADE_MS opacity crossfade (Last48LoadingTips' shape —
  // interval + a tracked fadeTimer, both cleared on cleanup). Paused while
  // the section is hovered or has focus within; under reduced motion the
  // window never advances, so the first WINDOW pills stay put. Mobile shows
  // every pill in a strip and never rotates.
  const [winStart, setWinStart] = useState(0)
  const [pillsVisible, setPillsVisible] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const rotating = !isMobile && !reducedMotion && !hovered && !focusWithin

  useEffect(() => {
    if (!rotating) return
    let fadeTimer: ReturnType<typeof setTimeout> | undefined
    const interval = setInterval(() => {
      setPillsVisible(false)
      fadeTimer = setTimeout(() => {
        setWinStart((s) => (s + WINDOW) % SEARCH_SAMPLES.length)
        setPillsVisible(true)
      }, FADE_MS)
    }, ROTATE_MS)
    return () => {
      clearInterval(interval)
      if (fadeTimer) clearTimeout(fadeTimer)
      // A pause landing mid-fade must not strand the row at opacity 0.
      setPillsVisible(true)
    }
  }, [rotating])

  const n = SEARCH_SAMPLES.length
  const deskPills = Array.from({ length: Math.min(WINDOW, n) }, (_, k) => SEARCH_SAMPLES[(winStart + k) % n])

  const onSectionBlur = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false)
  }

  const renderPill = (sample: SearchSample, extra = '') => (
    <button
      key={sample.label}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => fillAndRun(sample)}
      className={`${PILL} ${extra}`}
    >
      {sample.label}
    </button>
  )

  return (
    <section
      aria-label="Search the city"
      className={`relative z-20 mb-16 transition-all duration-1000 delay-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={onSectionBlur}
    >
      {/* Head row — mirrors Home's Visualizations head (Tier 1 glow). A
          sibling of the field card: it must never contain the panel. */}
      <div
        className="glow-host flex items-center gap-2.5 mb-4 py-1"
        style={{ '--glow': '#b85a33' } as CSSProperties}
      >
        <div className="glow-corner is-sm" />
        <p className="relative text-micro font-mono uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">
          Search the city
        </p>
        <div className="relative flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
        <span className="relative hidden desk:inline font-mono text-nano text-slate-500 dark:text-slate-400">
          ⌘K / Ctrl K anywhere
        </span>
      </div>

      {/* Field card — Tier 3, no glow. `relative` so the panel hangs off it. */}
      <div className="relative rounded-2xl border border-paper-300/60 dark:border-white/10 bg-paper-50 dark:bg-espresso-950/95 shadow-sm transition-colors focus-within:border-paper-500 dark:focus-within:border-white/30">
        <div className="flex items-center gap-3.5 px-5 py-4 desk:py-5">
          <span className="text-paper-600 dark:text-paper-400">
            <SearchIcon size={24} />
          </span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={open && results.length ? optionId(activeIdx) : undefined}
            aria-autocomplete="list"
            aria-label="Search the city"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            placeholder="A neighborhood, a dataset, a donor…"
            // Fraunces italic at display scale; leading-[1.3] is load-bearing
            // (an input clips ink at its box edge; italic descenders need it).
            className="flex-1 min-w-0 bg-transparent outline-none font-display italic tabular-nums text-paper-900 dark:text-paper-100 leading-[1.3] placeholder:text-paper-500 dark:placeholder:text-paper-600"
            style={{ fontSize: 'clamp(1.5rem, 1.6vw + 0.9rem, 3rem)' }}
          />
          {/* The visible Go on touch; Enter's twin everywhere. Mousedown
              preventDefault keeps the input focused so the click lands on a
              list that is still open. */}
          <button
            type="button"
            aria-label="Search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={runEnter}
            className="shrink-0 font-mono text-paper-500 dark:text-paper-600 bg-paper-200/70 dark:bg-white/[0.06] rounded text-label px-2.5 py-1 transition-colors hover:text-ink dark:hover:text-paper-200"
          >
            ↵
          </button>
        </div>

        {/* Results panel — solid background, no blur, no glow. The listbox
            owns OPTION rows only (ARIA: a listbox's children are options;
            a status <p> inside it fails aria-required-children), so the
            two status lines are its siblings, and they are aria-hidden
            because the persistent live region below is what announces them. */}
        <div
          hidden={!open}
          className="absolute left-0 right-0 top-full mt-2 z-20 max-h-[min(60vh,480px)] overflow-y-auto rounded-xl border border-paper-300/60 dark:border-white/10 bg-paper-50 dark:bg-espresso-950 shadow-2xl"
        >
          <div role="listbox" id={listboxId} aria-label="Search results" hidden={results.length === 0}>
            {results.map((r, i) => (
              <ResultRow
                key={r.id}
                result={r}
                onSelect={select}
                size="grand"
                as="option"
                id={optionId(i)}
                active={i === activeIdx}
                onHover={() => setActiveIdx(i)}
              />
            ))}
          </div>
          {results.length === 0 &&
            (searching ? (
              <p aria-hidden className="px-5 py-4 font-mono text-label text-paper-600 dark:text-paper-400">
                {SEARCHING_COPY}
              </p>
            ) : (
              <p aria-hidden className="px-5 py-4 text-base text-paper-700 dark:text-paper-300">
                {NO_MATCHES_COPY}
              </p>
            ))}
        </div>
      </div>

      {/* The announcer. A live region only announces CHANGES to an element
          that was already in the accessibility tree, so it lives here —
          always rendered, never inside the `hidden` panel — and its text
          tracks the panel's state: the two status lines while the list is
          empty, the row count once it fills (aria-activedescendant names the
          active row, but nothing else says how many there are). Empty while
          the panel is closed so closing announces nothing. */}
      <p role="status" className="sr-only">
        {!open
          ? ''
          : results.length > 0
            ? `${results.length} result${results.length === 1 ? '' : 's'}`
            : searching
              ? SEARCHING_COPY
              : NO_MATCHES_COPY}
      </p>

      {/* Sample pills */}
      {isMobile ? (
        <div className="mt-3 -mx-[clamp(16px,3vw,64px)]">
          <div className="flex gap-2 overflow-x-auto snap-x px-[clamp(16px,3vw,64px)] pb-1">
            {SEARCH_SAMPLES.map((s) => renderPill(s, 'shrink-0 snap-start'))}
          </div>
        </div>
      ) : (
        <div
          className={`mt-3 flex flex-wrap gap-2 transition-opacity duration-[400ms] ${
            pillsVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {deskPills.map((s) => renderPill(s))}
        </div>
      )}
    </section>
  )
}
