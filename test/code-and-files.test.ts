import { describe, it, expect } from 'vitest'
import { prompt } from '../src/index'

describe('diffBlock()', () => {
  it('fences content as a diff', () => {
    expect(prompt().diffBlock('+ added').build()).toBe('```diff\n+ added\n```')
  })

  it('leaves content under the limit untouched', () => {
    expect(prompt().diffBlock('abc', 10).build()).toBe('```diff\nabc\n```')
  })

  it('leaves content exactly at the limit untouched', () => {
    expect(prompt().diffBlock('abcde', 5).build()).toBe('```diff\nabcde\n```')
  })

  it('truncates past the limit and appends a marker', () => {
    expect(prompt().diffBlock('abcdefgh', 3).build()).toBe('```diff\nabc\n... (truncated)\n```')
  })

  it('defaults the limit to 8000 characters', () => {
    const long = 'x'.repeat(8001)
    const out = prompt().diffBlock(long).build()
    expect(out).toContain('... (truncated)')
    expect(out).toBe('```diff\n' + 'x'.repeat(8000) + '\n... (truncated)\n```')
  })
})

describe('filesList()', () => {
  it('emits a heading with a count, then the list', () => {
    expect(
      prompt()
        .filesList('Changed', [{ filename: 'a.ts' }, { filename: 'b.ts' }])
        .build(),
    ).toBe('## Changed (2 files)\n\n- a.ts\n- b.ts')
  })

  it('appends status, additions, and deletions when present', () => {
    expect(
      prompt()
        .filesList('Changed', [
          { filename: 'a.ts', status: 'modified', additions: 3, deletions: 1 },
        ])
        .build(),
    ).toBe('## Changed (1 file)\n\n- a.ts (modified) +3 -1')
  })

  it('omits zero additions and deletions (falsy, not absent)', () => {
    expect(
      prompt()
        .filesList('Changed', [{ filename: 'a.ts', additions: 0, deletions: 0 }])
        .build(),
    ).toBe('## Changed (1 file)\n\n- a.ts')
  })

  it('renders status without counts', () => {
    expect(
      prompt()
        .filesList('Changed', [{ filename: 'a.ts', status: 'added' }])
        .build(),
    ).toBe('## Changed (1 file)\n\n- a.ts (added)')
  })

  it('renders additions without deletions', () => {
    expect(
      prompt()
        .filesList('Changed', [{ filename: 'a.ts', additions: 5 }])
        .build(),
    ).toBe('## Changed (1 file)\n\n- a.ts +5')
  })

  it('emits nothing for an empty file array', () => {
    expect(prompt().filesList('Changed', []).build()).toBe('')
  })
})

describe('analysisRequirements()', () => {
  it('renders heading, description, and numbered requirements', () => {
    expect(prompt().analysisRequirements('Do this.', ['One', 'Two']).build()).toBe(
      '## Analysis Requirements\n\nDo this.\n\n1. One\n2. Two',
    )
  })

  it('appends a JSON schema block when given a structure', () => {
    expect(prompt().analysisRequirements('D', ['One'], { a: 1 }).build()).toBe(
      '## Analysis Requirements\n\nD\n\n1. One\n\n' +
        'Format your response as JSON with the following structure:\n\n' +
        '```json\n{\n  "a": 1\n}\n```',
    )
  })
})
