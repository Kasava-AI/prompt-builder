import { describe, it, expect } from 'vitest'
import { prompt, section, p, when, unless, all, any, each } from '../src/index'

describe('when()', () => {
  it('includes content for a truthy condition', () => {
    expect(when(true, 'yes').build()).toBe('yes')
  })

  it('yields nothing for a falsy condition', () => {
    expect(when(false, 'no').build()).toBe('')
    expect(when(0, 'no').build()).toBe('')
    expect(when('', 'no').build()).toBe('')
    expect(when(null, 'no').build()).toBe('')
    expect(when(undefined, 'no').build()).toBe('')
  })

  it('accepts a builder', () => {
    expect(when(true, section('T').list(['a'])).build()).toBe('## T\n\n- a')
  })

  it('accepts a fragment', () => {
    expect(when(true, p`n=${1}`).build()).toBe('n=1')
  })

  it('yields nothing when the content itself is nullish', () => {
    expect(when(true, null).build()).toBe('')
    expect(when(true, undefined).build()).toBe('')
    expect(when(true, false).build()).toBe('')
  })

  it('composes into a chain', () => {
    expect(prompt().raw('a').include(when(true, 'b')).include(when(false, 'c')).build()).toBe(
      'a\n\nb',
    )
  })
})

describe('unless()', () => {
  it('is the inverse of when()', () => {
    expect(unless(false, 'yes').build()).toBe('yes')
    expect(unless(true, 'no').build()).toBe('')
  })

  it('pairs with when() to express a flag gate', () => {
    const gate = (flag: boolean) =>
      all(when(flag, 'search mode'), unless(flag, 'catalog mode')).build()
    expect(gate(true)).toBe('search mode')
    expect(gate(false)).toBe('catalog mode')
  })

  it('yields nothing when the content is nullish', () => {
    expect(unless(false, null).build()).toBe('')
  })
})

describe('all()', () => {
  it('concatenates everything', () => {
    expect(all('a', 'b', 'c').build()).toBe('a\n\nb\n\nc')
  })

  it('skips nullish and false entries', () => {
    expect(all('a', null, undefined, false, 'b').build()).toBe('a\n\nb')
  })

  it('is empty with no arguments', () => {
    expect(all().build()).toBe('')
  })

  it('mixes builders, fragments, and strings', () => {
    expect(all(section('T'), p`x=${1}`, 'raw').build()).toBe('## T\n\nx=1\n\nraw')
  })

  it('replaces the if/else reassignment pattern', () => {
    const flags = { toolSearch: false, skills: true }
    const out = all(
      'You are an assistant.',
      when(flags.toolSearch, 'Use search_tools.'),
      unless(flags.toolSearch, 'Here is the catalog.'),
      when(flags.skills, 'Use skill_search.'),
    ).build()
    expect(out).toBe('You are an assistant.\n\nHere is the catalog.\n\nUse skill_search.')
  })
})

describe('any()', () => {
  it('returns the first entry with content', () => {
    expect(any(null, '', 'third', 'fourth').build()).toBe('third')
  })

  it('skips builders that render empty', () => {
    expect(any(prompt(), prompt().raw('found')).build()).toBe('found')
  })

  it('is empty when nothing has content', () => {
    expect(any(null, undefined, false, prompt()).build()).toBe('')
  })

  it('expresses a fallback chain', () => {
    const pick = (override?: string) => any(override, 'team default').build()
    expect(pick('custom')).toBe('custom')
    expect(pick()).toBe('team default')
  })
})

describe('each()', () => {
  it('maps and concatenates', () => {
    expect(each(['a', 'b'], (x) => `item ${x}`).build()).toBe('item a\n\nitem b')
  })

  it('passes the index', () => {
    expect(each(['a', 'b'], (x, i) => `${i}: ${x}`).build()).toBe('0: a\n\n1: b')
  })

  it('is empty for an empty collection', () => {
    expect(each([], (x) => String(x)).build()).toBe('')
  })

  it('skips entries whose callback returns nothing', () => {
    expect(each([1, 2, 3], (n) => (n % 2 ? `odd ${n}` : null)).build()).toBe('odd 1\n\nodd 3')
  })

  it('works with fragments', () => {
    const protocols = [
      { name: 'A', body: 'do a' },
      { name: 'B', body: 'do b' },
    ]
    expect(each(protocols, (x) => p`### ${x.name}\n${x.body}`).build()).toBe(
      '### A\ndo a\n\n### B\ndo b',
    )
  })
})

describe('composition preserves AST structure', () => {
  it('combinators splice rather than flatten to strings', () => {
    const ast = all(section('T'), 'body').toAST()
    expect(ast.map((n) => n.kind)).toEqual(['heading', 'text'])
  })
})

describe('$dynamic()', () => {
  it('lets helper functions extend a builder', () => {
    const withFooter = (b: ReturnType<typeof prompt>) => b.raw('footer')
    const withHeader = (b: ReturnType<typeof prompt>) => b.raw('header')

    let q = prompt().raw('body').$dynamic()
    q = withHeader(q)
    q = withFooter(q)
    expect(q.build()).toBe('body\n\nheader\n\nfooter')
  })

  it('returns the same instance', () => {
    const b = prompt()
    expect(b.$dynamic()).toBe(b)
  })
})
