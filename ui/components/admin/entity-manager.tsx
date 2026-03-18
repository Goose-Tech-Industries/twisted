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
      { name: 'effects', label: 'Effects (JSON)', type: 'json', placeholder: '{"damage": {"formula": "atk * 1.5"}}' },
      { name: 'is_nonlethal', label: 'Non-Lethal (KO instead of kill)', type: 'checkbox' },
      { name: 'heal_limb', label: 'Heal Limb (zone key, "any", or empty for main HP)', type: 'text' },
      { name: 'combo_chance', label: 'Combo Chance (0.20 = 20%)', type: 'number', default: 0 },
      { name: 'combo_max_chain', label: 'Max Combo Chain', type: 'number', default: 1 },
      { name: 'spell_slot_level', label: 'Spell Slot Cost (blank = no slot cost)', type: 'number' },
      { name: 'bleed_tier', label: 'Bleed Tier (light/moderate/heavy)', type: 'select', options: [
        { value: '', label: 'None' },
        { value: 'light', label: 'Light (2 turns)' },
        { value: 'moderate', label: 'Moderate (4 turns)' },
        { value: 'heavy', label: 'Heavy (5 turns)' }
      ]}
    ]
  },
  npcs: {
    type: 'npc',
    title: 'NPCs & Enemies',
    icon: 'Skull',
    listColumns: ['icon', 'name', 'is_enemy', 'map_id'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon', placeholder: 'Ghost' },
      { name: 'persona', label: 'Persona / Description', type: 'textarea' },
      { name: 'is_enemy', label: 'Is Enemy', type: 'checkbox' },
      { name: 'char_id', label: 'Character ID (for stats)', type: 'number' },
      { name: 'map_id', label: 'Map ID', type: 'number' },
      { name: 'x', label: 'X Position', type: 'number', default: 5 },
      { name: 'y', label: 'Y Position', type: 'number', default: 5 },
      { name: 'move_type', label: 'Movement', type: 'select', options: [
        { value: 'STATIONARY', label: 'Stationary' },
        { value: 'WANDER', label: 'Wander' },
        { value: 'PATROL', label: 'Patrol' }
      ]},
      { name: 'wander_radius', label: 'Wander Radius', type: 'number', default: 3 },
      { name: 'script_key', label: 'Script Key', type: 'text' },
      { name: 'shop_id', label: 'Shop ID (if shopkeeper)', type: 'number' },
      { name: 'drop_table_json', label: 'Loot Table (JSON)', type: 'json', placeholder: '[{"item_id": 1, "chance": 50}]' },
      { name: 'quest_offers_json', label: 'Quest Offers (JSON)', type: 'json', placeholder: '["quest_id_1"]' },
      { name: 'is_recruitable', label: 'Recruitable (Companion)', type: 'checkbox' },
      { name: 'recruit_rep_req', label: 'Recruit Rep Required', type: 'number', default: 50 },
      { name: 'recruit_quest_req', label: 'Recruit Quest ID Required', type: 'number' },
      { name: 'body_type_id', label: 'Body Type (1=Humanoid, 2=Beast, 3=Serpent, 4=Amorphous)', type: 'number', default: 1 },
      // Session 12: Master training
      { name: 'is_master', label: 'Is Master (can train players)', type: 'checkbox' },
      { name: 'teaches_sig_tech_id', label: 'Teaches Pre-Made Sig Tech ID', type: 'number' },
      { name: 'unlocks_sig_tech_creation', label: 'Unlocks Sig Tech Creation', type: 'checkbox' },
      { name: 'master_skill_ids', label: 'Skills This Master Teaches (JSON)', type: 'json', placeholder: '[1, 5, 12]' },
      { name: 'training_gain_pct', label: 'Training Gain % (0.02 = 2%)', type: 'number', default: 0.02 }
    ]
  },
  quests: {
    type: 'quest',
    title: 'Quests',
    icon: 'ScrollText',
    listColumns: ['title', 'quest_type', 'required_level', 'is_active'],
    fields: [
      { name: 'quest_id', label: 'Quest ID (unique slug)', type: 'text', required: true },
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'quest_type', label: 'Type', type: 'select', options: [
        { value: 'main', label: 'Main Story' },
        { value: 'side', label: 'Side Quest' },
        { value: 'bounty', label: 'Bounty' },
        { value: 'daily', label: 'Daily' },
        { value: 'event', label: 'Event' }
      ]},
      { name: 'required_level', label: 'Min Level', type: 'number', default: 1 },
      { name: 'is_repeatable', label: 'Repeatable', type: 'checkbox' },
      { name: 'objectives_json', label: 'Objectives (JSON)', type: 'json', placeholder: '[{"type": "KILL", "target_npc_id": 1, "count": 5, "label": "Kill 5 Goblins"}]' },
      { name: 'rewards_json', label: 'Rewards (JSON)', type: 'json', placeholder: '{"xp": 100, "gold": 50, "items": [{"item_id": 1, "qty": 1}]}' },
      { name: 'is_active', label: 'Active', type: 'checkbox' },
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
      { name: 'base_mo', label: 'Base MO (Mag.Atk)', type: 'number', default: 5 },
      { name: 'base_md', label: 'Base MD (Mag.Def)', type: 'number', default: 5 },
      { name: 'base_speed', label: 'Base Speed', type: 'number', default: 5 },
      { name: 'base_luck', label: 'Base Luck', type: 'number', default: 5 },
      { name: 'hidden', label: 'Hidden (not selectable)', type: 'checkbox' },
      { name: 'battle_cmds', label: 'Battle Commands (JSON)', type: 'json', placeholder: '[1, 2, 3]' }
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
      { name: 'bonus_hp', label: 'HP Bonus', type: 'number', default: 0 },
      { name: 'bonus_mp', label: 'MP Bonus', type: 'number', default: 0 },
      { name: 'bonus_atk', label: 'ATK Bonus', type: 'number', default: 0 },
      { name: 'bonus_def', label: 'DEF Bonus', type: 'number', default: 0 },
      { name: 'bonus_mo', label: 'MO Bonus (Mag.Atk)', type: 'number', default: 0 },
      { name: 'bonus_md', label: 'MD Bonus (Mag.Def)', type: 'number', default: 0 },
      { name: 'bonus_speed', label: 'Speed Bonus', type: 'number', default: 0 },
      { name: 'bonus_luck', label: 'Luck Bonus', type: 'number', default: 0 },
      { name: 'lore', label: 'Lore Text', type: 'textarea' },
      { name: 'passive_ability', label: 'Passive Ability Name', type: 'text', placeholder: 'Night Vision' },
      { name: 'passive_desc', label: 'Passive Description', type: 'text', placeholder: 'Can see in darkness.' },
      { name: 'hidden', label: 'Hidden', type: 'checkbox' }
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
      { name: 'enabled', label: 'Enabled', type: 'checkbox' },
      // Zone bounds
      { name: 'x_min', label: 'Zone X Min', type: 'number', default: 0 },
      { name: 'y_min', label: 'Zone Y Min', type: 'number', default: 0 },
      { name: 'x_max', label: 'Zone X Max', type: 'number', default: 0 },
      { name: 'y_max', label: 'Zone Y Max', type: 'number', default: 0 },
      // Battle settings
      { name: 'scaling_factor', label: 'Enemy Scaling Factor', type: 'number', default: 0.3 },
      { name: 'allow_mid_battle_join', label: 'Allow Mid-Battle Join', type: 'checkbox' },
      { name: 'allow_free_for_all', label: 'Allow Free-for-All', type: 'checkbox' },
      { name: 'max_teams', label: 'Max Teams', type: 'number', default: 2 },
      { name: 'max_combatants', label: 'Max Combatants', type: 'number', default: 8 },
      { name: 'allow_surrender', label: 'Allow Surrender', type: 'checkbox' },
      { name: 'allow_battle_chat', label: 'Allow Battle Chat', type: 'checkbox' },
      { name: 'allow_diplomacy', label: 'Allow Diplomacy', type: 'checkbox' },
      // Session 8 overrides
      { name: 'override_limb_targeting', label: 'Limb Targeting Override', type: 'select', options: [
        { value: 'default', label: 'Use Global Setting' },
        { value: 'on', label: 'Force ON' },
        { value: 'off', label: 'Force OFF' }
      ]},
      { name: 'override_active_defense', label: 'Active Defense Override', type: 'select', options: [
        { value: 'default', label: 'Use Global Setting' },
        { value: 'on', label: 'Force ON' },
        { value: 'off', label: 'Force OFF' }
      ]},
      { name: 'override_nonlethal', label: 'Non-Lethal Override', type: 'select', options: [
        { value: 'default', label: 'Use Global Setting' },
        { value: 'on', label: 'Force ON (tournament mode)' },
        { value: 'off', label: 'Force OFF' }
      ]},
      { name: 'override_diminishing_returns', label: 'Diminishing Returns Override', type: 'select', options: [
        { value: 'default', label: 'Use Global Setting' },
        { value: 'on', label: 'Force ON' },
        { value: 'off', label: 'Force OFF' }
      ]},
      { name: 'override_ki_channeling', label: 'Ki Channeling Override', type: 'select', options: [
        { value: 'default', label: 'Use Global Setting' },
        { value: 'on', label: 'Force ON' },
        { value: 'off', label: 'Force OFF' }
      ]}
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
      { name: 'on_hit_chance', label: 'On-Hit Chance %', type: 'number', default: 0 },
      // Session 15: Summon Oghams
      { name: 'summon_npc_id', label: 'Summon NPC Char ID (rare oghams)', type: 'number' },
      { name: 'summon_duration', label: 'Summon Duration (turns)', type: 'number', default: 3 },
      { name: 'summon_mp_cost', label: 'Summon MP Cost (flat, for MP mode)', type: 'number', default: 0 },
      { name: 'summon_slot_level', label: 'Summon Spell Slot Level (for slot mode)', type: 'number', default: 1 },
      { name: 'summon_scaling_json', label: 'Summon Scaling per Rank (JSON)', type: 'json', placeholder: '{"hp_per_rank":0.10,"atk_per_rank":0.05}' }
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
  },
  body_types: {
    type: 'body_type' as EntityType,
    title: 'Body Types',
    icon: 'Accessibility',
    listColumns: ['icon', 'name', 'label'],
    fields: [
      { name: 'name', label: 'Key (unique)', type: 'text', required: true },
      { name: 'label', label: 'Display Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon', placeholder: '🧍' },
      { name: 'description', label: 'Description', type: 'textarea' }
    ]
  },
  limb_zones: {
    type: 'limb_zone' as EntityType,
    title: 'Limb Zones',
    icon: 'Bone',
    listColumns: ['icon', 'label', 'body_type_id', 'zone_key', 'hp_pct'],
    fields: [
      { name: 'body_type_id', label: 'Body Type ID', type: 'number', required: true },
      { name: 'zone_key', label: 'Zone Key (head, torso, etc)', type: 'text', required: true },
      { name: 'label', label: 'Display Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon', placeholder: '🦴' },
      { name: 'hp_pct', label: 'HP % of Max (0.25 = 25%)', type: 'number', default: 0.20 },
      { name: 'called_shot_penalty', label: 'Called Shot Penalty (0.20 = -20% accuracy)', type: 'number', default: 0.0 },
      { name: 'bleed_through', label: 'Bleed-through to Main HP (0.60 = 60%)', type: 'number', default: 0.60 },
      { name: 'wound_effects', label: 'Wound Effects (JSON)', type: 'json', placeholder: '{"light":{"speed":-0.15},"heavy":{"speed":-0.30}}' },
      { name: 'disable_effects', label: 'Disable Effects (JSON)', type: 'json', placeholder: '{"prone":true,"cant_flee":true}' },
      { name: 'sort_order', label: 'Sort Order', type: 'number', default: 0 }
    ]
  },
  flavor_texts: {
    type: 'flavor_text' as EntityType,
    title: 'Flavor Texts (RP Bonus)',
    icon: 'Feather',
    listColumns: ['category', 'text', 'bonus_pct', 'approved', 'active'],
    fields: [
      { name: 'text', label: 'Flavor Text', type: 'textarea', required: true },
      { name: 'bonus_pct', label: 'Damage Bonus (0.05 = 5%)', type: 'number', default: 0.05 },
      { name: 'category', label: 'Category', type: 'select', options: [
        { value: 'attack', label: 'Attack' },
        { value: 'defense', label: 'Defense' },
        { value: 'heal', label: 'Heal' },
        { value: 'movement', label: 'Movement' },
        { value: 'taunt', label: 'Taunt' }
      ]},
      { name: 'skill_id', label: 'Skill ID (blank = any skill)', type: 'number' },
      { name: 'command_id', label: 'Command ID (blank = any command)', type: 'number' },
      { name: 'min_length', label: 'Min Text Length (0 = template only)', type: 'number', default: 0 },
      { name: 'is_template', label: 'Admin Template', type: 'checkbox' },
      { name: 'approved', label: 'Approved', type: 'checkbox' },
      { name: 'active', label: 'Active', type: 'checkbox' }
    ]
  },
  flavor_keywords: {
    type: 'flavor_keyword' as EntityType,
    title: 'Flavor Keywords',
    icon: 'Hash',
    listColumns: ['keyword', 'bonus_pct', 'category', 'terrain_match'],
    fields: [
      { name: 'keyword', label: 'Keyword', type: 'text', required: true },
      { name: 'bonus_pct', label: 'Bonus (0.02 = +2%)', type: 'number', default: 0.02 },
      { name: 'category', label: 'Category', type: 'select', options: [
        { value: 'general', label: 'General' },
        { value: 'terrain', label: 'Terrain-Aware' },
        { value: 'weapon', label: 'Weapon' },
        { value: 'element', label: 'Element' },
        { value: 'taunt', label: 'Taunt' }
      ]},
      { name: 'terrain_match', label: 'Terrain Match (blank = any)', type: 'select', options: [
        { value: '', label: 'Any / None' },
        { value: 'forest', label: 'Forest' },
        { value: 'high_ground', label: 'High Ground' },
        { value: 'cover', label: 'Cover' },
        { value: 'water', label: 'Water' },
        { value: 'fire', label: 'Fire' }
      ]},
      { name: 'active', label: 'Active', type: 'checkbox' }
    ]
  },
  bleed_tiers: {
    type: 'bleed_tier' as EntityType,
    title: 'Bleed Tiers',
    icon: 'Droplet',
    listColumns: ['icon', 'name', 'label', 'duration_turns', 'damage_pct'],
    fields: [
      { name: 'name', label: 'Key (light/moderate/heavy)', type: 'text', required: true },
      { name: 'label', label: 'Display Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon', placeholder: '🩸' },
      { name: 'duration_turns', label: 'Duration (turns)', type: 'number', default: 2 },
      { name: 'damage_pct', label: 'Damage per Turn (0.03 = 3% of base HP)', type: 'number', default: 0.03 },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'color', label: 'CSS Color Class', type: 'text', placeholder: 'text-destructive' }
    ]
  },
  sig_levels: {
    type: 'sig_level' as EntityType,
    title: 'Signature Tech Levels',
    icon: 'TrendingUp',
    listColumns: ['level', 'damage_pct', 'cost_pct', 'heal_pct', 'ability_slots', 'xp_required'],
    fields: [
      { name: 'level', label: 'Level', type: 'number', required: true },
      { name: 'damage_pct', label: 'Damage % (0.10 = 10%)', type: 'number', default: 0.10 },
      { name: 'cost_pct', label: 'Cost % (0.01 = 1% HP)', type: 'number', default: 0.01 },
      { name: 'heal_pct', label: 'Heal % (for ki_heal type)', type: 'number', default: 0.10 },
      { name: 'ability_slots', label: 'Cumulative Ability Slots', type: 'number', default: 0 },
      { name: 'xp_required', label: 'Total XP Required', type: 'number', default: 0 },
      { name: 'description', label: 'Description', type: 'textarea' }
    ]
  },
  sig_abilities: {
    type: 'sig_ability' as EntityType,
    title: 'Signature Abilities',
    icon: 'Gem',
    listColumns: ['icon', 'label', 'category', 'min_level', 'damage_modifier', 'cost_modifier'],
    fields: [
      { name: 'name', label: 'Key (unique)', type: 'text', required: true },
      { name: 'label', label: 'Display Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon', placeholder: '⚡' },
      { name: 'description', label: 'Description', type: 'textarea', required: true },
      { name: 'category', label: 'Category', type: 'select', options: [
        { value: 'offense', label: 'Offense' },
        { value: 'defense', label: 'Defense' },
        { value: 'utility', label: 'Utility' },
        { value: 'heal', label: 'Heal' }
      ]},
      { name: 'effects', label: 'Effects (JSON)', type: 'json', placeholder: '{"stun_turns":1}' },
      { name: 'damage_modifier', label: 'Damage Modifier (-0.10 = -10%)', type: 'number', default: 0 },
      { name: 'cost_modifier', label: 'Cost Modifier (+0.04 = +4%)', type: 'number', default: 0 },
      { name: 'dodge_modifier', label: 'Opponent Dodge Modifier', type: 'number', default: 0 },
      { name: 'min_level', label: 'Min Tech Level to Equip', type: 'number', default: 1 },
      { name: 'exclusive_with', label: 'Exclusive With (JSON ability IDs)', type: 'json', placeholder: '[2]' }
    ]
  },
  sig_techs: {
    type: 'sig_tech' as EntityType,
    title: 'Player Signature Techs',
    icon: 'Flame',
    listColumns: ['name', 'character_id', 'tech_type', 'current_level', 'total_uses', 'element'],
    fields: [
      { name: 'character_id', label: 'Character ID', type: 'number', required: true },
      { name: 'name', label: 'Technique Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon', placeholder: '⚡' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'tech_type', label: 'Type', type: 'select', options: [
        { value: 'ki_attack', label: 'Ki Attack' },
        { value: 'physical', label: 'Physical' },
        { value: 'ki_heal', label: 'Ki Heal' }
      ]},
      { name: 'current_level', label: 'Current Level', type: 'number', default: 1 },
      { name: 'current_xp', label: 'Current XP', type: 'number', default: 0 },
      { name: 'total_uses', label: 'Total Uses', type: 'number', default: 0 },
      { name: 'element', label: 'Element', type: 'select', options: [
        { value: '', label: 'None' },
        { value: 'fire', label: 'Fire' },
        { value: 'ice', label: 'Ice' },
        { value: 'lightning', label: 'Lightning' },
        { value: 'earth', label: 'Earth' },
        { value: 'dark', label: 'Dark' },
        { value: 'light', label: 'Light' }
      ]},
      { name: 'origin_text', label: 'Origin Flavor Text', type: 'textarea' },
      { name: 'battle_text', label: 'Battle Announcement', type: 'text', placeholder: '{name} unleashes {skill}!' }
    ]
  },
  narrations: {
    type: 'narration' as EntityType,
    title: 'Battle Narrations',
    icon: 'BookOpen',
    listColumns: ['action_type', 'weapon_type', 'element', 'terrain', 'weight'],
    fields: [
      { name: 'action_type', label: 'Action Type', type: 'select', required: true, options: [
        { value: 'attack', label: 'Attack' }, { value: 'skill', label: 'Skill' },
        { value: 'defend', label: 'Defend' }, { value: 'dodge', label: 'Dodge' },
        { value: 'block', label: 'Block' }, { value: 'heal', label: 'Heal' },
        { value: 'kill', label: 'Kill' }, { value: 'ko', label: 'Knockout' },
        { value: 'miss', label: 'Miss' }, { value: 'crit', label: 'Critical Hit' },
        { value: 'combo', label: 'Combo' }, { value: 'flee', label: 'Flee' },
        { value: 'flee_fail', label: 'Flee Failed' },
        { value: 'ki_channel', label: 'Ki Channel' },
        { value: 'limb_disabled', label: 'Limb Disabled' },
        { value: 'taunt', label: 'Taunt' }, { value: 'intimidate', label: 'Intimidate' },
        { value: 'rally', label: 'Rally' }
      ]},
      { name: 'weapon_type', label: 'Weapon Type (blank = any)', type: 'select', options: [
        { value: '', label: 'Any' }, { value: 'sword', label: 'Sword' },
        { value: 'axe', label: 'Axe' }, { value: 'staff', label: 'Staff' },
        { value: 'bow', label: 'Bow' }, { value: 'fist', label: 'Fist' },
        { value: 'dagger', label: 'Dagger' }, { value: 'mace', label: 'Mace' }
      ]},
      { name: 'element', label: 'Element (blank = any)', type: 'select', options: [
        { value: '', label: 'Any' }, { value: 'fire', label: 'Fire' },
        { value: 'ice', label: 'Ice' }, { value: 'lightning', label: 'Lightning' },
        { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }
      ]},
      { name: 'terrain', label: 'Terrain (blank = any)', type: 'select', options: [
        { value: '', label: 'Any' }, { value: 'forest', label: 'Forest' },
        { value: 'high_ground', label: 'High Ground' }, { value: 'cover', label: 'Cover' },
        { value: 'water', label: 'Water' }, { value: 'fire', label: 'Fire' }
      ]},
      { name: 'target_zone', label: 'Target Zone (blank = any)', type: 'select', options: [
        { value: '', label: 'Any' }, { value: 'head', label: 'Head' },
        { value: 'torso', label: 'Torso' }, { value: 'left_arm', label: 'Left Arm' },
        { value: 'right_arm', label: 'Right Arm' }, { value: 'legs', label: 'Legs' }
      ]},
      { name: 'text_template', label: 'Narration Text', type: 'textarea', required: true },
      { name: 'weight', label: 'Weight (higher = more likely)', type: 'number', default: 1 },
      { name: 'active', label: 'Active', type: 'checkbox' }
    ]
  },
  premade_sigs: {
    type: 'premade_sig' as EntityType,
    title: 'Pre-Made Signature Techs',
    icon: 'Scroll',
    listColumns: ['icon', 'name', 'tech_type', 'element'],
    fields: [
      { name: 'name', label: 'Technique Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon', placeholder: '⚡' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'tech_type', label: 'Type', type: 'select', options: [
        { value: 'ki_attack', label: 'Ki Attack' },
        { value: 'physical', label: 'Physical' },
        { value: 'ki_heal', label: 'Ki Heal' }
      ]},
      { name: 'element', label: 'Element', type: 'select', options: [
        { value: '', label: 'None' }, { value: 'fire', label: 'Fire' },
        { value: 'ice', label: 'Ice' }, { value: 'lightning', label: 'Lightning' },
        { value: 'earth', label: 'Earth' }, { value: 'dark', label: 'Dark' },
        { value: 'light', label: 'Light' }
      ]},
      { name: 'battle_text', label: 'Battle Text', type: 'text', placeholder: '{name} unleashes {skill}!' },
      { name: 'preset_abilities', label: 'Pre-equipped Abilities (JSON IDs)', type: 'json', placeholder: '[1, 4]' },
      { name: 'lore_text', label: 'Lore / History', type: 'textarea' }
    ]
  },
  training_configs: {
    type: 'training_config' as EntityType,
    title: 'Training Types',
    icon: 'Dumbbell',
    listColumns: ['name', 'label', 'training_type', 'daily_limit'],
    fields: [
      { name: 'name', label: 'Key (unique)', type: 'text', required: true },
      { name: 'label', label: 'Display Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'training_type', label: 'Type', type: 'select', options: [
        { value: 'self_train', label: 'Self Training' },
        { value: 'spar', label: 'Spar' },
        { value: 'master_train', label: 'Master Training' },
        { value: 'meditate', label: 'Meditate' }
      ]},
      { name: 'stat_gains', label: 'Stat Gains per Session (JSON)', type: 'json', placeholder: '{"max_hp":0.01,"atk":0.005}' },
      { name: 'stat_costs', label: 'Stat Costs / Fatigue (JSON)', type: 'json', placeholder: '{"current_hp":0.01}' },
      { name: 'daily_limit', label: 'Max Times per Day', type: 'number', default: 4 },
      { name: 'cooldown_minutes', label: 'Cooldown (minutes)', type: 'number', default: 0 },
      { name: 'requires_partner', label: 'Requires Partner (spar)', type: 'checkbox' },
      { name: 'requires_master', label: 'Requires NPC Master', type: 'checkbox' },
      { name: 'min_level', label: 'Min Level', type: 'number', default: 1 },
      { name: 'allowed_race_ids', label: 'Allowed Race IDs (JSON, blank = all)', type: 'json', placeholder: '[1, 3]' },
      { name: 'allowed_class_ids', label: 'Allowed Class IDs (JSON, blank = all)', type: 'json', placeholder: '[2, 5]' },
      { name: 'weighted_clothing_bonus', label: 'Weighted Clothing Bonus', type: 'number', default: 0 },
      { name: 'gravity_multiplier', label: 'Gravity Multiplier Enabled', type: 'checkbox' },
      { name: 'active', label: 'Active', type: 'checkbox' }
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
