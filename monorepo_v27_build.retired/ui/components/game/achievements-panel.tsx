"use client"

import { useState } from 'react'
import { useAchievements, ACHIEVEMENTS, type Achievement } from '@/lib/achievements-context'
import { Trophy, Lock, Star, Sword, Map, Users, Coins, Sparkles, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

const CATEGORY_ICONS: Record<Achievement['category'], React.ElementType> = {
  combat: Sword,
  exploration: Map,
  social: Users,
  wealth: Coins,
  mastery: Sparkles,
  secret: Eye
}

const CATEGORY_LABELS: Record<Achievement['category'], string> = {
  combat: 'Combat',
  exploration: 'Exploration',
  social: 'Social',
  wealth: 'Wealth',
  mastery: 'Mastery',
  secret: 'Secrets'
}

export function AchievementsPanel() {
  const { unlocked, totalPoints, isUnlocked, getProgress, getRarityColor } = useAchievements()
  const [selectedCategory, setSelectedCategory] = useState<Achievement['category'] | 'all'>('all')
  const [showLocked, setShowLocked] = useState(true)
  
  const categories: (Achievement['category'] | 'all')[] = ['all', 'combat', 'exploration', 'social', 'wealth', 'mastery', 'secret']
  
  const filteredAchievements = ACHIEVEMENTS.filter(a => {
    if (selectedCategory !== 'all' && a.category !== selectedCategory) return false
    if (!showLocked && !isUnlocked(a.id)) return false
    return true
  })
  
  const unlockedCount = unlocked.length
  const totalCount = ACHIEVEMENTS.filter(a => !a.hidden || isUnlocked(a.id)).length
  
  return (
    <div className="h-full flex flex-col">
      {/* Header Stats */}
      <div className="celtic-border rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Achievements</h2>
              <p className="text-sm text-muted-foreground">
                {unlockedCount} / {totalCount} unlocked
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">{totalPoints}</div>
            <div className="text-xs text-muted-foreground">Total Points</div>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="mt-4 h-2 bg-secondary rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${(unlockedCount / totalCount) * 100}%` }}
          />
        </div>
      </div>
      
      {/* Category Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-2">
        {categories.map(cat => {
          const Icon = cat === 'all' ? Trophy : CATEGORY_ICONS[cat]
          const label = cat === 'all' ? 'All' : CATEGORY_LABELS[cat]
          const count = cat === 'all' 
            ? unlocked.length 
            : unlocked.filter(u => ACHIEVEMENTS.find(a => a.id === u.id)?.category === cat).length
          
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded text-sm whitespace-nowrap transition-colors",
                selectedCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary hover:bg-secondary/80"
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
              <span className="text-xs opacity-70">({count})</span>
            </button>
          )
        })}
      </div>
      
      {/* Filter Toggle */}
      <div className="flex items-center gap-2 mb-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showLocked}
            onChange={e => setShowLocked(e.target.checked)}
            className="rounded border-border"
          />
          Show locked achievements
        </label>
      </div>
      
      {/* Achievements Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredAchievements.map(achievement => {
            const achieved = isUnlocked(achievement.id)
            const progress = getProgress(achievement.id)
            const isHidden = achievement.hidden && !achieved
            
            return (
              <div
                key={achievement.id}
                className={cn(
                  "celtic-border rounded-lg p-4 transition-all",
                  achieved ? "bg-primary/10" : "opacity-60"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div 
                    className={cn(
                      "w-12 h-12 rounded-lg flex items-center justify-center shrink-0",
                      achieved ? "bg-primary/30" : "bg-secondary"
                    )}
                    style={achieved ? { boxShadow: `0 0 15px ${getRarityColor(achievement.rarity)}40` } : {}}
                  >
                    {achieved ? (
                      <Star className="w-6 h-6" style={{ color: getRarityColor(achievement.rarity) }} />
                    ) : (
                      <Lock className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={cn(
                        "font-semibold truncate",
                        isHidden && "italic"
                      )}>
                        {isHidden ? '???' : achievement.name}
                      </h3>
                      <span 
                        className="text-xs px-1.5 py-0.5 rounded capitalize"
                        style={{ 
                          backgroundColor: `${getRarityColor(achievement.rarity)}20`,
                          color: getRarityColor(achievement.rarity)
                        }}
                      >
                        {achievement.rarity}
                      </span>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mt-1">
                      {isHidden ? 'Hidden achievement' : achievement.description}
                    </p>
                    
                    {/* Progress bar for progressive achievements */}
                    {achievement.maxProgress && !achieved && !isHidden && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Progress</span>
                          <span>{progress} / {achievement.maxProgress}</span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary transition-all"
                            style={{ width: `${(progress / achievement.maxProgress) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                    
                    {/* Points */}
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Trophy className="w-3 h-3" />
                      <span>{achievement.points} points</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        
        {filteredAchievements.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No achievements found in this category.
          </div>
        )}
      </div>
    </div>
  )
}
