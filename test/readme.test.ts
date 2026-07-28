import { describe, it, expect } from 'vitest'
import {
  definePrompt,
  text,
  list,
  bool,
  prompt,
  p,
  placeholder,
  when,
  unless,
  all,
  each,
  xml,
  markdown,
  toMessages,
} from '../src/index'
import { createVarsSchema } from '../src/zod'

/**
 * Every example in README.md, executed.
 *
 * Documentation that drifts from the code is worse than none — these assert the
 * exact output the README claims, so an API change breaks the docs loudly.
 */

describe('README — headline example', () => {
  const userContext = definePrompt('user_context', {
    userName: text().notNull(),
    activeShows: list().default([]),
    isMobile: bool().default(false),
  })

  const template = userContext.body((v) =>
    prompt()
      .tag('user_context', p`Active shows (${v.activeShows.length}): ${v.activeShows}`)
      .include(when(v.isMobile, 'Keep replies short — this is a phone.')),
  )

  it('produces the documented output', () => {
    expect(template.render({ userName: 'Ada', activeShows: ['Severance', 'Andor'] })).toBe(
      '<user_context>\nActive shows (2): Severance, Andor\n</user_context>',
    )
  })
})

describe('README — quick start', () => {
  it('produces a fluent system prompt', () => {
    const systemPrompt = prompt()
      .role('helpful assistant')
      .heading('Guidelines')
      .list(['Be concise and direct', 'Ask clarifying questions when the request is ambiguous'])
      .build()

    expect(systemPrompt).toBe(
      'You are a helpful assistant.\n\n## Guidelines\n\n' +
        '- Be concise and direct\n- Ask clarifying questions when the request is ambiguous',
    )
  })
})

describe('README — the p tag', () => {
  it('matches the documented outputs', () => {
    const count = 12
    const shows = ['Severance', 'Andor']
    expect(p`Watched ${count} of ${shows}`.toString()).toBe('Watched 12 of Severance, Andor')
    expect(p`${p.raw('## heading')}`.toString()).toBe('## heading')
    expect(p.join([p`a`, p`b`], ', ').toString()).toBe('a, b')
  })

  it('matches the interpolation table', () => {
    expect(p`${'s'}`.toString()).toBe('s')
    expect(p`${1}`.toString()).toBe('1')
    expect(p`${true}`.toString()).toBe('true')
    expect(p`${['a', 'b']}`.toString()).toBe('a, b')
    expect(p`${{ a: 1 }}`.toString()).toBe('{"a":1}')
    expect(p`${null}${undefined}`.toString()).toBe('')
    expect(p`${p`inner`}`.toString()).toBe('inner')
  })
})

describe('README — combinators', () => {
  it('composes a flag-gated prompt', () => {
    const flags = { toolSearch: false }
    const protocols = [{ name: 'A', body: 'do a' }]

    const out = all(
      'BASE_RULES',
      when(flags.toolSearch, 'TOOL_SEARCH_BLOCK'),
      unless(flags.toolSearch, 'TOOL_CATALOG'),
      each(protocols, (proto) => p`### ${proto.name}\n${proto.body}`),
    ).build()

    expect(out).toBe('BASE_RULES\n\nTOOL_CATALOG\n\n### A\ndo a')
  })
})

describe('README — prepared prompts', () => {
  it('renders repeatedly from one compile', () => {
    const greeting = prompt().raw(p`Hello ${placeholder('name')}`).prepare('greeting')
    expect(greeting.render({ name: 'Ada' })).toBe('Hello Ada')
    expect(greeting.render({ name: 'Grace' })).toBe('Hello Grace')
  })
})

describe('README — dialects', () => {
  const b = prompt().field('Tier', 'Pro')

  it('renders every documented target', () => {
    expect(b.build()).toBe('**Tier:** Pro')
    expect(b.build(xml())).toBe('<tier>Pro</tier>')
    expect(b.build(markdown({ strict: true }))).toBe('**Tier**: Pro')
    expect(toMessages(b)).toEqual([{ role: 'system', content: '**Tier:** Pro' }])
    expect(b.toAST()).toEqual([
      { kind: 'field', label: 'Tier', value: 'Pro', style: 'field', legacy: '**Tier**: Pro' },
    ])
  })
})

describe('README — cache boundaries', () => {
  it('splits into a cached and an uncached message', () => {
    const messages = toMessages(
      prompt().include('STATIC_INSTRUCTIONS').cacheBoundary().include('perRequestContext'),
    )
    expect(messages).toEqual([
      {
        role: 'system',
        content: 'STATIC_INSTRUCTIONS',
        cache_control: { type: 'ephemeral' },
      },
      { role: 'system', content: 'perRequestContext' },
    ])
  })
})

describe('README — token budgets', () => {
  it('drops low priority and keeps required', () => {
    const trimmed = prompt()
      .priority('required')
      .include('CORE_RULES')
      .priority('low')
      .include('WORKED_EXAMPLES'.repeat(50))
      .$budget({ maxTokens: 20 })

    expect(trimmed.build()).toBe('CORE_RULES')
  })
})

describe('README — validation', () => {
  it('parses an untyped payload and renders it', () => {
    const userContext = definePrompt('user_context', { userName: text().notNull() })
    const template = userContext.body((v) => prompt().raw(p`hi ${v.userName}`))
    const varsSchema = createVarsSchema(userContext, { userName: (s) => s.max(80) })

    expect(template.render(varsSchema.parse(JSON.parse('{"userName":"Ada"}')))).toBe('hi Ada')
  })
})

describe('README — migrating from 0.2.x', () => {
  it('table cells are escaped', () => {
    expect(prompt().table(['A', 'B'], [['a|b', 'c']]).build()).toBe(
      '| A | B |\n|---|---|\n| a\\|b | c |',
    )
  })

  it('strict mode restores the old bytes', () => {
    expect(prompt().table(['A', 'B'], [['a|b', 'c']]).build(markdown({ strict: true }))).toBe(
      '| A | B |\n|---|---|\n| a|b | c |',
    )
  })

  it('the deprecated no-ops still work', () => {
    expect(prompt().raw('a').newline().paragraph().blankLine().raw('b').build()).toBe('a\n\nb')
    expect(prompt().bullets(['x']).build()).toBe('- x')
    expect(prompt().steps(['x']).build()).toBe('1. x')
  })
})
