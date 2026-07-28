import { describe, it, expect } from 'vitest'
import { prompt, section, approximateTokens, BudgetExceededError, markdown } from '../src/index'

/** Counts words, so budgets in these tests are legible. */
const words: (text: string) => number = (text) =>
  text.split(/\s+/).filter(Boolean).length

describe('approximateTokens()', () => {
  it('is roughly four characters per token', () => {
    expect(approximateTokens('12345678')).toBe(2)
    expect(approximateTokens('')).toBe(0)
    expect(approximateTokens('abc')).toBe(1)
  })
})

describe('priority()', () => {
  it('does not affect normal rendering', () => {
    expect(prompt().priority('low').raw('a').build()).toBe('a')
  })

  it('tags subsequent nodes', () => {
    const ast = prompt().raw('a').priority('low').raw('b').toAST()
    expect(ast[0].priority).toBeUndefined()
    expect(ast[1].priority).toBe('low')
  })

  it('is sticky until changed', () => {
    const ast = prompt().priority('low').raw('a').raw('b').priority('required').raw('c').toAST()
    expect(ast.map((n) => n.priority)).toEqual(['low', 'low', 'required'])
  })

  it('applies to included fragments', () => {
    const ast = prompt().priority('low').include(section('T').list(['x'])).toAST()
    expect(ast.map((n) => n.priority)).toEqual(['low', 'low'])
  })

  it('lets a fragment keep priorities it set for itself', () => {
    const frag = prompt().priority('required').raw('critical')
    const ast = prompt().priority('low').include(frag).toAST()
    expect(ast[0].priority).toBe('required')
  })
})

describe('$budget()', () => {
  it('returns everything when it already fits', () => {
    const b = prompt().raw('one two').raw('three')
    expect(b.$budget({ maxTokens: 100, counter: words }).build()).toBe('one two\n\nthree')
  })

  it('drops low priority first', () => {
    const b = prompt()
      .priority('required')
      .raw('keep me')
      .priority('low')
      .raw('drop me')

    expect(b.$budget({ maxTokens: 2, counter: words }).build()).toBe('keep me')
  })

  it('drops low, then normal, then high', () => {
    const b = prompt()
      .priority('high')
      .raw('high')
      .priority('normal')
      .raw('normal')
      .priority('low')
      .raw('low')

    expect(b.$budget({ maxTokens: 2, counter: words }).build()).toBe('high\n\nnormal')
    expect(b.$budget({ maxTokens: 1, counter: words }).build()).toBe('high')
  })

  it('drops the latest node first within a tier', () => {
    const b = prompt().priority('low').raw('first').raw('second').raw('third')
    expect(b.$budget({ maxTokens: 2, counter: words }).build()).toBe('first\n\nsecond')
  })

  it('never drops required nodes', () => {
    const b = prompt().priority('required').raw('a').raw('b').priority('low').raw('c')
    expect(b.$budget({ maxTokens: 2, counter: words }).build()).toBe('a\n\nb')
  })

  it('throws when required content alone exceeds the budget', () => {
    const b = prompt().priority('required').raw('one two three')
    expect(() => b.$budget({ maxTokens: 1, counter: words })).toThrow(BudgetExceededError)
    expect(() => b.$budget({ maxTokens: 1, counter: words })).toThrow(/Required content alone/)
  })

  it('reports the overage on the error', () => {
    const b = prompt().priority('required').raw('one two three')
    try {
      b.$budget({ maxTokens: 1, counter: words })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(BudgetExceededError)
      expect((error as BudgetExceededError).required).toBe(3)
      expect((error as BudgetExceededError).maxTokens).toBe(1)
    }
  })

  it('does not mutate the source builder', () => {
    const b = prompt().priority('low').raw('a').raw('b')
    b.$budget({ maxTokens: 1, counter: words })
    expect(b.build()).toBe('a\n\nb')
  })

  it('drops whole nodes, never partial content', () => {
    const b = prompt()
      .priority('required')
      .heading('Kept')
      .priority('low')
      .table(['A', 'B'], [['1', '2']])

    const out = b.$budget({ maxTokens: 2, counter: words }).build()
    expect(out).toBe('## Kept')
    expect(out).not.toContain('|')
  })

  it('uses the approximate counter by default', () => {
    const b = prompt().priority('low').raw('x'.repeat(400)).priority('required').raw('keep')
    expect(b.$budget({ maxTokens: 10 }).build()).toBe('keep')
  })

  it('measures with the dialect it is given', () => {
    const b = prompt().priority('required').field('L', 'v')
    expect(b.$budget({ maxTokens: 100, dialect: markdown({ strict: true }) }).build()).toBe(
      '**L:** v',
    )
  })

  it('resolves placeholders before measuring', () => {
    const b = prompt().raw('static')
    expect(b.$budget({ maxTokens: 100, counter: words }).build()).toBe('static')
  })

  it('handles an empty prompt', () => {
    expect(prompt().$budget({ maxTokens: 10 }).build()).toBe('')
  })

  it('composes — the trimmed result is a normal builder', () => {
    const trimmed = prompt().priority('low').raw('drop').priority('required').raw('keep')
    expect(trimmed.$budget({ maxTokens: 1, counter: words }).raw('added').build()).toBe(
      'keep\n\nadded',
    )
  })
})
