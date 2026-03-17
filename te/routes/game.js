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

router.get('/creation-data', async (req, res) => {
    try {
        const [classes]=await db.query("SELECT * FROM game_classes WHERE hidden=0");
        const [races]=await db.query("SELECT * FROM game_races WHERE hidden=0");
        const [backgrounds]=await db.query("SELECT * FROM game_backgrounds");
        const [feats]=await db.query("SELECT * FROM game_feats");
        const [settingsRows]=await db.query("SELECT * FROM system_settings");
        const config = {};
        settingsRows.forEach(r => { config[r.setting_key] = r.setting_value==='true'?true:r.setting_value==='false'?false:r.setting_value; });
        res.json({ success:true, config, data:{classes,races,backgrounds,feats} });
    } catch(e) { res.json({success:false,message:'Server error.'}); }
});

router.post('/my-characters', async (req, res) => {
    try {
        const [rows]=await db.query(`SELECT c.id,c.name,c.level,c.current_hp,c.max_hp,c.current_mp,c.max_mp,c.atk,c.def,c.mo,c.md,c.speed,c.luck,c.map_id,c.x,c.y,c.experience,cl.name as class_name,r.name as race_name FROM characters c JOIN game_classes cl ON c.class_id=cl.id JOIN game_races r ON c.race_id=r.id WHERE c.user_id=?`,[uid(req)]);
        res.json({success:true,count:rows.length,characters:rows});
    } catch { res.json({success:false,count:0,characters:[]}); }
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
        res.json({success:true,message:"Character created!"});
    } catch(e) { console.error(e); res.json({success:false,message:"Server error."}); }
});

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

// =================================================================
// MY OGHAMS — Grimoire data for a character
// Returns every Ogham ever slotted, with family, rank progress,
// kill count, lore text. Used by the Grimoire panel in-game.
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
// GET /fast-travel-points
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

// =================================================================
// CHARACTER APPEARANCE — save modular sprite choices
// POST /update-appearance  { charId, appearance: { base, head, hair, body, armor, weapon, colors } }
// =================================================================
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

// ── PvP Team Roster ─────────────────────────────────────────────────────
// GET current user's pvp team roster
router.post('/get-pvp-team', async (req, res) => {
    try {
        const userId = req.session?.userId;
        if (!userId) return res.json({ success: false, message: 'Not logged in.' });

        const [teamRow] = await db.query(
            'SELECT team_chars FROM character_pvp_teams WHERE user_id=? AND is_active=1 LIMIT 1',
            [userId]);
        let teamCharIds = [];
        if (teamRow.length) {
            try { teamCharIds = JSON.parse(teamRow[0].team_chars || '[]'); } catch {}
        }

        // Get the user's characters for the picker
        const [chars] = await db.query(
            `SELECT c.id, c.name, c.level, c.class_id, cl.name AS class_name
             FROM characters c LEFT JOIN game_classes cl ON cl.id=c.class_id
             WHERE c.user_id=? AND c.is_active=1 ORDER BY c.id`,
            [userId]);

        // Read pvp_team_size setting
        const [szRow] = await db.query(
            "SELECT value FROM game_settings WHERE `key`='pvp_team_size' LIMIT 1");
        const maxTeam = szRow.length ? (parseInt(szRow[0].value) || 3) : 3;

        res.json({ success: true, teamCharIds, chars, maxTeam });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// SAVE pvp team roster
router.post('/save-pvp-team', async (req, res) => {
    try {
        const userId = req.session?.userId;
        if (!userId) return res.json({ success: false, message: 'Not logged in.' });
        const { charIds } = req.body;
        if (!Array.isArray(charIds)) return res.json({ success: false, message: 'Invalid charIds.' });

        // Read max team size
        const [szRow] = await db.query(
            "SELECT value FROM game_settings WHERE `key`='pvp_team_size' LIMIT 1");
        const maxTeam = szRow.length ? (parseInt(szRow[0].value) || 3) : 3;
        const capped = charIds.slice(0, maxTeam);

        // Validate ownership
        if (capped.length) {
            const [owned] = await db.query(
                `SELECT id FROM characters WHERE id IN (${capped.map(()=>'?').join(',')}) AND user_id=?`,
                [...capped, userId]);
            if (owned.length !== capped.length)
                return res.json({ success: false, message: 'Some characters do not belong to you.' });
        }

        await db.query(
            `INSERT INTO character_pvp_teams (user_id, team_chars, is_active)
             VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE team_chars=VALUES(team_chars), is_active=1`,
            [userId, JSON.stringify(capped)]);
        res.json({ success: true, teamCharIds: capped });
    } catch(e) { res.json({ success: false, message: e.message }); }
});


// =================================================================
// PRESENCE / AWAY STATUS ROUTES
// =================================================================
// POST /set-presence   — set status + optional away message
// GET  /my-presence    — get current status
//
// TEACHING: Status is stored in two places:
//   1. DB (characters.presence_status + away_message) — persistent,
//      shown on the profile page and inspect card
//   2. onlinePlayers in-memory object — server reads this for
//      nearby player list and broadcasts to the map on change
//
// The socket 'set_presence' event (in server.js) handles the
// in-memory update and map broadcast. This HTTP route handles
// the DB persistence so it survives reconnects.
// =================================================================

router.post('/set-presence', async (req, res) => {
    try {
        const userId = uid(req);
        const { charId, status, awayMessage } = req.body;
        const VALID = ['online','away','busy','lfp','invisible'];
        if (!VALID.includes(status)) return res.json({ success: false, message: 'Invalid status.' });

        const [[c]] = await db.query('SELECT id FROM characters WHERE id=? AND user_id=?', [charId, userId]);
        if (!c) return res.json({ success: false, message: 'Unauthorized.' });

        await db.query(
            'UPDATE characters SET presence_status=?, away_message=? WHERE id=?',
            [status, (awayMessage || '').slice(0, 255) || null, charId]
        );
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// PROFILE CUSTOMIZATION ROUTES
// =================================================================
// POST /save-profile   — save bio, color, banner, quote, Spotify
// =================================================================

router.post('/save-profile', async (req, res) => {
    try {
        const userId = uid(req);
        const { charId, bio, profileColor, bannerEmoji, favoriteQuote,
                spotifyTrackUrl, spotifyTrackName, spotifyArtistName,
                showProfileViewers } = req.body;

        const [[c]] = await db.query('SELECT id FROM characters WHERE id=? AND user_id=?', [charId, userId]);
        if (!c) return res.json({ success: false, message: 'Unauthorized.' });

        // Validate color is a hex code
        const color = /^#[0-9a-fA-F]{6}$/.test(profileColor||'') ? profileColor : '#bb86fc';

        // Validate Spotify URL: only allow open.spotify.com links
        let sUrl = null, sName = null, sArtist = null;
        if (spotifyTrackUrl && spotifyTrackUrl.includes('open.spotify.com')) {
            sUrl    = spotifyTrackUrl.slice(0, 512);
            sName   = (spotifyTrackName   || '').slice(0, 256) || null;
            sArtist = (spotifyArtistName  || '').slice(0, 256) || null;
        }

        await db.query(
            `UPDATE characters SET
                profile_bio=?, profile_color=?, profile_banner_emoji=?,
                profile_favorite_quote=?,
                spotify_track_url=?, spotify_track_name=?, spotify_artist_name=?,
                show_profile_viewers=?
             WHERE id=?`,
            [
                (bio || '').slice(0, 500) || null,
                color,
                (bannerEmoji || '⚔️').slice(0, 8),
                (favoriteQuote || '').slice(0, 200) || null,
                sUrl, sName, sArtist,
                showProfileViewers ? 1 : 0,
                charId
            ]
        );
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});



// =================================================================
// SIGNATURE ROUTE
// =================================================================
// TEACHING: A "forum signature" is a short block of styled text
// that appears at the bottom of every post (or profile). We support
// a small subset of BBCode — the markup language phpBB and vBulletin
// used. We parse it SERVER-SIDE before storing so the stored value
// is already safe HTML. This means the profile page just outputs it
// directly without needing a client-side parser.
//
// Supported tags: [b], [i], [u], [s], [color=#hex], [url], [size]
// Supported tags: [b],[i],[u],[s],[color=#hex],[size],[url],[img=URL]
// [img] ONLY allowed from trusted image hosts (allowlist below).
// BLOCKED: [script], arbitrary domains → stripped.
// =================================================================

function parseBBCode(raw) {
    // Sanitize raw text first — escape HTML special chars
    let s = raw
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    // Now replace allowed BBCode tags with safe HTML
    s = s
        .replace(/\[b\](.*?)\[\/b\]/gis,        '<strong>$1</strong>')
        .replace(/\[i\](.*?)\[\/i\]/gis,        '<em>$1</em>')
        .replace(/\[u\](.*?)\[\/u\]/gis,        '<span style="text-decoration:underline">$1</span>')
        .replace(/\[s\](.*?)\[\/s\]/gis,        '<span style="text-decoration:line-through">$1</span>')
        .replace(/\[color=(#[0-9a-fA-F]{3,6})\](.*?)\[\/color\]/gis,
                 '<span style="color:$1">$2</span>')
        .replace(/\[size=(\d{1,2})\](.*?)\[\/size\]/gis,
                 (_, sz, content) => {
                     // Clamp size 8–24px
                     const px = Math.min(24, Math.max(8, parseInt(sz)));
                     return '<span style="font-size:' + px + 'px">' + content + '</span>';
                 })
        .replace(/\[url=(https?:\/\/[^\]]{1,300})\](.*?)\[\/url\]/gis,
                 '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#58a6ff">$2</a>')
        .replace(/\[url\](https?:\/\/[^\[]{1,300})\[\/url\]/gis,
                 '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#58a6ff">$1</a>')
        .replace(/\n/g, '<br>');

    // [img]URL[/img] — domain allowlist only
    // TEACHING: We run img AFTER HTML escaping but we need raw URLs,
    // so we match the &amp; and &quot; escaped versions from above.
    // Simpler: we run img replacement on the raw string FIRST before
    // HTML escaping, using a strict domain allowlist.
    // (Already done below via _safeImg — see two-pass approach.)
    return s;
}

// Trusted image hosts for [img] tags.
// Only https URLs from these domains are allowed through.
const IMG_ALLOWLIST = [
    'i.imgur.com', 'imgur.com',
    'media.giphy.com', 'giphy.com', 'media.tenor.com',
    'cdn.discordapp.com', 'media.discordapp.net',
    'i.redd.it', 'preview.redd.it',
    'pbs.twimg.com',                          // Twitter/X image CDN
    'images.unsplash.com',
];

function isTrustedImgUrl(url) {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:') return false;
        return IMG_ALLOWLIST.some(host => u.hostname === host || u.hostname.endsWith('.' + host));
    } catch { return false; }
}

// Two-pass BBCode parser: first extract [img] tags with trusted URLs,
// replace with placeholders, then run the rest of the parser, then
// restore img tags. This avoids the HTML-escaping problem.
function parseBBCode(raw) {
    // Pass 1: extract and validate [img] tags BEFORE HTML escaping
    const imgPlaceholders = [];
    let s = raw.replace(/\[img\](https?:\/\/[^\[]{1,500})\[\/img\]/gis, (_, url) => {
        if (!isTrustedImgUrl(url)) return ''; // strip untrusted
        const idx = imgPlaceholders.length;
        imgPlaceholders.push(url);
        return '\x00IMG' + idx + '\x00'; // temporary placeholder
    });

    // Pass 2: HTML escape + rest of BBCode
    s = s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\[b\](.*?)\[\/b\]/gis,        '<strong>$1</strong>')
        .replace(/\[i\](.*?)\[\/i\]/gis,        '<em>$1</em>')
        .replace(/\[u\](.*?)\[\/u\]/gis,        '<span style="text-decoration:underline">$1</span>')
        .replace(/\[s\](.*?)\[\/s\]/gis,        '<span style="text-decoration:line-through">$1</span>')
        .replace(/\[color=(#[0-9a-fA-F]{3,6})\](.*?)\[\/color\]/gis,
                 '<span style="color:$1">$2</span>')
        .replace(/\[size=(\d{1,2})\](.*?)\[\/size\]/gis,
                 (_, sz, content) => {
                     const px = Math.min(24, Math.max(8, parseInt(sz)));
                     return '<span style="font-size:' + px + 'px">' + content + '</span>';
                 })
        .replace(/\[url=(https?:\/\/[^\]]{1,300})\](.*?)\[\/url\]/gis,
                 '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#58a6ff">$2</a>')
        .replace(/\[url\](https?:\/\/[^\[]{1,300})\[\/url\]/gis,
                 '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#58a6ff">$1</a>')
        .replace(/\n/g, '<br>');

    // Pass 3: restore img placeholders as safe <img> tags
    s = s.replace(/\x00IMG(\d+)\x00/g, (_, idx) => {
        const url = imgPlaceholders[parseInt(idx)];
        if (!url) return '';
        // Enforce size limits via CSS — no width/height attrs that could be spoofed
        return `<img src="${url}" alt="sig image" loading="lazy"
                    style="max-width:100%;max-height:120px;border-radius:4px;vertical-align:middle">`;
    });

    return s;
}


router.post('/save-signature', async (req, res) => {
    try {
        const userId = uid(req);
        const { charId, signature } = req.body;
        const [[c]] = await db.query('SELECT id FROM characters WHERE id=? AND user_id=?', [charId, userId]);
        if (!c) return res.json({ success: false, message: 'Unauthorized.' });

        const raw = (signature || '').slice(0, 500); // 500 char BBCode limit
        const html = raw ? parseBBCode(raw) : null;

        await db.query(
            'UPDATE characters SET profile_signature=? WHERE id=?',
            [html, charId]
        );
        res.json({ success: true, preview: html });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// TOP FRIENDS ROUTES
// =================================================================
// GET  /top-friends/:charId   — load the character's top 8 slots
// POST /save-top-friends      — save the ordered list
//
// TEACHING: We replace the entire list on every save (DELETE then
// INSERT). This is simpler and safer than trying to diff individual
// slots. Since it's at most 8 rows it's negligibly fast.
// =================================================================

router.get('/top-friends/:charId', async (req, res) => {
    try {
        const charId = parseInt(req.params.charId);
        const [rows] = await db.query(
            `SELECT tf.slot, c.id AS charId, c.name, c.level, c.class_id,
                    c.equipped_title, c.profile_color, c.presence_status,
                    gc.name AS class_name
             FROM character_top_friends tf
             JOIN characters c  ON c.id  = tf.friend_char_id
             JOIN game_classes gc ON gc.id = c.class_id
             WHERE tf.character_id = ?
             ORDER BY tf.slot ASC`,
            [charId]
        );
        res.json({ success: true, friends: rows });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

router.post('/save-top-friends', async (req, res) => {
    try {
        const userId = uid(req);
        const { charId, friendIds } = req.body;
        // friendIds = array of charIds in order (slot 1 = index 0), max 8
        const [[c]] = await db.query('SELECT id FROM characters WHERE id=? AND user_id=?', [charId, userId]);
        if (!c) return res.json({ success: false, message: 'Unauthorized.' });

        const slots = (friendIds || []).slice(0, 8).map(id => parseInt(id)).filter(id => id && id !== charId);

        // Verify all provided charIds actually exist
        if (slots.length > 0) {
            const [exists] = await db.query(
                'SELECT id FROM characters WHERE id IN (' + slots.map(()=>'?').join(',') + ')',
                slots
            );
            const validIds = new Set(exists.map(r => r.id));
            const allValid = slots.every(id => validIds.has(id));
            if (!allValid) return res.json({ success: false, message: 'One or more characters not found.' });
        }

        // Replace all slots atomically
        await db.query('DELETE FROM character_top_friends WHERE character_id=?', [charId]);
        for (let i = 0; i < slots.length; i++) {
            await db.query(
                'INSERT INTO character_top_friends (character_id, friend_char_id, slot) VALUES (?,?,?)',
                [charId, slots[i], i + 1]
            );
        }
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// LAST SEEN — lightweight heartbeat
// =================================================================
// Called by the client every 2 minutes while the game tab is open.
// Also called on meaningful actions (map change, battle start, etc.)
// We do NOT track this per-action on the server to avoid hammering the DB.
// =================================================================

router.post('/heartbeat', async (req, res) => {
    try {
        const userId = uid(req);
        const { charId } = req.body;
        // Verify ownership, then touch last_seen_at
        await db.query(
            'UPDATE characters SET last_seen_at=NOW() WHERE id=? AND user_id=?',
            [charId, userId]
        );
        res.json({ success: true });
    } catch { res.json({ success: true }); } // non-critical, never error to client
});


// =================================================================
// CODEX / BESTIARY
// =================================================================

// POST /codex-entries  { charId, category? }
// Returns all codex entries for the given category (or all if omitted),
// with a `discovered` boolean per character.
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
// Returns discovered/total counts per category.
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
