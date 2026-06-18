// =================================================================
// BATTLE STATE — Init methods (extracted from state.js)
// =================================================================
const { jp } = require('./shared');
const { loadBattleSettings, applyArenaOverrides } = require('./settings');
const { loadLimbZones, initLimbHp, getAllWoundLevels } = require('./limbs');
const {
    loadBleedTiers, loadPassiveAbilities, applyPassiveAbilities,
    loadComboArts, loadActionCommands, getAlignmentTier, applyAlignmentBonuses,
    applyStyleBonuses
} = require('./systems');
const {
    loadActiveStyle, loadBossPhases, loadWeather
} = require('./world');
const { loadBattleRules } = require('./rules');

// Async init — call after construction to load feature flags + limb zones
async function initSettings(battle, db, arenaRow) {
    battle._settings = await loadBattleSettings(db);
    if (arenaRow) applyArenaOverrides(battle._settings, arenaRow);

    // Load stat caps for diminishing returns
    try {
        const [capRows] = await db.query('SELECT stat_key, tier, threshold, effectiveness FROM game_stat_caps ORDER BY stat_key, tier');
        battle._statCaps = {};
        for (const r of capRows) {
            if (!battle._statCaps[r.stat_key]) battle._statCaps[r.stat_key] = [];
            battle._statCaps[r.stat_key].push({ threshold: r.threshold, effectiveness: parseFloat(r.effectiveness) });
        }
    } catch { battle._statCaps = {}; }
}

// Session 13: Load fighting styles for all combatants
async function initFightingStyles(battle, db) {
    if (!battle._settings?.enable_fighting_styles) return;
    for (const c of Object.values(battle.combatants)) {
        if (!c.isAI || c._isCompanionAI) {
            // Load active style for human players and companions
            c._fightingStyle = await loadActiveStyle(db, c.charId);
        } else {
            // AI enemies could have a style too (set by admin on NPC character)
            try {
                c._fightingStyle = await loadActiveStyle(db, c.charId);
            } catch { c._fightingStyle = null; }
        }
        // Apply style stat bonuses
        applyStyleBonuses(c, battle._settings);
    }
}

// Final 8 mechanics init
async function initFinal8(battle, db) {
    for (const c of Object.values(battle.combatants)) {
        // Stagger (FF7R)
        if (battle._settings?.enable_stagger_system && c.isAI) {
            try {
                const [npc] = await db.query('SELECT stagger_threshold, stagger_duration, stagger_damage_mult FROM game_npcs WHERE char_id=?', [c.charId]);
                if (npc.length && npc[0].stagger_threshold > 0) {
                    c._staggerThreshold = npc[0].stagger_threshold;
                    c._staggerDuration = npc[0].stagger_duration || 3;
                    c._staggerBaseMult = parseFloat(npc[0].stagger_damage_mult) || 1.50;
                    c._staggerGauge = 0;
                    c._isStaggered = false;
                }
            } catch {}
        }
        // Break/Shield
        if (battle._settings?.enable_break_shield && c.isAI) {
            try {
                const [npc] = await db.query('SELECT shield_points, shield_weaknesses FROM game_npcs WHERE char_id=?', [c.charId]);
                if (npc.length && npc[0].shield_points > 0) {
                    c._shieldPoints = npc[0].shield_points;
                    c._maxShieldPoints = npc[0].shield_points;
                    c._shieldWeaknesses = jp(npc[0].shield_weaknesses, []);
                }
            } catch {}
        }
        // Passive abilities
        if (battle._settings?.enable_passive_abilities && !c.isAI) {
            c._passives = await loadPassiveAbilities(db, c.charId);
            applyPassiveAbilities(c, battle._settings);
        }
        // Weapon type from equipped weapon
        try {
            const [wpn] = await db.query(
                `SELECT gi.weapon_type FROM character_equipment ce JOIN game_items gi ON gi.id=ce.item_id
                 WHERE ce.character_id=? AND ce.slot_key='MAIN_HAND' LIMIT 1`, [c.charId]);
            if (wpn.length) c._weaponType = wpn[0].weapon_type;
        } catch {}
        c._rollingDamage = 0;
    }
    // Weapon triangle
    if (battle._settings?.enable_weapon_triangle) {
        try {
            const [tri] = await db.query('SELECT * FROM game_weapon_triangle');
            battle._weaponTriangle = tri;
        } catch { battle._weaponTriangle = []; }
    }
    // Party reserves
    if (battle._settings?.enable_party_swap) {
        battle._reserves = {};
    }
}

// Combo Input + Action Commands init
async function initComboSystem(battle, db) {
    if (battle._settings?.enable_combo_input) {
        for (const c of Object.values(battle.combatants)) {
            c._comboArts = await loadComboArts(db, c.classId, c.level || 1);
            c._currentAp = c.maxAp || 6;
            c._maxAp = c.maxAp || 6;
            // Load discovered arts
            if (!c.isAI) {
                try {
                    const [disc] = await db.query(
                        'SELECT art_id FROM character_discovered_arts WHERE character_id=?', [c.charId]);
                    c._discoveredArtIds = new Set(disc.map(r => r.art_id));
                } catch { c._discoveredArtIds = new Set(); }
            }
        }
    }
    if (battle._settings?.enable_action_commands) {
        battle._actionCommands = await loadActionCommands(db);
    }
}

// Session 24: Load alignment + battle rules
async function initSession24(battle, db) {
    // Alignment bonuses
    if (battle._settings?.enable_alignment_system) {
        for (const c of Object.values(battle.combatants)) {
            if (c.isAI) continue;
            try {
                const [charRow] = await db.query('SELECT alignment FROM characters WHERE id=?', [c.charId]);
                if (charRow.length) {
                    c.alignment = charRow[0].alignment || 0;
                    const tier = await getAlignmentTier(db, c.alignment);
                    if (tier) {
                        c._alignmentTier = tier;
                        applyAlignmentBonuses(c, tier, battle._settings);
                    }
                }
            } catch {}
        }
    }
    // Battle rules
    if (battle._settings?.enable_battle_rules) {
        battle._battleRules = await loadBattleRules(db, battle);
    }
}

// Session 23: Load elemental reactions + status combos + threat init
async function initSession23(battle, db) {
    // Elemental reactions
    if (battle._settings?.enable_elemental_reactions) {
        try {
            const [rows] = await db.query('SELECT * FROM game_elemental_reactions WHERE active=1');
            battle._elementReactions = rows.map(r => ({
                element_a: r.element_a, element_b: r.element_b,
                reaction_name: r.reaction_name, icon: r.icon,
                damage_bonus: parseFloat(r.damage_bonus), aoe_radius: r.aoe_radius,
                apply_status: r.apply_status, remove_elements: r.remove_elements,
                battle_text: r.battle_text
            }));
        } catch { battle._elementReactions = []; }
    }
    // Status combos
    if (battle._settings?.enable_status_combos) {
        try {
            const [rows] = await db.query('SELECT * FROM game_status_combos WHERE active=1');
            battle._statusCombos = rows;
        } catch { battle._statusCombos = []; }
    }
    // Threat table
    if (battle._settings?.enable_threat_system) {
        battle._threatTable = {};
    }
    // Per-combatant element auras
    for (const c of Object.values(battle.combatants)) {
        c._elementAuras = [];
        c._statusComboBonus = 0;
    }
}

// Sessions 17-22: Weather + combat state init
async function initCombatExtras(battle, db) {
    // Weather
    if (battle._settings?.enable_weather_effects && battle.mapId) {
        battle._weather = await loadWeather(db, battle.mapId);
    }
    // Traps
    battle._traps = {};
    // Per-combatant state
    for (const c of Object.values(battle.combatants)) {
        c._isStealthed = false;
        c._transformed = null;
        c._linkCooldown = {};
    }
}

// Session 16: Load boss phases + win conditions
async function initBossPhases(battle, db) {
    if (!battle._settings?.enable_boss_phases) return;
    for (const c of Object.values(battle.combatants)) {
        if (!c.isAI) continue;
        // Check if this NPC has boss phases
        try {
            const [npcRow] = await db.query('SELECT id FROM game_npcs WHERE char_id=?', [c.charId]);
            if (npcRow.length) {
                const phases = await loadBossPhases(db, npcRow[0].id);
                if (phases.length) {
                    c._bossPhases = phases;
                    c._currentPhase = 0;
                    c._isBoss = true;
                }
            }
        } catch {}
    }
}

async function initWinCondition(battle, db, winConditionId) {
    if (!battle._settings?.enable_custom_win_conditions) return;

    // Direct win condition from encounter
    if (winConditionId) {
        try {
            const [rows] = await db.query('SELECT * FROM game_win_conditions WHERE id=?', [winConditionId]);
            if (rows.length) {
                battle._winCondition = {
                    id: rows[0].id,
                    conditionType: rows[0].condition_type,
                    params: jp(rows[0].params, {}),
                    description: rows[0].description,
                    successText: rows[0].success_text,
                    failText: rows[0].fail_text,
                    icon: rows[0].icon
                };
            }
        } catch {}
    }

    // Quest-injected win conditions — check if any active quest overrides this battle
    if (battle.mapId) {
        try {
            // Get all human player char IDs in the battle
            const humanIds = Object.values(battle.combatants)
                .filter(c => !c.isAI).map(c => c.charId);
            for (const hId of humanIds) {
                const [charRow] = await db.query('SELECT state_json FROM characters WHERE id=?', [hId]);
                if (!charRow.length) continue;
                const state = jp(charRow[0].state_json, {});
                if (!state.quests?.active) continue;

                // Check each active quest for battle overrides
                for (const [qId] of Object.entries(state.quests.active)) {
                    const [overrides] = await db.query(
                        `SELECT qbo.*, wc.* FROM game_quest_battle_overrides qbo
                         JOIN game_win_conditions wc ON wc.id = qbo.win_condition_id
                         WHERE qbo.quest_id=? AND qbo.active=1
                         AND (qbo.map_id IS NULL OR qbo.map_id=?)`,
                        [qId, battle.mapId]);
                    if (overrides.length) {
                        const ov = overrides[0];
                        // Override the win condition
                        battle._winCondition = {
                            id: ov.win_condition_id,
                            conditionType: ov.condition_type,
                            params: jp(ov.params, {}),
                            description: ov.description,
                            successText: ov.success_text,
                            failText: ov.fail_text,
                            icon: ov.icon,
                            questId: qId
                        };
                        // Inject dynamic protect target if specified
                        if (ov.inject_protect_char_id && battle._winCondition.conditionType === 'protect_npc') {
                            battle._winCondition.params.protect_char_id = ov.inject_protect_char_id;
                        }
                        break; // first match wins
                    }
                }
                if (battle._winCondition?.questId) break;
            }
        } catch {} // non-fatal
    }
}

// Session 15: Load spell slots for combatants
async function initSpellSlots(battle, db) {
    if (!battle._settings?.enable_spell_slots) return;
    for (const c of Object.values(battle.combatants)) {
        if (c.isAI && !c._isCompanionAI) continue;
        try {
            const [row] = await db.query('SELECT spell_slots_json FROM characters WHERE id=?', [c.charId]);
            if (row.length && row[0].spell_slots_json) {
                c._spellSlots = jp(row[0].spell_slots_json, null);
            }
            // If no slots saved, generate from the slot table
            if (!c._spellSlots) {
                const [slotRows] = await db.query(
                    'SELECT slot_level, slot_count FROM game_spell_slot_table WHERE character_level<=? ORDER BY slot_level',
                    [c.level || 1]);
                if (slotRows.length) {
                    c._spellSlots = {};
                    for (const sr of slotRows) {
                        if (!c._spellSlots[sr.slot_level] || sr.slot_count > c._spellSlots[sr.slot_level].max) {
                            c._spellSlots[sr.slot_level] = { max: sr.slot_count, current: sr.slot_count };
                        }
                    }
                }
            }
        } catch { c._spellSlots = null; }
    }
}

// Session 10: Load bleed tier definitions + init ki channel state
async function initSession10(battle, db) {
    if (battle._settings?.enable_bleed_tiers) {
        battle._bleedTiers = await loadBleedTiers(db);
    }
    for (const c of Object.values(battle.combatants)) {
        c._kiChanneled = null;
        c._kiChannelUsed = 0;
        c._bleeds = [];
    }
}

// Initialize limb HP for all combatants. Must be called after initSettings.
async function initLimbSystem(battle, db) {
    if (!battle._settings?.enable_limb_targeting) return;

    // Cache body type zones to avoid repeated queries
    const zoneCache = {};

    for (const c of Object.values(battle.combatants)) {
        const btId = c.bodyTypeId || 1;
        if (!zoneCache[btId]) {
            zoneCache[btId] = await loadLimbZones(db, btId);
        }
        const zones = zoneCache[btId];

        // Amorphous (single 'core' zone) effectively has no limb targeting
        if (zones.length <= 1 && zones[0]?.key === 'core') {
            c._limbHp = null;
            c._limbZones = null;
            c._woundLevels = null;
        } else {
            c._limbZones = zones;
            c._limbHp = initLimbHp(c.maxHp, zones);
            c._woundLevels = getAllWoundLevels(c._limbHp, battle._settings);
        }

        // Session 8 per-combatant state
        c._knockedOut = false;
        c._nonLethal = false;
        c._lastAttackUsed = null;
        c._diminishingReturns = 0;
    }
}

module.exports = {
    initSettings,
    initFightingStyles,
    initFinal8,
    initComboSystem,
    initSession24,
    initSession23,
    initCombatExtras,
    initBossPhases,
    initWinCondition,
    initSpellSlots,
    initSession10,
    initLimbSystem
};
