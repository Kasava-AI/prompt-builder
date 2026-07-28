<p align="center">
  <img src="./promptbuilder_dark.png#gh-light-mode-only" alt="PromptBuilder" width="400">
  <img src="./promptbuilder_light.png#gh-dark-mode-only" alt="PromptBuilder" width="400">
</p>

<p align="center">
  <strong>A prompt ORM for TypeScript</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@kasava/prompt-builder"><img src="https://img.shields.io/npm/v/@kasava/prompt-builder?logo=npm" alt="npm version"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> |
  <a href="#the-mapping">The Mapping</a> |
  <a href="#api-reference">API Reference</a> |
  <a href="#migrating-from-02x">Migrating</a>
</p>

---

Typed variables, a composable template tag, an inspectable AST, and pluggable
output dialects. If you know Drizzle, you know the shape of this.

```typescript
import { definePrompt, text, list, bool, prompt, p, when } from '@kasava/prompt-builder'

const userContext = definePrompt('user_context', {
  userName:    text().notNull(),
  activeShows: list().default([]),
  isMobile:    bool().default(false),
})

const template = userContext.body((v) => prompt()
  .tag('user_context', p`Active shows (${v.activeShows.length}): ${v.activeShows}`)
  .include(when(v.isMobile, 'Keep replies short — this is a phone.')))

template.render({ userName: 'Ada', activeShows: ['Severance', 'Andor'] })
```

```text
<user_context>
Active shows (2): Severance, Andor
</user_context>
```

- **Typed variables** — declare what a prompt needs; TypeScript infers the payload
- **Composable** — fragments, combinators, and reusable sections
- **Inspectable** — prompts compile to an AST you can walk, diff, and trim
- **Multi-target** — one prompt, rendered as markdown, XML, or chat messages
- **Zero dependencies** in the core; `zod` is an optional peer

**Created by [Kasava](https://kasava.dev)** — AI-powered development platform for product engineers.

---

## Quick Start

```bash
npm install @kasava/prompt-builder
```

The fluent builder is the foundation, and it works exactly as it always has:

```typescript
import { prompt } from '@kasava/prompt-builder'

const systemPrompt = prompt()
  .role('helpful assistant')
  .heading('Guidelines')
  .list([
    'Be concise and direct',
    'Ask clarifying questions when the request is ambiguous',
  ])
  .build()
```

Reach for the schema layer when a prompt needs runtime data.

---

## The Mapping

An ORM maps between two representations. For Drizzle that's *TypeScript objects
↔ relational rows*. Here it's **typed application context ↔ model-facing prompt
text**.

| Drizzle | prompt-builder |
|---|---|
| `pgTable('users', {...})` | `definePrompt('name', {...})` |
| `text().notNull().default()` | `text() / num() / bool() / list() / json()` |
| `$inferSelect` / `$inferInsert` | `$inferVars` |
| `` sql`select * from ${t}` `` | `` p`Active shows: ${shows}` `` |
| `sql.raw()` / `.join()` / `.empty()` | `p.raw()` / `p.join()` / `p.empty()` |
| `sql.placeholder('id')` | `placeholder('id')` |
| `.prepare()` → `.execute({...})` | `.prepare()` → `.render({...})` |
| `eq()`, `and()`, `or()` | `when()`, `unless()`, `all()`, `any()`, `each()` |
| `.$dynamic()` | `.$dynamic()` |
| `PgDialect` / `MySqlDialect` | `markdown()` / `xml()` / `toMessages()` |
| `.toSQL()` | `.toPrompt()` / `.toAST()` |
| `drizzle-zod` | `@kasava/prompt-builder/zod` |

### What deliberately isn't mapped

Drizzle's power comes from SQL being a real target language with a real engine.
Prompts have no engine, no execution, no result set. So there's no `select`,
`where`, `join`, or transaction here — chaining those onto a prompt would be
cargo cult. What replaces them is `$budget()`, which has no SQL analogue at all.

### `p` does not escape, and cannot

Drizzle's `sql` tag escapes because SQL has a grammar to break out of. Natural
language does not, so **no amount of escaping makes untrusted text safe to
interpolate into a prompt.** `p` gives you composition and consistent value
serialization — arrays comma-join, objects become JSON, nullish becomes empty.
It is not an injection defense. Treat interpolated data as data, and follow your
provider's guidance on delimiting and instruction hierarchy.

---

## Core Concepts

### The `p` tag

```typescript
p`Watched ${count} of ${shows}`          // "Watched 12 of Severance, Andor"
p`${p.raw(existingMarkdown)}`            // verbatim, unformatted
p.join([p`a`, p`b`], ', ')               // "a, b"
```

| Interpolated | Emitted |
|---|---|
| string / number / boolean | stringified |
| array | comma-joined |
| object | JSON |
| null / undefined | empty string |
| `Fragment` | inlined |
| `p.raw(x)` | verbatim |
| `placeholder('x')` | a slot, filled at render |

Leading indentation is stripped, so multi-line fragments can be written inline
without dragging whitespace into the prompt.

### Combinators

```typescript
import { when, unless, all, any, each } from '@kasava/prompt-builder'

all(
  BASE_RULES,
  when(flags.toolSearch, TOOL_SEARCH_BLOCK),
  unless(flags.toolSearch, TOOL_CATALOG),
  each(protocols, (proto) => p`### ${proto.name}\n${proto.body}`),
)
```

These are values, not chain steps — build them anywhere, store them in a config
object, pass them around.

### Prepared prompts

Compile once, render many times. Same rationale as Drizzle: pay the
serialization cost once instead of on every request.

```typescript
const greeting = prompt().raw(p`Hello ${placeholder('name')}`).prepare('greeting')

greeting.render({ name: 'Ada' })
greeting.render({ name: 'Grace' })
```

### Dialects

One AST, several serializations.

```typescript
b.build()                       // markdown (default)
b.build(xml())                  // fields as XML elements
b.build(markdown({strict:true}))// pre-0.3.0 bytes, defects included
toMessages(b)                   // [{ role, content, cache_control? }]
b.toAST()                       // Node[] — walk it, diff it, count it
```

Write your own by implementing `renderNode` and `join`.

### Cache boundaries

Agent prompts usually segregate cache-stable instructions from per-request
context, then hand-roll the split into two system messages. Model the boundary
instead:

```typescript
const messages = toMessages(
  prompt().include(STATIC_INSTRUCTIONS).cacheBoundary().include(perRequestContext),
)
// [{ role, content, cache_control: { type: 'ephemeral' } }, { role, content }]
```

Provider caches match on an exact prefix, so the stable half must be
byte-identical between requests to hit.

### Token budgets

No Drizzle analogue — this is the AI-native `LIMIT`.

```typescript
prompt()
  .priority('required').include(CORE_RULES)
  .priority('low').include(WORKED_EXAMPLES)
  .$budget({ maxTokens: 8000, counter: myTokenizer })
```

Drops whole nodes rather than truncating text, so the result is always
well-formed. `required` never drops; if it alone exceeds the budget, this throws
rather than quietly returning something oversized. Bring your own tokenizer —
the default is a rough four-characters-per-token estimate and the library takes
no tokenizer dependency.

### Validation

```typescript
import { createVarsSchema } from '@kasava/prompt-builder/zod'

const varsSchema = createVarsSchema(userContext, { userName: (s) => s.max(80) })
template.render(varsSchema.parse(await request.json()))
```

---

## API Reference

### Schema

| Export | Description |
|---|---|
| `definePrompt(name, vars)` | Declare a prompt and its variables |
| `text()` `num()` `bool()` `list()` `json<T>()` | Variable builders |
| `.notNull()` `.default(v)` `.$type<T>()` | Modifiers |
| `schema.$inferVars` | The render-payload type |
| `schema.body(fn)` | Attach a body → `PromptTemplate` |
| `template.render(vars, dialect?)` | Render |
| `template.toAST(vars)` / `.prepare(vars)` | Inspect / compile |

### Building

| Method | Description |
|---|---|
| `.heading(text, level?)` `.raw(content)` `.section(title, content)` | Core |
| `.field(label, value)` `.booleanField()` `.inlineList()` | Fields |
| `.list()` `.numberedList()` `.limitedList()` `.keyValues()` | Lists |
| `.table(columns, rows)` `.lookupTable({...})` | Tables (cells escaped) |
| `.codeBlock()` `.diffBlock()` `.filesList()` | Code & files |
| `.tag(name, content)` + 11 semantic helpers | XML |
| `.protocol()` `.arrowRules()` `.role()` `.guidelines()` | Generators |
| `.confidenceScale()` `.severityScale()` `.investigationStrategy()` | Scales |
| `.outputFormat()` `.verificationChecklist()` | Output specs |
| `.include(other)` `.conditional(cond, fn)` | Composition |
| `.node(astNode)` | Escape hatch |

### Rendering

| Method | Description |
|---|---|
| `.build(dialect?)` | Render to a string |
| `.toAST()` / `.toPrompt(dialect?)` | Inspect |
| `.params()` | Unbound placeholder names |
| `.prepare(name?, dialect?)` | Compile for repeated rendering |
| `.priority(level)` / `.$budget(opts)` | Token budgeting |
| `.cacheBoundary()` / `.$dynamic()` | Cache splits, dynamic building |

### Subpaths

| Import | Contents |
|---|---|
| `@kasava/prompt-builder` | Everything above. Zero dependencies. |
| `@kasava/prompt-builder/presets` | `toolGuidance`, `gracefulDegradation`, `followThroughMatrix`, `analysisRequirements`, `workedExample(s)` |
| `@kasava/prompt-builder/zod` | `createVarsSchema` (needs `zod`) |

---

## Migrating from 0.2.x

**Nothing to do.** Every 0.2.x call site compiles and runs unchanged. The
builder API is unchanged; only what it emits internally is different.

Output is *semantically* equivalent, not byte-identical — 0.3.0 fixes nine
formatting defects, listed in [PLAN-0.3.0.md §6](./PLAN-0.3.0.md). The notable
one is that **table cells are now escaped**; a `|` in a cell used to silently
corrupt the table. If you need the old bytes exactly — for a prompt cache you
aren't ready to invalidate — pass `markdown({ strict: true })`.

The five domain-shaped generators moved to `/presets` and remain available as
deprecated methods. `newline()`, `paragraph()`, `blankLine()`, `bullets()`, and
`steps()` are still no-ops and aliases. All of these are removed in 1.0.

---

## Origin

Extracted from [Kasava's](https://kasava.dev) internal AI platform, where it
powers 30+ agents and 70+ workflows in production.

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
identically against a committed baseline. It skips cleanly when those repos
aren't present.

After an intentional formatting change, regenerate and **read the diff**:

```bash
pnpm test:baseline
```

---

## License

MIT — See [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built with care by <a href="https://kasava.dev">Kasava</a></sub>
</p>
