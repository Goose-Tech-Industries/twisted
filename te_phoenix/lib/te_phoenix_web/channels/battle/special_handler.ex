defmodule TePhoenixWeb.Battle.SpecialHandler do
  @moduledoc """
  Handles tournament, referee, real-time combat, skill learning (devour),
  raids, async PvP, and job switching.
  Ported from socket-battle.js sessions 14, 22, RT combat, and special features.
  """

  import Phoenix.Channel
  require Logger

  alias TePhoenix.Battle.{State, Manager}
  alias TePhoenix.Repo

  # ══════════════════════════════════════════════════════════════════
  # TOURNAMENTS
  # ══════════════════════════════════════════════════════════════════

  def handle("tournament_register", %{"tournament_id" => tournament_id}, socket) do
    char_id = socket.assigns[:char_id]

    result = try do
      case Repo.query("SELECT id, status, max_participants FROM game_tournaments WHERE id=? AND status IN ('open','registering')", [tournament_id]) do
        {:ok, %{rows: [[id, _status, max]]}} ->
          # Check if already registered
          case Repo.query("SELECT id FROM game_tournament_participants WHERE tournament_id=? AND character_id=?", [id, char_id]) do
            {:ok, %{rows: [_]}} ->
              %{success: false, message: "Already registered."}
            _ ->
              # Check capacity
              {:ok, %{rows: [[count]]}} = Repo.query("SELECT COUNT(*) FROM game_tournament_participants WHERE tournament_id=?", [id])
              if count >= (max || 64) do
                %{success: false, message: "Tournament is full."}
              else
                Repo.query!("INSERT INTO game_tournament_participants (tournament_id, character_id, registered_at) VALUES (?,?,NOW())", [id, char_id])
                %{success: true, message: "Registered for tournament!"}
              end
          end
        _ ->
          %{success: false, message: "Tournament not found or not open."}
      end
    rescue
      e -> %{success: false, message: Exception.message(e)}
    end

    push(socket, "tournament_register_result", result)
    {:noreply, socket}
  end

  def handle("tournament_get_bracket", %{"tournament_id" => tournament_id}, socket) do
    bracket = try do
      case Repo.query(
        "SELECT tm.round, tm.match_number, tm.p1_char_id, tm.p2_char_id, tm.winner_char_id, c1.name as p1_name, c2.name as p2_name FROM game_tournament_matches tm LEFT JOIN characters c1 ON c1.id=tm.p1_char_id LEFT JOIN characters c2 ON c2.id=tm.p2_char_id WHERE tm.tournament_id=? ORDER BY tm.round, tm.match_number",
        [tournament_id]
      ) do
        {:ok, %{rows: rows, columns: cols}} ->
          Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
        _ -> []
      end
    rescue
      _ -> []
    end

    push(socket, "tournament_bracket", %{tournament_id: tournament_id, matches: bracket})
    {:noreply, socket}
  end

  def handle("tournament_list", _payload, socket) do
    list = try do
      case Repo.query(
        "SELECT t.id, t.name, t.status, t.max_participants, t.prize_pool, t.start_time, (SELECT COUNT(*) FROM game_tournament_participants WHERE tournament_id=t.id) as participant_count FROM game_tournaments t WHERE t.status IN ('open','registering','active') ORDER BY t.start_time"
      ) do
        {:ok, %{rows: rows, columns: cols}} ->
          Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
        _ -> []
      end
    rescue
      _ -> []
    end

    push(socket, "tournament_list", %{tournaments: list})
    {:noreply, socket}
  end

  def handle("tournament_leaderboard", _payload, socket) do
    lb = try do
      case Repo.query(
        "SELECT c.id, c.name, c.level, COALESCE(s.tournament_wins,0) as wins, COALESCE(s.tournament_rating,1000) as rating FROM characters c LEFT JOIN character_stats s ON s.character_id=c.id ORDER BY rating DESC LIMIT 50"
      ) do
        {:ok, %{rows: rows, columns: cols}} ->
          Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
        _ -> []
      end
    rescue
      _ -> []
    end

    push(socket, "tournament_leaderboard", %{leaderboard: lb})
    {:noreply, socket}
  end

  # ══════════════════════════════════════════════════════════════════
  # REFEREE SYSTEM
  # ══════════════════════════════════════════════════════════════════

  def handle("battle_ref_join", %{"battle_id" => battle_id}, socket) do
    user_id = socket.assigns.user_id
    char_name = socket.assigns[:char_name] || "Unknown"

    try do
      Repo.query!("INSERT INTO game_battle_referees (battle_id, user_id) VALUES (?,?)",
        [battle_id, user_id])

      # Announce
      TePhoenixWeb.Endpoint.broadcast!("battle:#{battle_id}", "battle_chat_msg", %{
        sender_name: "System",
        sender_role: "system",
        channel: "all",
        body: "#{char_name} has joined as referee.",
        created_at: DateTime.utc_now() |> DateTime.to_iso8601()
      })

      push(socket, "battle_ref_joined", %{battle_id: battle_id})
    rescue
      _ -> nil
    end

    {:noreply, socket}
  end

  def handle("battle_ref_action", %{"battle_id" => battle_id, "action" => action} = payload, socket) do
    user_id = socket.assigns.user_id
    char_name = socket.assigns[:char_name] || "Referee"

    try do
      case Repo.query("SELECT can_pause, can_end FROM game_battle_referees WHERE battle_id=? AND user_id=?",
        [battle_id, user_id]) do
        {:ok, %{rows: [[can_pause, can_end]]}} ->
          case action do
            "pause" when can_pause == 1 ->
              TePhoenixWeb.Endpoint.broadcast!("battle:#{battle_id}", "battle_ref_pause",
                %{paused: true, ref_name: char_name})

            "resume" ->
              TePhoenixWeb.Endpoint.broadcast!("battle:#{battle_id}", "battle_ref_pause",
                %{paused: false, ref_name: char_name})

            "ruling" ->
              ruling = Map.get(payload, "ruling", "")
              TePhoenixWeb.Endpoint.broadcast!("battle:#{battle_id}", "battle_chat_msg", %{
                sender_name: "Ref: #{char_name}",
                sender_role: "referee",
                channel: "all",
                body: "⚖️ RULING: #{ruling}",
                created_at: DateTime.utc_now() |> DateTime.to_iso8601()
              })

            "end" when can_end == 1 ->
              reason = Map.get(payload, "reason", "")
              TePhoenixWeb.Endpoint.broadcast!("battle:#{battle_id}", "battle_chat_msg", %{
                sender_name: "System",
                sender_role: "system",
                channel: "all",
                body: "🛑 Battle ended by referee #{char_name}. #{reason}",
                created_at: DateTime.utc_now() |> DateTime.to_iso8601()
              })
              # Actually end the battle
              battle_id_int = to_int(battle_id)
              if State.alive?(battle_id_int) do
                Manager.end_battle(battle_id_int, nil)
              end

            _ -> nil
          end
        _ -> nil
      end
    rescue
      _ -> nil
    end

    {:noreply, socket}
  end

  # ══════════════════════════════════════════════════════════════════
  # REAL-TIME COMBAT
  # ══════════════════════════════════════════════════════════════════

  def handle("rt_combat_target", %{"battle_id" => battle_id, "target_id" => target_id}, socket) do
    char_id = socket.assigns[:char_id]
    battle_id = to_int(battle_id)

    if char_id && State.alive?(battle_id) do
      State.update_combatant(battle_id, char_id, fn c ->
        %{c | rt_target: to_int(target_id)}
      end)
    end

    {:noreply, socket}
  end

  def handle("rt_combat_move", %{"battle_id" => battle_id, "x" => x, "y" => y}, socket) do
    char_id = socket.assigns[:char_id]
    battle_id = to_int(battle_id)

    if char_id && State.alive?(battle_id) do
      State.update_combatant(battle_id, char_id, fn c ->
        %{c | grid_x: x, grid_y: y}
      end)

      broadcast!(socket, "rt_grid_update", %{
        char_id: char_id, x: x, y: y
      })
    end

    {:noreply, socket}
  end

  def handle("rt_combat_ability", %{"battle_id" => battle_id, "skill_id" => skill_id} = payload, socket) do
    char_id = socket.assigns[:char_id]
    battle_id = to_int(battle_id)

    if char_id && State.alive?(battle_id) do
      State.update_combatant(battle_id, char_id, fn c ->
        %{c | rt_queued_ability: %{
          skill_id: skill_id,
          target_id: Map.get(payload, "target_id"),
          power: Map.get(payload, "power"),
          mp_cost: Map.get(payload, "mp_cost"),
          cooldown: Map.get(payload, "cooldown")
        }}
      end)
    end

    {:noreply, socket}
  end

  def handle("rt_combat_pause", %{"battle_id" => battle_id}, socket) do
    char_id = socket.assigns[:char_id]
    battle_id = to_int(battle_id)

    if char_id && State.alive?(battle_id) do
      state = State.get_state(battle_id)
      paused = !Map.get(state, :rt_paused, false)

      # Persist pause state via replace_state
      State.replace_state(battle_id, Map.put(state, :rt_paused, paused))

      # Broadcast to all players
      TePhoenixWeb.Endpoint.broadcast!("battle:#{battle_id}", "rt_combat_paused",
        %{paused: paused, paused_by: char_id})
    end

    {:noreply, socket}
  end

  # ══════════════════════════════════════════════════════════════════
  # SKILL LEARNING (BLUE MAGE / DEVOUR)
  # ══════════════════════════════════════════════════════════════════

  def handle("devour_enemy", %{"target_id" => target_id}, socket) do
    char_id = socket.assigns[:char_id]

    result = try do
      # Find the battle this character is in
      battle_id = socket.assigns[:battle_id]
      if is_nil(battle_id) do
        %{success: false, message: "Not in a battle."}
      else
        state = State.get_state(battle_id)
        target = Map.get(state.combatants, to_int(target_id))

        cond do
          is_nil(target) ->
            %{success: false, message: "Target not found."}
          !target.is_ai ->
            %{success: false, message: "Can only learn from NPCs."}
          target.current_hp > 0 ->
            %{success: false, message: "Target must be defeated."}
          true ->
            # Get target's learnable skills
            case Repo.query("SELECT skills_json FROM game_npcs WHERE char_id=?", [target.char_id]) do
              {:ok, %{rows: [[skills_json]]}} when not is_nil(skills_json) ->
                skills = case Jason.decode(to_string(skills_json)) do
                  {:ok, list} when is_list(list) -> list
                  _ -> []
                end

                learnable = Enum.filter(skills, fn s -> s["learnable_by_enemy"] end)

                if learnable == [] do
                  %{success: false, message: "No learnable skills."}
                else
                  skill = Enum.random(learnable)
                  skill_id = skill["id"] || skill["skill_id"]

                  # Check if already known
                  case Repo.query("SELECT id FROM character_learned_enemy_skills WHERE character_id=? AND skill_id=?", [char_id, skill_id]) do
                    {:ok, %{rows: [_]}} ->
                      %{success: false, message: "Already know this skill."}
                    _ ->
                      Repo.query!("INSERT INTO character_learned_enemy_skills (character_id, skill_id, learned_from) VALUES (?,?,?)",
                        [char_id, skill_id, target.name])

                      skill_name = case Repo.query("SELECT name FROM game_skills WHERE id=?", [skill_id]) do
                        {:ok, %{rows: [[name]]}} -> name
                        _ -> "Unknown Skill"
                      end

                      %{success: true, message: "Learned #{skill_name} from #{target.name}!", skill_name: skill_name}
                  end
                end

              _ ->
                %{success: false, message: "Nothing to learn from this enemy."}
            end
        end
      end
    rescue
      e -> %{success: false, message: Exception.message(e)}
    end

    push(socket, "learn_result", result)
    {:noreply, socket}
  end

  # ══════════════════════════════════════════════════════════════════
  # RAID BOSS
  # ══════════════════════════════════════════════════════════════════

  def handle("raid_join", %{"raid_id" => raid_id}, socket) do
    char_id = socket.assigns[:char_id]
    char_name = socket.assigns[:char_name] || "Unknown"

    result = try do
      case Repo.query("SELECT * FROM game_raid_bosses WHERE id=? AND is_active=1", [raid_id]) do
        {:ok, %{rows: [raid_row], columns: cols}} ->
          raid = Enum.zip(cols, raid_row) |> Map.new()
          max_parties = raid["max_parties"] || 8

          # Find or create instance
          instance = case Repo.query(
            "SELECT id, boss_hp, boss_max_hp, parties_json FROM game_raid_instances WHERE raid_id=? AND status='forming' ORDER BY created_at DESC LIMIT 1",
            [raid_id]
          ) do
            {:ok, %{rows: [[id, hp, max_hp, parties_json]]}} ->
              %{id: id, boss_hp: hp, boss_max_hp: max_hp, parties_json: parties_json}
            _ ->
              boss_hp = (raid["hp_multiplier"] || 5) * 1000
              {:ok, res} = Repo.query(
                "INSERT INTO game_raid_instances (raid_id, boss_hp, boss_max_hp, parties_json, status) VALUES (?,?,?,?,?)",
                [raid_id, boss_hp, boss_hp, "[]", "forming"]
              )
              %{id: res.last_insert_id, boss_hp: boss_hp, boss_max_hp: boss_hp, parties_json: "[]"}
          end

          parties = case Jason.decode(to_string(instance.parties_json)) do
            {:ok, list} -> list
            _ -> []
          end

          if length(parties) >= max_parties do
            %{success: false, message: "Raid is full."}
          else
            parties = parties ++ [%{"charId" => char_id, "name" => char_name, "joinedAt" => System.system_time(:millisecond)}]
            Repo.query!("UPDATE game_raid_instances SET parties_json=? WHERE id=?",
              [Jason.encode!(parties), instance.id])

            # Broadcast to raid room
            TePhoenixWeb.Endpoint.broadcast!("raid:#{instance.id}", "raid_update", %{
              instance_id: instance.id,
              parties: parties,
              boss_hp: instance.boss_hp,
              boss_max_hp: instance.boss_max_hp
            })

            %{success: true, message: "Joined raid! #{length(parties)}/#{max_parties} parties.", instance_id: instance.id}
          end

        _ ->
          %{success: false, message: "Raid not found."}
      end
    rescue
      e -> %{success: false, message: Exception.message(e)}
    end

    push(socket, "raid_result", result)
    {:noreply, socket}
  end

  # ══════════════════════════════════════════════════════════════════
  # ASYNC PVP
  # ══════════════════════════════════════════════════════════════════

  def handle("async_pvp_set_defense", payload, socket) do
    char_id = socket.assigns[:char_id]

    result = try do
      team = Map.get(payload, "team", [])
      formation = Map.get(payload, "formation", "line")
      tactics = Map.get(payload, "tactics", "balanced")

      Repo.query!(
        "INSERT INTO character_pvp_defense_teams (character_id, team_json, formation, tactics) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE team_json=VALUES(team_json), formation=VALUES(formation), tactics=VALUES(tactics)",
        [char_id, Jason.encode!(team), formation, tactics]
      )
      %{success: true, message: "Defense team saved!"}
    rescue
      e -> %{success: false, message: Exception.message(e)}
    end

    push(socket, "async_pvp_result", result)
    {:noreply, socket}
  end

  def handle("async_pvp_challenge", %{"defender_id" => defender_id}, socket) do
    char_id = socket.assigns[:char_id]

    result = try do
      case Repo.query("SELECT team_json, formation, tactics FROM character_pvp_defense_teams WHERE character_id=?", [defender_id]) do
        {:ok, %{rows: [[_team_json, _formation, _tactics]]}} ->
          # Load both combatants' real stats for simulation
          atk_stats = TePhoenix.Battle.Stats.get_effective_stats(char_id)
          def_stats = TePhoenix.Battle.Stats.get_effective_stats(defender_id)

          if is_nil(atk_stats) or is_nil(def_stats) do
            %{success: false, message: "Failed to load combat stats."}
          else
            # Simulate battle using real stats
            {outcome, details} = simulate_async_battle(atk_stats, def_stats)

            # Rating change based on level difference
            level_diff = (atk_stats[:level] || 1) - (def_stats[:level] || 1)
            base_rating = if outcome == "win", do: 15, else: -10
            # Bonus/penalty for fighting higher/lower level
            rating_change = base_rating - div(level_diff, 2)

            Repo.query!(
              "INSERT INTO character_pvp_async_log (attacker_id, defender_id, result, rating_change) VALUES (?,?,?,?)",
              [char_id, defender_id, outcome, rating_change]
            )

            win_msg = "Victory! #{details}"
            loss_msg = "Defeat... #{details}"

            %{success: true, result: outcome, rating_change: rating_change,
              details: details,
              message: if(outcome == "win", do: win_msg, else: loss_msg)}
          end

        _ ->
          %{success: false, message: "Player has no defense team set."}
      end
    rescue
      e -> %{success: false, message: Exception.message(e)}
    end

    push(socket, "async_pvp_result", result)
    {:noreply, socket}
  end

  # ══════════════════════════════════════════════════════════════════
  # JOB SYSTEM
  # ══════════════════════════════════════════════════════════════════

  def handle("job_switch", %{"job_id" => job_id, "slot" => slot}, socket)
      when slot in ["primary", "secondary"] do
    char_id = socket.assigns[:char_id]

    result = try do
      case Repo.query("SELECT id, name, prerequisite_jobs FROM game_jobs WHERE id=? AND is_active=1", [job_id]) do
        {:ok, %{rows: [[_id, job_name, prereq_json]]}} ->
          # Check prerequisites
          prereqs = case Jason.decode(to_string(prereq_json || "[]")) do
            {:ok, list} when is_list(list) -> list
            _ -> []
          end

          prereqs_met = if prereqs == [] do
            true
          else
            case Repo.query(
              "SELECT job_id, job_level FROM character_jobs WHERE character_id=? AND job_id IN (#{Enum.map_join(prereqs, ",", fn _ -> "?" end)})",
              [char_id | Enum.map(prereqs, fn p -> p["id"] || p end)]
            ) do
              {:ok, %{rows: rows}} ->
                Enum.all?(prereqs, fn pj ->
                  req_id = pj["id"] || pj
                  req_level = pj["level"] || 1
                  Enum.any?(rows, fn [jid, jlvl] -> jid == req_id and (jlvl || 0) >= req_level end)
                end)
              _ -> false
            end
          end

          if not prereqs_met do
            %{success: false, message: "Prerequisites not met."}
          else
            # Unlock if not already
            Repo.query!("INSERT IGNORE INTO character_jobs (character_id, job_id) VALUES (?,?)",
              [char_id, job_id])

            # Set as primary or secondary
            case slot do
              "primary" ->
                Repo.query!("UPDATE character_jobs SET is_primary=0 WHERE character_id=?", [char_id])
                Repo.query!("UPDATE character_jobs SET is_primary=1 WHERE character_id=? AND job_id=?", [char_id, job_id])
              "secondary" ->
                Repo.query!("UPDATE character_jobs SET is_secondary=0 WHERE character_id=?", [char_id])
                Repo.query!("UPDATE character_jobs SET is_secondary=1 WHERE character_id=? AND job_id=?", [char_id, job_id])
            end

            %{success: true, message: "Switched #{slot} job to #{job_name}!"}
          end

        _ ->
          %{success: false, message: "Job not found."}
      end
    rescue
      e -> %{success: false, message: Exception.message(e)}
    end

    push(socket, "job_result", result)
    {:noreply, socket}
  end

  # ══════════════════════════════════════════════════════════════════
  # PRIVATE
  # ══════════════════════════════════════════════════════════════════

  defp simulate_async_battle(attacker, defender) do
    # Turn-based simulation using real stats.
    # Each "round" both sides deal damage based on ATK vs DEF. Faster unit acts first.
    # Runs until one side's HP hits 0. Max 50 rounds to prevent infinite loops.

    atk_hp = attacker[:max_hp] || attacker.max_hp || 100
    def_hp = defender[:max_hp] || defender.max_hp || 100

    atk_atk = Map.get(attacker, :atk, 10)
    atk_def = Map.get(attacker, :def, 5)
    atk_spd = Map.get(attacker, :speed, 10)
    atk_luck = Map.get(attacker, :luck, 5)

    def_atk = Map.get(defender, :atk, 10)
    def_def = Map.get(defender, :def, 5)
    def_spd = Map.get(defender, :speed, 10)
    def_luck = Map.get(defender, :luck, 5)

    # Damage per hit (minimum 1)
    atk_dmg_per_hit = max(1, atk_atk * 2 - def_def)
    def_dmg_per_hit = max(1, def_atk * 2 - atk_def)

    # Add randomness (±15%)
    randomize = fn base ->
      variance = max(1, trunc(base * 0.15))
      base - variance + :rand.uniform(variance * 2)
    end

    # Determine who acts first each round
    atk_goes_first = atk_spd >= def_spd

    {final_atk_hp, final_def_hp, rounds} = Enum.reduce_while(1..50, {atk_hp, def_hp, 0}, fn round, {a_hp, d_hp, _} ->
      # Crit check (luck-based)
      atk_crit = :rand.uniform(100) <= min(50, 5 + atk_luck)
      def_crit = :rand.uniform(100) <= min(50, 5 + def_luck)

      atk_hit = randomize.(atk_dmg_per_hit) * (if atk_crit, do: 2, else: 1)
      def_hit = randomize.(def_dmg_per_hit) * (if def_crit, do: 2, else: 1)

      {a_hp, d_hp} = if atk_goes_first do
        d_hp = d_hp - atk_hit
        if d_hp <= 0, do: {a_hp, 0}, else: {a_hp - def_hit, d_hp}
      else
        a_hp = a_hp - def_hit
        if a_hp <= 0, do: {0, d_hp}, else: {a_hp, d_hp - atk_hit}
      end

      a_hp = max(0, a_hp)
      d_hp = max(0, d_hp)

      if a_hp <= 0 or d_hp <= 0 do
        {:halt, {a_hp, d_hp, round}}
      else
        {:cont, {a_hp, d_hp, round}}
      end
    end)

    outcome = cond do
      final_def_hp <= 0 and final_atk_hp > 0 -> "win"
      final_atk_hp <= 0 and final_def_hp > 0 -> "loss"
      final_atk_hp > final_def_hp -> "win"    # tiebreak: more HP remaining
      true -> "loss"
    end

    details = "Battle lasted #{rounds} rounds. " <>
      "You: #{max(0, final_atk_hp)} HP remaining. " <>
      "Opponent: #{max(0, final_def_hp)} HP remaining."

    {outcome, details}
  end

  defp to_int(val) when is_integer(val), do: val
  defp to_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp to_int(_), do: 0
end
