"use client"

import { useState, useEffect } from 'react'
import { useGame } from '@/lib/game-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Hammer, Search, ChevronRight, Check, X, Sparkles,
  Swords, Shield, FlaskConical, Gem, ScrollText
} from 'lucide-react'

interface CraftingMaterial {
  itemId: number
  name: string
  quantity: number
  owned: number
}

interface Recipe {
  id: number
  name: string
  category: 'weapons' | 'armor' | 'consumables' | 'oghams' | 'misc'
  resultItemId: number
  resultQuantity: number
  materials: CraftingMaterial[]
  craftTime: number // seconds
  reqLevel: number
  reqSkill?: string
  description?: string
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
}

const CATEGORY_ICONS: Record<Recipe['category'], typeof Swords> = {
  weapons: Swords,
  armor: Shield,
  consumables: FlaskConical,
  oghams: Gem,
  misc: ScrollText,
}

const RARITY_COLORS: Record<Recipe['rarity'], string> = {
  common: 'text-muted-foreground border-muted-foreground/30',
  uncommon: 'text-[oklch(0.55_0.15_140)] border-[oklch(0.55_0.15_140)]',
  rare: 'text-[oklch(0.55_0.18_260)] border-[oklch(0.55_0.18_260)]',
  epic: 'text-[oklch(0.60_0.25_310)] border-[oklch(0.60_0.25_310)]',
  legendary: 'text-[oklch(0.75_0.15_85)] border-[oklch(0.75_0.15_85)]',
}

// Mock recipes for demo
const MOCK_RECIPES: Recipe[] = [
  {
    id: 1,
    name: 'Iron Longsword',
    category: 'weapons',
    resultItemId: 101,
    resultQuantity: 1,
    materials: [
      { itemId: 1, name: 'Iron Ingot', quantity: 3, owned: 5 },
      { itemId: 2, name: 'Leather Strip', quantity: 1, owned: 3 },
    ],
    craftTime: 5,
    reqLevel: 5,
    rarity: 'common',
    description: 'A reliable blade forged from iron.',
  },
  {
    id: 2,
    name: 'Steel Greatsword',
    category: 'weapons',
    resultItemId: 102,
    resultQuantity: 1,
    materials: [
      { itemId: 3, name: 'Steel Ingot', quantity: 5, owned: 2 },
      { itemId: 2, name: 'Leather Strip', quantity: 2, owned: 3 },
      { itemId: 4, name: 'Ruby', quantity: 1, owned: 0 },
    ],
    craftTime: 15,
    reqLevel: 15,
    rarity: 'uncommon',
    description: 'A heavy blade that cleaves through armor.',
  },
  {
    id: 3,
    name: 'Dragonbone Blade',
    category: 'weapons',
    resultItemId: 103,
    resultQuantity: 1,
    materials: [
      { itemId: 5, name: 'Dragon Bone', quantity: 3, owned: 1 },
      { itemId: 6, name: 'Ebony Ingot', quantity: 2, owned: 4 },
      { itemId: 7, name: 'Dragon Soul Gem', quantity: 1, owned: 1 },
    ],
    craftTime: 60,
    reqLevel: 40,
    rarity: 'legendary',
    description: 'A blade infused with the essence of dragons.',
  },
  {
    id: 4,
    name: 'Leather Cuirass',
    category: 'armor',
    resultItemId: 201,
    resultQuantity: 1,
    materials: [
      { itemId: 8, name: 'Leather', quantity: 4, owned: 6 },
      { itemId: 9, name: 'Iron Buckle', quantity: 2, owned: 4 },
    ],
    craftTime: 8,
    reqLevel: 5,
    rarity: 'common',
    description: 'Basic protection for the torso.',
  },
  {
    id: 5,
    name: 'Health Potion',
    category: 'consumables',
    resultItemId: 301,
    resultQuantity: 3,
    materials: [
      { itemId: 10, name: 'Red Herb', quantity: 2, owned: 8 },
      { itemId: 11, name: 'Empty Vial', quantity: 3, owned: 10 },
    ],
    craftTime: 3,
    reqLevel: 1,
    rarity: 'common',
    description: 'Restores a moderate amount of health.',
  },
  {
    id: 6,
    name: 'Mana Elixir',
    category: 'consumables',
    resultItemId: 302,
    resultQuantity: 2,
    materials: [
      { itemId: 12, name: 'Blue Lotus', quantity: 2, owned: 3 },
      { itemId: 11, name: 'Empty Vial', quantity: 2, owned: 10 },
      { itemId: 13, name: 'Moonstone Dust', quantity: 1, owned: 2 },
    ],
    craftTime: 5,
    reqLevel: 10,
    rarity: 'uncommon',
    description: 'Restores a large amount of mana.',
  },
  {
    id: 7,
    name: 'Ogham of Fury',
    category: 'oghams',
    resultItemId: 401,
    resultQuantity: 1,
    materials: [
      { itemId: 14, name: 'Blood Stone', quantity: 2, owned: 1 },
      { itemId: 15, name: 'Ancient Rune', quantity: 1, owned: 2 },
      { itemId: 16, name: 'Flame Essence', quantity: 3, owned: 5 },
    ],
    craftTime: 30,
    reqLevel: 25,
    rarity: 'epic',
    description: 'Carved in rage. Adds fire damage to attacks.',
  },
]

export function CraftingPanel() {
  const { character, notify } = useGame()
  const [recipes, setRecipes] = useState<Recipe[]>(MOCK_RECIPES)
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<Recipe['category'] | 'all'>('all')
  const [isCrafting, setIsCrafting] = useState(false)
  const [craftProgress, setCraftProgress] = useState(0)
  
  const filteredRecipes = recipes.filter(recipe => {
    const matchesSearch = recipe.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || recipe.category === selectedCategory
    return matchesSearch && matchesCategory
  })
  
  const canCraft = (recipe: Recipe): boolean => {
    if (!character || character.level < recipe.reqLevel) return false
    return recipe.materials.every(mat => mat.owned >= mat.quantity)
  }
  
  const handleCraft = async (recipe: Recipe) => {
    if (!canCraft(recipe) || isCrafting) return
    
    setIsCrafting(true)
    setCraftProgress(0)
    
    // Simulate crafting progress
    const interval = setInterval(() => {
      setCraftProgress(prev => {
        const next = prev + (100 / recipe.craftTime)
        if (next >= 100) {
          clearInterval(interval)
          return 100
        }
        return next
      })
    }, 1000)
    
    // Wait for craft to complete
    await new Promise(resolve => setTimeout(resolve, recipe.craftTime * 1000))
    
    setIsCrafting(false)
    setCraftProgress(0)
    
    // Update materials (subtract used)
    setRecipes(prev => prev.map(r => {
      if (r.id !== recipe.id) return r
      return {
        ...r,
        materials: r.materials.map(mat => ({
          ...mat,
          owned: mat.owned - mat.quantity,
        })),
      }
    }))
    
    notify('success', `Crafted ${recipe.resultQuantity}x ${recipe.name}!`)
  }
  
  const categories: (Recipe['category'] | 'all')[] = ['all', 'weapons', 'armor', 'consumables', 'oghams', 'misc']
  
  return (
    <div className="h-full overflow-hidden flex flex-col p-4">
      <div className="flex items-center gap-4 mb-4">
        <Hammer className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold">Crafting Station</h1>
      </div>
      
      <div className="flex gap-4 flex-1 overflow-hidden">
        {/* Recipe List */}
        <div className="w-80 flex flex-col gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search recipes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          
          {/* Categories */}
          <div className="flex flex-wrap gap-1">
            {categories.map(cat => {
              const Icon = cat === 'all' ? Sparkles : CATEGORY_ICONS[cat]
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded text-xs font-medium capitalize flex items-center gap-1.5 transition-colors ${
                    selectedCategory === cat
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {cat}
                </button>
              )
            })}
          </div>
          
          {/* Recipe List */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {filteredRecipes.map(recipe => {
              const craftable = canCraft(recipe)
              return (
                <button
                  key={recipe.id}
                  onClick={() => setSelectedRecipe(recipe)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedRecipe?.id === recipe.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-card hover:border-primary/50'
                  } ${!craftable ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-medium ${RARITY_COLORS[recipe.rarity].split(' ')[0]}`}>
                      {recipe.name}
                    </span>
                    {craftable ? (
                      <Check className="w-4 h-4 text-[oklch(0.55_0.15_140)]" />
                    ) : (
                      <X className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span className="capitalize">{recipe.category}</span>
                    <span>-</span>
                    <span>Lv.{recipe.reqLevel}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
        
        {/* Recipe Details */}
        <div className="flex-1 overflow-y-auto">
          {selectedRecipe ? (
            <Card className="celtic-border h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className={RARITY_COLORS[selectedRecipe.rarity].split(' ')[0]}>
                    {selectedRecipe.name}
                  </CardTitle>
                  <span className={`text-xs px-2 py-1 rounded border capitalize ${RARITY_COLORS[selectedRecipe.rarity]}`}>
                    {selectedRecipe.rarity}
                  </span>
                </div>
                {selectedRecipe.description && (
                  <p className="text-sm text-muted-foreground italic">
                    {selectedRecipe.description}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Requirements */}
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Requirements
                  </h4>
                  <div className="flex items-center gap-4 text-sm">
                    <span className={character && character.level >= selectedRecipe.reqLevel 
                      ? 'text-[oklch(0.55_0.15_140)]' 
                      : 'text-[oklch(0.55_0.22_25)]'
                    }>
                      Level {selectedRecipe.reqLevel}
                    </span>
                    {selectedRecipe.reqSkill && (
                      <span className="text-muted-foreground">
                        {selectedRecipe.reqSkill}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Materials */}
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Materials
                  </h4>
                  <div className="space-y-2">
                    {selectedRecipe.materials.map((mat, idx) => {
                      const hasEnough = mat.owned >= mat.quantity
                      return (
                        <div 
                          key={idx}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            hasEnough ? 'border-border bg-card/50' : 'border-destructive/30 bg-destructive/5'
                          }`}
                        >
                          <span className="font-medium">{mat.name}</span>
                          <span className={`tabular-nums ${hasEnough ? 'text-[oklch(0.55_0.15_140)]' : 'text-destructive'}`}>
                            {mat.owned} / {mat.quantity}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
                
                {/* Result */}
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Result
                  </h4>
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
                    <div className="w-10 h-10 rounded bg-primary/20 flex items-center justify-center">
                      {(() => {
                        const Icon = CATEGORY_ICONS[selectedRecipe.category]
                        return <Icon className="w-5 h-5 text-primary" />
                      })()}
                    </div>
                    <div>
                      <p className={`font-medium ${RARITY_COLORS[selectedRecipe.rarity].split(' ')[0]}`}>
                        {selectedRecipe.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Quantity: {selectedRecipe.resultQuantity}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Craft Button */}
                <div className="pt-4 border-t border-border">
                  {isCrafting ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Crafting...</span>
                        <span className="tabular-nums">{Math.round(craftProgress)}%</span>
                      </div>
                      <div className="h-3 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-1000 rounded-full"
                          style={{ width: `${craftProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => handleCraft(selectedRecipe)}
                      disabled={!canCraft(selectedRecipe)}
                      className="w-full"
                    >
                      <Hammer className="w-4 h-4 mr-2" />
                      Craft ({selectedRecipe.craftTime}s)
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Hammer className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>Select a recipe to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
