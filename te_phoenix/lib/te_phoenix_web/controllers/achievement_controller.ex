defmodule TePhoenixWeb.AchievementController do
  @moduledoc """
  REST surface for achievements. Thin wrapper around
  `TePhoenix.Game.Achievements` (1.5c). Replaces the inline-SQL stub
  that referenced columns the schema didn't have (`name` / `points`).

  Endpoints:

      GET  /api/achievements                — full catalogue (visible only)
      GET  /api/achievements/:char_id       — character progress + unlocked
      POST /api/achievements/fire           — fire an event (admin/script)
      POST /api/achievements/reset          — admin-only reset of one row
  """

  use TePhoenixWeb, :controller

  alias TePhoenix.Game.Achievements
  alias TePhoenix.Repo

  @doc "GET /api/achievements — every visible, active achievement."
  def list_achievements(conn, _params) do
    Achievements.ensure_schema()

    rows =
      query_rows("""
      SELECT id, key_name, title, description, icon, category,
             trigger_type, trigger_value, reward_gold, reward_title,
             reward_json, points, is_hidden, sort_order
      FROM game_achievements
      WHERE is_active = 1 AND is_hidden = 0
      ORDER BY category, sort_order, id
      """)

    achievements =
      Enum.map(rows, fn r ->
        %{
          id: r["id"],
          key: r["key_name"],
          name: r["title"],
          description: r["description"],
          icon: r["icon"],
          category: r["category"],
          trigger_type: r["trigger_type"],
          trigger_value: r["trigger_value"],
          reward_gold: r["reward_gold"],
          reward_title: r["reward_title"],
          points: r["points"] || 10
        }
      end)

    json(conn, %{success: true, achievements: achievements})
  end

  @doc """
  GET /api/achievements/:char_id — full progress view per the
  AchievementsPanel.svelte expectations: returns `achievements`
  (every visible row with `progress` + `unlocked`) and
  `unlocked` (just the earned rows) plus `totalPoints`.
  """
  def get_character_achievements(conn, %{"char_id" => char_id_str}) do
    case parse_int(char_id_str) do
      nil ->
        json(conn, %{success: false, message: "bad char_id"})

      char_id ->
        progress_rows = Achievements.list_progress(char_id)
        unlocked_rows = Achievements.list_unlocked(char_id)
        total_points = Enum.reduce(unlocked_rows, 0, fn a, acc -> acc + (a.points || 10) end)

        json(conn, %{
          success: true,
          achievements: Enum.map(progress_rows, &shape_for_ui/1),
          unlocked: Enum.map(unlocked_rows, &shape_for_ui/1),
          totalPoints: total_points
        })
    end
  end

  @doc """
  POST /api/achievements/fire body: %{event_key, count?, payload?}
  Used by scripts + GMs to drive achievements forward when the
  default counter sources don't catch the event automatically.
  """
  def fire(conn, %{"event_key" => event_key} = params) do
    case current_character_id(conn) do
      nil ->
        json(conn, %{success: false, message: "no character"})

      char_id ->
        count = parse_int(params["count"], 1)
        payload = params["payload"] || %{}

        unlocked =
          Enum.flat_map(1..count, fn _ ->
            case Achievements.fire_event(char_id, event_key, payload) do
              {:ok, list} -> list
              _ -> []
            end
          end)

        json(conn, %{
          success: true,
          unlocked: Enum.map(unlocked, &shape_for_ui/1),
          count: length(unlocked)
        })
    end
  end

  def fire(conn, _),
    do: json(conn, %{success: false, message: "event_key required"})

  @doc """
  POST /api/achievements/reset body: %{achievementId, characterId}
  Admin-only reset. Bypasses the user-scoped character lookup so a
  staff admin can fix accidental unlocks for any player.
  """
  def reset(conn, %{"achievementId" => ach_id} = params) do
    if not staff?(conn) do
      json(conn, %{success: false, message: "unauthorized"})
    else
      char_id = parse_int(params["characterId"]) || current_character_id(conn)
      ach_id_int = parse_int(ach_id)

      cond do
        is_nil(char_id) -> json(conn, %{success: false, message: "characterId required"})
        is_nil(ach_id_int) -> json(conn, %{success: false, message: "bad achievementId"})
        true ->
          Achievements.reset(char_id, ach_id_int)
          json(conn, %{success: true})
      end
    end
  end

  def reset(conn, _),
    do: json(conn, %{success: false, message: "achievementId required"})

  # ── Helpers ──────────────────────────────────────────────────────

  defp shape_for_ui(achievement) when is_map(achievement) do
    progress =
      cond do
        Map.has_key?(achievement, :progress) -> achievement.progress
        Map.get(achievement, :unlocked) == true -> 1.0
        true -> 0.0
      end

    %{
      id: achievement.id,
      key: achievement.key_name,
      name: achievement.title,
      description: achievement.description,
      icon: achievement.icon,
      category: achievement.category,
      progress: progress,
      unlocked: achievement[:unlocked] == true or progress >= 1.0,
      unlocked_at: achievement[:earned_at],
      reward_gold: achievement.reward_gold,
      reward_title: achievement.reward_title,
      points: achievement.points
    }
  end

  defp current_character_id(conn) do
    user_id = conn.assigns[:user_id] || (conn.private[:plug_session] || %{})["user_id"]

    if user_id do
      case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT 1", [user_id]) do
        {:ok, %{rows: [[char_id]]}} -> char_id
        _ -> nil
      end
    end
  end

  defp staff?(conn) do
    role = conn.assigns[:user_role] || (conn.private[:plug_session] || %{})["role"] || "PLAYER"
    weight = TePhoenixWeb.Components.PowerUserField.role_weight(role)
    weight >= 60
  end

  defp query_rows(sql, params \\ []) do
    case Repo.query(sql, params) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)

      _ ->
        []
    end
  end

  defp parse_int(nil), do: nil
  defp parse_int(""), do: nil
  defp parse_int(v) when is_integer(v), do: v

  defp parse_int(v) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      _ -> nil
    end
  end

  defp parse_int(_), do: nil

  defp parse_int(nil, default), do: default
  defp parse_int(v, _) when is_integer(v), do: v

  defp parse_int(v, default) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      _ -> default
    end
  end

  defp parse_int(_, default), do: default
end
