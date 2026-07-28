import { describe, it, expect } from 'vitest'
import { prompt, PromptBuilder } from '../src/index'

describe('list() — titleless overload', () => {
  it('renders a bullet list', () => {
    expect(prompt().list(['a', 'b']).build()).toBe('- a\n- b')
  })

  it('emits nothing for an empty array', () => {
    expect(prompt().list([]).build()).toBe('')
  })

  it('renders a single item', () => {
    expect(prompt().list(['only']).build()).toBe('- only')
  })
})

describe('list() — titled overload', () => {
  it('renders a bold title above the bullets', () => {
    expect(prompt().list('Tags', ['a', 'b']).build()).toBe('**Tags:**\n- a\n- b')
  })

  it('emits nothing when items is empty', () => {
    expect(prompt().list('Tags', []).build()).toBe('')
  })

  it('emits nothing when items is null', () => {
    expect(prompt().list('Tags', null).build()).toBe('')
  })

  it('emits nothing when items is undefined', () => {
    expect(prompt().list('Tags', undefined).build()).toBe('')
  })

  it('emits nothing when the title is null', () => {
    expect(prompt().list(null, ['a']).build()).toBe('')
  })

  it('emits nothing when the title is undefined', () => {
    expect(prompt().list(undefined, ['a']).build()).toBe('')
  })

  it('emits nothing when the title is an empty string', () => {
    expect(prompt().list('', ['a']).build()).toBe('')
  })
})

describe('numberedList() — titleless overload', () => {
  it('renders a 1-indexed numbered list', () => {
    expect(prompt().numberedList(['a', 'b', 'c']).build()).toBe('1. a\n2. b\n3. c')
  })

  it('emits nothing for an empty array', () => {
    expect(prompt().numberedList([]).build()).toBe('')
  })
})

describe('numberedList() — titled overload', () => {
  it('renders a bold title above the numbers', () => {
    expect(prompt().numberedList('Steps', ['a', 'b']).build()).toBe('**Steps:**\n1. a\n2. b')
  })

  it('emits nothing when items is empty', () => {
    expect(prompt().numberedList('Steps', []).build()).toBe('')
  })

  it('emits nothing when items is null', () => {
    expect(prompt().numberedList('Steps', null).build()).toBe('')
  })

  it('emits nothing when items is undefined', () => {
    expect(prompt().numberedList('Steps', undefined).build()).toBe('')
  })

  it('emits nothing when the title is null', () => {
    expect(prompt().numberedList(null, ['a']).build()).toBe('')
  })

  it('emits nothing when the title is undefined', () => {
    expect(prompt().numberedList(undefined, ['a']).build()).toBe('')
  })
})

describe('keyValues()', () => {
  it('renders entries as bullets with plain colons', () => {
    expect(prompt().keyValues({ a: 1, b: 'two' }).build()).toBe('- a: 1\n- b: two')
  })

  it('preserves insertion order', () => {
    expect(prompt().keyValues({ z: 1, a: 2, m: 3 }).build()).toBe('- z: 1\n- a: 2\n- m: 3')
  })
})

describe('limitedList()', () => {
  it('renders every item when under the cap', () => {
    expect(prompt().limitedList(['a', 'b'], 5).build()).toBe('- a\n- b')
  })

  it('renders exactly the cap without an overflow line', () => {
    expect(prompt().limitedList(['a', 'b'], 2).build()).toBe('- a\n- b')
  })

  it('appends a default overflow line past the cap', () => {
    expect(prompt().limitedList(['a', 'b', 'c', 'd'], 2).build()).toBe('- a\n- b\n- ... and 2 more')
  })

  it('appends a custom overflow line past the cap', () => {
    expect(
      prompt()
        .limitedList(['a', 'b', 'c'], 1, (n) => `+${n} others`)
        .build(),
    ).toBe('- a\n- +2 others')
  })
})

describe('PromptBuilder.formatLimitedList()', () => {
  it('formats every item when under the cap', () => {
    expect(PromptBuilder.formatLimitedList([1, 2], (n) => `#${n}`, 5)).toEqual(['#1', '#2'])
  })

  it('appends a default overflow message past the cap', () => {
    expect(PromptBuilder.formatLimitedList([1, 2, 3], (n) => `#${n}`, 1)).toEqual([
      '#1',
      '... and 2 more',
    ])
  })

  it('appends a custom overflow message past the cap', () => {
    expect(
      PromptBuilder.formatLimitedList([1, 2, 3], (n) => `#${n}`, 1, (n) => `plus ${n}`),
    ).toEqual(['#1', 'plus 2'])
  })

  it('returns strings rather than pushing onto the builder', () => {
    const result = PromptBuilder.formatLimitedList(['x'], (s) => s, 1)
    expect(Array.isArray(result)).toBe(true)
  })
})

describe('PromptBuilder.truncate()', () => {
  it('leaves text at or under the limit untouched', () => {
    expect(PromptBuilder.truncate('hello', 5)).toBe('hello')
    expect(PromptBuilder.truncate('hi', 10)).toBe('hi')
  })

  it('truncates to maxLength INCLUDING the ellipsis', () => {
    expect(PromptBuilder.truncate('hello world', 8)).toBe('hello...')
    expect(PromptBuilder.truncate('hello world', 8)).toHaveLength(8)
  })
})
