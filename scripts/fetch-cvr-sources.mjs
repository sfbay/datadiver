// scripts/fetch-cvr-sources.mjs — download SF certified CVR exports.
// Sources are gitignored (data/elections-src/); only generator output is
// committed. Verifies the zip against SF's published SHA-512 CSV — THROWS
// on mismatch (a corrupted 296MB download must never reach the generator).
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const CVR_SOURCES = Object.freeze({
  '20241105': {
    zip: 'https://www.sfelections.org/results/20241105/data/20241203/CVR_Export_20241202143051.zip',
    zipFile: 'CVR_Export_20241202143051.zip',
    sha512Csv: 'https://www.sfelections.org/results/20241105/data/20241203/20241202_sha512.csv',
    csvFile: '20241202_sha512.csv',
  },
})

async function download(url, dest) {
  if (existsSync(dest)) { console.log(`  exists, skipping: ${dest}`); return }
  console.log(`  downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} for ${url}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
}

function verify(dir, { zipFile, csvFile }) {
  const csv = readFileSync(`${dir}/${csvFile}`, 'utf8')
  // CSV rows: index,filename,path,SHA512-hex-uppercase,size,
  const row = csv.split(/\r?\n/).find((l) => l.split(',')[1] === zipFile)
  if (!row) throw new Error(`no CSV row for ${zipFile}`)
  const expected = row.split(',')[3].toLowerCase()
  const actual = createHash('sha512').update(readFileSync(`${dir}/${zipFile}`)).digest('hex')
  if (actual !== expected) throw new Error(`SHA-512 mismatch for ${zipFile}: got ${actual}`)
  console.log(`  SHA-512 verified: ${zipFile}`)
}

async function main() {
  for (const [dateCode, src] of Object.entries(CVR_SOURCES)) {
    const dir = `data/elections-src/cvr/${dateCode}`
    mkdirSync(dir, { recursive: true })
    await download(src.sha512Csv, `${dir}/${src.csvFile}`)
    await download(src.zip, `${dir}/${src.zipFile}`)
    verify(dir, src)
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
