import { describe, it, expect, vi } from 'vitest'
import { migrateAnnotations } from '../lib/offices/loadFromLegacyPayload'
import { ANNOTATION_BODY_MAX } from '../types/annotations'

describe('migrateAnnotations', () => {
  it('returns an empty map for undefined (legacy payload with no annotations key)', () => {
    expect(migrateAnnotations(undefined)).toEqual({})
  })

  it('returns an empty map for null / non-object / arrays', () => {
    expect(migrateAnnotations(null)).toEqual({})
    expect(migrateAnnotations('nope')).toEqual({})
    expect(migrateAnnotations([])).toEqual({})
  })

  it('round-trips a valid element-anchored annotation', () => {
    const out = migrateAnnotations({
      a1: {
        id: 'a1',
        body: 'body',
        authorName: 'jane.doe',
        createdAt: '2026-04-24T00:00:00.000Z',
        resolvedAt: null,
        anchor: { type: 'element', elementId: 'desk-1' },
      },
    })
    expect(out.a1.id).toBe('a1')
    expect(out.a1.anchor).toEqual({ type: 'element', elementId: 'desk-1' })
    expect(out.a1.resolvedAt).toBeNull()
  })

  it('round-trips a valid floor-position annotation', () => {
    const out = migrateAnnotations({
      a1: {
        id: 'a1',
        body: 'body',
        authorName: 'jane.doe',
        createdAt: '2026-04-24T00:00:00.000Z',
        resolvedAt: '2026-04-25T00:00:00.000Z',
        anchor: { type: 'floor-position', floorId: 'f1', x: 12.5, y: -3 },
      },
    })
    expect(out.a1.anchor).toEqual({
      type: 'floor-position',
      floorId: 'f1',
      x: 12.5,
      y: -3,
    })
    expect(out.a1.resolvedAt).toBe('2026-04-25T00:00:00.000Z')
  })

  it('drops entries with missing id / bad anchor / non-string body', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = migrateAnnotations({
      missingId: { body: 'x', anchor: { type: 'element', elementId: 'd1' } },
      badBody: { id: 'bad', body: 42, anchor: { type: 'element', elementId: 'd1' } },
      noAnchor: { id: 'na', body: 'x' },
      badAnchorType: { id: 'bt', body: 'x', anchor: { type: 'space', elementId: 'd1' } },
      elementAnchorMissingId: { id: 'el', body: 'x', anchor: { type: 'element' } },
      positionAnchorNaN: {
        id: 'pn',
        body: 'x',
        anchor: { type: 'floor-position', floorId: 'f1', x: NaN, y: 0 },
      },
      ok: {
        id: 'ok',
        body: 'x',
        authorName: 'a',
        anchor: { type: 'element', elementId: 'd1' },
      },
    })
    expect(Object.keys(out)).toEqual(['ok'])
    warn.mockRestore()
  })

  it('truncates over-long bodies', () => {
    const out = migrateAnnotations({
      a1: {
        id: 'a1',
        body: 'x'.repeat(ANNOTATION_BODY_MAX + 100),
        anchor: { type: 'element', elementId: 'd1' },
      },
    })
    expect(out.a1.body.length).toBe(ANNOTATION_BODY_MAX)
  })

  it('back-fills missing authorName / createdAt to safe defaults', () => {
    const out = migrateAnnotations({
      a1: {
        id: 'a1',
        body: 'x',
        anchor: { type: 'element', elementId: 'd1' },
      },
    })
    expect(out.a1.authorName).toBe('Unknown')
    // Epoch is a recognisable sentinel the list row can fall back to.
    expect(out.a1.createdAt).toBe(new Date(0).toISOString())
    expect(out.a1.resolvedAt).toBeNull()
  })
})
