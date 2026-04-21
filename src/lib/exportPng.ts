import type Konva from 'konva'

export function exportPng(stage: Konva.Stage, options: {
  pixelRatio?: number
  fileName?: string
}) {
  const { pixelRatio = 1, fileName = 'floorplan.png' } = options

  const dataUrl = stage.toDataURL({ pixelRatio })
  const link = document.createElement('a')
  link.download = fileName
  link.href = dataUrl
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
