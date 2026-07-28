import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { definePrompt, text, num, bool, list, json, prompt, p } from '../src/index'
import { createVarsSchema } from '../src/zod'

/**
 * The `drizzle-zod` analogue. A prompt schema already knows what each variable
 * is and whether it is required; this turns that into a runtime validator for
 * payloads arriving from somewhere untyped.
 */

const schema = definePrompt('user_context', {
  userName: text().notNull(),
  totalWatched: num().default(0),
  isMobile: bool(),
  activeShows: list().default([]),
  prefs: json<{ kind: string }[]>().default([]),
})

describe('createVarsSchema()', () => {
  const vars = createVarsSchema(schema)

  it('accepts a payload with only the required variable', () => {
    expect(vars.parse({ userName: 'Ada' })).toEqual({ userName: 'Ada' })
  })

  it('accepts a fully-populated payload', () => {
    const payload = {
      userName: 'Ada',
      totalWatched: 12,
      isMobile: true,
      activeShows: ['Severance'],
      prefs: [{ kind: 'genre' }],
    }
    expect(vars.parse(payload)).toEqual(payload)
  })

  it('rejects a payload missing a required variable', () => {
    expect(() => vars.parse({})).toThrow()
  })

  it('rejects a wrong type on a required variable', () => {
    expect(() => vars.parse({ userName: 42 })).toThrow()
  })

  it('rejects a wrong type on an optional variable', () => {
    expect(() => vars.parse({ userName: 'Ada', totalWatched: 'lots' })).toThrow()
  })

  it('validates list() as a string array', () => {
    expect(() => vars.parse({ userName: 'Ada', activeShows: [1, 2] })).toThrow()
  })

  it('leaves json() unvalidated — there is no runtime shape to check', () => {
    expect(vars.parse({ userName: 'Ada', prefs: 'anything' })).toMatchObject({ prefs: 'anything' })
  })
})

describe('required/optional mirrors $inferVars', () => {
  it('treats notNull() with a default as optional', () => {
    const s = definePrompt('t', { withDefault: text().notNull().default('x') })
    expect(createVarsSchema(s).parse({})).toEqual({})
  })

  it('treats a plain variable as optional', () => {
    const s = definePrompt('t', { plain: text() })
    expect(createVarsSchema(s).parse({})).toEqual({})
  })

  it('treats notNull() with no default as required', () => {
    const s = definePrompt('t', { required: text().notNull() })
    expect(() => createVarsSchema(s).parse({})).toThrow()
  })
})

describe('refinements', () => {
  it('tightens a generated field', () => {
    const vars = createVarsSchema(schema, {
      userName: (s) => s.max(3),
    })
    expect(vars.parse({ userName: 'Ada' })).toEqual({ userName: 'Ada' })
    expect(() => vars.parse({ userName: 'Adalovelace' })).toThrow()
  })

  it('can give json() a real shape', () => {
    const vars = createVarsSchema(schema, {
      prefs: () => z.array(z.object({ kind: z.string() })),
    })
    expect(() => vars.parse({ userName: 'Ada', prefs: [{ wrong: 1 }] })).toThrow()
    expect(vars.parse({ userName: 'Ada', prefs: [{ kind: 'genre' }] })).toMatchObject({
      prefs: [{ kind: 'genre' }],
    })
  })

  it('keeps a refined optional variable optional', () => {
    const vars = createVarsSchema(schema, {
      totalWatched: (s) => s.min(0),
    })
    expect(vars.parse({ userName: 'Ada' })).toEqual({ userName: 'Ada' })
    expect(() => vars.parse({ userName: 'Ada', totalWatched: -1 })).toThrow()
  })

  it('leaves unrefined variables alone', () => {
    const vars = createVarsSchema(schema, { userName: (s) => s })
    expect(vars.parse({ userName: 'Ada', isMobile: true })).toMatchObject({ isMobile: true })
  })
})

describe('end to end', () => {
  it('validates an untyped payload, then renders it', () => {
    const template = schema.body((v) => prompt().raw(p`${v.userName} watched ${v.totalWatched}`))
    const untrusted: unknown = JSON.parse('{"userName":"Ada","totalWatched":12}')
    const vars = createVarsSchema(schema).parse(untrusted)
    expect(template.render(vars)).toBe('Ada watched 12')
  })
})
