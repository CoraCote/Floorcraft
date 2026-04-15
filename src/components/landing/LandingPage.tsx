import { useNavigate } from 'react-router-dom'
import { TEMPLATES } from '../../data/templates'
import { useElementsStore } from '../../stores/elementsStore'
import { useProjectStore } from '../../stores/projectStore'
import { useCanvasStore } from '../../stores/canvasStore'

export function LandingPage() {
  const navigate = useNavigate()
  const setElements = useElementsStore((s) => s.setElements)
  const createNewProject = useProjectStore((s) => s.createNewProject)
  const setSettings = useCanvasStore((s) => s.setSettings)

  const handleStart = (templateId: string) => {
    const template = TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0]
    const project = createNewProject(template.name === 'Blank Canvas' ? undefined : template.name)
    setSettings(template.canvasSettings)

    const elements = template.createElements()
    const elementMap: Record<string, (typeof elements)[number]> = {}
    for (const el of elements) elementMap[el.id] = el
    setElements(elementMap)

    navigate(`/project/${project.slug}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          Floocraft
        </h1>
        <p className="text-xl text-gray-500 mb-8 max-w-2xl mx-auto">
          Design floor plans, arrange furniture, and assign seats — all in one interactive tool.
          Share with your team in real time.
        </p>
        <button
          onClick={() => handleStart('blank')}
          className="px-8 py-3 bg-blue-600 text-white text-lg font-medium rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
        >
          Create a Floor Plan
        </button>
      </div>

      {/* Templates */}
      <div className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Or start from a template</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TEMPLATES.filter((t) => t.id !== 'blank').map((template) => (
            <button
              key={template.id}
              onClick={() => handleStart(template.id)}
              className="flex flex-col p-5 rounded-xl border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all text-left bg-white"
            >
              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">{template.category}</span>
              <span className="text-base font-semibold text-gray-800 mt-1">{template.name}</span>
              <span className="text-sm text-gray-500 mt-1">{template.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 py-6 text-center text-sm text-gray-400">
        Floocraft — Interactive floor plans & seating charts
      </div>
    </div>
  )
}
