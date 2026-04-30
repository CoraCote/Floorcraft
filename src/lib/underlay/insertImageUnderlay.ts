import { nanoid } from 'nanoid'
import { useElementsStore } from '../../stores/elementsStore'
import { useUIStore } from '../../stores/uiStore'
import { useToastStore } from '../../stores/toastStore'
import type { BackgroundImageElement } from '../../types/elements'

// 8 MB raw → ~10.7 MB after base64. The Postgres JSONB column has no
// hard size limit, but Supabase's wire protocol practically caps a
// single column write around 20 MB; surfacing an early "too big"
// message beats a 502 mid-save.
export const UNDERLAY_MAX_BYTES = 8 * 1024 * 1024

/**
 * Insert a rasterized image (data URL or hosted URL) as a
 * `background-image` underlay element on the active floor, centered
 * on (`x`, `y`). Shared inner helper used by both the image-file path
 * and the PDF-rasterization path; neither caller validates again
 * because all the cross-cutting concerns (size cap, locked-by-default,
 * negative zIndex, default 0.5 opacity, toast on insert) live here.
 *
 * The rasterized image travels inline in the office payload — there's
 * no Storage tier yet. When that lands, the writer can upload + put a
 * real URL in `storageUrl` without touching either caller.
 */
export function insertUnderlayFromDataUrl(args: {
  dataUrl: string
  width: number
  height: number
  label: string
  /** Approximate byte size of the encoded payload, used for the size cap. */
  byteSize: number
  /** Canvas-space center coordinates. */
  x: number
  y: number
}): boolean {
  if (args.byteSize > UNDERLAY_MAX_BYTES) {
    useToastStore.getState().push({
      tone: 'error',
      title: 'Underlay too large (max 8 MB). Compress and try again.',
    })
    return false
  }
  const element: BackgroundImageElement = {
    id: nanoid(),
    type: 'background-image',
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
    rotation: 0,
    locked: true,
    groupId: null,
    // zIndex below 0 puts the underlay below every newly-drawn
    // element. Existing elements never have negative zIndex (they
    // start at 1 via getMaxZIndex+1), so this guarantees the underlay
    // is the bottom-most layer without iterating to find a "lowest".
    zIndex: -1,
    label: args.label,
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 0, opacity: 1 },
    storageUrl: args.dataUrl,
    originalWidth: args.width,
    originalHeight: args.height,
    opacity: 0.5,
  }
  useElementsStore.getState().addElement(element)
  useUIStore.getState().setSelectedIds([element.id])
  useToastStore.getState().push({
    tone: 'info',
    title: 'Underlay added — locked by default. Unlock in Properties to move or resize.',
  })
  return true
}

/**
 * File-side wrapper for the image path. Validates MIME, reads as a
 * data URL, derives natural dimensions, then defers to
 * `insertUnderlayFromDataUrl`. Bails (with a toast) on:
 *   - non-image MIME types
 *   - images > 8 MB raw — see `UNDERLAY_MAX_BYTES`
 *   - FileReader / decode errors
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
  if (file.size > UNDERLAY_MAX_BYTES) {
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

  insertUnderlayFromDataUrl({
    dataUrl,
    width: dims.width,
    height: dims.height,
    label: file.name.replace(/\.[^/.]+$/, ''),
    byteSize: file.size,
    x,
    y,
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
