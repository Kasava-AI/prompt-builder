import type { Dialect, ExampleNode, Node } from '../ast'

export interface MarkdownOptions {
  /**
   * Reproduce pre-0.3.0 output byte for byte, including the defects listed in
   * PLAN-0.3.0.md §6 (stray blank lines around separators, unescaped table
   * cells, the `section()`/`field()` split, and so on).
   *
   * Off by default: 0.3.0 renders the corrected form. Turn it on only to pin
   * exact legacy bytes — for a prompt cache you are not ready to invalidate, or
   * to prove a refactor changed nothing unintentionally.
   */
  strict?: boolean
}

/**
 * Escape a table cell so its content cannot break the row.
 *
 * v0.2.2 interpolated cells raw, so a single `|` silently added a column and a
 * newline split the row in two. Drizzle's equivalent guarantee — "tables and
 * columns are automatically escaped" — is the whole reason to have a render
 * layer at all (§6 row 3).
 */
function escapeCell(value: string): string {
  return String(value)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
}

function renderTable(columns: string[], rows: string[][]): string {
  const header = `| ${columns.map(escapeCell).join(' | ')} |`
  const divider = `|${columns.map(() => '---').join('|')}|`
  const body = rows.map((r) => `| ${r.map(escapeCell).join(' | ')} |`)
  return [header, divider, ...body].join('\n')
}

function renderListBody(items: string[], ordered: boolean): string {
  return items.map((item, i) => (ordered ? `${i + 1}. ${item}` : `- ${item}`)).join('\n')
}

/**
 * Render one worked example.
 *
 * Exported because `workedExamples()` needs it to compute the `legacy` string
 * for strict mode — the wrapper spacing changed in 0.3.0 (§6 row 5) but the
 * example blocks themselves did not.
 */
export function renderExampleBlock(ex: Omit<ExampleNode, 'kind' | 'legacy'>): string {
  return [
    '<example>',
    `<context>${ex.context}</context>`,
    `<mention>${ex.mention}</mention>`,
    `<protocol>${ex.protocol}</protocol>`,
    '<tool_calls>',
    ex.toolCalls.map((tc, i) => `${i + 1}. ${tc}`).join('\n'),
    '</tool_calls>',
    '<ideal_response>',
    ex.response,
    '</ideal_response>',
    '</example>',
  ].join('\n')
}

const RULES = {
  dash: '---',
  hash: '###',
  quote: '"""',
} as const

/** Render a single node in corrected (non-strict) markdown. */
function renderCorrected(node: Node): string | null {
  switch (node.kind) {
    case 'text':
      return node.text

    case 'heading':
      return `${'#'.repeat(node.level)} ${node.text}`

    // Unified on the `section()` form — v0.2.2 rendered `field()` as
    // `**Label**: value` and `section()` as `**Label:** value` (§6 row 4).
    case 'field':
      return `**${node.label}:** ${node.value}`

    case 'list': {
      if (node.items.length === 0) return null
      const body = renderListBody(node.items, node.ordered)
      return node.title ? `**${node.title}:**\n${body}` : body
    }

    case 'table':
      // Empty tables are omitted rather than rendered header-only (§6 row 8).
      return node.rows.length === 0 ? null : renderTable(node.columns, node.rows)

    case 'code':
      return `\`\`\`${node.language}\n${node.content}\n\`\`\``

    case 'tag':
      return `<${node.name}>\n${node.content}\n</${node.name}>`

    case 'tagOpen':
      return `<${node.name}>`

    case 'tagClose':
      return `</${node.name}>`

    case 'rule':
      return RULES[node.style]

    case 'step': {
      const lines = [`**${node.label}**`]
      if (node.description) lines.push(node.description)
      if (node.actions?.length) {
        lines.push(node.actions.map((a, i) => `(${i + 1}) ${a}`).join('\n'))
      }
      return lines.join('\n')
    }

    case 'arrows': {
      const label = node.description ? `**${node.label}** — ${node.description}` : `**${node.label}**`
      return `${label}\n${node.rules.map((r) => `→ ${r}`).join('\n')}`
    }

    case 'example':
      return renderExampleBlock(node)

    case 'examples':
      // Tight, with no blank lines between the wrapper and its children (§6 row 5).
      return ['<examples>', ...node.examples.map(renderExampleBlock), '</examples>'].join('\n')

    case 'empty':
      return null
  }
}

/**
 * The default dialect: markdown, as the library has always emitted, minus the
 * formatting defects catalogued in PLAN-0.3.0.md §6.
 */
export function markdown(options: MarkdownOptions = {}): Dialect {
  const strict = options.strict === true

  return {
    name: strict ? 'markdown(strict)' : 'markdown',
    renderNode(node) {
      // In strict mode a node that recorded its pre-0.3.0 rendering wins.
      // Every intentional formatting change in 0.3.0 sets `legacy`, so this one
      // branch reproduces all of them.
      if (strict && node.legacy !== undefined) return node.legacy
      return renderCorrected(node)
    },
    join(blocks) {
      return blocks.join('\n\n')
    },
  }
}
