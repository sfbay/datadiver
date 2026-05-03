import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOmniSearch, type SearchResult } from './useOmniSearch'

export interface OmniSearchProps {
  mode: 'inline' | 'modal'
  isOpen?: boolean
  onClose?: () => void
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
      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.04] transition-colors"
    >
      <span className="text-base leading-none shrink-0">{result.icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[12px] text-slate-200 truncate">{result.label}</span>
        <span className="block text-[9px] font-mono text-slate-500 truncate mt-0.5">
          {result.sublabel}
        </span>
      </span>
      <span className="text-[8px] font-mono text-slate-600 uppercase shrink-0 tracking-wider">
        {result.category}
      </span>
    </button>
  )
}

function SearchBar({
  query,
  setQuery,
  inputRef,
}: {
  query: string
  setQuery: (v: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <span className="text-base leading-none shrink-0 opacity-60">🔍</span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search across time, place, vendor, dataset..."
        className="flex-1 bg-transparent text-[13px] font-mono text-slate-200 placeholder:text-slate-600 outline-none min-w-0"
      />
      <span className="shrink-0 text-[10px] font-mono text-slate-600 bg-white/[0.06] px-1.5 py-0.5 rounded">
        ⌘K
      </span>
    </div>
  )
}

export default function OmniSearch({ mode, isOpen, onClose }: OmniSearchProps) {
  const { query, setQuery, results } = useOmniSearch()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Auto-focus when opened
  useEffect(() => {
    if (mode === 'modal' && isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
    if (mode === 'inline') {
      // Focus on mount for inline
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
          <div className="rounded-2xl border border-white/10 bg-slate-950/90 overflow-hidden shadow-2xl">
            <SearchBar query={query} setQuery={setQuery} inputRef={inputRef} />
            {showDropdown && (
              <div className="border-t border-white/[0.06]">
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

  // Inline mode
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 overflow-hidden">
      <SearchBar query={query} setQuery={setQuery} inputRef={inputRef} />
      {showDropdown && (
        <div className="border-t border-white/[0.06]">
          {results.map((r) => (
            <ResultRow key={r.id} result={r} onSelect={handleSelect} />
          ))}
        </div>
      )}
    </div>
  )
}
