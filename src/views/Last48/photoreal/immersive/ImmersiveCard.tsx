// src/views/Last48/photoreal/immersive/ImmersiveCard.tsx
//
// The card face in the immersive lower third — Spec A2 §2. Same FIELD LOGIC
// as PhotorealBubble and Last48EventCard (detail/eventCardModel.ts) so the
// three never drift; this skin sits in the band (no pin, no stem) and
// follows the theme. role='peek' renders the neighbours at 0.7 opacity,
// unscaled and READABLE (Jesse, 2026-09-13 — the old 40%/scale-90 peeks were
// decoration), as a click target that jumps the carousel. `glow` is the
// ACTIVE tile's own corner-glow + pigment ring; the field logic is identical
// in every case.
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
  /** The ACTIVE tile only: corner glow + a 1px ring, both in the stream's
   *  pigment. Purely a skin — nothing about the fields changes. */
  glow?: boolean
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
  const face = `text-left w-[min(340px,100%)] rounded-2xl px-4 pt-3 pb-3 shadow-2xl shadow-black/30 ring-1
    bg-paper-50/90 ring-paper-300/40 text-ink dark:bg-espresso-950/85 dark:ring-paper-100/15 dark:text-paper-100
    transition-[opacity,transform] duration-500
    ${peek ? 'opacity-70 hover:opacity-100 cursor-pointer' : 'opacity-100'}
    ${glow ? 'glow-host' : ''}`
  // The pigment ring is inline, so it also carries the drop shadow the
  // `shadow-2xl` class would otherwise have owned (one box-shadow property).
  const faceStyle = glow
    ? ({ ['--glow' as string]: meta.color, boxShadow: `inset 0 0 0 1px ${meta.color}4d, 0 25px 50px -12px rgb(0 0 0 / 0.3)` } as CSSProperties)
    : undefined

  const body = (
    <>
      {/* The glow sits UNDER the content: `.glow-host` isolates, `.glow-corner`
          is z-index 0, so everything readable rides one layer above it. */}
      {glow && <div className="glow-corner" />}
      <div className={glow ? 'relative z-[1]' : undefined}>
      <div className="flex items-baseline gap-2">
        <span className="font-display italic text-[40px] leading-none tabular-nums">{magnitude}</span>
        <span className="font-display italic text-[15px] text-paper-500 dark:text-paper-400">{unit}</span>
      </div>
      <p className="font-mono text-label text-paper-500 mt-1 tabular-nums">{formatApDate(event.receivedAt)} · {formatApTime(event.receivedAt)} PT</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 10px ${meta.color}` }} aria-hidden />
        <span className="font-mono text-nano tracking-[0.18em] uppercase" style={{ color: meta.color }}>{meta.label}</span>
        {event.state && <span className="font-mono text-nano tracking-wider uppercase text-paper-500 dark:text-paper-400">{event.state === 'open' ? 'open' : `closed · ${event.disposition ?? '—'}`}</span>}
      </div>
      <h3 className="font-display italic text-[22px] leading-tight mt-1 mb-2">{event.headline ? formatHeadline(event.headline) : 'Event'}</h3>
      {!peek && media?.kind === 'image' && (
        <img src={media.url} alt="311 case attachment" className="w-full max-h-32 object-cover rounded-md mb-2" onError={(e) => { e.currentTarget.style.display = 'none' }} />
      )}
      {!peek && (
        <ul className="flex flex-col gap-1">
          {rows.map(([label, value], i) => (
            <li key={label} className="bubble-row flex justify-between gap-4 text-[12px]" style={{ animationDelay: `${0.6 + i * 0.9}s` }}>
              <span className="font-mono text-nano uppercase tracking-[0.14em] text-paper-500 pt-0.5">{label}</span>
              <span className="text-right leading-tight">{value}</span>
            </li>
          ))}
        </ul>
      )}
      {explore && (
        <Link to={explore.to} className="bubble-row mt-3 block font-mono text-label tracking-wider text-ochre-600 hover:text-ochre-500 dark:text-ochre-400 dark:hover:text-ochre-300" style={{ animationDelay: `${0.6 + rows.length * 0.9}s` }}>
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
