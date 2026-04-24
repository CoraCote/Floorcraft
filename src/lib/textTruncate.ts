/**
 * Truncate a string so it fits a given width at the given font size.
 * Konva doesn't do CSS-style ellipsis natively; we approximate it with
 * the rough heuristic "1 char ≈ 0.55 * fontSize" so long names don't
 * bleed past the seat bounds. Not pixel-perfect, but load-bearing enough
 * to keep overlap bugs (name colliding with desk-id / adjacent seat)
 * fixed without pulling in a canvas measurement pass on every render.
 *
 * Shared between DeskRenderer + TableRenderer so both seat renderers
 * apply the same truncation policy.
 */
export function truncateToWidth(text: string, widthPx: number, fontSize: number): string {
  if (!text) return ''
  const charPx = fontSize * 0.55
  const maxChars = Math.max(1, Math.floor(widthPx / charPx))
  if (text.length <= maxChars) return text
  if (maxChars <= 1) return text[0] + '…'
  return text.slice(0, Math.max(1, maxChars - 1)) + '…'
}
