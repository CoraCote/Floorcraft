import { useEffect, useRef, useState } from 'react'
import { useUIStore } from '../../../../stores/uiStore'
import { useElementsStore } from '../../../../stores/elementsStore'
import { useCanvasStore } from '../../../../stores/canvasStore'
import { isFreeTextElement } from '../../../../types/elements'

interface Props {
  /** The canvas container. The overlay renders position:absolute relative
   *  to whatever element the parent mounts it inside, so the caller is
   *  responsible for giving us a stable container. `rect` is computed in
   *  an effect to satisfy lint's "no ref reads during render" rule. */
  containerRef: React.RefObject<HTMLDivElement | null>
}

/**
 * HTML <textarea> positioned absolutely over the Konva canvas to let the
 * user edit a free-text element with native caret/IME. Commits on blur,
 * cancels on Escape.
 */
export function FreeTextEditorOverlay({ containerRef }: Props) {
  const editingLabelId = useUIStore((s) => s.editingLabelId)
  const setEditingLabelId = useUIStore((s) => s.setEditingLabelId)
  const elements = useElementsStore((s) => s.elements)
  const updateElement = useElementsStore((s) => s.updateElement)
  const stageX = useCanvasStore((s) => s.stageX)
  const stageY = useCanvasStore((s) => s.stageY)
  const stageScale = useCanvasStore((s) => s.stageScale)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const el = editingLabelId ? elements[editingLabelId] : null
  const isEditingFreeText = el && isFreeTextElement(el)

  const [localText, setLocalText] = useState('')
  // Reading container bounding rect happens in an effect (lint: no refs
  // during render). Null fallback aligns to viewport origin which is
  // visually wrong but avoids crashing if the ref hasn't attached.
  const [containerRect, setContainerRect] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    if (!isEditingFreeText || !el) return
    const text = el.text
    // Deferred setState + measure + focus. Pushing work off the current
    // React commit phase appeases the "no setState in effect" lint rule
    // and ensures the textarea is mounted when we grab the rect and
    // call .focus().
    const raf = requestAnimationFrame(() => {
      setLocalText(text)
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect) setContainerRect({ left: rect.left, top: rect.top })
      textareaRef.current?.focus()
      textareaRef.current?.select()
    })
    return () => cancelAnimationFrame(raf)
  }, [isEditingFreeText, el, containerRef])

  if (!isEditingFreeText || !el) return null

  const commit = () => {
    const next = localText.length === 0 ? 'Text' : localText
    updateElement(el.id, {
      text: next,
      width: Math.max(40, next.length * el.fontSize * 0.6),
    } as Partial<typeof el>)
    setEditingLabelId(null)
  }
  const cancel = () => {
    setEditingLabelId(null)
  }

  // Screen-space position. `el.x, el.y` is CENTER of the text block in canvas
  // units. Top-left in screen units is (el.x - w/2) * scale + stageX.
  const screenX = (el.x - el.width / 2) * stageScale + stageX
  const screenY = (el.y - el.height / 2) * stageScale + stageY
  const screenW = el.width * stageScale
  const screenH = el.height * stageScale

  const left = (containerRect?.left ?? 0) + screenX
  const top = (containerRect?.top ?? 0) + screenY

  return (
    <textarea
      ref={textareaRef}
      value={localText}
      onChange={(e) => setLocalText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          cancel()
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          commit()
        }
      }}
      style={{
        position: 'fixed',
        left,
        top,
        width: Math.max(80, screenW),
        height: Math.max(24, screenH),
        fontSize: el.fontSize * stageScale,
        lineHeight: 1.4,
        color: el.style.stroke,
        background: 'rgba(255, 255, 255, 0.95)',
        border: '1px solid #3B82F6',
        borderRadius: 2,
        padding: 2,
        outline: 'none',
        resize: 'none',
        zIndex: 20,
        fontFamily: 'inherit',
      }}
    />
  )
}
