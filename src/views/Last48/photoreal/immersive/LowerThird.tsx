// src/views/Last48/photoreal/immersive/LowerThird.tsx
//
// The horizontal arm of the L — the band under the map. Jesse's walk
// (2026-09-13) called the first version "a big patch of brown, monolithic":
// the controls moved out to the RightRail, the queue LIST is gone, and the
// room it freed pays for a fourth tile. Four slots left to right —
// prev · ACTIVE · ahead[0] · ahead[1] — at a fixed width each, so the active
// tile never shifts when a neighbour is missing. Textured (`.noise-bg`),
// double-ruled at the top edge (the house newspaper divider) and lit by one
// `.glow-corner is-lg` in the ACTIVE stream's pigment. Height
// clamp(220px, 30vh, 340px); the band SHRINKS the map viewport above it
// (fewer pixels, cheaper). Follows the theme (Plan ruling 2); the tiles above
// it are always dusk. Mono for labels, serif for anything read as prose. The
// parent UNMOUNTS it for the `O` overlay toggle — it never hides itself.
import type { NormalizedEvent } from '@/types/last48'
import { DATASET_META } from '../../detail/eventCardModel'
import { STREAM_WORD } from './streamWords'
import ImmersiveCard from './ImmersiveCard'

interface Props {
  prev: NormalizedEvent | null
  active: NormalizedEvent | null
  /** The next two stops — the same two the map draws as discs. */
  ahead: NormalizedEvent[]
  onJump: (id: string) => void
  onStep: (delta: 1 | -1) => void
  /** Where the active card sits in the pass — the band's own status line
   *  (moved here from the telemetry strip, Jesse 2026-09-20: "its status
   *  connects directly with that set of information"). */
  stopIndex: number
  stopCount: number
  /** `next in 48 s` while playing (Round B §4); null in explore mode. */
  nextIn: string | null
  /** 0..1 across the dwell for the active card's stripe; null = no stripe. */
  progress: number | null
  /** Auto-advance on. Off, the header says EXPLORE and the rule sits full
   *  and faint ("this stop is yours for as long as you want"). */
  playing: boolean
  /** The detour the camera is at (a Place, neighborhood, Hotspot or address),
   *  or null. Shown as "At …" with the way back (Jesse, 2026-09-23: "how do I
   *  release a preselected view?"). */
  detourLabel: string | null
  onBackToStop: () => void
}

/** Every slot is the same width whether or not it holds a card, so the
 *  ACTIVE tile keeps its position at the edges of the pass. */
const SLOT = 'w-[min(300px,24%)] shrink-0'
const PEEK_SLOT = `${SLOT} hidden desk:block`
/** The two step controls flank the slot row — 40 px round targets either side
 *  of the four tiles, where a viewer's hand already is (design critique,
 *  2026-09-13; they used to hide in the eyebrow row as nano word links).
 *  `self-center`, not `self-end`: once the cards hang from the top edge the
 *  row's bottom is wherever the tallest card happens to end, and an arrow
 *  parked there sits beside nothing. Centred, the two flank the stack. */
const STEP_BTN = `h-10 w-10 shrink-0 self-center rounded-full flex items-center justify-center
  font-mono text-[15px] leading-none text-paper-700 dark:text-paper-300 transition-colors
  hover:bg-paper-200/60 hover:text-ink dark:hover:bg-espresso-800/60 dark:hover:text-paper-100`

/** The band's glow takes the active stream's pigment; ochre is the house
 *  neutral for "nothing selected yet". */
const FALLBACK_GLOW = '#d4a435'

export default function LowerThird({ prev, active, ahead, onJump, onStep, stopIndex, stopCount, nextIn, progress, playing, detourLabel, onBackToStop }: Props) {
  const known = stopIndex >= 1 && stopCount >= 1
  const meta = active ? DATASET_META[active.datasetId] : null
  const glow = meta?.color ?? FALLBACK_GLOW

  return (
    <div
      id="immersive-lower-third"
      data-export-ignore
      style={{ ['--glow' as string]: glow }}
      className="relative flex-shrink-0 h-[clamp(220px,30vh,340px)] noise-bg glow-host overflow-hidden
        bg-paper-100/95 dark:bg-espresso-900/90 backdrop-blur-xl
        border-t border-paper-400/60 dark:border-paper-300/25"
    >
      {/* Double rule: the wrapper's own top border plus this one, 3px under it. */}
      <div className="absolute inset-x-0 top-[3px] h-px bg-paper-400/40 dark:bg-paper-300/15" aria-hidden />
      {/* `glow-static`: the band is a SURFACE, not a control — the stock
          hover lift lit the whole thing up when the pointer crossed it
          (Jesse, 2026-09-20). Rule in photoreal.css. */}
      <div className="glow-corner is-lg glow-static" />

      <div className="relative z-[1] flex h-full flex-col">
        {/* Status line: the active stream and where this card sits in the
            pass. Replaces the old "── NOW" eyebrow. */}
        {/* In the display italic (Jesse's walk of Round B, 2026-09-20: "let's try
            this in the big italics"); the countdown stays mono because a
            figure that changes every second has to hold its width. */}
        {/* Sept. 23 2026 (Jesse): the rail's stop ledger moved HERE — the
            stream, Stop N of M, the time to the next stop, EXPLORE when play
            is off, the key hints at the far edge, and the dwell's rule
            running under the whole header. */}
        <div className="flex items-baseline gap-3 px-[clamp(16px,3vw,64px)] pt-3 pb-2 font-display italic text-[min(1.2vw,1.05rem)] leading-none text-paper-700 dark:text-paper-400">
          {meta && active && (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full self-center" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} aria-hidden />
              <span style={{ color: meta.color }}>{STREAM_WORD[active.datasetId] ?? meta.label}</span>
            </span>
          )}
          {meta && <span aria-hidden>·</span>}
          <span>Stop {known ? stopIndex : '—'} of {known ? stopCount : '—'}</span>
          {nextIn && (<><span aria-hidden>·</span><span className="font-mono not-italic text-label tabular-nums">{nextIn}</span></>)}
          {detourLabel && (
            <>
              <span aria-hidden>·</span>
              <span className="text-ink dark:text-paper-100">At {detourLabel}</span>
              {/* The way back — the same as clicking the pressed row again,
                  ← →, a card, or Escape. */}
              <button
                type="button" onClick={onBackToStop} title="Reset view — back to the stop (Escape)"
                className="font-mono not-italic text-label uppercase tracking-wider px-2 py-1 -my-1 rounded-md
                  ring-1 ring-paper-400/40 dark:ring-paper-300/20 text-paper-700 dark:text-paper-300
                  hover:text-ink dark:hover:text-paper-100 hover:ring-paper-500/60"
              >
                Reset view ✕
              </button>
            </>
          )}
          <span className="ml-auto flex items-baseline gap-4 font-mono not-italic text-label">
            {!playing && <span className="uppercase tracking-wider text-paper-600 dark:text-paper-500">explore</span>}
            <span className="text-paper-600 dark:text-paper-500" aria-label="Keys: arrows step, space plays, O hides, H holds, Escape leaves">← → · space · O · H · esc</span>
          </span>
        </div>
        {/* The dwell's rule: fills across the stop while playing; parked, it
            sits full and faint. The same clock as "next in" and the card's
            stripe (Round B §4). */}
        <div className="mx-[clamp(16px,3vw,64px)] h-[2px] rounded-full bg-paper-400/25 dark:bg-paper-300/10 overflow-hidden" aria-hidden>
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-linear"
            style={{ width: `${playing ? Math.max(0, Math.min(1, progress ?? 0)) * 100 : 100}%`, background: glow, opacity: playing ? 0.9 : 0.3 }}
          />
        </div>

        {/* Four slots, flanked by the step controls: ‹ · prev · ACTIVE ·
            ahead[0] · ahead[1] · ›. `items-start` (2026-09-20): the four
            cards are different heights, and hanging them from a shared TOP
            edge is what makes them read as one row — bottom-aligned, the
            age figures (the first thing the eye lands on) sat at four
            different heights. Every card carries `origin-top` so the active
            lift and the peek shrink both leave that edge alone, and `pt-3`
            is the room the lift needs or its top lands in the eyebrow. */}
        <div className="flex items-start gap-4 px-[clamp(16px,3vw,64px)] pt-3 pb-4 min-h-0 overflow-x-auto overflow-y-auto">
          <button type="button" onClick={() => onStep(-1)} aria-label="Previous stop" title="Previous stop (←)" className={STEP_BTN}>‹</button>
          <div className={PEEK_SLOT}>
            {prev && <ImmersiveCard key={prev.id} event={prev} role="peek" onClick={() => onJump(prev.id)} />}
          </div>
          <div className={SLOT}>
            {active
              ? <ImmersiveCard key={active.id} event={active} role="active" glow progress={progress} />
              : <p className="font-display italic text-paper-500">Waiting for the first events…</p>}
          </div>
          {[0, 1].map((i) => {
            const e = ahead[i]
            return (
              <div key={i} className={PEEK_SLOT}>
                {e && <ImmersiveCard key={e.id} event={e} role="peek" onClick={() => onJump(e.id)} />}
              </div>
            )
          })}
          <button type="button" onClick={() => onStep(1)} aria-label="Next stop" title="Next stop (→)" className={STEP_BTN}>›</button>
        </div>
      </div>
    </div>
  )
}
