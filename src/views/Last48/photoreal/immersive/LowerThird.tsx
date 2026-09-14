// src/views/Last48/photoreal/immersive/LowerThird.tsx
//
// The fixed band under the map — Spec A2 §2: controls (~15%) · carousel
// (~60%) · queue (~25%). Height clamp(220px, 30vh, 340px); the band SHRINKS
// the map viewport above it (fewer pixels, cheaper). Follows the theme (Plan
// ruling 2); the tiles above it are always dusk. Mono for labels, serif for
// anything read as prose. The parent UNMOUNTS it for the `O` overlay
// toggle — this component never hides itself.
import type { NormalizedEvent } from '@/types/last48'
import { DATASET_META, formatAge, locationLine } from '../../detail/eventCardModel'
import { formatHeadline } from '@/utils/format'
import ImmersiveCard from './ImmersiveCard'

export const HOLD_MS = 10_000

interface Props {
  active: NormalizedEvent | null
  prev: NormalizedEvent | null
  next: NormalizedEvent | null
  queue: NormalizedEvent[]
  playing: boolean
  /** > 0 while a hold is running (drives the countdown ring). */
  holdLeftMs: number
  onStep: (delta: 1 | -1) => void
  onJump: (id: string) => void
  onPlayToggle: () => void
  onHold: () => void
  onOverlayToggle: () => void
  onExit: () => void
}

const BTN = 'flex items-center gap-2 rounded-md px-2.5 py-1.5 font-mono text-label uppercase tracking-wider transition-colors text-paper-600 hover:text-ink hover:bg-paper-200/60 dark:text-paper-400 dark:hover:text-paper-100 dark:hover:bg-espresso-800/60'
const BTN_ON = 'bg-ochre-500/15 text-ink dark:text-paper-100'

export default function LowerThird({ active, prev, next, queue, playing, holdLeftMs, onStep, onJump, onPlayToggle, onHold, onOverlayToggle, onExit }: Props) {
  const holding = holdLeftMs > 0
  // Countdown ring: r=9 → circumference ≈ 56.5.
  const ringLen = 2 * Math.PI * 9
  const ringOff = ringLen * (1 - holdLeftMs / HOLD_MS)
  return (
    <div
      id="immersive-lower-third"
      data-export-ignore
      className="relative z-20 flex-shrink-0 grid grid-cols-[minmax(9rem,15%)_1fr_minmax(14rem,25%)] gap-6 px-[clamp(16px,3vw,64px)] py-4 h-[clamp(220px,30vh,340px)]
        bg-paper-50/90 dark:bg-espresso-950/85 backdrop-blur-xl border-t border-paper-200/40 dark:border-espresso-800"
    >
      {/* Controls */}
      <div className="flex flex-col gap-1.5 justify-center">
        <div className="font-mono text-nano tracking-widest text-paper-500 dark:text-paper-600 mb-1">IMMERSIVE</div>
        <button type="button" onClick={onPlayToggle} aria-pressed={playing} className={`${BTN} ${playing ? BTN_ON : ''}`} title="Auto-advance (Space)">
          <span aria-hidden>{playing ? '❚❚' : '▶'}</span><span>{playing ? 'playing' : 'play'}</span>
        </button>
        <button type="button" onClick={onHold} aria-pressed={holding} className={`${BTN} ${holding ? BTN_ON : ''}`} title="Hold 10 s (H)">
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden className="-ml-0.5">
            <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
            {holding && <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={ringLen} strokeDashoffset={ringOff} transform="rotate(-90 11 11)" />}
          </svg>
          <span>{holding ? `hold · ${Math.ceil(holdLeftMs / 1000)}s` : 'hold'}</span>
        </button>
        <button type="button" onClick={onOverlayToggle} className={BTN} title="Hide the lower third (O)">
          <span aria-hidden>▭</span><span>overlay off</span>
        </button>
        <button type="button" onClick={onExit} className={BTN} title="Back to The Last 48 (Escape)">
          <span aria-hidden>✕</span><span>leave</span>
        </button>
      </div>

      {/* Carousel */}
      <div className="relative flex items-center justify-center gap-4 min-w-0 overflow-hidden">
        <button type="button" onClick={() => onStep(-1)} aria-label="Previous stop" className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-paper-100/70 dark:bg-espresso-900/70 text-paper-700 dark:text-paper-300 hover:text-ink dark:hover:text-paper-100 font-display text-xl">‹</button>
        <div className="hidden desk:block shrink-0">{prev && <ImmersiveCard key={prev.id} event={prev} role="peek" onClick={() => onJump(prev.id)} />}</div>
        <div className="shrink-0">
          {active
            ? <ImmersiveCard key={active.id} event={active} role="active" />
            : <p className="font-display italic text-paper-500">Waiting for the first events…</p>}
        </div>
        <div className="hidden desk:block shrink-0">{next && <ImmersiveCard key={next.id} event={next} role="peek" onClick={() => onJump(next.id)} />}</div>
        <button type="button" onClick={() => onStep(1)} aria-label="Next stop" className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-paper-100/70 dark:bg-espresso-900/70 text-paper-700 dark:text-paper-300 hover:text-ink dark:hover:text-paper-100 font-display text-xl">›</button>
      </div>

      {/* Queue */}
      <div className="flex flex-col min-w-0">
        <div className="font-mono text-nano tracking-widest text-paper-500 dark:text-paper-600 mb-1.5">NEXT</div>
        <ol className="flex flex-col gap-0.5 overflow-hidden">
          {queue.map((e, i) => {
            const meta = DATASET_META[e.datasetId]
            const age = formatAge(e.receivedAt)
            const loc = locationLine(e)
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onJump(e.id)}
                  className={`flex w-full items-baseline gap-2 rounded px-1.5 py-1 text-left hover:bg-paper-200/60 dark:hover:bg-espresso-800/60 ${i < 2 ? '' : 'opacity-70'}`}
                  title={i < 2 ? 'On the map now' : undefined}
                >
                  <span className="font-mono text-nano tabular-nums text-paper-500 w-9 shrink-0">{age.magnitude}{age.unit.slice(0, 1)}</span>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 self-center" style={{ background: meta.color }} aria-hidden />
                  <span className="truncate text-[12px] text-ink dark:text-paper-200">{e.headline ? formatHeadline(e.headline) : 'Event'}</span>
                  {loc && <span className="ml-auto truncate font-mono text-nano text-paper-500 max-w-[40%]">{loc.place}</span>}
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
