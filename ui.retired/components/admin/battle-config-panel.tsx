"use client"
import { toast } from "@/hooks/use-toast"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronRight, ChevronLeft, ExternalLink, Search } from "lucide-react"

const API = process.env.NEXT_PUBLIC_API_URL || ''

// ─── Types ───────────────────────────────────────────────────────
interface Setting {
  key: string; type: 'toggle' | 'number' | 'percent' | 'select' | 'text'
  label: string; desc?: string; value?: string | null; options?: string[]
  termKey?: string; terminology?: { term_key: string; display_name: string; icon?: string; description?: string }
}

// ─── System Definitions ──────────────────────────────────────────
// Each system = one toggleable feature. Child settings + entities
// only render when the toggle is ON.

interface SystemDef {
  toggleKey: string
  label: string
  desc: string
  childKeys?: string[]    // value/select/sub-toggle settings shown when ON
  entityKeys?: string[]   // entity data tables shown when ON
}

interface SectionDef {
  id: string; label: string; icon: string
  systems: SystemDef[]
}

const SECTIONS: SectionDef[] = [
  // ──────────────────────────────────────────────────────────
  // COMBAT MECHANICS — The core of how fighting works
  // ──────────────────────────────────────────────────────────
  {
    id: 'combat', label: 'Combat Mechanics', icon: '\u2694\uFE0F',
    systems: [
      {
        toggleKey: 'enable_limb_targeting', label: 'Limb Targeting & Called Shots',
        desc: 'Fighters can target specific body parts (head, arms, legs, torso). Each zone has its own HP pool, accuracy penalty for called shots, and bleed-through to main HP. Destroying a limb triggers special effects (e.g. head = knockout, arms = disarm).',
        childKeys: ['enable_called_shot_penalty', 'called_shot_penalty_head', 'called_shot_penalty_arms', 'called_shot_penalty_legs', 'limb_bleed_through_default'],
        entityKeys: ['body_types', 'limb_zones'],
      },
      {
        toggleKey: 'enable_active_defense', label: 'Dodge, Block & Counter',
        desc: 'When attacked, defenders roll for Dodge (speed-based evasion), Block (shield/arm damage reduction), or Counter (strike back on a successful defense). Turns combat from passive HP trading into a tactical exchange.',
        childKeys: ['defense_prompt_timeout_ms', 'dodge_base_chance', 'dodge_speed_factor', 'dodge_max_chance', 'block_die_sides', 'block_success_numbers', 'block_one_arm_reduction', 'block_two_arm_reduction', 'block_stun_die_sides', 'counter_base_chance', 'counter_charge_bonus', 'counter_max_chance'],
      },
      {
        toggleKey: 'enable_nonlethal', label: 'Knockout & Mercy',
        desc: 'At 0 HP, characters are knocked out instead of killed. Winners choose: interrogate, release (reputation bonus), or finish off (reputation penalty). Enables tournament-safe combat and moral choices.',
        childKeys: ['ko_interrogate_base_chance', 'nonlethal_rep_bonus_release', 'nonlethal_rep_penalty_finish'],
      },
      {
        toggleKey: 'enable_wound_degradation', label: 'Wound Penalties',
        desc: 'Damaged limbs impose stat penalties. A wounded sword-arm reduces attack power, crippled legs cut speed and dodge chance. Crossing thresholds escalates from light to heavy wounds.',
        childKeys: ['wound_threshold_light', 'wound_threshold_heavy', 'wound_threshold_disable'],
      },
      {
        toggleKey: 'enable_diminishing_returns', label: 'Repetition Penalty',
        desc: 'Spamming the same attack gives the opponent a stacking dodge bonus. Forces players to vary their tactics instead of mashing one button. Resets when a different attack is used.',
        childKeys: ['diminishing_returns_per_repeat', 'diminishing_returns_max'],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // FORMATION & POSITIONING — Row system + formation shapes
  // ──────────────────────────────────────────────────────────
  {
    id: 'formation', label: 'Formation & Positioning', icon: '\u2694\uFE0F',
    systems: [
      {
        toggleKey: 'enable_formations', label: 'Front Row / Back Row',
        desc: 'Combatants are assigned to front or back row. Front row deals and takes full melee damage. Back row takes reduced melee damage but deals less melee. Ranged/magic ignores rows. Back row is protected from melee while front row has living members.',
        childKeys: ['front_melee_bonus', 'back_melee_penalty', 'back_melee_reduction', 'back_ranged_bonus', 'row_swap_costs_turn'],
        entityKeys: ['formation_shapes'],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // GRID & POSITIONING — Tactical battlefield control
  // ──────────────────────────────────────────────────────────
  {
    id: 'grid', label: 'Grid & Positioning', icon: '\uD83D\uDDFA\uFE0F',
    systems: [
      {
        toggleKey: 'enable_elevation', label: 'Elevation & Height Advantage',
        desc: 'Each tile can have a height level (0-3). Attacking downhill grants damage and accuracy bonuses. Attacking uphill reduces accuracy and gives the defender a dodge bonus. Design maps with ridges, walls, and platforms.',
        childKeys: ['elevation_height_bonus'],
      },
      {
        toggleKey: 'enable_opportunity_attacks', label: 'Opportunity Attacks',
        desc: 'Moving out of an adjacent enemy melee range triggers a free attack. Punishes reckless repositioning and rewards tactical movement. Each enemy can only trigger one per round.',
        childKeys: ['opportunity_attack_damage_pct'],
      },
      {
        toggleKey: 'enable_zone_of_control', label: 'Zone of Control',
        desc: 'Melee combatants "threaten" all adjacent tiles. Threatened tiles are highlighted on the grid. Combined with opportunity attacks, this creates a frontline/backline dynamic.',
      },
      {
        toggleKey: 'enable_aoe_shapes', label: 'AoE Targeting Shapes',
        desc: 'Abilities can target areas using different shapes: Radius (circle), Line (beam), Cone (fan), Cross (+pattern), Ring (hollow circle). Each shape changes tactical value of positioning.',
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // TERRAIN & ENVIRONMENT — Battlefield surface effects
  // ──────────────────────────────────────────────────────────
  {
    id: 'terrain', label: 'Terrain & Environment', icon: '\uD83C\uDF0D',
    systems: [
      {
        toggleKey: 'enable_difficult_terrain', label: 'Terrain Effects',
        desc: 'Each grid tile can have a terrain type (mud, water, ice, fire, etc.) that modifies movement cost, grants stat bonuses, applies status effects, and changes elemental effectiveness. Design battlefields with natural chokepoints and hazards.',
        childKeys: ['difficult_terrain_cost'],
        entityKeys: ['battle_terrain'],
      },
      {
        toggleKey: 'enable_weather_effects', label: 'Weather & Atmosphere',
        desc: 'Battlefield conditions affect combat globally. Rain boosts water damage, fog reduces accuracy, storms strike randomly, heat drains stamina. Can change mid-battle via rules or abilities.',
        entityKeys: ['weather_effects'],
      },
      {
        toggleKey: 'enable_traps', label: 'Battlefield Traps',
        desc: 'Place hidden hazards on the battlefield grid. Triggered by movement or proximity. Can deal damage, slow, stun, or apply status effects to enemies who walk through.',
        entityKeys: ['traps'],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // GRID DIMENSIONS — Battle arena size
  // ──────────────────────────────────────────────────────────
  // Note: grid_width and grid_height are in GLOBAL_KEYS below

  // ──────────────────────────────────────────────────────────
  // LOOT & REWARDS — Steal, drops, rating, chain bonuses
  // ──────────────────────────────────────────────────────────
  {
    id: 'loot', label: 'Loot & Rewards', icon: '\uD83D\uDCB0',
    systems: [
      {
        toggleKey: 'enable_steal', label: 'Steal Action',
        desc: 'Mid-battle steal command. Roll luck+speed vs target level. Two pools: common (always) and rare (20% chance). Each enemy can only be stolen from once per battle. Works on NPCs that have a steal or drop table.',
        childKeys: ['steal_base_chance', 'steal_rare_chance'],
      },
      {
        toggleKey: 'enable_overkill_bonus', label: 'Overkill Bonus',
        desc: 'Massive killing blows grant bonus XP, gold, and better drop rates. Three tiers of overkill based on excess damage. Rewards big finishers and smart ability use.',
        childKeys: ['overkill_threshold_small', 'overkill_mult_small', 'overkill_threshold_medium', 'overkill_mult_medium', 'overkill_threshold_large', 'overkill_mult_large'],
      },
      {
        toggleKey: 'enable_battle_chain', label: 'Battle Chain Bonus',
        desc: 'Fighting consecutive battles without resting builds a chain multiplier. Each battle in the chain increases XP and drop rates. Resets on rest, inn, or death. Rewards grinding streaks.',
        childKeys: ['chain_xp_bonus', 'chain_drop_bonus', 'chain_max_bonus'],
      },
      {
        toggleKey: 'enable_battle_rating', label: 'Battle Performance Rating',
        desc: 'S/A/B/C/D rank at battle end based on: turns taken, damage received, and no-death bonus. Higher ranks multiply XP and gold rewards. Gives replay incentive and skill expression.',
        childKeys: ['rating_target_turns', 'rating_s_xp_mult', 'rating_s_gold_mult', 'rating_a_xp_mult', 'rating_a_gold_mult'],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // BUFF & STATUS RULES — Stacking, cleanse, immunity
  // ──────────────────────────────────────────────────────────
  {
    id: 'buffs', label: 'Buff & Status Rules', icon: '\u2728',
    systems: [
      {
        toggleKey: 'enable_buff_stacking', label: 'Buff Stacking',
        desc: 'Controls how applying the same status twice works. Refresh = reset duration (default). Stack = multiple instances up to a cap for compounding effects (e.g. Poison x3 = 3x damage). Overwrite = remove old, apply fresh. Ignore = second application fails.',
        childKeys: ['default_stack_mode', 'default_max_stacks'],
      },
      {
        toggleKey: 'enable_cleanse', label: 'Cleanse (Remove Debuffs)',
        desc: 'Certain skills and items can remove debuffs and crowd control from allies. Can target all debuffs, a specific category (CC only, DoT only), or a specific status by name.',
      },
      {
        toggleKey: 'enable_dispel', label: 'Dispel (Remove Enemy Buffs)',
        desc: 'Offensive dispel that strips buffs from enemies. Can target offensive buffs only, defensive buffs only, or all. Some buffs can be marked undispellable (boss enrages, story effects).',
      },
      {
        toggleKey: 'enable_status_immunity', label: 'Immunity Windows',
        desc: 'After a status effect is cleansed or expires, the target becomes temporarily immune to that same status. Prevents re-stun-locking and gives breathing room after cleanse.',
        childKeys: ['cleanse_immunity_duration'],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // DEFENSIVE SYSTEMS — Barriers, cover, protection
  // ──────────────────────────────────────────────────────────
  {
    id: 'defensive', label: 'Defensive Systems', icon: '\uD83D\uDEE1\uFE0F',
    systems: [
      {
        toggleKey: 'enable_cover_system', label: 'Provoke & Cover',
        desc: 'A tank can "Cover" an ally — when that ally would take damage, the covering tank intercepts the hit. Configurable: full absorption or damage split between both. Lasts a set number of turns.',
        childKeys: ['cover_duration', 'cover_damage_split'],
      },
      {
        toggleKey: 'enable_barriers', label: 'Absorption Barriers',
        desc: 'Spells, items, or passives can grant a temporary shield with its own HP pool. Damage hits the barrier first. Barriers can filter by damage type (physical only, magic only, or all). Shatters when depleted or expired.',
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // DAMAGE & STATUS — How hits land, stack, and interact
  // ──────────────────────────────────────────────────────────
  {
    id: 'damage', label: 'Damage & Status Effects', icon: '\uD83E\uDE78',
    systems: [
      {
        toggleKey: 'enable_bleed_tiers', label: 'Bleeding & Wound Severity',
        desc: 'Attacks can inflict Light, Moderate, or Heavy bleeding. Each tier deals escalating damage-over-time for a set number of turns. Bleeding stacks with other status effects.',
        childKeys: ['bleed_max_stacks', 'bleed_max_duration'],
        entityKeys: ['bleed_tiers'],
      },
      {
        toggleKey: 'enable_stagger_system', label: 'Stagger & Poise',
        desc: 'Every hit builds a stagger meter on the target. When the meter fills, the target staggers and becomes vulnerable. Heavy weapons build more stagger, while poise (from armor/stats) resists it. Decays each turn.',
        childKeys: ['stagger_base_increase', 'stagger_decay_per_turn'],
      },
      {
        toggleKey: 'enable_break_shield', label: 'Shield Break',
        desc: 'Enemies (especially bosses) have a shield gauge. When broken, they are stunned for X turns and take bonus damage. Inspired by Octopath Traveler break system.',
        childKeys: ['break_stun_turns', 'break_damage_bonus'],
      },
      {
        toggleKey: 'enable_elemental_reactions', label: 'Elemental Reactions',
        desc: 'Combining two elements triggers a bonus reaction (Fire + Wind = Firestorm, Ice + Lightning = Shatter). Define custom element pairs and their damage bonuses.',
        entityKeys: ['elemental_reactions'],
      },
      {
        toggleKey: 'enable_status_combos', label: 'Status Effect Combos',
        desc: 'When two status effects overlap on a target, a combo triggers (Burn + Poison = Toxic Inferno). Rewards strategic ability sequencing between party members.',
        entityKeys: ['status_combos'],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // TURN & ACTION SYSTEMS — How turns flow and inputs work
  // ──────────────────────────────────────────────────────────
  {
    id: 'turns', label: 'Turn & Action Systems', icon: '\u23F1\uFE0F',
    systems: [
      {
        toggleKey: 'enable_one_more', label: 'One More (Weakness Exploit)',
        desc: 'Hitting an enemy weakness grants an extra turn, Persona-style. Rewards elemental knowledge and party composition. Missing or hitting a resistance wastes your turn.',
      },
      {
        toggleKey: 'enable_turn_manipulation', label: 'Turn Order Manipulation',
        desc: 'Certain abilities can delay an enemy turn or advance an ally turn in the initiative order. Adds a time-mage tactical layer to combat.',
      },
      {
        toggleKey: 'enable_action_commands', label: 'Action Commands',
        desc: 'Timed button presses during attacks for bonus damage (like Paper Mario). Adds mechanical skill to turn-based combat. Players who engage get rewarded.',
      },
      {
        toggleKey: 'enable_combo_input', label: 'Multi-Hit Combo Input',
        desc: 'Chain rapid inputs during your turn to land multiple smaller hits instead of one big hit. Each hit does reduced damage but the total can exceed a normal attack. Uses AP that regens each turn.',
        childKeys: ['combo_ap_regen_per_turn', 'combo_individual_hit_damage'],
      },
      {
        toggleKey: 'enable_weapon_triangle', label: 'Weapon Triangle',
        desc: 'Fire Emblem-style rock-paper-scissors between weapon types (Swords beat Axes, Axes beat Lances, Lances beat Swords). Adds a strategic layer to gear selection.',
      },
      {
        toggleKey: 'enable_advantage_system', label: 'Advantage & Disadvantage',
        desc: 'Positional or conditional bonuses that grant advantage (roll twice, take best) or disadvantage (roll twice, take worst). Flanking, high ground, status effects can trigger this.',
      },
      {
        toggleKey: 'enable_threat_system', label: 'Threat & Aggro',
        desc: 'Enemies target the fighter generating the most threat. Tanks generate threat by dealing damage and taunting, healers generate threat by healing. Adds MMO-style role dynamics.',
        childKeys: ['threat_damage_multiplier', 'threat_heal_multiplier'],
      },
      {
        toggleKey: 'enable_turn_timeout', label: 'Turn Timer',
        desc: 'Limit how long a player has to act each turn. When the timer expires, the default action triggers (defend, skip, or random). Prevents AFK stalling in PvP.',
        childKeys: ['turn_timeout_seconds', 'turn_timeout_action'],
      },
      {
        toggleKey: 'enable_brave_default', label: 'Brave / Default (Turn Banking)',
        desc: 'Bravely Default-style system. DEFAULT: skip your action to bank 1 BP and gain a defense boost. BRAVE: spend banked BP to take up to 4 actions in one turn. Can go negative — act now, skip turns later. Creates high-risk burst windows and defensive banking strategy.',
        childKeys: ['bd_max_bp', 'bd_min_bp', 'bd_starting_bp', 'bd_default_defense_bonus', 'bd_bp_regen_per_turn', 'bd_negative_bp_skip_turn'],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // RP & NARRATION — How story meets mechanics
  // ──────────────────────────────────────────────────────────
  {
    id: 'rp', label: 'RP & Narration', icon: '\uD83C\uDFAD',
    systems: [
      {
        toggleKey: 'enable_rp_descriptions', label: 'RP Attack Descriptions',
        desc: 'Players write custom descriptions of their attacks for a damage bonus. Longer descriptions earn more. Referencing the battlefield (terrain, weather, enemy state) gives extra context bonus.',
        childKeys: ['rp_desc_max_bonus', 'rp_desc_short_bonus', 'rp_desc_detailed_bonus', 'rp_desc_context_bonus'],
      },
      {
        toggleKey: 'enable_flavor_text', label: 'Flavor Text Templates',
        desc: 'Pre-built flavor text templates with keyword matching. Texts matching certain keywords or terrain get bonus damage. Repeated thematic descriptions can discover Signature Techniques.',
        childKeys: ['flavor_text_min_length', 'flavor_text_max_bonus', 'flavor_text_base_bonus', 'flavor_text_keyword_bonus', 'flavor_text_keyword_max'],
        entityKeys: ['flavor_texts', 'flavor_keywords'],
      },
      {
        toggleKey: 'enable_battle_narration', label: 'Auto DM Narration',
        desc: 'The engine generates cinematic combat narration based on what happened (weapon type, element, crit, dodge, etc.). Makes each battle read like a story.',
        entityKeys: ['narrations'],
      },
      {
        toggleKey: 'enable_rp_commands', label: 'Social Combat',
        desc: 'Non-damage combat actions: Taunt draws enemy aggro to you, Intimidate debuffs enemy stats, Rally buffs nearby allies. Adds support roles beyond just healing.',
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // KI & MAGIC — Resource-based power systems
  // ──────────────────────────────────────────────────────────
  {
    id: 'ki', label: 'Ki & Magic', icon: '\uD83D\uDD25',
    systems: [
      {
        toggleKey: 'enable_ki_channeling', label: 'Power Surge (Ki Channel)',
        desc: 'Sacrifice future safety for immediate power. Channel ki to fight at full strength for a limited number of turns, then crash to a fraction of your HP when the surge ends.',
        childKeys: ['ki_channel_duration', 'ki_channel_crash_pct', 'ki_channel_uses_per_battle'],
      },
      {
        toggleKey: 'enable_spell_slots', label: 'Ability Charges (Spell Slots)',
        desc: 'Powerful abilities consume limited-use spell slots instead of (or in addition to) MP. Slots only refresh on rest, forcing careful resource management across multiple fights.',
        childKeys: ['spell_slots_refresh_on'],
      },
      {
        toggleKey: 'enable_summons', label: 'Summoning',
        desc: 'Call creatures into battle via rare Oghams. Summons fight alongside the caster with their own HP, abilities, and turn in the initiative order. Costs MP or a spell slot.',
        childKeys: ['max_summons_per_player', 'summon_cost_type', 'summon_mp_cost_pct', 'summon_base_duration'],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // PROGRESSION — Character growth through combat
  // ──────────────────────────────────────────────────────────
  {
    id: 'progression', label: 'Progression & Styles', icon: '\uD83E\uDD4B',
    systems: [
      {
        toggleKey: 'enable_signature_techs', label: 'Signature Techniques',
        desc: 'Player-created custom skills born from RP. When a character repeatedly describes similar attack patterns, they can "discover" a new technique that levels up with use.',
        childKeys: ['sig_tech_require_unlock', 'sig_tech_discovery_threshold', 'sig_tech_max_per_character'],
        entityKeys: ['sig_levels', 'sig_abilities'],
      },
      {
        toggleKey: 'enable_fighting_styles', label: 'Martial Arts & Styles',
        desc: 'Learnable fighting disciplines with belt/rank progression. Win fights using a style to earn rank XP. Higher ranks unlock passive bonuses and new techniques.',
        entityKeys: ['fighting_styles', 'style_ranks'],
      },
      {
        toggleKey: 'enable_combo_procs', label: 'Multi-Hit Combos',
        desc: 'Physical attacks have a chance to chain into follow-up hits. Each hit in the chain does less damage (decay). Lower base damage attacks have higher combo chance (Mado rule). Can crit.',
        childKeys: ['combo_chain_decay', 'combo_crit_chance'],
      },
      {
        toggleKey: 'enable_passive_abilities', label: 'Passive Abilities',
        desc: 'Equippable passive effects that are always active in battle (e.g. "Fire Resist +20%", "Counter chance +10%"). Limited slots force meaningful build choices.',
        childKeys: ['max_passive_slots'],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // ADVANCED COMBAT — Big moments and complex mechanics
  // ──────────────────────────────────────────────────────────
  {
    id: 'advanced', label: 'Advanced Combat', icon: '\uD83D\uDC51',
    systems: [
      {
        toggleKey: 'enable_custom_win_conditions', label: 'Victory Conditions',
        desc: 'Go beyond "defeat all enemies." Create scenarios with survival timers, NPC escort, point capture, object destruction, or puzzle-based objectives.',
        entityKeys: ['win_conditions'],
      },
      {
        toggleKey: 'enable_stealth', label: 'Stealth & Ambush',
        desc: 'Characters can hide and set up ambushes for surprise bonus damage on the first strike. Uses Dexterity-based stealth checks versus Perception. Failed stealth wastes your turn.',
        childKeys: ['stealth_surprise_bonus'],
      },
      {
        toggleKey: 'enable_transformations', label: 'Power Transformations',
        desc: 'Temporary power-up forms that boost stats and unlock new abilities. Celtic war paint, berserk rage, druidic shapeshifting, divine channeling. Limited duration with cooldowns.',
        entityKeys: ['transformations'],
      },
      {
        toggleKey: 'enable_link_attacks', label: 'Dual Strikes',
        desc: 'Two allies combine their action to attack simultaneously for combined damage with a bonus multiplier. Requires adjacent positioning and both allies must have their turn available.',
        entityKeys: ['link_attacks'],
      },
      {
        toggleKey: 'enable_revive', label: 'Revival',
        desc: 'Bring back fallen allies mid-battle using items, healing spells, or class abilities. Revived characters return with partial HP based on the ability used.',
      },
      {
        toggleKey: 'enable_battle_rules', label: 'Custom Battle Rules',
        desc: 'No-code IF/THEN rule engine. Create triggers like "when any fighter drops below 25% HP, grant Berserk" or "when weather is Storm, all Lightning damage +50%" without writing code.',
        entityKeys: ['battle_rules'],
      },
      {
        toggleKey: 'enable_party_swap', label: 'Party Swap',
        desc: 'Swap reserve party members into active combat mid-battle. The swapped-in character acts on the next turn. Adds a Pokemon-style roster management layer.',
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // ENEMY AI & BEHAVIOR — How enemies think and react
  // ──────────────────────────────────────────────────────────
  {
    id: 'enemy_ai', label: 'Enemy AI & Behavior', icon: '\uD83E\uDDE0',
    systems: [
      {
        toggleKey: 'enable_morale', label: 'Enemy Morale & Flee AI',
        desc: 'Enemies have a morale value (0-100) that drops when allies die, they take crits, or HP gets low. Below the flee threshold, enemies attempt to run. If a boss/leader flees, all allies rout. Pursuit grants bonus damage against fleeing enemies. Personality types: brave (+morale), coward (-morale), fanatic (never flees).',
        childKeys: ['starting_morale', 'max_morale', 'flee_threshold', 'ally_death_loss', 'leader_death_loss', 'critical_hit_loss', 'heavy_damage_loss', 'heavy_damage_pct', 'low_hp_loss', 'low_hp_threshold', 'enemy_kill_gain', 'heal_received_gain', 'idle_turn_gain', 'pursuit_bonus_damage_pct', 'rout_on_leader_flee', 'personality_brave_bonus', 'personality_coward_penalty'],
      },
      {
        toggleKey: 'enable_boss_phases', label: 'Boss Phase Transitions',
        desc: 'Multi-stage boss encounters. At HP thresholds, bosses shift to new phases with different movesets, resistances, and mechanics. Creates cinematic "the boss gets serious" moments.',
        entityKeys: ['boss_phases'],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // QoL & AUTOMATION — Player convenience features
  // ──────────────────────────────────────────────────────────
  {
    id: 'qol', label: 'QoL & Automation', icon: '\u2728',
    systems: [
      {
        toggleKey: 'enable_auto_battle', label: 'Auto-Battle',
        desc: 'Players can toggle AI control of their party during battle. Choose from 5 tactics presets: Aggressive (max damage), Defensive (guard when hurt, heal allies), Balanced (smart mix), Conserve MP (basic attacks only), Focus Healer (prioritize healing). Battle speed controls: 1x, 2x, 4x.',
        childKeys: ['auto_battle_default_tactics', 'auto_battle_base_delay_ms'],
      },
      {
        toggleKey: 'enable_damage_preview', label: 'Damage Preview',
        desc: 'Before confirming an action, players see estimated damage range, hit chance, crit chance, element effectiveness, and whether the attack will kill, break shields, or trigger stagger. Shows row penalties, elevation bonuses, and cover warnings. No guesswork.',
      },
      {
        toggleKey: 'enable_spectator_mode', label: 'Spectator Mode',
        desc: 'Non-combatants can watch battles unfold in real-time. Spectators see the full battlefield but cannot interact. Great for tournaments and community engagement.',
      },
      {
        toggleKey: 'enable_battle_equip_swap', label: 'Mid-Battle Gear Swap',
        desc: 'Switch weapons and armor during combat, costing a turn action. Lets players adapt to enemy weaknesses or swap to a shield when low on HP.',
      },
      {
        toggleKey: 'enable_auto_revive', label: 'Auto-Revive',
        desc: 'When all party members fall, automatically revive the party at a configurable HP percentage instead of game-over. Softer penalty for defeat.',
        childKeys: ['auto_revive_hp_pct'],
      },
      {
        toggleKey: 'enable_escape_xp_penalty', label: 'Escape XP Penalty',
        desc: 'Running from battle costs a percentage of earned XP. Discourages flee-spamming while still allowing retreat.',
        childKeys: ['escape_xp_loss_pct'],
      },
      {
        toggleKey: 'enable_rolling_hp', label: 'Hidden HP Bars',
        desc: 'HP numbers are hidden from the enemy. Instead of exact values, players see vague descriptions ("Healthy", "Bloodied", "Near Death"). Adds tension and uncertainty.',
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // SKILL LEARNING & SPECIAL SYSTEMS
  // ──────────────────────────────────────────────────────────
  {
    id: 'special', label: 'Special Battle Systems', icon: '\uD83C\uDF1F',
    systems: [
      {
        toggleKey: 'enable_skill_learning', label: 'Skill Learning (Blue Mage)',
        desc: 'Learn enemy abilities by being hit by them, devouring defeated enemies, or sketching their moves. Configurable per-skill and per-class. FF Blue Mage / Enemy Skill materia system.',
        childKeys: ['skill_learn_default_chance', 'enable_devour', 'enable_sketch'],
      },
      {
        toggleKey: 'enable_terrain_interaction', label: 'Terrain Interaction',
        desc: 'Fire spreads to nearby grass tiles, lightning electrifies water, ice freezes water, fire melts ice. Dynamic battlefield transformation mid-combat. Divinity: Original Sin style.',
        childKeys: ['fire_spread_chance'],
        entityKeys: ['terrain_interactions'],
      },
      {
        toggleKey: 'enable_mount_combat', label: 'Mount Combat',
        desc: 'Fight while mounted. Mounts have separate HP, grant stat bonuses and unique abilities (charge, trample). Mount dies = forced dismount.',
        childKeys: ['mount_dismount_on_death'],
      },
      {
        toggleKey: 'enable_raids', label: 'Raid Bosses',
        desc: 'Multi-party encounters vs mega-bosses. Up to 4 parties fight the same boss simultaneously on a massive grid. Shared HP bar. Massive rewards.',
        childKeys: ['raid_max_parties'],
      },
      {
        toggleKey: 'enable_async_pvp', label: 'Async PvP (Ghost Battles)',
        desc: 'Fight AI-controlled copies of other players defense teams. Set your defense team, challenge others anytime. Rating system with leaderboard.',
        childKeys: ['async_pvp_rating_change'],
      },
      {
        toggleKey: 'enable_job_system', label: 'Job System (FFT-style)',
        desc: 'Alternative to fixed classes. Players level up jobs, earn JP in battle, mix abilities across jobs. Primary + secondary job slots. Toggle between fixed class mode and job mode.',
        childKeys: ['progression_mode', 'jp_per_battle_action', 'max_job_level', 'allow_secondary_job'],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // CARD GAME & MINIGAMES
  // ──────────────────────────────────────────────────────────
  {
    id: 'minigames', label: 'Minigames', icon: '\uD83C\uDCCF',
    systems: [
      {
        toggleKey: 'enable_card_game', label: 'Card Game (Triple Triad)',
        desc: 'Collectible card game using in-game characters as cards. 3x3 grid, place cards with directional values, flip opponents cards. Win to earn new cards. Challenge NPCs or players.',
        childKeys: ['card_game_board_size', 'card_game_wager_enabled'],
        entityKeys: ['cards', 'card_rules'],
      },
      {
        toggleKey: 'enable_dice_gambling', label: 'Dice Gambling',
        desc: 'Dice-based minigame at taverns and NPCs. Configurable dice tables with custom outcomes and wagering rules.',
        entityKeys: ['dice_tables'],
      },
      {
        toggleKey: 'enable_arena_betting', label: 'Arena Betting',
        desc: 'Spectators can bet gold on arena matches and tournament fights. Odds calculated from fighter stats and ranking.',
      },
      {
        toggleKey: 'enable_fishing_minigame', label: 'Fishing',
        desc: 'Interactive fishing at designated spots. Timing-based catch mechanic with fish rarity tables. Requires bait items. Levels up gathering skills.',
        entityKeys: ['fishing_spots'],
      },
      {
        toggleKey: 'enable_puzzle_rooms', label: 'Puzzle Rooms',
        desc: 'Dedicated puzzle encounters with custom logic. Tile puzzles, riddles, code locks, and pattern matching. Rewards XP and items on completion.',
        entityKeys: ['puzzles'],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // EXPERIMENTAL BATTLE MODES (Tier 4)
  // ──────────────────────────────────────────────────────────
  {
    id: 'experimental', label: 'Experimental Modes', icon: '\uD83E\uDDEA',
    systems: [
      {
        toggleKey: 'enable_deck_building', label: 'Deck-Building Combat',
        desc: 'Slay the Spire style. Instead of fixed skills, draw abilities from a deck each turn. Build your deck between battles. Hand size and draw rate configurable.',
        childKeys: ['deck_hand_size', 'deck_draw_per_turn'],
      },
      {
        toggleKey: 'enable_simultaneous_turns', label: 'Simultaneous Turns',
        desc: 'Frozen Synapse style. Both sides plan their actions secretly, then all actions resolve at once. Creates mind-game PvP.',
      },
      {
        toggleKey: 'enable_realtime_pause', label: 'Real-Time with Pause',
        desc: 'Baldur\'s Gate / Pillars of Eternity style. Combat runs in real-time but players can pause to issue commands.',
      },
      {
        toggleKey: 'enable_combat_crafting', label: 'Combat Crafting',
        desc: 'Monster Hunter style. Craft items mid-battle using materials in your inventory. Combine potions, make ammo, forge traps.',
      },
      {
        toggleKey: 'enable_siege_mode', label: 'Siege Warfare',
        desc: 'Attack and defend structures. Battering rams vs castle walls. Towers provide ranged advantage. Structural HP and defensive bonuses.',
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // GAMEPLAY SYSTEMS — Non-combat features
  // ──────────────────────────────────────────────────────────
  {
    id: 'gameplay', label: 'Gameplay Systems', icon: '\uD83C\uDFAE',
    systems: [
      {
        toggleKey: 'enable_gathering_skills', label: 'Gathering Skills',
        desc: 'Mining, fishing, woodcutting, herbalism — non-combat skill progression. Players interact with gathering nodes placed on maps to collect resources and level up skills.',
        entityKeys: ['gathering_skills', 'gathering_nodes'],
      },
      {
        toggleKey: 'enable_bank', label: 'Bank / Vault',
        desc: 'Item storage beyond inventory. Players deposit and withdraw items at bank NPCs or housing chests. Configurable slot count per character.',
        childKeys: ['bank_default_slots', 'bank_default_tabs'],
      },
      {
        toggleKey: 'enable_creature_capture', label: 'Creature Capture',
        desc: 'Pokemon-style taming. Players use capture items on weakened enemies to tame them as companions. Captured creatures can join the party and fight in battles.',
        childKeys: ['creature_party_max', 'creature_storage_max', 'capture_base_rate'],
        entityKeys: ['capture_items'],
      },
      {
        toggleKey: 'enable_seasons', label: 'Seasons',
        desc: 'Spring/summer/fall/winter cycle per world. Seasons affect weather, gathering yields, spawn rates, and shop prices. Configurable season length.',
        entityKeys: ['season_effects'],
      },
      {
        toggleKey: 'enable_bounty_boards', label: 'Bounty Boards',
        desc: 'Repeatable kill contracts from bounty boards. Target specific enemies, earn XP/gold/items. Daily and weekly task variants.',
        entityKeys: ['bounty_boards', 'bounty_tasks'],
      },
      {
        toggleKey: 'enable_treasure_trails', label: 'Treasure Hunts',
        desc: 'Multi-step clue scrolls that lead players across maps. Riddles, coordinates, NPC clues. Tiered loot rewards (easy through master).',
        entityKeys: ['treasure_trails'],
      },
      {
        toggleKey: 'enable_mounts', label: 'Mounts',
        desc: 'Rideable creatures or vehicles for faster overworld travel. Speed multiplier, auto-dismount on battle. Obtainable via quests, purchase, or taming.',
        childKeys: ['mount_dismount_on_battle'],
        entityKeys: ['mounts'],
      },
      {
        toggleKey: 'enable_player_housing', label: 'Player Housing',
        desc: 'Players purchase plots on designated housing maps. Place furniture, storage chests, crafting stations. Visitors can tour other homes.',
        childKeys: ['housing_max_furniture'],
        entityKeys: ['housing_plots', 'furniture'],
      },
      {
        toggleKey: 'enable_ap_distribution', label: 'Attribute Point Distribution',
        desc: 'Players manually distribute attribute points when they level up. AP per level is configurable. HP/MP get 5x multiplier per point, other stats 1:1.',
        childKeys: ['ap_per_level'],
      },
      {
        toggleKey: 'enable_key_locks', label: 'Key & Lock Puzzles',
        desc: 'Key items that unlock doors and passages. Use the event script editor to require specific items before allowing passage. Essential for dungeon progression.',
      },
      {
        toggleKey: 'enable_inns', label: 'Inn / Rest System',
        desc: 'Rest at inns to fully restore HP/MP for a gold cost. Resets status effects and battle chain. Configurable cost per inn.',
        childKeys: ['inn_default_cost'],
        entityKeys: ['inns'],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // SOCIAL & ALIGNMENT — Morality and reputation
  // ──────────────────────────────────────────────────────────
  {
    id: 'social', label: 'Social & Alignment', icon: '\u2696\uFE0F',
    systems: [
      {
        toggleKey: 'enable_battle_chat', label: 'Battle Chat',
        desc: 'In-battle messaging. Toggle general chat, team-only chat, and DM whispers during combat. Useful for RP-heavy servers.',
        childKeys: ['enable_battle_team_chat', 'enable_battle_dm'],
      },
      {
        toggleKey: 'enable_referees', label: 'Battle Referees',
        desc: 'A designated player or NPC can moderate a battle — pause, override rules, call fouls. Useful for RP-judged tournaments.',
        childKeys: ['enable_ai_referee'],
      },
      {
        toggleKey: 'enable_alignment_system', label: 'Moral Alignment',
        desc: 'KOTOR-style good/evil scale that shifts based on player choices. Alignment can gate abilities, affect dialogue, change shop prices, and modify certain stat bonuses.',
        childKeys: ['alignment_affects_stats', 'alignment_affects_skills', 'alignment_affects_shops'],
        entityKeys: ['alignment_tiers', 'alignment_actions'],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────
  // META SYSTEMS — Outer-loop and world-level features
  // ──────────────────────────────────────────────────────────
  {
    id: 'meta', label: 'Meta Systems', icon: '\uD83C\uDF0D',
    systems: [
      {
        toggleKey: 'enable_afterlife', label: 'Death & Afterlife',
        desc: 'Dying sends characters to an otherworld (Tir na nOg, Shadow Realm, etc.) for a set duration before respawn. Each afterlife world has unique rules and encounters.',
        entityKeys: ['afterlife_worlds'],
      },
      {
        toggleKey: 'enable_tournaments', label: 'Tournament System',
        desc: 'Scheduled competitive PvP events with brackets, seeding, entry fees, and prize pools. Supports single and double elimination formats.',
        entityKeys: ['tournaments'],
      },
      {
        toggleKey: 'enable_offline_players', label: 'Persistent Characters',
        desc: 'Logged-out players remain on the map as sleeping characters. They can be guarded, robbed, or (if PvP is on) attacked while offline. Creates a living world.',
      },
      {
        toggleKey: 'enable_training_system', label: 'Training & Masters',
        desc: 'Self-training solo, sparring with partners for style XP, and NPC master mentorship for technique unlocks. Daily limits prevent grinding while rewarding consistency.',
        entityKeys: ['training_config', 'masters'],
      },
    ],
  },
]

// Non-toggle global tuning — always visible
const GLOBAL_KEYS = [
  { key: 'grid_width', label: 'Grid Width (tiles)', desc: 'Battle arena width. Default 8. Larger = more tactical movement, slower pacing.' },
  { key: 'grid_height', label: 'Grid Height (tiles)', desc: 'Battle arena height. Default 5. Larger grids need more combatants to feel active.' },
  { key: 'ai_difficulty', label: 'AI Difficulty', desc: 'How smart and aggressive AI opponents play. Higher settings use smarter targeting and ability combos.' },
  { key: 'initiative_type', label: 'Turn Order System', desc: 'How turn order works. Speed: sorted by stat. Roll: d20+speed. ATB: real-time bars fill by speed (FF4-9). CTB: timeline where speed = turn frequency (FFX). Phased: all players then enemies.' },
  { key: 'atb_wait_mode', label: 'ATB Wait Mode', desc: 'When ON, ATB bars pause while a player has the menu open. When OFF (Active Mode), bars keep filling during menu selection.' },
  { key: 'atb_speed_factor', label: 'ATB Speed Factor', desc: 'How fast ATB bars fill. Higher = faster combat. Each tick fills (speed x factor) points toward 1000.' },
  { key: 'atb_tick_rate', label: 'ATB Tick Rate (ms)', desc: 'Milliseconds between ATB gauge ticks. 500 = twice per second. Lower = smoother but more CPU.' },
  { key: 'ctb_base_recovery', label: 'CTB Base Recovery', desc: 'Base ticks to wait between turns. Divided by (speed / divisor). Higher = slower combat.' },
  { key: 'ctb_speed_divisor', label: 'CTB Speed Divisor', desc: 'Divides speed stat for CTB calculations. Higher = speed stat matters less.' },
  { key: 'ctb_timeline_length', label: 'CTB Timeline Length', desc: 'How many future turns to predict in the timeline display.' },
  { key: 'enemy_scaling_factor', label: 'Enemy Scaling Factor', desc: 'How much enemies scale per additional party member. 0.3 = each extra player adds 30% to enemy stats.' },
  { key: 'ki_ranged_dodge_bonus', label: 'Ranged / Magic Dodge Bonus', desc: 'Extra dodge chance against ranged and magical attacks compared to melee. Compensates for lack of melee counterplay.' },
  { key: 'base_crit_chance', label: 'Base Crit Chance', desc: 'Added to luck stat for crit roll. Default 5 = 5% base before luck. Target crit resistance subtracts from this.' },
  { key: 'crit_damage_multiplier', label: 'Crit Damage Multiplier', desc: 'Damage multiplier on critical hit. 1.5 = 150% damage, 2.0 = double damage.' },
  { key: 'damage_cap', label: 'Damage Cap (per hit)', desc: 'Maximum damage any single hit can deal. 0 = no cap. Useful to prevent one-shot kills in PvP.' },
  { key: 'max_team_size', label: 'Max Team Size', desc: 'Maximum number of fighters per team in battle. Default 4.' },
  { key: 'min_team_size', label: 'Min Team Size', desc: 'Minimum fighters required to start a battle. Default 1.' },
  { key: 'allow_uneven_teams', label: 'Allow Uneven Teams', desc: 'Allow battles where one side has more fighters than the other. Useful for boss fights and asymmetric PvP.' },
  { key: 'auto_scale_grid', label: 'Auto-Scale Grid', desc: 'Automatically adjust grid dimensions based on the number of combatants. Prevents empty grids in small fights.' },
  { key: 'max_characters_per_account', label: 'Max Characters Per Account', desc: 'How many characters a single user account can create. Default 3.' },
  { key: 'character_creator_mode', label: 'Character Creator Mode', desc: 'Controls character creation flow. "standard" = class+race, "point_buy" = ability score point buy, "random" = random roll.' },
]

// Entity table display config
const ENTITY_DISPLAY: Record<string, { label: string; columns: string[]; editSection?: string }> = {
  terrain_interactions:{ label: 'Terrain Interactions', columns: ['terrain_a','element_or_terrain_b','result_terrain','description'], editSection: 'terrain_interactions' },
  formation_shapes:    { label: 'Formation Shapes',    columns: ['icon','name','label','shape_type','min_members'],                 editSection: 'formation_shapes' },
  battle_terrain:      { label: 'Terrain Types',       columns: ['icon','name','movement_cost_mult','description'],                editSection: 'battle_terrain' },
  battle_items:        { label: 'Battle Items',        columns: ['icon','name','uses_per_battle','cooldown_turns','description'],   editSection: 'battle_items' },
  battle_conditions:   { label: 'Battle Conditions',   columns: ['icon','name','condition_type','description'],                     editSection: 'battle_conditions' },
  body_types:          { label: 'Body Types',          columns: ['icon','name','label'],                                            editSection: 'body_types' },
  limb_zones:          { label: 'Limb Zones',          columns: ['icon','label','zone_key','hp_pct'],                               editSection: 'limb_zones' },
  bleed_tiers:         { label: 'Bleed Tiers',         columns: ['icon','name','label','duration_turns','damage_pct'],              editSection: 'bleed_tiers' },
  fighting_styles:     { label: 'Fighting Styles',     columns: ['icon','name','label','style_type'],                               editSection: 'fighting_styles' },
  style_ranks:         { label: 'Style Ranks',         columns: ['style_id','rank_num','label','wins_required'],                    editSection: 'style_ranks' },
  weather_effects:     { label: 'Weather Effects',     columns: ['icon','name','label','visibility'],                               editSection: 'weather' },
  elemental_reactions: { label: 'Elemental Reactions',  columns: ['icon','element_a','element_b','reaction_name','damage_bonus'],   editSection: 'elem_reaction' },
  status_combos:       { label: 'Status Combos',       columns: ['icon','status_a','status_b','combo_name','effect_type'],          editSection: 'status_combo' },
  alignment_tiers:     { label: 'Alignment Tiers',     columns: ['icon','name','label','min_value','max_value','color'],            editSection: 'alignment_tier' },
  alignment_actions:   { label: 'Alignment Actions',   columns: ['action_key','label','shift_amount'],                              editSection: 'alignment_action' },
  battle_rules:        { label: 'Battle Rules',        columns: ['name','trigger_event','target_filter','enabled','priority'],      editSection: 'battle_rule' },
  win_conditions:      { label: 'Win Conditions',      columns: ['icon','name','condition_type','description'],                     editSection: 'win_condition' },
  afterlife_worlds:    { label: 'Afterlife Worlds',    columns: ['icon','name','label','type','stay_duration_days'],                editSection: 'afterlife' },
  transformations:     { label: 'Transformations',     columns: ['icon','name','trigger_type','duration','level_required'],         editSection: 'transformation' },
  traps:               { label: 'Traps',               columns: ['icon','name','trigger_type','damage_formula'],                    editSection: 'trap' },
  narrations:          { label: 'Battle Narrations',   columns: ['action_type','weapon_type','element','preview'],                  editSection: 'narration' },
  training_config:     { label: 'Training Types',      columns: ['name','label','training_type','daily_limit'],                     editSection: 'training_config' },
  sig_levels:          { label: 'Sig Tech Levels',     columns: ['level','damage_pct','cost_pct','ability_slots','xp_required'],   editSection: 'sig_levels' },
  sig_abilities:       { label: 'Sig Tech Abilities',  columns: ['icon','label','category','min_level'],                            editSection: 'sig_abilities' },
  flavor_texts:        { label: 'Flavor Texts',        columns: ['category','preview','bonus_pct'],                                 editSection: 'flavor_texts' },
  flavor_keywords:     { label: 'Flavor Keywords',     columns: ['keyword','bonus_pct','category','terrain_match'],                 editSection: 'flavor_keywords' },
  masters:             { label: 'NPC Masters',         columns: ['name','icon','training_gain_pct'],                                editSection: 'npcs' },
  tournaments:         { label: 'Recent Tournaments',  columns: ['name','status','type','max_participants'],                        editSection: 'tournaments' },
  // Minigames
  cards:               { label: 'Cards',               columns: ['icon','name','rarity','element','value_top','value_right','value_bottom','value_left'], editSection: 'cards' },
  card_rules:          { label: 'Card Rules',           columns: ['name','rule_type','is_active'],                                       editSection: 'card_rules' },
  dice_tables:         { label: 'Dice Tables',          columns: ['name','is_active'],                                                   editSection: 'dice_tables' },
  fishing_spots:       { label: 'Fishing Spots',        columns: ['name','map_id','min_level','is_active'],                              editSection: 'fishing_spots' },
  puzzles:             { label: 'Puzzles',              columns: ['name','puzzle_type','difficulty','is_active'],                         editSection: 'puzzles' },
  // Gameplay content
  gathering_skills:    { label: 'Gathering Skills',     columns: ['icon','name','max_level','is_active'],                                editSection: 'gathering_skills' },
  gathering_nodes:     { label: 'Gathering Nodes',      columns: ['icon','name','skill_id','map_id','min_level'],                        editSection: 'gathering_nodes' },
  capture_items:       { label: 'Capture Items',        columns: ['icon','name','catch_rate_bonus','is_active'],                         editSection: 'capture_items' },
  bounty_boards:       { label: 'Bounty Boards',        columns: ['name','map_id','max_active','is_active'],                             editSection: 'bounty_boards' },
  bounty_tasks:        { label: 'Bounty Tasks',         columns: ['name','board_id','kill_count','reward_xp','is_active'],               editSection: 'bounty_tasks' },
  treasure_trails:     { label: 'Treasure Trails',      columns: ['name','tier','is_active'],                                            editSection: 'treasure_trails' },
  mounts:              { label: 'Mounts',               columns: ['icon','name','speed_mult','obtain_type','is_active'],                 editSection: 'mounts' },
  housing_plots:       { label: 'Housing Plots',        columns: ['plot_name','map_id','price','is_available'],                          editSection: 'housing_plots' },
  furniture:           { label: 'Furniture',             columns: ['icon','name','type','price','is_active'],                             editSection: 'furniture' },
  season_effects:      { label: 'Season Effects',       columns: ['season','world_id','gathering_mult','spawn_rate_mult','is_active'],   editSection: 'season_effects' },
  inns:                { label: 'Inns',                  columns: ['name','map_id','price_per_rest','is_active'],                         editSection: 'inns' },
  boss_phases:         { label: 'Boss Phases',          columns: ['npc_id','phase_number','trigger_type','trigger_value','name'],        editSection: 'boss_phases' },
  link_attacks:        { label: 'Link Attacks',          columns: ['icon','name','element','min_affinity','cooldown_turns'],              editSection: 'link_attacks' },
}

// ─── Main Component ──────────────────────────────────────────────
// Formula settings — power users can edit these (stored as system_settings)
const FORMULA_SETTINGS: Record<string, { key: string; label: string; desc: string; defaultFormula: string; vars: string }> = {
  damage_physical: { key: 'formula_damage_physical', label: 'Physical Damage', desc: 'Base damage formula for physical attacks.', defaultFormula: 'ATK*2-DEF', vars: 'ATK, DEF, MO, MD, SPEED, LUCK, LEVEL, HP, MAXHP, ENEMY_DEF, RANDOM' },
  damage_magic: { key: 'formula_damage_magic', label: 'Magic Damage', desc: 'Base damage formula for magic attacks.', defaultFormula: 'MO*2-MD', vars: 'ATK, DEF, MO, MD, SPEED, LUCK, LEVEL, HP, MAXHP, ENEMY_MD, RANDOM' },
  armor_reduction: { key: 'formula_armor_reduction', label: 'Armor Reduction', desc: 'How armor reduces damage. Result is a multiplier (0-1).', defaultFormula: '100/(100+ARMOR)', vars: 'ARMOR, PENETRATION, LEVEL' },
  crit_chance: { key: 'formula_crit_chance', label: 'Crit Chance', desc: 'Critical hit probability formula. Result is a percentage.', defaultFormula: 'LUCK+BASE_CRIT-CRIT_RESIST', vars: 'LUCK, BASE_CRIT, CRIT_RESIST, LEVEL, WEATHER_CRIT' },
  dodge_chance: { key: 'formula_dodge_chance', label: 'Dodge Chance', desc: 'Dodge probability formula.', defaultFormula: 'BASE+SPEED_RATIO*FACTOR', vars: 'BASE, SPEED_RATIO, FACTOR, MAX, KI_BONUS' },
  move_range: { key: 'formula_move_range', label: 'Move Range', desc: 'How many tiles a combatant can move.', defaultFormula: 'MAX(2,FLOOR(SPEED/30))', vars: 'SPEED, WOUND_MOD' },
  steal_chance: { key: 'formula_steal_chance', label: 'Steal Chance', desc: 'Probability of a successful steal action.', defaultFormula: 'BASE+LUCK*2+SPEED*0.5-TARGET_LVL*3', vars: 'BASE, LUCK, SPEED, TARGET_LVL' },
  morale_change: { key: 'formula_morale_change', label: 'Morale Delta', desc: 'How much morale changes on events.', defaultFormula: 'BASE_DELTA*PERSONALITY_MOD', vars: 'BASE_DELTA, PERSONALITY_MOD, HP_PCT, ALLY_COUNT' },
}

// ─── Navigation levels ──────────────────────────────────────────
// Level 0: Category grid (all 21 sections as cards)
// Level 1: System list (systems within a category)
// Level 2: System detail (toggle + child settings + entity tables)
type NavLevel = 'categories' | 'systems' | 'detail'

export function BattleConfigPanel() {
  const [allSettings, setAllSettings] = useState<Record<string, Setting>>({})
  const [entities, setEntities] = useState<Record<string, Record<string, unknown>[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [showPowerUser, setShowPowerUser] = useState(false)
  // Drill-down navigation state
  const [navLevel, setNavLevel] = useState<NavLevel>('categories')
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [activeSystemKey, setActiveSystemKey] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin-panel/battle-config`, { credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        const flat: Record<string, Setting> = {}
        for (const cat of Object.values(data.categories) as { settings: Setting[] }[]) {
          for (const s of cat.settings) flat[s.key] = s
        }
        setAllSettings(flat)
        setEntities(data.entities || {})
      }
    } catch (e) { console.error('Failed to load battle config:', e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const updateSetting = async (key: string, value: string) => {
    setSaving(key)
    try {
      await fetch(`${API}/admin-panel/battle-config`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      })
      setAllSettings(prev => ({ ...prev, [key]: { ...prev[key], value } }))
    } catch { toast({ title: 'Failed to save', variant: 'destructive' }) }
    setSaving(null)
  }

  const isOn = (key: string) => {
    const v = allSettings[key]?.value
    return v === 'true' || v === '1'
  }

  const toggleEntityExpand = (key: string) =>
    setExpandedEntities(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  const goToSection = (section: string) =>
    window.dispatchEvent(new CustomEvent('adminsauce-navigate', { detail: { section } }))


  // Navigation helpers
  const openSection = (sectionId: string) => { setActiveSectionId(sectionId); setActiveSystemKey(null); setNavLevel('systems') }
  const openSystem = (systemKey: string) => { setActiveSystemKey(systemKey); setNavLevel('detail') }
  const goBack = () => {
    if (navLevel === 'detail') { setActiveSystemKey(null); setNavLevel('systems') }
    else if (navLevel === 'systems') { setActiveSectionId(null); setNavLevel('categories') }
  }

  const activeSection = SECTIONS.find(s => s.id === activeSectionId)
  const activeSystem = activeSection?.systems.find(s => s.toggleKey === activeSystemKey)

  const totalEnabled = SECTIONS.reduce((sum, sec) => sum + sec.systems.filter(sys => isOn(sys.toggleKey)).length, 0)
  const totalSystems = SECTIONS.reduce((sum, sec) => sum + sec.systems.length, 0)

  // Search: flatten all systems for filtering
  const allSystems = SECTIONS.flatMap(sec => sec.systems.map(sys => ({ ...sys, sectionId: sec.id, sectionLabel: sec.label, sectionIcon: sec.icon })))
  const searchResults = searchQuery.trim().length >= 2
    ? allSystems.filter(sys => sys.label.toLowerCase().includes(searchQuery.toLowerCase()) || sys.desc.toLowerCase().includes(searchQuery.toLowerCase()))
    : []

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading battle configuration...</div>

  return (
    <div className="space-y-4">
      {/* ─── Header with breadcrumb + search ──────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {navLevel !== 'categories' && (
            <button onClick={goBack} className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-sm">
              <button onClick={() => { setNavLevel('categories'); setActiveSectionId(null); setActiveSystemKey(null) }}
                className={cn("font-bold", navLevel === 'categories' ? "text-foreground" : "text-muted-foreground hover:text-foreground cursor-pointer")}>
                Battle Systems
              </button>
              {activeSection && (
                <>
                  <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
                  <button onClick={() => { setNavLevel('systems'); setActiveSystemKey(null) }}
                    className={cn("font-semibold", navLevel === 'systems' ? "text-foreground" : "text-muted-foreground hover:text-foreground cursor-pointer")}>
                    {activeSection.icon} {activeSection.label}
                  </button>
                </>
              )}
              {activeSystem && (
                <>
                  <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
                  <span className="font-semibold text-foreground">{activeSystem.label}</span>
                </>
              )}
            </div>
            {navLevel === 'categories' && (
              <p className="text-xs text-muted-foreground mt-0.5">{totalEnabled}/{totalSystems} systems active</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPowerUser(!showPowerUser)}
            className={cn(
              "text-[10px] px-2 py-1 rounded border transition-colors",
              showPowerUser
                ? "bg-[oklch(0.50_0.20_280)]/20 border-[oklch(0.50_0.20_280)]/40 text-[oklch(0.70_0.15_280)]"
                : "border-border/30 text-muted-foreground hover:text-foreground"
            )}
          >
            {showPowerUser ? '</> Code ON' : '</> Code'}
          </button>
        </div>
      </div>

      {/* ─── Search bar (categories level only) ───────────────── */}
      {navLevel === 'categories' && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search systems... (e.g. morale, dodge, summon)"
            className="h-8 pl-8 text-xs"
          />
        </div>
      )}

      {/* ─── Search Results ───────────────────────────────────── */}
      {searchQuery.trim().length >= 2 && navLevel === 'categories' && (
        <Card className="celtic-border overflow-hidden">
          <CardContent className="px-3 py-2 space-y-0.5">
            {searchResults.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">No systems match "{searchQuery}"</p>
            )}
            {searchResults.map(sys => (
              <button key={sys.toggleKey}
                onClick={() => { setActiveSectionId(sys.sectionId); setActiveSystemKey(sys.toggleKey); setNavLevel('detail'); setSearchQuery('') }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors flex items-center gap-3"
              >
                <span className="text-sm">{sys.sectionIcon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{sys.label}</span>
                    <span className={cn("w-1.5 h-1.5 rounded-full", isOn(sys.toggleKey) ? "bg-primary" : "bg-muted-foreground/30")} />
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{sys.sectionLabel}</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ─── Level 0: Category Cards ─────────────────────────── */}
      {navLevel === 'categories' && !searchQuery.trim() && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {SECTIONS.map(section => {
            const sectionEnabled = section.systems.filter(sys => isOn(sys.toggleKey)).length
            const allOn = sectionEnabled === section.systems.length
            const noneOn = sectionEnabled === 0

            return (
              <button key={section.id}
                onClick={() => openSection(section.id)}
                className={cn(
                  "celtic-border rounded-xl p-4 text-left transition-all hover:scale-[1.02] hover:shadow-lg",
                  "border bg-card hover:bg-muted/20",
                  allOn && "border-primary/30",
                  noneOn && "opacity-70"
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-2xl">{section.icon}</span>
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium",
                    allOn ? "bg-primary/20 text-primary" :
                    noneOn ? "bg-muted text-muted-foreground" :
                    "bg-[oklch(0.65_0.15_85)]/20 text-[oklch(0.65_0.15_85)]"
                  )}>
                    {sectionEnabled}/{section.systems.length}
                  </span>
                </div>
                <h3 className="font-semibold text-sm mb-1">{section.label}</h3>
                <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
                  {section.systems.map(s => s.label).join(' \u00B7 ')}
                </p>
              </button>
            )
          })}

          {/* Global Tuning card */}
          <button
            onClick={() => { setActiveSectionId('_global'); setNavLevel('systems') }}
            className="celtic-border rounded-xl p-4 text-left transition-all hover:scale-[1.02] hover:shadow-lg border bg-card hover:bg-muted/20"
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-2xl">{'\u2699\uFE0F'}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
                {GLOBAL_KEYS.length}
              </span>
            </div>
            <h3 className="font-semibold text-sm mb-1">Global Tuning</h3>
            <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
              Grid size, AI difficulty, initiative type, crit chance, damage cap, ATB/CTB tuning
            </p>
          </button>
        </div>
      )}

      {/* ─── Level 1: System List within Category ────────────── */}
      {navLevel === 'systems' && activeSectionId === '_global' && (
        <Card className="celtic-border overflow-hidden">
          <CardContent className="px-4 pb-4 pt-4 space-y-2">
            {GLOBAL_KEYS.map(g => {
              const s = allSettings[g.key]
              if (!s) return null
              return <ChildSettingRow key={g.key} setting={{ ...s, label: g.label, desc: g.desc }} saving={saving} onUpdate={updateSetting} />
            })}
          </CardContent>
        </Card>
      )}

      {navLevel === 'systems' && activeSection && (
        <div className="space-y-2">
          {activeSection.systems.map(sys => {
            const enabled = isOn(sys.toggleKey)
            const childCount = (sys.childKeys?.length || 0) + (sys.entityKeys?.length || 0)

            return (
              <Card key={sys.toggleKey} className={cn(
                "celtic-border overflow-hidden transition-colors",
                enabled ? "border-primary/20" : "border-border/30"
              )}>
                <div className="flex items-start gap-3 px-4 py-3">
                  {/* Toggle */}
                  <button
                    onClick={() => updateSetting(sys.toggleKey, enabled ? 'false' : 'true')}
                    className={cn("w-11 h-5 rounded-full transition-colors relative shrink-0 mt-0.5",
                      enabled ? "bg-primary" : "bg-muted"
                    )}
                    disabled={saving === sys.toggleKey}
                  >
                    <div className={cn("w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform",
                      enabled ? "translate-x-6" : "translate-x-0.5"
                    )} />
                  </button>

                  {/* Label + description */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm font-medium", !enabled && "text-muted-foreground")}>{sys.label}</span>
                      {saving === sys.toggleKey && <span className="text-[9px] text-primary animate-pulse">saving...</span>}
                      {childCount > 0 && (
                        <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {childCount} setting{childCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className={cn("text-[11px] leading-relaxed mt-0.5",
                      enabled ? "text-muted-foreground" : "text-muted-foreground/60"
                    )}>{sys.desc}</p>
                  </div>

                  {/* Drill into detail */}
                  {(enabled && childCount > 0) && (
                    <button
                      onClick={() => openSystem(sys.toggleKey)}
                      className="shrink-0 mt-0.5 p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                      title="Configure settings"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── Level 2: System Detail ──────────────────────────── */}
      {navLevel === 'detail' && activeSystem && (
        <div className="space-y-4">
          {/* System toggle + description */}
          <Card className={cn("celtic-border overflow-hidden", isOn(activeSystem.toggleKey) ? "border-primary/20" : "border-border/30")}>
            <div className="flex items-start gap-3 px-4 py-4">
              <button
                onClick={() => updateSetting(activeSystem.toggleKey, isOn(activeSystem.toggleKey) ? 'false' : 'true')}
                className={cn("w-11 h-5 rounded-full transition-colors relative shrink-0 mt-0.5",
                  isOn(activeSystem.toggleKey) ? "bg-primary" : "bg-muted"
                )}
                disabled={saving === activeSystem.toggleKey}
              >
                <div className={cn("w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform",
                  isOn(activeSystem.toggleKey) ? "translate-x-6" : "translate-x-0.5"
                )} />
              </button>
              <div>
                <h3 className="text-base font-semibold">{activeSystem.label}</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{activeSystem.desc}</p>
              </div>
            </div>
          </Card>

          {/* Child Settings */}
          {isOn(activeSystem.toggleKey) && activeSystem.childKeys && activeSystem.childKeys.length > 0 && (
            <Card className="celtic-border overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/20">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Settings</span>
              </div>
              <CardContent className="px-4 pb-4 pt-3 space-y-2">
                {activeSystem.childKeys.map(ck => {
                  const s = allSettings[ck]
                  if (!s) return null
                  return <ChildSettingRow key={ck} setting={s} saving={saving} onUpdate={updateSetting} />
                })}
              </CardContent>
            </Card>
          )}

          {/* Entity Tables */}
          {isOn(activeSystem.toggleKey) && activeSystem.entityKeys && activeSystem.entityKeys.length > 0 && (
            <Card className="celtic-border overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/20">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Data Tables</span>
              </div>
              <CardContent className="px-4 pb-4 pt-3 space-y-3">
                {activeSystem.entityKeys.map(ek => {
                  const display = ENTITY_DISPLAY[ek]
                  if (!display) return null
                  const items = entities[ek] || []
                  const isOpen = expandedEntities.has(ek)

                  return (
                    <div key={ek} className="rounded-lg border border-border/20 overflow-hidden">
                      <button
                        onClick={() => toggleEntityExpand(ek)}
                        className="w-full px-3 py-2 flex items-center justify-between text-xs hover:bg-muted/20"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{display.label}</span>
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{items.length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {display.editSection && (
                            <button
                              onClick={e => { e.stopPropagation(); goToSection(display.editSection!) }}
                              className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                            >
                              Edit <ExternalLink className="w-2.5 h-2.5" />
                            </button>
                          )}
                          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </div>
                      </button>

                      {isOpen && items.length > 0 && (
                        <div className="px-3 pb-2.5">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="text-muted-foreground/60 border-b border-border/20">
                                {display.columns.map(col => (
                                  <th key={col} className="text-left py-1 px-1 font-normal">{col.replace(/_/g, ' ')}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {items.slice(0, 12).map((item: Record<string, unknown>, i: number) => (
                                <tr key={i} className="border-b border-border/10 hover:bg-muted/10">
                                  {display.columns.map(col => (
                                    <td key={col} className="py-1 px-1 truncate max-w-[140px]">
                                      {col.includes('pct') || col.includes('bonus')
                                        ? (typeof item[col] === 'number' ? `${Math.round(Number(item[col]) * 100)}%` : String(item[col] ?? '-'))
                                        : String(item[col] ?? '-')
                                      }
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {items.length > 12 && (
                            <p className="text-[10px] text-muted-foreground/50 mt-1">
                              ...and {items.length - 12} more.{' '}
                              {display.editSection && (
                                <button onClick={() => goToSection(display.editSection!)} className="text-primary hover:underline">View all</button>
                              )}
                            </p>
                          )}
                        </div>
                      )}

                      {isOpen && items.length === 0 && (
                        <div className="px-3 pb-2.5 text-[11px] text-muted-foreground/50 italic">
                          No entries yet.
                          {display.editSection && (
                            <button onClick={() => goToSection(display.editSection!)} className="text-primary hover:underline ml-1">Create one</button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ─── Formula Editor (always available via toggle) ─────── */}
      {showPowerUser && (
        <Card className="celtic-border overflow-hidden border-[oklch(0.50_0.20_280)]/30">
          <div className="px-4 py-3 flex items-center gap-3 border-b border-[oklch(0.50_0.20_280)]/20">
            <span className="text-lg">{'\u{1F4BB}'}</span>
            <span className="font-semibold">Formula Editor</span>
            <span className="text-[10px] text-[oklch(0.70_0.15_280)]">Custom formulas override default calculations</span>
          </div>
          <CardContent className="px-4 pb-4 pt-3 space-y-3">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Override how damage, armor, crits, dodge, and movement are calculated. Leave blank to use the engine default.
              Formulas use the same syntax as skill damage formulas (e.g. <code className="text-[oklch(0.70_0.15_280)] bg-muted px-1 rounded">ATK*2-DEF</code>).
            </p>
            {Object.entries(FORMULA_SETTINGS).map(([id, f]) => {
              const currentVal = allSettings[f.key]?.value || ''
              return (
                <div key={id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{f.label}</span>
                    <span className="text-[9px] text-muted-foreground">default: <code className="text-[oklch(0.70_0.15_280)]">{f.defaultFormula}</code></span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={currentVal}
                      onChange={e => updateSetting(f.key, e.target.value)}
                      placeholder={f.defaultFormula}
                      className="h-7 text-xs font-mono flex-1 bg-[oklch(0.15_0.02_280)] border-[oklch(0.30_0.10_280)]"
                    />
                    {currentVal && (
                      <button onClick={() => updateSetting(f.key, '')} className="text-[9px] text-muted-foreground hover:text-destructive px-1">reset</button>
                    )}
                  </div>
                  <p className="text-[9px] text-muted-foreground/60">{f.desc} Vars: {f.vars}</p>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Child Setting Row ───────────────────────────────────────────
function ChildSettingRow({ setting, saving, onUpdate }: {
  setting: Setting; saving: string | null
  onUpdate: (key: string, value: string) => void
}) {
  const isToggle = setting.type === 'toggle'
  const isOn = setting.value === 'true' || setting.value === '1'
  const isSaving = saving === setting.key

  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-24 shrink-0">
        {isToggle ? (
          <button
            onClick={() => onUpdate(setting.key, isOn ? 'false' : 'true')}
            className={cn("w-9 h-[18px] rounded-full transition-colors relative", isOn ? "bg-primary" : "bg-muted")}
            disabled={!!isSaving}
          >
            <div className={cn("w-3.5 h-3.5 rounded-full bg-white absolute top-[1px] transition-transform",
              isOn ? "translate-x-[18px]" : "translate-x-0.5"
            )} />
          </button>
        ) : setting.type === 'select' ? (
          <select value={setting.value || ''} onChange={e => onUpdate(setting.key, e.target.value)}
            className="w-full h-6 text-[11px] bg-input border border-border rounded px-1">
            {(setting.options || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <Input type="number" value={setting.value || ''} onChange={e => onUpdate(setting.key, e.target.value)}
            className="h-6 text-[11px] w-full" step={setting.type === 'percent' ? '0.01' : '1'} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium">{setting.label}</span>
          {!isToggle && setting.type === 'percent' && setting.value && (
            <span className="text-[9px] text-muted-foreground">({Math.round(parseFloat(setting.value) * 100)}%)</span>
          )}
          {isSaving && <span className="text-[9px] text-primary animate-pulse">...</span>}
        </div>
        {setting.desc && <p className="text-[10px] text-muted-foreground/60 leading-tight">{setting.desc}</p>}
      </div>
    </div>
  )
}
