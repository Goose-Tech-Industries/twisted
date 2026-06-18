"use client"
import React, { useEffect, useState } from 'react'

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

const NOTIFICATION_STYLES: Record<string, { icon: React.ElementType; color: string; bg: string; bar: string }> = {
  info: {
    icon: Info,
    color: 'text-[oklch(0.55_0.12_185)]',
    bg: 'bg-[oklch(0.55_0.12_185)]/10 border-[oklch(0.55_0.12_185)]/30',
    bar: 'bg-[oklch(0.55_0.12_185)]',
  },
  success: {
    icon: CheckCircle2,
    color: 'text-[oklch(0.55_0.15_140)]',
    bg: 'bg-[oklch(0.55_0.15_140)]/10 border-[oklch(0.55_0.15_140)]/30',
    bar: 'bg-[oklch(0.55_0.15_140)]',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-[oklch(0.65_0.18_85)]',
    bg: 'bg-[oklch(0.65_0.18_85)]/10 border-[oklch(0.65_0.18_85)]/30',
    bar: 'bg-[oklch(0.65_0.18_85)]',
  },
  error: {
    icon: XCircle,
    color: 'text-destructive',
    bg: 'bg-destructive/10 border-destructive/30',
    bar: 'bg-destructive',
  },
  item: {
    icon: Package,
    color: 'text-[oklch(0.55_0.18_260)]',
    bg: 'bg-[oklch(0.55_0.18_260)]/10 border-[oklch(0.55_0.18_260)]/30',
    bar: 'bg-[oklch(0.55_0.18_260)]',
  },
  xp: {
    icon: Star,
    color: 'text-[oklch(0.65_0.18_85)]',
    bg: 'bg-[oklch(0.65_0.18_85)]/10 border-[oklch(0.65_0.18_85)]/30',
    bar: 'bg-[oklch(0.65_0.18_85)]',
  },
  gold: {
    icon: Coins,
    color: 'text-[oklch(0.75_0.15_85)]',
    bg: 'bg-[oklch(0.75_0.15_85)]/10 border-[oklch(0.75_0.15_85)]/30',
    bar: 'bg-[oklch(0.75_0.15_85)]',
  },
}

const DISMISS_MS = 4000
const MAX_VISIBLE = 3

export function NotificationToast() {
  const { state, dispatch } = useGame()

  if (state.notifications.length === 0) return null

  // Only show the most recent MAX_VISIBLE
  const visible = state.notifications.slice(-MAX_VISIBLE)

  return (
    <div className={cn(
      "fixed z-50 flex flex-col gap-2 pointer-events-none",
      // Mobile: top center, below header bar
      "top-14 left-2 right-2 items-center",
      // Desktop: top-right corner
      "md:top-4 md:left-auto md:right-4 md:items-end md:max-w-sm"
    )}>
      {visible.map(notification => (
        <ToastItem
          key={notification.id}
          notification={notification}
          onDismiss={() => dispatch({ type: 'REMOVE_NOTIFICATION', payload: notification.id })}
        />
      ))}
    </div>
  )
}

interface Notification {
  id: string
  type: string
  message: string
  timestamp: number
}

function ToastItem({ notification, onDismiss }: { notification: Notification; onDismiss: () => void }) {
  const [exiting, setExiting] = useState(false)
  const [progress, setProgress] = useState(100)
  const style = NOTIFICATION_STYLES[notification.type] || NOTIFICATION_STYLES.info
  const Icon = style.icon

  // Auto-dismiss countdown with progress bar
  useEffect(() => {
    const elapsed = Date.now() - notification.timestamp
    const remaining = Math.max(0, DISMISS_MS - elapsed)
    if (remaining <= 0) return

    // Animate progress bar
    const startPct = (remaining / DISMISS_MS) * 100
    setProgress(startPct)
    const interval = setInterval(() => {
      setProgress(prev => {
        const next = prev - (100 / (DISMISS_MS / 50))
        if (next <= 0) {
          clearInterval(interval)
          return 0
        }
        return next
      })
    }, 50)

    return () => clearInterval(interval)
  }, [notification.timestamp])

  // Exit animation before removal
  const handleDismiss = () => {
    setExiting(true)
    setTimeout(onDismiss, 200)
  }

  // Auto-trigger exit when progress reaches 0
  useEffect(() => {
    if (progress <= 0 && !exiting) {
      setExiting(true)
      setTimeout(onDismiss, 200)
    }
  }, [progress, exiting, onDismiss])

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 md:p-4 rounded-lg border backdrop-blur-sm w-full md:w-auto pointer-events-auto overflow-hidden",
        "transition-all duration-200",
        exiting
          ? "opacity-0 translate-x-4 scale-95"
          : "animate-in slide-in-from-top-2 md:slide-in-from-right-5 fade-in duration-300",
        style.bg
      )}
    >
      <Icon className={cn("w-5 h-5 shrink-0 mt-0.5", style.color)} />
      <p className="text-sm text-foreground flex-1 min-w-0">{notification.message}</p>
      <button
        onClick={handleDismiss}
        className="p-0.5 rounded hover:bg-background/50 transition-colors shrink-0"
      >
        <X className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* Auto-dismiss progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/10">
        <div
          className={cn("h-full transition-none rounded-full", style.bar)}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
