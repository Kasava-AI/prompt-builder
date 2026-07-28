import {
  MissingParamError,
  formatValue,
  paramNames,
  type Chunk,
  type Dialect,
  type Node,
  type Placeholder,
} from './ast'

type Segment = string | { chunks: Chunk[] }

/**
 * A prompt compiled once and rendered many times.
 *
 * The `.prepare()` / `.execute()` analogue. Drizzle's rationale carries over
 * exactly: "do SQL concatenation once on the Drizzle ORM side and then the
 * database driver is able to reuse precompiled binary SQL instead of parsing
 * the query all the time."
 *
 * Here the expensive part is walking the AST and serializing ~50 nodes. A 6k
 * token system prompt rebuilt on every request pays that cost every time; a
 * prepared prompt pays it once and then only fills slots.
 */
export class PreparedPrompt {
  private readonly segments: Segment[]

  constructor(
    readonly name: string,
    nodes: readonly Node[],
    private readonly dialect: Dialect,
  ) {
    this.segments = []
    for (const node of nodes) {
      // A template with live slots has to stay dynamic; everything else is
      // serialized now and reused on every render.
      if (node.kind === 'template' && node.chunks.some((c) => typeof c !== 'string')) {
        this.segments.push({ chunks: node.chunks })
        continue
      }
      const rendered = dialect.renderNode(node)
      if (rendered !== null) this.segments.push(rendered)
    }
  }

  /** The slots this prompt still expects. */
  get params(): string[] {
    const names = new Set<string>()
    for (const segment of this.segments) {
      if (typeof segment === 'string') continue
      for (const chunk of segment.chunks) {
        if (typeof chunk !== 'string') names.add((chunk as Placeholder).name)
      }
    }
    return [...names]
  }

  /** Bind values and produce the final prompt. */
  render(values: Record<string, unknown> = {}): string {
    const blocks = this.segments.map((segment) => {
      if (typeof segment === 'string') return segment
      return segment.chunks
        .map((chunk) => {
          if (typeof chunk === 'string') return chunk
          const { name } = chunk as Placeholder
          if (!(name in values)) throw new MissingParamError(name)
          return formatValue(values[name])
        })
        .join('')
    })
    return this.dialect.join(blocks)
  }
}

/** Slot names still unbound in an AST. Re-exported for convenience. */
export { paramNames }
