// Socrata's SoQL on the Fire/EMS dispatch dataset doesn't expose
// `date_diff_ss`. Compute response seconds via component decomposition:
// (hh*3600 + mm*60 + ss) extracted from each timestamp, subtracted.
export const RESPONSE_SECONDS = (
  '((date_extract_hh(on_scene_dttm) - date_extract_hh(received_dttm)) * 3600 + ' +
  '(date_extract_mm(on_scene_dttm) - date_extract_mm(received_dttm)) * 60 + ' +
  '(date_extract_ss(on_scene_dttm) - date_extract_ss(received_dttm)))'
)

// Same-day filter drops <0.5% of calls that cross midnight, but keeps the
// component-decomposition arithmetic free of negative-diff edge cases.
export const SAME_DAY = (
  'date_extract_y(on_scene_dttm) = date_extract_y(received_dttm) AND ' +
  'date_extract_m(on_scene_dttm) = date_extract_m(received_dttm) AND ' +
  'date_extract_d(on_scene_dttm) = date_extract_d(received_dttm)'
)

// Drop responses < 0s (data errors) or > 2 hours (stale dispatch / data noise)
export const VALID_RESPONSE = `${RESPONSE_SECONDS} > 0 AND ${RESPONSE_SECONDS} < 7200`
