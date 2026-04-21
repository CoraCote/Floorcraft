import { jsPDF } from 'jspdf'
import type Konva from 'konva'

export function exportPdf(stage: Konva.Stage, options: {
  paperSize?: 'a4' | 'a3' | 'letter'
  orientation?: 'landscape' | 'portrait'
  dpi?: 150 | 300
  fileName?: string
  title?: string
}) {
  const {
    paperSize = 'a4',
    orientation = 'landscape',
    dpi = 150,
    fileName = 'floorplan.pdf',
    title,
  } = options

  const pixelRatio = dpi / 72
  const dataUrl = stage.toDataURL({ pixelRatio })

  const doc = new jsPDF({
    orientation,
    unit: 'pt',
    format: paperSize,
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  if (title) {
    doc.setFontSize(16)
    doc.text(title, 20, 30)
  }

  const topMargin = title ? 50 : 20
  const imgWidth = pageWidth - 40
  const imgHeight = pageHeight - topMargin - 20

  doc.addImage(dataUrl, 'PNG', 20, topMargin, imgWidth, imgHeight)
  doc.save(fileName)
}
