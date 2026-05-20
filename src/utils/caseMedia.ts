// src/utils/caseMedia.ts
//
// Classifies a 311 case `media_url` so detail panels can decide whether to
// embed it inline or link out.
//
// SF 311 attachments come from two very different sources depending on how
// the report was filed:
//
//   - Mobile app / SeeClickFix / Spot  → direct image files on Cloudinary
//     (content-type: image/jpeg). These embed inline in an <img> fine.
//
//   - Verint web form                  → a `download_attachments` endpoint
//     (sanfrancisco.form.us.empro.verintcloudservices.com) that returns an
//     HTML viewer page (content-type: text/html), NOT an image. An <img>
//     tag can't render it — it just fails. These must be linked out.
//
// Roughly 40% of media-bearing cases are Cloudinary (inline-able) and ~30%
// are Verint (link-only); the rest carry no media. Detecting the kind UP
// FRONT avoids the broken-image flash you get from optimistically trying
// <img> and waiting for onError — and lets the link-out read as a deliberate
// affordance rather than an error state.
//
// NOTE: distinct from utils/mediaClassification.ts, which classifies
// ADVERTISING media vendors for the compliance dashboard — unrelated.

export type CaseMediaKind = 'image' | 'link'

export interface CaseMedia {
  kind: CaseMediaKind
  /** https-normalized URL (http→https to avoid mixed-content blocking). */
  url: string
}

/**
 * Resolve a raw `media_url.url` into an embeddable-image vs link-out
 * classification. Returns null when there's no media.
 */
export function classifyCaseMedia(rawUrl: string | null | undefined): CaseMedia | null {
  if (!rawUrl) return null
  // http→https: https pages block mixed (http) content, so an http image
  // src silently fails. Both Cloudinary and Verint serve over https anyway.
  const url = rawUrl.replace(/^http:\/\//, 'https://')

  // Direct image when the URL ends in a known image extension OR comes from
  // an image CDN we know serves raw bytes. Everything else (Verint form
  // download endpoints, unknown hosts) links out — safer than a failed embed.
  const isDirectImage =
    /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(url) ||
    /(^|\.)cloudinary\.com\//i.test(url)

  return { kind: isDirectImage ? 'image' : 'link', url }
}
