"use client"

import { useState, useMemo } from 'react'
import { Search, BookOpen, Skull, Scroll, MapPin, Gem, Lock, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'

// =================================================================
// TYPES
// =================================================================
type CodexCategory = 'creatures' | 'items' | 'lore' | 'locations' | 'oghams'

interface CodexEntry {
  id: number
  category: CodexCategory
  name: string
  description: string
  discovered: boolean
  icon?: string
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  // Creature-specific
  level?: number
  element?: string
  weakness?: string
  dropTable?: string[]
  // Location-specific
  region?: string
  minLevel?: number
  // Item-specific
  type?: string
  stats?: Record<string, number>
  // Lore-specific
  chapter?: number
}

// =================================================================
// MOCK DATA
// =================================================================
const MOCK_ENTRIES: CodexEntry[] = [
  // Creatures
  { id: 1, category: 'creatures', name: 'Twisted Wolf', description: 'A corrupted wolf with glowing red eyes. Once a protector of the forests, now a mindless predator.', discovered: true, level: 5, element: 'dark', weakness: 'fire', dropTable: ['Wolf Pelt', 'Fangs', 'Corrupted Essence'], rarity: 'common' },
  { id: 2, category: 'creatures', name: 'Banshee', description: 'The wailing spirit of a Celtic maiden. Her screams can freeze the blood of the bravest warriors.', discovered: true, level: 15, element: 'spirit', weakness: 'light', dropTable: ['Ectoplasm', 'Soul Shard', 'Banshee Tear'], rarity: 'rare' },
  { id: 3, category: 'creatures', name: 'Fomorian Giant', description: 'An ancient race of demonic beings who ruled before the Tuatha De Danann.', discovered: false, level: 30, element: 'dark', weakness: 'holy', rarity: 'legendary' },
  { id: 4, category: 'creatures', name: 'Dullahan', description: 'A headless rider carrying his own head. When he stops riding, someone dies.', discovered: true, level: 25, element: 'death', weakness: 'gold', dropTable: ['Cursed Coin', 'Dullahan\'s Whip', 'Head of Sorrow'], rarity: 'epic' },
  { id: 5, category: 'creatures', name: 'Pooka', description: 'A shapeshifting trickster spirit. Can appear as a horse, rabbit, or goat.', discovered: true, level: 8, element: 'nature', weakness: 'iron', dropTable: ['Lucky Charm', 'Pooka Hair'], rarity: 'uncommon' },
  
  // Items
  { id: 101, category: 'items', name: 'Blade of Nuada', description: 'One of the Four Treasures of the Tuatha De Danann. No enemy could escape once it was drawn.', discovered: false, type: 'weapon', rarity: 'legendary', stats: { atk: 150, spd: 30 } },
  { id: 102, category: 'items', name: 'Cauldron of Plenty', description: 'The Dagda\'s cauldron that could feed an army and never empty.', discovered: true, type: 'artifact', rarity: 'legendary' },
  { id: 103, category: 'items', name: 'Iron Dagger', description: 'A simple iron blade. Effective against fae creatures.', discovered: true, type: 'weapon', rarity: 'common', stats: { atk: 12 } },
  { id: 104, category: 'items', name: 'Druidic Robe', description: 'Woven from sacred mistletoe and oak leaves. Enhances magical ability.', discovered: true, type: 'armor', rarity: 'rare', stats: { def: 20, mag: 25, mdef: 30 } },
  
  // Lore
  { id: 201, category: 'lore', name: 'The First Corruption', description: 'In the time before memory, when the land was young, the first Blood Ogham was carved. It was meant to seal away the darkness, but instead it became a doorway...', discovered: true, chapter: 1 },
  { id: 202, category: 'lore', name: 'The Twisted King', description: 'King Balor of the Fomorians possessed a single eye that could slay armies. When the Blood Moon rose, his corruption spread across the realm...', discovered: true, chapter: 2 },
  { id: 203, category: 'lore', name: 'The Order of the Void', description: '???', discovered: false, chapter: 3 },
  
  // Locations
  { id: 301, category: 'locations', name: 'Dun Aengus', description: 'An ancient stone fortress perched on a cliff. The wind carries whispers of those who fell.', discovered: true, region: 'Aran Isles', minLevel: 1 },
  { id: 302, category: 'locations', name: 'The Cursed Barrow', description: 'A burial mound that pulses with dark energy. Heroes enter, few return.', discovered: true, region: 'Meath', minLevel: 15 },
  { id: 303, category: 'locations', name: 'Tir na nOg', description: 'The Land of Eternal Youth. A realm beyond the mortal veil.', discovered: false, region: 'Beyond', minLevel: 50 },
  
  // Oghams
  { id: 401, category: 'oghams', name: 'Ogham of Fury', description: 'Carved from the bones of a berserker. Grants immense strength at the cost of control.', discovered: true, rarity: 'rare' },
  { id: 402, category: 'oghams', name: 'Ogham of the Moon', description: 'Infused with lunar essence. Powers wax and wane with the moon cycle.', discovered: true, rarity: 'epic' },
  { id: 403, category: 'oghams', name: 'Ogham of the Void', description: '???', discovered: false, rarity: 'legendary' },
]

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
  const [activeCategory, setActiveCategory] = useState<CodexCategory>('creatures')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEntry, setSelectedEntry] = useState<CodexEntry | null>(null)
  
  // Filter entries
  const filteredEntries = useMemo(() => {
    return MOCK_ENTRIES
      .filter(e => e.category === activeCategory)
      .filter(e => {
        if (!searchQuery) return true
        return e.name.toLowerCase().includes(searchQuery.toLowerCase())
      })
      .sort((a, b) => {
        // Sort by discovered first, then by level/rarity
        if (a.discovered !== b.discovered) return a.discovered ? -1 : 1
        return (a.level || 0) - (b.level || 0)
      })
  }, [activeCategory, searchQuery])
  
  // Stats for category
  const categoryStats = useMemo(() => {
    const all = MOCK_ENTRIES.filter(e => e.category === activeCategory)
    const discovered = all.filter(e => e.discovered)
    return { total: all.length, discovered: discovered.length }
  }, [activeCategory])
  
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
              style={{ width: `${(categoryStats.discovered / categoryStats.total) * 100}%` }}
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
          {filteredEntries.length === 0 ? (
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
