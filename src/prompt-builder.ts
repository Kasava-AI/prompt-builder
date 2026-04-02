/**
 * Fluent prompt builder for Mastra agents
 *
 * Provides consistent prompt formatting with optional sections,
 * context blocks, proper markdown formatting, and high-level
 * section generators for common prompt patterns (protocols,
 * arrow rules, lookup tables).
 */

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
  private parts: string[] = []

  // ============================================
  // Core formatting methods
  // ============================================

  heading(text: string, level: 1 | 2 | 3 = 2): this {
    this.parts.push(`${'#'.repeat(level)} ${text}`)
    return this
  }

  section(title: string, content: string | undefined | null): this {
    if (content) {
      this.parts.push(`**${title}:** ${content}`)
    }
    return this
  }

  sectionIf(condition: boolean, title: string, content: string): this {
    if (condition) {
      this.section(title, content)
    }
    return this
  }

  /**
   * Add a bullet list. Title is optional — omit for a bare list.
   */
  list(titleOrItems: string | string[] | undefined | null, items?: string[] | undefined | null): this {
    // list(['a', 'b']) — titleless
    if (Array.isArray(titleOrItems)) {
      if (titleOrItems.length > 0) {
        this.parts.push(titleOrItems.map((item) => `- ${item}`).join('\n'))
      }
      return this
    }
    // list('Title', ['a', 'b']) — with title
    if (titleOrItems && items && items.length > 0) {
      this.parts.push(`**${titleOrItems}:**\n${items.map((item) => `- ${item}`).join('\n')}`)
    }
    return this
  }

  /**
   * Add a numbered list. Title is optional — omit for a bare list.
   */
  numberedList(titleOrItems: string | string[] | undefined | null, items?: string[] | undefined | null): this {
    // numberedList(['a', 'b']) — titleless
    if (Array.isArray(titleOrItems)) {
      if (titleOrItems.length > 0) {
        this.parts.push(titleOrItems.map((item, i) => `${i + 1}. ${item}`).join('\n'))
      }
      return this
    }
    // numberedList('Title', ['a', 'b']) — with title
    if (titleOrItems && items && items.length > 0) {
      this.parts.push(`**${titleOrItems}:**\n${items.map((item, i) => `${i + 1}. ${item}`).join('\n')}`)
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
    const header = `| ${columns.join(' | ')} |`
    const divider = `|${columns.map(() => '---').join('|')}|`
    const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n')
    this.parts.push([header, divider, body].join('\n'))
    return this
  }

  codeBlock(content: string, language = ''): this {
    this.parts.push(`\`\`\`${language}\n${content}\n\`\`\``)
    return this
  }

  raw(content: string): this {
    this.parts.push(content)
    return this
  }

  /**
   * @deprecated No-op. build() now joins parts with \n\n (paragraph breaks).
   * Kept for backward compatibility — safe to remove from call sites.
   */
  newline(): this {
    return this
  }

  /**
   * @deprecated No-op. build() now joins parts with \n\n (paragraph breaks).
   */
  paragraph(): this {
    return this
  }

  /**
   * @deprecated No-op. build() now joins parts with \n\n (paragraph breaks).
   */
  blankLine(): this {
    return this
  }

  separator(): this {
    this.parts.push('\n---\n')
    return this
  }

  /**
   * Add a delimiter line (for section separation)
   * @param style - 'dash' (---), 'hash' (###), or 'quote' (""")
   */
  delimiter(style: 'dash' | 'hash' | 'quote' = 'dash'): this {
    const delimiters = {
      dash: '---',
      hash: '###',
      quote: '"""',
    }
    this.parts.push(delimiters[style])
    return this
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
    this.parts.push(`<${name}>\n${content}\n</${name}>`)
    return this
  }

  /**
   * Open an XML tag (use with closeTag for multi-step content building)
   */
  openTag(name: string): this {
    this.parts.push(`<${name}>`)
    return this
  }

  /**
   * Close an XML tag
   */
  closeTag(name: string): this {
    this.parts.push(`</${name}>`)
    return this
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
      this.parts.push(`**${label}**: ${value}`)
    }
    return this
  }

  /**
   * Add a Yes/No boolean field
   */
  booleanField(label: string, value: boolean): this {
    this.parts.push(`**${label}**: ${value ? 'Yes' : 'No'}`)
    return this
  }

  /**
   * Add an inline comma-separated list (with fallback text if empty)
   */
  inlineList(label: string, items: string[] | undefined | null, fallback = 'None'): this {
    const content = items && items.length > 0 ? items.join(', ') : fallback
    this.parts.push(`**${label}**: ${content}`)
    return this
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
      this.parts.push(`## ${title} (${files.length} files)`)
      const list = files
        .map((f) => {
          let line = `- ${f.filename}`
          if (f.status) line += ` (${f.status})`
          if (f.additions) line += ` +${f.additions}`
          if (f.deletions) line += ` -${f.deletions}`
          return line
        })
        .join('\n')
      this.parts.push(list)
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
    const items = Object.entries(pairs).map(([key, value]) => `- ${key}: ${value}`)
    this.parts.push(items.join('\n'))
    return this
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
    this.parts.push(shown.map((item) => `- ${item}`).join('\n'))
    return this
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
    this.parts.push(requirements.map((r, i) => `${i + 1}. ${r}`).join('\n'))
    if (jsonStructure) {
      this.newline()
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
      const stepParts = [`**${step.label}**`]
      if (step.description) {
        stepParts.push(step.description)
      }
      if (step.actions && step.actions.length > 0) {
        stepParts.push(step.actions.map((a, i) => `(${i + 1}) ${a}`).join('\n'))
      }
      this.parts.push(stepParts.join('\n'))
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
      const label = type.description
        ? `**${type.name}** — ${type.description}`
        : `**${type.name}**`
      this.parts.push(`${label}\n${type.rules.map((r) => `→ ${r}`).join('\n')}`)
    }

    if (opts.postRules && opts.postRules.length > 0) {
      this.parts.push(
        opts.postRules.map((r, i) => `${i + 1}. ${r}`).join('\n')
      )
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

    const header = `| ${opts.columns[0]} | ${opts.columns[1]} |`
    const divider = '|---|---|'
    const tableRows = opts.rows.map((r) => `| ${r[0]} | ${r[1]} |`)
    this.parts.push([header, divider, ...tableRows].join('\n'))

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
      this.parts.push(other)
    } else {
      this.parts.push(other.build())
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
    this.parts.push(sentence)
    return this
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
    for (const { level, description } of levels) {
      this.raw(`- **${level}**: ${description}`)
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
    const toolCallsFormatted = example.toolCalls
      .map((tc, i) => `${i + 1}. ${tc}`)
      .join('\n')

    const xml = [
      '<example>',
      `<context>${example.context}</context>`,
      `<mention>${example.mention}</mention>`,
      `<protocol>${example.protocol}</protocol>`,
      '<tool_calls>',
      toolCallsFormatted,
      '</tool_calls>',
      '<ideal_response>',
      example.response,
      '</ideal_response>',
      '</example>',
    ].join('\n')

    this.parts.push(xml)
    return this
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
    this.parts.push('<examples>')
    for (const ex of examples) {
      this.workedExample(ex)
    }
    this.parts.push('</examples>')
    return this
  }

  // ============================================
  // Build
  // ============================================

  build(): string {
    return this.parts.join('\n\n')
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
