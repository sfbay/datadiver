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
// Sept. 23 2026 (Jesse): the rail becomes a GEOGRAPHIC NAVIGATOR. Reading
// order top→bottom: RETURN · masthead · PLAY · HOLD · HIDE (one compact row
// of three) · VIEW · the NAVIGATOR (search, Places, Neighborhoods, Hotspots).
// RETURN moved to the top ("put this at the top of the window, not the
// bottom"), and the stop ledger (Stop N of M, the dwell rule, the stream,
// EXPLORE, the key hints) moved into the lower third's header, beside the
// cards it describes.
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
  /** The grade the tiles are wearing — `?tod=`, dusk by default. */
  tod: Grade
  beaconOn: boolean
  ticksOn: boolean
  /** The geographic navigator (Navigator.tsx), under the view group. */
  navigator?: ReactNode
  onPlayToggle: () => void
  onHold: () => void
  onOverlayToggle: () => void
  onTod: (v: Grade) => void
  onBeaconToggle: (v: boolean) => void
  onTicksToggle: (v: boolean) => void
  onExit: () => void
}

export const HOLD_MS = 10_000

/** A control CELL — one of three in a row: glyph over name, key in the
 *  corner. `shrink-0` because the rail is a flex column that scrolls (a
 *  squashed row went to 3 px once, walk 2026-09-21). */
const CELL = `relative h-[4.25rem] flex-1 min-w-0 rounded-lg flex flex-col items-center justify-center gap-1 overflow-hidden glow-host
  ring-1 transition-colors bg-paper-50/70 dark:bg-espresso-800/70
  ring-paper-400/40 dark:ring-paper-300/20 hover:ring-paper-500/60
  text-paper-700 dark:text-paper-300`
const CELL_ON = 'bg-ochre-500/18 text-ink dark:text-paper-100'
/** The signature: the control's NAME in the display face ("drop the mono in
 *  the buttons… big serif ital, it's a signature look"). */
const NAME = 'relative z-[1] font-display italic text-[min(1.1vw,1.05rem)] leading-none text-ink dark:text-paper-100'
/** The key that does the same thing, tucked in the cell's corner. paper-600
 *  in light mode: 9 px of #a8926a on cream does not clear the contrast floor. */
const KEY_HINT = 'absolute top-1 right-1.5 z-[1] font-mono text-nano leading-none text-paper-600 dark:text-paper-500'
/** One size for every glyph in the rail. */
const GLYPH = 22

/** A settings row: name left, control right, at two thirds a button's height. */
function ViewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="h-[2.75rem] shrink-0 flex items-center justify-between gap-2">
      <span className="text-[1vw] leading-none text-paper-800 dark:text-paper-200">{label}</span>
      {children}
    </div>
  )
}

/** The one segmented-control idiom the view group uses — two options or
 *  three, same geometry. Mono because every value in it is a setting, not a
 *  name; the active cell is the rail's ochre. */
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
  playing, holdLeftMs, tod, beaconOn, ticksOn, navigator,
  onPlayToggle, onHold, onOverlayToggle, onTod, onBeaconToggle, onTicksToggle, onExit,
}: Props) {
  const holding = holdLeftMs > 0
  const ringOff = HOLD_RING_LEN * (1 - holdLeftMs / HOLD_MS)

  return (
    <nav
      aria-label="Immersive controls and places"
      data-export-ignore
      className="relative flex flex-col items-stretch gap-2 w-[13.5rem] px-3 py-3 noise-bg overflow-y-auto
        bg-paper-100/95 dark:bg-espresso-900/90 backdrop-blur-xl
        border-l border-paper-400/60 dark:border-paper-300/25"
    >
      {/* ── RETURN: the way back, quoting the app shell's brand row. The badge
          and wordmark are the marks the shell wears at the top of every other
          page, so the destination is named rather than described — and at
          the TOP of the rail it sits where that brand row sits everywhere
          else (Jesse, 2026-09-23). A double rule under it separates the door
          from the page. */}
      <div className="relative shrink-0 pb-3 mb-1 border-b border-paper-400/60 dark:border-paper-300/25">
        <div className="absolute inset-x-0 bottom-[3px] h-px bg-paper-400/40 dark:bg-paper-300/15" aria-hidden />
        <button
          type="button" onClick={onExit} title="Back to The Last 48 (Escape)"
          className="w-full py-2 px-2 rounded-lg flex items-center gap-3 text-left transition-colors
            hover:bg-paper-200/60 dark:hover:bg-espresso-800/60"
        >
          <img src="/dana-badge-2.png" alt="" className="w-9 h-9 shrink-0 rounded-full object-cover ring-1 ring-paper-100/15" />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="font-display italic text-lg text-ink dark:text-paper-100 leading-none">DataDiver</span>
            <span className="font-mono text-label uppercase tracking-[0.2em] text-paper-600 dark:text-paper-500">RETURN ↩</span>
          </span>
        </button>
      </div>

      {/* ── Masthead: the page's own name, and the page's only h1. No "Live"
          anywhere near the tiles (Jesse, 2026-09-20). */}
      <div className="shrink-0 px-1 pb-2">
        <h1
          className="font-display italic leading-[1.05] text-ink dark:text-paper-100"
          style={{ fontSize: '1.7vw' }}
        >
          The Last 48
          <span className="block text-paper-700 dark:text-paper-400">Immersive</span>
        </h1>
      </div>

      {/* ── PLAY · HOLD · HIDE — one compact row, so the navigator gets the
          rail's height. */}
      <div className="shrink-0 flex gap-1.5">
        <button
          type="button" onClick={onPlayToggle} aria-pressed={playing}
          className={`${CELL} ${playing ? CELL_ON : ''}`} title="Auto-advance (Space)"
        >
          {playing && <div className="glow-corner is-sm" style={{ ['--glow' as string]: '#d4a435' }} />}
          <span className="relative z-[1]">{playing ? <PauseGlyph size={GLYPH} /> : <PlayGlyph size={GLYPH} />}</span>
          <span className={NAME}>{playing ? 'Pause' : 'Play'}</span>
          <span className={KEY_HINT}>space</span>
        </button>

        <button
          type="button" onClick={onHold} aria-pressed={holding}
          className={`${CELL} ${holding ? CELL_ON : ''}`} title="Hold 10 s (H)"
        >
          {holding && <div className="glow-corner is-sm" style={{ ['--glow' as string]: '#d4a435' }} />}
          {/* The countdown arc is a SECOND svg over the glyph at the same
              geometry, so the box and both svgs share GLYPH. */}
          <span className="relative z-[1]" style={{ width: GLYPH, height: GLYPH }}>
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
          <span className={NAME}>{holding ? `${Math.ceil(holdLeftMs / 1000)} s` : 'Hold'}</span>
          <span className={KEY_HINT}>H</span>
        </button>

        <button type="button" onClick={onOverlayToggle} className={CELL} title="Hide the panels (O)">
          <span className="relative z-[1]"><OverlayGlyph size={GLYPH} /></span>
          <span className={NAME}>Hide</span>
          <span className={KEY_HINT}>O</span>
        </button>
      </div>

      {/* ── VIEW: what the scene wears — settings scale, no eyebrow, no rule. */}
      <div className="mt-2 shrink-0">
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

      {/* ── The NAVIGATOR, under a rule: everything below is somewhere to go. */}
      <div className="mt-2 pt-3 border-t border-paper-400/40 dark:border-paper-300/15">
        {navigator}
      </div>
    </nav>
  )
}
