"use client"

import { useState, useEffect } from 'react'
import { Trophy, Swords, Coins, Star, Crown, Medal, Award, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LeaderboardEntry {
  rank: number
  previousRank?: number
  charId: number
  name: string
  value: number
  className?: string
  level?: number
  guildTag?: string
}

type LeaderboardType = 'level' | 'pvp' | 'wealth' | 'achievements'

// Mock data - would come from API
const MOCK_LEADERBOARDS: Record<LeaderboardType, LeaderboardEntry[]> = {
  level: [
    { rank: 1, previousRank: 1, charId: 101, name: "Morrigan", value: 99, className: "Shadow Walker", guildTag: "VOID" },
    { rank: 2, previousRank: 3, charId: 102, name: "Cuchulain", value: 97, className: "Berserker", guildTag: "RAGE" },
    { rank: 3, previousRank: 2, charId: 103, name: "Brigid", value: 95, className: "Druid", guildTag: "HEAL" },
    { rank: 4, previousRank: 4, charId: 104, name: "Nuada", value: 94, className: "Paladin", guildTag: "VOID" },
    { rank: 5, previousRank: 7, charId: 105, name: "Lugh", value: 92, className: "Ranger" },
    { rank: 6, previousRank: 5, charId: 106, name: "Danu", value: 91, className: "Mage", guildTag: "ARCN" },
    { rank: 7, previousRank: 6, charId: 107, name: "Dagda", value: 90, className: "Warrior" },
    { rank: 8, previousRank: 8, charId: 108, name: "Aengus", value: 88, className: "Bard", guildTag: "SONG" },
    { rank: 9, previousRank: 10, charId: 109, name: "Fionn", value: 87, className: "Hunter" },
    { rank: 10, previousRank: 9, charId: 110, name: "Scathach", value: 86, className: "Shadow Walker", guildTag: "VOID" },
  ],
  pvp: [
    { rank: 1, previousRank: 2, charId: 102, name: "Cuchulain", value: 2847, className: "Berserker", guildTag: "RAGE", level: 97 },
    { rank: 2, previousRank: 1, charId: 101, name: "Morrigan", value: 2756, className: "Shadow Walker", guildTag: "VOID", level: 99 },
    { rank: 3, previousRank: 3, charId: 110, name: "Scathach", value: 2534, className: "Shadow Walker", guildTag: "VOID", level: 86 },
    { rank: 4, previousRank: 5, charId: 105, name: "Lugh", value: 2401, className: "Ranger", level: 92 },
    { rank: 5, previousRank: 4, charId: 104, name: "Nuada", value: 2389, className: "Paladin", guildTag: "VOID", level: 94 },
    { rank: 6, previousRank: 6, charId: 107, name: "Dagda", value: 2156, className: "Warrior", level: 90 },
    { rank: 7, previousRank: 9, charId: 109, name: "Fionn", value: 1987, className: "Hunter", level: 87 },
    { rank: 8, previousRank: 7, charId: 106, name: "Danu", value: 1876, className: "Mage", guildTag: "ARCN", level: 91 },
    { rank: 9, previousRank: 8, charId: 103, name: "Brigid", value: 1654, className: "Druid", guildTag: "HEAL", level: 95 },
    { rank: 10, previousRank: 10, charId: 108, name: "Aengus", value: 1432, className: "Bard", guildTag: "SONG", level: 88 },
  ],
  wealth: [
    { rank: 1, previousRank: 1, charId: 106, name: "Danu", value: 15847623, className: "Mage", guildTag: "ARCN" },
    { rank: 2, previousRank: 2, charId: 104, name: "Nuada", value: 12456789, className: "Paladin", guildTag: "VOID" },
    { rank: 3, previousRank: 4, charId: 101, name: "Morrigan", value: 9876543, className: "Shadow Walker", guildTag: "VOID" },
    { rank: 4, previousRank: 3, charId: 108, name: "Aengus", value: 8765432, className: "Bard", guildTag: "SONG" },
    { rank: 5, previousRank: 5, charId: 103, name: "Brigid", value: 7654321, className: "Druid", guildTag: "HEAL" },
    { rank: 6, previousRank: 7, charId: 102, name: "Cuchulain", value: 5432109, className: "Berserker", guildTag: "RAGE" },
    { rank: 7, previousRank: 6, charId: 105, name: "Lugh", value: 4321098, className: "Ranger" },
    { rank: 8, previousRank: 8, charId: 107, name: "Dagda", value: 3210987, className: "Warrior" },
    { rank: 9, previousRank: 9, charId: 110, name: "Scathach", value: 2109876, className: "Shadow Walker", guildTag: "VOID" },
    { rank: 10, previousRank: 11, charId: 109, name: "Fionn", value: 1098765, className: "Hunter" },
  ],
  achievements: [
    { rank: 1, previousRank: 1, charId: 101, name: "Morrigan", value: 4580, className: "Shadow Walker", guildTag: "VOID" },
    { rank: 2, previousRank: 2, charId: 103, name: "Brigid", value: 4120, className: "Druid", guildTag: "HEAL" },
    { rank: 3, previousRank: 3, charId: 106, name: "Danu", value: 3890, className: "Mage", guildTag: "ARCN" },
    { rank: 4, previousRank: 5, charId: 104, name: "Nuada", value: 3654, className: "Paladin", guildTag: "VOID" },
    { rank: 5, previousRank: 4, charId: 102, name: "Cuchulain", value: 3521, className: "Berserker", guildTag: "RAGE" },
    { rank: 6, previousRank: 6, charId: 108, name: "Aengus", value: 3245, className: "Bard", guildTag: "SONG" },
    { rank: 7, previousRank: 7, charId: 105, name: "Lugh", value: 2987, className: "Ranger" },
    { rank: 8, previousRank: 9, charId: 110, name: "Scathach", value: 2654, className: "Shadow Walker", guildTag: "VOID" },
    { rank: 9, previousRank: 8, charId: 107, name: "Dagda", value: 2432, className: "Warrior" },
    { rank: 10, previousRank: 10, charId: 109, name: "Fionn", value: 2109, className: "Hunter" },
  ]
}

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
    valueLabel: 'Rating',
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
  achievements: {
    icon: Trophy,
    label: 'Achievement Points',
    valueLabel: 'Points',
    formatValue: (v) => v.toLocaleString()
  }
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

function RankChange({ current, previous }: { current: number; previous?: number }) {
  if (!previous || current === previous) {
    return <Minus className="w-4 h-4 text-muted-foreground" />
  }
  if (current < previous) {
    return (
      <div className="flex items-center text-green-500">
        <TrendingUp className="w-4 h-4" />
        <span className="text-xs ml-0.5">+{previous - current}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center text-red-500">
      <TrendingDown className="w-4 h-4" />
      <span className="text-xs ml-0.5">-{current - previous}</span>
    </div>
  )
}

export function LeaderboardsPanel() {
  const [activeBoard, setActiveBoard] = useState<LeaderboardType>('level')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [myRank, setMyRank] = useState<LeaderboardEntry | null>(null)
  
  const config = LEADERBOARD_CONFIG[activeBoard]
  const Icon = config.icon
  
  // Simulate loading data
  useEffect(() => {
    setLoading(true)
    setTimeout(() => {
      setEntries(MOCK_LEADERBOARDS[activeBoard])
      // Mock "my" rank
      setMyRank({
        rank: 47,
        previousRank: 52,
        charId: 1,
        name: "You",
        value: activeBoard === 'level' ? 45 : activeBoard === 'pvp' ? 876 : activeBoard === 'wealth' ? 125000 : 520,
        className: "Wanderer"
      })
      setLoading(false)
    }, 300)
  }, [activeBoard])
  
  const refresh = () => {
    setLoading(true)
    setTimeout(() => setLoading(false), 500)
  }
  
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
            <p className="text-xs text-muted-foreground">Updated hourly</p>
          </div>
        </div>
        <button
          onClick={refresh}
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
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry, index) => (
              <div
                key={entry.charId}
                className={cn(
                  "celtic-border rounded-lg p-3 flex items-center gap-3 transition-all",
                  index < 3 && "bg-primary/5"
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
                
                <div className="w-8 flex justify-center">
                  <RankChange current={entry.rank} previous={entry.previousRank} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">{entry.name}</span>
                    {entry.guildTag && (
                      <span className="text-xs px-1.5 py-0.5 bg-secondary rounded text-muted-foreground">
                        [{entry.guildTag}]
                      </span>
                    )}
                  </div>
                  {entry.className && (
                    <div className="text-xs text-muted-foreground">
                      {entry.className}
                      {entry.level && ` - Lv. ${entry.level}`}
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
      
      {/* My Rank Footer */}
      {myRank && (
        <div className="mt-4 celtic-border rounded-lg p-3 bg-primary/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <span className="text-sm font-bold text-primary-foreground">{myRank.rank}</span>
            </div>
            
            <div className="w-8 flex justify-center">
              <RankChange current={myRank.rank} previous={myRank.previousRank} />
            </div>
            
            <div className="flex-1">
              <div className="font-semibold">Your Ranking</div>
              <div className="text-xs text-muted-foreground">{myRank.className}</div>
            </div>
            
            <div className="text-right">
              <div className="font-bold text-primary">{config.formatValue(myRank.value)}</div>
              <div className="text-xs text-muted-foreground">{config.valueLabel}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
