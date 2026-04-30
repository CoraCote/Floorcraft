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
 * Compact horizontal view-nav rendered inside the `FloorSwitcher` row,
 * right-cluster. Replaces the previous 48-px `PrimaryNavRail` that sat
 * to the left of the tool rail and ate canvas real estate while
 * carrying only six toggles. Project-view navigation is conceptually
 * sibling to the office name and floor tabs — they all answer "what am
 * I looking at" — so they share a row.
 *
 * Icon-only by default; the title attribute gives keyboard / screen-
 * reader users the long form. Permission-gated: Audit / Reports /
 * Network / OrgChart only render for viewers who hold the corresponding
 * action.
 */
type RailLink = {
  to: string
  label: string
  Icon: typeof LayoutGrid
  visible: boolean
}

export function EditorViewNav() {
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
      className="hidden md:flex items-center gap-0.5 rounded-md border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-sunken)]/60 dark:bg-gray-900 p-0.5"
    >
      {items
        .filter((item) => item.visible)
        .map(({ to, label, Icon }) => {
          const isActive =
            location.pathname === to || location.pathname.startsWith(`${to}/`)
          return (
            <NavLink
              key={to}
              to={to}
              title={label}
              aria-label={label}
              className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
                isActive
                  ? 'bg-[color:var(--color-paper-raised)] text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-[color:var(--color-paper-raised)]/60 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <Icon size={14} aria-hidden="true" />
            </NavLink>
          )
        })}
    </nav>
  )
}
