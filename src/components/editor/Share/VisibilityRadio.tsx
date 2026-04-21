export type Visibility = 'team-edit' | 'team-view' | 'private'

/**
 * Three-way visibility selector used by ShareModal. The labels are the
 * user-facing strings; the underlying office row only stores `is_private`.
 * `team-view` is modeled as "default role = viewer" via explicit permission
 * overrides on teammates, but the caller owns that translation.
 */
export function VisibilityRadio({
  value,
  onChange,
}: {
  value: Visibility
  onChange: (v: Visibility) => void
}) {
  const opts: { v: Visibility; label: string; hint: string }[] = [
    { v: 'team-edit', label: 'Team can edit', hint: 'Default. Every team member can open + edit.' },
    { v: 'team-view', label: 'Team can view', hint: 'Read-only for team; override individuals.' },
    { v: 'private', label: 'Private', hint: 'Only people you explicitly add.' },
  ]
  return (
    <div className="space-y-1.5 text-sm">
      {opts.map((o) => (
        <label key={o.v} className="flex items-start gap-2 cursor-pointer">
          <input
            type="radio"
            name="visibility"
            value={o.v}
            checked={value === o.v}
            onChange={() => onChange(o.v)}
            className="mt-0.5"
          />
          <div>
            <div className="font-medium">{o.label}</div>
            <div className="text-xs text-gray-500">{o.hint}</div>
          </div>
        </label>
      ))}
    </div>
  )
}
