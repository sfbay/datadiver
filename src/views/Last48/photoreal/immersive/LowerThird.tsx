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
}

/** Reader-facing stream names for the status line (the map chips shout in
 *  caps; this is a sentence). */
const STREAM_LABEL: Record<string, string> = {
  '911-realtime': '911 dispatch',
  'fire-ems-dispatch': 'Fire/EMS',
  '311-cases': '311 case',
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

export default function LowerThird({ prev, active, ahead, onJump, onStep, stopIndex, stopCount }: Props) {
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
        <div className="flex items-center gap-3 px-[clamp(16px,3vw,64px)] pt-4 pb-2 font-mono text-label tabular-nums text-paper-700 dark:text-paper-400">
          {meta && active && (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }} aria-hidden />
              <span style={{ color: meta.color }}>{STREAM_LABEL[active.datasetId] ?? meta.label}</span>
            </span>
          )}
          {meta && <span aria-hidden>·</span>}
          <span>Stop {known ? stopIndex : '—'} of {known ? stopCount : '—'}</span>
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
              ? <ImmersiveCard key={active.id} event={active} role="active" glow />
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
