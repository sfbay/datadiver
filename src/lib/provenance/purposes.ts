// ZERO-IMPORT LEAF. The closed vocabulary of citable query purposes
// (spec §5.1). Adding a member is a code change: it needs a reader label
// here, a manifest `citable` declaration on a view, and a `cite` tag at the
// call site — sources.test.ts pins all three together.
export const QUERY_PURPOSES = [
  'map-sample',     // the capped rows drawn on the map
  'scope-count',    // count(*) behind "N of M"
  'stat-totals',    // server-side aggregates on stat cards
  'ranking',        // GROUP BY area feeding the sidebar ranking / choropleth
  'breakdown',      // GROUP BY a category column feeding a sidebar list
  'histogram',      // bucketed distribution
  'overlay',        // a secondary layer (cameras, pavement, meter inventory, HIN)
  'freshness',      // MAX(dateField)
  'window-sample',  // The Last 48: the drawn 48h rows, per stream
  'window-count',   // The Last 48: the server count, per stream
  'civic-metric',   // Demographics: the SF civic scatter Y
] as const

export type QueryPurpose = (typeof QUERY_PURPOSES)[number]

export const PURPOSE_LABEL: Record<QueryPurpose, string> = {
  'map-sample': "What's drawn on the map",
  'scope-count': 'Rows in this scope',
  'stat-totals': 'Totals',
  ranking: 'Ranking',
  breakdown: 'Breakdown',
  histogram: 'Distribution',
  overlay: 'Overlay layer',
  freshness: 'Newest date',
  'window-sample': '48-hour window (drawn)',
  'window-count': '48-hour window (count)',
  'civic-metric': 'Civic metric',
}

export function isQueryPurpose(s: string): s is QueryPurpose {
  return (QUERY_PURPOSES as readonly string[]).includes(s)
}
