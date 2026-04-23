export function UtilizationBar({ percent }: { percent: number }) {
  const color =
    percent < 50 ? 'bg-red-500' :
    percent < 80 ? 'bg-yellow-500' :
    'bg-emerald-500'
  const width = Math.min(100, Math.max(0, percent))
  return (
    <div className="w-full bg-gray-100 rounded h-2 overflow-hidden" role="progressbar" aria-valuenow={Math.round(percent)}>
      <div className={`h-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  )
}
