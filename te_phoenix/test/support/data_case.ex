defmodule TePhoenix.DataCase do
  @moduledoc """
  This module defines the setup for tests requiring
  access to the application's data layer.

  You may define functions here to be used as helpers in
  your tests.

  Finally, if the test case interacts with the database,
  we enable the SQL sandbox, so changes done to the database
  are reverted at the end of every test. If you are using
  PostgreSQL, you can even run database tests asynchronously
  by setting `use TePhoenix.DataCase, async: true`, although
  this option is not recommended for other databases.
  """

  use ExUnit.CaseTemplate

  using do
    quote do
      alias TePhoenix.Repo

      import Ecto
      import Ecto.Changeset
      import Ecto.Query
      import TePhoenix.DataCase
    end
  end

  setup tags do
    TePhoenix.DataCase.setup_sandbox(tags)
    :ok
  end

  @doc """
  Sets up the sandbox based on the test tags.
  """
  def setup_sandbox(tags) do
    pid = Ecto.Adapters.SQL.Sandbox.start_owner!(TePhoenix.Repo, shared: not tags[:async])
    on_exit(fn -> Ecto.Adapters.SQL.Sandbox.stop_owner(pid) end)
  end

  @doc """
  Ensures the tables MapOps depends on exist in the current connection.
  Idempotent — uses CREATE TABLE IF NOT EXISTS. The test DB is empty by
  default (dev DB lives in `twisted_rpg`); this lets DB-backed tests run
  without requiring a full prod-schema dump.
  """
  def ensure_map_ops_schema! do
    repo = TePhoenix.Repo

    repo.query!("""
    CREATE TABLE IF NOT EXISTS game_maps (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) DEFAULT NULL,
      width INT DEFAULT 20,
      height INT DEFAULT 20,
      tiles_json LONGTEXT DEFAULT NULL,
      layers_json LONGTEXT DEFAULT NULL,
      schema_version INT DEFAULT 2,
      render_mode VARCHAR(64) DEFAULT 'classic',
      spawn_x INT DEFAULT NULL,
      spawn_y INT DEFAULT NULL,
      head_seq BIGINT NOT NULL DEFAULT 0
    )
    """)

    repo.query!("""
    CREATE TABLE IF NOT EXISTS game_map_ops_log (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      map_id INT NOT NULL,
      branch_id INT DEFAULT NULL,
      op_id VARCHAR(64) NOT NULL,
      op_type VARCHAR(32) NOT NULL,
      patch_json LONGTEXT NOT NULL,
      author_id INT DEFAULT NULL,
      author_name VARCHAR(128) DEFAULT NULL,
      sequence INT UNSIGNED NOT NULL DEFAULT 0,
      inverted TINYINT(1) NOT NULL DEFAULT 0,
      parent_op_id VARCHAR(64) DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_map_op (map_id, op_id),
      KEY idx_map_op_seq (map_id, sequence)
    )
    """)

    repo.query!("""
    CREATE TABLE IF NOT EXISTS game_map_snapshots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      map_id INT NOT NULL,
      seq BIGINT NOT NULL,
      layers JSON NOT NULL,
      inserted_at DATETIME(6) NOT NULL,
      KEY idx_snapshot_map_seq (map_id, seq)
    )
    """)

    :ok
  end

  @doc """
  Ensures the tables TePhoenix.Game.Quests reads/writes exist, plus the
  `characters` and `character_items` tables it joins against. Idempotent.
  """
  def ensure_quests_schema! do
    repo = TePhoenix.Repo

    repo.query!("""
    CREATE TABLE IF NOT EXISTS characters (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT DEFAULT NULL,
      level INT DEFAULT 1,
      experience INT DEFAULT 0,
      gold INT DEFAULT 0,
      alignment VARCHAR(32) DEFAULT 'neutral'
    )
    """)

    repo.query!("""
    CREATE TABLE IF NOT EXISTS character_items (
      character_id INT NOT NULL,
      item_id INT NOT NULL,
      quantity INT NOT NULL DEFAULT 0,
      PRIMARY KEY (character_id, item_id)
    )
    """)

    repo.query!("""
    CREATE TABLE IF NOT EXISTS game_quest_defs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      `key` VARCHAR(100) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      icon VARCHAR(255),
      level_required INT NOT NULL DEFAULT 0,
      repeatable TINYINT(1) NOT NULL DEFAULT 0,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      stages_json LONGTEXT NOT NULL,
      rewards_json LONGTEXT NOT NULL,
      prerequisites_json LONGTEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
    """)

    repo.query!("""
    CREATE TABLE IF NOT EXISTS game_quest_progress (
      char_id INT NOT NULL,
      quest_id INT NOT NULL,
      step INT NOT NULL DEFAULT 0,
      completed TINYINT(1) NOT NULL DEFAULT 0,
      started_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (char_id, quest_id)
    )
    """)

    repo.query!("""
    CREATE TABLE IF NOT EXISTS game_faction_rep (
      char_id INT NOT NULL,
      faction VARCHAR(64) NOT NULL,
      value INT NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (char_id, faction)
    )
    """)

    :ok
  end

  @doc """
  Ensures the tables `TePhoenix.Game.Crafting` reads/writes exist.
  Mirrors the production schema (game_craft_recipes, character_items,
  character_learned_recipes, character_gathering_levels, game_items,
  game_gathering_skills). Idempotent.
  """
  def ensure_crafting_schema! do
    repo = TePhoenix.Repo

    repo.query!("""
    CREATE TABLE IF NOT EXISTS game_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      type VARCHAR(32) NOT NULL DEFAULT 'MISC',
      icon VARCHAR(8) DEFAULT '?'
    )
    """)

    repo.query!("""
    CREATE TABLE IF NOT EXISTS game_craft_recipes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(128) NOT NULL,
      category VARCHAR(32) NOT NULL DEFAULT 'MISC',
      result_item_id INT NOT NULL,
      result_qty INT NOT NULL DEFAULT 1,
      level_req INT NOT NULL DEFAULT 1,
      skill_req VARCHAR(64) DEFAULT NULL,
      ingredients_json LONGTEXT NOT NULL,
      unlock_mode VARCHAR(16) NOT NULL DEFAULT 'ALWAYS',
      description TEXT DEFAULT NULL,
      icon VARCHAR(8) DEFAULT '?',
      is_active TINYINT(1) NOT NULL DEFAULT 1
    )
    """)

    repo.query!("""
    CREATE TABLE IF NOT EXISTS character_learned_recipes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      character_id INT NOT NULL,
      recipe_id INT NOT NULL,
      learned_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_char_recipe (character_id, recipe_id)
    )
    """)

    repo.query!("""
    CREATE TABLE IF NOT EXISTS character_gathering_levels (
      character_id INT NOT NULL,
      skill_id INT NOT NULL,
      level INT DEFAULT 1,
      xp INT DEFAULT 0,
      total_gathered INT DEFAULT 0,
      PRIMARY KEY (character_id, skill_id)
    )
    """)

    repo.query!("""
    CREATE TABLE IF NOT EXISTS game_gathering_skills (
      id INT AUTO_INCREMENT PRIMARY KEY,
      `key` VARCHAR(64) DEFAULT NULL,
      name VARCHAR(64) NOT NULL,
      is_active TINYINT(1) DEFAULT 1
    )
    """)

    # Ensure character_items has the unique key Crafting relies on.
    case repo.query("SHOW INDEX FROM character_items WHERE Key_name = 'uniq_char_item'") do
      {:ok, %{rows: []}} ->
        repo.query("ALTER TABLE character_items ADD UNIQUE KEY uniq_char_item (character_id, item_id)")

      _ ->
        :ok
    end

    :ok
  end

  @doc """
  Ensures the tables `TePhoenix.Game.Achievements` reads/writes exist.
  Mirrors prod (game_achievements, character_achievements,
  character_progress_counters, character_titles using prod's title_id
  shape so the IGNORE-on-error path is exercised). Idempotent.
  """
  def ensure_achievements_schema! do
    repo = TePhoenix.Repo

    repo.query!("""
    CREATE TABLE IF NOT EXISTS game_achievements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      key_name VARCHAR(64) NOT NULL UNIQUE,
      title VARCHAR(64) NOT NULL,
      description TEXT,
      icon VARCHAR(16) NOT NULL DEFAULT '?',
      category VARCHAR(32) NOT NULL DEFAULT 'other',
      trigger_type VARCHAR(32) NOT NULL DEFAULT 'manual',
      trigger_value INT NOT NULL DEFAULT 1,
      reward_gold INT NOT NULL DEFAULT 0,
      reward_title VARCHAR(64) DEFAULT NULL,
      is_hidden TINYINT(1) NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      reward_json TEXT DEFAULT NULL,
      points INT NOT NULL DEFAULT 10
    )
    """)

    repo.query!("""
    CREATE TABLE IF NOT EXISTS character_achievements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      character_id INT NOT NULL,
      achievement_id INT NOT NULL,
      earned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_char_achiev (character_id, achievement_id)
    )
    """)

    # Mirrors prod shape — title_id, not title VARCHAR. The Achievements
    # code does `INSERT IGNORE INTO character_titles (character_id, title,
    # granted_at)` which fails-soft against this schema; the test exercises
    # that graceful skip rather than a fictional schema.
    repo.query!("""
    CREATE TABLE IF NOT EXISTS character_titles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      character_id INT NOT NULL,
      title_id INT NOT NULL,
      earned_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_char_title (character_id, title_id)
    )
    """)

    # Add the gold column on characters if missing — base ensure_quests
    # creates `gold` already, so this is a no-op when chained.
    repo.query("ALTER TABLE characters ADD COLUMN IF NOT EXISTS gold INT DEFAULT 0")

    :ok
  end

  @doc """
  Ensures the tables `TePhoenix.Game.Magic` reads/writes exist.
  Mirrors prod schema for game_oghams + character_oghams, then lets
  Magic.ensure_schema/0 add the spell-side tables itself at first
  call. Idempotent.
  """
  def ensure_magic_schema! do
    repo = TePhoenix.Repo

    repo.query!("""
    CREATE TABLE IF NOT EXISTS game_oghams (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(64) NOT NULL,
      icon VARCHAR(8) DEFAULT '?',
      description TEXT DEFAULT NULL,
      lore_text TEXT DEFAULT NULL,
      `rank` INT NOT NULL DEFAULT 1,
      element_attack VARCHAR(64) DEFAULT NULL,
      family_id INT DEFAULT NULL
    )
    """)

    repo.query!("""
    CREATE TABLE IF NOT EXISTS character_oghams (
      id INT AUTO_INCREMENT PRIMARY KEY,
      character_id INT NOT NULL,
      item_id INT NOT NULL DEFAULT 0,
      slot_index INT NOT NULL DEFAULT 0,
      ogham_id INT NOT NULL,
      current_rank INT NOT NULL DEFAULT 1,
      kill_count INT NOT NULL DEFAULT 0,
      corruption_points INT NOT NULL DEFAULT 0,
      unlocked_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      source VARCHAR(64) DEFAULT NULL,
      UNIQUE KEY uniq_char_item_slot (character_id, item_id, slot_index)
    )
    """)

    # Magic depends on `current_hp` / `max_hp` for utility heal effect;
    # ensure they exist on the test characters table.
    repo.query("ALTER TABLE characters ADD COLUMN IF NOT EXISTS current_hp INT DEFAULT 100")
    repo.query("ALTER TABLE characters ADD COLUMN IF NOT EXISTS max_hp INT DEFAULT 100")

    :ok
  end

  @doc """
  Ensures the tables `TePhoenix.Game.Fog` reads/writes exist. Reuses
  game_maps from ensure_map_ops_schema! and extends characters with
  position columns. Fog.ensure_schema/0 creates the seen-tile +
  override tables itself on first call.
  """
  def ensure_fog_schema! do
    repo = TePhoenix.Repo

    # Position + fog columns on characters. Guarded so chaining onto
    # ensure_quests_schema!/ensure_magic_schema! is safe.
    for sql <- [
          "ALTER TABLE characters ADD COLUMN IF NOT EXISTS x INT DEFAULT 0",
          "ALTER TABLE characters ADD COLUMN IF NOT EXISTS y INT DEFAULT 0",
          "ALTER TABLE characters ADD COLUMN IF NOT EXISTS map_id INT DEFAULT NULL",
          "ALTER TABLE game_maps ADD COLUMN IF NOT EXISTS fog_of_war TINYINT(1) NOT NULL DEFAULT 0"
        ] do
      repo.query(sql)
    end

    :ok
  end

  @doc """
  A helper that transforms changeset errors into a map of messages.

      assert {:error, changeset} = Accounts.create_user(%{password: "short"})
      assert "password is too short" in errors_on(changeset).password
      assert %{password: ["password is too short"]} = errors_on(changeset)

  """
  def errors_on(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {message, opts} ->
      Regex.replace(~r"%{(\w+)}", message, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
