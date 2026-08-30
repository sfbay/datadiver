// Funder card fetch layer (spec §3.2). Fires the five profile builders in
// parallel, waits for all of them (Promise.allSettled — one slow/failed
// builder never blocks the others), and hands the raw sections + the built
// FunderProfile to the card. A generation counter drops any response that
// arrives after the key/zip has since moved on (the same pattern as
// useCampaignDetail's abortRef). Per-section retry re-fires one builder
// without touching the other four's already-loaded data.
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

type SectionKey = keyof FunderSections

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
  isLoading: boolean
  retry: (section: SectionKey) => void
} {
  const [profile, setProfile] = useState<FunderProfile | null>(null)
  const [sections, setSections] = useState<FunderSections>(EMPTY_SECTIONS)
  const [failed, setFailed] = useState<SectionKey[]>([])
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
      setIsLoading(false)
      return
    }

    sectionsRef.current = EMPTY_SECTIONS
    setProfile(null)
    setSections(EMPTY_SECTIONS)
    setFailed([])
    setIsLoading(true)

    const { first, last } = parsed
    const fz = fzip ?? undefined

    const variantsSpec = builders.variants(first, last, fz)
    const byYearSpec = builders.byYear(first, last, fz)
    const recipientsSpec = builders.recipients(first, last, fz)
    const giftsSpec = builders.gifts(first, last, fz)
    const noticesSpec = builders.notices(first, last, fz)

    Promise.allSettled([
      fetchDataset<VariantRow>(variantsSpec.datasetKey, variantsSpec.params, PROFILE_FETCH_OPTS),
      fetchDataset<YearRow>(byYearSpec.datasetKey, byYearSpec.params, PROFILE_FETCH_OPTS),
      fetchDataset<RecipientRow>(recipientsSpec.datasetKey, recipientsSpec.params, PROFILE_FETCH_OPTS),
      fetchDataset<GiftRow>(giftsSpec.datasetKey, giftsSpec.params, PROFILE_FETCH_OPTS),
      fetchDataset<GiftRow>(noticesSpec.datasetKey, noticesSpec.params, PROFILE_FETCH_OPTS),
    ]).then((results) => {
      if (generation !== generationRef.current) return

      const nextSections: FunderSections = { ...EMPTY_SECTIONS }
      const nextFailed: SectionKey[] = []
      results.forEach((result, i) => {
        const section = SECTION_ORDER[i]
        if (result.status === 'fulfilled') {
          // Each result array's element type lines up with its section — same
          // fixed order as the Promise.allSettled call above.
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

    // Same cast-to-indexable pattern as the forEach above: `section` is a
    // union of literal keys, so a plain computed-property write isn't
    // something TS can verify per-key — the cast is the documented escape
    // hatch, safe here because every field shares the `X[] | null` shape.
    const cleared: FunderSections = { ...sectionsRef.current }
    ;(cleared as Record<SectionKey, unknown>)[section] = null
    sectionsRef.current = cleared
    setSections(cleared)
    setFailed((prev) => prev.filter((s) => s !== section))

    const spec = builders[section](first, last, fz)
    fetchDataset<VariantRow | YearRow | RecipientRow | GiftRow>(spec.datasetKey, spec.params, PROFILE_FETCH_OPTS)
      .then((rows) => {
        if (generation !== generationRef.current) return
        const next: FunderSections = { ...sectionsRef.current }
        ;(next as Record<SectionKey, unknown>)[section] = rows
        sectionsRef.current = next
        setSections(next)
        setProfile(rebuild(parsed.key, next))
      })
      .catch(() => {
        if (generation !== generationRef.current) return
        setFailed((prev) => (prev.includes(section) ? prev : [...prev, section]))
      })
  }

  return { profile, sections, failed, isLoading, retry }
}
