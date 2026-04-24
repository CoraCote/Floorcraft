import { describe, it, expect, beforeEach } from 'vitest'
import { useAnnotationsStore } from '../stores/annotationsStore'
import { ANNOTATION_BODY_MAX } from '../types/annotations'

beforeEach(() => {
  useAnnotationsStore.getState().clearAll()
  // Clear temporal history too so undo tests start from a clean slate.
  useAnnotationsStore.temporal.getState().clear()
})

describe('annotationsStore', () => {
  it('addAnnotation inserts and returns the new id', () => {
    const id = useAnnotationsStore.getState().addAnnotation({
      body: 'Move this desk after Q3',
      authorName: 'jane.doe',
      anchor: { type: 'element', elementId: 'desk-1' },
    })
    const all = useAnnotationsStore.getState().annotations
    expect(Object.keys(all)).toEqual([id])
    expect(all[id].body).toBe('Move this desk after Q3')
    expect(all[id].resolvedAt).toBeNull()
    expect(all[id].anchor).toEqual({ type: 'element', elementId: 'desk-1' })
  })

  it('trims whitespace and caps body at ANNOTATION_BODY_MAX chars', () => {
    const padded = '   ' + 'x'.repeat(ANNOTATION_BODY_MAX + 50) + '   '
    const id = useAnnotationsStore.getState().addAnnotation({
      body: padded,
      authorName: 'a',
      anchor: { type: 'floor-position', floorId: 'f1', x: 0, y: 0 },
    })
    const body = useAnnotationsStore.getState().annotations[id].body
    expect(body.length).toBe(ANNOTATION_BODY_MAX)
    // Leading / trailing whitespace should be stripped before slicing.
    expect(body.startsWith('x')).toBe(true)
    expect(body.endsWith('x')).toBe(true)
  })

  it('updateAnnotationBody replaces the body, leaving other fields', () => {
    const id = useAnnotationsStore.getState().addAnnotation({
      body: 'Old',
      authorName: 'jane.doe',
      anchor: { type: 'element', elementId: 'desk-1' },
    })
    useAnnotationsStore.getState().updateAnnotationBody(id, 'New body')
    const entry = useAnnotationsStore.getState().annotations[id]
    expect(entry.body).toBe('New body')
    expect(entry.authorName).toBe('jane.doe')
    expect(entry.anchor).toEqual({ type: 'element', elementId: 'desk-1' })
  })

  it('updateAnnotationBody on a missing id is a no-op', () => {
    const before = useAnnotationsStore.getState().annotations
    useAnnotationsStore.getState().updateAnnotationBody('ghost', 'new')
    expect(useAnnotationsStore.getState().annotations).toBe(before)
  })

  it('setResolved toggles between null and an iso timestamp', () => {
    const id = useAnnotationsStore.getState().addAnnotation({
      body: 'Body',
      authorName: 'a',
      anchor: { type: 'element', elementId: 'desk-1' },
    })
    useAnnotationsStore.getState().setResolved(id, '2026-04-24T12:00:00.000Z')
    expect(useAnnotationsStore.getState().annotations[id].resolvedAt).toBe(
      '2026-04-24T12:00:00.000Z',
    )
    useAnnotationsStore.getState().setResolved(id, null)
    expect(useAnnotationsStore.getState().annotations[id].resolvedAt).toBeNull()
  })

  it('removeAnnotation deletes the entry', () => {
    const id = useAnnotationsStore.getState().addAnnotation({
      body: 'Body',
      authorName: 'a',
      anchor: { type: 'element', elementId: 'desk-1' },
    })
    useAnnotationsStore.getState().removeAnnotation(id)
    expect(useAnnotationsStore.getState().annotations).toEqual({})
  })

  it('pruneOrphans drops element-anchored annotations whose element is gone', () => {
    const keep = useAnnotationsStore.getState().addAnnotation({
      body: 'keep',
      authorName: 'a',
      anchor: { type: 'element', elementId: 'live' },
    })
    const drop = useAnnotationsStore.getState().addAnnotation({
      body: 'drop',
      authorName: 'a',
      anchor: { type: 'element', elementId: 'dead' },
    })
    const floor = useAnnotationsStore.getState().addAnnotation({
      body: 'floor',
      authorName: 'a',
      anchor: { type: 'floor-position', floorId: 'f1', x: 0, y: 0 },
    })
    useAnnotationsStore.getState().pruneOrphans(new Set(['live']))
    const all = useAnnotationsStore.getState().annotations
    expect(all[keep]).toBeTruthy()
    expect(all[drop]).toBeUndefined()
    // Floor-position annotations are never pruned — they're not bound
    // to an element id at all.
    expect(all[floor]).toBeTruthy()
  })

  it('undo walks back the last add', () => {
    useAnnotationsStore.getState().addAnnotation({
      body: 'A',
      authorName: 'a',
      anchor: { type: 'element', elementId: 'desk-1' },
    })
    expect(Object.keys(useAnnotationsStore.getState().annotations)).toHaveLength(1)
    useAnnotationsStore.temporal.getState().undo()
    expect(useAnnotationsStore.getState().annotations).toEqual({})
  })

  it('redo replays an undone add', () => {
    const id = useAnnotationsStore.getState().addAnnotation({
      body: 'A',
      authorName: 'a',
      anchor: { type: 'element', elementId: 'desk-1' },
    })
    useAnnotationsStore.temporal.getState().undo()
    expect(useAnnotationsStore.getState().annotations).toEqual({})
    useAnnotationsStore.temporal.getState().redo()
    expect(useAnnotationsStore.getState().annotations[id]).toBeTruthy()
  })

  it('undo walks back a resolve, redo re-applies it', () => {
    const id = useAnnotationsStore.getState().addAnnotation({
      body: 'A',
      authorName: 'a',
      anchor: { type: 'element', elementId: 'desk-1' },
    })
    useAnnotationsStore.getState().setResolved(id, '2026-04-24T00:00:00.000Z')
    expect(useAnnotationsStore.getState().annotations[id].resolvedAt).toBe(
      '2026-04-24T00:00:00.000Z',
    )
    useAnnotationsStore.temporal.getState().undo()
    expect(useAnnotationsStore.getState().annotations[id].resolvedAt).toBeNull()
    useAnnotationsStore.temporal.getState().redo()
    expect(useAnnotationsStore.getState().annotations[id].resolvedAt).toBe(
      '2026-04-24T00:00:00.000Z',
    )
  })
})
