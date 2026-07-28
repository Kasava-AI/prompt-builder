import { describe, it, expect } from 'vitest'
import { prompt, section, p, placeholder, xml, toMessages, markdown } from '../src/index'

describe('xml() dialect', () => {
  it('renders fields as elements', () => {
    expect(prompt().field('Primary Color', '#c8614d').build(xml())).toBe(
      '<primary_color>#c8614d</primary_color>',
    )
  })

  it('slugifies labels', () => {
    expect(prompt().field('Total Watched!', 12).build(xml())).toBe(
      '<total_watched>12</total_watched>',
    )
  })

  it('falls back to a generic name for an unslugifiable label', () => {
    expect(prompt().field('***', 'x').build(xml())).toBe('<section>x</section>')
  })

  it('treats section() and field() alike', () => {
    expect(prompt().section('Tier', 'Pro').build(xml())).toBe('<tier>Pro</tier>')
  })

  it('leaves lists, code, and tables as markdown', () => {
    expect(prompt().list(['a', 'b']).build(xml())).toBe('- a\n- b')
    expect(prompt().codeBlock('x', 'ts').build(xml())).toBe('```ts\nx\n```')
    expect(prompt().table(['A'], [['1']]).build(xml())).toBe('| A |\n|---|\n| 1 |')
  })

  it('keeps markdown headings by default', () => {
    expect(prompt().heading('Context').build(xml())).toBe('## Context')
  })

  it('converts headings to tags when asked', () => {
    expect(prompt().heading('User Context').build(xml({ sectionTags: true }))).toBe(
      '<user_context>',
    )
  })

  it('reports its name', () => {
    expect(xml().name).toBe('xml')
    expect(xml({ sectionTags: true }).name).toBe('xml(sectionTags)')
  })
})

describe('cacheBoundary()', () => {
  it('is invisible to text dialects', () => {
    expect(prompt().raw('a').cacheBoundary().raw('b').build()).toBe('a\n\nb')
  })

  it('appears in the AST', () => {
    expect(
      prompt()
        .raw('a')
        .cacheBoundary()
        .toAST()
        .map((n) => n.kind),
    ).toEqual(['text', 'cacheBoundary'])
  })
})

describe('toMessages()', () => {
  it('returns a single system message with no boundary', () => {
    expect(toMessages(prompt().raw('hello'))).toEqual([{ role: 'system', content: 'hello' }])
  })

  it('splits at a cache boundary and marks the stable half', () => {
    const messages = toMessages(
      prompt().raw('static instructions').cacheBoundary().raw('per-request context'),
    )
    expect(messages).toEqual([
      {
        role: 'system',
        content: 'static instructions',
        cache_control: { type: 'ephemeral' },
      },
      { role: 'system', content: 'per-request context' },
    ])
  })

  it('supports several boundaries', () => {
    const messages = toMessages(
      prompt().raw('a').cacheBoundary().raw('b').cacheBoundary().raw('c'),
    )
    expect(messages.map((m) => m.content)).toEqual(['a', 'b', 'c'])
    expect(messages.filter((m) => m.cache_control).length).toBe(2)
  })

  it('can suppress cache_control', () => {
    const messages = toMessages(prompt().raw('a').cacheBoundary().raw('b'), {
      cacheControl: false,
    })
    expect(messages.every((m) => m.cache_control === undefined)).toBe(true)
  })

  it('accepts a role', () => {
    expect(toMessages(prompt().raw('hi'), { role: 'user' })[0].role).toBe('user')
  })

  it('accepts a dialect', () => {
    expect(toMessages(prompt().field('L', 'v'), { dialect: xml() })[0].content).toBe('<l>v</l>')
  })

  it('drops empty segments', () => {
    expect(toMessages(prompt().cacheBoundary().raw('only'))).toEqual([
      { role: 'system', content: 'only' },
    ])
  })

  it('returns nothing for an empty prompt', () => {
    expect(toMessages(prompt())).toEqual([])
  })

  it('accepts a raw AST', () => {
    expect(toMessages([{ kind: 'text', text: 'x' }])).toEqual([{ role: 'system', content: 'x' }])
  })

  it('resolves placeholders is not its job — those must be bound first', () => {
    expect(() => toMessages(prompt().raw(p`${placeholder('n')}`))).toThrow(/No value/)
  })

  it('models the static/dynamic split agent prompts already hand-roll', () => {
    const staticPart = section('Personality').list(['Warm', 'Concise'])
    const dynamicPart = section('User Context').field('Shows', 12)

    const messages = toMessages(prompt().include(staticPart).cacheBoundary().include(dynamicPart))

    expect(messages).toHaveLength(2)
    expect(messages[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(messages[0].content).toBe('## Personality\n\n- Warm\n- Concise')
    expect(messages[1].cache_control).toBeUndefined()
    expect(messages[1].content).toBe('## User Context\n\n**Shows:** 12')
  })
})

describe('dialect interchange', () => {
  it('renders one AST three ways', () => {
    const b = prompt().heading('Context').field('Tier', 'Pro').list(['a'])
    expect(b.build(markdown())).toBe('## Context\n\n**Tier:** Pro\n\n- a')
    expect(b.build(xml())).toBe('## Context\n\n<tier>Pro</tier>\n\n- a')
    expect(toMessages(b)[0].content).toBe('## Context\n\n**Tier:** Pro\n\n- a')
  })
})
