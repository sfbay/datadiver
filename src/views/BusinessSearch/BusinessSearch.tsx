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

import { useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useBusinessSearch, type BusinessSearchFilters, type BusinessSortKey } from '@/hooks/useBusinessSearch'
import { useBusinessFeatured, type FeaturedBusiness, type FeaturedChain } from '@/hooks/useBusinessFeatured'
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
          <p className="text-micro font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Registered Businesses · Drill-Down
          </p>
        </div>
        <p className="text-label text-slate-500 dark:text-slate-500">
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
              focus:outline-none focus:border-moss-500/50 transition-colors"
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
              className="text-micro font-mono px-2 py-1 rounded-full
                bg-moss-500/10 text-moss-400 hover:bg-moss-500/15 transition-colors"
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
            <p className="text-micro font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500 mb-3">
              {isLoading
                ? 'Searching…'
                : totalCount !== null
                  ? `${results.length.toLocaleString()} shown · ${totalCount.toLocaleString()} match${totalCount === 1 ? '' : 'es'}`
                  : `${results.length.toLocaleString()} results`}
            </p>
          )}

          {error && (
            <div className="glass-card rounded-xl p-4 mb-3">
              <p className="text-sm text-brick-400">Search failed: {error}</p>
            </div>
          )}

          {/* Empty / featured-collections state */}
          {!query && results.length === 0 && !isLoading && (
            <FeaturedLanding />
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
                <p className="text-micro font-mono text-slate-500 text-center mt-4">
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
              <p className="text-micro text-slate-600 mt-2">
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
    <label className="flex items-center gap-1.5 text-micro font-mono">
      <span className="uppercase tracking-[0.15em] text-slate-400 dark:text-slate-600">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white/80 dark:bg-white/[0.04] border border-slate-200/50 dark:border-white/[0.06]
          rounded-md px-2 py-1 text-slate-600 dark:text-slate-300
          focus:outline-none focus:border-moss-500/40 transition-colors cursor-pointer"
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

// ── Featured landing (empty-state collections) ─────────────────

function FeaturedLanding() {
  const { oldestActive, recentClosures, biggestChains, isLoading, error } = useBusinessFeatured()

  return (
    <div className="space-y-6 py-2">
      <div>
        <p className="font-display italic text-[18px] text-slate-400 dark:text-slate-400 mb-1">
          Search 136,000+ SF businesses by name, owner, address, or BAN.
        </p>
        <p className="text-label text-slate-500 leading-relaxed">
          Or start with one of these — curated views into the registry.
        </p>
      </div>

      {error && (
        <p className="text-label text-brick-400">Featured collections failed to load: {error}</p>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 desk:grid-cols-3 gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="glass-card rounded-xl p-4 space-y-2">
              <Skeleton className="h-3 w-1/2" />
              {Array.from({ length: 5 }, (_, j) => <Skeleton key={j} className="h-2 w-full" />)}
            </div>
          ))}
        </div>
      )}

      {!isLoading && !error && (
        <div className="grid grid-cols-1 desk:grid-cols-3 gap-3">
          <FeaturedCard
            title="SF's old guard"
            subtitle="Oldest active businesses"
            accent="#7a9954"
          >
            {oldestActive.map((b) => (
              <FeaturedBusinessRow key={b.uniqueid} business={b} showStartYear />
            ))}
          </FeaturedCard>

          <FeaturedCard
            title="Notable closures"
            subtitle="Long-tenured businesses lost in the last year"
            accent="#b85545"
          >
            {recentClosures.length === 0 && (
              <p className="text-micro text-slate-500 italic px-2 py-1">
                No notable long-tenure closures in the last 365 days.
              </p>
            )}
            {recentClosures.map((b) => (
              <FeaturedBusinessRow key={b.uniqueid} business={b} showAge />
            ))}
          </FeaturedCard>

          <FeaturedCard
            title="Biggest chains"
            subtitle="By location count under one BAN"
            accent="#5c9693"
          >
            {biggestChains.map((c) => (
              <FeaturedChainRow key={c.ban} chain={c} />
            ))}
          </FeaturedCard>
        </div>
      )}
    </div>
  )
}

function FeaturedCard({
  title, subtitle, accent, children,
}: {
  title: string; subtitle: string; accent: string; children: React.ReactNode
}) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-baseline gap-2 mb-1">
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: accent }}
        />
        <p className="font-display italic text-[15px] text-ink dark:text-slate-100 leading-none">
          {title}
        </p>
      </div>
      <p className="text-nano font-mono uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500 mb-3">
        {subtitle}
      </p>
      <ul className="space-y-1">{children}</ul>
    </div>
  )
}

function FeaturedBusinessRow({
  business, showStartYear, showAge,
}: { business: FeaturedBusiness; showStartYear?: boolean; showAge?: boolean }) {
  const startYear = business.startDate?.split('T')[0]?.slice(0, 4)
  const endYear = business.endDate?.split('T')[0]?.slice(0, 4)
  return (
    <li>
      <Link
        to={`/business/${encodeURIComponent(business.uniqueid)}`}
        className="block px-2 py-1.5 -mx-2 rounded-md hover:bg-white/[0.04] transition-colors group"
      >
        <p className="text-label text-slate-700 dark:text-slate-200 truncate">
          {business.dbaName}
        </p>
        <p className="text-nano text-slate-500 font-mono mt-0.5">
          {showStartYear && <>since {startYear} · </>}
          {showAge && <>{business.ageYears}y · </>}
          {business.sector}
          {endYear && <span className="text-brick-400"> · closed {endYear}</span>}
        </p>
      </Link>
    </li>
  )
}

function FeaturedChainRow({ chain }: { chain: FeaturedChain }) {
  return (
    <li>
      <Link
        to={`/business/chain/${encodeURIComponent(chain.ban)}`}
        className="block px-2 py-1.5 -mx-2 rounded-md hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-label text-slate-700 dark:text-slate-200 truncate min-w-0">
            {chain.primaryDba}
          </p>
          <p className="text-micro font-mono text-teal-400 flex-shrink-0">
            {chain.locationCount} locations
          </p>
        </div>
        <p className="text-nano text-slate-500 font-mono mt-0.5">
          BAN {chain.ban}
        </p>
      </Link>
    </li>
  )
}
