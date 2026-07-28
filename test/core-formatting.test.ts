import { describe, it, expect } from 'vitest'
import { prompt } from '../src/index'

/**
 * Characterization tests for the corrected (0.3.0) rendering.
 *
 * Where 0.3.0 intentionally changed formatting, the change is an approved row
 * in PLAN-0.3.0.md §6 and the pre-0.3.0 output is still reachable through
 * `markdown({ strict: true })` — both sides are proven in
 * formatting-corrections.test.ts.
 */

describe('heading()', () => {
  it('defaults to level 2', () => {
    expect(prompt().heading('Title').build()).toBe('## Title')
  })

  it('renders level 1', () => {
    expect(prompt().heading('Title', 1).build()).toBe('# Title')
  })

  it('renders level 3', () => {
    expect(prompt().heading('Title', 3).build()).toBe('### Title')
  })
})

describe('section()', () => {
  it('renders a bold title with the colon inside the bold span', () => {
    expect(prompt().section('Customer', 'Acme').build()).toBe('**Customer:** Acme')
  })

  it('skips null content', () => {
    expect(prompt().section('Customer', null).build()).toBe('')
  })

  it('skips undefined content', () => {
    expect(prompt().section('Customer', undefined).build()).toBe('')
  })

  it('skips empty-string content', () => {
    expect(prompt().section('Customer', '').build()).toBe('')
  })
})

describe('raw()', () => {
  it('passes content through untouched', () => {
    expect(prompt().raw('  literal\n\ttext  ').build()).toBe('  literal\n\ttext  ')
  })

  it('emits an empty part for an empty string', () => {
    expect(prompt().raw('').raw('after').build()).toBe('\n\nafter')
  })
})

describe('codeBlock()', () => {
  it('fences without a language by default', () => {
    expect(prompt().codeBlock('const x = 1').build()).toBe('```\nconst x = 1\n```')
  })

  it('fences with a language', () => {
    expect(prompt().codeBlock('const x = 1', 'ts').build()).toBe('```ts\nconst x = 1\n```')
  })
})

describe('separator()', () => {
  it('renders a clean rule between blocks (§6 row 1)', () => {
    expect(prompt().raw('a').separator().raw('b').build()).toBe('a\n\n---\n\nb')
  })

  it('matches delimiter("dash")', () => {
    expect(prompt().raw('a').separator().raw('b').build()).toBe(
      prompt().raw('a').delimiter('dash').raw('b').build(),
    )
  })
})

describe('delimiter()', () => {
  it('defaults to dash', () => {
    expect(prompt().delimiter().build()).toBe('---')
  })

  it('renders dash', () => {
    expect(prompt().delimiter('dash').build()).toBe('---')
  })

  it('renders hash', () => {
    expect(prompt().delimiter('hash').build()).toBe('###')
  })

  it('renders quote', () => {
    expect(prompt().delimiter('quote').build()).toBe('"""')
  })
})

describe('field()', () => {
  it('renders a bold label, unified with section() (§6 row 4)', () => {
    expect(prompt().field('Tier', 'Enterprise').build()).toBe('**Tier:** Enterprise')
    expect(prompt().field('L', 'v').build()).toBe(prompt().section('L', 'v').build())
  })

  it('renders numeric values', () => {
    expect(prompt().field('Count', 42).build()).toBe('**Count:** 42')
  })

  it('renders zero (not treated as absent)', () => {
    expect(prompt().field('Count', 0).build()).toBe('**Count:** 0')
  })

  it('renders false (not treated as absent)', () => {
    expect(prompt().field('Active', false).build()).toBe('**Active:** false')
  })

  it('renders an empty string (not treated as absent)', () => {
    expect(prompt().field('Note', '').build()).toBe('**Note:** ')
  })

  it('skips null', () => {
    expect(prompt().field('Tier', null).build()).toBe('')
  })

  it('skips undefined', () => {
    expect(prompt().field('Tier', undefined).build()).toBe('')
  })
})

describe('booleanField()', () => {
  it('renders true as Yes', () => {
    expect(prompt().booleanField('Verified', true).build()).toBe('**Verified:** Yes')
  })

  it('renders false as No', () => {
    expect(prompt().booleanField('Verified', false).build()).toBe('**Verified:** No')
  })
})

describe('inlineList()', () => {
  it('joins items with commas', () => {
    expect(prompt().inlineList('Tags', ['a', 'b']).build()).toBe('**Tags:** a, b')
  })

  it('falls back to "None" for an empty array', () => {
    expect(prompt().inlineList('Tags', []).build()).toBe('**Tags:** None')
  })

  it('falls back to "None" for null', () => {
    expect(prompt().inlineList('Tags', null).build()).toBe('**Tags:** None')
  })

  it('falls back to "None" for undefined', () => {
    expect(prompt().inlineList('Tags', undefined).build()).toBe('**Tags:** None')
  })

  it('accepts a custom fallback', () => {
    expect(prompt().inlineList('Tags', [], 'n/a').build()).toBe('**Tags:** n/a')
  })
})

describe('build()', () => {
  it('returns an empty string for an empty builder', () => {
    expect(prompt().build()).toBe('')
  })

  it('joins parts with a blank line', () => {
    expect(prompt().raw('a').raw('b').raw('c').build()).toBe('a\n\nb\n\nc')
  })

  it('is idempotent — calling twice does not mutate state', () => {
    const b = prompt().raw('a').raw('b')
    expect(b.build()).toBe(b.build())
  })
})

describe('chaining', () => {
  it('every method returns the same instance', () => {
    const b = prompt()
    expect(b.heading('h')).toBe(b)
    expect(b.raw('r')).toBe(b)
    expect(b.section('s', 'v')).toBe(b)
    expect(b.field('f', 'v')).toBe(b)
    expect(b.separator()).toBe(b)
  })
})
