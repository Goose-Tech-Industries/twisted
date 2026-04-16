-- ═══════════════════════════════════════════════════════════════
-- HYPERBOLIC TIME CHAMBER — Map + Training Configs
-- ═══════════════════════════════════════════════════════════════

-- 1. HTC Training configs (gravity-boosted versions of base training)
INSERT IGNORE INTO game_training_config (name, label, description, training_type, stat_gains, stat_costs, daily_limit, cooldown_minutes, requires_partner, requires_master, min_level, gravity_multiplier, active)
VALUES
  ('htc_physical', 'Gravity Physical Training', 'Push your body to the limit under extreme gravity. Massive ATK and DEF gains.', 'self_train',
   '{"atk":0.008,"def":0.006,"max_hp":0.004}', '{"current_hp":0.02}', 100, 0, 0, 0, 1, 10.0, 1),
  ('htc_speed', 'Gravity Speed Training', 'Sprint and dodge under crushing pressure. Speed and reflexes sharpen.', 'self_train',
   '{"speed":0.010,"luck":0.003,"def":0.002}', '{"current_hp":0.015}', 100, 0, 0, 0, 1, 10.0, 1),
  ('htc_meditate', 'Deep Meditation', 'Focus your ki in the timeless void. Expand magical reserves.', 'meditate',
   '{"mo":0.007,"md":0.005,"max_mp":0.008}', '{"current_mp":0.02}', 100, 0, 0, 0, 1, 10.0, 1),
  ('htc_endurance', 'Endurance Conditioning', 'Withstand gravity pressure for extended periods. Build HP and stamina.', 'self_train',
   '{"max_hp":0.012,"def":0.004,"max_mp":0.003}', '{"current_hp":0.03}', 100, 0, 0, 0, 1, 10.0, 1);

-- 2. Create the HTC map (small map, white void, first-person mode)
-- Note: This creates a 20x20 map. Adjust ID as needed or use AdminSauce.
-- The zone_type='HTC' triggers the white void renderer + HTC panel.
INSERT INTO game_maps (name, description, width, height, zone_type, render_mode, ambient_sound, weather, fast_travel_enabled)
VALUES (
  'Hyperbolic Time Chamber',
  'A dimension outside of time. One hour here is twelve hours inside. The crushing gravity pushes warriors past their limits.',
  20, 20,
  'HTC',
  'first-person',
  NULL, NULL, 0
);

-- Set the tiles to all passable ground (tile 0) with walls on edges
-- You can customize this in AdminSauce after creation
SET @htc_map_id = LAST_INSERT_ID();

-- Generate a simple open room with border walls
-- tiles_json: 20x20 grid, edges are walls (1), interior is open floor (0)
UPDATE game_maps SET tiles_json = (
  SELECT CONCAT('[',
    GROUP_CONCAT(
      CASE
        WHEN y = 0 OR y = 19 THEN '[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]'
        ELSE CONCAT('[1,', REPEAT('0,', 17), '0,1]')
      END
      ORDER BY y
      SEPARATOR ','
    ),
  ']')
  FROM (SELECT 0 AS y UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
        UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
        UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
        UNION SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19) nums
)
WHERE id = @htc_map_id;

-- Set spawn point to center
UPDATE game_maps SET spawn_x = 10, spawn_y = 10 WHERE id = @htc_map_id;

SELECT CONCAT('HTC Map created with ID: ', @htc_map_id) AS result;
