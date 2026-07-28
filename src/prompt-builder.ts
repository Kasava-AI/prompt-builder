/**
 * Fluent prompt builder for LLM agents
 *
 * Provides consistent prompt formatting with optional sections,
 * context blocks, proper markdown formatting, and high-level
 * section generators for common prompt patterns (protocols,
 * arrow rules, lookup tables).
 *
 * As of 0.3.0 the builder emits an AST (see ./ast.ts) rather than
 * pre-formatted strings, and a Dialect serializes it. The public API is
 * unchanged; `build()` renders with the markdown dialect by default.
 */

import { render, type Dialect, type Node } from './ast'
import { markdown, renderExampleBlock } from './dialects/markdown'

// ─── Types for section generators ──────────────────────────────────────────────

/** A labeled behavior/consequence prefixed with → */
export interface ArrowRule {
  /** Bold type label (e.g., "Misunderstanding", "Search Query") */
  name: string
  /** Optional description after the label */
  description?: string
  /** Arrow-prefixed rules (the → lines) */
  rules: string[]
}

/** A numbered step in a protocol */
export interface ProtocolStep {
  /** Step label (e.g., "Step 1 — Gather signals") */
  label: string
  /** Step description or instructions */
  description?: string
  /** Sub-items within the step (tool calls, actions, etc.) */
  actions?: string[]
}

/** A row in a lookup table */
export type TableRow = [string, string]

/** A structured worked example with mention, tools, and response */
export interface WorkedExample {
  /** The user's mention text (e.g., "@kasava is this still relevant?") */
  mention: string
  /** Brief context (e.g., "GitHub issue #214, 'Add auto-reproduction step'") */
  context: string
  /** Which protocol this maps to (e.g., "Issue Closure Assessment") */
  protocol: string
  /** Tool calls the agent should make, in order */
  toolCalls: string[]
  /** The ideal response text */
  response: string
}

/** The result of inspecting a prompt without building it. */
export interface PromptQuery {
  /** The rendered prompt text. */
  text: string
  /** Bound parameter values. Always empty until prepared prompts land in 0.3.0-beta. */
  params: unknown[]
  /** Which dialect produced `text`. */
  dialect: string
}

// ─── Legacy rendering helpers ─────────────────────────────────────────────────

/**
 * The pre-0.3.0 table rendering: cells interpolated raw, no escaping.
 *
 * Recorded as a node's `legacy` value so `markdown({ strict: true })` can
 * reproduce it. Not used for normal output.
 */
function legacyTable(columns: string[], rows: string[][]): string {
  const header = `| ${columns.join(' | ')} |`
  const divider = `|${columns.map(() => '---').join('|')}|`
  return [header, divider, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n')
}

/**
 * Fluent builder for constructing agent prompts with consistent formatting.
 * Handles optional sections, context blocks, and proper markdown formatting.
 *
 * @example
 * ```typescript
 * const promptText = prompt()
 *   .heading('Customer Signal Analysis', 2)
 *   .section('Customer', signal.customerName)
 *   .section('Tier', signal.customerTier)
 *   .list('Tags', signal.tags)
 *   .separator()
 *   .raw(signal.content)
 *   .build()
 * ```
 */
export class PromptBuilder {
  /**
   * The prompt AST.
   *
   * Mutable and mutated in place — `include()` and `conditional()` splice a
   * child's nodes in here. Consumers depend on this: real code calls
   * `b.conditional(...)` as a bare statement and discards the return value, so
   * making the builder persistent would silently drop sections.
   */
  private nodes: Node[] = []

  private push(node: Node): this {
    this.nodes.push(node)
    return this
  }

  // ============================================
  // Core formatting methods
  // ============================================

  heading(text: string, level: 1 | 2 | 3 = 2): this {
    return this.push({ kind: 'heading', level, text })
  }

  section(title: string, content: string | undefined | null): this {
    if (content) {
      this.push({ kind: 'field', label: title, value: content, style: 'section' })
    }
    return this
  }

  /**
   * Conditionally include a block of prompt content.
   * The builder callback only runs when the condition is truthy.
   * The condition value is passed into the callback with its type narrowed,
   * so you get type-safe access without extra null checks.
   *
   * @example
   * ```typescript
   * prompt()
   *   .role('frontend designer')
   *   .conditional(enrichment.designSystem, (b, ds) => b
   *     .heading('Design System', 2)
   *     .section('Primary Color', ds.themeColor)
   *     .section('Primary Font', ds.typography?.primaryFont)
   *     .list('Colors', ds.colors?.map(c => `${c.name}: ${c.value}`))
   *   )
   *   .conditional(enrichment.features?.length, () => prompt()
   *     .heading('Features', 2)
   *     .list(enrichment.features!)
   *   )
   *   .build()
   * ```
   */
  conditional<T>(
    condition: T | null | undefined | false | 0 | '',
    builder: (b: PromptBuilder, value: NonNullable<T>) => PromptBuilder,
  ): this {
    if (condition) {
      const sub = builder(new PromptBuilder(), condition as NonNullable<T>)
      this.absorb(sub)
    }
    return this
  }

  /**
   * Splice another builder's nodes into this one.
   *
   * v0.2.2 collapsed the child to a single pre-joined string. Splicing produces
   * identical output — both levels join with a blank line — while keeping the
   * AST walkable, which token budgeting and cache breakpoints need. The one
   * difference is an empty child, which used to leave a stray blank line
   * (§6 row 9).
   */
  private absorb(other: PromptBuilder): void {
    if (other.nodes.length === 0) {
      this.nodes.push({ kind: 'empty', legacy: '' })
      return
    }
    this.nodes.push(...other.nodes)
  }

  /**
   * Add a bullet list. Title is optional — omit for a bare list.
   */
  list(titleOrItems: string | string[] | undefined | null, items?: string[] | undefined | null): this {
    return this.pushList(false, titleOrItems, items)
  }

  /**
   * Add a numbered list. Title is optional — omit for a bare list.
   */
  numberedList(
    titleOrItems: string | string[] | undefined | null,
    items?: string[] | undefined | null,
  ): this {
    return this.pushList(true, titleOrItems, items)
  }

  private pushList(
    ordered: boolean,
    titleOrItems: string | string[] | undefined | null,
    items?: string[] | undefined | null,
  ): this {
    // list(['a', 'b']) — titleless
    if (Array.isArray(titleOrItems)) {
      if (titleOrItems.length > 0) {
        this.push({ kind: 'list', ordered, items: titleOrItems })
      }
      return this
    }
    // list('Title', ['a', 'b']) — with title
    if (titleOrItems && items && items.length > 0) {
      this.push({ kind: 'list', ordered, title: titleOrItems, items })
    }
    return this
  }

  /** @deprecated Use list() without a title instead */
  bullets(items: string[] | undefined | null): this {
    return this.list(items)
  }

  /** @deprecated Use numberedList() without a title instead */
  steps(items: string[] | undefined | null): this {
    return this.numberedList(items)
  }

  /**
   * Add a markdown table with any number of columns.
   * Skipped if rows is empty.
   *
   * Cell contents are escaped, so a `|` or newline in a cell can no longer
   * break the table.
   *
   * @example
   * ```typescript
   * prompt()
   *   .table(
   *     ['User asks', 'searchTool config', 'Why'],
   *     [
   *       ['"What is AuthService?"', '{ query: "AuthService", depth: 0 }', 'Fast lookup'],
   *       ['"Full blast radius"', '{ relationship: { symbol: "AuthService" } }', 'Graph traversal'],
   *     ]
   *   )
   *   .build()
   * ```
   */
  table(columns: string[], rows: string[][]): this {
    if (rows.length === 0) return this
    return this.push({ kind: 'table', columns, rows, legacy: legacyTable(columns, rows) })
  }

  codeBlock(content: string, language = ''): this {
    return this.push({ kind: 'code', language, content })
  }

  raw(content: string): this {
    return this.push({ kind: 'text', text: content })
  }

  /**
   * @deprecated No-op. build() joins parts with \n\n (paragraph breaks).
   * Kept for backward compatibility — safe to remove from call sites.
   */
  newline(): this {
    return this
  }

  /**
   * @deprecated No-op. build() joins parts with \n\n (paragraph breaks).
   */
  paragraph(): this {
    return this
  }

  /**
   * @deprecated No-op. build() joins parts with \n\n (paragraph breaks).
   */
  blankLine(): this {
    return this
  }

  separator(): this {
    return this.push({ kind: 'rule', style: 'dash', legacy: '\n---\n' })
  }

  /**
   * Add a delimiter line (for section separation)
   * @param style - 'dash' (---), 'hash' (###), or 'quote' (""")
   */
  delimiter(style: 'dash' | 'hash' | 'quote' = 'dash'): this {
    return this.push({ kind: 'rule', style })
  }

  // ============================================
  // XML Tag Methods (Anthropic recommended)
  // ============================================

  /**
   * Wrap content in XML tags (Anthropic's recommended pattern for structured prompts)
   * @param name - Tag name (e.g., 'context', 'instructions')
   * @param content - Content to wrap
   */
  tag(name: string, content: string): this {
    return this.push({ kind: 'tag', name, content })
  }

  /**
   * Open an XML tag (use with closeTag for multi-step content building)
   */
  openTag(name: string): this {
    return this.push({ kind: 'tagOpen', name })
  }

  /**
   * Close an XML tag
   */
  closeTag(name: string): this {
    return this.push({ kind: 'tagClose', name })
  }

  // ============================================
  // Semantic Tag Methods (auto-wrap in XML tags)
  // ============================================

  /** Wrap content in <instructions> tags */
  instructions(content: string): this {
    return this.tag('instructions', content)
  }

  /** Wrap content in <context> tags */
  context(content: string): this {
    return this.tag('context', content)
  }

  /** Wrap content in <example> tags */
  example(content: string): this {
    return this.tag('example', content)
  }

  /** Wrap content in <examples> tags (for multishot prompting) */
  examples(content: string): this {
    return this.tag('examples', content)
  }

  /** Wrap content in <data> tags */
  data(content: string): this {
    return this.tag('data', content)
  }

  /** Wrap content in <thinking> tags (for chain of thought) */
  thinking(content: string): this {
    return this.tag('thinking', content)
  }

  /** Wrap content in <answer> tags (for chain of thought) */
  answer(content: string): this {
    return this.tag('answer', content)
  }

  /** Wrap content in <formatting> tags */
  formatting(content: string): this {
    return this.tag('formatting', content)
  }

  /** Wrap content in <findings> tags */
  findings(content: string): this {
    return this.tag('findings', content)
  }

  /** Wrap content in <recommendations> tags */
  recommendations(content: string): this {
    return this.tag('recommendations', content)
  }

  /** Wrap content in <output> tags */
  output(content: string): this {
    return this.tag('output', content)
  }

  // ============================================
  // Field methods
  // ============================================

  /**
   * Add a bold field with a value (skipped if value is null/undefined)
   */
  field(label: string, value: string | number | boolean | null | undefined): this {
    if (value !== null && value !== undefined) {
      this.pushField(label, String(value))
    }
    return this
  }

  /**
   * Add a Yes/No boolean field
   */
  booleanField(label: string, value: boolean): this {
    return this.pushField(label, value ? 'Yes' : 'No')
  }

  /**
   * Add an inline comma-separated list (with fallback text if empty)
   */
  inlineList(label: string, items: string[] | undefined | null, fallback = 'None'): this {
    const content = items && items.length > 0 ? items.join(', ') : fallback
    return this.pushField(label, content)
  }

  /**
   * A `field`-style label/value pair.
   *
   * v0.2.2 rendered these as `**Label**: value` while `section()` used
   * `**Label:** value`. 0.3.0 unifies both on the `section()` form, so the old
   * rendering is recorded for strict mode (§6 row 4).
   */
  private pushField(label: string, value: string): this {
    return this.push({
      kind: 'field',
      label,
      value,
      style: 'field',
      legacy: `**${label}**: ${value}`,
    })
  }

  // ============================================
  // Code & file methods
  // ============================================

  /**
   * Add a diff code block with optional truncation
   */
  diffBlock(content: string, maxLength = 8000): this {
    const truncated =
      content.length > maxLength ? content.slice(0, maxLength) + '\n... (truncated)' : content
    return this.codeBlock(truncated, 'diff')
  }

  /**
   * Add a files changed section with counts and optional status
   */
  filesList(
    title: string,
    files: { filename: string; status?: string; additions?: number; deletions?: number }[]
  ): this {
    if (files && files.length > 0) {
      const count = files.length
      this.push({
        kind: 'heading',
        level: 2,
        // v0.2.2 said "1 files" (§6 row 7).
        text: `${title} (${count} ${count === 1 ? 'file' : 'files'})`,
        legacy: `## ${title} (${count} files)`,
      })
      this.push({
        kind: 'list',
        ordered: false,
        items: files.map((f) => {
          let line = f.filename
          if (f.status) line += ` (${f.status})`
          if (f.additions) line += ` +${f.additions}`
          if (f.deletions) line += ` -${f.deletions}`
          return line
        }),
      })
    }
    return this
  }

  // ============================================
  // Ported from BasePromptBuilder
  // ============================================

  /**
   * Format key-value pairs as a bulleted list
   */
  keyValues(pairs: Record<string, string | number>): this {
    const items = Object.entries(pairs).map(([key, value]) => `${key}: ${value}`)
    // v0.2.2 pushed an empty part for an empty record (§6 row 2).
    if (items.length === 0) return this.push({ kind: 'empty', legacy: '' })
    return this.push({ kind: 'list', ordered: false, items })
  }

  /**
   * Add a list with a max item count and overflow message
   */
  limitedList(
    items: string[],
    maxItems: number,
    overflowMessage?: (remaining: number) => string
  ): this {
    const shown = items.slice(0, maxItems)
    if (items.length > maxItems) {
      const remaining = items.length - maxItems
      const msg = overflowMessage ? overflowMessage(remaining) : `... and ${remaining} more`
      shown.push(msg)
    }
    // v0.2.2 pushed an empty part for an empty list (§6 row 2).
    if (shown.length === 0) return this.push({ kind: 'empty', legacy: '' })
    return this.push({ kind: 'list', ordered: false, items: shown })
  }

  /**
   * Format a list of items with a max count and custom formatter.
   * Returns formatted strings (does not push to parts — use with .raw() or other methods).
   */
  static formatLimitedList<T>(
    items: T[],
    formatter: (item: T) => string,
    maxItems: number,
    overflowMessage?: (remaining: number) => string
  ): string[] {
    const formatted = items.slice(0, maxItems).map(formatter)
    if (items.length > maxItems) {
      const remaining = items.length - maxItems
      const msg = overflowMessage ? overflowMessage(remaining) : `... and ${remaining} more`
      formatted.push(msg)
    }
    return formatted
  }

  /**
   * Add an analysis requirements section with numbered requirements and optional JSON schema
   */
  analysisRequirements(
    description: string,
    requirements: string[],
    jsonStructure?: object
  ): this {
    this.heading('Analysis Requirements', 2)
    this.raw(description)
    if (requirements.length === 0) {
      this.push({ kind: 'empty', legacy: '' })
    } else {
      this.push({ kind: 'list', ordered: true, items: requirements })
    }
    if (jsonStructure) {
      this.raw('Format your response as JSON with the following structure:')
      this.codeBlock(JSON.stringify(jsonStructure, null, 2), 'json')
    }
    return this
  }

  /**
   * Truncate text to a max length with ellipsis
   */
  static truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength - 3) + '...'
  }

  // ============================================
  // Section generators (high-level patterns)
  // ============================================

  /**
   * Add a protocol section — the standard structure for trigger-based agent behaviors.
   *
   * Generates:
   * ## Protocol: {name}
   * Trigger phrases: '...', '...'
   * **Step 1 — {label}**
   * {description}
   * (1) {action}
   * ...
   * End with: "{followThrough}"
   *
   * @example
   * ```typescript
   * prompt()
   *   .protocol({
   *     name: 'Sprint Recap Synthesis',
   *     triggers: ['what did we ship', 'sprint recap', 'what shipped'],
   *     steps: [
   *       { label: 'Step 1 — Gather', actions: ['commitTool', 'projectManagementAgent'] },
   *       { label: 'Step 2 — Categorize', description: 'Match commits to issues...' },
   *     ],
   *     followThrough: 'Want me to turn this into a sprint review doc?',
   *   })
   *   .build()
   * ```
   */
  protocol(opts: {
    name: string
    triggers?: string[]
    description?: string
    steps: ProtocolStep[]
    outputFormat?: string
    followThrough?: string
  }): this {
    this.heading(`Protocol: ${opts.name}`, 2)

    if (opts.triggers && opts.triggers.length > 0) {
      this.raw(`Trigger phrases: ${opts.triggers.map((t) => `'${t}'`).join(', ')}.`)
    }

    if (opts.description) {
      this.raw(opts.description)
    }

    for (const step of opts.steps) {
      this.push({
        kind: 'step',
        label: step.label,
        description: step.description,
        actions: step.actions,
      })
    }

    if (opts.outputFormat) {
      this.raw(`**Output format:**\n${opts.outputFormat}`)
    }

    if (opts.followThrough) {
      this.raw(`End with: '${opts.followThrough}'`)
    }

    return this
  }

  /**
   * Add a set of arrow-prefixed rules grouped by type.
   *
   * Generates:
   * ## {title}
   * {introduction}
   *
   * **{type.name}** — {type.description}
   * → {rule 1}
   * → {rule 2}
   *
   * @example
   * ```typescript
   * prompt()
   *   .arrowRules({
   *     title: 'Conversational Repair',
   *     introduction: 'Two error types require different strategies.',
   *     types: [
   *       {
   *         name: 'Misunderstanding',
   *         description: 'Agent addressed the wrong intent.',
   *         rules: ['Strategy: Options or Confirmation — propose 1–2 interpretations.'],
   *       },
   *     ],
   *   })
   *   .build()
   * ```
   */
  arrowRules(opts: {
    title: string
    introduction?: string
    types: ArrowRule[]
    postRules?: string[]
  }): this {
    this.heading(opts.title, 2)

    if (opts.introduction) {
      this.raw(opts.introduction)
    }

    for (const type of opts.types) {
      this.push({
        kind: 'arrows',
        label: type.name,
        description: type.description,
        rules: type.rules,
      })
    }

    if (opts.postRules && opts.postRules.length > 0) {
      this.push({ kind: 'list', ordered: true, items: opts.postRules })
    }

    return this
  }

  /**
   * Add a two-column lookup table with optional header, description, and post-note.
   *
   * Generates:
   * ## {title}
   * {description}
   *
   * | {columns[0]} | {columns[1]} |
   * |---|---|
   * | row[0] | row[1] |
   *
   * {postNote}
   *
   * @example
   * ```typescript
   * prompt()
   *   .lookupTable({
   *     title: 'Integration Capability Matrix',
   *     columns: ['Platform', 'Available Operations'],
   *     rows: [
   *       ['Linear', 'Full CRUD: create/update/close issues'],
   *       ['GitHub', 'Issues, PRs, commits, repo search'],
   *     ],
   *     postNote: "Post-connection message: '[Platform] connected — I can now [operations].'",
   *   })
   *   .build()
   * ```
   */
  lookupTable(opts: {
    title?: string
    description?: string
    columns: [string, string]
    rows: TableRow[]
    postNote?: string
  }): this {
    if (opts.title) {
      this.heading(opts.title, 2)
    }

    if (opts.description) {
      this.raw(opts.description)
    }

    const rows = opts.rows.map((r) => [r[0], r[1]])
    this.push({
      kind: 'table',
      columns: [opts.columns[0], opts.columns[1]],
      rows,
      // v0.2.2 emitted a header-only table when there were no rows (§6 row 8).
      legacy: legacyTable([opts.columns[0], opts.columns[1]], rows),
    })

    if (opts.postNote) {
      this.raw(opts.postNote)
    }

    return this
  }

  /**
   * Add a "follow-through matrix" — action → next-step offer table with a trailing rule.
   *
   * Generates the same table format as lookupTable but with standard column names
   * and a mandatory trailing rule about follow-through behavior.
   */
  followThroughMatrix(opts: {
    title: string
    description?: string
    rows: Array<{ action: string; followThrough: string }>
    postRule: string
  }): this {
    return this.lookupTable({
      title: opts.title,
      description: opts.description,
      columns: ['Completed action', 'Follow-through offer'],
      rows: opts.rows.map((r) => [r.action, r.followThrough]),
      postNote: opts.postRule,
    })
  }

  // ============================================
  // Composition
  // ============================================

  /**
   * Include another PromptBuilder's content into this one.
   * Enables composable, reusable prompt sections.
   *
   * @example
   * ```typescript
   * // Define reusable sections
   * const keyBehaviors = section('Key Behaviors')
   *   .list(['Be direct', 'No preamble'])
   *
   * const errorHandling = section('Error Handling')
   *   .list(['Stop on failure', 'Report errors'])
   *
   * // Compose into a larger prompt
   * const fullPrompt = prompt()
   *   .raw("You are an AI assistant.")
   *   .include(keyBehaviors)
   *   .include(errorHandling)
   *   .build()
   * ```
   */
  include(other: PromptBuilder | string): this {
    if (typeof other === 'string') {
      this.raw(other)
    } else {
      this.absorb(other)
    }
    return this
  }

  // ============================================
  // Domain-specific factories
  // ============================================

  /**
   * Set the agent's role with a consistent "You are a/an [role]" opening.
   *
   * @example
   * ```typescript
   * prompt()
   *   .role('expert software architect', 'analyzing codebase impact of planned projects')
   *   .build()
   * // → "You are an expert software architect analyzing codebase impact of planned projects."
   * ```
   */
  role(title: string, task?: string): this {
    const article = /^[aeiou]/i.test(title) ? 'an' : 'a'
    const sentence = task
      ? `You are ${article} ${title} ${task}.`
      : `You are ${article} ${title}.`
    return this.raw(sentence)
  }

  /**
   * Add a confidence scoring guide with tiered descriptions.
   * Standardizes the 0.0–1.0 confidence scale used across agents.
   *
   * @example
   * ```typescript
   * prompt()
   *   .confidenceScale()
   *   .build()
   * ```
   */
  confidenceScale(tiers?: { range: string; label: string }[]): this {
    const defaultTiers = [
      { range: '0.9–1.0', label: 'Certain — direct evidence or exact match' },
      { range: '0.7–0.89', label: 'Probable — strong contextual match' },
      { range: '0.5–0.69', label: 'Possible — related but indirect' },
      { range: 'Below 0.5', label: 'Do not include — too weak' },
    ]
    const rows = (tiers || defaultTiers).map(
      (t) => [t.range, t.label] as TableRow
    )
    return this.lookupTable({
      title: 'Confidence Scoring',
      columns: ['Range', 'Interpretation'],
      rows,
    })
  }

  /**
   * Add a severity/priority scale.
   *
   * @param title - Section title (e.g., "Issue Severity", "Risk Levels")
   * @param levels - Array of { level, description } entries
   */
  severityScale(
    title: string,
    levels: { level: string; description: string }[]
  ): this {
    this.heading(title, 3)
    if (levels.length > 0) {
      this.push({
        kind: 'list',
        ordered: false,
        items: levels.map(({ level, description }) => `**${level}**: ${description}`),
        // v0.2.2 pushed each level as its own part, so the bullets rendered with
        // blank lines between them (§6 row 6).
        legacy: levels.map(({ level, description }) => `- **${level}**: ${description}`).join('\n\n'),
      })
    }
    return this
  }

  /**
   * Add a multi-phase investigation strategy section.
   * Standardizes the numbered phase pattern used by code intelligence agents.
   *
   * @example
   * ```typescript
   * prompt()
   *   .investigationStrategy([
   *     {
   *       name: 'Discover Entry Points',
   *       description: 'Search for relevant symbols.',
   *       steps: ['Use codeTool(action="search_symbols")', 'Filter by isExported=true'],
   *     },
   *   ])
   *   .build()
   * ```
   */
  investigationStrategy(
    phases: { name: string; description?: string; steps?: string[] }[],
    title = 'Investigation Strategy'
  ): this {
    this.heading(title, 2)
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i]
      this.heading(`Phase ${i + 1}: ${phase.name}`, 3)
      if (phase.description) {
        this.raw(phase.description)
      }
      if (phase.steps && phase.steps.length > 0) {
        this.list(phase.steps)
      }
    }
    return this
  }

  /**
   * Add a graceful degradation section with fallback rules.
   * Standardizes the error-handling pattern used across agents.
   *
   * @example
   * ```typescript
   * prompt()
   *   .gracefulDegradation([
   *     'If a tool call fails, note the failure but continue with other tools.',
   *     'Never fail the entire analysis because one step had issues.',
   *   ])
   *   .build()
   * ```
   */
  gracefulDegradation(rules: string[], title = 'Graceful Degradation'): this {
    this.heading(title, 2)
    this.list(rules)
    return this
  }

  /**
   * Add a pre-return verification checklist.
   * Standardizes the "before returning, verify..." pattern.
   */
  verificationChecklist(items: string[], title = 'Pre-Return Checklist'): this {
    this.heading(title, 2)
    this.raw('Before returning your output, verify:')
    this.list(items)
    return this
  }

  /**
   * Add tool guidance for available tools.
   * Generates a lookup table mapping tool names to usage descriptions.
   *
   * @example
   * ```typescript
   * prompt()
   *   .toolGuidance([
   *     { tool: 'codeTool(action="search_symbols")', usage: 'Find symbols by keyword, filter by isExported' },
   *     { tool: 'getCallGraphTool', usage: 'Trace callers/callees of a function' },
   *   ])
   *   .build()
   * ```
   */
  toolGuidance(
    tools: { tool: string; usage: string }[],
    title = 'Available Tools'
  ): this {
    return this.lookupTable({
      title,
      columns: ['Tool', 'Usage'],
      rows: tools.map((t) => [t.tool, t.usage]),
    })
  }

  /**
   * Add an output format section describing expected structured output fields.
   *
   * @example
   * ```typescript
   * prompt()
   *   .outputFormat([
   *     { field: 'relevanceScore', type: 'number', description: '0.0-1.0 relevance score' },
   *     { field: 'reasoning', type: 'string', description: 'Explanation of assessment' },
   *   ])
   *   .build()
   * ```
   */
  outputFormat(
    fields: { field: string; type: string; description: string }[],
    title = 'Output Format'
  ): this {
    this.heading(title, 2)
    this.raw('You must return structured output with:')
    this.list(
      fields.map((f) => `**${f.field}** (${f.type}): ${f.description}`)
    )
    return this
  }

  /**
   * Add guidelines section — a simple titled bullet list for behavioral rules.
   */
  guidelines(items: string[], title = 'Important Guidelines'): this {
    this.heading(title, 2)
    this.list(items)
    return this
  }

  /**
   * Add a single worked example wrapped in XML `<example>` tags.
   * Each field is wrapped in a semantic subtag for Claude to parse.
   *
   * Generates:
   * ```xml
   * <example>
   *   <context>{context}</context>
   *   <mention>{mention}</mention>
   *   <protocol>{protocol}</protocol>
   *   <tool_calls>
   *   1. {toolCall1}
   *   2. {toolCall2}
   *   </tool_calls>
   *   <ideal_response>
   *   {response}
   *   </ideal_response>
   * </example>
   * ```
   *
   * @example
   * ```typescript
   * prompt()
   *   .workedExample({
   *     context: 'GitHub issue #214, "Add auto-reproduction step"',
   *     mention: '@kasava is this still relevant?',
   *     protocol: 'Issue Closure Assessment',
   *     toolCalls: [
   *       "commitTool({ action: 'related', repositoryId, query: '...' })",
   *       "githubIssueSearchTool({ query: '...', repositoryId })",
   *     ],
   *     response: '**NO** — still relevant, not implemented.\n\n- No commits...',
   *   })
   *   .build()
   * ```
   */
  workedExample(example: WorkedExample): this {
    return this.push({
      kind: 'example',
      context: example.context,
      mention: example.mention,
      protocol: example.protocol,
      toolCalls: example.toolCalls,
      response: example.response,
    })
  }

  /**
   * Add multiple worked examples wrapped in `<examples>` tags.
   * Convenience method that wraps individual `workedExample()` calls.
   *
   * @example
   * ```typescript
   * prompt()
   *   .workedExamples([
   *     { context: '...', mention: '...', protocol: '...', toolCalls: [...], response: '...' },
   *     { context: '...', mention: '...', protocol: '...', toolCalls: [...], response: '...' },
   *   ])
   *   .build()
   * ```
   */
  workedExamples(examples: WorkedExample[], title = 'Worked Examples'): this {
    this.heading(title, 2)
    const blocks = examples.map((ex) => ({
      context: ex.context,
      mention: ex.mention,
      protocol: ex.protocol,
      toolCalls: ex.toolCalls,
      response: ex.response,
    }))
    return this.push({
      kind: 'examples',
      examples: blocks,
      // v0.2.2 pushed the wrapper tags and each example as separate parts, so
      // blank lines appeared inside the XML (§6 row 5).
      legacy: ['<examples>', ...blocks.map(renderExampleBlock), '</examples>'].join('\n\n'),
    })
  }

  // ============================================
  // Build & inspect
  // ============================================

  /**
   * Render the prompt.
   *
   * @param dialect - Serializer to use. Defaults to markdown. Pass
   *   `markdown({ strict: true })` to reproduce pre-0.3.0 output byte for byte.
   */
  build(dialect: Dialect = markdown()): string {
    return render(this.nodes, dialect)
  }

  /**
   * The prompt's AST, for token counting, linting, diffing, and budget trimming.
   *
   * Returns a shallow copy — mutating the result does not affect the builder.
   */
  toAST(): Node[] {
    return [...this.nodes]
  }

  /**
   * Inspect the compiled prompt without committing to a string, mirroring
   * Drizzle's `.toSQL()`.
   *
   * `params` is always empty until prepared prompts land; the shape is fixed
   * now so callers don't have to change later.
   */
  toPrompt(dialect: Dialect = markdown()): PromptQuery {
    return { text: render(this.nodes, dialect), params: [], dialect: dialect.name }
  }
}

/**
 * Create a new PromptBuilder instance
 */
export function prompt(): PromptBuilder {
  return new PromptBuilder()
}

/**
 * Create a named section — a standalone PromptBuilder with a heading.
 * Use with `.include()` for composable prompt construction.
 *
 * @example
 * ```typescript
 * const commsStyle = section('Communication Style')
 *   .raw('Be direct and concise.')
 *   .raw('No preamble/postamble.')
 *
 * const errorRules = section('Error Handling')
 *   .list(['Stop on failure', 'Report errors', 'Ask how to proceed'])
 *
 * const fullPrompt = prompt()
 *   .raw("You are an AI assistant.")
 *   .include(commsStyle)
 *   .include(errorRules)
 *   .build()
 * ```
 */
export function section(title: string, level: 1 | 2 | 3 = 2): PromptBuilder {
  return new PromptBuilder().heading(title, level)
}
