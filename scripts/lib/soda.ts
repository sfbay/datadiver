// scripts/lib/soda.ts
// Paged Socrata reader for generators. Same retry shape as
// scripts/build-storefronts.ts (which keeps its own copy; not refactored here).
const HOST = 'https://data.sf.gov'
const APP_TOKEN = process.env.VITE_SOCRATA_APP_TOKEN
const PAGE = 50_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function sodaOnce<T>(dataset: string, params: Record<string, string>, label: string): Promise<T[]> {
  const url = new URL(`${HOST}/resource/${dataset}.json`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (APP_TOKEN) headers['X-App-Token'] = APP_TOKEN
  const attempts = 4
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await sleep(attempt ? 2_000 * attempt : 150)
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(240_000) })
      if (res.ok) return (await res.json()) as T[]
      const body = await res.text().catch(() => '')
      if (!(res.status === 429 || res.status >= 500) || attempt === attempts - 1) {
        throw new Error(`SODA ${dataset} [${label}] ${res.status}: ${body.slice(0, 400)}`)
      }
    } catch (err) {
      const e = err as Error
      if (e.message.startsWith('SODA ') || attempt === attempts - 1) throw e
    }
  }
  throw new Error(`unreachable: ${label}`)
}

/** `$order` is required: offset paging without a total order drops and repeats rows. */
export async function sodaAll<T>(dataset: string, params: Record<string, string>, label: string): Promise<T[]> {
  if (!params.$order) throw new Error(`${label}: paging needs $order`)
  const out: T[] = []
  for (let offset = 0; ; offset += PAGE) {
    const rows = await sodaOnce<T>(dataset, { ...params, $limit: String(PAGE), $offset: String(offset) }, `${label} @${offset}`)
    out.push(...rows)
    console.log(`  ${label}: ${out.length.toLocaleString()} rows`)
    if (rows.length < PAGE) return out
  }
}

export async function sodaCount(dataset: string, where?: string): Promise<number> {
  const params: Record<string, string> = { $select: 'count(*) AS n' }
  if (where) params.$where = where
  const rows = await sodaOnce<{ n: string }>(dataset, params, `${dataset} count`)
  return Number(rows[0]?.n ?? 0)
}
