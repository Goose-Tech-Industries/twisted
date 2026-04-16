defmodule TePhoenixWeb.Game.CharacterHandler do
  @moduledoc """
  Character management: respawn, rest, AP distribution, tutorial, preferences, fog.
  Ported from socket-game.js character sections.
  """

  import Phoenix.Channel

  alias TePhoenix.Game.PlayerRegistry
  alias TePhoenix.Repo

  def handle("request_respawn", _payload, socket) do
    char_id = socket.assigns[:char_id]
    p = PlayerRegistry.get(char_id)
    if is_nil(p), do: {:noreply, socket}

    case Repo.query("SELECT max_hp, respawn_map_id, respawn_x, respawn_y FROM characters WHERE id=?", [char_id]) do
      {:ok, %{rows: [[max_hp, rmap, rx, ry]]}} ->
        respawn_hp = max(1, trunc((max_hp || 100) * 0.20))
        respawn_map = rmap || 1
        respawn_x = rx || 10
        respawn_y = ry || 10

        Repo.query!("UPDATE characters SET current_hp=?, map_id=?, x=?, y=? WHERE id=?",
          [respawn_hp, respawn_map, respawn_x, respawn_y, char_id])

        # Leave old map, join new
        TePhoenixWeb.Endpoint.broadcast!("map:#{p.map_id}", "player_left", %{char_id: char_id})
        TePhoenixWeb.Endpoint.unsubscribe("map:#{p.map_id}")

        PlayerRegistry.update(char_id, %{map_id: respawn_map, x: respawn_x, y: respawn_y})
        TePhoenixWeb.Endpoint.subscribe("map:#{respawn_map}")

        push(socket, "respawn_complete", %{
          mapId: respawn_map, x: respawn_x, y: respawn_y, hp: respawn_hp
        })

      _ -> nil
    end

    {:noreply, socket}
  end

  def handle("short_rest", _payload, socket) do
    char_id = socket.assigns[:char_id]

    try do
      case Repo.query("SELECT current_hp, max_hp, def, level FROM characters WHERE id=?", [char_id]) do
        {:ok, %{rows: [[cur_hp, max_hp, defense, level]]}} ->
          # Short rest: heal based on hit dice (level * d8 + DEF modifier)
          hit_dice_size = 8
          rolls = for _ <- 1..min(level || 1, 5), do: :rand.uniform(hit_dice_size) + div(defense || 0, 4)
          heal = Enum.sum(rolls)
          new_hp = min(max_hp, cur_hp + heal)
          Repo.query!("UPDATE characters SET current_hp=? WHERE id=?", [new_hp, char_id])
          push(socket, "notification", %{type: "success", message: "Short rest: healed #{heal} HP. (#{new_hp}/#{max_hp})"})

        _ -> push(socket, "notification", %{type: "error", message: "Rest failed."})
      end
    rescue
      _ -> push(socket, "notification", %{type: "error", message: "Rest failed."})
    end

    {:noreply, socket}
  end

  def handle("long_rest", _payload, socket) do
    char_id = socket.assigns[:char_id]

    try do
      Repo.query!("UPDATE characters SET current_hp=max_hp, current_mp=max_mp WHERE id=?", [char_id])
      push(socket, "notification", %{type: "success", message: "Long rest: fully restored!"})
    rescue
      _ -> push(socket, "notification", %{type: "error", message: "Rest failed."})
    end

    {:noreply, socket}
  end

  def handle("rest_at_inn", payload, socket) do
    char_id = socket.assigns[:char_id]
    p = PlayerRegistry.get(char_id)
    if is_nil(p), do: {:noreply, socket}

    inn_id = payload["innId"] || 1

    try do
      case Repo.query("SELECT name, cost_per_rest, heal_hp_pct, heal_mp_pct FROM game_inns WHERE id=? AND is_active=1", [inn_id]) do
        {:ok, %{rows: [[name, cost, hp_pct, mp_pct]]}} ->
          # Check currency
          case Repo.query("SELECT currency FROM users WHERE id=?", [p.user_id]) do
            {:ok, %{rows: [[currency]]}} when currency >= cost ->
              Repo.query!("UPDATE users SET currency=currency-? WHERE id=?", [cost, p.user_id])
              heal_hp = hp_pct || 1.0
              heal_mp = mp_pct || 1.0
              Repo.query!("UPDATE characters SET current_hp=FLOOR(max_hp*?), current_mp=FLOOR(max_mp*?) WHERE id=?", [heal_hp, heal_mp, char_id])

              push(socket, "rest_result", %{success: true, message: "Rested at #{name}. HP and MP restored! (-#{cost} gold)", cost: cost})
              push(socket, "event_queue", [
                %{cmd: "dialogue", speaker: "Innkeeper", text: "Welcome! Rest well, traveler. That'll be #{cost} gold."},
                %{cmd: "dialogue", speaker: "System", text: "HP and MP fully restored."}
              ])

            _ ->
              push(socket, "rest_result", %{success: false, message: "Not enough gold. Need #{cost}."})
          end

        _ -> push(socket, "rest_result", %{success: false, message: "Inn not found"})
      end
    rescue
      e -> push(socket, "rest_result", %{success: false, message: Exception.message(e)})
    end

    {:noreply, socket}
  end

  def handle("distribute_ap", %{"stat" => stat, "points" => points}, socket) do
    char_id = socket.assigns[:char_id]
    valid_stats = ~w(strength defense magic_offense magic_defense speed luck max_hp max_mp)

    cond do
      stat not in valid_stats ->
        push(socket, "ap_result", %{success: false, message: "Invalid stat."})

      not is_integer(points) or points < 1 or points > 50 ->
        push(socket, "ap_result", %{success: false, message: "Invalid points (1-50)."})

      true ->
        try do
          # Check available AP
          case Repo.query("SELECT unspent_ap FROM characters WHERE id=?", [char_id]) do
            {:ok, %{rows: [[ap]]}} when ap >= points ->
              mult = if stat in ["max_hp", "max_mp"], do: 5, else: 1
              gain = points * mult

              Repo.query!("UPDATE characters SET unspent_ap=unspent_ap-?, #{stat}=#{stat}+? WHERE id=?", [points, gain, char_id])

              # If HP/MP increased, heal current too
              if stat == "max_hp", do: Repo.query!("UPDATE characters SET current_hp=current_hp+? WHERE id=?", [gain, char_id])
              if stat == "max_mp", do: Repo.query!("UPDATE characters SET current_mp=current_mp+? WHERE id=?", [gain, char_id])

              push(socket, "ap_result", %{success: true, stat: stat, points: points, message: "+#{gain} #{stat}"})

            _ ->
              push(socket, "ap_result", %{success: false, message: "Not enough AP"})
          end
        rescue
          e -> push(socket, "ap_result", %{success: false, message: Exception.message(e)})
        end
    end

    {:noreply, socket}
  end

  def handle("tutorial_complete", _payload, socket) do
    char_id = socket.assigns[:char_id]

    try do
      case Repo.query("SELECT state_json FROM characters WHERE id=?", [char_id]) do
        {:ok, %{rows: [[json]]}} ->
          state = case Jason.decode(to_string(json || "{}")) do {:ok, s} -> s; _ -> %{} end
          state = Map.put(state, "tutorial_done", true)
          Repo.query!("UPDATE characters SET state_json=? WHERE id=?", [Jason.encode!(state), char_id])
        _ -> nil
      end
    rescue
      _ -> nil
    end

    {:noreply, socket}
  end

  def handle("get_preferences", _payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p), do: {:noreply, socket}

    prefs = case Repo.query("SELECT preferences_json FROM users WHERE id=?", [p.user_id]) do
      {:ok, %{rows: [[json]]}} when not is_nil(json) ->
        case Jason.decode(to_string(json)) do {:ok, p} -> p; _ -> %{} end
      _ -> %{}
    end

    push(socket, "preferences", prefs)
    {:noreply, socket}
  end

  def handle("save_preferences", payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if p && is_map(payload) do
      try do
        Repo.query!("UPDATE users SET preferences_json=? WHERE id=?", [Jason.encode!(payload), p.user_id])
      rescue _ -> nil
      end
    end
    {:noreply, socket}
  end

  def handle("get_fog_exploration", %{"mapId" => map_id}, socket) do
    char_id = socket.assigns[:char_id]

    tiles = case Repo.query(
      "SELECT explored_tiles FROM character_map_exploration WHERE character_id=? AND map_id=?",
      [char_id, map_id]
    ) do
      {:ok, %{rows: [[json]]}} when not is_nil(json) ->
        case Jason.decode(to_string(json)) do {:ok, t} -> t; _ -> [] end
      _ -> []
    end

    push(socket, "fog_exploration", %{mapId: map_id, tiles: tiles})
    {:noreply, socket}
  end

  def handle("save_fog_exploration", %{"mapId" => map_id, "tiles" => tiles}, socket) when is_list(tiles) do
    char_id = socket.assigns[:char_id]
    json = Jason.encode!(tiles)

    try do
      Repo.query!(
        "INSERT INTO character_map_exploration (character_id, map_id, explored_tiles) VALUES (?,?,?) ON DUPLICATE KEY UPDATE explored_tiles=?, updated_at=NOW()",
        [char_id, map_id, json, json]
      )
    rescue _ -> nil
    end

    {:noreply, socket}
  end

  def handle(_, _, socket), do: {:noreply, socket}
end
