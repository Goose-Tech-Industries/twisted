"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronRight } from "lucide-react"
import adminApi, { EntityType } from "@/lib/admin-api"

interface EntityConfig {
  type: EntityType
  title: string
  icon: string
  fields: FieldConfig[]
  listColumns: string[]
}

interface FieldConfig {
  name: string
  label: string
  type: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'json' | 'icon'
  options?: { value: string; label: string }[]
  required?: boolean
  placeholder?: string
  default?: unknown
}

// Configuration for each entity type
const ENTITY_CONFIGS: Record<string, EntityConfig> = {
  items: {
    type: 'item',
    title: 'Items',
    icon: 'Package',
    listColumns: ['icon', 'name', 'type', 'rarity', 'value'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon', placeholder: 'Sword' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'type', label: 'Type', type: 'select', options: [
        { value: 'weapon', label: 'Weapon' },
        { value: 'armor', label: 'Armor' },
        { value: 'accessory', label: 'Accessory' },
        { value: 'consumable', label: 'Consumable' },
        { value: 'material', label: 'Material' },
        { value: 'quest', label: 'Quest Item' }
      ]},
      { name: 'rarity', label: 'Rarity', type: 'select', options: [
        { value: 'common', label: 'Common' },
        { value: 'uncommon', label: 'Uncommon' },
        { value: 'rare', label: 'Rare' },
        { value: 'epic', label: 'Epic' },
        { value: 'legendary', label: 'Legendary' }
      ]},
      { name: 'value', label: 'Gold Value', type: 'number', default: 0 },
      { name: 'equip_slot', label: 'Equip Slot', type: 'select', options: [
        { value: '', label: 'None' },
        { value: 'weapon', label: 'Weapon' },
        { value: 'offhand', label: 'Off-hand' },
        { value: 'head', label: 'Head' },
        { value: 'body', label: 'Body' },
        { value: 'hands', label: 'Hands' },
        { value: 'feet', label: 'Feet' },
        { value: 'ring', label: 'Ring' },
        { value: 'amulet', label: 'Amulet' }
      ]},
      { name: 'stats', label: 'Stat Bonuses (JSON)', type: 'json', placeholder: '{"atk": 5, "def": 3}' },
      { name: 'stackable', label: 'Stackable', type: 'checkbox' },
      { name: 'max_stack', label: 'Max Stack', type: 'number', default: 99 }
    ]
  },
  skills: {
    type: 'skill',
    title: 'Skills',
    icon: 'Sparkles',
    listColumns: ['icon', 'name', 'type', 'target_type'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon', placeholder: 'Flame' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'battle_text', label: 'Battle Text', type: 'text', placeholder: '{name} casts {skill}!' },
      { name: 'type', label: 'Type', type: 'select', options: [
        { value: 'physical', label: 'Physical' },
        { value: 'magic', label: 'Magic' },
        { value: 'heal', label: 'Heal' },
        { value: 'buff', label: 'Buff' },
        { value: 'debuff', label: 'Debuff' },
        { value: 'special', label: 'Special' }
      ]},
      { name: 'target_type', label: 'Target', type: 'select', options: [
        { value: 'ENEMY', label: 'Enemy' },
        { value: 'SELF', label: 'Self' },
        { value: 'ALLY', label: 'Ally' },
        { value: 'ALL', label: 'All' }
      ]},
      { name: 'mp_cost', label: 'MP Cost', type: 'number', default: 0 },
      { name: 'cooldown', label: 'Cooldown (turns)', type: 'number', default: 0 },
      { name: 'effects', label: 'Effects (JSON)', type: 'json', placeholder: '{"damage": {"formula": "atk * 1.5"}}' }
    ]
  },
  npcs: {
    type: 'npc',
    title: 'NPCs & Enemies',
    icon: 'Skull',
    listColumns: ['icon', 'name', 'is_enemy', 'level', 'map_id'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon', placeholder: 'Ghost' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'is_enemy', label: 'Is Enemy', type: 'checkbox' },
      { name: 'level', label: 'Level', type: 'number', default: 1 },
      { name: 'map_id', label: 'Map ID', type: 'number' },
      { name: 'x', label: 'X Position', type: 'number', default: 5 },
      { name: 'y', label: 'Y Position', type: 'number', default: 5 },
      { name: 'hp', label: 'Max HP', type: 'number', default: 100 },
      { name: 'mp', label: 'Max MP', type: 'number', default: 50 },
      { name: 'atk', label: 'Attack', type: 'number', default: 10 },
      { name: 'def', label: 'Defense', type: 'number', default: 5 },
      { name: 'speed', label: 'Speed', type: 'number', default: 5 },
      { name: 'exp_reward', label: 'EXP Reward', type: 'number', default: 10 },
      { name: 'gold_reward', label: 'Gold Reward', type: 'number', default: 5 },
      { name: 'skills', label: 'Skills (JSON array)', type: 'json', placeholder: '[1, 2, 3]' },
      { name: 'drop_table_json', label: 'Loot Table (JSON)', type: 'json', placeholder: '[{"item_id": 1, "chance": 50}]' },
      { name: 'dialogue_script', label: 'Dialogue Script', type: 'textarea' }
    ]
  },
  quests: {
    type: 'quest',
    title: 'Quests',
    icon: 'ScrollText',
    listColumns: ['name', 'type', 'min_level', 'repeatable'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'type', label: 'Type', type: 'select', options: [
        { value: 'MAIN', label: 'Main Story' },
        { value: 'SIDE', label: 'Side Quest' },
        { value: 'BOUNTY', label: 'Bounty' },
        { value: 'DAILY', label: 'Daily' },
        { value: 'EVENT', label: 'Event' }
      ]},
      { name: 'giver_npc_id', label: 'Quest Giver NPC ID', type: 'number' },
      { name: 'min_level', label: 'Min Level', type: 'number', default: 1 },
      { name: 'repeatable', label: 'Repeatable', type: 'checkbox' },
      { name: 'objectives', label: 'Objectives (JSON)', type: 'json', placeholder: '[{"type": "KILL", "target": 1, "count": 5}]' },
      { name: 'rewards', label: 'Rewards (JSON)', type: 'json', placeholder: '{"exp": 100, "gold": 50, "items": []}' },
      { name: 'prerequisites', label: 'Prerequisites (JSON)', type: 'json', placeholder: '{"quests": [], "level": 1}' }
    ]
  },
  classes: {
    type: 'class',
    title: 'Classes',
    icon: 'Shield',
    listColumns: ['icon', 'name', 'base_hp', 'base_atk'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon', placeholder: 'Sword' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'base_hp', label: 'Base HP', type: 'number', default: 100 },
      { name: 'base_mp', label: 'Base MP', type: 'number', default: 50 },
      { name: 'base_atk', label: 'Base ATK', type: 'number', default: 10 },
      { name: 'base_def', label: 'Base DEF', type: 'number', default: 5 },
      { name: 'base_matk', label: 'Base MATK', type: 'number', default: 5 },
      { name: 'base_mdef', label: 'Base MDEF', type: 'number', default: 5 },
      { name: 'base_speed', label: 'Base Speed', type: 'number', default: 5 },
      { name: 'growth_rates', label: 'Growth Rates (JSON)', type: 'json', placeholder: '{"hp": 15, "mp": 5, "atk": 3}' },
      { name: 'skills_by_level', label: 'Skills by Level (JSON)', type: 'json', placeholder: '{"1": [1], "5": [2, 3]}' }
    ]
  },
  races: {
    type: 'race',
    title: 'Races',
    icon: 'UserCog',
    listColumns: ['icon', 'name'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon', placeholder: 'User' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'stat_modifiers', label: 'Stat Modifiers (JSON)', type: 'json', placeholder: '{"hp": 10, "speed": -2}' },
      { name: 'abilities', label: 'Racial Abilities (JSON)', type: 'json', placeholder: '["night_vision", "poison_resist"]' }
    ]
  },
  maps: {
    type: 'map',
    title: 'Maps',
    icon: 'Map',
    listColumns: ['name', 'width', 'height', 'min_level'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'width', label: 'Width', type: 'number', default: 20 },
      { name: 'height', label: 'Height', type: 'number', default: 20 },
      { name: 'min_level', label: 'Min Level', type: 'number', default: 1 },
      { name: 'ambient_dark', label: 'Ambient Darkness (0-1)', type: 'number', default: 0 },
      { name: 'tiles', label: 'Tile Data (JSON)', type: 'json', placeholder: '[0, 0, 1, 0, ...]' },
      { name: 'events', label: 'Map Events (JSON)', type: 'json', placeholder: '[{"type": "TELEPORT", "x": 10, "y": 5}]' },
      { name: 'background', label: 'Background Image', type: 'text' }
    ]
  },
  shops: {
    type: 'shop',
    title: 'Shops',
    icon: 'Store',
    listColumns: ['name', 'npc_id', 'markup'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'npc_id', label: 'Shop NPC ID', type: 'number' },
      { name: 'markup', label: 'Price Markup %', type: 'number', default: 100 },
      { name: 'inventory', label: 'Shop Inventory (JSON)', type: 'json', placeholder: '[{"item_id": 1, "stock": -1}]' }
    ]
  },
  arenas: {
    type: 'arena',
    title: 'Arenas',
    icon: 'Swords',
    listColumns: ['name', 'type', 'min_level', 'max_level', 'enabled'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'map_id', label: 'Arena Map ID', type: 'number' },
      { name: 'type', label: 'Type', type: 'select', options: [
        { value: 'OPEN_PVP', label: 'Open PvP' },
        { value: 'QUEUE', label: 'Queue Match' },
        { value: 'TOURNAMENT', label: 'Tournament' },
        { value: 'KING_OF_HILL', label: 'King of the Hill' }
      ]},
      { name: 'min_level', label: 'Min Level', type: 'number', default: 1 },
      { name: 'max_level', label: 'Max Level', type: 'number', default: 99 },
      { name: 'entry_fee', label: 'Entry Fee', type: 'number', default: 0 },
      { name: 'reward_multiplier', label: 'Reward Multiplier', type: 'number', default: 1 },
      { name: 'max_players', label: 'Max Players', type: 'number', default: 20 },
      { name: 'enabled', label: 'Enabled', type: 'checkbox' }
    ]
  },
  oghams: {
    type: 'ogham',
    title: 'Blood Oghams',
    icon: 'Wand2',
    listColumns: ['icon', 'name', 'family_id', 'element_attack'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon', placeholder: 'Flame' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'family_id', label: 'Family ID', type: 'number' },
      { name: 'element_attack', label: 'Element Attack', type: 'select', options: [
        { value: '', label: 'None' },
        { value: 'fire', label: 'Fire' },
        { value: 'ice', label: 'Ice' },
        { value: 'lightning', label: 'Lightning' },
        { value: 'earth', label: 'Earth' },
        { value: 'dark', label: 'Dark' },
        { value: 'light', label: 'Light' }
      ]},
      { name: 'stat_bonus', label: 'Stat Bonus (JSON)', type: 'json', placeholder: '{"atk": 5, "luck": 3}' },
      { name: 'on_hit_status', label: 'On-Hit Status', type: 'text' },
      { name: 'on_hit_chance', label: 'On-Hit Chance %', type: 'number', default: 0 }
    ]
  },
  status: {
    type: 'status',
    title: 'Status Effects',
    icon: 'Droplets',
    listColumns: ['icon', 'name', 'type', 'duration'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon', placeholder: 'Flame' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'type', label: 'Type', type: 'select', options: [
        { value: 'buff', label: 'Buff' },
        { value: 'debuff', label: 'Debuff' },
        { value: 'dot', label: 'Damage over Time' },
        { value: 'hot', label: 'Heal over Time' },
        { value: 'cc', label: 'Crowd Control' }
      ]},
      { name: 'duration', label: 'Duration (turns)', type: 'number', default: 3 },
      { name: 'stackable', label: 'Stackable', type: 'checkbox' },
      { name: 'max_stacks', label: 'Max Stacks', type: 'number', default: 1 },
      { name: 'effects', label: 'Effects (JSON)', type: 'json', placeholder: '{"stat_mod": {"atk": -10}, "dot": 5}' }
    ]
  },
  feats: {
    type: 'feat',
    title: 'Feats',
    icon: 'Trophy',
    listColumns: ['icon', 'name', 'type'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon', placeholder: 'Trophy' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'type', label: 'Type', type: 'select', options: [
        { value: 'passive', label: 'Passive' },
        { value: 'active', label: 'Active' },
        { value: 'mastery', label: 'Mastery' }
      ]},
      { name: 'requirements', label: 'Requirements (JSON)', type: 'json', placeholder: '{"level": 10, "class": "warrior"}' },
      { name: 'effects', label: 'Effects (JSON)', type: 'json', placeholder: '{"stat_bonus": {"crit": 5}}' }
    ]
  },
  artifacts: {
    type: 'artifact',
    title: 'Artifacts',
    icon: 'Gem',
    listColumns: ['icon', 'name', 'rarity', 'source'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon', placeholder: 'Gem' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'lore', label: 'Lore Text', type: 'textarea' },
      { name: 'rarity', label: 'Rarity', type: 'select', options: [
        { value: 'rare', label: 'Rare' },
        { value: 'epic', label: 'Epic' },
        { value: 'legendary', label: 'Legendary' },
        { value: 'mythic', label: 'Mythic' }
      ]},
      { name: 'source', label: 'Source', type: 'text', placeholder: 'Dropped by...' },
      { name: 'effects', label: 'Effects (JSON)', type: 'json', placeholder: '{"passive": "fire_resist", "active_skill": 5}' }
    ]
  }
}

// Mock data generator
function generateMockData(config: EntityConfig): Record<string, unknown>[] {
  const items = []
  for (let i = 1; i <= 5; i++) {
    const item: Record<string, unknown> = { id: i }
    config.fields.forEach(f => {
      if (f.type === 'text') item[f.name] = `${config.title.slice(0, -1)} ${i}`
      else if (f.type === 'number') item[f.name] = f.default || i * 10
      else if (f.type === 'checkbox') item[f.name] = i % 2 === 0
      else if (f.type === 'select' && f.options?.length) item[f.name] = f.options[i % f.options.length].value
      else if (f.type === 'icon') item[f.name] = f.placeholder || 'Star'
    })
    items.push(item)
  }
  return items
}

interface EntityManagerProps {
  section: string
}

export function EntityManager({ section }: EntityManagerProps) {
  const config = ENTITY_CONFIGS[section]
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [editingItem, setEditingItem] = useState<Record<string, unknown> | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})

  const loadItems = useCallback(async () => {
    if (!config) return
    setLoading(true)
    const res = await adminApi.entity.getAll(config.type)
    if (res.success && res.data) {
      setItems(res.data as Record<string, unknown>[])
    } else {
      setItems(generateMockData(config))
    }
    setLoading(false)
  }, [config])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  if (!config) {
    return <div className="text-muted-foreground">Unknown section: {section}</div>
  }

  const filteredItems = items.filter(item => 
    JSON.stringify(item).toLowerCase().includes(search.toLowerCase())
  )

  const handleNew = () => {
    const defaults: Record<string, unknown> = {}
    config.fields.forEach(f => {
      if (f.default !== undefined) defaults[f.name] = f.default
      else if (f.type === 'checkbox') defaults[f.name] = false
      else if (f.type === 'number') defaults[f.name] = 0
      else defaults[f.name] = ''
    })
    setFormData(defaults)
    setEditingItem({})
  }

  const handleEdit = (item: Record<string, unknown>) => {
    setFormData({ ...item })
    setEditingItem(item)
  }

  const handleSave = async () => {
    const id = editingItem?.id as number | undefined
    const res = await adminApi.entity.save(config.type, formData, id)
    if (res.success) {
      loadItems()
      setEditingItem(null)
    } else {
      alert(res.message || 'Save failed')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this item?')) return
    const res = await adminApi.entity.delete(config.type, id)
    if (res.success) {
      loadItems()
    }
  }

  const renderField = (field: FieldConfig) => {
    const value = formData[field.name]
    const onChange = (v: unknown) => setFormData({ ...formData, [field.name]: v })

    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            value={String(value || '')}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm"
          />
        )
      case 'select':
        return (
          <select
            value={String(value || '')}
            onChange={e => onChange(e.target.value)}
            className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm"
          >
            {field.options?.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )
      case 'checkbox':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={e => onChange(e.target.checked)}
              className="w-4 h-4 rounded border-border"
            />
            <span className="text-sm">{field.label}</span>
          </label>
        )
      case 'json':
        return (
          <textarea
            value={typeof value === 'string' ? value : JSON.stringify(value || {}, null, 2)}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm font-mono text-xs"
          />
        )
      case 'number':
        return (
          <Input
            type="number"
            value={Number(value) || 0}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            placeholder={field.placeholder}
          />
        )
      default:
        return (
          <Input
            value={String(value || '')}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder}
          />
        )
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Editing form
  if (editingItem !== null) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            {editingItem.id ? `Edit ${config.title.slice(0, -1)}` : `New ${config.title.slice(0, -1)}`}
          </h2>
          <div className="flex gap-2">
            <Button onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>

        <Card className="celtic-border">
          <CardContent className="p-6">
            <div className="grid md:grid-cols-2 gap-4">
              {config.fields.map(field => (
                <div key={field.name} className={field.type === 'textarea' || field.type === 'json' ? 'md:col-span-2' : ''}>
                  {field.type !== 'checkbox' && (
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      {field.label}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </label>
                  )}
                  {renderField(field)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // List view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{config.title}</h2>
          <p className="text-sm text-muted-foreground">{items.length} entries</p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="w-4 h-4 mr-2" />
          New {config.title.slice(0, -1)}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${config.title.toLowerCase()}...`}
          className="pl-10"
        />
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-secondary/50">
            <tr>
              {config.listColumns.map(col => (
                <th key={col} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {col.replace('_', ' ')}
                </th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredItems.map((item) => (
              <tr key={item.id as number} className="hover:bg-secondary/20 transition-colors">
                {config.listColumns.map(col => (
                  <td key={col} className="px-4 py-3 text-sm">
                    {col === 'icon' ? (
                      <span className="text-lg">{String(item[col] || '-')}</span>
                    ) : typeof item[col] === 'boolean' ? (
                      <span className={item[col] ? 'text-green-500' : 'text-muted-foreground'}>
                        {item[col] ? 'Yes' : 'No'}
                      </span>
                    ) : (
                      String(item[col] ?? '-')
                    )}
                  </td>
                ))}
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(item)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id as number)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
