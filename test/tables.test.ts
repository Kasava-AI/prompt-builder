import { describe, it, expect } from 'vitest'
import { prompt } from '../src/index'

describe('table()', () => {
  it('renders a header, divider, and body', () => {
    expect(
      prompt()
        .table(['A', 'B'], [
          ['1', '2'],
          ['3', '4'],
        ])
        .build(),
    ).toBe('| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |')
  })

  it('emits nothing when there are no rows', () => {
    expect(prompt().table(['A', 'B'], []).build()).toBe('')
  })

  it('supports an arbitrary column count', () => {
    expect(prompt().table(['A', 'B', 'C'], [['1', '2', '3']]).build()).toBe(
      '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |',
    )
  })

  it('supports a single column', () => {
    expect(prompt().table(['A'], [['1']]).build()).toBe('| A |\n|---|\n| 1 |')
  })
})

describe('lookupTable()', () => {
  it('renders a bare two-column table', () => {
    expect(
      prompt()
        .lookupTable({ columns: ['K', 'V'], rows: [['a', 'b']] })
        .build(),
    ).toBe('| K | V |\n|---|---|\n| a | b |')
  })

  it('prefixes a level-2 heading when given a title', () => {
    expect(
      prompt()
        .lookupTable({ title: 'T', columns: ['K', 'V'], rows: [['a', 'b']] })
        .build(),
    ).toBe('## T\n\n| K | V |\n|---|---|\n| a | b |')
  })

  it('includes a description between title and table', () => {
    expect(
      prompt()
        .lookupTable({ title: 'T', description: 'D', columns: ['K', 'V'], rows: [['a', 'b']] })
        .build(),
    ).toBe('## T\n\nD\n\n| K | V |\n|---|---|\n| a | b |')
  })

  it('appends a post-note after the table', () => {
    expect(
      prompt()
        .lookupTable({ columns: ['K', 'V'], rows: [['a', 'b']], postNote: 'N' })
        .build(),
    ).toBe('| K | V |\n|---|---|\n| a | b |\n\nN')
  })

  it('emits nothing when rows is empty, matching table() (§6 row 8)', () => {
    expect(prompt().lookupTable({ columns: ['K', 'V'], rows: [] }).build()).toBe('')
  })

  it('keeps the title even when the table itself is dropped', () => {
    expect(prompt().lookupTable({ title: 'T', columns: ['K', 'V'], rows: [] }).build()).toBe('## T')
  })
})

describe('table cell escaping (§6 row 3)', () => {
  it('escapes a pipe so the row keeps its column count', () => {
    expect(prompt().table(['A', 'B'], [['a|b', 'c']]).build()).toBe(
      '| A | B |\n|---|---|\n| a\\|b | c |',
    )
  })

  it('escapes a pipe in a column header', () => {
    expect(prompt().table(['A|X', 'B'], [['1', '2']]).build()).toBe(
      '| A\\|X | B |\n|---|---|\n| 1 | 2 |',
    )
  })

  it('collapses newlines so a cell cannot split the row', () => {
    expect(prompt().table(['A'], [['x\ny']]).build()).toBe('| A |\n|---|\n| x y |')
  })

  it('escapes lookupTable cells too', () => {
    expect(
      prompt()
        .lookupTable({ columns: ['K', 'V'], rows: [['a', 'b|c']] })
        .build(),
    ).toBe('| K | V |\n|---|---|\n| a | b\\|c |')
  })
})

describe('followThroughMatrix()', () => {
  it('delegates to lookupTable with fixed column names and the rule as post-note', () => {
    expect(
      prompt()
        .followThroughMatrix({
          title: 'Follow-through',
          rows: [{ action: 'Closed issue', followThrough: 'Offer a recap' }],
          postRule: 'Always offer exactly one next step.',
        })
        .build(),
    ).toBe(
      '## Follow-through\n\n' +
        '| Completed action | Follow-through offer |\n' +
        '|---|---|\n' +
        '| Closed issue | Offer a recap |\n\n' +
        'Always offer exactly one next step.',
    )
  })

  it('includes an optional description', () => {
    expect(
      prompt()
        .followThroughMatrix({
          title: 'T',
          description: 'D',
          rows: [{ action: 'a', followThrough: 'b' }],
          postRule: 'R',
        })
        .build(),
    ).toBe('## T\n\nD\n\n| Completed action | Follow-through offer |\n|---|---|\n| a | b |\n\nR')
  })
})
