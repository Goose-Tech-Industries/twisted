defmodule TePhoenixWeb.Game.WorldHandler do
  @moduledoc """
  World events, structures, objects, particles, scheduled events.
  Ported from socket-game.js world event / structure / object sections.
  """

  import Phoenix.Channel
  import Phoenix.Socket, only: [assign: 3]

  alias TePhoenix.Game.{PlayerRegistry, MapData}
  alias TePhoenix.Repo

  @staff_roles ~w(ADMIN GM MOD STAFF OWNER)

  def handle("interact_object", %{"objectIndex" => obj_idx, "action" => action}, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p), do: {:noreply, socket}

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
      Repo.query!(
        "INSERT INTO game_map_object_state (map_id, object_index, state_key, changed_by) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE state_key=VALUES(state_key), changed_by=VALUES(changed_by)",
        [p.map_id, obj_idx, new_state, p.char_id]
      )
    rescue _ -> nil
    end

    TePhoenixWeb.Endpoint.broadcast!("map:#{p.map_id}", "object_state_change", %{
      objectIndex: obj_idx, state: new_state, changedBy: p.name
    })

    push(socket, "interact_result", %{success: true, objectIndex: obj_idx, state: new_state})
    {:noreply, socket}
  end

  # ── Objective interactions ──────────────────────────────────────
  # These wire the generic objective system into the game channel so
  # players can interact with placed objectives (generators, switches,
  # capture points, destructibles, etc.). All objective types and
  # behaviors are data-driven — the handler just routes to the API.

  def handle("objective_interact", %{"instance_id" => iid} = payload, socket) do
    char_id = socket.assigns[:char_id]
    action = payload["action"] || "advance"

    result =
      case action do
        "start" ->
          TePhoenix.Objectives.interact_start(iid, char_id)

        "cancel" ->
          TePhoenix.Objectives.interact_cancel(iid, char_id)

        "advance" ->
          amount = payload["amount"] || 1
          TePhoenix.Objectives.advance(iid, amount, char_id: char_id, team_id: payload["team_id"])

        _ ->
          {:error, :unknown_action}
      end

    case result do
      {:completed, inst} ->
        push(socket, "objective_result", %{status: "completed", instance_id: iid, value: inst.current_value})

      {:ok, inst} ->
        push(socket, "objective_result", %{status: "progress", instance_id: iid, value: inst.current_value})

      :ok ->
        push(socket, "objective_result", %{status: "ok", instance_id: iid})

      {:error, reason} ->
        push(socket, "objective_result", %{status: "error", reason: to_string(reason), instance_id: iid})
    end

    {:noreply, socket}
  end

  def handle("objective_list", _payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])

    if p do
      instances = TePhoenix.Objectives.list_instances(p.map_id)

      serialized =
        Enum.map(instances, fn inst ->
          def_ = TePhoenix.Objectives.get_def(inst.objective_key)

          %{
            id: inst.id,
            key: inst.objective_key,
            name: def_ && def_.name,
            icon: def_ && def_.icon,
            type: def_ && def_.type,
            x: inst.x,
            y: inst.y,
            current_value: inst.current_value,
            target_value: def_ && def_.target_value,
            status: inst.status,
            team_id: inst.team_id,
            interacting: inst.interacting
          }
        end)

      push(socket, "objective_list", %{objectives: serialized})
    end

    {:noreply, socket}
  end

  def handle("spawn_map_particle", payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p), do: {:noreply, socket}

    target_map = payload["mapId"] || p.map_id
    TePhoenixWeb.Endpoint.broadcast!("map:#{target_map}", "map_particle", %{
      preset: payload["preset"] || "sparkle",
      x: payload["x"] || p.x,
      y: payload["y"] || p.y
    })

    {:noreply, socket}
  end

  def handle("enter_structure", %{"structureId" => structure_id}, socket) do
    char_id = socket.assigns[:char_id]
    p = PlayerRegistry.get(char_id)
    if is_nil(p), do: {:noreply, socket}

    case Repo.query(
      "SELECT id, x, y, name, interior_map_id, exit_x, exit_y FROM game_deployed_structures WHERE id=? AND map_id=? AND is_active=1 AND (expires_at IS NULL OR expires_at > NOW())",
      [structure_id, p.map_id]
    ) do
      {:ok, %{rows: [[_id, sx, sy, sname, interior_map, exit_x, exit_y]]}} ->
        cond do
          is_nil(interior_map) ->
            push(socket, "notification", %{type: "info", message: "This structure has no interior."})

          abs(sx - p.x) > 1 or abs(sy - p.y) > 1 ->
            push(socket, "notification", %{type: "error", message: "Too far away."})

          true ->
            # Store return point
            socket = assign(socket, :structure_return, %{
              map_id: p.map_id, x: exit_x || sx, y: exit_y || sy
            })

            # Teleport to interior
            TePhoenixWeb.Endpoint.broadcast!("map:#{p.map_id}", "player_left", %{char_id: char_id})
            TePhoenixWeb.Endpoint.unsubscribe("map:#{p.map_id}")

            PlayerRegistry.update(char_id, %{map_id: interior_map, x: 5, y: 5})
            Repo.query("UPDATE characters SET map_id=?, x=5, y=5 WHERE id=?", [interior_map, char_id])

            TePhoenixWeb.Endpoint.subscribe("map:#{interior_map}")
            map_data = MapData.get(interior_map)
            if map_data, do: push(socket, "map_data", map_data)
            push(socket, "map_changed", %{mapId: interior_map})

            npcs = MapData.get_npcs(interior_map)
            push(socket, "npc_list", %{npcs: npcs})
            push(socket, "notification", %{type: "info", message: "Entered #{sname}"})
        end

      _ -> push(socket, "notification", %{type: "error", message: "Structure not found."})
    end

    {:noreply, socket}
  end

  def handle("exit_structure", _payload, socket) do
    char_id = socket.assigns[:char_id]
    ret = socket.assigns[:structure_return]

    if is_nil(ret) do
      push(socket, "notification", %{type: "error", message: "No exit point."})
      {:noreply, socket}
    else
      p = PlayerRegistry.get(char_id)

      TePhoenixWeb.Endpoint.broadcast!("map:#{p.map_id}", "player_left", %{char_id: char_id})
      TePhoenixWeb.Endpoint.unsubscribe("map:#{p.map_id}")

      PlayerRegistry.update(char_id, %{map_id: ret.map_id, x: ret.x, y: ret.y})
      Repo.query("UPDATE characters SET map_id=?, x=?, y=? WHERE id=?", [ret.map_id, ret.x, ret.y, char_id])

      TePhoenixWeb.Endpoint.subscribe("map:#{ret.map_id}")
      map_data = MapData.get(ret.map_id)
      if map_data, do: push(socket, "map_data", map_data)
      push(socket, "map_changed", %{mapId: ret.map_id})
      push(socket, "npc_list", %{npcs: MapData.get_npcs(ret.map_id)})
      push(socket, "notification", %{type: "info", message: "Exited structure"})

      socket = assign(socket, :structure_return, nil)
      {:noreply, socket}
    end
  end

  # ── World Events ────────────────────────────────────────────────

  def handle("world_events_get_active", _payload, socket) do
    char_id = socket.assigns[:char_id] || 0

    events = case Repo.query(
      "SELECT e.*, (SELECT COUNT(*) FROM game_world_event_participants WHERE event_id=e.id) as participant_count, (SELECT id FROM game_world_event_participants WHERE event_id=e.id AND character_id=?) as my_participation FROM game_world_events e WHERE e.is_active=1 ORDER BY e.started_at DESC",
      [char_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row ->
          e = Enum.zip(cols, row) |> Map.new()
          Map.put(e, "am_participating", e["my_participation"] != nil)
        end)
      _ -> []
    end

    push(socket, "world_events_active", %{events: events})
    {:noreply, socket}
  end

  def handle("world_events_get_history", _payload, socket) do
    history = case Repo.query("SELECT * FROM game_world_event_history ORDER BY ended_at DESC LIMIT 50") do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
    push(socket, "world_events_history", %{events: history})
    {:noreply, socket}
  end

  def handle("world_event_join", %{"eventId" => event_id}, socket) do
    char_id = socket.assigns[:char_id]
    if is_nil(char_id), do: {:noreply, socket}

    result = try do
      case Repo.query("SELECT name, min_level, max_participants FROM game_world_events WHERE id=? AND is_active=1", [event_id]) do
        {:ok, %{rows: [[name, min_lvl, max_p]]}} ->
          # Level check
          level = case Repo.query("SELECT level FROM characters WHERE id=?", [char_id]) do
            {:ok, %{rows: [[l]]}} -> l
            _ -> 1
          end

          cond do
            min_lvl && level < min_lvl ->
              %{success: false, message: "Requires level #{min_lvl}", eventId: event_id}

            max_p && max_p > 0 ->
              case Repo.query("SELECT COUNT(*) FROM game_world_event_participants WHERE event_id=?", [event_id]) do
                {:ok, %{rows: [[c]]}} when c >= max_p ->
                  %{success: false, message: "Event is full", eventId: event_id}
                _ ->
                  Repo.query!("INSERT IGNORE INTO game_world_event_participants (event_id, character_id) VALUES (?,?)", [event_id, char_id])
                  %{success: true, message: "Joined: #{name}", eventId: event_id}
              end

            true ->
              Repo.query!("INSERT IGNORE INTO game_world_event_participants (event_id, character_id) VALUES (?,?)", [event_id, char_id])
              %{success: true, message: "Joined: #{name}", eventId: event_id}
          end

        _ -> %{success: false, message: "Event not active", eventId: event_id}
      end
    rescue
      _ -> %{success: false, message: "Failed to join", eventId: event_id}
    end

    push(socket, "world_event_join_result", result)
    {:noreply, socket}
  end

  # ── Scheduled Game Events ───────────────────────────────────────

  def handle("event_list", _payload, socket) do
    char_id = socket.assigns[:char_id] || 0

    events = case Repo.query(
      "SELECT e.*, u.username AS host_name, (SELECT COUNT(*) FROM game_scheduled_task_signups WHERE event_id=e.id) AS signup_count, EXISTS(SELECT 1 FROM game_scheduled_task_signups WHERE event_id=e.id AND character_id=?) AS signed_up FROM game_scheduled_tasks e LEFT JOIN users u ON u.id=e.host_user_id WHERE e.is_active=1 AND (e.ends_at IS NULL OR e.ends_at > NOW()) ORDER BY e.starts_at",
      [char_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    push(socket, "event_list_result", %{events: events})
    {:noreply, socket}
  end

  def handle("event_signup", %{"eventId" => event_id}, socket) do
    char_id = socket.assigns[:char_id]

    try do
      case Repo.query("SELECT name, max_participants FROM game_scheduled_tasks WHERE id=? AND is_active=1", [event_id]) do
        {:ok, %{rows: [[name, max_p]]}} ->
          if max_p do
            case Repo.query("SELECT COUNT(*) FROM game_scheduled_task_signups WHERE event_id=?", [event_id]) do
              {:ok, %{rows: [[c]]}} when c >= max_p ->
                push(socket, "notification", %{type: "error", message: "Event is full."})
              _ ->
                Repo.query!("INSERT IGNORE INTO game_scheduled_task_signups (event_id, character_id) VALUES (?,?)", [event_id, char_id])
                push(socket, "notification", %{type: "success", message: "Signed up for \"#{name}\"!"})
            end
          else
            Repo.query!("INSERT IGNORE INTO game_scheduled_task_signups (event_id, character_id) VALUES (?,?)", [event_id, char_id])
            push(socket, "notification", %{type: "success", message: "Signed up for \"#{name}\"!"})
          end
        _ -> push(socket, "notification", %{type: "error", message: "Event not found."})
      end
    rescue
      e -> push(socket, "notification", %{type: "error", message: Exception.message(e)})
    end

    {:noreply, socket}
  end

  def handle("event_cancel_signup", %{"eventId" => event_id}, socket) do
    char_id = socket.assigns[:char_id]
    try do
      Repo.query!("DELETE FROM game_scheduled_task_signups WHERE event_id=? AND character_id=?", [event_id, char_id])
    rescue _ -> nil
    end
    push(socket, "notification", %{type: "info", message: "Signup cancelled."})
    {:noreply, socket}
  end

  def handle("event_create", payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if is_nil(p) or String.upcase(p.role || "") not in @staff_roles, do: {:noreply, socket}

    try do
      Repo.query!(
        "INSERT INTO game_scheduled_tasks (name, description, event_type, host_user_id, map_id, starts_at, ends_at, max_participants, reward_json, recurring) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [payload["name"], payload["description"], payload["event_type"] || "custom",
         p.user_id, payload["map_id"],
         payload["starts_at"], payload["ends_at"],
         payload["max_participants"],
         if(payload["reward_json"], do: Jason.encode!(payload["reward_json"])),
         payload["recurring"] || "none"]
      )
      push(socket, "notification", %{type: "success", message: "Event created!"})
    rescue
      e -> push(socket, "notification", %{type: "error", message: Exception.message(e)})
    end

    {:noreply, socket}
  end

  # ── Wave controls ────────────────────────────────────────────────

  def handle("wave_start", %{"def_key" => def_key} = payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    map_id = payload["map_id"] || (p && p.map_id)

    case TePhoenix.Waves.Scheduler.start(def_key, map_id: map_id) do
      {:ok, wave} ->
        push(socket, "wave_result", %{status: "started", wave: wave})

      {:error, reason} ->
        push(socket, "wave_result", %{status: "error", reason: to_string(reason)})
    end

    {:noreply, socket}
  end

  def handle("wave_stop", _payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    if p, do: TePhoenix.Waves.Scheduler.stop(p.map_id)
    push(socket, "wave_result", %{status: "stopped"})
    {:noreply, socket}
  end

  def handle("wave_status", _payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])

    if p do
      case TePhoenix.Waves.Scheduler.current(p.map_id) do
        nil ->
          push(socket, "wave_status", %{active: false})

        seq ->
          push(socket, "wave_status", %{
            active: true,
            wave: seq.wave_number,
            status: seq.status,
            loop: seq.loop_count,
            def_key: seq.def_key
          })
      end
    end

    {:noreply, socket}
  end

  # ── Resource queries ─────────────────────────────────────────────

  def handle("resource_get", %{"resource_type" => rt} = payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])

    if p do
      team_id = payload["team_id"] || 1
      amount = TePhoenix.Objectives.Resources.get_pool(p.map_id, team_id, rt)
      push(socket, "resource_info", %{resource: rt, amount: amount, team_id: team_id})
    end

    {:noreply, socket}
  end

  def handle("resource_all", _payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])

    if p do
      team_id = 1
      pools = TePhoenix.Objectives.Resources.get_all_pools(p.map_id, team_id)
      push(socket, "resource_all", %{resources: pools, team_id: team_id})
    end

    {:noreply, socket}
  end

  # ── Matchmaking controls ─────────────────────────────────────────

  def handle("queue_join", %{"mode" => mode}, socket) do
    char_id = socket.assigns[:char_id]
    rank = socket.assigns[:rank] || 0

    case TePhoenix.Matches.Queue.join(mode, char_id, rank: rank) do
      :ok ->
        push(socket, "queue_result", %{status: "joined", mode: mode})

      {:error, reason} ->
        push(socket, "queue_result", %{status: "error", reason: to_string(reason)})
    end

    {:noreply, socket}
  end

  def handle("queue_leave", _payload, socket) do
    TePhoenix.Matches.Queue.leave(socket.assigns[:char_id])
    push(socket, "queue_result", %{status: "left"})
    {:noreply, socket}
  end

  def handle("queue_status", _payload, socket) do
    status = TePhoenix.Matches.Queue.status(socket.assigns[:char_id])
    push(socket, "queue_status", status)
    {:noreply, socket}
  end

  def handle("lobby_ready", %{"lobby_id" => lobby_id}, socket) do
    case TePhoenix.Matches.Lobby.ready(lobby_id, socket.assigns[:char_id]) do
      :ok -> push(socket, "lobby_result", %{status: "ready"})
      {:error, reason} -> push(socket, "lobby_result", %{status: "error", reason: to_string(reason)})
    end

    {:noreply, socket}
  end

  def handle("lobby_decline", %{"lobby_id" => lobby_id}, socket) do
    TePhoenix.Matches.Lobby.decline(lobby_id, socket.assigns[:char_id])
    push(socket, "lobby_result", %{status: "declined"})
    {:noreply, socket}
  end

  def handle("lobby_state", %{"lobby_id" => lobby_id}, socket) do
    case TePhoenix.Matches.Lobby.get_state(lobby_id) do
      state when is_map(state) -> push(socket, "lobby_state", state)
      _ -> push(socket, "lobby_state", %{error: "not_found"})
    end

    {:noreply, socket}
  end

  def handle(_, _, socket), do: {:noreply, socket}
end
