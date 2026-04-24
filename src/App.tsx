import { BrowserRouter, Routes, Route, Navigate, useOutletContext } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { LandingPage } from './components/landing/LandingPage'
import { AuthProvider } from './lib/auth/AuthProvider'
import { LoginPage } from './components/auth/LoginPage'
import { SignupPage } from './components/auth/SignupPage'
import { AuthVerifyPage } from './components/auth/AuthVerifyPage'
import { AuthResetPage } from './components/auth/AuthResetPage'
import { ForgotPasswordPage } from './components/auth/ForgotPasswordPage'
import { RequireAuth } from './components/auth/RequireAuth'
import { RequireTeam } from './components/auth/RequireTeam'
import { InvitePage } from './components/team/InvitePage'
import type { Team } from './types/team'

// Editor chunks pull in react-konva and the whole Canvas tree. Auth and
// team pages are cheap by comparison but still gated behind the router
// so the landing page (the entry point) ships the minimum possible JS.
const ProjectShell = lazy(() =>
  import('./components/editor/ProjectShell').then((m) => ({ default: m.ProjectShell })),
)
const MapView = lazy(() =>
  import('./components/editor/MapView').then((m) => ({ default: m.MapView })),
)
const RosterPage = lazy(() =>
  import('./components/editor/RosterPage').then((m) => ({ default: m.RosterPage })),
)
const TeamOnboardingPage = lazy(() =>
  import('./components/team/TeamOnboardingPage').then((m) => ({
    default: m.TeamOnboardingPage,
  })),
)
const TeamHomePage = lazy(() =>
  import('./components/team/TeamHomePage').then((m) => ({ default: m.TeamHomePage })),
)
const TeamSettingsPage = lazy(() =>
  import('./components/team/TeamSettingsPage').then((m) => ({
    default: m.TeamSettingsPage,
  })),
)
const TeamSettingsGeneral = lazy(() =>
  import('./components/team/TeamSettingsGeneral').then((m) => ({
    default: m.TeamSettingsGeneral,
  })),
)
const TeamSettingsMembers = lazy(() =>
  import('./components/team/TeamSettingsMembers').then((m) => ({
    default: m.TeamSettingsMembers,
  })),
)
const DashboardRedirect = lazy(() =>
  import('./components/team/DashboardRedirect').then((m) => ({
    default: m.DashboardRedirect,
  })),
)
const AccountPage = lazy(() =>
  import('./components/team/AccountPage').then((m) => ({ default: m.AccountPage })),
)
const HelpPage = lazy(() =>
  import('./components/help/HelpPage').then((m) => ({ default: m.HelpPage })),
)
const AuditLogPage = lazy(() =>
  import('./components/admin/AuditLogPage').then((m) => ({
    default: m.AuditLogPage,
  })),
)
const ReportsPage = lazy(() =>
  import('./components/reports/ReportsPage').then((m) => ({
    default: m.ReportsPage,
  })),
)
const ScenariosPage = lazy(() =>
  import('./components/editor/reports/ScenariosPage').then((m) => ({
    default: m.ScenariosPage,
  })),
)
const FloorComparePage = lazy(() =>
  import('./components/reports/FloorComparePage').then((m) => ({
    default: m.FloorComparePage,
  })),
)
const OrgChartPage = lazy(() =>
  import('./components/editor/OrgChartPage').then((m) => ({
    default: m.OrgChartPage,
  })),
)
const ReservationsPage = lazy(() =>
  import('./components/editor/ReservationsPage').then((m) => ({
    default: m.ReservationsPage,
  })),
)
const SharedProjectView = lazy(() =>
  import('./components/shared/SharedProjectView').then((m) => ({
    default: m.SharedProjectView,
  })),
)
const ShareView = lazy(() =>
  import('./components/editor/ShareView').then((m) => ({
    default: m.ShareView,
  })),
)

function Loading() {
  return (
    <div className="flex items-center justify-center h-screen w-screen bg-gray-50 text-sm text-gray-500">
      Loading…
    </div>
  )
}

/**
 * Bridge components that pull `{ team, isAdmin }` from the parent
 * `TeamSettingsPage` `<Outlet context>` and hand them to the leaf pages
 * as plain props. Keeping the leaves prop-driven (rather than reading
 * the outlet context inline) means they stay easy to mount in tests
 * without building up a full router tree.
 */
function TeamSettingsGeneralBridge() {
  const { team, isAdmin } = useOutletContext<{ team: Team; isAdmin: boolean }>()
  return <TeamSettingsGeneral team={team} isAdmin={isAdmin} />
}

function TeamSettingsMembersBridge() {
  const { team, isAdmin } = useOutletContext<{ team: Team; isAdmin: boolean }>()
  // `selfId` reads from `useSession()` inside the component when omitted.
  return <TeamSettingsMembers team={team} isAdmin={isAdmin} />
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Loading />}>
          <Routes>
            {/* Public */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot" element={<ForgotPasswordPage />} />
            <Route path="/auth/verify" element={<AuthVerifyPage />} />
            <Route path="/auth/reset" element={<AuthResetPage />} />
            <Route path="/invite/:token" element={<InvitePage />} />
            {/* Read-only share links — intentionally unauthenticated.
                RLS policies on share_tokens + offices are the gate. */}
            <Route path="/shared/:projectId/:token" element={<SharedProjectView />} />
            {/* D6 view-only share links. Token validation happens client
                side in `ShareView` against the in-memory shareLinks store;
                the route is intentionally public so anonymous visitors
                don't bounce through auth. */}
            <Route path="/share/:officeSlug" element={<ShareView />} />
            {/* Help is intentionally public — an unauth'd user can read
                the guide before signing up, and an auth'd one doesn't
                have to bounce through a team to get to it. */}
            <Route path="/help" element={<HelpPage />} />

            {/* Auth-only (no team required — these are the pages that get
                you INTO a team) */}
            <Route
              path="/onboarding/team"
              element={
                <RequireAuth>
                  <TeamOnboardingPage />
                </RequireAuth>
              }
            />
            <Route
              path="/account"
              element={
                <RequireAuth>
                  <AccountPage />
                </RequireAuth>
              }
            />

            {/* Auth + at least one team membership required */}
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <RequireTeam>
                    <DashboardRedirect />
                  </RequireTeam>
                </RequireAuth>
              }
            />
            <Route
              path="/t/:teamSlug"
              element={
                <RequireAuth>
                  <RequireTeam>
                    <TeamHomePage />
                  </RequireTeam>
                </RequireAuth>
              }
            />
            <Route
              path="/t/:teamSlug/settings"
              element={
                <RequireAuth>
                  <RequireTeam>
                    <TeamSettingsPage />
                  </RequireTeam>
                </RequireAuth>
              }
            >
              <Route index element={<TeamSettingsGeneralBridge />} />
              <Route path="members" element={<TeamSettingsMembersBridge />} />
            </Route>

            {/* Office editor — ProjectShell is the layout route; leaf
                views render inside its <Outlet /> */}
            <Route
              path="/t/:teamSlug/o/:officeSlug"
              element={
                <RequireAuth>
                  <RequireTeam>
                    <ProjectShell />
                  </RequireTeam>
                </RequireAuth>
              }
            >
              <Route index element={<Navigate to="map" replace />} />
              <Route path="map" element={<MapView />} />
              <Route path="roster" element={<RosterPage />} />
              <Route path="audit" element={<AuditLogPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="reports/scenarios" element={<ScenariosPage />} />
              <Route path="reports/floor-compare" element={<FloorComparePage />} />
              <Route path="org-chart" element={<OrgChartPage />} />
              <Route path="reservations" element={<ReservationsPage />} />
            </Route>

            {/* Legacy routes — Phases 0-5 mounted the editor at
                `/project/:slug/*`. If anyone still has those bookmarked
                we punt them to the dashboard, which then picks the right
                team for them. We deliberately DON'T try to reconstruct
                the old slug → (team, office) mapping: pre-auth data was
                local-only, so there's no server-side lookup possible. */}
            <Route path="/project/*" element={<Navigate to="/dashboard" replace />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
