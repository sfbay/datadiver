// src/views/Last48/detail/Last48EventHoverBox.tsx
//
// Floating popover for FLOW event detail. Anchored to the dot's screen
// position on desktop; bottom-sheet on mobile (<768px).
//
// Interaction contract:
//   • Desktop hover — opens after 350ms dwell (managed by FlowMapLayer);
//     stays open while cursor is over the dot OR the popover itself.
//     100ms exit-timer lets the cursor traverse the gap between dot and
//     popover without dismissal.
//   • Click (pinned=true) — stays open until Esc or outside-click.
//   • Mobile tap — parent passes pinned=true immediately; renders as a
//     bottom sheet instead of a floating card.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { NormalizedEvent, DatasetId } from '@/types/last48'
import { computePlacement, useMediaQuery } from './useHoverBoxPlacement'

// ---------------------------------------------------------------------------
// Dataset metadata — label, pigment accent, explore link
// ---------------------------------------------------------------------------

const DATASET_META: Record<
  DatasetId,
  {
    label: string
    color: string
    exploreLabel: string
    exploreRoute: (id: string) => string
  }
> = {
  '911-realtime': {
    label: '911 DISPATCH',
    color: '#616a96',
    exploreLabel: 'Explore 911 Dispatch',
    exploreRoute: (id) => `/dispatch-911?incident=${encodeURIComponent(id)}`,
  },
  '911-historical': {
    label: '911 DISPATCH',
    color: '#5c9693',
    exploreLabel: 'Explore 911 Dispatch',
    exploreRoute: (id) => `/dispatch-911?incident=${encodeURIComponent(id)}`,
  },
  'fire-ems-dispatch': {
    label: 'FIRE / EMS',
    color: '#b85a33',
    exploreLabel: 'Explore Fire/EMS',
    exploreRoute: (id) => `/emergency-response?incident=${encodeURIComponent(id)}`,
  },
  '311-cases': {
    label: '311 CASE',
    color: '#7a9954',
    exploreLabel: 'Explore 311 Cases',
    exploreRoute: (id) => `/cases-311?case=${encodeURIComponent(id)}`,
  },
  'parking-revenue': {
    label: 'PARKING METER',
    color: '#d4a435',
    exploreLabel: 'Explore Parking',
    exploreRoute: (id) => `/parking-revenue?meter=${encodeURIComponent(id)}`,
  },
  'police-incidents': {
    label: 'POLICE INCIDENT',
    color: '#963e30',
    exploreLabel: 'Explore Crime',
    exploreRoute: (id) => `/crime-incidents?incident=${encodeURIComponent(id)}`,
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function extractField(raw: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = raw[k]
    if (v != null && v !== '') return String(v)
  }
  return null
}

/** 2-3 compact fields per dataset — values speak, no label clutter. */
function compactFields(event: NormalizedEvent): Array<[string, string]> {
  const { raw, datasetId } = event
  switch (datasetId) {
    case '911-realtime':
    case '911-historical':
      return [
        ['Priority', extractField(raw, 'priority_final', 'original_priority', 'priority') ?? '—'],
        ['Unit', extractField(raw, 'unit_id', 'primary_unit') ?? '—'],
      ]
    case 'fire-ems-dispatch':
      return [
        ['Unit', extractField(raw, 'unit_id') ?? '—'],
        ['Station', extractField(raw, 'station_area') ?? '—'],
      ]
    case '311-cases':
      return [
        ['Status', extractField(raw, 'status_description', 'status') ?? '—'],
        ['Agency', extractField(raw, 'agency_responsible') ?? '—'],
      ]
    case 'parking-revenue':
      return [
        ['Amount', extractField(raw, 'session_paid_amt') ? `$${extractField(raw, 'session_paid_amt')}` : '—'],
        ['Method', extractField(raw, 'payment_type') ?? '—'],
      ]
    case 'police-incidents':
      return [
        ['Subcategory', extractField(raw, 'incident_subcategory') ?? '—'],
        ['Resolution', extractField(raw, 'resolution') ?? '—'],
      ]
    default:
      return []
  }
}

/** Derive the dataset-native ID for the explore link. */
function extractId(event: NormalizedEvent): string {
  const { raw } = event
  return String(
    raw.cad_number ??
    raw.incident_id ??
    raw.service_request_id ??
    raw.post_id ??
    raw.call_number ??
    event.id
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  event: NormalizedEvent
  anchor: { x: number; y: number }   // viewport coords (dot's screen position)
  preferredSide?: 'right' | 'left' | 'top' | 'bottom'
  pinned: boolean                     // true after click; false during hover
  onDismiss: () => void
}

export default function Last48EventHoverBox({
  event,
  anchor,
  preferredSide = 'right',
  pinned,
  onDismiss,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMobile = useMediaQuery('(max-width: 767px)')

  // ------------------------------------------------------------------
  // Esc + outside-click dismissal (pinned state only)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!pinned) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    // Delay by one tick so the click that *pinned* it doesn't immediately
    // re-dismiss from the same event bubbling through.
    let mouseHandler: ((e: MouseEvent) => void) | null = null
    const timeoutId = setTimeout(() => {
      mouseHandler = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) {
          onDismiss()
        }
      }
      document.addEventListener('mousedown', mouseHandler)
    }, 0)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('keydown', onKey)
      if (mouseHandler) document.removeEventListener('mousedown', mouseHandler)
    }
  }, [pinned, onDismiss])

  // ------------------------------------------------------------------
  // Hover exit-timer — allows cursor to traverse the dot→popover gap
  // without dismissing (100ms grace period; cancelled on re-enter)
  // ------------------------------------------------------------------
  const handleMouseEnter = () => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current)
      exitTimerRef.current = null
    }
  }
  const handleMouseLeave = () => {
    if (pinned) return
    exitTimerRef.current = setTimeout(onDismiss, 100)
  }

  // Cleanup exit timer on unmount
  useEffect(() => {
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    }
  }, [])

  // ------------------------------------------------------------------
  // Floating placement (desktop) — re-computed on every render so it
  // updates as the popover's own dimensions change (first paint vs.
  // after content loads). The translate3d approach avoids layout thrash.
  // ------------------------------------------------------------------
  const [placement, setPlacement] = useState<{ x: number; y: number }>({ x: anchor.x, y: anchor.y })

  useEffect(() => {
    // Run after paint so ref.current has its real dimensions
    const id = requestAnimationFrame(() => {
      setPlacement(computePlacement(anchor, ref.current, preferredSide))
    })
    return () => cancelAnimationFrame(id)
  }, [anchor, preferredSide])

  const meta = DATASET_META[event.datasetId]
  const fields = compactFields(event)
  const exploreId = extractId(event)

  // ------------------------------------------------------------------
  // Mobile bottom-sheet variant
  // ------------------------------------------------------------------
  if (isMobile) {
    return (
      <div
        ref={ref}
        role="dialog"
        aria-label={`Event detail: ${event.headline ?? meta.label}`}
        className="fixed inset-x-0 bottom-0 z-30 pointer-events-auto motion-reduce:animate-none"
        style={{
          animation: 'slideUp 200ms cubic-bezier(0.16,1,0.3,1) both',
          // Kraft-paper warm gradient at top
          backgroundImage: 'linear-gradient(180deg, rgba(168,146,106,0.05) 0%, transparent 30%)',
          backgroundColor: 'rgba(30,20,13,0.97)',
          borderTop: '1px solid rgba(217,201,167,0.18)',
          borderRadius: '12px 12px 0 0',
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Notched accent tab — dataset pigment */}
        <span
          aria-hidden
          className="absolute top-0 left-4 h-1 w-14 rounded-b"
          style={{ backgroundColor: meta.color }}
        />

        <div className="px-4 pt-5 pb-2">
          {/* Eyebrow */}
          <div className="flex items-baseline justify-between font-mono text-[9px] tracking-[0.18em] uppercase">
            <span style={{ color: meta.color }}>── {meta.label}</span>
            <span className="text-[#a8926a] tabular-nums">{formatTime(event.receivedAt)}</span>
          </div>

          {/* Headline */}
          <h3 className="font-display italic text-[16px] leading-tight text-[#f5ecd9] mt-2">
            {event.headline ?? 'Event'}
          </h3>

          {/* Location + state */}
          {(event.neighborhood || event.state) && (
            <p className="font-mono text-[10px] text-[#a8926a] mt-1 flex items-center gap-2">
              {event.neighborhood && <span>{event.neighborhood}</span>}
              {event.state && (
                <>
                  {event.neighborhood && <span aria-hidden>·</span>}
                  <span className={event.state === 'open' ? 'text-[#9db87a]' : 'text-[#5e4831]'}>
                    {event.state === 'open' ? 'OPEN' : `CLOSED · ${event.disposition ?? '—'}`}
                  </span>
                </>
              )}
            </p>
          )}

          {/* Fields */}
          {fields.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 font-mono text-[10px] tabular-nums text-[#a8926a]">
              {fields.map(([k, v]) => (
                <li key={k} className="flex justify-between gap-3">
                  <span className="text-[#5e4831] tracking-wide">{k}</span>
                  <span className="text-[#d9c9a7] text-right truncate">{v}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Double-rule footer */}
        <div className="border-t border-[#3a2a1e]/60 mx-4 mt-2" />
        <div className="border-t border-[#3a2a1e]/30 mx-4 mt-px mb-2" />
        <Link
          to={meta.exploreRoute(exploreId)}
          className="block px-4 pb-5 font-mono text-[11px] tracking-wider text-[#d4a435] hover:text-[#e8c06b] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4a435]"
        >
          {meta.exploreLabel} →
        </Link>
      </div>
    )
  }

  // ------------------------------------------------------------------
  // Desktop floating card
  // ------------------------------------------------------------------
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Event detail: ${event.headline ?? meta.label}`}
      className="fixed z-30 pointer-events-auto w-[clamp(240px,22vw,320px)] rounded-md motion-reduce:animate-none"
      style={{
        transform: `translate3d(${placement.x}px,${placement.y}px,0)`,
        // Kraft-paper inner border tone — warm umber wash at top
        backgroundImage: 'linear-gradient(180deg, rgba(168,146,106,0.04) 0%, transparent 28%)',
        backgroundColor: 'rgba(30,20,13,0.96)',
        border: '1px solid rgba(217,201,167,0.18)',
        boxShadow: '0 24px 60px -20px rgba(60,40,20,0.6), 0 8px 24px -12px rgba(0,0,0,0.5)',
        animation: 'fadeSlideIn 180ms cubic-bezier(0.16,1,0.3,1) both',
        color: '#d9c9a7',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Notched accent tab — dataset pigment, top-left edge */}
      <span
        aria-hidden
        className="absolute -top-px left-3 h-1 w-12 rounded-b"
        style={{ backgroundColor: meta.color }}
      />

      <div className="px-4 pt-3 pb-2">
        {/* Eyebrow — ── DATASET LABEL · timestamp */}
        <div className="flex items-baseline justify-between font-mono text-[9px] tracking-[0.18em] uppercase">
          <span style={{ color: meta.color }}>── {meta.label}</span>
          <span className="text-[#a8926a] tabular-nums">{formatTime(event.receivedAt)}</span>
        </div>

        {/* Headline — Fraunces italic, editorial register */}
        <h3 className="font-display italic text-[15px] leading-tight text-[#f5ecd9] mt-1.5">
          {event.headline ?? 'Event'}
        </h3>

        {/* Location + state line */}
        {(event.neighborhood || event.state) && (
          <p className="font-mono text-[10px] text-[#a8926a] mt-1 flex items-center gap-2">
            {event.neighborhood && <span>{event.neighborhood}</span>}
            {event.state && (
              <>
                {event.neighborhood && <span aria-hidden>·</span>}
                <span className={event.state === 'open' ? 'text-[#9db87a]' : 'text-[#5e4831]'}>
                  {event.state === 'open' ? 'OPEN' : `CLOSED · ${event.disposition ?? '—'}`}
                </span>
              </>
            )}
          </p>
        )}

        {/* 2 compact fields — values speak, no label clutter */}
        {fields.length > 0 && (
          <ul className="mt-2.5 flex flex-col gap-0.5 font-mono text-[10px] tabular-nums text-[#a8926a]">
            {fields.map(([k, v]) => (
              <li key={k} className="flex justify-between gap-3">
                <span className="text-[#5e4831] tracking-wide">{k}</span>
                <span className="text-[#d9c9a7] text-right truncate">{v}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Double-rule above footer link — newspaper-style section break */}
      <div className="border-t border-[#3a2a1e]/60 mx-4" />
      <div className="border-t border-[#3a2a1e]/30 mx-4 mt-px mb-2" />

      {/* Footer explore link */}
      <Link
        to={meta.exploreRoute(exploreId)}
        className="block px-4 pb-3 font-mono text-[11px] tracking-wider text-[#d4a435] hover:text-[#e8c06b] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4a435]"
      >
        {meta.exploreLabel} →
      </Link>

      {/* Pin indicator — subtle visual cue that this card is locked */}
      {pinned && (
        <span
          aria-label="Pinned — press Esc to close"
          className="absolute top-2 right-2 font-mono text-[8px] text-[#5e4831] select-none"
        >
          PIN
        </span>
      )}
    </div>
  )
}
