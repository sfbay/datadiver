// Funder card fetch layer (spec §3.2). Fires the five profile builders in
// parallel, waits for all of them (Promise.allSettled — one slow/failed
// builder never blocks the others), and hands the raw sections + the built
// FunderProfile to the card. A generation counter drops any response that
// arrives after the key/zip has since moved on (the same pattern as
// useCampaignDetail's abortRef). Per-section retry re-fires one builder
// without touching the other four's already-loaded data.
//
// retry() keeps the section in `failed` (and exposes it in `retrying`) until
// the re-fetch actually settles. `profile` is a build over `sections`, and
// clearing a slot to null OR clearing `failed` optimistically before the new
// data lands both make the stale (already-failed → zeroed) build render as if
// it had loaded — the empty-list/zero-total cards for that section reappear
// for the ~15s the retry is in flight. `retrying` lets the card word the
// failure line as "retrying…" and disable its own retry button instead.
import { useEffect, useRef, useState } from 'react'
import { fetchDataset } from '@/api/client'
import { parseFunderParam } from '@/lib/funders/funderKey'
import { buildFunderProfile } from '@/lib/funders/funderStats'
import type { VariantRow, YearRow, RecipientRow, GiftRow, FunderProfile } from '@/lib/funders/types'
import type { FunderBuilders } from '@/views/CampaignFinance/fppcDialect'

export interface FunderSections {
  variants: VariantRow[] | null
  byYear: YearRow[] | null
  recipients: RecipientRow[] | null
  gifts: GiftRow[] | null
  notices: GiftRow[] | null
}

export type SectionKey = keyof FunderSections

const EMPTY_SECTIONS: FunderSections = {
  variants: null,
  byYear: null,
  recipients: null,
  gifts: null,
  notices: null,
}

// Fixed order the five builders fire in — mirrors Promise.allSettled's result array.
const SECTION_ORDER: SectionKey[] = ['variants', 'byYear', 'recipients', 'gifts', 'notices']

const PROFILE_FETCH_OPTS = { cityId: 'sf' as const, timeoutMs: 15_000, retries: 1 }

function rebuild(key: string, sections: FunderSections): FunderProfile {
  return buildFunderProfile({
    key,
    variants: sections.variants,
    byYear: sections.byYear,
    recipients: sections.recipients,
    gifts: sections.gifts,
    notices: sections.notices,
    currentYear: new Date().getFullYear(),
  })
}

export function useFunderProfile(
  key: string | null,
  fzip: string | null,
  builders: FunderBuilders | null
): {
  profile: FunderProfile | null
  sections: FunderSections
  failed: SectionKey[]
  /** Sections currently re-fetching via retry() — still present in `failed`
   *  (I1: a section only leaves `failed` once its re-fetch actually settles). */
  retrying: SectionKey[]
  isLoading: boolean
  retry: (section: SectionKey) => void
} {
  const [profile, setProfile] = useState<FunderProfile | null>(null)
  const [sections, setSections] = useState<FunderSections>(EMPTY_SECTIONS)
  const [failed, setFailed] = useState<SectionKey[]>([])
  const [retrying, setRetrying] = useState<SectionKey[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const generationRef = useRef(0)
  // Mirrors `sections` synchronously so retry() can read the latest merged
  // state without relying on stale closures or reaching into a setState updater.
  const sectionsRef = useRef<FunderSections>(EMPTY_SECTIONS)

  const parsed = key ? parseFunderParam(key) : null

  useEffect(() => {
    const generation = ++generationRef.current
    // Re-derive from the raw `key` prop rather than closing over the outer
    // `parsed` — that variable is a fresh object every render and including
    // it in the dependency array below would re-fire the effect every render.
    const parsed = key ? parseFunderParam(key) : null

    if (!parsed || !builders) {
      sectionsRef.current = EMPTY_SECTIONS
      setProfile(null)
      setSections(EMPTY_SECTIONS)
      setFailed([])
      setRetrying([])
      setIsLoading(false)
      return
    }

    sectionsRef.current = EMPTY_SECTIONS
    setProfile(null)
    setSections(EMPTY_SECTIONS)
    setFailed([])
    setRetrying([])
    setIsLoading(true)

    const { first, last } = parsed
    const fz = fzip ?? undefined

    // One tuple per section — [key, in-flight fetch] — instead of five
    // separately-named spec variables lined up against a parallel
    // Promise.allSettled array; the two lists can't drift out of order
    // because there's only ever one list.
    const fetches = SECTION_ORDER.map((section) => {
      const spec = builders[section](first, last, fz)
      return [
        section,
        fetchDataset<VariantRow | YearRow | RecipientRow | GiftRow>(spec.datasetKey, spec.params, PROFILE_FETCH_OPTS),
      ] as const
    })

    Promise.allSettled(fetches.map(([, p]) => p)).then((results) => {
      if (generation !== generationRef.current) return

      const nextSections: FunderSections = { ...EMPTY_SECTIONS }
      const nextFailed: SectionKey[] = []
      results.forEach((result, i) => {
        const [section] = fetches[i]!
        if (result.status === 'fulfilled') {
          // Each result array's element type lines up with its section — same
          // fixed order as the `fetches` tuple list above.
          ;(nextSections as Record<SectionKey, unknown>)[section] = result.value
        } else {
          nextFailed.push(section)
        }
      })

      sectionsRef.current = nextSections
      setSections(nextSections)
      setFailed(nextFailed)
      setProfile(rebuild(parsed.key, nextSections))
      setIsLoading(false)
    })
  }, [key, fzip, builders])

  function retry(section: SectionKey) {
    if (!parsed || !builders) return
    const generation = generationRef.current
    const { first, last } = parsed
    const fz = fzip ?? undefined

    // `section` stays in `failed` for the whole retry — only `retrying` gains
    // it here. Clearing `failed` (or the section's data) optimistically was
    // the bug (I1): the card would read "loaded" off a profile still built
    // from the pre-retry (failed → zeroed) sections until the fetch settled.
    setRetrying((prev) => (prev.includes(section) ? prev : [...prev, section]))

    const spec = builders[section](first, last, fz)
    fetchDataset<VariantRow | YearRow | RecipientRow | GiftRow>(spec.datasetKey, spec.params, PROFILE_FETCH_OPTS)
      .then((rows) => {
        if (generation !== generationRef.current) return
        const next: FunderSections = { ...sectionsRef.current }
        ;(next as Record<SectionKey, unknown>)[section] = rows
        sectionsRef.current = next
        setSections(next)
        setFailed((prev) => prev.filter((s) => s !== section))
        setRetrying((prev) => prev.filter((s) => s !== section))
        setProfile(rebuild(parsed.key, next))
      })
      .catch(() => {
        if (generation !== generationRef.current) return
        setRetrying((prev) => prev.filter((s) => s !== section))
        // section was never removed from `failed` — nothing to re-add.
      })
  }

  return { profile, sections, failed, retrying, isLoading, retry }
}
