import { toPng } from 'html-to-image'
import { getNodesBounds, getViewportForBounds, type Node as RFNode } from '@xyflow/react'

/**
 * M6.4 — Capture the network-topology canvas as a PNG data URL for
 * embedding in the PDF export.
 *
 * # Why two passes
 *
 * The user might be zoomed in or panned so only part of the diagram
 * is visible on-screen. Capturing the viewport directly would crop
 * the diagram, which is the opposite of what a vendor handoff
 * document needs. Instead we:
 *
 *   1. Compute the bounds of every node (`getNodesBounds`).
 *   2. Build a viewport transform that fits ALL nodes into a target
 *      canvas size (`getViewportForBounds`).
 *   3. Apply that transform to the `.react-flow__viewport` element
 *      and rasterise via `html-to-image`.
 *   4. Restore the original transform so the user's pan/zoom isn't
 *      disturbed.
 *
 * This is the same approach the @xyflow/react documentation gives for
 * "download as image" examples — the docs explicitly call out that
 * `toImage` isn't built into the library yet, so external rasterisers
 * are the recommended path.
 *
 * # Why html-to-image (and not html2canvas)
 *
 * `html-to-image` understands SVG natively, which matters because
 * react-flow renders edges as SVG. `html2canvas` rasterises by
 * walking the DOM and re-painting via canvas APIs — it works for
 * HTML but mishandles arbitrary SVG, in particular dashed strokes
 * and rounded smoothstep paths used by our edge renderer. The
 * dependency footprint is also smaller (~10kB gzipped vs ~45kB).
 *
 * # Failure mode
 *
 * Returns `null` if the topology container can't be found, or if
 * there are zero nodes (nothing to capture). Throws on rasterisation
 * failure so the page can show a "couldn't generate diagram, exporting
 * tables only" toast and fall through to a tables-only PDF.
 */

export interface CapturedTopologyImage {
  /** PNG data URL ready for `doc.addImage`. */
  dataUrl: string
  /** Pixel width of the captured image (for aspect-ratio sizing). */
  width: number
  /** Pixel height of the captured image. */
  height: number
}

interface CaptureOptions {
  /**
   * The DOM element wrapping the react-flow canvas — typically the
   * outermost `.react-flow` div. We `querySelector` from here to find
   * the viewport and pane.
   */
  container: HTMLElement
  /** Current node array, used to compute bounds. */
  nodes: RFNode[]
  /**
   * Output image dimensions. Defaults to 1600x900 — wide enough that
   * fitted at A4 landscape's diagram column (~580pt) the image stays
   * crisp without bloating the PDF past a few hundred KB.
   */
  width?: number
  height?: number
  /** Background fill (matches the canvas card). */
  backgroundColor?: string
}

export async function captureTopologyImage(
  opts: CaptureOptions,
): Promise<CapturedTopologyImage | null> {
  const { container, nodes, width = 1600, height = 900, backgroundColor = '#ffffff' } = opts

  if (!nodes || nodes.length === 0) return null

  const viewport = container.querySelector('.react-flow__viewport') as HTMLElement | null
  if (!viewport) return null

  // Compute the world-space bounds of every node, then the viewport
  // transform that fits them into our target image size with a small
  // padding so labels don't crash into the edges.
  const bounds = getNodesBounds(nodes)
  const transform = getViewportForBounds(bounds, width, height, 0.5, 2, 0.1)

  const previousTransform = viewport.style.transform
  // Apply the fit-bounds transform via inline style. react-flow
  // normally drives the transform via inline style as well, so
  // overwriting it temporarily is safe — restoring it on the way out
  // hands control back to react-flow's controller.
  viewport.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`

  try {
    const dataUrl = await toPng(viewport, {
      backgroundColor,
      width,
      height,
      // 2x pixel ratio keeps small text readable when scaled into the
      // PDF column. Higher than 2 produces images > ~1MB which bloats
      // the PDF beyond what jsPDF can blob in a reasonable time.
      pixelRatio: 2,
      cacheBust: true,
      // react-flow's controls + minimap are decoration on the screen
      // but noise in a printed handoff document. Filter them out so
      // the captured image is just nodes + edges + grid background.
      filter: (node) => {
        if (!(node instanceof Element)) return true
        const cl = node.classList
        if (!cl) return true
        return (
          !cl.contains('react-flow__minimap') &&
          !cl.contains('react-flow__controls') &&
          !cl.contains('react-flow__panel') &&
          !cl.contains('react-flow__attribution')
        )
      },
    })
    return { dataUrl, width, height }
  } finally {
    viewport.style.transform = previousTransform
  }
}
