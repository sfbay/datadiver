// src/views/Last48/photoreal/immersive/RightRail.tsx
//
// The vertical arm of the L (Jesse, 2026-09-13): controls down the RIGHT,
// content along the BOTTOM. The first version lifted the old lower third's
// word buttons verbatim; the design critique of the same day called it "a
// dead slab of word buttons", so the controls became TILES — a drawn glyph
// over a mono caption.
//
// Round C (Jesse, 2026-09-20) turns the tiles on their side. The rail is "a
// key entry point… a key visual anchor for this entire immersive", so it now
// opens with the MASTHEAD — the full branding, The Last 48 Immersive, in the
// house display face — and the controls SIDE-SADDLE: glyph left, name right,
// key hint at the far edge, half the height they were. The names are set in
// big Fraunces italic rather than mono caps ("drop the mono in the buttons…
// big serif ital, it's a signature look"); mono is left to do what mono is
// for here — the key hints, the eyebrows and the measured values.
//
// Reading order top→bottom: masthead · PLAY · HOLD · HIDE · VIEW · air ·
// the stop ledger · RETURN. The two things you do constantly sit at the top
// under your hand, the settings under them, the reading in the middle, and
// the one-way door at the far end where you will not hit it.
//
// Mounted/unmounted by the page alongside the band (the `O` overlay toggle);
// this component never hides itself. HOLD_MS lives here because the hold
// button does. Telemetry lives in the strip across the top of the map: this
// rail holds what you DO, that band holds what the camera IS doing.
import type { ReactNode } from 'react'
import { PlayGlyph, PauseGlyph, HoldGlyph, OverlayGlyph, HOLD_RING_R, HOLD_RING_LEN } from './glyphs'
import type { Grade } from '../grade'

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
  /** The grade the tiles are wearing — `?tod=`, dusk by default. */
  tod: Grade
  beaconOn: boolean
  ticksOn: boolean
  onPlayToggle: () => void
  onHold: () => void
  onOverlayToggle: () => void
  onTod: (v: Grade) => void
  onBeaconToggle: (v: boolean) => void
  onTicksToggle: (v: boolean) => void
  onExit: () => void
}

export const HOLD_MS = 10_000

/** The house neutral for "no stream yet". */
const FALLBACK = '#d4a435'

/** A control ROW: the glyph side-saddles its name. 3.5rem is half the old
 *  tile and still a target you can hit without looking. */
const ROW = `h-[3.5rem] w-full rounded-lg flex items-center gap-3 px-4 relative overflow-hidden glow-host
  ring-1 transition-colors bg-paper-50/70 dark:bg-espresso-800/70
  ring-paper-400/40 dark:ring-paper-300/20 hover:ring-paper-500/60
  text-paper-700 dark:text-paper-300`
const ROW_ON = 'bg-ochre-500/18 text-ink dark:text-paper-100'
/** The signature: the control's NAME in the display face, big enough to read
 *  from across a room. */
const NAME = 'relative z-[1] font-display italic text-[1.7vw] leading-none text-ink dark:text-paper-100'
/** The key that does the same thing, parked at the far edge. paper-600 in
 *  light mode rather than the 500 the dark side wears: 9 px of #a8926a on
 *  cream does not clear the contrast floor. */
const KEY_HINT = 'relative z-[1] ml-auto font-mono text-nano text-paper-600 dark:text-paper-500'
/** Rule-leading eyebrow — the masthead's and the view group's, one style. */
const EYEBROW = 'font-mono text-label tracking-[0.25em] uppercase text-paper-600 dark:text-paper-500'
/** One size for every glyph in the rail — the family only holds together if
 *  they are all drawn at the same scale. */
const GLYPH = 28

/** A settings row: name left, control right, at two thirds a button's height. */
function ViewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="h-[2.75rem] flex items-center justify-between gap-2">
      <span className="text-[1vw] leading-none text-paper-800 dark:text-paper-200">{label}</span>
      {children}
    </div>
  )
}

/** The one segmented-control idiom the view group uses — two options or
 *  three, same geometry. Mono because every value in it is a setting, not a
 *  name; the active cell is the rail's ochre, the same "this one is live"
 *  tone the play and hold rows wear. */
function Seg<T extends string>({ value, options, onChange, label }: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center rounded-md ring-1 ring-paper-400/40 dark:ring-paper-300/20 overflow-hidden">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`px-[5px] py-1 font-mono text-label uppercase tracking-wider transition-colors
              ${on ? 'bg-ochre-500/18 text-ink dark:text-paper-100' : 'text-paper-600 dark:text-paper-500 hover:text-ink dark:hover:text-paper-200'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

const TOD_OPTIONS = [
  { value: 'day' as const, label: 'Day' },
  { value: 'dusk' as const, label: 'Dusk' },
  { value: 'night' as const, label: 'Night' },
]
const ONOFF = [
  { value: 'on' as const, label: 'On' },
  { value: 'off' as const, label: 'Off' },
]

export default function RightRail({
  playing, holdLeftMs, stopIndex, stopCount, stream, dwellProgress, tod, beaconOn, ticksOn,
  onPlayToggle, onHold, onOverlayToggle, onTod, onBeaconToggle, onTicksToggle, onExit,
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
      className="relative flex flex-col items-stretch gap-2 w-[13.5rem] px-3 py-4 noise-bg overflow-y-auto
        bg-paper-100/95 dark:bg-espresso-900/90 backdrop-blur-xl
        border-l border-paper-400/60 dark:border-paper-300/25"
    >
      {/* ── Masthead: the page's own name, and the page's only h1. The route
          runs with the app shell off, so nothing else on screen says where
          the reader is. */}
      {/* No eyebrow and no "Live" anywhere near the tiles (Jesse, 2026-09-20:
          the word would read as a claim about the imagery). Two lines, one
          size, two colours — and only empty space under them, no rule. */}
      <div className="px-1 pb-4 mb-1">
        <h1
          className="font-display italic leading-[1.05] text-ink dark:text-paper-100"
          style={{ fontSize: '1.7vw' }}
        >
          The Last 48
          <span className="block text-paper-700 dark:text-paper-400">Immersive</span>
        </h1>
      </div>

      <button
        type="button" onClick={onPlayToggle} aria-pressed={playing}
        className={`${ROW} ${playing ? ROW_ON : ''}`} title="Auto-advance (Space)"
      >
        {playing && <div className="glow-corner is-sm" style={{ ['--glow' as string]: '#d4a435' }} />}
        <span className="relative z-[1] shrink-0">
          {playing ? <PauseGlyph size={GLYPH} /> : <PlayGlyph size={GLYPH} />}
        </span>
        <span className={NAME}>{playing ? 'Pause' : 'Play'}</span>
        <span className={KEY_HINT}>space</span>
      </button>

      <button
        type="button" onClick={onHold} aria-pressed={holding}
        className={`${ROW} ${holding ? ROW_ON : ''}`} title="Hold 10 s (H)"
      >
        {holding && <div className="glow-corner is-sm" style={{ ['--glow' as string]: '#d4a435' }} />}
        {/* The countdown arc is a SECOND svg over the glyph at the same
            geometry, so the box and both svgs share GLYPH. */}
        <span className="relative z-[1] shrink-0" style={{ width: GLYPH, height: GLYPH }}>
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
        <span className={NAME}>Hold</span>
        {/* The countdown is a measured value, so it stays mono beside the
            serif name rather than joining it. */}
        {holding && (
          <span className="relative z-[1] font-mono text-nano tabular-nums text-paper-700 dark:text-paper-300">
            · {Math.ceil(holdLeftMs / 1000)} s
          </span>
        )}
        <span className={KEY_HINT}>H</span>
      </button>

      <button type="button" onClick={onOverlayToggle} className={ROW} title="Hide the panels (O)">
        <span className="relative z-[1] shrink-0"><OverlayGlyph size={GLYPH} /></span>
        <span className={NAME}>Hide</span>
        <span className={KEY_HINT}>O</span>
      </button>

      {/* ── VIEW: what the scene wears. Not playback — these three stay put
          while the pass runs, which is why they are a group of their own at
          settings scale rather than three more buttons. */}
      {/* View settings — no eyebrow, no rule (Jesse, 2026-09-20): the rows
          read as a group on their own. */}
      <div className="mt-4">
        <ViewRow label="Light">
          <Seg value={tod} options={TOD_OPTIONS} onChange={onTod} label="Time of day" />
        </ViewRow>
        <ViewRow label="Beacon">
          <Seg
            value={beaconOn ? 'on' : 'off'} options={ONOFF}
            onChange={(v) => onBeaconToggle(v === 'on')} label="Beacon over the stop"
          />
        </ViewRow>
        <ViewRow label="Frame ticks">
          <Seg
            value={ticksOn ? 'on' : 'off'} options={ONOFF}
            onChange={(v) => onTicksToggle(v === 'on')} label="Frame ticks"
          />
        </ViewRow>
      </div>

      {/* The air that separates what you set from what you read, and what
          keeps the ledger off the bottom of a tall screen. */}
      <div className="flex-1" aria-hidden />

      {/* ── Stop ledger: where you are, and how far the camera has to run. */}
      <div className="pt-3 border-t border-paper-400/40 dark:border-paper-300/15">
        <p className="text-[15px] leading-none text-ink dark:text-paper-100">
          Stop <span className="tabular-nums">{known ? stopIndex : '—'}</span> of <span className="tabular-nums">{known ? stopCount : '—'}</span>
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
