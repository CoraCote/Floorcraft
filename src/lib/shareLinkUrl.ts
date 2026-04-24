/**
 * Helpers for composing and parsing the D6 view-only share URL. The route
 * is `/share/:officeSlug?t=:token` — we use a query param rather than a
 * path segment for the token so it stays out of server access logs that
 * don't strip query strings (many CDNs and reverse proxies drop queries
 * but keep paths), and because the slug alone is enough routing info.
 */

export function buildShareUrl(officeSlug: string, token: string): string {
  const slug = encodeURIComponent(officeSlug)
  const t = encodeURIComponent(token)
  return `/share/${slug}?t=${t}`
}

/**
 * Extract the share token from a URLSearchParams instance. Returns `null`
 * when the `t` param is missing or empty, so callers can treat
 * "no token" as "invalid link" without a separate branch.
 */
export function parseShareToken(searchParams: URLSearchParams): string | null {
  const raw = searchParams.get('t')
  if (!raw) return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}
