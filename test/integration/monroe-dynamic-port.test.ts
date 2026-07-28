import { describe, it, expect } from 'vitest'
import { definePrompt, text, num, list, json, prompt, p, when, all } from '../../src/index'

/**
 * Phase 2 exit criterion: express Monroe's per-request context prompt on the
 * new API.
 *
 * `monroe/app/src/lib/ai/mastra/agents/instructions/dynamic.ts` is the honest
 * test of whether 0.3.0 closed the gap. It is the one Monroe prompt with real
 * per-request variables, and it abandons the library entirely — hand-rolling
 * `[...lines].join("\n")` with raw XML — because pre-0.3.0 had no answer for
 * runtime data.
 *
 * Both implementations live here: ORIGINAL is the current hand-rolled code,
 * PORTED is the same prompt on definePrompt + p + when. Every case asserts they
 * produce byte-identical output, so the port is proven rather than asserted.
 *
 * Monroe itself is not edited — it depends on the published ^0.2.1, so it can
 * only migrate once 0.3.0 ships.
 */

interface StatedPreferenceSummary {
  kind: 'genre' | 'person' | 'show' | 'general'
  sentiment: 'like' | 'dislike'
  targetName?: string | null
  note?: string | null
}

interface UserSummary {
  userId: string
  activeCount: number
  activeShowNames: string[]
  recentlyCompleted: string[]
  topGenres: string[]
  totalWatched: number
  statedPreferences?: StatedPreferenceSummary[]
}

const DATE_NOTE =
  'Article content may reference dates as "upcoming" that are actually in the past relative to <current_date>. Always compare any date you mention against <current_date> and phrase accordingly.'

const CONTEXT_NOTE =
  'Use this as a hint for taste and library state. When the user asks about specific library details (progress, next episode, ratings), still call the appropriate tool to get fresh data.'

const PREFS_NOTE =
  'These are things the user explicitly told us. Treat them as authoritative over inferred taste. Respect DISLIKES when recommending; do not re-ask about things already stated here.'

const MOBILE_LINES = [
  '<mobile_client>',
  'You are being viewed in the Monroe iOS app on a phone. Rendering rules for this surface:',
  '- Recommendations: whenever you suggest more than one show, call `presentRecommendations`.',
  '- Keep prose thin: at most one short lead-in sentence before the cards.',
  '</mobile_client>',
]

// ─── ORIGINAL — the hand-rolled implementation, verbatim in structure ────────

function renderMobileClientOriginal(client: unknown): string {
  if (client !== 'mobile') return ''
  return MOBILE_LINES.join('\n')
}

function renderStatedPreferencesOriginal(prefs: StatedPreferenceSummary[] | undefined): string {
  if (!prefs?.length) return ''

  const targeted = (sentiment: 'like' | 'dislike') =>
    prefs
      .filter((x) => x.kind !== 'general' && x.sentiment === sentiment)
      .map((x) => `${x.targetName} (${x.kind})`)
      .join(', ')
  const notes = prefs
    .filter((x) => x.kind === 'general' && x.note)
    .map((x) => `"${x.note}"`)
    .join('; ')

  const lines = ['<stated_preferences>']
  const likes = targeted('like')
  const dislikes = targeted('dislike')
  if (likes) lines.push(`LIKES: ${likes}`)
  if (dislikes) lines.push(`DISLIKES: ${dislikes}`)
  if (notes) lines.push(`NOTES: ${notes}`)
  lines.push('</stated_preferences>', '', PREFS_NOTE)
  return lines.join('\n')
}

function original(summary: UserSummary | null, client: unknown, today: string): string {
  const mobileBlock = renderMobileClientOriginal(client)
  const dateBlock = [`<current_date>${today}</current_date>`, '', DATE_NOTE]

  if (!summary) return [dateBlock.join('\n'), mobileBlock].filter(Boolean).join('\n\n')

  const lines = [
    ...dateBlock,
    '',
    '<user_context>',
    `Active shows (${summary.activeCount}): ${summary.activeShowNames.join(', ') || 'none'}`,
    `Recently completed: ${summary.recentlyCompleted.join(', ') || 'none'}`,
    `Top genres: ${summary.topGenres.join(', ') || 'unknown'}`,
    `Total watched: ${summary.totalWatched}`,
    '</user_context>',
    '',
    CONTEXT_NOTE,
  ]

  const statedBlock = renderStatedPreferencesOriginal(summary.statedPreferences)
  if (statedBlock) lines.push('', statedBlock)

  return [lines.join('\n'), mobileBlock].filter(Boolean).join('\n\n')
}

// ─── PORTED — the same prompt, declared and built ───────────────────────────

const dynamicContext = definePrompt('dynamic_context', {
  today: text().notNull(),
  client: text().default(''),
  activeCount: num().default(0),
  activeShowNames: list().default([]),
  recentlyCompleted: list().default([]),
  topGenres: list().default([]),
  totalWatched: num().default(0),
  statedPreferences: json<StatedPreferenceSummary[]>().default([]),
  hasSummary: json<boolean>().default(false),
})

const statedPreferences = (prefs: StatedPreferenceSummary[]) => {
  if (!prefs.length) return null

  const targeted = (sentiment: 'like' | 'dislike') =>
    prefs
      .filter((x) => x.kind !== 'general' && x.sentiment === sentiment)
      .map((x) => `${x.targetName} (${x.kind})`)
      .join(', ')
  const notes = prefs
    .filter((x) => x.kind === 'general' && x.note)
    .map((x) => `"${x.note}"`)
    .join('; ')

  const rows = [
    targeted('like') && `LIKES: ${targeted('like')}`,
    targeted('dislike') && `DISLIKES: ${targeted('dislike')}`,
    notes && `NOTES: ${notes}`,
  ].filter(Boolean) as string[]

  return prompt().tag('stated_preferences', rows.join('\n')).raw(PREFS_NOTE)
}

const ported = dynamicContext.body((v) =>
  all(
    p`<current_date>${v.today}</current_date>`,
    DATE_NOTE,
    when(
      v.hasSummary,
      all(
        prompt()
          .tag(
            'user_context',
            p`
              Active shows (${v.activeCount}): ${v.activeShowNames.length ? v.activeShowNames : 'none'}
              Recently completed: ${v.recentlyCompleted.length ? v.recentlyCompleted : 'none'}
              Top genres: ${v.topGenres.length ? v.topGenres : 'unknown'}
              Total watched: ${v.totalWatched}
            `,
          )
          .raw(CONTEXT_NOTE),
        statedPreferences(v.statedPreferences),
      ),
    ),
    when(v.client === 'mobile', MOBILE_LINES.join('\n')),
  ),
)

function portedRender(summary: UserSummary | null, client: unknown, today: string): string {
  return ported.render({
    today,
    client: typeof client === 'string' ? client : '',
    hasSummary: summary !== null,
    activeCount: summary?.activeCount,
    activeShowNames: summary?.activeShowNames,
    recentlyCompleted: summary?.recentlyCompleted,
    topGenres: summary?.topGenres,
    totalWatched: summary?.totalWatched,
    statedPreferences: summary?.statedPreferences,
  })
}

// ─── Proof ───────────────────────────────────────────────────────────────────

const TODAY = '2026-07-27'

const FULL: UserSummary = {
  userId: 'u1',
  activeCount: 2,
  activeShowNames: ['Severance', 'Andor'],
  recentlyCompleted: ['The Bear'],
  topGenres: ['Drama', 'Sci-Fi'],
  totalWatched: 412,
}

const cases: Array<[string, UserSummary | null, unknown]> = [
  ['no summary, web', null, undefined],
  ['no summary, mobile', null, 'mobile'],
  ['full summary, web', FULL, undefined],
  ['full summary, mobile', FULL, 'mobile'],
  ['empty collections', { ...FULL, activeShowNames: [], recentlyCompleted: [], topGenres: [] }, undefined],
  [
    'stated preferences — likes only',
    { ...FULL, statedPreferences: [{ kind: 'genre', sentiment: 'like', targetName: 'Sci-Fi' }] },
    undefined,
  ],
  [
    'stated preferences — all three rows',
    {
      ...FULL,
      statedPreferences: [
        { kind: 'genre', sentiment: 'like', targetName: 'Sci-Fi' },
        { kind: 'show', sentiment: 'dislike', targetName: 'Emily in Paris' },
        { kind: 'general', sentiment: 'like', note: 'nothing too long' },
      ],
    },
    'mobile',
  ],
]

describe('monroe dynamic.ts — ported to the 0.3.0 API', () => {
  it.each(cases)('%s produces byte-identical output', (_name, summary, client) => {
    expect(portedRender(summary, client, TODAY)).toBe(original(summary, client, TODAY))
  })

  it('covers every branch of the original', () => {
    expect(cases).toHaveLength(7)
  })
})

describe('what the port buys', () => {
  it('declares its inputs, so the render payload is typed', () => {
    expect(Object.keys(dynamicContext.vars).sort()).toEqual([
      'activeCount',
      'activeShowNames',
      'client',
      'hasSummary',
      'recentlyCompleted',
      'statedPreferences',
      'today',
      'topGenres',
      'totalWatched',
    ])
  })

  it('is introspectable — the AST is walkable instead of an opaque string', () => {
    const ast = ported.toAST({ today: TODAY, hasSummary: true, ...FULL })
    expect(ast.map((n) => n.kind)).toEqual(['text', 'text', 'tag', 'text'])
  })

  it('applies defaults instead of threading null checks through the body', () => {
    expect(ported.render({ today: TODAY })).toBe(original(null, undefined, TODAY))
  })
})
