import { api } from '$phoenix/api'

export interface Recipe {
  id: number
  name: string
  result_item_id: number
  result_name: string
  result_icon?: string
  ingredients: Array<{ item_id: number; name: string; qty: number }>
  craft_time_ms?: number
  required_skill?: string
  required_level?: number
  discovered?: boolean
}

interface ListResp { success: boolean; recipes?: Recipe[] }
interface SimpleResp { success: boolean; message?: string }

function createCraftingStore() {
  let recipes = $state<Recipe[]>([])
  let crafting = $state<number | null>(null)

  return {
    get recipes() { return recipes },
    get crafting() { return crafting },

    async load() {
      const r = await api.get<ListResp>('/api/crafting/recipes')
      recipes = r.recipes ?? []
    },

    async craft(recipeId: number, qty = 1) {
      crafting = recipeId
      try {
        const r = await api.post<SimpleResp>('/api/crafting/craft', { recipeId, qty })
        return r
      } finally {
        crafting = null
      }
    }
  }
}

export const crafting = createCraftingStore()
