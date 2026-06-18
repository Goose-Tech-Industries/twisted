// =================================================================
// COMMANDS & BROADCAST — Available actions + state broadcasting
// =================================================================

const { jp, queryLimitBreaksList } = require('./stats');
const { activeBattles } = require('./state');

// =================================================================
// HELPERS
// =================================================================
async function getAvailableCommands(db, stats) {
    // Get default commands
    const [defaults] = await db.query("SELECT * FROM game_battle_commands WHERE is_default=1 ORDER BY display_order");

    // Get class-specific commands
    const [classRow] = await db.query("SELECT battle_cmds FROM game_classes WHERE id=?", [stats.classId]);
    let extraCmds = [];
    if (classRow.length) {
        const extraIds = jp(classRow[0].battle_cmds, []);
        if (extraIds.length) {
            const [extras] = await db.query("SELECT * FROM game_battle_commands WHERE id IN (?) ORDER BY display_order", [extraIds]);
            extraCmds = extras;
        }
    }

    // Get available skills for this class at this level
    const [skills] = await db.query(`
        SELECT gs.*, gcs.mp_cost, gcs.alt_name FROM game_class_skills gcs
        JOIN game_skills gs ON gcs.skill_id = gs.id
        WHERE gcs.class_id = ? AND gcs.learn_level <= ?
        ORDER BY gcs.learn_level`, [stats.classId, stats.level]);

    // Ogham-granted bonus skills (grant_skill_id on equipped oghams)
    // TEACHING: Some legendary oghams grant a skill you wouldn't normally have.
    // We load those skills here and merge them in with a special ogham_granted flag.
    const oghamSkillIds = [];
    if (stats.charId) {
        try {
            const [ogRows] = await db.query(
                `SELECT go.grant_skill_id FROM character_oghams co
                 JOIN game_oghams go ON go.id = co.ogham_id
                 WHERE co.character_id = ? AND go.grant_skill_id IS NOT NULL`,
                [stats.charId]
            );
            for (const r of ogRows) if (r.grant_skill_id) oghamSkillIds.push(r.grant_skill_id);
        } catch { /* non-critical */ }
    }
    let oghamSkills = [];
    if (oghamSkillIds.length) {
        // Avoid duplicates with already-known class skills
        const knownIds = new Set(skills.map(s => s.id));
        const newIds   = oghamSkillIds.filter(id => !knownIds.has(id));
        if (newIds.length) {
            const [granted] = await db.query(
                'SELECT *, 0 AS mp_cost, NULL AS alt_name FROM game_skills WHERE id IN (?)',
                [newIds]
            );
            oghamSkills = granted.map(s => ({ ...s, oghamGranted: true }));
        }
    }
    // Master-taught skills (from character_learned_skills, not in class list)
    let masterSkills = [];
    if (stats.charId) {
        try {
            const knownIds = new Set([...skills.map(s => s.id), ...oghamSkills.map(s => s.id)]);
            const [learned] = await db.query(
                `SELECT gs.*, 0 AS mp_cost, NULL AS alt_name FROM character_learned_skills cls
                 JOIN game_skills gs ON gs.id = cls.skill_id
                 WHERE cls.character_id=?`, [stats.charId]);
            masterSkills = learned.filter(s => !knownIds.has(s.id)).map(s => ({ ...s, masterTaught: true }));
        } catch {}
    }
    const allSkills = [...skills, ...oghamSkills, ...masterSkills];

    // Get available limit breaks
    const limits = await queryLimitBreaksList(db, stats.classId, stats.level, stats.breaklevel);

    // Get consumable items
    const [items] = await db.query(`
        SELECT gi.*, ci.quantity FROM character_items ci
        JOIN game_items gi ON ci.item_id = gi.id
        WHERE ci.character_id = ? AND gi.type = 'CONSUMABLE'`,
        [stats.charId]);

    // Filter out disabled commands (from status effects)
    let disabledCmds = [];
    for (const s of stats.statuses) {
        const [sRows] = await db.query("SELECT disabled_commands FROM game_statuses WHERE id=?", [s.id]);
        if (sRows.length) {
            const disabled = jp(sRows[0].disabled_commands, []);
            if (disabled.includes(-1)) disabledCmds = [-1]; // -1 = all disabled
            else disabledCmds.push(...disabled);
        }
    }

    const cmds = [...defaults, ...extraCmds].map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        description: c.description,
        targetType: c.target_type,
        disabled: disabledCmds.includes(-1) || disabledCmds.includes(c.id)
    }));

    // Build opponent status name set for combo detection
    // NOTE: at command-build time we don't have the live opponent object,
    // so we pass it in via stats._opponentStatuses (set in processAction before
    // calling getAvailableCommands for the re-send after each turn).
    const oppStatuses = new Set((stats._opponentStatuses || []).map(s => s.name.toLowerCase()));

    return {
        commands: cmds,
        skills: allSkills.map(s => {
            const fx = jp(s.effects, {});
            const req = fx.combo_requires;
            const comboReady = req && req.status && oppStatuses.has(req.status.toLowerCase());
            const mpBase = s.mp_cost;
            // MAGIC STANCE: 30% MP discount
            const mpCost = stats._stance === 'MAGIC'
                ? Math.floor(mpBase * 0.7)
                : mpBase;
            return {
                id: s.id,
                name: s.alt_name || s.name,
                icon: s.icon,
                mpCost,
                type: s.type,
                targetType: s.target_type,
                description: s.description,
                comboReady,
                comboLabel: req ? req.message || `COMBO: ${req.status}` : null,
                hits: fx.hits || 1,
                chargeTurns: fx.charge_turns || 0,
            };
        }),
        limits: limits.map(l => ({
            id: l.id,
            name: l.name,
            icon: l.icon,
            breakLevel: l.break_level,
            targetType: l.target_type,
            description: l.description
        })),
        items: items.map(i => ({
            id: i.id,
            name: i.name,
            icon: i.icon,
            quantity: i.quantity
        })),
        // Session 11: Signature techniques (loaded separately)
        signatureTechs: [] // populated by caller if sig techs are enabled
    };
}

// -----------------------------------------------------------------
// BROADCAST UPDATE (Fixed)
// -----------------------------------------------------------------
async function broadcastBattleUpdate(io, battle, actionResult, db) {
    const room = `battle_${battle.id}`;

    try {
        const sockets = await io.in(room).fetchSockets();
        if (sockets && sockets.length) {
            for (const s of sockets) {
                const viewerCharId = s._battleCharId;
                const state = battle.toClientState(viewerCharId);

                // Re-build available commands with LIVE opponent statuses + stance
                // so the combo badge and MP costs are always accurate this turn.
                let commands = null;
                if (viewerCharId && battle.combatants[viewerCharId] && db) {
                    try {
                        const liveCombatant = battle.combatants[viewerCharId];
                        const liveOpponent  = battle.getOpponent(viewerCharId);
                        // Inject live fields into the stats snapshot (we don't have
                        // the original stats object here, so we build a minimal shim)
                        const statsShim = {
                            ...liveCombatant,
                            _opponentStatuses: liveOpponent ? liveOpponent.statuses : [],
                            _stance:           liveCombatant._stance || null
                        };
                        commands = await getAvailableCommands(db, statsShim);
                        // Session 11: Include signature techs
                        if (battle._settings?.enable_signature_techs) {
                            try {
                                commands.signatureTechs = await getSignatureTechs(db, viewerCharId);
                            } catch {}
                        }
                    } catch { /* non-fatal — client falls back to last known commands */ }
                }

                s.emit('battle_update', { state, action: actionResult || null, commands });
            }
            return;
        }
    } catch (e) {
        // Fall through to the public update.
    }

    const publicState = battle.toClientState(null);
    io.to(room).emit('battle_update', { state: publicState, action: actionResult || null });

    // AI battle narration (non-blocking)
    if (actionResult?.actions?.length) {
        const dmgAction = actionResult.actions.find(a => a.type === 'skill_damage' || a.type === 'reflect_damage');
        if (dmgAction) {
            const ai = require('./ai-features');
            ai.narrateBattle(db, {
                attackerName: actionResult.actor || 'Attacker',
                targetName: dmgAction.target || 'Target',
                skillName: dmgAction.skill || 'Attack',
                damage: dmgAction.amount || 0,
                isCrit: actionResult.log?.some(l => l.includes('CRITICAL')) || false,
                isKill: actionResult.log?.some(l => l.includes('defeated') || l.includes('knocked')) || false,
            }).then(narration => {
                if (narration) io.to(room).emit('battle_chat_msg', {
                    from: 'Narrator', fromCharId: 0, teamId: 0,
                    text: narration, ts: Date.now()
                });
            }).catch(() => {});
        }
    }
}

// ── SESSION 11: Get player's signature techs for battle commands ──
async function getSignatureTechs(db, charId) {
    try {
        const [techs] = await db.query(
            `SELECT st.*, sl.damage_pct, sl.cost_pct, sl.heal_pct
             FROM character_signature_techs st
             JOIN game_signature_levels sl ON sl.level = st.current_level
             WHERE st.character_id = ?`, [charId]);

        const result = [];
        for (const tech of techs) {
            // Load equipped abilities
            const [abilities] = await db.query(
                `SELECT sa.* FROM character_sig_tech_abilities csa
                 JOIN game_signature_abilities sa ON sa.id = csa.ability_id
                 WHERE csa.tech_id = ?`, [tech.id]);

            // Calculate modified damage/cost from abilities
            let damagePct = parseFloat(tech.damage_pct);
            let costPct = parseFloat(tech.cost_pct);
            let healPct = parseFloat(tech.heal_pct);
            let dodgeMod = 0;
            const abilityEffects = {};
            for (const ab of abilities) {
                damagePct += parseFloat(ab.damage_modifier) || 0;
                costPct += parseFloat(ab.cost_modifier) || 0;
                dodgeMod += parseFloat(ab.dodge_modifier) || 0;
                const fx = jp(ab.effects, {});
                Object.assign(abilityEffects, fx);
            }

            result.push({
                techId: tech.id,
                name: tech.name,
                icon: tech.icon || '⚡',
                techType: tech.tech_type,
                level: tech.current_level,
                xp: tech.current_xp,
                totalUses: tech.total_uses,
                element: tech.element,
                battleText: tech.battle_text,
                damagePct: Math.max(0.01, damagePct),
                costPct: Math.max(0, costPct),
                healPct: Math.max(0, healPct),
                dodgeMod,
                abilities: abilities.map(a => ({ id: a.id, name: a.name, label: a.label, icon: a.icon })),
                abilityEffects,
                isSigTech: true
            });
        }
        return result;
    } catch { return []; }
}

module.exports = { getAvailableCommands, broadcastBattleUpdate, getSignatureTechs };
