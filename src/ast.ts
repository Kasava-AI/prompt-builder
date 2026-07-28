/**
 * The prompt AST.
 *
 * Before 0.3.0 the builder was a string accumulator: every method eagerly
 * formatted markdown and pushed it onto `parts: string[]`. Formatting was
 * committed at call time, so nothing downstream could count tokens per section,
 * drop a section to fit a budget, diff two prompts structurally, or re-render
 * for a different provider.
 *
 * Now methods emit `Node`s and a `Dialect` decides how they serialize. The
 * builder API is unchanged; only what it pushes is different.
 *
 * Nodes are a FLAT list of blocks. `build()` renders each to a string and joins
 * with a blank line, which is what `parts.join('\n\n')` did. Composition
 * (`include`, `conditional`) splices a child's nodes into the parent rather
 * than collapsing them to one opaque string, so the tree stays walkable.
 */

/** Fields shared by every node. */
interface NodeBase {
  /**
   * The exact v0.2.2 rendering of this node, as a single part.
   *
   * Set ONLY where 0.3.0 intentionally changed formatting — the numbered rows
   * in PLAN-0.3.0.md §6. `markdown({ strict: true })` emits this verbatim
   * instead of rendering the node, which reproduces pre-0.3.0 output byte for
   * byte.
   *
   * Its presence is also the honest marker of what changed: grep for `legacy:`
   * to find every intentional formatting change in the library.
   */
  legacy?: string
}

/** Freeform prose or passthrough content — what `.raw()` produces. */
export interface TextNode extends NodeBase {
  kind: 'text'
  text: string
}

export interface HeadingNode extends NodeBase {
  kind: 'heading'
  level: 1 | 2 | 3
  text: string
}

/**
 * A bold label with a value.
 *
 * `style` records which method produced it, because v0.2.2 rendered the two
 * differently — `section()` as `**Label:** value`, `field()` as
 * `**Label**: value`. 0.3.0 unifies them on the `section` form (§6 row 4).
 */
export interface FieldNode extends NodeBase {
  kind: 'field'
  label: string
  value: string
  style: 'section' | 'field'
}

export interface ListNode extends NodeBase {
  kind: 'list'
  ordered: boolean
  title?: string
  items: string[]
}

export interface TableNode extends NodeBase {
  kind: 'table'
  columns: string[]
  rows: string[][]
}

export interface CodeNode extends NodeBase {
  kind: 'code'
  language: string
  content: string
}

/** A complete XML element — `.tag()` and every semantic helper built on it. */
export interface TagNode extends NodeBase {
  kind: 'tag'
  name: string
  content: string
}

/** A dangling open tag from `.openTag()`. */
export interface TagOpenNode extends NodeBase {
  kind: 'tagOpen'
  name: string
}

/** A dangling close tag from `.closeTag()`. */
export interface TagCloseNode extends NodeBase {
  kind: 'tagClose'
  name: string
}

export interface RuleNode extends NodeBase {
  kind: 'rule'
  style: 'dash' | 'hash' | 'quote'
}

/** One numbered step inside a `.protocol()`. */
export interface StepNode extends NodeBase {
  kind: 'step'
  label: string
  description?: string
  actions?: string[]
}

/** One arrow-prefixed rule group inside `.arrowRules()`. */
export interface ArrowsNode extends NodeBase {
  kind: 'arrows'
  label: string
  description?: string
  rules: string[]
}

export interface ExampleNode extends NodeBase {
  kind: 'example'
  context: string
  mention: string
  protocol: string
  toolCalls: string[]
  response: string
}

/** A `<examples>` wrapper around several `ExampleNode`s. */
export interface ExamplesNode extends NodeBase {
  kind: 'examples'
  examples: Omit<ExampleNode, 'kind' | 'legacy'>[]
}

/**
 * A node that renders to nothing.
 *
 * Exists so that the three places where v0.2.2 emitted a stray empty part —
 * `keyValues({})`, `limitedList([], n)`, and `include()` of an empty builder —
 * can still carry a `legacy` value for strict mode while contributing nothing
 * to normal output (§6 rows 2 and 9).
 */
export interface EmptyNode extends NodeBase {
  kind: 'empty'
}

export type Node =
  | TextNode
  | HeadingNode
  | FieldNode
  | ListNode
  | TableNode
  | CodeNode
  | TagNode
  | TagOpenNode
  | TagCloseNode
  | RuleNode
  | StepNode
  | ArrowsNode
  | ExampleNode
  | ExamplesNode
  | EmptyNode

export type NodeKind = Node['kind']

/**
 * Serializes an AST. One AST, many output formats.
 *
 * `renderNode` returns `null` to omit a node entirely — that is how empty lists
 * and empty tables disappear rather than leaving blank lines behind.
 */
export interface Dialect {
  /** Identifier, for debugging and for `toPrompt()` output. */
  name: string
  /** Render one node, or `null` to omit it. */
  renderNode(node: Node): string | null
  /** Join the rendered blocks into the final document. */
  join(blocks: string[]): string
}

/** Render an AST with a dialect. */
export function render(nodes: readonly Node[], dialect: Dialect): string {
  const blocks: string[] = []
  for (const node of nodes) {
    const rendered = dialect.renderNode(node)
    if (rendered !== null) blocks.push(rendered)
  }
  return dialect.join(blocks)
}

/**
 * Visit every node in order.
 *
 * The AST is flat today, so this is a loop — but callers should use it rather
 * than iterating directly, so that nested node kinds (Phase 2 fragments and
 * slots) don't silently escape traversal.
 */
export function walk(nodes: readonly Node[], visit: (node: Node, index: number) => void): void {
  nodes.forEach((node, i) => visit(node, i))
}
