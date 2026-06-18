-- =================================================================
-- MIGRATION: Fix battle table column names + add missing columns
-- Run this if you created your database BEFORE this fix.
-- Safe to run multiple times.
-- =================================================================

-- ── game_battle_commands ─────────────────────────────────────────
ALTER TABLE game_battle_commands
    ADD COLUMN IF NOT EXISTS description TEXT AFTER icon,
    ADD COLUMN IF NOT EXISTS target_type VARCHAR(32) NOT NULL DEFAULT 'ENEMY' AFTER action_type,
    ADD COLUMN IF NOT EXISTS effects     JSON AFTER class_ids;

-- Seed effects JSON onto existing rows (safe — uses UPDATE IGNORE)
UPDATE game_battle_commands SET effects =
    '{"damage":{"formula":"ATK*2-DEF","randomize":0.15},"apply_weapon_elements":true,"apply_weapon_status":true,"log":"{name} attacks!"}'
    WHERE name='Attack'  AND (effects IS NULL OR effects='{}' OR effects='null');
UPDATE game_battle_commands SET effects =
    '{"set_status":{"target":"self","statuses":{"Defending":1}},"log":"{name} defends!"}'
    WHERE name='Defend'  AND (effects IS NULL OR effects='{}' OR effects='null');
UPDATE game_battle_commands SET effects = '{"open_menu":"skills"}' WHERE name='Skills' AND (effects IS NULL OR effects='{}' OR effects='null');
UPDATE game_battle_commands SET effects = '{"open_menu":"items"}'  WHERE name='Items'  AND (effects IS NULL OR effects='{}' OR effects='null');
UPDATE game_battle_commands SET effects = '{"open_menu":"limits"}' WHERE name='Limit'  AND (effects IS NULL OR effects='{}' OR effects='null');
UPDATE game_battle_commands SET effects =
    '{"flee":{"formula":"SPEED+LUCK*0.5-ENEMY_SPEED","log_success":"{name} escapes!","log_fail":"{name} couldn\'t escape!"}}'
    WHERE name='Run'     AND (effects IS NULL OR effects='{}' OR effects='null');

-- ── game_skills ──────────────────────────────────────────────────
ALTER TABLE game_skills
    ADD COLUMN IF NOT EXISTS battle_text  VARCHAR(255) DEFAULT NULL AFTER description,
    ADD COLUMN IF NOT EXISTS target_type  VARCHAR(32)  NOT NULL DEFAULT 'ENEMY' AFTER type,
    ADD COLUMN IF NOT EXISTS elements     JSON         DEFAULT NULL AFTER target_type,
    ADD COLUMN IF NOT EXISTS heal_status  JSON         DEFAULT NULL AFTER elements,
    ADD COLUMN IF NOT EXISTS effects      JSON         AFTER heal_status;
-- Rename effects_json -> effects for existing rows (data copy)
UPDATE game_skills SET effects = effects_json WHERE effects IS NULL AND effects_json IS NOT NULL;

-- ── game_statuses ────────────────────────────────────────────────
ALTER TABLE game_statuses
    ADD COLUMN IF NOT EXISTS default_duration INT NOT NULL DEFAULT 3 AFTER type,
    ADD COLUMN IF NOT EXISTS permanent        TINYINT(1) NOT NULL DEFAULT 0 AFTER default_duration,
    ADD COLUMN IF NOT EXISTS effects          JSON AFTER permanent;
-- Copy data from old columns
UPDATE game_statuses SET default_duration = duration     WHERE default_duration = 3 AND duration != 3;
UPDATE game_statuses SET effects = effects_json          WHERE effects IS NULL AND effects_json IS NOT NULL;

-- ── game_limit_breaks ────────────────────────────────────────────
ALTER TABLE game_limit_breaks
    ADD COLUMN IF NOT EXISTS target_type  VARCHAR(32) NOT NULL DEFAULT 'ENEMY' AFTER char_level_req,
    ADD COLUMN IF NOT EXISTS effects      JSON AFTER target_type;
UPDATE game_limit_breaks SET effects = effects_json WHERE effects IS NULL AND effects_json IS NOT NULL;

-- ── Insert seed data (safe — uses INSERT IGNORE) ─────────────────
INSERT IGNORE INTO game_statuses (id, name, icon, type, default_duration, permanent, description, effects, disabled_commands) VALUES
(1,'Poison','🟣','debuff',3,0,'Drains HP each turn.','{"damage_per_turn":{"formula":"MAXHP*0.05+5"},"log":"{name} is poisoned for "}',NULL),
(2,'Defending','🛡️','buff',1,0,'Reduces incoming damage by 50% this turn.','{"stat_mod":{"def":2}}',NULL),
(3,'Burn','🔥','debuff',2,0,'Fire damage each turn.','{"damage_per_turn":{"formula":"MAXHP*0.08+8"},"log":"{name} is burning!"}',NULL),
(4,'Regen','💚','buff',3,0,'Restores HP each turn.','{"heal_per_turn":{"formula":"MAXHP*0.06+10"},"log":"{name} regenerates."}',NULL),
(5,'Blind','🌑','debuff',2,0,'Halves ATK.','{"stat_mod":{"atk":0.5},"log":"{name} is blinded!"}',NULL),
(6,'Stun','⚡','debuff',1,0,'Skip next turn.','{"skip_turn":true,"log":"{name} is stunned and cannot act!"}','[-1]'),
(7,'ATK Up','⬆️','buff',3,0,'Increases ATK by 50%.','{"stat_mod":{"atk":1.5},"log":"{name} is powered up!"}',NULL),
(8,'DEF Down','⬇️','debuff',2,0,'Reduces DEF by 40%.','{"stat_mod":{"def":0.6},"log":"{name} defense is weakened!"}',NULL);

INSERT IGNORE INTO game_skills (id, name, icon, description, battle_text, type, target_type, effects) VALUES
(1,'Mighty Strike','⚔️','Powerful physical blow.','{name} winds up a devastating strike!','physical','ENEMY','{"damage":{"formula":"ATK*3-DEF","randomize":0.1}}'),
(2,'War Cry','📣','Raises ATK for 3 turns.','{name} lets out a fearsome war cry!','buff','SELF','{"set_status":{"target":"self","statuses":{"ATK Up":3}}}'),
(3,'Blade Rush','🌀','Rapid slashes.','{name} launches a flurry of blade strikes!','physical','ENEMY','{"damage":{"formula":"ATK*2.5","randomize":0.2}}'),
(4,'Fireball','🔥','Blazing fireball with Burn chance.','{name} conjures a roaring fireball!','magic','ENEMY','{"damage":{"formula":"MO*2.5-MD","randomize":0.1},"elements":["fire"],"set_status":{"target":"enemy","chance":30,"statuses":{"Burn":2}}}'),
(5,'Ice Shard','❄️','Ice shards that weaken DEF.','{name} launches a volley of ice shards!','magic','ENEMY','{"damage":{"formula":"MO*2-MD","randomize":0.05},"elements":["ice"],"set_status":{"target":"enemy","chance":40,"statuses":{"DEF Down":2}}}'),
(6,'Thunder Strike','⚡','Lightning with Stun chance.','{name} calls down a bolt of lightning!','magic','ENEMY','{"damage":{"formula":"MO*3-MD","randomize":0.15},"elements":["lightning"],"set_status":{"target":"enemy","chance":25,"statuses":{"Stun":1}}}'),
(7,'Arcane Missile','🔮','Pure arcane bolt.','{name} fires a bolt of pure arcane power!','magic','ENEMY','{"damage":{"formula":"MO*2.2-MD*0.5","randomize":0.08}}'),
(8,'Backstab','🗡️','High crit strike.','{name} lunges from the shadows!','physical','ENEMY','{"damage":{"formula":"ATK*2+LUCK*2-DEF","randomize":0.2}}'),
(9,'Smoke Bomb','💨','Blinds enemy for 2 turns.','{name} hurls a smoke bomb!','debuff','ENEMY','{"set_status":{"target":"enemy","chance":90,"statuses":{"Blind":2}}}'),
(10,'Poison Blade','🟣','Poisons the target.','{name} coats their blade in venom!','physical','ENEMY','{"damage":{"formula":"ATK*1.5-DEF","randomize":0.1},"set_status":{"target":"enemy","chance":75,"statuses":{"Poison":3}}}'),
(11,'Heal','💚','Restore your HP.','{name} channels holy energy!','heal','SELF','{"heal":{"formula":"MO*3+50"}}'),
(12,'Holy Light','✨','Holy damage + cures Poison.','{name} calls down a ray of holy light!','magic','ENEMY','{"damage":{"formula":"MO*2.2-MD","randomize":0.1},"elements":["holy"]}'),
(13,'Regen','🌿','Apply Regen buff to self.','{name} blesses themselves with regeneration!','buff','SELF','{"set_status":{"target":"self","statuses":{"Regen":3}}}'),
(14,'Smite','⚡','Divine strike: ATK+MO.','{name} strikes with divine fury!','magic','ENEMY','{"damage":{"formula":"(ATK+MO)*1.5-DEF","randomize":0.1},"elements":["holy"]}');

INSERT IGNORE INTO game_class_skills (class_id, skill_id, learn_level, mp_cost) VALUES
(1,1,1,8),(1,2,5,12),(1,3,10,15),
(2,4,1,10),(2,7,3,8),(2,5,6,12),(2,6,12,18),
(3,8,1,6),(3,9,4,8),(3,10,8,10),
(4,11,1,10),(4,13,4,12),(4,12,6,14),(4,14,10,16);

INSERT IGNORE INTO game_limit_breaks (id, name, icon, description, class_id, break_level, char_level_req, target_type, effects) VALUES
(1,'Blade Rush','⚔️','Massive physical flurry.',1,1,1,'ENEMY','{"damage":{"formula":"ATK*5-DEF","randomize":0.15},"log":"{name} unleashes Blade Rush!"}'),
(2,'Earthquake','🌍','Ignores all defense.',1,2,15,'ENEMY','{"damage":{"formula":"ATK*7","randomize":0.1},"log":"{name} strikes the earth with Earthquake!"}'),
(3,'Arcane Explosion','🔮','Obliterates magic defenses.',2,1,1,'ENEMY','{"damage":{"formula":"MO*6-MD*0.5","randomize":0.1},"elements":["arcane"],"log":"{name} detonates an Arcane Explosion!"}'),
(4,'Meltdown','☀️','Burns target for 4 turns.',2,2,15,'ENEMY','{"damage":{"formula":"MO*5","randomize":0.1},"elements":["fire"],"set_status":{"target":"enemy","chance":100,"statuses":{"Burn":4}},"log":"{name} triggers a Meltdown!"}'),
(5,'Shadow Storm','🌑','Too fast to defend against.',3,1,1,'ENEMY','{"damage":{"formula":"ATK*4+LUCK*3","randomize":0.2},"log":"{name} unleashes Shadow Storm!"}'),
(6,'Death Mark','💀','Poisons and blinds.',3,2,15,'ENEMY','{"damage":{"formula":"ATK*3+LUCK*2","randomize":0.15},"set_status":{"target":"enemy","chance":100,"statuses":{"Poison":5,"Blind":3}},"log":"{name} places a Death Mark!"}'),
(7,'Divine Intervention','✝️','Heals you and smites foe.',4,1,1,'ENEMY','{"damage":{"formula":"(ATK+MO)*3","randomize":0.1},"elements":["holy"],"heal":{"formula":"MAXHP*0.3"},"log":"{name} calls for Divine Intervention!"}'),
(8,'Apocalypse','☁️','Massive holy damage.',4,2,15,'ENEMY','{"damage":{"formula":"MO*6+ATK*2","randomize":0.08},"elements":["holy"],"log":"{name} calls down Apocalypse!"}');

SELECT 'Battle tables migration complete.' AS status;
