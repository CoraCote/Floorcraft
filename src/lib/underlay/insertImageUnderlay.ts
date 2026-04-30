import { nanoid } from 'nanoid'
import { useElementsStore } from '../../stores/elementsStore'
import { useUIStore } from '../../stores/uiStore'
import { useToastStore } from '../../stores/toastStore'
import type { BackgroundImageElement } from '../../types/elements'

/**
 * Insert an image file as a `background-image` underlay element on the
 * active floor, centered on (`x`, `y`) in canvas coordinates. The image
 * is read as a `data:` URL and stored inline in the element's
 * `storageUrl` — there is no Storage tier yet, so the rasterized
 * underlay travels with the office payload. Tradeoff documented in
 * the type's JSDoc.
 *
 * The element is locked-by-default and assigned a *negative* zIndex so
 * it always renders behind any drawn-on elements. The user has to
 * unlock it explicitly to resize/reposition; for the trace-over-an-
 * architectural-plan flow that's the right default — accidentally
 * dragging the underlay would re-misalign every wall the user just drew.
 *
 * Width/height come from the image's natural pixel dimensions so the
 * imported image renders at 1:1. The user can resize via the corner
 * handles after unlocking, or via the Properties → Layout numerics.
 *
 * Bails (with a toast) on:
 *   - non-image MIME types
 *   - images > 8 MB raw — base64-encoding inflates by ~33% and the
 *     office payload column has a practical ~20 MB ceiling. Surfacing a
 *     clear "too large" message beats silently writing an unsavable row.
 *   - FileReader errors
 */
export async function insertImageUnderlay(
  file: File,
  x: number,
  y: number,
): Promise<void> {
  if (!file.type.startsWith('image/')) {
    useToastStore.getState().push({
      tone: 'error',
      title: 'Underlay must be an image (PNG, JPG, WEBP).',
    })
    return
  }
  // 8 MB raw → ~10.7 MB after base64. The PostgreSQL JSONB row has no
  // hard size limit but Supabase's wire protocol practically caps a
  // single column write around 20 MB; surfacing an early "too big"
  // message beats a 502 mid-save.
  if (file.size > 8 * 1024 * 1024) {
    useToastStore.getState().push({
      tone: 'error',
      title: 'Underlay too large (max 8 MB). Compress and try again.',
    })
    return
  }

  const dataUrl = await readFileAsDataUrl(file)
  if (!dataUrl) return

  const dims = await loadImageDimensions(dataUrl)
  if (!dims) {
    useToastStore.getState().push({
      tone: 'error',
      title: "Couldn't read that image. Try a different file.",
    })
    return
  }

  // zIndex below 0 puts the underlay below every newly-drawn element.
  // Existing elements never have negative zIndex (they start at 1 via
  // getMaxZIndex+1), so this guarantees the underlay is the bottom-most
  // layer without iterating over the current set to find a "lowest".
  const element: BackgroundImageElement = {
    id: nanoid(),
    type: 'background-image',
    x,
    y,
    width: dims.width,
    height: dims.height,
    rotation: 0,
    locked: true,
    groupId: null,
    zIndex: -1,
    label: file.name.replace(/\.[^/.]+$/, ''),
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 0, opacity: 1 },
    storageUrl: dataUrl,
    originalWidth: dims.width,
    originalHeight: dims.height,
    opacity: 0.5,
  }

  useElementsStore.getState().addElement(element)
  useUIStore.getState().setSelectedIds([element.id])
  useToastStore.getState().push({
    tone: 'info',
    title: 'Underlay added — locked by default. Unlock in Properties to move or resize.',
  })
}

function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      resolve(typeof result === 'string' ? result : null)
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

function loadImageDimensions(
  src: string,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = src
  })
}
