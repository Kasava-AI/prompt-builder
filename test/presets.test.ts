import { describe, it, expect } from 'vitest'
import { prompt, markdown } from '../src/index'
import {
  toolGuidance,
  gracefulDegradation,
  followThroughMatrix,
  analysisRequirements,
  workedExample,
  workedExamples,
} from '../src/presets'

/**
 * The five domain generators now live in `/presets`, with deprecated shims left
 * on `PromptBuilder`. The shims must produce byte-identical output — that is the
 * entire promise of moving them, so every case below asserts both forms agree.
 */

const EXAMPLE = {
  context: 'GitHub issue #214',
  mention: '@kasava is this still relevant?',
  protocol: 'Issue Closure Assessment',
  toolCalls: ["commitTool({ action: 'related' })"],
  response: '**NO** — still relevant.',
}

describe('toolGuidance()', () => {
  const tools = [{ tool: 'searchShows', usage: 'Find a show' }]

  it('renders a Tool/Usage table', () => {
    expect(prompt().include(toolGuidance(tools)).build()).toBe(
      '## Available Tools\n\n| Tool | Usage |\n|---|---|\n| searchShows | Find a show |',
    )
  })

  it('accepts a custom title', () => {
    expect(prompt().include(toolGuidance(tools, 'Toolbox')).build()).toContain('## Toolbox')
  })

  it('matches the deprecated method', () => {
    expect(prompt().include(toolGuidance(tools)).build()).toBe(prompt().toolGuidance(tools).build())
    expect(prompt().include(toolGuidance(tools, 'T')).build()).toBe(
      prompt().toolGuidance(tools, 'T').build(),
    )
  })
})

describe('gracefulDegradation()', () => {
  const rules = ['Continue on tool failure.', 'Report what you found.']

  it('renders a titled list', () => {
    expect(prompt().include(gracefulDegradation(rules)).build()).toBe(
      '## Graceful Degradation\n\n- Continue on tool failure.\n- Report what you found.',
    )
  })

  it('matches the deprecated method', () => {
    expect(prompt().include(gracefulDegradation(rules)).build()).toBe(
      prompt().gracefulDegradation(rules).build(),
    )
    expect(prompt().include(gracefulDegradation(rules, 'Fallbacks')).build()).toBe(
      prompt().gracefulDegradation(rules, 'Fallbacks').build(),
    )
  })
})

describe('followThroughMatrix()', () => {
  const opts = {
    title: 'Follow-through',
    rows: [{ action: 'Closed issue', followThrough: 'Offer a recap' }],
    postRule: 'Always offer exactly one next step.',
  }

  it('renders the fixed column names and the trailing rule', () => {
    expect(prompt().include(followThroughMatrix(opts)).build()).toBe(
      '## Follow-through\n\n| Completed action | Follow-through offer |\n|---|---|\n' +
        '| Closed issue | Offer a recap |\n\nAlways offer exactly one next step.',
    )
  })

  it('matches the deprecated method', () => {
    expect(prompt().include(followThroughMatrix(opts)).build()).toBe(
      prompt().followThroughMatrix(opts).build(),
    )
    const withDesc = { ...opts, description: 'D' }
    expect(prompt().include(followThroughMatrix(withDesc)).build()).toBe(
      prompt().followThroughMatrix(withDesc).build(),
    )
  })
})

describe('analysisRequirements()', () => {
  it('renders description and numbered requirements', () => {
    expect(prompt().include(analysisRequirements('Do this.', ['One', 'Two'])).build()).toBe(
      '## Analysis Requirements\n\nDo this.\n\n1. One\n2. Two',
    )
  })

  it('appends a JSON structure', () => {
    expect(prompt().include(analysisRequirements('D', ['One'], { a: 1 })).build()).toContain(
      '```json\n{\n  "a": 1\n}\n```',
    )
  })

  it('matches the deprecated method across every shape', () => {
    const cases: Array<[string, string[], object | undefined]> = [
      ['D', ['One', 'Two'], undefined],
      ['D', ['One'], { a: 1 }],
      ['D', [], undefined],
      ['D', [], { a: 1 }],
    ]
    for (const [desc, reqs, json] of cases) {
      expect(prompt().include(analysisRequirements(desc, reqs, json)).build()).toBe(
        prompt().analysisRequirements(desc, reqs, json).build(),
      )
    }
  })

  it('preserves the legacy empty part under strict mode', () => {
    const strict = markdown({ strict: true })
    expect(prompt().include(analysisRequirements('D', [])).build(strict)).toBe(
      prompt().analysisRequirements('D', []).build(strict),
    )
  })
})

describe('workedExample()', () => {
  it('renders one XML block', () => {
    expect(prompt().include(workedExample(EXAMPLE)).build()).toContain('<example>')
  })

  it('matches the deprecated method', () => {
    expect(prompt().include(workedExample(EXAMPLE)).build()).toBe(
      prompt().workedExample(EXAMPLE).build(),
    )
  })
})

describe('workedExamples()', () => {
  it('wraps in <examples> under a heading', () => {
    const out = prompt().include(workedExamples([EXAMPLE])).build()
    expect(out).toContain('## Worked Examples')
    expect(out).toContain('<examples>\n<example>')
  })

  it('matches the deprecated method', () => {
    expect(prompt().include(workedExamples([EXAMPLE])).build()).toBe(
      prompt().workedExamples([EXAMPLE]).build(),
    )
    expect(prompt().include(workedExamples([], 'Samples')).build()).toBe(
      prompt().workedExamples([], 'Samples').build(),
    )
  })

  it('matches under strict mode, legacy spacing included', () => {
    const strict = markdown({ strict: true })
    expect(prompt().include(workedExamples([EXAMPLE])).build(strict)).toBe(
      prompt().workedExamples([EXAMPLE]).build(strict),
    )
    expect(prompt().include(workedExamples([EXAMPLE])).build(strict)).toContain(
      '<examples>\n\n<example>',
    )
  })
})

describe('node() — the escape hatch presets are built on', () => {
  it('appends an arbitrary AST node', () => {
    expect(prompt().node({ kind: 'heading', level: 1, text: 'H' }).build()).toBe('# H')
  })

  it('composes with the fluent API', () => {
    expect(
      prompt()
        .raw('before')
        .node({ kind: 'rule', style: 'dash' })
        .raw('after')
        .build(),
    ).toBe('before\n\n---\n\nafter')
  })
})
