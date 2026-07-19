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
  /** Clean candidate name currently in FOCUS mode, or null. */
  focusedCandidate: string | null
  onFocusCandidate: (name: string | null) => void
}

/** Compact top-right precinct card (house DetailPanelShell pattern). Fetches
 *  its own race file (module-cached) so it works in turnout/margin modes too.
 *  Footer discloses the suppressed-precinct residual, data-driven. */
export default function PrecinctDetailPanel({
  label, dateCode, race, candidateColors, geometry, onSelectNeighborhood, onClose,
  focusedCandidate, onFocusCandidate,
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
      widthClass="w-80"
      glowColor={ACCENT}
    >
      <div className="pr-6">
        {/* Geography first: neighborhood is the title, precinct number one mono line under it */}
        {parentNhood && parentNhood !== 'NA' ? (
          <button
            onClick={() => onSelectNeighborhood(parentNhood.toUpperCase())}
            className="block text-left text-lg font-display italic text-ink dark:text-white leading-tight hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
          >
            {displayNhood(parentNhood.toUpperCase(), scheme)} →
          </button>
        ) : (
          <h3 className="text-lg font-display italic text-ink dark:text-white leading-tight">
            Precinct {label}
          </h3>
        )}
        {parentNhood && parentNhood !== 'NA' && (
          <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 mt-1 mb-4">
            Precinct {label}
          </p>
        )}

        {/* Turnout is the hero: big number + a two-part voted/didn't bar */}
        {row && (
          <div className="mb-5">
            <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-1">
              Turnout
            </p>
            <p
              className="text-3xl font-mono font-bold leading-none tabular-nums"
              style={{ color: turnoutColor(row.turnout) }}
            >
              {(row.turnout * 100).toFixed(1)}%
            </p>
            <div className="mt-2 h-2 rounded-full overflow-hidden flex">
              <div
                className="h-full"
                style={{
                  width: `${Math.min(100, row.turnout * 100)}%`,
                  backgroundColor: turnoutColor(row.turnout),
                }}
              />
              <div className="h-full flex-1 bg-slate-300/40 dark:bg-white/[0.08]" />
            </div>
            <p className="text-micro text-slate-500 mt-1.5">
              <span className="font-mono tabular-nums text-ink dark:text-slate-300">
                {row.ballots.toLocaleString()}
              </span>{' '}
              voted ·{' '}
              <span className="font-mono tabular-nums">
                {(row.registered - row.ballots).toLocaleString()}
              </span>{' '}
              didn't · {row.registered.toLocaleString()} registered
            </p>
          </div>
        )}

        {turnout && !row && (
          <p className="text-label text-slate-500">No results reported for this precinct in this election.</p>
        )}

        {row && race && (
          <>
            <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
              {toSentenceCase(race.title)}
            </p>
            {raceLoading && !raceRow && (
              <p className="text-micro text-slate-500">Loading votes…</p>
            )}
            <div className="space-y-1.5">
              {candidates.map((c) => {
                const isFocused = focusedCandidate === c.name
                const hex = candidateColors.get(c.name) || '#a8926a'
                return (
                  <button
                    key={c.name}
                    onClick={() => onFocusCandidate(isFocused ? null : c.name)}
                    style={isFocused ? {
                      // Last 48 selected-row idiom: soft tint + rounded 1px ring in the
                      // row's own pigment — no inset side bar (house rule: no edge-border
                      // highlights; the rounded ring is the one sanctioned margin).
                      backgroundColor: `${hex}1a`,
                      boxShadow: `0 0 0 1px ${hex}4d`,
                    } : undefined}
                    className={`block w-full text-left rounded-lg px-1.5 py-1 -mx-1.5 cursor-pointer transition-all ${
                      isFocused ? '' : 'hover:bg-paper-100/50 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className={`text-[13px] truncate flex-1 text-ink dark:text-slate-200 ${isFocused ? 'font-semibold' : 'font-medium'}`}>
                        {toSentenceCase(c.name)}
                      </span>
                      {isFocused && (
                        <span
                          className="text-[8px] font-mono uppercase tracking-[0.15em] flex-shrink-0"
                          style={{ color: hex }}
                        >
                          on map
                        </span>
                      )}
                      <span className="text-[13px] font-mono tabular-nums text-ink dark:text-slate-300">
                        {(c.share * 100).toFixed(1)}%
                      </span>
                      <span className="text-micro font-mono tabular-nums text-slate-500 w-12 text-right">
                        {c.votes.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200/50 dark:bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${c.share * 100}%`, backgroundColor: hex }}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
            {race.isRCV && (
              <p className="text-nano font-mono text-indigo-500 mt-2">First choices — Ranked Choice Voting</p>
            )}
          </>
        )}

        {turnout && turnout.suppressed.registered > 0 && (
          <p className="text-nano text-slate-400/80 dark:text-slate-500 italic mt-4 pt-3 border-t border-slate-200/50 dark:border-white/[0.06]">
            S.F. withholds a few tiny precincts for ballot secrecy —{' '}
            {turnout.suppressed.registered.toLocaleString()} voters in this election are counted
            citywide but not shown per precinct.
          </p>
        )}
      </div>
    </DetailPanelShell>
  )
}
