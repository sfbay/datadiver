/** Media classification registry — maps vendor names to media categories */

export type MediaCategory =
  | 'major-metro-print'
  | 'community-ethnic-press'
  | 'radio-tv'
  | 'out-of-home'
  | 'full-service-agency'
  | 'digital-agency'
  | 'recruitment'
  | 'direct-social'
  | 'p-card'
  | 'production'
  | 'legal-notices'
  | 'unknown'

export interface MediaCategoryInfo {
  label: string
  color: string
  description: string
}

export const MEDIA_CATEGORIES: Record<MediaCategory, MediaCategoryInfo> = {
  'major-metro-print': {
    label: 'Major Metro Print',
    color: '#3b82f6',
    description: 'SF Chronicle, SF Examiner, Daily Journal Corp — largest traditional spend',
  },
  'community-ethnic-press': {
    label: 'Community & Ethnic Press',
    color: '#10b981',
    description: 'Sing Tao, El Mensajero, Bay Area Reporter, World Journal, El Tecolote',
  },
  'radio-tv': {
    label: 'Radio & TV',
    color: '#f59e0b',
    description: 'Univision, Comcast/Effectv, iHeart, KTSF, Entercom, Audacy',
  },
  'out-of-home': {
    // Swapped with full-service-agency: the previous violet collided with
    // the Compliance Card's Agencies purple. Inherits the old agency pink,
    // which is fine because out-of-home transit + billboards have no
    // strong color association and pink reads well for physical/transit.
    label: 'Out-of-Home / Transit',
    color: '#ec4899',
    description: 'CBS Outdoor, Clear Channel, Titan Outdoor, Intersection Media',
  },
  'full-service-agency': {
    // Matches the Compliance Card's Agencies layer color. This is the SAME
    // concept (payments to full-service media-buying agencies like Zeba,
    // Most Likely To, O'Rorke) and should render in the same purple
    // anywhere it appears on the page.
    label: 'Full-Service Agency',
    color: '#a855f7',
    description: 'Zeba Consulting, Most Likely To, O\'Rorke — may include digital/social',
  },
  'digital-agency': {
    label: 'Digital / Interactive',
    color: '#06b6d4',
    description: 'CKR Interactive, Better World Advertising — likely running platform campaigns',
  },
  'recruitment': {
    label: 'Recruitment Advertising',
    color: '#64748b',
    description: 'Advance Recruitment Solutions, LinkedIn Corp — job listings',
  },
  'direct-social': {
    // Shifted from sky (#0ea5e9) to indigo. The old sky collided with the
    // Compliance Card's Direct Ad Placements color. Indigo stays in the
    // blue family (appropriate for a digital/tech platform category) while
    // being unmistakably distinct from sky.
    label: 'Direct Social Platform',
    color: '#6366f1',
    description: 'LinkedIn Corporation — only confirmed direct platform vendor',
  },
  'p-card': {
    label: 'P-Card (Untraceable)',
    color: '#ef4444',
    description: 'US Bank procurement card — almost certainly direct-to-platform digital buys',
  },
  'production': {
    label: 'Production / Print',
    color: '#a1a1aa',
    description: 'Physical production, not media placement',
  },
  'legal-notices': {
    label: 'Legal Notices (Mandatory)',
    color: '#94a3b8',
    description: 'Daily Journal Corp, CA Newspaper Service Bureau — mandatory legal publications, excluded from discretionary ad spend',
  },
  'unknown': {
    label: 'Other / Unclassified',
    color: '#475569',
    description: 'Vendor not in classification registry',
  },
}

/** Known vendor → category mapping (case-insensitive partial match) */
const VENDOR_REGISTRY: Array<{ pattern: string; category: MediaCategory }> = [
  // Legal notices — mandatory publications excluded from discretionary denominator
  { pattern: 'DAILY JOURNAL', category: 'legal-notices' },
  { pattern: 'CALIFORNIA NEWSPAPER SERVICE', category: 'legal-notices' },

  // Major metro print
  { pattern: 'SF CHRONICLE', category: 'major-metro-print' },
  { pattern: 'SAN FRANCISCO CHRONICLE', category: 'major-metro-print' },
  { pattern: 'S F CHRONICLE', category: 'major-metro-print' },        // spaced variant — matches 'S F CHRONICLE- DIV OF HEARST'
  { pattern: 'SF EXAMINER', category: 'major-metro-print' },
  { pattern: 'SAN FRANCISCO EXAMINER', category: 'major-metro-print' },
  { pattern: 'SAN FRANCISCO MEDIA CO', category: 'major-metro-print' }, // historical SF Examiner publisher (pre-2020)

  // Community & ethnic press
  // — Chinese-language
  { pattern: 'SING TAO', category: 'community-ethnic-press' },
  { pattern: 'WORLD JOURNAL', category: 'community-ethnic-press' },
  { pattern: 'CHINESE TIMES', category: 'community-ethnic-press' },
  { pattern: 'WIND NEWSPAPER', category: 'community-ethnic-press' },
  // — Spanish-language
  { pattern: 'EL MENSAJERO', category: 'community-ethnic-press' },
  { pattern: 'EL TECOLOTE', category: 'community-ethnic-press' },
  { pattern: 'EL REPORTERO', category: 'community-ethnic-press' },
  { pattern: 'ACCION LATINA', category: 'community-ethnic-press' },
  // — Filipino
  { pattern: 'PHILIPPINE NEWS', category: 'community-ethnic-press' },
  { pattern: 'FIL-AM RADIO', category: 'community-ethnic-press' },
  // — Korean / South Asian / Other Asian
  { pattern: 'KOREA TIMES', category: 'community-ethnic-press' },
  { pattern: 'INDIA CURRENTS', category: 'community-ethnic-press' },
  { pattern: 'ASIAN WEEK', category: 'community-ethnic-press' },
  { pattern: 'CENTER FOR ASIAN AMERICAN MEDIA', category: 'community-ethnic-press' },
  // — LGBTQ+
  { pattern: 'BAY AREA REPORTER', category: 'community-ethnic-press' },
  { pattern: 'SAN FRANCISCO BAY TIMES', category: 'community-ethnic-press' },
  // — African American
  { pattern: 'SAN FRANCISCO BAY VIEW', category: 'community-ethnic-press' },
  // — Neighborhood / hyperlocal / SFIMC
  { pattern: 'SF NEIGHBORHOOD NEWSPAPER', category: 'community-ethnic-press' },
  { pattern: 'S F NEIGHBORHOOD NEWSPAPER', category: 'community-ethnic-press' },
  { pattern: 'MISSION LOCAL', category: 'community-ethnic-press' },
  { pattern: 'BROKE-ASS STUART', category: 'community-ethnic-press' },
  { pattern: 'POTRERO VIEW', category: 'community-ethnic-press' },        // OEWD-validated C&E vendor (8.30.22 OEWD file)
  { pattern: 'PIXEL LABS', category: 'community-ethnic-press' },          // Hoodline.com — OEWD-validated C&E vendor (8.30.22 OEWD file)
  { pattern: 'HOODLINE', category: 'community-ethnic-press' },            // secondary pattern for Hoodline — direct-name variant
  // — Multicultural radio
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
  { pattern: 'O\'RORKE', category: 'full-service-agency' },
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

/** Classify a vendor into a media category based on name matching */
export function classifyVendor(vendorName: string): MediaCategory {
  const upper = vendorName.toUpperCase()
  for (const entry of VENDOR_REGISTRY) {
    if (upper.includes(entry.pattern)) return entry.category
  }
  return 'unknown'
}

/** Get category info for display */
export function getCategoryInfo(category: MediaCategory): MediaCategoryInfo {
  return MEDIA_CATEGORIES[category]
}
