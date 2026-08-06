import { createHourlyPatternHook } from '@/hooks/useHourlyPatternFactory'
import { OAK_HOUR_EXPR, bucketToHour } from './citationsDialect'

/** Lives in the VIEW layer (not the factory file) because it consumes real
 *  dialect values — the factory must stay dialect-import-free. NEW placement,
 *  not the crime precedent (crime's countExpr is a literal string). */
export const useOaklandCitationHourlyPattern = createHourlyPatternHook(
  {
    datasetKey: 'parkingCitations',
    dateField: 'ticket_iss',
    cityId: 'oakland',
    hourExpr: OAK_HOUR_EXPR,
    mapHourValue: bucketToHour,
    // ~58 buckets × 7 days ≈ 406 group rows — the default 200 would silently truncate.
    limit: 800,
  },
  'useOaklandCitationHourlyPattern'
)
