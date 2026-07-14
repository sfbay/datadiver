#!/usr/bin/env node
/**
 * Fetch certified SF election source files.
 *
 * SF Dept of Elections publishes results in a `w`-suffixed archive
 * (/results/<dateCode>w/detail.html — or detail.php for older elections) that
 * the older summary.xml pipeline never touched. That page lists, per
 * certification drop:
 *
 *   sov.xlsx   Statement of the Vote            — per PRECINCT, per candidate
 *   dsov.xlsx  District & Neighborhood SOV      — per NEIGHBORHOOD, per candidate
 *
 * A `p` prefix (psov/dpsov) marks a PRELIMINARY daily drop. The unprefixed
 * files are the certified final — those are the only ones we ingest. 2020 names
 * its finals with a date prefix (20201201_dsov.xlsx), so match on the suffix.
 *
 * Precinct geometry is era-scoped: SF renumbered precincts in the 2022
 * redistricting, so a 2020 precinct id is NOT the same geography as the 2025
 * precinct with that id. Each election is pinned to the boundary vintage that
 * was in force when it was held. See docs/data-insights.md.
 *
 * Network-only. Writes to data/elections-src/ (gitignored — regenerate at will).
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const OUT = 'data/elections-src'

/** Precinct boundary vintages. `from`/`to` are inclusive dateCode bounds. */
export const PRECINCT_ERAS = [
  {
    id: 'prec_2012',
    label: 'Election Precincts — Historical, Defined 2012',
    socrata: 'bsfq-aeyw',
    idField: 'prec_2012',
    // The 2012 file carries only the legacy 26-name scheme.
    neighborhoodField: 'neighrep',
    scheme: 'legacy26',
    from: '20120101',
    to: '20220930',
  },
  {
    id: 'prec_2022',
    label: 'Election Precincts — Current, Defined 2022',
    socrata: 'd6x4-hefw',
    idField: 'prec_2022',
    // The 2022 file carries the modern 41 Analysis Neighborhood names.
    neighborhoodField: 'neigh22',
    scheme: 'analysis41',
    from: '20221001',
    to: '99999999',
  },
]

export function eraFor(dateCode) {
  const era = PRECINCT_ERAS.find((e) => dateCode >= e.from && dateCode <= e.to)
  if (!era) throw new Error(`No precinct era covers ${dateCode}`)
  return era
}

const ELECTIONS = [
  '20201103',
  '20220607',
  '20221108',
  '20240305',
  '20241105',
  '20251104',
]

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.text()
}

async function download(url, dest) {
  if (existsSync(dest)) return { dest, cached: true }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  await writeFile(dest, Buffer.from(await res.arrayBuffer()))
  return { dest, cached: false }
}

/**
 * Scrape the `w` archive for an election's certified final sov + dsov.
 * Returns the LAST (most recent) certification drop, which is the certified one.
 */
async function discover(dateCode) {
  let html = null
  for (const page of ['detail.html', 'detail.php']) {
    try {
      html = await fetchText(`https://sfelections.org/results/${dateCode}w/${page}`)
      break
    } catch {
      /* try next */
    }
  }
  if (!html) throw new Error(`no detail page for ${dateCode}`)

  // Certified finals end in /sov.xlsx or /dsov.xlsx, or <date>_sov.xlsx (2020).
  // Preliminary drops are psov/dpsov — the negative lookbehind on `p`/`dp`
  // is expressed by requiring a `/` or `_` immediately before the name.
  // Scope to THIS election's own path — a detail page also links to other
  // elections, and an unscoped "last match" silently grabs the wrong year.
  const pick = (name) => {
    const re = new RegExp(
      `https://[^"']*/results/${dateCode}/data/[^"']*?[/_]${name}\\.xlsx`,
      'g',
    )
    const hits = [...html.matchAll(re)].map((m) => m[0])
    // Preliminaries are psov/dpsov — `/psov.xlsx` would otherwise match `sov`.
    const finals = hits.filter((u) => !/\/(p|dp)sov\.xlsx$/.test(u))
    if (!finals.length) return null
    // Pick by the drop's own date, NOT document order: these pages are
    // reverse-chronological, and an election can carry more than one
    // unprefixed drop (a pre-election logic-and-accuracy shell alongside the
    // real certification). Latest drop date wins.
    const dropDate = (u) => u.match(/\/data\/(\d{8})/)?.[1] ?? '0'
    return finals.sort((a, b) => dropDate(a).localeCompare(dropDate(b))).at(-1)
  }

  return { sov: pick('sov'), dsov: pick('dsov') }
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const manifest = { generatedAt: new Date().toISOString(), elections: [], eras: [] }

  for (const dateCode of ELECTIONS) {
    const { sov, dsov } = await discover(dateCode)
    const era = eraFor(dateCode)
    const entry = { dateCode, era: era.id, scheme: era.scheme, sov: null, dsov: null }

    for (const [kind, url] of [['sov', sov], ['dsov', dsov]]) {
      if (!url) {
        console.warn(`  ⚠ ${dateCode}: no certified ${kind}`)
        continue
      }
      const file = join(OUT, `${dateCode}_${kind}.xlsx`)
      const { cached } = await download(url, file)
      entry[kind] = { url, file }
      console.log(`  ${cached ? '·' : '↓'} ${dateCode} ${kind}  ${url.split('/data/')[1]}`)
    }
    manifest.elections.push(entry)
  }

  for (const era of PRECINCT_ERAS) {
    const file = join(OUT, `${era.id}.geojson`)
    const url = `https://data.sfgov.org/resource/${era.socrata}.geojson?$limit=2000`
    const { cached } = await download(url, file)
    const gj = JSON.parse(await readFile(file, 'utf8'))
    console.log(`  ${cached ? '·' : '↓'} ${era.id}  ${gj.features.length} precincts`)
    manifest.eras.push({ ...era, file, precincts: gj.features.length })
  }

  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`\n✓ manifest → ${join(OUT, 'manifest.json')}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
