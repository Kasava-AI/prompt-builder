import { resolve, type Dialect, type Node } from '../ast'
import { markdown } from './markdown'

/** A chat message ready to hand to a provider SDK. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  /**
   * Present on the last block before a `cacheBoundary()`. Shaped for
   * Anthropic's prompt caching; other providers ignore or remap it.
   */
  cache_control?: { type: 'ephemeral' }
}

export interface MessagesOptions {
  /** Role for the emitted messages. Defaults to `system`. */
  role?: ChatMessage['role']
  /** Serializer for the text of each message. Defaults to markdown. */
  dialect?: Dialect
  /**
   * Emit `cache_control` on the block preceding each `cacheBoundary()`.
   * On by default — a boundary with no marker has no purpose.
   */
  cacheControl?: boolean
}

/**
 * Split a prompt into chat messages at its cache boundaries.
 *
 * This is what `cacheBoundary()` is for. Agent codebases already segregate
 * cache-stable instructions from per-request context — usually with a comment
 * warning not to interpolate user data into the static half — and then hand-roll
 * the split into two system messages. Modeling the boundary in the AST makes
 * that split mechanical, and lets the marker be emitted rather than remembered.
 *
 * Provider caches match on an exact prefix, so the stable half must be
 * byte-identical between requests to hit.
 *
 * @example
 * ```typescript
 * const messages = toMessages(
 *   prompt()
 *     .include(STATIC_INSTRUCTIONS)
 *     .cacheBoundary()
 *     .include(perRequestContext),
 * )
 * // [
 * //   { role: 'system', content: '...', cache_control: { type: 'ephemeral' } },
 * //   { role: 'system', content: '...' },
 * // ]
 * ```
 */
export function toMessages(
  source: { toAST(): Node[] } | readonly Node[],
  options: MessagesOptions = {},
): ChatMessage[] {
  const { role = 'system', dialect = markdown(), cacheControl = true } = options
  const nodes = Array.isArray(source) ? (source as Node[]) : (source as { toAST(): Node[] }).toAST()

  const groups: Node[][] = [[]]
  for (const node of resolve(nodes)) {
    if (node.kind === 'cacheBoundary') {
      groups.push([])
      continue
    }
    groups[groups.length - 1].push(node)
  }

  const messages: ChatMessage[] = []
  groups.forEach((group, index) => {
    const blocks: string[] = []
    for (const node of group) {
      const rendered = dialect.renderNode(node)
      if (rendered !== null) blocks.push(rendered)
    }
    const content = dialect.join(blocks)
    if (content.length === 0) return

    const isBeforeBoundary = index < groups.length - 1
    messages.push(
      cacheControl && isBeforeBoundary
        ? { role, content, cache_control: { type: 'ephemeral' } }
        : { role, content },
    )
  })

  return messages
}
