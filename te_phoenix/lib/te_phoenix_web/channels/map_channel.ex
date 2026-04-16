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
  require Logger

  @staff_roles ~w(ADMIN GM MOD STAFF OWNER)

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

  # ── Wave fan-out ────────────────────────────────────────────────

  def handle_info({:wave_event, event, payload}, socket) do
    push(socket, "wave_event", %{event: event, data: payload})
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
      patch_json = if is_binary(patch), do: patch, else: Jason.encode!(patch)

      Repo.query(
        """
        INSERT IGNORE INTO game_map_ops_log
          (map_id, op_id, op_type, patch_json, author_id, author_name)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [map_id, op_id, op_type, patch_json, author_id, author_name]
      )

      broadcast_from!(socket, "editor_op", %{
        op_id: op_id,
        op_type: op_type,
        patch: patch,
        author: author_name
      })

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
end
