-- Phase 2B: extend the existing game_map_ops_log with the columns JARVIS
-- specified that aren't already present. Existing 214 ops are preserved.
-- The `sequence` column already exists but defaults to 0 and was never
-- maintained — backfill it monotonically per map_id (oldest first).

ALTER TABLE game_map_ops_log
  ADD COLUMN inverted TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN parent_op_id VARCHAR(64) DEFAULT NULL;

CREATE INDEX idx_map_inverted_seq ON game_map_ops_log (map_id, inverted, sequence);
CREATE INDEX idx_map_parent ON game_map_ops_log (map_id, parent_op_id);

-- Backfill `sequence` per map_id, ordered by created_at (then id as a
-- tiebreaker so identical-timestamp ops still get a stable order).
SET @row_seq := 0;
SET @prev_map := NULL;

UPDATE game_map_ops_log AS target
JOIN (
  SELECT id,
         (@row_seq := IF(@prev_map = map_id, @row_seq + 1, 1)) AS new_seq,
         (@prev_map := map_id) AS _set_map
  FROM game_map_ops_log
  ORDER BY map_id, created_at, id
) AS computed ON computed.id = target.id
SET target.sequence = computed.new_seq;

-- Update game_maps.head_seq to the max sequence per map after backfill.
UPDATE game_maps gm
LEFT JOIN (
  SELECT map_id, MAX(sequence) AS max_seq
  FROM game_map_ops_log
  GROUP BY map_id
) AS counts ON counts.map_id = gm.id
SET gm.head_seq = COALESCE(counts.max_seq, 0);
