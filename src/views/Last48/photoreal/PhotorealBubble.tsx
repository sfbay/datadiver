// src/views/Last48/photoreal/PhotorealBubble.tsx
//
// The floating card in photoreal mode. Same FIELD LOGIC as the flat map's
// Last48EventCard (detail/eventCardModel.ts) so the two never drift; a
// different SKIN: an HTML card pinned above the hero marker every frame
// (scene.cartesianToCanvasCoordinates on postRender) with a real stem down to
// it. It fades in once the tiles at the stop have settled (12 s cap) and
// its rows stagger ~1.1 s apart; reduced motion shows everything at once.
//
// The card and the marker have to read as ONE object. Two rules do that:
//   • The anchor is the TOP OF THE HERO COLUMN — HERO_COLUMN_M above the tile
//     surface, imported from PhotorealMarkers so the two cannot drift, and
//     clamped through the same tileset height sampler Cesium's own entity
//     clamping uses (polylines and HTML carry no heightReference). Until a
//     tile covering the stop has loaded the sampler returns undefined and the
//     un-clamped ellipsoid point stands in.
//   • The stem is an SVG line drawn in host space from the card's bottom
//     centre to the projected column top — so when the card is clamped away
//     from the screen edge, the stem leans and it still reads as tethered.
import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import { tileGroundM } from './groundHeight'
import { Link } from 'react-router-dom'
import type { NormalizedEvent } from '@/types/last48'
import { formatApTime, formatHeadline } from '@/utils/format'
import { classifyCaseMedia } from '@/utils/caseMedia'
import { DATASET_META, formatAge, formatApDate, populatedFields, resolveExplore, locationLine } from '../detail/eventCardModel'
import { HERO_COLUMN_M } from './PhotorealMarkers'
import { SETTLE_CAP_MS } from './useCesiumDirector'

/** Clear air between the card's bottom edge and the top of the column. */
const GAP_PX = 6   // the column's top must visibly TOUCH the card (Jesse, 2026-09-10)
/** The card never comes closer than this to either side of the host. */
const EDGE_PX = 12
/** Height-sample cadence: eager until the tiles resolve, then slow enough to
 *  follow tile refinement without costing a CPU ray pick every frame. */
const PROBE_MS = 500
const REPROBE_MS = 2000

interface Props {
  viewer: Cesium.Viewer
  tileset: Cesium.Cesium3DTileset | null
  event: NormalizedEvent | null
  onClose: () => void
}

export default function PhotorealBubble({ viewer, tileset, event, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const lineRef = useRef<SVGLineElement>(null)
  /** Card width, kept by a ResizeObserver — reading offsetWidth inside the
   *  postRender tick would force a layout flush on every frame. */
  const widthRef = useRef(0)
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

  useEffect(() => {
    const el = ref.current
    if (!el) return
    widthRef.current = el.offsetWidth
    const ro = new ResizeObserver(() => { widthRef.current = el.offsetWidth })
    ro.observe(el)
    return () => ro.disconnect()
  }, [event])

  // Pin the card and redraw the stem every frame.
  useEffect(() => {
    if (!event || event.longitude == null || event.latitude == null) return
    const lng = event.longitude, lat = event.latitude
    const carto = Cesium.Cartographic.fromDegrees(lng, lat)
    let anchor = Cesium.Cartesian3.fromDegrees(lng, lat, HERO_COLUMN_M)
    let clamped = false
    let probedAt = 0

    const tick = () => {
      const el = ref.current
      const line = lineRef.current
      if (!el || !line) return
      const now = performance.now()
      if (tileset && now - probedAt > (clamped ? REPROBE_MS : PROBE_MS)) {
        probedAt = now
        let h: number | undefined
        // Returns undefined until a tile covering the point has loaded, and
        // throws nothing in practice — but the picking path is the one place
        // Cesium can, so keep the frame alive either way.
        h = tileGroundM(tileset, carto, viewer.scene)
        if (h != null) {
          anchor = Cesium.Cartesian3.fromDegrees(lng, lat, h + HERO_COLUMN_M)
          clamped = true
        }
      }
      const p = viewer.scene.cartesianToCanvasCoordinates(anchor)
      if (!p) { // anchor off-canvas — don't leave a stale transform
        el.style.visibility = 'hidden'
        line.style.visibility = 'hidden'
        return
      }
      el.style.visibility = 'visible'
      line.style.visibility = 'visible'
      const half = widthRef.current / 2
      const hostW = viewer.scene.canvas.clientWidth
      const lo = EDGE_PX + half, hi = hostW - EDGE_PX - half
      // A card wider than the host cannot satisfy both edges — centre it.
      const cx = hi < lo ? hostW / 2 : Math.min(Math.max(p.x, lo), hi)
      el.style.transform = `translate(${cx}px, ${p.y}px) translate(-50%, calc(-100% - ${GAP_PX}px))`
      line.setAttribute('x1', String(cx))
      line.setAttribute('y1', String(p.y - GAP_PX))
      line.setAttribute('x2', String(p.x))
      line.setAttribute('y2', String(p.y))
    }
    viewer.scene.postRender.addEventListener(tick)
    // Parent-first cleanup order: the host's viewer.destroy() may already have
    // run (engine switch with the bubble open), and viewer.scene is undefined
    // after it. isDestroyed() is the one call that stays safe post-destroy.
    return () => { if (!viewer.isDestroyed()) viewer.scene.postRender.removeEventListener(tick) }
  }, [viewer, tileset, event])

  useEffect(() => {
    if (!event) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [event, onClose])

  // No coordinates → nothing to pin to. The host renders the flat
  // Last48EventCard for that case instead (a sensitive 911 call).
  if (!event || event.longitude == null || event.latitude == null) return null
  const meta = DATASET_META[event.datasetId]
  const { magnitude, unit } = formatAge(event.receivedAt)
  const loc = locationLine(event)
  const explore = resolveExplore(event)
  const media = event.datasetId === '311-cases'
    ? classifyCaseMedia((event.raw as { media_url?: { url?: string } | null }).media_url?.url) : null
  const rows: Array<[string, string]> = [
    ...(event.datasetId === '911-realtime' && event.priority ? [['Priority', event.priority === 'A' ? 'A — life-threatening' : event.priority] as [string, string]] : []),
    // locationLine() returns null only when coordinates are missing, and the
    // early return above already sent that case to the flat card — so there is
    // no "Suppressed; sensitive call" row to render here any more.
    ...(loc ? [[loc.label, loc.place] as [string, string]] : []),
    ...populatedFields(event),
  ]

  return (
    <>
      <svg
        className={`pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible transition-opacity duration-700 ${shown ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden
      >
        <line
          ref={lineRef}
          x1="0" y1="0" x2="0" y2="0"
          stroke={meta.color}
          strokeWidth="2"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${meta.color})`, visibility: 'hidden' }}
        />
      </svg>
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
      </div>
    </>
  )
}
