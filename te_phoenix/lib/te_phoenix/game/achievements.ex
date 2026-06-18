defmodule TePhoenix.Game.Achievements do
  @moduledoc """
  Phase 1.5c — runtime module for achievements.

  An achievement is a row in `game_achievements` with a `trigger_type`
  (one of `pvp_wins`, `pve_wins`, `quests_done`, `maps_visited`,
  `level_reached`, `manual`, `login_streak`, `gold_owned`,
  `battles_total`) and a `trigger_value` (the threshold). Per-character
  progress lives in `character_progress_counters` (created lazily by
  `ensure_table/0`); already-earned achievements live in
  `character_achievements`.

  ## Type families

  The DB enum factors into four progress shapes:

    * **counter** — `pvp_wins`, `pve_wins`, `quests_done`,
      `maps_visited`, `battles_total`. fire_event bumps the counter;
      unlock when counter ≥ trigger_value.

    * **threshold** — `level_reached`, `gold_owned`. No per-character
      counter row; reads the live value off `characters` and compares
      to trigger_value at fire time.

    * **streak** — `login_streak`. Daily counter that resets if the
      character misses a day. Stored in the same counter table with
      a side-band "last_streak_date" companion.

    * **flag** — `manual`. Script-fired explicit unlock; trigger_value
      is the flag count threshold (usually 1). fire_event with key
      `"manual"` (or any unknown key) bumps a generic counter and
      checks for matching achievements.

  Templates from `TePhoenix.Game.Quests` (1.5a) and
  `TePhoenix.Game.Crafting` (1.5b). Same lifecycle shape: validate →
  mutate → broadcast.

  ## PubSub

      Phoenix.PubSub.subscribe(TePhoenix.PubSub, "character:42")
      → {:achievement_unlocked, achievement, rewards}
      → {:achievement_progress, achievement_id, value, target}
      → {:achievement_reset, achievement_id}
  """

  alias TePhoenix.Repo

  require Logger

  @achievements_table "game_achievements"
  @char_unlocked_table "character_achievements"
  @counters_table "character_progress_counters"

  @counter_types ~w(pvp_wins pve_wins quests_done maps_visited battles_total manual)
  @threshold_types ~w(level_reached gold_owned)
  @streak_types ~w(login_streak)

  # ── Schema bootstrap ─────────────────────────────────────────────

  @doc """
  Idempotently create the per-character counter table + extend
  `game_achievements` with the richer reward columns this module
  reads. Cached via persistent_term so subsequent calls are cheap.
  """
  def ensure_schema do
    case :persistent_term.get({__MODULE__, :ready}, false) do
      true ->
        :ok

      false ->
        do_ensure_schema()
        :persistent_term.put({__MODULE__, :ready}, true)
        :ok
    end
  end

  defp do_ensure_schema do
    Repo.query!("""
    CREATE TABLE IF NOT EXISTS #{@counters_table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      character_id INT NOT NULL,
      counter_key VARCHAR(64) NOT NULL,
      value BIGINT NOT NULL DEFAULT 0,
      meta_json TEXT DEFAULT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_char_counter (character_id, counter_key),
      INDEX idx_character (character_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)

    # Add the richer reward + points columns onto game_achievements.
    # Existing data keeps reward_gold + reward_title; new rich rewards
    # (items/xp/oghams) ride in reward_json. `points` lets the
    # AchievementsPanel show a leaderboard score.
    for sql <- [
          "ALTER TABLE #{@achievements_table} ADD COLUMN IF NOT EXISTS reward_json TEXT DEFAULT NULL",
          "ALTER TABLE #{@achievements_table} ADD COLUMN IF NOT EXISTS points INT NOT NULL DEFAULT 10"
        ] do
      case Repo.query(sql) do
        {:ok, _} -> :ok
        {:error, e} -> Logger.warning("[Achievements] #{sql}: #{inspect(e)}")
      end
    end

    :ok
  rescue
    e -> Logger.error("[Achievements] ensure_schema: #{inspect(e)}")
  end

  # ── Public API ────────────────────────────────────────────────────

  @doc """
  Fire an event that may unlock one or more achievements. `event_key`
  matches a `trigger_type` value (or any string — unknown keys land
  in the generic counter bucket).

  `payload` is optional — currently used only by streak types to
  carry the date, but reserved for future per-event metadata.

  Returns `{:ok, [unlocked_achievements]}` — empty list when nothing
  unlocks. The caller doesn't have to do anything with the result; the
  module also broadcasts `{:achievement_unlocked, ...}` on PubSub.
  """
  def fire_event(character_id, event_key, payload \\ %{})

  def fire_event(nil, _, _), do: {:ok, []}

  def fire_event(character_id, event_key, payload)
      when is_integer(character_id) and is_binary(event_key) do
    ensure_schema()

    new_value = bump_counter(character_id, event_key, payload)
    candidates = candidate_achievements(event_key)
    already_unlocked = unlocked_ids(character_id)

    newly_unlocked =
      candidates
      |> Enum.reject(fn a -> a.id in already_unlocked end)
      |> Enum.filter(fn a -> meets_trigger?(character_id, a, new_value, payload) end)
      |> Enum.map(fn a -> unlock(character_id, a) end)

    {:ok, newly_unlocked}
  end

  def fire_event(_, _, _), do: {:ok, []}

  @doc """
  Achievements the character has unlocked, with `earned_at` and
  reward metadata joined in. Used by the AchievementsPanel "Unlocked"
  tab.
  """
  def list_unlocked(character_id) when is_integer(character_id) do
    ensure_schema()

    case Repo.query(
           """
           SELECT a.id, a.key_name, a.title, a.description, a.icon,
                  a.category, a.trigger_type, a.trigger_value,
                  a.reward_gold, a.reward_title, a.reward_json, a.points,
                  ca.earned_at
           FROM #{@char_unlocked_table} ca
           JOIN #{@achievements_table} a ON a.id = ca.achievement_id
           WHERE ca.character_id = ?
           ORDER BY ca.earned_at DESC
           """,
           [character_id]
         ) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, &row_to_achievement(&1, cols))

      _ ->
        []
    end
  end

  def list_unlocked(_), do: []

  @doc """
  Every visible (non-hidden, active) achievement with the character's
  current progress: `%{achievement..., progress: 0..1.0, unlocked:
  bool, earned_at: ts | nil}`. Hot-path for the AchievementsPanel
  "All / Progress" view.
  """
  def list_progress(character_id) when is_integer(character_id) do
    ensure_schema()

    char = fetch_character(character_id)
    counters = fetch_counter_map(character_id)
    unlocked = unlocked_map(character_id)

    case Repo.query(
           """
           SELECT id, key_name, title, description, icon, category,
                  trigger_type, trigger_value, reward_gold, reward_title,
                  reward_json, points, sort_order
           FROM #{@achievements_table}
           WHERE is_active = 1 AND is_hidden = 0
           ORDER BY category, sort_order, id
           """
         ) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row ->
          a = row_to_achievement(row, cols)

          progress = compute_progress(a, char, counters)
          earned_at = Map.get(unlocked, a.id)

          a
          |> Map.put(:progress, progress)
          |> Map.put(:unlocked, not is_nil(earned_at))
          |> Map.put(:earned_at, earned_at)
        end)

      _ ->
        []
    end
  end

  def list_progress(_), do: []

  @doc """
  Admin-only — wipe a single achievement off the character's record.
  Used by `/sauce/players/:id` to undo an accidental unlock or by
  test scaffolding.

  Does NOT roll back rewards (gold awarded, title applied) — those
  live on the character record and only the admin can decide whether
  to reverse them. Returns `:ok` either way.
  """
  def reset(character_id, achievement_id)
      when is_integer(character_id) and is_integer(achievement_id) do
    ensure_schema()

    Repo.query(
      "DELETE FROM #{@char_unlocked_table} WHERE character_id = ? AND achievement_id = ?",
      [character_id, achievement_id]
    )

    broadcast(character_id, {:achievement_reset, achievement_id})
    :ok
  end

  def reset(_, _), do: :ok

  # ── Counter management ───────────────────────────────────────────

  defp bump_counter(character_id, event_key, payload) do
    cond do
      event_key in @counter_types ->
        increment_counter(character_id, event_key, 1)

      event_key in @threshold_types ->
        # Threshold types read from the live characters row at evaluate
        # time — don't store a counter, but return current value so the
        # caller's filter still has a number.
        live_threshold_value(character_id, event_key)

      event_key in @streak_types ->
        bump_streak(character_id, event_key, payload)

      true ->
        # Unknown keys ride a generic counter so script-fired flags
        # ("you talked to the dragon!") still accumulate cleanly.
        increment_counter(character_id, event_key, 1)
    end
  end

  defp increment_counter(character_id, key, delta) do
    Repo.query(
      """
      INSERT INTO #{@counters_table} (character_id, counter_key, value)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE value = value + VALUES(value)
      """,
      [character_id, key, delta]
    )

    case Repo.query(
           "SELECT value FROM #{@counters_table} WHERE character_id = ? AND counter_key = ?",
           [character_id, key]
         ) do
      {:ok, %{rows: [[v]]}} -> v
      _ -> delta
    end
  end

  defp bump_streak(character_id, key, payload) do
    today =
      case payload do
        %{"date" => d} when is_binary(d) -> d
        %{date: d} when is_binary(d) -> d
        _ -> Date.utc_today() |> Date.to_iso8601()
      end

    last = fetch_last_streak_date(character_id, key)

    new_value =
      cond do
        is_nil(last) ->
          1

        last == today ->
          # Already counted today — keep the same value.
          fetch_counter_value(character_id, key) || 1

        consecutive?(last, today) ->
          (fetch_counter_value(character_id, key) || 0) + 1

        true ->
          # Missed a day; reset the streak.
          1
      end

    Repo.query(
      """
      INSERT INTO #{@counters_table} (character_id, counter_key, value, meta_json)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE value = VALUES(value), meta_json = VALUES(meta_json)
      """,
      [character_id, key, new_value, Jason.encode!(%{"last_date" => today})]
    )

    new_value
  end

  defp fetch_last_streak_date(character_id, key) do
    case Repo.query(
           "SELECT meta_json FROM #{@counters_table} WHERE character_id = ? AND counter_key = ?",
           [character_id, key]
         ) do
      {:ok, %{rows: [[meta]]}} ->
        case Jason.decode(to_string(meta || "")) do
          {:ok, %{"last_date" => d}} -> d
          _ -> nil
        end

      _ ->
        nil
    end
  end

  defp fetch_counter_value(character_id, key) do
    case Repo.query(
           "SELECT value FROM #{@counters_table} WHERE character_id = ? AND counter_key = ?",
           [character_id, key]
         ) do
      {:ok, %{rows: [[v]]}} -> v
      _ -> nil
    end
  end

  defp consecutive?(last, today) do
    with {:ok, last_date} <- Date.from_iso8601(last),
         {:ok, today_date} <- Date.from_iso8601(today) do
      Date.diff(today_date, last_date) == 1
    else
      _ -> false
    end
  end

  defp live_threshold_value(character_id, "level_reached") do
    case fetch_character(character_id) do
      %{level: l} -> l || 1
      _ -> 1
    end
  end

  defp live_threshold_value(character_id, "gold_owned") do
    case Repo.query("SELECT gold FROM characters WHERE id = ?", [character_id]) do
      {:ok, %{rows: [[g]]}} -> g || 0
      _ -> 0
    end
  end

  defp live_threshold_value(_, _), do: 0

  # ── Trigger evaluation ───────────────────────────────────────────

  defp candidate_achievements(event_key) do
    case Repo.query(
           """
           SELECT id, key_name, title, description, icon, category,
                  trigger_type, trigger_value, reward_gold, reward_title,
                  reward_json, points, sort_order
           FROM #{@achievements_table}
           WHERE is_active = 1 AND trigger_type = ?
           """,
           [event_key]
         ) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, &row_to_achievement(&1, cols))

      _ ->
        []
    end
  end

  defp meets_trigger?(_character_id, achievement, current_value, _payload)
       when is_integer(current_value) do
    current_value >= (achievement.trigger_value || 1)
  end

  defp meets_trigger?(_, _, _, _), do: false

  defp compute_progress(achievement, char, counters) do
    target = max(achievement.trigger_value || 1, 1)
    current = current_value_for(achievement.trigger_type, char, counters)

    cond do
      current >= target -> 1.0
      current <= 0 -> 0.0
      true -> Float.round(current / target, 3)
    end
  end

  defp current_value_for(type, _char, counters)
       when type in @counter_types or type in @streak_types do
    Map.get(counters, type, 0)
  end

  defp current_value_for("level_reached", char, _) do
    (char && char.level) || 1
  end

  defp current_value_for("gold_owned", char, _) do
    (char && char.gold) || 0
  end

  defp current_value_for(_other, _char, counters) do
    # Custom (script-fired) trigger keys live in the same counter map.
    Map.values(counters) |> Enum.max(fn -> 0 end)
  end

  # ── Unlock + reward distribution ─────────────────────────────────

  defp unlock(character_id, achievement) do
    Repo.query(
      """
      INSERT INTO #{@char_unlocked_table} (character_id, achievement_id, earned_at)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE earned_at = earned_at
      """,
      [character_id, achievement.id]
    )

    rewards = unlock_reward(character_id, achievement)
    broadcast(character_id, {:achievement_unlocked, achievement, rewards})

    Map.put(achievement, :rewards, rewards)
  end

  @doc """
  Distribute the achievement's rewards. Reads gold + title off the
  flat columns, plus any rich rewards (items/xp/oghams/title override)
  from `reward_json`. Returns a map summarising what was distributed.
  """
  def unlock_reward(character_id, achievement) do
    base = %{}

    base =
      if (achievement.reward_gold || 0) > 0 do
        Repo.query(
          "UPDATE characters SET gold = COALESCE(gold, 0) + ? WHERE id = ?",
          [achievement.reward_gold, character_id]
        )

        Map.put(base, :gold, achievement.reward_gold)
      else
        base
      end

    base =
      if achievement.reward_title not in [nil, ""] do
        # Append to character_titles if the table exists; otherwise
        # silently skip (some tenancies don't expose titles yet).
        case Repo.query(
               "INSERT IGNORE INTO character_titles (character_id, title, granted_at) VALUES (?, ?, NOW())",
               [character_id, achievement.reward_title]
             ) do
          {:ok, _} -> Map.put(base, :title, achievement.reward_title)
          _ -> base
        end
      else
        base
      end

    case parse_json(achievement.reward_json, %{}) do
      %{} = extra when map_size(extra) > 0 ->
        distribute_rich_rewards(character_id, extra, base)

      _ ->
        base
    end
  end

  defp distribute_rich_rewards(character_id, rewards, acc) do
    Enum.reduce(rewards, acc, fn {key, val}, a ->
      case distribute_one(character_id, key, val) do
        {:ok, summary} -> Map.put(a, String.to_atom(to_string(key)), summary)
        :skipped -> a
      end
    end)
  end

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

  defp distribute_one(cid, "xp", amount) when is_integer(amount) do
    Repo.query(
      "UPDATE characters SET experience = COALESCE(experience, 0) + ? WHERE id = ?",
      [amount, cid]
    )

    {:ok, amount}
  end

  defp distribute_one(cid, "gold", amount) when is_integer(amount) do
    Repo.query(
      "UPDATE characters SET gold = COALESCE(gold, 0) + ? WHERE id = ?",
      [amount, cid]
    )

    {:ok, amount}
  end

  defp distribute_one(cid, "oghams", oghams) when is_list(oghams) do
    if function_exported?(TePhoenix.Game.Magic, :unlock_ogham, 2) do
      Enum.each(oghams, fn id ->
        apply(TePhoenix.Game.Magic, :unlock_ogham, [cid, id])
      end)

      {:ok, length(oghams)}
    else
      Logger.info(
        "[Achievements] reward 'oghams' skipped — TePhoenix.Game.Magic.unlock_ogham/2 not exported (magic capability STUB)"
      )

      :skipped
    end
  end

  defp distribute_one(_, _, _), do: :skipped

  # ── Helpers ──────────────────────────────────────────────────────

  defp unlocked_ids(character_id) do
    case Repo.query(
           "SELECT achievement_id FROM #{@char_unlocked_table} WHERE character_id = ?",
           [character_id]
         ) do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [id] -> id end)
      _ -> []
    end
  end

  defp unlocked_map(character_id) do
    case Repo.query(
           "SELECT achievement_id, earned_at FROM #{@char_unlocked_table} WHERE character_id = ?",
           [character_id]
         ) do
      {:ok, %{rows: rows}} -> Map.new(rows, fn [id, ts] -> {id, ts} end)
      _ -> %{}
    end
  end

  defp fetch_counter_map(character_id) do
    case Repo.query(
           "SELECT counter_key, value FROM #{@counters_table} WHERE character_id = ?",
           [character_id]
         ) do
      {:ok, %{rows: rows}} -> Map.new(rows, fn [k, v] -> {k, v} end)
      _ -> %{}
    end
  end

  defp fetch_character(character_id) do
    case Repo.query(
           "SELECT id, level, gold, alignment FROM characters WHERE id = ? LIMIT 1",
           [character_id]
         ) do
      {:ok, %{rows: [[id, level, gold, alignment]]}} ->
        %{id: id, level: level, gold: gold, alignment: alignment}

      _ ->
        nil
    end
  end

  defp row_to_achievement(row, cols) do
    base = cols |> Enum.zip(row) |> Map.new()

    %{
      id: base["id"],
      key_name: base["key_name"],
      title: base["title"],
      description: base["description"],
      icon: base["icon"],
      category: base["category"],
      trigger_type: base["trigger_type"],
      trigger_value: base["trigger_value"] || 1,
      reward_gold: base["reward_gold"] || 0,
      reward_title: base["reward_title"],
      reward_json: base["reward_json"],
      points: base["points"] || 10,
      earned_at: base["earned_at"]
    }
  end

  defp broadcast(character_id, msg) do
    Phoenix.PubSub.broadcast(TePhoenix.PubSub, "character:#{character_id}", msg)
  rescue
    _ -> :ok
  end

  defp parse_json(nil, default), do: default
  defp parse_json("", default), do: default

  defp parse_json(s, default) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, v} -> v
      _ -> default
    end
  end

  defp parse_json(_, default), do: default
end
