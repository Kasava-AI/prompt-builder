import { describe, it, expect } from 'vitest'
import {
  p,
  placeholder,
  prompt,
  section,
  Fragment,
  MissingParamError,
  resolve,
  render,
  markdown,
} from '../src/index'

describe('p`` — value interpolation', () => {
  it('interpolates strings and numbers', () => {
    expect(p`Watched ${12} of ${'Severance'}`.toString()).toBe('Watched 12 of Severance')
  })

  it('comma-joins arrays', () => {
    expect(p`Shows: ${['Andor', 'Severance']}`.toString()).toBe('Shows: Andor, Severance')
  })

  it('renders booleans', () => {
    expect(p`Mobile: ${true}`.toString()).toBe('Mobile: true')
  })

  it('renders null and undefined as empty', () => {
    expect(p`[${null}][${undefined}]`.toString()).toBe('[][]')
  })

  it('JSON-serializes objects', () => {
    expect(p`Config: ${{ a: 1 }}`.toString()).toBe('Config: {"a":1}')
  })

  it('handles an empty array', () => {
    expect(p`Shows: ${[]}`.toString()).toBe('Shows: ')
  })

  it('handles no interpolation at all', () => {
    expect(p`just text`.toString()).toBe('just text')
  })

  it('handles adjacent interpolations', () => {
    expect(p`${1}${2}${3}`.toString()).toBe('123')
  })
})

describe('p.raw()', () => {
  it('passes content through unformatted', () => {
    expect(p`${p.raw('| a | b |')}`.toString()).toBe('| a | b |')
  })

  it('is the migration path for existing .raw() calls', () => {
    const existing = '## Heading\n\n- a\n- b'
    expect(p`${p.raw(existing)}`.toString()).toBe(existing)
  })
})

describe('fragment composition', () => {
  it('inlines a fragment interpolated into another', () => {
    const inner = p`world`
    expect(p`hello ${inner}`.toString()).toBe('hello world')
  })

  it('nests to arbitrary depth', () => {
    const a = p`a`
    const b = p`[${a}]`
    const c = p`{${b}}`
    expect(c.toString()).toBe('{[a]}')
  })

  it('p.empty() starts an empty fragment', () => {
    expect(p.empty().toString()).toBe('')
  })

  it('append() concatenates', () => {
    expect(p`a`.append(p`b`).toString()).toBe('ab')
  })

  it('p.join() concatenates with a separator', () => {
    expect(p.join([p`a`, p`b`, p`c`], ', ').toString()).toBe('a, b, c')
  })

  it('p.join() accepts a fragment separator', () => {
    expect(p.join([p`a`, p`b`], p` | `).toString()).toBe('a | b')
  })

  it('p.join() with no separator', () => {
    expect(p.join([p`a`, p`b`]).toString()).toBe('ab')
  })

  it('p.join() of nothing is empty', () => {
    expect(p.join([]).toString()).toBe('')
  })
})

describe('indentation', () => {
  it('strips the common indent from a multi-line fragment', () => {
    const frag = p`
      Active shows: ${2}
      Total watched: ${10}
    `
    expect(frag.toString()).toBe('Active shows: 2\nTotal watched: 10')
  })

  it('preserves relative indentation', () => {
    const frag = p`
      top
        nested
    `
    expect(frag.toString()).toBe('top\n  nested')
  })

  it('leaves single-line fragments alone', () => {
    expect(p`  spaced  `.toString()).toBe('  spaced  ')
  })

  it('counts an interpolation-only line toward the common indent', () => {
    // The line holding ${x} is the least-indented, so it sets the common indent.
    // Only works if the sentinel standing in for the value survives trim() —
    // a whitespace sentinel would make the line read as blank and be skipped.
    const x = 'value'
    const frag = p`
      deeply indented line
  ${x}
    `
    expect(frag.toString()).toBe('    deeply indented line\nvalue')
  })

  it('does not reindent interpolated multi-line values', () => {
    const block = 'line1\nline2'
    const frag = p`
      before
      ${block}
    `
    expect(frag.toString()).toBe('before\nline1\nline2')
  })
})

describe('builder integration', () => {
  it('.raw() accepts a fragment', () => {
    expect(prompt().raw(p`Watched ${3}`).build()).toBe('Watched 3')
  })

  it('.include() accepts a fragment', () => {
    expect(prompt().raw('top').include(p`and ${'more'}`).build()).toBe('top\n\nand more')
  })

  it('.tag() accepts a fragment', () => {
    expect(prompt().tag('context', p`shows: ${['a']}`).build()).toBe(
      '<context>\nshows: a\n</context>',
    )
  })

  it('.section() accepts a fragment', () => {
    expect(prompt().section('Shows', p`${['a', 'b']}`).build()).toBe('**Shows:** a, b')
  })

  it('semantic tag helpers accept a fragment', () => {
    expect(prompt().instructions(p`do ${'this'}`).build()).toBe(
      '<instructions>\ndo this\n</instructions>',
    )
  })

  it('a fragment with no slots collapses to a plain text node', () => {
    expect(prompt().raw(p`plain`).toAST()).toEqual([{ kind: 'text', text: 'plain' }])
  })

  it('a fragment with slots stays a template node', () => {
    const [node] = prompt().raw(p`hi ${placeholder('name')}`).toAST()
    expect(node.kind).toBe('template')
  })
})

describe('placeholders', () => {
  it('are reported by params()', () => {
    const b = prompt().raw(p`${placeholder('a')} and ${placeholder('b')}`)
    expect(b.params()).toEqual(['a', 'b'])
  })

  it('deduplicate across the prompt', () => {
    const b = prompt().raw(p`${placeholder('x')}`).raw(p`${placeholder('x')}`)
    expect(b.params()).toEqual(['x'])
  })

  it('are empty for a prompt with no slots', () => {
    expect(prompt().raw('static').params()).toEqual([])
  })

  it('throw a helpful error if build() is called with them unbound', () => {
    expect(() => prompt().raw(p`hi ${placeholder('name')}`).build()).toThrow(MissingParamError)
    expect(() => prompt().raw(p`hi ${placeholder('name')}`).build()).toThrow(/name/)
  })

  it('throw if a fragment holding one is coerced to a string', () => {
    expect(() => p`hi ${placeholder('name')}`.toString()).toThrow(/unresolved placeholder/)
  })
})

describe('prepare() / render()', () => {
  it('renders with bound values', () => {
    const greeting = prompt().raw(p`Hello ${placeholder('name')}`).prepare('greeting')
    expect(greeting.render({ name: 'Ada' })).toBe('Hello Ada')
    expect(greeting.render({ name: 'Grace' })).toBe('Hello Grace')
  })

  it('keeps its name and reports its params', () => {
    const prepared = prompt().raw(p`${placeholder('a')}`).prepare('my_prompt')
    expect(prepared.name).toBe('my_prompt')
    expect(prepared.params).toEqual(['a'])
  })

  it('reports params from a mix of static and dynamic segments', () => {
    const prepared = prompt()
      .heading('Static')
      .raw(p`${placeholder('a')}`)
      .list(['static'])
      .raw(p`${placeholder('b')}`)
      .prepare()
    expect(prepared.params).toEqual(['a', 'b'])
  })

  it('reports no params for a fully static prompt', () => {
    expect(prompt().heading('H').prepare().params).toEqual([])
  })

  it('defaults the name', () => {
    expect(prompt().raw('x').prepare().name).toBe('prompt')
  })

  it('serializes static blocks once and interleaves them correctly', () => {
    const prepared = prompt()
      .heading('Context')
      .raw(p`User: ${placeholder('user')}`)
      .list(['a', 'b'])
      .prepare()
    expect(prepared.render({ user: 'Ada' })).toBe('## Context\n\nUser: Ada\n\n- a\n- b')
  })

  it('throws on a missing value', () => {
    const prepared = prompt().raw(p`${placeholder('name')}`).prepare()
    expect(() => prepared.render({})).toThrow(MissingParamError)
  })

  it('works with no placeholders at all', () => {
    expect(prompt().heading('H').list(['a']).prepare().render()).toBe('## H\n\n- a')
  })

  it('omits nodes the dialect drops', () => {
    const prepared = prompt().raw('a').list([]).raw('b').prepare()
    expect(prepared.render()).toBe('a\n\nb')
  })

  it('reuses the compiled form across renders', () => {
    const prepared = prompt().raw(p`${placeholder('n')}`).prepare()
    expect([1, 2, 3].map((n) => prepared.render({ n }))).toEqual(['1', '2', '3'])
  })
})

describe('resolve() — binding slots in a raw AST', () => {
  it('fills placeholders from params', () => {
    const nodes = prompt().raw(p`hi ${placeholder('name')}!`).toAST()
    expect(resolve(nodes, { name: 'Ada' })).toEqual([{ kind: 'text', text: 'hi Ada!' }])
  })

  it('formats bound values the same way interpolation does', () => {
    const nodes = prompt().raw(p`${placeholder('xs')}`).toAST()
    expect(resolve(nodes, { xs: ['a', 'b'] })).toEqual([{ kind: 'text', text: 'a, b' }])
  })

  it('leaves non-template nodes untouched', () => {
    const nodes = prompt().heading('H').toAST()
    expect(resolve(nodes, {})).toEqual(nodes)
  })

  it('throws for an unbound slot', () => {
    const nodes = prompt().raw(p`${placeholder('missing')}`).toAST()
    expect(() => resolve(nodes, {})).toThrow(MissingParamError)
  })
})

describe('unresolved templates rendered directly', () => {
  it('fall back to a visible {{slot}} marker rather than dropping content', () => {
    const nodes = prompt().raw(p`hi ${placeholder('name')}`).toAST()
    expect(render(nodes, markdown())).toBe('hi {{name}}')
  })
})

describe('degenerate templates', () => {
  it('handles a trailing newline with no indented lines', () => {
    expect(p`text\n`.toString()).toBe('text')
  })

  it('handles a fragment that is only a newline', () => {
    expect(p`\n`.toString()).toBe('')
  })
})

describe('Fragment', () => {
  it('is exported for type checks', () => {
    expect(p`x`).toBeInstanceOf(Fragment)
  })

  it('composes with section()', () => {
    expect(section('T').raw(p`v=${1}`).build()).toBe('## T\n\nv=1')
  })
})
