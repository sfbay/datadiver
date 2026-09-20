// src/views/Last48/photoreal/immersive/RightRail.tsx
//
// The vertical arm of the L (Jesse, 2026-09-13): controls down the RIGHT,
// content along the BOTTOM. The first version lifted the old lower third's
// word buttons verbatim; the design critique of the same day called it "a
// dead slab of word buttons", so the four controls are now TILES — a drawn
// glyph over a mono caption, each one a target you can hit without reading —
// and the rail gained the one reading it was missing: where you are in the
// pass (STOP n / N) and how far through the dwell the camera is.
//
// Sized for a 16:9 screen across a room (Jesse, 2026-09-20): 13.5rem wide,
// 5.5rem tiles, 32 px glyphs, 13 px captions. Reading order top→bottom is
// PLAY · HOLD · HIDE, then air, then the stop ledger, then RETURN — the two
// things you do constantly at the top under your hand, the reading in the
// middle, and the one-way door at the far end where you will not hit it.
//
// Mounted/unmounted by the page alongside the band (the `O` overlay toggle);
// this component never hides itself. HOLD_MS lives here because the hold
// button does.
import { PlayGlyph, PauseGlyph, HoldGlyph, OverlayGlyph, HOLD_RING_R, HOLD_RING_LEN } from './glyphs'

interface Props {
  playing: boolean
  /** > 0 while a hold is running (drives the countdown arc). */
  holdLeftMs: number
  /** 1-based position in the pass, and its length. */
  stopIndex: number
  stopCount: number
  /** The active stop's stream, or null before the first event lands. */
  stream: { label: string; color: string } | null
  /** 0..1 across the dwell; -1 when the camera has not arrived yet. */
  dwellProgress: number
  onPlayToggle: () => void
  onHold: () => void
  onOverlayToggle: () => void
  onExit: () => void
}

export const HOLD_MS = 10_000

/** The house neutral for "no stream yet". */
const FALLBACK = '#d4a435'

const TILE = `h-[5.5rem] w-full rounded-lg flex flex-col items-center justify-center gap-1 relative overflow-hidden glow-host
  ring-1 transition-colors bg-paper-50/70 dark:bg-espresso-800/70
  ring-paper-400/40 dark:ring-paper-300/20 hover:ring-paper-500/60
  text-paper-700 dark:text-paper-300`
const TILE_ON = 'bg-ochre-500/18 text-ink dark:text-paper-100'
/** 13 px, not a micro token: this rail is read from across a room, and the
 *  caption is the tile's NAME, not a footnote on it. */
const CAPTION = 'font-mono text-[13px] uppercase tracking-[0.18em]'
/** One size for every glyph in the rail — the family only holds together if
 *  they are all drawn at the same scale. */
const GLYPH = 32

export default function RightRail({
  playing, holdLeftMs, stopIndex, stopCount, stream, dwellProgress,
  onPlayToggle, onHold, onOverlayToggle, onExit,
}: Props) {
  const holding = holdLeftMs > 0
  const ringOff = HOLD_RING_LEN * (1 - holdLeftMs / HOLD_MS)
  // Playing: the rule fills across the dwell. Parked: it sits full and faint,
  // because the reading then is "this stop is yours for as long as you want".
  const pct = playing ? Math.max(0, Math.min(1, dwellProgress)) * 100 : 100
  // Before the first event lands there is no pass to be a stop in. Em dashes
  // say "not yet"; `0 / 0` would read as a real, empty count.
  const known = stopIndex >= 1 && stopCount >= 1

  return (
    <nav
      aria-label="Immersive controls"
      data-export-ignore
      className="relative flex flex-col items-stretch gap-2 w-[13.5rem] px-3 py-4 noise-bg
        bg-paper-100/95 dark:bg-espresso-900/90 backdrop-blur-xl
        border-l border-paper-400/60 dark:border-paper-300/25"
    >
      {/* Rule-leading ledge at body size — the Sept-2 house rule: a micro
          slate label gets swallowed, so the section head is full ink. */}
      <div className="font-mono text-[13px] tracking-[0.2em] uppercase text-paper-700 dark:text-paper-400 mb-1">── IMMERSIVE</div>

      <button
        type="button" onClick={onPlayToggle} aria-pressed={playing}
        className={`${TILE} ${playing ? TILE_ON : ''}`} title="Auto-advance (Space)"
      >
        {playing && <div className="glow-corner is-sm" style={{ ['--glow' as string]: '#d4a435' }} />}
        <span className="relative z-[1] flex flex-col items-center gap-1">
          {playing ? <PauseGlyph size={GLYPH} /> : <PlayGlyph size={GLYPH} />}
          <span className={CAPTION}>{playing ? 'pause' : 'play'}</span>
        </span>
      </button>

      <button
        type="button" onClick={onHold} aria-pressed={holding}
        className={`${TILE} ${holding ? TILE_ON : ''}`} title="Hold 10 s (H)"
      >
        {holding && <div className="glow-corner is-sm" style={{ ['--glow' as string]: '#d4a435' }} />}
        <span className="relative z-[1] flex flex-col items-center gap-1">
          {/* The countdown arc is a SECOND svg over the glyph at the same
              geometry, so the box and both svgs share GLYPH. */}
          <span className="relative" style={{ width: GLYPH, height: GLYPH }}>
            <HoldGlyph size={GLYPH} />
            {holding && (
              <svg width={GLYPH} height={GLYPH} viewBox="0 0 24 24" aria-hidden className="absolute inset-0">
                <circle
                  cx="12" cy="12" r={HOLD_RING_R} fill="none" stroke="currentColor" strokeWidth={1.75}
                  strokeLinecap="round" strokeDasharray={HOLD_RING_LEN} strokeDashoffset={ringOff}
                  transform="rotate(-90 12 12)"
                />
              </svg>
            )}
          </span>
          <span className={CAPTION}>{holding ? `hold · ${Math.ceil(holdLeftMs / 1000)}s` : 'hold'}</span>
        </span>
      </button>

      <button type="button" onClick={onOverlayToggle} className={TILE} title="Hide the lower third (O)">
        <span className="relative z-[1] flex flex-col items-center gap-1">
          <OverlayGlyph size={GLYPH} />
          <span className={CAPTION}>hide</span>
        </span>
      </button>

      {/* Reserved for Round B's camera/stream presets. Empty on purpose: it
          is the air that separates the controls above from the reading
          below, and it keeps the ledger off the bottom of a tall screen. */}
      <div className="flex-1" aria-hidden />

      {/* ── Stop ledger: where you are, and how far the camera has to run. */}
      <div className="pt-3 border-t border-paper-400/40 dark:border-paper-300/15">
        <p className="font-mono text-label tabular-nums uppercase tracking-wider text-paper-700 dark:text-paper-300">
          STOP {known ? stopIndex : '—'} / {known ? stopCount : '—'}
        </p>
        <div className="mt-2 h-1 rounded-full bg-paper-400/30 dark:bg-paper-300/15 overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-linear"
            style={{ width: `${pct}%`, background: stream?.color ?? FALLBACK, opacity: playing ? 1 : 0.3 }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          {stream ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="w-2 h-2 shrink-0 rounded-full" style={{ background: stream.color }} aria-hidden />
              <span className="font-mono text-nano uppercase tracking-[0.18em] truncate" style={{ color: stream.color }}>{stream.label}</span>
            </span>
          ) : <span />}
          {/* Ledger register, not tile register — CAPTION is 13 px and would
              shout down the stream label it sits beside. */}
          {!playing && <span className="font-mono text-label uppercase tracking-wider shrink-0 text-paper-600 dark:text-paper-500">explore</span>}
        </div>
        <p className="mt-2 font-mono text-label leading-relaxed text-paper-600 dark:text-paper-500">← → · space · O · H · esc</p>
      </div>

      {/* ── RETURN: the way back, quoting the app shell's brand row ────────
          An abstract "leave" arrow said the door existed but not where it
          went (Jesse, 2026-09-20). The badge and the wordmark are the same
          two marks the shell wears at the top of every other page, so the
          destination is named rather than described — and putting the site's
          own signature at the far end of the rail, below a double rule, is
          what makes it read as an exit instead of a fifth control. */}
      <div className="relative mt-3 pt-3 border-t border-paper-400/60 dark:border-paper-300/25">
        <div className="absolute inset-x-0 top-[3px] h-px bg-paper-400/40 dark:bg-paper-300/15" aria-hidden />
        <button
          type="button" onClick={onExit} title="Back to The Last 48 (Escape)"
          className="w-full py-3 px-2 rounded-lg flex items-center gap-3 text-left transition-colors
            hover:bg-paper-200/60 dark:hover:bg-espresso-800/60"
        >
          <img src="/dana-badge-2.png" alt="" className="w-9 h-9 shrink-0 rounded-full object-cover ring-1 ring-paper-100/15" />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="font-display italic text-lg text-ink dark:text-paper-100 leading-none">DataDiver</span>
            <span className="font-mono text-label uppercase tracking-[0.2em] text-paper-600 dark:text-paper-500">RETURN ↩</span>
          </span>
        </button>
      </div>
    </nav>
  )
}
