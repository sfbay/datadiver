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
}

/** Every slot is the same width whether or not it holds a card, so the
 *  ACTIVE tile keeps its position at the edges of the pass. */
const SLOT = 'w-[min(300px,24%)] shrink-0'
const PEEK_SLOT = `${SLOT} hidden desk:block`
/** The two step controls flank the slot row — 40 px round targets either side
 *  of the four tiles, where a viewer's hand already is (design critique,
 *  2026-09-13; they used to hide in the eyebrow row as nano word links). */
const STEP_BTN = `h-10 w-10 shrink-0 self-end rounded-full flex items-center justify-center
  font-mono text-[15px] leading-none text-paper-700 dark:text-paper-300 transition-colors
  hover:bg-paper-200/60 hover:text-ink dark:hover:bg-espresso-800/60 dark:hover:text-paper-100`

/** The band's glow takes the active stream's pigment; ochre is the house
 *  neutral for "nothing selected yet". */
const FALLBACK_GLOW = '#d4a435'

export default function LowerThird({ prev, active, ahead, onJump, onStep }: Props) {
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
      <div className="glow-corner is-lg" />

      <div className="relative z-[1] flex h-full flex-col">
        {/* Rule-leading eyebrow */}
        <div className="flex items-center gap-4 px-[clamp(16px,3vw,64px)] pt-4 pb-2">
          <span className="font-mono text-nano tracking-[0.25em] uppercase text-paper-700 dark:text-paper-400">
            ── NOW{meta ? ` · ${meta.label}` : ''}
          </span>
        </div>

        {/* Four slots, flanked by the step controls: ‹ · prev · ACTIVE ·
            ahead[0] · ahead[1] · ›. `items-end` so the lifted active card
            grows UPWARD instead of pushing the row — and `pt-3` is the room
            that rise needs, or the active card's top edge lands in the
            eyebrow above it. */}
        <div className="flex items-end gap-4 px-[clamp(16px,3vw,64px)] pt-3 pb-4 min-h-0">
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
