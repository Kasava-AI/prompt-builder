import { describe, it, expectTypeOf } from 'vitest'
import {
  prompt,
  section,
  PromptBuilder,
  type ArrowRule,
  type ProtocolStep,
  type TableRow,
  type WorkedExample,
  definePrompt,
  text,
  num,
  bool,
  list,
  json,
} from '../src/index'

/**
 * Type-surface compatibility.
 *
 * PLAN-0.3.0.md §6 makes source compatibility absolute, and Phase 2 turns
 * `PromptBuilder` into `PromptBuilder<TVars = {}>`. A defaulted type parameter
 * keeps every bare annotation compiling — these assertions are what proves it
 * when that lands.
 *
 * Run via `pnpm type-check` (tsconfig.test.json) and `vitest typecheck`.
 */

describe('factory return types', () => {
  it('prompt() returns a PromptBuilder', () => {
    expectTypeOf(prompt()).toEqualTypeOf<PromptBuilder>()
  })

  it('section() returns a PromptBuilder', () => {
    expectTypeOf(section('T')).toEqualTypeOf<PromptBuilder>()
  })

  it('build() returns a string', () => {
    expectTypeOf(prompt().build()).toBeString()
  })
})

describe('bare PromptBuilder annotations still compile', () => {
  it('as a variable type', () => {
    const b: PromptBuilder = prompt()
    expectTypeOf(b).toEqualTypeOf<PromptBuilder>()
  })

  it('as a parameter and return type', () => {
    const helper = (b: PromptBuilder): PromptBuilder => b.raw('x')
    expectTypeOf(helper).parameters.toEqualTypeOf<[PromptBuilder]>()
    expectTypeOf(helper).returns.toEqualTypeOf<PromptBuilder>()
  })

  it('in an array', () => {
    const frags: PromptBuilder[] = [prompt(), section('T')]
    expectTypeOf(frags).toEqualTypeOf<PromptBuilder[]>()
  })
})

describe('chaining preserves the instance type', () => {
  it('across every category of method', () => {
    expectTypeOf(prompt().heading('h')).toEqualTypeOf<PromptBuilder>()
    expectTypeOf(prompt().list(['a'])).toEqualTypeOf<PromptBuilder>()
    expectTypeOf(prompt().tag('a', 'b')).toEqualTypeOf<PromptBuilder>()
    expectTypeOf(prompt().protocol({ name: 'n', steps: [] })).toEqualTypeOf<PromptBuilder>()
    expectTypeOf(prompt().include('s')).toEqualTypeOf<PromptBuilder>()
  })
})

describe('include() accepts both documented inputs', () => {
  it('a string', () => {
    expectTypeOf(prompt().include).toBeCallableWith('text')
  })

  it('another builder', () => {
    expectTypeOf(prompt().include).toBeCallableWith(section('T'))
  })
})

describe('conditional() narrows the value', () => {
  it('strips null and undefined in the callback', () => {
    const value = null as { name: string } | null | undefined
    prompt().conditional(value, (b, v) => {
      expectTypeOf(v).toEqualTypeOf<{ name: string }>()
      expectTypeOf(b).toEqualTypeOf<PromptBuilder>()
      return b
    })
  })

  it('accepts a numeric length guard', () => {
    const items: string[] = []
    expectTypeOf(prompt().conditional).toBeFunction()
    prompt().conditional(items.length, (b) => {
      expectTypeOf(b).toEqualTypeOf<PromptBuilder>()
      return b
    })
  })
})

describe('overloaded list signatures', () => {
  it('accepts the titleless form', () => {
    expectTypeOf(prompt().list).toBeCallableWith(['a'])
    expectTypeOf(prompt().numberedList).toBeCallableWith(['a'])
  })

  it('accepts the titled form', () => {
    expectTypeOf(prompt().list).toBeCallableWith('T', ['a'])
    expectTypeOf(prompt().numberedList).toBeCallableWith('T', ['a'])
  })
})

describe('statics', () => {
  it('truncate returns a string', () => {
    expectTypeOf(PromptBuilder.truncate('a', 1)).toBeString()
  })

  it('formatLimitedList is generic over the item type', () => {
    expectTypeOf(PromptBuilder.formatLimitedList([1, 2], (n) => `${n}`, 1)).toEqualTypeOf<string[]>()
  })
})

describe('InferVars — required vs optional', () => {
  const schema = definePrompt('t', {
    required: text().notNull(),
    withDefault: num().default(0),
    requiredWithDefault: text().notNull().default('x'),
    plain: bool(),
    structured: json<{ id: string }>().notNull(),
  })

  type Vars = typeof schema.$inferVars

  it('marks .notNull() with no default as required', () => {
    expectTypeOf<Vars>().toHaveProperty('required').toEqualTypeOf<string>()
    expectTypeOf<Vars>().toHaveProperty('structured').toEqualTypeOf<{ id: string }>()
  })

  it('marks a defaulted variable optional even when notNull', () => {
    expectTypeOf<Vars>().toHaveProperty('withDefault').toEqualTypeOf<number | undefined>()
    expectTypeOf<Vars>().toHaveProperty('requiredWithDefault').toEqualTypeOf<string | undefined>()
  })

  it('marks a plain variable optional', () => {
    expectTypeOf<Vars>().toHaveProperty('plain').toEqualTypeOf<boolean | undefined>()
  })

  it('rejects a payload missing a required variable', () => {
    const template = schema.body(() => prompt())
    // @ts-expect-error `required` and `structured` are missing
    expectTypeOf(template.render).toBeCallableWith({})
    expectTypeOf(template.render).toBeCallableWith({ required: 'a', structured: { id: 'b' } })
  })

  it('gives the body callback defined values for required and defaulted vars', () => {
    schema.body((v) => {
      expectTypeOf(v.required).toEqualTypeOf<string>()
      expectTypeOf(v.withDefault).toEqualTypeOf<number>()
      expectTypeOf(v.plain).toEqualTypeOf<boolean | undefined>()
      return prompt()
    })
  })

  it('carries list() and json() element types', () => {
    const s = definePrompt('l', { xs: list().notNull(), obj: json<{ n: number }>().notNull() })
    expectTypeOf<typeof s.$inferVars>().toHaveProperty('xs').toEqualTypeOf<string[]>()
    expectTypeOf<typeof s.$inferVars>().toHaveProperty('obj').toEqualTypeOf<{ n: number }>()
  })
})

describe('exported interfaces keep their shape', () => {
  it('ArrowRule', () => {
    expectTypeOf<ArrowRule>().toMatchObjectType<{
      name: string
      description?: string
      rules: string[]
    }>()
  })

  it('ProtocolStep', () => {
    expectTypeOf<ProtocolStep>().toMatchObjectType<{
      label: string
      description?: string
      actions?: string[]
    }>()
  })

  it('TableRow is a two-tuple of strings', () => {
    expectTypeOf<TableRow>().toEqualTypeOf<[string, string]>()
  })

  it('WorkedExample', () => {
    expectTypeOf<WorkedExample>().toMatchObjectType<{
      mention: string
      context: string
      protocol: string
      toolCalls: string[]
      response: string
    }>()
  })
})
