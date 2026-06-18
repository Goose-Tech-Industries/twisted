defmodule TePhoenix.Game.Quests do
  @moduledoc """
  Phase 1.5a — runtime module for the quest system.

  Wraps `game_quest_defs` (definition catalog: stages, prereqs, rewards)
  and `game_quest_progress` (per-character state). Lifecycle:

    `start/3`     → insert progress row at step 0
    `advance/4`   → bump step; auto-completes when all stages cleared
    `complete/2`  → mark completed, distribute rewards, fire PubSub
    `list_active/1`, `list_completed/1` — hot-path reads

  ### Schema reality check

  `game_quest_progress` is a flat step counter
  `(char_id, quest_id, step, completed, started_at, updated_at)`.
  Stages live in `game_quest_defs.stages_json`. The module treats one
  `step` as one stage cleared. Per-objective sub-counters (e.g. "kill 5
  wolves") aren't in the schema yet — when needed, store them in a
  future `objectives_progress_json` column or in flag rows. For now,
  callers (script_effects, NPC dialogue) advance the step explicitly
  when they observe an objective complete.

  ### Reward graceful-skip

  Capabilities that are STUBs in the matrix (magic, achievements) are
  invoked behind `function_exported?/3` checks; missing modules log a
  warning instead of raising. Lets quests with magic/achievement
  rewards parse cleanly today and start firing once those modules ship.

  ### Op log

  Lifecycle events (start / advance / complete) write to the map-op
  log? No — quest progress is character-scoped, not map-scoped, so it
  lives outside the MapOps stream. Audit trail is via the
  `game_event_log` table for player history + the PubSub events for
  live UI.
  """

  alias TePhoenix.Repo

  require Logger

  @progress_table "game_quest_progress"
  @def_table "game_quest_defs"

  # ── Public API ────────────────────────────────────────────────────

  @doc """
  Start a quest for `character_id`. Validates prerequisites, inserts a
  progress row at step 0, and broadcasts `{:quest_started, def}`.

  Returns `{:ok, progress}` | `{:error, reason}`.
  """
  def start(character_id, quest_def_id, opts \\ []) do
    skip_prereqs? = Keyword.get(opts, :skip_prerequisites, false)

    with {:ok, def} <- fetch_def(quest_def_id),
         :ok <- (if skip_prereqs?, do: :ok, else: prerequisites_check(character_id, def)) do
      now = utc_now()

      Repo.query(
        """
        INSERT INTO #{@progress_table} (char_id, quest_id, step, completed, started_at, updated_at)
        VALUES (?, ?, 0, 0, ?, ?)
        ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)
        """,
        [character_id, quest_def_id, now, now]
      )

      progress = %{
        char_id: character_id,
        quest_id: quest_def_id,
        step: 0,
        completed: false,
        started_at: now
      }

      broadcast(character_id, {:quest_started, def, progress})
      {:ok, progress}
    end
  end

  @doc """
  Advance a quest by one step (default), or by `delta` steps. If the
  resulting step >= total stages, auto-completes the quest. Broadcasts
  `{:quest_advanced, ...}` on each step and `{:quest_completed, ...}`
  when complete.
  """
  def advance(character_id, quest_def_id, _objective_key \\ nil, delta \\ 1) do
    with {:ok, def} <- fetch_def(quest_def_id),
         {:ok, current} <- fetch_progress(character_id, quest_def_id) do
      new_step = current.step + delta
      total_stages = stages_count(def)
      now = utc_now()

      Repo.query(
        "UPDATE #{@progress_table} SET step = ?, updated_at = ? WHERE char_id = ? AND quest_id = ?",
        [new_step, now, character_id, quest_def_id]
      )

      broadcast(character_id, {:quest_advanced, def, new_step, total_stages})

      if new_step >= total_stages do
        complete(character_id, quest_def_id)
      else
        {:ok, %{current | step: new_step, updated_at: now}}
      end
    end
  end

  @doc """
  Mark a quest as completed and distribute its rewards. Idempotent — a
  second call on an already-completed row distributes no rewards.
  """
  def complete(character_id, quest_def_id) do
    with {:ok, def} <- fetch_def(quest_def_id),
         {:ok, progress} <- fetch_progress(character_id, quest_def_id) do
      if progress.completed do
        {:ok, progress}
      else
        now = utc_now()

        Repo.query(
          "UPDATE #{@progress_table} SET completed = 1, updated_at = ? WHERE char_id = ? AND quest_id = ?",
          [now, character_id, quest_def_id]
        )

        rewards = parse_json(def.rewards_json, %{})
        distributed = distribute_rewards(character_id, rewards)

        broadcast(character_id, {:quest_completed, def, distributed})
        {:ok, %{progress | completed: true, updated_at: now}}
      end
    end
  end

  @doc """
  Active (non-completed, in-progress) quests for the character.
  Used by the player client's QuestPanel.
  """
  def list_active(character_id) do
    case Repo.query(
           """
           SELECT p.char_id, p.quest_id, p.step, p.completed, p.started_at, p.updated_at,
                  d.key, d.name, d.description, d.icon, d.stages_json
           FROM #{@progress_table} p
           JOIN #{@def_table} d ON d.id = p.quest_id
           WHERE p.char_id = ? AND p.completed = 0 AND d.enabled = 1
           ORDER BY p.started_at DESC
           """,
           [character_id]
         ) do
      {:ok, %{rows: rows}} -> Enum.map(rows, &row_to_active/1)
      _ -> []
    end
  end

  @doc """
  Quests this character has completed at least once. Includes
  repeatable quests on every clear; downstream UI can group/dedupe.
  """
  def list_completed(character_id) do
    case Repo.query(
           """
           SELECT p.char_id, p.quest_id, p.step, p.completed, p.started_at, p.updated_at,
                  d.key, d.name, d.icon
           FROM #{@progress_table} p
           JOIN #{@def_table} d ON d.id = p.quest_id
           WHERE p.char_id = ? AND p.completed = 1
           ORDER BY p.updated_at DESC
           """,
           [character_id]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [cid, qid, step, completed, started, updated, key, name, icon] ->
          %{
            char_id: cid,
            quest_id: qid,
            step: step,
            completed: completed == 1,
            started_at: started,
            updated_at: updated,
            key: key,
            name: name,
            icon: icon
          }
        end)

      _ ->
        []
    end
  end

  @doc """
  Returns true if the character meets all prerequisites for the quest
  definition. Used by NPC dialogue's "accept quest" gate.
  """
  def evaluate_prerequisites(character_id, quest_def_id) do
    case fetch_def(quest_def_id) do
      {:ok, def} -> prerequisites_check(character_id, def) == :ok
      _ -> false
    end
  end

  # ── Internals ─────────────────────────────────────────────────────

  defp fetch_def(quest_def_id) do
    case Repo.query(
           "SELECT id, `key`, name, description, icon, level_required, repeatable, enabled, stages_json, rewards_json, prerequisites_json FROM #{@def_table} WHERE id = ? LIMIT 1",
           [quest_def_id]
         ) do
      {:ok, %{rows: [[id, key, name, desc, icon, lvl, rep, en, stages, rewards, prereqs]]}} ->
        {:ok,
         %{
           id: id,
           key: key,
           name: name,
           description: desc,
           icon: icon,
           level_required: lvl,
           repeatable: rep == 1,
           enabled: en == 1,
           stages_json: stages,
           rewards_json: rewards,
           prerequisites_json: prereqs
         }}

      _ ->
        {:error, :quest_not_found}
    end
  end

  defp fetch_progress(character_id, quest_def_id) do
    case Repo.query(
           "SELECT char_id, quest_id, step, completed, started_at, updated_at FROM #{@progress_table} WHERE char_id = ? AND quest_id = ? LIMIT 1",
           [character_id, quest_def_id]
         ) do
      {:ok, %{rows: [[cid, qid, step, completed, started, updated]]}} ->
        {:ok,
         %{
           char_id: cid,
           quest_id: qid,
           step: step,
           completed: completed == 1,
           started_at: started,
           updated_at: updated
         }}

      _ ->
        {:error, :no_progress}
    end
  end

  defp prerequisites_check(character_id, def) do
    prereqs = parse_json(def.prerequisites_json, [])
    char = fetch_character(character_id)

    cond do
      is_nil(char) -> {:error, :character_not_found}
      def.enabled == false -> {:error, :quest_disabled}
      def.level_required > 0 and (char.level || 1) < def.level_required -> {:error, :level_too_low}
      not all_prereqs_met?(prereqs, character_id, char) -> {:error, :prerequisites_unmet}
      true -> :ok
    end
  end

  defp all_prereqs_met?(prereqs, character_id, char) when is_list(prereqs) do
    Enum.all?(prereqs, fn p -> prereq_met?(p, character_id, char) end)
  end

  defp all_prereqs_met?(_, _, _), do: true

  defp prereq_met?(%{"type" => "level", "min" => n}, _cid, char), do: (char.level || 1) >= n

  defp prereq_met?(%{"type" => "completed", "quest_id" => qid}, cid, _char) do
    case Repo.query(
           "SELECT completed FROM #{@progress_table} WHERE char_id = ? AND quest_id = ? LIMIT 1",
           [cid, qid]
         ) do
      {:ok, %{rows: [[1]]}} -> true
      _ -> false
    end
  end

  defp prereq_met?(%{"type" => "items_owned", "items" => items}, cid, _char) when is_list(items) do
    Enum.all?(items, fn id ->
      case Repo.query(
             "SELECT 1 FROM character_items WHERE character_id = ? AND item_id = ? AND quantity > 0 LIMIT 1",
             [cid, id]
           ) do
        {:ok, %{rows: [[1]]}} -> true
        _ -> false
      end
    end)
  end

  defp prereq_met?(%{"type" => "alignment", "in" => allowed}, _cid, char) when is_list(allowed) do
    (char.alignment || "neutral") in allowed
  end

  defp prereq_met?(_, _, _), do: true

  defp fetch_character(character_id) do
    case Repo.query(
           "SELECT id, level, alignment FROM characters WHERE id = ? LIMIT 1",
           [character_id]
         ) do
      {:ok, %{rows: [[id, level, alignment]]}} ->
        %{id: id, level: level, alignment: alignment}

      _ ->
        nil
    end
  end

  defp stages_count(def) do
    case parse_json(def.stages_json, []) do
      list when is_list(list) -> max(length(list), 1)
      _ -> 1
    end
  end

  # ── Reward distribution ──────────────────────────────────────────

  defp distribute_rewards(character_id, rewards) when is_map(rewards) do
    rewards
    |> Enum.reduce(%{}, fn {key, val}, acc ->
      case distribute_one(character_id, key, val) do
        {:ok, label} -> Map.put(acc, key, label)
        :skipped -> Map.put(acc, key, :skipped)
      end
    end)
  end

  defp distribute_rewards(_, _), do: %{}

  defp distribute_one(cid, "items", items) when is_list(items) do
    Enum.each(items, fn item ->
      id = Map.get(item, "item_id") || Map.get(item, :item_id)
      qty = Map.get(item, "qty", 1) || 1

      if id do
        Repo.query(
          """
          INSERT INTO character_items (character_id, item_id, quantity)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)
          """,
          [cid, id, qty]
        )
      end
    end)

    {:ok, length(items)}
  end

  defp distribute_one(cid, "gold", amount) when is_integer(amount) do
    Repo.query(
      "UPDATE characters SET gold = COALESCE(gold, 0) + ? WHERE id = ?",
      [amount, cid]
    )

    {:ok, amount}
  end

  defp distribute_one(cid, "xp", amount) when is_integer(amount) do
    Repo.query(
      "UPDATE characters SET experience = COALESCE(experience, 0) + ? WHERE id = ?",
      [amount, cid]
    )

    {:ok, amount}
  end

  defp distribute_one(cid, "faction_rep", deltas) when is_map(deltas) do
    Enum.each(deltas, fn {faction, delta} ->
      Repo.query(
        """
        INSERT INTO game_faction_rep (char_id, faction, value, updated_at)
        VALUES (?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE value = value + VALUES(value), updated_at = NOW()
        """,
        [cid, faction, delta]
      )
    end)

    {:ok, map_size(deltas)}
  end

  defp distribute_one(cid, "oghams", oghams) when is_list(oghams) do
    # Magic capability is currently STUB per the engine matrix.
    if function_exported?(TePhoenix.Game.Magic, :unlock_ogham, 2) do
      Enum.each(oghams, fn id ->
        apply(TePhoenix.Game.Magic, :unlock_ogham, [cid, id])
      end)

      {:ok, length(oghams)}
    else
      Logger.warning(
        "[Quests] reward 'oghams' skipped — TePhoenix.Game.Magic.unlock_ogham/2 not exported (magic capability STUB)"
      )

      :skipped
    end
  end

  defp distribute_one(cid, "achievement_triggers", keys) when is_list(keys) do
    if function_exported?(TePhoenix.Game.Achievements, :fire_event, 2) do
      Enum.each(keys, fn key ->
        apply(TePhoenix.Game.Achievements, :fire_event, [cid, key])
      end)

      {:ok, length(keys)}
    else
      Logger.warning(
        "[Quests] reward 'achievement_triggers' skipped — TePhoenix.Game.Achievements.fire_event/2 not exported (achievements capability STUB)"
      )

      :skipped
    end
  end

  defp distribute_one(_, _, _), do: :skipped

  # ── PubSub broadcast ─────────────────────────────────────────────

  defp broadcast(character_id, msg) do
    Phoenix.PubSub.broadcast(TePhoenix.PubSub, "character:#{character_id}", msg)
  rescue
    _ -> :ok
  end

  # ── Helpers ──────────────────────────────────────────────────────

  defp parse_json(nil, default), do: default
  defp parse_json("", default), do: default

  defp parse_json(s, default) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, v} -> v
      _ -> default
    end
  end

  defp parse_json(_, default), do: default

  defp utc_now, do: NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)

  defp row_to_active([cid, qid, step, completed, started, updated, key, name, desc, icon, stages]) do
    %{
      char_id: cid,
      quest_id: qid,
      step: step,
      completed: completed == 1,
      started_at: started,
      updated_at: updated,
      key: key,
      name: name,
      description: desc,
      icon: icon,
      stages: parse_json(stages, [])
    }
  end
end
