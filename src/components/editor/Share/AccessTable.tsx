import { X as XIcon } from 'lucide-react'
import type { OfficePermEntry, OfficeRole } from '../../../lib/offices/permissionsRepository'
import { upsertPermission, removePermission } from '../../../lib/offices/permissionsRepository'

/**
 * Per-row ACL editor. Owners and the current user are rendered as plain
 * text (you can't demote yourself; owners are managed at the team level).
 * `onChange` lets the parent refetch `listPermissions` after a mutation
 * rather than threading state through props.
 */
export function AccessTable({
  officeId,
  entries,
  canEdit,
  onChange,
}: {
  officeId: string
  entries: OfficePermEntry[]
  canEdit: boolean
  onChange: () => void
}) {
  async function setRole(entry: OfficePermEntry, role: OfficeRole) {
    await upsertPermission(officeId, entry.user_id, role)
    onChange()
  }
  async function remove(entry: OfficePermEntry) {
    await removePermission(officeId, entry.user_id)
    onChange()
  }
  return (
    <table className="w-full text-sm">
      <tbody>
        {entries.map((e) => (
          <tr key={e.user_id} className="border-t">
            <td className="py-2">
              <div className="font-medium">
                {e.name ?? e.email}
                {e.isSelf ? ' (you)' : ''}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{e.email}</div>
            </td>
            <td className="py-2 w-32">
              {e.role === 'owner' || !canEdit || e.isSelf ? (
                <span className="capitalize text-gray-600 dark:text-gray-300">{e.role}</span>
              ) : (
                <select
                  aria-label={`${e.email} role`}
                  value={e.role}
                  onChange={(ev) => setRole(e, ev.target.value as OfficeRole)}
                  className="border rounded px-2 py-1"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="owner">Owner</option>
                </select>
              )}
            </td>
            <td className="py-2 text-right">
              {canEdit && e.role !== 'owner' && !e.isSelf && (
                <button
                  onClick={() => remove(e)}
                  className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                  title="Remove override"
                  aria-label={`Remove ${e.email}`}
                >
                  <XIcon size={14} />
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
