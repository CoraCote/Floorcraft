import { useUIStore } from '../../stores/uiStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useProjectStore } from '../../stores/projectStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { TEMPLATES } from '../../data/templates'
import { Modal, ModalBody } from '../ui'

export function NewProjectModal() {
  const open = useUIStore((s) => s.templatePickerOpen)
  const setOpen = useUIStore((s) => s.setTemplatePickerOpen)
  const setElements = useElementsStore((s) => s.setElements)
  const createNewProject = useProjectStore((s) => s.createNewProject)
  const setSettings = useCanvasStore((s) => s.setSettings)

  const close = () => setOpen(false)

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
    <Modal open={open} onClose={close} title="New project" size="lg">
      <ModalBody>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Choose an office template or start with a blank canvas.</p>
        <div className="grid grid-cols-2 gap-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelect(t.id)}
              className="flex flex-col items-start p-4 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 focus-visible:ring-blue-500"
            >
              <span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 mb-1">{t.category}</span>
              <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{t.name}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t.description}</span>
            </button>
          ))}
        </div>
      </ModalBody>
    </Modal>
  )
}
