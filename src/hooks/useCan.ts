import { useProjectStore } from '../stores/projectStore'
import { can, type Action } from '../lib/permissions'

export function useCan(action: Action): boolean {
  const role = useProjectStore((s) => s.currentOfficeRole)
  return can(role, action)
}
