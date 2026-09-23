// src/views/Last48/photoreal/immersive/useAddressSearch.ts
//
// Debounced Mapbox forward search for the navigator (addressSearch.ts has
// the terms). One request per settled query of ADDRESS_MIN_CHARS or more;
// the previous request is aborted when the query changes. No cache — a
// temporary geocode must not be stored (§2.7.2).
import { useEffect, useState } from 'react'
import { ADDRESS_MIN_CHARS, addressHits, addressSearchUrl, type AddressHit } from './addressSearch'

const DEBOUNCE_MS = 300

export function useAddressSearch(query: string): { hits: AddressHit[]; searching: boolean } {
  const [hits, setHits] = useState<AddressHit[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const q = query.trim()
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
    if (q.length < ADDRESS_MIN_CHARS || !token) { setHits([]); setSearching(false); return }
    setSearching(true)
    const ac = new AbortController()
    const id = setTimeout(() => {
      fetch(addressSearchUrl(q, token), { signal: ac.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (!ac.signal.aborted) { setHits(addressHits(j)); setSearching(false) } })
        .catch(() => { if (!ac.signal.aborted) { setHits([]); setSearching(false) } })
    }, DEBOUNCE_MS)
    return () => { clearTimeout(id); ac.abort() }
  }, [query])

  return { hits, searching }
}
