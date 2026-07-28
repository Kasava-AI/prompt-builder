import type { Dialect, Node } from '../ast'
import { markdown } from './markdown'

export interface XmlOptions {
  /**
   * Wrap each heading's following content in a tag derived from the heading
   * text, instead of emitting markdown headings.
   *
   * Off by default: heading-to-tag conversion is a structural rewrite and only
   * makes sense for prompts written with it in mind.
   */
  sectionTags?: boolean
}

/** `Some Heading Text` → `some_heading_text` */
function tagName(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'section'
  )
}

/**
 * XML-leaning markdown, following Anthropic's structured-prompt guidance.
 *
 * Lists, tables, and code stay markdown — those are already unambiguous. What
 * changes is that field labels become elements, which reads more reliably than
 * bold text when a prompt carries a lot of key/value context.
 */
export function xml(options: XmlOptions = {}): Dialect {
  const base = markdown()

  return {
    name: options.sectionTags ? 'xml(sectionTags)' : 'xml',
    renderNode(node: Node) {
      switch (node.kind) {
        case 'field': {
          const name = tagName(node.label)
          return `<${name}>${node.value}</${name}>`
        }
        case 'heading':
          return options.sectionTags ? `<${tagName(node.text)}>` : base.renderNode(node)
        default:
          return base.renderNode(node)
      }
    },
    join(blocks) {
      return blocks.join('\n\n')
    },
  }
}
