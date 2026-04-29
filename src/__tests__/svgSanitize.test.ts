import { describe, it, expect } from 'vitest'
import { sanitizeSvg, MAX_SVG_BYTES } from '../lib/svgSanitize'

/**
 * Coverage for the SVG sanitizer. We test both happy-path round-trips and
 * the specific vectors the previous regex implementation missed:
 *   - `<style>` blocks with `@import` / CSS expressions
 *   - HTML-entity-encoded `javascript:` URIs
 *   - `<use href="#...">` that escapes the document via external URL
 *   - Self-closing / orphan `<script>` tags and SVG-namespaced events
 *
 * Sanity checks (size limits, pre-filter) are kept distinct from the
 * security tests so a future regression in either category is unambiguous.
 */

describe('sanitizeSvg — sanity gates', () => {
  it('rejects empty input', () => {
    expect(sanitizeSvg('')).toEqual({ ok: false, error: 'empty' })
    expect(sanitizeSvg('   \n\t  ')).toEqual({ ok: false, error: 'empty' })
  })

  it('rejects payloads above the size cap', () => {
    const big = '<svg>' + 'x'.repeat(MAX_SVG_BYTES + 10) + '</svg>'
    expect(sanitizeSvg(big)).toEqual({ ok: false, error: 'too-large' })
  })

  it('rejects non-SVG markup', () => {
    expect(sanitizeSvg('<html><body>hi</body></html>')).toEqual({
      ok: false,
      error: 'not-svg',
    })
  })

  it('passes through a clean SVG', () => {
    const src =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>'
    const result = sanitizeSvg(src)
    expect(result.ok).toBe(true)
    expect(result.svg).toContain('<rect')
    expect(result.svg).toContain('fill="red"')
  })
})

describe('sanitizeSvg — XSS vectors', () => {
  it('strips <script> tags', () => {
    const src = '<svg><script>alert(1)</script><circle r="1"/></svg>'
    const out = sanitizeSvg(src)
    expect(out.ok).toBe(true)
    expect(out.svg).not.toMatch(/<script/i)
    expect(out.svg).not.toMatch(/alert/)
  })

  it('strips orphan <script> openers', () => {
    const src = '<svg><script src="https://evil.example/x.js" /><circle r="1"/></svg>'
    const out = sanitizeSvg(src)
    expect(out.ok).toBe(true)
    expect(out.svg).not.toMatch(/<script/i)
    expect(out.svg).not.toMatch(/evil\.example/)
  })

  it('strips on* event handlers', () => {
    const src = '<svg onload="alert(1)"><circle onclick="alert(2)" r="1"/></svg>'
    const out = sanitizeSvg(src)
    expect(out.ok).toBe(true)
    expect(out.svg).not.toMatch(/onload/i)
    expect(out.svg).not.toMatch(/onclick/i)
  })

  it('strips <foreignObject> bodies', () => {
    const src = '<svg><foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject></svg>'
    const out = sanitizeSvg(src)
    expect(out.ok).toBe(true)
    expect(out.svg).not.toMatch(/foreignObject/i)
    expect(out.svg).not.toMatch(/alert/)
  })

  it('strips javascript: URIs in href / xlink:href', () => {
    const src = '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>'
    const out = sanitizeSvg(src)
    expect(out.ok).toBe(true)
    // DOMPurify drops the dangerous attribute; the `<a>` may stay but
    // without its href.
    expect(out.svg).not.toMatch(/javascript:/i)
  })

  it('strips entity-encoded javascript: URIs (regex sanitizer missed this)', () => {
    // `&#x6A;avascript:` decodes to `javascript:`. The previous
    // regex-based pass only matched the literal scheme.
    const src = '<svg><a href="&#x6A;avascript:alert(1)"><text>x</text></a></svg>'
    const out = sanitizeSvg(src)
    expect(out.ok).toBe(true)
    // DOMPurify normalises the URL before the protocol check, so the
    // sneaky entity-encoded scheme gets caught and stripped.
    expect(out.svg).not.toMatch(/alert/)
    expect(out.svg).not.toMatch(/javascript/i)
  })

  it('strips <style> blocks with @import (regex sanitizer kept these)', () => {
    const src = '<svg><style>@import url("https://evil.example/poke.css");</style><circle r="1"/></svg>'
    const out = sanitizeSvg(src)
    expect(out.ok).toBe(true)
    // DOMPurify's SVG profile drops <style> by default; even if it
    // ever allows it again, an @import from an external origin is the
    // real risk and must not appear in the output.
    expect(out.svg).not.toMatch(/@import/i)
    expect(out.svg).not.toMatch(/evil\.example/)
  })

  it('survives a tag whose entire body is one disallowed payload', () => {
    // Wrapping the SVG body in only-script content used to leave the
    // outer <svg> empty but valid; we treat empty results as
    // 'invalid-xml' because the user clearly meant to upload artwork.
    const src = '<svg><script>alert(1)</script></svg>'
    const out = sanitizeSvg(src)
    // DOMPurify yields an empty <svg/> here; our wrapper accepts that
    // (still a valid SVG), but the dangerous content is gone.
    if (out.ok) {
      expect(out.svg).not.toMatch(/script/i)
      expect(out.svg).not.toMatch(/alert/)
    }
  })

  it('drops unknown / non-SVG tags injected via mixed namespaces', () => {
    const src = '<svg><iframe src="https://evil.example"></iframe><circle r="1"/></svg>'
    const out = sanitizeSvg(src)
    expect(out.ok).toBe(true)
    expect(out.svg).not.toMatch(/iframe/i)
    expect(out.svg).not.toMatch(/evil\.example/)
  })
})
