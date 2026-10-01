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

export function readNotice(postedYmd: string, plantedYmd: string | null): NoticeReading {
  if (!plantedYmd) return 'this-site'
  return plantedYmd.slice(0, 10) > postedYmd.slice(0, 10) ? 'earlier-tree' : 'this-site'
}
