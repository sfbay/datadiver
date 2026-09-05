// src/lib/provenance/downloads.ts
// ZERO-IMPORT LEAF. The publisher's own files, built from host + id — never
// by string-replacing '.json?' (highInjuryNetwork is .geojson). Never
// /api/geospatial/<id>?method=export (dead: returns a truncated 200).
export const csvUrl = (host: string, id: string, queryString: string) => `https://${host}/resource/${id}.csv?${queryString}`
export const fullCsvUrl = (host: string, id: string) => `https://${host}/api/views/${id}/rows.csv?accessType=DOWNLOAD`
export const geojsonUrl = (host: string, id: string, limit: number) => `https://${host}/resource/${id}.geojson?%24limit=${limit}`
export const portalPageUrl = (host: string, id: string) => `https://${host}/d/${id}`
