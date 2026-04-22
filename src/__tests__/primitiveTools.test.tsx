import { describe, it, expect } from 'vitest'
import {
  buildRectShape,
  buildEllipse,
  buildLineShape,
  buildArrow,
  buildFreeText,
  isDragCommit,
} from '../lib/primitives/buildPrimitive'

describe('primitive tool factories', () => {
  const drag = { startX: 10, startY: 20, endX: 110, endY: 220 }

  it('rect: x/y is the center, width/height is absolute', () => {
    const el = buildRectShape(drag, 1)
    expect(el.type).toBe('rect-shape')
    expect(el.x).toBe(60)   // (10 + 110) / 2
    expect(el.y).toBe(120)  // (20 + 220) / 2
    expect(el.width).toBe(100)
    expect(el.height).toBe(200)
    expect(el.zIndex).toBe(1)
  })

  it('ellipse: same center/bbox math as rect, different type', () => {
    const el = buildEllipse(drag, 3)
    expect(el.type).toBe('ellipse')
    expect(el.x).toBe(60)
    expect(el.y).toBe(120)
    expect(el.width).toBe(100)
    expect(el.height).toBe(200)
  })

  it('line: preserves raw start/end points, fill is transparent', () => {
    const el = buildLineShape(drag, 5)
    expect(el.type).toBe('line-shape')
    expect(el.points).toEqual([10, 20, 110, 220])
    expect(el.style.fill).toBe('transparent')
  })

  it('arrow: preserves raw start/end points, fill matches stroke', () => {
    const el = buildArrow(drag, 7)
    expect(el.type).toBe('arrow')
    expect(el.points).toEqual([10, 20, 110, 220])
    expect(el.style.fill).toBe(el.style.stroke)
  })

  it('free text: click coords become the center, default label "Text"', () => {
    const el = buildFreeText(50, 60, 9)
    expect(el.type).toBe('free-text')
    expect(el.x).toBe(50)
    expect(el.y).toBe(60)
    expect(el.text).toBe('Text')
    expect(el.fontSize).toBeGreaterThan(0)
  })

  it('reverse-drag (end < start) still produces positive width/height', () => {
    const el = buildRectShape({ startX: 100, startY: 200, endX: 10, endY: 20 }, 1)
    expect(el.width).toBe(90)
    expect(el.height).toBe(180)
    expect(el.x).toBe(55)
    expect(el.y).toBe(110)
  })

  it('isDragCommit: tiny drag is not a commit, big drag is', () => {
    expect(isDragCommit({ startX: 0, startY: 0, endX: 1, endY: 1 })).toBe(false)
    expect(isDragCommit({ startX: 0, startY: 0, endX: 50, endY: 0 })).toBe(true)
  })
})
