export { PromptBuilder, prompt, section } from './prompt-builder'
export type {
  ArrowRule,
  ProtocolStep,
  TableRow,
  WorkedExample,
  PromptQuery,
} from './prompt-builder'

export { render, walk } from './ast'
export type {
  Dialect,
  Node,
  NodeKind,
  TextNode,
  HeadingNode,
  FieldNode,
  ListNode,
  TableNode,
  CodeNode,
  TagNode,
  TagOpenNode,
  TagCloseNode,
  RuleNode,
  StepNode,
  ArrowsNode,
  ExampleNode,
  ExamplesNode,
  EmptyNode,
} from './ast'

export { markdown } from './dialects/markdown'
export type { MarkdownOptions } from './dialects/markdown'
export { xml } from './dialects/xml'
export type { XmlOptions } from './dialects/xml'
export { toMessages } from './dialects/messages'
export type { ChatMessage, MessagesOptions } from './dialects/messages'

// ─── 0.3.0: the ORM layer ────────────────────────────────────────────────────

export { p, placeholder, Fragment } from './template'
export type { Interpolatable } from './template'

export { when, unless, all, any, each } from './combinators'
export type { Includable } from './combinators'

export { definePrompt, PromptSchema, PromptTemplate, Var, text, num, bool, list, json } from './schema'
export type { InferVars, ResolvedVars, VarShape, VarConfig } from './schema'
export { MissingVarError } from './schema'

export { PreparedPrompt } from './prepared'
export { MissingParamError, resolve, formatValue, paramNames } from './ast'
export type { Chunk, Placeholder, TemplateNode, CacheBoundaryNode } from './ast'
export type { Content, DynamicPromptBuilder } from './prompt-builder'
