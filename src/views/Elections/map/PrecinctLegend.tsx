import type { Race } from '@/types/elections'
import { toSentenceCase } from '@/utils/format'
import { leaderDisplayName } from '@/utils/electionData'
import type { PrecinctMapMode } from './precinctJoin'

/** REPLAY lens state — when set, the legend swaps its whole body for the
 *  round-by-round disclosure variant (eyebrow + continuing top-5 + drain +
 *  withheld-precincts footer) regardless of `mode`. */
export interface PrecinctLegendReplayState {
  round: number
  totalRounds: number
  continuing: { name: string; votes: number; pct: number }[]
  /** Citywide share of round-1 continuing ballots no longer counting
   *  (exhausted + overvotes, net of round-1 overvotes), 0-100. */
  drainPct: number
  withheldCount: number
}

interface PrecinctLegendProps {
  mode: PrecinctMapMode
  race: Race | null
  raceIsProp: boolean
  candidateColors: Map<string, string>
  /** Clean candidate name currently in FOCUS mode, or null. */
  focusedCandidate: string | null
  /** [min,max] share extent for the focused candidate, or null. */
  focusExtent: [number, number] | null
  onFocusCandidate: (name: string | null) => void
  /** REPLAY lens only — when set, renders the replay variant in place of
   *  every other mode branch below. */
  replayState?: PrecinctLegendReplayState
}

function GradientRow({ gradient, left, right }: { gradient: string; left: string; right: string }) {
  return (
    <div>
      <div className="h-2 w-36 rounded-full" style={{ background: gradient }} />
      <div className="flex justify-between mt-1 text-nano font-mono text-slate-400/70 dark:text-slate-500">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  )
}

/** Bottom-right glass card decoding the active fill. Results mode keeps the
 *  candidate swatch list (hue = who) and adds the decisiveness hint (opacity
 *  = how decisively). Ramps reuse the exact stops of the paint functions. */
export default function PrecinctLegend({
  mode, race, raceIsProp, candidateColors, focusedCandidate, focusExtent, onFocusCandidate, replayState,
}: PrecinctLegendProps) {
  if (replayState) {
    const top5 = replayState.continuing.slice(0, 5)
    return (
      <div className="absolute bottom-6 right-5 z-10 glass-card rounded-xl p-3">
        <p className="text-nano font-mono tracking-widest text-paper-600 dark:text-paper-500 mb-1">
          ── ROUND {replayState.round} OF {replayState.totalRounds}
        </p>
        <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
          {race?.title ?? 'Results'}
        </p>
        <div className="space-y-1">
          {top5.map((c) => (
            <div key={c.name} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: candidateColors.get(c.name) || '#a8926a' }}
              />
              <span className="text-micro text-slate-400 truncate max-w-[7.5rem]">
                {leaderDisplayName(c.name)}
              </span>
              <span className="text-micro font-mono text-slate-500 ml-auto">
                {(c.pct * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
        {replayState.drainPct > 2 && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: '#a8926a' }} />
            <span className="text-micro text-slate-400">
              No longer counting — ballots with no remaining choices
            </span>
          </div>
        )}
        {replayState.withheldCount > 0 && (
          <p className="text-nano text-slate-400/70 dark:text-slate-500 mt-2">
            {replayState.withheldCount} small precincts withheld by S.F. — ballots still count citywide
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="absolute bottom-6 right-5 z-10 glass-card rounded-xl p-3">
      <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
        {mode === 'turnout' ? 'Turnout' : mode === 'margin' ? 'Margin of victory' : race?.title ?? 'Results'}
      </p>
      {mode === 'turnout' && (
        <GradientRow gradient="linear-gradient(to right, #b85545, #d4a435, #7a9954)" left="Fewer voted" right="More voted" />
      )}
      {mode === 'margin' && (
        <GradientRow gradient="linear-gradient(to right, #8a92b5, #616a96, #474e74)" left="Close" right="Decisive" />
      )}
      {mode === 'results' && raceIsProp && (
        <GradientRow gradient="linear-gradient(to right, #b85545, #d9c9a7, #7a9954)" left="No" right="Yes" />
      )}
      {mode === 'results' && !raceIsProp && race && focusedCandidate && focusExtent && (
        <>
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: candidateColors.get(focusedCandidate) || '#a8926a' }}
            />
            <span className="text-micro text-ink dark:text-slate-200 truncate max-w-[8.125rem] font-medium">
              {toSentenceCase(focusedCandidate)}
            </span>
            <button
              onClick={() => onFocusCandidate(null)}
              className="ml-auto text-micro font-mono text-slate-400 hover:text-slate-200 cursor-pointer transition-colors"
              aria-label="Clear candidate focus"
            >
              ✕
            </button>
          </div>
          <div className="mt-2">
            <GradientRow
              gradient={`linear-gradient(to right, ${candidateColors.get(focusedCandidate) || '#a8926a'}1f, ${candidateColors.get(focusedCandidate) || '#a8926a'})`}
              left={`weakest ${Math.round(focusExtent[0] * 100)}%`}
              right={`strongest ${Math.round(focusExtent[1] * 100)}%`}
            />
          </div>
          <p className="text-nano text-slate-400/70 dark:text-slate-500 italic mt-2">
            Where their support ran
          </p>
        </>
      )}
      {mode === 'results' && !raceIsProp && race && !focusedCandidate && (
        <>
          <div className="space-y-1">
            {race.candidates.slice(0, 5).map((c) => (
              <button
                key={c.name}
                onClick={() => onFocusCandidate(c.name)}
                className="flex items-center gap-2 w-full text-left rounded px-1 -mx-1 py-0.5 cursor-pointer hover:ring-1 hover:ring-indigo-500/30 hover:bg-white/[0.03] transition-all"
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: candidateColors.get(c.name) || '#a8926a' }}
                />
                <span className="text-micro text-slate-400 truncate max-w-[7.5rem]">
                  {toSentenceCase(c.name.split(',')[0])}
                </span>
                <span className="text-micro font-mono text-slate-500 ml-auto">
                  {(c.percentage * 100).toFixed(1)}%
                </span>
              </button>
            ))}
          </div>
          <p className="text-nano text-slate-400/70 dark:text-slate-500 italic mt-2">
            Click a candidate to map their support
          </p>
        </>
      )}
    </div>
  )
}
