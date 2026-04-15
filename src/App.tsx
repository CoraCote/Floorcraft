import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { EditorPage } from './components/editor/EditorPage'
import { LandingPage } from './components/landing/LandingPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/project/:slug" element={<EditorPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
