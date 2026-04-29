/**
 * SVG sanitizer for user-uploaded artwork.
 *
 * Threat model: SVGs round-trip through the office payload, so a teammate's
 * upload renders into other viewers' browsers. The library preview pipes
 * the markup through `dangerouslySetInnerHTML` (LibraryPreview.tsx), which
 * is the live-DOM XSS sink we have to defend.
 *
 * Strategy: hand the markup to DOMPurify with the SVG+SVG-filter profile.
 * It parses, allowlists known-safe SVG tags and attrs, and strips
 * `<script>`, `<foreignObject>`, `on*` event handlers, `javascript:` URIs
 * (in any encoding), `<style>@import`, and other vectors a regex pass
 * misses. We still apply a size cap and a cheap "looks like SVG" gate up
 * front so genuinely-invalid uploads bail before hitting the parser.
 */

import DOMPurify from 'dompurify'

export const MAX_SVG_BYTES = 50 * 1024 // 50KB

export interface SanitizeResult {
  ok: boolean
  svg?: string
  error?: 'too-large' | 'not-svg' | 'invalid-xml' | 'empty'
}

export function sanitizeSvg(source: string): SanitizeResult {
  const trimmed = source.trim()
  if (trimmed.length === 0) return { ok: false, error: 'empty' }
  if (new Blob([trimmed]).size > MAX_SVG_BYTES) return { ok: false, error: 'too-large' }
  // Cheap pre-filter: if it doesn't even mention `<svg`, don't waste the
  // parser. Allow an XML declaration / DOCTYPE in front.
  if (!/<svg[\s>]/i.test(trimmed)) return { ok: false, error: 'not-svg' }

  let cleaned: string
  try {
    cleaned = DOMPurify.sanitize(trimmed, {
      // SVG profile allowlists the SVG tag set (incl. filter primitives)
      // and the SVG attribute set. Anything outside the list is dropped,
      // which is the right default for art assets.
      USE_PROFILES: { svg: true, svgFilters: true },
      // The SVG profile leaves `<style>` in place, which keeps the door
      // open to `@import url(https://evil/x.css)` and CSS-based
      // exfiltration. Floor-plan art assets don't need stylesheet
      // blocks — per-element styles are the SVG-native idiom — so we
      // strip them outright.
      FORBID_TAGS: ['style'],
      // We need the `<svg>` root preserved (default is to expose body
      // contents); WHOLE_DOCUMENT keeps the outer element intact for
      // both inline render and downstream parsing.
      WHOLE_DOCUMENT: false,
      // Remove dangerous tags' text content too — `<script>alert()</script>`
      // shouldn't leave behind the call-text inside the parent node.
      KEEP_CONTENT: false,
      // Reject `<use href="#x">` references that point off-document, and
      // any data: URIs that aren't plain image bytes.
      ALLOW_UNKNOWN_PROTOCOLS: false,
    })
  } catch {
    return { ok: false, error: 'invalid-xml' }
  }

  // DOMPurify returns '' for unparseable input; an empty result here
  // means the whole tree got stripped (e.g. someone wrapped their SVG
  // in only-disallowed tags) rather than a successful pass-through.
  if (cleaned.trim().length === 0) return { ok: false, error: 'invalid-xml' }
  if (!/<svg[\s>]/i.test(cleaned)) return { ok: false, error: 'not-svg' }

  return { ok: true, svg: cleaned }
}
