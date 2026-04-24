/**
 * Helpers for composing and parsing the D6 view-only share URL. The route
 * is `/share/:officeSlug?t=:token` — we use a query param rather than a
 * path segment for the token so it stays out of server access logs that
 * don't strip query strings (many CDNs and reverse proxies drop queries
 * but keep paths), and because the slug alone is enough routing info.
 *
 * `?embed=1` is the iframe-embed flag (Wave 7C). `ShareView` reads it to
 * strip the header chrome down to a pure canvas + watermark — the goal is
 * a JSON-Crack-style snippet you can drop into Notion / Confluence / a
 * dashboard without it dragging the rest of the Floorcraft chrome along.
 */

/**
 * Path-only share URL (relative). Backwards-compatible with pre-7C
 * call sites: `buildShareUrl(slug, token)` keeps returning
 * `/share/<slug>?t=<token>`. Newer callers should pass an options object
 * to opt into `embed=1` and / or an absolute URL with an explicit origin.
 */
export function buildShareUrl(officeSlug: string, token: string): string
export function buildShareUrl(opts: BuildShareUrlOptions): string
export function buildShareUrl(
  slugOrOpts: string | BuildShareUrlOptions,
  token?: string,
): string {
  if (typeof slugOrOpts === 'string') {
    const slug = encodeURIComponent(slugOrOpts)
    const t = encodeURIComponent(token ?? '')
    return `/share/${slug}?t=${t}`
  }
  return buildShareUrlFromOptions(slugOrOpts)
}

export interface BuildShareUrlOptions {
  /**
   * Absolute origin (e.g. `https://app.floorcraft.app`). Optional — when
   * omitted we emit a relative path. Tests and snippet builders generally
   * pass an explicit origin; in-app copy buttons compose with
   * `window.location.origin`.
   */
  origin?: string
  officeSlug: string
  token: string
  /** When true, appends `embed=1` so `ShareView` strips header chrome. */
  embed?: boolean
}

function buildShareUrlFromOptions(opts: BuildShareUrlOptions): string {
  const slug = encodeURIComponent(opts.officeSlug)
  const path = `/share/${slug}`
  // Route the query string through `URLSearchParams` so the token + embed
  // flag share one canonical encoding path. The token is fed in raw so
  // round-tripping matches `parseShareToken` (which calls `.get('t')`).
  const params = new URLSearchParams()
  params.set('t', opts.token)
  if (opts.embed) params.set('embed', '1')
  const query = params.toString()
  if (opts.origin) {
    const u = new URL(path, opts.origin)
    u.search = query
    return u.toString()
  }
  return `${path}?${query}`
}

/**
 * Build the ready-to-paste `<iframe>` HTML snippet shown in the
 * ShareLinkDialog "Embed" section. Defaults to a 600px tall, full-width
 * iframe with rounded corners + a 1px gray border so it drops into a
 * doc page without further CSS. The src always carries `embed=1`.
 */
export function buildEmbedSnippet(opts: {
  origin: string
  officeSlug: string
  token: string
  height?: number
}): string {
  const src = buildShareUrl({
    origin: opts.origin,
    officeSlug: opts.officeSlug,
    token: opts.token,
    embed: true,
  })
  const height = opts.height ?? 600
  return `<iframe
  src="${src}"
  width="100%"
  height="${height}"
  frameborder="0"
  style="border-radius: 8px; border: 1px solid #e5e7eb"
></iframe>`
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

/**
 * Returns true when the URL's query string carries `embed=1`. ShareView
 * uses this to flip into the chrome-less layout (no header, no
 * "Open in Floorcraft" link) suitable for an iframe embed.
 */
export function isEmbedMode(searchParams: URLSearchParams): boolean {
  return searchParams.get('embed') === '1'
}
