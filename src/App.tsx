import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { LandingPage } from './components/landing/LandingPage'

// The editor pulls in react-konva and the full Canvas tree; lazy-load it so
// the landing page (the entry point) doesn't eagerly ship the Konva bundle.
const EditorPage = lazy(() =>
  import('./components/editor/EditorPage').then((m) => ({ default: m.EditorPage }))
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
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/project/:slug"
          element={
            <Suspense fallback={<EditorFallback />}>
              <EditorPage />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
