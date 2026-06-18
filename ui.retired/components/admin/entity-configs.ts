import { EntityType } from "@/lib/admin-api"

export interface EntityConfig {
  type: EntityType
  title: string
  icon: string
  fields: FieldConfig[]
  listColumns: string[]
}

export interface FieldConfig {
  name: string
  label: string
  type: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'json' | 'icon'
  options?: { value: string; label: string }[]
  required?: boolean
  placeholder?: string
  default?: unknown
}

// Configuration for each entity type
export const ENTITY_CONFIGS: Record<string, EntityConfig> = {
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
  structure_templates: {
    type: 'structure_template',
    title: 'Structure Templates',
    icon: 'Building2',
    listColumns: ['name', 'icon', 'interior_map_id'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon', type: 'text', placeholder: '🏠' },
      { name: 'interior_map_id', label: 'Interior Map ID', type: 'number' },
      { name: 'default_data_json', label: 'Default Data (JSON)', type: 'json' },
      { name: 'is_active', label: 'Active?', type: 'checkbox', default: 1 },
    ],
  },
  capsule_items: {
    type: 'capsule',
    title: 'Capsule Items',
    icon: 'Pill',
    listColumns: ['item_id', 'capsule_type', 'is_reusable', 'structure_name'],
    fields: [
      { name: 'item_id', label: 'Item ID (from game_items)', type: 'number', required: true },
      { name: 'capsule_type', label: 'Capsule Type', type: 'select', required: true, options: [
        { value: 'TRANSPORT', label: 'Transport (teleport to map)' },
        { value: 'STRUCTURE', label: 'Structure (deploy building)' },
        { value: 'SPAWN', label: 'Spawn (summon NPC/vehicle)' },
      ]},
      { name: 'is_reusable', label: 'Reusable?', type: 'checkbox', default: 0 },
      { name: 'target_map_id', label: 'Target Map ID (Transport)', type: 'number' },
      { name: 'target_x', label: 'Target X (Transport)', type: 'number' },
      { name: 'target_y', label: 'Target Y (Transport)', type: 'number' },
      { name: 'structure_name', label: 'Structure/Spawn Name', type: 'text' },
      { name: 'structure_icon', label: 'Structure Icon', type: 'text', placeholder: '🏠' },
      { name: 'structure_data_json', label: 'Structure Data (JSON)', type: 'json' },
      { name: 'deploy_offset_x', label: 'Deploy Offset X', type: 'number', default: 0 },
      { name: 'deploy_offset_y', label: 'Deploy Offset Y', type: 'number', default: 1 },
      { name: 'duration_minutes', label: 'Duration (minutes, blank=permanent)', type: 'number' },
      { name: 'spawn_npc_id', label: 'Spawn NPC ID (Spawn type)', type: 'number' },
    ],
  },
  themes: {
    type: 'theme',
    title: 'UI Themes',
    icon: 'Palette',
    listColumns: ['id', 'name', 'panel_style', 'is_active'],
    fields: [
      { name: 'id', label: 'Theme ID (slug, e.g. "dark-ocean")', type: 'text', required: true },
      { name: 'name', label: 'Display Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'panel_style', label: 'Panel Style', type: 'select', options: [
        { value: 'solid', label: 'Solid (opaque panels)' },
        { value: 'glass', label: 'Glass (frosted transparency)' },
      ]},
      { name: 'sort_order', label: 'Sort Order', type: 'number', default: 0 },
      { name: 'is_active', label: 'Active?', type: 'checkbox', default: 1 },
      // Colors JSON — the full color palette
      // Each key maps to a CSS variable used throughout the entire UI.
      //
      // FORMAT: oklch(lightness chroma hue) — modern CSS color space
      //   lightness: 0 (black) to 1 (white)
      //   chroma: 0 (grey) to 0.4 (vivid)
      //   hue: 0-360 (red=25, orange=60, yellow=85, green=140, teal=180, blue=250, purple=300, pink=340)
      //
      // REQUIRED KEYS:
      //   background, foreground — main page bg/text
      //   card, cardForeground — panel/card bg/text
      //   primary, primaryForeground — buttons, links, active states
      //   secondary, secondaryForeground — subtle backgrounds
      //   muted, mutedForeground — disabled/hint text
      //   accent, accentForeground — highlights
      //   destructive — delete/danger color
      //   border — borders between panels
      //   ring — focus ring color
      //   health, mana, experience, gold, limitBreak — game-specific bar colors
      //
      // EXAMPLE (dark red theme):
      // {"background":"oklch(0.13 0.04 15)","foreground":"oklch(0.90 0.04 15)",
      //  "card":"oklch(0.17 0.05 15)","cardForeground":"oklch(0.90 0.04 15)",
      //  "primary":"oklch(0.55 0.22 15)","primaryForeground":"oklch(0.98 0 0)",
      //  "secondary":"oklch(0.20 0.05 15)","secondaryForeground":"oklch(0.80 0.04 15)",
      //  "muted":"oklch(0.22 0.04 15)","mutedForeground":"oklch(0.55 0.04 15)",
      //  "accent":"oklch(0.50 0.12 160)","accentForeground":"oklch(0.98 0 0)",
      //  "destructive":"oklch(0.55 0.22 25)","border":"oklch(0.28 0.06 15)",
      //  "ring":"oklch(0.55 0.22 15)",
      //  "health":"oklch(0.50 0.18 140)","mana":"oklch(0.50 0.18 260)",
      //  "experience":"oklch(0.55 0.15 85)","gold":"oklch(0.60 0.18 80)",
      //  "limitBreak":"oklch(0.55 0.22 310)"}
      //
      // TIP: To make a new theme, copy an existing one's colors_json and change the hue values.
      // Shifting all hues by the same amount creates a harmonious palette in a different color.
      { name: 'colors_json', label: 'Color Palette (JSON)', type: 'json', required: true },
    ],
  },
  tile_types: {
    type: 'tile_type',
    title: 'Tile Types',
    icon: 'Grid3x3',
    listColumns: ['id', 'name', 'color', 'category', 'is_passable'],
    fields: [
      { name: 'id', label: 'Tile ID', type: 'number', required: true },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'color', label: 'Color (hex)', type: 'text', required: true, placeholder: '#1a3a1a' },
      { name: 'category', label: 'Category', type: 'text', default: 'Core' },
      { name: 'sort_order', label: 'Sort Order', type: 'number', default: 0 },
      { name: 'is_passable', label: 'Passable?', type: 'checkbox', default: 1 },
      { name: 'is_active', label: 'Active?', type: 'checkbox', default: 1 },
    ],
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
      { name: 'render_mode', label: 'Render Mode Override', type: 'select', options: [
        { value: '', label: 'Use World Default' },
        { value: 'classic', label: 'Classic (flat top-down)' },
        { value: '2.5d', label: '2.5D (extruded elevation)' },
        { value: 'isometric', label: 'Isometric (diamond grid)' },
        { value: 'hex', label: 'Hex (hexagonal grid)' },
        { value: 'side-scroll', label: 'Side-scroll (platformer view)' },
        { value: 'first-person', label: 'First-person (dungeon crawler)' },
        { value: '3d', label: '3D (Three.js — real 3D with camera)' },
      ]},
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
      { name: 'override_signature_techs', label: 'Signature Techs Override', type: 'select', options: [
        { value: 'default', label: 'Use Global Setting' },
        { value: 'on', label: 'Force ON' },
        { value: 'off', label: 'Force OFF' }
      ]},
      { name: 'override_summons', label: 'Summons Override', type: 'select', options: [
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
    listColumns: ['icon', 'name', 'type', 'default_duration'],
    fields: [
      // ── Basic Info ──
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon (emoji)', type: 'text', placeholder: '🔥' },
      { name: 'description', label: 'Description (shown to players)', type: 'textarea' },
      { name: 'type', label: 'Type', type: 'select', options: [
        { value: 'buff', label: 'Buff (positive)' },
        { value: 'debuff', label: 'Debuff (negative)' },
        { value: 'neutral', label: 'Neutral (neither good nor bad)' },
      ]},
      { name: 'default_duration', label: 'Duration (turns in battle, minutes on map)', type: 'number', default: 3 },
      { name: 'permanent', label: 'Permanent? (no expiry)', type: 'checkbox', default: 0 },

      // ── Effects JSON ──
      // This single JSON field controls EVERYTHING the status does.
      // The admin panel shows it as raw JSON, but here is a complete guide:
      //
      // ═══ BATTLE EFFECTS ═══
      // "skip_turn": true                    → Can't act (Sleep, Stun, Paralyze, Freeze)
      // "stat_mod": {"atk": 1.5, "def": 0.5} → Multiply stats (1.5 = +50%, 0.5 = -50%, 2.0 = double)
      //   Available stats: atk, def, mo (magic offense), md (magic defense), speed, luck
      // "damage_per_turn": {"formula": "MAXHP*0.05+5"} → Take damage each turn (Poison, Burn, Bleed)
      //   Formula vars: MAXHP, HP, ATK, DEF, MO, MD, SPEED, LUCK, LEVEL
      // "heal_per_turn": {"formula": "MAXHP*0.06+10"} → Heal each turn (Regen)
      // "log": "{name} is poisoned!"          → Battle log message ({name} = character name)
      //
      // ═══ MAP / OVERWORLD EFFECTS ═══
      // "move_mode": "fly"                   → Labels the movement mode
      // "move_speed_mult": 2.0               → Movement speed multiplier (2.0 = double speed)
      // "ignore_passability": true            → Fly over walls, water, mountains
      // "ignore_encounters": true             → Skip random encounters
      // "vision_radius": 8                    → Fog of war reveal range (default 3)
      // "tiles_per_move": 3                   → How many tiles = 1 "move" for daily limits
      // "move_limit": 100                     → Override the daily move cap
      //
      // "thorns": 15                        → Deal 15 flat damage to attacker when hit (Thorn Shield, Fire Aura)
      // "counter_chance": 30                → 30% chance to counter-attack when hit (Riposte, Stance)
      // "crit_chance_mod": 20               → +20% crit chance (Focus, Precision)
      // "evasion_mod": 15                   → +15% dodge chance (Blur, Agility)
      // "element_resist": {"fire":0.5}      → Take 50% fire damage (Fire Resist, Ice Shell)
      //   Multiple elements: {"fire":0.5,"ice":0.5} — values < 1 = resist, > 1 = weak, 0 = immune
      // "element_infuse": "fire"            → Attacks gain fire element (Enchant Fire, Flame Blade)
      // "damage_reflect": 0.3              → Reflect 30% of incoming damage back to attacker (Mirror)
      // "hp_drain": 0.2                     → Lifesteal — heal 20% of damage dealt (Vampiric)
      // "mp_drain": 0.15                    → Steal 15% of damage as MP (Mana Drain)
      // "mp_drain_per_turn": {"formula":"10"} → Lose MP each turn (Curse, Mana Burn)
      // "doom": true                        → Instant KO when duration expires (Doom, Death Sentence)
      // "auto_revive": 0.25                 → Revive at 25% HP when killed (Reraise, Phoenix Down buff)
      //                                        Use true for 25% or a number 0.0-1.0 for custom %
      // "xp_mult": 1.5                      → +50% XP from battles (overworld)
      // "gold_mult": 2.0                    → Double gold drops (overworld)
      // "loot_luck": 0.2                    → +20% better loot rolls (overworld)
      // "gather_bonus": 0.3                 → +30% gathering yield (overworld)
      // "stealth": true                     → Hidden from other players on map (overworld)
      // "hazard_immune": true               → Ignore map hazard damage (overworld — lava walk, poison swamp)
      //
      // ═══ FULL EXAMPLES ═══
      // Poison:     {"damage_per_turn": {"formula": "MAXHP*0.05+5"}, "log": "{name} takes poison damage!"}
      // Sleep:      {"skip_turn": true, "log": "{name} is asleep!"}
      // Stun:       {"skip_turn": true, "log": "{name} is stunned!"}
      // Paralyze:   {"skip_turn": true, "stat_mod": {"speed": 0.0}, "log": "{name} is paralyzed!"}
      // Doom:       {"doom": true, "log": "{name} succumbs to doom!"}
      // Reraise:    {"auto_revive": 0.5, "log": "{name} is protected by reraise!"}
      // ATK Boost:  {"stat_mod": {"atk": 1.5}, "log": "{name} is powered up!"}
      // DEF Down:   {"stat_mod": {"def": 0.6}, "log": "{name}'s defense crumbles!"}
      // Haste:      {"stat_mod": {"speed": 2.0}, "move_speed_mult": 2.0}
      // Slow:       {"stat_mod": {"speed": 0.5}, "move_speed_mult": 0.5}
      // Flight:     {"move_mode": "fly", "ignore_passability": true, "ignore_encounters": true, "move_speed_mult": 1.5, "vision_radius": 8}
      // Shield:     {"stat_mod": {"def": 2.0}, "log": "{name} is shielded!"}
      // Mirror:     {"damage_reflect": 0.5, "log": "{name} is surrounded by mirrors!"}
      // Vampiric:   {"hp_drain": 0.25, "log": "{name} drains life!"}
      // Mana Burn:  {"mp_drain_per_turn": {"formula": "MAXMP*0.1"}, "log": "{name}'s mana drains away!"}
      // Berserk:    {"stat_mod": {"atk": 2.0, "def": 0.5}, "log": "{name} goes berserk!"}
      // Regen:      {"heal_per_turn": {"formula": "MAXHP*0.08"}, "log": "{name} regenerates."}
      // XP Boost:   {"xp_mult": 1.5, "log": "{name} gains bonus experience!"}
      // Lucky:      {"gold_mult": 2.0, "loot_luck": 0.3, "stat_mod": {"luck": 2.0}}
      // Stealth:    {"stealth": true, "ignore_encounters": true}
      // Lava Walk:  {"hazard_immune": true, "ignore_passability": true}
      // Silence:    use the disabled_commands field below with ["magic","heal"]
      { name: 'effects', label: 'Effects (JSON) — see field comments above for all options', type: 'json',
        placeholder: '{"stat_mod": {"atk": 1.5}, "log": "{name} is powered up!"}' },

      // ── Disabled Commands (optional — also settable in effects JSON) ──
      { name: 'disabled_commands', label: 'Disabled Commands (JSON array — e.g. ["magic","heal"] for Silence)', type: 'json', placeholder: '["magic"]' },
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
    listColumns: ['icon', 'name', 'event_type', 'current_phase', 'is_active'],
    fields: [
      { name: 'name', label: 'Event Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'event_type', label: 'Type', type: 'select', options: [
        { value: 'random', label: 'Random (chance-based)' },
        { value: 'scripted', label: 'Scripted (admin-triggered)' },
        { value: 'recurring', label: 'Recurring (repeats)' },
        { value: 'ai_generated', label: 'AI Generated' }
      ]},
      { name: 'region_id', label: 'Region ID (blank=global)', type: 'number' },
      { name: 'map_id', label: 'Map ID (blank=all maps)', type: 'number' },
      { name: 'trigger_json', label: 'Trigger Config (JSON)', type: 'json', placeholder: '{"chance_per_hour":5,"time_of_day":"night"}' },
      { name: 'effects_json', label: 'Effects (JSON)', type: 'json', placeholder: '{"notification":"A blood moon rises...","spawn_npc_ids":[5,12]}' },
      { name: 'duration_minutes', label: 'Duration (min)', type: 'number', default: 60 },
      { name: 'phase_count', label: 'Phase Count', type: 'number', default: 1 },
      { name: 'phases_json', label: 'Phases (JSON)', type: 'json', placeholder: '[{"name":"Gathering Storm","duration_pct":0.3,"effects":{}},{"name":"Full Fury","duration_pct":0.7,"effects":{}}]' },
      { name: 'rewards_json', label: 'Completion Rewards (JSON)', type: 'json', placeholder: '{"xp":500,"gold":200,"items":[{"item_id":10,"qty":1}]}' },
      { name: 'min_level', label: 'Min Level', type: 'number', default: 1 },
      { name: 'max_participants', label: 'Max Participants (0=unlimited)', type: 'number', default: 0 },
      { name: 'announce_text', label: 'Announcement Text', type: 'text', placeholder: 'A great darkness stirs in the east...' },
      { name: 'lore_text', label: 'Lore Text', type: 'textarea' },
      { name: 'stat_modifiers', label: 'Stat Modifiers (JSON)', type: 'json', placeholder: '{"xp_mult":2.0,"enemy_atk_mult":1.5}' },
      { name: 'is_active', label: 'Currently Active', type: 'checkbox' },
      { name: 'recur_interval_hours', label: 'Recurrence Interval (hours)', type: 'number' }
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

  // ═══════════════════════════════════════════════════════════════
  // BATCH: Combat & Battle Systems
  // ═══════════════════════════════════════════════════════════════

  battle_rules: {
    type: 'battle_rule',
    title: 'Battle Rules',
    icon: 'Gavel',
    listColumns: ['name', 'scope', 'trigger_event', 'enabled'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'priority', label: 'Priority', type: 'number', default: 0 },
      { name: 'enabled', label: 'Enabled', type: 'checkbox' },
      { name: 'scope', label: 'Scope', type: 'select', options: [
        { value: 'global', label: 'Global' },
        { value: 'map', label: 'Map' },
        { value: 'arena', label: 'Arena' },
        { value: 'encounter', label: 'Encounter' },
        { value: 'quest', label: 'Quest' }
      ]},
      { name: 'scope_id', label: 'Scope ID (map/arena/etc)', type: 'number' },
      { name: 'trigger_event', label: 'Trigger Event', type: 'select', options: [
        { value: 'turn_start', label: 'Turn Start' },
        { value: 'turn_end', label: 'Turn End' },
        { value: 'battle_start', label: 'Battle Start' },
        { value: 'battle_end', label: 'Battle End' },
        { value: 'on_damage_dealt', label: 'On Damage Dealt' },
        { value: 'on_damage_taken', label: 'On Damage Taken' },
        { value: 'on_kill', label: 'On Kill' },
        { value: 'on_ko', label: 'On KO' },
        { value: 'on_heal', label: 'On Heal' },
        { value: 'on_status_applied', label: 'On Status Applied' },
        { value: 'on_status_removed', label: 'On Status Removed' },
        { value: 'on_phase_change', label: 'On Phase Change' },
        { value: 'on_move', label: 'On Move' },
        { value: 'on_flee_attempt', label: 'On Flee Attempt' },
        { value: 'hp_threshold', label: 'HP Threshold' },
        { value: 'mp_threshold', label: 'MP Threshold' },
        { value: 'turn_number', label: 'Turn Number' },
        { value: 'combatant_count', label: 'Combatant Count' }
      ]},
      { name: 'target_filter', label: 'Target Filter', type: 'select', options: [
        { value: 'all', label: 'All' },
        { value: 'all_players', label: 'All Players' },
        { value: 'all_enemies', label: 'All Enemies' },
        { value: 'active_combatant', label: 'Active Combatant' },
        { value: 'target_combatant', label: 'Target Combatant' },
        { value: 'lowest_hp', label: 'Lowest HP' },
        { value: 'highest_hp', label: 'Highest HP' },
        { value: 'random_enemy', label: 'Random Enemy' },
        { value: 'random_ally', label: 'Random Ally' },
        { value: 'boss', label: 'Boss' },
        { value: 'summoned', label: 'Summoned' },
        { value: 'transformed', label: 'Transformed' },
        { value: 'stealthed', label: 'Stealthed' }
      ]},
      { name: 'condition_json', label: 'Condition (JSON)', type: 'json', placeholder: '{"hp_below": 0.25}' },
      { name: 'effect_json', label: 'Effect (JSON)', type: 'json', placeholder: '{"apply_status": "enraged"}' },
      { name: 'max_triggers', label: 'Max Triggers (0=unlimited)', type: 'number', default: 0 },
      { name: 'cooldown_turns', label: 'Cooldown Turns', type: 'number', default: 0 }
    ]
  },
  boss_phases: {
    type: 'boss_phase',
    title: 'Boss Phases',
    icon: 'Crown',
    listColumns: ['npc_id', 'phase_number', 'trigger_type', 'name'],
    fields: [
      { name: 'npc_id', label: 'NPC ID', type: 'number', required: true },
      { name: 'phase_number', label: 'Phase #', type: 'number', default: 1 },
      { name: 'trigger_type', label: 'Trigger', type: 'select', options: [
        { value: 'hp_pct', label: 'HP Percentage' },
        { value: 'turn', label: 'Turn Number' },
        { value: 'manual', label: 'Manual' }
      ]},
      { name: 'trigger_value', label: 'Trigger Value', type: 'number', default: 0.5 },
      { name: 'name', label: 'Phase Name', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'battle_text', label: 'Battle Text', type: 'textarea' },
      { name: 'stat_changes', label: 'Stat Changes (JSON)', type: 'json', placeholder: '{"atk": 1.5, "speed": 2.0}' },
      { name: 'new_skill_ids', label: 'New Skill IDs (JSON)', type: 'json', placeholder: '[5, 12]' },
      { name: 'remove_skill_ids', label: 'Remove Skill IDs (JSON)', type: 'json', placeholder: '[1]' },
      { name: 'heal_pct', label: 'Heal % on Phase Start', type: 'number', default: 0 },
      { name: 'summon_npc_ids', label: 'Summon NPC IDs (JSON)', type: 'json', placeholder: '[3, 7]' },
      { name: 'element_shift', label: 'Element Shift', type: 'text' },
      { name: 'terrain_change', label: 'Terrain Change (JSON)', type: 'json' }
    ]
  },
  win_conditions: {
    type: 'win_condition',
    title: 'Win Conditions',
    icon: 'Trophy',
    listColumns: ['name', 'condition_type'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'condition_type', label: 'Type', type: 'select', options: [
        { value: 'kill_all', label: 'Kill All' },
        { value: 'survive_turns', label: 'Survive Turns' },
        { value: 'protect_npc', label: 'Protect NPC' },
        { value: 'kill_target', label: 'Kill Target' },
        { value: 'dps_check', label: 'DPS Check' },
        { value: 'capture_point', label: 'Capture Point' },
        { value: 'escape', label: 'Escape' },
        { value: 'no_deaths', label: 'No Deaths' },
        { value: 'pacifist', label: 'Pacifist' },
        { value: 'steal_item', label: 'Steal Item' },
        { value: 'phase_clear', label: 'Phase Clear' },
        { value: 'turn_limit', label: 'Turn Limit' },
        { value: 'custom', label: 'Custom' }
      ]},
      { name: 'params', label: 'Params (JSON)', type: 'json', required: true, placeholder: '{"turns": 10}' },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'success_text', label: 'Success Text', type: 'text' },
      { name: 'fail_text', label: 'Fail Text', type: 'text' },
      { name: 'icon', label: 'Icon', type: 'icon' }
    ]
  },
  quest_battle_overrides: {
    type: 'quest_battle_override',
    title: 'Quest Battle Overrides',
    icon: 'FileWarning',
    listColumns: ['quest_id', 'map_id', 'npc_id', 'active'],
    fields: [
      { name: 'quest_id', label: 'Quest ID', type: 'text', required: true },
      { name: 'map_id', label: 'Map ID', type: 'number' },
      { name: 'npc_id', label: 'NPC ID', type: 'number' },
      { name: 'win_condition_id', label: 'Win Condition ID', type: 'number', required: true },
      { name: 'inject_protect_char_id', label: 'Protected Char ID', type: 'number' },
      { name: 'active', label: 'Active', type: 'checkbox' }
    ]
  },
  traps: {
    type: 'trap',
    title: 'Battle Traps',
    icon: 'Flame',
    listColumns: ['name', 'trigger_type', 'active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'damage_formula', label: 'Damage Formula', type: 'text', default: 'ATK*1.5' },
      { name: 'trigger_type', label: 'Trigger', type: 'select', options: [
        { value: 'step', label: 'Step' },
        { value: 'proximity', label: 'Proximity' },
        { value: 'timed', label: 'Timed' }
      ]},
      { name: 'trigger_radius', label: 'Trigger Radius', type: 'number', default: 0 },
      { name: 'duration_turns', label: 'Duration (turns)', type: 'number', default: 0 },
      { name: 'status_apply', label: 'Apply Status', type: 'text' },
      { name: 'visible_to_enemy', label: 'Visible to Enemy', type: 'checkbox' },
      { name: 'uses', label: 'Uses', type: 'number', default: 1 },
      { name: 'skill_id', label: 'Skill ID', type: 'number' },
      { name: 'active', label: 'Active', type: 'checkbox' }
    ]
  },
  elem_reactions: {
    type: 'elem_reaction',
    title: 'Elemental Reactions',
    icon: 'Zap',
    listColumns: ['reaction_name', 'element_a', 'element_b', 'damage_bonus'],
    fields: [
      { name: 'element_a', label: 'Element A', type: 'text', required: true },
      { name: 'element_b', label: 'Element B', type: 'text', required: true },
      { name: 'reaction_name', label: 'Reaction Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'damage_bonus', label: 'Damage Bonus', type: 'number', default: 0.30 },
      { name: 'aoe_radius', label: 'AoE Radius', type: 'number', default: 0 },
      { name: 'apply_status', label: 'Apply Status', type: 'text' },
      { name: 'remove_elements', label: 'Remove Elements After', type: 'checkbox' },
      { name: 'battle_text', label: 'Battle Text', type: 'text' },
      { name: 'active', label: 'Active', type: 'checkbox' }
    ]
  },
  status_combos: {
    type: 'status_combo',
    title: 'Status Combos',
    icon: 'Layers',
    listColumns: ['combo_name', 'status_a', 'status_b', 'effect_type'],
    fields: [
      { name: 'status_a', label: 'Status A', type: 'text', required: true },
      { name: 'status_b', label: 'Status B', type: 'text', required: true },
      { name: 'combo_name', label: 'Combo Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'effect_type', label: 'Effect Type', type: 'select', options: [
        { value: 'bonus_damage', label: 'Bonus Damage' },
        { value: 'guaranteed_crit', label: 'Guaranteed Crit' },
        { value: 'remove_both', label: 'Remove Both' },
        { value: 'apply_new', label: 'Apply New Status' },
        { value: 'heal_block', label: 'Heal Block' }
      ]},
      { name: 'effect_value', label: 'Effect Value', type: 'number', default: 0.50 },
      { name: 'apply_status', label: 'Apply Status (if apply_new)', type: 'text' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'active', label: 'Active', type: 'checkbox' }
    ]
  },
  link_attacks: {
    type: 'link_attack',
    title: 'Link Attacks',
    icon: 'Link',
    listColumns: ['name', 'element', 'min_affinity'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'initiator_class_id', label: 'Initiator Class ID', type: 'number' },
      { name: 'partner_class_id', label: 'Partner Class ID', type: 'number' },
      { name: 'initiator_skill_id', label: 'Initiator Skill ID', type: 'number' },
      { name: 'damage_formula', label: 'Damage Formula', type: 'text', default: 'ATK*2+PARTNER_ATK*2' },
      { name: 'element', label: 'Element', type: 'text' },
      { name: 'effects', label: 'Effects (JSON)', type: 'json' },
      { name: 'battle_text', label: 'Battle Text', type: 'textarea' },
      { name: 'min_affinity', label: 'Min Affinity', type: 'number', default: 0 },
      { name: 'cooldown_turns', label: 'Cooldown Turns', type: 'number', default: 3 },
      { name: 'active', label: 'Active', type: 'checkbox' }
    ]
  },
  transformations: {
    type: 'transformation',
    title: 'Transformations',
    icon: 'Sparkle',
    listColumns: ['name', 'trigger_type', 'duration', 'active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'class_id', label: 'Class ID', type: 'number' },
      { name: 'race_id', label: 'Race ID', type: 'number' },
      { name: 'trigger_type', label: 'Trigger', type: 'select', options: [
        { value: 'manual', label: 'Manual' },
        { value: 'hp_threshold', label: 'HP Threshold' },
        { value: 'limit_full', label: 'Limit Full' },
        { value: 'turn_count', label: 'Turn Count' }
      ]},
      { name: 'trigger_value', label: 'Trigger Value', type: 'number' },
      { name: 'duration', label: 'Duration (turns)', type: 'number', default: 5 },
      { name: 'stat_multipliers', label: 'Stat Multipliers (JSON)', type: 'json', required: true, placeholder: '{"atk": 1.5, "def": 1.2}' },
      { name: 'grant_skill_ids', label: 'Grant Skill IDs (JSON)', type: 'json' },
      { name: 'remove_skill_ids', label: 'Remove Skill IDs (JSON)', type: 'json' },
      { name: 'visual_effects', label: 'Visual Effects (JSON)', type: 'json' },
      { name: 'battle_text', label: 'Battle Text', type: 'textarea' },
      { name: 'mp_cost', label: 'MP Cost', type: 'number', default: 0 },
      { name: 'hp_cost_pct', label: 'HP Cost %', type: 'number', default: 0 },
      { name: 'cooldown_battles', label: 'Cooldown Battles', type: 'number', default: 0 },
      { name: 'level_required', label: 'Level Required', type: 'number', default: 1 },
      { name: 'active', label: 'Active', type: 'checkbox' }
    ]
  },
  limits: {
    type: 'limit',
    title: 'Limit Breaks',
    icon: 'Flame',
    listColumns: ['name', 'class_id', 'break_level', 'target_type'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'class_id', label: 'Class ID', type: 'number', required: true },
      { name: 'break_level', label: 'Break Level', type: 'number', default: 1 },
      { name: 'char_level_req', label: 'Character Level Req', type: 'number', default: 1 },
      { name: 'target_type', label: 'Target', type: 'select', options: [
        { value: 'ENEMY', label: 'Enemy' },
        { value: 'SELF', label: 'Self' },
        { value: 'ALLY', label: 'Ally' },
        { value: 'ALL', label: 'All' }
      ]},
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'effects', label: 'Effects (JSON)', type: 'json', placeholder: '{"damage": {"formula": "atk * 3"}}' }
    ]
  },
  formation_shapes: {
    type: 'formation_shapes',
    title: 'Formation Shapes',
    icon: 'Grid3x3',
    listColumns: ['name', 'shape_type', 'min_members', 'active'],
    fields: [
      { name: 'name', label: 'Key Name', type: 'text', required: true },
      { name: 'label', label: 'Display Label', type: 'text' },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'shape_type', label: 'Shape', type: 'select', options: [
        { value: 'v_shape', label: 'V-Shape' },
        { value: 'line', label: 'Line' },
        { value: 'diamond', label: 'Diamond' },
        { value: 'wedge', label: 'Wedge' },
        { value: 'wall', label: 'Wall' }
      ]},
      { name: 'min_members', label: 'Min Members', type: 'number', default: 2 },
      { name: 'bonuses_json', label: 'Bonuses (JSON)', type: 'json' },
      { name: 'active', label: 'Active', type: 'checkbox' }
    ]
  },
  weather: {
    type: 'weather',
    title: 'Weather Effects',
    icon: 'CloudRain',
    listColumns: ['label', 'name', 'visibility', 'active'],
    fields: [
      { name: 'name', label: 'Key Name', type: 'text', required: true },
      { name: 'label', label: 'Display Label', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'combat_effects', label: 'Combat Effects (JSON)', type: 'json', required: true, placeholder: '{"fire_damage_mult": 0.5}' },
      { name: 'terrain_override', label: 'Terrain Override', type: 'text' },
      { name: 'visibility', label: 'Visibility (0-1)', type: 'number', default: 1.0 },
      { name: 'active', label: 'Active', type: 'checkbox' }
    ]
  },
  death_penalties: {
    type: 'death_penalty',
    title: 'Death Penalties',
    icon: 'Skull',
    listColumns: ['death_count', 'base_stat_loss_pct'],
    fields: [
      { name: 'death_count', label: 'Death Count', type: 'number', required: true },
      { name: 'base_stat_loss_pct', label: 'Stat Loss %', type: 'number', default: 0.05 },
      { name: 'description', label: 'Description', type: 'text' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // BATCH: Fighting Styles & Alignment
  // ═══════════════════════════════════════════════════════════════

  fighting_styles: {
    type: 'fighting_style',
    title: 'Fighting Styles',
    icon: 'Swords',
    listColumns: ['label', 'name', 'style_type', 'max_rank'],
    fields: [
      { name: 'name', label: 'Key Name', type: 'text', required: true },
      { name: 'label', label: 'Display Label', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'lore_text', label: 'Lore Text', type: 'textarea' },
      { name: 'style_type', label: 'Style Type', type: 'select', options: [
        { value: 'offensive', label: 'Offensive' },
        { value: 'defensive', label: 'Defensive' },
        { value: 'balanced', label: 'Balanced' },
        { value: 'support', label: 'Support' },
        { value: 'glass_cannon', label: 'Glass Cannon' }
      ]},
      { name: 'max_rank', label: 'Max Rank', type: 'number', default: 10 },
      { name: 'passive_effects', label: 'Passive Effects (JSON)', type: 'json' }
    ]
  },
  style_ranks: {
    type: 'style_rank',
    title: 'Fighting Style Ranks',
    icon: 'TrendingUp',
    listColumns: ['style_id', 'rank_num', 'label', 'wins_required'],
    fields: [
      { name: 'style_id', label: 'Style ID', type: 'number', required: true },
      { name: 'rank_num', label: 'Rank #', type: 'number', required: true },
      { name: 'label', label: 'Label', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'wins_required', label: 'Wins Required', type: 'number', default: 5 },
      { name: 'stat_bonuses', label: 'Stat Bonuses (JSON)', type: 'json' },
      { name: 'unlocked_move_ids', label: 'Unlocked Move IDs (JSON)', type: 'json' },
      { name: 'passive_effects', label: 'Passive Effects (JSON)', type: 'json' },
      { name: 'description', label: 'Description', type: 'text' }
    ]
  },
  char_styles: {
    type: 'char_style',
    title: 'Character Fighting Styles',
    icon: 'UserCheck',
    listColumns: ['character_id', 'style_id', 'current_rank', 'is_active'],
    fields: [
      { name: 'character_id', label: 'Character ID', type: 'number', required: true },
      { name: 'style_id', label: 'Style ID', type: 'number', required: true },
      { name: 'current_rank', label: 'Current Rank', type: 'number', default: 1 },
      { name: 'wins_at_rank', label: 'Wins at Rank', type: 'number', default: 0 },
      { name: 'total_wins', label: 'Total Wins', type: 'number', default: 0 },
      { name: 'is_active', label: 'Active', type: 'checkbox' },
      { name: 'learned_from_npc_id', label: 'Learned From NPC ID', type: 'number' }
    ]
  },
  alignment_tiers: {
    type: 'alignment_tier',
    title: 'Alignment Tiers',
    icon: 'Scale',
    listColumns: ['label', 'name', 'min_value', 'max_value'],
    fields: [
      { name: 'name', label: 'Key Name', type: 'text', required: true },
      { name: 'label', label: 'Display Label', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'min_value', label: 'Min Value', type: 'number', required: true },
      { name: 'max_value', label: 'Max Value', type: 'number', required: true },
      { name: 'stat_bonuses', label: 'Stat Bonuses (JSON)', type: 'json' },
      { name: 'skill_access', label: 'Skill Access (JSON)', type: 'json' },
      { name: 'shop_price_mult', label: 'Shop Price Multiplier', type: 'number', default: 1.0 },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'color', label: 'Color', type: 'text' }
    ]
  },
  alignment_actions: {
    type: 'alignment_action',
    title: 'Alignment Actions',
    icon: 'ArrowUpDown',
    listColumns: ['label', 'action_key', 'shift_amount', 'active'],
    fields: [
      { name: 'action_key', label: 'Action Key', type: 'text', required: true },
      { name: 'label', label: 'Display Label', type: 'text', required: true },
      { name: 'shift_amount', label: 'Shift Amount', type: 'number', required: true },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'active', label: 'Active', type: 'checkbox' }
    ]
  },
  afterlives: {
    type: 'afterlife',
    title: 'Afterlife Worlds',
    icon: 'Ghost',
    listColumns: ['label', 'name', 'type', 'active'],
    fields: [
      { name: 'name', label: 'Key Name', type: 'text', required: true },
      { name: 'label', label: 'Display Label', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'map_id', label: 'Map ID', type: 'number' },
      { name: 'type', label: 'Type', type: 'select', options: [
        { value: 'upper', label: 'Upper (Heaven)' },
        { value: 'lower', label: 'Lower (Hell)' },
        { value: 'neutral', label: 'Neutral' }
      ]},
      { name: 'alignment_min', label: 'Alignment Min', type: 'number' },
      { name: 'alignment_max', label: 'Alignment Max', type: 'number' },
      { name: 'stay_duration_days', label: 'Stay Duration (days)', type: 'number', default: 7 },
      { name: 'training_bonus', label: 'Training Bonus', type: 'number', default: 0.01 },
      { name: 'has_masters', label: 'Has Masters', type: 'checkbox' },
      { name: 'max_visits', label: 'Max Visits (0=unlimited)', type: 'number', default: 0 },
      { name: 'active', label: 'Active', type: 'checkbox' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // BATCH: World & Regions
  // ═══════════════════════════════════════════════════════════════

  worlds: {
    type: 'world',
    title: 'Worlds',
    icon: 'Globe',
    listColumns: ['name', 'render_mode', 'sort_order', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'render_mode', label: 'Render Mode', type: 'select', options: [
        { value: '', label: 'Use Player Preference' },
        { value: 'classic', label: 'Classic (flat top-down)' },
        { value: '2.5d', label: '2.5D (extruded elevation)' }
      ]},
      { name: 'sort_order', label: 'Sort Order', type: 'number', default: 0 },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  regions: {
    type: 'region',
    title: 'Regions',
    icon: 'MapPin',
    listColumns: ['name', 'danger_level', 'pvp_enabled', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'danger_level', label: 'Danger Level', type: 'number', default: 0 },
      { name: 'corruption_level', label: 'Corruption Level', type: 'number', default: 0 },
      { name: 'faction_control', label: 'Faction Control', type: 'text' },
      { name: 'weather_override', label: 'Weather Override', type: 'text' },
      { name: 'xp_mult', label: 'XP Multiplier', type: 'number', default: 1.0 },
      { name: 'gold_mult', label: 'Gold Multiplier', type: 'number', default: 1.0 },
      { name: 'loot_mult', label: 'Loot Multiplier', type: 'number', default: 1.0 },
      { name: 'spawn_rate_mult', label: 'Spawn Rate Mult', type: 'number', default: 1.0 },
      { name: 'shop_price_mult', label: 'Shop Price Mult', type: 'number', default: 1.0 },
      { name: 'pvp_enabled', label: 'PvP Enabled', type: 'checkbox' },
      { name: 'is_sanctuary', label: 'Sanctuary', type: 'checkbox' },
      { name: 'movement_penalty', label: 'Movement Penalty', type: 'number', default: 0 },
      { name: 'active_tags_json', label: 'Active Tags (JSON)', type: 'json' },
      { name: 'auto_rules_json', label: 'Auto Rules (JSON)', type: 'json' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  factions: {
    type: 'faction',
    title: 'Factions',
    icon: 'Flag',
    listColumns: ['icon', 'name', 'rival_id'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'rival_id', label: 'Rival Faction ID', type: 'number' }
    ]
  },
  season_effects: {
    type: 'season_effect',
    title: 'Season Effects',
    icon: 'Sun',
    listColumns: ['season', 'world_id', 'is_active'],
    fields: [
      { name: 'season', label: 'Season', type: 'select', required: true, options: [
        { value: 'spring', label: 'Spring' },
        { value: 'summer', label: 'Summer' },
        { value: 'fall', label: 'Fall' },
        { value: 'winter', label: 'Winter' }
      ]},
      { name: 'world_id', label: 'World ID', type: 'number' },
      { name: 'weather_weight', label: 'Weather Weights (JSON)', type: 'json' },
      { name: 'gathering_mult', label: 'Gathering Mult', type: 'number', default: 1.0 },
      { name: 'spawn_rate_mult', label: 'Spawn Rate Mult', type: 'number', default: 1.0 },
      { name: 'shop_price_mult', label: 'Shop Price Mult', type: 'number', default: 1.0 },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  spawns: {
    type: 'spawn',
    title: 'Map Spawns',
    icon: 'MapPinned',
    listColumns: ['map_id', 'npc_char_id', 'x', 'y', 'enabled'],
    fields: [
      { name: 'map_id', label: 'Map ID', type: 'number', required: true },
      { name: 'npc_char_id', label: 'NPC Char ID', type: 'number', required: true },
      { name: 'x', label: 'X', type: 'number', default: 5 },
      { name: 'y', label: 'Y', type: 'number', default: 5 },
      { name: 'respawn_seconds', label: 'Respawn (seconds)', type: 'number', default: 30 },
      { name: 'enabled', label: 'Enabled', type: 'checkbox' }
    ]
  },
  sound_zones: {
    type: 'sound_zone',
    title: 'Sound Zones',
    icon: 'Volume2',
    listColumns: ['name', 'map_id', 'is_active'],
    fields: [
      { name: 'map_id', label: 'Map ID', type: 'number', required: true },
      { name: 'name', label: 'Name', type: 'text', default: 'Ambient Zone' },
      { name: 'sound_asset_id', label: 'Sound Asset ID', type: 'number' },
      { name: 'sound_url', label: 'Sound URL', type: 'text' },
      { name: 'x_min', label: 'X Min', type: 'number', default: 0 },
      { name: 'y_min', label: 'Y Min', type: 'number', default: 0 },
      { name: 'x_max', label: 'X Max', type: 'number', default: 10 },
      { name: 'y_max', label: 'Y Max', type: 'number', default: 10 },
      { name: 'volume', label: 'Volume (0-1)', type: 'number', default: 0.50 },
      { name: 'loop_sound', label: 'Loop', type: 'checkbox' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  tile_animations: {
    type: 'tile_animation',
    title: 'Tile Animations',
    icon: 'Film',
    listColumns: ['name', 'fps', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'tileset_url', label: 'Tileset URL', type: 'text' },
      { name: 'frame_tiles', label: 'Frame Tiles (JSON)', type: 'json', required: true },
      { name: 'fps', label: 'FPS', type: 'number', default: 4 },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  terrain_interactions: {
    type: 'terrain_interaction',
    title: 'Terrain Interactions',
    icon: 'Mountain',
    listColumns: ['terrain_a', 'element_or_terrain_b', 'result_terrain'],
    fields: [
      { name: 'terrain_a', label: 'Terrain A', type: 'text', required: true },
      { name: 'element_or_terrain_b', label: 'Element/Terrain B', type: 'text', required: true },
      { name: 'result_terrain', label: 'Result Terrain', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'damage', label: 'Damage', type: 'number', default: 0 },
      { name: 'status_apply', label: 'Apply Status', type: 'text' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  cutscenes: {
    type: 'cutscene',
    title: 'Cutscenes',
    icon: 'Clapperboard',
    listColumns: ['name', 'trigger_type', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'trigger_type', label: 'Trigger Type', type: 'select', options: [
        { value: 'quest', label: 'Quest' },
        { value: 'event', label: 'Event' },
        { value: 'map_enter', label: 'Map Enter' },
        { value: 'interact', label: 'Interact' },
        { value: 'manual', label: 'Manual' }
      ]},
      { name: 'trigger_value', label: 'Trigger Value', type: 'text' },
      { name: 'sequence_json', label: 'Sequence (JSON)', type: 'json', required: true },
      { name: 'is_skippable', label: 'Skippable', type: 'checkbox' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // BATCH: NPCs & Relationships
  // ═══════════════════════════════════════════════════════════════

  npc_relationships: {
    type: 'npc_relationship',
    title: 'NPC Relationships',
    icon: 'Heart',
    listColumns: ['npc_id_a', 'npc_id_b', 'relationship', 'strength'],
    fields: [
      { name: 'npc_id_a', label: 'NPC A ID', type: 'number', required: true },
      { name: 'npc_id_b', label: 'NPC B ID', type: 'number', required: true },
      { name: 'relationship', label: 'Relationship', type: 'select', options: [
        { value: 'family', label: 'Family' },
        { value: 'friend', label: 'Friend' },
        { value: 'rival', label: 'Rival' },
        { value: 'enemy', label: 'Enemy' },
        { value: 'lover', label: 'Lover' },
        { value: 'mentor', label: 'Mentor' },
        { value: 'student', label: 'Student' },
        { value: 'ally', label: 'Ally' },
        { value: 'neutral', label: 'Neutral' }
      ]},
      { name: 'strength', label: 'Strength (0-100)', type: 'number', default: 50 },
      { name: 'description', label: 'Description', type: 'text' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // BATCH: Economy & Crafting
  // ═══════════════════════════════════════════════════════════════

  shop_supplies: {
    type: 'shop_supply',
    title: 'Shop Supplies',
    icon: 'ShoppingCart',
    listColumns: ['shop_id', 'item_id', 'buy_price', 'sell_price', 'stock'],
    fields: [
      { name: 'shop_id', label: 'Shop ID', type: 'number', required: true },
      { name: 'item_id', label: 'Item ID', type: 'number', required: true },
      { name: 'buy_price', label: 'Buy Price', type: 'number', default: 100 },
      { name: 'sell_price', label: 'Sell Price', type: 'number', default: 50 },
      { name: 'stock', label: 'Stock (-1=unlimited)', type: 'number', default: -1 }
    ]
  },
  craft_recipes: {
    type: 'craft_recipe',
    title: 'Craft Recipes',
    icon: 'Hammer',
    listColumns: ['name', 'category', 'result_item_id', 'level_req', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'category', label: 'Category', type: 'text' },
      { name: 'result_item_id', label: 'Result Item ID', type: 'number', required: true },
      { name: 'result_qty', label: 'Result Qty', type: 'number', default: 1 },
      { name: 'level_req', label: 'Level Required', type: 'number', default: 1 },
      { name: 'skill_req', label: 'Skill Required', type: 'text' },
      { name: 'ingredients_json', label: 'Ingredients (JSON)', type: 'json', required: true, placeholder: '[{"item_id": 1, "qty": 3}]' },
      { name: 'unlock_mode', label: 'Unlock Mode', type: 'text' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  auction_listings: {
    type: 'auction_listing',
    title: 'Auction Listings',
    icon: 'Gavel',
    listColumns: ['seller_name', 'item_id', 'buyout_price', 'status'],
    fields: [
      { name: 'seller_char_id', label: 'Seller Char ID', type: 'number', required: true },
      { name: 'seller_name', label: 'Seller Name', type: 'text', required: true },
      { name: 'item_id', label: 'Item ID', type: 'number', required: true },
      { name: 'quantity', label: 'Quantity', type: 'number', default: 1 },
      { name: 'buyout_price', label: 'Buyout Price', type: 'number' },
      { name: 'current_bid', label: 'Current Bid', type: 'number', default: 0 },
      { name: 'min_bid', label: 'Min Bid', type: 'number', default: 0 },
      { name: 'bidder_char_id', label: 'Bidder Char ID', type: 'number' },
      { name: 'bidder_name', label: 'Bidder Name', type: 'text' },
      { name: 'expires_at', label: 'Expires At', type: 'text' },
      { name: 'status', label: 'Status', type: 'select', options: [
        { value: 'active', label: 'Active' },
        { value: 'sold', label: 'Sold' },
        { value: 'expired', label: 'Expired' },
        { value: 'cancelled', label: 'Cancelled' }
      ]}
    ]
  },
  economy_states: {
    type: 'economy_state',
    title: 'Economy State',
    icon: 'TrendingUp',
    listColumns: ['item_id', 'region_id', 'supply', 'demand', 'price_modifier'],
    fields: [
      { name: 'item_id', label: 'Item ID', type: 'number', required: true },
      { name: 'region_id', label: 'Region ID', type: 'number' },
      { name: 'supply', label: 'Supply', type: 'number', default: 100 },
      { name: 'demand', label: 'Demand', type: 'number', default: 50 },
      { name: 'price_modifier', label: 'Price Modifier', type: 'number', default: 1.0 }
    ]
  },
  economy_txs: {
    type: 'economy_tx',
    title: 'Economy Transactions',
    icon: 'Receipt',
    listColumns: ['item_id', 'transaction_type', 'quantity', 'price'],
    fields: [
      { name: 'item_id', label: 'Item ID', type: 'number', required: true },
      { name: 'shop_id', label: 'Shop ID', type: 'number' },
      { name: 'region_id', label: 'Region ID', type: 'number' },
      { name: 'transaction_type', label: 'Type', type: 'select', options: [
        { value: 'buy', label: 'Buy' },
        { value: 'sell', label: 'Sell' }
      ]},
      { name: 'quantity', label: 'Quantity', type: 'number', default: 1 },
      { name: 'price', label: 'Price', type: 'number', default: 0 },
      { name: 'character_id', label: 'Character ID', type: 'number' }
    ]
  },
  inns: {
    type: 'inn',
    title: 'Inns',
    icon: 'Bed',
    listColumns: ['name', 'map_id', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'map_id', label: 'Map ID', type: 'number' },
      { name: 'x', label: 'X', type: 'number' },
      { name: 'y', label: 'Y', type: 'number' },
      { name: 'price_per_rest', label: 'Price Per Rest', type: 'number', default: 50 },
      { name: 'hp_restore_pct', label: 'HP Restore %', type: 'number', default: 1.0 },
      { name: 'mp_restore_pct', label: 'MP Restore %', type: 'number', default: 1.0 },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // BATCH: Jobs & Class Mastery
  // ═══════════════════════════════════════════════════════════════

  jobs: {
    type: 'job',
    title: 'Jobs',
    icon: 'Briefcase',
    listColumns: ['name', 'max_level', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'stat_bonuses_json', label: 'Stat Bonuses (JSON)', type: 'json' },
      { name: 'skills_json', label: 'Skills (JSON)', type: 'json' },
      { name: 'prerequisite_jobs', label: 'Prerequisite Jobs (JSON)', type: 'json' },
      { name: 'max_level', label: 'Max Level', type: 'number', default: 20 },
      { name: 'jp_per_action', label: 'JP Per Action', type: 'number', default: 10 },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  job_skills: {
    type: 'job_skill',
    title: 'Job Skills',
    icon: 'Wrench',
    listColumns: ['job_id', 'skill_id', 'unlock_level', 'is_passive'],
    fields: [
      { name: 'job_id', label: 'Job ID', type: 'number', required: true },
      { name: 'skill_id', label: 'Skill ID', type: 'number', required: true },
      { name: 'unlock_level', label: 'Unlock Level', type: 'number', default: 1 },
      { name: 'is_passive', label: 'Passive', type: 'checkbox' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // BATCH: Minigames (Cards, Fishing, Puzzles, Dice)
  // ═══════════════════════════════════════════════════════════════

  cards: {
    type: 'card',
    title: 'Cards',
    icon: 'Square',
    listColumns: ['name', 'rarity', 'element', 'source_type', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'rarity', label: 'Rarity', type: 'select', options: [
        { value: 'common', label: 'Common' },
        { value: 'uncommon', label: 'Uncommon' },
        { value: 'rare', label: 'Rare' },
        { value: 'epic', label: 'Epic' },
        { value: 'legendary', label: 'Legendary' }
      ]},
      { name: 'value_top', label: 'Value Top', type: 'number', default: 1 },
      { name: 'value_right', label: 'Value Right', type: 'number', default: 1 },
      { name: 'value_bottom', label: 'Value Bottom', type: 'number', default: 1 },
      { name: 'value_left', label: 'Value Left', type: 'number', default: 1 },
      { name: 'element', label: 'Element', type: 'text' },
      { name: 'source_npc_id', label: 'Source NPC ID', type: 'number' },
      { name: 'source_type', label: 'Source Type', type: 'select', options: [
        { value: 'npc', label: 'NPC' },
        { value: 'enemy', label: 'Enemy' },
        { value: 'boss', label: 'Boss' },
        { value: 'player', label: 'Player' },
        { value: 'special', label: 'Special' }
      ]},
      { name: 'art_url', label: 'Art URL', type: 'text' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  card_rules: {
    type: 'card_rule',
    title: 'Card Rules',
    icon: 'BookOpen',
    listColumns: ['name', 'rule_type', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'rule_type', label: 'Rule Type', type: 'text', required: true },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  fishing_spots: {
    type: 'fishing_spot',
    title: 'Fishing Spots',
    icon: 'Fish',
    listColumns: ['name', 'map_id', 'min_level', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'map_id', label: 'Map ID', type: 'number' },
      { name: 'x', label: 'X', type: 'number' },
      { name: 'y', label: 'Y', type: 'number' },
      { name: 'min_level', label: 'Min Level', type: 'number', default: 1 },
      { name: 'catch_table', label: 'Catch Table (JSON)', type: 'json', placeholder: '[{"item_id": 1, "chance": 50}]' },
      { name: 'bait_required', label: 'Bait Required', type: 'checkbox' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  puzzles: {
    type: 'puzzle',
    title: 'Puzzles',
    icon: 'Puzzle',
    listColumns: ['name', 'puzzle_type', 'difficulty', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'puzzle_type', label: 'Puzzle Type', type: 'text' },
      { name: 'difficulty', label: 'Difficulty', type: 'number', default: 1 },
      { name: 'config_json', label: 'Config (JSON)', type: 'json' },
      { name: 'rewards_json', label: 'Rewards (JSON)', type: 'json' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  dice_tables: {
    type: 'dice_table',
    title: 'Dice Tables',
    icon: 'Dices',
    listColumns: ['name', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'dice_config', label: 'Dice Config (JSON)', type: 'json', placeholder: '{"sides": 6, "count": 2}' },
      { name: 'outcomes_json', label: 'Outcomes (JSON)', type: 'json', placeholder: '[{"range": [2,4], "result": "lose"}]' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  minigames: {
    type: 'minigame',
    title: 'Minigames',
    icon: 'Gamepad2',
    listColumns: ['name', 'type', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'type', label: 'Type', type: 'text' },
      { name: 'config_json', label: 'Config (JSON)', type: 'json' },
      { name: 'rewards_json', label: 'Rewards (JSON)', type: 'json' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // BATCH: Creature Capture & Mounts
  // ═══════════════════════════════════════════════════════════════

  capture_items: {
    type: 'capture_item',
    title: 'Capture Items',
    icon: 'CircleDot',
    listColumns: ['name', 'catch_rate_bonus', 'is_active'],
    fields: [
      { name: 'item_id', label: 'Item ID', type: 'number', required: true },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'catch_rate_bonus', label: 'Catch Rate Bonus', type: 'number', default: 1.0 },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  creatures: {
    type: 'creature',
    title: 'Captured Creatures',
    icon: 'Bug',
    listColumns: ['character_id', 'npc_id', 'nickname', 'level', 'is_in_party'],
    fields: [
      { name: 'character_id', label: 'Character ID', type: 'number', required: true },
      { name: 'npc_id', label: 'NPC ID', type: 'number', required: true },
      { name: 'nickname', label: 'Nickname', type: 'text' },
      { name: 'level', label: 'Level', type: 'number', default: 1 },
      { name: 'xp', label: 'XP', type: 'number', default: 0 },
      { name: 'current_hp', label: 'Current HP', type: 'number', default: 50 },
      { name: 'max_hp', label: 'Max HP', type: 'number', default: 50 },
      { name: 'is_in_party', label: 'In Party', type: 'checkbox' },
      { name: 'is_in_storage', label: 'In Storage', type: 'checkbox' }
    ]
  },
  mounts: {
    type: 'mount',
    title: 'Mounts',
    icon: 'Rabbit',
    listColumns: ['name', 'speed_mult', 'obtain_type', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'speed_mult', label: 'Speed Multiplier', type: 'number', default: 1.5 },
      { name: 'sprite_url', label: 'Sprite URL', type: 'text' },
      { name: 'obtain_type', label: 'Obtain Type', type: 'select', options: [
        { value: 'quest', label: 'Quest' },
        { value: 'purchase', label: 'Purchase' },
        { value: 'tame', label: 'Tame' },
        { value: 'craft', label: 'Craft' },
        { value: 'drop', label: 'Drop' }
      ]},
      { name: 'obtain_value', label: 'Obtain Value', type: 'text' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // BATCH: Housing & Gathering
  // ═══════════════════════════════════════════════════════════════

  housing_plots: {
    type: 'housing_plot',
    title: 'Housing Plots',
    icon: 'Home',
    listColumns: ['plot_name', 'map_id', 'price', 'is_available'],
    fields: [
      { name: 'map_id', label: 'Map ID', type: 'number', required: true },
      { name: 'x', label: 'X', type: 'number', required: true },
      { name: 'y', label: 'Y', type: 'number', required: true },
      { name: 'width', label: 'Width', type: 'number', default: 5 },
      { name: 'height', label: 'Height', type: 'number', default: 5 },
      { name: 'price', label: 'Price', type: 'number', default: 5000 },
      { name: 'owner_char_id', label: 'Owner Char ID', type: 'number' },
      { name: 'plot_name', label: 'Plot Name', type: 'text', default: 'Plot' },
      { name: 'is_available', label: 'Available', type: 'checkbox' }
    ]
  },
  furniture: {
    type: 'furniture',
    title: 'Furniture',
    icon: 'Armchair',
    listColumns: ['name', 'type', 'price', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'type', label: 'Type', type: 'select', options: [
        { value: 'decoration', label: 'Decoration' },
        { value: 'storage', label: 'Storage' },
        { value: 'functional', label: 'Functional' },
        { value: 'light', label: 'Light' },
        { value: 'crafting', label: 'Crafting' }
      ]},
      { name: 'width', label: 'Width', type: 'number', default: 1 },
      { name: 'height', label: 'Height', type: 'number', default: 1 },
      { name: 'effects_json', label: 'Effects (JSON)', type: 'json' },
      { name: 'price', label: 'Price', type: 'number', default: 100 },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  gathering_skills: {
    type: 'gathering_skill',
    title: 'Gathering Skills',
    icon: 'Axe',
    listColumns: ['name', 'max_level', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'max_level', label: 'Max Level', type: 'number', default: 99 },
      { name: 'xp_formula', label: 'XP Formula', type: 'text', default: 'BASE * LEVEL' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  gathering_nodes: {
    type: 'gathering_node',
    title: 'Gathering Nodes',
    icon: 'TreePine',
    listColumns: ['name', 'skill_id', 'map_id', 'min_level', 'is_active'],
    fields: [
      { name: 'skill_id', label: 'Gathering Skill ID', type: 'number', required: true },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'map_id', label: 'Map ID', type: 'number' },
      { name: 'x', label: 'X', type: 'number', default: 0 },
      { name: 'y', label: 'Y', type: 'number', default: 0 },
      { name: 'min_level', label: 'Min Level', type: 'number', default: 1 },
      { name: 'xp_reward', label: 'XP Reward', type: 'number', default: 10 },
      { name: 'respawn_seconds', label: 'Respawn (seconds)', type: 'number', default: 300 },
      { name: 'yield_table', label: 'Yield Table (JSON)', type: 'json', placeholder: '[{"item_id": 5, "chance": 80}]' },
      { name: 'tool_item_id', label: 'Required Tool Item ID', type: 'number' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // BATCH: Bounties, Raids, Treasure Trails
  // ═══════════════════════════════════════════════════════════════

  bounty_boards: {
    type: 'bounty_board',
    title: 'Bounty Boards',
    icon: 'ClipboardList',
    listColumns: ['name', 'map_id', 'max_active', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'map_id', label: 'Map ID', type: 'number' },
      { name: 'x', label: 'X', type: 'number', default: 0 },
      { name: 'y', label: 'Y', type: 'number', default: 0 },
      { name: 'max_active', label: 'Max Active', type: 'number', default: 3 },
      { name: 'refresh_hours', label: 'Refresh Hours', type: 'number', default: 24 },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  bounty_tasks: {
    type: 'bounty_task',
    title: 'Bounty Tasks',
    icon: 'Target',
    listColumns: ['name', 'board_id', 'kill_count', 'reward_xp', 'is_active'],
    fields: [
      { name: 'board_id', label: 'Board ID', type: 'number' },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'target_npc_id', label: 'Target NPC ID', type: 'number' },
      { name: 'target_name', label: 'Target Name', type: 'text' },
      { name: 'kill_count', label: 'Kill Count', type: 'number', default: 5 },
      { name: 'reward_xp', label: 'Reward XP', type: 'number', default: 100 },
      { name: 'reward_gold', label: 'Reward Gold', type: 'number', default: 50 },
      { name: 'reward_items', label: 'Reward Items (JSON)', type: 'json' },
      { name: 'min_level', label: 'Min Level', type: 'number', default: 1 },
      { name: 'max_level', label: 'Max Level', type: 'number', default: 99 },
      { name: 'is_daily', label: 'Daily', type: 'checkbox' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  raid_bosses: {
    type: 'raid_boss',
    title: 'Raid Bosses',
    icon: 'Siren',
    listColumns: ['name', 'npc_id', 'max_parties', 'min_level', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'npc_id', label: 'NPC ID', type: 'number', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'max_parties', label: 'Max Parties', type: 'number', default: 4 },
      { name: 'min_level', label: 'Min Level', type: 'number', default: 10 },
      { name: 'hp_multiplier', label: 'HP Multiplier', type: 'number', default: 5.0 },
      { name: 'reward_xp', label: 'Reward XP', type: 'number', default: 1000 },
      { name: 'reward_gold', label: 'Reward Gold', type: 'number', default: 500 },
      { name: 'reward_items', label: 'Reward Items (JSON)', type: 'json' },
      { name: 'cooldown_hours', label: 'Cooldown Hours', type: 'number', default: 24 },
      { name: 'grid_width', label: 'Grid Width', type: 'number', default: 16 },
      { name: 'grid_height', label: 'Grid Height', type: 'number', default: 12 },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  treasure_trails: {
    type: 'treasure_trail',
    title: 'Treasure Trails',
    icon: 'Map',
    listColumns: ['name', 'tier', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'tier', label: 'Tier', type: 'select', options: [
        { value: 'easy', label: 'Easy' },
        { value: 'medium', label: 'Medium' },
        { value: 'hard', label: 'Hard' },
        { value: 'elite', label: 'Elite' },
        { value: 'master', label: 'Master' }
      ]},
      { name: 'steps_json', label: 'Steps (JSON)', type: 'json', required: true },
      { name: 'reward_table', label: 'Reward Table (JSON)', type: 'json' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  siege_structures: {
    type: 'siege_structure',
    title: 'Siege Structures',
    icon: 'Castle',
    listColumns: ['name', 'max_hp', 'defense', 'team', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'max_hp', label: 'Max HP', type: 'number', default: 500 },
      { name: 'defense', label: 'Defense', type: 'number', default: 20 },
      { name: 'abilities_json', label: 'Abilities (JSON)', type: 'json' },
      { name: 'team', label: 'Team', type: 'select', options: [
        { value: 'attacker', label: 'Attacker' },
        { value: 'defender', label: 'Defender' },
        { value: 'neutral', label: 'Neutral' }
      ]},
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // BATCH: Arena & Tournaments (missing pieces)
  // ═══════════════════════════════════════════════════════════════

  arena_matches: {
    type: 'arena_match',
    title: 'Arena Matches',
    icon: 'Swords',
    listColumns: ['arena_id', 'p1_char_id', 'p2_char_id', 'status'],
    fields: [
      { name: 'arena_id', label: 'Arena ID', type: 'number', required: true },
      { name: 'p1_char_id', label: 'Player 1 Char ID', type: 'number', required: true },
      { name: 'p2_char_id', label: 'Player 2 Char ID', type: 'number' },
      { name: 'battle_id', label: 'Battle ID', type: 'number' },
      { name: 'winner_char_id', label: 'Winner Char ID', type: 'number' },
      { name: 'status', label: 'Status', type: 'select', options: [
        { value: 'pending', label: 'Pending' },
        { value: 'active', label: 'Active' },
        { value: 'completed', label: 'Completed' },
        { value: 'cancelled', label: 'Cancelled' }
      ]}
    ]
  },
  tourney_matches: {
    type: 'tourney_match',
    title: 'Tournament Matches',
    icon: 'Trophy',
    listColumns: ['tournament_id', 'round_id', 'p1_char_id', 'p2_char_id', 'status'],
    fields: [
      { name: 'tournament_id', label: 'Tournament ID', type: 'number', required: true },
      { name: 'round_id', label: 'Round ID', type: 'number', required: true },
      { name: 'match_order', label: 'Match Order', type: 'number', default: 0 },
      { name: 'p1_char_id', label: 'Player 1 Char ID', type: 'number' },
      { name: 'p2_char_id', label: 'Player 2 Char ID', type: 'number' },
      { name: 'winner_char_id', label: 'Winner Char ID', type: 'number' },
      { name: 'battle_id', label: 'Battle ID', type: 'number' },
      { name: 'status', label: 'Status', type: 'select', options: [
        { value: 'pending', label: 'Pending' },
        { value: 'active', label: 'Active' },
        { value: 'completed', label: 'Completed' },
        { value: 'bye', label: 'Bye' }
      ]},
      { name: 'scheduled_at', label: 'Scheduled At', type: 'text' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // BATCH: Character Data Editors
  // ═══════════════════════════════════════════════════════════════

  char_transforms: {
    type: 'char_transform',
    title: 'Character Transformations',
    icon: 'Sparkle',
    listColumns: ['character_id', 'transformation_id', 'uses_remaining'],
    fields: [
      { name: 'character_id', label: 'Character ID', type: 'number', required: true },
      { name: 'transformation_id', label: 'Transformation ID', type: 'number', required: true },
      { name: 'uses_remaining', label: 'Uses Remaining', type: 'number', default: -1 },
      { name: 'last_used_at', label: 'Last Used At', type: 'text' },
      { name: 'unlocked_at', label: 'Unlocked At', type: 'text' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // BATCH: Stat & Level System
  // ═══════════════════════════════════════════════════════════════

  stats: {
    type: 'stat',
    title: 'Stat Definitions',
    icon: 'BarChart3',
    listColumns: ['key_name', 'name', 'default_value', 'min_value', 'max_value'],
    fields: [
      { name: 'key_name', label: 'Key Name', type: 'text', required: true },
      { name: 'name', label: 'Display Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'default_value', label: 'Default Value', type: 'number', default: 0 },
      { name: 'min_value', label: 'Min Value', type: 'number', default: 0 },
      { name: 'max_value', label: 'Max Value', type: 'number', default: 9999 },
      { name: 'icon', label: 'Icon', type: 'icon' }
    ]
  },
  level_reqs: {
    type: 'level_req',
    title: 'Level Requirements',
    icon: 'ArrowUpCircle',
    listColumns: ['level', 'xp_required', 'total_xp'],
    fields: [
      { name: 'level', label: 'Level', type: 'number', required: true },
      { name: 'xp_required', label: 'XP Required', type: 'number', required: true },
      { name: 'total_xp', label: 'Total XP (cumulative)', type: 'number', required: true }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // BATCH: Scripts, Templates & System
  // ═══════════════════════════════════════════════════════════════

  scripts: {
    type: 'script',
    title: 'Scripts',
    icon: 'Code',
    listColumns: ['script_key', 'name'],
    fields: [
      { name: 'script_key', label: 'Script Key', type: 'text', required: true },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'script_json', label: 'Script (JSON)', type: 'json' }
    ]
  },
  templates: {
    type: 'template',
    title: 'Game Templates',
    icon: 'FileCode',
    listColumns: ['label', 'name', 'author', 'version', 'installed'],
    fields: [
      { name: 'name', label: 'Key Name', type: 'text', required: true },
      { name: 'label', label: 'Display Label', type: 'text', required: true },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'preview_image', label: 'Preview Image URL', type: 'text' },
      { name: 'author', label: 'Author', type: 'text', default: 'Twisted Engine' },
      { name: 'version', label: 'Version', type: 'text', default: '1.0' },
      { name: 'terminology_json', label: 'Terminology (JSON)', type: 'json' },
      { name: 'settings_json', label: 'Settings (JSON)', type: 'json' },
      { name: 'classes_json', label: 'Classes (JSON)', type: 'json' },
      { name: 'races_json', label: 'Races (JSON)', type: 'json' },
      { name: 'items_json', label: 'Items (JSON)', type: 'json' },
      { name: 'skills_json', label: 'Skills (JSON)', type: 'json' },
      { name: 'maps_json', label: 'Maps (JSON)', type: 'json' },
      { name: 'npcs_json', label: 'NPCs (JSON)', type: 'json' },
      { name: 'quests_json', label: 'Quests (JSON)', type: 'json' },
      { name: 'battle_config_json', label: 'Battle Config (JSON)', type: 'json' },
      { name: 'styles_json', label: 'Styles (JSON)', type: 'json' },
      { name: 'is_default', label: 'Default', type: 'checkbox' },
      { name: 'installed', label: 'Installed', type: 'checkbox' }
    ]
  },
  terminology: {
    type: 'terminology',
    title: 'Terminology',
    icon: 'Languages',
    listColumns: ['term_key', 'display_name', 'category'],
    fields: [
      { name: 'term_key', label: 'Term Key', type: 'text', required: true },
      { name: 'display_name', label: 'Display Name', type: 'text', required: true },
      { name: 'short_name', label: 'Short Name', type: 'text' },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'category', label: 'Category', type: 'text', default: 'general' }
    ]
  },
  scheduled_tasks: {
    type: 'scheduled_task',
    title: 'Scheduled Tasks',
    icon: 'Clock',
    listColumns: ['name', 'task_type', 'schedule_type', 'is_enabled'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'task_type', label: 'Task Type', type: 'text', required: true },
      { name: 'schedule_type', label: 'Schedule Type', type: 'text' },
      { name: 'run_at_hour', label: 'Run At Hour', type: 'number' },
      { name: 'run_at_day', label: 'Run At Day', type: 'number' },
      { name: 'interval_minutes', label: 'Interval (minutes)', type: 'number' },
      { name: 'target_id', label: 'Target ID', type: 'number' },
      { name: 'config_json', label: 'Config (JSON)', type: 'json' },
      { name: 'is_enabled', label: 'Enabled', type: 'checkbox' }
    ]
  },
  quest_boards: {
    type: 'quest_board',
    title: 'Quest Boards',
    icon: 'ClipboardList',
    listColumns: ['title', 'quest_type', 'faction', 'is_active'],
    fields: [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'quest_type', label: 'Quest Type', type: 'text' },
      { name: 'region_id', label: 'Region ID', type: 'number' },
      { name: 'faction', label: 'Faction', type: 'text' },
      { name: 'requires_flags_json', label: 'Required Flags (JSON)', type: 'json' },
      { name: 'requires_region_json', label: 'Required Regions (JSON)', type: 'json' },
      { name: 'objectives_json', label: 'Objectives (JSON)', type: 'json' },
      { name: 'rewards_json', label: 'Rewards (JSON)', type: 'json' },
      { name: 'expires_at', label: 'Expires At', type: 'text' },
      { name: 'max_completions', label: 'Max Completions', type: 'number' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  config_snapshots: {
    type: 'config_snapshot',
    title: 'Config Snapshots',
    icon: 'Camera',
    listColumns: ['name', 'created_by', 'created_at'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'snapshot_json', label: 'Snapshot Data (JSON)', type: 'json' },
      { name: 'created_by', label: 'Created By', type: 'text' }
    ]
  },
  webhooks: {
    type: 'webhook',
    title: 'Webhooks',
    icon: 'Webhook',
    listColumns: ['name', 'url', 'event_type', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'url', label: 'URL', type: 'text', required: true },
      { name: 'event_type', label: 'Event Type', type: 'text' },
      { name: 'secret', label: 'Secret', type: 'text' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  referrals: {
    type: 'referral',
    title: 'Referrals',
    icon: 'UserPlus',
    listColumns: ['referrer_user_id', 'referred_user_id', 'status'],
    fields: [
      { name: 'referrer_user_id', label: 'Referrer User ID', type: 'number', required: true },
      { name: 'referred_user_id', label: 'Referred User ID', type: 'number', required: true },
      { name: 'referral_code', label: 'Referral Code', type: 'text', required: true },
      { name: 'status', label: 'Status', type: 'select', options: [
        { value: 'pending', label: 'Pending' },
        { value: 'qualified', label: 'Qualified' },
        { value: 'rewarded', label: 'Rewarded' },
        { value: 'expired', label: 'Expired' }
      ]},
      { name: 'referred_level', label: 'Referred Level', type: 'number' },
      { name: 'reward_gold', label: 'Reward Gold', type: 'number' },
      { name: 'reward_item_id', label: 'Reward Item ID', type: 'number' }
    ]
  },
  artifact_powers: {
    type: 'artifact_power',
    title: 'Artifact Powers',
    icon: 'Gem',
    listColumns: ['name', 'artifact_id', 'power_type', 'unlock_kills'],
    fields: [
      { name: 'power_id', label: 'Power ID (slug)', type: 'text', required: true },
      { name: 'artifact_id', label: 'Artifact ID', type: 'text', required: true },
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'power_type', label: 'Power Type', type: 'select', options: [
        { value: 'passive', label: 'Passive' },
        { value: 'active', label: 'Active' },
        { value: 'ultimate', label: 'Ultimate' }
      ]},
      { name: 'unlock_kills', label: 'Unlock Kills', type: 'number', default: 0 },
      { name: 'rank_max', label: 'Max Rank', type: 'number', default: 1 },
      { name: 'effect_json', label: 'Effect (JSON)', type: 'json', required: true }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // BATCH: Staff & Admin Tools
  // ═══════════════════════════════════════════════════════════════

  staff_activities: {
    type: 'staff_activity',
    title: 'Staff Activity Log',
    icon: 'Activity',
    listColumns: ['staff_user_id', 'action_type', 'target_type', 'created_at'],
    fields: [
      { name: 'staff_user_id', label: 'Staff User ID', type: 'number', required: true },
      { name: 'action_type', label: 'Action Type', type: 'text', required: true },
      { name: 'target_type', label: 'Target Type', type: 'text' },
      { name: 'target_id', label: 'Target ID', type: 'number' },
      { name: 'detail_json', label: 'Details (JSON)', type: 'json' }
    ]
  },
  staff_audits: {
    type: 'staff_audit',
    title: 'Staff Audit Log',
    icon: 'ShieldCheck',
    listColumns: ['staff_user_id', 'action', 'entity_type', 'created_at'],
    fields: [
      { name: 'staff_user_id', label: 'Staff User ID', type: 'number', required: true },
      { name: 'action', label: 'Action', type: 'text', required: true },
      { name: 'entity_type', label: 'Entity Type', type: 'text' },
      { name: 'entity_id', label: 'Entity ID', type: 'number' },
      { name: 'before_json', label: 'Before (JSON)', type: 'json' },
      { name: 'after_json', label: 'After (JSON)', type: 'json' }
    ]
  },
  shift_notes: {
    type: 'shift_note',
    title: 'Shift Notes',
    icon: 'StickyNote',
    listColumns: ['staff_user_id', 'title', 'priority', 'created_at'],
    fields: [
      { name: 'staff_user_id', label: 'Staff User ID', type: 'number', required: true },
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'body', label: 'Body', type: 'textarea' },
      { name: 'priority', label: 'Priority', type: 'select', options: [
        { value: 'low', label: 'Low' },
        { value: 'normal', label: 'Normal' },
        { value: 'high', label: 'High' },
        { value: 'urgent', label: 'Urgent' }
      ]},
      { name: 'resolved', label: 'Resolved', type: 'checkbox' }
    ]
  },
  role_sections: {
    type: 'role_section',
    title: 'Admin Role Sections',
    icon: 'Lock',
    listColumns: ['name', 'role', 'section_key', 'allowed'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'role', label: 'Role', type: 'select', options: [
        { value: 'MOD', label: 'Moderator' },
        { value: 'GM', label: 'Game Master' },
        { value: 'ADMIN', label: 'Admin' },
        { value: 'OWNER', label: 'Owner' }
      ]},
      { name: 'section_key', label: 'Section Key', type: 'text', required: true },
      { name: 'allowed', label: 'Allowed', type: 'checkbox' }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // BATCH: Misc remaining
  // ═══════════════════════════════════════════════════════════════

  autotile_groups: {
    type: 'autotile_group',
    title: 'Autotile Groups',
    icon: 'LayoutGrid',
    listColumns: ['name', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'tiles_json', label: 'Tiles (JSON)', type: 'json' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  battle_knockouts: {
    type: 'battle_knockout',
    title: 'Battle Knockouts',
    icon: 'CircleOff',
    listColumns: ['battle_id', 'npc_name', 'knocked_out_by', 'ko_method'],
    fields: [
      { name: 'battle_id', label: 'Battle ID', type: 'number', required: true },
      { name: 'npc_char_id', label: 'NPC Char ID', type: 'number', required: true },
      { name: 'npc_name', label: 'NPC Name', type: 'text' },
      { name: 'knocked_out_by', label: 'Knocked Out By (Char ID)', type: 'number', required: true },
      { name: 'ko_method', label: 'KO Method', type: 'text', default: 'nonlethal' },
      { name: 'interaction', label: 'Interaction', type: 'text' },
      { name: 'interaction_result', label: 'Interaction Result (JSON)', type: 'json' }
    ]
  },
  battle_referees: {
    type: 'battle_referee',
    title: 'Battle Referees',
    icon: 'UserCheck',
    listColumns: ['name', 'npc_id', 'is_active'],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'npc_id', label: 'NPC ID', type: 'number' },
      { name: 'rules_json', label: 'Rules (JSON)', type: 'json' },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  companion_quests: {
    type: 'companion_quest',
    title: 'Companion Quests',
    icon: 'HeartHandshake',
    listColumns: ['npc_id', 'quest_order', 'title', 'affinity_required', 'is_active'],
    fields: [
      { name: 'npc_id', label: 'Companion NPC ID', type: 'number', required: true },
      { name: 'quest_order', label: 'Quest Order', type: 'number', default: 1 },
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'icon', label: 'Icon', type: 'icon' },
      { name: 'affinity_required', label: 'Affinity Required', type: 'number', default: 0 },
      { name: 'level_required', label: 'Level Required', type: 'number', default: 1 },
      { name: 'prerequisite_quest_id', label: 'Prerequisite Companion Quest ID', type: 'number' },
      { name: 'objectives_json', label: 'Objectives (JSON)', type: 'json', required: true, placeholder: '[{"type":"KILL","target_npc_id":5,"count":3,"label":"Defeat 3 Wolves"}]' },
      { name: 'rewards_json', label: 'Rewards (JSON)', type: 'json', placeholder: '{"xp":200,"gold":100,"items":[{"item_id":5,"qty":1}]}' },
      { name: 'completion_dialogue', label: 'Completion Dialogue', type: 'textarea' },
      { name: 'affinity_reward', label: 'Affinity Reward', type: 'number', default: 25 },
      { name: 'is_active', label: 'Active', type: 'checkbox' }
    ]
  },
  companion_affinity_tiers: {
    type: 'companion_affinity_tier',
    title: 'Companion Affinity Tiers',
    icon: 'Heart',
    listColumns: ['tier_level', 'name', 'affinity_required'],
    fields: [
      { name: 'tier_level', label: 'Tier Level', type: 'number', required: true },
      { name: 'name', label: 'Tier Name', type: 'text', required: true },
      { name: 'affinity_required', label: 'Affinity Required', type: 'number', required: true },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'stat_bonus_json', label: 'Stat Bonuses (JSON)', type: 'json' },
      { name: 'unlock_text', label: 'Unlock Text', type: 'text', placeholder: '{name} considers you a true friend.' }
    ]
  },
  training_logs: {
    type: 'training_log',
    title: 'Master Training Log',
    icon: 'GraduationCap',
    listColumns: ['character_id', 'npc_id', 'training_type', 'trained_at'],
    fields: [
      { name: 'character_id', label: 'Character ID', type: 'number', required: true },
      { name: 'npc_id', label: 'NPC ID', type: 'number', required: true },
      { name: 'training_type', label: 'Training Type', type: 'select', options: [
        { value: 'stat_train', label: 'Stat Training' },
        { value: 'learn_skill', label: 'Learn Skill' },
        { value: 'learn_sig_tech', label: 'Learn Sig Tech' },
        { value: 'unlock_creation', label: 'Unlock Creation' }
      ]},
      { name: 'result_json', label: 'Result (JSON)', type: 'json' }
    ]
  },
}
