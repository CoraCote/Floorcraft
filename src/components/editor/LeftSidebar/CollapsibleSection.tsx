import { useState } from 'react'
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
  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-600 hover:bg-gray-50"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="flex-1 text-left">{title}</span>
        {trailing}
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}
