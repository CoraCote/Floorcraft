import { useEffect, useMemo, useRef, useState } from 'react'
import type { HelpSectionMeta } from './helpSections'

interface Props {
  open: boolean
  onClose: () => void
  sections: HelpSectionMeta[]
}

/**
 * Public wrapper — unmounts + remounts the inner palette on each open/
 * close cycle so its local state (query, active index) is fresh every
 * time without needing a set-state-inside-effect reset. Keeps the
 * linter happy and the behavior simple.
 */
export function HelpSearchPalette({ open, onClose, sections }: Props) {
  if (!open) return null
  return <HelpSearchPaletteInner onClose={onClose} sections={sections} />
}

function HelpSearchPaletteInner({
  onClose,
  sections,
}: {
  onClose: () => void
  sections: HelpSectionMeta[]
}) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sections
    return sections.filter((s) => s.title.toLowerCase().includes(q))
  }, [query, sections])

  // Focus the input on first mount. `autoFocus` works in most browsers
  // but a manual focus is more reliable when the palette mounts inside
  // a fixed-positioned overlay.
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  // Clamp the active index so it never points past the filtered list.
  // Done inline during render (not in an effect) so the first frame
  // after a filter change is already correct and the linter stays
  // happy with no set-state-in-effect.
  const clampedIdx = Math.min(activeIdx, Math.max(0, filtered.length - 1))

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = filtered[clampedIdx]
      if (pick) jumpTo(pick.id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  function jumpTo(id: string) {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/30"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg mx-4 bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Search help sections"
        aria-modal="true"
      >
        <div className="border-b border-gray-100 px-3">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search help sections…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIdx(0)
            }}
            onKeyDown={handleKeyDown}
            className="w-full py-3 text-base outline-none placeholder:text-gray-400"
            aria-label="Search help sections"
          />
        </div>
        <ul className="max-h-80 overflow-y-auto py-1" role="listbox">
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-500">No matching sections.</li>
          ) : (
            filtered.map((s, i) => (
              <li
                key={s.id}
                role="option"
                aria-selected={i === clampedIdx}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => jumpTo(s.id)}
                className={`px-4 py-2 text-sm cursor-pointer ${
                  i === clampedIdx ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {s.title}
              </li>
            ))
          )}
        </ul>
        <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-400 flex items-center gap-3">
          <span>
            <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-600">↑</kbd>{' '}
            <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-600">↓</kbd>{' '}
            navigate
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-600">Enter</kbd>{' '}
            jump
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-600">Esc</kbd>{' '}
            close
          </span>
        </div>
      </div>
    </div>
  )
}
