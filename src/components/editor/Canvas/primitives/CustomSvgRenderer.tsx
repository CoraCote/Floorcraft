import { useEffect, useState } from 'react'
import { Group, Image as KonvaImage, Rect } from 'react-konva'
import type { CustomSvgElement } from '../../../../types/elements'
import { useUIStore } from '../../../../stores/uiStore'

interface Props {
  element: CustomSvgElement
}

/**
 * Cache of decoded HTMLImageElements keyed by raw svgSource. Decoding an
 * SVG data URI on every render would be wasteful (they're identical for
 * every instance of the same custom-svg library item), so we dedupe here.
 * A Map is fine because svg sources are capped at 50KB × 25 entries, well
 * inside memory budgets.
 */
const IMAGE_CACHE = new Map<string, HTMLImageElement>()

function loadSvgImage(svgSource: string): Promise<HTMLImageElement> {
  const cached = IMAGE_CACHE.get(svgSource)
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return Promise.resolve(cached)
  }
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    // Base64-encode to avoid % / # chars breaking the URI in some browsers.
    try {
      const b64 = typeof window !== 'undefined' && window.btoa
        ? window.btoa(unescape(encodeURIComponent(svgSource)))
        : Buffer.from(svgSource, 'utf-8').toString('base64')
      img.src = `data:image/svg+xml;base64,${b64}`
    } catch (e) {
      reject(e)
      return
    }
    img.onload = () => {
      IMAGE_CACHE.set(svgSource, img)
      resolve(img)
    }
    img.onerror = (e) => reject(e)
  })
}

export function CustomSvgRenderer({ element }: Props) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)
  const [img, setImg] = useState<HTMLImageElement | null>(() => IMAGE_CACHE.get(element.svgSource) ?? null)

  useEffect(() => {
    let cancelled = false
    loadSvgImage(element.svgSource)
      .then((loaded) => {
        if (!cancelled) setImg(loaded)
      })
      .catch(() => {
        /* leave placeholder; user sees outlined rect */
      })
    return () => {
      cancelled = true
    }
  }, [element.svgSource])

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      {img ? (
        <KonvaImage
          image={img}
          x={-element.width / 2}
          y={-element.height / 2}
          width={element.width}
          height={element.height}
          opacity={element.style.opacity}
        />
      ) : (
        <Rect
          x={-element.width / 2}
          y={-element.height / 2}
          width={element.width}
          height={element.height}
          fill={element.style.fill}
          stroke={element.style.stroke}
          dash={[4, 4]}
          strokeWidth={1}
        />
      )}
      {isSelected && (
        <Rect
          x={-element.width / 2}
          y={-element.height / 2}
          width={element.width}
          height={element.height}
          stroke="#3B82F6"
          strokeWidth={1.5}
        />
      )}
    </Group>
  )
}
