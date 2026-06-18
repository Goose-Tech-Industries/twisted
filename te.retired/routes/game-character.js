const express = require('express');
const router = express.Router();
let db;
router.init = (c) => { db = c; };

// Helper: get userId from the server-side session
function uid(req) { return req.session && req.session.userId; }

router.get('/creation-data', async (req, res) => {
    try {
        const [classes]=await db.query("SELECT * FROM game_classes WHERE hidden=0");
        const [races]=await db.query("SELECT * FROM game_races WHERE hidden=0");
        const [backgrounds]=await db.query("SELECT * FROM game_backgrounds");
        const [feats]=await db.query("SELECT * FROM game_feats");
        const [settingsRows]=await db.query("SELECT * FROM system_settings");
        const config = {};
        settingsRows.forEach(r => { config[r.setting_key] = r.setting_value==='true'?true:r.setting_value==='false'?false:r.setting_value; });
        // Ability scores system
        let abilityScores = [], abilityEffects = [], raceAbilityBonuses = [];
        let classAbilityBonuses = [], bgAbilityBonuses = [], raceClassAccess = [];
        try {
            [abilityScores] = await db.query("SELECT * FROM game_ability_scores ORDER BY sort_order");
            [abilityEffects] = await db.query("SELECT * FROM game_ability_effects");
            [raceAbilityBonuses] = await db.query("SELECT * FROM game_race_ability_bonuses");
            [classAbilityBonuses] = await db.query("SELECT * FROM game_class_ability_bonuses");
            [bgAbilityBonuses] = await db.query("SELECT * FROM game_background_ability_bonuses");
            [raceClassAccess] = await db.query("SELECT * FROM game_race_class_access");
        } catch {}
        res.json({ success:true, config, data:{classes,races,backgrounds,feats,abilityScores,abilityEffects,raceAbilityBonuses,classAbilityBonuses,bgAbilityBonuses,raceClassAccess} });
    } catch(e) { res.json({success:false,message:'Server error.'}); }
});

router.post('/create-character', async (req, res) => {
    const userId = uid(req);
    const {name,raceId,classId,backgroundId,featId}=req.body;
    if(!name||!name.trim()) return res.json({success:false,message:"Name required."});
    if(name.trim().length < 2 || name.trim().length > 20) return res.json({success:false,message:"Character name must be 2–20 characters."});
    if(!/^[a-zA-Z][a-zA-Z0-9 '\-]*$/.test(name.trim())) return res.json({success:false,message:"Name may only contain letters, numbers, spaces, hyphens, apostrophes."});
    if(!userId) return res.json({success:false,message:"Not logged in."});
    try {
        const [taken]=await db.query("SELECT id FROM characters WHERE name=?",[name.trim()]);
        if(taken.length) return res.json({success:false,message:"Name taken."});
        const [sR]=await db.query("SELECT setting_value FROM system_settings WHERE setting_key='max_characters_per_user'");
        const max=sR.length?parseInt(sR[0].setting_value):3;
        const [ex]=await db.query("SELECT COUNT(*) as cnt FROM characters WHERE user_id=?",[userId]);
        if(ex[0].cnt>=max) return res.json({success:false,message:`Max ${max} characters.`});
        const [cR]=await db.query("SELECT * FROM game_classes WHERE id=?",[classId]);
        const [rR]=await db.query("SELECT * FROM game_races WHERE id=?",[raceId]);
        if(!cR.length||!rR.length) return res.json({success:false,message:"Invalid class/race."});
        const c=cR[0],r=rR[0];
        // Background — now supports full stat bonuses
        let bg = { bonus_hp:0, bonus_mp:0, bonus_atk:0, bonus_def:0,
                   bonus_mo:0, bonus_md:0, bonus_speed:0, bonus_luck:0 };
        if (backgroundId > 0) {
            const [bR] = await db.query("SELECT * FROM game_backgrounds WHERE id=?", [backgroundId]);
            if (bR.length) bg = bR[0];
        }

        // Feat — apply effect_json stat bonuses at creation
        let featBonus = { hp:0, mp:0, atk:0, def:0, mo:0, md:0, speed:0, luck:0 };
        let startGold = 0;
        if (featId > 0) {
            const [fR] = await db.query("SELECT * FROM game_feats WHERE id=?", [featId]);
            if (fR.length && fR[0].effect_json) {
                try {
                    const ef = typeof fR[0].effect_json === 'string'
                        ? JSON.parse(fR[0].effect_json)
                        : fR[0].effect_json;
                    const sb = ef.stat_bonus || {};
                    featBonus.hp    = parseInt(sb.hp    || sb.bonus_hp    || 0);
                    featBonus.mp    = parseInt(sb.mp    || sb.bonus_mp    || 0);
                    featBonus.atk   = parseInt(sb.atk   || sb.bonus_atk   || 0);
                    featBonus.def   = parseInt(sb.def   || sb.bonus_def   || 0);
                    featBonus.mo    = parseInt(sb.mo    || sb.bonus_mo    || 0);
                    featBonus.md    = parseInt(sb.md    || sb.bonus_md    || 0);
                    featBonus.speed = parseInt(sb.speed || sb.bonus_speed || 0);
                    featBonus.luck  = parseInt(sb.luck  || sb.bonus_luck  || 0);
                    startGold       = parseInt(ef.start_gold || 0);
                } catch(e) { console.warn('[char create] feat effect_json parse error:', e.message); }
            }
        }

        const hp  = (c.base_hp||100)    + (r.bonus_hp||0)    + (bg.bonus_hp||0)    + featBonus.hp;
        const mp  = (c.base_mp||50)     + (r.bonus_mp||0)    + (bg.bonus_mp||0)    + featBonus.mp;
        const atk = (c.base_atk||10)    + (r.bonus_atk||0)   + (bg.bonus_atk||0)   + featBonus.atk;
        const def = (c.base_def||5)     + (r.bonus_def||0)   + (bg.bonus_def||0)   + featBonus.def;
        const mo  = (c.base_mo||5)      + (r.bonus_mo||0)    + (bg.bonus_mo||0)    + featBonus.mo;
        const md  = (c.base_md||5)      + (r.bonus_md||0)    + (bg.bonus_md||0)    + featBonus.md;
        const spd = (c.base_speed||10)  + (r.bonus_speed||0) + (bg.bonus_speed||0) + featBonus.speed;
        const lck = (c.base_luck||5)    + (r.bonus_luck||0)  + (bg.bonus_luck||0)  + featBonus.luck;
        const [result]=await db.query(`INSERT INTO characters (user_id,name,race_id,class_id,background_id,feat_id,current_hp,max_hp,current_mp,max_mp,atk,def,mo,md,speed,luck,level,experience,map_id,x,y,state_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,1,10,10,'{}')`,
            [userId,name.trim(),raceId,classId,backgroundId||0,featId||0,hp,hp,mp,mp,atk,def,mo,md,spd,lck]);
        const newId=result.insertId;
        const [statDefs]=await db.query("SELECT * FROM game_stat_definitions");
        for(const s of statDefs) await db.query("INSERT INTO character_stats(character_id,stat_key,current_value,max_value)VALUES(?,?,?,?)",[newId,s.key_name,s.default_value,s.default_value]);
        // Apply feat starting gold bonus
        if (startGold > 0) {
            await db.query("UPDATE users SET currency=currency+? WHERE id=?", [startGold, userId]);
        }
        // Save ability scores if provided
        const abilityScores = req.body.abilityScores;
        if (abilityScores && typeof abilityScores === 'object') {
            for (const [key, val] of Object.entries(abilityScores)) {
                const base = parseInt(val) || 8;
                await db.query(
                    'INSERT INTO character_ability_scores (character_id, ability_key, base_value) VALUES (?,?,?) ON DUPLICATE KEY UPDATE base_value=?',
                    [newId, key, base, base]
                ).catch(() => {});
            }
            // Apply racial + class + background ability bonuses
            try {
                const [raceBonuses] = await db.query('SELECT ab.key_name, rab.bonus FROM game_race_ability_bonuses rab JOIN game_ability_scores ab ON ab.id=rab.ability_id WHERE rab.race_id=?', [raceId]);
                const [classBonuses] = await db.query('SELECT ab.key_name, cab.bonus FROM game_class_ability_bonuses cab JOIN game_ability_scores ab ON ab.id=cab.ability_id WHERE cab.class_id=?', [classId]).catch(() => [[]]);
                const [bgBonuses] = backgroundId ? await db.query('SELECT ab.key_name, bab.bonus FROM game_background_ability_bonuses bab JOIN game_ability_scores ab ON ab.id=bab.ability_id WHERE bab.background_id=?', [backgroundId]).catch(() => [[]]) : [[]];
                // Combine all bonuses per ability
                const totalBonuses = {};
                for (const b of [...raceBonuses, ...(classBonuses||[]), ...(bgBonuses||[])]) {
                    totalBonuses[b.key_name] = (totalBonuses[b.key_name] || 0) + b.bonus;
                }
                for (const [key, bonus] of Object.entries(totalBonuses)) {
                    await db.query(
                        'UPDATE character_ability_scores SET bonus_value=? WHERE character_id=? AND ability_key=?',
                        [bonus, newId, key]
                    ).catch(() => {});
                }
            } catch {}
        }
        // Grant starting skills (class skills with learn_level=1)
        try {
            const [startingSkills] = await db.query(
                'SELECT skill_id FROM game_class_skills WHERE class_id=? AND learn_level<=1', [classId]);
            for (const s of startingSkills) {
                await db.query(
                    'INSERT IGNORE INTO character_learned_skills (character_id, skill_id, learned_from) VALUES (?,?,?)',
                    [newId, s.skill_id, 'starting']
                );
            }
        } catch {}

        res.json({success:true,message:"Character created!",charId:newId});
    } catch(e) { console.error(e); res.json({success:false,message:"Server error."}); }
});

// ── Release (delete) a dead character ─────────────────────────────
router.post('/release-character', async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.json({ success: false, message: 'Login required' });
    const { charId } = req.body;
    if (!charId) return res.json({ success: false, message: 'charId required' });
    try {
        // Verify ownership AND death
        const [[char]] = await db.query(
            'SELECT id, name, current_hp FROM characters WHERE id=? AND user_id=?', [charId, userId]
        );
        if (!char) return res.json({ success: false, message: 'Character not found' });
        if (char.current_hp > 0) return res.json({ success: false, message: 'Only fallen characters can be released.' });

        // Disconnect if somehow online
        if (global._onlinePlayers) {
            const entry = Object.entries(global._onlinePlayers).find(([, p]) => p.charId === parseInt(charId));
            if (entry) {
                const sock = global._io?.sockets?.sockets?.get(entry[0]);
                if (sock) sock.disconnect(true);
                delete global._onlinePlayers[entry[0]];
            }
        }

        // Clean up related data
        const tables = [
            'character_items', 'character_equipment', 'character_stats',
            'character_ability_scores', 'character_skills', 'character_oghams',
            'character_quests', 'character_mail', 'character_fighting_styles',
            'character_signature_techs',
        ];
        for (const tbl of tables) {
            await db.query('DELETE FROM ?? WHERE character_id=?', [tbl, charId]).catch(() => {});
        }
        await db.query('DELETE FROM characters WHERE id=?', [charId]);

        res.json({ success: true, message: `${char.name} has been released to the void.` });
    } catch(e) {
        console.error('[ReleaseChar]', e);
        res.json({ success: false, message: 'Server error' });
    }
});

// ── Revive a dead character using a revival item ──────────────────
router.post('/revive-character', async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.json({ success: false, message: 'Login required' });
    const { charId, itemId } = req.body;
    if (!charId || !itemId) return res.json({ success: false, message: 'charId and itemId required' });
    try {
        // Verify ownership + death
        const [[char]] = await db.query(
            'SELECT id, name, current_hp, max_hp, max_mp FROM characters WHERE id=? AND user_id=?', [charId, userId]
        );
        if (!char) return res.json({ success: false, message: 'Character not found' });
        if (char.current_hp > 0) return res.json({ success: false, message: 'Character is not dead.' });

        // Verify the user owns the revival item (check account-level or character inventory)
        // Check if user has it in ANY character's inventory
        const [[invItem]] = await db.query(
            `SELECT ci.id, ci.character_id, gi.name AS item_name, gi.stats_json
             FROM character_items ci
             JOIN game_items gi ON gi.id = ci.item_id
             JOIN characters c ON c.id = ci.character_id AND c.user_id = ?
             WHERE ci.item_id = ? LIMIT 1`, [userId, itemId]
        );
        if (!invItem) return res.json({ success: false, message: 'You don\'t have this item.' });

        // Parse revival stats
        let stats = {};
        try { stats = JSON.parse(invItem.stats_json || '{}'); } catch {}
        if (!stats.revival) return res.json({ success: false, message: 'This item cannot revive characters.' });

        const revivePct = stats.revival_pct || 50;
        const newHp = Math.max(1, Math.floor(char.max_hp * (revivePct / 100)));
        const newMp = Math.max(0, Math.floor(char.max_mp * (revivePct / 100)));

        // Revive the character
        await db.query(
            'UPDATE characters SET current_hp=?, current_mp=? WHERE id=?',
            [newHp, newMp, charId]
        );

        // Consume the item (delete one from inventory)
        await db.query('DELETE FROM character_items WHERE id=? LIMIT 1', [invItem.id]);

        res.json({
            success: true,
            message: `${char.name} has been revived by ${invItem.item_name}! HP restored to ${newHp}/${char.max_hp}.`,
            newHp, newMp
        });
    } catch(e) {
        console.error('[ReviveChar]', e);
        res.json({ success: false, message: 'Server error' });
    }
});

// ── Get revival items the user owns across all characters ─────────
router.get('/revival-items', async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.json({ success: false, message: 'Login required' });
    try {
        const [items] = await db.query(
            `SELECT gi.id AS item_id, gi.name, gi.icon, gi.description, gi.stats_json, COUNT(*) AS quantity
             FROM character_items ci
             JOIN game_items gi ON gi.id = ci.item_id
             JOIN characters c ON c.id = ci.character_id AND c.user_id = ?
             WHERE gi.stats_json LIKE '%"revival"%'
             GROUP BY gi.id`, [userId]
        );
        res.json({ success: true, data: items });
    } catch(e) {
        res.json({ success: true, data: [] });
    }
});

// ── Respec ability scores ─────────────────────────────────────────
router.post('/respec-abilities', async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.json({ success: false, message: 'Login required' });
    const { charId, abilityScores, useItem } = req.body;
    if (!charId) return res.json({ success: false, message: 'charId required' });
    try {
        // Verify ownership
        const [[char]] = await db.query('SELECT id, user_id, last_respec_at FROM characters WHERE id=? AND user_id=?', [charId, userId]);
        if (!char) return res.json({ success: false, message: 'Character not found' });

        // Check settings
        const [settings] = await db.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('respec_enabled','respec_gold_cost','respec_cooldown_hours','respec_item_id')");
        const cfg = {};
        for (const s of settings) cfg[s.setting_key] = s.setting_value;
        if (cfg.respec_enabled !== 'true') return res.json({ success: false, message: 'Ability respec is currently disabled.' });

        // Cooldown check
        const cooldownHours = parseInt(cfg.respec_cooldown_hours) || 24;
        if (char.last_respec_at) {
            const hoursSince = (Date.now() - new Date(char.last_respec_at).getTime()) / 3600000;
            if (hoursSince < cooldownHours) {
                const remaining = Math.ceil(cooldownHours - hoursSince);
                return res.json({ success: false, message: `Respec on cooldown. ${remaining} hour${remaining !== 1 ? 's' : ''} remaining.` });
            }
        }

        // Item OR gold cost
        const respecItemId = parseInt(cfg.respec_item_id) || 0;
        if (useItem && respecItemId > 0) {
            // Check if player has the respec item
            const [[item]] = await db.query(
                'SELECT ci.id FROM character_items ci JOIN game_items gi ON gi.id=ci.item_id WHERE ci.character_id=? AND ci.item_id=? LIMIT 1',
                [charId, respecItemId]
            );
            if (!item) return res.json({ success: false, message: 'You don\'t have a respec item.' });
            await db.query('DELETE FROM character_items WHERE id=? LIMIT 1', [item.id]);
        } else {
            // Gold cost
            const goldCost = parseInt(cfg.respec_gold_cost) || 500;
            const [[user]] = await db.query('SELECT currency FROM users WHERE id=?', [userId]);
            if ((user?.currency || 0) < goldCost) return res.json({ success: false, message: `Not enough gold. Need ${goldCost}g.` });
            await db.query('UPDATE users SET currency=currency-? WHERE id=?', [goldCost, userId]);
        }

        // Apply new scores — validate point budget first
        if (abilityScores && typeof abilityScores === 'object') {
            // Load current scores to get the original point total
            const [currentScores] = await db.query(
                'SELECT ability_key, base_value FROM character_ability_scores WHERE character_id=?', [charId]
            );
            const originalTotal = currentScores.reduce((sum, s) => sum + (s.base_value || 8), 0);
            const validKeys = new Set(currentScores.map(s => s.ability_key));

            // Validate: new total must equal original total, each score 1-30, only valid keys
            let newTotal = 0;
            const sanitized = {};
            for (const [key, val] of Object.entries(abilityScores)) {
                if (!validKeys.has(key)) continue; // ignore unknown ability keys
                const score = parseInt(val) || 8;
                if (score < 1 || score > 30) return res.json({ success: false, message: `${key} must be between 1 and 30.` });
                sanitized[key] = score;
                newTotal += score;
            }
            // Fill in any keys the client didn't send with their current values
            for (const row of currentScores) {
                if (!(row.ability_key in sanitized)) {
                    sanitized[row.ability_key] = row.base_value;
                    newTotal += row.base_value;
                }
            }
            if (newTotal !== originalTotal) {
                return res.json({ success: false, message: `Point budget mismatch. You have ${originalTotal} points to distribute, but sent ${newTotal}.` });
            }

            for (const [key, val] of Object.entries(sanitized)) {
                await db.query(
                    'UPDATE character_ability_scores SET base_value=? WHERE character_id=? AND ability_key=?',
                    [val, charId, key]
                ).catch(() => {});
            }
        }

        await db.query('UPDATE characters SET last_respec_at=NOW() WHERE id=?', [charId]);
        res.json({ success: true, message: 'Abilities reallocated!' });
    } catch(e) {
        console.error('[Respec]', e);
        res.json({ success: false, message: 'Server error' });
    }
});

// ── Character Appearance ──────────────────────────────────────────
router.post('/update-appearance', async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Login required.' });
    const { charId, appearance } = req.body;
    if (!charId || !appearance) return res.json({ success: false, message: 'charId and appearance required.' });
    try {
        // Verify ownership
        const [rows] = await db.query('SELECT id FROM characters WHERE id=? AND user_id=?', [charId, userId]);
        if (!rows.length) return res.json({ success: false, message: 'Character not found or not yours.' });

        // Ensure column exists
        await db.query(
            `ALTER TABLE characters ADD COLUMN IF NOT EXISTS appearance_json JSON DEFAULT NULL`
        ).catch(() => {}); // older MySQL — silently ignore if not supported

        await db.query(
            'UPDATE characters SET appearance_json=? WHERE id=?',
            [JSON.stringify(appearance), charId]
        );
        // Broadcast appearance update to other players on same map
        if (global._io && global._onlinePlayers) {
            const player = Object.values(global._onlinePlayers).find(p => p.charId === parseInt(charId));
            if (player) {
                global._io.to('map_' + player.mapId).emit('player_appearance', {
                    charId: parseInt(charId), appearance
                });
            }
        }
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

router.post('/my-characters', async (req, res) => {
    try {
        const [rows]=await db.query(`SELECT c.id,c.name,c.level,c.current_hp,c.max_hp,c.current_mp,c.max_mp,c.atk,c.def,c.mo,c.md,c.speed,c.luck,c.map_id,c.x,c.y,c.experience,cl.name as class_name,r.name as race_name FROM characters c JOIN game_classes cl ON c.class_id=cl.id JOIN game_races r ON c.race_id=r.id WHERE c.user_id=?`,[uid(req)]);
        res.json({success:true,count:rows.length,characters:rows});
    } catch { res.json({success:false,count:0,characters:[]}); }
});

// ── Referral System ──────────────────────────────────────────────
// Get or generate my referral code
router.get('/my-referral-code', async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.json({ success: false, message: 'Login required' });
    try {
        const [[user]] = await db.query('SELECT referral_code, referral_count FROM users WHERE id=?', [userId]);
        if (!user) return res.json({ success: false });
        let code = user.referral_code;
        if (!code) {
            code = Math.random().toString(36).slice(2, 10).toUpperCase();
            await db.query('UPDATE users SET referral_code=? WHERE id=?', [code, userId]);
        }
        // Get referral stats
        const [referrals] = await db.query(
            'SELECT status, COUNT(*) AS n FROM game_referrals WHERE referrer_user_id=? GROUP BY status', [userId]
        );
        const stats = { pending: 0, qualified: 0, rewarded: 0 };
        for (const r of referrals) stats[r.status] = r.n;
        res.json({ success: true, code, count: user.referral_count, stats });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// Apply a referral code during registration (called from auth routes)
router.post('/apply-referral', async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.json({ success: false, message: 'Login required' });
    const { code } = req.body;
    if (!code) return res.json({ success: false, message: 'Code required' });
    try {
        // Check settings
        const [settings] = await db.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'referral%'");
        const cfg = {};
        for (const s of settings) cfg[s.setting_key] = s.setting_value;
        if (cfg.referral_enabled !== 'true') return res.json({ success: false, message: 'Referral system is disabled' });

        // Check code exists
        const [[referrer]] = await db.query('SELECT id FROM users WHERE referral_code=? AND id!=?', [code.toUpperCase(), userId]);
        if (!referrer) return res.json({ success: false, message: 'Invalid referral code' });

        // Check not already referred
        const [[existing]] = await db.query('SELECT id FROM game_referrals WHERE referred_user_id=?', [userId]);
        if (existing) return res.json({ success: false, message: 'You have already used a referral code' });

        // Create referral
        await db.query(
            'INSERT INTO game_referrals (referrer_user_id, referred_user_id, referral_code) VALUES (?,?,?)',
            [referrer.id, userId, code.toUpperCase()]
        );
        await db.query('UPDATE users SET referred_by_code=? WHERE id=?', [code.toUpperCase(), userId]);

        // Give the referred player their bonus
        const bonusGold = parseInt(cfg.referral_referred_bonus_gold) || 0;
        if (bonusGold > 0) {
            await db.query('UPDATE users SET currency=currency+? WHERE id=?', [bonusGold, userId]);
        }

        res.json({ success: true, message: `Referral applied! You received ${bonusGold}g bonus.` });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// Check referral qualification on level up (called from battle engine or level handler)
router.checkReferralQualification = async function(db, userId, charLevel) {
    try {
        const [settings] = await db.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'referral%'");
        const cfg = {};
        for (const s of settings) cfg[s.setting_key] = s.setting_value;
        if (cfg.referral_enabled !== 'true') return;

        const qualifyLevel = parseInt(cfg.referral_qualify_level) || 3;
        if (charLevel < qualifyLevel) return;

        // Find pending referral for this user
        const [[referral]] = await db.query(
            "SELECT * FROM game_referrals WHERE referred_user_id=? AND status='pending'", [userId]
        );
        if (!referral) return;

        // Qualify the referral
        await db.query("UPDATE game_referrals SET status='qualified', referred_level=?, qualified_at=NOW() WHERE id=?",
            [charLevel, referral.id]);

        // Reward the referrer
        const rewardGold = parseInt(cfg.referral_reward_gold) || 500;
        const rewardItemId = parseInt(cfg.referral_reward_item_id) || 0;
        const rewardXp = parseInt(cfg.referral_reward_xp) || 0;

        if (rewardGold > 0) {
            await db.query('UPDATE users SET currency=currency+? WHERE id=?', [rewardGold, referral.referrer_user_id]);
        }
        if (rewardItemId > 0) {
            // Give to referrer's first character
            const [[refChar]] = await db.query('SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1', [referral.referrer_user_id]);
            if (refChar) {
                await db.query('INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1',
                    [refChar.id, rewardItemId]);
            }
        }

        await db.query("UPDATE game_referrals SET status='rewarded', reward_gold=?, reward_item_id=?, rewarded_at=NOW() WHERE id=?",
            [rewardGold, rewardItemId || null, referral.id]);
        await db.query('UPDATE users SET referral_count=referral_count+1 WHERE id=?', [referral.referrer_user_id]);

    } catch(e) { console.error('[Referral] qualification check error:', e.message); }
};

module.exports = router;
