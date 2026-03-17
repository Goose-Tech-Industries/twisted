"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useGame } from '@/lib/game-context'
import { achievementApi, type AchievementDef, type EarnedAchievement } from '@/lib/game-api'

// =================================================================
// TYPES
// =================================================================

export type AchievementCategory = 'combat' | 'social' | 'exploration' | 'progression' | 'other'

export interface Achievement {
  id: number
  key_name: string
  name: string
  description: string
  icon: string
  category: AchievementCategory
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  points: number
  maxProgress?: number
  hidden?: boolean
  rewardGold?: number
  rewardTitle?: string | null
}

export interface UnlockedAchievement {
  id: number
  key_name: string
  unlockedAt: string
}

// Map trigger_value thresholds to rarity tiers
function inferRarity(def: AchievementDef): Achievement['rarity'] {
  const v = def.trigger_value
  if (v >= 500) return 'legendary'
  if (v >= 100) return 'epic'
  if (v >= 25) return 'rare'
  if (v >= 5) return 'uncommon'
  return 'common'
}

// Points based on rarity
function inferPoints(rarity: Achievement['rarity'], def: AchievementDef): number {
  if (def.reward_gold > 0) return def.reward_gold // use gold as proxy for importance
  switch (rarity) {
    case 'legendary': return 500
    case 'epic': return 200
    case 'rare': return 100
    case 'uncommon': return 50
    default: return 20
  }
}

function toAchievement(def: AchievementDef): Achievement {
  const rarity = inferRarity(def)
  const cat = (def.category || 'other') as AchievementCategory
  return {
    id: def.id,
    key_name: def.key_name,
    name: def.title,
    description: def.description || '',
    icon: def.icon,
    category: cat,
    rarity,
    points: inferPoints(rarity, def),
    maxProgress: def.trigger_value > 1 ? def.trigger_value : undefined,
    hidden: !!def.is_hidden,
    rewardGold: def.reward_gold || undefined,
    rewardTitle: def.reward_title,
  }
}

const RARITY_COLORS: Record<Achievement['rarity'], string> = {
  common: '#9ca3af',
  uncommon: '#22c55e',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#f59e0b'
}

// =================================================================
// CONTEXT
// =================================================================

interface AchievementNotification {
  id: string
  achievement: Achievement
  timestamp: number
}

interface AchievementsContextValue {
  achievements: Achievement[]
  unlocked: UnlockedAchievement[]
  notifications: AchievementNotification[]
  totalPoints: number
  loading: boolean
  // Methods
  isUnlocked: (id: number) => boolean
  getProgress: (id: number) => number
  dismissNotification: (id: string) => void
  getRarityColor: (rarity: Achievement['rarity']) => string
  refresh: () => Promise<void>
}

const AchievementsContext = createContext<AchievementsContextValue | null>(null)

export function AchievementsProvider({ children }: { children: ReactNode }) {
  const { state, socket } = useGame()
  const charId = state.character?.charId

  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [unlocked, setUnlocked] = useState<UnlockedAchievement[]>([])
  const [notifications, setNotifications] = useState<AchievementNotification[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch definitions + character progress
  const refresh = useCallback(async () => {
    setLoading(true)

    // Load all definitions
    const defRes = await achievementApi.getDefinitions()
    let allDefs: AchievementDef[] = []
    if (defRes.success) {
      // Definitions endpoint returns { success, data: [...] }
      allDefs = defRes.data || []
      // Fallback: some endpoints put data at root
      if (!allDefs.length) {
        const raw = defRes as unknown as Record<string, unknown>
        if (Array.isArray(raw.data)) allDefs = raw.data as AchievementDef[]
      }
      setAchievements(allDefs.filter(d => d.is_active).map(toAchievement))
    }

    // Load character's earned achievements
    if (charId) {
      const earnedRes = await achievementApi.getCharacterAchievements(charId)
      if (earnedRes.success) {
        let earned: EarnedAchievement[] = earnedRes.data || []
        if (!earned.length) {
          const raw = earnedRes as unknown as Record<string, unknown>
          if (Array.isArray(raw.data)) earned = raw.data as EarnedAchievement[]
        }
        setUnlocked(earned.map(e => ({
          id: e.id,
          key_name: e.key_name,
          unlockedAt: e.earned_at,
        })))
      }
    } else {
      setUnlocked([])
    }

    setLoading(false)
  }, [charId])

  useEffect(() => { refresh() }, [refresh])

  // Listen for real-time achievement_earned events from the server
  useEffect(() => {
    if (!socket) return

    const handler = (data: { key: string; title: string; icon: string; rewardGold?: number; newTitle?: string }) => {
      // Find matching achievement def
      const match = achievements.find(a => a.key_name === data.key)

      // Add to unlocked
      setUnlocked(prev => {
        if (prev.some(u => u.key_name === data.key)) return prev
        return [...prev, { id: match?.id ?? 0, key_name: data.key, unlockedAt: new Date().toISOString() }]
      })

      // Show notification
      if (match) {
        const notification: AchievementNotification = {
          id: `${data.key}-${Date.now()}`,
          achievement: match,
          timestamp: Date.now()
        }
        setNotifications(prev => [...prev, notification])
        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== notification.id))
        }, 5000)
      }
    }

    socket.on('achievement_earned', handler)
    return () => { socket.off('achievement_earned', handler) }
  }, [socket, achievements])

  const earnedIds = new Set(unlocked.map(u => u.id))

  const totalPoints = unlocked.reduce((sum, u) => {
    const achievement = achievements.find(a => a.id === u.id)
    return sum + (achievement?.points || 0)
  }, 0)

  const isUnlocked = useCallback((achievementId: number) => {
    return earnedIds.has(achievementId)
  }, [earnedIds])

  const getProgress = useCallback((_achievementId: number) => {
    // Server doesn't expose partial progress — only earned/not earned
    // If unlocked, return maxProgress; otherwise 0
    const ach = achievements.find(a => a.id === _achievementId)
    if (!ach) return 0
    if (earnedIds.has(_achievementId)) return ach.maxProgress || 1
    return 0
  }, [achievements, earnedIds])

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const getRarityColor = useCallback((rarity: Achievement['rarity']) => {
    return RARITY_COLORS[rarity]
  }, [])

  return (
    <AchievementsContext.Provider value={{
      achievements,
      unlocked,
      notifications,
      totalPoints,
      loading,
      isUnlocked,
      getProgress,
      dismissNotification,
      getRarityColor,
      refresh,
    }}>
      {children}
    </AchievementsContext.Provider>
  )
}

export function useAchievements() {
  const context = useContext(AchievementsContext)
  if (!context) {
    throw new Error('useAchievements must be used within an AchievementsProvider')
  }
  return context
}

export { RARITY_COLORS }
