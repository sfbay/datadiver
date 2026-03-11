/** Plain-language explanations for data terms used across the app.
 *  Keys match the `info` prop on StatCard and can be used with <InfoTip>. */

const GLOSSARY: Record<string, string> = {
  // Response & dispatch
  'avg-response':
    'The average time from when a 911 call is received to when a unit arrives on scene. Lower is better — the city targets under 5 minutes for life-threatening calls.',
  'median':
    'The middle value when all response times are sorted. Unlike the average, one extremely slow response won\'t skew this number. Half of responses were faster, half were slower.',
  '90th-pctl':
    '90% of responses were faster than this time. This captures the "worst typical" experience — only 1 in 10 calls waited longer.',
  'avg-apot':
    'Average Ambulance Patient Offload Time — how long a patient waits on the ambulance at the hospital before being transferred to ER staff. Long times signal ER overcrowding.',
  'sensitive-pct':
    'Percentage of calls flagged as sensitive by SFPD (e.g., mental health, domestic violence). These call types are redacted from public data to protect privacy.',
  'peak-hour':
    'The hour of day with the highest call volume. Helps identify when demand is greatest and resources are most stretched.',

  // Counts & totals
  'total-calls': 'Total number of 911 dispatch records in the selected date range.',
  'total-cases': 'Total 311 service requests filed with the city in the selected date range.',
  'total-incidents': 'Total SFPD incident reports filed in the selected period. One incident can involve multiple report types.',
  'total-crashes': 'Total traffic collisions reported to SFPD in the selected period.',
  'total-citations': 'Total parking citations issued by SFMTA in the selected period.',
  'total-revenue': 'Total parking meter revenue collected across all meters in the selected period.',
  'transactions': 'Number of individual parking meter payment sessions (coin, card, or app).',

  // Parking
  'avg-per-meter': 'Average revenue per active parking meter. Calculated by dividing total revenue by the number of meters that recorded at least one transaction.',
  'active-meters': 'Number of meters that recorded at least one transaction in the selected period. SF has ~28,000 metered spaces total.',
  'fine-revenue': 'Total dollar amount of parking fines issued. Note: this is fines issued, not necessarily collected — some are contested or unpaid.',
  'avg-fine': 'Average fine amount per citation. SF parking fines range from $74 for expired meters to $110+ for blocking bike lanes or hydrants.',
  'out-of-state': 'Percentage of citations issued to vehicles with non-California plates. Can indicate tourist/visitor parking patterns.',

  // Crime
  '911-linked': 'Percentage of SFPD incident reports that have a matching 911 dispatch call number. Reports without a link were filed directly (walk-in, online, officer-initiated).',
  'top-category': 'The most frequently reported incident category in the selected period (e.g., Larceny Theft, Assault, Burglary).',

  // 311
  'open-cases': 'Service requests that haven\'t been marked as closed or resolved. A high open count may indicate a backlog.',
  'avg-resolution': 'Average time from when a 311 request was filed to when the city marked it as resolved. Measured in hours or days depending on the scale.',

  // Traffic safety
  'injuries': 'Total people injured across all reported traffic collisions, including drivers, passengers, pedestrians, and cyclists.',
  'fatalities': 'Total people killed in traffic collisions. Part of SF\'s Vision Zero goal to eliminate traffic deaths.',
  'ped-bike-pct': 'Percentage of crashes involving a pedestrian or cyclist. These are the most vulnerable road users and a focus of Vision Zero.',

  // Trend indicators
  'yoy':
    'Compares the current period to the same period one year ago. "+12% since last yr" means 12% more than the same timeframe last year. Helps distinguish seasonal patterns from real changes.',
  'z-score':
    'How unusual this value is compared to the past 12 months. Measured in standard deviations (σ). Values above +1σ are notably high, below −1σ are notably low. Think of it as a "weirdness score."',
  'comparison':
    'Side-by-side comparison with a prior period (e.g., 30 or 365 days ago). The delta shows how much the metric changed.',

  // Chart labels
  'heatgrid':
    'A grid showing activity patterns by hour (columns) and day of week (rows). Darker cells mean more activity. Click a cell to filter the data to that time slot.',
  'period-trend':
    'Shows how volume changed over the selected date range. Faded bars behind the main bars show the same period one year ago for comparison.',
  'anomaly-map':
    'Neighborhoods colored by how unusual their current activity is compared to their own 12-month baseline. Red = unusually high, blue = unusually low.',

  // Business Activity
  'net-change':
    'New businesses opened minus businesses closed in the selected period. Positive means the city gained more businesses than it lost.',
  'openings':
    'Businesses that registered a new DBA (doing business as) start date in the selected period.',
  'closures':
    'Businesses whose DBA end date falls within the selected period. This indicates the business registration was terminated.',
  'active-businesses':
    'Total businesses currently registered with no end date — still operating as of the latest data update.',
  'top-sector':
    'The NAICS industry category with the most new business openings in the selected period.',
  'dui-crashes':
    'Crashes where the primary collision factor was driving under the influence of alcohol and/or drugs (California Vehicle Code 23152/23153).',
}

export default GLOSSARY

/** Lookup a glossary entry. Returns undefined if not found. */
export function getGlossaryEntry(key: string): string | undefined {
  return GLOSSARY[key]
}
