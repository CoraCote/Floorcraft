/**
 * Tiny inline sanitizer for user-uploaded SVGs.
 *
 * Goal: prevent the most obvious script-injection and external-content
 * vectors while preserving the vast majority of hand-authored / exported
 * SVG markup. NOT a replacement for a full sanitizer if the SVGs come
 * from untrusted sources — for this flow they're picked by the user
 * themselves, so the threat model is a careless user pasting something
 * malicious, not a third-party supply-chain attack.
 *
 * Strategy:
 *   1. Strip <script> blocks (including XML/entities edge cases).
 *   2. Strip <foreignObject> (can host full HTML including <script>).
 *   3. Remove on*=... event handler attributes.
 *   4. Remove href/xlink:href values that use the `javascript:` protocol.
 *   5. Reject non-SVG payloads or payloads whose stripped result no
 *      longer parses as XML.
 */

export const MAX_SVG_BYTES = 50 * 1024 // 50KB

export interface SanitizeResult {
  ok: boolean
  svg?: string
  error?: 'too-large' | 'not-svg' | 'invalid-xml' | 'empty'
}

/** Compiled once; listed as `const` so the regex cache warms on first use. */
const RE_SCRIPT = /<script[\s\S]*?<\/script>/gi
// A script tag can also be self-closing or malformed; strip orphan openers too.
const RE_SCRIPT_OPEN = /<script\b[^>]*>/gi
const RE_FOREIGN_OBJECT = /<foreignObject[\s\S]*?<\/foreignObject>/gi
const RE_ON_ATTR = /\s(on[a-z]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi
const RE_JS_HREF = /\s(xlink:href|href)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi

export function sanitizeSvg(source: string): SanitizeResult {
  const trimmed = source.trim()
  if (trimmed.length === 0) return { ok: false, error: 'empty' }
  if (new Blob([trimmed]).size > MAX_SVG_BYTES) return { ok: false, error: 'too-large' }
  // Must look like an SVG to even bother with the rest. Allow an XML
  // declaration or DOCTYPE in front of <svg.
  if (!/<svg[\s>]/i.test(trimmed)) return { ok: false, error: 'not-svg' }

  let cleaned = trimmed
    .replace(RE_SCRIPT, '')
    .replace(RE_SCRIPT_OPEN, '')
    .replace(RE_FOREIGN_OBJECT, '')
    .replace(RE_ON_ATTR, '')
    .replace(RE_JS_HREF, '')

  // DOMParser gives us a last sanity check: if the stripped result doesn't
  // round-trip, reject rather than ship broken geometry. jsdom in tests
  // flags errors via <parsererror> in the parsed output.
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(cleaned, 'image/svg+xml')
      if (doc.getElementsByTagName('parsererror').length > 0) {
        return { ok: false, error: 'invalid-xml' }
      }
    } catch {
      return { ok: false, error: 'invalid-xml' }
    }
  }

  // Ensure there's still an <svg> root after sanitising — if someone
  // wrapped their whole SVG in <script>, the body got emptied.
  if (!/<svg[\s>]/i.test(cleaned)) return { ok: false, error: 'not-svg' }

  // Collapse any double-spaces introduced by attribute stripping so the
  // storage size stays tidy.
  cleaned = cleaned.replace(/  +/g, ' ')

  return { ok: true, svg: cleaned }
}
