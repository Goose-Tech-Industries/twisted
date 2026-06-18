"use client"

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export interface DailyReward {
  gold: number
  streak: number
  bonus: boolean
  message: string
}

interface DailyRewardModalProps {
  reward: DailyReward
  onClose: () => void
}

// The 7 day reward amounts — mirrors the server defaults so the UI
// can show what's coming next even before the server responds.
const REWARD_SCHEDULE = [50, 100, 150, 200, 300, 400, 500]

export function DailyRewardModal({ reward, onClose }: DailyRewardModalProps) {
  const [visible, setVisible] = useState(false)
  const [goldAnim, setGoldAnim] = useState(0)

  // Fade in on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [])

  // Count up the gold number for visual effect
  useEffect(() => {
    if (!visible) return
    const target = reward.gold
    const step = Math.ceil(target / 40)
    let current = 0
    const interval = setInterval(() => {
      current = Math.min(current + step, target)
      setGoldAnim(current)
      if (current >= target) clearInterval(interval)
    }, 30)
    return () => clearInterval(interval)
  }, [visible, reward.gold])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  // Build the 7-day streak preview strip
  const streakSlots = Array.from({ length: 7 }, (_, i) => {
    const day = i + 1
    const claimed = day <= reward.streak
    const isToday = day === reward.streak
    const gold = REWARD_SCHEDULE[i]
    return { day, gold, claimed, isToday }
  })

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0"
      )}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/85"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className={cn(
        "relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden",
        "transition-transform duration-300",
        visible ? "scale-100" : "scale-90"
      )}>
        {/* Header — crimson banner for weekly bonus, gold for normal */}
        <div className={cn(
          "p-6 text-center",
          reward.bonus
            ? "bg-gradient-to-b from-red-950 to-red-900/50 border-b border-red-800"
            : "bg-gradient-to-b from-yellow-950 to-yellow-900/30 border-b border-yellow-800/50"
        )}>
          {/* Animated icon */}
          <div className={cn(
            "text-6xl mb-3 inline-block",
            reward.bonus ? "animate-bounce" : ""
          )}>
            {reward.bonus ? "🎉" : "📅"}
          </div>

          <h2 className={cn(
            "text-xl font-bold",
            reward.bonus ? "text-red-300" : "text-yellow-300"
          )}>
            {reward.bonus ? "Weekly Bonus!" : "Daily Reward"}
          </h2>

          <p className="text-sm text-muted-foreground mt-1">
            {reward.streak}-day login streak
          </p>
        </div>

        {/* Gold amount */}
        <div className="p-6 text-center border-b border-border">
          <div className="text-5xl font-bold text-yellow-400 font-mono tabular-nums">
            +{goldAnim.toLocaleString()}g
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Added to your account
          </p>
        </div>

        {/* 7-day streak strip */}
        <div className="p-4">
          <p className="text-xs text-muted-foreground text-center mb-3 uppercase tracking-wider">
            Login Streak
          </p>
          <div className="grid grid-cols-7 gap-1">
            {streakSlots.map(({ day, gold, claimed, isToday }) => (
              <div
                key={day}
                className={cn(
                  "flex flex-col items-center p-2 rounded-lg border text-center transition-all",
                  isToday
                    ? "border-yellow-500 bg-yellow-500/20 scale-110 shadow-md shadow-yellow-500/20"
                    : claimed
                    ? "border-green-800 bg-green-900/30 opacity-60"
                    : "border-border bg-secondary/20 opacity-40"
                )}
              >
                <span className="text-xs font-bold mb-1">
                  {claimed ? (isToday ? "✓" : "✓") : day === 7 ? "🎁" : `${day}`}
                </span>
                <span className="text-[10px] text-yellow-400 font-mono">
                  {gold >= 500 ? "500g+" : `${gold}g`}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            {reward.streak < 7
              ? `${7 - reward.streak} day${7 - reward.streak !== 1 ? 's' : ''} until weekly bonus`
              : "Weekly bonus claimed! Streak continues…"}
          </p>
        </div>

        {/* Close button */}
        <div className="p-4 pt-0">
          <button
            onClick={handleClose}
            className={cn(
              "w-full py-3 rounded-lg font-semibold text-sm transition-all",
              reward.bonus
                ? "bg-red-800 hover:bg-red-700 text-red-100"
                : "bg-yellow-800/60 hover:bg-yellow-700/60 text-yellow-100"
            )}
          >
            Claim &amp; Continue
          </button>
        </div>
      </div>
    </div>
  )
}
