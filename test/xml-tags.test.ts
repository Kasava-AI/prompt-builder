import { describe, it, expect } from 'vitest'
import { prompt, PromptBuilder } from '../src/index'

describe('tag()', () => {
  it('wraps content on its own lines', () => {
    expect(prompt().tag('context', 'body').build()).toBe('<context>\nbody\n</context>')
  })

  it('does not escape angle brackets in content', () => {
    expect(prompt().tag('a', '<b>').build()).toBe('<a>\n<b>\n</a>')
  })

  it('wraps empty content as a blank line', () => {
    expect(prompt().tag('a', '').build()).toBe('<a>\n\n</a>')
  })
})

describe('openTag() / closeTag()', () => {
  it('emit tags as separate parts, so the join inserts blank lines', () => {
    expect(prompt().openTag('a').raw('body').closeTag('a').build()).toBe('<a>\n\nbody\n\n</a>')
  })
})

describe('semantic tag helpers', () => {
  const cases: Array<[keyof PromptBuilder, string]> = [
    ['instructions', 'instructions'],
    ['context', 'context'],
    ['example', 'example'],
    ['examples', 'examples'],
    ['data', 'data'],
    ['thinking', 'thinking'],
    ['answer', 'answer'],
    ['formatting', 'formatting'],
    ['findings', 'findings'],
    ['recommendations', 'recommendations'],
    ['output', 'output'],
  ]

  it.each(cases)('.%s() wraps in <%s>', (method, tagName) => {
    const b = prompt()
    const fn = b[method] as (content: string) => PromptBuilder
    expect(fn.call(b, 'X').build()).toBe(`<${tagName}>\nX\n</${tagName}>`)
  })

  it('covers every semantic helper the class exposes', () => {
    expect(cases).toHaveLength(11)
  })
})
