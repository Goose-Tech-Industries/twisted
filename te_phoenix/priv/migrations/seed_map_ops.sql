-- Phase 2B: seed `seed_from_snapshot` op for any map without an op
-- history. Idempotent — skips maps that already have ops.

INSERT INTO game_map_ops_log
  (map_id, op_id, op_type, patch_json, author_name, sequence, inverted, created_at)
SELECT
  m.id,
  UUID(),
  'seed_from_snapshot',
  JSON_OBJECT('layers', JSON_EXTRACT(m.layers_json, '$.layers')),
  'system',
  1,
  0,
  NOW(6)
FROM game_maps m
LEFT JOIN (
  SELECT DISTINCT map_id FROM game_map_ops_log
) existing ON existing.map_id = m.id
WHERE existing.map_id IS NULL
  AND m.layers_json IS NOT NULL;

-- Refresh head_seq for newly-seeded maps.
UPDATE game_maps gm
LEFT JOIN (
  SELECT map_id, MAX(sequence) AS max_seq
  FROM game_map_ops_log
  GROUP BY map_id
) AS counts ON counts.map_id = gm.id
SET gm.head_seq = COALESCE(counts.max_seq, 0)
WHERE gm.head_seq < COALESCE(counts.max_seq, 0);
