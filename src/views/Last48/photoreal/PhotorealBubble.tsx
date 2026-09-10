// src/views/Last48/photoreal/PhotorealBubble.tsx
//
// The floating card in photoreal mode. Same FIELD LOGIC as the flat map's
// Last48EventCard (detail/eventCardModel.ts) so the two never drift; a
// different SKIN: an HTML card pinned above the hero marker every frame
// (scene.cartesianToCanvasCoordinates on postRender) with a stem down to
// it. It fades in once the tiles at the stop have settled (12 s cap) and
// its rows stagger ~1.1 s apart; reduced motion shows everything at once.
import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import { Link } from 'react-router-dom'
import type { NormalizedEvent } from '@/types/last48'
import { formatApTime, formatHeadline } from '@/utils/format'
import { classifyCaseMedia } from '@/utils/caseMedia'
import { DATASET_META, formatAge, formatApDate, populatedFields, resolveExplore, locationLine } from '../detail/eventCardModel'
import { SETTLE_CAP_MS } from './useCesiumDirector'

const ANCHOR_HEIGHT_M = 110

interface Props {
  viewer: Cesium.Viewer
  tileset: Cesium.Cesium3DTileset | null
  event: NormalizedEvent | null
  onClose: () => void
}

export default function PhotorealBubble({ viewer, tileset, event, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  // Settle gate → show.
  useEffect(() => {
    setShown(false)
    if (!event) return
    const t0 = Date.now()
    const poll = setInterval(() => {
      if (!tileset || tileset.tilesLoaded || Date.now() - t0 > SETTLE_CAP_MS) { clearInterval(poll); setShown(true) }
    }, 150)
    return () => clearInterval(poll)
  }, [event, tileset])

  // Pin to the marker every frame.
  useEffect(() => {
    if (!event || event.longitude == null || event.latitude == null) return
    const anchor = Cesium.Cartesian3.fromDegrees(event.longitude, event.latitude, ANCHOR_HEIGHT_M)
    const tick = () => {
      const p = viewer.scene.cartesianToCanvasCoordinates(anchor)
      const el = ref.current
      if (!p || !el) return
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`
    }
    viewer.scene.postRender.addEventListener(tick)
    return () => { viewer.scene.postRender.removeEventListener(tick) }
  }, [viewer, event])

  useEffect(() => {
    if (!event) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [event, onClose])

  if (!event) return null
  const meta = DATASET_META[event.datasetId]
  const { magnitude, unit } = formatAge(event.receivedAt)
  const loc = locationLine(event)
  const explore = resolveExplore(event)
  const media = event.datasetId === '311-cases'
    ? classifyCaseMedia((event.raw as { media_url?: { url?: string } | null }).media_url?.url) : null
  const rows: Array<[string, string]> = [
    ...(event.datasetId === '911-realtime' && event.priority ? [['Priority', event.priority === 'A' ? 'A — life-threatening' : event.priority] as [string, string]] : []),
    ...(loc ? [[loc.label, loc.place] as [string, string]] : [['Location', 'Suppressed; sensitive call'] as [string, string]]),
    ...populatedFields(event),
  ]

  return (
    <div
      ref={ref}
      className={`pointer-events-none absolute left-0 top-0 z-30 transition-opacity duration-700 ${shown ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-label={event.headline ?? 'Event'}
    >
      <div className="pointer-events-auto min-w-[260px] max-w-[340px] rounded-2xl bg-espresso-950/85 backdrop-blur-md ring-1 ring-paper-100/15 px-4 pt-3 pb-3 text-paper-100 shadow-2xl shadow-black/40">
        <div className="flex items-baseline gap-2">
          <span className="font-display italic text-[40px] leading-none tabular-nums">{magnitude}</span>
          <span className="font-display italic text-[15px] text-paper-400">{unit}</span>
        </div>
        <p className="font-mono text-label text-paper-500 mt-1 tabular-nums">{formatApDate(event.receivedAt)} · {formatApTime(event.receivedAt)} PT</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 10px ${meta.color}` }} aria-hidden />
          <span className="font-mono text-nano tracking-[0.18em] uppercase" style={{ color: meta.color }}>{meta.label}</span>
          {event.state && <span className="font-mono text-nano tracking-wider uppercase text-paper-400">{event.state === 'open' ? 'open' : `closed · ${event.disposition ?? '—'}`}</span>}
        </div>
        <h3 className="font-display italic text-[22px] leading-tight mt-1 mb-2">{event.headline ? formatHeadline(event.headline) : 'Event'}</h3>
        {media?.kind === 'image' && (
          <img src={media.url} alt="311 case attachment" className="w-full max-h-40 object-cover rounded-md mb-2" onError={(e) => { e.currentTarget.style.display = 'none' }} />
        )}
        <ul className="flex flex-col gap-1">
          {rows.map(([label, value], i) => (
            <li key={label} className="bubble-row flex justify-between gap-4 text-[12px]" style={{ animationDelay: shown ? `${1.2 + i * 1.1}s` : '0s' }}>
              <span className="font-mono text-nano uppercase tracking-[0.14em] text-paper-500 pt-0.5">{label}</span>
              <span className="text-right leading-tight">{value}</span>
            </li>
          ))}
        </ul>
        {explore && (
          <Link to={explore.to} onClick={onClose} className="bubble-row mt-3 block font-mono text-label tracking-wider text-ochre-400 hover:text-ochre-300" style={{ animationDelay: shown ? `${1.2 + rows.length * 1.1}s` : '0s' }}>
            {explore.label} →
          </Link>
        )}
      </div>
      <div className="mx-auto h-[70px] w-px bg-gradient-to-b from-paper-100/60 to-transparent" aria-hidden />
    </div>
  )
}
