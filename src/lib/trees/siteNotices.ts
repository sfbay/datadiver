// src/lib/trees/siteNotices.ts
// ZERO-IMPORT LEAF. Joins Street Tree Removal Notifications (qrwx-q4gg) to the
// inventory. Spec §10.1.1–§10.1.2: the id names a planting SITE, and 2023+
// notices spell it "TRE-<n>". A notice is a posted notice, never a removal.

export function noticeSiteId(raw: string | null | undefined): number | null {
  const m = /^(?:TRE-)?(\d+)$/i.exec((raw ?? '').trim())
  return m ? Number(m[1]) : null
}

export function noticeIdForms(siteId: number): string[] {
  return [String(siteId), `TRE-${siteId}`]
}

export type NoticeReading = 'earlier-tree' | 'this-site'

/**
 * A notice with no posted date (or a tree with no planting date) can't be
 * placed before or after the tree, so it reads as this site's — never as an
 * earlier tree's.
 */
export function readNotice(postedYmd: string | null | undefined, plantedYmd: string | null | undefined): NoticeReading {
  if (!plantedYmd || !postedYmd) return 'this-site'
  return plantedYmd.slice(0, 10) > postedYmd.slice(0, 10) ? 'earlier-tree' : 'this-site'
}

export interface NoticedByKind { tree: number; stump: number; site: number; shrub: number }

/**
 * What the sites with a removal notice are listed as NOW (final review I2): a
 * site can stay in the inventory re-classed as a stump or an empty planting
 * site, so "still in the inventory" alone would hide it. Counts sites with
 * `nt > 0` by the snapshot's `kind` code (0 tree · 1 stump · 2 empty site ·
 * 3 shrub). Structural input, so this leaf imports nothing.
 */
export function noticedSitesByKind(snap: { nt: readonly number[]; kind: readonly number[] }): NoticedByKind {
  const out: NoticedByKind = { tree: 0, stump: 0, site: 0, shrub: 0 }
  const keys = ['tree', 'stump', 'site', 'shrub'] as const
  for (let i = 0; i < snap.nt.length; i += 1) {
    if (snap.nt[i] > 0) {
      const k = keys[snap.kind[i]]
      if (k) out[k] += 1
    }
  }
  return out
}
