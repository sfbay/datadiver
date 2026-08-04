/** Back-compat re-export. The registry now lives per-city under src/cities/;
 *  this module keeps the import surface its 9 consumers were written against.
 *  DatasetKey stays effectively `string` (the old Record<string,…> annotation
 *  widened keyof) — do not tighten here; parked follow-up. */
export type { DatasetConfig } from '@/cities/types'
import { CITIES } from '@/cities/registry'
export const DATASETS = CITIES.sf.datasets
export type DatasetKey = keyof typeof DATASETS  // = string, as before
