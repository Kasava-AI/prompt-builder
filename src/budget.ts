import { render, type Dialect, type Node, type Priority } from './ast'

/**
 * Measures how much of a budget a piece of text consumes.
 *
 * Supply a real tokenizer for accuracy. The library ships no tokenizer and takes
 * no dependency on one — every provider counts differently, and a wrong count
 * is worse than an approximate one you chose knowingly.
 */
export type TokenCounter = (text: string) => number

/**
 * The default counter: roughly four characters per token.
 *
 * A rule of thumb for English prose, not a measurement. Code, JSON, and
 * non-Latin scripts all diverge. Pass your provider's tokenizer when the margin
 * matters.
 */
export const approximateTokens: TokenCounter = (text) => Math.ceil(text.length / 4)

export interface BudgetOptions {
  /** Ceiling, measured by `counter`. */
  maxTokens: number
  /** How to measure. Defaults to `approximateTokens`. */
  counter?: TokenCounter
  /** How to serialize while measuring. Must match how the prompt is finally rendered. */
  dialect?: Dialect
}

/** Thrown when the `required` nodes alone exceed the budget. */
export class BudgetExceededError extends Error {
  constructor(
    readonly required: number,
    readonly maxTokens: number,
  ) {
    super(
      `Required content alone is ${required} tokens, over the ${maxTokens} budget. ` +
        `Lower some nodes' priority, or raise maxTokens.`,
    )
    this.name = 'BudgetExceededError'
  }
}

/** Drop order: least important first, and within a tier the latest node first. */
const DROP_ORDER: Priority[] = ['low', 'normal', 'high']

/**
 * Trim an AST until it fits a token budget.
 *
 * Drops whole nodes rather than truncating text, so the result is always
 * well-formed — a half-cut table or an orphaned heading is worse than a missing
 * section. `required` nodes are never dropped; if they alone exceed the budget
 * this throws rather than silently returning something over budget.
 */
export function applyBudget(
  nodes: readonly Node[],
  options: BudgetOptions,
  dialect: Dialect,
): Node[] {
  const { maxTokens, counter = approximateTokens } = options

  const fits = (kept: Node[]) => counter(render(kept, dialect)) <= maxTokens

  let kept = [...nodes]
  if (fits(kept)) return kept

  for (const tier of DROP_ORDER) {
    // Latest first: earlier content is usually the more load-bearing.
    for (let i = kept.length - 1; i >= 0; i--) {
      if ((kept[i].priority ?? 'normal') !== tier) continue
      kept = [...kept.slice(0, i), ...kept.slice(i + 1)]
      if (fits(kept)) return kept
    }
  }

  throw new BudgetExceededError(counter(render(kept, dialect)), maxTokens)
}
