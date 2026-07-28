import { describe, it, expect } from 'vitest'
import { prompt, markdown } from '../src/index'

/**
 * The nine formatting changes in 0.3.0, both sides.
 *
 * Replaces the Phase 0 `quirks.test.ts`, which pinned these as defects. Each
 * block below asserts the corrected default rendering AND that
 * `markdown({ strict: true })` still reproduces the pre-0.3.0 bytes.
 *
 * Every row here is an approved entry in PLAN-0.3.0.md §6. If a diff shows up
 * anywhere else in the suite, it is a bug — not a decision.
 */

const strict = markdown({ strict: true })

describe('row 1 — separator() spacing', () => {
  it('renders a clean rule', () => {
    expect(prompt().raw('a').separator().raw('b').build()).toBe('a\n\n---\n\nb')
  })

  it('strict reproduces the doubled newlines', () => {
    expect(prompt().raw('a').separator().raw('b').build(strict)).toBe('a\n\n\n---\n\n\nb')
  })
})

describe('row 2 — empty inputs no longer emit blank parts', () => {
  it('keyValues({}) contributes nothing', () => {
    expect(prompt().raw('a').keyValues({}).raw('b').build()).toBe('a\n\nb')
  })

  it('limitedList([], n) contributes nothing', () => {
    expect(prompt().raw('a').limitedList([], 5).raw('b').build()).toBe('a\n\nb')
  })

  it('analysisRequirements with no requirements contributes nothing', () => {
    expect(prompt().analysisRequirements('D', []).build()).toBe('## Analysis Requirements\n\nD')
  })

  it('strict reproduces the stray blank lines', () => {
    expect(prompt().raw('a').keyValues({}).raw('b').build(strict)).toBe('a\n\n\n\nb')
    expect(prompt().raw('a').limitedList([], 5).raw('b').build(strict)).toBe('a\n\n\n\nb')
  })
})

describe('row 3 — table cells are escaped', () => {
  it('escapes pipes in cells and headers', () => {
    expect(prompt().table(['A', 'B'], [['a|b', 'c']]).build()).toBe(
      '| A | B |\n|---|---|\n| a\\|b | c |',
    )
  })

  it('collapses newlines so a cell cannot split the row', () => {
    expect(prompt().table(['A'], [['x\ny']]).build()).toBe('| A |\n|---|\n| x y |')
  })

  it('strict reproduces the corrupted table', () => {
    expect(prompt().table(['A', 'B'], [['a|b', 'c']]).build(strict)).toBe(
      '| A | B |\n|---|---|\n| a|b | c |',
    )
  })
})

describe('row 4 — section() and field() unified', () => {
  it('both render with the colon inside the bold span', () => {
    expect(prompt().section('L', 'v').build()).toBe('**L:** v')
    expect(prompt().field('L', 'v').build()).toBe('**L:** v')
    expect(prompt().booleanField('L', true).build()).toBe('**L:** Yes')
    expect(prompt().inlineList('L', ['a']).build()).toBe('**L:** a')
  })

  it('strict reproduces the split', () => {
    expect(prompt().section('L', 'v').build(strict)).toBe('**L:** v')
    expect(prompt().field('L', 'v').build(strict)).toBe('**L**: v')
    expect(prompt().booleanField('L', true).build(strict)).toBe('**L**: Yes')
    expect(prompt().inlineList('L', ['a']).build(strict)).toBe('**L**: a')
  })
})

describe('row 5 — workedExamples() XML is tight', () => {
  const example = {
    context: 'C',
    mention: 'M',
    protocol: 'P',
    toolCalls: ['t'],
    response: 'R',
  }

  it('has no blank lines between wrapper and children', () => {
    const out = prompt().workedExamples([example]).build()
    expect(out).toContain('<examples>\n<example>')
    expect(out).toContain('</example>\n</examples>')
  })

  it('strict reproduces the blank lines', () => {
    const out = prompt().workedExamples([example]).build(strict)
    expect(out).toContain('<examples>\n\n<example>')
    expect(out).toContain('</example>\n\n</examples>')
  })

  it('leaves the individual example blocks unchanged', () => {
    expect(prompt().workedExample(example).build()).toBe(
      prompt().workedExample(example).build(strict),
    )
  })
})

describe('row 6 — severityScale() emits one list', () => {
  const levels = [
    { level: 'P0', description: 'Critical' },
    { level: 'P1', description: 'High' },
  ]

  it('renders tight bullets like every other list', () => {
    expect(prompt().severityScale('Sev', levels).build()).toBe(
      '### Sev\n\n- **P0**: Critical\n- **P1**: High',
    )
  })

  it('strict reproduces the blank lines between bullets', () => {
    expect(prompt().severityScale('Sev', levels).build(strict)).toBe(
      '### Sev\n\n- **P0**: Critical\n\n- **P1**: High',
    )
  })

  it('emits only the heading for no levels, in both modes', () => {
    expect(prompt().severityScale('Sev', []).build()).toBe('### Sev')
    expect(prompt().severityScale('Sev', []).build(strict)).toBe('### Sev')
  })
})

describe('row 7 — filesList() pluralises correctly', () => {
  it('says "1 file" for one and "2 files" for two', () => {
    expect(prompt().filesList('Changed', [{ filename: 'a.ts' }]).build()).toBe(
      '## Changed (1 file)\n\n- a.ts',
    )
    expect(
      prompt()
        .filesList('Changed', [{ filename: 'a.ts' }, { filename: 'b.ts' }])
        .build(),
    ).toBe('## Changed (2 files)\n\n- a.ts\n- b.ts')
  })

  it('strict reproduces "1 files"', () => {
    expect(prompt().filesList('Changed', [{ filename: 'a.ts' }]).build(strict)).toBe(
      '## Changed (1 files)\n\n- a.ts',
    )
  })
})

describe('row 8 — empty lookupTable is dropped', () => {
  it('emits nothing, matching table()', () => {
    expect(prompt().lookupTable({ columns: ['K', 'V'], rows: [] }).build()).toBe('')
    expect(prompt().table(['K', 'V'], []).build()).toBe('')
  })

  it('propagates to every generator built on it', () => {
    expect(prompt().toolGuidance([]).build()).toBe('## Available Tools')
    expect(prompt().confidenceScale([]).build()).toBe('## Confidence Scoring')
  })

  it('strict reproduces the header-only table', () => {
    expect(prompt().lookupTable({ columns: ['K', 'V'], rows: [] }).build(strict)).toBe(
      '| K | V |\n|---|---|',
    )
    expect(prompt().toolGuidance([]).build(strict)).toBe(
      '## Available Tools\n\n| Tool | Usage |\n|---|---|',
    )
  })
})

describe('row 9 — including an empty builder contributes nothing', () => {
  it('adds no blank line', () => {
    expect(prompt().raw('a').include(prompt()).build()).toBe('a')
  })

  it('applies to conditional() too', () => {
    expect(
      prompt()
        .raw('a')
        .conditional(true, (b) => b)
        .build(),
    ).toBe('a')
  })

  it('strict reproduces the stray blank line', () => {
    expect(prompt().raw('a').include(prompt()).build(strict)).toBe('a\n\n')
  })
})

describe('unchanged paths render identically in both modes', () => {
  it('headings, lists, code, tags, protocols, roles', () => {
    const build = (d?: ReturnType<typeof markdown>) =>
      prompt()
        .role('analyst')
        .heading('H', 2)
        .list(['a', 'b'])
        .numberedList('T', ['x'])
        .codeBlock('const x = 1', 'ts')
        .tag('context', 'body')
        .protocol({
          name: 'P',
          triggers: ['t'],
          steps: [{ label: 'S', description: 'D', actions: ['a'] }],
          followThrough: 'F',
        })
        .arrowRules({ title: 'AR', types: [{ name: 'N', description: 'D', rules: ['r'] }] })
        .build(d)

    expect(build()).toBe(build(strict))
  })
})
