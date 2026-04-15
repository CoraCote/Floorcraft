import { useSeatingStore } from '../../../stores/seatingStore'
import { useUIStore } from '../../../stores/uiStore'
import { useState } from 'react'
import { Search, Plus, Upload, Users, X } from 'lucide-react'

export function GuestListPanel() {
  const { searchQuery, setSearchQuery, sortBy, setSortBy, addGuest, removeGuest, getFilteredGuests, getAssignedCount } = useSeatingStore()
  const setCsvImportOpen = useUIStore((s) => s.setCsvImportOpen)
  const guests = getFilteredGuests()
  const totalGuests = Object.keys(useSeatingStore.getState().guests).length
  const assignedCount = getAssignedCount()

  const [newName, setNewName] = useState('')
  const [newGroup, setNewGroup] = useState('')

  const handleAddGuest = () => {
    if (!newName.trim()) return
    addGuest(newName.trim(), newGroup.trim() || undefined)
    setNewName('')
    setNewGroup('')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <Users size={14} className="text-gray-500" />
        <span className="text-sm font-medium text-gray-700">
          {assignedCount} of {totalGuests} assigned
        </span>
      </div>

      <div className="relative mb-2">
        <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
        <input
          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
          placeholder="Search guests..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <select
          className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 text-gray-600"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'group' | 'status')}
        >
          <option value="name">Sort by Name</option>
          <option value="group">Sort by Group</option>
          <option value="status">Sort by Status</option>
        </select>
        <button
          onClick={() => setCsvImportOpen(true)}
          className="flex items-center gap-1 px-2 py-1.5 text-xs border border-gray-200 rounded hover:bg-gray-50"
        >
          <Upload size={12} />
          CSV
        </button>
      </div>

      <div className="flex gap-1 mb-3">
        <input
          className="flex-1 text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
          placeholder="Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAddGuest() }}
        />
        <input
          className="w-20 text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
          placeholder="Group"
          value={newGroup}
          onChange={(e) => setNewGroup(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAddGuest() }}
        />
        <button
          onClick={handleAddGuest}
          className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
          title="Add guest"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto -mx-3 px-3">
        {guests.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            No guests yet. Add manually or import CSV.
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {guests.map((guest) => (
              <div
                key={guest.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 group cursor-grab"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/guest-id', guest.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
              >
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    guest.seatElementId ? 'bg-green-500' : 'bg-red-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 truncate">{guest.name}</div>
                  {guest.groupName && (
                    <div className="text-[10px] text-gray-400 truncate">{guest.groupName}</div>
                  )}
                </div>
                {guest.vip && (
                  <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1 rounded">VIP</span>
                )}
                <button
                  onClick={() => removeGuest(guest.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
