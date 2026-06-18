"use client"

import { useGame } from "@/lib/game-context"
import { cn } from "@/lib/utils"
import { 
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Package,
  Star,
  Coins,
  X
} from "lucide-react"

const NOTIFICATION_STYLES: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  info: { 
    icon: Info, 
    color: 'text-[oklch(0.55_0.12_185)]', 
    bg: 'bg-[oklch(0.55_0.12_185)]/10 border-[oklch(0.55_0.12_185)]/30' 
  },
  success: { 
    icon: CheckCircle2, 
    color: 'text-[oklch(0.55_0.15_140)]', 
    bg: 'bg-[oklch(0.55_0.15_140)]/10 border-[oklch(0.55_0.15_140)]/30' 
  },
  warning: { 
    icon: AlertTriangle, 
    color: 'text-[oklch(0.65_0.18_85)]', 
    bg: 'bg-[oklch(0.65_0.18_85)]/10 border-[oklch(0.65_0.18_85)]/30' 
  },
  error: { 
    icon: XCircle, 
    color: 'text-destructive', 
    bg: 'bg-destructive/10 border-destructive/30' 
  },
  item: { 
    icon: Package, 
    color: 'text-[oklch(0.55_0.18_260)]', 
    bg: 'bg-[oklch(0.55_0.18_260)]/10 border-[oklch(0.55_0.18_260)]/30' 
  },
  xp: { 
    icon: Star, 
    color: 'text-[oklch(0.65_0.18_85)]', 
    bg: 'bg-[oklch(0.65_0.18_85)]/10 border-[oklch(0.65_0.18_85)]/30' 
  },
  gold: { 
    icon: Coins, 
    color: 'text-[oklch(0.75_0.15_85)]', 
    bg: 'bg-[oklch(0.75_0.15_85)]/10 border-[oklch(0.75_0.15_85)]/30' 
  },
}

export function NotificationToast() {
  const { state, dispatch } = useGame()
  
  if (state.notifications.length === 0) return null
  
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {state.notifications.map(notification => {
        const style = NOTIFICATION_STYLES[notification.type] || NOTIFICATION_STYLES.info
        const Icon = style.icon
        
        return (
          <div
            key={notification.id}
            className={cn(
              "flex items-start gap-3 p-4 rounded-lg border backdrop-blur-sm animate-in slide-in-from-right-5 fade-in duration-300",
              style.bg
            )}
          >
            <Icon className={cn("w-5 h-5 shrink-0 mt-0.5", style.color)} />
            <p className="text-sm text-foreground flex-1">{notification.message}</p>
            <button
              onClick={() => dispatch({ type: 'REMOVE_NOTIFICATION', payload: notification.id })}
              className="p-0.5 rounded hover:bg-background/50 transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
