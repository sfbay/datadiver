import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useElectionManifest, useElectionResults } from '@/hooks/useElectionResults'

const ACCENT = '#6366f1'

export default function Elections() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedElection = searchParams.get('election') || null

  const { data: manifest, isLoading: manifestLoading } = useElectionManifest()

  // Default to most recent election when none selected
  const activeElection = useMemo(() => {
    if (selectedElection) return selectedElection
    return manifest?.elections[0]?.dateCode ?? null
  }, [selectedElection, manifest])

  const { data: displayResults, isLoading: resultsLoading } = useElectionResults(activeElection)
  const isLoading = manifestLoading || resultsLoading

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-mono font-bold"
            style={{ backgroundColor: ACCENT }}
          >
            EL
          </div>
          <div>
            <h1 className="text-lg font-display italic text-ink dark:text-white leading-tight">
              Elections
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              SF election results, RCV visualization & historical playback
            </p>
          </div>
        </div>

        {/* Election picker */}
        {manifest && (
          <select
            value={activeElection ?? ''}
            onChange={(e) => {
              setSearchParams(
                (prev) => {
                  const next = new URLSearchParams(prev)
                  next.set('election', e.target.value)
                  return next
                },
                { replace: true },
              )
            }}
            className="text-sm bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-ink dark:text-white backdrop-blur"
          >
            {manifest.elections.map((e) => (
              <option key={e.dateCode} value={e.dateCode}>
                {e.label}
              </option>
            ))}
          </select>
        )}
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Map area (placeholder for Chunk 2) */}
        <div className="flex-1 relative bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
          {isLoading ? (
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 dark:bg-slate-800/60 backdrop-blur text-sm text-slate-600 dark:text-slate-400">
                <div
                  className="w-3 h-3 rounded-full animate-pulse"
                  style={{ backgroundColor: ACCENT }}
                />
                Loading election data…
              </div>
            </div>
          ) : displayResults ? (
            <div className="text-center space-y-4 max-w-lg px-6">
              <p className="text-sm font-mono text-slate-500 dark:text-slate-400">
                {displayResults.election.label}
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur rounded-xl p-4">
                  <p className="text-2xl font-mono font-bold text-ink dark:text-white">
                    {displayResults.races.length}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Races</p>
                </div>
                <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur rounded-xl p-4">
                  <p className="text-2xl font-mono font-bold text-ink dark:text-white">
                    {displayResults.registration.totalBallotsCast.toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Ballots Cast</p>
                </div>
                <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur rounded-xl p-4">
                  <p className="text-2xl font-mono font-bold text-ink dark:text-white">
                    {(displayResults.registration.turnoutPct * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Turnout</p>
                </div>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-600 italic mt-6">
                Choropleth map + RCV visualization coming in Chunks 2–3
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No election data available</p>
          )}
        </div>

        {/* Sidebar — race list */}
        <aside className="w-80 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl overflow-y-auto">
          <div className="px-4 py-3 border-b border-slate-200/50 dark:border-white/[0.04]">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
              Races
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-1" />
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : displayResults ? (
            <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {displayResults.races.map((race) => {
                const winner = race.candidates.find((c) => c.isWinner)
                return (
                  <div
                    key={race.id}
                    className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/[0.03] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-ink dark:text-white truncate flex-1">
                        {race.title}
                      </p>
                      {race.isRCV && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                          RCV
                        </span>
                      )}
                    </div>
                    {winner && (
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {winner.name}
                        </p>
                        <span className="text-xs font-mono text-slate-400">
                          {(winner.percentage * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
