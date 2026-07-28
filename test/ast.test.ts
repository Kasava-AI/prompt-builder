import { describe, it, expect } from 'vitest'
import { prompt, section, render, walk, markdown, type Dialect, type Node } from '../src/index'

/**
 * The 0.3.0 introspection surface: the AST, `render()`, and the Dialect
 * interface. This is what the string-accumulator design made impossible —
 * counting tokens per section, dropping a block to fit a budget, diffing two
 * prompts structurally, or serializing for a different provider.
 */

describe('toAST()', () => {
  it('exposes one node per block, in order', () => {
    const ast = prompt().raw('a').heading('H').list(['x']).toAST()
    expect(ast.map((n) => n.kind)).toEqual(['text', 'heading', 'list'])
  })

  it('carries structured data rather than pre-formatted strings', () => {
    const [heading] = prompt().heading('Title', 3).toAST()
    expect(heading).toEqual({ kind: 'heading', level: 3, text: 'Title' })
  })

  it('records which method produced a field, so both styles stay distinguishable', () => {
    const [fromSection] = prompt().section('L', 'v').toAST()
    const [fromField] = prompt().field('L', 'v').toAST()
    expect(fromSection).toMatchObject({ kind: 'field', style: 'section' })
    expect(fromField).toMatchObject({ kind: 'field', style: 'field' })
  })

  it('returns a copy — mutating it does not affect the builder', () => {
    const b = prompt().raw('a')
    const ast = b.toAST()
    ast.push({ kind: 'text', text: 'injected' })
    expect(b.build()).toBe('a')
    expect(b.toAST()).toHaveLength(1)
  })

  it('is empty for an empty builder', () => {
    expect(prompt().toAST()).toEqual([])
  })

  it('sees through include() into the child fragment', () => {
    const ast = prompt().raw('top').include(section('Inner').list(['a'])).toAST()
    expect(ast.map((n) => n.kind)).toEqual(['text', 'heading', 'list'])
  })

  it('decomposes generators into primitive nodes', () => {
    const ast = prompt()
      .protocol({ name: 'P', triggers: ['t'], steps: [{ label: 'S' }], followThrough: 'F' })
      .toAST()
    expect(ast.map((n) => n.kind)).toEqual(['heading', 'text', 'step', 'text'])
  })

  it('marks intentionally-changed nodes with a legacy rendering', () => {
    const [separator] = prompt().separator().toAST()
    expect(separator.legacy).toBe('\n---\n')

    const [heading] = prompt().heading('H').toAST()
    expect(heading.legacy).toBeUndefined()
  })
})

describe('walk()', () => {
  it('visits every node in order with its index', () => {
    const seen: Array<[string, number]> = []
    walk(prompt().raw('a').heading('H').list(['x']).toAST(), (node, i) => {
      seen.push([node.kind, i])
    })
    expect(seen).toEqual([
      ['text', 0],
      ['heading', 1],
      ['list', 2],
    ])
  })

  it('visits nothing for an empty AST', () => {
    const seen: string[] = []
    walk([], (n) => seen.push(n.kind))
    expect(seen).toEqual([])
  })

  it('supports the kind of analysis budgeting will need', () => {
    const ast = prompt().heading('A').raw('body').heading('B').raw('body').toAST()
    let headings = 0
    walk(ast, (n) => {
      if (n.kind === 'heading') headings++
    })
    expect(headings).toBe(2)
  })
})

describe('toPrompt()', () => {
  it('returns the rendered text with the dialect name', () => {
    expect(prompt().raw('hello').toPrompt()).toEqual({
      text: 'hello',
      params: [],
      dialect: 'markdown',
    })
  })

  it('reports the strict dialect by name', () => {
    const result = prompt().field('L', 'v').toPrompt(markdown({ strict: true }))
    expect(result.dialect).toBe('markdown(strict)')
    expect(result.text).toBe('**L**: v')
  })

  it('agrees with build()', () => {
    const b = prompt().heading('H').list(['a'])
    expect(b.toPrompt().text).toBe(b.build())
  })
})

describe('render()', () => {
  it('renders a hand-built AST', () => {
    const nodes: Node[] = [
      { kind: 'heading', level: 2, text: 'H' },
      { kind: 'list', ordered: false, items: ['a', 'b'] },
    ]
    expect(render(nodes, markdown())).toBe('## H\n\n- a\n- b')
  })

  it('omits a list node with no items', () => {
    const nodes: Node[] = [
      { kind: 'text', text: 'a' },
      { kind: 'list', ordered: false, items: [] },
      { kind: 'text', text: 'b' },
    ]
    expect(render(nodes, markdown())).toBe('a\n\nb')
  })

  it('omits an empty node', () => {
    expect(render([{ kind: 'empty' }], markdown())).toBe('')
  })

  it('renders an empty AST as an empty string', () => {
    expect(render([], markdown())).toBe('')
  })
})

describe('custom dialects', () => {
  it('can serialize the same AST a completely different way', () => {
    const jsonl: Dialect = {
      name: 'jsonl',
      renderNode: (node) => JSON.stringify(node),
      join: (blocks) => blocks.join('\n'),
    }

    const out = prompt().heading('H', 1).raw('body').build(jsonl)
    expect(out).toBe('{"kind":"heading","level":1,"text":"H"}\n{"kind":"text","text":"body"}')
  })

  it('can drop nodes wholesale by returning null', () => {
    const headingsOnly: Dialect = {
      name: 'headings-only',
      renderNode: (node) => (node.kind === 'heading' ? node.text : null),
      join: (blocks) => blocks.join(' > '),
    }

    const out = prompt().heading('A').raw('skipped').heading('B').build(headingsOnly)
    expect(out).toBe('A > B')
  })

  it('is what makes token budgeting possible — a size-aware pass over the AST', () => {
    const b = prompt().heading('Keep').raw('a very long block of prose').heading('Also keep')
    const budget = 12
    const kept = b.toAST().filter((n) => (markdown().renderNode(n) ?? '').length <= budget)
    expect(render(kept, markdown())).toBe('## Keep\n\n## Also keep')
  })
})

describe('build(dialect)', () => {
  it('defaults to markdown', () => {
    expect(prompt().raw('a').build()).toBe(prompt().raw('a').build(markdown()))
  })
})
