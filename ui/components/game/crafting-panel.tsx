"use client"
import React from 'react'

import { useState, useEffect, useCallback } from 'react'
import { useGame } from '@/lib/game-context'
import { craftingApi, type CraftRecipe } from '@/lib/game-api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Hammer, Search, Check, X, Sparkles, Loader2,
  Swords, Shield, FlaskConical, Gem, ScrollText
} from 'lucide-react'

type RecipeCategory = 'weapons' | 'armor' | 'consumables' | 'oghams' | 'misc'

const CATEGORY_ICONS: Record<string, typeof Swords> = {
  weapons: Swords,
  armor: Shield,
  consumables: FlaskConical,
  oghams: Gem,
  misc: ScrollText,
}

const RARITY_COLORS: Record<string, string> = {
  common: 'text-muted-foreground border-muted-foreground/30',
  uncommon: 'text-[oklch(0.55_0.15_140)] border-[oklch(0.55_0.15_140)]',
  rare: 'text-[oklch(0.55_0.18_260)] border-[oklch(0.55_0.18_260)]',
  epic: 'text-[oklch(0.60_0.25_310)] border-[oklch(0.60_0.25_310)]',
  legendary: 'text-[oklch(0.75_0.15_85)] border-[oklch(0.75_0.15_85)]',
}

// Map backend category values (may be uppercase) to display categories
function normalizeCategory(cat: string): RecipeCategory {
  const lower = cat.toLowerCase()
  if (lower === 'weapon' || lower === 'weapons') return 'weapons'
  if (lower === 'armor') return 'armor'
  if (lower === 'consumable' || lower === 'consumables') return 'consumables'
  if (lower === 'ogham' || lower === 'oghams') return 'oghams'
  return 'misc'
}

// Derive a rarity from the result item or recipe name (backend doesn't store rarity on recipes)
function inferRarity(_recipe: CraftRecipe): string {
  return 'common'
}

export function CraftingPanel() {
  const { character, notify } = useGame()
  const charId = character?.charId

  const [recipes, setRecipes] = useState<CraftRecipe[]>([])
  const [itemNames, setItemNames] = useState<Record<string, { name: string; icon: string }>>({})
  const [selectedRecipe, setSelectedRecipe] = useState<CraftRecipe | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<RecipeCategory | 'all'>('all')
  const [isCrafting, setIsCrafting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRecipes = useCallback(async () => {
    if (!charId) return
    setLoading(true)
    setError(null)
    const res = await craftingApi.getRecipes(charId)
    if (res.success && res.data) {
      setRecipes(res.data.recipes)
      setItemNames(res.data.itemNames || {})
    } else {
      setError(res.error || 'Failed to load recipes')
      setRecipes([])
    }
    setLoading(false)
  }, [charId])

  useEffect(() => { fetchRecipes() }, [fetchRecipes])

  const filteredRecipes = recipes.filter(recipe => {
    const matchesSearch = recipe.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || normalizeCategory(recipe.category) === selectedCategory
    return matchesSearch && matchesCategory
  })

  const canCraft = (recipe: CraftRecipe): boolean => {
    if (!character || character.level < recipe.level_req) return false
    return recipe.canCraft
  }

  const handleCraft = async (recipe: CraftRecipe) => {
    if (!charId || !canCraft(recipe) || isCrafting) return

    setIsCrafting(true)
    const res = await craftingApi.craft(charId, recipe.id)
    setIsCrafting(false)

    if (res.success) {
      notify('success', res.data?.message || `Crafted ${recipe.result_qty}x ${recipe.result_name}!`)
      // Refresh recipes to get updated ingredient counts
      await fetchRecipes()
      // Update selected recipe if still viewing same one
      setSelectedRecipe(prev => {
        if (!prev || prev.id !== recipe.id) return prev
        const updated = recipes.find(r => r.id === recipe.id)
        return updated || prev
      })
    } else {
      notify('error', res.error || res.message || 'Crafting failed.')
    }
  }

  const categories: (RecipeCategory | 'all')[] = ['all', 'weapons', 'armor', 'consumables', 'oghams', 'misc']

  if (!charId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select a character to access crafting
      </div>
    )
  }

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
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading...
              </div>
            ) : error ? (
              <div className="py-4 text-center text-destructive">{error}</div>
            ) : filteredRecipes.length === 0 ? (
              <div className="py-4 text-center text-muted-foreground">No recipes found</div>
            ) : (
              filteredRecipes.map(recipe => {
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
                      <span className="font-medium">
                        {recipe.icon || '🔨'} {recipe.name}
                      </span>
                      {craftable ? (
                        <Check className="w-4 h-4 text-[oklch(0.55_0.15_140)]" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="capitalize">{normalizeCategory(recipe.category)}</span>
                      <span>-</span>
                      <span>Lv.{recipe.level_req}</span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Recipe Details */}
        <div className="flex-1 overflow-y-auto">
          {selectedRecipe ? (
            <Card className="celtic-border h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    {selectedRecipe.icon || '🔨'} {selectedRecipe.name}
                  </CardTitle>
                  <span className="text-xs px-2 py-1 rounded border capitalize text-muted-foreground border-muted-foreground/30">
                    {normalizeCategory(selectedRecipe.category)}
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
                    <span className={character && character.level >= selectedRecipe.level_req
                      ? 'text-[oklch(0.55_0.15_140)]'
                      : 'text-[oklch(0.55_0.22_25)]'
                    }>
                      Level {selectedRecipe.level_req}
                    </span>
                    {selectedRecipe.skill_req && (
                      <span className="text-muted-foreground">
                        {selectedRecipe.skill_req}
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
                    {selectedRecipe.ingredients.map((ing, idx) => {
                      const hasEnough = ing.qty_owned >= ing.qty_needed
                      const info = itemNames[ing.item_id]
                      const matName = info?.name || `Item #${ing.item_id}`
                      return (
                        <div
                          key={idx}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            hasEnough ? 'border-border bg-card/50' : 'border-destructive/30 bg-destructive/5'
                          }`}
                        >
                          <span className="font-medium">
                            {info?.icon || '📦'} {matName}
                          </span>
                          <span className={`tabular-nums ${hasEnough ? 'text-[oklch(0.55_0.15_140)]' : 'text-destructive'}`}>
                            {ing.qty_owned} / {ing.qty_needed}
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
                        const Icon = CATEGORY_ICONS[normalizeCategory(selectedRecipe.category)] || ScrollText
                        return <Icon className="w-5 h-5 text-primary" />
                      })()}
                    </div>
                    <div>
                      <p className="font-medium">
                        {selectedRecipe.result_icon || '📦'} {selectedRecipe.result_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Quantity: {selectedRecipe.result_qty}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Craft Button */}
                <div className="pt-4 border-t border-border">
                  <Button
                    onClick={() => handleCraft(selectedRecipe)}
                    disabled={!canCraft(selectedRecipe) || isCrafting}
                    className="w-full"
                  >
                    {isCrafting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Hammer className="w-4 h-4 mr-2" />
                    )}
                    {isCrafting ? 'Crafting...' : 'Craft'}
                  </Button>
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
