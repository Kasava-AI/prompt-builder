import { PromptBuilder, prompt, type TableRow, type WorkedExample } from './prompt-builder'
import { renderExampleBlock } from './dialects/markdown'

/**
 * Domain-shaped generators, kept out of the core.
 *
 * These encode one team's prompt conventions rather than anything general —
 * between them they accounted for a handful of calls across ~65 consumer files,
 * while occupying five of the core's ~50 methods. They live here so the core
 * stays a general-purpose library, and remain available as deprecated methods
 * on `PromptBuilder` so no existing call site breaks.
 *
 * Each returns a `PromptBuilder`, so compose them with `.include()`:
 *
 * ```typescript
 * import { toolGuidance } from '@kasava/prompt-builder/presets'
 *
 * prompt()
 *   .role('assistant')
 *   .include(toolGuidance([{ tool: 'searchShows', usage: 'Find a show by name' }]))
 * ```
 */

/**
 * A lookup table mapping tool names to usage descriptions.
 *
 * @example
 * ```typescript
 * toolGuidance([
 *   { tool: 'codeTool(action="search_symbols")', usage: 'Find symbols by keyword' },
 *   { tool: 'getCallGraphTool', usage: 'Trace callers/callees of a function' },
 * ])
 * ```
 */
export function toolGuidance(
  tools: { tool: string; usage: string }[],
  title = 'Available Tools',
): PromptBuilder {
  return prompt().lookupTable({
    title,
    columns: ['Tool', 'Usage'],
    rows: tools.map((t) => [t.tool, t.usage] as TableRow),
  })
}

/**
 * Fallback rules for when part of a task fails.
 *
 * @example
 * ```typescript
 * gracefulDegradation([
 *   'If a tool call fails, note the failure but continue with other tools.',
 *   'Never fail the entire analysis because one step had issues.',
 * ])
 * ```
 */
export function gracefulDegradation(rules: string[], title = 'Graceful Degradation'): PromptBuilder {
  return prompt().heading(title, 2).list(rules)
}

/** An action → next-step-offer table with a mandatory trailing rule. */
export function followThroughMatrix(opts: {
  title: string
  description?: string
  rows: Array<{ action: string; followThrough: string }>
  postRule: string
}): PromptBuilder {
  return prompt().lookupTable({
    title: opts.title,
    description: opts.description,
    columns: ['Completed action', 'Follow-through offer'],
    rows: opts.rows.map((r) => [r.action, r.followThrough] as TableRow),
    postNote: opts.postRule,
  })
}

/** A numbered requirements spec with an optional JSON output shape. */
export function analysisRequirements(
  description: string,
  requirements: string[],
  jsonStructure?: object,
): PromptBuilder {
  const b = prompt().heading('Analysis Requirements', 2).raw(description)

  if (requirements.length === 0) {
    // v0.2.2 emitted a stray blank part here (§6 row 2).
    b.node({ kind: 'empty', legacy: '' })
  } else {
    b.numberedList(requirements)
  }

  if (jsonStructure) {
    b.raw('Format your response as JSON with the following structure:')
    b.codeBlock(JSON.stringify(jsonStructure, null, 2), 'json')
  }
  return b
}

/**
 * A single worked example wrapped in `<example>` tags, with each field in a
 * semantic subtag.
 *
 * @example
 * ```typescript
 * workedExample({
 *   context: 'GitHub issue #214',
 *   mention: '@kasava is this still relevant?',
 *   protocol: 'Issue Closure Assessment',
 *   toolCalls: ["commitTool({ action: 'related' })"],
 *   response: '**NO** — still relevant, not implemented.',
 * })
 * ```
 */
export function workedExample(example: WorkedExample): PromptBuilder {
  return prompt().node({
    kind: 'example',
    context: example.context,
    mention: example.mention,
    protocol: example.protocol,
    toolCalls: example.toolCalls,
    response: example.response,
  })
}

/** Several worked examples inside an `<examples>` wrapper. */
export function workedExamples(
  examples: WorkedExample[],
  title = 'Worked Examples',
): PromptBuilder {
  const blocks = examples.map((ex) => ({
    context: ex.context,
    mention: ex.mention,
    protocol: ex.protocol,
    toolCalls: ex.toolCalls,
    response: ex.response,
  }))

  return prompt()
    .heading(title, 2)
    .node({
      kind: 'examples',
      examples: blocks,
      // v0.2.2 pushed the wrapper tags and each example as separate parts, so
      // blank lines appeared inside the XML (§6 row 5).
      legacy: ['<examples>', ...blocks.map(renderExampleBlock), '</examples>'].join('\n\n'),
    })
}
