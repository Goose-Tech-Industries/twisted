defmodule TePhoenixWeb.RulesetController do
  use TePhoenixWeb, :controller
  alias TePhoenix.Repo

  # ── List all rulesets ──
  def index(conn, _params) do
    case Repo.query("SELECT * FROM game_campaign_rulesets ORDER BY name") do
      {:ok, %{rows: rows, columns: cols}} ->
        rulesets = Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
        json(conn, %{rulesets: rulesets})
      _ ->
        json(conn, %{rulesets: []})
    end
  end

  # ── Create ruleset ──
  def create(conn, params) do
    try do
      {:ok, result} = Repo.query(
        "INSERT INTO game_campaign_rulesets (name, stat_mode, combat_mode) VALUES (?,?,?)",
        [params["name"] || "New Ruleset", params["stat_mode"] || "standard", params["combat_mode"] || "turn_based"]
      )
      json(conn, %{id: result.last_insert_id, success: true})
    rescue
      e -> json(conn |> put_status(500), %{error: Exception.message(e)})
    end
  end

  # ── Get one ruleset ──
  def show(conn, %{"id" => id}) do
    case Repo.query("SELECT * FROM game_campaign_rulesets WHERE id=?", [id]) do
      {:ok, %{rows: [row], columns: cols}} ->
        json(conn, %{ruleset: Enum.zip(cols, row) |> Map.new()})
      _ ->
        json(conn |> put_status(404), %{error: "Not found"})
    end
  end

  # ── Full update (ruleset + windows + modifiers in one transaction) ──
  def update(conn, %{"id" => id} = params) do
    ruleset = params["ruleset"]
    windows = params["windows"]
    modifiers = params["modifiers"]

    try do
      # Update ruleset
      if ruleset do
        Repo.query!(
          """
          UPDATE game_campaign_rulesets SET
            name=?, description=?, stat_mode=?, primary_stat_name=?, custom_stats_json=?,
            combat_mode=?, moves_per_day=?, tiles_per_move=?, move_reset_time=?, move_reset_timezone=?,
            near_death_enabled=?, near_death_json=?, allow_flying=?, flying_tile_bonus=?,
            allow_transformation=?, permadeath=?, friendly_fire=?, level_cap=?, xp_curve=?, xp_curve_json=?,
            is_active=?
          WHERE id=?
          """,
          [
            ruleset["name"], ruleset["description"],
            ruleset["stat_mode"], ruleset["primary_stat_name"] || "Powerlevel",
            encode_json(ruleset["custom_stats_json"]),
            ruleset["combat_mode"],
            ruleset["moves_per_day"], ruleset["tiles_per_move"] || 3,
            ruleset["move_reset_time"], ruleset["move_reset_timezone"] || "America/New_York",
            if(ruleset["near_death_enabled"], do: 1, else: 0),
            encode_json(ruleset["near_death_json"]),
            if(ruleset["allow_flying"], do: 1, else: 0), ruleset["flying_tile_bonus"] || 0,
            if(ruleset["allow_transformation"], do: 1, else: 0),
            if(ruleset["permadeath"], do: 1, else: 0),
            if(ruleset["friendly_fire"], do: 1, else: 0),
            ruleset["level_cap"],
            ruleset["xp_curve"] || "exponential",
            encode_json(ruleset["xp_curve_json"]),
            if(ruleset["is_active"], do: 1, else: 0),
            id
          ]
        )
      end

      # Replace windows
      if windows do
        Repo.query!("DELETE FROM game_action_windows WHERE ruleset_id=?", [id])
        Enum.each(windows, fn w ->
          Repo.query!(
            """
            INSERT INTO game_action_windows
              (ruleset_id, action_type, label, icon, window_type, max_uses_per_day, max_uses_per_window,
               block_count, block_start_hour, reset_time, reset_timezone, effect_json,
               min_level, requires_opponent, requires_master, blocked_in_combat, sort_order, is_active)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            [
              id, w["action_type"], w["label"], w["icon"],
              w["window_type"], w["max_uses_per_day"], w["max_uses_per_window"] || 1,
              w["block_count"] || 4, w["block_start_hour"] || 0,
              w["reset_time"] || "00:00", w["reset_timezone"] || "America/New_York",
              encode_json(w["effect_json"]),
              w["min_level"] || 0,
              if(w["requires_opponent"], do: 1, else: 0),
              if(w["requires_master"], do: 1, else: 0),
              if(w["blocked_in_combat"], do: 1, else: 0),
              w["sort_order"] || 0,
              if(w["is_active"], do: 1, else: 0)
            ]
          )
        end)
      end

      # Replace modifiers
      if modifiers do
        Repo.query!("DELETE FROM game_ruleset_modifiers WHERE ruleset_id=?", [id])
        Enum.each(modifiers, fn m ->
          Repo.query!(
            """
            INSERT INTO game_ruleset_modifiers
              (ruleset_id, target_type, target_name, action_type, stat_key,
               multiplier, flat_bonus, extra_uses, tiles_per_move_override, custom_json, is_active)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            """,
            [
              id, m["target_type"], m["target_name"],
              m["action_type"], m["stat_key"],
              m["multiplier"] || 1.0, m["flat_bonus"] || 0, m["extra_uses"] || 0,
              m["tiles_per_move_override"],
              encode_json(m["custom_json"]),
              if(m["is_active"], do: 1, else: 0)
            ]
          )
        end)
      end

      # Clear cache
      TePhoenix.Game.ActionSlots.clear_cache(String.to_integer("#{id}"))

      json(conn, %{success: true})
    rescue
      e -> json(conn |> put_status(500), %{error: Exception.message(e)})
    end
  end

  # ── Get action windows ──
  def windows(conn, %{"id" => id}) do
    case Repo.query("SELECT * FROM game_action_windows WHERE ruleset_id=? ORDER BY sort_order", [id]) do
      {:ok, %{rows: rows, columns: cols}} ->
        json(conn, %{windows: Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)})
      _ -> json(conn, %{windows: []})
    end
  end

  # ── Get modifiers ──
  def modifiers(conn, %{"id" => id}) do
    case Repo.query("SELECT * FROM game_ruleset_modifiers WHERE ruleset_id=? ORDER BY target_type, target_name", [id]) do
      {:ok, %{rows: rows, columns: cols}} ->
        json(conn, %{modifiers: Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)})
      _ -> json(conn, %{modifiers: []})
    end
  end

  # ── Delete ──
  def delete(conn, %{"id" => id}) do
    try do
      Repo.query!("DELETE FROM game_action_windows WHERE ruleset_id=?", [id])
      Repo.query!("DELETE FROM game_ruleset_modifiers WHERE ruleset_id=?", [id])
      Repo.query!("DELETE FROM game_campaign_rulesets WHERE id=?", [id])
      json(conn, %{success: true})
    rescue
      e -> json(conn |> put_status(500), %{error: Exception.message(e)})
    end
  end

  defp encode_json(nil), do: nil
  defp encode_json(val) when is_binary(val), do: val
  defp encode_json(val), do: Jason.encode!(val)
end
