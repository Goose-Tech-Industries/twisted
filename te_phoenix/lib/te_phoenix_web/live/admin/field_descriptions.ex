defmodule TePhoenixWeb.Admin.FieldDescriptions do
  @moduledoc """
  Human-readable descriptions for every field in AdminSauce.

  Every form field gets a sub-text tooltip explaining what it does,
  what values are valid, and why you'd change it. Written for someone
  who has never built a game before.
  """

  @descriptions %{
    # ── Character & Combat ──────────────────────────────────
    "name" => "Display name shown to players in-game.",
    "description" => "Longer text explaining what this is. Players may see this in tooltips or info screens.",
    "descript" => "Longer text explaining what this is. Players may see this in tooltips or info screens.",
    "icon" => "Emoji or small image shown next to the name. Pick something that represents this visually.",
    "sprite" => "URL to the sprite image file. Used for rendering on the map and in battles.",
    "level" => "Character level. Higher = stronger. Affects stat scaling and what content they can access.",
    "hp" => "Hit Points — how much damage this can take before dying/breaking.",
    "max_hp" => "Maximum HP. Healing can't go above this number.",
    "mp" => "Magic/Mana Points — resource spent to use skills and spells.",
    "max_mp" => "Maximum MP. Using skills costs MP, and it regenerates over time or with items.",
    "atk" => "Attack power. Higher = more physical damage dealt.",
    "def" => "Defense. Higher = less physical damage taken.",
    "mo" => "Magic Offense. Higher = more magic damage dealt with spells.",
    "md" => "Magic Defense. Higher = less magic damage taken from spells.",
    "speed" => "How fast this character acts. Higher speed = acts earlier in turn order, dodges better.",
    "luck" => "Affects critical hit chance, loot quality, and tie-breaking in turn order.",
    "agil" => "Agility — affects dodge chance and movement speed on the map.",
    "xp" => "Experience points. Earn XP from battles and quests to level up.",
    "gold" => "Currency. Earned from battles, quests, and selling items. Spent at shops.",

    # ── Classes & Races ─────────────────────────────────────
    "class_id" => "Character class (Warrior, Mage, etc). Determines available skills and stat growth.",
    "race_id" => "Character race (Human, Elf, etc). Affects starting stats and which classes are available.",
    "stat_mode" => "How stats work: 'standard' (ATK/DEF/MO/MD/SPD/LCK), 'simplified' (just Power Level), or 'custom'.",
    "combat_mode" => "Battle style: 'turn_based' (take turns), 'atb' (speed-based gauge), 'ctb' (conditional turns), 'real_time'.",
    "movement_mode" => "How players move: 'grid' (tile-by-tile), 'free' (smooth movement), 'point_click'.",
    "is_active" => "Whether this is currently enabled and in use. Inactive items are hidden from players.",
    "is_enemy" => "Whether this NPC is hostile. Enemies can be fought in battles.",
    "is_boss" => "Whether this NPC is a boss with phase transitions. Bosses can have multiple forms.",

    # ── Skills & Abilities ──────────────────────────────────
    "mp_cost" => "How much MP this skill costs to use. 0 = free to use.",
    "cooldown_turns" => "Turns before this skill can be used again after casting. 0 = no cooldown.",
    "type" => "The category or damage type. Determines which defenses apply and element interactions.",
    "target_type" => "Who this skill can target: ENEMY (opponents), ALLY (teammates), SELF (caster only), ALL (everyone).",
    "target_pvp" => "Targeting rules in PvP battles. Same options as target_type but for player-vs-player.",
    "effects" => "What this does when used — damage formula, status effects applied, healing, buffs/debuffs.",
    "battle_text" => "Flavor text shown during battle when this is used. E.g. '{name} unleashes a devastating blow!'",
    "elements" => "Elemental types (fire, ice, lightning, etc). Deals bonus damage to weak targets, less to resistant ones.",
    "charge_turns" => "Turns spent charging before the skill fires. 0 = instant. During charging, the caster is vulnerable.",

    # ── Items & Equipment ───────────────────────────────────
    "buy_price" => "How much gold this costs at a shop. 0 = can't be bought.",
    "sell_price" => "How much gold players get when selling this. Usually 50% of buy price.",
    "rarity" => "How rare this item is: common (gray), uncommon (green), rare (blue), epic (purple), legendary (gold).",
    "slot_type" => "Which equipment slot this goes in: weapon, armor, helmet, accessory, shield, ring.",
    "bonus_atk" => "Extra ATK points gained when this item is equipped.",
    "bonus_def" => "Extra DEF points gained when this item is equipped.",
    "stackable" => "Whether multiple copies stack in one inventory slot (like potions) or take separate slots.",
    "consumable" => "Whether this item is used up when activated (potions, scrolls) or permanent (equipment).",

    # ── Campaigns & Sagas ───────────────────────────────────
    "max_players" => "Maximum number of players who can join this campaign at once.",
    "dm_user_id" => "User ID of the Dungeon Master running this campaign.",
    "ruleset_id" => "Which ruleset governs this campaign's rules (stat mode, combat style, etc).",
    "status" => "Current state: 'active' (running), 'paused', 'completed', 'draft' (not started yet).",
    "total_chapters" => "How many chapters this saga has. Each chapter is a story arc with its own encounters.",
    "villain_name" => "The main antagonist's name. Used in story generation and chapter titles.",
    "villain_description" => "Background and motivation for the villain. Helps AI generate better story content.",
    "scaling_mode" => "How difficulty adjusts: 'player_count' (more players = harder), 'fixed' (static), 'adaptive' (learns from wins/losses).",

    # ── Scheduler ───────────────────────────────────────────
    "task_type" => "What kind of task: 'spawn' (create NPCs), 'event' (trigger event), 'cleanup' (remove old data), 'broadcast' (send message).",
    "schedule_type" => "How often it runs: 'interval' (every N seconds), 'cron' (at specific times), 'once' (one-time).",
    "is_enabled" => "Whether this scheduled task is currently running. Turn off to pause without deleting.",
    "last_run_at" => "When this task last executed. Helps verify it's working.",
    "interval_seconds" => "How many seconds between each run. E.g. 60 = once per minute, 3600 = once per hour.",

    # ── Battles & Combat ────────────────────────────────────
    "damage_formula" => "Math formula for damage: e.g. 'ATK*2-DEF'. Variables: ATK, DEF, MO, MD, SPD, LCK, LVL, HP, MHP, MP.",
    "base_crit_chance" => "Percentage chance of a critical hit (double damage). Default: 5%.",
    "crit_damage_multiplier" => "How much extra damage crits deal. 1.5 = 50% bonus. 2.0 = double.",
    "enable_limb_targeting" => "Allow targeting specific body parts (head, arms, legs). Disabling simplifies combat.",
    "enable_active_defense" => "Allow dodge/block/counter choices. Disabling makes combat auto-resolve defenses.",
    "enable_cooldowns" => "Skills have per-turn cooldowns after use. Disabling lets skills be spammed every turn.",
    "enable_reactions" => "Auto-triggered responses (counter on hit, auto-heal at low HP). Adds tactical depth.",
    "enable_los" => "Line of sight — ranged attacks need clear path. Walls and objects block shots.",
    "enable_cover" => "Objects between attacker and target reduce ranged damage (25-50% reduction).",
    "enable_flanking" => "Attacking from behind or sides deals bonus damage (+15-25%).",
    "enable_rolling_hp" => "Cascading Vitality — damage ticks down gradually like a rolling meter instead of instant.",

    # ── Objectives ──────────────────────────────────────────
    "target_value" => "The goal number: kill count, HP amount, seconds to survive, items to collect, etc.",
    "progress_model" => "How progress is tracked: 'boolean' (done/not), 'counter' (0 to N), 'timer' (seconds), 'hp' (damage to destroy).",
    "team_owned" => "Whether this belongs to a specific team (like MOBA towers). Only enemies can damage team-owned objectives.",
    "respawn_seconds" => "Seconds before this reappears after being completed/destroyed. 0 = doesn't come back.",

    # ── Matches ─────────────────────────────────────────────
    "team_size" => "Players per team. E.g. 5 for a MOBA, 1 for a duel, 4 for co-op.",
    "team_count" => "Number of teams. 2 for most PvP, 1 for co-op, 20 for battle royale FFA.",
    "queue_type" => "Matchmaking type: 'casual' (anyone), 'ranked' (skill-based), 'custom' (private room).",
    "ready_check_seconds" => "Seconds players have to click Ready after a match is found. Decline = back to queue.",
    "match_time_limit_seconds" => "Max match duration in seconds. 0 = no time limit. Prevents infinite games.",
    "lobby_timeout_seconds" => "How long the lobby waits before auto-starting or dissolving.",
    "allow_spectators" => "Whether non-players can watch the match live.",

    # ── Waves ───────────────────────────────────────────────
    "loop" => "Whether the wave sequence restarts after the final wave. Used for endless modes (horde, MOBA lanes).",
    "delay_seconds" => "Seconds to wait before this wave starts spawning enemies.",
    "npc_template" => "The enemy type to spawn. Must match an NPC name or template key in your game.",
    "zone_key" => "Which spawn zone on the map to spawn enemies from. Set up zones in the Map Editor.",
    "interval_ms" => "Milliseconds between each enemy spawn within a wave. 1000 = one per second.",
    "boss" => "Whether this spawn is a boss enemy. Bosses are usually larger, stronger, and announced to players.",

    # ── Economy ─────────────────────────────────────────────
    "cost_mult_per_level" => "How much more expensive each building level is. 1.5 = 50% more per level.",
    "build_time_base_seconds" => "Base construction time in seconds for level 1. Higher levels take longer.",
    "food_upkeep" => "Food consumed per game tick by each unit of this type. More troops = more food needed.",
    "train_time_seconds" => "Seconds to train one unit. Training 5 takes 5× this long.",

    # ── Generic ─────────────────────────────────────────────
    "id" => "Unique ID. Auto-generated, don't change this.",
    "created_at" => "When this was first created. Auto-set.",
    "updated_at" => "When this was last modified. Auto-set.",
    "enabled" => "Whether this is active and available in the game. Disable to hide without deleting.",
    "priority" => "Order of execution. Higher numbers run first. Use this to control which rules take precedence.",
    "permanent" => "Whether this effect lasts forever (until manually removed) or expires after its duration.",
    "key" => "Unique identifier used in code and rules. Lowercase, no spaces. E.g. 'bleed_light', 'moba_tower'.",
    "weight" => "Relative probability. Higher weight = more likely to be chosen when randomly selecting.",
    "duration" => "How many turns/seconds this lasts. After expiring, the effect is automatically removed.",
    "default_duration" => "Starting duration in turns when this status is first applied.",
    "stacking" => "What happens if applied twice: 'refresh' (reset timer), 'stack' (add another), 'upgrade' (replace), 'ignore' (no effect).",
    "max_stacks" => "Maximum number of times this can stack on one target. Only matters if stacking = 'stack'.",
    "category" => "Grouping for organization: buff (positive), debuff (negative), dot (damage over time), hot (heal over time), control (prevents actions)."
  }

  @doc "Get the description for a field name. Returns nil if not found."
  def get(field_name) when is_binary(field_name) do
    Map.get(@descriptions, field_name)
  end

  def get(_), do: nil

  @doc "Get description with a fallback."
  def get(field_name, default) do
    Map.get(@descriptions, field_name, default)
  end
end
