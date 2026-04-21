import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { LandingPage } from './components/landing/LandingPage'

// Editor chunks pull in react-konva and the whole Canvas tree. Keep them
// lazy so the landing page (the entry point) doesn't eagerly ship Konva.
const ProjectShell = lazy(() =>
  import('./components/editor/ProjectShell').then((m) => ({ default: m.ProjectShell }))
)
const MapView = lazy(() =>
  import('./components/editor/MapView').then((m) => ({ default: m.MapView }))
)
const RosterPage = lazy(() =>
  import('./components/editor/RosterPage').then((m) => ({ default: m.RosterPage }))
)

function EditorFallback() {
  return (
    <div className="flex items-center justify-center h-screen w-screen bg-gray-50 text-sm text-gray-500">
      Loading editor…
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<EditorFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/project/:slug" element={<ProjectShell />}>
            {/* Default to the map view; preserve any query string on redirect. */}
            <Route index element={<Navigate to="map" replace />} />
            <Route path="map" element={<MapView />} />
            <Route path="roster" element={<RosterPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
