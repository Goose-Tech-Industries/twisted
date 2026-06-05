defmodule TePhoenix.Battle.BattleLogger do
  @moduledoc """
  Battle logger — serializes battle summaries for post-game review.
  Stores in game_battle_logs table and optionally posts to a forum thread
  if ForgeNexus integration is available.
  """

  require Logger
  alias TePhoenix.Repo

  @doc """
  Log a completed battle. Called from Manager.end_battle/2.
  Serializes combatants, stats, winner, duration, and action count.
  """
  def log_battle(battle_id, state, winner_team) do
    # Check if battle logging is enabled
    unless setting_enabled?("enable_battle_forum_log") do
      :ok
    else
      summary = build_summary(battle_id, state, winner_team)

      # Store in database
      store_log(battle_id, summary)

      # Optionally post to forum
      post_to_forum(summary)

      :ok
    end
  rescue
    e ->
      Logger.error("BattleLogger.log_battle failed: #{inspect(e)}")
      :ok
  end

  @doc """
  Retrieve a battle log by battle ID.
  Returns {:ok, log} or {:error, :not_found}.
  """
  def get_battle_log(battle_id) do
    case Repo.query(
      "SELECT battle_id, summary_json, created_at FROM game_battle_logs WHERE battle_id=?",
      [battle_id]
    ) do
      {:ok, %{rows: [[_bid, json, created_at]]}} ->
        case Jason.decode(to_string(json)) do
          {:ok, summary} -> {:ok, Map.put(summary, "created_at", created_at)}
          _ -> {:error, :parse_error}
        end
      _ ->
        {:error, :not_found}
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # PRIVATE
  # ══════════════════════════════════════════════════════════════════

  defp build_summary(battle_id, state, winner_team) do
    combatants = Enum.map(state.combatants, fn {_id, c} ->
      %{
        char_id: c.char_id,
        name: c.name,
        team_id: c.team_id,
        is_ai: c.is_ai,
        level: c.level || 1,
        final_hp: c.current_hp,
        max_hp: c.max_hp,
        knocked_out: c.knocked_out || false
      }
    end)

    winner_names = state.combatants
      |> Map.values()
      |> Enum.filter(fn c -> c.team_id == winner_team and c.current_hp > 0 end)
      |> Enum.map(& &1.name)
      |> Enum.join(", ")

    loser_names = state.combatants
      |> Map.values()
      |> Enum.filter(fn c -> c.team_id != winner_team end)
      |> Enum.map(& &1.name)
      |> Enum.join(", ")

    actions_count = length(state.log || [])
    duration_turns = state.turn_number || 0

    %{
      battle_id: battle_id,
      type: to_string(state.type || :unknown),
      winner_team: winner_team,
      winner_names: winner_names,
      loser_names: loser_names,
      combatants: combatants,
      turn_count: duration_turns,
      actions_count: actions_count,
      settings_snapshot: %{
        enable_limb_targeting: state.settings[:enable_limb_targeting] || false,
        enable_active_defense: state.settings[:enable_active_defense] || false,
        enable_stagger_system: state.settings[:enable_stagger_system] || false
      }
    }
  end

  defp store_log(battle_id, summary) do
    json = Jason.encode!(summary)
    try do
      Repo.query!(
        "INSERT INTO game_battle_logs (battle_id, summary_json, created_at) VALUES (?,?,NOW()) ON DUPLICATE KEY UPDATE summary_json=VALUES(summary_json)",
        [battle_id, json]
      )
    rescue
      _e ->
        # Table might not exist yet -- create it
        try do
          Repo.query!("""
            CREATE TABLE IF NOT EXISTS game_battle_logs (
              id BIGINT AUTO_INCREMENT PRIMARY KEY,
              battle_id BIGINT NOT NULL,
              summary_json MEDIUMTEXT,
              created_at DATETIME DEFAULT NOW(),
              UNIQUE KEY idx_battle_id (battle_id)
            )
          """)
          Repo.query!(
            "INSERT INTO game_battle_logs (battle_id, summary_json, created_at) VALUES (?,?,NOW())",
            [battle_id, json]
          )
        rescue
          e2 -> Logger.error("BattleLogger store failed: #{inspect(e2)}")
        end
    end
  end

  defp post_to_forum(summary) do
    thread_id = get_setting("battle_log_forum_thread_id")
    if thread_id do
      # Build a human-readable post
      post_body = format_forum_post(summary)

      # Check if ForgeNexus is available (it's a separate application).
      # Use apply/3 so the compiler doesn't warn when ForgeNexus isn't a dep.
      try do
        mod = ForgeNexus.Forum.Posts

        if Code.ensure_loaded?(mod) and function_exported?(mod, :create_post, 1) do
          apply(mod, :create_post, [
            %{
              thread_id: thread_id,
              user_id: 0,
              body: post_body,
              posted_as: "Battle Logger"
            }
          ])
        else
          Logger.debug("ForgeNexus not available, battle log stored locally only")
          :ok
        end
      rescue
        _ -> :ok
      end
    end
  end

  defp format_forum_post(summary) do
    """
    **Battle Report ##{summary.battle_id}**
    Type: #{summary.type}
    Winner: #{summary.winner_names}
    Defeated: #{summary.loser_names}
    Turns: #{summary.turn_count} | Actions: #{summary.actions_count}

    **Combatants:**
    #{Enum.map_join(summary.combatants, "\n", fn c ->
      status = if c.knocked_out, do: "KO", else: "#{c.final_hp}/#{c.max_hp} HP"
      "- #{c.name} (Lv#{c.level}, Team #{c.team_id}) — #{status}"
    end)}
    """
  end

  defp setting_enabled?(key) do
    case Repo.query("SELECT setting_value FROM system_settings WHERE setting_key=? LIMIT 1", [key]) do
      {:ok, %{rows: [[val]]}} -> val == "true" or val == "1"
      _ -> false
    end
  end

  defp get_setting(key) do
    case Repo.query("SELECT setting_value FROM system_settings WHERE setting_key=? LIMIT 1", [key]) do
      {:ok, %{rows: [[val]]}} when not is_nil(val) and val != "" -> val
      _ -> nil
    end
  end
end
