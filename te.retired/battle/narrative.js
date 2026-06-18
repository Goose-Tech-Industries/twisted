const { jp } = require('./stats');
const { routeLimbDamage, getAllWoundLevels, applyWoundPenalties } = require('./limbs');

// =================================================================
// SESSION 11: SIGNATURE TECHNIQUES — Discovery via Flavor Text
// =================================================================

// Extract meaningful combat keywords from flavor text
function extractKeywords(text) {
    if (!text || typeof text !== 'string') return [];
    const lower = text.toLowerCase();
    // Combat-relevant word categories
    const combatWords = new Set([
        // Elements
        'fire','flame','burn','blaze','inferno','ice','frost','freeze','cold','lightning','thunder','shock','bolt',
        'earth','stone','rock','quake','dark','shadow','void','light','holy','radiant',
        // Actions
        'slash','cut','strike','punch','kick','smash','crush','pierce','stab','thrust','sweep','spin',
        'charge','leap','dash','lunge','slam','uppercut','overhead','backstab','flank',
        // Body/targeting
        'head','skull','leg','arm','chest','torso','neck','throat','eye','knee','spine',
        // Style
        'rapid','swift','heavy','brutal','graceful','precise','reckless','savage','fury','rage',
        'feint','parry','counter','riposte','dodge','weave',
        // Environment
        'wall','ground','air','sky','above','below','behind','tree','water','cliff'
    ]);
    const words = lower.split(/[\s,.\-!?;:'"+]+/).filter(w => w.length > 2);
    return [...new Set(words.filter(w => combatWords.has(w)))];
}

// Save flavor text to history and check for technique discovery
async function trackFlavorText(db, charId, flavorText, battleId, skillId, damage, settings) {
    if (!settings?.enable_signature_techs) return null;
    if (!flavorText || flavorText.length < (settings.sig_tech_min_flavor_length || 15)) return null;

    const keywords = extractKeywords(flavorText);
    if (keywords.length === 0) return null;

    // Save to history
    try {
        await db.query(
            `INSERT INTO character_flavor_history (character_id, flavor_text, keywords_json, category, battle_id, skill_id, damage_dealt)
             VALUES (?, ?, ?, 'attack', ?, ?, ?)`,
            [charId, flavorText.substring(0, 500), JSON.stringify(keywords), battleId, skillId, damage || 0]
        );
    } catch {} // non-fatal if table doesn't exist

    // Check for technique discovery
    return await checkTechDiscovery(db, charId, settings);
}

// Analyze flavor history for emerging technique patterns
async function checkTechDiscovery(db, charId, settings) {
    const threshold = settings?.sig_tech_discovery_threshold || 10;
    const maxTechs = settings?.sig_tech_max_per_character || 3;

    // Session 12: Check if player has unlocked sig tech creation
    // (either from master training or as a rare natural talent)
    if (settings?.sig_tech_require_unlock !== false) {
        try {
            const [charRow] = await db.query('SELECT can_create_sig_tech FROM characters WHERE id=?', [charId]);
            if (charRow.length && !charRow[0].can_create_sig_tech) {
                // Not unlocked — check for natural talent (very rare)
                const naturalChance = settings?.sig_tech_natural_talent_chance || 0.05;
                if (Math.random() >= naturalChance) return null;
                // Natural talent triggered! Auto-unlock
                await db.query('UPDATE characters SET can_create_sig_tech=1 WHERE id=?', [charId]);
            }
        } catch {}
    }

    // Check if player already has max techs
    try {
        const [countRow] = await db.query(
            'SELECT COUNT(*) as cnt FROM character_signature_techs WHERE character_id=?', [charId]);
        if (countRow[0].cnt >= maxTechs) return null;
    } catch { return null; }

    // Get recent flavor history (last 50 entries)
    let history;
    try {
        const [rows] = await db.query(
            `SELECT keywords_json FROM character_flavor_history
             WHERE character_id=? ORDER BY used_at DESC LIMIT 50`, [charId]);
        history = rows;
    } catch { return null; }

    if (history.length < threshold) return null;

    // Count keyword frequency across all entries
    const kwCounts = {};
    for (const row of history) {
        const kws = jp(row.keywords_json, []);
        for (const kw of kws) {
            kwCounts[kw] = (kwCounts[kw] || 0) + 1;
        }
    }

    // Find dominant keyword clusters (keywords that appear >= threshold times)
    const dominant = Object.entries(kwCounts)
        .filter(([_, count]) => count >= threshold)
        .sort((a, b) => b[1] - a[1]);

    if (dominant.length === 0) return null;

    // Check if we already have a tech with these keywords
    try {
        const [existing] = await db.query(
            'SELECT origin_keywords FROM character_signature_techs WHERE character_id=?', [charId]);
        for (const row of existing) {
            const existingKws = jp(row.origin_keywords, []);
            const overlap = dominant.filter(([kw]) => existingKws.includes(kw));
            if (overlap.length >= dominant.length * 0.6) return null; // too similar to existing tech
        }
    } catch {}

    // Determine element and type from dominant keywords
    const elementMap = {
        fire: ['fire','flame','burn','blaze','inferno'],
        ice: ['ice','frost','freeze','cold'],
        lightning: ['lightning','thunder','shock','bolt'],
        earth: ['earth','stone','rock','quake'],
        dark: ['dark','shadow','void'],
        light: ['light','holy','radiant']
    };
    let suggestedElement = null;
    for (const [elem, words] of Object.entries(elementMap)) {
        if (dominant.some(([kw]) => words.includes(kw))) {
            suggestedElement = elem;
            break;
        }
    }

    const physicalWords = ['slash','cut','punch','kick','smash','crush','uppercut','backstab'];
    const isPhysical = dominant.some(([kw]) => physicalWords.includes(kw));
    const suggestedType = isPhysical ? 'physical' : 'ki_attack';

    // Build suggested name from top 2 keywords
    const topWords = dominant.slice(0, 2).map(([kw]) => kw.charAt(0).toUpperCase() + kw.slice(1));
    const suggestedName = topWords.join(' ') + (suggestedType === 'ki_attack' ? ' Blast' : ' Strike');

    return {
        discovered: true,
        suggestedName,
        suggestedType,
        suggestedElement,
        dominantKeywords: dominant.map(([kw, count]) => ({ keyword: kw, count })),
        originKeywords: dominant.map(([kw]) => kw)
    };
}

// =================================================================
// SESSION 12A: MASTER TRAINING SYSTEM
// =================================================================

// Train under a master NPC. Returns training result.
async function trainUnderMaster(db, charId, npcId) {
    const [npcRow] = await db.query('SELECT * FROM game_npcs WHERE id=? AND is_master=1', [npcId]);
    if (!npcRow.length) return { success: false, message: 'Not a master' };
    const master = npcRow[0];

    const [charRow] = await db.query('SELECT * FROM characters WHERE id=?', [charId]);
    if (!charRow.length) return { success: false, message: 'Character not found' };
    const char = charRow[0];

    const result = { success: true, type: null, data: {} };

    // Unlock sig tech creation
    if (master.unlocks_sig_tech_creation && !char.can_create_sig_tech) {
        await db.query('UPDATE characters SET can_create_sig_tech=1 WHERE id=?', [charId]);
        result.type = 'unlock_creation';
        result.data = { message: `${master.name} teaches you the art of creating your own techniques!` };
    }
    // Teach a specific pre-made sig tech
    else if (master.teaches_sig_tech_id) {
        const [premade] = await db.query('SELECT * FROM game_premade_sig_techs WHERE id=?', [master.teaches_sig_tech_id]);
        if (premade.length) {
            const pm = premade[0];
            // Check if player already knows it
            const [existing] = await db.query(
                'SELECT id FROM character_signature_techs WHERE character_id=? AND name=?', [charId, pm.name]);
            if (existing.length) {
                return { success: false, message: `You already know ${pm.name}!` };
            }
            // Create the tech for the player
            await db.query(
                `INSERT INTO character_signature_techs
                 (character_id, name, icon, description, tech_type, element, battle_text, current_level, current_xp)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
                [charId, pm.name, pm.icon, pm.description, pm.tech_type, pm.element, pm.battle_text]
            );
            result.type = 'learn_sig_tech';
            result.data = { techName: pm.name, lore: pm.lore_text, message: `${master.name} teaches you ${pm.name}!` };
        }
    }
    // Teach regular skills (teaches_skill_ids = JSON array of skill IDs)
    else if (master.teaches_skill_ids) {
        let skillIds = [];
        try { skillIds = typeof master.teaches_skill_ids === 'string' ? JSON.parse(master.teaches_skill_ids) : master.teaches_skill_ids; } catch {}
        if (Array.isArray(skillIds) && skillIds.length > 0) {
            // Check gold/level requirements
            if (master.teach_level_req && char.level < master.teach_level_req) {
                return { success: false, message: `You must be level ${master.teach_level_req} to learn from ${master.name}.` };
            }
            if (master.teach_quest_req_id) {
                const [qr] = await db.query('SELECT id FROM character_quests WHERE character_id=? AND quest_id=? AND status=?', [charId, master.teach_quest_req_id, 'completed']);
                if (!qr.length) return { success: false, message: `You must complete a quest before ${master.name} will teach you.` };
            }
            // Find first skill the player doesn't know yet
            const [knownSkills] = await db.query(
                'SELECT skill_id FROM character_learned_skills WHERE character_id=?', [charId]);
            const knownSet = new Set(knownSkills.map(r => r.skill_id));
            const toLearn = skillIds.find(sid => !knownSet.has(sid));
            if (!toLearn) {
                return { success: false, message: `${master.name} has nothing more to teach you.` };
            }
            // Charge gold
            const goldCost = master.teach_gold_cost || 0;
            if (goldCost > 0) {
                const [[userRow]] = await db.query('SELECT currency FROM users WHERE id=?', [char.user_id]);
                if (!userRow || userRow.currency < goldCost) return { success: false, message: `Training costs ${goldCost} gold.` };
                await db.query('UPDATE users SET currency=currency-? WHERE id=?', [goldCost, char.user_id]);
            }
            // Learn the skill
            await db.query('INSERT IGNORE INTO character_learned_skills (character_id, skill_id, learned_from) VALUES (?,?,?)',
                [charId, toLearn, master.name]);
            const [[skill]] = await db.query('SELECT name, icon FROM game_skills WHERE id=?', [toLearn]);
            result.type = 'learn_skill';
            result.data = { skillId: toLearn, skillName: skill?.name, message: `${master.name} teaches you ${skill?.icon || ''} ${skill?.name || 'a new technique'}!` };
        }
    }
    // Teach permanent abilities (teaches_ability_ids = JSON array: [{type, name, status_id}])
    else if (master.teaches_ability_ids) {
        let abilities = [];
        try { abilities = typeof master.teaches_ability_ids === 'string' ? JSON.parse(master.teaches_ability_ids) : master.teaches_ability_ids; } catch {}
        if (Array.isArray(abilities) && abilities.length > 0) {
            if (master.teach_level_req && char.level < master.teach_level_req) {
                return { success: false, message: `You must be level ${master.teach_level_req} to learn from ${master.name}.` };
            }
            const [knownAbilities] = await db.query('SELECT ability_type FROM character_abilities WHERE character_id=?', [charId]);
            const knownSet = new Set(knownAbilities.map(r => r.ability_type));
            const toLearn = abilities.find(a => !knownSet.has(a.type));
            if (!toLearn) return { success: false, message: `${master.name} has nothing more to teach you.` };
            const goldCost = master.teach_gold_cost || 0;
            if (goldCost > 0) {
                const [[userRow]] = await db.query('SELECT currency FROM users WHERE id=?', [char.user_id]);
                if (!userRow || userRow.currency < goldCost) return { success: false, message: `Training costs ${goldCost} gold.` };
                await db.query('UPDATE users SET currency=currency-? WHERE id=?', [goldCost, char.user_id]);
            }
            await db.query(
                'INSERT INTO character_abilities (character_id, ability_type, ability_name, status_id, source) VALUES (?,?,?,?,?)',
                [charId, toLearn.type, toLearn.name, toLearn.status_id || null, master.name]
            );
            result.type = 'learn_ability';
            result.data = { abilityType: toLearn.type, abilityName: toLearn.name, message: `${master.name} teaches you ${toLearn.name}!` };
        }
    }
    // Stat training (default fallback)
    else {
        const gainPct = parseFloat(master.training_gain_pct) || 0.02;
        const baseHp = char.max_hp;
        const gain = Math.max(1, Math.floor(baseHp * gainPct));
        await db.query(
            'UPDATE characters SET max_hp=max_hp+?, current_hp=GREATEST(1, current_hp-?) WHERE id=?',
            [Math.floor(gain * 0.1), Math.floor(gain * 0.5), charId]
        );
        result.type = 'stat_train';
        result.data = { gain, message: `Training under ${master.name} strengthens you! (+${Math.floor(gain * 0.1)} max HP)` };
    }

    // Log the training
    try {
        await db.query(
            'INSERT INTO game_master_training_log (character_id, npc_id, training_type, result_json) VALUES (?,?,?,?)',
            [charId, npcId, result.type || 'stat_train', JSON.stringify(result.data)]
        );
    } catch {}

    return result;
}

// =================================================================
// SESSION 12B: EXPANDED RP DESCRIPTION ENGINE
// =================================================================
// Replaces the simple flavor text evaluator with a richer system that:
// - Scales bonus by description length/detail
// - Checks context (terrain, wounds, nearby allies/enemies)
// - Detects party chains (building on ally's description)
// - Works on ALL action types, not just attacks

async function evaluateRpDescription(db, battle, actor, text, actionType, settings) {
    const result = { bonus: 0, contextMatches: 0, partyChain: false, log: [] };
    if (!settings?.enable_rp_descriptions) return result;
    if (!text || typeof text !== 'string') return result;

    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();
    const minShort = settings.rp_desc_min_short || 20;
    const minDetailed = settings.rp_desc_min_detailed || 50;
    const shortBonus = settings.rp_desc_short_bonus || 0.05;
    const detailedBonus = settings.rp_desc_detailed_bonus || 0.07;
    const contextBonus = settings.rp_desc_context_bonus || 0.03;
    const chainBonus = settings.rp_desc_party_chain_bonus || 0.03;
    const maxBonus = settings.rp_desc_max_bonus || 0.12;

    // Check which action types are eligible
    const allowedTypes = (settings.rp_desc_applies_to || 'attack,skill').split(',').map(s => s.trim());
    if (!allowedTypes.includes(actionType) && !allowedTypes.includes('all')) return result;

    if (trimmed.length < minShort) return result;

    // Length-based bonus (scaling)
    if (trimmed.length >= minDetailed) {
        result.bonus = detailedBonus;
        result.log.push(`🎭 Detailed description! (+${Math.round(detailedBonus * 100)}%)`);
    } else {
        result.bonus = shortBonus;
        result.log.push(`🎭 RP description (+${Math.round(shortBonus * 100)}%)`);
    }

    // Context awareness — check if description references actual battle state
    const actorTerrain = battle?.terrainMap?.[`${actor.gridX},${actor.gridY}`] || 'open';
    const contextChecks = [
        // Terrain references
        { words: ['tree', 'forest', 'branch', 'trunk'], terrain: 'forest' },
        { words: ['high ground', 'above', 'ledge', 'cliff'], terrain: 'high_ground' },
        { words: ['water', 'wade', 'splash', 'river'], terrain: 'water' },
        { words: ['fire', 'flame', 'burning', 'blaze'], terrain: 'fire' },
        { words: ['wall', 'cover', 'stone', 'rock'], terrain: 'cover' },
    ];
    let contextHits = 0;
    for (const check of contextChecks) {
        if (check.words.some(w => lower.includes(w))) {
            if (check.terrain === actorTerrain || !check.terrain) {
                contextHits++;
            }
        }
    }

    // Wound references (mentioning the target's actual wounded limbs)
    const target = battle?.getOpponent?.(actor.charId);
    if (target?._woundLevels) {
        const woundedLimbs = Object.entries(target._woundLevels)
            .filter(([_, level]) => level !== 'normal')
            .map(([key]) => key);
        for (const limb of woundedLimbs) {
            const limbWords = {
                head: ['head', 'skull', 'face', 'temple'],
                torso: ['chest', 'torso', 'ribs', 'gut'],
                left_arm: ['left arm', 'shield arm', 'off hand'],
                right_arm: ['right arm', 'weapon arm', 'sword arm'],
                legs: ['leg', 'knee', 'ankle', 'shin']
            };
            if (limbWords[limb]?.some(w => lower.includes(w))) contextHits++;
        }
    }

    if (contextHits > 0) {
        const ctxBonusTotal = Math.min(contextBonus * 2, contextBonus * contextHits);
        result.bonus += ctxBonusTotal;
        result.contextMatches = contextHits;
        result.log.push(`🎯 Context-aware! ${contextHits} battlefield reference${contextHits > 1 ? 's' : ''} (+${Math.round(ctxBonusTotal * 100)}%)`);
    }

    // Party chain detection — check if description references an ally's recent action
    if (battle) {
        const recentLogs = battle.log.slice(-5);
        const allyTeam = battle.getAllyTeam?.(actor.charId) || [];
        const allyNames = allyTeam.map(a => a.name.toLowerCase());

        for (const log of recentLogs) {
            if (allyNames.some(n => lower.includes(n))) {
                result.partyChain = true;
                result.bonus += chainBonus;
                result.log.push(`🤝 Party chain! Building on ally's action (+${Math.round(chainBonus * 100)}%)`);
                break;
            }
        }
        // Also check for coordination keywords
        const chainWords = ['while', 'as they', 'together', 'following up', 'pinned', 'distracted', 'opening'];
        if (!result.partyChain && allyTeam.length > 0) {
            if (chainWords.some(w => lower.includes(w))) {
                result.partyChain = true;
                result.bonus += chainBonus;
                result.log.push(`🤝 Coordinated action! (+${Math.round(chainBonus * 100)}%)`);
            }
        }
    }

    result.bonus = Math.min(maxBonus, result.bonus);
    return result;
}

// =================================================================
// SESSION 12C: BATTLE NARRATION — DM-style descriptions
// =================================================================

// Pick a narration template matching the context, fill in placeholders
async function generateNarration(db, actionType, context, settings) {
    if (!settings?.enable_battle_narration) return null;
    try {
        // Build query conditions for best-match template
        let query = 'SELECT text_template, weight FROM game_battle_narrations WHERE active=1 AND action_type=?';
        const params = [actionType];

        const [allTemplates] = await db.query(query, params);
        if (!allTemplates.length) return null;

        // Score templates by specificity match
        const scored = allTemplates.map(t => {
            let score = t.weight || 1;
            // Bonus for matching weapon/element/terrain/zone
            if (context.weaponType && t.weapon_type === context.weaponType) score += 5;
            else if (t.weapon_type && t.weapon_type !== context.weaponType) score -= 3;
            if (context.element && t.element === context.element) score += 5;
            else if (t.element && t.element !== context.element) score -= 3;
            if (context.terrain && t.terrain === context.terrain) score += 4;
            else if (t.terrain && t.terrain !== context.terrain) score -= 2;
            if (context.targetZone && t.target_zone === context.targetZone) score += 4;
            else if (t.target_zone && t.target_zone !== context.targetZone) score -= 2;
            return { ...t, score: Math.max(0, score) };
        }).filter(t => t.score > 0);

        if (!scored.length) return null;

        // Weighted random selection
        const totalWeight = scored.reduce((sum, t) => sum + t.score, 0);
        let roll = Math.random() * totalWeight;
        let selected = scored[0];
        for (const t of scored) {
            roll -= t.score;
            if (roll <= 0) { selected = t; break; }
        }

        // Fill placeholders
        let text = selected.text_template;
        text = text.replace(/\{actor\}/g, context.actorName || 'The attacker');
        text = text.replace(/\{target\}/g, context.targetName || 'the enemy');
        text = text.replace(/\{damage\}/g, String(context.damage || 0));
        text = text.replace(/\{skill\}/g, context.skillName || 'their attack');
        text = text.replace(/\{limb\}/g, context.limbLabel || 'body');
        text = text.replace(/\{terrain\}/g, context.terrain || 'the ground');
        text = text.replace(/\{weapon\}/g, context.weaponType || 'weapon');

        return text;
    } catch { return null; }
}

// =================================================================
// SESSION 12D: RP COMBAT COMMANDS (Taunt, Intimidate, Rally)
// =================================================================

async function resolveRpCommand(db, battle, actor, target, rpType, effects, result, flavorText) {
    const settings = battle._settings || {};
    if (!settings.enable_rp_commands) {
        result.log.push('RP commands are not enabled.');
        return result;
    }

    // RP descriptions on RP commands get extra bonus
    let rpBonus = 0;
    if (flavorText && settings.enable_rp_descriptions) {
        const rpResult = await evaluateRpDescription(db, battle, actor, flavorText, 'taunt', settings);
        rpBonus = rpResult.bonus;
        for (const log of rpResult.log) result.log.push(log);
        if (flavorText.trim()) result.log.push(`💬 "${flavorText.trim()}"`);
    }

    switch (rpType) {
        case 'taunt': {
            const dmgBonus = (parseFloat(effects.self_damage_bonus) || 0.10) + rpBonus;
            const duration = effects.bonus_duration || 1;
            actor._tauntBonus = { damageBonus: dmgBonus, turnsLeft: duration };

            // Force AI to target the taunter
            if (target) target._taunted = { by: actor.charId, turnsLeft: effects.aggro_duration || 1 };

            // Narration
            const narration = await generateNarration(db, 'taunt', {
                actorName: actor.name, targetName: target?.name
            }, settings);

            result.log.push(narration || `😤 ${actor.name} taunts ${target?.name || 'the enemy'}!`);
            result.log.push(`Next attack: +${Math.round(dmgBonus * 100)}% damage!`);
            result.actions.push({ type: 'taunt', actor: actor.name, target: target?.name, dmgBonus });
            battle.addLog({ actor: actor.name, action: 'Taunt', text: `${actor.name} taunts!` });
            break;
        }
        case 'intimidate': {
            const baseChance = (parseFloat(effects.base_chance) || 0.50) + rpBonus;
            const atkReduction = parseFloat(effects.atk_reduction) || 0.15;
            const accReduction = parseFloat(effects.accuracy_reduction) || 0.10;
            const duration = effects.duration || 2;

            // Level-based check: higher level = more intimidating
            const levelRatio = (actor.level || 1) / Math.max(1, target?.level || 1);
            const chance = Math.min(0.90, baseChance * Math.min(2, levelRatio));

            const narration = await generateNarration(db, 'intimidate', {
                actorName: actor.name, targetName: target?.name
            }, settings);

            if (Math.random() < chance) {
                if (target) {
                    target._intimidated = {
                        atkReduction, accReduction,
                        turnsLeft: duration
                    };
                }
                result.log.push(narration || `👁️ ${actor.name} intimidates ${target?.name || 'the enemy'}!`);
                result.log.push(`${target?.name} is shaken! (-${Math.round(atkReduction * 100)}% ATK, -${Math.round(accReduction * 100)}% accuracy for ${duration} turns)`);
                result.actions.push({ type: 'intimidate', success: true, actor: actor.name, target: target?.name });
            } else {
                result.log.push(`${actor.name} tries to intimidate but ${target?.name || 'the enemy'} stands firm!`);
                result.actions.push({ type: 'intimidate', success: false, actor: actor.name });
            }
            battle.addLog({ actor: actor.name, action: 'Intimidate', text: `${actor.name} attempts intimidation` });
            break;
        }
        case 'rally': {
            const atkBonus = parseFloat(effects.atk_bonus) || 0.10;
            const spdBonus = parseFloat(effects.speed_bonus) || 0.10;
            const duration = effects.duration || 2;
            const totalBonus = atkBonus + rpBonus;

            // Rally affects all living allies
            const allies = battle.getAllyTeam?.(actor.charId) || [];
            for (const ally of allies) {
                ally._rallied = { atkBonus: totalBonus, speedBonus: spdBonus, turnsLeft: duration };
            }
            // Also affects self
            actor._rallied = { atkBonus: totalBonus, speedBonus: spdBonus, turnsLeft: duration };

            const narration = await generateNarration(db, 'rally', {
                actorName: actor.name
            }, settings);

            result.log.push(narration || `📣 ${actor.name} rallies the party!`);
            result.log.push(`All allies: +${Math.round(totalBonus * 100)}% ATK, +${Math.round(spdBonus * 100)}% Speed for ${duration} turns!`);
            result.actions.push({ type: 'rally', actor: actor.name, atkBonus: totalBonus, spdBonus, allies: allies.length + 1 });
            battle.addLog({ actor: actor.name, action: 'Rally', text: `${actor.name} rallies the party!` });
            break;
        }
    }

    return result;
}

// Tick RP buffs/debuffs at turn end
function tickRpEffects(combatant) {
    // Taunt bonus
    if (combatant._tauntBonus) {
        combatant._tauntBonus.turnsLeft--;
        if (combatant._tauntBonus.turnsLeft <= 0) combatant._tauntBonus = null;
    }
    // Taunted (aggro draw)
    if (combatant._taunted) {
        combatant._taunted.turnsLeft--;
        if (combatant._taunted.turnsLeft <= 0) combatant._taunted = null;
    }
    // Intimidated
    if (combatant._intimidated) {
        combatant._intimidated.turnsLeft--;
        if (combatant._intimidated.turnsLeft <= 0) combatant._intimidated = null;
    }
    // Rallied
    if (combatant._rallied) {
        combatant._rallied.turnsLeft--;
        if (combatant._rallied.turnsLeft <= 0) combatant._rallied = null;
    }
}

// =================================================================
// SESSION 9B: FLAVOR TEXT / RP BONUS
// =================================================================
// Evaluates a player's flavor text for damage bonus. Checks:
// 1. Minimum length → base bonus
// 2. Keyword matches (terrain-aware) → bonus per keyword
// 3. Admin template match → full template bonus
// Returns { bonus: 0-0.10, log: string[] }

async function evaluateFlavorText(db, battle, actor, flavorText, skillId, commandId, settings) {
    const result = { bonus: 0, log: [] };
    if (!settings?.enable_flavor_text || !flavorText) return result;
    if (typeof flavorText !== 'string') return result;

    const text = flavorText.trim();
    const textLower = text.toLowerCase();
    const minLength = settings.flavor_text_min_length || 20;
    const maxBonus = settings.flavor_text_max_bonus || 0.10;
    const baseBonus = settings.flavor_text_base_bonus || 0.05;
    const kwBonus = settings.flavor_text_keyword_bonus || 0.02;
    const kwMax = settings.flavor_text_keyword_max || 3;

    // 1. Length check — base bonus for writing anything meaningful
    if (text.length >= minLength) {
        result.bonus += baseBonus;
    } else {
        return result; // Too short — no bonus
    }

    // 2. Keyword matches
    try {
        const [keywords] = await db.query(
            'SELECT keyword, bonus_pct, terrain_match FROM game_flavor_keywords WHERE active=1');
        let kwMatches = 0;
        const actorTerrain = battle?.terrainMap?.[`${actor.gridX},${actor.gridY}`] || 'open';

        for (const kw of keywords) {
            if (kwMatches >= kwMax) break;
            if (!textLower.includes(kw.keyword.toLowerCase())) continue;
            // Terrain-aware keywords only give bonus if terrain matches
            if (kw.terrain_match && kw.terrain_match !== actorTerrain) continue;
            result.bonus += parseFloat(kw.bonus_pct) || kwBonus;
            kwMatches++;
        }
        if (kwMatches > 0) {
            result.log.push(`🎭 ${kwMatches} keyword${kwMatches > 1 ? 's' : ''} matched!`);
        }
    } catch {} // non-fatal

    // 3. Template match — check if text closely matches an admin-created template
    try {
        let templateQuery = 'SELECT text, bonus_pct FROM game_flavor_texts WHERE active=1 AND approved=1 AND is_template=1';
        const params = [];
        if (skillId) {
            templateQuery += ' AND (skill_id=? OR skill_id IS NULL)';
            params.push(skillId);
        }
        if (commandId) {
            templateQuery += ' AND (command_id=? OR command_id IS NULL)';
            params.push(commandId);
        }
        const [templates] = await db.query(templateQuery, params);
        for (const tmpl of templates) {
            const tmplLower = (tmpl.text || '').toLowerCase();
            // Simple similarity: check if player text contains most of the template words
            const tmplWords = tmplLower.split(/\s+/).filter(w => w.length > 3);
            const matchCount = tmplWords.filter(w => textLower.includes(w)).length;
            if (tmplWords.length > 0 && matchCount / tmplWords.length >= 0.6) {
                // Template match — use the template's bonus instead of base
                result.bonus = Math.max(result.bonus, parseFloat(tmpl.bonus_pct) || baseBonus);
                result.log.push(`🎭 Flavor text matches a known technique!`);
                break;
            }
        }
    } catch {} // non-fatal

    // Cap at max
    result.bonus = Math.min(maxBonus, result.bonus);
    if (result.bonus > 0) {
        result.log.push(`🎭 RP Bonus: +${Math.round(result.bonus * 100)}% damage!`);
    }

    // Session 11: Track flavor text for signature technique discovery
    // (async, non-blocking — discovery check happens in background)
    result._trackPromise = trackFlavorText(db, actor.charId, text, battle?.id, skillId, 0, settings);

    return result;
}

// =================================================================
// SESSION 9C: COMBO PROC SYSTEM
// =================================================================
// After a physical attack (or skill with combo_chance), roll for a free
// extra attack. Lower damage attacks have higher combo chance (Mado rule).
// Each chain hit reduces the proc chance by decay factor (default 50%).

async function resolveComboProc(db, battle, actor, target, comboChance, maxChain, actionName, result) {
    if (!battle._settings?.enable_combo_procs) return;
    if (!comboChance || comboChance <= 0 || maxChain <= 0) return;
    if (!target || target.currentHp <= 0 || target._knockedOut) return;

    const { checkDeathOrKnockout } = require('./combat');

    const decay = battle._settings?.combo_chain_decay || 0.50;
    const comboCrit = battle._settings?.combo_crit_chance || 0.03;
    let currentChance = comboChance;

    for (let chain = 0; chain < maxChain; chain++) {
        if (Math.random() >= currentChance) break;

        // COMBO! Extra attack
        result.log.push(`⚡ COMBO! ${actor.name} follows up with another strike!`);
        result.actions.push({ type: 'combo_proc', actor: actor.name, chain: chain + 1 });

        // Calculate combo hit damage (basic ATK formula, reduced)
        let comboDmg = Math.max(1, Math.floor(actor.atk * 1.5));

        // Combo crit check (3% from Mado)
        let comboCritHit = false;
        if (Math.random() < comboCrit) {
            comboDmg = Math.floor(comboDmg * 1.5);
            comboCritHit = true;
        }

        // Apply to target (with limb routing if active)
        const effectiveLimb = actor._targetLimb || null;
        if (battle._settings?.enable_limb_targeting && target._limbHp && effectiveLimb) {
            const limbRes = routeLimbDamage(target, comboDmg, effectiveLimb, battle._settings);
            target.currentHp = Math.max(0, target.currentHp - limbRes.mainDamage);
            if (target._limbHp) {
                target._woundLevels = getAllWoundLevels(target._limbHp, battle._settings);
                applyWoundPenalties(target, battle._settings);
            }
            result.log.push(`${comboCritHit ? '💥 CRIT! ' : ''}${target.name}'s ${limbRes.limbLabel} takes ${limbRes.limbDamage} combo damage!`);
            if (limbRes.limbDisabled) {
                result.log.push(`💀 ${target.name}'s ${limbRes.limbLabel} is disabled!`);
                result.actions.push({ type: 'limb_disabled', target: target.name, limb: limbRes.limbKey });
            }
            if (limbRes.knockedOut) {
                target._knockedOut = true;
                target.currentHp = 0;
            }
        } else {
            target.currentHp = Math.max(0, target.currentHp - comboDmg);
            result.log.push(`${comboCritHit ? '💥 CRIT! ' : ''}${target.name} takes ${comboDmg} combo damage!`);
        }

        result.actions.push({ type: 'combo_damage', target: target.name, amount: comboDmg, crit: comboCritHit, chain: chain + 1 });
        battle.addLog({ actor: actor.name, action: `Combo ${chain + 1}`, damage: comboDmg, crit: comboCritHit, target: target.name });

        // Check death from combo
        if (target.currentHp <= 0) {
            checkDeathOrKnockout(battle, actor, target, result);
            break;
        }

        // Decay chance for next chain
        currentChance *= decay;
    }
}

// =================================================================
// =================================================================
// SESSION 11: RESOLVE SIGNATURE TECHNIQUE IN COMBAT
// =================================================================

async function resolveSignatureTech(db, battle, actor, target, sigTech, result, targetLimb) {
    const settings = battle._settings || {};
    const { applyStatus, checkDeathOrKnockout } = require('./combat');
    const { applyBleed } = require('./systems');

    // Battle text
    const text = (sigTech.battleText || '{name} uses {skill}!')
        .replace('{name}', actor.name).replace('{skill}', sigTech.name);
    result.log.push(`⚡ ${text}`);
    result.actions.push({ type: 'sig_tech', name: sigTech.name, icon: sigTech.icon, actor: actor.name });

    if (sigTech.techType === 'ki_attack' || sigTech.techType === 'physical') {
        // Cost: % of current HP (ki) or flat MP (physical)
        const cost = Math.max(1, Math.floor(actor.currentHp * sigTech.costPct));
        if (sigTech.techType === 'ki_attack') {
            actor.currentHp = Math.max(1, actor.currentHp - cost); // can't kill yourself
            result.log.push(`(Cost: ${cost} HP)`);
        }

        // Damage: % of ATK or MO * modifier
        const baseStat = sigTech.techType === 'physical' ? actor.atk : actor.mo;
        let damage = Math.max(1, Math.floor(baseStat * (sigTech.damagePct / 0.10) * 2)); // scaled formula

        // Ability effects
        const fx = sigTech.abilityEffects || {};

        // Piercing: ignore % of defense
        if (fx.piercing) {
            const ignoreRate = fx.piercing;
            const defReduction = Math.floor((target.def || 0) * ignoreRate);
            damage += defReduction; // effectively ignoring that much defense
        }

        // Stun
        if (fx.stun_turns && target.currentHp > 0) {
            await applyStatus(db, target, 'Stun', fx.stun_turns, result);
        }

        // Guard crush — skip block defense (handled by flagging)
        // Guaranteed hit — skip dodge
        // These flags are checked by the caller or resolveDefense

        // Multi-hit
        const hits = fx.multi_hit || 1;
        const perHitDmg = hits > 1 ? Math.floor(damage / hits) : damage;
        let totalDmg = 0;

        for (let h = 0; h < hits; h++) {
            let hitDmg = Math.max(1, perHitDmg);

            // Element bonus
            if (sigTech.element) {
                // Simple: +10% for having an element
                hitDmg = Math.floor(hitDmg * 1.10);
            }

            // Limb routing
            if (settings.enable_limb_targeting && target._limbHp && targetLimb) {
                const limbRes = routeLimbDamage(target, hitDmg, targetLimb, settings);
                target.currentHp = Math.max(0, target.currentHp - limbRes.mainDamage);
                if (target._limbHp) {
                    target._woundLevels = getAllWoundLevels(target._limbHp, settings);
                    applyWoundPenalties(target, settings);
                }
                totalDmg += limbRes.mainDamage;
                if (hits > 1) result.log.push(`Hit ${h+1}: ${target.name}'s ${limbRes.limbLabel} takes ${limbRes.limbDamage}!`);
                else result.log.push(`${target.name}'s ${limbRes.limbLabel} takes ${limbRes.limbDamage} damage! (${limbRes.mainDamage} bleed-through)`);
            } else {
                target.currentHp = Math.max(0, target.currentHp - hitDmg);
                totalDmg += hitDmg;
                if (hits > 1) result.log.push(`Hit ${h+1}: ${target.name} takes ${hitDmg} damage!`);
                else result.log.push(`${target.name} takes ${hitDmg} damage!`);
            }

            result.actions.push({ type: 'sig_tech_damage', target: target.name, amount: hitDmg, hit: h+1, totalHits: hits });
            if (target.currentHp <= 0) break;
        }

        // Bleed from ability
        if (fx.bleed_tier && battle._bleedTiers && target.currentHp > 0) {
            applyBleed(target, fx.bleed_tier, battle._bleedTiers, result, battle._settings);
        }

        battle.addLog({ actor: actor.name, action: sigTech.name, damage: totalDmg, target: target.name });

        // Limit fill for defender
        if (target.maxHp > 0) {
            target.limitbreak = Math.min(100, (target.limitbreak || 0) + (totalDmg / target.maxHp) * 100 * 0.5);
        }

    } else if (sigTech.techType === 'ki_heal') {
        // Healing tech
        const cost = Math.max(1, Math.floor(actor.currentHp * sigTech.costPct));
        actor.currentHp = Math.max(1, actor.currentHp - cost);
        const healAmount = Math.floor(actor.maxHp * sigTech.healPct);
        const healTarget = target.teamId === actor.teamId ? target : actor;
        healTarget.currentHp = Math.min(healTarget.maxHp, healTarget.currentHp + healAmount);
        result.log.push(`${healTarget.name} recovers ${healAmount} HP! (Cost: ${cost} HP)`);
        result.actions.push({ type: 'sig_tech_heal', target: healTarget.name, amount: healAmount });

        // Regen limb ability
        const fx = sigTech.abilityEffects || {};
        if (fx.regen_limb && healTarget._limbHp && settings.enable_limb_targeting) {
            // Heal the most damaged limb fully
            let worstLimb = null, worstPct = 1;
            for (const [key, hp] of Object.entries(healTarget._limbHp)) {
                const pct = hp.current / hp.max;
                if (pct < worstPct) { worstLimb = key; worstPct = pct; }
            }
            if (worstLimb && worstPct < 1) {
                healTarget._limbHp[worstLimb].current = healTarget._limbHp[worstLimb].max;
                healTarget._woundLevels = getAllWoundLevels(healTarget._limbHp, settings);
                applyWoundPenalties(healTarget, settings);
                const zone = healTarget._limbZones?.find(z => z.key === worstLimb);
                result.log.push(`🩹 ${healTarget.name}'s ${zone?.label || worstLimb} is fully restored!`);
            }
        }
    }

    // Death/KO check
    if (target.currentHp <= 0) {
        checkDeathOrKnockout(battle, actor, target, result);
    }

    // XP and level-up
    await sigTechGainXP(db, sigTech.techId, settings);

    return result;
}

// Grant XP to a signature tech and check for level-up
async function sigTechGainXP(db, techId, settings) {
    const xpPerUse = settings?.sig_tech_xp_per_use || 10;
    try {
        await db.query(
            'UPDATE character_signature_techs SET total_uses=total_uses+1, current_xp=current_xp+? WHERE id=?',
            [xpPerUse, techId]);

        // Check level-up
        const [techRow] = await db.query('SELECT current_level, current_xp FROM character_signature_techs WHERE id=?', [techId]);
        if (!techRow.length) return null;
        const { current_level, current_xp } = techRow[0];

        const [nextLevel] = await db.query(
            'SELECT level, xp_required FROM game_signature_levels WHERE level=?', [current_level + 1]);
        if (!nextLevel.length) return null; // already max level

        if (current_xp >= nextLevel[0].xp_required) {
            await db.query(
                'UPDATE character_signature_techs SET current_level=? WHERE id=?',
                [current_level + 1, techId]);

            // Check if new ability slot unlocked
            const [newLevelInfo] = await db.query(
                'SELECT ability_slots FROM game_signature_levels WHERE level=?', [current_level + 1]);
            const [oldLevelInfo] = await db.query(
                'SELECT ability_slots FROM game_signature_levels WHERE level=?', [current_level]);
            const newSlots = newLevelInfo.length ? newLevelInfo[0].ability_slots : 0;
            const oldSlots = oldLevelInfo.length ? oldLevelInfo[0].ability_slots : 0;

            return {
                leveledUp: true,
                newLevel: current_level + 1,
                newAbilitySlot: newSlots > oldSlots
            };
        }
        return null;
    } catch { return null; }
}

module.exports = {
    extractKeywords,
    trackFlavorText,
    checkTechDiscovery,
    trainUnderMaster,
    evaluateRpDescription,
    generateNarration,
    resolveRpCommand,
    tickRpEffects,
    evaluateFlavorText,
    resolveComboProc,
    resolveSignatureTech,
    sigTechGainXP
};
