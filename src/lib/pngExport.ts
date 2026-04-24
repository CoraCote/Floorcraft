import type Konva from 'konva'

/**
 * PNG floor-plan export — a raw raster snapshot of the Konva stage
 * triggered by a "Download PNG" button. Complements the wayfinding PDF
 * export for the "Slack share / email attachment / wiki asset" use case
 * where a PDF is overkill and a picture is what users actually paste.
 *
 * Intentionally minimal: no legend, no title bar, no margins. The MVP is
 * the bytes the canvas already draws. If we ever want a chrome'd variant
 * we'll add a separate function so this one stays cheap and predictable.
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
}

/**
 * Rasterise the given stage to a PNG and trigger a browser download.
 *
 * Returns a promise for symmetry with future async variants (e.g. if we
 * ever need to composite a title bar via `createImageBitmap` which is
 * async-only). Today the body is sync — callers can safely `await` or
 * fire-and-forget.
 */
export async function exportFloorAsPng(
  stage: Konva.Stage,
  opts: ExportPngOptions,
): Promise<void> {
  const { filename, pixelRatio = 2 } = opts

  // `toDataURL` is safer than `toBlob` here — no Blob round-trip, no
  // revokeObjectURL bookkeeping, and the resulting anchor-href download
  // behaves identically across browsers.
  const dataUrl = stage.toDataURL({ pixelRatio, mimeType: 'image/png' })

  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
