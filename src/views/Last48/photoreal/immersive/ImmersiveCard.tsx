// src/views/Last48/photoreal/immersive/ImmersiveCard.tsx
//
// The card face in the immersive lower third — Spec A2 §2. Same FIELD LOGIC
// as PhotorealBubble and Last48EventCard (detail/eventCardModel.ts) so the
// three never drift; this skin sits in the band (no pin, no stem). A PEEK
// follows the theme; the ACTIVE face does not — see below.
//
// EVERY card now renders the SAME fields — rows, the 311 image, the Explore
// link (Jesse, 2026-09-20: the peeks were a teaser for information the reader
// could already see coming). `role` governs the FACE and nothing else: active
// = the latte lift, peek = the band's own register, dimmed and shrunk. That
// is why the peek is a <div role="button"> and not a <button>: a real <Link>
// inside a <button> is a nested interactive (invalid, and a screen reader
// reads one control where there are two), and the Explore link has to stay a
// real link. The link stops its own click so following it never also jumps
// the carousel.
//
// role='active' is a LATTE face — "coffee with cream". It replaced a literal
// theme invert (2026-09-13 → 2026-09-20): the invert gave the active card its
// primacy but flipped with the theme, so the one card the page is ABOUT had
// no fixed identity. The latte is theme-independent, which means it reads the
// same way in both schemes and every text colour inside it is authored
// against that one ground, not inherited from the band. role='peek' keeps the
// band's own register, dimmed and slightly shrunk, as a click target that
// jumps the carousel.
import type { CSSProperties, KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import type { NormalizedEvent } from '@/types/last48'
import { formatApTime, formatHeadline } from '@/utils/format'
import { classifyCaseMedia } from '@/utils/caseMedia'
import { DATASET_META, formatAge, formatApDate, populatedFields, resolveExplore, locationLine } from '../../detail/eventCardModel'

interface Props {
  event: NormalizedEvent
  role: 'active' | 'peek'
  /** Peek cards: jump here. */
  onClick?: () => void
  /** The ACTIVE tile only: corner glow + the pigment tab. Purely a skin —
   *  nothing about the fields changes. */
  glow?: boolean
  /** ACTIVE only: 0..1 fills a 3 px stripe along the top edge across the
   *  dwell (Round B §4). null/undefined = no stripe (explore, flight). */
  progress?: number | null
}

// ── The latte ─────────────────────────────────────────────────────────────
// coffee with cream — Jesse 2026-09-20; deliberately theme-independent.
// Three tones on one ground, authored together. Measured against LATTE_BG:
// text-ink (#4b3827) 6.84:1, LATTE_INK_2 4.72:1, LATTE_LABEL 5.02:1 — every
// tier clears 4.5:1, so nothing on this face is decorative-only text. The
// two lower tiers were darkened from the first pass (#6b5640 4.27, #7d6748
// 3.32) once the measurements came back under the line; the SEPARATION
// between them now comes from hue and size, not from letting the smallest
// type be the faintest.
/** The active face's ground. */
const LATTE_BG = '#dcc9a6'
/** Secondary: the age unit, the date line, the state chip, the stream label. */
const LATTE_INK_2 = '#63503b'
/** Mono caps — the row labels. */
const LATTE_LABEL = '#5f4c38'

// Whether the STREAM PIGMENT could carry the stream label as text on the
// latte was checked per stream, by hand, against #dcc9a6: indigo #616a96 →
// 3.23:1, terracotta #b85a33 → 2.85:1, moss #7a9954 → 1.99:1. None of the
// three clears 4.5:1 (and no darkening would keep them recognisable as the
// stream pigments), so on the active face the label takes LATTE_INK_2 and
// identity stays with the pigment DOT beside it — and with the corner glow,
// which is decoration and carries no contrast duty. Peeks keep the pigment:
// they sit on the band's own register, where it reads.

export default function ImmersiveCard({ event, role, onClick, glow, progress }: Props) {
  const meta = DATASET_META[event.datasetId]
  const { magnitude, unit } = formatAge(event.receivedAt)
  const loc = locationLine(event)
  const explore = resolveExplore(event)
  const media = event.datasetId === '311-cases'
    ? classifyCaseMedia((event.raw as { media_url?: { url?: string } | null }).media_url?.url) : null
  const rows: Array<[string, string]> = [
    ...(event.datasetId === '911-realtime' && event.priority ? [['Priority', event.priority === 'A' ? 'A — life-threatening' : event.priority] as [string, string]] : []),
    ...(loc ? [[loc.label, loc.place] as [string, string]] : []),
    ...populatedFields(event),
  ]
  const peek = role === 'peek'

  // Three tone tiers. A PEEK rides the band's register, so its tones are
  // theme classes. The LATTE face never changes ground, so its tones are the
  // three authored hexes, applied inline — `text-ink` is the one that happens
  // to be a token as well (it is defined once in @theme, with no dark
  // override, so it means #4b3827 in both schemes).
  const primary = peek ? 'text-ink dark:text-paper-100' : 'text-ink'
  const secondary = peek ? 'text-paper-500 dark:text-paper-400' : ''
  const labelTone = peek ? 'text-paper-500 dark:text-paper-400' : ''
  const linkTone = peek
    ? 'text-terracotta-700 hover:text-terracotta-600 dark:text-terracotta-400 dark:hover:text-terracotta-500'
    : 'text-terracotta-700 hover:text-[#7a3920]'
  const secondaryStyle: CSSProperties | undefined = peek ? undefined : { color: LATTE_INK_2 }
  const labelStyle: CSSProperties | undefined = peek ? undefined : { color: LATTE_LABEL }

  // `origin-top`, because the row is top-aligned (LowerThird's `items-start`,
  // 2026-09-20): the active card's lift and the peeks' shrink both have to
  // leave the TOP edge where it was, or the four tiles stop reading as a row.
  const shell = 'text-left w-[min(340px,100%)] rounded-2xl px-4 pt-3 pb-3 origin-top transition-[opacity,transform] duration-500'
  const face = peek
    ? `${shell} ${primary} bg-paper-50/90 dark:bg-espresso-950/85 ring-1 ring-paper-300/40 dark:ring-paper-100/15
       shadow-2xl shadow-black/30 opacity-70 hover:opacity-100 scale-[0.94] cursor-pointer`
    // The latte — one ground in both schemes; see the constants above.
    : `${shell} ${primary} relative overflow-hidden -translate-y-3 scale-[1.06] ${glow ? 'glow-host' : ''}`

  // One box-shadow property carries BOTH the depth (offset + soft blur, the
  // craft floor's rule) and the solid 3px pigment tab down the left edge —
  // the 30%-alpha ring it replaced was invisible at a glance. The corner glow
  // is now the stream pigment EXACTLY: the old terracotta substitution paid
  // for the cool pigments disappearing into an espresso ground, and the latte
  // has no such ground.
  const faceStyle = !peek
    ? ({
        background: LATTE_BG,
        ['--glow' as string]: meta.color,
        boxShadow: `inset 3px 0 0 ${meta.color}, 0 30px 60px -15px rgb(0 0 0 / 0.55)`,
      } as CSSProperties)
    : undefined

  const body = (
    <>
      {/* The glow sits UNDER the content: `.glow-host` isolates, `.glow-corner`
          is z-index 0, so everything readable rides one layer above it. */}
      {!peek && glow && <div className="glow-corner" />}
      {/* THE STRIPE (Round B §4): the stream pigment running out along the
          top edge across the dwell — the same colour as the tab down the
          left edge, so it reads as that tab's ink being spent. Width moves
          in 250 ms steps (the page's ticker) and the linear transition
          smooths them into one continuous fill. Hidden entirely unless the
          page is PLAYING and the stop has arrived. */}
      {!peek && progress != null && (
        <div
          aria-hidden
          className="absolute left-0 top-0 h-[3px] transition-[width] duration-[250ms] ease-linear"
          style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%`, background: meta.color }}
        />
      )}
      <div className={!peek && glow ? 'relative z-[1]' : undefined}>
      <div className="flex items-baseline gap-2">
        <span className={`font-display italic text-[40px] leading-none tabular-nums ${primary}`}>{magnitude}</span>
        <span className={`font-display italic text-[15px] ${secondary}`} style={secondaryStyle}>{unit}</span>
      </div>
      <p className={`font-mono text-label mt-1 tabular-nums ${secondary}`} style={secondaryStyle}>{formatApDate(event.receivedAt)} · {formatApTime(event.receivedAt)} PT</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 10px ${meta.color}` }} aria-hidden />
        {/* The DOT carries the pigment; on the latte face the LABEL does not
            — none of the three stream pigments clears 4.5:1 on #dcc9a6 (the
            measurements are in the header comment). Peeks keep the pigment. */}
        <span
          className="font-mono text-nano tracking-[0.18em] uppercase"
          style={peek ? { color: meta.color } : secondaryStyle}
        >{meta.label}</span>
        {event.state && <span className={`font-mono text-nano tracking-wider uppercase ${secondary}`} style={secondaryStyle}>{event.state === 'open' ? 'open' : `closed · ${event.disposition ?? '—'}`}</span>}
      </div>
      <h3 className={`font-display italic text-[22px] leading-tight mt-1 mb-2 ${primary}`}>{event.headline ? formatHeadline(event.headline) : 'Event'}</h3>
      {media?.kind === 'image' && (
        <img src={media.url} alt="311 case attachment" className="w-full max-h-32 object-cover rounded-md mb-2" onError={(e) => { e.currentTarget.style.display = 'none' }} />
      )}
      <ul className="flex flex-col gap-1">
        {rows.map(([label, value], i) => (
          <li key={label} className="bubble-row flex justify-between gap-4 text-[12px]" style={{ animationDelay: `${0.6 + i * 0.9}s` }}>
            <span className={`font-mono text-nano uppercase tracking-[0.14em] pt-0.5 ${labelTone}`} style={labelStyle}>{label}</span>
            <span className={`text-right leading-tight ${primary}`}>{value}</span>
          </li>
        ))}
      </ul>
      {/* Terracotta, not ochre: ochre was picked to carry a link across an
          inverting face, and on the latte it goes to butter. On the LATTE the
          hover goes DARKER (#7a3920, 5.32:1) — terracotta-600 would have been
          2.85:1, i.e. pointing at the link made it harder to read. A PEEK
          rides the band, so it needs the theme pair instead: terracotta-700
          on cream (6.3:1), terracotta-400 on espresso (7.3:1) — the dark
          tone on the dark ground would have been 2.7:1.
          `stopPropagation`: the peek's own wrapper is a role="button" that
          jumps the carousel, and following the link must not also do that. */}
      {explore && (
        <Link
          to={explore.to}
          onClick={(e) => e.stopPropagation()}
          className={`bubble-row mt-3 block font-mono text-label tracking-wider ${linkTone}`}
          style={{ animationDelay: `${0.6 + rows.length * 0.9}s` }}
        >
          {explore.label} →
        </Link>
      )}
      </div>
    </>
  )

  // A peek is a <div role="button">, not a <button>: it now carries a real
  // <Link>, and an anchor inside a button is a nested interactive. The div
  // gets the keyboard contract a <button> would have given for free —
  // tabIndex, Enter and Space (preventDefault on Space, or the band scrolls).
  const jump = () => onClick?.()
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    jump()
  }
  return peek
    ? (
      <div
        role="button"
        tabIndex={0}
        onClick={jump}
        onKeyDown={onKeyDown}
        aria-label={`Go to: ${event.headline ?? 'event'}`}
        className={face}
        style={faceStyle}
      >{body}</div>
    )
    : <div className={face} style={faceStyle}>{body}</div>
}
