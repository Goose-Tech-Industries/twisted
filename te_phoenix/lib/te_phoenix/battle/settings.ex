defmodule TePhoenix.Battle.Settings do
  @moduledoc """
  Battle settings — 300+ toggleable feature flags with DB override support.
  Ported from te/battle/settings.js
  """

  alias TePhoenix.Repo
  import Ecto.Query

  @defaults %{
    # Session 8: Limb targeting & active defense
    enable_limb_targeting: true,
    enable_active_defense: true,
    enable_nonlethal: true,
    enable_diminishing_returns: true,
    enable_wound_degradation: true,
    enable_called_shot_penalty: true,
    limb_bleed_through_default: 0.60,
    wound_threshold_light: 0.75,
    wound_threshold_heavy: 0.50,
    wound_threshold_disable: 0.00,

    # Dodge
    dodge_base_chance: 0.15,
    dodge_speed_factor: 0.35,
    dodge_max_chance: 0.90,

    # Block
    block_die_sides: 6,
    block_success_numbers: [1, 2],
    block_one_arm_reduction: 0.25,
    block_two_arm_reduction: 0.50,
    block_stun_die_sides: 12,

    # Counter
    counter_base_chance: 0.25,
    counter_charge_bonus: 0.25,
    counter_max_chance: 0.90,

    # Diminishing returns
    diminishing_returns_per_repeat: 0.05,
    diminishing_returns_max: 0.15,
    defense_prompt_timeout_ms: 10_000,

    # Called shots
    called_shot_penalty_head: 0.20,
    called_shot_penalty_arms: 0.10,
    called_shot_penalty_legs: 0.10,

    # Nonlethal
    nonlethal_rep_bonus_release: 5,
    nonlethal_rep_penalty_finish: -10,
    ko_interrogate_base_chance: 0.60,
    ki_ranged_dodge_bonus: 0.15,

    # Flavor text / RP
    enable_flavor_text: true,
    flavor_text_min_length: 20,
    flavor_text_max_bonus: 0.10,
    flavor_text_base_bonus: 0.05,
    flavor_text_keyword_bonus: 0.02,
    flavor_text_keyword_max: 3,
    enable_rp_descriptions: true,
    rp_desc_max_bonus: 0.15,
    rp_desc_short_bonus: 0.03,
    rp_desc_detailed_bonus: 0.08,
    rp_desc_context_bonus: 0.05,
    enable_battle_narration: true,
    enable_rp_commands: true,

    # Combo system
    enable_combo_procs: true,
    combo_chain_decay: 0.50,
    combo_crit_chance: 0.03,

    # Ki channeling
    enable_ki_channeling: true,
    ki_channel_duration: 5,
    ki_channel_crash_pct: 0.50,
    ki_channel_uses_per_battle: 1,

    # Bleed
    enable_bleed_tiers: true,
    bleed_max_stacks: 2,
    bleed_max_duration: 4,

    # Signature techs
    enable_signature_techs: true,
    sig_tech_require_unlock: false,
    sig_tech_discovery_threshold: 3,
    sig_tech_max_per_character: 5,

    # Systems toggles
    enable_fighting_styles: true,
    enable_boss_phases: true,
    enable_custom_win_conditions: true,
    enable_weather_effects: true,
    enable_stealth: true,
    stealth_surprise_bonus: 0.50,
    enable_link_attacks: true,
    enable_transformations: true,
    enable_revive: true,
    enable_traps: true,
    enable_spectator_mode: true,
    enable_elemental_reactions: true,
    enable_threat_system: true,
    threat_damage_multiplier: 1.0,
    threat_heal_multiplier: 0.50,
    enable_status_combos: true,
    enable_battle_equip_swap: true,
    ai_difficulty: "normal",
    initiative_type: "speed",
    enable_afterlife: true,
    enable_tournaments: true,
    enable_offline_players: true,
    enable_training_system: true,

    # Stagger / break
    enable_stagger_system: true,
    stagger_decay_per_turn: 10,
    stagger_base_increase: 5,
    enable_break_shield: true,
    break_stun_turns: 1,
    break_damage_bonus: 0.50,
    enable_one_more: true,
    enable_turn_manipulation: true,
    enable_party_swap: true,

    # Weapon triangle
    enable_weapon_triangle: true,
    enable_advantage_system: true,

    # Passives
    enable_passive_abilities: true,
    max_passive_slots: 3,

    # Rolling HP / Combo input
    enable_rolling_hp: false,
    enable_combo_input: true,
    combo_ap_regen_per_turn: 3,
    combo_individual_hit_damage: 0.5,

    # Action commands
    enable_action_commands: true,

    # Alignment
    enable_alignment_system: true,
    alignment_affects_stats: true,
    alignment_affects_skills: true,
    alignment_affects_shops: false,

    # Battle rules / summons
    enable_battle_rules: true,
    enable_summons: true,
    max_summons_per_player: 1,
    summon_cost_type: "mp",
    summon_mp_cost_pct: 0.20,
    summon_base_duration: 3,

    # Spell slots
    enable_spell_slots: false,
    spell_slots_refresh_on: "rest",

    # Damage calculation
    base_crit_chance: 5,
    crit_damage_multiplier: 1.5,
    damage_cap: 0,

    # Loot
    enable_steal: true,
    steal_base_chance: 50,
    steal_rare_chance: 0.20,
    enable_overkill_bonus: true,
    overkill_threshold_small: 50,
    overkill_threshold_medium: 100,
    overkill_threshold_large: 200,
    overkill_mult_small: 1.25,
    overkill_mult_medium: 1.50,
    overkill_mult_large: 2.00,
    enable_battle_chain: true,
    chain_xp_bonus: 0.05,
    chain_drop_bonus: 0.10,
    chain_max_bonus: 0.50,
    enable_battle_rating: true,
    rating_target_turns: 8,
    rating_s_xp_mult: 1.50,
    rating_s_gold_mult: 2.00,
    rating_a_xp_mult: 1.25,
    rating_a_gold_mult: 1.50,

    # Buff/Status
    enable_buff_stacking: true,
    default_stack_mode: "refresh",
    default_max_stacks: 5,
    enable_cleanse: true,
    enable_dispel: true,
    enable_status_immunity: true,
    cleanse_immunity_duration: 2,

    # Cover / barriers
    enable_cover_system: true,
    cover_duration: 2,
    cover_damage_split: 1.0,
    enable_barriers: true,

    # Grid / elevation
    enable_elevation: true,
    elevation_height_bonus: 0.15,
    enable_difficult_terrain: true,
    difficult_terrain_cost: 2,
    enable_opportunity_attacks: true,
    opportunity_attack_damage_pct: 0.50,
    enable_zone_of_control: true,
    enable_aoe_shapes: true,
    grid_width: 8,
    grid_height: 5,

    # Formation
    enable_formations: true,
    front_melee_bonus: 0,
    back_melee_penalty: 0.30,
    back_melee_reduction: 0.50,
    back_ranged_bonus: 0.10,
    row_swap_costs_turn: true,

    # ATB
    atb_wait_mode: true,
    atb_speed_factor: 5.0,
    atb_tick_rate: 500,

    # CTB
    ctb_base_recovery: 100,
    ctb_speed_divisor: 10,
    ctb_timeline_length: 10,

    # Auto-battle
    enable_auto_battle: true,
    auto_battle_default_tactics: "balanced",
    auto_battle_base_delay_ms: 2000,

    # Damage preview
    enable_damage_preview: true,

    # Morale
    enable_morale: true,
    starting_morale: 100,
    max_morale: 100,
    flee_threshold: 20,
    ally_death_loss: 20,
    leader_death_loss: 30,
    critical_hit_loss: 10,
    heavy_damage_loss: 10,
    heavy_damage_pct: 0.30,
    low_hp_loss: 15,
    low_hp_threshold: 0.25,
    enemy_kill_gain: 10,
    heal_received_gain: 5,
    idle_turn_gain: 3,
    personality_brave_bonus: 20,
    personality_coward_penalty: -20,
    pursuit_bonus_damage_pct: 0.50,
    rout_on_leader_flee: true,

    # Brave/Default
    enable_brave_default: true,
    bd_max_bp: 3,
    bd_min_bp: -3,
    bd_starting_bp: 0,
    bd_default_defense_bonus: 0.25,
    bd_bp_regen_per_turn: 0,
    bd_negative_bp_skip_turn: true,

    # Turn timeout
    enable_turn_timeout: true,
    turn_timeout_seconds: 120,
    turn_timeout_action: "defend",

    # Auto-revive / Inn / AP
    enable_auto_revive: true,
    auto_revive_hp_pct: 0.50,
    enable_inns: true,
    inn_default_cost: 50,
    enable_ap_distribution: true,
    ap_per_level: 5,

    # Team sizes
    max_characters_per_account: 5,
    max_team_size: 10,
    min_team_size: 1,
    allow_uneven_teams: true,
    auto_scale_grid: true,

    # Escape
    enable_escape_xp_penalty: true,
    escape_xp_loss_pct: 0.25,

    # Skill learning (Blue Mage)
    enable_skill_learning: true,
    skill_learn_default_chance: 25,
    enable_devour: true,
    enable_sketch: true,

    # Environmental
    enable_terrain_interaction: true,
    fire_spread_chance: 50,

    # Mounts
    enable_mount_combat: true,
    mount_dismount_on_death: true,

    # Raids
    enable_raids: true,
    raid_max_parties: 4,

    # Async PvP
    enable_async_pvp: true,
    async_pvp_rating_change: 15,

    # Job system
    enable_job_system: false,
    progression_mode: "class",
    jp_per_battle_action: 10,
    max_job_level: 20,
    allow_secondary_job: true,

    # Battle chat
    enable_battle_chat: true,
    enable_battle_dm: true,
    enable_battle_team_chat: true,
    enable_referees: true,
    enable_ai_referee: false,

    # Minigames
    enable_card_game: true,
    card_game_board_size: 9,
    card_game_wager_enabled: true,
    enable_dice_gambling: true,
    enable_arena_betting: true,
    enable_fishing_minigame: true,
    enable_puzzle_rooms: true,

    # Tier 4 battle modes
    enable_deck_building: false,
    deck_hand_size: 5,
    deck_draw_per_turn: 1,
    enable_simultaneous_turns: false,
    enable_realtime_pause: false,
    enable_combat_crafting: false,
    enable_siege_mode: false,

    # Character creator
    character_creator_mode: "appearance",

    # Gameplay systems
    enable_gathering_skills: true,
    enable_bank: true,
    bank_default_slots: 50,
    bank_default_tabs: 1,
    enable_creature_capture: false,
    creature_party_max: 6,
    creature_storage_max: 30,
    capture_base_rate: 30,
    enable_seasons: false,
    enable_bounty_boards: true,
    enable_treasure_trails: true,
    enable_mounts: true,
    mount_dismount_on_battle: true,
    enable_player_housing: false,
    housing_max_furniture: 20,
    enable_key_locks: true,

    # Cooldown system — per-skill turn-based cooldowns.
    # When enabled, skills with a non-zero cooldown_turns field in the
    # DB are gated: can't re-use until cooldown expires. Haste/slow
    # status effects modify the tick rate via cooldown_rate_mult.
    enable_cooldowns: true,
    cooldown_global_mult: 1.0,

    # Tactical grid combat (cover, LOS, flanking, elevation)
    enable_los: false,
    enable_cover: false,
    cover_half_reduction: 0.25,
    cover_three_quarter_reduction: 0.50,
    enable_flanking: false,
    flanking_side_bonus: 0.15,
    flanking_rear_bonus: 0.25,
    enable_elevation_combat: false,
    elevation_high_ground_bonus: 0.10,
    elevation_low_ground_penalty: 0.10,

    # Reactions (auto-counter, auto-potion, opportunity attacks, baton pass)
    enable_reactions: false,
    reactions_per_turn: 1,

    # Turn delay (Grandia-style push-back on stagger)
    enable_turn_delay: false,
    stagger_turn_delay: 2
  }

  @doc "Returns default settings map"
  def defaults, do: @defaults

  @doc """
  Load battle settings from DB, falling back to defaults for missing keys.
  Reads from system_settings table and coerces types to match defaults.
  """
  def load(repo \\ Repo) do
    keys = Map.keys(@defaults) |> Enum.map(&Atom.to_string/1)

    db_settings =
      try do
        query =
          from(s in "system_settings",
            where: s.setting_key in ^keys,
            select: {s.setting_key, s.setting_value}
          )

        repo.all(query)
        |> Map.new()
      rescue
        _ -> %{}
      end

    Enum.reduce(@defaults, %{}, fn {key, default_val}, acc ->
      str_key = Atom.to_string(key)

      val =
        case Map.get(db_settings, str_key) do
          nil -> default_val
          raw -> coerce(raw, default_val)
        end

      Map.put(acc, key, val)
    end)
  end

  @doc """
  Apply arena-specific overrides to settings.
  Arena rows have override_* columns that can force features on/off.
  """
  def apply_arena_overrides(settings, nil), do: settings

  def apply_arena_overrides(settings, arena) do
    override_map = %{
      "override_limb_targeting" => :enable_limb_targeting,
      "override_active_defense" => :enable_active_defense,
      "override_nonlethal" => :enable_nonlethal,
      "override_diminishing_returns" => :enable_diminishing_returns,
      "override_ki_channeling" => :enable_ki_channeling,
      "override_summons" => :enable_summons,
      "override_signature_techs" => :enable_signature_techs
    }

    Enum.reduce(override_map, settings, fn {arena_col, setting_key}, acc ->
      case Map.get(arena, arena_col) do
        "on" -> Map.put(acc, setting_key, true)
        "off" -> Map.put(acc, setting_key, false)
        _ -> acc
      end
    end)
  end

  # Type coercion: parse DB string values to match default types
  defp coerce(raw, default) when is_boolean(default) do
    raw in ["true", "1"]
  end

  defp coerce(raw, default) when is_list(default) do
    case Jason.decode(raw) do
      {:ok, list} when is_list(list) -> list
      _ -> default
    end
  end

  defp coerce(raw, default) when is_float(default) do
    case Float.parse(raw) do
      {f, _} -> f
      :error -> default
    end
  end

  defp coerce(raw, default) when is_integer(default) do
    case Integer.parse(raw) do
      {i, _} -> i
      :error -> default
    end
  end

  defp coerce(raw, _default) when is_binary(raw), do: raw
  defp coerce(_raw, default), do: default
end
