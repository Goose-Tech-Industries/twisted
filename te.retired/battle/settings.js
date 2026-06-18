// =================================================================
// BATTLE SETTINGS — Feature flags, arena overrides
// =================================================================
const { jp } = require('./shared');

async function loadBattleSettings(db) {
    const defaults = {
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
        dodge_base_chance: 0.15,
        dodge_speed_factor: 0.35,
        dodge_max_chance: 0.90,
        block_die_sides: 6,
        block_success_numbers: [1, 2],
        block_one_arm_reduction: 0.25,
        block_two_arm_reduction: 0.50,
        block_stun_die_sides: 12,
        counter_base_chance: 0.25,
        counter_charge_bonus: 0.25,
        counter_max_chance: 0.90,
        diminishing_returns_per_repeat: 0.05,
        diminishing_returns_max: 0.15,
        defense_prompt_timeout_ms: 10000,
        called_shot_penalty_head: 0.20,
        called_shot_penalty_arms: 0.10,
        called_shot_penalty_legs: 0.10,
        nonlethal_rep_bonus_release: 5,
        nonlethal_rep_penalty_finish: -10,
        ko_interrogate_base_chance: 0.60,
        ki_ranged_dodge_bonus: 0.15,
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
        enable_combo_procs: true,
        combo_chain_decay: 0.50,
        combo_crit_chance: 0.03,
        enable_ki_channeling: true,
        ki_channel_duration: 5,
        ki_channel_crash_pct: 0.50,
        ki_channel_uses_per_battle: 1,
        enable_bleed_tiers: true,
        bleed_max_stacks: 2,
        bleed_max_duration: 4,
        enable_signature_techs: true,
        sig_tech_require_unlock: false,
        sig_tech_discovery_threshold: 3,
        sig_tech_max_per_character: 5,
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
        ai_difficulty: 'normal',
        initiative_type: 'speed',
        enable_afterlife: true,
        enable_tournaments: true,
        enable_offline_players: true,
        enable_training_system: true,
        enable_stagger_system: true,
        stagger_decay_per_turn: 10,
        stagger_base_increase: 5,
        enable_break_shield: true,
        break_stun_turns: 1,
        break_damage_bonus: 0.50,
        enable_one_more: true,
        enable_turn_manipulation: true,
        enable_party_swap: true,
        enable_weapon_triangle: true,
        enable_advantage_system: true,
        enable_passive_abilities: true,
        max_passive_slots: 3,
        enable_rolling_hp: false,
        enable_combo_input: true,
        combo_ap_regen_per_turn: 3,
        combo_individual_hit_damage: 0.5,
        enable_action_commands: true,
        enable_alignment_system: true,
        alignment_affects_stats: true,
        alignment_affects_skills: true,
        alignment_affects_shops: false,
        enable_battle_rules: true,
        enable_summons: true,
        max_summons_per_player: 1,
        summon_cost_type: 'mp',
        summon_mp_cost_pct: 0.20,
        summon_base_duration: 3,
        enable_spell_slots: false,
        spell_slots_refresh_on: 'rest',
        // Damage calculation (Session 3)
        base_crit_chance: 5,
        crit_damage_multiplier: 1.5,
        damage_cap: 0,
        // Defensive systems (Session 4)
        // Loot system (Session 6)
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
        // Buff/Status system (Session 5)
        enable_buff_stacking: true,
        default_stack_mode: 'refresh',
        default_max_stacks: 5,
        enable_cleanse: true,
        enable_dispel: true,
        enable_status_immunity: true,
        cleanse_immunity_duration: 2,
        // Defensive systems (Session 4)
        enable_cover_system: true,
        cover_duration: 2,
        cover_damage_split: 1.0,
        enable_barriers: true,
        // Grid enhancements (Session 25)
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
        // Formation system (Session 2)
        enable_formations: true,
        front_melee_bonus: 0,
        back_melee_penalty: 0.30,
        back_melee_reduction: 0.50,
        back_ranged_bonus: 0.10,
        row_swap_costs_turn: true,
        // ATB system (Session 2)
        atb_wait_mode: true,
        atb_speed_factor: 5.0,
        atb_tick_rate: 500,
        // CTB system (Session 2)
        ctb_base_recovery: 100,
        ctb_speed_divisor: 10,
        ctb_timeline_length: 10,
        // Auto-battle (Session 28)
        enable_auto_battle: true,
        auto_battle_default_tactics: 'balanced',
        auto_battle_base_delay_ms: 2000,
        // Damage preview (Session 28)
        enable_damage_preview: true,
        // Morale system (Session 28)
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
        // Brave/Default (Session 28)
        enable_brave_default: true,
        bd_max_bp: 3,
        bd_min_bp: -3,
        bd_starting_bp: 0,
        bd_default_defense_bonus: 0.25,
        bd_bp_regen_per_turn: 0,
        bd_negative_bp_skip_turn: true,
        // Turn timeout (Session vRDE)
        enable_turn_timeout: true,
        turn_timeout_seconds: 120,
        turn_timeout_action: 'defend',
        // Auto-revive
        enable_auto_revive: true,
        auto_revive_hp_pct: 0.50,
        // Inn/Rest
        enable_inns: true,
        inn_default_cost: 50,
        // AP Distribution
        enable_ap_distribution: true,
        ap_per_level: 5,
        // Multi-character
        max_characters_per_account: 5,
        // Team battle sizes
        max_team_size: 10,
        min_team_size: 1,
        allow_uneven_teams: true,
        auto_scale_grid: true,
        // Escape penalty
        enable_escape_xp_penalty: true,
        escape_xp_loss_pct: 0.25,
        // Skill Learning (Blue Mage)
        enable_skill_learning: true,
        skill_learn_default_chance: 25,
        enable_devour: true,
        enable_sketch: true,
        // Environmental Interaction
        enable_terrain_interaction: true,
        fire_spread_chance: 50,
        // Mount Combat
        enable_mount_combat: true,
        mount_dismount_on_death: true,
        // Raid Bosses
        enable_raids: true,
        raid_max_parties: 4,
        // Async PvP
        enable_async_pvp: true,
        async_pvp_rating_change: 15,
        // Job System
        enable_job_system: false,
        progression_mode: 'class',
        jp_per_battle_action: 10,
        max_job_level: 20,
        allow_secondary_job: true,
        // Battle Chat & Referees
        enable_battle_chat: true,
        enable_battle_dm: true,
        enable_battle_team_chat: true,
        enable_referees: true,
        enable_ai_referee: false,
        // Minigames
        enable_card_game: true,
        card_game_board_size: 9,
        card_game_wager_enabled: true,
        enable_dice_gambling: true,
        enable_arena_betting: true,
        enable_fishing_minigame: true,
        enable_puzzle_rooms: true,
        // Tier 4 Battle Modes
        enable_deck_building: false,
        deck_hand_size: 5,
        deck_draw_per_turn: 1,
        enable_simultaneous_turns: false,
        enable_realtime_pause: false,
        enable_combat_crafting: false,
        enable_siege_mode: false,
        // Character creator mode (admin toggle)
        character_creator_mode: 'appearance',
        // Gameplay systems (all toggleable)
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
    };
    try {
        const keys = Object.keys(defaults);
        const placeholders = keys.map(() => '?').join(',');
        const [rows] = await db.query(
            `SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (${placeholders})`,
            keys
        );
        for (const row of rows) {
            const k = row.setting_key;
            const v = row.setting_value;
            if (defaults[k] === undefined) continue;
            if (typeof defaults[k] === 'boolean') {
                defaults[k] = v === 'true' || v === '1';
            } else if (Array.isArray(defaults[k])) {
                defaults[k] = jp(v, defaults[k]);
            } else if (typeof defaults[k] === 'number') {
                defaults[k] = parseFloat(v) || defaults[k];
            } else {
                defaults[k] = v;
            }
        }
    } catch (e) {
        console.warn('loadBattleSettings: non-fatal error, using defaults:', e.message);
    }
    return defaults;
}

function applyArenaOverrides(settings, arena) {
    if (!arena) return settings;
    const overrideMap = {
        override_limb_targeting:       'enable_limb_targeting',
        override_active_defense:       'enable_active_defense',
        override_nonlethal:            'enable_nonlethal',
        override_diminishing_returns:  'enable_diminishing_returns',
        override_ki_channeling:        'enable_ki_channeling',
        override_summons:              'enable_summons',
        override_signature_techs:      'enable_signature_techs'
    };
    for (const [arenaCol, settingKey] of Object.entries(overrideMap)) {
        const val = arena[arenaCol];
        if (val === 'on')  settings[settingKey] = true;
        if (val === 'off') settings[settingKey] = false;
    }
    return settings;
}

module.exports = { loadBattleSettings, applyArenaOverrides };
