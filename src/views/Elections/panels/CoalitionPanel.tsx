/**
 * CoalitionPanel — the RCV panel's COALITION lens arm.
 *
 * Three zones: a roster picker (always rendered — click a candidate to
 * focus), citywide next-choice bars for the focused candidate's cohort, and
 * a head-to-head card against a chosen rival. Pure presentational: all the
 * expensive math (decoding the CVR artifact, computing second choices,
 * computing the head-to-head matrix) happens upstream in hooks — this
 * component only shapes the already-computed props into the house register.
 *
 * Selection idiom matches the Last 48 / PrecinctDetailPanel convention:
 * own-pigment tint + inset 1px ring, never a border-l side bar, never
 * indigo (indigo stays reserved for RCV chrome/navigation, not selection).
 *
 * Name-display contract (adjudicated bug, be exact): candidateColors is
 * keyed by RAW names (artifact/rcvData names) — look those up BEFORE
 * cleaning. Reader-facing text always goes through
 * leaderDisplayName(cleanCandidateName(name)).
 */
import { useEffect, useMemo, useState } from 'react'
import type { SecondChoiceResult, HeadToHeadMatrix } from '@/lib/rcv/coalition'
import type { RCVContest, CVRBallotArtifact } from '@/types/elections'
import { cleanCandidateName, leaderDisplayName } from '@/utils/electionData'

interface CoalitionPanelProps {
  rcvData: RCVContest
  artifact: CVRBallotArtifact
  candidateColors: Map<string, string>
  /** Raw ?candidate= value (null = prompt state). */
  focusedCandidate: string | null
  onFocusCandidate: (name: string | null) => void
  secondChoices: SecondChoiceResult | null
  headToHead: HeadToHeadMatrix | null
  /** Surname for copy ("Peskin"), null when no focus. */
  focusDisplay: string | null
}

/** Paper-500 — reserved for "no usable next choice" (matches RCVComposition's
 *  Exhausted-row convention: administrative buckets carry both their label
 *  AND fill in the bucket's tone; only named-candidate rows keep neutral
 *  label text with the pigment confined to the fill/dot). */
const NO_NEXT_COLOR = '#a8926a'

interface NextChoiceBar {
  name: string
  votes: number
}

function BarRow({
  label,
  votes,
  total,
  fillColor,
  labelClassName = 'text-ink dark:text-paper-200',
}: {
  label: string
  votes: number
  total: number
  fillColor: string
  labelClassName?: string
}) {
  const pct = total > 0 ? Math.round((votes / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span
        className={`w-[100px] flex-shrink-0 text-right text-micro font-mono truncate ${labelClassName}`}
      >
        {label}
      </span>
      <div className="flex-1 min-w-0 h-[13px] rounded-sm bg-slate-200/40 dark:bg-white/[0.06] overflow-hidden">
        <div
          className="h-full"
          style={{ width: `${pct}%`, backgroundColor: fillColor, opacity: 0.92 }}
        />
      </div>
      <span className="w-[92px] flex-shrink-0 text-right text-nano font-mono tabular-nums text-paper-500 dark:text-paper-600">
        {votes.toLocaleString()} &middot; {pct}%
      </span>
    </div>
  )
}

export default function CoalitionPanel({
  rcvData,
  artifact,
  candidateColors,
  focusedCandidate,
  onFocusCandidate,
  secondChoices,
  headToHead,
  focusDisplay,
}: CoalitionPanelProps) {
  const r1votes = useMemo(
    () => new Map(rcvData.rounds[0].candidates.map((c) => [c.name, c.votes])),
    [rcvData],
  )

  const focusIdx = useMemo(
    () =>
      focusedCandidate == null
        ? -1
        : artifact.candidates.findIndex(
            (c) => cleanCandidateName(c) === cleanCandidateName(focusedCandidate),
          ),
    [artifact, focusedCandidate],
  )

  // Zone 2 — citywide next-choice bars, bucketed at a 2% floor (minor
  // candidates roll up into "Other candidates" so the roster's tail
  // doesn't turn into a dozen sliver rows).
  const bars = useMemo(() => {
    if (!secondChoices) return null
    const total = secondChoices.total
    if (total === 0) return null
    const named: NextChoiceBar[] = Array.from(secondChoices.next, (votes, i) => ({
      name: artifact.candidates[i],
      votes,
    }))
      .filter((b) => b.votes > 0)
      .sort((a, b) => b.votes - a.votes)
    const major = named.filter((b) => b.votes / total >= 0.02)
    const otherVotes = named
      .filter((b) => b.votes / total < 0.02)
      .reduce((s, b) => s + b.votes, 0)
    return { total, major, otherVotes }
  }, [secondChoices, artifact])

  // Zone 3 — rival picker. Default = highest-certified-R1-votes rival;
  // resets whenever the focus changes (a rival chosen against the old
  // focus is meaningless against the new one).
  const defaultRivalIdx = useMemo(() => {
    if (focusIdx < 0) return -1
    let bestIdx = -1
    let bestVotes = -1
    for (const cand of rcvData.rounds[0].candidates) {
      const idx = artifact.candidates.findIndex(
        (c) => cleanCandidateName(c) === cleanCandidateName(cand.name),
      )
      if (idx < 0 || idx === focusIdx) continue
      if (cand.votes > bestVotes) {
        bestVotes = cand.votes
        bestIdx = idx
      }
    }
    return bestIdx
  }, [focusIdx, rcvData, artifact])

  const [rivalOverride, setRivalOverride] = useState<number | null>(null)
  useEffect(() => setRivalOverride(null), [focusedCandidate])
  // A stale override equal to the focus must fall back render-synchronously —
  // the effect reset above lands a frame late (focus A → pick rival B →
  // click B in the roster: same render, rivalOverride === focusIdx).
  const rivalIdx = rivalOverride != null && rivalOverride !== focusIdx ? rivalOverride : defaultRivalIdx

  return (
    <div>
      {/* Zone 1 — roster picker, always rendered. One row per candidate in
          artifact order (R1 standing); mayor has 13 rows, hence the cap. */}
      {focusedCandidate === null && (
        <p className="text-micro text-paper-500 dark:text-paper-600 mb-2">
          Pick a candidate to see where their voters went next.
        </p>
      )}
      <div className="max-h-40 overflow-y-auto flex flex-col gap-0.5">
        {artifact.candidates.map((name) => {
          const isSelected =
            focusedCandidate !== null &&
            cleanCandidateName(focusedCandidate) === cleanCandidateName(name)
          const hex = candidateColors.get(name) ?? '#a8926a'
          return (
            <button
              key={name}
              type="button"
              onClick={() => onFocusCandidate(isSelected ? null : name)}
              className="w-full flex items-center gap-2 px-2 py-1 rounded-lg text-left transition-colors"
              style={
                isSelected
                  ? { backgroundColor: `${hex}1a`, boxShadow: `inset 0 0 0 1px ${hex}4d` }
                  : undefined
              }
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: hex }}
                aria-hidden
              />
              <span className="text-micro flex-1 truncate">
                {leaderDisplayName(cleanCandidateName(name))}
              </span>
              <span className="text-nano font-mono text-slate-400 tabular-nums">
                {(r1votes.get(name) ?? 0).toLocaleString()}
              </span>
            </button>
          )
        })}
      </div>

      {/* Zone 2 — citywide next-choice bars for the focused cohort. `bars`
          is null when the cohort is empty (total === 0), which can't
          usefully render percentages — nothing to show. */}
      {secondChoices && focusDisplay && bars && (
        <div className="mt-4">
          <p className="text-micro font-mono tracking-wide text-paper-600 dark:text-paper-500 mb-2">
            &mdash;&mdash; Where {focusDisplay} voters went next
          </p>
          <div className="flex flex-col gap-1.5">
            {bars.major.map((b) => (
              <BarRow
                key={b.name}
                label={leaderDisplayName(cleanCandidateName(b.name))}
                votes={b.votes}
                total={bars.total}
                fillColor={candidateColors.get(b.name) ?? '#a8926a'}
              />
            ))}
            {bars.otherVotes > 0 && (
              <BarRow
                label="Other candidates"
                votes={bars.otherVotes}
                total={bars.total}
                fillColor="var(--color-slate-400)"
                labelClassName="text-slate-400"
              />
            )}
            <BarRow
              label="No next choice"
              votes={secondChoices.none}
              total={bars.total}
              fillColor={NO_NEXT_COLOR}
              labelClassName="text-paper-500 dark:text-paper-600"
            />
          </div>
          {secondChoices.overvote > 0 && (
            <p className="text-nano font-mono text-paper-500 dark:text-paper-600 mt-1.5">
              {secondChoices.overvote.toLocaleString()} ballots ranked two candidates at once
            </p>
          )}
        </div>
      )}

      {/* Zone 3 — head-to-head card. focusIdx/rivalIdx index into
          artifact.candidates (n = artifact.candidates.length), matching
          how Task 6 derives focusIdx for the URL contract. */}
      {headToHead &&
        focusDisplay &&
        focusIdx >= 0 &&
        rivalIdx >= 0 &&
        (() => {
          const n = artifact.candidates.length
          const f = focusIdx
          const r = rivalIdx
          const fb = headToHead.prefersBoth[f * n + r]
          const rb = headToHead.prefersBoth[r * n + f]
          const fi = headToHead.prefers[f * n + r]
          const ri = headToHead.prefers[r * n + f]
          const fName = leaderDisplayName(cleanCandidateName(artifact.candidates[f]))
          const rName = leaderDisplayName(cleanCandidateName(artifact.candidates[r]))

          const among =
            fb >= rb
              ? { winner: fName, loser: rName, w: fb, l: rb }
              : { winner: rName, loser: fName, w: rb, l: fb }
          const incl = fi >= ri ? { winner: fName, w: fi, l: ri } : { winner: rName, w: ri, l: fi }

          // "Loses to every other candidate" — inclusive prefers, every rival.
          const losesToEveryone =
            n > 1 &&
            Array.from({ length: n }, (_, c) => c)
              .filter((c) => c !== f)
              .every((c) => headToHead.prefers[f * n + c] < headToHead.prefers[c * n + f])

          return (
            <div className="mt-4 pt-3 border-t border-slate-200/50 dark:border-white/[0.06]">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-micro font-mono tracking-wide text-paper-600 dark:text-paper-500 flex-1">
                  &mdash;&mdash; Head-to-head vs.
                </p>
                <select
                  aria-label="Rival candidate"
                  value={r}
                  onChange={(e) => setRivalOverride(Number(e.target.value))}
                  className="text-micro bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded px-1.5 py-0.5 text-ink dark:text-white"
                >
                  {artifact.candidates.map((name, idx) =>
                    idx === f ? null : (
                      <option key={name} value={idx}>
                        {leaderDisplayName(cleanCandidateName(name))}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <p className="text-micro text-ink dark:text-paper-200 leading-snug">
                Among ballots ranking both, {among.winner} beats {among.loser}{' '}
                <span className="font-mono tabular-nums">{among.w.toLocaleString()}</span> to{' '}
                <span className="font-mono tabular-nums">{among.l.toLocaleString()}</span>.
              </p>

              {/* Divergence disclosure — renders ONLY when the among-both
                  winner differs from the inclusive winner (probe-verified
                  D11 Chen/Lai edge). Prevents the card from contradicting
                  the verdict line below. */}
              {among.winner !== incl.winner && (
                <p className="text-nano font-mono text-ochre-600 dark:text-ochre-400 mt-1">
                  Counting every ballot that ranked either, {incl.winner} leads{' '}
                  {incl.w.toLocaleString()} to {incl.l.toLocaleString()}.
                </p>
              )}

              {headToHead.condorcetWinner === f ? (
                <p className="text-micro font-semibold text-moss-600 dark:text-moss-400 mt-2">
                  {fName} beats every other candidate head-to-head.
                </p>
              ) : losesToEveryone ? (
                <p className="text-micro font-semibold text-brick-600 dark:text-brick-400 mt-2">
                  {fName} loses to every other candidate head-to-head.
                </p>
              ) : null}
            </div>
          )
        })()}
    </div>
  )
}
