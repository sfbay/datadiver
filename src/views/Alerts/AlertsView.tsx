// src/views/Alerts/AlertsView.tsx
import { useState } from 'react'
import type { DatasetId } from '@/types/last48'
import type { AlertLocation, SubscriptionDraft } from '@/lib/alerts/types'

const STREAM_OPTIONS: { id: DatasetId; label: string }[] = [
  { id: '911-realtime', label: '911 calls' },
  { id: 'fire-ems-dispatch', label: 'Fire & EMS' },
  { id: '311-cases', label: '311 reports' },
]
const CATEGORY_OPTIONS: { key: string; label: string }[] = [
  { key: 'shooting', label: 'Shootings' },
  { key: 'stabbing', label: 'Stabbings' },
  { key: 'homicide', label: 'Homicides' },
  { key: 'robbery', label: 'Robberies' },
  { key: 'weapon', label: 'Weapons calls' },
  { key: 'assault', label: 'Assaults' },
  { key: 'fire', label: 'Fires' },
]
const RADII = [0.25, 0.5, 1, 2]

export default function AlertsView() {
  const [email, setEmail] = useState('')
  const [streams, setStreams] = useState<DatasetId[]>(['911-realtime'])
  const [categories, setCategories] = useState<string[]>([])
  const [radiusMiles, setRadiusMiles] = useState(0.5)
  const [locations, setLocations] = useState<AlertLocation[]>([])
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const toggle = <T,>(arr: T[], v: T): T[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  async function submit() {
    setErrorMsg('')
    if (!email.trim()) return setErrorMsg('Enter your email.')
    if (streams.length === 0) return setErrorMsg('Pick at least one stream.')
    if (locations.length === 0) return setErrorMsg('Add at least one location.')
    setStatus('sending')
    const draft: SubscriptionDraft = {
      email: email.trim(),
      cadence: 'daily',
      filters: { streams, categories },
      radiusMiles,
      locations,
    }
    try {
      const res = await fetch('/api/alerts/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || 'Something went wrong.')
      }
      setStatus('sent')
    } catch (e) {
      setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }

  if (status === 'sent') {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-terracotta-500">The Last 48</div>
        <h1 className="font-display mt-2 text-3xl">Check your email</h1>
        <p className="mt-3 text-ink/70">We sent a confirmation link to <strong>{email}</strong>. Click it to activate your daily alerts.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="font-mono text-xs uppercase tracking-[0.18em] text-terracotta-500">The Last 48</div>
      <h1 className="font-display mt-2 text-3xl">Get alerts near you</h1>
      <p className="mt-2 text-ink/70">A daily email when matching events happen near places you choose. Quiet days send nothing.</p>

      <section className="mt-8">
        <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-ink/60">Streams</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {STREAM_OPTIONS.map((s) => (
            <button key={s.id} type="button" onClick={() => setStreams((a) => toggle(a, s.id))}
              className={`rounded-full border px-3 py-1.5 text-sm ${streams.includes(s.id) ? 'border-terracotta-500 bg-terracotta-500/15 text-ink' : 'border-ink/20 text-ink/70'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-ink/60">Only these kinds (optional)</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((c) => (
            <button key={c.key} type="button" onClick={() => setCategories((a) => toggle(a, c.key))}
              className={`rounded-full border px-3 py-1.5 text-sm ${categories.includes(c.key) ? 'border-brick-500 bg-brick-500/15 text-ink' : 'border-ink/20 text-ink/70'}`}>
              {c.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink/50">Leave empty to get every event on the chosen streams. (Significance filters apply to 911 and Fire & EMS, not 311.)</p>
      </section>

      <section className="mt-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-ink/60">Radius</h2>
        <div className="mt-2 flex gap-2">
          {RADII.map((r) => (
            <button key={r} type="button" onClick={() => setRadiusMiles(r)}
              className={`rounded-md border px-3 py-1.5 text-sm ${radiusMiles === r ? 'border-teal-500 bg-teal-500/15 text-ink' : 'border-ink/20 text-ink/70'}`}>
              {r === 0.25 ? '¼' : r === 0.5 ? '½' : r} mi
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-ink/60">Locations</h2>
        {locations.length === 0 && <p className="mt-1 text-sm text-ink/50">Add a location below. (Map picker added next.)</p>}
        <ul className="mt-2 space-y-1">
          {locations.map((l, i) => (
            <li key={i} className="flex items-center justify-between rounded-md bg-paper-100 dark:bg-espresso-800 px-3 py-2 text-sm">
              <span>{l.label || `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`}</span>
              <button type="button" onClick={() => setLocations((a) => a.filter((_, j) => j !== i))} className="text-ink/50 hover:text-brick-500">Remove</button>
            </li>
          ))}
        </ul>
        <ManualLocationAdd onAdd={(loc) => setLocations((a) => [...a, loc])} />
      </section>

      <section className="mt-8">
        <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-ink/60">Your email</h2>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
          className="mt-2 w-full rounded-md border border-ink/20 bg-paper px-3 py-2 text-ink" />
      </section>

      {errorMsg && <p className="mt-4 text-sm text-brick-500">{errorMsg}</p>}

      <button type="button" onClick={submit} disabled={status === 'sending'}
        className="btn-primary mt-6 rounded-md px-5 py-2.5 disabled:opacity-50">
        {status === 'sending' ? 'Sending…' : 'Subscribe'}
      </button>
      <p className="mt-3 text-xs text-ink/50">Double opt-in: we email you a confirmation link first. Unsubscribe anytime in one click.</p>
    </div>
  )
}

function ManualLocationAdd({ onAdd }: { onAdd: (l: AlertLocation) => void }) {
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [label, setLabel] = useState('')
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Home)" className="rounded-md border border-ink/20 bg-paper px-2 py-1.5 text-sm" />
      <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="lat" className="w-24 rounded-md border border-ink/20 bg-paper px-2 py-1.5 text-sm" />
      <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="lng" className="w-24 rounded-md border border-ink/20 bg-paper px-2 py-1.5 text-sm" />
      <button type="button" onClick={() => {
        const la = Number(lat), ln = Number(lng)
        if (Number.isFinite(la) && Number.isFinite(ln)) { onAdd({ label: label || undefined, lat: la, lng: ln }); setLat(''); setLng(''); setLabel('') }
      }} className="rounded-md border border-ink/20 px-3 py-1.5 text-sm">Add</button>
    </div>
  )
}
