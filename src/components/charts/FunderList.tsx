// A ranked list of who funded a committee. Each row shows the funder's full
// name and city, a mini bar, and an amount; a turn-down chevron opens ONE
// muted line of detail (occupation, employer, ZIP, gift count, date span).
// Click, not hover — hover detail is dead on phones (house rule). An
// "expand all" toggle lives in the section header.
import { useState } from 'react'
import { toSentenceCase } from '@/utils/format'
import { formatCurrency } from './TopRecipientsChart'
import { funderKey as computeFunderKey } from '@/lib/funders/funderKey'
import type { CampaignDonorRow } from '@/types/datasets'

export interface Funder {
  key: string
  /** Display name — a person's full name, or a committee/business name. */
  name: string
  /** Second line, muted: "San Francisco" · "IE" — omitted when unknown. */
  place?: string
  /** Tiny chip after the name: "committee" · "business" · "IE". */
  chip?: string
  amount: number
  /** One-line detail behind the turn-down; rows without it render no chevron. */
  detail?: string
  /** The funder card's identity key (funderKey.ts) — present only for rows
   *  built from a real donor row (funderFromDonorRow); IE-only rows have no
   *  funderKey and their name stays a plain span even when onOpenFunder is
   *  passed (spec §4 "Entry points"). */
  funderKey?: string
}

const ENTITY_CHIP: Record<string, string> = {
  COM: 'committee', OTH: 'business', PTY: 'party', SCC: 'small-donor committee', RCP: 'recipient committee',
}

const AP_MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.']
export function apDay(ymd: string | undefined): string | null {
  if (!ymd) return null
  const [, m, d] = ymd.slice(0, 10).split('-').map(Number)
  return m && d ? `${AP_MONTHS[m - 1]} ${d}` : null
}

/** Build a display Funder from one grouped donor row (SF or Oakland dialect shape). */
export function funderFromDonorRow(d: CampaignDonorRow, i: number): Funder {
  const first = d.transaction_first_name?.trim()
  const last = d.transaction_last_name?.trim() ?? ''
  const isPerson = !d.entity_code || d.entity_code === 'IND'
  const name = toSentenceCase(isPerson && first ? `${first} ${last}` : last) || 'Unnamed'
  const city = d.transaction_city ? toSentenceCase(d.transaction_city.trim()) : undefined
  const state = d.transaction_state?.trim().toUpperCase()
  const place = city ? (state && state !== 'CA' ? `${city}, ${state}` : city) : undefined

  const parts: string[] = []
  const occ = d.occupation?.trim()
  const emp = d.employer?.trim()
  if (isPerson && (occ || emp)) {
    const job = [occ && toSentenceCase(occ), emp && toSentenceCase(emp)].filter(Boolean).join(', ')
    parts.push(job)
  }
  if (d.transaction_zip) parts.push(d.transaction_zip.slice(0, 5))
  const gifts = Number(d.gifts)
  if (gifts > 0) parts.push(`${gifts} gift${gifts === 1 ? '' : 's'}`)
  const a = apDay(d.first_date), b = apDay(d.last_date)
  if (a && b) parts.push(a === b ? a : `${a}–${b}`)

  return {
    key: `${d.transaction_first_name ?? ''}|${last}|${d.transaction_zip ?? ''}|${i}`,
    name,
    place,
    chip: isPerson ? undefined : ENTITY_CHIP[d.entity_code ?? ''] ?? d.entity_code?.toLowerCase(),
    amount: parseFloat(d.total) || 0,
    detail: parts.length ? parts.join(' · ') : undefined,
    funderKey: computeFunderKey(d),
  }
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="w-full h-3 bg-slate-200/50 dark:bg-slate-800/50 rounded-sm overflow-hidden">
      <div className="h-full rounded-sm" style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }} />
    </div>
  )
}

export default function FunderList({ label, funders, max, color, emptyText, onOpenFunder }: {
  label: string
  funders: Funder[]
  /** Bar scale; defaults to the largest amount in this list. */
  max?: number
  color: string
  emptyText?: string
  /** Opens the funder card for a clicked row (spec §4 "Entry points"). Only
   *  rows carrying a `funderKey` (real donor rows, not IE-only rows) render
   *  their name as a button — SF only; Oakland callers omit this prop. */
  onOpenFunder?: (key: string) => void
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const expandable = funders.filter((f) => f.detail)
  const allOpen = expandable.length > 0 && expandable.every((f) => open.has(f.key))
  const scale = max ?? Math.max(1, ...funders.map((f) => f.amount))

  const toggle = (key: string) =>
    setOpen((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  const toggleAll = () => setOpen(allOpen ? new Set() : new Set(expandable.map((f) => f.key)))

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2 mt-4">
        <p className="text-nano font-mono uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">{label}</p>
        {expandable.length > 1 && (
          <button type="button" onClick={toggleAll} className="text-nano font-mono uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            {allOpen ? 'collapse all' : 'expand all'}
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {funders.map((f) => {
          const isOpen = open.has(f.key)
          return (
            <div key={f.key}>
              <div className="flex justify-between items-baseline gap-2 text-micro mb-0.5">
                <span className="min-w-0 flex items-baseline gap-1.5">
                  {f.detail ? (
                    <button type="button" aria-expanded={isOpen} onClick={() => toggle(f.key)}
                      className="shrink-0 w-[0.875rem] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-mono leading-none"
                      aria-label={isOpen ? `Hide details for ${f.name}` : `Show details for ${f.name}`}>
                      {isOpen ? '▾' : '▸'}
                    </button>
                  ) : (
                    <span className="shrink-0 w-[0.875rem]" aria-hidden />
                  )}
                  {onOpenFunder && f.funderKey ? (
                    <button
                      type="button"
                      onClick={() => onOpenFunder(f.funderKey!)}
                      className="truncate text-left text-slate-600 dark:text-slate-300 hover:text-plum-500 dark:hover:text-plum-400 transition-colors"
                    >
                      {f.name}
                    </button>
                  ) : (
                    <span className="truncate text-slate-600 dark:text-slate-300">{f.name}</span>
                  )}
                  {f.chip && <span className="shrink-0 px-1 rounded text-nano font-mono uppercase tracking-widest bg-slate-200/60 dark:bg-white/[0.06] text-slate-500">{f.chip}</span>}
                  {f.place && <span className="shrink-0 text-slate-400 dark:text-slate-500">· {f.place}</span>}
                </span>
                <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0">{formatCurrency(f.amount)}</span>
              </div>
              <MiniBar value={f.amount} max={scale} color={color} />
              {isOpen && f.detail && (
                <p className="mt-0.5 pl-[1.25rem] text-nano font-mono text-slate-500 dark:text-slate-400 leading-snug">{f.detail}</p>
              )}
            </div>
          )
        })}
        {funders.length === 0 && emptyText && (
          <p className="text-micro text-slate-400 dark:text-slate-500 italic">{emptyText}</p>
        )}
      </div>
    </div>
  )
}
