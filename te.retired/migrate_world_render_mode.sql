-- =================================================================
-- Per-World + Per-Map Render Mode
-- Allows each world to define its rendering style (classic, 2.5d,
-- future: isometric, hex). Maps can override their world's default.
-- Player preference becomes the fallback when world/map don't specify.
-- Safe to re-run.
-- =================================================================

-- ── World-level render mode ────────────────────────────────────
ALTER TABLE game_worlds
    ADD COLUMN IF NOT EXISTS render_mode VARCHAR(16) DEFAULT NULL AFTER is_active;
-- NULL = use player preference, 'classic' = force flat, '2.5d' = force extruded

-- ── Map-level override ─────────────────────────────────────────
ALTER TABLE game_maps
    ADD COLUMN IF NOT EXISTS render_mode VARCHAR(16) DEFAULT NULL;
-- NULL = use world default, 'classic' / '2.5d' = override for this specific map

-- Example: Planet Mado is classic, Planet Namek is 2.5D
-- UPDATE game_worlds SET render_mode='classic' WHERE name='Planet Mado';
-- UPDATE game_worlds SET render_mode='2.5d' WHERE name='Planet Namek';
-- A specific dungeon map could override its world:
-- UPDATE game_maps SET render_mode='2.5d' WHERE id=42;
