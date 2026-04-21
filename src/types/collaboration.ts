export interface CursorInfo {
  userId: string
  userName: string
  color: string
  x: number
  y: number
  lastUpdated: number
}

export interface Comment {
  id: string
  projectId: string
  authorId: string | null
  authorName: string
  x: number
  y: number
  targetElementId: string | null
  body: string
  parentId: string | null
  resolved: boolean
  reactions: Record<string, number>
  createdAt: string
}
