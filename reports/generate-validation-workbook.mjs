#!/usr/bin/env node
/**
 * Resolution 240210 — Validation Workbook Generator
 *
 * Queries the Socrata SODA API, applies the same vendor classification
 * used by DataDiver, computes every key metric from the compliance report,
 * selects a stratified validation sample, and writes four output files.
 *
 * Usage:  node reports/generate-validation-workbook.mjs
 * Output: reports/validation/{claim-registry,validation-sample,full-classification-audit}.csv
 *         reports/validation/validation-methodology.md
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = path.join(__dirname, 'validation')
const REPORT_DATE = '2026-03-23'
const GENERATED_AT = new Date().toISOString()
const BASE_URL = 'https://data.sfgov.org/resource/n9pm-xkyq.json'
const APP_TOKEN = process.env.VITE_SOCRATA_APP_TOKEN || process.env.SOCRATA_APP_TOKEN || ''

// ── Vendor Classification Registry (ported from src/utils/mediaClassification.ts) ──

const VENDOR_REGISTRY = [
  // Legal notices
  { pattern: 'DAILY JOURNAL', category: 'legal-notices' },
  { pattern: 'CALIFORNIA NEWSPAPER SERVICE', category: 'legal-notices' },
  // Major metro print
  { pattern: 'SF CHRONICLE', category: 'major-metro-print' },
  { pattern: 'SAN FRANCISCO CHRONICLE', category: 'major-metro-print' },
  { pattern: 'SF EXAMINER', category: 'major-metro-print' },
  { pattern: 'SAN FRANCISCO EXAMINER', category: 'major-metro-print' },
  // Community & ethnic press — Chinese-language
  { pattern: 'SING TAO', category: 'community-ethnic-press' },
  { pattern: 'WORLD JOURNAL', category: 'community-ethnic-press' },
  { pattern: 'CHINESE TIMES', category: 'community-ethnic-press' },
  { pattern: 'WIND NEWSPAPER', category: 'community-ethnic-press' },
  // Spanish-language
  { pattern: 'EL MENSAJERO', category: 'community-ethnic-press' },
  { pattern: 'EL TECOLOTE', category: 'community-ethnic-press' },
  { pattern: 'EL REPORTERO', category: 'community-ethnic-press' },
  { pattern: 'ACCION LATINA', category: 'community-ethnic-press' },
  // Filipino
  { pattern: 'PHILIPPINE NEWS', category: 'community-ethnic-press' },
  { pattern: 'FIL-AM RADIO', category: 'community-ethnic-press' },
  // Korean / South Asian
  { pattern: 'KOREA TIMES', category: 'community-ethnic-press' },
  { pattern: 'INDIA CURRENTS', category: 'community-ethnic-press' },
  { pattern: 'ASIAN WEEK', category: 'community-ethnic-press' },
  { pattern: 'CENTER FOR ASIAN AMERICAN MEDIA', category: 'community-ethnic-press' },
  // LGBTQ+
  { pattern: 'BAY AREA REPORTER', category: 'community-ethnic-press' },
  { pattern: 'SAN FRANCISCO BAY TIMES', category: 'community-ethnic-press' },
  // African American
  { pattern: 'SAN FRANCISCO BAY VIEW', category: 'community-ethnic-press' },
  // Neighborhood / hyperlocal
  { pattern: 'SF NEIGHBORHOOD NEWSPAPER', category: 'community-ethnic-press' },
  { pattern: 'S F NEIGHBORHOOD NEWSPAPER', category: 'community-ethnic-press' },
  { pattern: 'MISSION LOCAL', category: 'community-ethnic-press' },
  { pattern: 'BROKE-ASS STUART', category: 'community-ethnic-press' },
  // Multicultural radio
  { pattern: 'MULTICULTURAL RADIO', category: 'community-ethnic-press' },
  // Radio & TV
  { pattern: 'UNIVISION', category: 'radio-tv' },
  { pattern: 'TELEMUNDO', category: 'radio-tv' },
  { pattern: 'COMCAST', category: 'radio-tv' },
  { pattern: 'EFFECTV', category: 'radio-tv' },
  { pattern: 'IHEART', category: 'radio-tv' },
  { pattern: 'KTSF', category: 'radio-tv' },
  { pattern: 'KRON', category: 'radio-tv' },
  { pattern: 'KGO TV', category: 'radio-tv' },
  { pattern: 'SKY LINK TV', category: 'radio-tv' },
  { pattern: 'NBCUNIVERSAL', category: 'radio-tv' },
  { pattern: 'ENTERCOM', category: 'radio-tv' },
  { pattern: 'AUDACY', category: 'radio-tv' },
  { pattern: 'BONNEVILLE', category: 'radio-tv' },
  { pattern: 'KQED', category: 'radio-tv' },
  { pattern: 'DISNEY ADVERTISING', category: 'radio-tv' },
  { pattern: 'LEADER MEDIA GRP', category: 'radio-tv' },
  // Out-of-home / transit
  { pattern: 'CBS OUTDOOR', category: 'out-of-home' },
  { pattern: 'CLEAR CHANNEL', category: 'out-of-home' },
  { pattern: 'TITAN OUTDOOR', category: 'out-of-home' },
  { pattern: 'INTERSECTION MEDIA', category: 'out-of-home' },
  { pattern: 'OUTFRONT', category: 'out-of-home' },
  { pattern: 'LAMAR ADVERTISING', category: 'out-of-home' },
  // Full-service agencies
  { pattern: 'ZEBA CONSULTING', category: 'full-service-agency' },
  { pattern: 'MOST LIKELY TO', category: 'full-service-agency' },
  { pattern: "O'RORKE", category: 'full-service-agency' },
  { pattern: 'ORORKE', category: 'full-service-agency' },
  { pattern: 'GREAT KOLOR', category: 'full-service-agency' },
  { pattern: 'CIVIC EDGE', category: 'full-service-agency' },
  { pattern: 'PROMOTION MARKETING', category: 'full-service-agency' },
  // Digital / interactive agencies
  { pattern: 'CKR INTERACTIVE', category: 'digital-agency' },
  { pattern: 'BETTER WORLD ADVERTISING', category: 'digital-agency' },
  // Recruitment
  { pattern: 'ADVANCE RECRUITMENT', category: 'recruitment' },
  // Direct social platforms
  { pattern: 'LINKEDIN', category: 'direct-social' },
  // P-card
  { pattern: 'P-CARD', category: 'p-card' },
  { pattern: 'PCARD', category: 'p-card' },
  { pattern: 'US BANK N.A', category: 'p-card' },
  // Production
  { pattern: 'FLAG & BANNER', category: 'production' },
  { pattern: 'ART SIGN', category: 'production' },
  { pattern: 'EPIC PRODUCTIONS', category: 'production' },
]

function classifyVendor(vendorName) {
  const upper = vendorName.toUpperCase()
  for (const entry of VENDOR_REGISTRY) {
    if (upper.includes(entry.pattern)) {
      return { category: entry.category, rule: entry.pattern }
    }
  }
  return { category: 'unknown', rule: null }
}

// ── Seeded PRNG (mulberry32) for reproducible sampling ──

function mulberry32(seed) {
  let s = seed | 0
  return function () {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(arr, rng) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Socrata fetch helper ──

async function socrataFetch(params) {
  const url = new URL(BASE_URL)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const headers = { Accept: 'application/json' }
  if (APP_TOKEN) headers['X-App-Token'] = APP_TOKEN

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url.toString(), { headers })
    if (res.status === 429) {
      console.warn('  ⚠ Rate limited, retrying in 2s...')
      await new Promise((r) => setTimeout(r, 2000))
      continue
    }
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Socrata ${res.status}: ${body.slice(0, 200)}`)
    }
    return await res.json()
  }
  throw new Error('Socrata rate limit persisted after retry')
}

// ── CSV writer ──

function escapeCSV(val) {
  const s = String(val ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function writeCSV(filepath, headers, rows) {
  const lines = [headers.map(escapeCSV).join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCSV(row[h])).join(','))
  }
  fs.writeFileSync(filepath, lines.join('\n') + '\n', 'utf-8')
  console.log(`  → ${filepath} (${rows.length} rows)`)
}

// ── Report claim values (hard-coded from the report as of REPORT_DATE) ──

const TREND_REPORT = {
  2018: { total: 1137376, legal: 409540, disc: 727836, ethnic: 130755, pct: 18.0, outlets: 8 },
  2019: { total: 1227364, legal: 512790, disc: 714574, ethnic: 126480, pct: 17.7, outlets: 8 },
  2020: { total: 1611905, legal: 409304, disc: 1202601, ethnic: 148615, pct: 12.4, outlets: 9 },
  2021: { total: 1674180, legal: 317459, disc: 1356721, ethnic: 159262, pct: 11.7, outlets: 7 },
  2022: { total: 1491282, legal: 455411, disc: 1035871, ethnic: 217942, pct: 21.0, outlets: 9 },
  2023: { total: 1559847, legal: 290395, disc: 1269452, ethnic: 163094, pct: 12.8, outlets: 10 },
  2024: { total: 1538522, legal: 318377, disc: 1220145, ethnic: 90993, pct: 7.5, outlets: 11 },
  2025: { total: 1408531, legal: 371290, disc: 1037241, ethnic: 60546, pct: 5.8, outlets: 9 },
  2026: { total: 829607, legal: 346805, disc: 482802, ethnic: 47624, pct: 9.9, outlets: 10 },
}

const BLA_REPORT = {
  2018: 33.2, 2019: 41.2, 2020: 33.7, 2021: 46.2, 2022: 40.8,
  2023: 33.3, 2024: 22.9, 2025: 18.2, 2026: 14.4,
}

const DEPT_FY2025_REPORT = [
  { dept: 'HSA Human Services Agency', ethnic: 13358, disc: 13539, pct: 98.7, outlets: 2 },
  { dept: 'ASR Assessor - Recorder', ethnic: 4854, disc: 4854, pct: 100.0, outlets: 1 },
  { dept: 'MTA Municipal Transprtn Agncy', ethnic: 30231, disc: 52839, pct: 57.2, outlets: 6 },
  { dept: 'BOS Board of Supervisors', ethnic: 480, disc: 480, pct: 100.0, outlets: 1 },
  { dept: 'HRD Human Resources', ethnic: 6668, disc: 163662, pct: 4.1, outlets: 3 },
  { dept: 'LIB Public Library', ethnic: 3011, disc: 67075, pct: 4.5, outlets: 2 },
  { dept: 'PUC Public Utilities Commsn', ethnic: 1945, disc: 46452, pct: 4.2, outlets: 2 },
  { dept: 'REG Elections', ethnic: 0, disc: 444325, pct: 0.0, outlets: 0 },
  { dept: 'DPH Public Health', ethnic: 0, disc: 88790, pct: 0.0, outlets: 0 },
]

const PCARD_REPORT = {
  2018: 4932, 2019: 20888, 2020: 13594, 2021: 46082, 2022: 38665,
  2023: 58615, 2024: 45746, 2025: 47111, 2026: 33475,
}

// Vendors explicitly named in the report (for in_report flag)
const NAMED_IN_REPORT = [
  'SING TAO', 'WORLD JOURNAL', 'BAY AREA REPORTER', 'WIND NEWSPAPER',
  'EL REPORTERO', 'BROKE-ASS STUART', 'SAN FRANCISCO BAY TIMES', 'MISSION LOCAL',
  'SF NEIGHBORHOOD NEWSPAPER', 'S F NEIGHBORHOOD NEWSPAPER',
  'DAILY JOURNAL', 'CALIFORNIA NEWSPAPER SERVICE',
  'GREAT KOLOR', 'MOST LIKELY TO', 'BETTER WORLD', 'P-CARD',
  'KRON', 'KTSF', 'PROFESSIONAL SPORTS', 'COLE PRO MEDIA',
  'CLEAR CHANNEL', 'CHINA BASIN BALLPARK', 'CIVIC EDGE', 'ZEBA CONSULTING',
  'SF CHRONICLE', 'HEARST', 'PORAC',
]

function isNamedInReport(vendor) {
  const upper = vendor.toUpperCase()
  return NAMED_IN_REPORT.some((p) => upper.includes(p))
}

// ── Computation ──

function computeTrend(historicalClassified) {
  const byFY = {}
  for (const r of historicalClassified) {
    const fy = parseInt(r.fiscal_year, 10)
    if (!byFY[fy]) byFY[fy] = { total: 0, legal: 0, ethnic: 0, outlets: new Set() }
    const amt = parseFloat(r.total_paid) || 0
    byFY[fy].total += amt
    if (r.category === 'legal-notices') byFY[fy].legal += amt
    else if (r.category === 'community-ethnic-press') {
      byFY[fy].ethnic += amt
      byFY[fy].outlets.add(r.vendor)
    }
  }
  const result = {}
  for (const [fy, d] of Object.entries(byFY)) {
    const disc = d.total - d.legal
    result[fy] = {
      total: Math.round(d.total),
      legal: Math.round(d.legal),
      disc: Math.round(disc),
      ethnic: Math.round(d.ethnic),
      pct: disc > 0 ? Math.round((d.ethnic / disc) * 1000) / 10 : 0,
      outlets: d.outlets.size,
    }
  }
  return result
}

function computeBLA(historicalClassified) {
  const byFY = {}
  for (const r of historicalClassified) {
    const fy = parseInt(r.fiscal_year, 10)
    if (!byFY[fy]) byFY[fy] = { ethnic: 0, printDigital: 0 }
    const amt = parseFloat(r.total_paid) || 0
    const cat = r.category
    // BLA denominator: ethnic + metro-print + p-card + unknown
    if (cat === 'community-ethnic-press') {
      byFY[fy].ethnic += amt
      byFY[fy].printDigital += amt
    } else if (cat === 'major-metro-print' || cat === 'p-card' || cat === 'unknown') {
      byFY[fy].printDigital += amt
    }
    // Exclude: legal-notices, radio-tv, out-of-home, agencies, recruitment, production, direct-social
  }
  const result = {}
  for (const [fy, d] of Object.entries(byFY)) {
    result[fy] = d.printDigital > 0 ? Math.round((d.ethnic / d.printDigital) * 1000) / 10 : 0
  }
  return result
}

function computePcard(historicalClassified) {
  const byFY = {}
  for (const r of historicalClassified) {
    if (r.category !== 'p-card') continue
    const fy = parseInt(r.fiscal_year, 10)
    byFY[fy] = (byFY[fy] || 0) + (parseFloat(r.total_paid) || 0)
  }
  const result = {}
  for (const [fy, v] of Object.entries(byFY)) result[fy] = Math.round(v)
  return result
}

function computeDeptCards(classified, fy) {
  const rows = classified.filter((r) => r.fiscal_year === String(fy))
  const deptMap = {}
  for (const r of rows) {
    const amt = parseFloat(r.total_paid) || 0
    if (!deptMap[r.department]) deptMap[r.department] = { total: 0, legal: 0, ethnic: 0, outlets: new Set() }
    const d = deptMap[r.department]
    d.total += amt
    if (r.category === 'legal-notices') d.legal += amt
    else if (r.category === 'community-ethnic-press') {
      d.ethnic += amt
      d.outlets.add(r.vendor)
    }
  }
  const result = []
  for (const [dept, d] of Object.entries(deptMap)) {
    const disc = d.total - d.legal
    result.push({
      dept,
      ethnic: Math.round(d.ethnic),
      disc: Math.round(disc),
      pct: disc > 0 ? Math.round((d.ethnic / disc) * 1000) / 10 : 0,
      outlets: d.outlets.size,
    })
  }
  return result.sort((a, b) => b.disc - a.disc)
}

// ── Claim registry builder ──

function buildClaimRegistry(computedTrend, computedBLA, computedPcard, deptCards2025) {
  const claims = []

  // Full reproducible Socrata URLs — anyone can paste these into a browser
  function soqlUrl(params) {
    const url = new URL(BASE_URL)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    return url.toString()
  }

  // Standard vendor aggregation query for a given FY
  function trendQuery(fy) {
    return soqlUrl({
      $select: 'vendor, SUM(vouchers_paid) as total_paid, COUNT(*) as payment_count',
      $where: `sub_object = 'Advertising' AND fiscal_year = '${fy}'`,
      $group: 'vendor',
      $order: 'total_paid DESC',
      $limit: '5000',
    })
  }

  // Dept-level query
  function deptQuery(fy, dept) {
    return soqlUrl({
      $select: 'vendor, department, SUM(vouchers_paid) as total_paid, COUNT(*) as payment_count',
      $where: `sub_object = 'Advertising' AND fiscal_year = '${fy}'${dept ? ` AND department = '${dept}'` : ''}`,
      $group: 'vendor, department',
      $order: 'total_paid DESC',
      $limit: '5000',
    })
  }

  // P-card specific query
  function pcardQuery(fy) {
    return soqlUrl({
      $select: 'vendor, SUM(vouchers_paid) as total_paid',
      $where: `sub_object = 'Advertising' AND fiscal_year = '${fy}' AND (UPPER(vendor) LIKE '%P-CARD%' OR UPPER(vendor) LIKE '%PCARD%' OR UPPER(vendor) LIKE '%US BANK N.A%')`,
      $group: 'vendor',
      $order: 'total_paid DESC',
      $limit: '100',
    })
  }

  function toleranceMatch(reported, computed, type) {
    if (type === '%') return Math.abs(reported - computed) <= 0.15
    if (type === '$') return Math.abs(reported - computed) <= 50
    if (type === 'count') return reported === computed
    return reported === computed
  }

  // Historical trend claims
  for (const fy of Object.keys(TREND_REPORT).map(Number)) {
    const rep = TREND_REPORT[fy]
    const comp = computedTrend[fy] || {}
    const queryUrl = trendQuery(fy)
    const pairs = [
      ['total-ad', 'Total Advertising', rep.total, comp.total, '$'],
      ['legal', 'Legal Notices', rep.legal, comp.legal, '$'],
      ['discretionary', 'Discretionary', rep.disc, comp.disc, '$'],
      ['ethnic', 'Ethnic Media', rep.ethnic, comp.ethnic, '$'],
      ['compliance', 'Compliance %', rep.pct, comp.pct, '%'],
      ['outlets', 'Outlets Paid', rep.outlets, comp.outlets, 'count'],
    ]
    for (const [suffix, desc, repVal, compVal, unit] of pairs) {
      claims.push({
        claim_id: `trend-fy${fy}-${suffix}`,
        section: 'Section 3: Historical Trend',
        description: `FY${fy} ${desc}`,
        fiscal_year: fy,
        report_value: repVal,
        computed_value: compVal ?? 'N/A',
        match: compVal != null ? toleranceMatch(repVal, compVal, unit) : false,
        tolerance: unit === '%' ? '0.15pp' : unit === '$' ? '$50' : 'exact',
        unit,
        source_query: queryUrl,
        computation: suffix === 'discretionary' ? 'total - legal_notices' : suffix === 'compliance' ? 'ethnic / discretionary × 100' : suffix === 'outlets' ? 'COUNT(DISTINCT vendor WHERE category=community-ethnic-press)' : `SUM(vouchers_paid) WHERE category=${suffix === 'legal' ? 'legal-notices' : suffix === 'ethnic' ? 'community-ethnic-press' : 'all'}`,
        generated_at: GENERATED_AT,
      })
    }
  }

  // BLA standard claims
  for (const fy of Object.keys(BLA_REPORT).map(Number)) {
    const repVal = BLA_REPORT[fy]
    const compVal = computedBLA[fy] ?? null
    claims.push({
      claim_id: `bla-fy${fy}-compliance`,
      section: 'Section 4: Denominator Question',
      description: `FY${fy} BLA Standard Compliance %`,
      fiscal_year: fy,
      report_value: repVal,
      computed_value: compVal ?? 'N/A',
      match: compVal != null ? Math.abs(repVal - compVal) <= 0.15 : false,
      tolerance: '0.15pp',
      unit: '%',
      source_query: trendQuery(fy),
      computation: 'ethnic / (ethnic + metro-print + p-card + unknown) × 100 — excludes radio-tv, OOH, agencies, recruitment, production',
      generated_at: GENERATED_AT,
    })
  }

  // P-card trend claims
  for (const fy of Object.keys(PCARD_REPORT).map(Number)) {
    const repVal = PCARD_REPORT[fy]
    const compVal = computedPcard[fy] ?? null
    claims.push({
      claim_id: `pcard-fy${fy}`,
      section: 'Section 7: P-Card',
      description: `FY${fy} P-Card Ad Spend`,
      fiscal_year: fy,
      report_value: repVal,
      computed_value: compVal ?? 'N/A',
      match: compVal != null ? Math.abs(repVal - compVal) <= 50 : false,
      tolerance: '$50',
      unit: '$',
      source_query: pcardQuery(fy),
      computation: 'SUM(vouchers_paid) WHERE vendor matches P-CARD/PCARD/US BANK N.A',
      generated_at: GENERATED_AT,
    })
  }

  // Department cards FY2025
  for (const rep of DEPT_FY2025_REPORT) {
    const comp = deptCards2025.find((d) => d.dept === rep.dept)
    const deptUrl = deptQuery(2025, rep.dept)
    claims.push({
      claim_id: `dept-fy25-${rep.dept.slice(0, 3).toLowerCase()}-ethnic`,
      section: 'Section 5: Department Report Card',
      description: `FY2025 ${rep.dept} Ethnic Media Spend`,
      fiscal_year: 2025,
      report_value: rep.ethnic,
      computed_value: comp?.ethnic ?? 'N/A',
      match: comp ? Math.abs(rep.ethnic - comp.ethnic) <= 50 : false,
      tolerance: '$50',
      unit: '$',
      source_query: deptUrl,
      computation: 'SUM(vouchers_paid) WHERE category=community-ethnic-press',
      generated_at: GENERATED_AT,
    })
    claims.push({
      claim_id: `dept-fy25-${rep.dept.slice(0, 3).toLowerCase()}-disc`,
      section: 'Section 5: Department Report Card',
      description: `FY2025 ${rep.dept} Discretionary Total`,
      fiscal_year: 2025,
      report_value: rep.disc,
      computed_value: comp?.disc ?? 'N/A',
      match: comp ? Math.abs(rep.disc - comp.disc) <= 50 : false,
      tolerance: '$50',
      unit: '$',
      source_query: deptUrl,
      computation: 'SUM(vouchers_paid) - SUM(WHERE category=legal-notices)',
      generated_at: GENERATED_AT,
    })
  }

  return claims
}

// ── Stratified sample selection ──

function selectStratifiedSample(classified, rng) {
  const sample = []
  const used = new Set()
  const key = (r) => `${r.vendor}|${r.department}|${r.fiscal_year}`

  function add(row, stratum) {
    const k = key(row)
    if (used.has(k)) return false
    used.add(k)
    sample.push({ ...row, stratum, in_report: isNamedInReport(row.vendor) ? 'Y' : 'N' })
    return true
  }

  // 1. Mandatory: all ethnic media vendors named in report Section 8
  const ethnicReportVendors = [
    'SF NEIGHBORHOOD NEWSPAPER', 'S F NEIGHBORHOOD NEWSPAPER', 'WORLD JOURNAL',
    'BAY AREA REPORTER', 'SING TAO', 'WIND NEWSPAPER', 'EL REPORTERO',
    'BROKE-ASS STUART', 'SAN FRANCISCO BAY TIMES', 'MISSION LOCAL',
  ]
  for (const row of classified) {
    const upper = row.vendor.toUpperCase()
    if (ethnicReportVendors.some((p) => upper.includes(p))) {
      add(row, 'ethnic-media-named')
    }
  }
  console.log(`    Ethnic media named: ${sample.length}`)

  // 2. Top 10 by spend
  const sorted = [...classified].sort((a, b) => parseFloat(b.total_paid) - parseFloat(a.total_paid))
  let topCount = 0
  for (const row of sorted) {
    if (topCount >= 10) break
    if (add(row, 'top-spend')) topCount++
  }
  console.log(`    Top spend added: ${topCount}`)

  // 3. Category coverage (at least 5 per major category)
  const targetCats = [
    'community-ethnic-press', 'legal-notices', 'full-service-agency', 'p-card',
    'major-metro-print', 'radio-tv', 'out-of-home', 'unknown',
  ]
  let catFill = 0
  for (const cat of targetCats) {
    const inSample = sample.filter((s) => s.category === cat).length
    const needed = Math.max(0, 5 - inSample)
    if (needed === 0) continue
    const candidates = shuffle(
      classified.filter((r) => r.category === cat && !used.has(key(r))),
      rng
    )
    for (let i = 0; i < Math.min(needed, candidates.length); i++) {
      if (add(candidates[i], 'category-fill')) catFill++
    }
  }
  console.log(`    Category fill: ${catFill}`)

  // 4. Department coverage
  const reportDepts = [
    'HSA', 'ASR', 'MTA', 'BOS', 'HRD', 'LIB', 'PUC', 'REG',
    'DPH', 'CSS', 'SHF', 'PRT', 'DAT', 'ECN', 'POL', 'HRC',
  ]
  let deptFill = 0
  for (const prefix of reportDepts) {
    const inSample = sample.some((s) => s.department.startsWith(prefix))
    if (inSample) continue
    const candidates = classified
      .filter((r) => r.department.startsWith(prefix) && !used.has(key(r)))
      .sort((a, b) => parseFloat(b.total_paid) - parseFloat(a.total_paid))
    if (candidates.length > 0 && add(candidates[0], 'dept-fill')) deptFill++
  }
  console.log(`    Department fill: ${deptFill}`)

  // 5. Random fill to reach ~75
  const remaining = Math.max(0, 75 - sample.length)
  const randomPool = shuffle(
    classified.filter((r) => !used.has(key(r))),
    rng
  )
  let randomCount = 0
  for (let i = 0; i < Math.min(remaining, randomPool.length); i++) {
    if (add(randomPool[i], 'random')) randomCount++
  }
  console.log(`    Random fill: ${randomCount}`)

  return sample
}

// ── Methodology document generator ──

function writeMethodology(filepath, { claims, sample, classified }) {
  const matchCount = claims.filter((c) => c.match).length
  const mismatchCount = claims.length - matchCount

  const strataCounts = {}
  for (const s of sample) {
    strataCounts[s.stratum] = (strataCounts[s.stratum] || 0) + 1
  }

  const catCounts = {}
  for (const s of sample) {
    catCounts[s.category] = (catCounts[s.category] || 0) + 1
  }

  const md = `# Validation Methodology — Resolution 240210 Compliance Report

**Generated:** ${GENERATED_AT}
**Report Date:** ${REPORT_DATE}
**Data Source:** SF Open Data, Vendor Payments dataset \`n9pm-xkyq\`

---

## Purpose

This validation workbook verifies the data pipeline behind the Resolution 240210 compliance report. It provides:

1. **Claim Registry** — Every quantitative assertion in the report, recomputed from live Socrata data and compared to the report's published values.
2. **Validation Sample** — A stratified sample of vendor classification decisions for human review.
3. **Full Classification Audit** — The complete vendor dataset with automated classifications.

## Claim Registry Results

- **Total claims:** ${claims.length}
- **Matching live data:** ${matchCount} (${((matchCount / claims.length) * 100).toFixed(1)}%)
- **Mismatches:** ${mismatchCount}

Tolerances applied:
- Dollar amounts: within $50 (data updates weekly; small changes expected)
- Percentages: within 0.15 percentage points
- Counts: exact match required

${mismatchCount > 0 ? '**Note:** Mismatches may reflect data updates since the report was generated on ' + REPORT_DATE + '. Review each mismatch in claim-registry.csv to determine if it represents a data update or a computation error.' : 'All claims match within tolerance.'}

## Validation Sample Design

**Sample size:** ${sample.length} records (from ${classified.length} total vendor-department-FY aggregations)

### Stratification

| Stratum | Records | Purpose |
|---------|--------:|---------|
${Object.entries(strataCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([s, n]) => `| ${s} | ${n} | ${stratumDescription(s)} |`)
  .join('\n')}

### Category Coverage in Sample

| Category | Records |
|----------|--------:|
${Object.entries(catCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([c, n]) => `| ${c} | ${n} |`)
  .join('\n')}

## Instructions for Reviewers

### Step 1: Open \`validation-sample.csv\`

For each row:

1. **Read the vendor name** and the \`automated_category\` assigned by the classification pipeline.
2. **Assess independently:** Based on your knowledge, what category should this vendor be in? Enter your answer in the \`reviewer_category\` column.
3. **Mark agreement:** Set \`agree\` to \`Y\` if your category matches the automated one, \`N\` if it differs.
4. **Add notes** explaining any disagreement — especially for vendors you believe are miscategorized.

### Step 2: Pay special attention to \`in_report = Y\` rows

These vendors appear by name in the published report. A misclassification here directly affects the headline compliance numbers. Flag any concerns.

### Step 3: Check for missing outlets

Review the \`full-classification-audit.csv\` for vendors classified as \`unknown\`. Are any of these actually ethnic or community media outlets that should be in the registry?

## How to Interpret Results

- **Agreement rate = count(agree=Y) / total sampled**
- **≥95% agreement:** The classification pipeline is reliable. Proceed with report finalization.
- **90–95% agreement:** Review disagreements. If corrections change the compliance percentage by <0.5pp, the report stands. If >0.5pp, recompute and update the report.
- **<90% agreement:** The classification registry needs significant revision before the report is presented to the city. Convene a registry review session with coalition members.

### If corrections are needed:

1. Update the classification in \`validation-sample.csv\`
2. For each correction, note whether it affects the **numerator** (ethnic media) or **denominator** (legal notices) or neither
3. Recompute the compliance figures with corrections applied
4. Document the correction in the report's methodology section

## Data Pipeline Reference

\`\`\`
Socrata API (n9pm-xkyq)
  → WHERE sub_object = 'Advertising'
  → GROUP BY vendor, department, fiscal_year
  → SUM(vouchers_paid)
    ↓
classifyVendor() — 87 pattern rules in VENDOR_REGISTRY
  → First substring match wins, default 'unknown'
    ↓
Compliance computation:
  → discretionary = total_ad_spend - legal_notice_spend
  → compliance_pct = ethnic_media_spend / discretionary × 100
\`\`\`

Classification source: \`src/utils/mediaClassification.ts\`
Compliance computation: \`src/hooks/useComplianceData.ts\`
Report: \`reports/resolution-240210-compliance-report.md\`

## Files in This Directory

| File | Purpose |
|------|---------|
| \`claim-registry.csv\` | Every numeric claim → source query → live recomputation |
| \`validation-sample.csv\` | Stratified sample for human classification review |
| \`full-classification-audit.csv\` | Complete vendor list with automated categories |
| \`validation-methodology.md\` | This document |
`

  fs.writeFileSync(filepath, md, 'utf-8')
  console.log(`  → ${filepath}`)
}

function stratumDescription(s) {
  const map = {
    'ethnic-media-named': 'All ethnic media vendors named in the report — most consequential classifications',
    'top-spend': 'Top 10 vendors by dollar amount — dominate the denominator',
    'category-fill': 'Ensure ≥5 records per major category for coverage',
    'dept-fill': 'Ensure every report-named department has at least one sampled record',
    'random': 'Random fill to reach target sample size for statistical confidence',
  }
  return map[s] || s
}

// ── Main ──

async function main() {
  console.log('═══════════════════════════════════════════════════════')
  console.log('  Resolution 240210 — Validation Workbook Generator')
  console.log('═══════════════════════════════════════════════════════')
  console.log(`Report date:  ${REPORT_DATE}`)
  console.log(`Generated:    ${GENERATED_AT}`)
  console.log()

  // Step 1: Fetch
  console.log('[1/5] Fetching vendor payment data from Socrata...')

  const detailRows = await socrataFetch({
    $select: 'vendor, department, fiscal_year, SUM(vouchers_paid) as total_paid, COUNT(*) as payment_count',
    $where: "sub_object = 'Advertising' AND fiscal_year IN ('2025','2026')",
    $group: 'vendor, department, fiscal_year',
    $order: 'total_paid DESC',
    $limit: '5000',
  })
  console.log(`  → ${detailRows.length} vendor-dept-FY rows (FY2025-2026)`)

  const historicalRows = await socrataFetch({
    $select: 'vendor, fiscal_year, SUM(vouchers_paid) as total_paid',
    $where: "sub_object = 'Advertising' AND fiscal_year IN ('2018','2019','2020','2021','2022','2023','2024','2025','2026')",
    $group: 'vendor, fiscal_year',
    $order: 'fiscal_year, total_paid DESC',
    $limit: '10000',
  })
  console.log(`  → ${historicalRows.length} historical vendor-FY rows (FY2018-2026)`)

  if (detailRows.length === 0 || historicalRows.length === 0) {
    console.error('ERROR: Empty response from Socrata. Dataset may be temporarily unavailable.')
    process.exit(1)
  }

  // Step 2: Classify
  console.log('\n[2/5] Classifying vendors...')

  const classified = detailRows.map((r) => {
    const { category, rule } = classifyVendor(r.vendor)
    return { ...r, category, rule }
  })

  const historicalClassified = historicalRows.map((r) => {
    const { category, rule } = classifyVendor(r.vendor)
    return { ...r, category, rule }
  })

  const catSummary = {}
  for (const r of classified) catSummary[r.category] = (catSummary[r.category] || 0) + 1
  console.log('  Category distribution:')
  for (const [cat, n] of Object.entries(catSummary).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cat}: ${n}`)
  }

  // Step 3: Compute claims
  console.log('\n[3/5] Computing claim registry...')

  const computedTrend = computeTrend(historicalClassified)
  const computedBLA = computeBLA(historicalClassified)
  const computedPcard = computePcard(historicalClassified)
  const deptCards2025 = computeDeptCards(classified, 2025)

  const claims = buildClaimRegistry(computedTrend, computedBLA, computedPcard, deptCards2025)
  const matches = claims.filter((c) => c.match).length
  const mismatches = claims.filter((c) => !c.match)
  console.log(`  → ${claims.length} claims registered`)
  console.log(`  → ${matches} match (${((matches / claims.length) * 100).toFixed(1)}%)`)
  if (mismatches.length > 0) {
    console.log(`  → ${mismatches.length} mismatches:`)
    for (const m of mismatches.slice(0, 10)) {
      console.log(`    ${m.claim_id}: report=${m.report_value} computed=${m.computed_value}`)
    }
    if (mismatches.length > 10) console.log(`    ... and ${mismatches.length - 10} more`)
  }

  // Step 4: Stratified sample
  console.log('\n[4/5] Selecting validation sample...')
  const rng = mulberry32(20260403)
  const sample = selectStratifiedSample(classified, rng)
  console.log(`  → ${sample.length} records selected`)

  // Step 5: Write outputs
  console.log('\n[5/5] Writing output files...')
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  writeCSV(
    path.join(OUTPUT_DIR, 'claim-registry.csv'),
    ['claim_id', 'section', 'description', 'fiscal_year', 'report_value', 'computed_value', 'match', 'tolerance', 'unit', 'source_query', 'computation', 'generated_at'],
    claims
  )

  writeCSV(
    path.join(OUTPUT_DIR, 'validation-sample.csv'),
    ['vendor', 'department', 'fiscal_year', 'total_paid', 'payment_count', 'automated_category', 'classification_rule', 'stratum', 'in_report', 'reviewer_category', 'agree', 'notes'],
    sample.map((s) => ({
      vendor: s.vendor,
      department: s.department,
      fiscal_year: s.fiscal_year,
      total_paid: s.total_paid,
      payment_count: s.payment_count,
      automated_category: s.category,
      classification_rule: s.rule || 'no match → unknown',
      stratum: s.stratum,
      in_report: s.in_report,
      reviewer_category: '',
      agree: '',
      notes: '',
    }))
  )

  writeCSV(
    path.join(OUTPUT_DIR, 'full-classification-audit.csv'),
    ['vendor', 'department', 'fiscal_year', 'total_paid', 'payment_count', 'automated_category', 'classification_rule'],
    classified
      .sort((a, b) => parseFloat(b.total_paid) - parseFloat(a.total_paid))
      .map((r) => ({
        vendor: r.vendor,
        department: r.department,
        fiscal_year: r.fiscal_year,
        total_paid: r.total_paid,
        payment_count: r.payment_count,
        automated_category: r.category,
        classification_rule: r.rule || 'no match → unknown',
      }))
  )

  writeMethodology(path.join(OUTPUT_DIR, 'validation-methodology.md'), { claims, sample, classified })

  console.log('\n═══════════════════════════════════════════════════════')
  console.log(`  ✓ Done. ${claims.length} claims, ${sample.length} sample records.`)
  console.log(`  Output: ${OUTPUT_DIR}`)
  console.log('═══════════════════════════════════════════════════════')
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(1)
})
