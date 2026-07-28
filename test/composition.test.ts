import { describe, it, expect } from 'vitest'
import { prompt, section, PromptBuilder } from '../src/index'

describe('prompt()', () => {
  it('returns a PromptBuilder', () => {
    expect(prompt()).toBeInstanceOf(PromptBuilder)
  })

  it('returns a fresh instance each call', () => {
    const a = prompt().raw('a')
    const b = prompt()
    expect(b.build()).toBe('')
    expect(a.build()).toBe('a')
  })
})

describe('section()', () => {
  it('creates a builder pre-seeded with a level-2 heading', () => {
    expect(section('Title').build()).toBe('## Title')
  })

  it('accepts a heading level', () => {
    expect(section('Title', 1).build()).toBe('# Title')
    expect(section('Title', 3).build()).toBe('### Title')
  })

  it('is chainable like any builder', () => {
    expect(section('Rules').list(['a']).build()).toBe('## Rules\n\n- a')
  })
})

describe('include()', () => {
  it('inlines a string as a single part', () => {
    expect(prompt().raw('a').include('b').build()).toBe('a\n\nb')
  })

  it('inlines another builder as a single collapsed part', () => {
    const frag = section('Rules').list(['a', 'b'])
    expect(prompt().raw('top').include(frag).build()).toBe('top\n\n## Rules\n\n- a\n- b')
  })

  it('does not mutate the included builder', () => {
    const frag = section('Rules')
    prompt().include(frag).build()
    expect(frag.build()).toBe('## Rules')
  })

  it('allows the same fragment to be included in several prompts', () => {
    const shared = section('Shared').list(['x'])
    expect(prompt().raw('A').include(shared).build()).toBe('A\n\n## Shared\n\n- x')
    expect(prompt().raw('B').include(shared).build()).toBe('B\n\n## Shared\n\n- x')
  })

  it('contributes nothing for an empty builder (§6 row 9)', () => {
    expect(prompt().raw('a').include(prompt()).build()).toBe('a')
  })

  it('splices child nodes rather than collapsing them to one opaque block', () => {
    const frag = section('Rules').list(['a'])
    const combined = prompt().raw('top').include(frag)
    // Three nodes: text, heading, list — not text + one pre-joined string.
    expect(combined.toAST().map((n) => n.kind)).toEqual(['text', 'heading', 'list'])
  })

  it('nests to arbitrary depth', () => {
    const inner = section('Inner').raw('i')
    const middle = section('Middle').include(inner)
    expect(prompt().include(middle).build()).toBe('## Middle\n\n## Inner\n\ni')
  })
})

describe('conditional()', () => {
  it('includes the block when the condition is truthy', () => {
    expect(
      prompt()
        .raw('a')
        .conditional(true, (b) => b.raw('yes'))
        .build(),
    ).toBe('a\n\nyes')
  })

  it('skips the block when the condition is false', () => {
    expect(
      prompt()
        .raw('a')
        .conditional(false, (b) => b.raw('no'))
        .build(),
    ).toBe('a')
  })

  it('skips for null', () => {
    expect(
      prompt()
        .conditional(null, (b) => b.raw('x'))
        .build(),
    ).toBe('')
  })

  it('skips for undefined', () => {
    expect(
      prompt()
        .conditional(undefined, (b) => b.raw('x'))
        .build(),
    ).toBe('')
  })

  it('skips for 0', () => {
    expect(
      prompt()
        .conditional(0, (b) => b.raw('x'))
        .build(),
    ).toBe('')
  })

  it('skips for an empty string', () => {
    expect(
      prompt()
        .conditional('', (b) => b.raw('x'))
        .build(),
    ).toBe('')
  })

  it('skips for an empty-array length guard', () => {
    const items: string[] = []
    expect(
      prompt()
        .conditional(items.length, (b) => b.raw('x'))
        .build(),
    ).toBe('')
  })

  it('passes the narrowed value into the callback', () => {
    const value: { name: string } | null = { name: 'Ada' }
    expect(
      prompt()
        .conditional(value, (b, v) => b.field('Name', v.name))
        .build(),
    ).toBe('**Name:** Ada')
  })

  it('receives a fresh sub-builder, not the parent', () => {
    const parent = prompt().raw('parent')
    parent.conditional(true, (b) => {
      expect(b.build()).toBe('')
      return b.raw('child')
    })
    expect(parent.build()).toBe('parent\n\nchild')
  })

  it('accepts a callback that ignores the sub-builder and returns a new prompt', () => {
    expect(
      prompt()
        .raw('a')
        .conditional(true, () => prompt().raw('fresh'))
        .build(),
    ).toBe('a\n\nfresh')
  })

  it('collapses a multi-part block into one part, preserving inner spacing', () => {
    expect(
      prompt()
        .raw('top')
        .conditional(true, (b) => b.heading('H').list(['a']))
        .build(),
    ).toBe('top\n\n## H\n\n- a')
  })

  it('nests', () => {
    expect(
      prompt()
        .conditional(true, (b) => b.raw('outer').conditional(true, (c) => c.raw('inner')))
        .build(),
    ).toBe('outer\n\ninner')
  })
})
