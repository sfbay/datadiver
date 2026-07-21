/**
 * WhatIfPanel — the RCV panel's WHAT-IF lens arm.
 *
 * A strike roster (one pill per candidate — pigment dot + surname +
 * strike/restore toggle) above the counterfactual rounds chart on its own
 * transport. Striking the winner is the marquee gesture. Pure
 * presentational: tabulation happens upstream (tabulateWhatIf memo);
 * this component only toggles ?strike= via onSetStrikes.
 *
 * Color contract (pinned): candidateColors is the CERTIFIED race's
 * rank-assigned map — counterfactual surfaces never re-derive colors
 * (a re-derive would hand the departed winner's pigment to the new
 * winner mid-comparison). Keys are RAW names — look up before cleaning.
 */
import type { RCVContest, CVRBallotArtifact } from '@/types/elections'
import type { RcvTransport } from '@/hooks/useRcvTransport'
import { cleanCandidateName, leaderDisplayName } from '@/utils/electionData'
import RCVRoundChart from '@/components/charts/RCVRoundChart'

interface WhatIfPanelProps {
  artifact: CVRBallotArtifact
  candidateColors: Map<string, string>
  /** Sanitized artifact indices currently struck (Elections' struckIdx). */
  struckIdx: number[]
  /** Rewrites the full ?strike= set (raw artifact names). */
  onSetStrikes: (names: string[]) => void
  /** Counterfactual contest (certified when nothing is struck). */
  chartData: RCVContest | null
  transport: RcvTransport
}

export default function WhatIfPanel({
  artifact, candidateColors, struckIdx, onSetStrikes, chartData, transport,
}: WhatIfPanelProps) {
  const struckSet = new Set(struckIdx)
  const remaining = artifact.candidates.length - struckSet.size

  const toggle = (i: number) => {
    const next = struckSet.has(i)
      ? struckIdx.filter((s) => s !== i)
      : [...struckIdx, i]
    onSetStrikes(next.map((s) => artifact.candidates[s]))
  }

  return (
    <div>
      <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 mb-1.5">
        Remove a candidate — same ballots, rerun
      </p>
      <div className="flex flex-wrap gap-1 mb-3 max-w-[400px]">
        {artifact.candidates.map((name, i) => {
          const struck = struckSet.has(i)
          const atFloor = !struck && remaining <= 2
          return (
            <button
              key={name}
              onClick={() => { if (!atFloor) toggle(i) }}
              disabled={atFloor}
              title={atFloor ? 'Leave at least two candidates in the race' : undefined}
              aria-pressed={struck}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-micro font-mono transition-all ${
                struck
                  ? 'bg-slate-200/40 dark:bg-white/[0.04]'
                  : 'bg-slate-100/80 dark:bg-white/[0.06] hover:bg-slate-200/80 dark:hover:bg-white/[0.1]'
              } ${atFloor ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: candidateColors.get(name) || '#a8926a', opacity: struck ? 0.4 : 1 }}
              />
              <span className={struck ? 'line-through opacity-40 text-ink dark:text-paper-200' : 'text-ink dark:text-paper-200'}>
                {leaderDisplayName(cleanCandidateName(name))}
              </span>
              {struck && (
                <span className="text-nano font-mono text-brick-400">removed</span>
              )}
            </button>
          )
        })}
      </div>
      {chartData ? (
        <RCVRoundChart
          key={`${artifact.raceId}-${struckIdx.join('.')}`}
          rcvData={chartData}
          candidateColors={candidateColors}
          width={400}
          transport={transport}
        />
      ) : (
        <p className="text-micro text-slate-400 px-2 py-3">Loading ballots&hellip;</p>
      )}
    </div>
  )
}
