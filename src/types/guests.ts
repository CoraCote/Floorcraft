export interface Guest {
  id: string
  projectId: string
  name: string
  groupName: string | null
  dietary: string | null
  vip: boolean
  customAttributes: Record<string, string>
  seatElementId: string | null
  createdAt: string
}

export interface GuestImportRow {
  name: string
  group?: string
  dietary?: string
  vip?: string | boolean
  [key: string]: string | boolean | undefined
}
