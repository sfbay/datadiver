// Stance is PARSED from a committee's registered name — there is no stance
// column. Every surface that shows a chip says so (spec §5).
export type StanceKind = 'candidate' | 'yes' | 'no' | 'measure' | 'pac'
export interface Stance { kind: StanceKind; measure?: string; also?: { kind: 'yes' | 'no'; measure: string } }

const MEASURE = String.raw`(?:on\s+)?(?:prop(?:osition)?\.?\s*)?([A-Z]{1,2}|\d{1,3})\b`
const YES = new RegExp(String.raw`\b(?:yes|support(?:ing)?)\s+${MEASURE}`, 'i')
const YES_FOR = new RegExp(String.raw`\bfor\s+yes\s+${MEASURE}`, 'i')
const NO = new RegExp(String.raw`\b(?:no|oppos(?:e|ing)|against)\s+${MEASURE}`, 'i')

export function parseStance(filerName: string, filerType: string | undefined): Stance {
  if (filerType && /candidate/i.test(filerType)) return { kind: 'candidate' }
  const yes = YES_FOR.exec(filerName) ?? YES.exec(filerName)
  const no = NO.exec(filerName)
  const yesM = yes?.[1]?.toUpperCase()
  const noM = no?.[1]?.toUpperCase()
  if (yesM && noM) {
    return yes!.index <= no!.index
      ? { kind: 'yes', measure: yesM, also: { kind: 'no', measure: noM } }
      : { kind: 'no', measure: noM, also: { kind: 'yes', measure: yesM } }
  }
  if (yesM) return { kind: 'yes', measure: yesM }
  if (noM) return { kind: 'no', measure: noM }
  if (filerType && /measure/i.test(filerType)) return { kind: 'measure' }
  return { kind: 'pac' }
}

function one(kind: 'yes' | 'no', m: string): string { return `${kind === 'yes' ? 'Yes' : 'No'} on ${m}` }

export function stanceChip(s: Stance): string {
  if (s.kind === 'candidate') return 'candidate'
  if (s.kind === 'measure') return 'measure'
  if (s.kind === 'pac') return 'PAC'
  const head = one(s.kind, s.measure ?? '?')
  return s.also ? `${head} · ${one(s.also.kind, s.also.measure)}` : head
}
