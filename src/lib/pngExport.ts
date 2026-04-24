import type Konva from 'konva'
import {
  layoutChrome,
  CHROME_MARGINS,
  type ChromeLayout,
  type ExportChromeContext,
} from './exportChrome'

/**
 * PNG floor-plan export — a marketing-screenshot snapshot of the Konva
 * stage triggered by a "Download PNG" button. Complements the wayfinding
 * PDF export for the "Slack share / email attachment / wiki asset" use
 * case where a PDF is overkill and a picture is what users actually paste.
 *
 * The default output now includes export chrome (title, timestamp, scale
 * bar, legend, watermark) so the bytes have enough context to stand on
 * their own when dropped into a deck. Callers that need raw canvas bytes
 * can opt out via `withChrome: false`.
 */

export interface ExportPngOptions {
  /** Filename for the download, including the `.png` extension. */
  filename: string
  /**
   * Device-pixel multiplier passed through to `stage.toDataURL`. 2 by
   * default so retina screens don't get a blurry half-res snapshot when
   * the PNG is pasted into a doc.
   */
  pixelRatio?: number
  /**
   * Whether to wrap the canvas in the export chrome (title block, scale
   * bar, legend, watermark, timestamp). Defaults to `true` — the modern,
   * shareable look. Pass `false` for the raw, unframed snapshot.
   */
  withChrome?: boolean
  /**
   * Required when `withChrome` is `true`. Provides the title text, scale
   * data, neighborhood list, and timestamp the chrome layout draws.
   */
  chrome?: ExportChromeContext
}

/**
 * Rasterise the given stage to a PNG and trigger a browser download.
 *
 * Returns a promise so the chrome path (which decodes the canvas data URL
 * into an `Image` to composite it onto a wrapper canvas) can complete its
 * async work before resolving. The `withChrome: false` path is sync under
 * the hood but still returns a promise for a uniform call site.
 */
export async function exportFloorAsPng(
  stage: Konva.Stage,
  opts: ExportPngOptions,
): Promise<void> {
  const { filename, pixelRatio = 2, withChrome = true, chrome } = opts

  const dataUrl = stage.toDataURL({ pixelRatio, mimeType: 'image/png' })

  let finalDataUrl = dataUrl
  if (withChrome && chrome) {
    finalDataUrl = await composeWithChrome(dataUrl, chrome, pixelRatio)
  }

  // `toDataURL` is safer than `toBlob` here — no Blob round-trip, no
  // revokeObjectURL bookkeeping, and the resulting anchor-href download
  // behaves identically across browsers.
  const link = document.createElement('a')
  link.href = finalDataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Decode the canvas data URL, build a chrome-wrapped offscreen canvas at
 * `pixelRatio` resolution, draw the chrome decorations + the original
 * canvas image, and return the new PNG data URL.
 *
 * Layout coordinates are computed at "logical" (CSS) pixels; the canvas
 * 2D context is scaled by `pixelRatio` so the rendered text/lines stay
 * crisp on retina displays without us recomputing every coordinate.
 */
async function composeWithChrome(
  canvasDataUrl: string,
  chrome: ExportChromeContext,
  pixelRatio: number,
): Promise<string> {
  const layout = layoutChrome(chrome)

  // Decode the existing canvas snapshot. In jsdom there is no decoder, so
  // we early-return the raw URL — the chrome compose path is a visual
  // enhancement, not a correctness boundary, and the unit tests for the
  // chrome layout already cover the math.
  const img = await loadImage(canvasDataUrl).catch(() => null)
  if (!img) return canvasDataUrl

  const w = layout.outer.width * pixelRatio
  const h = layout.outer.height * pixelRatio
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) return canvasDataUrl

  // Scale once so all draw calls below can use logical (un-multiplied)
  // coordinates straight from `layout`.
  ctx.scale(pixelRatio, pixelRatio)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, layout.outer.width, layout.outer.height)

  drawChrome(ctx, layout)

  // Embed the original canvas snapshot at the layout's reserved slot.
  ctx.drawImage(
    img,
    layout.canvas.x,
    layout.canvas.y,
    layout.canvas.width,
    layout.canvas.height,
  )

  return out.toDataURL('image/png')
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    let settled = false
    img.onload = () => {
      settled = true
      resolve(img)
    }
    img.onerror = () => {
      settled = true
      reject(new Error('image decode failed'))
    }
    img.src = src
    // Headless test envs (jsdom) neither fire `onload` nor `onerror` for
    // data URLs — they just sit forever. Bound the wait so the export
    // never deadlocks; on bail we fall back to the raw URL upstream.
    setTimeout(() => {
      if (!settled) reject(new Error('image decode timed out'))
    }, 250)
  })
}

/**
 * Draw the chrome decorations (top strip, title band, bottom band, scale
 * bar, legend, watermark) onto the given 2D context using the layout
 * geometry. The original canvas image is composited by the caller — this
 * function is purely the surrounding chrome.
 */
function drawChrome(ctx: CanvasRenderingContext2D, layout: ChromeLayout) {
  const W = layout.outer.width

  // ───── Top strip (gray-100) ─────
  ctx.fillStyle = '#f3f4f6'
  ctx.fillRect(0, layout.topStrip.y, W, layout.topStrip.height)

  // Floorcraft mark: rounded indigo rect with a white "F" centered.
  const markSize = 16
  const markX = CHROME_MARGINS.side
  const markY = layout.topStrip.y + (layout.topStrip.height - markSize) / 2
  drawRoundedRect(ctx, markX, markY, markSize, markSize, 4, '#4f46e5')
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 11px system-ui, -apple-system, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText('F', markX + markSize / 2, markY + markSize / 2 + 0.5)

  // Wordmark
  ctx.fillStyle = '#374151'
  ctx.font = '12px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(
    'Floorcraft',
    markX + markSize + 8,
    layout.topStrip.y + layout.topStrip.height / 2,
  )

  // Timestamp on the right
  ctx.fillStyle = '#6b7280'
  ctx.font = '12px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(
    layout.timestampText,
    W - CHROME_MARGINS.side,
    layout.topStrip.y + layout.topStrip.height / 2,
  )

  // ───── Title band (white) ─────
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, layout.titleBand.y, W, layout.titleBand.height)

  ctx.fillStyle = '#111827'
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    layout.titleText,
    CHROME_MARGINS.side,
    layout.titleBand.y + layout.titleBand.height / 2,
  )

  ctx.fillStyle = '#6b7280'
  ctx.font = '14px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(
    layout.subtitleText,
    W - CHROME_MARGINS.side,
    layout.titleBand.y + layout.titleBand.height / 2,
  )

  // ───── Bottom band ─────
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, layout.bottomBand.y, W, layout.bottomBand.height)

  // Top divider line above the bottom band, mirroring the gray-100 strip
  // at the top so the chrome reads as a frame.
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, layout.bottomBand.y + 0.5)
  ctx.lineTo(W, layout.bottomBand.y + 0.5)
  ctx.stroke()

  // Scale bar
  if (layout.scaleBar) {
    const sb = layout.scaleBar
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(sb.x, sb.y)
    ctx.lineTo(sb.x + sb.pxLength, sb.y)
    ctx.stroke()
    // End ticks
    ctx.beginPath()
    ctx.moveTo(sb.x, sb.y - 4)
    ctx.lineTo(sb.x, sb.y + 4)
    ctx.moveTo(sb.x + sb.pxLength, sb.y - 4)
    ctx.lineTo(sb.x + sb.pxLength, sb.y + 4)
    ctx.stroke()

    ctx.fillStyle = '#374151'
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(`Scale: ${sb.label}`, sb.x, sb.y + 8)
  }

  // Legend (right-aligned, wrap to a second row when needed)
  if (layout.legend) {
    drawLegend(ctx, layout)
  }

  // Watermark
  ctx.fillStyle = '#9ca3af'
  ctx.font = '10px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(layout.watermark.text, layout.watermark.x, layout.watermark.y)

  // Reset text alignment so subsequent draws (the canvas image) aren't
  // affected by our settings.
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

/**
 * Layout + draw the neighborhood legend right-aligned within the bottom
 * band. We wrap into a second row when the cumulative width exceeds the
 * available space (everything to the right of the scale bar).
 */
function drawLegend(ctx: CanvasRenderingContext2D, layout: ChromeLayout) {
  if (!layout.legend) return
  const items = layout.legend.items
  const rightX = layout.legend.x
  const baseY = layout.legend.y
  const dotR = 5
  const itemGap = 16
  const rowHeight = 18

  ctx.font = '11px system-ui, -apple-system, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  // Measure each item: dot + 6px gap + text width.
  const measured = items.map((it) => {
    const w = dotR * 2 + 6 + ctx.measureText(it.name).width
    return { ...it, width: w }
  })

  // Pack right-to-left within `availableWidth`; spill onto a second row.
  const scaleBarRight = layout.scaleBar
    ? layout.scaleBar.x + layout.scaleBar.pxLength + 40
    : CHROME_MARGINS.side + 40
  const availableWidth = rightX - scaleBarRight
  const rows: Array<typeof measured> = [[]]
  let rowWidth = 0
  for (const m of measured) {
    const w = m.width + itemGap
    if (rowWidth + w > availableWidth && rows[rows.length - 1].length > 0) {
      rows.push([])
      rowWidth = 0
    }
    rows[rows.length - 1].push(m)
    rowWidth += w
  }

  rows.forEach((row, i) => {
    let cursorX = rightX
    const y = baseY + i * rowHeight
    // Right-pack: render last item first.
    for (let j = row.length - 1; j >= 0; j--) {
      const m = row[j]
      const textWidth = ctx.measureText(m.name).width
      const textX = cursorX - textWidth
      const dotCx = textX - 6 - dotR
      ctx.fillStyle = '#374151'
      ctx.fillText(m.name, textX, y)
      ctx.fillStyle = m.color
      ctx.beginPath()
      ctx.arc(dotCx, y, dotR, 0, Math.PI * 2)
      ctx.fill()
      cursorX = dotCx - dotR - itemGap
    }
  })
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
) {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
}
