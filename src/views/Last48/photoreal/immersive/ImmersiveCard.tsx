// src/views/Last48/photoreal/immersive/ImmersiveCard.tsx
//
// The card face in the immersive lower third — Spec A2 §2. Same FIELD LOGIC
// as PhotorealBubble and Last48EventCard (detail/eventCardModel.ts) so the
// three never drift; this skin sits in the band (no pin, no stem) and
// follows the theme.
//
// role='active' is a FULL INVERT (design critique, 2026-09-13 — "the active
// card has no primacy"): the face flips register against the band, so the
// band reads espresso-on-cream in light mode and cream-on-espresso in dark.
// Because the face inverts, EVERY text colour inside it is re-specified —
// inheriting the band's register would put paper-500 labels on an espresso
// face. role='peek' keeps the band's own register, dimmed and slightly
// shrunk, as a click target that jumps the carousel.
import type { CSSProperties } from 'react'
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
}

/** The cool pigments (911 indigo, and plum wherever it turns up) disappear
 *  into the inverted face's espresso ground. Swap them for terracotta so the
 *  corner glow still reads as light leaking in; the DOT and the stream label
 *  keep the stream's true pigment, which is where identity actually lives. */
export function visibleGlow(color: string): string {
  const c = color.toLowerCase()
  return c === '#616a96' || c === '#8b6282' ? '#b85a33' : color
}

export default function ImmersiveCard({ event, role, onClick, glow }: Props) {
  const meta = DATASET_META[event.datasetId]
  const { magnitude, unit } = formatAge(event.receivedAt)
  const loc = locationLine(event)
  const explore = role === 'active' ? resolveExplore(event) : null
  const media = event.datasetId === '311-cases'
    ? classifyCaseMedia((event.raw as { media_url?: { url?: string } | null }).media_url?.url) : null
  const rows: Array<[string, string]> = [
    ...(event.datasetId === '911-realtime' && event.priority ? [['Priority', event.priority === 'A' ? 'A — life-threatening' : event.priority] as [string, string]] : []),
    ...(loc ? [[loc.label, loc.place] as [string, string]] : []),
    ...populatedFields(event),
  ]
  const peek = role === 'peek'

  // Three tone tiers, each authored for BOTH faces: primary (the figure, the
  // headline, the row values), secondary (the age unit), label (mono caps).
  const primary = peek
    ? 'text-ink dark:text-paper-100'
    : 'text-paper-50 dark:text-ink'
  const secondary = peek
    ? 'text-paper-500 dark:text-paper-400'
    : 'text-paper-200 dark:text-paper-700'
  const labelTone = peek
    ? 'text-paper-500 dark:text-paper-400'
    : 'text-paper-400 dark:text-paper-600'

  const shell = 'text-left w-[min(340px,100%)] rounded-2xl px-4 pt-3 pb-3 origin-bottom transition-[opacity,transform] duration-500'
  const face = peek
    ? `${shell} ${primary} bg-paper-50/90 dark:bg-espresso-950/85 ring-1 ring-paper-300/40 dark:ring-paper-100/15
       shadow-2xl shadow-black/30 opacity-45 hover:opacity-90 scale-[0.94] cursor-pointer`
    // The invert: espresso face on the cream band, cream face on the dark one.
    : `${shell} ${primary} bg-espresso-950 dark:bg-paper-50 -translate-y-3 scale-[1.06] ${glow ? 'glow-host' : ''}`

  // One box-shadow property carries BOTH the depth (offset + soft blur, the
  // craft floor's rule) and the solid 3px pigment tab down the left edge —
  // the 30%-alpha ring it replaced was invisible at a glance.
  const faceStyle = !peek
    ? ({
        ['--glow' as string]: visibleGlow(meta.color),
        boxShadow: `inset 3px 0 0 ${meta.color}, 0 30px 60px -15px rgb(0 0 0 / 0.55)`,
      } as CSSProperties)
    : undefined

  const body = (
    <>
      {/* The glow sits UNDER the content: `.glow-host` isolates, `.glow-corner`
          is z-index 0, so everything readable rides one layer above it. */}
      {!peek && glow && <div className="glow-corner" />}
      <div className={!peek && glow ? 'relative z-[1]' : undefined}>
      <div className="flex items-baseline gap-2">
        <span className={`font-display italic text-[40px] leading-none tabular-nums ${primary}`}>{magnitude}</span>
        <span className={`font-display italic text-[15px] ${secondary}`}>{unit}</span>
      </div>
      <p className={`font-mono text-label mt-1 tabular-nums ${labelTone}`}>{formatApDate(event.receivedAt)} · {formatApTime(event.receivedAt)} PT</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 10px ${meta.color}` }} aria-hidden />
        {/* The DOT carries the pigment; the LABEL does not. On the inverted
            face the cool pigments fall under 4:1 against espresso-950 at nano
            size, so the words take a neutral tone and identity stays with the
            dot beside them. Peeks keep the pigment — they sit on the band's
            own register, where it reads. */}
        <span
          className={`font-mono text-nano tracking-[0.18em] uppercase ${peek ? '' : 'text-paper-300 dark:text-paper-600'}`}
          style={peek ? { color: meta.color } : undefined}
        >{meta.label}</span>
        {event.state && <span className={`font-mono text-nano tracking-wider uppercase ${labelTone}`}>{event.state === 'open' ? 'open' : `closed · ${event.disposition ?? '—'}`}</span>}
      </div>
      <h3 className={`font-display italic text-[22px] leading-tight mt-1 mb-2 ${primary}`}>{event.headline ? formatHeadline(event.headline) : 'Event'}</h3>
      {!peek && media?.kind === 'image' && (
        <img src={media.url} alt="311 case attachment" className="w-full max-h-32 object-cover rounded-md mb-2" onError={(e) => { e.currentTarget.style.display = 'none' }} />
      )}
      {!peek && (
        <ul className="flex flex-col gap-1">
          {rows.map(([label, value], i) => (
            <li key={label} className="bubble-row flex justify-between gap-4 text-[12px]" style={{ animationDelay: `${0.6 + i * 0.9}s` }}>
              <span className={`font-mono text-nano uppercase tracking-[0.14em] pt-0.5 ${labelTone}`}>{label}</span>
              <span className={`text-right leading-tight ${primary}`}>{value}</span>
            </li>
          ))}
        </ul>
      )}
      {explore && (
        <Link to={explore.to} className="bubble-row mt-3 block font-mono text-label tracking-wider text-ochre-400 hover:text-ochre-300 dark:text-ochre-600 dark:hover:text-ochre-700" style={{ animationDelay: `${0.6 + rows.length * 0.9}s` }}>
          {explore.label} →
        </Link>
      )}
      </div>
    </>
  )

  // Two explicit elements, not a dynamic tag: `type` is not a <div> prop.
  return peek
    ? <button type="button" onClick={onClick} aria-label={`Go to: ${event.headline ?? 'event'}`} className={face} style={faceStyle}>{body}</button>
    : <div className={face} style={faceStyle}>{body}</div>
}
