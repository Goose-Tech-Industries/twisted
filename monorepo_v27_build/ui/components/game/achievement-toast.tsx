"use client"

import { useAchievements } from '@/lib/achievements-context'
import { Trophy, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AchievementToast() {
  const { notifications, dismissNotification, getRarityColor } = useAchievements()
  
  if (notifications.length === 0) return null
  
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {notifications.map((notification, index) => (
        <div
          key={notification.id}
          className={cn(
            "pointer-events-auto animate-in slide-in-from-top-4 fade-in duration-300",
            "bg-card border border-border rounded-lg shadow-2xl overflow-hidden",
            "min-w-[320px] max-w-[400px]"
          )}
          style={{
            boxShadow: `0 0 30px ${getRarityColor(notification.achievement.rarity)}40`,
            animationDelay: `${index * 100}ms`
          }}
        >
          {/* Glow header */}
          <div 
            className="h-1"
            style={{ background: `linear-gradient(90deg, transparent, ${getRarityColor(notification.achievement.rarity)}, transparent)` }}
          />
          
          <div className="p-4 flex items-center gap-4">
            {/* Icon with glow */}
            <div 
              className="w-14 h-14 rounded-lg flex items-center justify-center shrink-0 relative"
              style={{ backgroundColor: `${getRarityColor(notification.achievement.rarity)}30` }}
            >
              <Trophy 
                className="w-7 h-7 animate-pulse-slow" 
                style={{ color: getRarityColor(notification.achievement.rarity) }}
              />
              {/* Shine effect */}
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent rounded-lg animate-shine" />
            </div>
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                Achievement Unlocked!
              </div>
              <h4 className="font-bold text-foreground truncate">
                {notification.achievement.name}
              </h4>
              <p className="text-sm text-muted-foreground truncate">
                {notification.achievement.description}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span 
                  className="text-xs px-1.5 py-0.5 rounded capitalize"
                  style={{ 
                    backgroundColor: `${getRarityColor(notification.achievement.rarity)}20`,
                    color: getRarityColor(notification.achievement.rarity)
                  }}
                >
                  {notification.achievement.rarity}
                </span>
                <span className="text-xs text-muted-foreground">
                  +{notification.achievement.points} points
                </span>
              </div>
            </div>
            
            {/* Close button */}
            <button
              onClick={() => dismissNotification(notification.id)}
              className="p-1 hover:bg-secondary rounded transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
