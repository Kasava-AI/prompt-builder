import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname, relative, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The real cross-repo gate.
 *
 * 49 of the ~65 files that consume this library import NOTHING but this library,
 * which means they can be loaded directly with `@kasava/prompt-builder` aliased
 * to local `src/` (see vitest.config.ts). This suite imports each one, evaluates
 * every exported prompt string, and compares against a committed baseline.
 *
 * That makes Phase 1 verifiable against genuine production prompts rather than
 * the hand-modeled shapes in consumer-shapes.test.ts.
 *
 * Regenerate after an intentional change:
 *
 *     UPDATE_CONSUMER_BASELINE=1 pnpm test
 *
 * Then READ THE DIFF. Every changed string must map to an approved row in
 * PLAN-0.3.0.md §6. That review is the gate; the file is just the evidence.
 *
 * If the sibling repos aren't checked out the suite skips rather than fails —
 * the baseline JSON is committed, so CI without them still runs everything else.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '../..')
const SIBLINGS = resolve(REPO_ROOT, '..')
const BASELINE_DIR = resolve(HERE, '__baselines__')
const BASELINE_FILE = join(BASELINE_DIR, 'consumers.json')
const UPDATING = process.env.UPDATE_CONSUMER_BASELINE === '1'

/** Roots scanned for consumer modules, relative to the repos directory. */
const SCAN_ROOTS = [
  'kasava/external/mastra-cloud/src',
  'kasava/prompt-generator/src',
  'monroe/app/src',
]

const IMPORT_RE = /^\s*import\s[\s\S]*?from\s+['"]([^'"]+)['"]/gm

function walk(dir: string, out: string[] = []): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

/** A module is loadable here only if prompt-builder is its ONLY import. */
function isStandaloneConsumer(file: string): boolean {
  let src: string
  try {
    src = readFileSync(file, 'utf8')
  } catch {
    return false
  }
  if (!src.includes('prompt-builder')) return false
  const specifiers = [...src.matchAll(IMPORT_RE)].map((m) => m[1])
  return specifiers.length > 0 && specifiers.every((s) => s.includes('prompt-builder'))
}

function discover(): string[] {
  const found: string[] = []
  for (const root of SCAN_ROOTS) {
    const abs = resolve(SIBLINGS, root)
    if (!existsSync(abs)) continue
    for (const f of walk(abs)) if (isStandaloneConsumer(f)) found.push(f)
  }
  return found.sort()
}

/** Every exported string on a module, plus zero-arg functions returning strings. */
function extractPrompts(mod: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(mod)) {
    if (typeof value === 'string') {
      out[name] = value
    } else if (typeof value === 'function' && value.length === 0) {
      try {
        const result = (value as () => unknown)()
        if (typeof result === 'string') out[name] = result
      } catch {
        // Needs runtime context we don't have — not a baseline candidate.
      }
    }
  }
  return out
}

type Baseline = Record<string, Record<string, string>>

const files = discover()
const captured: Baseline = {}

beforeAll(async () => {
  for (const file of files) {
    const key = relative(SIBLINGS, file)
    try {
      const mod = (await import(/* @vite-ignore */ file)) as Record<string, unknown>
      const prompts = extractPrompts(mod)
      if (Object.keys(prompts).length > 0) captured[key] = prompts
    } catch {
      // Module needs context beyond the library (env, globals). Skipped, and
      // reported by the coverage test below so silent shrinkage is visible.
    }
  }

  if (UPDATING) {
    mkdirSync(BASELINE_DIR, { recursive: true })
    writeFileSync(BASELINE_FILE, JSON.stringify(captured, null, 2) + '\n')
  }
  // Transpiling and importing ~49 modules from other repos overruns the default
  // 5s hook timeout when this file competes with the rest of the suite.
}, 120_000)

const hasBaseline = existsSync(BASELINE_FILE)

describe.skipIf(files.length === 0)('consumer baseline (cross-repo)', () => {
  it('discovers standalone consumer modules in the sibling repos', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.skipIf(!hasBaseline)('every baselined prompt still builds identically', () => {
    const baseline: Baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))

    const mismatches: string[] = []
    for (const [file, prompts] of Object.entries(baseline)) {
      for (const [name, expected] of Object.entries(prompts)) {
        const actual = captured[file]?.[name]
        if (actual === undefined) {
          mismatches.push(`${file} → ${name}: MISSING (module failed to load or export removed)`)
        } else if (actual !== expected) {
          mismatches.push(`${file} → ${name}: CHANGED`)
        }
      }
    }

    expect(mismatches, mismatches.join('\n')).toEqual([])
  })

  it.skipIf(!hasBaseline)('has not silently lost coverage of consumer modules', () => {
    const baseline: Baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
    const baselined = Object.keys(baseline).length
    const nowCaptured = Object.keys(captured).length
    // New consumers are fine; losing existing ones means the gate quietly shrank.
    expect(nowCaptured).toBeGreaterThanOrEqual(baselined)
  })

  /**
   * Load-bearing floor. Without it, a change that broke every dynamic import
   * would leave `captured` empty and the equality test above would pass
   * vacuously — the gate would report green while checking nothing.
   */
  it.skipIf(!hasBaseline)('compares a meaningful volume of real prompt text', () => {
    const baseline: Baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
    const exports = Object.values(baseline).reduce((n, m) => n + Object.keys(m).length, 0)
    const chars = Object.values(baseline).reduce(
      (n, m) => n + Object.values(m).reduce((c, s) => c + s.length, 0),
      0,
    )
    expect(Object.keys(baseline).length).toBeGreaterThanOrEqual(28)
    expect(exports).toBeGreaterThanOrEqual(43)
    expect(chars).toBeGreaterThan(100_000)
  })
})
