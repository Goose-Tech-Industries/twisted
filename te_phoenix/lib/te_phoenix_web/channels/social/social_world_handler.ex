defmodule TePhoenixWeb.Social.SocialWorldHandler do
  @moduledoc """
  World interaction handlers: bank, mounts, housing, creatures, cutscenes,
  NPC relationships, map editor.
  Ported from socket-social.js world/housing/map-editor sections.
  """

  import Phoenix.Channel
  import Phoenix.Socket, only: [assign: 3]

  alias TePhoenix.Game.{PlayerRegistry, MapData}
  alias TePhoenix.Repo

  @staff_roles ~w(ADMIN GM MOD STAFF OWNER)

  # ── Bank ─────────────────────────────────────────────────────────

  def handle("bank_deposit", %{"itemId" => item_id, "quantity" => quantity}, socket) do
    char_id = get_char_id(socket)
    qty = max(1, quantity || 1)

    result = try do
      case Repo.query("SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=? AND quantity>=?", [char_id, item_id, qty]) do
        {:ok, %{rows: [[inv_id, inv_qty]]}} ->
          if inv_qty <= qty, do: Repo.query!("DELETE FROM character_items WHERE id=?", [inv_id]),
            else: Repo.query!("UPDATE character_items SET quantity=quantity-? WHERE id=?", [qty, inv_id])

          Repo.query!("INSERT INTO character_bank (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+?",
            [char_id, item_id, qty, qty])
          %{success: true, message: "Deposited #{qty} item(s)."}

        _ -> %{success: false, message: "Item not found in inventory."}
      end
    rescue
      e -> %{success: false, message: Exception.message(e)}
    end

    push(socket, "bank_result", result)
    {:noreply, socket}
  end

  def handle("bank_withdraw", %{"itemId" => item_id, "quantity" => quantity}, socket) do
    char_id = get_char_id(socket)
    qty = max(1, quantity || 1)

    result = try do
      case Repo.query("SELECT id, quantity FROM character_bank WHERE character_id=? AND item_id=? AND quantity>=?", [char_id, item_id, qty]) do
        {:ok, %{rows: [[bank_id, bank_qty]]}} ->
          if bank_qty <= qty, do: Repo.query!("DELETE FROM character_bank WHERE id=?", [bank_id]),
            else: Repo.query!("UPDATE character_bank SET quantity=quantity-? WHERE id=?", [qty, bank_id])

          Repo.query!("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+?",
            [char_id, item_id, qty, qty])
          %{success: true, message: "Withdrew #{qty} item(s)."}

        _ -> %{success: false, message: "Item not found in bank."}
      end
    rescue
      e -> %{success: false, message: Exception.message(e)}
    end

    push(socket, "bank_result", result)
    {:noreply, socket}
  end

  # ── Creature Capture ─────────────────────────────────────────────

  def handle("capture_creature", %{"npcId" => npc_id}, socket) do
    char_id = get_char_id(socket)
    p = PlayerRegistry.get(char_id)
    if is_nil(p), do: {:noreply, socket}

    result = try do
      case Repo.query("SELECT id, name, is_capturable, capture_rate FROM game_npcs WHERE id=? AND map_id=?", [npc_id, p.map_id]) do
        {:ok, %{rows: [[_id, name, capturable, rate]]}} ->
          if capturable != 1 do
            %{success: false, message: "#{name} cannot be captured."}
          else
            # Roll capture
            capture_rate = rate || 30
            if :rand.uniform(100) <= capture_rate do
              Repo.query!("INSERT INTO character_creatures (character_id, npc_id, captured_at) VALUES (?,?,NOW()) ON DUPLICATE KEY UPDATE captured_at=NOW()",
                [char_id, npc_id])
              # Remove NPC from map
              Repo.query("UPDATE game_npcs SET is_active=0 WHERE id=?", [npc_id])
              MapData.invalidate(p.map_id)
              TePhoenixWeb.Endpoint.broadcast!("map:#{p.map_id}", "npc_removed", %{npcId: npc_id})
              %{success: true, message: "Captured #{name}!"}
            else
              %{success: false, message: "#{name} broke free!"}
            end
          end
        _ -> %{success: false, message: "Creature not found."}
      end
    rescue
      e -> %{success: false, message: Exception.message(e)}
    end

    push(socket, "capture_result", result)
    {:noreply, socket}
  end

  # ── Mount Toggle ─────────────────────────────────────────────────

  def handle("mount_toggle", %{"mountId" => mount_id}, socket) do
    char_id = get_char_id(socket)

    try do
      # Deactivate all mounts first
      Repo.query!("UPDATE character_mounts SET is_active=0 WHERE character_id=?", [char_id])

      if mount_id do
        Repo.query!("UPDATE character_mounts SET is_active=1 WHERE character_id=? AND mount_id=?", [char_id, mount_id])

        # Update speed multiplier in registry
        case Repo.query("SELECT speed_mult FROM game_mounts WHERE id=?", [mount_id]) do
          {:ok, %{rows: [[mult]]}} ->
            PlayerRegistry.update(char_id, %{mount_speed_mult: mult || 1.0})
          _ -> nil
        end

        push(socket, "mount_toggled", %{mountId: mount_id, active: true})
      else
        PlayerRegistry.update(char_id, %{mount_speed_mult: 1.0})
        push(socket, "mount_toggled", %{mountId: nil, active: false})
      end
    rescue
      _ -> push(socket, "notification", %{type: "error", message: "Mount failed."})
    end

    {:noreply, socket}
  end

  # ── Housing ──────────────────────────────────────────────────────

  def handle("housing_purchase", %{"housingId" => housing_id}, socket) do
    char_id = get_char_id(socket)
    p = PlayerRegistry.get(char_id)
    if is_nil(p), do: {:noreply, socket}

    result = try do
      case Repo.query("SELECT name, cost, map_id FROM game_housing WHERE id=? AND is_available=1", [housing_id]) do
        {:ok, %{rows: [[name, cost, _map_id]]}} ->
          case Repo.query("SELECT currency FROM users WHERE id=?", [p.user_id]) do
            {:ok, %{rows: [[currency]]}} when currency >= cost ->
              Repo.query!("UPDATE users SET currency=currency-? WHERE id=?", [cost, p.user_id])
              Repo.query!("INSERT INTO character_housing (character_id, housing_id, purchased_at) VALUES (?,?,NOW())", [char_id, housing_id])
              Repo.query!("UPDATE game_housing SET is_available=0, owner_id=? WHERE id=?", [char_id, housing_id])
              %{success: true, message: "Purchased #{name} for #{cost} gold!"}
            _ -> %{success: false, message: "Not enough gold."}
          end
        _ -> %{success: false, message: "Property not found or already sold."}
      end
    rescue
      e -> %{success: false, message: Exception.message(e)}
    end

    push(socket, "housing_result", result)
    {:noreply, socket}
  end

  def handle("housing_place_furniture", %{"housingId" => housing_id, "itemId" => item_id, "x" => x, "y" => y}, socket) do
    char_id = get_char_id(socket)

    result = try do
      # Verify ownership
      case Repo.query("SELECT id FROM character_housing WHERE character_id=? AND housing_id=?", [char_id, housing_id]) do
        {:ok, %{rows: [_]}} ->
          # Verify item in inventory
          case Repo.query("SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=?", [char_id, item_id]) do
            {:ok, %{rows: [[inv_id, qty]]}} ->
              if qty <= 1, do: Repo.query!("DELETE FROM character_items WHERE id=?", [inv_id]),
                else: Repo.query!("UPDATE character_items SET quantity=quantity-1 WHERE id=?", [inv_id])

              Repo.query!("INSERT INTO character_housing_furniture (housing_id, item_id, x, y) VALUES (?,?,?,?)",
                [housing_id, item_id, x, y])
              %{success: true, message: "Furniture placed!"}

            _ -> %{success: false, message: "Item not in inventory."}
          end
        _ -> %{success: false, message: "Not your property."}
      end
    rescue
      e -> %{success: false, message: Exception.message(e)}
    end

    push(socket, "housing_result", result)
    {:noreply, socket}
  end

  # ── Cutscene Trigger ─────────────────────────────────────────────

  def handle("trigger_cutscene", %{"cutsceneId" => cutscene_id}, socket) do
    p = PlayerRegistry.get(get_char_id(socket))
    if is_nil(p), do: {:noreply, socket}

    case Repo.query("SELECT script_json FROM game_cutscenes WHERE id=? AND is_active=1", [cutscene_id]) do
      {:ok, %{rows: [[script_json]]}} ->
        script = case Jason.decode(to_string(script_json || "[]")) do
          {:ok, s} when is_list(s) -> s
          _ -> []
        end
        push(socket, "cutscene_start", %{cutsceneId: cutscene_id, script: script})
      _ -> nil
    end

    {:noreply, socket}
  end

  # ── NPC Relationships ────────────────────────────────────────────

  def handle("npc_get_relationships", _payload, socket) do
    char_id = get_char_id(socket)

    relationships = case Repo.query(
      "SELECT npc_name, reputation, facts_json, last_seen FROM npc_memories WHERE char_id=? ORDER BY last_seen DESC",
      [char_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    push(socket, "npc_relationships", %{relationships: relationships})
    {:noreply, socket}
  end

  # ── Interact Object (social context) ─────────────────────────────

  def handle("interact_object", payload, socket) do
    p = PlayerRegistry.get(get_char_id(socket))
    if is_nil(p), do: {:noreply, socket}

    obj_idx = payload["objectIndex"]
    action = payload["action"] || "toggle"

    current = case Repo.query("SELECT state_key FROM game_map_object_state WHERE map_id=? AND object_index=?", [p.map_id, obj_idx]) do
      {:ok, %{rows: [[s]]}} -> s
      _ -> "default"
    end

    new_state = case action do
      "push" -> "pushed"
      "toggle" -> if current == "default", do: "active", else: "default"
      "open" -> "open"
      "light" -> if current == "lit", do: "unlit", else: "lit"
      _ -> current
    end

    try do
      Repo.query!("INSERT INTO game_map_object_state (map_id, object_index, state_key, changed_by) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE state_key=VALUES(state_key), changed_by=VALUES(changed_by)",
        [p.map_id, obj_idx, new_state, p.char_id])
    rescue _ -> nil end

    TePhoenixWeb.Endpoint.broadcast!("map:#{p.map_id}", "object_state_change", %{
      objectIndex: obj_idx, state: new_state, changedBy: p.name
    })

    push(socket, "interact_result", %{success: true, objectIndex: obj_idx, state: new_state})
    {:noreply, socket}
  end

  # ── Collaborative Map Editor ─────────────────────────────────────

  def handle("map_editor_join", %{"mapId" => map_id}, socket) do
    p = PlayerRegistry.get(get_char_id(socket))
    if is_nil(p) or String.upcase(p.role || "") not in @staff_roles, do: {:noreply, socket}

    socket = assign(socket, :editing_map_id, map_id)
    TePhoenixWeb.Endpoint.subscribe("map_edit:#{map_id}")

    TePhoenixWeb.Endpoint.broadcast!("map_edit:#{map_id}", "map_editor_presence", %{
      charId: p.char_id, name: p.name, action: "joined"
    })

    {:noreply, socket}
  end

  def handle("map_editor_leave", _payload, socket) do
    map_id = socket.assigns[:editing_map_id]
    if map_id do
      p = PlayerRegistry.get(get_char_id(socket))
      TePhoenixWeb.Endpoint.unsubscribe("map_edit:#{map_id}")
      if p do
        TePhoenixWeb.Endpoint.broadcast!("map_edit:#{map_id}", "map_editor_presence", %{
          charId: p.char_id, name: p.name, action: "left"
        })
      end
      _socket = assign(socket, :editing_map_id, nil)
    end
    {:noreply, socket}
  end

  def handle("map_editor_cursor", payload, socket) do
    map_id = socket.assigns[:editing_map_id]
    if map_id do
      p = PlayerRegistry.get(get_char_id(socket))
      if p do
        TePhoenixWeb.Endpoint.broadcast!("map_edit:#{map_id}", "map_editor_cursor", %{
          charId: p.char_id, name: p.name, x: payload["x"], y: payload["y"]
        })
      end
    end
    {:noreply, socket}
  end

  def handle("map_editor_tile_change", payload, socket) do
    map_id = socket.assigns[:editing_map_id]
    if map_id do
      TePhoenixWeb.Endpoint.broadcast!("map_edit:#{map_id}", "map_editor_tile_change", payload)
      MapData.invalidate(parse_int(map_id))
    end
    {:noreply, socket}
  end

  def handle("map_editor_event_change", payload, socket) do
    map_id = socket.assigns[:editing_map_id]
    if map_id do
      TePhoenixWeb.Endpoint.broadcast!("map_edit:#{map_id}", "map_editor_event_change", payload)
      MapData.invalidate(parse_int(map_id))
    end
    {:noreply, socket}
  end

  def handle("map_editor_object_change", payload, socket) do
    map_id = socket.assigns[:editing_map_id]
    if map_id do
      TePhoenixWeb.Endpoint.broadcast!("map_edit:#{map_id}", "map_editor_object_change", payload)
      MapData.invalidate(parse_int(map_id))
    end
    {:noreply, socket}
  end

  def handle(_, _, socket), do: {:noreply, socket}

  # ── Private ─────────────────────────────────────────────────────

  defp get_char_id(socket) do
    socket.assigns[:char_id] ||
      case Repo.query("SELECT id FROM characters WHERE user_id=? LIMIT 1", [socket.assigns.user_id]) do
        {:ok, %{rows: [[id]]}} -> id
        _ -> nil
      end
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
