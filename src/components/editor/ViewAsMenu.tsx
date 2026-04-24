import { useEffect, useRef, useState } from 'react'
import { Eye, Check } from 'lucide-react'
import { useProjectStore } from '../../stores/projectStore'
import type { OfficeRole } from '../../lib/offices/permissionsRepository'

/**
 * Owner-only "View as…" impersonation trigger.
 *
 * Self-gated on role: renders null for anyone but `owner`, so non-owners
 * don't even see the affordance. The server-side guard is redundant but
 * deliberate — the store's `setImpersonatedRole` also refuses writes from
 * a non-owner, so both layers have to fail at once for impersonation to
 * leak.
 *
 * `owner` is absent from the role list — previewing "as owner" is the
 * no-op resting state; the exit button in the banner + the "None" option
 * here are the two paths back.
 */
const PREVIEW_ROLES: OfficeRole[] = ['editor', 'hr-editor', 'space-planner', 'viewer']

export function ViewAsMenu() {
  const currentOfficeRole = useProjectStore((s) => s.currentOfficeRole)
  const impersonatedRole = useProjectStore((s) => s.impersonatedRole)
  const setImpersonatedRole = useProjectStore((s) => s.setImpersonatedRole)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (currentOfficeRole !== 'owner') return null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded ${
          impersonatedRole
            ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
            : 'text-gray-600 hover:bg-gray-100'
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Preview the UI as a lower-privileged role"
      >
        <Eye size={14} />
        {impersonatedRole ? `As ${impersonatedRole}` : 'View as…'}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-48 bg-white border rounded shadow z-30 py-1"
        >
          <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-400">
            Preview as role
          </div>
          <button
            role="menuitemradio"
            aria-checked={impersonatedRole === null}
            onClick={() => {
              setImpersonatedRole(null)
              setOpen(false)
            }}
            className="flex items-center justify-between w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            <span>None (owner)</span>
            {impersonatedRole === null && <Check size={14} className="text-blue-600" />}
          </button>
          {PREVIEW_ROLES.map((role) => (
            <button
              key={role}
              role="menuitemradio"
              aria-checked={impersonatedRole === role}
              onClick={() => {
                setImpersonatedRole(role)
                setOpen(false)
              }}
              className="flex items-center justify-between w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              <span>{role}</span>
              {impersonatedRole === role && <Check size={14} className="text-blue-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
