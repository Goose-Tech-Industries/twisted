const express = require('express');
const router = express.Router();
let db;
router.init = (c) => { db = c; };

// Helper: get userId from the server-side session
function uid(req) { return req.session && req.session.userId; }

function jp(s, f) { try { return JSON.parse(s); } catch { return f; } }
async function verifyOwnership(userId, charId) {
    const [r] = await db.query('SELECT id FROM characters WHERE id=? AND user_id=?',[charId,userId]);
    return r.length > 0;
}

router.post('/get-map', async (req, res) => {
    try {
        const [rows]=await db.query("SELECT * FROM game_maps WHERE id=?",[req.body.mapId]);
        if(!rows.length) return res.json({success:true,map:{id:0,name:"The Void",width:20,height:20,tiles:[],events:[],objects:[],anims:[],tileset_url:'',ambientDark:0}});
        const m=rows[0];
        res.json({success:true,map:{
            id:           m.id,
            name:         m.name,
            width:        m.width,
            height:       m.height,
            tiles:        jp(m.tiles_json,[]),
            events:       jp(m.collisions_json,[]),
            objects:      jp(m.objects_json,[]),
            anims:        jp(m.anims_json,[]),
            tileset_url:  m.tileset_url || '',
            ambientDark:  parseFloat(m.ambient_dark) || 0
        }});
    } catch(e) { res.json({success:false,message:"Database error."}); }
});

router.post('/get-all-maps', async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT id, name, description, width, height, COALESCE(fast_travel_enabled,1) AS fast_travel_enabled, COALESCE(min_level,1) AS min_level FROM game_maps WHERE is_active IS NULL OR is_active=1 ORDER BY id ASC`);
        res.json({ success: true, maps: rows });
    } catch (e) {
        try {
            const [rows] = await db.query('SELECT id, name, description, width, height FROM game_maps ORDER BY id ASC');
            res.json({ success: true, maps: rows.map(m => ({ ...m, fast_travel_enabled: 1, min_level: 1 })) });
        } catch (e2) { res.json({ success: false, message: 'Server error.' }); }
    }
});

router.post('/get-char-full', async (req, res) => {
    const userId = uid(req);
    const {charId}=req.body;
    try {
        if(!await verifyOwnership(userId,charId)) return res.json({success:false,message:'Unauthorized.'});
        const [charR]=await db.query(`
            SELECT c.*,
                   cl.name AS class_name, cl.description AS class_desc,
                   r.name  AS race_name,  r.description  AS race_desc,
                   bg.name AS bg_name,    bg.description AS bg_desc,
                   ft.name AS feat_name,  ft.description AS feat_desc
            FROM characters c
            LEFT JOIN game_classes     cl ON c.class_id      = cl.id
            LEFT JOIN game_races        r ON c.race_id        = r.id
            LEFT JOIN game_backgrounds bg ON c.background_id  = bg.id
            LEFT JOIN game_feats        ft ON c.feat_id        = ft.id
            WHERE c.id = ?`,[charId]);
        if(!charR.length) return res.json({success:false,message:'Not found.'});
        const c=charR[0];
        const [inv]=await db.query(`SELECT ci.*, gi.name, gi.icon, gi.type, gi.slot, gi.description, gi.value,
            gi.bonus_hp, gi.bonus_mp, gi.bonus_atk, gi.bonus_def, gi.bonus_mo, gi.bonus_md, gi.bonus_speed, gi.bonus_luck,
            gi.level_req, gi.elements, gi.set_status
            FROM character_items ci JOIN game_items gi ON ci.item_id=gi.id WHERE ci.character_id=?`,[charId]);
        const [equip]=await db.query(`SELECT ce.slot_key, gi.* FROM character_equipment ce
            JOIN game_items gi ON ce.item_id=gi.id WHERE ce.character_id=?`,[charId]);
        const [slots]=await db.query("SELECT * FROM game_equip_slots ORDER BY display_order");
        const [userR]=await db.query("SELECT currency FROM users WHERE id=?",[userId]);
        const gold=userR.length?userR[0].currency:0;
        const [skills]=await db.query(`SELECT gs.*, gcs.mp_cost, gcs.alt_name, gcs.learn_level
            FROM game_class_skills gcs JOIN game_skills gs ON gcs.skill_id=gs.id
            WHERE gcs.class_id=? AND gcs.learn_level<=? ORDER BY gcs.learn_level`,[c.class_id,c.level]);
        let xpToNext=null;
        for(const tbl of ['level_requirements','game_levels']){
            try{
                const [nxt]=await db.query(`SELECT xp_required FROM \`${tbl}\` WHERE level=?`,[c.level+1]);
                if(nxt.length){ xpToNext=nxt[0].xp_required; break; }
            }catch(e){ if(e.code!=='ER_NO_SUCH_TABLE'&&e.errno!==1146) throw e; }
        }
        const stateJson=jp(c.state_json||'{}',{});
        const xpCurrent = typeof stateJson.xp==='number' ? stateJson.xp : (c.experience||0);
        const unspentPoints = stateJson.progression?.unspent_points ?? 0;
        let battleRecord={W:0,L:0,T:0};
        try{ battleRecord=typeof c.battle_record==='object'?c.battle_record:jp(c.battle_record||'{}',{}); }catch{}
        const [limits]=await (async()=>{
            for(const tbl of ['game_limit_breaks','game_limits']){
                try{ return await db.query(`SELECT * FROM \`${tbl}\` WHERE class_id=? AND char_level_req<=? AND break_level<=? ORDER BY break_level`,[c.class_id,c.level,c.breaklevel||1]); }
                catch(e){ if(e.code!=='ER_NO_SUCH_TABLE'&&e.errno!==1146) throw e; }
            }
            return [[]];
        })();
        let eqBonus={hp:0,mp:0,atk:0,def:0,mo:0,md:0,speed:0,luck:0};
        equip.forEach(i=>{ eqBonus.hp+=(i.bonus_hp||0); eqBonus.mp+=(i.bonus_mp||0); eqBonus.atk+=(i.bonus_atk||0); eqBonus.def+=(i.bonus_def||0); eqBonus.mo+=(i.bonus_mo||0); eqBonus.md+=(i.bonus_md||0); eqBonus.speed+=(i.bonus_speed||0); eqBonus.luck+=(i.bonus_luck||0); });
        res.json({ success:true, character:c, inventory:inv, equipment:equip, slots, gold, skills, limits, xpToNext, xpCurrent, unspentPoints, battleRecord, equipBonus:eqBonus,
            effectiveStats:{ maxHp:c.max_hp+eqBonus.hp, maxMp:c.max_mp+eqBonus.mp, atk:c.atk+eqBonus.atk, def:c.def+eqBonus.def, mo:c.mo+eqBonus.mo, md:c.md+eqBonus.md, speed:c.speed+eqBonus.speed, luck:c.luck+eqBonus.luck, limitbreak:parseFloat(c.limitbreak||0), breaklevel:c.breaklevel||1 }
        });
    } catch(e) { console.error(e); res.json({success:false,message:'Server error.'}); }
});

router.post('/get-char-by-name', async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return res.json({ success: false, message: 'No name provided.' });
    try {
        const [rows] = await db.query(
            `SELECT c.id, c.name, c.level, c.equipped_title, c.profile_color,
                    gc.name AS class_name
             FROM characters c
             LEFT JOIN game_classes gc ON gc.id = c.class_id
             WHERE LOWER(c.name)=LOWER(?) LIMIT 1`,
            [name.trim()]
        );
        if (!rows.length) return res.json({ success: false, message: 'Character not found.' });
        // Return both formats for backwards compatibility
        res.json({ success: true, charId: rows[0].id, name: rows[0].name,
                   level: rows[0].level, character: rows[0] });
    } catch (e) { res.json({ success: false, message: 'Server error.' }); }
});

router.post('/get-shop', async (req, res) => {
    try {
        const [shop]=await db.query("SELECT * FROM game_shops WHERE id=?",[req.body.shopId]);
        if(!shop.length) return res.json({success:false,message:"Shop not found."});
        const [supplies]=await db.query("SELECT ss.*,gi.name,gi.description,gi.type,gi.icon,gi.slot FROM game_shop_supplies ss JOIN game_items gi ON ss.item_id=gi.id WHERE ss.shop_id=?",[req.body.shopId]);
        res.json({success:true,shop:shop[0],supplies});
    } catch { res.json({success:false}); }
});

router.post('/buy-item', async (req, res) => {
    const userId = uid(req);
    const {charId,shopId,itemId}=req.body;
    const qty=parseInt(req.body.quantity)||1;
    try {
        if(!await verifyOwnership(userId,charId)) return res.json({success:false,message:'Unauthorized.'});
        const [sup]=await db.query("SELECT * FROM game_shop_supplies WHERE shop_id=? AND item_id=?",[shopId,itemId]);
        if(!sup.length) return res.json({success:false,message:"Not for sale."});

        // WORLD FLAG: Check if this item is conditionally hidden
        if (sup[0].world_flag_conditions) {
            try {
                const wf = global.worldFlags || {};
                const conds = JSON.parse(sup[0].world_flag_conditions);
                const blocked = conds.some(c => {
                    const actual = wf[c.flag];
                    if (c.op === '==' || !c.op) return String(actual) !== String(c.value);
                    if (c.op === '!=')           return String(actual) === String(c.value);
                    return false;
                });
                if (blocked) return res.json({success:false,message:'Not available right now.'});
            } catch {}
        }

        // WORLD FLAG: Apply price modifiers
        // Apply region shop_price_mult first
        let basePrice = sup[0].buy_price;
        try {
            if (global.getRegionForMap) {
                const [charMapR] = await db.query('SELECT map_id FROM characters WHERE id=?', [charId]);
                if (charMapR.length) {
                    const region = await global.getRegionForMap(charMapR[0].map_id);
                    if (region && region.shop_price_mult) {
                        basePrice = Math.round(basePrice * parseFloat(region.shop_price_mult));
                    }
                }
            }
        } catch {}
        if (sup[0].flag_price_modifiers) {
            try {
                const wf = global.worldFlags || {};
                const mods = JSON.parse(sup[0].flag_price_modifiers);
                for (const m of mods) {
                    if (wf[m.flag] === 'true' || wf[m.flag] === true) {
                        basePrice = Math.round(basePrice * (m.multiplier || 1));
                    }
                }
            } catch {}
        }

        const cost=basePrice*qty;
        const [user]=await db.query("SELECT currency FROM users WHERE id=?",[userId]);
        if(!user.length||user[0].currency<cost) return res.json({success:false,message:`Need ${cost}g.`});
        await db.query("UPDATE users SET currency=currency-? WHERE id=?",[cost,userId]);
        const [ex]=await db.query("SELECT * FROM character_items WHERE character_id=? AND item_id=?",[charId,itemId]);
        if(ex.length) await db.query("UPDATE character_items SET quantity=quantity+? WHERE id=?",[qty,ex[0].id]);
        else await db.query("INSERT INTO character_items(character_id,item_id,quantity)VALUES(?,?,?)",[charId,itemId,qty]);
        if(sup[0].stock>=0) await db.query("UPDATE game_shop_supplies SET stock=stock-? WHERE shop_id=? AND item_id=?",[qty,shopId,itemId]);
        res.json({success:true,message:`Bought ${qty}x for ${cost}g!`});
    } catch(e) { console.error(e); res.json({success:false,message:"Server error."}); }
});

router.post('/sell-item', async (req, res) => {
    const userId = uid(req);
    const {charId,itemId}=req.body;
    const qty=parseInt(req.body.quantity)||1;
    try {
        if(!await verifyOwnership(userId,charId)) return res.json({success:false,message:'Unauthorized.'});
        const [inv]=await db.query("SELECT * FROM character_items WHERE character_id=? AND item_id=?",[charId,itemId]);
        if(!inv.length||inv[0].quantity<qty) return res.json({success:false,message:'Not enough items.'});
        const [itemR]=await db.query("SELECT value FROM game_items WHERE id=?",[itemId]);
        if(!itemR.length) return res.json({success:false,message:'Item not found.'});
        const sellPrice=Math.floor((itemR[0].value||0)*0.5)*qty;
        await db.query("UPDATE users SET currency=currency+? WHERE id=?",[sellPrice,userId]);
        if(inv[0].quantity>qty) await db.query("UPDATE character_items SET quantity=quantity-? WHERE id=?",[qty,inv[0].id]);
        else await db.query("DELETE FROM character_items WHERE id=?",[inv[0].id]);
        res.json({success:true,message:`Sold for ${sellPrice}g!`});
    } catch(e) { res.json({success:false,message:'Server error.'}); }
});

router.post('/use-item', async (req, res) => {
    const userId = uid(req);
    const { charId, itemId } = req.body;
    try {
        if (!await verifyOwnership(userId, charId)) return res.json({ success: false, message: 'Unauthorized.' });
        const [inv] = await db.query('SELECT ci.*, gi.name, gi.type, gi.icon, gi.bonus_hp, gi.bonus_mp, gi.stats_json FROM character_items ci JOIN game_items gi ON ci.item_id=gi.id WHERE ci.character_id=? AND ci.item_id=?', [charId, itemId]);
        if (!inv.length) return res.json({ success: false, message: 'Item not in inventory.' });
        const item = inv[0];
        if (item.type !== 'CONSUMABLE') return res.json({ success: false, message: 'Cannot use outside of battle.' });
        let stats = {}; try { stats = JSON.parse(item.stats_json || '{}'); } catch {}
        const [charRows] = await db.query('SELECT current_hp, max_hp, current_mp, max_mp FROM characters WHERE id=?', [charId]);
        if (!charRows.length) return res.json({ success: false, message: 'Character not found.' });
        const c = charRows[0];
        const newHp = Math.min(c.max_hp, c.current_hp + (item.bonus_hp||0) + (stats.heal_hp||0) + Math.floor((stats.heal_pct||0)*c.max_hp));
        const newMp = Math.min(c.max_mp, c.current_mp + (item.bonus_mp||0) + (stats.restore_mp||0) + Math.floor((stats.restore_pct||0)*c.max_mp));
        await db.query('UPDATE characters SET current_hp=?, current_mp=? WHERE id=?', [newHp, newMp, charId]);
        if (item.quantity > 1) await db.query('UPDATE character_items SET quantity=quantity-1 WHERE character_id=? AND item_id=?', [charId, itemId]);
        else await db.query('DELETE FROM character_items WHERE character_id=? AND item_id=?', [charId, itemId]);
        const parts = [];
        if (newHp-c.current_hp>0) parts.push(`+${newHp-c.current_hp} HP`);
        if (newMp-c.current_mp>0) parts.push(`+${newMp-c.current_mp} MP`);
        res.json({ success: true, message: parts.length ? `${item.icon||'🧪'} ${item.name}: ${parts.join(', ')}!` : `Used ${item.name}.`, newHp, newMp });
    } catch (e) { console.error('/use-item error:', e); res.json({ success: false, message: 'Server error.' }); }
});

router.post('/equip-item', async (req, res) => {
    const userId = uid(req);
    const {charId,itemId,slotKey}=req.body;
    try {
        if(!await verifyOwnership(userId,charId)) return res.json({success:false,message:'Unauthorized.'});
        const [inv]=await db.query("SELECT * FROM character_items WHERE character_id=? AND item_id=?",[charId,itemId]);
        if(!inv.length) return res.json({success:false,message:'Item not in inventory.'});
        const [itemR]=await db.query("SELECT * FROM game_items WHERE id=?",[itemId]);
        if(!itemR.length) return res.json({success:false,message:'Item not found.'});
        if(itemR[0].slot!==slotKey&&itemR[0].slot!=='ANY') return res.json({success:false,message:`Goes in ${itemR[0].slot}.`});
        const [cur]=await db.query("SELECT * FROM character_equipment WHERE character_id=? AND slot_key=?",[charId,slotKey]);
        if(cur.length){
            await db.query("INSERT INTO character_items(character_id,item_id,quantity)VALUES(?,?,1)",[charId,cur[0].item_id]);
            await db.query("DELETE FROM character_equipment WHERE character_id=? AND slot_key=?",[charId,slotKey]);
        }
        await db.query("INSERT INTO character_equipment(character_id,slot_key,item_id)VALUES(?,?,?)",[charId,slotKey,itemId]);
        if(inv[0].quantity>1) await db.query("UPDATE character_items SET quantity=quantity-1 WHERE id=?",[inv[0].id]);
        else await db.query("DELETE FROM character_items WHERE id=?",[inv[0].id]);
        res.json({success:true,message:'Equipped!'});
    } catch(e) { console.error(e); res.json({success:false,message:'Server error.'}); }
});

router.post('/unequip-item', async (req, res) => {
    const userId = uid(req);
    const {charId,slotKey}=req.body;
    try {
        if(!await verifyOwnership(userId,charId)) return res.json({success:false,message:'Unauthorized.'});
        const [eq]=await db.query("SELECT * FROM character_equipment WHERE character_id=? AND slot_key=?",[charId,slotKey]);
        if(!eq.length) return res.json({success:false,message:'Nothing there.'});
        await db.query("INSERT INTO character_items(character_id,item_id,quantity)VALUES(?,?,1)",[charId,eq[0].item_id]);
        await db.query("DELETE FROM character_equipment WHERE character_id=? AND slot_key=?",[charId,slotKey]);
        res.json({success:true,message:'Unequipped.'});
    } catch(e) { res.json({success:false,message:'Server error.'}); }
});

// =================================================================
// MY OGHAMS — Grimoire data for a character
// =================================================================
router.post('/my-oghams', async (req, res) => {
    const userId = uid(req);
    const { charId } = req.body;
    try {
        if (!await verifyOwnership(userId, charId))
            return res.json({ success: false, message: 'Unauthorized.' });

        // Current slots
        const [slotted] = await db.query(`
            SELECT co.id, co.item_id, co.slot_index, co.current_rank, co.kill_count,
                   go.name, go.icon, go.description, go.lore_text, go.rank as max_rank,
                   go.kills_to_rank_up, go.element_attack, go.on_hit_status, go.on_hit_chance,
                   go.stat_bonus_json, go.family_id,
                   gof.name as family_name, gof.icon as family_icon,
                   gi.name as item_name, gi.icon as item_icon, gi.slot as item_slot,
                   -- Next rank info
                   (SELECT id FROM game_oghams WHERE base_ogham_id = IFNULL(go.base_ogham_id, go.id)
                    AND rank = go.rank + 1 LIMIT 1) as next_rank_id
            FROM character_oghams co
            JOIN game_oghams go ON go.id = co.ogham_id
            JOIN game_items gi  ON gi.id = co.item_id
            LEFT JOIN game_ogham_families gof ON gof.id = go.family_id
            WHERE co.character_id = ?
            ORDER BY gi.slot, co.slot_index`, [charId]);

        // Active set bonuses
        const familyCounts = {};
        for (const s of slotted) {
            if (s.family_id) familyCounts[s.family_id] = (familyCounts[s.family_id] || 0) + 1;
        }
        const activeFamilyIds = Object.keys(familyCounts).filter(id => familyCounts[id] >= 2);
        let activeSets = [];
        if (activeFamilyIds.length) {
            const [famRows] = await db.query(
                'SELECT * FROM game_ogham_families WHERE id IN (?)', [activeFamilyIds]);
            activeSets = famRows.map(f => ({
                id: f.id, name: f.name, icon: f.icon,
                bonus: f.set_bonus_json
            }));
        }

        res.json({ success: true, data: { slotted, activeSets } });
    } catch (e) {
        console.error('my-oghams error:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// =================================================================
// FAST TRAVEL — fetch this character's discovered warp points
// =================================================================
router.get('/fast-travel-points', async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ success: false });
    try {
        // Get the active character for this session (most recently moved)
        const [chars] = await db.query(
            'SELECT id, state_json FROM characters WHERE user_id=? ORDER BY id DESC LIMIT 1',
            [userId]
        );
        if (!chars.length) return res.json({ success: true, points: [] });

        let state = {};
        try { state = JSON.parse(chars[0].state_json || '{}'); } catch {}
        const warpPoints = Array.isArray(state.warpPoints) ? state.warpPoints : [];

        // Enrich with current map names (in case names changed)
        const enriched = [];
        for (const wp of warpPoints) {
            const [mapRow] = await db.query(
                'SELECT id, name, fast_travel_enabled FROM game_maps WHERE id=? AND is_active=1', [wp.mapId]
            );
            if (mapRow.length && mapRow[0].fast_travel_enabled) {
                enriched.push({ ...wp, name: mapRow[0].name });
            }
        }
        res.json({ success: true, points: enriched });
    } catch (e) { res.json({ success: false, points: [], message: e.message }); }
});

router.post('/save-state', async (req, res) => {
    const userId = uid(req);
    const {charId,state}=req.body;
    try {
        const [r]=await db.query("UPDATE characters SET state_json=? WHERE id=? AND user_id=?",[JSON.stringify(state),charId,userId]);
        if(r.affectedRows===0) return res.json({success:false,message:"Unauthorized."});
        res.json({success:true});
    } catch { res.json({success:false}); }
});

router.post('/load-state', async (req, res) => {
    const userId = uid(req);
    const {charId}=req.body;
    try {
        const [r]=await db.query("SELECT state_json FROM characters WHERE id=? AND user_id=?",[charId,userId]);
        if(!r.length) return res.json({success:false,message:"Unauthorized."});
        res.json({success:true,state:jp(r[0].state_json,{})});
    } catch { res.json({success:false}); }
});

// =================================================================
// CODEX / BESTIARY
// =================================================================

// POST /codex-entries  { charId, category? }
router.post('/codex-entries', async (req, res) => {
    const userId = uid(req);
    const { charId, category } = req.body;
    try {
        if (!await verifyOwnership(userId, charId))
            return res.json({ success: false, message: 'Unauthorized.' });

        let sql = `
            SELECT ce.*,
                   IF(cd.id IS NOT NULL, 1, 0) AS discovered
            FROM codex_entries ce
            LEFT JOIN codex_discoveries cd
                   ON cd.codex_entry_id = ce.id AND cd.character_id = ?
            WHERE ce.hidden = 0`;
        const params = [charId];

        if (category) {
            sql += ' AND ce.category = ?';
            params.push(category);
        }
        sql += ' ORDER BY ce.category, ce.id';

        const [rows] = await db.query(sql, params);

        const entries = rows.map(r => {
            const entry = {
                id: r.id,
                category: r.category,
                name: r.name,
                description: r.description,
                discovered: !!r.discovered,
                icon: r.icon || undefined,
                rarity: r.rarity || undefined,
            };
            // Creature fields
            if (r.level != null) entry.level = r.level;
            if (r.element)      entry.element = r.element;
            if (r.weakness)     entry.weakness = r.weakness;
            if (r.drop_table_json) entry.dropTable = jp(r.drop_table_json, []);
            // Location fields
            if (r.region)       entry.region = r.region;
            if (r.min_level != null) entry.minLevel = r.min_level;
            // Item fields
            if (r.item_type)    entry.type = r.item_type;
            if (r.stats_json)   entry.stats = jp(r.stats_json, {});
            // Lore fields
            if (r.chapter != null) entry.chapter = r.chapter;
            return entry;
        });

        res.json({ success: true, data: { entries } });
    } catch (e) {
        console.error('codex-entries error:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// POST /codex-stats  { charId }
router.post('/codex-stats', async (req, res) => {
    const userId = uid(req);
    const { charId } = req.body;
    try {
        if (!await verifyOwnership(userId, charId))
            return res.json({ success: false, message: 'Unauthorized.' });

        const [rows] = await db.query(`
            SELECT ce.category,
                   COUNT(*)                             AS total,
                   SUM(IF(cd.id IS NOT NULL, 1, 0))     AS discovered
            FROM codex_entries ce
            LEFT JOIN codex_discoveries cd
                   ON cd.codex_entry_id = ce.id AND cd.character_id = ?
            WHERE ce.hidden = 0
            GROUP BY ce.category`, [charId]);

        const stats = rows.map(r => ({
            category: r.category,
            total: Number(r.total),
            discovered: Number(r.discovered),
        }));

        res.json({ success: true, data: { stats } });
    } catch (e) {
        console.error('codex-stats error:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
