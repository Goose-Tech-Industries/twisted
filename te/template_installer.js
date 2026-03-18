// =================================================================
// TEMPLATE INSTALLER — Apply pre-built game worlds to the database
// =================================================================
// Each template is a complete game world definition:
// terminology, settings, classes, races, items, skills, maps, NPCs,
// quests, battle config, fighting styles.
//
// Install flow:
// 1. Load template from game_templates table or from a JSON file
// 2. Apply terminology overrides (rename everything)
// 3. Apply system_settings (enable/disable features)
// 4. Insert classes, races, items, skills, maps, NPCs, quests
// 5. Mark template as installed
// =================================================================

function jp(s, f) { try { return typeof s === 'string' ? JSON.parse(s) : (s || f); } catch { return f; } }

const TemplateInstaller = {

    // Install a template by name or ID
    install: async (db, templateNameOrId) => {
        const isId = typeof templateNameOrId === 'number';
        const [rows] = await db.query(
            `SELECT * FROM game_templates WHERE ${isId ? 'id' : 'name'} = ?`, [templateNameOrId]);
        if (!rows.length) return { success: false, message: 'Template not found' };

        const template = rows[0];
        const results = { applied: [], errors: [] };

        // 1. Apply terminology
        const terms = jp(template.terminology_json, null);
        if (terms && typeof terms === 'object') {
            for (const [key, val] of Object.entries(terms)) {
                try {
                    const v = typeof val === 'object' ? val : { display_name: val };
                    await db.query(
                        `UPDATE game_terminology SET display_name=?, icon=COALESCE(?,icon), description=COALESCE(?,description)
                         WHERE term_key=?`,
                        [v.display_name || key, v.icon || null, v.description || null, key]);
                    results.applied.push(`term:${key}`);
                } catch (e) { results.errors.push(`term:${key}: ${e.message}`); }
            }
        }

        // 2. Apply settings
        const settings = jp(template.settings_json, null);
        if (settings && typeof settings === 'object') {
            for (const [key, val] of Object.entries(settings)) {
                try {
                    await db.query(
                        'INSERT INTO system_settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=?',
                        [key, String(val), String(val)]);
                    results.applied.push(`setting:${key}`);
                } catch (e) { results.errors.push(`setting:${key}: ${e.message}`); }
            }
        }

        // 3. Apply battle config
        const battleConfig = jp(template.battle_config_json, null);
        if (battleConfig && typeof battleConfig === 'object') {
            for (const [key, val] of Object.entries(battleConfig)) {
                try {
                    await db.query(
                        'INSERT INTO system_settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=?',
                        [key, String(val), String(val)]);
                    results.applied.push(`battle:${key}`);
                } catch (e) { results.errors.push(`battle:${key}: ${e.message}`); }
            }
        }

        // 4. Insert classes
        const classes = jp(template.classes_json, []);
        for (const cls of classes) {
            try {
                await db.query(
                    `INSERT IGNORE INTO game_classes (name, icon, description, base_hp, base_mp, base_atk, base_def, base_mo, base_md, base_speed, base_luck)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
                    [cls.name, cls.icon, cls.description, cls.base_hp||100, cls.base_mp||50,
                     cls.base_atk||10, cls.base_def||5, cls.base_mo||5, cls.base_md||5,
                     cls.base_speed||5, cls.base_luck||5]);
                results.applied.push(`class:${cls.name}`);
            } catch (e) { results.errors.push(`class:${cls.name}: ${e.message}`); }
        }

        // 5. Insert races
        const races = jp(template.races_json, []);
        for (const race of races) {
            try {
                await db.query(
                    `INSERT IGNORE INTO game_races (name, icon, description, bonus_hp, bonus_mp, bonus_atk, bonus_def, bonus_mo, bonus_md, bonus_speed, bonus_luck)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
                    [race.name, race.icon, race.description, race.bonus_hp||0, race.bonus_mp||0,
                     race.bonus_atk||0, race.bonus_def||0, race.bonus_mo||0, race.bonus_md||0,
                     race.bonus_speed||0, race.bonus_luck||0]);
                results.applied.push(`race:${race.name}`);
            } catch (e) { results.errors.push(`race:${race.name}: ${e.message}`); }
        }

        // 6. Insert items
        const items = jp(template.items_json, []);
        for (const item of items) {
            try {
                await db.query(
                    `INSERT IGNORE INTO game_items (name, icon, description, type, rarity, value, equip_slot)
                     VALUES (?,?,?,?,?,?,?)`,
                    [item.name, item.icon, item.description, item.type||'material',
                     item.rarity||'common', item.value||0, item.equip_slot||null]);
                results.applied.push(`item:${item.name}`);
            } catch (e) { results.errors.push(`item:${item.name}: ${e.message}`); }
        }

        // 7. Insert skills
        const skills = jp(template.skills_json, []);
        for (const skill of skills) {
            try {
                await db.query(
                    `INSERT IGNORE INTO game_skills (name, icon, description, type, target_type, effects, battle_text)
                     VALUES (?,?,?,?,?,?,?)`,
                    [skill.name, skill.icon, skill.description, skill.type||'physical',
                     skill.target_type||'ENEMY', JSON.stringify(skill.effects||{}),
                     skill.battle_text||null]);
                results.applied.push(`skill:${skill.name}`);
            } catch (e) { results.errors.push(`skill:${skill.name}: ${e.message}`); }
        }

        // 8. Insert maps
        const maps = jp(template.maps_json, []);
        for (const map of maps) {
            try {
                await db.query(
                    `INSERT IGNORE INTO game_maps (name, description, width, height, min_level, is_active, tiles_json, collisions_json)
                     VALUES (?,?,?,?,?,1,?,?)`,
                    [map.name, map.description, map.width||20, map.height||20,
                     map.min_level||1, JSON.stringify(map.tiles||[]), JSON.stringify(map.events||[])]);
                results.applied.push(`map:${map.name}`);
            } catch (e) { results.errors.push(`map:${map.name}: ${e.message}`); }
        }

        // 9. Insert NPCs
        const npcs = jp(template.npcs_json, []);
        for (const npc of npcs) {
            try {
                await db.query(
                    `INSERT IGNORE INTO game_npcs (name, icon, persona, is_enemy, map_id, x, y, move_type, is_master, teaches_style_id)
                     VALUES (?,?,?,?,?,?,?,?,?,?)`,
                    [npc.name, npc.icon, npc.persona, npc.is_enemy||0,
                     npc.map_id||1, npc.x||5, npc.y||5, npc.move_type||'STATIONARY',
                     npc.is_master||0, npc.teaches_style_id||null]);
                results.applied.push(`npc:${npc.name}`);
            } catch (e) { results.errors.push(`npc:${npc.name}: ${e.message}`); }
        }

        // 10. Insert fighting styles
        const styles = jp(template.styles_json, []);
        for (const style of styles) {
            try {
                await db.query(
                    `INSERT IGNORE INTO game_fighting_styles (name, label, icon, description, style_type, lore_text)
                     VALUES (?,?,?,?,?,?)`,
                    [style.name, style.label, style.icon, style.description,
                     style.style_type||'balanced', style.lore_text||null]);
                results.applied.push(`style:${style.name}`);
            } catch (e) { results.errors.push(`style:${style.name}: ${e.message}`); }
        }

        // Mark as installed
        await db.query(
            'UPDATE game_templates SET installed=1, installed_at=NOW() WHERE id=?', [template.id]);
        await db.query(
            "INSERT INTO system_settings (setting_key, setting_value) VALUES ('active_template',?) ON DUPLICATE KEY UPDATE setting_value=?",
            [template.name, template.name]);
        await db.query(
            "UPDATE system_settings SET setting_value='true' WHERE setting_key='template_installed'");

        return {
            success: true,
            template: template.label,
            applied: results.applied.length,
            errors: results.errors.length,
            details: results
        };
    },

    // List available templates
    list: async (db) => {
        try {
            const [rows] = await db.query(
                'SELECT id, name, label, icon, description, author, version, is_default, installed FROM game_templates ORDER BY is_default DESC, name');
            return rows;
        } catch { return []; }
    },

    // Get the active template
    getActive: async (db) => {
        try {
            const [rows] = await db.query(
                "SELECT setting_value FROM system_settings WHERE setting_key='active_template'");
            return rows.length ? rows[0].setting_value : null;
        } catch { return null; }
    }
};

module.exports = TemplateInstaller;
