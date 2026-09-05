// The sources tables, GENERATED from the registry + NON_SOCRATA (spec §9).
// Pure and node-testable; About.tsx only renders it.
import { getCity } from '@/cities/registry'
import type { CityId } from '@/cities/routing'
import { nonSocrataFor } from '@/lib/provenance/nonSocrata'
import { portalPageUrl } from '@/lib/provenance/downloads'
import { SOURCE_NOTES } from './sourceNotes'

export interface SourceTableRow {
  anchorId: string
  name: string
  publisher: string
  id: string
  href: string
  dateField?: string
  note?: string
}

export function buildSourceRows(cityId: CityId): SourceTableRow[] {
  const city = getCity(cityId)
  const datasets = Object.values(city.datasets).map((c): SourceTableRow => ({
    anchorId: `source-${cityId}-${c.id}`, name: c.name, publisher: c.publisher.short, id: c.id,
    href: portalPageUrl(city.portal.host, c.id), dateField: c.dateField, note: SOURCE_NOTES[c.id],
  }))
  const statics = nonSocrataFor(cityId).map((s): SourceTableRow => ({
    anchorId: `source-${cityId}-${s.id}`, name: `${s.title} · ${s.vintage}`, publisher: s.publisher.short,
    id: s.socrataId ?? new URL(s.landingUrl).host.replace(/^www\./, ''), href: s.landingUrl, note: SOURCE_NOTES[s.id],
  }))
  return [...datasets, ...statics]
}
