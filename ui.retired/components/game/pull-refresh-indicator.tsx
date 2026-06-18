import { cn } from "@/lib/utils"
import { Loader2, ChevronDown } from "lucide-react"

interface PullRefreshIndicatorProps {
  pullDistance: number
  refreshing: boolean
  isPulledPastThreshold: boolean
}

export function PullRefreshIndicator({ pullDistance, refreshing, isPulledPastThreshold }: PullRefreshIndicatorProps) {
  if (pullDistance === 0 && !refreshing) return null

  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
      style={{ height: pullDistance }}
    >
      {refreshing ? (
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
      ) : (
        <ChevronDown
          className={cn(
            "w-5 h-5 text-muted-foreground transition-transform duration-200",
            isPulledPastThreshold && "text-primary rotate-180"
          )}
        />
      )}
    </div>
  )
}
