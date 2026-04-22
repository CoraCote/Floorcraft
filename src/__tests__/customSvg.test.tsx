import { describe, it, expect, beforeEach } from 'vitest'
import { sanitizeSvg, MAX_SVG_BYTES } from '../lib/svgSanitize'
import { useCustomShapes } from '../hooks/useCustomShapes'

describe('sanitizeSvg', () => {
  it('strips <script> blocks and on* handlers from an otherwise valid SVG', () => {
    const malicious = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">',
      '<script>alert(1)</script>',
      '<rect width="10" height="10" onclick="alert(2)" fill="red" />',
      '</svg>',
    ].join('')
    const result = sanitizeSvg(malicious)
    expect(result.ok).toBe(true)
    expect(result.svg).toBeDefined()
    expect(result.svg!).not.toMatch(/<script/i)
    expect(result.svg!).not.toMatch(/onclick=/i)
    // Rect geometry should survive.
    expect(result.svg!).toMatch(/<rect\b/i)
  })

  it('strips <foreignObject> blocks', () => {
    const input = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">',
      '<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></div></foreignObject>',
      '<rect width="10" height="10" />',
      '</svg>',
    ].join('')
    const result = sanitizeSvg(input)
    expect(result.ok).toBe(true)
    expect(result.svg!).not.toMatch(/<foreignObject/i)
    expect(result.svg!).not.toMatch(/<script/i)
  })

  it('strips javascript: URIs from href/xlink:href', () => {
    const input = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">',
      '<a href="javascript:alert(1)"><rect width="10" height="10"/></a>',
      '</svg>',
    ].join('')
    const result = sanitizeSvg(input)
    expect(result.ok).toBe(true)
    expect(result.svg!).not.toMatch(/javascript:/i)
  })

  it('rejects payloads over 50KB with error "too-large"', () => {
    // One byte past the cap. Pad the <rect> with trailing whitespace in an
    // attribute value to stay valid XML.
    const pad = 'x'.repeat(MAX_SVG_BYTES + 1)
    const big = `<svg xmlns="http://www.w3.org/2000/svg"><title>${pad}</title></svg>`
    const result = sanitizeSvg(big)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('too-large')
  })

  it('rejects non-SVG input with error "not-svg"', () => {
    const result = sanitizeSvg('<html><body>nope</body></html>')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('not-svg')
  })

  it('rejects empty input', () => {
    const result = sanitizeSvg('   \n  ')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('empty')
  })

  it('accepts a tiny valid SVG', () => {
    const valid = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>'
    const result = sanitizeSvg(valid)
    expect(result.ok).toBe(true)
    expect(result.svg).toContain('<circle')
  })
})

describe('useCustomShapes', () => {
  beforeEach(() => {
    useCustomShapes.setState({ shapes: [] })
    localStorage.clear()
  })

  it('addShape returns the new shape and appends to state', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
    const shape = useCustomShapes.getState().addShape('Desk Icon', svg)
    expect(shape).not.toBeNull()
    expect(shape!.id).toBeTruthy()
    expect(shape!.name).toBe('Desk Icon')
    expect(useCustomShapes.getState().shapes).toHaveLength(1)
  })

  it('removeShape removes by id', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
    const a = useCustomShapes.getState().addShape('A', svg)!
    useCustomShapes.getState().addShape('B', svg)
    useCustomShapes.getState().removeShape(a.id)
    const remaining = useCustomShapes.getState().shapes
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.name).toBe('B')
  })

  it('addShape returns null when cap is hit', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
    for (let i = 0; i < 25; i++) {
      expect(useCustomShapes.getState().addShape(`S${i}`, svg)).not.toBeNull()
    }
    expect(useCustomShapes.getState().addShape('overflow', svg)).toBeNull()
    expect(useCustomShapes.getState().shapes).toHaveLength(25)
  })
})
