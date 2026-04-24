import { useId, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  title: string
  defaultOpen?: boolean
  storageKey?: string
  trailing?: ReactNode
  children: ReactNode
}

export function CollapsibleSection({ title, defaultOpen = true, storageKey, trailing, children }: Props) {
  // Remember open/closed per section across reloads when a storageKey is supplied.
  const [open, setOpen] = useState<boolean>(() => {
    if (!storageKey) return defaultOpen
    try {
      const v = localStorage.getItem(`sidebar-section:${storageKey}`)
      if (v === '1') return true
      if (v === '0') return false
    } catch {
      /* storage can throw in sandboxed iframes; fall back */
    }
    return defaultOpen
  })
  const toggle = () => {
    setOpen((prev) => {
      const next = !prev
      if (storageKey) {
        try { localStorage.setItem(`sidebar-section:${storageKey}`, next ? '1' : '0') } catch {
          /* storage can throw in sandboxed iframes; ignore */
        }
      }
      return next
    })
  }
  // Stable id pair so the header button and panel can reference each
  // other via aria-controls / aria-labelledby without any cross-instance
  // id collisions.
  const idBase = useId()
  const buttonId = `${idBase}-header`
  const panelId = `${idBase}-panel`
  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <button
        id={buttonId}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-600 hover:bg-gray-50"
      >
        {open
          ? <ChevronDown size={12} aria-hidden="true" />
          : <ChevronRight size={12} aria-hidden="true" />}
        <span className="flex-1 text-left">{title}</span>
        {trailing}
      </button>
      {open && (
        <div id={panelId} role="region" aria-labelledby={buttonId}>
          {children}
        </div>
      )}
    </div>
  )
}
