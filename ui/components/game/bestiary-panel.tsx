"use client"

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Search, BookOpen, Skull, Scroll, MapPin, Gem, Lock, ChevronRight, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useGame } from '@/lib/game-context'
import { codexApi, type CodexCategory, type CodexEntry, type CodexStats } from '@/lib/game-api'

// =================================================================
// CATEGORY CONFIG
// =================================================================
const CATEGORIES: { id: CodexCategory; label: string; icon: typeof Skull }[] = [
  { id: 'creatures', label: 'Bestiary', icon: Skull },
  { id: 'items', label: 'Artifacts', icon: Gem },
  { id: 'lore', label: 'Lore', icon: Scroll },
  { id: 'locations', label: 'Locations', icon: MapPin },
  { id: 'oghams', label: 'Blood Oghams', icon: BookOpen },
]

const RARITY_COLORS: Record<string, string> = {
  common: 'text-gray-400 border-gray-500',
  uncommon: 'text-green-400 border-green-500',
  rare: 'text-blue-400 border-blue-500',
  epic: 'text-purple-400 border-purple-500',
  legendary: 'text-orange-400 border-orange-500',
}

// =================================================================
// COMPONENT
// =================================================================
export function BestiaryPanel() {
  const { state } = useGame()
  const charId = state.character?.charId

  const [activeCategory, setActiveCategory] = useState<CodexCategory>('creatures')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEntry, setSelectedEntry] = useState<CodexEntry | null>(null)

  const [entries, setEntries] = useState<CodexEntry[]>([])
  const [stats, setStats] = useState<CodexStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch entries when category or character changes
  const fetchEntries = useCallback(async () => {
    if (!charId) return
    setLoading(true)
    setError(null)
    const res = await codexApi.getEntries(charId, activeCategory)
    if (res.success && res.data) {
      setEntries(res.data.entries)
    } else {
      setError(res.error || 'Failed to load codex entries')
      setEntries([])
    }
    setLoading(false)
  }, [charId, activeCategory])

  // Fetch stats once on mount and when character changes
  const fetchStats = useCallback(async () => {
    if (!charId) return
    const res = await codexApi.getStats(charId)
    if (res.success && res.data) {
      setStats(res.data.stats)
    }
  }, [charId])

  useEffect(() => { fetchEntries() }, [fetchEntries])
  useEffect(() => { fetchStats() }, [fetchStats])

  // Filter & sort entries from API
  const filteredEntries = useMemo(() => {
    return entries
      .filter(e => {
        if (!searchQuery) return true
        return e.name.toLowerCase().includes(searchQuery.toLowerCase())
      })
      .sort((a, b) => {
        if (a.discovered !== b.discovered) return a.discovered ? -1 : 1
        return (a.level || 0) - (b.level || 0)
      })
  }, [entries, searchQuery])

  // Stats for active category
  const categoryStats = useMemo(() => {
    const found = stats.find(s => s.category === activeCategory)
    return found || { total: 0, discovered: 0 }
  }, [stats, activeCategory])

  if (!charId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select a character to view the Codex
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          Codex
        </h2>

        {/* Category Tabs */}
        <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id)
                setSelectedEntry(null)
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm whitespace-nowrap transition-colors ${
                activeCategory === cat.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary hover:bg-secondary/80 text-muted-foreground'
              }`}
            >
              <cat.icon className="w-4 h-4" />
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search entries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-secondary/50"
          />
        </div>

        {/* Discovery Progress */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${categoryStats.total > 0 ? (categoryStats.discovered / categoryStats.total) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {categoryStats.discovered}/{categoryStats.total}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Entry List */}
        <div className="w-1/2 overflow-y-auto border-r border-border">
          {loading ? (
            <div className="p-4 flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading...
            </div>
          ) : error ? (
            <div className="p-4 text-center text-destructive">{error}</div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              No entries found
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredEntries.map(entry => (
                <button
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  className={`w-full p-3 text-left hover:bg-secondary/50 transition-colors flex items-center gap-3 ${
                    selectedEntry?.id === entry.id ? 'bg-secondary' : ''
                  }`}
                >
                  {/* Lock icon for undiscovered */}
                  {!entry.discovered ? (
                    <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center">
                      <Lock className="w-5 h-5 text-muted-foreground" />
                    </div>
                  ) : (
                    <div className={`w-10 h-10 rounded bg-secondary flex items-center justify-center border ${
                      entry.rarity ? RARITY_COLORS[entry.rarity] : ''
                    }`}>
                      {activeCategory === 'creatures' && <Skull className="w-5 h-5" />}
                      {activeCategory === 'items' && <Gem className="w-5 h-5" />}
                      {activeCategory === 'lore' && <Scroll className="w-5 h-5" />}
                      {activeCategory === 'locations' && <MapPin className="w-5 h-5" />}
                      {activeCategory === 'oghams' && <BookOpen className="w-5 h-5" />}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${!entry.discovered ? 'text-muted-foreground' : ''}`}>
                      {entry.discovered ? entry.name : '???'}
                    </p>
                    {entry.discovered && (
                      <p className="text-xs text-muted-foreground truncate">
                        {entry.level && `Lv.${entry.level}`}
                        {entry.region && entry.region}
                        {entry.chapter && `Chapter ${entry.chapter}`}
                        {entry.type && entry.type}
                        {entry.rarity && !entry.level && !entry.region && !entry.chapter && !entry.type && (
                          <span className={RARITY_COLORS[entry.rarity]?.split(' ')[0]}>
                            {entry.rarity}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Entry Detail */}
        <div className="w-1/2 overflow-y-auto p-4">
          {!selectedEntry ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              Select an entry to view details
            </div>
          ) : !selectedEntry.discovered ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <Lock className="w-12 h-12 mb-3" />
              <p className="font-medium">Undiscovered</p>
              <p className="text-sm">Explore the world to unlock this entry</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {selectedEntry.rarity && (
                    <span className={`text-xs px-2 py-0.5 rounded border ${RARITY_COLORS[selectedEntry.rarity]}`}>
                      {selectedEntry.rarity}
                    </span>
                  )}
                  {selectedEntry.level && (
                    <span className="text-xs text-muted-foreground">Level {selectedEntry.level}</span>
                  )}
                </div>
                <h3 className="text-xl font-bold">{selectedEntry.name}</h3>
              </div>

              {/* Description */}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {selectedEntry.description}
              </p>

              {/* Creature Stats */}
              {selectedEntry.category === 'creatures' && (
                <div className="space-y-2">
                  {selectedEntry.element && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Element</span>
                      <span className="capitalize">{selectedEntry.element}</span>
                    </div>
                  )}
                  {selectedEntry.weakness && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Weakness</span>
                      <span className="capitalize text-red-400">{selectedEntry.weakness}</span>
                    </div>
                  )}
                  {selectedEntry.dropTable && selectedEntry.dropTable.length > 0 && (
                    <div className="pt-2">
                      <p className="text-sm text-muted-foreground mb-1">Drops</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedEntry.dropTable.map(item => (
                          <span key={item} className="text-xs px-2 py-1 bg-secondary rounded">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Item Stats */}
              {selectedEntry.category === 'items' && selectedEntry.stats && (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(selectedEntry.stats).map(([stat, value]) => (
                    <div key={stat} className="flex justify-between text-sm p-2 bg-secondary/50 rounded">
                      <span className="text-muted-foreground uppercase">{stat}</span>
                      <span className="text-green-400">+{value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Location Info */}
              {selectedEntry.category === 'locations' && (
                <div className="space-y-2">
                  {selectedEntry.region && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Region</span>
                      <span>{selectedEntry.region}</span>
                    </div>
                  )}
                  {selectedEntry.minLevel && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Recommended Level</span>
                      <span>{selectedEntry.minLevel}+</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
