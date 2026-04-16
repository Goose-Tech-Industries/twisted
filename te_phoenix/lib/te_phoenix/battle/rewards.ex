defmodule TePhoenix.Battle.Rewards do
  @moduledoc """
  Post-battle rewards — XP, gold, loot, quest kill credit, win/loss records.
  Ported from te/battle/rewards.js endBattle() reward distribution.
  """

  require Logger
  alias TePhoenix.Battle.State
  alias TePhoenix.Repo

  @doc """
  Distribute rewards after a battle ends.
  Called by Manager.end_battle/2 after the battle status is set to :finished.

  Steps:
  1. Sync HP/MP back to characters table
  2. Notify losing players (battle_defeat)
  3. Calculate XP/gold with region + system + event multipliers
  4. Award XP, gold, update win/loss records
  5. Check level-ups
  6. Server-authoritative quest kill credit
  7. Log event
  """
  def distribute(battle_id, winner_team_id) do
    state = State.get_state(battle_id)
    if state.status != :finished do
      :ok
    else
      do_distribute(state, battle_id, winner_team_id)
    end
  end

  defp do_distribute(state, battle_id, winner_team_id) do

    # 1. Sync HP/MP/statuses back to characters table
    sync_combatant_state(state)

    # 2. Update DB battle record
    try do
      log_json = Jason.encode!(state.log || [])
      Repo.query!(
        "UPDATE game_battles SET status='FINISHED', winner_char_id=?, battle_log=? WHERE id=?",
        [state.winner, log_json, battle_id]
      )
    rescue
      _ -> nil
    end

    # 3. Determine winning and losing teams
    winner_team_members = Map.get(state.teams, winner_team_id, [])
    losing_team_ids = state.teams
      |> Map.keys()
      |> Enum.filter(fn tid -> tid != winner_team_id end)

    losing_members = Enum.flat_map(losing_team_ids, fn tid ->
      Map.get(state.teams, tid, [])
    end)

    # 4. Get surviving human players from winning team
    surviving_players = winner_team_members
      |> Enum.map(fn id -> {id, Map.get(state.combatants, id)} end)
      |> Enum.filter(fn {_id, c} -> c && c.current_hp > 0 && !c.is_ai end)

    party_size = max(1, length(surviving_players))

    # 5. Find highest enemy level for XP lookup
    all_enemies = losing_members
      |> Enum.map(fn id -> Map.get(state.combatants, id) end)
      |> Enum.filter(& &1)

    top_enemy = Enum.max_by(all_enemies, fn e -> e[:level] || 1 end, fn -> nil end)

    {base_xp, base_gold} = if top_enemy do
      query_level_rewards(top_enemy[:level] || 1)
    else
      {0, 0}
    end

    # 6. Region + system + event multipliers
    {region_xp_mult, region_gold_mult} = get_region_multipliers(surviving_players)
    {sys_xp_mult, sys_gold_mult} = get_system_multipliers()
    {event_xp_mult, event_gold_mult} = get_event_multipliers()

    share_xp = max(1, trunc(base_xp / party_size * region_xp_mult * sys_xp_mult * event_xp_mult))
    share_gold = max(0, trunc(base_gold / party_size * region_gold_mult * sys_gold_mult * event_gold_mult))

    # 7. Award each surviving player
    Enum.each(surviving_players, fn {char_id, winner} ->
      # Per-player status effect multipliers
      {player_xp, player_gold} = apply_status_multipliers(char_id, share_xp, share_gold)

      # Award XP
      leveled_up = if player_xp > 0 do
        try do
          Repo.query!("UPDATE characters SET experience=experience+? WHERE id=?",
            [player_xp, char_id])
          check_level_up(char_id)
        rescue
          _ -> false
        end
      else
        false
      end

      # Award gold — user_id is on the combatant struct
      winner_user_id = Map.get(winner, :user_id)
      if player_gold > 0 && winner_user_id do
        try do
          Repo.query!("UPDATE users SET currency=currency+? WHERE id=?",
            [player_gold, winner_user_id])
        rescue
          _ -> nil
        end
      end

      # Notify player via PubSub
      enemy_name = if top_enemy, do: top_enemy.name, else: "Enemy"
      TePhoenixWeb.Endpoint.broadcast!(
        "user:#{char_id}",
        "battle_result",
        %{
          won: true,
          xp: player_xp,
          gold: player_gold,
          leveled_up: leveled_up,
          enemy_name: enemy_name,
          battle_type: state.type,
          party_size: party_size
        }
      )
    end)

    # 8. Notify losing human players
    notify_losers(state, battle_id, losing_members, top_enemy)

    # 9. Win/loss records (1v1 only)
    if length(surviving_players) == 1 and length(losing_members) == 1 do
      {winner_id, _} = hd(surviving_players)
      loser_id = hd(losing_members)

      try do
        Repo.query!(
          "UPDATE characters SET battle_record=JSON_SET(COALESCE(battle_record,'{}'),'$.W',CAST(COALESCE(JSON_EXTRACT(battle_record,'$.W'),0)+1 AS UNSIGNED)) WHERE id=?",
          [winner_id]
        )
        Repo.query!(
          "UPDATE characters SET battle_record=JSON_SET(COALESCE(battle_record,'{}'),'$.L',CAST(COALESCE(JSON_EXTRACT(battle_record,'$.L'),0)+1 AS UNSIGNED)) WHERE id=?",
          [loser_id]
        )
      rescue
        _ -> nil
      end
    end

    # 10. Server-authoritative quest kill credit
    enemy_npc_ids = Map.get(state, :enemy_npc_ids, [])
    if is_list(enemy_npc_ids) and enemy_npc_ids != [] do
      process_quest_kill_credit(state, surviving_players, battle_id)
    end

    # 11. Event log
    try do
      enemy_names = all_enemies |> Enum.map(& &1.name) |> Enum.join(", ")
      winner_names = surviving_players |> Enum.map(fn {_id, c} -> c.name end) |> Enum.join(", ")

      Repo.query!(
        "INSERT INTO game_event_log (event_type, actor_name, detail_json) VALUES (?,?,?)",
        ["battle_end", winner_names,
         Jason.encode!(%{xp: share_xp, gold: share_gold, party_size: party_size, defeated: enemy_names})]
      )
    rescue
      _ -> nil
    end

    :ok
  end

  # ══════════════════════════════════════════════════════════════════
  # PRIVATE
  # ══════════════════════════════════════════════════════════════════

  defp sync_combatant_state(state) do
    Enum.each(state.combatants, fn {char_id, c} ->
      try do
        statuses_json = Jason.encode!(c.statuses || [])
        Repo.query!(
          "UPDATE characters SET current_hp=?, current_mp=?, limitbreak=?, status_effects=? WHERE id=?",
          [max(0, c.current_hp), max(0, c.current_mp), c[:limitbreak] || 0, statuses_json, char_id]
        )
      rescue
        _ -> nil
      end
    end)
  end

  defp query_level_rewards(level) do
    case Repo.query("SELECT xp_for_win, gold_for_win FROM level_requirements WHERE level=? LIMIT 1", [level]) do
      {:ok, %{rows: [[xp, gold]]}} -> {xp || 0, gold || 0}
      _ -> {0, 0}
    end
  end

  defp get_region_multipliers(surviving_players) do
    case surviving_players do
      [{char_id, _} | _] ->
        case Repo.query("SELECT map_id FROM characters WHERE id=?", [char_id]) do
          {:ok, %{rows: [[map_id]]}} when not is_nil(map_id) ->
            case Repo.query(
              "SELECT r.xp_mult, r.gold_mult FROM game_regions r JOIN game_maps m ON m.region_id=r.id WHERE m.id=?",
              [map_id]
            ) do
              {:ok, %{rows: [[xp_m, gold_m]]}} ->
                {parse_float(xp_m, 1.0), parse_float(gold_m, 1.0)}
              _ -> {1.0, 1.0}
            end
          _ -> {1.0, 1.0}
        end
      _ -> {1.0, 1.0}
    end
  end

  defp get_system_multipliers do
    xp = get_world_flag("xp_multiplier", 1.0)
    gold = get_world_flag("gold_multiplier", 1.0)
    {xp, gold}
  end

  defp get_event_multipliers do
    case Repo.query("SELECT stat_modifiers FROM game_world_events WHERE is_active=1") do
      {:ok, %{rows: rows}} ->
        Enum.reduce(rows, {1.0, 1.0}, fn [mods_json], {xp_acc, gold_acc} ->
          case Jason.decode(to_string(mods_json || "{}")) do
            {:ok, mods} ->
              xp = xp_acc * parse_float(mods["xp_mult"], 1.0)
              gold = gold_acc * parse_float(mods["gold_mult"], 1.0)
              {xp, gold}
            _ -> {xp_acc, gold_acc}
          end
        end)
      _ -> {1.0, 1.0}
    end
  end

  defp apply_status_multipliers(char_id, xp, gold) do
    case Repo.query(
      "SELECT s.effects FROM character_status_effects cse JOIN game_statuses s ON s.id = cse.status_id WHERE cse.character_id=? AND (cse.expires_at IS NULL OR cse.expires_at > NOW())",
      [char_id]
    ) do
      {:ok, %{rows: rows}} ->
        Enum.reduce(rows, {xp, gold}, fn [effects_json], {xp_acc, gold_acc} ->
          case Jason.decode(to_string(effects_json || "{}")) do
            {:ok, fx} ->
              xp_new = if fx["xp_mult"], do: trunc(xp_acc * parse_float(fx["xp_mult"], 1.0)), else: xp_acc
              gold_new = if fx["gold_mult"], do: trunc(gold_acc * parse_float(fx["gold_mult"], 1.0)), else: gold_acc
              {xp_new, gold_new}
            _ -> {xp_acc, gold_acc}
          end
        end)
      _ -> {xp, gold}
    end
  end

  defp check_level_up(char_id) do
    case Repo.query(
      "SELECT c.level, c.experience, gl.xp_required FROM characters c JOIN level_requirements gl ON gl.level=c.level+1 WHERE c.id=?",
      [char_id]
    ) do
      {:ok, %{rows: [[level, exp, xp_needed]]}} when not is_nil(xp_needed) and exp >= xp_needed ->
        new_level = level + 1

        # Level up!
        try do
          Repo.query!("UPDATE characters SET level=?, experience=experience-? WHERE id=?",
            [new_level, xp_needed, char_id])

          # Get stat gains from level table
          case Repo.query("SELECT hp_gain, mp_gain, stat_points FROM level_requirements WHERE level=?", [new_level]) do
            {:ok, %{rows: [[hp_gain, mp_gain, stat_points]]}} ->
              Repo.query!(
                "UPDATE characters SET max_hp=max_hp+?, current_hp=current_hp+?, max_mp=max_mp+?, current_mp=current_mp+?, stat_points=stat_points+? WHERE id=?",
                [hp_gain || 0, hp_gain || 0, mp_gain || 0, mp_gain || 0, stat_points || 0, char_id]
              )
            _ -> nil
          end

          Logger.info("Character #{char_id} leveled up to #{new_level}!")
          true
        rescue
          _ -> false
        end

      _ -> false
    end
  end

  defp notify_losers(state, _battle_id, losing_members, top_enemy) do
    Enum.each(losing_members, fn char_id ->
      combatant = Map.get(state.combatants, char_id)
      if combatant && !combatant.is_ai do
        winner_name = if top_enemy, do: top_enemy.name, else: "Unknown"
        TePhoenixWeb.Endpoint.broadcast!(
          "user:#{char_id}",
          "battle_defeat",
          %{
            won: false,
            enemy_name: winner_name,
            battle_type: state.type
          }
        )
      end
    end)
  end

  defp process_quest_kill_credit(state, surviving_players, _battle_id) do
    # Load NPC info for defeated enemies
    npc_ids = state.enemy_npc_ids
    placeholders = Enum.map_join(npc_ids, ",", fn _ -> "?" end)

    case Repo.query(
      "SELECT id, name, npc_type FROM game_npcs WHERE id IN (#{placeholders})",
      npc_ids
    ) do
      {:ok, %{rows: npc_rows}} when npc_rows != [] ->
        npc_id_set = MapSet.new(Enum.map(npc_rows, fn [id, _, _] -> id end))
        npc_type_set = MapSet.new(Enum.map(npc_rows, fn [_, _, t] -> String.downcase(to_string(t || "")) end))
        npc_name_set = MapSet.new(Enum.map(npc_rows, fn [_, n, _] -> String.downcase(to_string(n || "")) end))

        Enum.each(surviving_players, fn {char_id, _winner} ->
          case Repo.query("SELECT state_json FROM characters WHERE id=?", [char_id]) do
            {:ok, %{rows: [[state_json]]}} when not is_nil(state_json) ->
              case Jason.decode(to_string(state_json)) do
                {:ok, char_state} ->
                  active_quests = get_in(char_state, ["quests", "active"]) || %{}
                  {updated_quests, changed} = process_kill_objectives(
                    active_quests, npc_id_set, npc_type_set, npc_name_set, npc_ids, npc_rows
                  )

                  if changed do
                    new_state = put_in(char_state, ["quests", "active"], updated_quests)
                    try do
                      Repo.query!("UPDATE characters SET state_json=? WHERE id=?",
                        [Jason.encode!(new_state), char_id])

                      TePhoenixWeb.Endpoint.broadcast!(
                        "user:#{char_id}",
                        "quest_progress_update",
                        %{quests: updated_quests}
                      )
                    rescue
                      _ -> nil
                    end
                  end

                _ -> nil
              end
            _ -> nil
          end
        end)

      _ -> nil
    end
  end

  defp process_kill_objectives(quests, npc_id_set, npc_type_set, npc_name_set, npc_ids, npc_rows) do
    Enum.reduce(quests, {%{}, false}, fn {quest_id, quest}, {acc, any_changed} ->
      objectives = quest["objectives"] || %{}

      {updated_objs, quest_changed} = Enum.reduce(objectives, {%{}, false}, fn {obj_key, obj}, {obj_acc, changed} ->
        if obj["complete"] || String.upcase(to_string(obj["type"] || "")) != "KILL" do
          {Map.put(obj_acc, obj_key, obj), changed}
        else
          target_id = obj["target_npc_id"]
          target_type = String.downcase(to_string(obj["target_npc_type"] || ""))
          target_name = String.downcase(to_string(obj["target_npc_name"] || ""))

          matches = (target_id != nil and MapSet.member?(npc_id_set, target_id)) or
                    (target_type != "" and MapSet.member?(npc_type_set, target_type)) or
                    (target_name != "" and MapSet.member?(npc_name_set, target_name))

          if matches do
            # Count matching kills
            kill_count = Enum.count(npc_ids, fn id ->
              row = Enum.find(npc_rows, fn [rid, _, _] -> rid == id end)
              row != nil and (
                (target_id != nil and elem(List.to_tuple(row), 0) == target_id) or
                (target_type != "" and String.downcase(to_string(elem(List.to_tuple(row), 2) || "")) == target_type) or
                (target_name != "" and String.downcase(to_string(elem(List.to_tuple(row), 1) || "")) == target_name)
              )
            end)

            if kill_count > 0 do
              required = obj["required"] || obj["target"] || 1
              current = min((obj["current"] || 0) + kill_count, required)
              complete = current >= required

              updated = obj
                |> Map.put("current", current)
                |> Map.put("complete", complete)

              {Map.put(obj_acc, obj_key, updated), true}
            else
              {Map.put(obj_acc, obj_key, obj), changed}
            end
          else
            {Map.put(obj_acc, obj_key, obj), changed}
          end
        end
      end)

      updated_quest = if quest_changed do
        all_done = Enum.all?(updated_objs, fn {_, o} -> o["complete"] end)
        quest
        |> Map.put("objectives", updated_objs)
        |> Map.put("is_ready_to_turn_in", all_done)
      else
        Map.put(quest, "objectives", updated_objs)
      end

      {Map.put(acc, quest_id, updated_quest), any_changed or quest_changed}
    end)
  end

  defp get_world_flag(key, default) do
    case Repo.query("SELECT flag_value FROM world_flags WHERE flag_key=? LIMIT 1", [key]) do
      {:ok, %{rows: [[val]]}} -> parse_float(val, default)
      _ -> default
    end
  end

  defp parse_float(nil, default), do: default
  defp parse_float(val, _default) when is_float(val), do: val
  defp parse_float(val, _default) when is_integer(val), do: val * 1.0
  defp parse_float(val, default) when is_binary(val) do
    case Float.parse(val) do
      {f, _} -> f
      :error -> default
    end
  end
  defp parse_float(_, default), do: default
end
