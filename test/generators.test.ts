import { describe, it, expect } from 'vitest'
import { prompt } from '../src/index'

describe('protocol()', () => {
  it('renders only the heading when given no optional fields', () => {
    expect(prompt().protocol({ name: 'X', steps: [] }).build()).toBe('## Protocol: X')
  })

  it('quotes and comma-joins trigger phrases', () => {
    expect(
      prompt()
        .protocol({ name: 'X', triggers: ['a b', 'c'], steps: [] })
        .build(),
    ).toBe("## Protocol: X\n\nTrigger phrases: 'a b', 'c'.")
  })

  it('omits the trigger line for an empty trigger array', () => {
    expect(prompt().protocol({ name: 'X', triggers: [], steps: [] }).build()).toBe('## Protocol: X')
  })

  it('includes a description', () => {
    expect(
      prompt()
        .protocol({ name: 'X', description: 'D', steps: [] })
        .build(),
    ).toBe('## Protocol: X\n\nD')
  })

  it('renders a bare step label', () => {
    expect(
      prompt()
        .protocol({ name: 'X', steps: [{ label: 'Step 1' }] })
        .build(),
    ).toBe('## Protocol: X\n\n**Step 1**')
  })

  it('keeps a step label and description in one part', () => {
    expect(
      prompt()
        .protocol({ name: 'X', steps: [{ label: 'Step 1', description: 'Do it' }] })
        .build(),
    ).toBe('## Protocol: X\n\n**Step 1**\nDo it')
  })

  it('numbers step actions with parenthesised indices', () => {
    expect(
      prompt()
        .protocol({ name: 'X', steps: [{ label: 'Step 1', actions: ['a', 'b'] }] })
        .build(),
    ).toBe('## Protocol: X\n\n**Step 1**\n(1) a\n(2) b')
  })

  it('ignores an empty actions array', () => {
    expect(
      prompt()
        .protocol({ name: 'X', steps: [{ label: 'Step 1', actions: [] }] })
        .build(),
    ).toBe('## Protocol: X\n\n**Step 1**')
  })

  it('separates multiple steps with a blank line', () => {
    expect(
      prompt()
        .protocol({ name: 'X', steps: [{ label: 'S1' }, { label: 'S2' }] })
        .build(),
    ).toBe('## Protocol: X\n\n**S1**\n\n**S2**')
  })

  it('renders an output format block', () => {
    expect(
      prompt()
        .protocol({ name: 'X', steps: [], outputFormat: 'JSON' })
        .build(),
    ).toBe('## Protocol: X\n\n**Output format:**\nJSON')
  })

  it('renders a follow-through line in single quotes', () => {
    expect(
      prompt()
        .protocol({ name: 'X', steps: [], followThrough: 'Want more?' })
        .build(),
    ).toBe("## Protocol: X\n\nEnd with: 'Want more?'")
  })

  it('renders every field together in declaration order', () => {
    expect(
      prompt()
        .protocol({
          name: 'Full',
          triggers: ['t'],
          description: 'D',
          steps: [{ label: 'S1', description: 'SD', actions: ['a'] }],
          outputFormat: 'OF',
          followThrough: 'FT',
        })
        .build(),
    ).toBe(
      "## Protocol: Full\n\nTrigger phrases: 't'.\n\nD\n\n**S1**\nSD\n(1) a\n\n" +
        "**Output format:**\nOF\n\nEnd with: 'FT'",
    )
  })
})

describe('arrowRules()', () => {
  it('renders a title and arrow-prefixed rules', () => {
    expect(
      prompt()
        .arrowRules({ title: 'T', types: [{ name: 'N', rules: ['r1', 'r2'] }] })
        .build(),
    ).toBe('## T\n\n**N**\n→ r1\n→ r2')
  })

  it('appends an em-dash description to the type label', () => {
    expect(
      prompt()
        .arrowRules({ title: 'T', types: [{ name: 'N', description: 'D', rules: ['r'] }] })
        .build(),
    ).toBe('## T\n\n**N** — D\n→ r')
  })

  it('includes an introduction between title and types', () => {
    expect(
      prompt()
        .arrowRules({ title: 'T', introduction: 'I', types: [{ name: 'N', rules: ['r'] }] })
        .build(),
    ).toBe('## T\n\nI\n\n**N**\n→ r')
  })

  it('appends numbered post-rules', () => {
    expect(
      prompt()
        .arrowRules({ title: 'T', types: [{ name: 'N', rules: ['r'] }], postRules: ['p1', 'p2'] })
        .build(),
    ).toBe('## T\n\n**N**\n→ r\n\n1. p1\n2. p2')
  })

  it('ignores an empty post-rules array', () => {
    expect(
      prompt()
        .arrowRules({ title: 'T', types: [{ name: 'N', rules: ['r'] }], postRules: [] })
        .build(),
    ).toBe('## T\n\n**N**\n→ r')
  })

  it('renders a title alone when there are no types', () => {
    expect(prompt().arrowRules({ title: 'T', types: [] }).build()).toBe('## T')
  })
})

describe('role()', () => {
  it('uses "a" before a consonant', () => {
    expect(prompt().role('developer').build()).toBe('You are a developer.')
  })

  it('uses "an" before a vowel', () => {
    expect(prompt().role('engineer').build()).toBe('You are an engineer.')
  })

  it('matches the vowel test case-insensitively', () => {
    expect(prompt().role('Architect').build()).toBe('You are an Architect.')
  })

  it('appends an optional task clause', () => {
    expect(prompt().role('developer', 'writing tests').build()).toBe(
      'You are a developer writing tests.',
    )
  })

  it('appends a task clause after an "an" article', () => {
    expect(prompt().role('analyst', 'reviewing data').build()).toBe(
      'You are an analyst reviewing data.',
    )
  })
})

describe('confidenceScale()', () => {
  it('renders the four default tiers', () => {
    expect(prompt().confidenceScale().build()).toBe(
      '## Confidence Scoring\n\n' +
        '| Range | Interpretation |\n' +
        '|---|---|\n' +
        '| 0.9–1.0 | Certain — direct evidence or exact match |\n' +
        '| 0.7–0.89 | Probable — strong contextual match |\n' +
        '| 0.5–0.69 | Possible — related but indirect |\n' +
        '| Below 0.5 | Do not include — too weak |',
    )
  })

  it('accepts custom tiers', () => {
    expect(
      prompt()
        .confidenceScale([{ range: 'hi', label: 'good' }])
        .build(),
    ).toBe('## Confidence Scoring\n\n| Range | Interpretation |\n|---|---|\n| hi | good |')
  })

  // `(tiers || defaultTiers)` — an empty array is truthy, so [] does NOT fall
  // back to the defaults. Deliberately left alone for 0.3.0: changing it would
  // be a behavior change, not a formatting fix. The empty table it produced is
  // now dropped though (§6 row 8), leaving just the heading.
  it('renders only the heading for an empty tier array rather than falling back', () => {
    expect(prompt().confidenceScale([]).build()).toBe('## Confidence Scoring')
  })

  it('falls back to the defaults only for undefined', () => {
    expect(prompt().confidenceScale(undefined).build()).toContain('| 0.9–1.0 |')
  })
})

describe('severityScale()', () => {
  it('uses a level-3 heading and one tight bullet list (§6 row 6)', () => {
    expect(
      prompt()
        .severityScale('Sev', [
          { level: 'P0', description: 'Critical' },
          { level: 'P1', description: 'High' },
        ])
        .build(),
    ).toBe('### Sev\n\n- **P0**: Critical\n- **P1**: High')
  })

  it('renders the heading alone for an empty level list', () => {
    expect(prompt().severityScale('Sev', []).build()).toBe('### Sev')
  })
})

describe('investigationStrategy()', () => {
  it('numbers phases from 1 under a default title', () => {
    expect(
      prompt()
        .investigationStrategy([{ name: 'Discover' }, { name: 'Assess' }])
        .build(),
    ).toBe('## Investigation Strategy\n\n### Phase 1: Discover\n\n### Phase 2: Assess')
  })

  it('accepts a custom title', () => {
    expect(prompt().investigationStrategy([], 'Plan').build()).toBe('## Plan')
  })

  it('includes a phase description', () => {
    expect(
      prompt()
        .investigationStrategy([{ name: 'D', description: 'Desc' }])
        .build(),
    ).toBe('## Investigation Strategy\n\n### Phase 1: D\n\nDesc')
  })

  it('renders phase steps as a bullet list', () => {
    expect(
      prompt()
        .investigationStrategy([{ name: 'D', steps: ['s1', 's2'] }])
        .build(),
    ).toBe('## Investigation Strategy\n\n### Phase 1: D\n\n- s1\n- s2')
  })

  it('ignores an empty steps array', () => {
    expect(
      prompt()
        .investigationStrategy([{ name: 'D', steps: [] }])
        .build(),
    ).toBe('## Investigation Strategy\n\n### Phase 1: D')
  })
})

describe('gracefulDegradation()', () => {
  it('renders a default title with the rules', () => {
    expect(prompt().gracefulDegradation(['r1']).build()).toBe('## Graceful Degradation\n\n- r1')
  })

  it('accepts a custom title', () => {
    expect(prompt().gracefulDegradation(['r1'], 'Fallbacks').build()).toBe('## Fallbacks\n\n- r1')
  })
})

describe('verificationChecklist()', () => {
  it('renders a default title, lead-in, and items', () => {
    expect(prompt().verificationChecklist(['i1']).build()).toBe(
      '## Pre-Return Checklist\n\nBefore returning your output, verify:\n\n- i1',
    )
  })

  it('accepts a custom title', () => {
    expect(prompt().verificationChecklist(['i1'], 'Checks').build()).toBe(
      '## Checks\n\nBefore returning your output, verify:\n\n- i1',
    )
  })
})

describe('toolGuidance()', () => {
  it('renders a Tool/Usage lookup table under a default title', () => {
    expect(
      prompt()
        .toolGuidance([{ tool: 'search', usage: 'Find things' }])
        .build(),
    ).toBe('## Available Tools\n\n| Tool | Usage |\n|---|---|\n| search | Find things |')
  })

  it('drops the table entirely when there are no tools (§6 row 8)', () => {
    expect(prompt().toolGuidance([], 'Toolbox').build()).toBe('## Toolbox')
  })
})

describe('outputFormat()', () => {
  it('renders a default title, lead-in, and typed field bullets', () => {
    expect(
      prompt()
        .outputFormat([{ field: 'score', type: 'number', description: '0-1' }])
        .build(),
    ).toBe(
      '## Output Format\n\nYou must return structured output with:\n\n- **score** (number): 0-1',
    )
  })

  it('accepts a custom title', () => {
    expect(
      prompt()
        .outputFormat([{ field: 'a', type: 'string', description: 'd' }], 'Shape')
        .build(),
    ).toBe('## Shape\n\nYou must return structured output with:\n\n- **a** (string): d')
  })
})

describe('guidelines()', () => {
  it('renders a default title with the items', () => {
    expect(prompt().guidelines(['g1']).build()).toBe('## Important Guidelines\n\n- g1')
  })

  it('accepts a custom title', () => {
    expect(prompt().guidelines(['g1'], 'Rules').build()).toBe('## Rules\n\n- g1')
  })
})

describe('workedExample()', () => {
  it('emits one XML block with newline-separated subtags', () => {
    expect(
      prompt()
        .workedExample({
          context: 'C',
          mention: 'M',
          protocol: 'P',
          toolCalls: ['t1', 't2'],
          response: 'R',
        })
        .build(),
    ).toBe(
      '<example>\n' +
        '<context>C</context>\n' +
        '<mention>M</mention>\n' +
        '<protocol>P</protocol>\n' +
        '<tool_calls>\n1. t1\n2. t2\n</tool_calls>\n' +
        '<ideal_response>\nR\n</ideal_response>\n' +
        '</example>',
    )
  })

  it('leaves tool_calls empty when there are no calls', () => {
    expect(
      prompt()
        .workedExample({ context: 'C', mention: 'M', protocol: 'P', toolCalls: [], response: 'R' })
        .build(),
    ).toContain('<tool_calls>\n\n</tool_calls>')
  })
})

describe('workedExamples()', () => {
  it('wraps examples tightly in <examples> with a default heading (§6 row 5)', () => {
    expect(
      prompt()
        .workedExamples([
          { context: 'C', mention: 'M', protocol: 'P', toolCalls: ['t'], response: 'R' },
        ])
        .build(),
    ).toBe(
      '## Worked Examples\n\n<examples>\n' +
        '<example>\n<context>C</context>\n<mention>M</mention>\n<protocol>P</protocol>\n' +
        '<tool_calls>\n1. t\n</tool_calls>\n<ideal_response>\nR\n</ideal_response>\n</example>\n' +
        '</examples>',
    )
  })

  it('accepts a custom title', () => {
    expect(prompt().workedExamples([], 'Samples').build()).toBe(
      '## Samples\n\n<examples>\n</examples>',
    )
  })
})
