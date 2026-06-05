-- Phase 2B: Operational log persistence for the map editor.
-- Replaces full-blob saves with append-only op log.
-- See Te.Maps.Ops for context module + replay algorithm.

CREATE TABLE IF NOT EXISTS game_map_ops (
  id              CHAR(36)        NOT NULL,
  map_id          INT             NOT NULL,
  user_id         INT             DEFAULT NULL,
  seq             BIGINT          NOT NULL,
  op_type         VARCHAR(64)     NOT NULL,
  payload         JSON            NOT NULL,
  inverted        TINYINT(1)      NOT NULL DEFAULT 0,
  parent_op_id    CHAR(36)        DEFAULT NULL,
  inserted_at     DATETIME(6)     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_map_seq (map_id, seq),
  KEY idx_map_seq (map_id, seq),
  KEY idx_map_inverted_seq (map_id, inverted, seq),
  KEY idx_user_inserted (user_id, inserted_at)
);

CREATE TABLE IF NOT EXISTS game_map_snapshots (
  id              INT AUTO_INCREMENT NOT NULL,
  map_id          INT             NOT NULL,
  seq             BIGINT          NOT NULL,
  layers          JSON            NOT NULL,
  inserted_at     DATETIME(6)     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_snapshot_map_seq (map_id, seq)
);

-- head_seq is the latest applied op seq for the map; lets replay() resume
-- from the nearest snapshot without scanning all ops.
ALTER TABLE game_maps ADD COLUMN head_seq BIGINT NOT NULL DEFAULT 0;
