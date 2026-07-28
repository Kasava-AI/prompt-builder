import { describe, it, expect } from 'vitest'
import {
  definePrompt,
  text,
  num,
  bool,
  list,
  json,
  prompt,
  p,
  when,
  MissingVarError,
  markdown,
} from '../src/index'

describe('definePrompt()', () => {
  it('keeps its name and declarations', () => {
    const schema = definePrompt('user_context', { userName: text() })
    expect(schema.name).toBe('user_context')
    expect(Object.keys(schema.vars)).toEqual(['userName'])
  })
})

describe('variable builders', () => {
  it('record their type', () => {
    expect(text().config._type).toBe('text')
    expect(num().config._type).toBe('number')
    expect(bool().config._type).toBe('boolean')
    expect(list().config._type).toBe('list')
    expect(json<{ a: 1 }>().config._type).toBe('json')
  })

  it('are optional by default', () => {
    expect(text().config._required).toBe(false)
    expect(text().config._hasDefault).toBe(false)
  })

  it('notNull() makes them required', () => {
    expect(text().notNull().config._required).toBe(true)
  })

  it('default() records the fallback', () => {
    const v = num().default(7)
    expect(v.config._hasDefault).toBe(true)
    expect(v.config._default).toBe(7)
  })

  it('modifiers compose in either order', () => {
    const a = text().notNull().default('x')
    const b = text().default('x').notNull()
    expect(a.config).toEqual(b.config)
  })

  it('$type() is a compile-time-only retype', () => {
    const v = json<Record<string, unknown>>().$type<{ id: string }>()
    expect(v.config._type).toBe('json')
  })

  it('returns a new instance rather than mutating', () => {
    const base = text()
    const required = base.notNull()
    expect(base.config._required).toBe(false)
    expect(required.config._required).toBe(true)
  })
})

describe('render()', () => {
  const userContext = definePrompt('user_context', {
    userName: text().notNull(),
    activeShows: list().default([]),
    totalWatched: num().default(0),
    isMobile: bool().default(false),
  })

  const template = userContext.body((v) =>
    prompt()
      .tag(
        'user_context',
        p`
          User: ${v.userName}
          Active shows (${v.activeShows.length}): ${v.activeShows}
          Total watched: ${v.totalWatched}
        `,
      )
      .include(when(v.isMobile, 'Keep replies short.')),
  )

  it('applies defaults for omitted variables', () => {
    expect(template.render({ userName: 'Ada' })).toBe(
      '<user_context>\nUser: Ada\nActive shows (0): \nTotal watched: 0\n</user_context>',
    )
  })

  it('uses supplied values', () => {
    expect(template.render({ userName: 'Ada', activeShows: ['Severance', 'Andor'] })).toContain(
      'Active shows (2): Severance, Andor',
    )
  })

  it('drives conditional sections from variables', () => {
    expect(template.render({ userName: 'Ada', isMobile: true })).toContain('Keep replies short.')
    expect(template.render({ userName: 'Ada', isMobile: false })).not.toContain(
      'Keep replies short.',
    )
  })

  it('throws a helpful error for a missing required variable', () => {
    // @ts-expect-error userName is required
    expect(() => template.render({})).toThrow(MissingVarError)
    // @ts-expect-error userName is required
    expect(() => template.render({})).toThrow(/requires the variable "userName"/)
  })

  it('treats an explicit undefined as absent, falling back to the default', () => {
    expect(template.render({ userName: 'Ada', totalWatched: undefined })).toContain(
      'Total watched: 0',
    )
  })

  it('renders the same values identically every time', () => {
    const a = template.render({ userName: 'Ada' })
    const b = template.render({ userName: 'Ada' })
    expect(a).toBe(b)
  })

  it('accepts a dialect', () => {
    const simple = definePrompt('s', { v: text().notNull() }).body((x) =>
      prompt().field('Label', x.v),
    )
    expect(simple.render({ v: 'x' })).toBe('**Label:** x')
    expect(simple.render({ v: 'x' }, markdown({ strict: true }))).toBe('**Label**: x')
  })
})

describe('optional variables with no default', () => {
  const schema = definePrompt('optional', { note: text() })
  const template = schema.body((v) => prompt().field('Note', v.note ?? '(none)'))

  it('are undefined when omitted', () => {
    expect(template.render({})).toBe('**Note:** (none)')
  })

  it('are passed through when supplied', () => {
    expect(template.render({ note: 'hi' })).toBe('**Note:** hi')
  })
})

describe('toAST()', () => {
  it('returns a resolved AST for the given values', () => {
    const template = definePrompt('t', { name: text().notNull() }).body((v) =>
      prompt().heading('H').raw(p`hi ${v.name}`),
    )
    const ast = template.toAST({ name: 'Ada' })
    expect(ast).toEqual([
      { kind: 'heading', level: 2, text: 'H' },
      { kind: 'text', text: 'hi Ada' },
    ])
  })
})

describe('prepare()', () => {
  it('compiles with fixed values', () => {
    const template = definePrompt('t', { name: text().notNull() }).body((v) =>
      prompt().raw(p`hi ${v.name}`),
    )
    expect(template.prepare({ name: 'Ada' }).render()).toBe('hi Ada')
  })

  it('carries the schema name', () => {
    const template = definePrompt('greeting', {}).body(() => prompt().raw('hi'))
    expect(template.prepare({}).name).toBe('greeting')
  })

  it('validates required variables like render() does', () => {
    const template = definePrompt('t', { name: text().notNull() }).body((v) =>
      prompt().raw(p`hi ${v.name}`),
    )
    // @ts-expect-error name is required
    expect(() => template.prepare({})).toThrow(MissingVarError)
  })
})

describe('json variables', () => {
  it('carry structured data through to the body', () => {
    interface Pref {
      kind: string
      sentiment: string
    }
    const schema = definePrompt('prefs', { prefs: json<Pref[]>().default([]) })
    const template = schema.body((v) =>
      prompt().list(v.prefs.map((x) => `${x.kind}: ${x.sentiment}`)),
    )
    expect(template.render({ prefs: [{ kind: 'genre', sentiment: 'like' }] })).toBe(
      '- genre: like',
    )
  })

  it('JSON-serialize when interpolated directly', () => {
    const schema = definePrompt('raw', { cfg: json<{ a: number }>().notNull() })
    const template = schema.body((v) => prompt().raw(p`cfg=${v.cfg}`))
    expect(template.render({ cfg: { a: 1 } })).toBe('cfg={"a":1}')
  })
})
