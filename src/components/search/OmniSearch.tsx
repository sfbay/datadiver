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

function ResultRow({
  result,
  onSelect,
}: {
  result: SearchResult
  onSelect: (r: SearchResult) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(result)}
      className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-slate-100/70 dark:hover:bg-white/[0.04]"
    >
      <span className="text-base leading-none shrink-0">{result.icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] text-ink dark:text-slate-200 truncate">
          {result.label}
        </span>
        <span className="block text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
          {result.sublabel}
        </span>
      </span>
      <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400 uppercase shrink-0 tracking-wider">
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
  const placeholder = cyclePlaceholder
    ? animatedPlaceholder || 'Search across time, place, vendor, dataset…'
    : 'Search across time, place, vendor, dataset…'

  const padY = size === 'slim' ? 'py-2.5' : 'py-2'

  return (
    <div className={`flex items-center gap-2.5 px-3.5 ${padY}`}>
      <span className="text-slate-500 dark:text-slate-400">
        <SearchIcon size={size === 'slim' ? 15 : 14} />
      </span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-[13px] font-mono text-ink dark:text-slate-200 placeholder:text-slate-500 dark:placeholder:text-slate-500 outline-none min-w-0"
      />
      <span className="shrink-0 text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">
        ⌘K
      </span>
    </div>
  )
}

export default function OmniSearch({ mode, isOpen, onClose }: OmniSearchProps) {
  const { query, setQuery, results } = useOmniSearch()
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

    return (
      <div
        className="fixed inset-0 z-50 flex justify-center bg-black/60 backdrop-blur-sm"
        style={{ paddingTop: '20vh' }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setQuery('')
            onClose?.()
          }
        }}
      >
        <div className="w-full max-w-lg mx-4 h-fit">
          <div className="rounded-2xl border border-slate-300/60 dark:border-white/10 bg-white dark:bg-slate-950/95 overflow-hidden shadow-2xl">
            <SearchBar query={query} setQuery={setQuery} inputRef={inputRef} size="tall" />
            {showDropdown && (
              <div className="border-t border-slate-200/60 dark:border-white/[0.06]">
                {results.map((r) => (
                  <ResultRow key={r.id} result={r} onSelect={handleSelect} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Ribbon mode (also covers legacy `inline` callers).
  return (
    <div
      className="rounded-xl border border-slate-300/60 dark:border-white/[0.08] bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm overflow-hidden shadow-sm"
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
        <div className="border-t border-slate-200/60 dark:border-white/[0.06]">
          {results.map((r) => (
            <ResultRow key={r.id} result={r} onSelect={handleSelect} />
          ))}
        </div>
      )}
    </div>
  )
}
