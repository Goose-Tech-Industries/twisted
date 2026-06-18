-- Add spawn_x / spawn_y to game_maps for D10 (fixed start tile).
-- Both nullable: existing maps fall through to map-center default
-- in core_handler.ex / gm_commands.ex. Setting is no-op if columns
-- already exist (errors are non-fatal under `mysql -f`).

ALTER TABLE game_maps ADD COLUMN spawn_x INT NULL DEFAULT NULL;
ALTER TABLE game_maps ADD COLUMN spawn_y INT NULL DEFAULT NULL;
