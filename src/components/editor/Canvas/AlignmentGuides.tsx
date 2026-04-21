import { Layer, Line } from 'react-konva'
import { ALIGNMENT_GUIDE_COLOR } from '../../../lib/constants'
import type { AlignmentGuide } from '../../../lib/geometry'

interface AlignmentGuidesProps {
  guides: AlignmentGuide[]
}

export function AlignmentGuides({ guides }: AlignmentGuidesProps) {
  if (guides.length === 0) return null

  return (
    <Layer listening={false}>
      {guides.map((guide, i) => (
        <Line
          key={i}
          points={
            guide.orientation === 'vertical'
              ? [guide.position, guide.start - 20, guide.position, guide.end + 20]
              : [guide.start - 20, guide.position, guide.end + 20, guide.position]
          }
          stroke={ALIGNMENT_GUIDE_COLOR}
          strokeWidth={1}
          dash={[4, 4]}
          listening={false}
        />
      ))}
    </Layer>
  )
}
