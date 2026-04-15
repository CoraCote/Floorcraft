import { useUIStore } from '../../stores/uiStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useProjectStore } from '../../stores/projectStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { TEMPLATES } from '../../data/templates'
import { X } from 'lucide-react'

export function NewProjectModal() {
  const open = useUIStore((s) => s.templatePickerOpen)
  const setOpen = useUIStore((s) => s.setTemplatePickerOpen)
  const setElements = useElementsStore((s) => s.setElements)
  const createNewProject = useProjectStore((s) => s.createNewProject)
  const setSettings = useCanvasStore((s) => s.setSettings)

  if (!open) return null

  const handleSelect = (templateId: string) => {
    const template = TEMPLATES.find((t) => t.id === templateId)
    if (!template) return

    createNewProject(template.name === 'Blank Canvas' ? undefined : template.name)
    setSettings(template.canvasSettings)

    const elements = template.createElements()
    const elementMap: Record<string, typeof elements[number]> = {}
    for (const el of elements) {
      elementMap[el.id] = el
    }
    setElements(elementMap)
    setOpen(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Project</h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <p className="text-sm text-gray-500 mb-4">Choose a template or start with a blank canvas</p>
        <div className="grid grid-cols-2 gap-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelect(t.id)}
              className="flex flex-col items-start p-4 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 transition-colors text-left"
            >
              <span className="text-[10px] uppercase font-semibold text-gray-400 mb-1">{t.category}</span>
              <span className="text-sm font-medium text-gray-800">{t.name}</span>
              <span className="text-xs text-gray-500 mt-1">{t.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
