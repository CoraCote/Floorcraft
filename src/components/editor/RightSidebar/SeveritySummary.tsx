interface SeveritySummaryProps {
  critical: number
  warning: number
  info: number
}

export function SeveritySummary({ critical, warning, info }: SeveritySummaryProps) {
  return (
    <div className="flex items-center gap-4 px-3 py-2 bg-[color:var(--color-paper-sunken)] dark:bg-gray-800/50 rounded-lg text-xs">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-red-500" />
        <span className="font-medium text-gray-700 dark:text-gray-200">{critical} Critical</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-yellow-500" />
        <span className="font-medium text-gray-700 dark:text-gray-200">{warning} Warning</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-[color:var(--color-blueprint)]" />
        <span className="font-medium text-gray-700 dark:text-gray-200">{info} Info</span>
      </div>
    </div>
  )
}
