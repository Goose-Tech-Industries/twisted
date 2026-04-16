defmodule TePhoenixWeb.Battle.SystemsHandler do
  @moduledoc """
  Handles signature techs, spectating, auto-battle, damage preview, brave/default.
  Ported from socket-battle.js sessions 11, 22, 28.
  """

  import Phoenix.Channel
  import Phoenix.Socket, only: [assign: 3]
  require Logger

  alias TePhoenix.Battle.{State, BraveDefault, Manager, Formula, Combatant}
  alias TePhoenix.Repo

  # ══════════════════════════════════════════════════════════════════
  # SIGNATURE TECHNIQUES
  # ══════════════════════════════════════════════════════════════════

  def handle("sig_tech_create", payload, socket) do
    char_id = socket.assigns[:char_id]
    if is_nil(char_id) do
      {:noreply, socket}
    else
      name = Map.get(payload, "name", "Unnamed Tech")
      base_skill_id = Map.get(payload, "base_skill_id")
      description = Map.get(payload, "description", "")

      result = try do
        {:ok, res} = Repo.query(
          "INSERT INTO game_signature_techs (character_id, name, base_skill_id, description, created_at) VALUES (?,?,?,?,NOW())",
          [char_id, name, base_skill_id, description]
        )
        %{success: true, tech_id: res.last_insert_id, message: "Signature technique '#{name}' created!"}
      rescue
        e -> %{success: false, message: "Failed to create technique: #{Exception.message(e)}"}
      end

      push(socket, "sig_tech_created", result)
      {:noreply, socket}
    end
  end

  def handle("sig_tech_equip_ability", %{"tech_id" => tech_id, "ability_id" => ability_id, "slot" => slot}, socket) do
    char_id = socket.assigns[:char_id]
    if is_nil(char_id) do
      {:noreply, socket}
    else
      result = try do
        # Verify ownership
        case Repo.query("SELECT id FROM game_signature_techs WHERE id=? AND character_id=?", [tech_id, char_id]) do
          {:ok, %{rows: [_]}} ->
            Repo.query!(
              "INSERT INTO game_signature_tech_abilities (tech_id, ability_id, slot) VALUES (?,?,?) ON DUPLICATE KEY UPDATE ability_id=VALUES(ability_id)",
              [tech_id, ability_id, slot]
            )
            %{success: true, message: "Ability equipped to slot #{slot}!"}

          _ ->
            %{success: false, message: "Technique not found or not yours."}
        end
      rescue
        e -> %{success: false, message: Exception.message(e)}
      end

      push(socket, "sig_tech_ability_equipped", result)
      {:noreply, socket}
    end
  end

  def handle("sig_tech_get_abilities", _payload, socket) do
    case Repo.query("SELECT * FROM game_signature_abilities WHERE active=1 OR active IS NULL ORDER BY min_level, name") do
      {:ok, %{rows: rows, columns: cols}} ->
        abilities = Enum.map(rows, fn row ->
          Enum.zip(cols, row) |> Map.new()
        end)
        push(socket, "sig_tech_abilities_list", %{abilities: abilities})

      _ ->
        push(socket, "sig_tech_abilities_list", %{abilities: []})
    end

    {:noreply, socket}
  end

  # ══════════════════════════════════════════════════════════════════
  # SPECTATING
  # ══════════════════════════════════════════════════════════════════

  def handle("battle_spectate", %{"battle_id" => battle_id}, socket) do
    battle_id = to_int(battle_id)

    if State.alive?(battle_id) do
      state = Manager.get_client_state(battle_id)
      # Mark socket as spectating (not a combatant)
      socket = assign(socket, :spectating, battle_id)

      push(socket, "battle_spectate_result", %{
        success: true,
        battle_id: battle_id,
        state: state
      })
    else
      push(socket, "battle_spectate_result", %{
        success: false,
        message: "Battle not found."
      })
    end

    {:noreply, socket}
  end

  def handle("battle_unspectate", _payload, socket) do
    socket = assign(socket, :spectating, nil)
    {:noreply, socket}
  end

  # ══════════════════════════════════════════════════════════════════
  # AUTO-BATTLE
  # ══════════════════════════════════════════════════════════════════

  def handle("battle_auto_toggle", payload, socket) do
    char_id = socket.assigns[:char_id]
    battle_id = socket.assigns[:battle_id]

    if char_id && battle_id && State.alive?(battle_id) do
      enabled = Map.get(payload, "enabled", false)
      tactics = Map.get(payload, "tactics", "balanced")
      speed = Map.get(payload, "speed", 1)

      State.update_combatant(battle_id, char_id, fn c ->
        %{c | auto_battle: enabled, auto_tactics: tactics, auto_speed: speed}
      end)

      push(socket, "battle_auto_status", %{
        enabled: enabled,
        tactics: tactics,
        speed: speed
      })
    end

    {:noreply, socket}
  end

  # ══════════════════════════════════════════════════════════════════
  # DAMAGE PREVIEW
  # ══════════════════════════════════════════════════════════════════

  def handle("battle_preview", %{"target_id" => target_id} = payload, socket) do
    char_id = socket.assigns[:char_id]
    battle_id = socket.assigns[:battle_id]

    if char_id && battle_id && State.alive?(battle_id) do
      state = State.get_state(battle_id)

      if state.settings[:enable_damage_preview] do
        actor = Map.get(state.combatants, char_id)
        target = Map.get(state.combatants, to_int(target_id))
        skill_id = Map.get(payload, "skill_id")

        if actor && target do
          preview = calculate_damage_preview(state, actor, target, skill_id)

          push(socket, "battle_preview_result", %{
            target_id: target_id,
            estimated_min: preview.min,
            estimated_max: preview.max,
            crit_chance: preview.crit_chance,
            hit_chance: preview.hit_chance
          })
        end
      end
    end

    {:noreply, socket}
  end

  # ══════════════════════════════════════════════════════════════════
  # BRAVE / DEFAULT (Bravely Default-style turn banking)
  # ══════════════════════════════════════════════════════════════════

  def handle("battle_brave", payload, socket) do
    char_id = socket.assigns[:char_id]
    battle_id = socket.assigns[:battle_id]

    if char_id && battle_id && State.alive?(battle_id) do
      state = State.get_state(battle_id)
      combatant = Map.get(state.combatants, char_id)
      count = Map.get(payload, "count", 2)

      if combatant do
        # BraveDefault.resolve_brave/3 takes (state, combatant_id, count)
        # returns {:ok, new_state, result_map} or {:error, msg}
        case BraveDefault.resolve_brave(state, char_id, count) do
          {:ok, _new_state, result_map} ->
            # The new state was computed locally — persist via GenServer
            State.update_combatant(battle_id, char_id, fn c ->
              %{c | bp: result_map.bp}
            end)

            push(socket, "battle_brave_result", %{
              success: true,
              bp: result_map.bp,
              extra_actions: count - 1,
              message: result_map.message
            })

            client_state = Manager.get_client_state(battle_id)
            broadcast!(socket, "battle_update", client_state)

          {:error, reason} ->
            push(socket, "battle_brave_result", %{success: false, message: reason})
        end
      else
        push(socket, "battle_brave_result", %{success: false, message: "Combatant not found."})
      end
    end

    {:noreply, socket}
  end

  def handle("battle_default", _payload, socket) do
    char_id = socket.assigns[:char_id]
    battle_id = socket.assigns[:battle_id]

    if char_id && battle_id && State.alive?(battle_id) do
      state = State.get_state(battle_id)
      combatant = Map.get(state.combatants, char_id)

      if combatant do
        # BraveDefault.resolve_default/2 takes (state, combatant_id)
        # returns {:ok, new_state, result_map} or {:error, msg}
        case BraveDefault.resolve_default(state, char_id) do
          {:ok, _new_state, result_map} ->
            State.update_combatant(battle_id, char_id, fn c ->
              %{c | bp: result_map.bp, is_defaulting: true}
            end)

            push(socket, "battle_default_result", %{
              success: true,
              bp: result_map.bp,
              message: result_map.message
            })

            # Advance turn since Default ends your turn
            State.next_turn(battle_id)

            client_state = Manager.get_client_state(battle_id)
            broadcast!(socket, "battle_update", client_state)

          {:error, reason} ->
            push(socket, "battle_default_result", %{success: false, message: reason})
        end
      else
        push(socket, "battle_default_result", %{success: false, message: "Combatant not found."})
      end
    end

    {:noreply, socket}
  end

  # ══════════════════════════════════════════════════════════════════
  # PRIVATE
  # ══════════════════════════════════════════════════════════════════

  defp calculate_damage_preview(state, actor, target, skill_id) do
    # Use the real formula system for accurate preview
    vars = Combatant.formula_vars(actor, target)

    # Determine formula — skill formula if skill_id provided, else default ATK formula
    formula = if skill_id do
      case TePhoenix.Repo.query(
        "SELECT damage_formula FROM game_skills WHERE id=? LIMIT 1", [skill_id]
      ) do
        {:ok, %{rows: [[f]]}} when not is_nil(f) and f != "" -> f
        _ -> "ATK*2-DEF"
      end
    else
      "ATK*2-DEF"
    end

    base_damage = max(1, Formula.evaluate(formula, vars) |> trunc())

    # Variance: damage ranges from 85% to 115%
    min_dmg = max(1, trunc(base_damage * 0.85))
    max_dmg = max(1, trunc(base_damage * 1.15))

    # Crit chance from settings + luck differential
    base_crit = state.settings[:base_crit_chance] || 5
    luck_bonus = max(0, (actor.luck || 0) - (target.luck || 0))
    crit_chance = min(75, base_crit + luck_bonus)

    # Crit damage preview
    crit_mult = state.settings[:crit_multiplier] || 1.5
    max_with_crit = trunc(max_dmg * crit_mult)

    # Hit chance based on speed/luck differential
    speed_diff = (actor.speed || 0) - (target.speed || 0)
    hit_chance = min(99, max(30, 85 + div(speed_diff, 2)))

    # Account for target defense stance
    if target.default_defense == "dodge" do
      %{min: min_dmg, max: max_with_crit, crit_chance: crit_chance,
        hit_chance: max(30, hit_chance - 20)}
    else
      %{min: min_dmg, max: max_with_crit, crit_chance: crit_chance,
        hit_chance: hit_chance}
    end
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
