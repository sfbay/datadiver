import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOmniSearch, type SearchResult } from './useOmniSearch'
import { ResultRow, SearchIcon } from './ResultRow'

/** The ⌘K modal — the only surface this component renders. The inline
 *  Home search box is `HomeSearch.tsx` (same hook, same ResultRow, its own
 *  combobox chrome); the old page ribbon this file once carried was dead
 *  code since PR #9 and is gone. */
export interface OmniSearchProps {
  isOpen?: boolean
  onClose?: () => void
}

interface SearchBarProps {
  query: string
  setQuery: (v: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}

/** The modal's command-palette input — `tall` scale, the only variant. */
function SearchBar({ query, setQuery, inputRef }: SearchBarProps) {
  return (
    <div className="flex items-center gap-3.5 px-5 py-4 desk:py-5">
      <span className="text-paper-600 dark:text-paper-400">
        <SearchIcon size={24} />
      </span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search views, places, datasets…"
        // The Last 48's big-number face (Last48EventCard hero figure),
        // tried here on the query itself: Fraunces italic at display
        // scale, paper ink. leading-[1.3] overrides text-4xl's tight
        // 1.11 line box — an input clips ink at its box edge, and
        // Fraunces italic descenders (g, j, y) need the extra room.
        className="flex-1 bg-transparent outline-none min-w-0 placeholder:text-paper-500 dark:placeholder:text-paper-600 font-display italic tabular-nums text-paper-900 dark:text-paper-100 text-2xl desk:text-4xl leading-[1.3]"
      />
      <span className="shrink-0 font-mono text-paper-500 dark:text-paper-600 bg-paper-200/70 dark:bg-white/[0.06] rounded text-label px-2 py-1">
        ⌘K
      </span>
    </div>
  )
}

export default function OmniSearch({ isOpen, onClose }: OmniSearchProps) {
  // Pass the REAL palette-open signal through: `isOpen` is a prop owned by
  // AppShell (the ⌘K listener), not hook state — the hook never learns the
  // palette opened unless told, and the funder typeahead is gated on it.
  const { query, setQuery, results } = useOmniSearch({ active: isOpen })
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Focus the input when opened.
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // ESC key closes modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setQuery('')
        onClose?.()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, setQuery])

  const handleSelect = (result: SearchResult) => {
    const params = result.params
      ? '?' + new URLSearchParams(result.params).toString()
      : ''
    navigate(result.path + params)
    setQuery('')
    onClose?.()
  }

  const showDropdown = results.length > 0

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
          <SearchBar query={query} setQuery={setQuery} inputRef={inputRef} />
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
