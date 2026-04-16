defmodule TePhoenix.Battle.Manager do
  @moduledoc """
  High-level battle management API.
  Orchestrates: load stats → create DB record → start GenServer → init subsystems.
  Ported from te/battle/legacy.js BattleManager.createBattle/createPartyBattle.
  """

  require Logger

  alias TePhoenix.Battle.{Stats, State, Supervisor}
  alias TePhoenix.Repo
  import Ecto.Query

  @doc """
  Create a 1v1 battle (PvP or PvE).
  Loads both characters from DB, records in game_battles, starts GenServer.
  Returns {:ok, battle_id} or {:error, reason}.
  """
  def create_battle(p1_char_id, p2_char_id, type \\ :pvp) do
    with p1 when p1 != nil <- Stats.get_effective_stats(p1_char_id),
         p2 when p2 != nil <- Stats.get_effective_stats(p2_char_id) do

      # Scale enemies for PvE if player is in a party
      p2 = if type == :pve, do: maybe_scale_enemy(p1, p2), else: p2

      # Insert battle record into DB
      access_token = :crypto.strong_rand_bytes(16) |> Base.encode16(case: :lower)
      first_turn = if p1.speed >= p2.speed, do: p1_char_id, else: p2_char_id

      {:ok, battle_id} = insert_battle_record(p1, p2, first_turn, access_token, type)

      # Start GenServer — in PvP, player 2 is a human (is_ai: false)
      p2_opts = to_combatant_opts(p2)
      teams = if type == :pve do
        %{players: [to_combatant_opts(p1)], enemies: [p2_opts]}
      else
        %{players: [to_combatant_opts(p1)], enemies: [Map.put(p2_opts, :is_ai, false)]}
      end

      gen_type = case type do
        :pve -> :pve
        :pvp -> :pvp
        _ -> :pvp
      end

      case Supervisor.start_battle(id: battle_id, teams: teams, type: gen_type) do
        {:ok, _pid} ->
          # Initialize all subsystems
          init_battle_subsystems(battle_id, p1)

          # Register on map
          register_battle_on_map(battle_id, p1)

          # Insert participants
          insert_participants(battle_id, p1_char_id, p2_char_id, type)

          Logger.info("Battle #{battle_id} created: #{p1.name} vs #{p2.name} (#{type})")
          {:ok, battle_id}

        {:error, reason} ->
          {:error, reason}
      end
    else
      nil -> {:error, :character_not_found}
    end
  end

  @doc """
  Create a party battle (multiple players vs multiple enemies).
  Returns {:ok, battle_id} or {:error, reason}.
  """
  def create_party_battle(player_char_ids, enemy_npc_ids, companion_stats \\ []) do
    # Load enemy char_ids from NPC table
    enemy_chars = load_enemy_chars(enemy_npc_ids)
    if enemy_chars == [] do
      {:error, :no_enemies}
    else
    # Load all stats
    player_stats = player_char_ids |> Enum.map(&Stats.get_effective_stats/1) |> Enum.filter(& &1)
    enemy_stats = enemy_chars |> Enum.map(fn {char_id, _name} -> Stats.get_effective_stats(char_id) end) |> Enum.filter(& &1)

    if player_stats == [] or enemy_stats == [] do
      {:error, :stats_load_failed}
    else
      # Scale enemies
      total_player_side = length(player_stats) + length(companion_stats)
      enemy_stats = if total_player_side > 1 do
        Enum.map(enemy_stats, &Stats.apply_enemy_scaling(&1, total_player_side))
      else
        enemy_stats
      end

      # Build teams
      player_team = Enum.map(player_stats, &to_combatant_opts/1) ++
                    Enum.map(companion_stats, fn cs -> Map.put(cs, :is_ai, true) end)
      enemy_team = Enum.map(enemy_stats, &to_combatant_opts/1)

      # Determine first turn
      all = player_stats ++ enemy_stats
      fastest = Enum.max_by(all, & &1.speed)

      access_token = :crypto.strong_rand_bytes(16) |> Base.encode16(case: :lower)
      p1 = hd(player_stats)
      p2 = hd(enemy_stats)

      {:ok, battle_id} = insert_battle_record(p1, p2, fastest.char_id, access_token, :party_pve)

      teams = %{players: player_team, enemies: enemy_team}

      case Supervisor.start_battle(id: battle_id, teams: teams, type: :party_pve) do
        {:ok, _pid} ->
          init_battle_subsystems(battle_id, p1)
          register_battle_on_map(battle_id, p1)

          # Insert all participants
          Enum.each(player_stats, fn ps ->
            insert_participant(battle_id, ps.char_id, 1, false)
          end)
          Enum.each(enemy_stats, fn es ->
            insert_participant(battle_id, es.char_id, 2, true)
          end)

          # Store enemy NPC IDs for quest kill credit
          _npc_ids = enemy_npc_ids
          battle_state = State.get_state(battle_id)
          State.replace_state(battle_id, %{battle_state | enemy_npc_ids: enemy_npc_ids})
          State.add_log(battle_id, %{actor: "system", text: "Party battle begins!"})

          {:ok, battle_id}

        {:error, reason} ->
          {:error, reason}
      end
    end
    end  # end of enemy_chars != [] guard
  end

  @doc """
  Create a free-for-all / multi-team battle.
  teams_spec: %{team_1: [char_id, ...], team_2: [char_id, ...], ...}
  """
  def create_ffa_battle(teams_spec) do
    # Load stats for all teams
    teams = Enum.reduce(teams_spec, %{}, fn {team_id, char_ids}, acc ->
      stats = char_ids |> Enum.map(&Stats.get_effective_stats/1) |> Enum.filter(& &1)
      Map.put(acc, team_id, Enum.map(stats, &to_combatant_opts/1))
    end)

    if Enum.all?(teams, fn {_, members} -> members == [] end) do
      {:error, :no_combatants}
    else
      all_stats = teams |> Map.values() |> List.flatten()
      fastest = Enum.max_by(all_stats, & Map.get(&1, :speed, 0))

      access_token = :crypto.strong_rand_bytes(16) |> Base.encode16(case: :lower)
      first_team = teams |> Map.values() |> hd()
      p1 = hd(first_team)

      # Use first two team members for the DB record
      {:ok, battle_id} = insert_ffa_record(p1, fastest, access_token)

      case Supervisor.start_battle(id: battle_id, teams: teams, type: :ffa) do
        {:ok, _pid} ->
          init_battle_subsystems(battle_id, p1)
          {:ok, battle_id}

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  @doc "Get the full battle state for a client"
  def get_client_state(battle_id, _char_id \\ nil) do
    state = State.get_state(battle_id)

    %{
      id: state.id,
      type: state.type,
      status: state.status,
      winner: state.winner,
      turn_number: state.turn_number,
      turn_char_id: state.turn_char_id,
      combatants: serialize_combatants(state.combatants),
      teams: state.teams,
      grid_w: state.grid_w,
      grid_h: state.grid_h,
      terrain_map: state.terrain_map,
      battle_objects: state.battle_objects,
      settings_summary: %{
        enable_limb_targeting: state.settings[:enable_limb_targeting],
        enable_active_defense: state.settings[:enable_active_defense],
        enable_brave_default: state.settings[:enable_brave_default],
        enable_combo_input: state.settings[:enable_combo_input],
        enable_stagger_system: state.settings[:enable_stagger_system],
        initiative_type: state.settings[:initiative_type]
      }
    }
  end

  @doc "End a battle, distribute rewards"
  def end_battle(battle_id, winner_team) do
    State.finish(battle_id, winner_team)

    # Distribute rewards (XP, gold, quest credit, win/loss records)
    TePhoenix.Battle.Rewards.distribute(battle_id, winner_team)

    # Stop the GenServer after a delay (let clients receive final state)
    Process.send_after(self(), {:stop_battle, battle_id}, 5000)

    :ok
  end

  # ══════════════════════════════════════════════════════════════════
  # PRIVATE HELPERS
  # ══════════════════════════════════════════════════════════════════

  defp to_combatant_opts(stats) do
    %{
      char_id: stats.char_id,
      name: stats.name,
      level: stats.level,
      max_hp: stats.max_hp,
      current_hp: stats.current_hp,
      max_mp: stats.max_mp,
      current_mp: stats.current_mp,
      atk: stats.atk,
      def: stats.def,
      mo: stats.mo,
      md: stats.md,
      speed: stats.speed,
      luck: stats.luck,
      weapon_type: stats.weapon_type,
      weapon_elements: stats.weapon_elements,
      armor_type: stats.armor_type,
      equipment: %{},
      passives: [],
      is_ai: Map.get(stats, :is_ai, false),
      user_id: Map.get(stats, :user_id),
      map_id: Map.get(stats, :map_id)
    }
  end

  defp init_battle_subsystems(battle_id, _p1_stats) do
    # Load settings from DB (overrides defaults)
    State.init_settings(battle_id)

    # Initialize morale system
    state = State.get_state(battle_id)
    if state.settings[:enable_morale] do
      # Morale init happens inside the GenServer on next access
    end

    :ok
  end

  defp register_battle_on_map(battle_id, p1_stats) do
    if p1_stats.map_id do
      State.register_on_map(battle_id, p1_stats.map_id, Map.get(p1_stats, :x, 0), Map.get(p1_stats, :y, 0))
    end
  end

  defp maybe_scale_enemy(p1, p2) do
    # Check if player is in a party
    party_count =
      try do
        Repo.one(
          from pm in "character_party_members",
          join: p in "character_parties", on: p.id == pm.party_id,
          where: pm.character_id == ^p1.char_id and p.is_active == true,
          select: count(pm.id)
        ) || 1
      rescue
        _ -> 1
      end

    if party_count > 1 do
      Stats.apply_enemy_scaling(p2, party_count)
    else
      p2
    end
  end

  defp insert_battle_record(p1, p2, first_turn, access_token, type) do
    mode = if type == :party_pve, do: "PARTY", else: "1v1"

    {:ok, result} = Repo.query(
      "INSERT INTO game_battles (p1_char_id, p2_char_id, p1_user_id, p2_user_id, turn_char_id, status, battle_mode, access_token) VALUES (?,?,?,?,?,?,?,?)",
      [p1.char_id, p2.char_id, p1.user_id, p2[:user_id] || 0, first_turn, "ACTIVE", mode, access_token]
    )

    {:ok, result.last_insert_id}
  end

  defp insert_ffa_record(p1, fastest, access_token) do
    {:ok, result} = Repo.query(
      "INSERT INTO game_battles (p1_char_id, p2_char_id, p1_user_id, p2_user_id, turn_char_id, status, battle_mode, access_token) VALUES (?,?,?,?,?,?,?,?)",
      [p1.char_id, p1.char_id, Map.get(p1, :user_id, 0), Map.get(p1, :user_id, 0), fastest.char_id, "ACTIVE", "FFA", access_token]
    )

    {:ok, result.last_insert_id}
  end

  defp insert_participants(battle_id, p1_id, p2_id, type) do
    is_ai = if type == :pve, do: 1, else: 0
    try do
      Repo.query!(
        "INSERT IGNORE INTO game_battle_participants (battle_id,character_id,team,is_ai) VALUES (?,?,1,0),(?,?,2,?)",
        [battle_id, p1_id, battle_id, p2_id, is_ai]
      )
    rescue
      _ -> nil
    end
  end

  defp insert_participant(battle_id, char_id, team, is_ai) do
    try do
      Repo.query!(
        "INSERT IGNORE INTO game_battle_participants (battle_id,character_id,team,is_ai) VALUES (?,?,?,?)",
        [battle_id, char_id, team, if(is_ai, do: 1, else: 0)]
      )
    rescue
      _ -> nil
    end
  end

  defp load_enemy_chars(npc_ids) do
    Enum.flat_map(npc_ids, fn npc_id ->
      case Repo.one(from n in "game_npcs",
             where: n.id == ^npc_id and n.is_enemy == true,
             select: {n.char_id, n.name}) do
        nil -> []
        {nil, _} -> []
        {char_id, name} -> [{char_id, name}]
      end
    end)
  rescue
    _ -> []
  end

  defp serialize_combatants(combatants) do
    Map.new(combatants, fn {id, c} ->
      {id, %{
        char_id: c.char_id, name: c.name, team_id: c.team_id, is_ai: c.is_ai,
        current_hp: c.current_hp, max_hp: c.max_hp,
        current_mp: c.current_mp, max_mp: c.max_mp,
        atk: c.atk, def: c.def, mo: c.mo, md: c.md,
        speed: c.speed, luck: c.luck,
        grid_x: c.grid_x, grid_y: c.grid_y,
        stance: c.stance, knocked_out: c.knocked_out,
        stagger: c.stagger, stagger_max: c.stagger_max, broken: c.broken,
        shield_points: c.shield_points, shield_max: c.shield_max,
        bp: c.bp, morale: c.morale,
        stealth_active: c.stealth_active, ki_active: c.ki_active,
        transform_active: c.transform_active
      }}
    end)
  end
end
