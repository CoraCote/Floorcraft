import { useToastStore } from '../../stores/toastStore'
import { usePdfPagePickerStore } from '../../stores/pdfPagePickerStore'
import {
  insertUnderlayFromDataUrl,
  UNDERLAY_MAX_BYTES,
} from './insertImageUnderlay'

/**
 * Render scale used when rasterizing a PDF page to canvas. 1.5× over
 * native is a deliberate quality/size tradeoff:
 *   - 1.0× looks soft on hi-DPI screens (the page renders at PDF's
 *     72 DPI which becomes mushy when zoomed for tracing).
 *   - 2.0× quadruples the byte cost and a typical 24"×36" plan blows
 *     past the 8 MB inline-storage cap.
 *   - 1.5× reads sharp at 100% zoom, stays under the cap on most
 *     architectural plans, and the user can re-import at higher
 *     scale via a future "import PDF…" dialog if they need it.
 */
const PDF_RENDER_SCALE = 1.5

/**
 * Read a PDF file, rasterize the chosen page (page 1 for single-page
 * PDFs; user-selected via the page-picker dialog for multi-page), and
 * insert the result as a background-image underlay. After insert, a
 * PDF underlay is indistinguishable from an image underlay — same
 * locked-by-default, negative-zIndex, 0.5-opacity contract.
 *
 * Multi-page coordination: when a multi-page PDF is dropped we open
 * the `usePdfPagePickerStore` and await the user's pick. The dialog
 * is mounted in `MapView` and reads from that store. A `null` pick
 * means the user cancelled — we bail without inserting and clean up
 * worker-side resources.
 *
 * pdf.js + its worker are dynamic-imported so the main bundle pays
 * nothing for users who never trace.
 */
export async function insertPdfUnderlay(
  file: File,
  x: number,
  y: number,
): Promise<void> {
  if (file.type !== 'application/pdf') {
    useToastStore.getState().push({
      tone: 'error',
      title: 'Underlay must be a PDF or image file.',
    })
    return
  }
  // The raw file size is a coarse proxy here — the rasterized PNG is
  // typically smaller than the source PDF, but a heavily-vector PDF
  // can rasterize larger. We re-check after rasterization too.
  if (file.size > UNDERLAY_MAX_BYTES * 4) {
    useToastStore.getState().push({
      tone: 'error',
      title: 'PDF too large to import. Try exporting just the floor plan page first.',
    })
    return
  }

  let pdfjs: typeof import('pdfjs-dist')
  try {
    pdfjs = await import('pdfjs-dist')
    const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
  } catch (err) {
    console.error('[underlay] pdf.js failed to load', err)
    useToastStore.getState().push({
      tone: 'error',
      title: 'PDF support failed to load. Refresh and try again.',
    })
    return
  }

  let raster: { dataUrl: string; width: number; height: number } | null
  try {
    raster = await rasterizePdfPage(pdfjs, file)
  } catch (err) {
    console.error('[underlay] PDF rasterization failed', err)
    useToastStore.getState().push({
      tone: 'error',
      title: "Couldn't read that PDF. It may be encrypted or malformed.",
    })
    return
  }
  if (!raster) return

  // Approx byte size from the data URL — strip the prefix and apply
  // base64's 4/3 inflation factor to estimate the encoded payload's
  // contribution to the office row.
  const base64Body = raster.dataUrl.slice(raster.dataUrl.indexOf(',') + 1)
  const byteSize = Math.floor(base64Body.length * 0.75)

  insertUnderlayFromDataUrl({
    dataUrl: raster.dataUrl,
    width: raster.width,
    height: raster.height,
    label: file.name.replace(/\.[^/.]+$/, ''),
    byteSize,
    x,
    y,
  })
}

async function rasterizePdfPage(
  pdfjs: typeof import('pdfjs-dist'),
  file: File,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const arrayBuffer = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
  try {
    // Multi-page PDFs prompt the user to pick which page to import;
    // single-page PDFs go straight to page 1. The picker store
    // resolves to a 1-indexed page number, or `null` if the user
    // cancelled — in which case we bail before rasterizing anything.
    let pageIndex = 1
    if (doc.numPages > 1) {
      const picked = await usePdfPagePickerStore.getState().open(doc.numPages)
      if (picked === null) return null
      pageIndex = picked
    }
    const page = await doc.getPage(pageIndex)
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    await page.render({
      canvas,
      canvasContext: ctx,
      viewport,
    }).promise
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
    }
  } finally {
    // Free the PDF document's worker-side resources once we have the
    // raster. Failures here only leak memory inside the worker, so
    // log-and-continue rather than throw.
    void doc.destroy().catch((err) => console.warn('[underlay] doc.destroy', err))
  }
}
