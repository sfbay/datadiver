/** BusinessSearch — Level 1 landscape view at /business.
 *
 *  A search-first hub. Users type a name / owner / address / BAN; results
 *  stream in via the debounced useBusinessSearch hook. Clicking any result
 *  routes to the per-business profile at /business/:uniqueid.
 *
 *  When the search input is empty, a small set of featured collections fills
 *  the space (oldest active businesses, recent notable closures, biggest
 *  chains) — to be added in a follow-up wave; for now the empty state is a
 *  prompt to start typing.
 */

import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBusinessSearch, type BusinessSearchFilters, type BusinessSortKey } from '@/hooks/useBusinessSearch'
import BusinessRow from './components/BusinessRow'
import { Skeleton } from '@/components/ui/Skeleton'

export default function BusinessSearch() {
  const [searchParams, setSearchParams] = useSearchParams()

  const query = searchParams.get('q') || ''
  const status = (searchParams.get('status') as BusinessSearchFilters['status']) || 'all'
  const corridor = searchParams.get('corridor') || null
  const minTenureYears = Number(searchParams.get('tenure') || '0') || undefined
  const sort = (searchParams.get('sort') as BusinessSortKey) || 'recent'

  const setParam = (key: string, value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (!value) next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  }

  const filters = useMemo<BusinessSearchFilters>(() => ({
    status,
    corridor,
    minTenureYears,
  }), [status, corridor, minTenureYears])

  const { results, totalCount, isLoading, error } = useBusinessSearch(query, filters, sort)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-10">
        <div className="flex items-baseline gap-4 mb-1">
          <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
            Business Search
          </h1>
          <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Registered Businesses · Drill-Down
          </p>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-500">
          Search by business name, owner, address, or BAN. Click any result to see the full profile —
          chain locations, mailing address, license, and source-of-truth deep links.
        </p>
      </header>

      {/* Search input + filters */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200/40 dark:border-white/[0.04]">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setParam('q', e.target.value)}
            placeholder="Try ‘Boudin’, ‘Mission’, or a Business Account Number…"
            autoFocus
            className="w-full text-[13px] bg-white dark:bg-white/[0.04]
              border border-slate-200/60 dark:border-white/[0.08]
              rounded-lg pl-10 pr-3 py-2.5 text-slate-700 dark:text-slate-200
              placeholder:text-slate-400 dark:placeholder:text-slate-600
              focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            width="14" height="14" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.5"
          >
            <circle cx="7" cy="7" r="5" />
            <path d="m11 11 3 3" strokeLinecap="round" />
          </svg>
        </div>

        {/* Filter chip row */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <FilterPill
            label="Status"
            value={status}
            options={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'closed', label: 'Closed' },
              { value: 'admin-closed', label: 'Forced closure' },
            ]}
            onChange={(v) => setParam('status', v === 'all' ? null : v)}
          />
          <FilterPill
            label="Tenure"
            value={String(minTenureYears || 0)}
            options={[
              { value: '0', label: 'Any age' },
              { value: '5', label: '5+ years' },
              { value: '10', label: '10+ years' },
              { value: '25', label: '25+ years' },
            ]}
            onChange={(v) => setParam('tenure', v === '0' ? null : v)}
          />
          <FilterPill
            label="Sort"
            value={sort}
            options={[
              { value: 'recent', label: 'Most recent' },
              { value: 'tenure-desc', label: 'Longest tenure' },
              { value: 'alphabetical', label: 'A → Z' },
            ]}
            onChange={(v) => setParam('sort', v === 'recent' ? null : v)}
          />
          {corridor && (
            <button
              onClick={() => setParam('corridor', null)}
              className="text-[10px] font-mono px-2 py-1 rounded-full
                bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15 transition-colors"
            >
              Corridor: {corridor} ✕
            </button>
          )}
        </div>
      </div>

      {/* Results body */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4 max-w-4xl mx-auto">
          {/* Status line */}
          {(query || status !== 'all' || minTenureYears) && (
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500 mb-3">
              {isLoading
                ? 'Searching…'
                : totalCount !== null
                  ? `${results.length.toLocaleString()} shown · ${totalCount.toLocaleString()} match${totalCount === 1 ? '' : 'es'}`
                  : `${results.length.toLocaleString()} results`}
            </p>
          )}

          {error && (
            <div className="glass-card rounded-xl p-4 mb-3">
              <p className="text-sm text-red-400">Search failed: {error}</p>
            </div>
          )}

          {/* Empty / prompt state */}
          {!query && results.length === 0 && !isLoading && (
            <EmptyPrompt />
          )}

          {/* Loading skeletons */}
          {isLoading && results.length === 0 && (
            <div className="space-y-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="glass-card rounded-xl p-3">
                  <Skeleton className="h-3 w-1/2 mb-2" />
                  <Skeleton className="h-2 w-1/3 mb-1" />
                  <Skeleton className="h-2 w-2/3" />
                </div>
              ))}
            </div>
          )}

          {/* Results list */}
          {!isLoading && results.length > 0 && (
            <div className="space-y-2">
              {results.map((r) => (
                <BusinessRow key={r.uniqueid} result={r} />
              ))}
              {totalCount !== null && totalCount > results.length && (
                <p className="text-[10px] font-mono text-slate-500 text-center mt-4">
                  Showing {results.length} of {totalCount.toLocaleString()} matches.
                  Refine the search or filters to narrow further.
                </p>
              )}
            </div>
          )}

          {/* No matches for query */}
          {!isLoading && query && results.length === 0 && !error && (
            <div className="text-center py-12">
              <p className="text-[12px] text-slate-500 font-mono">
                No businesses match “{query}”
              </p>
              <p className="text-[10px] text-slate-600 mt-2">
                Try a different spelling, or remove filters.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Filter pill ────────────────────────────────────────────

interface FilterPillProps {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

function FilterPill({ label, value, options, onChange }: FilterPillProps) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] font-mono">
      <span className="uppercase tracking-[0.15em] text-slate-400 dark:text-slate-600">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white/80 dark:bg-white/[0.04] border border-slate-200/50 dark:border-white/[0.06]
          rounded-md px-2 py-1 text-slate-600 dark:text-slate-300
          focus:outline-none focus:border-emerald-500/40 transition-colors cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

// ── Empty prompt ────────────────────────────────────────────

function EmptyPrompt() {
  return (
    <div className="text-center py-16 max-w-md mx-auto">
      <p
        className="text-[20px] text-slate-400 dark:text-slate-500 italic mb-3"
        style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}
      >
        Start typing to search 136,000+ SF businesses.
      </p>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Search by <span className="text-slate-300">business name</span>{', '}
        <span className="text-slate-300">owner</span>{', '}
        <span className="text-slate-300">address</span>, or{' '}
        <span className="text-slate-300">Business Account Number (BAN)</span>.
      </p>
      <p className="text-[10px] text-slate-600 mt-4">
        Each result links to a full business profile with chain locations,
        mailing address, license details, and source-of-truth registry deep links.
      </p>
    </div>
  )
}
