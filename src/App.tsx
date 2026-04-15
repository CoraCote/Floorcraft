import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { EditorPage } from './components/editor/EditorPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/project/new" replace />} />
        <Route path="/project/:slug" element={<EditorPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
