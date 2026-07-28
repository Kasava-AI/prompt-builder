import { markdown } from './dialects/markdown'
import { render, resolve, type Dialect, type Node } from './ast'
import { PreparedPrompt } from './prepared'
import type { PromptBuilder } from './prompt-builder'

/**
 * Typed prompt variables — the `pgTable` analogue.
 *
 * This is the half of the mapping the library was missing. A prompt used to be
 * a string constant assembled at module load, with no declaration of what data
 * it needs. Now it has a schema: what variables exist, which are required,
 * what they default to, and what TypeScript type each carries.
 */

/** The kinds of variable a schema can declare. */
export type VarType = 'text' | 'number' | 'boolean' | 'list' | 'json'

/**
 * Internal shape of a declared variable.
 *
 * `R` and `D` are carried as literal boolean types, not `boolean` — that is what
 * lets `InferVars` tell a required variable from an optional one. Declaring them
 * as plain `boolean` widens the flags and silently makes every variable
 * optional in the render payload.
 */
export interface VarConfig<T, R extends boolean = boolean, D extends boolean = boolean> {
  readonly _type: VarType
  readonly _required: R
  readonly _default?: T
  readonly _hasDefault: D
  /** Phantom, for type inference only. Never populated at runtime. */
  readonly _data: T
}

/**
 * A variable declaration.
 *
 * Modifiers mirror Drizzle's column builders: `.notNull()` makes a variable
 * required, `.default()` supplies a fallback, `.$type<T>()` retypes without
 * changing runtime behavior. Each returns a new instance whose type records the
 * modifier.
 */
export class Var<T, R extends boolean = false, D extends boolean = false> {
  constructor(readonly config: VarConfig<T, R, D>) {}

  /** Require a value at render time. */
  notNull(): Var<T, true, D> {
    return new Var({ ...this.config, _required: true } as VarConfig<T, true, D>)
  }

  /** Supply a fallback, which also makes the variable optional. */
  default(value: T): Var<T, R, true> {
    return new Var({ ...this.config, _default: value, _hasDefault: true } as VarConfig<T, R, true>)
  }

  /** Retype the variable. Compile-time only. */
  $type<U extends T>(): Var<U, R, D> {
    return this as unknown as Var<U, R, D>
  }
}

function makeVar<T>(type: VarType): Var<T, false, false> {
  return new Var<T, false, false>({
    _type: type,
    _required: false,
    _hasDefault: false,
    _data: undefined as T,
  })
}

/** A string variable. */
export const text = () => makeVar<string>('text')
/** A numeric variable. */
export const num = () => makeVar<number>('number')
/** A boolean variable. */
export const bool = () => makeVar<boolean>('boolean')
/** A string-array variable, comma-joined when interpolated. */
export const list = () => makeVar<string[]>('list')
/** An arbitrary structured variable, JSON-serialized when interpolated. */
export const json = <T>() => makeVar<T>('json')

/** A set of variable declarations. */
export type VarShape = Record<string, Var<any, any, any>>

/** The TypeScript type a variable carries. */
type VarData<V> = V extends Var<infer T, any, any> ? T : never

/** True when a variable must be supplied: `.notNull()` and no `.default()`. */
type IsRequired<V> =
  V extends Var<any, infer R, infer D> ? (R extends true ? (D extends true ? false : true) : false) : false

/** True when the body callback is guaranteed a value: required, or defaulted. */
type IsAlwaysPresent<V> =
  V extends Var<any, infer R, infer D> ? (R extends true ? true : D extends true ? true : false) : false

type RequiredKeys<S extends VarShape> = {
  [K in keyof S]: IsRequired<S[K]> extends true ? K : never
}[keyof S]

type OptionalKeys<S extends VarShape> = Exclude<keyof S, RequiredKeys<S>>

/**
 * The render payload for a schema.
 *
 * A variable is required exactly when it is `.notNull()` and has no
 * `.default()` — the same rule Drizzle applies to insert types.
 */
export type InferVars<S extends VarShape> = {
  [K in RequiredKeys<S>]: VarData<S[K]>
} & {
  [K in OptionalKeys<S>]?: VarData<S[K]>
}

/**
 * Values as the body callback sees them.
 *
 * Required and defaulted variables are guaranteed present; a variable that is
 * neither may legitimately be missing, and is typed to force the check.
 */
export type ResolvedVars<S extends VarShape> = {
  [K in keyof S]: IsAlwaysPresent<S[K]> extends true ? VarData<S[K]> : VarData<S[K]> | undefined
}

/** Thrown when a required variable is missing at render time. */
export class MissingVarError extends Error {
  constructor(
    readonly promptName: string,
    readonly variable: string,
  ) {
    super(
      `Prompt "${promptName}" requires the variable "${variable}". ` +
        `Pass it to .render({ ${variable}: ... }), or relax it with .default() in the schema.`,
    )
    this.name = 'MissingVarError'
  }
}

/**
 * A prompt with a declared schema and a body.
 *
 * Produced by `definePrompt(...).body(...)`.
 */
export class PromptTemplate<S extends VarShape> {
  constructor(
    readonly name: string,
    readonly vars: S,
    private readonly builder: (vars: ResolvedVars<S>) => PromptBuilder,
  ) {}

  /** Apply defaults and check that every required variable is present. */
  private bind(values: InferVars<S>): ResolvedVars<S> {
    const supplied = values as Record<string, unknown>
    const out: Record<string, unknown> = {}

    for (const [key, variable] of Object.entries(this.vars)) {
      const { _required, _hasDefault, _default } = variable.config
      if (key in supplied && supplied[key] !== undefined) {
        out[key] = supplied[key]
      } else if (_hasDefault) {
        out[key] = _default
      } else if (_required) {
        throw new MissingVarError(this.name, key)
      } else {
        out[key] = undefined
      }
    }
    return out as ResolvedVars<S>
  }

  /** The AST for a given set of values. */
  toAST(values: InferVars<S>): Node[] {
    return resolve(this.builder(this.bind(values)).toAST())
  }

  /** Render the prompt for a given set of values. */
  render(values: InferVars<S>, dialect: Dialect = markdown()): string {
    return render(this.toAST(values), dialect)
  }

  /**
   * Compile with a fixed set of values.
   *
   * The body callback runs once. Useful when the same values are rendered to
   * several dialects, or when only placeholder slots vary.
   */
  prepare(values: InferVars<S>, dialect: Dialect = markdown()): PreparedPrompt {
    return new PreparedPrompt(this.name, this.builder(this.bind(values)).toAST(), dialect)
  }
}

/**
 * A declared prompt schema, awaiting a body.
 *
 * @example
 * ```typescript
 * const userContext = definePrompt('user_context', {
 *   userName:     text().notNull(),
 *   activeShows:  list().default([]),
 *   totalWatched: num().default(0),
 *   isMobile:     bool().default(false),
 * })
 *
 * type Vars = typeof userContext.$inferVars
 * // { userName: string; activeShows?: string[]; totalWatched?: number; isMobile?: boolean }
 *
 * const template = userContext.body((v) => prompt()
 *   .tag('user_context', p`Active shows (${v.activeShows.length}): ${v.activeShows}`)
 *   .include(when(v.isMobile, MOBILE_RULES))
 * )
 *
 * template.render({ userName: 'Ada', activeShows: ['Severance'] })
 * ```
 */
export class PromptSchema<S extends VarShape> {
  constructor(
    readonly name: string,
    readonly vars: S,
  ) {}

  /** The render payload type. Type-only — reading it at runtime gives undefined. */
  declare readonly $inferVars: InferVars<S>

  /** Attach a body, producing a renderable template. */
  body(builder: (vars: ResolvedVars<S>) => PromptBuilder): PromptTemplate<S> {
    return new PromptTemplate(this.name, this.vars, builder)
  }
}

/** Declare a prompt and its variables. */
export function definePrompt<S extends VarShape>(name: string, vars: S): PromptSchema<S> {
  return new PromptSchema(name, vars)
}
