defmodule TePhoenixWeb.MapChannel do
  @moduledoc """
  Per-map Phoenix Channel — central nervous system for map editor,
  player mode, and battle mode.

  ## Topic
  `map:{map_id}`

  ## Message taxonomy

  ### Editor ops (admin / staff only)
    * `editor_op` — tile paint, event/object placement, layer edit, etc.
      Each op is idempotent by `op_id`. Persisted to `game_map_ops_log`
      and broadcast to other editors on the same branch.
    * `yjs:sync_request` — client requests the current Y.Doc snapshot
    * `yjs:update` — Y.Doc delta update from a client
    * `yjs:awareness` — user cursor / selection presence

  ### Game ops (any logged-in player)
    * `game_op` — player movement, interaction, interact-with-NPC, etc.
      Forwarded via PubSub to the existing PlayerSession pipeline.

  ### Battle ops (battle participants only)
    * `battle_op` — combat action submission. Forwarded to BattleServer.

  ## Persistence + fan-out

  Editor ops go through `INSERT IGNORE` into `game_map_ops_log` (idempotent
  on `op_id`) and broadcast to all other clients on the topic. Yjs updates
  are persisted to `game_map_drafts` so late-joining clients can cold-start.
  """
  use Phoenix.Channel
  alias TePhoenix.Repo
  alias TePhoenix.World.Vision
  require Logger

  @staff_roles ~w(ADMIN GM MOD STAFF OWNER)

  # ETS table for vision profiles keyed by {map_id, char_id}.
  # Created once at module load; if the table already exists the
  # rescue clause silently continues.
  @vision_table :map_channel_vision

  def vision_table, do: @vision_table

  def init_vision_table do
    :ets.new(@vision_table, [:named_table, :public, :set, read_concurrency: true])
  rescue
    ArgumentError -> :ok
  end

  # ── Join ───────────────────────────────────────────────────────

  @impl true
  def join("map:" <> map_id_str, _params, socket) do
    map_id =
      case Integer.parse(map_id_str) do
        {n, _} -> n
        _ -> nil
      end

    if map_id && map_id > 0 do
      socket =
        socket
        |> assign(:map_id, map_id)
        |> assign(:role, role_for(socket))

      send(self(), :after_join)
      {:ok, %{map_id: map_id, role: socket.assigns.role}, socket}
    else
      {:error, %{reason: "invalid_map_id"}}
    end
  end

  # PubSub topics the channel fans out to the client. Each topic represents
  # an independent subsystem publishing events that should reach the player
  # without further request/response round-trips. Each topic corresponds
  # 1:1 to a `handle_info` clause below that converts the internal message
  # shape into a client-facing push payload.
  @fanout_topics [
    "npc_chatter",
    "crowd",
    "env_reactions",
    "ogham_drops",
    "emotes",
    "presence",
    "world_flags",
    "arena",
    "region",
    "weather",
    "quest",
    "loot_drops"
  ]

  @impl true
  def handle_info(:after_join, socket) do
    map_id = socket.assigns.map_id

    for topic <- @fanout_topics do
      Phoenix.PubSub.subscribe(TePhoenix.PubSub, "map:#{map_id}:#{topic}")
    end

    # Subscribe to objective + wave updates for this map
    Phoenix.PubSub.subscribe(TePhoenix.PubSub, "objectives:map:#{map_id}")
    Phoenix.PubSub.subscribe(TePhoenix.PubSub, "waves:map:#{map_id}")

    # Tell tickers this map has a connected player
    TePhoenix.Objectives.Ticker.watch_map(map_id)

    # Subscribe to entity-position broadcasts that need vision filtering
    Phoenix.PubSub.subscribe(TePhoenix.PubSub, "map:#{map_id}:entity_positions")

    # Initialize vision profile for this player.
    # Default: 5-tile circle radius, no stealth detection.
    char_id = socket.assigns[:char_id] || socket.assigns[:user_id]
    vision = %{
      vision_radius: 5,
      vision_type: "circle",
      detection_power: 0,
      x: 0,
      y: 0
    }

    init_vision_table()
    if char_id, do: :ets.insert(@vision_table, {{map_id, char_id}, vision})

    socket = assign(socket, :vision, vision)
    {:noreply, socket}
  end

  # ── Fan-out handlers ──────────────────────────────────────────
  #
  # Each PubSub message is translated to a client push. Shapes are kept
  # symmetric with the event names the legacy React player client already
  # listens to, so no client changes are needed.

  def handle_info({:npc_chatter, npc_id, line}, socket) do
    push(socket, "npc_chatter", %{npc_id: npc_id, line: line})
    {:noreply, socket}
  end

  def handle_info({:crowd_reaction, level, sentiment}, socket) do
    push(socket, "crowd_reaction", %{level: level, sentiment: sentiment})
    {:noreply, socket}
  end

  def handle_info({:env_reaction, tile_x, tile_y, kind, payload}, socket) do
    push(socket, "env_reaction", %{x: tile_x, y: tile_y, kind: kind, payload: payload})
    {:noreply, socket}
  end

  def handle_info({:ogham_drop, entity_id, rune, x, y}, socket) do
    push(socket, "ogham_drop", %{entity_id: entity_id, rune: rune, x: x, y: y})
    {:noreply, socket}
  end

  def handle_info({:emote, entity_id, emote_key, duration_ms}, socket) do
    push(socket, "emote", %{entity_id: entity_id, emote: emote_key, duration_ms: duration_ms})
    {:noreply, socket}
  end

  def handle_info({:presence, user_id, status}, socket) do
    push(socket, "presence", %{user_id: user_id, status: status})
    {:noreply, socket}
  end

  def handle_info({:world_flag, flag, value}, socket) do
    push(socket, "world_flag", %{flag: flag, value: value})
    {:noreply, socket}
  end

  def handle_info({:arena_enter, user_id, arena_id}, socket) do
    push(socket, "arena_enter", %{user_id: user_id, arena_id: arena_id})
    {:noreply, socket}
  end

  def handle_info({:arena_leave, user_id, arena_id}, socket) do
    push(socket, "arena_leave", %{user_id: user_id, arena_id: arena_id})
    {:noreply, socket}
  end

  def handle_info({:region_update, region_id, patch}, socket) do
    push(socket, "region_update", %{region_id: region_id, patch: patch})
    {:noreply, socket}
  end

  def handle_info({:weather, region_id, weather, intensity}, socket) do
    push(socket, "weather", %{region_id: region_id, weather: weather, intensity: intensity})
    {:noreply, socket}
  end

  def handle_info({:quest_update, user_id, quest_id, patch}, socket) do
    push(socket, "quest_update", %{user_id: user_id, quest_id: quest_id, patch: patch})
    {:noreply, socket}
  end

  def handle_info({:loot_drop, entity_id, x, y, items}, socket) do
    push(socket, "loot_drop", %{entity_id: entity_id, x: x, y: y, items: items})
    {:noreply, socket}
  end

  # ── Objective fan-out ─────────────────────────────────────────
  # All objective lifecycle events are forwarded to connected clients
  # so they can render progress bars, completion animations, etc.

  def handle_info({:objective_progress, iid, inst}, socket) do
    push(socket, "objective_update", %{id: iid, status: inst.status, value: inst.current_value})
    {:noreply, socket}
  end

  def handle_info({:objective_completed, iid, inst}, socket) do
    push(socket, "objective_update", %{id: iid, status: "completed", value: inst.current_value})
    {:noreply, socket}
  end

  def handle_info({:objective_failed, iid, _inst}, socket) do
    push(socket, "objective_update", %{id: iid, status: "failed"})
    {:noreply, socket}
  end

  def handle_info({:objective_reset, iid}, socket) do
    push(socket, "objective_update", %{id: iid, status: "active", value: 0})
    {:noreply, socket}
  end

  def handle_info({:objective_activated, iid}, socket) do
    push(socket, "objective_update", %{id: iid, status: "active"})
    {:noreply, socket}
  end

  def handle_info({:objective_placed, key, x, y}, socket) do
    push(socket, "objective_placed", %{key: key, x: x, y: y})
    {:noreply, socket}
  end

  def handle_info({:objective_interact_start, iid, char_id}, socket) do
    push(socket, "objective_interact", %{id: iid, char_id: char_id, action: "start"})
    {:noreply, socket}
  end

  def handle_info({:objective_interact_cancel, iid, char_id}, socket) do
    push(socket, "objective_interact", %{id: iid, char_id: char_id, action: "cancel"})
    {:noreply, socket}
  end

  def handle_info({:objective_event, event, iid, key}, socket) do
    push(socket, "objective_event", %{event: event, id: iid, key: key})
    {:noreply, socket}
  end

  # ── Resource fan-out ─────────────────────────────────────────────

  def handle_info({:resource_update, team_id, resource_type, amount}, socket) do
    push(socket, "resource_update", %{team_id: team_id, resource: resource_type, amount: amount})
    {:noreply, socket}
  end

  # ── Wave fan-out ────────────────────────────────────────────────

  def handle_info({:wave_event, event, payload}, socket) do
    push(socket, "wave_event", %{event: event, data: payload})
    {:noreply, socket}
  end

  # ── Vision-filtered entity broadcasts ────────────────────────
  #
  # Any subsystem that moves entities publishes to `map:{id}:entity_positions`.
  # Each message is `{:entity_position, entity_id, %{x, y, stealth_level, ...}}`.
  # We only push to this player if their vision profile can see the entity.

  def handle_info({:entity_position, entity_id, entity_data}, socket) do
    push_if_visible(socket, "entity_position", %{
      entity_id: entity_id,
      x: entity_data[:x] || entity_data[:grid_x] || 0,
      y: entity_data[:y] || entity_data[:grid_y] || 0,
      data: entity_data
    }, entity_data)

    {:noreply, socket}
  end

  # Batch version: a list of entities at once (e.g. tick snapshot).
  def handle_info({:entity_positions_batch, entities}, socket) do
    visible = filter_entities_for_player(entities, socket.assigns[:vision])

    if visible != [] do
      push(socket, "entity_positions_batch", %{
        entities: Enum.map(visible, fn {eid, data} ->
          %{entity_id: eid, x: data[:x] || 0, y: data[:y] || 0, data: data}
        end)
      })
    end

    {:noreply, socket}
  end

  def handle_info(_msg, socket), do: {:noreply, socket}

  # ── Editor ops ────────────────────────────────────────────────

  @impl true
  def handle_in("editor_op", %{"op_id" => op_id, "op_type" => op_type, "patch" => patch}, socket) do
    if socket.assigns.role in @staff_roles do
      map_id = socket.assigns.map_id
      author_id = socket.assigns[:user_id]
      author_name = socket.assigns[:username] || "staff"

      # Phase 2B: route through MapOps so each persisted op gets a
      # monotonic `sequence` per map (replayable history). The table
      # is the same — `game_map_ops_log` — so existing readers are
      # unaffected.
      record =
        case TePhoenix.Game.MapOps.append(
               map_id,
               op_id,
               op_type,
               patch,
               user_id: author_id,
               user_name: author_name
             ) do
          {:ok, r} -> r
          _ -> nil
        end

      broadcast_from!(socket, "editor_op", %{
        op_id: op_id,
        op_type: op_type,
        patch: patch,
        author: author_name
      })

      # Phase 2B.3: also bridge to the LV editor's PubSub topic so any
      # admin who has the same map open in /sauce sees the op fan out
      # to their History drawer + canvas. originator_id is nil here —
      # channel-side ops aren't tied to an editor LV mount, so they
      # always apply on every receiving LV (no self-skip).
      Phoenix.PubSub.broadcast(
        TePhoenix.PubSub,
        "map:#{map_id}:editor",
        {:remote_editor_op, %{patch: patch, record: record, originator_id: nil}}
      )

      {:reply, {:ok, %{op_id: op_id}}, socket}
    else
      {:reply, {:error, %{reason: "not_staff"}}, socket}
    end
  end

  def handle_in("editor_op", _bad, socket) do
    {:reply, {:error, %{reason: "malformed_op"}}, socket}
  end

  # ── Game ops ──────────────────────────────────────────────────

  def handle_in("game_op", %{"type" => type, "payload" => payload}, socket) do
    Phoenix.PubSub.broadcast(
      TePhoenix.PubSub,
      "map:#{socket.assigns.map_id}:game",
      {:game_op, socket.assigns[:user_id], type, payload}
    )

    {:noreply, socket}
  end

  # ── Battle ops ────────────────────────────────────────────────

  def handle_in("battle_op", %{"battle_id" => battle_id, "action" => action} = payload, socket) do
    uid = socket.assigns[:user_id]

    if is_integer(uid) and is_integer(battle_id) do
      Phoenix.PubSub.broadcast(
        TePhoenix.PubSub,
        "battle:#{battle_id}",
        {:battle_op, uid, action, Map.drop(payload, ["battle_id", "action"])}
      )

      {:reply, {:ok, %{}}, socket}
    else
      {:reply, {:error, %{reason: "bad_battle_op"}}, socket}
    end
  end

  # ── Yjs sync ──────────────────────────────────────────────────

  def handle_in("yjs:sync_request", _payload, socket) do
    map_id = socket.assigns.map_id

    snapshot =
      case Repo.query(
             "SELECT draft_json FROM game_map_drafts WHERE map_id = ? ORDER BY updated_at DESC LIMIT 1",
             [map_id]
           ) do
        {:ok, %{rows: [[json]]}} when is_binary(json) -> json
        _ -> nil
      end

    {:reply, {:ok, %{snapshot: snapshot}}, socket}
  end

  def handle_in("yjs:update", %{"update" => update}, socket)
      when is_binary(update) and byte_size(update) > 0 do
    if socket.assigns.role in @staff_roles do
      map_id = socket.assigns.map_id
      user_id = socket.assigns[:user_id] || 0

      Repo.query(
        """
        INSERT INTO game_map_drafts (map_id, user_id, draft_json)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE draft_json = VALUES(draft_json), updated_at = NOW()
        """,
        [map_id, user_id, update]
      )

      broadcast_from!(socket, "yjs:update", %{update: update})
      {:noreply, socket}
    else
      {:reply, {:error, %{reason: "not_staff"}}, socket}
    end
  end

  def handle_in("yjs:awareness", %{"update" => update}, socket) when is_binary(update) do
    broadcast_from!(socket, "yjs:awareness", %{update: update})
    {:noreply, socket}
  end

  # ── Vision updates ─────────────────────────────────────────────
  #
  # The client sends `update_vision` whenever the player moves or their
  # vision profile changes (e.g. equipped a lantern → bigger radius,
  # entered a detection zone, etc.). We update both the socket assign
  # and the ETS table so other subsystems can query vision state.

  def handle_in("update_vision", params, socket) do
    map_id = socket.assigns.map_id
    char_id = socket.assigns[:char_id] || socket.assigns[:user_id]
    old_vision = socket.assigns[:vision] || %{}

    vision = %{
      vision_radius: to_number(params["vision_radius"], old_vision[:vision_radius] || 5),
      vision_type: params["vision_type"] || old_vision[:vision_type] || "circle",
      detection_power: to_number(params["detection_power"], old_vision[:detection_power] || 0),
      x: to_number(params["x"], old_vision[:x] || 0),
      y: to_number(params["y"], old_vision[:y] || 0),
      cone_angle: to_number(params["cone_angle"], old_vision[:cone_angle]),
      cone_direction: params["cone_direction"] || old_vision[:cone_direction]
    }

    init_vision_table()
    if char_id, do: :ets.insert(@vision_table, {{map_id, char_id}, vision})

    {:reply, {:ok, %{}}, assign(socket, :vision, vision)}
  end

  # ── Fallback ──────────────────────────────────────────────────

  def handle_in(event, _payload, socket) do
    Logger.debug("[MapChannel] unhandled event: #{event}")
    {:noreply, socket}
  end

  # ── Helpers ───────────────────────────────────────────────────

  defp role_for(socket) do
    case socket.assigns[:user_id] do
      id when is_integer(id) and id > 0 ->
        case Repo.query("SELECT role FROM users WHERE id = ? AND is_banned = 0", [id]) do
          {:ok, %{rows: [[role]]}} when is_binary(role) -> String.upcase(role)
          _ -> "GUEST"
        end

      _ ->
        "GUEST"
    end
  end

  # ── Vision helpers ───────────────────────────────────────────

  @doc """
  Push an event to the socket only if the player can see the entity at
  `entity_position`. Uses the Vision module for the actual geometry check.
  """
  def push_if_visible(socket, event, payload, entity_position) do
    viewer = socket.assigns[:vision] || %{vision_radius: 5, vision_type: "circle", x: 0, y: 0}

    case Vision.can_see?(viewer, entity_position) do
      {:visible, _reason} -> push(socket, event, payload)
      {:hidden, _reason} -> :skip
    end
  end

  @doc """
  Filter a list of `{entity_id, entity_data}` tuples to only those
  visible to the given player vision profile. Returns the visible subset.
  """
  def filter_entities_for_player(entities, nil), do: entities

  def filter_entities_for_player(entities, vision) do
    Enum.filter(entities, fn {_id, data} ->
      case Vision.can_see?(vision, data) do
        {:visible, _} -> true
        _ -> false
      end
    end)
  end

  @doc """
  Look up a player's current vision profile from the ETS table.
  Returns the vision map or nil if not found.
  """
  def get_vision(map_id, char_id) do
    init_vision_table()

    case :ets.lookup(@vision_table, {map_id, char_id}) do
      [{{^map_id, ^char_id}, vision}] -> vision
      _ -> nil
    end
  end

  defp to_number(nil, default), do: default
  defp to_number(v, _default) when is_number(v), do: v

  defp to_number(v, default) when is_binary(v) do
    case Float.parse(v) do
      {f, _} -> if f == trunc(f), do: trunc(f), else: f
      :error -> default
    end
  end

  defp to_number(_, default), do: default
end
