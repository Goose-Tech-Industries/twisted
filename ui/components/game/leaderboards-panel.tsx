"use client"
import React from 'react'

import { useState, useEffect, useCallback } from 'react'
import { Trophy, Swords, Coins, Star, Crown, Medal, Award, TrendingUp, TrendingDown, Minus, RefreshCw, Loader2, ShieldHalf } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGame } from '@/lib/game-context'
import { leaderboardApi, type LevelLeader, type PvpLeader, type WealthLeader, type GuildLeader } from '@/lib/game-api'

// Unified row shape for rendering
interface LeaderboardEntry {
  rank: number
  charId?: number
  guildId?: number
  name: string
  value: number
  className?: string
  level?: number
  guildName?: string | null
  guildTag?: string
}

type LeaderboardType = 'level' | 'pvp' | 'wealth' | 'guilds'

const LEADERBOARD_CONFIG: Record<LeaderboardType, { icon: React.ElementType; label: string; valueLabel: string; formatValue: (v: number) => string }> = {
  level: {
    icon: Star,
    label: 'Highest Level',
    valueLabel: 'Level',
    formatValue: (v) => `Lv. ${v}`
  },
  pvp: {
    icon: Swords,
    label: 'PvP Rankings',
    valueLabel: 'Wins',
    formatValue: (v) => v.toLocaleString()
  },
  wealth: {
    icon: Coins,
    label: 'Richest Players',
    valueLabel: 'Gold',
    formatValue: (v) => {
      if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`
      if (v >= 1000) return `${(v / 1000).toFixed(1)}K`
      return v.toString()
    }
  },
  guilds: {
    icon: ShieldHalf,
    label: 'Top Guilds',
    valueLabel: 'Avg Level',
    formatValue: (v) => v.toFixed(1)
  }
}

// Convert backend data to unified rows
function toLevelEntries(data: LevelLeader[]): LeaderboardEntry[] {
  return data.map(r => ({
    rank: r.rank, charId: r.charId, name: r.name, value: r.level,
    className: r.className, level: r.level, guildName: r.guildName
  }))
}
function toPvpEntries(data: PvpLeader[]): LeaderboardEntry[] {
  return data.map(r => ({
    rank: r.rank, charId: r.charId, name: r.name, value: r.wins,
    className: r.className, level: r.level, guildName: r.guildName
  }))
}
function toWealthEntries(data: WealthLeader[]): LeaderboardEntry[] {
  return data.map(r => ({
    rank: r.rank, charId: r.charId, name: r.name, value: r.gold,
    className: r.className, level: r.level, guildName: r.guildName
  }))
}
function toGuildEntries(data: GuildLeader[]): LeaderboardEntry[] {
  return data.map(r => ({
    rank: r.rank, guildId: r.guildId, name: r.name, value: parseFloat(r.avgLevel),
    guildTag: r.tag
  }))
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center">
        <Crown className="w-4 h-4 text-yellow-900" />
      </div>
    )
  }
  if (rank === 2) {
    return (
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center">
        <Medal className="w-4 h-4 text-gray-800" />
      </div>
    )
  }
  if (rank === 3) {
    return (
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center">
        <Award className="w-4 h-4 text-amber-900" />
      </div>
    )
  }
  return (
    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
      <span className="text-sm font-bold text-muted-foreground">{rank}</span>
    </div>
  )
}

export function LeaderboardsPanel() {
  const { character } = useGame()
  const [activeBoard, setActiveBoard] = useState<LeaderboardType>('level')
  const [boards, setBoards] = useState<Record<LeaderboardType, LeaderboardEntry[]>>({
    level: [], pvp: [], wealth: [], guilds: []
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const config = LEADERBOARD_CONFIG[activeBoard]
  const Icon = config.icon
  const entries = boards[activeBoard]

  const fetchBoards = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await leaderboardApi.getAll()
    if (res.success && res.data) {
      setBoards({
        level:  toLevelEntries(res.data.level || []),
        pvp:    toPvpEntries(res.data.pvp || []),
        wealth: toWealthEntries(res.data.wealth || []),
        guilds: toGuildEntries(res.data.guilds || []),
      })
    } else {
      setError(res.error || 'Failed to load leaderboards')
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchBoards() }, [fetchBoards])

  // Find the current character's rank in the active board
  const myEntry = character
    ? entries.find(e => e.charId === character.charId)
    : null

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Leaderboards</h2>
            <p className="text-xs text-muted-foreground">Updated every 60s</p>
          </div>
        </div>
        <button
          onClick={fetchBoards}
          disabled={loading}
          className="p-2 hover:bg-secondary rounded transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Board Tabs */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {(Object.keys(LEADERBOARD_CONFIG) as LeaderboardType[]).map(type => {
          const cfg = LEADERBOARD_CONFIG[type]
          const TypeIcon = cfg.icon
          return (
            <button
              key={type}
              onClick={() => setActiveBoard(type)}
              className={cn(
                "flex flex-col items-center gap-1 p-3 rounded-lg transition-all",
                activeBoard === type
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary hover:bg-secondary/80"
              )}
            >
              <TypeIcon className="w-5 h-5" />
              <span className="text-xs">{cfg.label.split(' ')[0]}</span>
            </button>
          )
        })}
      </div>

      {/* Current Board Header */}
      <div className="celtic-border rounded-lg p-3 mb-4">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">{config.label}</h3>
        </div>
      </div>

      {/* Leaderboard List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="py-4 text-center text-destructive">{error}</div>
        ) : entries.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">No data yet</div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry, index) => (
              <div
                key={entry.charId || entry.guildId || index}
                className={cn(
                  "celtic-border rounded-lg p-3 flex items-center gap-3 transition-all",
                  index < 3 && "bg-primary/5",
                  entry.charId === character?.charId && "ring-1 ring-primary"
                )}
                style={index < 3 ? {
                  boxShadow: index === 0
                    ? '0 0 20px rgba(234, 179, 8, 0.2)'
                    : index === 1
                    ? '0 0 15px rgba(156, 163, 175, 0.2)'
                    : '0 0 15px rgba(217, 119, 6, 0.2)'
                } : {}}
              >
                <RankBadge rank={entry.rank} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">{entry.name}</span>
                    {entry.guildName && (
                      <span className="text-xs px-1.5 py-0.5 bg-secondary rounded text-muted-foreground">
                        {entry.guildName}
                      </span>
                    )}
                    {entry.guildTag && !entry.guildName && (
                      <span className="text-xs px-1.5 py-0.5 bg-secondary rounded text-muted-foreground">
                        [{entry.guildTag}]
                      </span>
                    )}
                  </div>
                  {entry.className && (
                    <div className="text-xs text-muted-foreground">
                      {entry.className}
                      {entry.level && activeBoard !== 'level' && ` - Lv. ${entry.level}`}
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <div className="font-bold text-primary">{config.formatValue(entry.value)}</div>
                  <div className="text-xs text-muted-foreground">{config.valueLabel}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My Rank Footer — only if character is on the board */}
      {myEntry && (
        <div className="mt-4 celtic-border rounded-lg p-3 bg-primary/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <span className="text-sm font-bold text-primary-foreground">{myEntry.rank}</span>
            </div>

            <div className="flex-1">
              <div className="font-semibold">Your Ranking</div>
              <div className="text-xs text-muted-foreground">{myEntry.className}</div>
            </div>

            <div className="text-right">
              <div className="font-bold text-primary">{config.formatValue(myEntry.value)}</div>
              <div className="text-xs text-muted-foreground">{config.valueLabel}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
