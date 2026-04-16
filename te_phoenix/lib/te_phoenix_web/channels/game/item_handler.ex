defmodule TePhoenixWeb.Game.ItemHandler do
  @moduledoc """
  Item & equipment handlers: equip, unequip, drop, pickup, capsules, abilities.
  Ported from socket-game.js equipment/ground items/capsules/abilities sections.
  """

  import Phoenix.Channel
  require Logger

  alias TePhoenix.Game.{PlayerRegistry, MapData}
  alias TePhoenix.{Repo, EventRunner}

  def handle("equip_item", %{"itemId" => item_id, "slotKey" => slot_key}, socket) do
    char_id = socket.assigns[:char_id]
    p = PlayerRegistry.get(char_id)
    if is_nil(p), do: {:noreply, socket}

    result = try do
      # Verify player owns the item
      case Repo.query("SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=?", [char_id, item_id]) do
        {:ok, %{rows: [[inv_id, qty]]}} ->
          # Check item exists and slot matches
          case Repo.query("SELECT slot FROM game_items WHERE id=?", [item_id]) do
            {:ok, %{rows: [[slot]]}} ->
              if slot != slot_key and slot != "ANY" do
                %{success: false, message: "Goes in #{slot}."}
              else
                # Unequip current item in that slot
                case Repo.query("SELECT item_id FROM character_equipment WHERE character_id=? AND slot_key=?", [char_id, slot_key]) do
                  {:ok, %{rows: [[old_item_id]]}} ->
                    # Return old item to inventory
                    Repo.query!("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1", [char_id, old_item_id])
                    Repo.query!("DELETE FROM character_equipment WHERE character_id=? AND slot_key=?", [char_id, slot_key])
                  _ -> nil
                end

                # Equip new item
                Repo.query!("INSERT INTO character_equipment (character_id, slot_key, item_id) VALUES (?,?,?)", [char_id, slot_key, item_id])
                if qty > 1 do
                  Repo.query!("UPDATE character_items SET quantity=quantity-1 WHERE id=?", [inv_id])
                else
                  Repo.query!("DELETE FROM character_items WHERE id=?", [inv_id])
                end
                %{success: true, message: "Equipped!"}
              end
            _ -> %{success: false, message: "Item not found."}
          end
        _ -> %{success: false, message: "Not in inventory."}
      end
    rescue
      _ -> %{success: false, message: "Error"}
    end

    push(socket, "equip_result", result)
    {:noreply, socket}
  end

  def handle("unequip_item", %{"slotKey" => slot_key}, socket) do
    char_id = socket.assigns[:char_id]

    result = try do
      case Repo.query("SELECT item_id FROM character_equipment WHERE character_id=? AND slot_key=?", [char_id, slot_key]) do
        {:ok, %{rows: [[item_id]]}} ->
          Repo.query!("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1", [char_id, item_id])
          Repo.query!("DELETE FROM character_equipment WHERE character_id=? AND slot_key=?", [char_id, slot_key])
          %{success: true, message: "Unequipped."}
        _ -> %{success: false, message: "Nothing there."}
      end
    rescue
      _ -> %{success: false, message: "Error"}
    end

    push(socket, "equip_result", result)
    {:noreply, socket}
  end

  def handle("get_ground_items", _payload, socket) do
    char_id = socket.assigns[:char_id]
    p = PlayerRegistry.get(char_id)
    if p, do: send_ground_items(socket, p.map_id, char_id)
    {:noreply, socket}
  end

  def handle("drop_item", %{"itemId" => item_id} = payload, socket) do
    char_id = socket.assigns[:char_id]
    p = PlayerRegistry.get(char_id)
    if is_nil(p), do: {:noreply, socket}

    qty = max(1, parse_int(payload["quantity"] || 1))

    try do
      # Verify ownership
      case Repo.query("SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=? AND quantity>=?", [char_id, item_id, qty]) do
        {:ok, %{rows: [[inv_id, inv_qty]]}} ->
          # Remove from inventory
          if inv_qty <= qty do
            Repo.query!("DELETE FROM character_items WHERE id=?", [inv_id])
          else
            Repo.query!("UPDATE character_items SET quantity=quantity-? WHERE id=?", [qty, inv_id])
          end

          # Place on ground (expires in 10 min)
          {:ok, result} = Repo.query(
            "INSERT INTO game_map_ground_items (map_id, x, y, item_id, quantity, dropped_by, expires_at) VALUES (?,?,?,?,?,?,DATE_ADD(NOW(), INTERVAL 10 MINUTE))",
            [p.map_id, p.x, p.y, item_id, qty, char_id]
          )

          # Get item name for broadcast
          item_name = case Repo.query("SELECT name, icon FROM game_items WHERE id=?", [item_id]) do
            {:ok, %{rows: [[name, _icon]]}} -> name
            _ -> "Item"
          end

          TePhoenixWeb.Endpoint.broadcast!("map:#{p.map_id}", "ground_item_added", %{
            id: result.last_insert_id, x: p.x, y: p.y,
            item_id: item_id, quantity: qty, name: item_name
          })

          push(socket, "notification", %{type: "info", message: "Dropped #{item_name} x#{qty}"})

        _ ->
          push(socket, "notification", %{type: "error", message: "Item not found in inventory."})
      end
    rescue
      _ -> push(socket, "notification", %{type: "error", message: "Failed to drop item."})
    end

    {:noreply, socket}
  end

  def handle("pickup_item", %{"groundItemId" => ground_item_id}, socket) do
    char_id = socket.assigns[:char_id]
    p = PlayerRegistry.get(char_id)
    if is_nil(p), do: {:noreply, socket}

    try do
      case Repo.query(
        "SELECT g.id, g.item_id, g.quantity, g.x, g.y, g.is_instanced, g.instance_for, i.name, i.icon FROM game_map_ground_items g JOIN game_items i ON i.id=g.item_id WHERE g.id=? AND g.map_id=? AND (g.expires_at IS NULL OR g.expires_at > NOW())",
        [ground_item_id, p.map_id]
      ) do
        {:ok, %{rows: [[_id, item_id, qty, gx, gy, is_inst, inst_for, name, icon]]}} ->
          # Range check
          if abs(gx - p.x) > 1 or abs(gy - p.y) > 1 do
            push(socket, "notification", %{type: "error", message: "Too far away."})
          else
            if is_inst == 1 and inst_for != char_id do
              push(socket, "notification", %{type: "error", message: "This item is not for you."})
            else
              # Add to inventory
              Repo.query!("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+?",
                [char_id, item_id, qty, qty])
              Repo.query!("DELETE FROM game_map_ground_items WHERE id=?", [ground_item_id])

              TePhoenixWeb.Endpoint.broadcast!("map:#{p.map_id}", "ground_item_removed", %{id: ground_item_id})
              push(socket, "notification", %{type: "success", message: "Picked up #{icon || ""} #{name} x#{qty}"})
            end
          end

        _ ->
          push(socket, "notification", %{type: "error", message: "Item no longer there."})
      end
    rescue
      _ -> push(socket, "notification", %{type: "error", message: "Failed to pick up item."})
    end

    {:noreply, socket}
  end

  def handle("use_item_on_map", %{"itemId" => _item_id}, socket) do
    char_id = socket.assigns[:char_id]
    p = PlayerRegistry.get(char_id)
    if is_nil(p), do: {:noreply, socket}

    map_data = MapData.get(p.map_id)
    if is_nil(map_data), do: {:noreply, socket}

    events = map_data.events || []
    item_use_events = Enum.filter(events, fn e ->
      is_map(e) and e["trigger"] == "ITEM_USE" and e["x"] == p.x and e["y"] == p.y
    end)

    if item_use_events == [] do
      push(socket, "notification", %{type: "info", message: "Nothing happens here."})
    else
      char_state = load_char_state(char_id)
      actions = Enum.flat_map(item_use_events, fn e -> e["actions"] || [] end)
      case EventRunner.execute(actions, char_id, char_state) do
        {:ok, responses} -> Enum.each(responses, fn r -> push(socket, "event_action", r) end)
        _ -> nil
      end
    end

    {:noreply, socket}
  end

  def handle("use_capsule", %{"itemId" => item_id}, socket) do
    char_id = socket.assigns[:char_id]
    p = PlayerRegistry.get(char_id)
    if is_nil(p), do: {:noreply, socket}

    try do
      # Verify ownership
      case Repo.query("SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=? AND quantity>=1", [char_id, item_id]) do
        {:ok, %{rows: [[inv_id, inv_qty]]}} ->
          # Load capsule config
          case Repo.query("SELECT * FROM game_capsule_items WHERE item_id=?", [item_id]) do
            {:ok, %{rows: [row], columns: cols}} ->
              capsule = Enum.zip(cols, row) |> Map.new()

              # Consume unless reusable
              if capsule["is_reusable"] != 1 do
                if inv_qty <= 1, do: Repo.query!("DELETE FROM character_items WHERE id=?", [inv_id]),
                  else: Repo.query!("UPDATE character_items SET quantity=quantity-1 WHERE id=?", [inv_id])
              end

              execute_capsule(socket, p, char_id, capsule, item_id)

            _ -> push(socket, "notification", %{type: "error", message: "Not a capsule item."})
          end
        _ -> push(socket, "notification", %{type: "error", message: "Capsule not found."})
      end
    rescue
      _e -> push(socket, "notification", %{type: "error", message: "Capsule failed."})
    end

    {:noreply, socket}
  end

  def handle("use_ability", %{"abilityType" => ability_type}, socket) do
    char_id = socket.assigns[:char_id]

    try do
      case Repo.query("SELECT ability_name, status_id FROM character_abilities WHERE character_id=? AND ability_type=?", [char_id, ability_type]) do
        {:ok, %{rows: [[ability_name, status_id]]}} when not is_nil(status_id) ->
          # Toggle: check if already active
          case Repo.query("SELECT id FROM character_status_effects WHERE character_id=? AND status_id=?", [char_id, status_id]) do
            {:ok, %{rows: [_]}} ->
              # Deactivate
              Repo.query!("DELETE FROM character_status_effects WHERE character_id=? AND status_id=?", [char_id, status_id])
              push(socket, "notification", %{type: "info", message: "#{ability_name} deactivated."})

            _ ->
              # Activate
              {expires, _} = case Repo.query("SELECT default_duration, permanent FROM game_statuses WHERE id=?", [status_id]) do
                {:ok, %{rows: [[dur, perm]]}} -> {if(perm == 1, do: nil, else: dur || 10), perm}
                _ -> {10, nil}
              end

              Repo.query!(
                "INSERT INTO character_status_effects (character_id, status_id, source, expires_at) VALUES (?,?,'ability',#{if expires, do: "DATE_ADD(NOW(), INTERVAL ? MINUTE)", else: "NULL"}) ON DUPLICATE KEY UPDATE expires_at=VALUES(expires_at)",
                if(expires, do: [char_id, status_id, expires], else: [char_id, status_id])
              )
              push(socket, "notification", %{type: "success", message: "#{ability_name} activated!"})
          end

          # Resend active statuses
          send_active_statuses(socket, char_id)

        {:ok, %{rows: [[ability_name, _]]}} ->
          push(socket, "notification", %{type: "info", message: "#{ability_name} — passive ability."})

        _ ->
          push(socket, "notification", %{type: "error", message: "You haven't learned this ability."})
      end
    rescue
      _ -> push(socket, "notification", %{type: "error", message: "Ability failed."})
    end

    {:noreply, socket}
  end

  def handle("get_abilities", _payload, socket) do
    char_id = socket.assigns[:char_id]
    case Repo.query("SELECT * FROM character_abilities WHERE character_id=?", [char_id]) do
      {:ok, %{rows: rows, columns: cols}} ->
        abilities = Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
        push(socket, "abilities_list", abilities)
      _ -> push(socket, "abilities_list", [])
    end
    {:noreply, socket}
  end

  # ── Private ─────────────────────────────────────────────────────

  defp execute_capsule(socket, p, char_id, capsule, item_id) do
    case capsule["capsule_type"] do
      "TRANSPORT" ->
        target_map = capsule["target_map_id"]
        if target_map do
          # Teleport via user notification — client will emit teleport
          push(socket, "event_action", %{cmd: "teleport", map_id: target_map,
            x: capsule["target_x"] || 5, y: capsule["target_y"] || 5})
          TePhoenixWeb.Endpoint.broadcast!("map:#{p.map_id}", "map_particle",
            %{preset: "warp", x: p.x, y: p.y})
          item_name = get_item_name(item_id)
          push(socket, "notification", %{type: "success", message: "#{item_name} activated!"})
        end

      "STRUCTURE" ->
        struct_x = p.x + (capsule["deploy_offset_x"] || 0)
        struct_y = p.y + (capsule["deploy_offset_y"] || 1)
        base_struct_name = capsule["structure_name"] || "Structure"
        base_struct_icon = capsule["structure_icon"] || "🏠"
        base_interior_map = capsule["interior_map_id"]

        # Check template
        {struct_name, struct_icon, interior_map} = if capsule["template_id"] do
          case Repo.query("SELECT name, icon, interior_map_id, default_data_json FROM game_structure_templates WHERE id=? AND is_active=1", [capsule["template_id"]]) do
            {:ok, %{rows: [[tname, ticon, tmap, _tdata]]}} ->
              {base_struct_name || tname, capsule["structure_icon"] || ticon || "🏠", base_interior_map || tmap}
            _ ->
              {base_struct_name, base_struct_icon, base_interior_map}
          end
        else
          {base_struct_name, base_struct_icon, base_interior_map}
        end

        {:ok, result} = Repo.query(
          "INSERT INTO game_deployed_structures (map_id, x, y, capsule_id, owner_id, name, icon, interior_map_id, deployed_at, is_active) VALUES (?,?,?,?,?,?,?,?,NOW(),1)",
          [p.map_id, struct_x, struct_y, capsule["id"], char_id, struct_name, struct_icon, interior_map]
        )

        TePhoenixWeb.Endpoint.broadcast!("map:#{p.map_id}", "structure_deployed", %{
          id: result.last_insert_id, x: struct_x, y: struct_y,
          name: struct_name, icon: struct_icon, ownerId: char_id
        })
        push(socket, "notification", %{type: "success", message: "Deployed #{struct_name}!"})

      "SPAWN" ->
        if capsule["spawn_npc_id"] do
          Repo.query("UPDATE game_npcs SET map_id=?, x=?, y=? WHERE id=?",
            [p.map_id, p.x, p.y + 1, capsule["spawn_npc_id"]])
          TePhoenixWeb.Endpoint.broadcast!("map:#{p.map_id}", "npc_arrived", %{
            npcId: capsule["spawn_npc_id"], x: p.x, y: p.y + 1
          })
        end
        push(socket, "notification", %{type: "success", message: "Capsule deployed!"})

      _ ->
        push(socket, "notification", %{type: "error", message: "Unknown capsule type."})
    end
  end

  defp send_ground_items(socket, map_id, char_id) do
    case Repo.query(
      "SELECT g.id, g.x, g.y, g.quantity, g.item_id, g.is_instanced, g.instance_for, i.name, i.icon, i.rarity FROM game_map_ground_items g JOIN game_items i ON i.id=g.item_id WHERE g.map_id=? AND (g.expires_at IS NULL OR g.expires_at > NOW())",
      [map_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        items = rows
          |> Enum.map(fn row -> Enum.zip(cols, row) |> Map.new() end)
          |> Enum.filter(fn it -> it["is_instanced"] != 1 or it["instance_for"] == char_id end)
        push(socket, "ground_items", items)
      _ -> nil
    end
  end

  defp send_active_statuses(socket, char_id) do
    case Repo.query(
      "SELECT s.id, s.name, s.icon, s.type, s.effects FROM character_status_effects cse JOIN game_statuses s ON s.id=cse.status_id WHERE cse.character_id=? AND (cse.expires_at IS NULL OR cse.expires_at > NOW())",
      [char_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        statuses = Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() |> Map.take(["id", "name", "icon", "type"]) end)
        push(socket, "active_statuses", statuses)

        ow_fx = Enum.reduce(rows, %{}, fn row, acc ->
          data = Enum.zip(cols, row) |> Map.new()
          fx = parse_json(data["effects"], %{})
          Map.merge(acc, fx)
        end)
        push(socket, "overworld_effects", ow_fx)
      _ -> nil
    end
  end

  defp get_item_name(item_id) do
    case Repo.query("SELECT name FROM game_items WHERE id=?", [item_id]) do
      {:ok, %{rows: [[name]]}} -> name
      _ -> "Item"
    end
  end

  defp load_char_state(char_id) do
    case Repo.query("SELECT state_json FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[json]]}} -> parse_json(json, %{})
      _ -> %{}
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

  defp parse_json(nil, d), do: d
  defp parse_json("", d), do: d
  defp parse_json(v, d) when is_binary(v) do
    case Jason.decode(v) do
      {:ok, p} -> p
      _ -> d
    end
  end
  defp parse_json(v, _) when is_map(v) or is_list(v), do: v
  defp parse_json(_, d), do: d
end
