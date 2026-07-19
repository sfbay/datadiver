import { useMemo } from 'react'
import DetailPanelShell from '@/components/ui/DetailPanelShell'
import PositionScale from '@/components/charts/PositionScale'
import { useNeighborhoodResults } from '@/hooks/useElectionResults'
import { ACCENT, turnoutColor } from '@/utils/electionColors'
import { cleanCandidateName, displayNhood, nhoodKey, sharePhrase } from '@/utils/electionData'
import { toSentenceCase } from '@/utils/format'
import type { Race } from '@/types/elections'

interface NeighborhoodElectionPanelProps {
  neighborhood: string | null   // UPPERCASE dsov key
  dateCode: string | null
  race: Race | null             // the active race — its votes HERE are shown
  citywideTurnout: number | null
  candidateColors: Map<string, string>
  onClose: () => void
}

/** Certified per-neighborhood panel. Citywide stays the canvas: the
 *  PositionScale places this neighborhood's turnout on the citywide gap
 *  (reference tick = citywide average). Era-correct: a 2020 selection shows
 *  the legacy name and legacy-scheme numbers. */
export default function NeighborhoodElectionPanel({
  neighborhood, dateCode, race, citywideTurnout, candidateColors, onClose,
}: NeighborhoodElectionPanelProps) {
  const { data, isLoading } = useNeighborhoodResults(neighborhood ? dateCode : null)
  const file = data?.dateCode === dateCode ? data : null

  const row = useMemo(() => {
    if (!file || !neighborhood) return null
    const key = Object.keys(file.neighborhoods).find((k) => nhoodKey(k) === nhoodKey(neighborhood))
    return key ? { key, ...file.neighborhoods[key] } : null
  }, [file, neighborhood])

  const turnoutRange = useMemo((): [number, number] => {
    if (!file) return [0, 1]
    const ts = Object.values(file.neighborhoods)
      .filter((n) => n.registered > 0)
      .map((n) => n.turnout)
    return [Math.min(...ts), Math.max(...ts)]
  }, [file])

  const raceHere = row && race ? row.races[race.id] ?? null : null
  const topHere = useMemo(() => {
    if (!raceHere) return []
    return Object.entries(raceHere.votes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, votes]) => ({
        name: cleanCandidateName(name),
        votes,
        share: raceHere.total > 0 ? votes / raceHere.total : 0,
      }))
  }, [raceHere])

  if (!neighborhood) return null

  return (
    <DetailPanelShell
      open={!!neighborhood}
      onClose={onClose}
      isLoading={isLoading && !row}
      spinnerClass="border-indigo-400"
      widthClass="w-80"
      glowColor={ACCENT}
    >
      <div className="pr-6">
        <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-1">
          Neighborhood
        </p>
        <h3 className="text-lg font-display italic text-ink dark:text-white mb-4">
          {file ? displayNhood(neighborhood, file.scheme) : neighborhood}
        </h3>

        {row ? (
          <>
            <div className="mb-4">
              <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-1">
                Turnout here
              </p>
              <p className="text-lg font-mono font-bold" style={{ color: turnoutColor(row.turnout) }}>
                {(row.turnout * 100).toFixed(1)}%
              </p>
              <PositionScale
                value={row.turnout}
                range={turnoutRange}
                reference={citywideTurnout ?? undefined}
                width={120}
                color={turnoutColor(row.turnout)}
              />
              <p className="text-micro text-slate-500 mt-1">
                {row.ballots.toLocaleString()} of {row.registered.toLocaleString()} registered
                {citywideTurnout !== null && ` · citywide ${(citywideTurnout * 100).toFixed(1)}%`}
              </p>
            </div>

            {race && topHere.length > 0 && (
              <>
                <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                  {toSentenceCase(race.title)} — here
                </p>
                <div className="space-y-1.5 mb-2">
                  {topHere.map((c) => (
                    <div key={c.name} className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: candidateColors.get(c.name) || '#a8926a' }}
                      />
                      <span className="text-micro truncate flex-1 text-ink dark:text-slate-300">
                        {toSentenceCase(c.name)}
                      </span>
                      <span className="text-micro font-mono text-slate-500">
                        {(c.share * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
                {topHere[0] && (
                  <p className="text-micro text-slate-500 italic">
                    {toSentenceCase(topHere[0].name.split('/')[0].trim())} took {sharePhrase(topHere[0].share)} here.
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          !isLoading && (
            <p className="text-label text-slate-500">
              No certified neighborhood figures for this election.
            </p>
          )
        )}
      </div>
    </DetailPanelShell>
  )
}
