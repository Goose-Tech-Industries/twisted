defmodule TePhoenixWeb.Battle.InitiationHandler do
  @moduledoc """
  Handles battle start/join channel events.
  Ported from socket-battle.js: battle_challenge, battle_accept, start_pve_battle,
  start_party_pve_battle, battle_challenge_3v3, battle_accept_3v3, join_battle, get_battles_on_map.
  """

  import Phoenix.Channel
  import Phoenix.Socket, only: [assign: 3]
  require Logger

  alias TePhoenix.Battle.{Manager, State, Stats}
  alias TePhoenix.Repo


  # ── PvP Challenge (arena-only) ──────────────────────────────────

  def handle("battle_challenge", %{"target_char_id" => target_char_id}, socket) do
    char_id = socket.assigns[:char_id]
    _user_id = socket.assigns.user_id

    with {:ok, player} <- get_online_player(char_id),
         {:ok, _target} <- get_online_player(target_char_id),
         :ok <- validate_arena(player, target_char_id) do

      # Notify target
      TePhoenixWeb.Endpoint.broadcast!(
        "user:#{target_char_id}",
        "battle_challenged",
        %{
          challenger_name: player.name,
          challenger_char_id: char_id,
          arena_name: player[:arena_name] || "Arena"
        }
      )

      {:noreply, socket}
    else
      {:error, reason} ->
        push(socket, "battle_error", %{reason: reason})
        {:noreply, socket}
    end
  end

  # ── Accept PvP ──────────────────────────────────────────────────

  def handle("battle_accept", %{"challenger_char_id" => challenger_char_id}, socket) do
    char_id = socket.assigns[:char_id]

    case Manager.create_battle(challenger_char_id, char_id, :pvp) do
      {:ok, battle_id} ->
        _state = Manager.get_client_state(battle_id)

        # Notify both players to join the battle channel
        TePhoenixWeb.Endpoint.broadcast!(
          "user:#{challenger_char_id}",
          "battle_start_join",
          %{battle_id: battle_id}
        )

        push(socket, "battle_start_join", %{battle_id: battle_id})
        {:noreply, socket}

      {:error, reason} ->
        push(socket, "battle_error", %{reason: to_string(reason)})
        {:noreply, socket}
    end
  end

  # ── Start PvE Battle ────────────────────────────────────────────

  def handle("start_pve_battle", %{"enemy_char_id" => enemy_input}, socket) do
    char_id = socket.assigns[:char_id]

    # Resolve: if this is a game_npcs.id, get its char_id
    resolved_char_id = resolve_enemy_char_id(enemy_input)

    case resolved_char_id do
      {:error, reason} ->
        push(socket, "error_msg", %{reason: reason})
        {:noreply, socket}

      enemy_char_id ->
        # Check for active companions
        companions = get_active_companions(char_id)

        result = if companions != [] do
          _companion_char_ids = Enum.map(companions, & &1.char_id)
          companion_stats = Enum.map(companions, fn c ->
            stats = Stats.get_effective_stats(c.char_id)
            if stats, do: Map.merge(stats, %{is_ai: true, tactics: c[:tactics] || "BALANCED"})
          end) |> Enum.filter(& &1)

          Manager.create_party_battle([char_id], [enemy_input], companion_stats)
        else
          Manager.create_battle(char_id, enemy_char_id, :pve)
        end

        case result do
          {:ok, battle_id} ->
            push(socket, "battle_start_join", %{battle_id: battle_id})

            # Notify map about active battles
            broadcast_battles_on_map(socket, char_id)
            {:noreply, socket}

          {:error, reason} ->
            push(socket, "error_msg", %{reason: to_string(reason)})
            {:noreply, socket}
        end
    end
  end

  # ── Start Party PvE Battle ─────────────────────────────────────

  def handle("start_party_pve_battle", %{"enemy_npc_ids" => enemy_npc_ids}, socket)
      when is_list(enemy_npc_ids) and enemy_npc_ids != [] do
    char_id = socket.assigns[:char_id]

    # Find party members
    member_char_ids = get_party_member_ids(char_id)

    # Enforce max_dungeon_size
    max_dungeon = get_setting("max_dungeon_size", 5)
    member_char_ids = Enum.take(member_char_ids, max_dungeon)

    case Manager.create_party_battle(member_char_ids, enemy_npc_ids) do
      {:ok, battle_id} ->
        # Notify all party members
        Enum.each(member_char_ids, fn mid ->
          TePhoenixWeb.Endpoint.broadcast!(
            "user:#{mid}",
            "battle_start_join",
            %{battle_id: battle_id}
          )
        end)

        {:noreply, socket}

      {:error, _reason} ->
        push(socket, "error_msg", %{
          reason: "Could not start party battle — check that enemies are set up in AdminSauce."
        })
        {:noreply, socket}
    end
  end

  # ── 3v3 Challenge ───────────────────────────────────────────────

  def handle("battle_challenge_3v3", %{"target_user_id" => target_user_id, "my_char_ids" => my_char_ids}, socket)
      when is_list(my_char_ids) do
    user_id = socket.assigns.user_id
    _char_id = socket.assigns[:char_id]

    # Read max team size
    max_team = get_setting("max_team_size", 10)
    team_ids = Enum.take(my_char_ids, max_team)

    # Validate all chars belong to this user
    {:ok, %{rows: owned}} = Repo.query(
      "SELECT id FROM characters WHERE id IN (#{Enum.map_join(team_ids, ",", fn _ -> "?" end)}) AND user_id=?",
      team_ids ++ [user_id]
    )

    if length(owned) != length(team_ids) do
      push(socket, "battle_error", %{reason: "Some characters do not belong to you."})
      {:noreply, socket}
    else
      # Get target's PvP team
      target_char_ids = get_pvp_team(target_user_id, max_team)

      if target_char_ids == [] do
        push(socket, "battle_error", %{reason: "Target has no characters to battle with."})
        {:noreply, socket}
      else
        # Send challenge to target (broadcast to their primary char's channel)
        target_primary_char = List.first(target_char_ids)
        TePhoenixWeb.Endpoint.broadcast!(
          "user:#{target_primary_char}",
          "battle_challenged_3v3",
          %{
            challenger_user_id: user_id,
            challenger_name: socket.assigns[:char_name] || "Unknown",
            my_char_ids: team_ids
          }
        )

        # Store pending challenge in socket assigns
        socket = assign(socket, :pending_3v3, %{
          target_user_id: target_user_id,
          challenger_char_ids: team_ids,
          target_char_ids: target_char_ids
        })

        {:noreply, socket}
      end
    end
  end

  # ── Accept 3v3 ──────────────────────────────────────────────────

  def handle("battle_accept_3v3", %{"challenger_user_id" => _challenger_user_id, "challenger_char_ids" => challenger_char_ids, "target_char_ids" => target_char_ids}, socket) do
    # Create party battle: challenger team vs target team
    teams_spec = %{
      team_1: challenger_char_ids,
      team_2: target_char_ids
    }

    case Manager.create_ffa_battle(teams_spec) do
      {:ok, battle_id} ->
        # Notify challenger (use their first char_id)
        challenger_primary = List.first(challenger_char_ids)
        TePhoenixWeb.Endpoint.broadcast!(
          "user:#{challenger_primary}",
          "battle_start_join",
          %{battle_id: battle_id, type: "3v3"}
        )

        push(socket, "battle_start_join", %{battle_id: battle_id, type: "3v3"})
        {:noreply, socket}

      {:error, reason} ->
        push(socket, "battle_error", %{reason: to_string(reason)})
        {:noreply, socket}
    end
  end

  # ── Join Ongoing Battle ─────────────────────────────────────────

  def handle("join_battle", %{"battle_id" => battle_id}, socket) do
    char_id = socket.assigns[:char_id]
    battle_id = to_integer(battle_id)

    cond do
      socket.assigns[:in_battle] ->
        push(socket, "error_msg", %{reason: "You are already in a battle."})
        {:noreply, socket}

      not State.alive?(battle_id) ->
        push(socket, "error_msg", %{reason: "Battle not found or already ended."})
        {:noreply, socket}

      true ->
        state = State.get_state(battle_id)

        if state.status != :active do
          push(socket, "error_msg", %{reason: "Battle already ended."})
          {:noreply, socket}
        else
          # Check max combatants
          alive_count = state.combatants
            |> Map.values()
            |> Enum.count(fn c -> c.current_hp > 0 end)

          if alive_count >= 8 do
            push(socket, "error_msg", %{reason: "Battle is full (max 8 combatants)."})
            {:noreply, socket}
          else
            # Load player stats and add to player team
            case Stats.get_effective_stats(char_id) do
              nil ->
                push(socket, "error_msg", %{reason: "Failed to load your stats."})
                {:noreply, socket}

              stats ->
                # Find the player team
                player_team = state.teams
                  |> Enum.find(fn {_tid, members} ->
                    Enum.any?(members, fn id ->
                      c = Map.get(state.combatants, id)
                      c && !c.is_ai
                    end)
                  end)

                join_team_id = case player_team do
                  {tid, _} -> tid
                  nil -> :players
                end

                State.add_combatant(battle_id, stats, join_team_id, false)

                # Record participant in DB
                try do
                  Repo.query!(
                    "INSERT IGNORE INTO game_battle_participants (battle_id,character_id,team,is_ai) VALUES (?,?,1,0)",
                    [battle_id, char_id]
                  )
                rescue
                  _ -> nil
                end

                # Send battle state to joining player
                client_state = Manager.get_client_state(battle_id, char_id)
                push(socket, "battle_start", client_state)

                # Broadcast join to existing participants
                TePhoenixWeb.Endpoint.broadcast!(
                  "battle:#{battle_id}",
                  "action_result",
                  %{
                    result: %{actor: "system", actions: [], log: ["#{stats.name} joins the fight!"]},
                    combatants: client_state.combatants
                  }
                )

                State.add_log(battle_id, %{actor: "system", text: "#{stats.name} joins the fight!"})

                broadcast_battles_on_map(socket, char_id)

                socket = assign(socket, :in_battle, battle_id)
                {:noreply, socket}
            end
          end
        end
    end
  end

  # ── Get Battles on Map ──────────────────────────────────────────

  def handle("get_battles_on_map", _payload, socket) do
    char_id = socket.assigns[:char_id]
    battles = get_battles_on_map(char_id)
    push(socket, "battles_on_map", %{battles: battles})
    {:noreply, socket}
  end

  # ── Post-Battle Action Chains ───────────────────────────────────

  def handle("_run_post_battle", %{"won" => won}, socket) do
    char_id = socket.assigns[:char_id]

    case socket.assigns[:post_battle_actions] do
      nil -> :ok
      hooks ->
        actions = if won, do: hooks[:on_win], else: hooks[:on_lose]
        if is_list(actions) and actions != [] and char_id do
          # Load character state for flag evaluation
          char_state = case Repo.query("SELECT state_json FROM characters WHERE id=?", [char_id]) do
            {:ok, %{rows: [[json]]}} when not is_nil(json) ->
              case Jason.decode(to_string(json)) do
                {:ok, state} -> state
                _ -> %{}
              end
            _ -> %{}
          end

          # Execute the action chain
          case TePhoenix.EventRunner.execute(actions, char_id, char_state) do
            {:ok, responses} ->
              Enum.each(responses, fn resp -> push(socket, "event_action", resp) end)

            {:halted, responses, pending} ->
              # CHOICE was reached — send responses so far, store pending for resume
              Enum.each(responses, fn resp -> push(socket, "event_action", resp) end)
              _socket = assign(socket, :pending_event_choice, %{pending: pending, char_state: char_state})

            _ -> nil
          end
        end
    end

    socket = assign(socket, :post_battle_actions, nil)
    {:noreply, socket}
  end

  # ── Event Choice Response (client picked a CHOICE option) ────────

  def handle("event_choice", %{"option_id" => option_id}, socket) do
    char_id = socket.assigns[:char_id]

    case socket.assigns[:pending_event_choice] do
      nil ->
        push(socket, "error_msg", %{reason: "No pending choice."})
        {:noreply, socket}

      %{pending: pending, char_state: char_state} ->
        case TePhoenix.EventRunner.resume(pending, option_id, char_id, char_state) do
          {:ok, responses} ->
            Enum.each(responses, fn resp -> push(socket, "event_action", resp) end)

          {:halted, responses, new_pending} ->
            Enum.each(responses, fn resp -> push(socket, "event_action", resp) end)
            socket = assign(socket, :pending_event_choice, %{pending: new_pending, char_state: char_state})
            {:noreply, socket}

          _ -> nil
        end

        socket = assign(socket, :pending_event_choice, nil)
        {:noreply, socket}
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # PRIVATE HELPERS
  # ══════════════════════════════════════════════════════════════════

  defp get_online_player(char_id) do
    # For now, verify character exists
    case Repo.query("SELECT c.id, c.name, c.user_id, c.map_id FROM characters c WHERE c.id=?", [char_id]) do
      {:ok, %{rows: [[id, name, user_id, map_id]]}} ->
        {:ok, %{char_id: id, name: name, user_id: user_id, map_id: map_id}}
      _ ->
        {:error, "Player not found."}
    end
  end

  defp validate_arena(player, target_char_id) do
    challenger_map_id = player.map_id
    challenger_char_id = player.char_id

    # Load target's map
    target_map_id = case Repo.query("SELECT map_id FROM characters WHERE id=?", [target_char_id]) do
      {:ok, %{rows: [[mid]]}} -> mid
      _ -> nil
    end

    # Check sanctuary regions — block ALL PvP in sanctuaries
    with :ok <- check_sanctuary(challenger_map_id, "You are in a sanctuary — no combat here."),
         :ok <- check_sanctuary(target_map_id, "Target is in a sanctuary zone.") do

      # Check arena zones — both must be in an arena
      case get_arena_for_position(challenger_map_id, challenger_char_id) do
        nil ->
          {:error, "You must be inside an arena zone to challenge players."}

        challenger_arena ->
          case get_arena_for_position(target_map_id, target_char_id) do
            nil ->
              {:error, "Target is not in an arena zone."}

            target_arena ->
              cond do
                challenger_arena.id != target_arena.id ->
                  {:error, "You must be in the same arena zone to challenge."}

                challenger_arena.arena_type == "TOURNAMENT" ->
                  {:error, "This is a tournament arena — challenges are bracket-only."}

                challenger_arena.arena_type == "QUEUE" ->
                  {:error, "This is a matchmaking queue arena — use the queue system to get paired."}

                true ->
                  :ok
              end
          end
      end
    end
  end

  defp check_sanctuary(nil, _msg), do: :ok
  defp check_sanctuary(map_id, msg) do
    case Repo.query(
      "SELECT r.is_sanctuary, r.name FROM game_regions r JOIN game_maps m ON m.region_id=r.id WHERE m.id=?",
      [map_id]
    ) do
      {:ok, %{rows: [[1, _name]]}} -> {:error, msg}
      {:ok, %{rows: [[true, _name]]}} -> {:error, msg}
      _ -> :ok
    end
  end

  defp get_arena_for_position(nil, _char_id), do: nil
  defp get_arena_for_position(map_id, char_id) do
    # Get character position
    {x, y} = case Repo.query("SELECT x, y FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[cx, cy]]}} -> {cx || 0, cy || 0}
      _ -> {0, 0}
    end

    # Check if position is inside any arena zone on this map
    case Repo.query(
      "SELECT id, name, arena_type FROM game_arenas WHERE map_id=? AND enabled=1 AND ?>=x_min AND ?<=x_max AND ?>=y_min AND ?<=y_max LIMIT 1",
      [map_id, x, x, y, y]
    ) do
      {:ok, %{rows: [[id, name, arena_type]]}} ->
        %{id: id, name: name, arena_type: arena_type}
      _ -> nil
    end
  end

  defp resolve_enemy_char_id(npc_or_char_id) do
    npc_id = to_integer(npc_or_char_id)

    case Repo.query("SELECT char_id FROM game_npcs WHERE id=? AND is_enemy=1", [npc_id]) do
      {:ok, %{rows: [[nil]]}} ->
        {:error, "This enemy has no combat stats yet. An admin needs to save it in AdminSauce with 'Is Enemy' checked."}

      {:ok, %{rows: [[char_id]]}} when not is_nil(char_id) ->
        char_id

      _ ->
        # Not an NPC ID — treat as direct char_id
        npc_id
    end
  end

  defp get_active_companions(char_id) do
    case Repo.query(
      "SELECT cc.companion_npc_id, gn.char_id, cc.tactics FROM character_companions cc JOIN game_npcs gn ON gn.id=cc.companion_npc_id WHERE cc.character_id=? AND cc.is_active=1 AND gn.char_id IS NOT NULL",
      [char_id]
    ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [_npc_id, char_id, tactics] ->
          %{char_id: char_id, tactics: tactics || "BALANCED"}
        end)
      _ -> []
    end
  end

  defp get_party_member_ids(leader_char_id) do
    case Repo.query(
      "SELECT cpm.character_id FROM character_party_members cpm JOIN character_parties cp ON cp.id = cpm.party_id WHERE cp.leader_id = ? AND cp.is_active = 1 AND cpm.is_active = 1",
      [leader_char_id]
    ) do
      {:ok, %{rows: rows}} ->
        ids = Enum.map(rows, fn [id] -> id end)
        if leader_char_id in ids, do: ids, else: [leader_char_id | ids]
      _ ->
        [leader_char_id]
    end
  end

  defp get_pvp_team(user_id, max_team) do
    case Repo.query(
      "SELECT team_chars FROM character_pvp_teams WHERE user_id=? AND is_active=1 LIMIT 1",
      [user_id]
    ) do
      {:ok, %{rows: [[team_json]]}} when not is_nil(team_json) ->
        case Jason.decode(team_json) do
          {:ok, ids} when is_list(ids) -> Enum.take(ids, max_team)
          _ -> get_fallback_chars(user_id, max_team)
        end
      _ ->
        get_fallback_chars(user_id, max_team)
    end
  end

  defp get_fallback_chars(user_id, max) do
    case Repo.query("SELECT id FROM characters WHERE user_id=? ORDER BY id LIMIT ?", [user_id, max]) do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [id] -> id end)
      _ -> []
    end
  end

  defp get_setting(key, default) do
    case Repo.query("SELECT setting_value FROM system_settings WHERE setting_key=? LIMIT 1", [key]) do
      {:ok, %{rows: [[val]]}} ->
        case Integer.parse(to_string(val)) do
          {n, _} -> n
          :error -> default
        end
      _ -> default
    end
  end

  defp get_battles_on_map(char_id) do
    # Get the character's current map and find active battles there
    case Repo.query("SELECT map_id FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[map_id]]}} when not is_nil(map_id) ->
        # Query battle registry for battles on this map
        # For now return battles from DB
        case Repo.query(
          "SELECT id, p1_char_id, p2_char_id, battle_mode FROM game_battles WHERE status='ACTIVE'",
          []
        ) do
          {:ok, %{rows: rows}} ->
            Enum.map(rows, fn [id, p1, p2, mode] ->
              %{id: id, p1_char_id: p1, p2_char_id: p2, mode: mode}
            end)
          _ -> []
        end
      _ -> []
    end
  end

  defp broadcast_battles_on_map(_socket, char_id) do
    battles = get_battles_on_map(char_id)
    # Broadcast to map channel if available
    case Repo.query("SELECT map_id FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[map_id]]}} when not is_nil(map_id) ->
        TePhoenixWeb.Endpoint.broadcast!("map:#{map_id}", "battles_on_map", %{battles: battles})
      _ -> :ok
    end
  end

  defp to_integer(val) when is_integer(val), do: val
  defp to_integer(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp to_integer(_), do: 0
end
