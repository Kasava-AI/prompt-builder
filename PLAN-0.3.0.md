# prompt-builder 0.3.0 — "Drizzle for prompts"

Plan to turn `@kasava/prompt-builder` from a fluent string formatter into a prompt ORM,
without breaking a single one of the ~65 files that already import it.

---

## 1. Where we actually are

`src/prompt-builder.ts` — 1,026 lines, one class, one private field:

```ts
export class PromptBuilder {
  private parts: string[] = []
  build(): string { return this.parts.join('\n\n') }
}
```

Every one of the ~50 methods eagerly formats to a markdown string and pushes it onto
`parts`. There is no other state.

**Consumer census** (what the API is actually used for in the wild):

| Repo | Files | Notes |
|---|---|---|
| `kasava/external/mastra-cloud` | 55 | via a re-export shim at `lib/agent-utils/prompts/prompt-builder.ts` |
| `kasava/prompt-generator` | 1 | heaviest user of `.conditional()` and `.field()` |
| `monroe/app` | 7 | `agents/instructions/**` |

Method calls across all consumers:

```
383 .raw()          141 .include()      30 .conditional()    5 .field()
190 .newline()      127 .list()         24 .protocol()       4 .investigationStrategy()
                     93 .heading()      19 .role()           4 .guidelines()
                     77 .build()        14 .codeBlock()      … 25 more methods, ≤4 calls each
                     37 .numberedList()
```

**Tests: 0.** `pnpm test` runs `vitest run` against an empty glob and exits 0.

### What that census is telling us

- **`.raw()` is 38% of all calls.** The fluent API is being *bypassed* more than it is used,
  because there is no ergonomic way to write a paragraph of prose that interpolates a value.
  Drizzle hit exactly this wall and answered it with the `` sql`` `` tag.
- **`.newline()` is 19% of all calls and is a documented no-op.** 190 call sites are asking
  for spacing control the builder doesn't model.
- **`.include()` at 141 says composition is the real product.** People are building fragment
  libraries by hand.
- **The long tail is dead weight.** `followThroughMatrix`, `workedExamples`, `toolGuidance`,
  `gracefulDegradation` — 1 call each. These are Kasava-shaped opinions baked into a
  general-purpose library.

### Bugs the current architecture cannot fix

Found while reading, all traceable to "format eagerly, keep only strings":

1. **No escaping.** `table()` and `lookupTable()` do `row.join(' | ')`. Any cell containing a
   `|` silently corrupts the table. Drizzle's headline safety property is that
   *"tables and columns are automatically escaped"* — we have the opposite.
2. **`section()` and `field()` disagree on formatting.** `**Title:** value` vs `**Label**: value`.
   Two methods, same job, different output. Nothing can reconcile them because output is
   committed at call time.
3. **Empty-input methods emit blank parts.** `keyValues({})` and `limitedList([], n)` push `''`,
   which `build()` turns into a stray double newline. `list()` correctly pushes nothing.
4. **`separator()` emits `'\n---\n'`,** which after the `\n\n` join becomes `\n\n\n---\n\n\n`.
5. **No introspection.** You cannot count tokens per section, drop a section to fit a budget,
   diff two prompts structurally, reorder, or re-render for a different provider. The
   information is gone the moment the method returns.

---

## 2. Diagnosis: why this isn't an ORM yet

An ORM maps between two representations. For Drizzle that is *TypeScript objects ↔ relational rows*.
The prompt equivalent is **typed application context ↔ model-facing prompt text**.

Today we only have the right-hand side. There is no schema, no typed input, no binding step —
prompts are string constants assembled at module load. Monroe's `dynamic.ts` proves it: the one
place that genuinely needs per-request variables abandons the library entirely and hand-writes
`[...lines].join("\n")` with raw XML tags, because the library offers nothing for that job.

So the gap is not "more helper methods." It is the missing half of the mapping:

```
        MISSING                                    HAVE
  ┌──────────────────┐   bind/render   ┌────────────────────────┐
  │ typed vars       │ ──────────────▶ │ formatted prompt text  │
  │ (schema)         │                 │ (fluent builder)       │
  └──────────────────┘                 └────────────────────────┘
```

Two structural changes unlock everything else:

- **An AST.** `parts: string[]` becomes `nodes: Node[]`. Formatting moves out of the methods
  and into a renderer.
- **A schema + render split.** A prompt becomes a *definition* with typed variables, and
  `.render(vars)` produces the string. Same shape as `pgTable` + `.execute()`.

---

## 3. The Drizzle map — honest version

### What maps cleanly

| Drizzle | prompt-builder 0.3 | Why it maps |
|---|---|---|
| `pgTable('users', {...})` | `definePrompt('name', {...})` | Schema as source of truth |
| `text().notNull().default()` | `text() / num() / list() / json()` + same modifiers | Column builders → var builders |
| `$inferSelect` / `$inferInsert` | `$inferVars` | Types derived from the schema, never hand-written |
| `` sql`select * from ${t}` `` | `` p`Active shows: ${v.shows}` `` | Interpolation with automatic escaping |
| `sql.raw()` | `p.raw()` | Escape hatch — *same name on purpose*, it's the migration target for 383 `.raw()` calls |
| `sql.join()` / `.append()` / `.empty()` | identical | Chunk composition |
| `sql.placeholder('id')` → `.prepare()` → `.execute({id})` | `.placeholder()` → `.prepare()` → `.render({...})` | Compile the static skeleton once, bind many times |
| `eq()`, `and()`, `or()` — standalone operators | `when()`, `unless()`, `all()`, `any()`, `each()` | Composable fragments, not just chained methods |
| `.$dynamic()` | `.$dynamic()` | Lets helper functions take and extend a builder |
| `PgDialect` / `MySqlDialect` / `SQLiteDialect` | `markdown()` / `xml()` / `messages()` | One AST, many serializations |
| `.toSQL()` → `{sql, params}` | `.toPrompt()` → `{text, params}`, `.toAST()` | Inspect without executing |
| `drizzle-zod` `createInsertSchema` | `createVarsSchema` at `/zod` subpath | Runtime validation of the render payload |
| drizzle-kit `generate` + snapshots + journal | `prompt-kit snapshot` / `diff` | Prompts are the highest-churn, least-reviewed artifact in an AI codebase |
| Drizzle Studio | `prompt-kit studio` | Preview, token counts, diff |

### What does *not* map, and why I'm not forcing it

Drizzle's power comes from SQL being a real target language with a real engine. Prompts have no
engine, no execution, no result set. So:

- **`select` / `where` / `join` / `groupBy`** — nothing to select *from*. Chaining these onto a
  prompt would be cargo cult.
- **Transactions, batch, views** — no atomicity or persistence to model.
- **`db.query.x.findMany({ with })`** — no relational graph… *but* there is a legitimate reduced
  form. Monroe's `static.ts` hand-rolls `if (TOOL_SEARCH_ENABLED) … else …` and
  `if (SKILLS_ENABLED) … else …` to swap sub-sections in and out. That is
  `findMany({ with: { toolCatalog: false } })` written by hand. We ship it as **includes/variants**
  and call it that, not "relations."

### What Drizzle has no answer for (AI-native, ours to invent)

- **Token budgets.** `.$budget({ maxTokens })` with per-node `priority`, dropping low-priority
  nodes until it fits. The AI-native `LIMIT`.
- **Cache breakpoints.** `static.ts` already carries the comment *"This is the block Anthropic
  prompt caching can hit."* The library should model that boundary and emit `cache_control` in
  the messages dialect instead of leaving it to a comment.

---

## 4. Target architecture

```
  definePrompt(name, vars)          ← schema: typed variables
        │
        │ .body(v => …)             ← fluent builder, unchanged surface
        ▼
     Node[]  (AST)                  ← heading | list | table | tag | text | fragment | slot
        │
        ├── markdown()  → string           (default; byte-identical to today)
        ├── xml()       → string           (Anthropic-style)
        ├── messages()  → ChatMessage[]    (+ cache_control breakpoints)
        └── toAST()     → Node[]           (token counting, diffing, linting)
```

Four new modules, one rewritten:

| File | Role |
|---|---|
| `src/ast.ts` | `Node` union, constructors, `walk`/`map` |
| `src/schema.ts` | `definePrompt`, var builders, `$inferVars` |
| `src/template.ts` | the `p` tag, `Fragment`, placeholders, escaping |
| `src/combinators.ts` | `when`, `unless`, `all`, `any`, `each` |
| `src/dialects/*.ts` | `markdown`, `xml`, `messages` |
| `src/prompt-builder.ts` | **kept**, retargeted to emit AST nodes instead of strings |

---

## 5. The API, concretely

### 5.1 Schema — the `pgTable` analogue

```ts
import { definePrompt, text, num, list, bool, json } from '@kasava/prompt-builder'

export const userContext = definePrompt('user_context', {
  userName:     text().notNull(),
  activeShows:  list().default([]),
  totalWatched: num().default(0),
  isMobile:     bool().default(false),
  prefs:        json<StatedPreference[]>().default([]),
})

type Vars = typeof userContext.$inferVars
// { userName: string; activeShows?: string[]; totalWatched?: number;
//   isMobile?: boolean; prefs?: StatedPreference[] }
```

### 5.2 Body — the fluent builder, unchanged, plus the `p` tag

```ts
import { prompt, p, when } from '@kasava/prompt-builder'

const body = userContext.body((v) => prompt()
  .tag('user_context', p`
    Active shows (${v.activeShows.length}): ${v.activeShows}
    Total watched: ${v.totalWatched}
  `)
  .include(when(v.isMobile, MOBILE_RULES))
)

body.render({ userName: 'Ben', activeShows: ['Severance'], isMobile: true })
```

`p` interpolation rules, mirroring `sql`:

| Interpolated | Emitted |
|---|---|
| `string` / `number` / `boolean` | escaped for the active dialect |
| `string[]` | comma-joined (or `- ` bulleted inside a list context) |
| `Fragment` / `PromptBuilder` | inlined as a child node |
| `p.raw(x)` | verbatim, no escaping |
| `placeholder('name')` | a param slot, filled at `.render()` |

`p.raw()` matters more than it looks: it is a **drop-in for the 383 existing `.raw()` calls**,
so the migration is `.raw(x)` → `` p`${p.raw(x)}` `` only where interpolation is wanted, and
nothing at all everywhere else.

### 5.3 Combinators — the `eq`/`and`/`or` analogue

```ts
import { when, unless, all, any, each } from '@kasava/prompt-builder'

all(
  BASE_RULES,
  when(flags.toolSearch, TOOL_SEARCH_BLOCK),
  unless(flags.toolSearch, TOOL_CATALOG_BLOCK),
  each(protocols, (proto) => p`### ${proto.name}\n${proto.body}`),
)
```

Standalone and composable — usable outside a chain, unlike today's method-only `.conditional()`
(which stays and keeps working).

### 5.4 Prepared prompts — `.prepare()` / `.render()`

```ts
const prepared = userContext.prepare('user_ctx_v1')

prepared.render({ userName: 'Ben', activeShows: [...] })   // static skeleton reused
```

Compiles the static nodes to a string skeleton once and splices params per render. Same
motivation as Drizzle: *"do concatenation once… instead of parsing the query all the time."*
For a 6k-token system prompt rebuilt per request this is a real win, and it makes the static
half addressable for cache breakpoints.

### 5.5 Dialects and output targets

```ts
render(myPrompt, vars)                      // string, markdown — byte-identical to today
render(myPrompt, vars, { dialect: xml() })  // XML-tag-heavy
toMessages(myPrompt, vars)                  // [{ role, content, cache_control? }]
myPrompt.toPrompt(vars)                     // { text, params }   ← .toSQL()
myPrompt.toAST()                            // Node[]
```

### 5.6 Variants — the reduced `with:` analogue

Replaces the hand-rolled flag branching in `static.ts`:

```ts
export const agentPrompt = definePrompt('agent', {...})
  .fragments({ toolCatalog, protocols, safety })

agentPrompt.render(vars, { with: { toolCatalog: false, protocols: true } })
```

### 5.7 Token budget — no Drizzle analogue

```ts
prompt()
  .priority('required').include(CORE_RULES)
  .priority('low').include(WORKED_EXAMPLES)
  .$budget({ maxTokens: 8000, counter: anthropicCounter })
```

Drops lowest-priority nodes until it fits; `required` never drops (throws if it alone overflows).

### 5.8 Presets — domain generators leave core

Five methods have exactly 1–4 call sites each and encode Kasava-shaped opinions in a
general-purpose library: `followThroughMatrix`, `workedExamples` / `workedExample`,
`toolGuidance`, `gracefulDegradation`, `analysisRequirements`. They move to a subpath as
plain fragment functions:

```ts
import { workedExamples, toolGuidance } from '@kasava/prompt-builder/presets'

prompt()
  .include(toolGuidance([{ tool: 'searchSymbols', usage: 'Find symbols by keyword' }]))
  .include(workedExamples([...]))
```

**Existing call sites keep working.** The methods stay on `PromptBuilder` as deprecated
one-line shims that delegate to the preset functions:

```ts
/** @deprecated Import from '@kasava/prompt-builder/presets' and use .include(). Removed in 1.0. */
toolGuidance(tools, title = 'Available Tools'): this {
  return this.include(presetToolGuidance(tools, title))
}
```

Import direction is core → presets, one-way, and it disappears entirely when the shims are
removed in 1.0. `investigationStrategy`, `confidenceScale`, `severityScale`, `guidelines`, and
`verificationChecklist` are borderline — they're generic enough to earn their place. Judgement
call: they stay in core for 0.3.0, and `prompt-kit lint` usage data decides at 1.0.

### 5.9 `prompt-kit`

```
prompt-kit snapshot   # .prompts/<name>/<hash>.md + journal.json
prompt-kit diff       # structural diff vs last snapshot; non-zero exit on unreviewed change
prompt-kit lint       # unresolved vars, unclosed tags, duplicate headings, token bloat, contradictions
prompt-kit studio     # local preview + diff + token breakdown
```

The genuine "migrations" analogue. Today a one-word prompt edit ships with zero review signal.

---

## 6. Backwards compatibility — semantic, not byte-for-byte

**Decided:** existing code must keep working; output must stay *semantically* equivalent, not
byte-identical. That splits the contract in two:

| Contract | Level | Enforcement |
|---|---|---|
| **Source compatibility** | Absolute. Every existing call site compiles and runs, unchanged. | Type tests + the consumer fixture suite must build |
| **Output compatibility** | Semantic. Same sections, same order, same content, same meaning. Whitespace and formatting may normalize. | Every diff reviewed and signed off in Phase 0 |

### The mechanism

Keep every public signature exactly as-is. Change only what the methods *push*:

```ts
// before                                    // after
this.parts.push(`## ${text}`)                this.nodes.push({ kind: 'heading', level, text })
```

Because output no longer has to be bit-exact, `markdown()` becomes the *correct* renderer rather
than a bug-compatible one, and the four defects from §1 get fixed in 0.3.0 instead of deferred:

| # | Change | Before | After | Risk |
|---|---|---|---|---|
| 1 | `separator()` normalized | `\n\n\n---\n\n\n` | `\n\n---\n\n` | None — whitespace |
| 2 | Empty `keyValues({})`, `limitedList([], n)` | pushes `''` → stray blank line | pushes nothing, matching `list()` | None — removes a blank line |
| 3 | `table()` / `lookupTable()` escape `\|` in cells | silently corrupts the table | `\|` escaped, table renders | **Fixes broken output** |
| 4 | `section()` / `field()` unified | `**T:** v` vs `**L**: v` | both `**T:** v` | Cosmetic; 2 + 5 call sites |
| 5 | `workedExamples()` XML | blank lines between tag and content | tight | Cosmetic |
| 6 | `severityScale()` uses `list()` | one part per level → blank lines between bullets | one part, `\n`-joined | Cosmetic; matches every other list |
| 7 | `filesList()` pluralises | `(1 files)` | `(1 file)` / `(2 files)` | Cosmetic |
| 8 | `lookupTable()` skips when empty | header-only table | nothing, matching `table()` | Removes an empty table from `toolGuidance([])` etc. |

Rows 6–8 were found while writing the Phase 0 suite; each is pinned in `test/quirks.test.ts`.
One more oddity is pinned but deliberately **not** changed: `confidenceScale([])` renders an empty
table instead of falling back to the defaults, because `(tiers || defaultTiers)` treats `[]` as
truthy. Changing it would alter output for a caller passing a computed-empty array, which is a
behavior change rather than a formatting fix — it belongs with the 1.0 API review, not here.

Everything else renders as it does today. `conditional()` and `include()` still collapse a
sub-builder into a single node so internal paragraph breaks survive; `newline()`, `paragraph()`,
`blankLine()`, `bullets()`, and `steps()` remain no-ops and aliases.

For anyone who does need the old bytes, `markdown({ strict: true })` is the escape hatch —
inverted from the original plan, since the correct rendering is now the default.

### One real consequence, stated plainly

Changing static prompt bytes **invalidates existing Anthropic prompt caches once**, because cache
hits are prefix-exact. The affected prompts re-cache on their next call. It is a one-time cost at
deploy, not a correctness problem — but it is the reason Phase 5 migrations should not all land in
the same deploy as the 0.3.0 bump.

### Type-level compatibility

- `PromptBuilder` becomes `PromptBuilder<TVars = {}>` — a defaulted parameter, so every bare
  `PromptBuilder` annotation still compiles.
- `include(other: PromptBuilder | string)` widens to `PromptBuilder | Fragment | string` —
  widening a parameter is safe.
- `conditional()`'s callback signature is untouched.
- Preset methods keep their exact signatures as deprecated delegating shims (§5.8).

### Deprecations

JSDoc `@deprecated` only. **No runtime warnings** — 190 `.newline()` calls would flood every log
in both codebases. Removal is a 1.0 conversation.

### Version

`0.2.2 → 0.3.0`. Source-compatible, additive API, with the §6 formatting corrections folded in.
No consumer has to change a line. Actual removals — the deprecated no-ops, the preset shims —
wait for **1.0**.

---

## 7. Phases

### Phase 0 — Characterization tests ✅ COMPLETE

**229 runtime tests + 19 type tests. 100% statements / branches / functions / lines.**

| Deliverable | Where |
|---|---|
| Harness (`vitest.config.ts`, 100% thresholds, alias, typecheck project) | `vitest.config.ts`, `tsconfig.test.json` |
| Per-method characterization, every branch and edge input | `test/core-formatting`, `lists`, `tables`, `xml-tags`, `code-and-files`, `generators` |
| Composition — `include`, `conditional`, `section()`, nesting | `test/composition.test.ts` |
| **Mutability contract** — the statement-style `b.conditional(…)` pattern | `test/mutation-contract.test.ts` |
| Deprecated surface (`newline`, `bullets`, `steps`, …) | `test/deprecated.test.ts` |
| **The 8 defects, pinned** — the Phase 1 checklist | `test/quirks.test.ts` |
| Consumer-shape fixtures with inline snapshots | `test/integration/consumer-shapes.test.ts` |
| **Cross-repo baseline: 28 real modules, 43 prompt exports, 111 KB** | `test/integration/consumer-baseline.test.ts` |
| Type-surface compatibility | `test/types.test-d.ts` |

Three things came out of writing it that change later phases:

1. **The mutability contract is the sharpest hazard in the whole refactor.** `PromptBuilder` mutates
   `this`, and `prompt-generator` relies on it — `b.conditional(…)` is called as a bare statement
   with the return value discarded. If Phase 1 ever makes the builder persistent/immutable, that
   pattern silently drops sections: no type error, no test failure anywhere else, just prompts
   quietly missing content. Pinned in `mutation-contract.test.ts`.
2. **The defect list grew from 5 to 8.** `severityScale()` emits one part per level (so its bullets
   render with blank lines between them, unlike every other list); `filesList()` renders "1 files";
   and `lookupTable()` emits a header-only table for zero rows where `table()` correctly skips —
   which leaks into `toolGuidance()` and `confidenceScale()`. §6's table needs three more rows.
3. **`confidenceScale([])` does not fall back to defaults.** `(tiers || defaultTiers)` treats `[]`
   as truthy, so an empty array yields an empty table. Only `undefined` falls back.

The suite is a **review gate, not an equality assertion**. Phase 1 is allowed to change these
outputs — it is not allowed to change them *unnoticed*. Verified by mutation: adding one space to
`heading()` was caught across the entire cross-repo baseline.

Commands: `pnpm test`, `pnpm test:coverage`, `pnpm test:types`, `pnpm type-check`,
`pnpm test:baseline` (regenerate the cross-repo baseline, then read the diff).

### Phase 1 — AST + dialects ✅ COMPLETE (`0.3.0-alpha.0`)

**265 runtime tests + 19 type tests. 100% coverage across all three source files.**

| Deliverable | Where |
|---|---|
| 15-kind node union, `render()`, `walk()`, `Dialect` interface | `src/ast.ts` |
| Markdown dialect, corrected + `strict` | `src/dialects/markdown.ts` |
| All ~50 methods retargeted to emit nodes | `src/prompt-builder.ts` |
| `toAST()`, `toPrompt()`, `build(dialect)` | `src/prompt-builder.ts` |
| The 9 corrections, both sides proven | `test/formatting-corrections.test.ts` |
| AST/dialect surface, custom dialects, budget-style filtering | `test/ast.test.ts` |

**The `legacy` field is the mechanism.** Rather than branching per quirk inside the dialect, any
node whose rendering intentionally changed records its exact pre-0.3.0 string in `node.legacy`.
`markdown({ strict: true })` is then one line — use `legacy` if present, else render — which makes
strict mode correct by construction. It doubles as the audit trail: `grep -rn 'legacy:' src/`
returns every intentional formatting change in the library.

**`include()` and `conditional()` now splice** the child's nodes into the parent instead of
collapsing them to one pre-joined string. Output is identical (both levels join with a blank
line) but the AST stays walkable, which token budgeting and cache breakpoints need. The one
visible consequence is row 9.

**The headline result: all 43 real production prompts are byte-identical after the refactor.**
The cross-repo baseline — 28 modules, 111 KB — passed unchanged, because those files use
`raw`/`heading`/`list`/`protocol`/`numberedList`/`include`/`conditional`/`role`/`codeBlock`, and
none of those paths changed. The corrections only reach `field`-family calls, tables, separators,
and the three generators, which live in the 16 consumer files that need runtime context to load.

Of the 42 test diffs this phase produced, every one mapped to a numbered §6 row. The two inline
snapshots that moved differed *only* in field-colon placement (row 4) — structure, headings, and
lists were untouched.

### Phase 2 — Schema, template tag, combinators ✅ COMPLETE (`0.3.0-beta.0`)

**400 runtime tests + 25 type tests. 100% coverage across all eight source files.**

| Deliverable | Where |
|---|---|
| `p` tag, `Fragment`, `p.raw/join/empty`, `placeholder()` | `src/template.ts` |
| `when` / `unless` / `all` / `any` / `each` | `src/combinators.ts` |
| `definePrompt`, var builders, `$inferVars`, `.body()`, `.render()` | `src/schema.ts` |
| `.prepare()` → `PreparedPrompt.render()` | `src/prepared.ts` |
| `xml()` dialect; `toMessages()` + `.cacheBoundary()` | `src/dialects/{xml,messages}.ts` |
| `.$dynamic()`, `.params()`, `resolve()` | `src/prompt-builder.ts`, `src/ast.ts` |

**Exit criterion met.** `test/integration/monroe-dynamic-port.test.ts` holds both the original
hand-rolled `dynamic.ts` and its port onto `definePrompt` + `p` + `when`/`all`, and asserts they
are **byte-identical across all 7 input shapes**. Monroe itself is untouched — it depends on the
published `^0.2.1`, so it can only migrate once 0.3.0 ships.

Three things worth recording:

1. **`p` does not escape, and cannot.** Drizzle's `sql` tag escapes because SQL has a grammar to
   break out of; natural language does not, so no amount of escaping makes untrusted text safe to
   interpolate into a prompt. `p` provides composition and consistent value serialization —
   arrays comma-join, objects JSON-serialize, nullish becomes empty — and the docs say plainly
   that it is not an injection defense. Claiming otherwise would be the most dangerous thing in
   this release.
2. **Dedent has to run before interpolation.** Once values are interleaved they are
   indistinguishable from literal template text, so a multi-line interpolated value both skewed
   the computed indent and got reindented itself. Caught by a test, fixed by operating on the
   template strings.
3. **Two unused `@ts-expect-error` directives caught a real inference bug.** `VarConfig` declared
   its flags as `boolean`, which widened `.notNull()`'s literal `true` and made every variable
   optional in the render payload — `render({})` type-checked with a required variable missing.
   The flags are now literal type parameters on `Var<T, R, D>`, and `types.test-d.ts` pins the
   required/optional split so it cannot regress silently.

One asymmetry to know about: `include()` of an empty builder still leaves an `empty` marker node
so strict mode can reproduce §6 row 9, but the combinators drop empty results outright — they are
new API with no legacy to preserve, and a clean AST matters more for walking and budgeting.

### Phase 3 — Ecosystem ✅ COMPLETE (`0.3.0`)

**466 runtime tests + 25 type tests. 100% coverage across all twelve source files.**

| Deliverable | Where |
|---|---|
| `/presets` subpath + deprecated shims | `src/presets.ts` |
| `/zod` subpath: `createVarsSchema`, typed refinements | `src/zod.ts` |
| `.priority()` / `.$budget()` + pluggable counter | `src/budget.ts` |
| `.node()` — the AST escape hatch presets are built on | `src/prompt-builder.ts` |
| Three-entry build, `exports` map, optional `zod` peer | `tsup.config.ts`, `package.json` |
| README rewritten around the ORM framing | `README.md` |
| **Every README example executed as a test** | `test/readme.test.ts` |

Notes from building it:

- **`.node()` fell out of the presets split and is the more useful primitive.** Moving the
  generators out needed a way to build an arbitrary AST node from outside the class; that turned
  out to be worth exposing on its own, for custom generators and for content reconstructed from a
  stored AST.
- **Core ↔ presets is a deliberate import cycle.** The presets build on `PromptBuilder`, and the
  deprecated methods delegate to the presets. Usage is confined to function bodies, so evaluation
  order never matters, and the cycle disappears at 1.0 when the shims go. Verified against the
  built `dist/`, not just source.
- **`$budget()` returns a new builder** rather than mutating, unlike the rest of the API. Trimming
  is a query over the prompt, not a step in building one — and silently mutating a shared fragment
  because something was over budget would be a nasty surprise.
- **The README's zod refinement example didn't typecheck.** `Refinements` typed the callback as
  `z.ZodTypeAny`, so `(s) => s.max(80)` required a cast. Refinements are now typed per variable,
  and the example works as written. Writing `test/readme.test.ts` is what surfaced it.

**Shipped 0.3.0.** Source-compatible with 0.2.x; no consumer has to change a line.

### Phase 4 — `prompt-kit` (`0.4.0`, separable)

- `snapshot` / `diff` / `lint`, then `studio`
- Separate `bin`, or a sibling package if we want the core to stay dependency-free

### Phase 5 — Consumer migration (opt-in, no deadline)

Nothing is forced. Migrate where it pays:

- `monroe/app/.../dynamic.ts` — biggest win, currently bypasses the library entirely
- `mastra-cloud` chat-agent instructions — heaviest `.raw()` + `.include()` concentration
- `prompt-generator/prompt-template.ts` — heaviest `.conditional()` user, best `when()`/`each()` test

Stagger these behind the 0.3.0 deploy so prompt-cache re-warming (§6) doesn't stack.

---

## 8. Decisions and risks

### Resolved

1. **Semantic equivalence, not byte-identity.** Existing code keeps working; output may normalize.
   Buys the §6 fixes in 0.3.0 rather than 0.4.0. → §6
2. **One package**, subpath exports (`.`, `./presets`, `./zod`); `prompt-kit` deferred to 0.4.0.
3. **The five domain generators move to `/presets`**, with deprecated delegating shims so no call
   site breaks. → §5.8

### Risks

| Risk | Mitigation |
|---|---|
| A formatting change lands that *wasn't* on the approved list | Phase 0 is blocking; Phase 1 exit criteria require every diff to map to a §6 row |
| Prompt-cache invalidation at deploy | One-time, expected, documented in §6; stagger Phase 5 migrations to a later deploy |
| Semantic drift is judged by eye, not by assertion | Diffs reviewed against the fixture suite, which covers all ~65 real consumer prompts — not synthetic cases |
| Scope creep — "port all of Drizzle" | §3 explicitly names what we're *not* building |
| Two ways to do everything (chain vs. combinators) | README leads with one path; combinators documented as the composition escape hatch, same as Drizzle's `sql` |
| Zero-dep promise | Core stays zero-dep; zod and the CLI live behind subpath exports |
| Token counting needs a tokenizer | `counter` is caller-supplied; we ship a rough char/4 default and no dependency |

### Deferred to 1.0

Removing the deprecated no-ops (`newline`, `paragraph`, `blankLine`, `bullets`, `steps`), removing
the preset shims, and deciding whether `investigationStrategy` / `confidenceScale` /
`severityScale` / `guidelines` / `verificationChecklist` also belong in `/presets`.
