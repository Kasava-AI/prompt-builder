<p align="center">
  <img src="./promptbuilder_dark.png#gh-light-mode-only" alt="PromptBuilder" width="400">
  <img src="./promptbuilder_light.png#gh-dark-mode-only" alt="PromptBuilder" width="400">
</p>

<p align="center">
  <strong>Fluent prompt construction for LLM agents</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@kasava/prompt-builder"><img src="https://img.shields.io/npm/v/@kasava/prompt-builder?logo=npm" alt="npm version"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> |
  <a href="#api-reference">API Reference</a> |
  <a href="#composition">Composition</a>
</p>

---

A zero-dependency TypeScript library for building structured LLM prompts with a fluent API. Composable sections, XML semantic tags, protocols, lookup tables, and consistent markdown formatting.

- [x] **Zero Dependencies** - Pure TypeScript, works everywhere
- [x] **Fluent API** - Chainable methods for readable prompt construction
- [x] **Composable Sections** - Define once, include across agents
- [x] **XML Tags** - Anthropic-recommended semantic tags built in
- [x] **High-Level Generators** - Protocols, lookup tables, confidence scales, investigation strategies
- [x] **Type-Safe** - Full TypeScript definitions with JSDoc documentation

**Created by [Kasava](https://kasava.dev)** - AI-powered development platform for product engineers.

---

## Why Prompt Builder?

### The Problem: Prompt Chaos at Scale

Every team building with LLMs hits the same wall. One agent needs a system prompt. Then five. Then thirty. Before long you have:

| Approach | Readable? | Reusable? | Maintainable? |
|----------|-----------|-----------|---------------|
| **Template literals** | No - string soup | No - copy-paste | No - find-and-replace |
| **String arrays + join** | Barely | No - still copy-paste | No - fragile ordering |
| **YAML/JSON templates** | Partial | Partial - but rigid | Partial - no composition |
| **Prompt Builder** | Yes - fluent API | Yes - composable sections | Yes - typed and structured |

### What Changes

Prompt Builder gives you a fluent, composable API that scales from one agent to a hundred:

```typescript
import { prompt, section } from '@kasava/prompt-builder'

// Define reusable sections once
const errorHandling = section('Error Handling')
  .list([
    'If a tool call fails, note the failure but continue.',
    'Never fail the entire analysis because one step had issues.',
  ])

// Compose into full prompts
const systemPrompt = prompt()
  .role('senior software architect', 'analyzing codebase impact')
  .include(errorHandling)
  .protocol({
    name: 'Impact Analysis',
    triggers: ['blast radius', 'what does this affect'],
    steps: [
      { label: 'Step 1 — Discover', actions: ['searchSymbols', 'getCallGraph'] },
      { label: 'Step 2 — Assess', description: 'Rate impact on a 1-5 scale.' },
    ],
    followThrough: 'Want me to create a plan for this change?',
  })
  .build()
```

Readable. Composable. No string concatenation in sight.

---

## Quick Start

```bash
npm install @kasava/prompt-builder
# or
pnpm add @kasava/prompt-builder
```

```typescript
import { prompt } from '@kasava/prompt-builder'

const systemPrompt = prompt()
  .role('helpful assistant')
  .heading('Guidelines')
  .list([
    'Be concise and direct',
    'Use examples when explaining concepts',
    'Ask clarifying questions when the request is ambiguous',
  ])
  .build()
```

---

## How It Works

```
┌──────────────────────────────────────────────────────────┐
│                    Your Agent Code                        │
│                                                          │
│   const shared = section('Rules')                        │
│     .list(['Be concise', 'No preamble'])                 │
│                                                          │
│   const agentA = prompt()        const agentB = prompt() │
│     .role('analyst')               .role('writer')       │
│     .include(shared)               .include(shared)      │
│     .protocol({...})               .guidelines([...])    │
│     .build()                       .build()              │
│         │                              │                 │
│         ▼                              ▼                 │
│   "You are an analyst.           "You are a writer.      │
│    ## Rules                       ## Rules               │
│    - Be concise                   - Be concise           │
│    - No preamble                  - No preamble          │
│    ## Protocol: ..."              ## Important ..."      │
└──────────────────────────────────────────────────────────┘
```

1. **Build sections** - Create reusable prompt fragments with `section()`
2. **Compose prompts** - Combine sections into full prompts with `.include()`
3. **Generate structure** - Use high-level generators for protocols, tables, scales
4. **Output string** - Call `.build()` to get the final formatted prompt

---

## API Reference

### Core Formatting

| Method | Description |
|--------|-------------|
| `.heading(text, level?)` | Markdown heading (h1-h3) |
| `.raw(content)` | Raw text |
| `.section(title, content)` | Bold title with content (skipped if null) |
| `.field(label, value)` | Bold label with value (skipped if null) |
| `.booleanField(label, value)` | Yes/No field |
| `.separator()` | Horizontal rule |
| `.codeBlock(content, lang?)` | Fenced code block |
| `.diffBlock(content, maxLen?)` | Diff block with truncation |

### Lists

| Method | Description |
|--------|-------------|
| `.list(items)` | Bullet list |
| `.list(title, items)` | Titled bullet list |
| `.numberedList(items)` | Numbered list |
| `.numberedList(title, items)` | Titled numbered list |
| `.limitedList(items, max, overflow?)` | List with overflow handling |
| `.inlineList(label, items, fallback?)` | Comma-separated inline list |
| `.keyValues(pairs)` | Key-value pairs as bullets |

### Tables

| Method | Description |
|--------|-------------|
| `.table(columns, rows)` | Markdown table (any column count) |
| `.lookupTable({ columns, rows, ... })` | Two-column lookup table |
| `.followThroughMatrix({ rows, postRule })` | Action-to-follow-up table |

### XML Tags

Anthropic-recommended semantic tags for structured prompts:

| Method | Tag |
|--------|-----|
| `.tag(name, content)` | `<name>...</name>` |
| `.context(content)` | `<context>` |
| `.instructions(content)` | `<instructions>` |
| `.example(content)` | `<example>` |
| `.examples(content)` | `<examples>` |
| `.thinking(content)` | `<thinking>` |
| `.data(content)` | `<data>` |
| `.output(content)` | `<output>` |
| `.findings(content)` | `<findings>` |
| `.formatting(content)` | `<formatting>` |
| `.openTag(name)` / `.closeTag(name)` | Manual open/close |

### High-Level Generators

| Method | Description |
|--------|-------------|
| `.role(title, task?)` | Agent role with proper article ("a"/"an") |
| `.protocol({ name, triggers?, steps, ... })` | Multi-step protocol with triggers |
| `.arrowRules({ title, types, ... })` | Arrow-prefixed behavioral rules |
| `.confidenceScale(tiers?)` | 0.0-1.0 confidence scoring guide |
| `.severityScale(title, levels)` | Priority/severity levels |
| `.investigationStrategy(phases)` | Multi-phase investigation plan |
| `.toolGuidance(tools)` | Tool usage lookup table |
| `.outputFormat(fields)` | Structured output specification |
| `.guidelines(items)` | Behavioral guidelines |
| `.gracefulDegradation(rules)` | Error handling rules |
| `.verificationChecklist(items)` | Pre-return verification checklist |
| `.workedExample(example)` | XML-wrapped worked example |
| `.workedExamples(examples)` | Multiple worked examples |
| `.analysisRequirements(desc, reqs, schema?)` | Analysis spec with optional JSON schema |
| `.filesList(title, files)` | File changes with counts and status |

### Composition

| Method | Description |
|--------|-------------|
| `.include(other)` | Include another PromptBuilder or string |
| `.build()` | Return the final prompt string |

### Factory Functions

| Function | Description |
|----------|-------------|
| `prompt()` | Create a new PromptBuilder |
| `section(title, level?)` | Create a named section (PromptBuilder with heading) |

### Static Utilities

| Method | Description |
|--------|-------------|
| `PromptBuilder.truncate(text, maxLen)` | Truncate with ellipsis |
| `PromptBuilder.formatLimitedList(items, formatter, max)` | Format and limit a list |

---

## Composition

The real power is composable, reusable sections. Define them once, include across all your agents:

```typescript
import { prompt, section } from '@kasava/prompt-builder'

// Shared across all agents
const commsStyle = section('Communication Style')
  .raw('Be direct and concise.')
  .raw('No preamble or postamble.')
  .raw('Lead with the answer, not the reasoning.')

const errorRules = section('Error Handling')
  .list([
    'If a tool call fails, note the failure but continue.',
    'Never fail the entire analysis because one step had issues.',
    'Report what you found, even if incomplete.',
  ])

// Agent-specific prompt
const codeAnalysisPrompt = prompt()
  .role('senior software architect')
  .include(commsStyle)
  .include(errorRules)
  .protocol({
    name: 'Codebase Impact',
    triggers: ['blast radius', 'what does this affect'],
    steps: [
      {
        label: 'Step 1 — Discover Entry Points',
        actions: ['searchSymbols({ query, isExported: true })', 'getCallGraph({ symbolId })'],
      },
      {
        label: 'Step 2 — Trace Dependencies',
        description: 'Follow the call graph two levels deep.',
      },
      {
        label: 'Step 3 — Assess Impact',
        description: 'Rate severity on a 1-5 scale for each affected component.',
      },
    ],
    followThrough: 'Want me to create a plan for this change?',
  })
  .confidenceScale()
  .build()
```

---

## Origin

Prompt Builder was extracted from [Kasava's](https://kasava.dev) internal AI platform, where it powers 30+ agents and 70+ workflows in production. We open-sourced it because structured prompt construction is a universal need, and we think every team building with LLMs should have access to a tool like this.

---

## Contributing

```bash
pnpm install        # Install dependencies
pnpm test           # Run the test suite
pnpm test:watch     # Watch mode
pnpm test:coverage  # Coverage (thresholds are set to 100%)
pnpm test:types     # Type-level assertions (*.test-d.ts)
pnpm type-check     # tsc over src + test
pnpm build          # Build package
```

### The consumer baseline

`test/integration/consumer-baseline.test.ts` loads real prompt modules from
sibling checkouts (`../monroe`, `../kasava`) and asserts they still build
byte-identically against a committed baseline. It skips cleanly when those
repos aren't present.

After an intentional formatting change, regenerate and **read the diff**:

```bash
pnpm test:baseline
```

---

## License

MIT - See [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built with care by <a href="https://kasava.dev">Kasava</a></sub>
</p>
