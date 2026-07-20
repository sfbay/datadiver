/**
 * RCV Victory Composition — "how the win was built"
 *
 * Replaces the all-rounds Sankey (unreadable past ~6 rounds, and it silently
 * capped display at 8 — the Nov 2024 mayor's race has 14). Instead of
 * re-drawing every candidate every round, this view answers the editorial
 * question directly: one stacked bar per FINALIST, decomposed into their
 * own first-choice votes plus every transfer gain, each gain wearing its
 * DONOR's color. Hovering a donor (segment or legend chip) isolates that
 * donor's contribution across all rows — where their votes went when they
 * fell. An Exhausted row shows whose voters' ballots left the count.
 *
 * Data honesty: gains are credited to the candidate who LAST HELD the votes
 * (SF publishes round totals, not ballot paths) — the footnote says so.
 */
import { useMemo, useState } from 'react'
import type { RCVContest } from '@/types/elections'
import { toSentenceCase } from '@/utils/format'
import { computeVictoryComposition } from './rcvFlow'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'

interface RCVCompositionProps {
  rcvData: RCVContest
  candidateColors: Map<string, string>
  width?: number
}

const BATCH_COLOR = 'var(--color-slate-500)'
const EXHAUSTED_COLOR = 'var(--color-paper-500)'

const surname = (name: string) => toSentenceCase(name.split(' ').pop() || name)

export default function RCVComposition({
  rcvData,
  candidateColors,
  width = 600,
}: RCVCompositionProps) {
  // Hover key = the elimination event's arrival round (unique per event,
  // works for batch rounds where donorNames.length > 1).
  const [hoveredRound, setHoveredRound] = useState<number | null>(null)
  const prefersReducedMotion = usePrefersReducedMotion()

  const composition = useMemo(
    () => computeVictoryComposition(rcvData.rounds),
    [rcvData],
  )
  const { finalists, exhausted, events } = composition

  const maxFinal = Math.max(...finalists.map((f) => f.finalVotes), 1)
  const donorColor = (donorNames: string[], isBatch: boolean) =>
    isBatch ? BATCH_COLOR : candidateColors.get(donorNames[0]) || BATCH_COLOR
  const eventIndex = useMemo(
    () => new Map(events.map((e, i) => [e.round, i])),
    [events],
  )

  // Info line for the hovered donor: everywhere their votes landed.
  const hoverInfo = useMemo(() => {
    if (hoveredRound == null) return null
    const event = events.find((e) => e.round === hoveredRound)
    if (!event) return null
    const landings = finalists
      .map((f) => ({ name: f.name, gain: f.gains.find((g) => g.round === hoveredRound) }))
      .filter((l): l is { name: string; gain: NonNullable<typeof l.gain> } => l.gain != null)
      .sort((a, b) => b.gain.amount - a.gain.amount)
    const exhaustedGain = exhausted.gains.find((g) => g.round === hoveredRound)
    return { event, landings, exhaustedGain }
  }, [hoveredRound, events, finalists, exhausted])

  if (finalists.length === 0) {
    return <p className="text-micro text-slate-500 font-mono">No RCV rounds to visualize</p>
  }

  const segmentStyle = (round: number, color: string): React.CSSProperties => ({
    background: color,
    opacity: hoveredRound == null ? 0.92 : hoveredRound === round ? 1 : 0.22,
    transition: 'opacity 0.15s',
    boxShadow: 'inset 1px 0 0 rgba(0,0,0,0.3)',
    animation: prefersReducedMotion
      ? undefined
      : `rcv-fade-in 0.35s ease-out ${(eventIndex.get(round) ?? 0) * 0.07}s both`,
  })

  return (
    <div style={{ width }}>
      <p className="text-nano font-mono tracking-widest text-paper-600 dark:text-paper-500 mb-2.5">
        ── HOW THE WIN WAS BUILT
      </p>

      {/* Finalist rows — bar lengths share one scale (the leader's total). */}
      <div className="flex flex-col gap-2">
        {finalists.map((f) => {
          const isWinner = f.name === rcvData.winner
          const firstPct = Math.round((f.firstChoice / f.finalVotes) * 100)
          return (
            <div key={f.name} className="flex items-center gap-2.5">
              <div className="w-[110px] flex-shrink-0 text-right">
                <p
                  className={`text-micro font-mono truncate ${
                    isWinner
                      ? 'font-bold text-ink dark:text-paper-100'
                      : 'text-paper-700 dark:text-paper-300'
                  }`}
                >
                  {surname(f.name)}
                </p>
                <p className="text-nano font-mono text-paper-500 dark:text-paper-600">
                  {firstPct}% first-pick
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="h-[24px] rounded overflow-hidden flex"
                  style={{ width: `${(f.finalVotes / maxFinal) * 100}%` }}
                >
                  {/* Own first-choice votes — the candidate's own color. */}
                  <div
                    className="h-full flex-shrink-0"
                    title={`${surname(f.name)} — first-choice votes: ${f.firstChoice.toLocaleString()}`}
                    style={{
                      width: `${(f.firstChoice / f.finalVotes) * 100}%`,
                      background: candidateColors.get(f.name) || BATCH_COLOR,
                      opacity: hoveredRound == null ? 0.92 : 0.3,
                      transition: 'opacity 0.15s',
                    }}
                  />
                  {/* Transfer gains, arrival order, donor-colored. */}
                  {f.gains.map((g) => (
                    <div
                      key={g.round}
                      className="h-full flex-shrink-0"
                      onMouseEnter={() => setHoveredRound(g.round)}
                      onMouseLeave={() => setHoveredRound(null)}
                      title={`+${g.amount.toLocaleString()} via ${g.donorNames.map(surname).join(', ')} (R${g.round})`}
                      style={{
                        width: `${(g.amount / f.finalVotes) * 100}%`,
                        ...segmentStyle(g.round, donorColor(g.donorNames, g.isBatch)),
                      }}
                    />
                  ))}
                </div>
              </div>
              <p className="w-[62px] flex-shrink-0 text-right text-micro font-mono tabular-nums text-ink dark:text-paper-200">
                {f.finalVotes.toLocaleString()}
              </p>
            </div>
          )
        })}

        {/* Exhausted ballots — whose voters' ballots left the count. */}
        {exhausted.final > 0 && (
          <div className="flex items-center gap-2.5 mt-0.5">
            <p className="w-[110px] flex-shrink-0 text-right text-nano font-mono text-paper-500 dark:text-paper-600">
              Exhausted
            </p>
            <div className="flex-1 min-w-0">
              <div
                className="h-[10px] rounded-sm overflow-hidden flex"
                style={{ width: `${(exhausted.final / maxFinal) * 100}%` }}
              >
                {exhausted.initial > 0 && (
                  <div
                    className="h-full flex-shrink-0"
                    style={{
                      width: `${(exhausted.initial / exhausted.final) * 100}%`,
                      background: EXHAUSTED_COLOR,
                      opacity: 0.5,
                    }}
                  />
                )}
                {exhausted.gains.map((g) => (
                  <div
                    key={g.round}
                    className="h-full flex-shrink-0"
                    onMouseEnter={() => setHoveredRound(g.round)}
                    onMouseLeave={() => setHoveredRound(null)}
                    title={`${g.amount.toLocaleString()} ballots exhausted via ${g.donorNames.map(surname).join(', ')} (R${g.round})`}
                    style={{
                      width: `${(g.amount / exhausted.final) * 100}%`,
                      ...segmentStyle(g.round, donorColor(g.donorNames, g.isBatch)),
                      opacity: hoveredRound == null ? 0.6 : hoveredRound === g.round ? 0.95 : 0.15,
                    }}
                  />
                ))}
              </div>
            </div>
            <p className="w-[62px] flex-shrink-0 text-right text-nano font-mono tabular-nums text-paper-500 dark:text-paper-600">
              {exhausted.final.toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* Donor legend — every elimination in round order. Hover/focus a chip
          to isolate that donor's landings across all rows. */}
      <div className="flex flex-wrap gap-x-2.5 gap-y-1 mt-3">
        {events.map((e) => {
          const active = hoveredRound === e.round
          return (
            <button
              key={e.round}
              type="button"
              onMouseEnter={() => setHoveredRound(e.round)}
              onMouseLeave={() => setHoveredRound(null)}
              onFocus={() => setHoveredRound(e.round)}
              onBlur={() => setHoveredRound(null)}
              aria-label={`Round ${e.round}: votes from ${e.donorNames.map(surname).join(', ')}`}
              className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-nano font-mono transition-colors ${
                active
                  ? 'bg-paper-200/40 dark:bg-espresso-800/70 text-ink dark:text-paper-200'
                  : 'text-paper-600 dark:text-paper-500'
              }`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: donorColor(e.donorNames, e.isBatch) }}
                aria-hidden
              />
              <span className="text-paper-500 dark:text-paper-600 tabular-nums">R{e.round}</span>
              <span>
                {e.isBatch ? `${e.donorNames.length} together` : surname(e.donorNames[0])}
              </span>
            </button>
          )
        })}
      </div>

      {/* Fixed-height info slot — donor detail on hover, methodology
          footnote otherwise. Reserved so the panel never resizes. */}
      <div className="mt-2 min-h-[30px]">
        {hoverInfo ? (
          <p className="text-nano font-mono text-ink dark:text-paper-300">
            <span className="font-bold">
              R{hoverInfo.event.round}:{' '}
              {hoverInfo.event.isBatch
                ? `${hoverInfo.event.donorNames.length} candidates out`
                : `${surname(hoverInfo.event.donorNames[0])} out`}
            </span>
            {' → '}
            {hoverInfo.landings.map((l, i) => (
              <span key={l.name}>
                {i > 0 && ' · '}
                {surname(l.name)}{' '}
                <span className="font-bold tabular-nums">+{l.gain.amount.toLocaleString()}</span>
              </span>
            ))}
            {hoverInfo.exhaustedGain && (
              <span className="text-paper-500 dark:text-paper-600">
                {' · '}{hoverInfo.exhaustedGain.amount.toLocaleString()} exhausted
              </span>
            )}
          </p>
        ) : (
          <p className="text-nano font-mono text-paper-500 dark:text-paper-600 leading-snug">
            Transfers are credited to the candidate who last held the votes —
            S.F. publishes round totals, not ballot paths.
          </p>
        )}
      </div>
    </div>
  )
}
