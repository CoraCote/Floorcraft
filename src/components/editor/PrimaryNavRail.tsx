import { NavLink, useLocation, useParams } from 'react-router-dom'
import {
  LayoutGrid,
  Users,
  BarChart3,
  Clock,
  Wifi,
  Workflow,
} from 'lucide-react'
import { useCan } from '../../hooks/useCan'

/**
 * Wave 21A — Drafting Studio primary navigation rail.
 *
 * The previous design crammed six view-tabs (Map, Roster, Audit,
 * Reports, Network, Org-chart) into the TopBar action cluster. The
 * rail extracts them into a 48-px icon column on the far-left edge of
 * the editor, mirroring the Linear / Notion idiom: app-level
 * navigation lives on the left, document-level identity + actions live
 * up top. Hover reveals the label via native title; the active route
 * pulls the cyan accent.
 *
 * Permission-gated: Audit / Reports / Network / OrgChart only render
 * for viewers who hold the corresponding action. The page-level guards
 * still enforce server-side, this just hides the affordance.
 */
type RailLink = {
  to: string
  label: string
  Icon: typeof LayoutGrid
  visible: boolean
}

export function PrimaryNavRail() {
  const { teamSlug, officeSlug } = useParams<{
    teamSlug: string
    officeSlug: string
  }>()
  const canViewAudit = useCan('viewAuditLog')
  const canViewReports = useCan('viewReports')
  const canViewITLayer = useCan('viewITLayer')
  const location = useLocation()

  if (!teamSlug || !officeSlug) return null

  const base = `/t/${teamSlug}/o/${officeSlug}`
  const items: ReadonlyArray<RailLink> = [
    { to: `${base}/map`, label: 'Map', Icon: LayoutGrid, visible: true },
    { to: `${base}/roster`, label: 'Roster', Icon: Users, visible: true },
    {
      to: `${base}/reports`,
      label: 'Reports',
      Icon: BarChart3,
      visible: canViewReports,
    },
    {
      to: `${base}/audit`,
      label: 'Audit log',
      Icon: Clock,
      visible: canViewAudit,
    },
    {
      to: `${base}/network`,
      label: 'Network',
      Icon: Wifi,
      visible: canViewITLayer,
    },
    {
      to: `${base}/org-chart`,
      label: 'Org chart',
      Icon: Workflow,
      visible: canViewReports,
    },
  ]

  return (
    <nav
      aria-label="Editor views"
      className="hidden md:flex w-12 flex-shrink-0 flex-col items-center gap-1 py-3 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 border-r border-[color:var(--color-paper-line)] dark:border-gray-800"
    >
      {items
        .filter((item) => item.visible)
        .map(({ to, label, Icon }) => {
          // NavLink isActive does prefix matching, but React Router doesn't
          // expose the resolved active path inside the className callback —
          // we derive it from `location.pathname` so a sub-route like
          // `/reports/scenarios` keeps the Reports icon highlighted.
          const isActive =
            location.pathname === to || location.pathname.startsWith(`${to}/`)
          return (
            <NavLink
              key={to}
              to={to}
              title={label}
              aria-label={label}
              className={`flex h-9 w-9 items-center justify-center rounded transition-colors ${
                isActive
                  ? 'bg-[color:var(--color-blueprint-soft)] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <Icon size={18} aria-hidden="true" />
            </NavLink>
          )
        })}
    </nav>
  )
}
