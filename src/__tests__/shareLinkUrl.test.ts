import { describe, it, expect } from 'vitest'
import {
  buildShareUrl,
  buildEmbedSnippet,
  parseShareToken,
  isEmbedMode,
} from '../lib/shareLinkUrl'

describe('buildShareUrl (legacy 2-arg form)', () => {
  it('encodes the slug and emits a relative `/share/<slug>?t=<token>` path', () => {
    expect(buildShareUrl('hq', 'token-abc')).toBe('/share/hq?t=token-abc')
  })

  it('percent-encodes a slug containing spaces or slashes', () => {
    // The legacy form has historically passed slugs through
    // `encodeURIComponent`; preserve that contract so router pattern
    // `/share/:officeSlug` still matches a single path segment.
    expect(buildShareUrl('san francisco/2', 'tok')).toBe(
      '/share/san%20francisco%2F2?t=tok',
    )
  })
})

describe('buildShareUrl (options form)', () => {
  it('returns a relative URL when no origin is supplied', () => {
    const url = buildShareUrl({ officeSlug: 'hq', token: 'abc' })
    expect(url).toBe('/share/hq?t=abc')
  })

  it('appends `embed=1` when the embed flag is set', () => {
    const url = buildShareUrl({ officeSlug: 'hq', token: 'abc', embed: true })
    expect(url).toContain('t=abc')
    expect(url).toContain('embed=1')
  })

  it('omits embed=1 when the flag is false / undefined', () => {
    expect(buildShareUrl({ officeSlug: 'hq', token: 'abc' })).not.toContain(
      'embed=',
    )
    expect(
      buildShareUrl({ officeSlug: 'hq', token: 'abc', embed: false }),
    ).not.toContain('embed=')
  })

  it('emits an absolute URL with the supplied origin', () => {
    const url = buildShareUrl({
      origin: 'https://app.floorcraft.app',
      officeSlug: 'hq',
      token: 'abc',
      embed: true,
    })
    expect(url).toBe('https://app.floorcraft.app/share/hq?t=abc&embed=1')
  })

  it('round-trips the token via parseShareToken', () => {
    const token = 'a-b_c.123~tilde'
    const url = buildShareUrl({ officeSlug: 'hq', token })
    const search = new URLSearchParams(url.split('?')[1])
    expect(parseShareToken(search)).toBe(token)
  })
})

describe('buildEmbedSnippet', () => {
  it('produces an iframe HTML string with the embed=1 src', () => {
    const html = buildEmbedSnippet({
      origin: 'https://app.floorcraft.app',
      officeSlug: 'hq',
      token: 'abc',
    })
    expect(html).toContain('<iframe')
    expect(html).toContain('</iframe>')
    expect(html).toContain('https://app.floorcraft.app/share/hq?t=abc&embed=1')
    // Default height is 600px; absent users assume the snippet is "tall
    // enough", so the default has to ship in the string.
    expect(html).toContain('height="600"')
    expect(html).toContain('width="100%"')
  })

  it('honours a custom height', () => {
    const html = buildEmbedSnippet({
      origin: 'https://app.floorcraft.app',
      officeSlug: 'hq',
      token: 'abc',
      height: 800,
    })
    expect(html).toContain('height="800"')
  })

  it('renders a data-url-safe encoded slug', () => {
    const html = buildEmbedSnippet({
      origin: 'https://app.floorcraft.app',
      officeSlug: 'san francisco',
      token: 'abc',
    })
    expect(html).toContain('san%20francisco')
  })
})

describe('parseShareToken', () => {
  it('returns null for missing or empty `t` param', () => {
    expect(parseShareToken(new URLSearchParams(''))).toBeNull()
    expect(parseShareToken(new URLSearchParams('?t='))).toBeNull()
    expect(parseShareToken(new URLSearchParams('?t=   '))).toBeNull()
  })

  it('returns the trimmed token when present', () => {
    expect(parseShareToken(new URLSearchParams('?t=hello'))).toBe('hello')
  })
})

describe('isEmbedMode', () => {
  it('is true only when embed=1', () => {
    expect(isEmbedMode(new URLSearchParams('?embed=1'))).toBe(true)
    expect(isEmbedMode(new URLSearchParams('?embed=0'))).toBe(false)
    expect(isEmbedMode(new URLSearchParams('?embed=true'))).toBe(false)
    expect(isEmbedMode(new URLSearchParams(''))).toBe(false)
  })
})
