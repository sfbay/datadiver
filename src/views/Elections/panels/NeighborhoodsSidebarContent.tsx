import { useCallback, useMemo } from 'react'
import PositionScale from '@/components/charts/PositionScale'
import { useNeighborhoodResults } from '@/hooks/useElectionResults'
import { turnoutColor } from '@/utils/electionColors'
import { displayNhood } from '@/utils/electionData'
import { SkeletonSidebarRows } from '@/components/ui/Skeleton'

interface NeighborhoodsSidebarContentProps {
  dateCode: string | null
  citywideTurnout: number | null
  selectedNeighborhood: string | null
  setSelectedNeighborhood: (n: string | null) => void
}

/** Neighborhood list for the active election — the dsov keys ARE the
 *  era-correct vocabulary (41 modern, 26 legacy), so no crosswalk exists or
 *  is needed. Zero-registration district artifacts (ANGEL ISLAND) are
 *  filtered. The old "N precincts" sub-label is gone (spec: never
 *  load-bearing; keeping it would need a geometry join). */
export default function NeighborhoodsSidebarContent({
  dateCode, citywideTurnout, selectedNeighborhood, setSelectedNeighborhood,
}: NeighborhoodsSidebarContentProps) {
  const { data, isLoading } = useNeighborhoodResults(dateCode)
  const file = data?.dateCode === dateCode ? data : null

  const rows = useMemo(() => {
    if (!file) return []
    return Object.entries(file.neighborhoods)
      .filter(([, n]) => n.registered > 0)
      .map(([name, n]) => ({ name, turnout: n.turnout, ballots: n.ballots }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [file])

  const turnoutRange = useMemo((): [number, number] => {
    if (rows.length === 0) return [0, 1]
    const ts = rows.map((r) => r.turnout)
    return [Math.min(...ts), Math.max(...ts)]
  }, [rows])

  const handleClick = useCallback((name: string) => {
    setSelectedNeighborhood(selectedNeighborhood === name ? null : name)
  }, [selectedNeighborhood, setSelectedNeighborhood])

  if (isLoading && rows.length === 0) return <SkeletonSidebarRows count={10} />

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
          {rows.length} Neighborhoods
        </p>
        <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
      </div>

      {selectedNeighborhood && (
        <button
          onClick={() => setSelectedNeighborhood(null)}
          className="mb-3 text-micro font-mono text-indigo-500 hover:text-indigo-400 transition-colors"
        >
          ← Clear: {file ? displayNhood(selectedNeighborhood, file.scheme) : selectedNeighborhood}
        </button>
      )}

      <div className="space-y-0.5">
        {rows.map((r) => {
          const isActive = selectedNeighborhood === r.name
          return (
            <div
              key={r.name}
              onClick={() => handleClick(r.name)}
              className={`py-2 px-3 rounded-lg cursor-pointer transition-all duration-200 ${
                isActive
                  ? 'bg-ochre-500/10 ring-1 ring-ochre-500/30'
                  : 'hover:bg-white/80 dark:hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center gap-2">
                <p className="text-[12px] font-medium text-ink dark:text-slate-200 leading-tight flex-1 truncate">
                  {file ? displayNhood(r.name, file.scheme) : r.name}
                </p>
                <span className="text-micro font-mono" style={{ color: turnoutColor(r.turnout) }}>
                  {(r.turnout * 100).toFixed(0)}%
                </span>
              </div>
              <PositionScale
                value={r.turnout}
                range={turnoutRange}
                reference={citywideTurnout ?? undefined}
                width={100}
                height={10}
                color={turnoutColor(r.turnout)}
              />
            </div>
          )
        })}
      </div>
    </>
  )
}
