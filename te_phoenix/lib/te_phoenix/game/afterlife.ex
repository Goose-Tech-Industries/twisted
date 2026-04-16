defmodule TePhoenix.Game.Afterlife do
  @moduledoc """
  Death & Afterlife system.

  When a character dies:
    1. Death count incremented, stat penalty applied
    2. Routed to an afterlife world based on alignment
    3. Stays for N days (configurable), can train with afterlife masters
    4. Returns to respawn point after duration or via Dragon Ball revival

  Ported from Node battle/world.js handleDeath().
  """

  alias TePhoenix.Repo
  require Logger

  # Death penalty table: {death_count, stat_loss_pct}
  # Escalating — first death is mild, repeated deaths are harsh
  @default_penalties %{
    1 => 0.05,   # 5%
    2 => 0.10,   # 10%
    3 => 0.20,   # 20%
    4 => 0.40    # 40% (and all subsequent)
  }

  @stat_columns ~w(max_hp max_mp atk def mo md speed luck)
  @stat_minimums %{"max_hp" => 10, "max_mp" => 5, "atk" => 1, "def" => 1,
                   "mo" => 1, "md" => 1, "speed" => 1, "luck" => 1}

  @doc """
  Handle character death. Applies penalties, routes to afterlife.
  Returns {:ok, afterlife_data} with destination info.
  """
  def handle_death(char_id, opts \\ []) do
    killer_id = Keyword.get(opts, :killer_id)
    cause = Keyword.get(opts, :cause, "combat")

    # Load character
    case Repo.query("SELECT * FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [row], columns: cols}} ->
        char = Enum.zip(cols, row) |> Map.new()
        death_count = (char["death_count"] || 0) + 1
        alignment = char["alignment"] || 0

        # ── Apply death penalty ──
        penalty_pct = get_penalty(death_count)
        stat_updates = Enum.map(@stat_columns, fn stat ->
          current = char[stat] || 1
          new_val = max(@stat_minimums[stat] || 1, round(current * (1 - penalty_pct)))
          {stat, new_val}
        end)

        set_clause = Enum.map_join(stat_updates, ", ", fn {stat, val} -> "`#{stat}`=#{val}" end)
        Repo.query!("UPDATE characters SET #{set_clause}, death_count=?, current_hp=0 WHERE id=?",
          [death_count, char_id])

        # ── Route to afterlife world based on alignment ──
        afterlife = find_afterlife_world(alignment)

        if afterlife do
          stay_days = afterlife["stay_duration_days"] || 7
          return_at = NaiveDateTime.add(NaiveDateTime.utc_now(), stay_days * 86400)

          # Teleport to afterlife map
          Repo.query!(
            "UPDATE characters SET current_afterlife_id=?, afterlife_return_at=?, map_id=?, x=5, y=5 WHERE id=?",
            [afterlife["id"], return_at, afterlife["map_id"], char_id])

          # Broadcast death event
          TePhoenixWeb.Endpoint.broadcast!("user:#{char_id}", "character_died", %{
            death_count: death_count,
            penalty_pct: round(penalty_pct * 100),
            afterlife_name: afterlife["name"],
            stay_days: stay_days,
            return_at: NaiveDateTime.to_string(return_at),
            cause: cause,
            message: death_message(death_count, afterlife, penalty_pct)
          })

          if afterlife["map_id"] do
            TePhoenixWeb.Endpoint.broadcast!("user:#{char_id}", "map_changed", %{mapId: afterlife["map_id"]})
          end

          # Shift alignment on death (killing innocents = evil, dying protecting = good stays)
          if killer_id do
            # Killer gets evil shift for killing
            TePhoenix.Game.Alignment.shift(killer_id, "kill_player", -5)
          end

          {:ok, %{
            death_count: death_count,
            penalty_pct: penalty_pct,
            afterlife: afterlife,
            return_at: return_at,
            stat_losses: Enum.into(stat_updates, %{}, fn {k, v} -> {k, (char[k] || 0) - v} end)
          }}
        else
          # No afterlife configured — simple respawn
          Repo.query!("UPDATE characters SET current_hp=GREATEST(1, FLOOR(max_hp * 0.1)), death_count=? WHERE id=?",
            [death_count, char_id])

          {:ok, %{death_count: death_count, penalty_pct: penalty_pct, afterlife: nil, respawn: true}}
        end

      _ -> {:error, "Character not found"}
    end
  end

  @doc "Revive a character (Dragon Ball wish, Phoenix Armor, DM command)."
  def revive(char_id, opts \\ []) do
    hp_pct = Keyword.get(opts, :hp_pct, 50)  # revive at 50% HP by default
    clear_afterlife = Keyword.get(opts, :clear_afterlife, true)
    respawn_map_id = Keyword.get(opts, :respawn_map_id)

    case Repo.query("SELECT max_hp, current_afterlife_id, map_id FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[max_hp, _afterlife_id, current_map]]}} ->
        new_hp = max(1, round((max_hp || 100) * hp_pct / 100))

        updates = ["current_hp=#{new_hp}"]
        params = []

        {updates, params} = if clear_afterlife do
          updates = updates ++ ["current_afterlife_id=NULL", "afterlife_return_at=NULL"]
          # Teleport back to a respawn point
          dest_map = respawn_map_id || get_respawn_map(char_id) || current_map
          updates = updates ++ ["map_id=?", "x=10", "y=10"]
          params = params ++ [dest_map]
          {updates, params}
        else
          {updates, params}
        end

        Repo.query!("UPDATE characters SET #{Enum.join(updates, ", ")} WHERE id=?", params ++ [char_id])

        TePhoenixWeb.Endpoint.broadcast!("user:#{char_id}", "character_revived", %{
          hp: new_hp, hp_pct: hp_pct
        })

        {:ok, %{hp: new_hp, revived: true}}

      _ -> {:error, "Character not found"}
    end
  end

  @doc "Check if any afterlife characters are ready to return. Called by scheduler."
  def check_returns do
    case Repo.query("SELECT id, name FROM characters WHERE current_afterlife_id IS NOT NULL AND afterlife_return_at <= NOW()") do
      {:ok, %{rows: rows}} ->
        Enum.each(rows, fn [char_id, name] ->
          revive(char_id, hp_pct: 100, clear_afterlife: true)
          Logger.info("[Afterlife] #{name} (id:#{char_id}) returned from the afterlife")
        end)
        length(rows)
      _ -> 0
    end
  end

  # ── Private ─────────────────────────────────────────────────

  defp get_penalty(death_count) do
    # Check DB for custom penalties first
    case Repo.query("SELECT base_stat_loss_pct FROM game_death_penalties WHERE death_count=?", [death_count]) do
      {:ok, %{rows: [[pct]]}} when not is_nil(pct) ->
        if is_struct(pct, Decimal), do: Decimal.to_float(pct), else: pct
      _ ->
        # Fallback to defaults — cap at death 4+ penalty
        Map.get(@default_penalties, min(death_count, 4), 0.40)
    end
  end

  defp find_afterlife_world(alignment) do
    case Repo.query(
      "SELECT * FROM game_afterlife_worlds WHERE is_active=1 AND alignment_min <= ? AND alignment_max >= ? ORDER BY id LIMIT 1",
      [alignment, alignment]
    ) do
      {:ok, %{rows: [row], columns: cols}} -> Enum.zip(cols, row) |> Map.new()
      _ -> nil
    end
  end

  defp get_respawn_map(char_id) do
    # Try to find a saved respawn point, fallback to starting map
    case Repo.query("SELECT map_id FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[mid]]}} -> mid
      _ -> 1
    end
  end

  defp death_message(death_count, afterlife, penalty_pct) do
    base = "You have fallen in battle."
    penalty = " Your body weakens — #{round(penalty_pct * 100)}% stat loss (death ##{death_count})."
    dest = if afterlife, do: " Your spirit drifts to #{afterlife["name"]}...", else: ""
    base <> penalty <> dest
  end
end
