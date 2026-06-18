-- =================================================================
-- Session 28: Formation Shapes + Battle Data Population +
--             Auto-Battle + Damage Preview + Morale + Brave/Default
-- =================================================================

-- ─── 1. Formation Shapes Table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS game_formation_shapes (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(50) NOT NULL UNIQUE,
    label           VARCHAR(100) DEFAULT NULL,
    icon            VARCHAR(20) DEFAULT '',
    description     TEXT,
    shape_type      ENUM('v_shape','line','diamond','wedge','wall') NOT NULL,
    min_members     INT DEFAULT 2,
    bonuses_json    JSON DEFAULT NULL,
    active          TINYINT(1) DEFAULT 1,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO game_formation_shapes (name, label, icon, description, shape_type, min_members, bonuses_json) VALUES
('v_shape', 'Vanguard V', '🔱', '1 front, 2+ back flanks. The point fighter draws aggro while flankers deal bonus damage.', 'v_shape', 3,
 '{"attack_pct": 0.10, "defense_pct": 0.00, "speed_pct": 0.05}'),
('line', 'Battle Line', '➖', 'All fighters in the same row. United front or ranged barrage.', 'line', 2,
 '{"attack_pct": 0.05, "defense_pct": 0.05, "speed_pct": 0.00}'),
('diamond', 'Diamond Guard', '💎', '1 front, 2 middle, 1 back. Balanced protection from all angles.', 'diamond', 4,
 '{"attack_pct": 0.00, "defense_pct": 0.15, "speed_pct": 0.00}'),
('wedge', 'Spearhead', '🔺', '2+ front chargers, 1 back support. Aggressive push formation.', 'wedge', 3,
 '{"attack_pct": 0.15, "defense_pct": -0.05, "speed_pct": 0.05}'),
('wall', 'Shield Wall', '🛡️', 'All front row, 3+ members. Impenetrable defensive line.', 'wall', 3,
 '{"attack_pct": -0.05, "defense_pct": 0.20, "speed_pct": -0.10}');

-- ─── 2. Populate Battle Terrain ─────────────────────────────────
INSERT IGNORE INTO game_battle_terrain (name, icon, description, movement_cost_mult, stat_modifiers_json, type_advantages_json) VALUES
('open',       '🟩', 'Flat terrain with no modifiers.',                           1.0, '{}', '{}'),
('forest',     '🌲', 'Trees provide cover but slow movement.',                    1.5, '{"defense_pct": 0.10}', '{"fire": 1.25}'),
('high_ground','⛰️', 'Elevation gives ranged advantage.',                          1.0, '{"attack_pct": 0.10, "defense_pct": 0.05}', '{}'),
('water',      '🌊', 'Slows movement, boosts water skills, weakens fire.',        2.0, '{}', '{"water": 1.25, "fire": 0.75, "lightning": 1.50}'),
('fire',       '🔥', 'Deals damage each turn. Fire skills boosted.',              1.0, '{}', '{"fire": 1.25, "ice": 0.75}'),
('ice',        '🧊', 'Slippery — chance to lose turn. Ice boosted.',              1.5, '{"speed_pct": -0.15}', '{"ice": 1.25, "fire": 0.75}'),
('mud',        '🟤', 'Greatly slows movement.',                                    2.5, '{"speed_pct": -0.20}', '{"earth": 1.25}'),
('sand',       '🏜️', 'Moderate slow. Wind attacks kick up blinding sand.',         1.5, '{"speed_pct": -0.10}', '{"wind": 1.25}'),
('swamp',      '🐸', 'Poison risk each turn. Dark magic boosted.',                2.0, '{}', '{"dark": 1.25, "light": 0.75}'),
('rubble',     '🧱', 'Difficult to traverse. Earth magic empowered.',             2.0, '{"defense_pct": 0.05}', '{"earth": 1.25}'),
('thorns',     '🌹', 'Moving through deals minor damage.',                        1.5, '{}', '{"earth": 1.15}'),
('holy',       '✨', 'Heals light-aligned, damages dark-aligned each turn.',      1.0, '{}', '{"light": 1.50, "dark": 0.50}');

-- ─── 3. Populate Battle Items ───────────────────────────────────
INSERT IGNORE INTO game_battle_items (name, icon, description, effect_json, uses_per_battle, cooldown_turns) VALUES
('smoke_bomb',    '💨', 'Reduces all enemies accuracy by 25% for 2 turns.',
 '{"type": "debuff", "stat": "accuracy", "value": -0.25, "duration": 2, "target": "all_enemies"}', 1, 0),
('flash_bang',    '💡', 'Chance to stun all enemies for 1 turn.',
 '{"type": "status", "status": "stun", "chance": 0.60, "duration": 1, "target": "all_enemies"}', 1, 0),
('war_drum',      '🥁', 'Boosts party attack by 15% for 3 turns.',
 '{"type": "buff", "stat": "attack_pct", "value": 0.15, "duration": 3, "target": "all_allies"}', 1, 0),
('barrier_scroll','📜', 'Grants 100 HP absorption barrier to one ally.',
 '{"type": "barrier", "amount": 100, "duration": 3, "barrier_type": "all", "target": "one_ally"}', 2, 3),
('antidote',      '💊', 'Removes poison and burn from one ally.',
 '{"type": "cleanse", "remove": ["poison", "burn"], "target": "one_ally"}', 3, 0),
('phoenix_ash',   '🔶', 'Revives a fallen ally with 25% HP.',
 '{"type": "revive", "hp_pct": 0.25, "target": "one_dead_ally"}', 1, 0);

-- ─── 4. Populate Battle Conditions ──────────────────────────────
INSERT IGNORE INTO game_battle_conditions (name, icon, description, condition_type, effect_json) VALUES
('fog_of_war',    '🌫️', 'Accuracy reduced by 20% for all. Ranged attacks suffer double penalty.',
 'random', '{"stat_mod": {"accuracy_pct": -0.20}, "ranged_extra_penalty": -0.20}'),
('blood_moon',    '🌑', 'Dark damage +30%, Light damage -30%. Bleed effects last 2 extra turns.',
 'event', '{"element_mod": {"dark": 1.30, "light": 0.70}, "bleed_duration_bonus": 2}'),
('sacred_truce',  '🕊️', 'No killing allowed — all lethal blows become KOs instead.',
 'arena', '{"force_nonlethal": true}'),
('berserker_rage', '😤', 'All combatants deal +25% damage but take +15% damage.',
 'random', '{"stat_mod": {"attack_pct": 0.25, "defense_pct": -0.15}}'),
('time_pressure', '⏳', 'Battle must end within 10 turns or both sides lose.',
 'event', '{"max_turns": 10, "timeout_result": "draw"}'),
('champions_duel','⚔️', 'Only 1v1 — no party members, no summons, no items.',
 'arena', '{"max_per_team": 1, "disable_items": true, "disable_summons": true}');
