import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOmniSearch, type SearchResult } from './useOmniSearch'
import { useTypingPlaceholder } from '@/hooks/useTypingPlaceholder'

export interface OmniSearchProps {
  /** Surface mode. `ribbon` is the slim top-of-page form; `modal` is the
   *  ⌘K-triggered overlay. (`inline` is kept as an alias for backward
   *  compatibility but renders as `ribbon`.) */
  mode: 'ribbon' | 'inline' | 'modal'
  isOpen?: boolean
  onClose?: () => void
}

/** Sample queries cycled through the ribbon placeholder. Stable reference
 *  (module-scoped) so the typing-placeholder effect doesn't restart every
 *  render. Each one demonstrates a different dimension of search:
 *  neighborhood, vendor, dataset, sub-category, entity. */
const RIBBON_SAMPLES = [
  'Crime in the Tenderloin',
  'Parking revenue · Mission',
  '311 graffiti reports',
  'Vendor: Salesforce',
  'Uber campaign contributions',
  'Response times · Sunset',
]

function SearchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <circle cx="7" cy="7" r="5" />
      <path d="M11 11l4 4" />
    </svg>
  )
}

/** `slim` is the ribbon dropdown's compact row; `grand` is the ⌘K modal's
 *  command-palette scale — the modal empties the screen, so its terms must
 *  dominate it, not whisper at dropdown size. */
function ResultRow({
  result,
  onSelect,
  size = 'slim',
}: {
  result: SearchResult
  onSelect: (r: SearchResult) => void
  size?: 'slim' | 'grand'
}) {
  const grand = size === 'grand'
  return (
    <button
      type="button"
      onClick={() => onSelect(result)}
      className={`w-full flex items-center text-left transition-colors hover:bg-paper-100/50 dark:hover:bg-white/[0.04] ${
        grand ? 'gap-4 px-5 py-3.5' : 'gap-3 px-3 py-2'
      }`}
    >
      <span className={`leading-none shrink-0 ${grand ? 'text-2xl' : 'text-base'}`}>
        {result.icon}
      </span>
      <span className="flex-1 min-w-0">
        {/* Name and code are SEPARATE spans on one line — only the name
            truncates, so a long region label can never clip away the code
            that is the precise unit the data is keyed by (the beat/region
            idiom from the ranking rows). Rows without a `code` render exactly
            as before: a single truncating label filling the line. */}
        <span className="flex items-baseline gap-2 min-w-0">
          <span
            className={`min-w-0 text-ink dark:text-paper-100 truncate ${
              grand ? 'text-lg desk:text-xl' : 'text-[13px]'
            }`}
          >
            {result.label}
          </span>
          {result.code && (
            <span
              className={`shrink-0 font-mono text-paper-600 dark:text-paper-400 ${
                grand ? 'text-sm' : 'text-micro'
              }`}
            >
              {result.code}
            </span>
          )}
        </span>
        <span
          className={`block font-mono text-paper-600 dark:text-paper-400 truncate ${
            grand ? 'text-sm mt-1' : 'text-micro mt-0.5'
          }`}
        >
          {result.sublabel}
        </span>
      </span>
      <span
        className={`font-mono text-paper-500 dark:text-paper-600 uppercase shrink-0 ${
          grand ? 'text-label tracking-widest' : 'text-nano tracking-wider'
        }`}
      >
        {result.category}
      </span>
    </button>
  )
}

interface SearchBarProps {
  query: string
  setQuery: (v: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  /** When true, the placeholder cycles through sample queries. Disabled
   *  for the modal mode (which auto-focuses immediately). */
  cyclePlaceholder?: boolean
  /** Visual height variant. `slim` is for the ribbon at the top of the
   *  page; `tall` is for the modal. */
  size?: 'slim' | 'tall'
}

function SearchBar({ query, setQuery, inputRef, cyclePlaceholder = false, size = 'tall' }: SearchBarProps) {
  const [focused, setFocused] = useState(false)
  // Suppress the type-out animation while user is interacting or typing.
  const animatedPlaceholder = useTypingPlaceholder({
    samples: RIBBON_SAMPLES,
    paused: !cyclePlaceholder || focused || query.length > 0,
  })
  // The modal's placeholder is shorter — at command-palette type scale the
  // ribbon's full sentence overflows the input on narrow viewports.
  const placeholder = cyclePlaceholder
    ? animatedPlaceholder || 'Search across time, place, vendor, dataset…'
    : 'Search views, places, datasets…'

  // `tall` is the ⌘K modal's command-palette scale (the modal is the only
  // caller); `slim` is the page ribbon.
  const grand = size !== 'slim'

  return (
    <div
      className={`flex items-center ${
        grand ? 'gap-3.5 px-5 py-4 desk:py-5' : 'gap-2.5 px-3.5 py-2.5'
      }`}
    >
      <span className="text-paper-600 dark:text-paper-400">
        <SearchIcon size={grand ? 24 : 15} />
      </span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className={`flex-1 bg-transparent outline-none min-w-0 placeholder:text-paper-500 dark:placeholder:text-paper-600 ${
          grand
            ? // The Last 48's big-number face (Last48EventCard hero figure),
              // tried here on the query itself: Fraunces italic at display
              // scale, paper ink. leading-[1.3] overrides text-4xl's tight
              // 1.11 line box — an input clips ink at its box edge, and
              // Fraunces italic descenders (g, j, y) need the extra room.
              'font-display italic tabular-nums text-paper-900 dark:text-paper-100 text-2xl desk:text-4xl leading-[1.3]'
            : 'font-mono text-ink dark:text-paper-100 text-[13px]'
        }`}
      />
      <span
        className={`shrink-0 font-mono text-paper-500 dark:text-paper-600 bg-paper-200/70 dark:bg-white/[0.06] rounded ${
          grand ? 'text-label px-2 py-1' : 'text-micro px-1.5 py-0.5'
        }`}
      >
        ⌘K
      </span>
    </div>
  )
}

export default function OmniSearch({ mode, isOpen, onClose }: OmniSearchProps) {
  // Pass the REAL palette-open signal through: for the modal surface,
  // `isOpen` is a prop owned by AppShell (the ⌘K listener), not this hook's
  // own internal state — the hook never learns the palette opened unless
  // told. For the ribbon surface `isOpen` is undefined, so `active` falls
  // back to the hook's own internal `isOpen` (see UseOmniSearchOptions).
  const { query, setQuery, results } = useOmniSearch({ active: isOpen })
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Modal: focus the input when opened. Ribbon: do NOT auto-focus —
  // browsers scroll a freshly-focused input into view, and the ribbon
  // sits below the page's first paint. Power users still have ⌘K to
  // open the modal.
  useEffect(() => {
    if (mode === 'modal' && isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [mode, isOpen])

  // ESC key closes modal
  useEffect(() => {
    if (mode !== 'modal') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setQuery('')
        onClose?.()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mode, onClose, setQuery])

  const handleSelect = (result: SearchResult) => {
    const params = result.params
      ? '?' + new URLSearchParams(result.params).toString()
      : ''
    navigate(result.path + params)
    setQuery('')
    onClose?.()
  }

  const showDropdown = results.length > 0

  if (mode === 'modal') {
    if (!isOpen) return null

    // Command-palette register: the backdrop empties the screen, so the
    // palette dominates it — wide container, display-scale terms, grand rows.
    return (
      <div
        className="fixed inset-0 z-50 flex justify-center bg-black/70 backdrop-blur-md"
        style={{ paddingTop: '14vh' }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setQuery('')
            onClose?.()
          }
        }}
      >
        <div className="w-full max-w-3xl mx-4 h-fit">
          <div className="rounded-2xl border border-paper-300/60 dark:border-white/10 bg-paper-50 dark:bg-espresso-950/95 overflow-hidden shadow-2xl">
            <SearchBar query={query} setQuery={setQuery} inputRef={inputRef} size="tall" />
            {showDropdown && (
              <div className="border-t border-paper-200/50 dark:border-espresso-700/60 max-h-[60vh] overflow-y-auto">
                {results.map((r) => (
                  <ResultRow key={r.id} result={r} onSelect={handleSelect} size="grand" />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Ribbon mode (also covers legacy `inline` callers).
  // Container click anywhere → focus the input. Without this, the
  // hit area is just the <input> element itself, and clicks on the
  // icon / placeholder whitespace / ⌘K hint do nothing — confusing.
  const focusInput = () => inputRef.current?.focus()
  return (
    <div
      onClick={focusInput}
      className="cursor-text rounded-xl border border-paper-300/60 dark:border-white/[0.08] bg-paper-50/80 dark:bg-espresso-900/60 backdrop-blur-sm overflow-hidden shadow-sm transition-colors hover:border-paper-400/70 dark:hover:border-white/[0.14] focus-within:border-paper-500 dark:focus-within:border-white/30"
      style={{ '--accent': '#b85a33' } as CSSProperties}
    >
      <SearchBar
        query={query}
        setQuery={setQuery}
        inputRef={inputRef}
        cyclePlaceholder
        size="slim"
      />
      {showDropdown && (
        <div className="border-t border-paper-200/50 dark:border-white/[0.06]" onClick={(e) => e.stopPropagation()}>
          {results.map((r) => (
            <ResultRow key={r.id} result={r} onSelect={handleSelect} />
          ))}
        </div>
      )}
    </div>
  )
}
