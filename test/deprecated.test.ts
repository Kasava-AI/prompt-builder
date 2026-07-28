import { describe, it, expect } from 'vitest'
import { prompt } from '../src/index'

/**
 * The deprecated surface. These are still called ~200 times across the
 * Kasava and Monroe codebases, so they must keep working through 0.3.0.
 * Removal is a 1.0 decision (PLAN-0.3.0.md §8).
 */

describe('no-op spacing methods', () => {
  it('newline() emits nothing', () => {
    expect(prompt().raw('a').newline().raw('b').build()).toBe('a\n\nb')
  })

  it('paragraph() emits nothing', () => {
    expect(prompt().raw('a').paragraph().raw('b').build()).toBe('a\n\nb')
  })

  it('blankLine() emits nothing', () => {
    expect(prompt().raw('a').blankLine().raw('b').build()).toBe('a\n\nb')
  })

  it('repeated calls still emit nothing', () => {
    expect(prompt().raw('a').newline().newline().newline().raw('b').build()).toBe('a\n\nb')
  })

  it('a builder of only no-ops is empty', () => {
    expect(prompt().newline().paragraph().blankLine().build()).toBe('')
  })

  it('all three remain chainable', () => {
    const b = prompt()
    expect(b.newline()).toBe(b)
    expect(b.paragraph()).toBe(b)
    expect(b.blankLine()).toBe(b)
  })
})

describe('list aliases', () => {
  it('bullets() matches list() without a title', () => {
    expect(prompt().bullets(['a', 'b']).build()).toBe(prompt().list(['a', 'b']).build())
    expect(prompt().bullets(['a', 'b']).build()).toBe('- a\n- b')
  })

  it('steps() matches numberedList() without a title', () => {
    expect(prompt().steps(['a', 'b']).build()).toBe(prompt().numberedList(['a', 'b']).build())
    expect(prompt().steps(['a', 'b']).build()).toBe('1. a\n2. b')
  })

  it('bullets() emits nothing for an empty array', () => {
    expect(prompt().bullets([]).build()).toBe('')
  })

  it('steps() emits nothing for an empty array', () => {
    expect(prompt().steps([]).build()).toBe('')
  })

  it('bullets() emits nothing for null', () => {
    expect(prompt().bullets(null).build()).toBe('')
  })

  it('steps() emits nothing for undefined', () => {
    expect(prompt().steps(undefined).build()).toBe('')
  })
})
