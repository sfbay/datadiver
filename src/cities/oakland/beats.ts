/**
 * The 59 OPD police beats — Oakland's area vocabulary (its analogue of
 * SF_NEIGHBORHOODS). Ids are the ZERO-PADDED beat codes that match the
 * vendored asset's `nhood` property and the event datasets' beat fields
 * (`policebeat` on crime, `beat` on 311). 57 standard NN[X/Y/Z] beats
 * plus two special patrol areas: LKM1 (Lake Merritt) and PDT2 (Port).
 * beats.test.ts pins this list against the committed GeoJSON.
 */
export const OAKLAND_BEATS = [
  '01X', '02X', '02Y', '03X', '03Y', '04X', '05X', '05Y',
  '06X', '07X', '08X', '09X', '10X', '10Y', '11X', '12X',
  '12Y', '13X', '13Y', '13Z', '14X', '14Y', '15X', '16X',
  '16Y', '17X', '17Y', '18X', '18Y', '19X', '20X', '21X',
  '21Y', '22X', '22Y', '23X', '24X', '24Y', '25X', '25Y',
  '26X', '26Y', '27X', '27Y', '28X', '29X', '30X', '30Y',
  '31X', '31Y', '31Z', '32X', '32Y', '33X', '34X', '35X',
  '35Y', 'LKM1', 'PDT2',
] as const
