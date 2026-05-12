// src/views/Last48/detail/Last48EventPeek.tsx
//
// Compact "quick peek" detail panel for FLOW events. Dataset-adaptive
// body — picks the right fields for each dataset. Footer links to the
// dedicated dataset view with the event preselected via query param.

import { Link } from 'react-router-dom'
import type { NormalizedEvent, DatasetId } from '@/types/last48'

const DATASET_META: Record<DatasetId, { label: string; color: string; exploreLabel: string; exploreRoute: (id: string) => string; exploreCaption: string }> = {
  '911-realtime': {
    label: '911 DISPATCH (REALTIME)',
    color: '#616a96',
    exploreLabel: 'Explore 911 Dispatch',
    exploreRoute: (id) => `/dispatch-911?incident=${encodeURIComponent(id)}`,
    exploreCaption: 'See all 911 dispatches this period, filter by call type, drill into patterns.',
  },
  '911-historical': {
    label: '911 DISPATCH',
    color: '#5c9693',
    exploreLabel: 'Explore 911 Dispatch',
    exploreRoute: (id) => `/dispatch-911?incident=${encodeURIComponent(id)}`,
    exploreCaption: 'See all 911 dispatches this period, filter by call type, drill into patterns.',
  },
  'fire-ems-dispatch': {
    label: 'FIRE/EMS DISPATCH',
    color: '#b85a33',
    exploreLabel: 'Explore Fire/EMS Dispatch',
    exploreRoute: (id) => `/emergency-response?incident=${encodeURIComponent(id)}`,
    exploreCaption: 'Response times by neighborhood, equity gaps, slow-call analysis.',
  },
  '311-cases': {
    label: '311 CASE',
    color: '#d47149',
    exploreLabel: 'Explore 311 Cases',
    exploreRoute: (id) => `/cases-311?case=${encodeURIComponent(id)}`,
    exploreCaption: 'See all 311 service requests, filter by type and neighborhood.',
  },
  'parking-revenue': {
    label: 'PARKING METER',
    color: '#d4a435',
    exploreLabel: 'Explore Parking Revenue',
    exploreRoute: (id) => `/parking-revenue?meter=${encodeURIComponent(id)}`,
    exploreCaption: 'Revenue by meter, payment methods, neighborhood patterns.',
  },
  'police-incidents': {
    label: 'POLICE INCIDENT',
    color: '#963e30',
    exploreLabel: 'Explore Crime Incidents',
    exploreRoute: (id) => `/crime-incidents?incident=${encodeURIComponent(id)}`,
    exploreCaption: 'Incident reports, categories, resolution outcomes.',
  },
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
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

interface Props {
  event: NormalizedEvent
  onClose: () => void
}

export default function Last48EventPeek({ event, onClose }: Props) {
  const meta = DATASET_META[event.datasetId]

  // Dataset-specific field extraction for the body
  let fields: Array<[string, string]> = []
  switch (event.datasetId) {
    case '911-realtime':
    case '911-historical':
      fields = [
        ['Disposition', extractField(event.raw, 'disposition', 'call_disposition') ?? '—'],
        ['Priority', extractField(event.raw, 'priority_final', 'original_priority', 'priority') ?? '—'],
        ['Unit', extractField(event.raw, 'unit_id', 'primary_unit') ?? '—'],
      ]
      break
    case 'fire-ems-dispatch':
      fields = [
        ['Unit', extractField(event.raw, 'unit_id') ?? '—'],
        ['Station', extractField(event.raw, 'station_area') ?? '—'],
        ['Battalion', extractField(event.raw, 'battalion') ?? '—'],
      ]
      break
    case '311-cases':
      fields = [
        ['Status', extractField(event.raw, 'status_description', 'status') ?? '—'],
        ['Source', extractField(event.raw, 'source') ?? '—'],
        ['Agency', extractField(event.raw, 'agency_responsible') ?? '—'],
      ]
      break
    case 'parking-revenue':
      fields = [
        ['Amount', extractField(event.raw, 'session_paid_amt') ? `$${extractField(event.raw, 'session_paid_amt')}` : '—'],
        ['Method', extractField(event.raw, 'payment_type') ?? '—'],
        ['Duration (sec)', extractField(event.raw, 'session_length_sec') ?? '—'],
      ]
      break
    case 'police-incidents':
      fields = [
        ['Subcategory', extractField(event.raw, 'incident_subcategory') ?? '—'],
        ['Resolution', extractField(event.raw, 'resolution') ?? '—'],
        ['Report type', extractField(event.raw, 'report_type_description') ?? '—'],
      ]
      break
  }

  const exploreId = String(event.raw.cad_number ?? event.raw.incident_id ?? event.raw.service_request_id ?? event.raw.post_id ?? event.raw.call_number ?? event.id)

  return (
    <aside className="absolute top-0 right-0 w-[clamp(280px,28vw,400px)] h-full bg-paper-50 dark:bg-espresso-900 border-l border-paper-300 dark:border-espresso-700 z-30 flex flex-col">
      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        className="self-end p-3 text-paper-500 hover:text-paper-300 text-lg leading-none"
        aria-label="Close panel"
      >
        ✕
      </button>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-3">
        {/* Eyebrow */}
        <div className="flex items-center justify-between font-mono text-[10px] tracking-widest text-paper-600 dark:text-paper-500">
          <span style={{ color: meta.color }}>── {meta.label}</span>
          <span>{formatTime(event.receivedAt)}</span>
        </div>

        {/* Headline */}
        <h2 className="font-display text-lg text-ink dark:text-white leading-tight">
          {event.headline ?? meta.label}
        </h2>

        {/* Location */}
        {event.neighborhood && (
          <p className="font-mono text-[11px] text-paper-700 dark:text-paper-400">
            {event.neighborhood}
          </p>
        )}

        {/* Fields */}
        <dl className="mt-2 flex flex-col gap-2 font-mono text-[11px]">
          {fields.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-paper-200/40 dark:border-espresso-800 pb-1">
              <dt className="text-paper-500 dark:text-paper-600 tracking-wider uppercase text-[9px]">{k}</dt>
              <dd className="text-paper-800 dark:text-paper-300 text-right">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Footer link */}
      <div className="border-t border-paper-200/40 dark:border-espresso-700 px-5 py-4 bg-paper-100/60 dark:bg-espresso-950/60">
        <Link
          to={meta.exploreRoute(exploreId)}
          className="block font-mono text-[12px] text-ochre-700 dark:text-ochre-400 hover:text-ochre-500 dark:hover:text-ochre-300 tracking-wider"
        >
          {meta.exploreLabel} →
        </Link>
        <p className="text-[10px] text-paper-500 dark:text-paper-600 mt-1 italic leading-snug">
          {meta.exploreCaption}
        </p>
      </div>
    </aside>
  )
}
