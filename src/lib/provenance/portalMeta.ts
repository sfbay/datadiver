// src/lib/provenance/portalMeta.ts
// Live portal facts (spec §8): one GET per Socrata id when a panel opens.
// Both hosts answer Access-Control-Allow-Origin: *; no token needed.
import { useEffect, useState } from 'react'

export interface PortalMeta {
  title: string
  attribution: string | null
  licenseId: string | null
  licenseName: string | null
  licenseUrl: string | null
  /** ms epoch — the publisher's push time, NOT "data through". */
  rowsUpdatedAt: number | null
}

export function parsePortalMeta(json: unknown): PortalMeta {
  const j = (json ?? {}) as Record<string, unknown>
  const lic = (j.license ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null)
  return {
    title: str(j.name) ?? '',
    attribution: str(j.attribution),
    licenseId: str(j.licenseId),
    licenseName: str(lic.name),
    licenseUrl: str(lic.termsLink),
    rowsUpdatedAt: typeof j.rowsUpdatedAt === 'number' ? j.rowsUpdatedAt * 1000 : null,
  }
}

const cache = new Map<string, Promise<PortalMeta>>()

export function fetchPortalMeta(host: string, id: string, opts: { timeoutMs?: number } = {}): Promise<PortalMeta> {
  const key = `${host}/${id}`
  const hit = cache.get(key)
  if (hit) return hit
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 6_000)
  const p = fetch(`https://${host}/api/views/${id}.json`, { signal: controller.signal })
    .then((r) => { if (!r.ok) throw new Error(`portal metadata ${r.status}`); return r.json() })
    .then(parsePortalMeta)
    .finally(() => clearTimeout(timer))
  p.catch(() => cache.delete(key))
  cache.set(key, p)
  return p
}

export function usePortalMeta(host: string | undefined, id: string | undefined, enabled: boolean): { meta: PortalMeta | null; failed: boolean } {
  const [state, setState] = useState<{ meta: PortalMeta | null; failed: boolean }>({ meta: null, failed: false })
  useEffect(() => {
    if (!enabled || !host || !id) return
    let cancelled = false
    fetchPortalMeta(host, id)
      .then((meta) => { if (!cancelled) setState({ meta, failed: false }) })
      .catch(() => { if (!cancelled) setState({ meta: null, failed: true }) })
    return () => { cancelled = true }
  }, [host, id, enabled])
  return state
}
