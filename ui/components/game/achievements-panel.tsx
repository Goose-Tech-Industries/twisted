"use client"
import React from 'react'

import { useState } from 'react'
import { useAchievements, type Achievement, type AchievementCategory } from '@/lib/achievements-context'
import { Trophy, Lock, Star, Sword, Map, Users, Coins, Sparkles, Eye, Loader2, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

const CATEGORY_ICONS: Record<AchievementCategory, React.ElementType> = {
  combat: Sword,
  exploration: Map,
  social: Users,
  progression: TrendingUp,
  other: Sparkles
}

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  combat: 'Combat',
  exploration: 'Exploration',
  social: 'Social',
  progression: 'Progression',
  other: 'Other'
}

export function AchievementsPanel() {
  const { achievements, unlocked, totalPoints, loading, isUnlocked, getProgress, getRarityColor } = useAchievements()
  const [selectedCategory, setSelectedCategory] = useState<AchievementCategory | 'all'>('all')
  const [showLocked, setShowLocked] = useState(true)

  const categories: (AchievementCategory | 'all')[] = ['all', 'combat', 'exploration', 'social', 'progression', 'other']

  const filteredAchievements = achievements.filter(a => {
    if (selectedCategory !== 'all' && a.category !== selectedCategory) return false
    if (!showLocked && !isUnlocked(a.id)) return false
    return true
  })

  const unlockedCount = unlocked.length
  const totalCount = achievements.filter(a => !a.hidden || isUnlocked(a.id)).length

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading achievements...
      </div>
    )
  }

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
            style={{ width: `${totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0}%` }}
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
            : unlocked.filter(u => achievements.find(a => a.id === u.id)?.category === cat).length

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
                      "w-12 h-12 rounded-lg flex items-center justify-center shrink-0 text-xl",
                      achieved ? "bg-primary/30" : "bg-secondary"
                    )}
                    style={achieved ? { boxShadow: `0 0 15px ${getRarityColor(achievement.rarity)}40` } : {}}
                  >
                    {achieved ? (
                      <span>{achievement.icon}</span>
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

                    {/* Rewards */}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Trophy className="w-3 h-3" />
                        {achievement.points} pts
                      </span>
                      {achievement.rewardGold ? (
                        <span className="flex items-center gap-1 text-[oklch(0.75_0.15_85)]">
                          <Coins className="w-3 h-3" />
                          {achievement.rewardGold}g
                        </span>
                      ) : null}
                      {achievement.rewardTitle && (
                        <span className="text-primary">Title: {achievement.rewardTitle}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {filteredAchievements.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {achievements.length === 0
              ? 'No achievements defined yet.'
              : 'No achievements found in this category.'}
          </div>
        )}
      </div>
    </div>
  )
}
