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
        { value: 'RANKED', label: 'Ranked' },
        { value: 'TRAINING', label: 'Training (no consequences)' },
        { value: 'TOURNAMENT', label: 'Tournament' },
        { value: 'BOSS_CHALLENGE', label: 'Boss Challenge' },
        { value: 'WAVE_SURVIVAL', label: 'Wave Survival (FF7 style)' },
        { value: 'TEAM_PVP', label: 'Team PvP' },
        { value: 'SPECTATOR', label: 'Spectator Arena' },
        { value: 'KING_OF_HILL', label: 'King of the Hill' },
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
      ]},
      // Death & respawn
      { name: 'nonlethal', label: 'Non-Lethal (no death)', type: 'checkbox' },
      { name: 'boss_can_kill', label: 'Boss Battles Can Kill', type: 'checkbox' },
      { name: 'respawn_x', label: 'Respawn X (loser teleports here)', type: 'number' },
      { name: 'respawn_y', label: 'Respawn Y', type: 'number' },
      // Wave mode (Gold Saucer style)
      { name: 'wave_mode', label: 'Wave Survival Mode', type: 'checkbox' },
      { name: 'wave_config_json', label: 'Wave Config (JSON)', type: 'json', placeholder: '[{"wave":1,"enemies":[{"npc_id":5,"count":3}]},{"wave":2,"enemies":[{"npc_id":8,"count":2}],"boss":true}]' },
      { name: 'heal_between_waves', label: 'Heal Between Waves', type: 'checkbox' },
      { name: 'wave_reward_per_wave', label: 'Reward Per Wave (JSON)', type: 'json', placeholder: '{"gold":50,"xp":100}' },
      // Spectator & betting
      { name: 'spectator_enabled', label: 'Spectators Can Watch', type: 'checkbox' },
      { name: 'betting_enabled', label: 'Spectator Betting', type: 'checkbox' },
    ]
  },
  arena_rankings: {
    type: 'arena_ranking',
    title: 'Arena Rankings',
    icon: 'BarChart3',
    listColumns: ['character_id', 'arena_id', 'wins', 'losses', 'rating', 'best_wave'],
    fields: [
      { name: 'character_id', label: 'Character ID', type: 'number', required: true },
      { name: 'arena_id', label: 'Arena ID', type: 'number', required: true },
      { name: 'wins', label: 'Wins', type: 'number', default: 0 },
      { name: 'losses', label: 'Losses', type: 'number', default: 0 },
      { name: 'draws', label: 'Draws', type: 'number', default: 0 },
      { name: 'rating', label: 'Rating (ELO)', type: 'number', default: 1000 },
      { name: 'best_wave', label: 'Best Wave Reached', type: 'number', default: 0 },
      { name: 'season', label: 'Season', type: 'number', default: 1 },
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
  },
  ki_moves: {
    type: 'ki_move',
    title: 'Ki Moves',
    icon: 'Zap',
    listColumns: ['icon', 'name', 'move_type', 'hp_cost_pct', 'charge_turns'],
    fields: [
      { name: 'name', label: 'Move Name', type: 'text', required: true, placeholder: 'Kamehameha' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '💥' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'class_id', label: 'Class ID (blank=any)', type: 'number' },
      { name: 'style_id', label: 'Fighting Style ID (blank=any)', type: 'number' },
      { name: 'move_type', label: 'Move Type', type: 'select', options: [
        { value: 'blast', label: 'Ki Blast' }, { value: 'beam', label: 'Beam' },
        { value: 'aura', label: 'Aura/Buff' }, { value: 'rush', label: 'Rush Attack' },
        { value: 'special', label: 'Special' },
      ]},
      { name: 'hp_cost_pct', label: 'HP Cost (% of max)', type: 'number', default: 5 },
      { name: 'hp_cost_flat', label: 'HP Cost (flat)', type: 'number', default: 0 },
      { name: 'charge_turns', label: 'Charge Turns (0=instant)', type: 'number', default: 0 },
      { name: 'charge_damage_mult', label: 'Charge Multipliers (JSON)', type: 'json', placeholder: '{"1":1.0,"2":1.5,"3":2.5}' },
      { name: 'interruptible', label: 'Can Be Interrupted', type: 'checkbox' },
      { name: 'brunt_mode', label: 'Brunt Mode (take damage, keep charging)', type: 'checkbox' },
      { name: 'brunt_damage_mult', label: 'Brunt Damage Multiplier (1.0=normal, 1.5=vulnerable)', type: 'number', default: 1.0 },
      { name: 'damage_formula', label: 'Damage Formula', type: 'text', default: 'ATK*2', placeholder: 'ATK*3+MO' },
      { name: 'range_type', label: 'Range', type: 'select', options: [
        { value: 'melee', label: 'Melee' }, { value: 'ranged', label: 'Ranged' }, { value: 'aoe', label: 'AoE' },
      ]},
      { name: 'status_effect_id', label: 'Apply Status Effect ID', type: 'number' },
      { name: 'level_required', label: 'Level Required', type: 'number', default: 1 },
      { name: 'cooldown_turns', label: 'Cooldown Turns', type: 'number', default: 0 },
      { name: 'battle_text', label: 'Battle Text', type: 'text', placeholder: '{name} fires a massive ki blast!' },
    ]
  },
  fusions: {
    type: 'fusion',
    title: 'Fusions',
    icon: 'Users',
    listColumns: ['icon', 'name', 'fusion_type', 'duration_turns'],
    fields: [
      { name: 'name', label: 'Fusion Name', type: 'text', required: true, placeholder: 'Gogeta' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '🔮' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'fusion_type', label: 'Fusion Method', type: 'select', options: [
        { value: 'dance', label: 'Fusion Dance' }, { value: 'item', label: 'Item (Potara etc)' },
        { value: 'potara', label: 'Potara Earrings' }, { value: 'technique', label: 'Technique' },
      ]},
      { name: 'required_item_id', label: 'Required Item ID (for item type)', type: 'number' },
      { name: 'stat_formula', label: 'Stat Combination', type: 'select', options: [
        { value: 'add', label: 'Add Both Stats' }, { value: 'average', label: 'Average Stats' },
        { value: 'multiply', label: 'Multiply Higher' },
      ]},
      { name: 'stat_multiplier', label: 'Stat Multiplier', type: 'number', default: 1.5 },
      { name: 'duration_turns', label: 'Duration (turns)', type: 'number', default: 5 },
      { name: 'cooldown_battles', label: 'Cooldown (battles)', type: 'number', default: 3 },
      { name: 'level_required', label: 'Level Required', type: 'number', default: 1 },
      { name: 'race_required_id', label: 'Race Required (blank=any)', type: 'number' },
    ]
  },
  battle_terrains: {
    type: 'battle_terrain',
    title: 'Battle Terrain',
    icon: 'Mountain',
    listColumns: ['icon', 'name'],
    fields: [
      { name: 'name', label: 'Terrain Name', type: 'text', required: true, placeholder: 'Grassland' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '🌿' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'stat_modifiers_json', label: 'Stat Modifiers (JSON)', type: 'json', placeholder: '{"speed":-2,"dodge_chance":-5}' },
      { name: 'movement_cost_mult', label: 'Movement Cost Mult', type: 'number', default: 1.0 },
      { name: 'type_advantages_json', label: 'Type Advantages (JSON)', type: 'json', placeholder: '{"flying":1.2,"earth":0.8}' },
    ]
  },
  battle_items: {
    type: 'battle_item',
    title: 'Battle Items',
    icon: 'Package',
    listColumns: ['icon', 'name', 'uses_per_battle'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Senzu Bean' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '💊' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'item_id', label: 'Links to Item ID', type: 'number' },
      { name: 'effect_json', label: 'Effect (JSON)', type: 'json', required: true, placeholder: '{"heal_pct":100}' },
      { name: 'uses_per_battle', label: 'Uses per Battle', type: 'number', default: 1 },
      { name: 'cooldown_turns', label: 'Cooldown Turns', type: 'number', default: 0 },
    ]
  },
  finishing_moves: {
    type: 'finishing_move',
    title: 'Finishing Moves',
    icon: 'Skull',
    listColumns: ['icon', 'name', 'hp_threshold_pct', 'class_id'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Spirit Bomb' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '💀' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'class_id', label: 'Class ID (blank=any)', type: 'number' },
      { name: 'style_id', label: 'Fighting Style ID (blank=any)', type: 'number' },
      { name: 'hp_threshold_pct', label: 'Enemy HP Threshold (%)', type: 'number', default: 20 },
      { name: 'damage_formula', label: 'Damage Formula', type: 'text', default: 'ATK*5' },
      { name: 'xp_bonus_pct', label: 'XP Bonus %', type: 'number', default: 50 },
      { name: 'drop_bonus_pct', label: 'Drop Bonus %', type: 'number', default: 25 },
      { name: 'battle_text', label: 'Battle Text', type: 'text', placeholder: '{name} unleashes a devastating finishing blow!' },
      { name: 'level_required', label: 'Level Required', type: 'number', default: 1 },
    ]
  },
  battle_conditions: {
    type: 'battle_condition',
    title: 'Battle Conditions',
    icon: 'AlertTriangle',
    listColumns: ['icon', 'name', 'condition_type'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Double Damage' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '⚡' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'effect_json', label: 'Effects (JSON)', type: 'json', required: true, placeholder: '{"damage_mult":2.0,"no_magic":true,"turn_limit":10}' },
      { name: 'condition_type', label: 'Type', type: 'select', options: [
        { value: 'random', label: 'Random (applied to encounters)' },
        { value: 'arena', label: 'Arena-specific' },
        { value: 'event', label: 'World Event' },
        { value: 'admin', label: 'Admin Applied' },
      ]},
    ]
  },
  battle_replays: {
    type: 'battle_replay',
    title: 'Battle Replays',
    icon: 'Film',
    listColumns: ['battle_id', 'battle_type', 'duration_seconds', 'created_at'],
    fields: [
      { name: 'battle_id', label: 'Battle ID', type: 'text' },
      { name: 'battle_type', label: 'Type', type: 'select', options: [
        { value: 'pve', label: 'PvE' }, { value: 'pvp', label: 'PvP' },
        { value: 'arena', label: 'Arena' }, { value: 'tournament', label: 'Tournament' },
        { value: 'boss', label: 'Boss' },
      ]},
      { name: 'participants_json', label: 'Participants (JSON)', type: 'json' },
      { name: 'winner_json', label: 'Winner (JSON)', type: 'json' },
      { name: 'turns_json', label: 'Turn Log (JSON)', type: 'json' },
      { name: 'arena_id', label: 'Arena ID', type: 'number' },
      { name: 'tournament_id', label: 'Tournament ID', type: 'number' },
      { name: 'duration_seconds', label: 'Duration (sec)', type: 'number' },
    ]
  },
  config_profiles: {
    type: 'config_profile',
    title: 'Config Profiles',
    icon: 'Layers',
    listColumns: ['name', 'is_active', 'created_at'],
    fields: [
      { name: 'name', label: 'Profile Name', type: 'text', required: true, placeholder: 'Production' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'settings_json', label: 'Settings Snapshot (JSON)', type: 'json', required: true },
      { name: 'modules_json', label: 'Modules State (JSON)', type: 'json' },
      { name: 'is_active', label: 'Active Profile', type: 'checkbox' },
    ]
  },
  settings_history: {
    type: 'settings_log',
    title: 'Settings History',
    icon: 'History',
    listColumns: ['setting_key', 'old_value', 'new_value', 'changed_by_name', 'created_at'],
    fields: [
      { name: 'setting_key', label: 'Setting Key', type: 'text' },
      { name: 'old_value', label: 'Old Value', type: 'text' },
      { name: 'new_value', label: 'New Value', type: 'text' },
      { name: 'changed_by_name', label: 'Changed By', type: 'text' },
    ]
  },
  auto_mod_rules: {
    type: 'auto_mod_rule',
    title: 'Auto-Mod Rules',
    icon: 'Shield',
    listColumns: ['name', 'trigger_type', 'action_type', 'is_enabled'],
    fields: [
      { name: 'name', label: 'Rule Name', type: 'text', required: true },
      { name: 'trigger_type', label: 'Trigger', type: 'select', options: [
        { value: 'chat_spam', label: 'Chat Spam' }, { value: 'reports_threshold', label: 'Reports Threshold' },
        { value: 'login_attempts', label: 'Login Attempts' }, { value: 'custom', label: 'Custom' },
      ]},
      { name: 'trigger_threshold', label: 'Threshold Count', type: 'number', default: 10 },
      { name: 'trigger_window_seconds', label: 'Time Window (seconds)', type: 'number', default: 30 },
      { name: 'action_type', label: 'Action', type: 'select', options: [
        { value: 'mute', label: 'Mute' }, { value: 'warn', label: 'Warn' },
        { value: 'flag', label: 'Flag as Suspicious' }, { value: 'temp_ban', label: 'Temp Ban' },
        { value: 'kick', label: 'Kick' },
      ]},
      { name: 'action_duration_minutes', label: 'Duration (minutes)', type: 'number', default: 5 },
      { name: 'is_enabled', label: 'Enabled', type: 'checkbox' },
    ]
  },
  player_warnings: {
    type: 'player_warning',
    title: 'Player Warnings',
    icon: 'AlertTriangle',
    listColumns: ['user_id', 'warning_level', 'warned_by_name', 'created_at'],
    fields: [
      { name: 'user_id', label: 'Player User ID', type: 'number', required: true },
      { name: 'warned_by', label: 'Warned By (staff user ID)', type: 'number', required: true },
      { name: 'warned_by_name', label: 'Staff Name', type: 'text', required: true },
      { name: 'warning_level', label: 'Warning Level (1-4)', type: 'number', default: 1 },
      { name: 'reason', label: 'Reason', type: 'textarea', required: true },
    ]
  },
  staff_permissions: {
    type: 'staff_perm',
    title: 'Staff Permissions',
    icon: 'Lock',
    listColumns: ['role', 'permission_key', 'allowed'],
    fields: [
      { name: 'role', label: 'Role', type: 'select', required: true, options: [
        { value: 'MOD', label: 'MOD' }, { value: 'GM', label: 'GM' },
        { value: 'ADMIN', label: 'ADMIN' }, { value: 'OWNER', label: 'OWNER' },
      ]},
      { name: 'permission_key', label: 'Permission', type: 'text', required: true, placeholder: 'ban, give_gold, edit_npc...' },
      { name: 'allowed', label: 'Allowed', type: 'checkbox' },
    ]
  },
  broadcast_templates: {
    type: 'broadcast_tmpl',
    title: 'Broadcast Templates',
    icon: 'Megaphone',
    listColumns: ['name', 'style'],
    fields: [
      { name: 'name', label: 'Template Name', type: 'text', required: true, placeholder: 'Server Restart Warning' },
      { name: 'template_text', label: 'Message Template', type: 'textarea', required: true, placeholder: 'Server restart in {minutes} minutes. Save your progress!' },
      { name: 'style', label: 'Style', type: 'select', options: [
        { value: 'info', label: 'Info (blue)' }, { value: 'warning', label: 'Warning (yellow)' },
        { value: 'danger', label: 'Danger (red)' },
      ]},
      { name: 'variables_json', label: 'Variables (JSON array)', type: 'json', placeholder: '["minutes","event_name"]' },
    ]
  },
  player_appeals: {
    type: 'player_appeal',
    title: 'Player Appeals',
    icon: 'MessageSquare',
    listColumns: ['username', 'status', 'created_at'],
    fields: [
      { name: 'user_id', label: 'User ID', type: 'number', required: true },
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'appeal_text', label: 'Appeal Text', type: 'textarea', required: true },
      { name: 'status', label: 'Status', type: 'select', options: [
        { value: 'pending', label: 'Pending' }, { value: 'accepted', label: 'Accepted' },
        { value: 'denied', label: 'Denied' },
      ]},
      { name: 'reviewed_by', label: 'Reviewed By (staff ID)', type: 'number' },
      { name: 'review_notes', label: 'Review Notes', type: 'textarea' },
    ]
  },
  battle_templates: {
    type: 'battle_template',
    title: 'Battle Templates',
    icon: 'Layers',
    listColumns: ['icon', 'label', 'name', 'is_default', 'installed'],
    fields: [
      { name: 'name', label: 'Template Key', type: 'text', required: true, placeholder: 'sim_battle' },
      { name: 'label', label: 'Display Name', type: 'text', required: true, placeholder: 'Sim Battle (RP Combat)' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '🎲' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'author', label: 'Author', type: 'text', default: 'Twisted Engine' },
      { name: 'version', label: 'Version', type: 'text', default: '1.0' },
      { name: 'settings_json', label: 'Battle Settings (JSON)', type: 'json', required: true, placeholder: '{"enable_dice_rolls":"true","ki_equals_hp":"true"}' },
      { name: 'terminology_json', label: 'Terminology Overrides (JSON)', type: 'json', placeholder: '{"hp":"Ki","atk":"Power Level"}' },
      { name: 'sample_commands_json', label: 'Sample Commands (JSON)', type: 'json', placeholder: '[{"name":"Strike","icon":"👊"}]' },
      { name: 'sample_ki_moves_json', label: 'Sample Ki Moves (JSON)', type: 'json' },
      { name: 'is_default', label: 'Default Template', type: 'checkbox' },
      { name: 'installed', label: 'Installed', type: 'checkbox' },
    ]
  },
  ogham_awakenings: {
    type: 'ogham_awakening',
    title: 'Ogham Awakenings',
    icon: 'Sunrise',
    listColumns: ['ogham_id', 'kill_milestone'],
    fields: [
      { name: 'ogham_id', label: 'Ogham ID', type: 'number', required: true },
      { name: 'kill_milestone', label: 'Kill Milestone', type: 'number', required: true, placeholder: '50' },
      { name: 'dialogue_text', label: 'Dialogue (ogham speaks)', type: 'textarea', placeholder: 'The rune pulses with ancient power...' },
      { name: 'buff_effect_json', label: 'Temporary Buff (JSON)', type: 'json', placeholder: '{"atk":10,"duration_battles":5}' },
      { name: 'permanent_stat_bonus_json', label: 'Permanent Stat Bonus (JSON)', type: 'json', placeholder: '{"atk":2}' },
      { name: 'lore_text', label: 'Lore Unlocked', type: 'textarea' },
    ]
  },
  spell_tomes: {
    type: 'spell_tome',
    title: 'Spell Tomes',
    icon: 'BookOpen',
    listColumns: ['icon', 'name', 'rarity', 'teaches_skill_id'],
    fields: [
      { name: 'name', label: 'Tome Name', type: 'text', required: true, placeholder: 'Tome of Flame' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '📕' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'teaches_skill_id', label: 'Teaches Skill ID', type: 'number', required: true },
      { name: 'item_id', label: 'Item ID (consumable)', type: 'number' },
      { name: 'rarity', label: 'Rarity', type: 'select', options: [
        { value: 'uncommon', label: 'Uncommon' }, { value: 'rare', label: 'Rare' },
        { value: 'epic', label: 'Epic' }, { value: 'legendary', label: 'Legendary' },
      ]},
      { name: 'level_required', label: 'Level Required', type: 'number', default: 1 },
      { name: 'class_required_id', label: 'Class Required (blank=any)', type: 'number' },
    ]
  },
  elemental_affinities: {
    type: 'elem_affinity',
    title: 'Elemental Affinities',
    icon: 'Flame',
    listColumns: ['element', 'tier', 'title', 'casts_required'],
    fields: [
      { name: 'element', label: 'Element', type: 'text', required: true, placeholder: 'fire' },
      { name: 'tier', label: 'Tier', type: 'number', required: true, default: 1 },
      { name: 'casts_required', label: 'Total Casts to Reach', type: 'number', required: true, placeholder: '100' },
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'Fire Touched' },
      { name: 'passive_bonus_json', label: 'Passive Bonus (JSON)', type: 'json', required: true, placeholder: '{"fire_damage_pct":10,"water_damage_pct":-5}' },
      { name: 'visual_effect', label: 'Visual Effect', type: 'text', placeholder: 'flame_aura' },
    ]
  },
  item_curses: {
    type: 'item_curse',
    title: 'Item Curses',
    icon: 'Skull',
    listColumns: ['icon', 'name', 'removal_type'],
    fields: [
      { name: 'name', label: 'Curse Name', type: 'text', required: true, placeholder: 'Blood Hunger' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '💀' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'bonus_json', label: 'Bonus Stats (the temptation)', type: 'json', required: true, placeholder: '{"atk":20,"speed":10}' },
      { name: 'penalty_json', label: 'Penalty Stats (the curse)', type: 'json', required: true, placeholder: '{"max_hp":-50,"luck":-10}' },
      { name: 'removal_type', label: 'How to Remove', type: 'select', options: [
        { value: 'purify_item', label: 'Use Purification Item' },
        { value: 'purify_quest', label: 'Complete Quest' },
        { value: 'purify_gold', label: 'Pay Gold' },
        { value: 'unremovable', label: 'Permanent (cannot remove)' },
      ]},
      { name: 'removal_item_id', label: 'Purification Item ID', type: 'number' },
      { name: 'removal_quest_id', label: 'Purification Quest ID', type: 'number' },
      { name: 'removal_gold_cost', label: 'Purification Gold Cost', type: 'number', default: 0 },
      { name: 'lore_text', label: 'Curse Lore', type: 'textarea' },
    ]
  },
  ogham_fusions: {
    type: 'ogham_fusion',
    title: 'Ogham Fusions',
    icon: 'Merge',
    listColumns: ['ogham_a_id', 'ogham_b_id', 'result_ogham_id', 'fail_chance_pct'],
    fields: [
      { name: 'ogham_a_id', label: 'Ogham A ID', type: 'number', required: true },
      { name: 'ogham_b_id', label: 'Ogham B ID', type: 'number', required: true },
      { name: 'result_ogham_id', label: 'Result Ogham ID', type: 'number', required: true },
      { name: 'gold_cost', label: 'Gold Cost', type: 'number', default: 100 },
      { name: 'material_item_id', label: 'Material Item ID (optional)', type: 'number' },
      { name: 'fail_chance_pct', label: 'Fail Chance %', type: 'number', default: 0 },
    ]
  },
  ogham_shards: {
    type: 'ogham_shard',
    title: 'Ogham Shards',
    icon: 'Gem',
    listColumns: ['icon', 'name', 'element', 'shard_type', 'rarity'],
    fields: [
      { name: 'name', label: 'Shard Name', type: 'text', required: true, placeholder: 'Fire Shard' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '🔮' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'family_id', label: 'Ogham Family ID', type: 'number' },
      { name: 'element', label: 'Element', type: 'text', placeholder: 'fire' },
      { name: 'shard_type', label: 'Type', type: 'select', options: [
        { value: 'offensive', label: 'Offensive' }, { value: 'defensive', label: 'Defensive' },
        { value: 'utility', label: 'Utility' }, { value: 'wild', label: 'Wild' },
      ]},
      { name: 'drop_chance_pct', label: 'Drop Chance %', type: 'number', default: 5 },
      { name: 'rarity', label: 'Rarity', type: 'select', options: [
        { value: 'common', label: 'Common' }, { value: 'uncommon', label: 'Uncommon' },
        { value: 'rare', label: 'Rare' }, { value: 'epic', label: 'Epic' },
      ]},
    ]
  },
  shard_recipes: {
    type: 'shard_recipe',
    title: 'Shard Recipes',
    icon: 'Sparkles',
    listColumns: ['name', 'result_type', 'gold_cost'],
    fields: [
      { name: 'name', label: 'Recipe Name', type: 'text', required: true, placeholder: 'Flame Storm' },
      { name: 'shard_1_id', label: 'Shard 1 ID', type: 'number', required: true },
      { name: 'shard_2_id', label: 'Shard 2 ID', type: 'number', required: true },
      { name: 'shard_3_id', label: 'Shard 3 ID', type: 'number', required: true },
      { name: 'result_type', label: 'Result Type', type: 'select', options: [
        { value: 'ogham', label: 'Creates Ogham' }, { value: 'spell', label: 'Creates Spell' },
        { value: 'wild_magic', label: 'Wild Magic (random)' },
      ]},
      { name: 'result_ogham_id', label: 'Result Ogham ID', type: 'number' },
      { name: 'result_skill_id', label: 'Result Skill ID', type: 'number' },
      { name: 'result_item_id', label: 'Result Item ID', type: 'number' },
      { name: 'wild_effect_json', label: 'Wild Magic Effects (JSON)', type: 'json', placeholder: '{"random_element":true,"damage_range":[10,100]}' },
      { name: 'gold_cost', label: 'Gold Cost', type: 'number', default: 50 },
    ]
  },
  corruption_tiers: {
    type: 'corruption_tier',
    title: 'Corruption Tiers',
    icon: 'Skull',
    listColumns: ['name', 'threshold'],
    fields: [
      { name: 'name', label: 'Tier Name', type: 'text', placeholder: 'Tainted' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '💜' },
      { name: 'threshold', label: 'Corruption Points Threshold', type: 'number', required: true },
      { name: 'bonus_stat_json', label: 'Bonus Stats (JSON)', type: 'json', placeholder: '{"atk":5}' },
      { name: 'curse_effect_json', label: 'Curse Effect (JSON)', type: 'json', placeholder: '{"max_hp_reduction":10}' },
    ]
  },
  magic_schools: {
    type: 'magic_school',
    title: 'Magic Schools',
    icon: 'BookOpen',
    listColumns: ['icon', 'name', 'cost_reduction_per_level', 'damage_bonus_per_level'],
    fields: [
      { name: 'name', label: 'School Name', type: 'text', required: true, placeholder: 'Destruction' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '📖' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'cost_reduction_per_level', label: 'Cost Reduction % per Affinity', type: 'number', default: 1.0 },
      { name: 'damage_bonus_per_level', label: 'Damage Bonus % per Affinity', type: 'number', default: 0.5 },
    ]
  },
  enchantments: {
    type: 'enchantment',
    title: 'Enchantments',
    icon: 'Sparkles',
    listColumns: ['icon', 'name', 'duration_battles', 'applicable_to'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Flame Edge' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '✨' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'ogham_cost_id', label: 'Ogham Consumed (ID)', type: 'number' },
      { name: 'effect_json', label: 'Effect (JSON)', type: 'json', required: true, placeholder: '{"fire_damage":10,"speed":2}' },
      { name: 'duration_battles', label: 'Duration (battles)', type: 'number', default: 50 },
      { name: 'applicable_to', label: 'Applicable To', type: 'select', options: [
        { value: 'weapon', label: 'Weapon' }, { value: 'armor', label: 'Armor' },
        { value: 'accessory', label: 'Accessory' }, { value: 'any', label: 'Any' },
      ]},
    ]
  },
  rituals: {
    type: 'ritual',
    title: 'Ritual Magic',
    icon: 'Users',
    listColumns: ['icon', 'name', 'min_participants', 'channel_turns'],
    fields: [
      { name: 'name', label: 'Ritual Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '🔯' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'min_participants', label: 'Min Participants', type: 'number', default: 2 },
      { name: 'max_participants', label: 'Max Participants', type: 'number', default: 4 },
      { name: 'required_elements_json', label: 'Required Elements (JSON)', type: 'json', placeholder: '["fire","water","earth"]' },
      { name: 'channel_turns', label: 'Channel Turns', type: 'number', default: 3 },
      { name: 'effect_json', label: 'Effect (JSON)', type: 'json', required: true, placeholder: '{"aoe_damage":"MO*5","party_heal_pct":50}' },
      { name: 'cooldown_battles', label: 'Cooldown (battles)', type: 'number', default: 5 },
      { name: 'level_required', label: 'Level Required', type: 'number', default: 10 },
    ]
  },
  magic_resistances: {
    type: 'magic_resist',
    title: 'Magic Resistances',
    icon: 'Shield',
    listColumns: ['source_type', 'source_id', 'element', 'resistance_pct'],
    fields: [
      { name: 'source_type', label: 'Source', type: 'select', required: true, options: [
        { value: 'race', label: 'Race' }, { value: 'class', label: 'Class' }, { value: 'item', label: 'Item' },
      ]},
      { name: 'source_id', label: 'Source ID', type: 'number', required: true },
      { name: 'element', label: 'Element', type: 'text', required: true, placeholder: 'fire' },
      { name: 'resistance_pct', label: 'Resistance % (negative = weakness)', type: 'number', default: 0 },
    ]
  },
  artifact_rivalries: {
    type: 'artifact_rivalry',
    title: 'Artifact Rivalries',
    icon: 'Swords',
    listColumns: ['artifact_a_id', 'artifact_b_id', 'relation'],
    fields: [
      { name: 'artifact_a_id', label: 'Artifact A ID', type: 'number', required: true },
      { name: 'artifact_b_id', label: 'Artifact B ID', type: 'number', required: true },
      { name: 'relation', label: 'Relation', type: 'select', options: [
        { value: 'allied', label: 'Allied (boost each other)' },
        { value: 'rival', label: 'Rival (conflict)' },
        { value: 'neutral', label: 'Neutral' },
      ]},
      { name: 'effect_json', label: 'Effects (JSON)', type: 'json', placeholder: '{"allied":{"atk_bonus":10},"rival":{"clash_damage":true}}' },
      { name: 'lore_text', label: 'Lore Text', type: 'textarea' },
    ]
  },
  combo_chains: {
    type: 'combo_chain',
    title: 'Combo Chains',
    icon: 'Zap',
    listColumns: ['name', 'bonus_damage_mult', 'class_id'],
    fields: [
      { name: 'name', label: 'Combo Name', type: 'text', required: true, placeholder: 'Raging Storm' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'sequence_json', label: 'Command Sequence (JSON array of cmd IDs)', type: 'json', required: true, placeholder: '[1, 3, 5]' },
      { name: 'bonus_damage_mult', label: 'Bonus Damage Multiplier', type: 'number', default: 2.0 },
      { name: 'bonus_effect_json', label: 'Bonus Effect (JSON)', type: 'json', placeholder: '{"stun":true,"duration":1}' },
      { name: 'class_id', label: 'Class ID (blank=any)', type: 'number' },
      { name: 'style_id', label: 'Fighting Style ID (blank=any)', type: 'number' },
    ]
  },
  summons: {
    type: 'summon',
    title: 'Summons',
    icon: 'Sparkles',
    listColumns: ['icon', 'name', 'mp_cost', 'duration_turns', 'class_id'],
    fields: [
      { name: 'name', label: 'Summon Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '🐉' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'class_id', label: 'Class ID (blank=any)', type: 'number' },
      { name: 'mp_cost', label: 'MP Cost', type: 'number', default: 50 },
      { name: 'duration_turns', label: 'Duration (turns)', type: 'number', default: 3 },
      { name: 'stats_json', label: 'Stats (JSON)', type: 'json', required: true, placeholder: '{"hp":200,"atk":30,"def":20,"speed":10}' },
      { name: 'skills_json', label: 'Skill/Command IDs (JSON)', type: 'json', placeholder: '[1, 2]' },
      { name: 'level_required', label: 'Level Required', type: 'number', default: 1 },
      { name: 'cooldown_battles', label: 'Cooldown (battles)', type: 'number', default: 1 },
    ]
  },
  arena_seasons: {
    type: 'arena_season',
    title: 'Arena Seasons',
    icon: 'Calendar',
    listColumns: ['name', 'is_active', 'starts_at', 'ends_at'],
    fields: [
      { name: 'name', label: 'Season Name', type: 'text', required: true, placeholder: 'Season 1: Blood Moon' },
      { name: 'arena_id', label: 'Arena ID (blank=all arenas)', type: 'number' },
      { name: 'starts_at', label: 'Starts At (UTC)', type: 'text', placeholder: '2026-04-01 00:00:00' },
      { name: 'ends_at', label: 'Ends At (UTC)', type: 'text', placeholder: '2026-06-30 23:59:59' },
      { name: 'is_active', label: 'Active', type: 'checkbox' },
      { name: 'prize_tiers_json', label: 'Prize Tiers (JSON)', type: 'json', placeholder: '{"1":{"gold":5000,"title_id":1},"2":{"gold":2500},"3":{"gold":1000}}' },
    ]
  },
  map_hazards: {
    type: 'map_hazard',
    title: 'Map Hazards',
    icon: 'AlertTriangle',
    listColumns: ['map_id', 'hazard_type', 'x', 'y'],
    fields: [
      { name: 'map_id', label: 'Map ID', type: 'number', required: true },
      { name: 'x', label: 'X', type: 'number', required: true },
      { name: 'y', label: 'Y', type: 'number', required: true },
      { name: 'hazard_type', label: 'Hazard Type', type: 'select', options: [
        { value: 'poison_swamp', label: 'Poison Swamp' },
        { value: 'lava', label: 'Lava' },
        { value: 'healing_spring', label: 'Healing Spring' },
        { value: 'ice', label: 'Ice (slip)' },
        { value: 'thorns', label: 'Thorns' },
        { value: 'quicksand', label: 'Quicksand (slow)' },
      ]},
      { name: 'damage_per_step', label: 'Damage per Step', type: 'number', default: 0 },
      { name: 'heal_per_step', label: 'Heal per Step', type: 'number', default: 0 },
      { name: 'status_effect_id', label: 'Apply Status Effect ID', type: 'number' },
      { name: 'description', label: 'Description', type: 'text' },
    ]
  },
  status_immunities: {
    type: 'status_immunity',
    title: 'Status Immunities',
    icon: 'Shield',
    listColumns: ['source_type', 'source_id', 'status_id'],
    fields: [
      { name: 'source_type', label: 'Source Type', type: 'select', required: true, options: [
        { value: 'race', label: 'Race' },
        { value: 'class', label: 'Class' },
        { value: 'item', label: 'Item' },
      ]},
      { name: 'source_id', label: 'Source ID (race/class/item)', type: 'number', required: true },
      { name: 'status_id', label: 'Immune to Status Effect ID', type: 'number', required: true },
    ]
  },
  backgrounds: {
    type: 'background',
    title: 'Backgrounds',
    icon: 'BookOpen',
    listColumns: ['name', 'description'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'bonus_hp', label: 'Bonus HP', type: 'number', default: 0 },
      { name: 'bonus_mp', label: 'Bonus MP', type: 'number', default: 0 },
      { name: 'bonus_atk', label: 'Bonus ATK', type: 'number', default: 0 },
      { name: 'bonus_def', label: 'Bonus DEF', type: 'number', default: 0 },
      { name: 'bonus_mo', label: 'Bonus MO', type: 'number', default: 0 },
      { name: 'bonus_md', label: 'Bonus MD', type: 'number', default: 0 },
      { name: 'bonus_speed', label: 'Bonus Speed', type: 'number', default: 0 },
      { name: 'bonus_luck', label: 'Bonus Luck', type: 'number', default: 0 },
    ]
  },
  loot_tables: {
    type: 'loot_table',
    title: 'Loot Tables',
    icon: 'Layers',
    listColumns: ['name', 'npc_id', 'gold_min', 'gold_max'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Goblin Drops' },
      { name: 'npc_id', label: 'NPC/Enemy ID (optional)', type: 'number' },
      { name: 'items_json', label: 'Items (JSON)', type: 'json', placeholder: '[{"item_id":1,"weight":10,"min_qty":1,"max_qty":3}]' },
      { name: 'gold_min', label: 'Gold Min', type: 'number', default: 0 },
      { name: 'gold_max', label: 'Gold Max', type: 'number', default: 0 },
      { name: 'xp_min', label: 'XP Min', type: 'number', default: 0 },
      { name: 'xp_max', label: 'XP Max', type: 'number', default: 0 },
    ]
  },
  region_weather: {
    type: 'region_weather',
    title: 'Region Weather',
    icon: 'CloudRain',
    listColumns: ['region_id', 'weather_type', 'weight', 'duration_minutes'],
    fields: [
      { name: 'region_id', label: 'Region ID', type: 'number', required: true },
      { name: 'weather_type', label: 'Weather Type', type: 'select', required: true, options: [
        { value: 'clear', label: 'Clear' }, { value: 'rain', label: 'Rain' },
        { value: 'snow', label: 'Snow' }, { value: 'fog', label: 'Fog' },
        { value: 'blood_moon', label: 'Blood Moon' }, { value: 'ash_fall', label: 'Ash Fall' },
        { value: 'storm', label: 'Storm' }, { value: 'blizzard', label: 'Blizzard' },
      ]},
      { name: 'weight', label: 'Weight (higher = more likely)', type: 'number', default: 1 },
      { name: 'duration_minutes', label: 'Duration (minutes)', type: 'number', default: 30 },
      { name: 'stat_modifiers', label: 'Stat Modifiers (JSON)', type: 'json', placeholder: '{"dodge_chance":-5, "accuracy":-10}' },
      { name: 'description', label: 'Description', type: 'text', placeholder: 'Heavy rain reduces visibility...' },
    ]
  },
  npc_patrols: {
    type: 'npc_patrol',
    title: 'NPC Patrols',
    icon: 'Route',
    listColumns: ['npc_id', 'map_id', 'speed', 'loop_type', 'is_enabled'],
    fields: [
      { name: 'npc_id', label: 'NPC ID', type: 'number', required: true },
      { name: 'map_id', label: 'Map ID', type: 'number', required: true },
      { name: 'waypoints', label: 'Waypoints (JSON)', type: 'json', required: true, placeholder: '[{"x":5,"y":3,"pause":2},{"x":10,"y":3,"pause":0}]' },
      { name: 'speed', label: 'Speed (tiles/sec)', type: 'number', default: 1 },
      { name: 'loop_type', label: 'Loop Type', type: 'select', options: [
        { value: 'loop', label: 'Loop (A→B→A→B)' },
        { value: 'pingpong', label: 'Ping-Pong (A→B→A)' },
        { value: 'once', label: 'Once (A→B stop)' },
      ]},
      { name: 'active_hours', label: 'Active Hours (e.g. 6-18)', type: 'text', placeholder: '6-18 for daytime' },
      { name: 'is_enabled', label: 'Enabled', type: 'checkbox' },
    ]
  },
  world_events: {
    type: 'world_event',
    title: 'World Events',
    icon: 'Zap',
    listColumns: ['icon', 'name', 'event_type', 'is_active'],
    fields: [
      { name: 'name', label: 'Event Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '🌑' },
      { name: 'event_type', label: 'Trigger Type', type: 'select', options: [
        { value: 'timed', label: 'Timed (scheduled)' },
        { value: 'flag_triggered', label: 'World Flag Triggered' },
        { value: 'manual', label: 'Manual (admin activates)' },
      ]},
      { name: 'trigger_flag', label: 'Trigger Flag (for flag_triggered)', type: 'text', placeholder: 'blood_moon_rising' },
      { name: 'starts_at', label: 'Starts At (UTC)', type: 'text', placeholder: '2026-03-20 18:00:00' },
      { name: 'ends_at', label: 'Ends At (UTC)', type: 'text', placeholder: '2026-03-20 20:00:00' },
      { name: 'duration_minutes', label: 'Duration (min)', type: 'number', default: 60 },
      { name: 'affected_regions', label: 'Affected Region IDs (JSON)', type: 'json', placeholder: '[1,2,3] or null for all' },
      { name: 'stat_modifiers', label: 'Stat Modifiers (JSON)', type: 'json', placeholder: '{"enemy_atk_mult":1.5}' },
      { name: 'lore_text', label: 'Lore Text (shown to players)', type: 'textarea', placeholder: 'The Blood Moon rises...' },
      { name: 'is_active', label: 'Currently Active', type: 'checkbox' },
      { name: 'recurring', label: 'Recurring', type: 'checkbox' },
      { name: 'recur_interval_hours', label: 'Recurrence Interval (hours)', type: 'number' },
    ]
  },
  spawn_waves: {
    type: 'spawn_wave',
    title: 'Spawn Waves',
    icon: 'Layers',
    listColumns: ['spawn_id', 'wave_number', 'is_boss_wave', 'delay_seconds'],
    fields: [
      { name: 'spawn_id', label: 'Spawn Zone ID', type: 'number', required: true },
      { name: 'wave_number', label: 'Wave Number', type: 'number', required: true, default: 1 },
      { name: 'enemies', label: 'Enemies (JSON)', type: 'json', required: true, placeholder: '[{"npc_id":5,"count":3},{"npc_id":8,"count":1}]' },
      { name: 'delay_seconds', label: 'Delay Before Wave (sec)', type: 'number', default: 0 },
      { name: 'is_boss_wave', label: 'Boss Wave', type: 'checkbox' },
    ]
  },
  region_rep_gates: {
    type: 'region_rep_gate',
    title: 'Rep Gates',
    icon: 'Shield',
    listColumns: ['region_id', 'faction_id', 'min_reputation', 'deny_message'],
    fields: [
      { name: 'region_id', label: 'Region ID', type: 'number', required: true },
      { name: 'faction_id', label: 'Faction ID', type: 'number', required: true },
      { name: 'min_reputation', label: 'Min Reputation to Enter', type: 'number', default: 0 },
      { name: 'max_reputation', label: 'Max Reputation (null = no cap)', type: 'number' },
      { name: 'deny_message', label: 'Deny Message', type: 'text', default: 'You are not welcome here.' },
    ]
  },
  tournaments: {
    type: 'tournament',
    title: 'Tournaments',
    icon: 'Trophy',
    listColumns: ['name', 'status', 'type', 'max_participants'],
    fields: [
      { name: 'name', label: 'Tournament Name', type: 'text', required: true },
      { name: 'status', label: 'Status', type: 'select', options: [
        { value: 'draft', label: 'Draft' }, { value: 'registration', label: 'Registration Open' },
        { value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' },
      ]},
      { name: 'type', label: 'Type', type: 'select', options: [
        { value: 'single_elimination', label: 'Single Elimination' },
        { value: 'double_elimination', label: 'Double Elimination' },
        { value: 'round_robin', label: 'Round Robin' },
        { value: 'swiss', label: 'Swiss' },
      ]},
      { name: 'max_participants', label: 'Max Participants', type: 'number', default: 16 },
      { name: 'min_level', label: 'Min Level', type: 'number', default: 1 },
      { name: 'max_level', label: 'Max Level', type: 'number', default: 99 },
      { name: 'entry_fee', label: 'Entry Fee (gold)', type: 'number', default: 0 },
      { name: 'prize_json', label: 'Prizes (JSON)', type: 'json', placeholder: '{"gold":1000,"item_id":5}' },
      { name: 'arena_id', label: 'Arena ID', type: 'number' },
    ]
  },
  tourney_history: {
    type: 'tourney_history',
    title: 'Tournament History',
    icon: 'History',
    listColumns: ['tournament_id', 'character_id', 'placement', 'wins'],
    fields: [
      { name: 'tournament_id', label: 'Tournament ID', type: 'number', required: true },
      { name: 'character_id', label: 'Character ID', type: 'number', required: true },
      { name: 'placement', label: 'Placement (1st, 2nd, etc)', type: 'number' },
      { name: 'wins', label: 'Wins', type: 'number', default: 0 },
      { name: 'losses', label: 'Losses', type: 'number', default: 0 },
    ]
  },
  class_mastery: {
    type: 'class_mastery',
    title: 'Class Mastery',
    icon: 'Crown',
    listColumns: ['class_id', 'title', 'mastery_xp_required'],
    fields: [
      { name: 'class_id', label: 'Class ID', type: 'number', required: true },
      { name: 'mastery_xp_required', label: 'Mastery XP Required', type: 'number', default: 1000000 },
      { name: 'title', label: 'Mastery Title', type: 'text', default: 'Master', placeholder: 'Grand Master' },
      { name: 'title_color', label: 'Title Color (hex)', type: 'text', default: '#ffd700' },
      { name: 'glow_effect', label: 'Glow Effect', type: 'select', options: [
        { value: 'gold_shimmer', label: 'Gold Shimmer' },
        { value: 'silver_pulse', label: 'Silver Pulse' },
        { value: 'rainbow', label: 'Rainbow' },
        { value: 'none', label: 'None' },
      ]},
      { name: 'bonus_stats_json', label: 'Mastery Bonus Stats (JSON)', type: 'json', placeholder: '{"atk":10,"speed":5}' },
      { name: 'mastery_skills_json', label: 'Mastery Skill IDs (JSON)', type: 'json', placeholder: '[1,2,3]' },
    ]
  },
  stat_caps: {
    type: 'stat_cap',
    title: 'Stat Caps',
    icon: 'TrendingUp',
    listColumns: ['stat_key', 'tier', 'threshold', 'effectiveness'],
    fields: [
      { name: 'stat_key', label: 'Stat Key (e.g. atk, def, speed)', type: 'text', required: true },
      { name: 'tier', label: 'Tier', type: 'number', required: true, default: 1 },
      { name: 'threshold', label: 'Threshold (stat value where this tier starts)', type: 'number', required: true },
      { name: 'effectiveness', label: 'Effectiveness (1.0=full, 0.5=half)', type: 'number', default: 1 },
    ]
  },
  titles: {
    type: 'title',
    title: 'Character Titles',
    icon: 'Award',
    listColumns: ['name', 'display_text', 'title_type', 'source'],
    fields: [
      { name: 'name', label: 'Internal Name', type: 'text', required: true },
      { name: 'display_text', label: 'Display Text', type: 'text', required: true, placeholder: 'the Brave' },
      { name: 'title_type', label: 'Position', type: 'select', options: [
        { value: 'suffix', label: 'Suffix (Name the Brave)' },
        { value: 'prefix', label: 'Prefix (Shadow Name)' },
      ]},
      { name: 'description', label: 'How to earn it', type: 'textarea' },
      { name: 'color', label: 'Title Color (hex)', type: 'text', placeholder: '#ffd700' },
      { name: 'stat_bonus_json', label: 'Stat Bonus (JSON)', type: 'json', placeholder: '{"luck":3}' },
      { name: 'source', label: 'Earned From', type: 'select', options: [
        { value: 'achievement', label: 'Achievement' },
        { value: 'quest', label: 'Quest' },
        { value: 'mastery', label: 'Class Mastery' },
        { value: 'transformation', label: 'Transformation' },
        { value: 'admin', label: 'Admin Granted' },
      ]},
      { name: 'source_id', label: 'Source ID (achievement/quest ID)', type: 'number' },
    ]
  },
  subclasses: {
    type: 'subclass',
    title: 'Subclasses',
    icon: 'GitBranch',
    listColumns: ['icon', 'name', 'class_id', 'unlock_level'],
    fields: [
      { name: 'class_id', label: 'Parent Class ID', type: 'number', required: true },
      { name: 'name', label: 'Subclass Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '⚔️' },
      { name: 'unlock_level', label: 'Unlock Level', type: 'number', default: 10 },
      { name: 'bonus_stats_json', label: 'Bonus Stats (JSON)', type: 'json', placeholder: '{"atk":5,"speed":2}' },
      { name: 'skills_json', label: 'Unlocked Skill IDs (JSON)', type: 'json', placeholder: '[1,2,3]' },
    ]
  },
  racial_abilities: {
    type: 'racial_ability',
    title: 'Racial Abilities',
    icon: 'Sparkles',
    listColumns: ['icon', 'name', 'race_id', 'ability_type', 'unlock_level'],
    fields: [
      { name: 'race_id', label: 'Race ID', type: 'number', required: true },
      { name: 'name', label: 'Ability Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '✨' },
      { name: 'ability_type', label: 'Type', type: 'select', options: [
        { value: 'passive', label: 'Passive' },
        { value: 'active', label: 'Active' },
      ]},
      { name: 'effect_json', label: 'Effect (JSON)', type: 'json', placeholder: '{"stat":"speed","bonus":2}' },
      { name: 'cooldown_turns', label: 'Cooldown Turns (active only)', type: 'number' },
      { name: 'unlock_level', label: 'Unlock Level', type: 'number', default: 1 },
    ]
  },
  item_sets: {
    type: 'item_set',
    title: 'Item Sets',
    icon: 'Shield',
    listColumns: ['icon', 'name'],
    fields: [
      { name: 'name', label: 'Set Name', type: 'text', required: true, placeholder: 'Dark Ogham Set' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '🛡️' },
      { name: 'item_ids_json', label: 'Item IDs (JSON array)', type: 'json', required: true, placeholder: '[1, 2, 3, 4]' },
      { name: 'bonuses_json', label: 'Set Bonuses (JSON)', type: 'json', placeholder: '{"2":{"def":5},"3":{"def":10,"max_hp":50},"4":{"def":20,"max_hp":100}}' },
    ]
  },
  npc_schedules: {
    type: 'npc_schedule',
    title: 'NPC Schedules',
    icon: 'Clock',
    listColumns: ['npc_id', 'start_hour', 'end_hour', 'map_id', 'is_active'],
    fields: [
      { name: 'npc_id', label: 'NPC ID', type: 'number', required: true },
      { name: 'start_hour', label: 'Start Hour (0-23)', type: 'number', default: 6 },
      { name: 'end_hour', label: 'End Hour (0-23)', type: 'number', default: 18 },
      { name: 'map_id', label: 'Map ID (location during these hours)', type: 'number', required: true },
      { name: 'x', label: 'X', type: 'number', default: 5 },
      { name: 'y', label: 'Y', type: 'number', default: 5 },
      { name: 'is_active', label: 'Active', type: 'checkbox' },
    ]
  },
  enemy_scaling: {
    type: 'enemy_scaling',
    title: 'Enemy Scaling',
    icon: 'TrendingUp',
    listColumns: ['npc_id', 'scale_mode', 'stat_scale_pct', 'hp_scale_pct'],
    fields: [
      { name: 'npc_id', label: 'Enemy NPC ID', type: 'number', required: true },
      { name: 'scale_mode', label: 'Scale Mode', type: 'select', options: [
        { value: 'player_level', label: 'Player Level' },
        { value: 'party_size', label: 'Party Size' },
        { value: 'both', label: 'Both' },
      ]},
      { name: 'stat_scale_pct', label: 'Stat Scale % per Level', type: 'number', default: 10 },
      { name: 'hp_scale_pct', label: 'HP Scale % per Level', type: 'number', default: 15 },
      { name: 'max_level_cap', label: 'Max Level Cap (blank = none)', type: 'number' },
      { name: 'min_level', label: 'Min Level to Start Scaling', type: 'number', default: 1 },
    ]
  },
  ability_scores: {
    type: 'ability_score',
    title: 'Ability Scores',
    icon: 'BarChart3',
    listColumns: ['icon', 'name', 'celtic_name', 'key_name'],
    fields: [
      { name: 'key_name', label: 'Key (code name)', type: 'text', required: true, placeholder: 'strength' },
      { name: 'name', label: 'Display Name', type: 'text', required: true },
      { name: 'celtic_name', label: 'Celtic Name', type: 'text', placeholder: 'Neart' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '💪' },
      { name: 'min_value', label: 'Min Value', type: 'number', default: 8 },
      { name: 'max_value', label: 'Max Value', type: 'number', default: 15 },
      { name: 'base_value', label: 'Base Value', type: 'number', default: 8 },
      { name: 'sort_order', label: 'Sort Order', type: 'number', default: 0 },
    ]
  },
  ability_effects: {
    type: 'ability_effect',
    title: 'Ability Effects',
    icon: 'Zap',
    listColumns: ['ability_id', 'stat_key', 'bonus_per_point'],
    fields: [
      { name: 'ability_id', label: 'Ability Score ID', type: 'number', required: true },
      { name: 'stat_key', label: 'Stat Key (e.g. atk, max_hp, dodge_chance)', type: 'text', required: true },
      { name: 'bonus_per_point', label: 'Bonus per Point Above 10', type: 'number', default: 1 },
      { name: 'description', label: 'Description', type: 'text', placeholder: '+1 ATK per point above 10' },
    ]
  },
  race_ability_bonuses: {
    type: 'race_ability_bonus',
    title: 'Race Ability Bonuses',
    icon: 'Shield',
    listColumns: ['race_id', 'ability_id', 'bonus'],
    fields: [
      { name: 'race_id', label: 'Race ID', type: 'number', required: true },
      { name: 'ability_id', label: 'Ability Score ID', type: 'number', required: true },
      { name: 'bonus', label: 'Bonus', type: 'number', default: 0 },
    ]
  },
  class_ability_bonuses: {
    type: 'class_ability_bonus',
    title: 'Class Ability Bonuses',
    icon: 'Swords',
    listColumns: ['class_id', 'ability_id', 'bonus'],
    fields: [
      { name: 'class_id', label: 'Class ID', type: 'number', required: true },
      { name: 'ability_id', label: 'Ability Score ID', type: 'number', required: true },
      { name: 'bonus', label: 'Bonus', type: 'number', default: 0 },
    ]
  },
  bg_ability_bonuses: {
    type: 'bg_ability_bonus',
    title: 'Background Ability Bonuses',
    icon: 'BookOpen',
    listColumns: ['background_id', 'ability_id', 'bonus'],
    fields: [
      { name: 'background_id', label: 'Background ID', type: 'number', required: true },
      { name: 'ability_id', label: 'Ability Score ID', type: 'number', required: true },
      { name: 'bonus', label: 'Bonus', type: 'number', default: 0 },
    ]
  },
  race_class_access: {
    type: 'race_class_access',
    title: 'Race/Class Access',
    icon: 'ToggleLeft',
    listColumns: ['race_id', 'class_id'],
    fields: [
      { name: 'race_id', label: 'Race ID', type: 'number', required: true },
      { name: 'class_id', label: 'Class ID', type: 'number', required: true },
    ]
  },
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
