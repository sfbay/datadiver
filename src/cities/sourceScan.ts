// TEST-ONLY. Imports node:fs — never import this from app code.
// Scans view source files for the dataset keys they fetch and the cite
// purposes they tag, so sources.test.ts can pin manifest ⇔ code.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, dirname, extname, sep } from 'node:path'

const FETCH_RE = /\b(?:useDataset|fetchDataset)(?:<[^();]*?>)?\(\s*('([A-Za-z0-9]+)'|[^'\s)])/g
const IMPORT_RE = /from\s+'((?:\.{1,2}\/|@\/(?:hooks|views|components)\/)[^']+)'/g
const CITE_RE = /\bcite:\s*\{([^}]*)\}/g

function listFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...listFiles(p))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

function resolveImport(fromFile: string, spec: string, root: string): string | null {
  const base = spec.startsWith('@/') ? join(root, 'src', spec.slice(2)) : resolve(dirname(fromFile), spec)
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    try { if (statSync(cand).isFile() && extname(cand)) return cand } catch { /* next */ }
  }
  return null
}

/** Every non-test .ts/.tsx under viewDir, plus every module those files
 *  import TRANSITIVELY by a relative path or from @/hooks, @/views,
 *  @/components — minus the cross-cutting allow-list (basenames), applied at
 *  every hop. This codebase's common shape is view → component → hook (depth
 *  2+): a one-level walk was blind to it (a real, uncredited-source bug —
 *  see sources.test.ts's history). Bounded to `<root>/src` so a walk can
 *  never wander into node_modules or above the source tree. */
export function collectScanSet(viewDir: string, opts: { root: string; allow: readonly string[] }): string[] {
  const srcRoot = join(opts.root, 'src') + sep
  const own = listFiles(viewDir)
  const visited = new Set<string>(own)
  const queue = [...own]
  while (queue.length > 0) {
    const file = queue.shift()!
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(IMPORT_RE)) {
      const target = resolveImport(file, m[1], opts.root)
      if (!target) continue
      if (opts.allow.some((a) => target.endsWith(`/${a}.ts`) || target.endsWith(`/${a}.tsx`))) continue
      if (!target.startsWith(srcRoot)) continue
      if (visited.has(target)) continue
      visited.add(target)
      queue.push(target)
    }
  }
  return [...visited].sort()
}

export function scanFetchedKeys(
  sources: { file: string; text: string }[],
  resolved: Record<string, readonly string[]>,
): { keys: Set<string>; unresolved: { file: string; line: number }[] } {
  const keys = new Set<string>()
  const unresolved: { file: string; line: number }[] = []
  for (const { file, text } of sources) {
    for (const k of resolved[file] ?? []) keys.add(k)
    for (const m of text.matchAll(FETCH_RE)) {
      if (m[2]) keys.add(m[2])
      else if (!(file in resolved)) unresolved.push({ file, line: text.slice(0, m.index).split('\n').length })
    }
  }
  return { keys, unresolved }
}

export function scanCitePurposes(sources: { file: string; text: string }[], known: readonly string[]): Set<string> {
  const out = new Set<string>()
  const knownSet = new Set(known)
  for (const { text } of sources) {
    for (const m of text.matchAll(CITE_RE)) {
      for (const lit of m[1].matchAll(/'([a-z0-9-]+)'/g)) if (knownSet.has(lit[1])) out.add(lit[1])
    }
  }
  return out
}
