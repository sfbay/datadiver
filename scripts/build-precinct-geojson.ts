/**
 * build-precinct-geojson.ts
 *
 * Downloads SF Elections precinct shapefile and converts to GeoJSON.
 * Also downloads the district-to-precinct cross-reference for mapping.
 *
 * Source: sfelections.org/tools/election_data/datasets/
 * Output: public/elections/geo/precincts.geojson
 *         public/elections/geo/precinct_neighborhood_map.json
 *
 * Run: npx tsx scripts/build-precinct-geojson.ts
 */

import { writeFileSync, mkdirSync, existsSync, createWriteStream, rmSync } from 'fs'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { execSync } from 'child_process'
import * as shapefile from 'shapefile'

const BASE_URL = 'https://sfelections.org/tools/election_data/datasets'
const OUT_DIR = join(import.meta.dirname, '..', 'public', 'elections', 'geo')
const TMP_DIR = join(import.meta.dirname, '..', '.tmp-shp')

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

async function downloadFile(url: string, dest: string): Promise<boolean> {
  try {
    console.log(`  Fetching: ${url}`)
    const res = await fetch(url)
    if (!res.ok || !res.body) {
      console.log(`  → ${res.status} ${res.statusText}`)
      return false
    }
    await pipeline(Readable.fromWeb(res.body as import('stream/web').ReadableStream), createWriteStream(dest))
    console.log(`  → Downloaded to ${dest}`)
    return true
  } catch (err) {
    console.log(`  → Error: ${(err as Error).message}`)
    return false
  }
}

async function processPrecinctShapefile() {
  console.log('\n━━ Precinct Shapefile → GeoJSON ━━')

  ensureDir(TMP_DIR)
  ensureDir(OUT_DIR)

  const zipPath = join(TMP_DIR, 'precincts.zip')
  const ok = await downloadFile(
    `${BASE_URL}/SF_DOE_PREC_2025_12_10_pg.zip`,
    zipPath,
  )
  if (!ok) {
    console.log('  ✗ Failed to download precinct shapefile')
    return
  }

  // Unzip
  try {
    execSync(`unzip -o "${zipPath}" -d "${TMP_DIR}/precincts"`, { stdio: 'pipe' })
    console.log('  → Unzipped')
  } catch (err) {
    console.log(`  ✗ Unzip failed: ${(err as Error).message}`)
    return
  }

  // Find .shp file — may be in a subdirectory
  const { readdirSync, statSync } = await import('fs')
  let searchDir = join(TMP_DIR, 'precincts')

  // If the ZIP extracted into a subdirectory, descend into it
  const topFiles = readdirSync(searchDir)
  if (topFiles.length === 1 && statSync(join(searchDir, topFiles[0])).isDirectory()) {
    searchDir = join(searchDir, topFiles[0])
  }

  const files = readdirSync(searchDir)
  const shpFile = files.find((f) => f.endsWith('.shp'))
  const dbfFile = files.find((f) => f.endsWith('.dbf'))

  if (!shpFile || !dbfFile) {
    console.log('  ✗ No .shp/.dbf files found in ZIP')
    console.log('  Files:', files)
    return
  }

  const shpPath = join(searchDir, shpFile)
  const dbfPath = join(searchDir, dbfFile)

  // Convert to GeoJSON using shapefile package
  const features: GeoJSON.Feature[] = []
  const source = await shapefile.open(shpPath, dbfPath)

  let result = await source.read()
  while (!result.done) {
    features.push(result.value as GeoJSON.Feature)
    result = await source.read()
  }

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features,
  }

  const outPath = join(OUT_DIR, 'precincts.geojson')
  writeFileSync(outPath, JSON.stringify(geojson))
  console.log(`  ✓ Wrote ${outPath} (${features.length} features, ${(JSON.stringify(geojson).length / 1024 / 1024).toFixed(1)} MB)`)

  // Show sample properties
  if (features.length > 0) {
    console.log('  → Sample properties:', JSON.stringify(features[0].properties))
  }

  // Build precinct→neighborhood lookup from GeoJSON properties
  // The shapefile includes Neigh22 (neighborhood) and Supe22 (supervisor district)
  // on each precinct polygon, so no external mapping file is needed.
  const precinctNeighborhood: Record<string, string> = {}
  for (const f of features) {
    const prec = f.properties?.Prec_2025
    const nhood = f.properties?.Neigh22
    if (prec && nhood) {
      precinctNeighborhood[String(prec)] = nhood
    }
  }
  const nhoodPath = join(OUT_DIR, 'precinct_neighborhood_map.json')
  writeFileSync(nhoodPath, JSON.stringify(precinctNeighborhood, null, 2))
  console.log(`  ✓ Wrote ${nhoodPath} (${Object.keys(precinctNeighborhood).length} mappings)`)

  // Cleanup
  try {
    rmSync(TMP_DIR, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

async function main() {
  await processPrecinctShapefile()
  console.log('\nDone!')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
