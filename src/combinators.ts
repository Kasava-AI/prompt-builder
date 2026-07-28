import { Fragment } from './template'
import { PromptBuilder, prompt } from './prompt-builder'

/**
 * Standalone composition helpers — the `eq()` / `and()` / `or()` analogue.
 *
 * Pre-0.3.0 the only conditional was the chained `.conditional()` method, so
 * composition had to happen inside a chain. These are values: build them
 * anywhere, store them in a config object, pass them around, then `.include()`
 * whatever survives.
 */

/** Anything that can be composed into a prompt. */
export type Includable = PromptBuilder | Fragment | string | null | undefined | false

function toBuilder(value: Includable): PromptBuilder | null {
  if (value === null || value === undefined || value === false) return null
  if (value instanceof PromptBuilder) return value
  return prompt().include(value)
}

/**
 * Append `item` to `out`, skipping anything with no content.
 *
 * `include()` of an empty builder deliberately leaves an `empty` marker node so
 * `markdown({ strict: true })` can reproduce the stray blank line v0.2.2 emitted
 * there. Combinators are new API with no legacy to preserve, so they drop empty
 * results outright and keep the AST clean for walking and budgeting.
 */
function appendTo(out: PromptBuilder, item: Includable): void {
  const builder = toBuilder(item)
  if (builder && builder.toAST().length > 0) out.include(builder)
}

/**
 * Include content only when the condition is truthy.
 *
 * @example
 * ```typescript
 * prompt()
 *   .include(BASE_RULES)
 *   .include(when(flags.toolSearch, TOOL_SEARCH_BLOCK))
 * ```
 */
export function when(condition: unknown, content: Includable): PromptBuilder {
  return condition ? (toBuilder(content) ?? prompt()) : prompt()
}

/** Include content only when the condition is falsy. The inverse of `when()`. */
export function unless(condition: unknown, content: Includable): PromptBuilder {
  return condition ? prompt() : (toBuilder(content) ?? prompt())
}

/**
 * Concatenate everything, skipping nullish and `false` entries.
 *
 * Replaces the `if/else` reassignment chains that flag-gated prompts use today.
 *
 * @example
 * ```typescript
 * all(
 *   BASE_RULES,
 *   when(flags.toolSearch, TOOL_SEARCH_BLOCK),
 *   unless(flags.toolSearch, TOOL_CATALOG),
 * )
 * ```
 */
export function all(...items: Includable[]): PromptBuilder {
  const out = prompt()
  for (const item of items) appendTo(out, item)
  return out
}

/**
 * The first entry that produces content — a fallback chain.
 *
 * @example
 * ```typescript
 * any(userOverride, teamDefault, BUILT_IN_FALLBACK)
 * ```
 */
export function any(...items: Includable[]): PromptBuilder {
  for (const item of items) {
    const builder = toBuilder(item)
    if (builder && builder.build().length > 0) return builder
  }
  return prompt()
}

/**
 * Map over a collection and concatenate the results.
 *
 * @example
 * ```typescript
 * each(protocols, (proto) => p`### ${proto.name}\n${proto.body}`)
 * ```
 */
export function each<T>(
  items: readonly T[],
  render: (item: T, index: number) => Includable,
): PromptBuilder {
  const out = prompt()
  items.forEach((item, i) => appendTo(out, render(item, i)))
  return out
}
