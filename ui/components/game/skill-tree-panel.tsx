"use client"
import React from 'react'

import { useState, useMemo } from 'react'
import { useGame } from '@/lib/game-context'
import type { CharacterSkill } from '@/lib/game-api'
import { Zap, Swords, Sparkles, Heart, Shield, Star, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// =================================================================
// SKILL TYPE CONFIG
// =================================================================

type SkillType = 'physical' | 'magic' | 'heal' | 'buff' | 'debuff' | 'special'

const TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  physical: { icon: Swords, label: 'Physical', color: '#dc2626' },
  magic:    { icon: Sparkles, label: 'Magic', color: '#7c3aed' },
  heal:     { icon: Heart, label: 'Healing', color: '#22c55e' },
  buff:     { icon: Shield, label: 'Buffs', color: '#3b82f6' },
  debuff:   { icon: Zap, label: 'Debuffs', color: '#f59e0b' },
  special:  { icon: Star, label: 'Special', color: '#ec4899' },
}

const ELEMENT_COLORS: Record<string, string> = {
  fire: '#f97316',
  ice: '#0ea5e9',
  lightning: '#eab308',
  earth: '#84cc16',
  shadow: '#6366f1',
  holy: '#fbbf24',
  dark: '#6366f1',
  water: '#06b6d4',
  wind: '#a3e635',
}

// =================================================================
// COMPONENT
// =================================================================

export function SkillTreePanel() {
  const { state } = useGame()
  const charFull = state.charFull
  const character = state.character

  const [selectedType, setSelectedType] = useState<SkillType | 'all'>('all')
  const [selectedSkill, setSelectedSkill] = useState<CharacterSkill | null>(null)

  const skills = charFull?.skills || []
  const unspentPoints = charFull?.unspentPoints || 0

  // Group skills by type for tab counts
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of skills) {
      const t = (s.target_type || 'special').toLowerCase()
      // Map target_type to our display categories
      const mapped = t === 'enemy' ? 'physical' : t === 'self' ? 'buff' : t === 'ally' ? 'heal' : 'special'
      counts[mapped] = (counts[mapped] || 0) + 1
    }
    return counts
  }, [skills])

  const filteredSkills = useMemo(() => {
    if (selectedType === 'all') return skills
    return skills.filter(s => {
      const t = (s.target_type || 'special').toLowerCase()
      const mapped = t === 'enemy' ? 'physical' : t === 'self' ? 'buff' : t === 'ally' ? 'heal' : 'special'
      return mapped === selectedType
    })
  }, [skills, selectedType])

  if (!character) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select a character to view skills
      </div>
    )
  }

  if (!charFull) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading...
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Skills</h2>
            <p className="text-xs text-muted-foreground">
              {character.className} — {skills.length} skill{skills.length !== 1 ? 's' : ''} learned
            </p>
          </div>
        </div>

        {unspentPoints > 0 && (
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Unspent Points</div>
            <div className="font-bold text-primary">{unspentPoints}</div>
          </div>
        )}
      </div>

      {/* Type Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedType('all')}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded text-sm whitespace-nowrap transition-colors",
            selectedType === 'all'
              ? "bg-primary text-primary-foreground"
              : "bg-secondary hover:bg-secondary/80"
          )}
        >
          <Star className="w-4 h-4" />
          All
          <span className="text-xs opacity-70">({skills.length})</span>
        </button>
        {Object.entries(TYPE_CONFIG).map(([type, cfg]) => {
          const count = typeCounts[type] || 0
          if (count === 0) return null
          const Icon = cfg.icon
          return (
            <button
              key={type}
              onClick={() => setSelectedType(type as SkillType)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded text-sm whitespace-nowrap transition-colors",
                selectedType === type
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary hover:bg-secondary/80"
              )}
            >
              <Icon className="w-4 h-4" />
              {cfg.label}
              <span className="text-xs opacity-70">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Skills Grid */}
      <div className="flex-1 overflow-y-auto">
        {filteredSkills.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {skills.length === 0
              ? 'No skills learned yet. Level up to unlock skills!'
              : 'No skills in this category.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredSkills.map(skill => {
              const isSelected = selectedSkill?.id === skill.id
              const elementColor = skill.element ? ELEMENT_COLORS[skill.element.toLowerCase()] : null

              return (
                <button
                  key={skill.id}
                  onClick={() => setSelectedSkill(isSelected ? null : skill)}
                  className={cn(
                    "celtic-border rounded-lg p-4 text-left transition-all",
                    isSelected ? "bg-primary/10 border-primary/40" : "hover:bg-secondary/50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 text-xl"
                      style={{
                        backgroundColor: elementColor ? `${elementColor}20` : 'var(--secondary)',
                        boxShadow: elementColor ? `0 0 12px ${elementColor}30` : undefined,
                      }}
                    >
                      {skill.icon || '✨'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{skill.name}</h3>
                        {skill.element && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded capitalize"
                            style={{
                              backgroundColor: `${elementColor}20`,
                              color: elementColor || undefined,
                            }}
                          >
                            {skill.element}
                          </span>
                        )}
                      </div>

                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {skill.description}
                      </p>

                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="text-[oklch(0.55_0.18_260)]">
                          {skill.mp_cost} MP
                        </span>
                        <span className="capitalize">
                          {skill.target_type?.toLowerCase().replace('_', ' ')}
                        </span>
                        <span>
                          Lv. {skill.learn_level}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
