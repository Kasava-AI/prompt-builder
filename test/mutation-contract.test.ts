import { describe, it, expect } from 'vitest'
import { prompt, section, PromptBuilder } from '../src/index'

/**
 * THE most load-bearing compat constraint in the library, and the one most
 * likely to be broken by accident in Phase 1.
 *
 * `PromptBuilder` is MUTABLE. Every method mutates `this` and returns `this`.
 * Real consumer code relies on this — `prompt-generator/src/lib/prompt-template.ts`
 * calls `.conditional()` as a bare statement and throws the return value away:
 *
 *     b.conditional(enrichment.features?.length, (b) => b.heading('Features').list(...))
 *     b.conditional(enrichment.techStack?.length, (b) => ...)
 *     return b
 *
 * and `monroe/app/.../static.ts` reassigns instead:
 *
 *     let b = prompt().raw(...)
 *     if (FLAG) { b = b.raw(...) } else { b = b.raw(...).raw(...) }
 *
 * Both patterns must keep working. If Phase 1 ever makes the builder
 * persistent/immutable, the statement form silently produces nothing — no type
 * error, no test failure anywhere else, just prompts that quietly lose sections.
 */

describe('mutability contract', () => {
  it('methods mutate in place — the return value may be discarded', () => {
    const b = prompt()
    b.raw('a')
    b.raw('b')
    expect(b.build()).toBe('a\n\nb')
  })

  it('conditional() called as a bare statement still appends', () => {
    const b = prompt().raw('top')
    b.conditional(true, (sub) => sub.heading('Features').list(['x']))
    expect(b.build()).toBe('top\n\n## Features\n\n- x')
  })

  it('several bare-statement conditionals accumulate in order', () => {
    const b = section('Context')
    b.conditional(['a'].length, (sub) => sub.inlineList('CTAs', ['a']))
    b.conditional(0, (sub) => sub.inlineList('Nav', []))
    b.conditional(['n'].length, (sub) => sub.inlineList('Nav', ['n']))
    expect(b.build()).toBe('## Context\n\n**CTAs:** a\n\n**Nav:** n')
  })

  it('include() called as a bare statement still appends', () => {
    const b = prompt().raw('top')
    b.include(section('Shared').raw('s'))
    expect(b.build()).toBe('top\n\n## Shared\n\ns')
  })

  it('the reassignment style used in monroe/static.ts is equivalent', () => {
    const statement = prompt()
    statement.raw('a')
    statement.raw('b')

    let reassigned = prompt()
    reassigned = reassigned.raw('a')
    reassigned = reassigned.raw('b')

    expect(statement.build()).toBe(reassigned.build())
  })

  it('a builder passed to a helper function is mutated by it', () => {
    const withFooter = (b: PromptBuilder) => b.raw('footer')
    const b = prompt().raw('body')
    withFooter(b)
    expect(b.build()).toBe('body\n\nfooter')
  })

  it('build() does not consume or reset the builder', () => {
    const b = prompt().raw('a')
    b.build()
    b.raw('b')
    expect(b.build()).toBe('a\n\nb')
  })

  it('a shared fragment accumulates if reused as a mutable base (documented footgun)', () => {
    const base = section('Base')
    base.raw('one')
    base.raw('two')
    // Not a copy — the same instance. Consumers that treat `section()` results
    // as immutable templates are relying on never mutating them after creation.
    expect(base.build()).toBe('## Base\n\none\n\ntwo')
  })
})
