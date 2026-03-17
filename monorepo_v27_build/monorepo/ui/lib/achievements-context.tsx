"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

// =================================================================
// ACHIEVEMENT DEFINITIONS
// =================================================================

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  category: 'combat' | 'exploration' | 'social' | 'wealth' | 'mastery' | 'secret'
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  points: number
  // Progress tracking
  maxProgress?: number
  hidden?: boolean
}

export interface UnlockedAchievement {
  id: string
  unlockedAt: number
  progress?: number
}

// All achievements in the game
export const ACHIEVEMENTS: Achievement[] = [
  // Combat
  { id: 'first_blood', name: 'First Blood', description: 'Win your first battle', icon: 'sword', category: 'combat', rarity: 'common', points: 10 },
  { id: 'warrior_10', name: 'Blooded Warrior', description: 'Win 10 battles', icon: 'swords', category: 'combat', rarity: 'common', points: 20, maxProgress: 10 },
  { id: 'warrior_100', name: 'Battle-Hardened', description: 'Win 100 battles', icon: 'shield', category: 'combat', rarity: 'uncommon', points: 50, maxProgress: 100 },
  { id: 'warrior_1000', name: 'Legend of War', description: 'Win 1000 battles', icon: 'crown', category: 'combat', rarity: 'epic', points: 200, maxProgress: 1000 },
  { id: 'dragon_slayer', name: 'Dragon Slayer', description: 'Defeat an Ancient Dragon', icon: 'dragon', category: 'combat', rarity: 'legendary', points: 500 },
  { id: 'limit_breaker', name: 'Limit Breaker', description: 'Use a Limit Break in battle', icon: 'zap', category: 'combat', rarity: 'common', points: 15 },
  { id: 'untouchable', name: 'Untouchable', description: 'Win a battle without taking damage', icon: 'ghost', category: 'combat', rarity: 'rare', points: 100 },
  { id: 'comeback_king', name: 'Comeback King', description: 'Win a battle with less than 10% HP', icon: 'heart', category: 'combat', rarity: 'rare', points: 75 },
  { id: 'pvp_victor', name: 'PvP Victor', description: 'Win your first PvP battle', icon: 'users', category: 'combat', rarity: 'uncommon', points: 30 },
  { id: 'arena_champion', name: 'Arena Champion', description: 'Win 50 arena battles', icon: 'trophy', category: 'combat', rarity: 'epic', points: 150, maxProgress: 50 },
  
  // Exploration
  { id: 'first_steps', name: 'First Steps', description: 'Enter the world for the first time', icon: 'footprints', category: 'exploration', rarity: 'common', points: 5 },
  { id: 'cartographer', name: 'Cartographer', description: 'Discover 10 different maps', icon: 'map', category: 'exploration', rarity: 'uncommon', points: 40, maxProgress: 10 },
  { id: 'world_traveler', name: 'World Traveler', description: 'Visit every region', icon: 'globe', category: 'exploration', rarity: 'epic', points: 200 },
  { id: 'dungeon_delver', name: 'Dungeon Delver', description: 'Complete 5 dungeons', icon: 'castle', category: 'exploration', rarity: 'uncommon', points: 60, maxProgress: 5 },
  { id: 'treasure_hunter', name: 'Treasure Hunter', description: 'Open 50 chests', icon: 'chest', category: 'exploration', rarity: 'uncommon', points: 35, maxProgress: 50 },
  
  // Social
  { id: 'friendly', name: 'Friendly', description: 'Join a party for the first time', icon: 'users', category: 'social', rarity: 'common', points: 10 },
  { id: 'guild_member', name: 'Guild Member', description: 'Join a guild', icon: 'shield', category: 'social', rarity: 'common', points: 15 },
  { id: 'guild_founder', name: 'Guild Founder', description: 'Create your own guild', icon: 'flag', category: 'social', rarity: 'uncommon', points: 50 },
  { id: 'social_butterfly', name: 'Social Butterfly', description: 'Add 10 friends', icon: 'heart', category: 'social', rarity: 'uncommon', points: 30, maxProgress: 10 },
  { id: 'trader', name: 'Trader', description: 'Complete 10 trades', icon: 'handshake', category: 'social', rarity: 'uncommon', points: 25, maxProgress: 10 },
  
  // Wealth
  { id: 'pocket_change', name: 'Pocket Change', description: 'Earn 1,000 gold', icon: 'coins', category: 'wealth', rarity: 'common', points: 10, maxProgress: 1000 },
  { id: 'comfortable', name: 'Comfortable', description: 'Earn 10,000 gold', icon: 'wallet', category: 'wealth', rarity: 'uncommon', points: 30, maxProgress: 10000 },
  { id: 'wealthy', name: 'Wealthy', description: 'Earn 100,000 gold', icon: 'gem', category: 'wealth', rarity: 'rare', points: 75, maxProgress: 100000 },
  { id: 'tycoon', name: 'Tycoon', description: 'Earn 1,000,000 gold', icon: 'crown', category: 'wealth', rarity: 'epic', points: 200, maxProgress: 1000000 },
  { id: 'collector', name: 'Collector', description: 'Own 100 unique items', icon: 'backpack', category: 'wealth', rarity: 'rare', points: 60, maxProgress: 100 },
  
  // Mastery
  { id: 'level_10', name: 'Apprentice', description: 'Reach level 10', icon: 'star', category: 'mastery', rarity: 'common', points: 15 },
  { id: 'level_25', name: 'Journeyman', description: 'Reach level 25', icon: 'star', category: 'mastery', rarity: 'uncommon', points: 35 },
  { id: 'level_50', name: 'Expert', description: 'Reach level 50', icon: 'star', category: 'mastery', rarity: 'rare', points: 75 },
  { id: 'level_100', name: 'Master', description: 'Reach level 100', icon: 'star', category: 'mastery', rarity: 'epic', points: 200 },
  { id: 'skill_master', name: 'Skill Master', description: 'Max out a skill', icon: 'sparkles', category: 'mastery', rarity: 'rare', points: 80 },
  { id: 'ogham_bearer', name: 'Ogham Bearer', description: 'Equip 5 Blood Oghams', icon: 'droplet', category: 'mastery', rarity: 'uncommon', points: 40, maxProgress: 5 },
  { id: 'complete_set', name: 'Set Collector', description: 'Complete an Ogham family set', icon: 'layers', category: 'mastery', rarity: 'rare', points: 100 },
  
  // Secret
  { id: 'night_owl', name: 'Night Owl', description: 'Play at midnight', icon: 'moon', category: 'secret', rarity: 'uncommon', points: 25, hidden: true },
  { id: 'easter_egg', name: 'Curious Mind', description: 'Find the hidden developer room', icon: 'egg', category: 'secret', rarity: 'legendary', points: 300, hidden: true },
  { id: 'speed_demon', name: 'Speed Demon', description: 'Win a battle in under 10 seconds', icon: 'timer', category: 'secret', rarity: 'rare', points: 100, hidden: true },
  { id: 'pacifist', name: 'Pacifist', description: 'Complete a quest without fighting', icon: 'peace', category: 'secret', rarity: 'rare', points: 75, hidden: true },
]

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
  unlocked: UnlockedAchievement[]
  notifications: AchievementNotification[]
  totalPoints: number
  progress: Map<string, number>
  // Methods
  unlock: (achievementId: string) => void
  updateProgress: (achievementId: string, value: number) => void
  isUnlocked: (achievementId: string) => boolean
  getProgress: (achievementId: string) => number
  dismissNotification: (id: string) => void
  getRarityColor: (rarity: Achievement['rarity']) => string
}

const AchievementsContext = createContext<AchievementsContextValue | null>(null)

export function AchievementsProvider({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState<UnlockedAchievement[]>([])
  const [notifications, setNotifications] = useState<AchievementNotification[]>([])
  const [progress, setProgress] = useState<Map<string, number>>(new Map())
  
  // Load from localStorage
  useEffect(() => {
    const savedUnlocked = localStorage.getItem('twisted_achievements')
    const savedProgress = localStorage.getItem('twisted_achievement_progress')
    
    if (savedUnlocked) {
      try {
        setUnlocked(JSON.parse(savedUnlocked))
      } catch { /* ignore */ }
    }
    
    if (savedProgress) {
      try {
        setProgress(new Map(JSON.parse(savedProgress)))
      } catch { /* ignore */ }
    }
    
    // Demo: Unlock first_steps on load
    setTimeout(() => {
      if (!savedUnlocked?.includes('first_steps')) {
        unlock('first_steps')
      }
    }, 2000)
  }, [])
  
  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('twisted_achievements', JSON.stringify(unlocked))
  }, [unlocked])
  
  useEffect(() => {
    localStorage.setItem('twisted_achievement_progress', JSON.stringify([...progress.entries()]))
  }, [progress])
  
  const totalPoints = unlocked.reduce((sum, u) => {
    const achievement = ACHIEVEMENTS.find(a => a.id === u.id)
    return sum + (achievement?.points || 0)
  }, 0)
  
  const isUnlocked = useCallback((achievementId: string) => {
    return unlocked.some(u => u.id === achievementId)
  }, [unlocked])
  
  const getProgress = useCallback((achievementId: string) => {
    return progress.get(achievementId) || 0
  }, [progress])
  
  const unlock = useCallback((achievementId: string) => {
    if (isUnlocked(achievementId)) return
    
    const achievement = ACHIEVEMENTS.find(a => a.id === achievementId)
    if (!achievement) return
    
    const newUnlocked: UnlockedAchievement = {
      id: achievementId,
      unlockedAt: Date.now()
    }
    
    setUnlocked(prev => [...prev, newUnlocked])
    
    // Show notification
    const notification: AchievementNotification = {
      id: `${achievementId}-${Date.now()}`,
      achievement,
      timestamp: Date.now()
    }
    setNotifications(prev => [...prev, notification])
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id))
    }, 5000)
  }, [isUnlocked])
  
  const updateProgress = useCallback((achievementId: string, value: number) => {
    const achievement = ACHIEVEMENTS.find(a => a.id === achievementId)
    if (!achievement || !achievement.maxProgress) return
    if (isUnlocked(achievementId)) return
    
    const newValue = Math.min(value, achievement.maxProgress)
    setProgress(prev => new Map(prev).set(achievementId, newValue))
    
    // Check if completed
    if (newValue >= achievement.maxProgress) {
      unlock(achievementId)
    }
  }, [isUnlocked, unlock])
  
  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])
  
  const getRarityColor = useCallback((rarity: Achievement['rarity']) => {
    return RARITY_COLORS[rarity]
  }, [])
  
  return (
    <AchievementsContext.Provider value={{
      unlocked,
      notifications,
      totalPoints,
      progress,
      unlock,
      updateProgress,
      isUnlocked,
      getProgress,
      dismissNotification,
      getRarityColor
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
