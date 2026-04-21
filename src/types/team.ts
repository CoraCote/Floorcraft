export interface Team {
  id: string
  slug: string
  name: string
  created_by: string
  created_at: string
}

export interface TeamMember {
  team_id: string
  user_id: string
  role: 'admin' | 'member'
  joined_at: string
  email?: string
  name?: string
}

export interface Invite {
  id: string
  team_id: string
  email: string
  token: string
  invited_by: string
  created_at: string
  expires_at: string
  accepted_at: string | null
}
