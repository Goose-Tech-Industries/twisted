defmodule TePhoenixWeb.BattleChannel do
  @moduledoc """
  Phoenix Channel for battle communication.
  Replaces ALL Socket.IO battle handlers from te/server/socket-battle.js (~50 events).

  Topic format: "battle:{battle_id}"

  Delegates to handler modules:
  - DuelHandler       — duel_challenge, duel_accept, duel_decline
  - InitiationHandler — battle_challenge, battle_accept, start_pve/party_pve, 3v3, join, map queries
  - SocialHandler     — battle_chat, emotes, surrender, chat history
  - CombatOptionsHandler — negotiate, non-lethal, defense stance, limb target, KO actions
  - SystemsHandler    — sig techs, spectating, auto-battle, preview, brave/default
  - SpecialHandler    — tournaments, referee, RT combat, devour, raids, async PvP, jobs

  Key differences from Socket.IO version:
  - Channel join = automatic presence tracking
  - PubSub broadcasts are built-in (no manual io.to())
  - Each channel process is supervised and isolated
  - Duel expiry via Process.send_after (no manual timers)
  """

  use Phoenix.Channel
  require Logger

  alias TePhoenix.Battle.{State, Combat, Manager}
  alias TePhoenix.Repo

  alias TePhoenixWeb.Battle.{
    DuelHandler,
    InitiationHandler,
    SocialHandler,
    CombatOptionsHandler,
    SystemsHandler,
    SpecialHandler
  }

  # ══════════════════════════════════════════════════════════════════
  # JOIN
  # ══════════════════════════════════════════════════════════════════

  @impl true
  # Lobby join — allows battle initiation events (start_pve_battle, duels, etc.)
  # before a battle exists. Client joins battle:lobby, starts a fight, then
  # joins the real battle:ID channel when battle_start_join is received.
  def join("battle:lobby", params, socket) do
    user_id = socket.assigns.user_id
    {char_id, char_name, char_level} = load_character_info(user_id, params)

    socket = socket
      |> assign(:battle_id, nil)
      |> assign(:char_id, char_id)
      |> assign(:char_name, char_name)
      |> assign(:char_level, char_level)

    {:ok, %{}, socket}
  end

  def join("battle:" <> battle_id_str, params, socket) do
    battle_id = parse_int(battle_id_str)

    if State.alive?(battle_id) do
      # Load character info for this user
      user_id = socket.assigns.user_id
      {char_id, char_name, char_level} = load_character_info(user_id, params)

      socket = socket
        |> assign(:battle_id, battle_id)
        |> assign(:char_id, char_id)
        |> assign(:char_name, char_name)
        |> assign(:char_level, char_level)

      state = State.get_state(battle_id)
      {:ok, serialize_state(state), socket}
    else
      {:error, %{reason: "battle_not_found"}}
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # CORE BATTLE ACTIONS (kept inline — high frequency, low latency)
  # ══════════════════════════════════════════════════════════════════

  @impl true
  def handle_in("action", payload, socket), do: handle_in("battle_action", payload, socket)

  def handle_in("battle_action", payload, socket) do
    if socket.assigns[:spectating] do
      {:reply, {:error, %{reason: "spectators_cannot_act"}}, socket}
    else
      do_battle_action(payload, socket)
    end
  end

  # ── Move combatant on grid ─────────────────────────────────────

  def handle_in("battle_move", _payload, %{assigns: %{spectating: s}} = socket) when not is_nil(s) do
    {:reply, {:error, %{reason: "spectators_cannot_act"}}, socket}
  end

  def handle_in("battle_move", %{"x" => x, "y" => y} = payload, socket) do
    battle_id = socket.assigns.battle_id
    char_id = socket.assigns[:char_id] || Map.get(payload, "char_id")
    state = State.get_state(battle_id)

    if state.turn_char_id != char_id do
      {:reply, {:error, %{reason: "not_your_turn"}}, socket}
    else
      combatant = Map.get(state.combatants, char_id)

      cond do
        combatant == nil ->
          {:reply, {:error, %{reason: "combatant_not_found"}}, socket}

        combatant.has_moved ->
          {:reply, {:error, %{reason: "already_moved"}}, socket}

        true ->
          dist = State.chebyshev(combatant, %{grid_x: x, grid_y: y})
          move_range = combatant.move_range || 3

          if dist > move_range do
            {:reply, {:error, %{reason: "out_of_range"}}, socket}
          else
            State.update_combatant(battle_id, char_id, fn c ->
              %{c | grid_x: x, grid_y: y, has_moved: true}
            end)

            State.add_log(battle_id, %{
              actor: combatant.name,
              action: "MOVE",
              text: "#{combatant.name} moves to (#{x},#{y})."
            })

            broadcast!(socket, "battle_grid_update", %{
              grid: get_grid_state(battle_id),
              has_moved: true,
              log: ["#{combatant.name} moves."]
            })

            {:noreply, socket}
          end
      end
    end
  end

  # ── Set defense preference ─────────────────────────────────────

  def handle_in("set_defense", %{"defense" => defense} = payload, socket)
      when defense in ["dodge", "block", "counter"] do
    battle_id = socket.assigns.battle_id
    char_id = socket.assigns[:char_id] || Map.get(payload, "char_id")

    State.update_combatant(battle_id, char_id, fn c ->
      %{c | default_defense: defense}
    end)

    {:reply, :ok, socket}
  end

  # ── Request battle state ───────────────────────────────────────

  def handle_in("get_state", _payload, socket) do
    state = State.get_state(socket.assigns.battle_id)
    {:reply, {:ok, serialize_state(state)}, socket}
  end

  # ══════════════════════════════════════════════════════════════════
  # DELEGATED HANDLERS
  # ══════════════════════════════════════════════════════════════════

  # Events spectators ARE allowed to use (read-only / social)
  @spectator_allowed_events ~w(
    battle_chat battle_emote battle_chat_send battle_chat_history
    get_state get_battles_on_map battle_spectate battle_unspectate
    battle_preview tournament_register tournament_get_bracket
    tournament_list tournament_leaderboard
  )

  # Spectator guard for all delegated handlers
  def handle_in(event, payload, %{assigns: %{spectating: s}} = socket)
      when not is_nil(s) and event not in @spectator_allowed_events do
    # Also allow tournament events through
    if String.starts_with?(event, "tournament_") do
      SpecialHandler.handle(event, payload, socket)
    else
      push(socket, "battle_error", %{reason: "Spectators cannot perform actions."})
      {:noreply, socket}
    end
  end

  # Duels
  def handle_in("duel_" <> _ = event, payload, socket),
    do: DuelHandler.handle(event, payload, socket)

  # Battle initiation
  def handle_in("battle_challenge" = event, payload, socket),
    do: InitiationHandler.handle(event, payload, socket)
  def handle_in("battle_challenge_3v3" = event, payload, socket),
    do: InitiationHandler.handle(event, payload, socket)
  def handle_in("battle_accept" = event, payload, socket),
    do: InitiationHandler.handle(event, payload, socket)
  def handle_in("battle_accept_3v3" = event, payload, socket),
    do: InitiationHandler.handle(event, payload, socket)
  def handle_in("start_pve_battle" = event, payload, socket),
    do: InitiationHandler.handle(event, payload, socket)
  def handle_in("start_party_pve_battle" = event, payload, socket),
    do: InitiationHandler.handle(event, payload, socket)
  def handle_in("join_battle" = event, payload, socket),
    do: InitiationHandler.handle(event, payload, socket)
  def handle_in("get_battles_on_map" = event, payload, socket),
    do: InitiationHandler.handle(event, payload, socket)
  def handle_in("_run_post_battle" = event, payload, socket),
    do: InitiationHandler.handle(event, payload, socket)
  def handle_in("event_choice" = event, payload, socket),
    do: InitiationHandler.handle(event, payload, socket)

  # Chat / Social
  def handle_in("battle_chat" = event, payload, socket),
    do: SocialHandler.handle(event, payload, socket)
  def handle_in("battle_emote" = event, payload, socket),
    do: SocialHandler.handle(event, payload, socket)
  def handle_in("battle_surrender" = event, payload, socket),
    do: SocialHandler.handle(event, payload, socket)
  def handle_in("battle_chat_send" = event, payload, socket),
    do: SocialHandler.handle(event, payload, socket)
  def handle_in("battle_chat_history" = event, payload, socket),
    do: SocialHandler.handle(event, payload, socket)

  # Combat options
  def handle_in("battle_negotiate" = event, payload, socket),
    do: CombatOptionsHandler.handle(event, payload, socket)
  def handle_in("negotiate_respond" = event, payload, socket),
    do: CombatOptionsHandler.handle(event, payload, socket)
  def handle_in("battle_toggle_nonlethal" = event, payload, socket),
    do: CombatOptionsHandler.handle(event, payload, socket)
  def handle_in("battle_set_defense" = event, payload, socket),
    do: CombatOptionsHandler.handle(event, payload, socket)
  def handle_in("battle_limb_target" = event, payload, socket),
    do: CombatOptionsHandler.handle(event, payload, socket)
  def handle_in("battle_ko_action" = event, payload, socket),
    do: CombatOptionsHandler.handle(event, payload, socket)
  def handle_in("battle_pvp_ko_choice" = event, payload, socket),
    do: CombatOptionsHandler.handle(event, payload, socket)

  # Sig techs, spectating, auto-battle, preview, brave/default
  def handle_in("sig_tech_" <> _ = event, payload, socket),
    do: SystemsHandler.handle(event, payload, socket)
  def handle_in("battle_spectate" = event, payload, socket),
    do: SystemsHandler.handle(event, payload, socket)
  def handle_in("battle_unspectate" = event, payload, socket),
    do: SystemsHandler.handle(event, payload, socket)
  def handle_in("battle_auto_toggle" = event, payload, socket),
    do: SystemsHandler.handle(event, payload, socket)
  def handle_in("battle_preview" = event, payload, socket),
    do: SystemsHandler.handle(event, payload, socket)
  def handle_in("battle_brave" = event, payload, socket),
    do: SystemsHandler.handle(event, payload, socket)
  def handle_in("battle_default" = event, payload, socket),
    do: SystemsHandler.handle(event, payload, socket)

  # Tournaments, referee, RT combat, devour, raids, async PvP, jobs
  def handle_in("tournament_" <> _ = event, payload, socket),
    do: SpecialHandler.handle(event, payload, socket)
  def handle_in("battle_ref_" <> _ = event, payload, socket),
    do: SpecialHandler.handle(event, payload, socket)
  def handle_in("rt_combat_" <> _ = event, payload, socket),
    do: SpecialHandler.handle(event, payload, socket)
  def handle_in("devour_enemy" = event, payload, socket),
    do: SpecialHandler.handle(event, payload, socket)
  def handle_in("raid_join" = event, payload, socket),
    do: SpecialHandler.handle(event, payload, socket)
  def handle_in("async_pvp_" <> _ = event, payload, socket),
    do: SpecialHandler.handle(event, payload, socket)
  def handle_in("job_switch" = event, payload, socket),
    do: SpecialHandler.handle(event, payload, socket)

  # Catch-all for unknown events
  def handle_in(event, _payload, socket) do
    Logger.warning("Unknown battle event: #{event}")
    {:noreply, socket}
  end

  defp do_battle_action(payload, socket) do
    battle_id = socket.assigns.battle_id
    state = State.get_state(battle_id)
    char_id = socket.assigns[:char_id] || Map.get(payload, "char_id")

    cond do
      is_nil(char_id) ->
        {:reply, {:error, %{reason: "no_character"}}, socket}

      state.turn_char_id != char_id ->
        {:reply, {:error, %{reason: "not_your_turn"}}, socket}

      true ->
        target_id = Map.get(payload, "target_id") || Map.get(payload, "target_char_id")

      opts = %{
        command_id: Map.get(payload, "command_id"),
        skill_id: Map.get(payload, "skill_id"),
        item_id: Map.get(payload, "item_id"),
        limit_id: Map.get(payload, "limit_id"),
        target_limb: Map.get(payload, "target_limb"),
        flavor_text: Map.get(payload, "flavor_text"),
        sig_tech_id: Map.get(payload, "sig_tech_id"),
        combo_input: Map.get(payload, "combo_input"),
        action_timing: Map.get(payload, "action_timing")
      }
      |> Enum.reject(fn {_k, v} -> is_nil(v) end)
      |> Map.new()

      {new_state, action_result} = Combat.execute(state, char_id, target_id, opts)

      # Persist the updated state back to the GenServer
      State.replace_state(battle_id, new_state)

      broadcast!(socket, "action_result", %{
        result: action_result,
        turn_char_id: new_state.turn_char_id,
        turn_number: new_state.turn_number,
        combatants: serialize_combatants(new_state.combatants),
        status: new_state.status,
        winner: new_state.winner
      })

      # Drain any trigger-queued events (interrogation prompts, post-ko
      # dialogue, quest hooks) and push them to clients. Data-driven —
      # channel code has no idea which events exist; it just forwards.
      case State.drain_pending_events(battle_id) do
        [] -> :ok
        events ->
          broadcast!(socket, "battle_events", %{events: events})
      end

      # Auto-advance turn after action — unless the actor earned a
      # One More (weakness hit / crit): in that case they keep the turn.
      one_more? = Enum.any?(action_result[:actions] || [], &(&1[:type] == :one_more))

      cond do
        new_state.status != :active ->
          :ok

        one_more? ->
          broadcast!(socket, "one_more", %{actor_id: new_state.turn_char_id})
          # Actor is still on turn — don't advance. If it's an AI, schedule its next action.
          cur = Map.get(new_state.combatants, new_state.turn_char_id)
          if cur && cur.is_ai do
            Process.send_after(self(), {:ai_turn, battle_id}, 1200)
          end

        true ->
          State.next_turn(battle_id)
          updated_state = State.get_state(battle_id)
          next_combatant = Map.get(updated_state.combatants, updated_state.turn_char_id)
          if next_combatant && next_combatant.is_ai do
            Process.send_after(self(), {:ai_turn, battle_id}, 1200)
          end
      end

      # Check if battle ended
      if new_state.status == :finished do
        Manager.end_battle(battle_id, new_state.winner)
      end

      {:noreply, socket}
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # HANDLE_INFO (timers, duel expiry, AI turns)
  # ══════════════════════════════════════════════════════════════════

  @impl true
  def handle_info({:duel_expired, request_id}, socket) do
    case TePhoenix.Battle.Duels.expire(request_id) do
      nil -> :ok
      duel ->
        push(socket, "duel_expired", %{request_id: request_id})
        # Also notify target
        TePhoenixWeb.Endpoint.broadcast!(
          "user:#{duel.target_id}",
          "duel_expired",
          %{request_id: request_id}
        )
    end
    {:noreply, socket}
  end

  def handle_info({:ai_turn, battle_id}, socket) do
    if State.alive?(battle_id) do
      state = State.get_state(battle_id)
      if state.status == :active do
        combatant = Map.get(state.combatants, state.turn_char_id)
        if combatant && combatant.is_ai do
          # Pick AI action via AutoBattle, then execute via Combat
          tactics = Map.get(combatant, :auto_tactics) || "balanced"
          ai_decision = TePhoenix.Battle.AutoBattle.pick_action(state, combatant, tactics)

          {target_id, opts} = case ai_decision do
            %{action: :skill, skill_id: sid, target_id: tid} ->
              {tid, %{skill_id: sid}}
            %{action: :defend} ->
              {nil, %{command_id: :defend}}
            %{action: :attack, target_id: tid} ->
              {tid, %{}}
            %{action: :wait} ->
              {nil, %{command_id: :defend}}
            _ ->
              # Fallback: attack first enemy
              enemies = TePhoenix.Battle.AutoBattle.get_enemies_alive(state, combatant.team_id)
              target = List.first(enemies)
              {target && target.char_id, %{}}
          end

          {new_state, action_result} = Combat.execute(state, combatant.char_id, target_id, opts)

          # Persist AI action state back to GenServer
          State.replace_state(battle_id, new_state)

          broadcast!(socket, "action_result", %{
            result: action_result,
            turn_char_id: new_state.turn_char_id,
            turn_number: new_state.turn_number,
            combatants: serialize_combatants(new_state.combatants),
            status: new_state.status,
            winner: new_state.winner
          })

          if new_state.status == :active do
            State.next_turn(battle_id)

            # Chain AI turns if next is also AI
            updated = State.get_state(battle_id)
            next = Map.get(updated.combatants, updated.turn_char_id)
            if next && next.is_ai do
              Process.send_after(self(), {:ai_turn, battle_id}, 1200)
            end
          end

          if new_state.status == :finished do
            Manager.end_battle(battle_id, new_state.winner)
          end
        end
      end
    end
    {:noreply, socket}
  end

  def handle_info({:stop_battle, battle_id}, socket) do
    TePhoenix.Battle.Supervisor.stop_battle(battle_id)
    {:noreply, socket}
  end

  def handle_info(_msg, socket), do: {:noreply, socket}

  # ══════════════════════════════════════════════════════════════════
  # PRIVATE HELPERS
  # ══════════════════════════════════════════════════════════════════

  defp load_character_info(user_id, params) do
    char_id = Map.get(params, "char_id")

    if char_id do
      case Repo.query("SELECT id, name, level FROM characters WHERE id=? AND user_id=?",
        [char_id, user_id]) do
        {:ok, %{rows: [[id, name, level]]}} -> {id, name, level}
        _ -> {char_id, "Unknown", 1}
      end
    else
      # Default to first character
      case Repo.query("SELECT id, name, level FROM characters WHERE user_id=? LIMIT 1",
        [user_id]) do
        {:ok, %{rows: [[id, name, level]]}} -> {id, name, level}
        _ -> {nil, "Unknown", 1}
      end
    end
  end

  defp get_grid_state(battle_id) do
    state = State.get_state(battle_id)
    Map.new(state.combatants, fn {id, c} ->
      {id, %{grid_x: c.grid_x, grid_y: c.grid_y, name: c.name, team_id: c.team_id}}
    end)
  end

  defp serialize_state(state) do
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
      settings: %{
        enable_combo_input: (state.settings && state.settings[:enable_combo_input]) != false,
        enable_stagger_system: (state.settings && state.settings[:enable_stagger_system]) != false,
        enable_break_shield: (state.settings && state.settings[:enable_break_shield]) != false,
        enable_action_commands: (state.settings && state.settings[:enable_action_commands]) != false,
        enable_limb_targeting: (state.settings && state.settings[:enable_limb_targeting]) != false,
        enable_morale: (state.settings && state.settings[:enable_morale]) != false,
        enable_rolling_hp: (state.settings && state.settings[:enable_rolling_hp]) == true,
        initiative_type: (state.settings && state.settings[:initiative_type]) || "speed"
      }
    }
  end

  defp serialize_combatants(combatants) do
    Map.new(combatants, fn {id, c} ->
      {id, %{
        char_id: c.char_id,
        name: c.name,
        team_id: c.team_id,
        is_ai: c.is_ai,
        current_hp: c.current_hp,
        max_hp: c.max_hp,
        current_mp: c.current_mp,
        max_mp: c.max_mp,
        atk: c.atk,
        def: c.def,
        mo: c.mo,
        md: c.md,
        speed: c.speed,
        luck: c.luck,
        grid_x: c.grid_x,
        grid_y: c.grid_y,
        stance: c.stance,
        knocked_out: c.knocked_out,
        statuses: Enum.map(c.statuses || [], &Map.take(&1, [:id, :name, :duration, :stacks])),
        stagger: c.stagger,
        stagger_max: c.stagger_max,
        broken: c.broken,
        shield_points: c.shield_points,
        shield_max: c.shield_max,
        bp: c.bp,
        morale: c.morale,
        stealth_active: c.stealth_active,
        ki_active: c.ki_active,
        transform_active: c.transform_active,
        cooldowns: c.cooldowns || %{},
        current_ap: c.current_ap || 6,
        max_ap: c.max_ap || 6,
        combo_arts: Enum.map(c.combo_arts || [], fn a ->
          %{
            name: a[:name] || a["name"],
            sequence_str: a[:sequence_str] || a["sequence_str"],
            ap_cost: a[:ap_cost] || a["ap_cost"] || 3,
            damage_formula: a[:damage_formula] || a["damage_formula"] || "ATK*3"
          }
        end)
      }}
    end)
  end

  defp parse_int(val) when is_integer(val), do: val
  defp parse_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp parse_int(_), do: 0
end
