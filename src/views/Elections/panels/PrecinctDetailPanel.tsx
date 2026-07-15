import { useMemo } from 'react'
import DetailPanelShell from '@/components/ui/DetailPanelShell'
import { usePrecinctRace, usePrecinctTurnout } from '@/hooks/useElectionResults'
import { ACCENT, turnoutColor } from '@/utils/electionColors'
import { cleanCandidateName, displayNhood } from '@/utils/electionData'
import { toSentenceCase } from '@/utils/format'
import type { Race } from '@/types/elections'

interface PrecinctDetailPanelProps {
  label: string | null          // _turnout row label, e.g. "1101" or "1104/1105"
  dateCode: string | null
  race: Race | null
  candidateColors: Map<string, string>
  geometry: GeoJSON.FeatureCollection | null  // era geometry — parent-nhood lookup
  onSelectNeighborhood: (nhood: string) => void
  onClose: () => void
}

/** Compact top-right precinct card (house DetailPanelShell pattern). Fetches
 *  its own race file (module-cached) so it works in turnout/margin modes too.
 *  Footer discloses the suppressed-precinct residual, data-driven. */
export default function PrecinctDetailPanel({
  label, dateCode, race, candidateColors, geometry, onSelectNeighborhood, onClose,
}: PrecinctDetailPanelProps) {
  const { data: turnoutRaw } = usePrecinctTurnout(label ? dateCode : null)
  const turnout = turnoutRaw?.dateCode === dateCode ? turnoutRaw : null
  const { data: raceRaw, isLoading: raceLoading } = usePrecinctRace(
    label ? dateCode : null,
    race?.id ?? null,
  )
  const raceFile = raceRaw?.dateCode === dateCode && raceRaw?.raceId === race?.id ? raceRaw : null

  const row = label && turnout ? turnout.precincts[label] ?? null : null
  const raceRow = label && raceFile ? raceFile.precincts[label] ?? null : null

  const scheme = turnout?.era === 'prec_2012' ? 'legacy26' as const : 'analysis41' as const
  const parentNhood = useMemo(() => {
    if (!row || !geometry) return null
    const first = row.ids[0]
    const f = geometry.features.find((x) => String(x.properties?.id) === first)
    return f ? String(f.properties?.nhood) : null
  }, [row, geometry])

  const candidates = useMemo(() => {
    if (!raceRow) return []
    return Object.entries(raceRow.votes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, votes]) => ({
        name: cleanCandidateName(name),
        votes,
        share: raceRow.total > 0 ? votes / raceRow.total : 0,
      }))
  }, [raceRow])

  if (!label) return null

  return (
    <DetailPanelShell
      open={!!label}
      onClose={onClose}
      isLoading={!turnout}
      spinnerClass="border-indigo-400"
      widthClass="w-72"
      glowColor={ACCENT}
    >
      <div className="pr-6">
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-1">
          Precinct
        </p>
        <h3 className="text-lg font-display italic text-ink dark:text-white">{label}</h3>
        {parentNhood && (
          <button
            onClick={() => onSelectNeighborhood(parentNhood.toUpperCase())}
            className="text-[10px] font-mono text-indigo-500/80 hover:text-indigo-500 transition-colors mb-3"
          >
            {displayNhood(parentNhood.toUpperCase(), scheme)} →
          </button>
        )}

        {row && (
          <div className="mb-4 mt-1">
            <p className="text-lg font-mono font-bold" style={{ color: turnoutColor(row.turnout) }}>
              {(row.turnout * 100).toFixed(1)}%
            </p>
            <p className="text-[10px] text-slate-500">
              {row.ballots.toLocaleString()} of {row.registered.toLocaleString()} registered turned out
            </p>
          </div>
        )}

        {turnout && !row && (
          <p className="text-[11px] text-slate-500">No results reported for this precinct in this election.</p>
        )}

        {row && race && (
          <>
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
              {toSentenceCase(race.title)}
            </p>
            {raceLoading && !raceRow && (
              <p className="text-[10px] text-slate-500">Loading votes…</p>
            )}
            <div className="space-y-1.5">
              {candidates.map((c) => (
                <div key={c.name}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] truncate flex-1 text-ink dark:text-slate-300">
                      {toSentenceCase(c.name)}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {c.votes.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-slate-200/50 dark:bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${c.share * 100}%`,
                        backgroundColor: candidateColors.get(c.name) || '#a8926a',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {race.isRCV && (
              <p className="text-[9px] font-mono text-indigo-500 mt-2">First choices — Ranked Choice Voting</p>
            )}
          </>
        )}

        {turnout && turnout.suppressed.registered > 0 && (
          <p className="text-[9px] text-slate-400/80 dark:text-slate-500 italic mt-4 pt-3 border-t border-slate-200/50 dark:border-white/[0.06]">
            S.F. withholds a few tiny precincts for ballot secrecy —{' '}
            {turnout.suppressed.registered.toLocaleString()} voters in this election are counted
            citywide but not shown per precinct.
          </p>
        )}
      </div>
    </DetailPanelShell>
  )
}
