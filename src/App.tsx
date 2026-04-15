import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div className="flex items-center justify-center h-screen text-2xl font-bold">Floocraft</div>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
