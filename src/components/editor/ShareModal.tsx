import { useUIStore } from '../../stores/uiStore'
import { useProjectStore } from '../../stores/projectStore'
import { X, Copy, Check } from 'lucide-react'
import { useState } from 'react'

export function ShareModal() {
  const open = useUIStore((s) => s.shareModalOpen)
  const setOpen = useUIStore((s) => s.setShareModalOpen)
  const project = useProjectStore((s) => s.currentProject)
  const updatePermission = useProjectStore((s) => s.updateSharePermission)
  const [copied, setCopied] = useState(false)

  if (!open || !project) return null

  const shareUrl = `${window.location.origin}/project/${project.slug}`
  const embedCode = `<iframe src="${shareUrl}/embed" width="800" height="600" frameborder="0"></iframe>`

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Share</h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Permission */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 mb-1 block">Anyone with the link can:</label>
          <select
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={project.sharePermission}
            onChange={(e) => updatePermission(e.target.value as 'private' | 'view' | 'comment' | 'edit')}
          >
            <option value="private">No access (private)</option>
            <option value="view">View only</option>
            <option value="comment">View &amp; comment</option>
            <option value="edit">Full edit access</option>
          </select>
        </div>

        {/* Share link */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 mb-1 block">Share link</label>
          <div className="flex gap-2">
            <input
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-600"
              value={shareUrl}
              readOnly
            />
            <button
              onClick={() => handleCopy(shareUrl)}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span className="text-sm">{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* Embed code */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Embed code</label>
          <div className="flex gap-2">
            <input
              className="flex-1 text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-500"
              value={embedCode}
              readOnly
            />
            <button
              onClick={() => handleCopy(embedCode)}
              className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
            >
              <Copy size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
