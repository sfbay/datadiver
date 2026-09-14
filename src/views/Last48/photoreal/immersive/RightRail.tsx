// src/views/Last48/photoreal/immersive/RightRail.tsx
//
// The vertical arm of the L (Jesse, 2026-09-13): controls down the RIGHT,
// content along the BOTTOM. Lifted verbatim out of the old lower third's
// first column — same four buttons, same titles, same behaviour — so the
// band can spend its whole width on tiles. Mounted/unmounted by the page
// alongside the band (the `O` overlay toggle); this component never hides
// itself. HOLD_MS lives here now because the hold button does.
interface Props {
  playing: boolean
  /** > 0 while a hold is running (drives the countdown ring). */
  holdLeftMs: number
  onPlayToggle: () => void
  onHold: () => void
  onOverlayToggle: () => void
  onExit: () => void
}

export const HOLD_MS = 10_000

const BTN = 'flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left font-mono text-label uppercase tracking-wider transition-colors text-paper-600 hover:text-ink hover:bg-paper-200/60 dark:text-paper-400 dark:hover:text-paper-100 dark:hover:bg-espresso-800/60'
const BTN_ON = 'bg-ochre-500/15 text-ink dark:text-paper-100'

export default function RightRail({ playing, holdLeftMs, onPlayToggle, onHold, onOverlayToggle, onExit }: Props) {
  const holding = holdLeftMs > 0
  // Countdown ring: r=9 → circumference ≈ 56.5.
  const ringLen = 2 * Math.PI * 9
  const ringOff = ringLen * (1 - holdLeftMs / HOLD_MS)
  return (
    <div
      data-export-ignore
      className="relative flex flex-col items-stretch gap-2 w-[9rem] px-3 py-4 noise-bg
        bg-paper-100/95 dark:bg-espresso-900/90 backdrop-blur-xl
        border-l border-paper-400/60 dark:border-paper-300/25"
    >
      <div className="font-mono text-nano tracking-widest uppercase text-paper-500 dark:text-paper-600 mb-1">IMMERSIVE</div>
      <button type="button" onClick={onPlayToggle} aria-pressed={playing} className={`${BTN} ${playing ? BTN_ON : ''}`} title="Auto-advance (Space)">
        <span aria-hidden>{playing ? '❚❚' : '▶'}</span><span>{playing ? 'playing' : 'play'}</span>
      </button>
      <button type="button" onClick={onHold} aria-pressed={holding} className={`${BTN} ${holding ? BTN_ON : ''}`} title="Hold 10 s (H)">
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden className="-ml-0.5 shrink-0">
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
      <p className="mt-auto pt-4 font-mono text-nano leading-relaxed text-paper-500">← → · space · O · H · esc</p>
    </div>
  )
}
