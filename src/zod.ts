import { z } from 'zod'
import type { InferVars, PromptSchema, VarShape, VarType } from './schema'

/**
 * Zod schemas generated from a prompt schema — the `drizzle-zod` analogue.
 *
 * A prompt schema already declares what each variable is and whether it is
 * required. This turns that into a runtime validator, which matters when the
 * render payload comes from somewhere untyped: an HTTP body, a queue message, a
 * database row, another model's structured output.
 *
 * `zod` is an optional peer dependency. Importing this module without zod
 * installed will fail; the core entry point never touches it.
 *
 * ```typescript
 * import { createVarsSchema } from '@kasava/prompt-builder/zod'
 *
 * const schema = createVarsSchema(userContext, {
 *   userName: (s) => s.max(80),
 * })
 *
 * const vars = schema.parse(await request.json())
 * template.render(vars)
 * ```
 */

/** The TypeScript type a declared variable carries. */
type VarData<V> = V extends { config: { _data: infer T } } ? T : never

/**
 * The concrete Zod type generated for a variable, so refinement callbacks get
 * the real thing — `(s) => s.max(80)` rather than a cast.
 *
 * `json<T>()` has no runtime shape to generate, so it stays wide.
 */
type ZodTypeFor<T> = [T] extends [string]
  ? z.ZodString
  : [T] extends [number]
    ? z.ZodNumber
    : [T] extends [boolean]
      ? z.ZodBoolean
      : [T] extends [string[]]
        ? z.ZodArray<z.ZodString>
        : z.ZodTypeAny

/** Refinement callbacks, keyed by variable name. */
export type Refinements<S extends VarShape> = {
  [K in keyof S]?: (schema: ZodTypeFor<VarData<S[K]>>) => z.ZodTypeAny
}

function baseSchemaFor(type: VarType): z.ZodTypeAny {
  switch (type) {
    case 'text':
      return z.string()
    case 'number':
      return z.number()
    case 'boolean':
      return z.boolean()
    case 'list':
      return z.array(z.string())
    case 'json':
      // json<T>() carries a compile-time type with no runtime shape to check.
      // Validating it would mean guessing; refine the field explicitly if the
      // payload is untrusted.
      return z.unknown()
  }
}

/**
 * Build a Zod object schema matching a prompt's render payload.
 *
 * Required variables (`.notNull()` with no `.default()`) are required in the
 * Zod schema; everything else is optional, exactly as `$inferVars` types it.
 *
 * @param schema - the prompt schema to derive from
 * @param refinements - per-variable callbacks to tighten the generated schema
 */
export function createVarsSchema<S extends VarShape>(
  schema: PromptSchema<S>,
  refinements: Refinements<S> = {},
): z.ZodType<InferVars<S>> {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const [key, variable] of Object.entries(schema.vars)) {
    const { _type, _required, _hasDefault } = variable.config

    let field = baseSchemaFor(_type as VarType)
    const refine = refinements[key as keyof S] as
      | ((schema: z.ZodTypeAny) => z.ZodTypeAny)
      | undefined
    if (refine) field = refine(field)

    // Mirrors InferVars: required only when notNull and undefaulted.
    if (!(_required === true && _hasDefault !== true)) field = field.optional()

    shape[key] = field
  }

  return z.object(shape) as unknown as z.ZodType<InferVars<S>>
}
