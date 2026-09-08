defmodule TePhoenixWeb.Admin.MapEditorLive do
  @moduledoc """
  Visual map editor LiveView. Route: `/sauce/world/maps/:id/edit`.

  Mounts a `TwistedCanvas` JS hook in edit mode, loads the map's layers
  from the DB (either the new `layers_json` column if schema_version=2,
  or the legacy `tiles_json` blob otherwise), and pushes initial render
  state to the client.

  Handles editor events from the client:
    * `tile_click` — user clicked a tile; route through the active tool
    * `edit:paint` — primary paint action, routes to an editor_op
    * `edit:tool_select` — switch active tool
    * `edit:layer_select` — switch active layer
    * `edit:toggle_layer_visibility`
    * `save` — flush draft to main branch

  Broadcasts via PubSub on map:ID:editor for multi-user editing.
  All persistent writes go through `game_map_ops_log` and
  `game_map_drafts`.
  """
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo
  alias TePhoenixWeb.Admin.MapEditorTemplates
  alias TePhoenixWeb.MapEditorPresence
  require Logger
  import Bitwise, only: [bsl: 2]

  @default_canvas_tile_size 20
  @default_viewport_w 30
  @default_viewport_h 20

  @impl true
  def mount(%{"id" => id_str}, _session, socket) do
    case load_map(id_str) do
      {:ok, map} ->
        editor_id = editor_id()
        editor_color = random_color()
        topic = "map:#{map.id}:editor"

        if connected?(socket) do
          Phoenix.PubSub.subscribe(TePhoenix.PubSub, topic)

          {:ok, _} =
            MapEditorPresence.track(self(), topic, editor_id, %{
              editor_id: editor_id,
              color: editor_color,
              name: "Staff",
              joined_at: System.system_time(:second)
            })
        end

        {undo, redo} = load_draft_stacks(map.id)
        npcs =
          case Repo.query("SELECT id, name FROM game_npcs ORDER BY name ASC") do
            {:ok, %{rows: rows}} -> Enum.map(rows, fn [id, name] -> {id, name} end)
            _ -> []
          end

        {:ok,
         socket
         |> assign(:npcs, npcs)
         |> assign(:active_tab, :world)
         |> assign(:page_title, "Edit: #{map.name}")
         |> assign(:map, map)
         |> assign(:tools, tool_list())
         |> assign(:active_tool, "brush")
         |> assign(:active_layer, "ground")
         |> assign(:layer_visibility, default_layer_visibility())
         |> assign(:brush_tile_id, 0)
         |> assign(:brush_size, 1)
         |> assign(:canvas_tile_size, @default_canvas_tile_size)
         |> assign(:viewport_w, map.width)
         |> assign(:viewport_h, map.height)
         |> assign(:dirty?, false)
         |> assign(:save_status, nil)
         |> assign(:undo_stack, undo)
         |> assign(:redo_stack, redo)
         |> assign(:rect_anchor, nil)
         |> assign(:select_rect, nil)
         |> assign(:select_clipboard, nil)
         |> assign(:palette, palette())
         |> assign(:recent_tiles, [])
         |> assign(:palette_search, "")
         |> assign(:autotile_groups, load_autotile_groups())
         |> assign(:history_open, false)
         |> assign(:history_versions, [])
         |> assign(:templates_open, false)
         |> assign(:stamps_open, false)
         |> assign(:saved_stamps, list_saved_stamps(map.id))
         |> assign(:properties_open, false)
         |> assign(:resize_open, false)
         |> assign(:objects, load_map_objects(map.id))
         |> assign(:events, load_map_events(map.id))
         |> assign(:active_object_preset, "TORCH")
         |> assign(:active_event_kind, "TELEPORT")
         # Phase 2A: Object/Event palette modals retired in favor of inline
         # tool-context panels. Flags retained as no-ops in case anything
         # still pushes them; can be removed after one stable release.
         |> assign(:object_palette_open, false)
         |> assign(:event_palette_open, false)
         # Right-panel state (per-tool context panel, see right_panel_kind/1)
         |> assign(:object_panel_mode, :place)
         |> assign(:event_panel_mode, :place)
         |> assign(:selected_object_id, nil)
         |> assign(:selected_event_id, nil)
         |> assign(:selected_spawn_zone_id, nil)
         |> assign(:selected_sound_zone_id, nil)
         |> assign(:pass_paint_value, 0)
         |> assign(:pass_overlay_visible, true)
         |> assign(:paint_elevation, 0)
         |> assign(:event_form, default_event_form("TELEPORT"))
         # When set, the next zone-tool click starts a 2-click drag-rect
         # zone create. Reset after the second click. Default behavior of
         # the spawn tool (when armed=false) is set_spawn (D10).
         |> assign(:zone_creation_armed, false)
         # Time-scrub state. When :scrub_active is true, the canvas shows
         # the replayed state at :scrub_seq (read-only preview). Resetting
         # to head (or closing the drawer) restores the live state.
         |> assign(:scrub_active, false)
         |> assign(:scrub_seq, 0)
         # 2B.3: counts ops that arrived via PubSub while the user was
         # scrubbing. Surfaces as a "+N new" badge so the user can choose
         # to bring the preview back to head — auto-jumping past their
         # cursor would feel jarring.
         |> assign(:new_ops_since_scrub, 0)
         # 2B.2: pending field-edit buffer. Maps {kind, target_id, field}
         # → %{session_start_value, current_value, timer_ref}. A 500ms
         # debounce timer flushes one op per editing session. Drag-release
         # paths (zone:update_rect, etc.) bypass this and commit immediately.
         |> assign(:pending_field_ops, %{})
         |> assign(:hover_tile, nil)
         |> assign(:inspector_open, true)
         |> assign(:show_grid, false)
         |> assign(:play_mode, false)
         |> assign(:play_x, div(map.width, 2))
         |> assign(:play_y, div(map.height, 2))
         |> assign(:cam_x, div(map.width - 1, 2))
         |> assign(:cam_y, div(map.height - 1, 2))
         |> assign(:spawn_zones, load_spawn_zones(map.id))
         |> assign(:sound_zones, load_sound_zones(map.id))
         |> assign(:tile_anims, load_tile_anims(map))
         |> assign(:zone_anchor, nil)
         |> assign(:pending_zone, nil)
         |> assign(:tile_anim_open, false)
         |> assign(:tile_anim_target, nil)
         |> assign(:event_picker_target, nil)
         |> assign(:available_scripts, list_available_scripts())
         |> assign(:editor_id, editor_id)
         |> assign(:editor_color, editor_color)
         |> assign(:remote_cursors, %{})
         |> push_initial_state(map)}

      {:error, :not_found} ->
        {:ok,
         socket
         |> put_flash(:error, "Map not found")
         |> push_navigate(to: ~p"/sauce/world")}
    end
  end

  # ── Client event handlers ──────────────────────────────────

  @impl true
  def handle_event("tile_click", %{"x" => x, "y" => y}, socket) do
    tile_x = to_int(x)
    tile_y = to_int(y)
    handle_tool_click(socket.assigns.active_tool, tile_x, tile_y, socket)
  end

  def handle_event("select_tool", %{"tool" => tool}, socket) do
    # 2B.2: switching tools commits any in-flight field edit so the user
    # doesn't lose context (otherwise the buffer would just expire on its
    # 500ms timer with no visible signal).
    socket = flush_all_field_ops(socket)

    {:noreply,
     socket
     |> assign(:active_tool, tool)
     |> assign(:rect_anchor, nil)
     |> assign(:select_rect, nil)
     # Drop tool-specific selection state when the active tool changes,
     # so switching Object → Event doesn't keep a stale selected_object_id.
     |> assign(:selected_object_id, nil)
     |> assign(:selected_event_id, nil)
     |> assign(:selected_spawn_zone_id, nil)
     |> assign(:selected_sound_zone_id, nil)
     |> assign(:object_panel_mode, :place)
     |> assign(:event_panel_mode, :place)
     |> assign(:zone_creation_armed, false)
     |> push_event("edit:set_preview", %{kind: nil})}
  end

  def handle_event("select:copy", _params, socket) do
    case socket.assigns.select_rect do
      nil ->
        {:noreply, socket}

      rect ->
        {:noreply, assign(socket, :select_clipboard, snapshot_region(socket.assigns.map, socket.assigns.active_layer, rect))}
    end
  end

  def handle_event("select:cut", _params, socket) do
    case socket.assigns.select_rect do
      nil ->
        {:noreply, socket}

      rect ->
        clip = snapshot_region(socket.assigns.map, socket.assigns.active_layer, rect)
        socket = assign(socket, :select_clipboard, clip)

        case apply_region_fill(
               socket.assigns.map,
               socket.assigns.active_layer,
               rect,
               empty_value_for(socket.assigns.active_layer)
             ) do
          {:ok, updated_map, op} -> commit_op(socket, updated_map, op)
          {:error, _} -> {:noreply, socket}
        end
    end
  end

  def handle_event("select:delete", _params, socket) do
    case socket.assigns.select_rect do
      nil ->
        {:noreply, socket}

      rect ->
        case apply_region_fill(socket.assigns.map, socket.assigns.active_layer, rect, empty_value_for(socket.assigns.active_layer)) do
          {:ok, updated_map, op} -> commit_op(socket, updated_map, op)
          {:error, _} -> {:noreply, socket}
        end
    end
  end

  def handle_event("select:paste", _params, socket) do
    case {socket.assigns.select_clipboard, socket.assigns.select_rect} do
      {nil, _} ->
        {:noreply, socket}

      {clip, rect} ->
        # Paste at the top-left of the current selection, or (0,0) if none.
        {ox, oy} =
          case rect do
            %{x1: x1, y1: y1} -> {x1, y1}
            _ -> {0, 0}
          end

        case apply_region_stamp(socket.assigns.map, socket.assigns.active_layer, clip, ox, oy) do
          {:ok, updated_map, op} -> commit_op(socket, updated_map, op)
          {:error, _} -> {:noreply, socket}
        end
    end
  end

  def handle_event("cancel_preview", _params, socket) do
    {:noreply,
     socket
     |> assign(:rect_anchor, nil)
     |> assign(:select_rect, nil)
     |> push_event("edit:set_preview", %{kind: nil})}
  end

  def handle_event("select_layer", %{"layer" => layer}, socket) do
    {:noreply, assign(socket, :active_layer, layer)}
  end

  def handle_event("toggle_layer_visibility", %{"layer" => layer}, socket) do
    vis = Map.update(socket.assigns.layer_visibility, layer, false, &(!&1))

    {:noreply,
     socket
     |> assign(:layer_visibility, vis)
     |> push_event("map:state", render_state(socket.assigns.map, %{socket.assigns | layer_visibility: vis}))}
  end

  def handle_event("set_brush_tile", %{"id" => id}, socket) do
    tile_id = to_int(id)
    recent = [tile_id | Enum.reject(socket.assigns.recent_tiles, &(&1 == tile_id))] |> Enum.take(12)
    {:noreply, socket |> assign(:brush_tile_id, tile_id) |> assign(:recent_tiles, recent)}
  end

  def handle_event("set_brush_size", %{"size" => size}, socket) do
    n = to_int(size)
    n = if n in [1, 2, 3, 5], do: n, else: 1
    {:noreply, assign(socket, :brush_size, n)}
  end

  def handle_event("palette_search", %{"q" => q}, socket) do
    {:noreply, assign(socket, :palette_search, q)}
  end

  def handle_event("undo", _params, socket) do
    case socket.assigns.undo_stack do
      [] ->
        {:noreply, socket}

      [op | rest] ->
        case apply_inverse(socket.assigns.map, op) do
          {:ok, updated_map} ->
            redo_stack = [op | socket.assigns.redo_stack]
            persist_draft_stacks(updated_map.id, rest, redo_stack)

            {:noreply,
             socket
             |> assign(:map, updated_map)
             |> assign(:undo_stack, rest)
             |> assign(:redo_stack, redo_stack)
             |> assign(:dirty?, true)
             |> push_event("map:state", render_state(updated_map, socket.assigns))}

          _ ->
            {:noreply, socket}
        end
    end
  end

  def handle_event("redo", _params, socket) do
    case socket.assigns.redo_stack do
      [] ->
        {:noreply, socket}

      [op | rest] ->
        case apply_forward(socket.assigns.map, op) do
          {:ok, updated_map} ->
            undo_stack = [op | socket.assigns.undo_stack]
            persist_draft_stacks(updated_map.id, undo_stack, rest)

            {:noreply,
             socket
             |> assign(:map, updated_map)
             |> assign(:redo_stack, rest)
             |> assign(:undo_stack, undo_stack)
             |> assign(:dirty?, true)
             |> push_event("map:state", render_state(updated_map, socket.assigns))}

          _ ->
            {:noreply, socket}
        end
    end
  end

  def handle_event("shortcut", %{"key" => key}, socket) do
    case tool_for_shortcut(key) do
      nil -> {:noreply, socket}
      tool ->
        {:noreply,
         socket
         |> assign(:active_tool, tool)
         |> assign(:rect_anchor, nil)
         |> assign(:select_rect, nil)
         |> push_event("edit:set_preview", %{kind: nil})}
    end
  end

  def handle_event("history:open", _params, socket) do
    # 2B.2: flush any in-flight field edit so the drawer reflects the
    # actual committed state (otherwise the user might open the drawer
    # mid-typing and not see their own changes yet).
    socket = flush_all_field_ops(socket)

    # Phase 2B: history drawer pulls from the op log instead of the legacy
    # snapshot-only versions table. Most-recent op first; capped at 200
    # entries so a 10k-op map doesn't ship the world over the wire.
    ops =
      TePhoenix.Game.MapOps.list(
        socket.assigns.map.id,
        include_inverted: true
      )
      |> Enum.reverse()
      |> Enum.take(200)

    {:noreply,
     socket
     |> assign(:history_versions, ops)
     |> assign(:history_open, true)}
  end

  def handle_event("history:close", _params, socket) do
    # If a preview was active, restore the live state so the user doesn't
    # walk away with a stale-looking canvas.
    socket =
      if socket.assigns.scrub_active do
        push_event(socket, "map:state", render_state(socket.assigns.map, socket.assigns))
      else
        socket
      end

    {:noreply,
     socket
     |> assign(:history_open, false)
     |> assign(:scrub_active, false)
     |> assign(:scrub_seq, 0)
     |> assign(:new_ops_since_scrub, 0)}
  end

  def handle_event("history:undo_op", %{"op_id" => op_id}, socket) do
    case Repo.query("UPDATE game_map_ops_log SET inverted = 1 WHERE map_id = ? AND op_id = ?", [
           socket.assigns.map.id,
           op_id
         ]) do
      {:ok, _} ->
        {:noreply, refresh_after_op_toggle(socket, "Op marked inverted — replay skips it")}

      _ ->
        {:noreply, socket}
    end
  end

  # Time-scrub: render the map state at a specific sequence as a preview.
  # `value` comes from the slider's name="value" input.
  def handle_event("history:scrub", %{"value" => seq_str}, socket) do
    seq = to_int(seq_str) |> max(0)
    map = socket.assigns.map
    replayed = replay_map_state(map, up_to: seq)

    preview_map = %{map | layers: replayed.layers}

    {:noreply,
     socket
     |> assign(:scrub_active, true)
     |> assign(:scrub_seq, seq)
     |> push_event("map:state", render_state(preview_map, %{socket.assigns | objects: replayed.objects, events: replayed.events}))}
  end

  # Reset preview back to the live (head) state. Also clears the
  # "+N new ops" badge counter so the next set of incoming ops starts
  # fresh from the user's perspective.
  def handle_event("history:scrub_reset", _params, socket) do
    map = socket.assigns.map

    {:noreply,
     socket
     |> assign(:scrub_active, false)
     |> assign(:scrub_seq, 0)
     |> assign(:new_ops_since_scrub, 0)
     |> push_event("map:state", render_state(map, socket.assigns))}
  end

  # Restore: invert every op whose sequence > scrub_seq. The map then
  # reflects the previewed state. This is destructive (writes inverted
  # bits to many rows), so the UI confirms before firing.
  def handle_event("history:restore_to_seq", %{"seq" => seq_str}, socket) do
    seq = to_int(seq_str) |> max(0)
    map_id = socket.assigns.map.id

    Repo.query(
      "UPDATE game_map_ops_log SET inverted = 1 WHERE map_id = ? AND sequence > ?",
      [map_id, seq]
    )

    socket = socket |> assign(:scrub_active, false) |> assign(:scrub_seq, 0)
    {:noreply, refresh_after_op_toggle(socket, "Restored to seq #{seq} — later ops marked inverted")}
  end

  def handle_event("history:redo_op", %{"op_id" => op_id}, socket) do
    case Repo.query("UPDATE game_map_ops_log SET inverted = 0 WHERE map_id = ? AND op_id = ?", [
           socket.assigns.map.id,
           op_id
         ]) do
      {:ok, _} ->
        {:noreply, refresh_after_op_toggle(socket, "Op restored — replay applies it")}

      _ ->
        {:noreply, socket}
    end
  end

  # Re-replay the op log from base state and push a fresh map:state so
  # the canvas reflects the inverted/restored bit immediately.
  # Phase 2B follow-through — without this, the user would have to reload.
  def handle_event("templates:open", _params, socket),
    do: {:noreply, assign(socket, :templates_open, true)}

  def handle_event("templates:close", _params, socket),
    do: {:noreply, assign(socket, :templates_open, false)}

  def handle_event("templates:apply_room", %{"key" => key}, socket) do
    template = MapEditorTemplates.room_template(key)
    {ox, oy} = template_paste_origin(socket)

    cells_with_value = template.cells

    case apply_template_stamp(socket.assigns.map, socket.assigns.active_layer, cells_with_value, ox, oy) do
      {:ok, updated_map, op} ->
        socket
        |> assign(:templates_open, false)
        |> commit_op(updated_map, op)

      {:error, _} ->
        {:noreply, assign(socket, :templates_open, false)}
    end
  end

  def handle_event("templates:generate", %{"kind" => kind} = params, socket) do
    map = socket.assigns.map
    seed = if params["seed"] not in [nil, ""], do: to_int(params["seed"]), else: nil

    generated =
      case kind do
        "bsp" -> MapEditorTemplates.bsp_dungeon(map.width, map.height, seed: seed)
        "cave" -> MapEditorTemplates.ca_cave(map.width, map.height, seed: seed)
        "maze" -> MapEditorTemplates.maze(map.width, map.height, seed: seed)
        "town" -> MapEditorTemplates.town(map.width, map.height, seed: seed)
        _ -> nil
      end

    case generated do
      nil ->
        {:noreply, assign(socket, :templates_open, false)}

      gen ->
        op = %{
          op_id: op_id(),
          op_type: "replace_layers",
          prev_layers: map.layers,
          new_layers: %{
            "ground" => gen.ground,
            "overlay" => gen.overlay,
            "passability" => gen.passability,
            "fringe" => Map.get(map.layers, "fringe", List.duplicate(-1, map.width * map.height)),
            "elevation" =>
              if map.render_mode == "2.5d" do
                Enum.map(gen.ground, fn t -> if t == 1, do: 1, else: 0 end)
              else
                List.duplicate(0, map.width * map.height)
              end
          }
        }

        updated = put_in(map.layers, op.new_layers)

        socket
        |> assign(:templates_open, false)
        |> commit_op(updated, op)
    end
  end

  # ── Stamps (named, persisted) ────────────────────────────────

  def handle_event("stamps:open", _params, socket) do
    {:noreply,
     socket
     |> assign(:stamps_open, true)
     |> assign(:saved_stamps, list_saved_stamps(socket.assigns.map.id))}
  end

  def handle_event("stamps:close", _params, socket),
    do: {:noreply, assign(socket, :stamps_open, false)}

  def handle_event("stamps:save", %{"name" => name}, socket) do
    case socket.assigns.select_clipboard do
      nil ->
        {:noreply, assign(socket, :save_status, "Nothing in clipboard to save")}

      clip ->
        case persist_saved_stamp(socket.assigns.map.id, name, socket.assigns.active_layer, clip) do
          :ok ->
            {:noreply,
             socket
             |> assign(:saved_stamps, list_saved_stamps(socket.assigns.map.id))
             |> assign(:save_status, "Stamp saved")}

          {:error, reason} ->
            {:noreply, assign(socket, :save_status, "Stamp save failed: #{inspect(reason)}")}
        end
    end
  end

  def handle_event("stamps:load", %{"id" => id}, socket) do
    case load_saved_stamp(to_int(id)) do
      {:ok, %{layer: layer, clip: clip}} ->
        {:noreply,
         socket
         |> assign(:active_layer, layer)
         |> assign(:select_clipboard, clip)
         |> assign(:stamps_open, false)
         |> assign(:save_status, "Stamp loaded — paste to apply")}

      {:error, _} ->
        {:noreply, assign(socket, :save_status, "Stamp load failed")}
    end
  end

  def handle_event("stamps:delete", %{"id" => id}, socket) do
    delete_saved_stamp(to_int(id))

    {:noreply,
     socket
     |> assign(:saved_stamps, list_saved_stamps(socket.assigns.map.id))}
  end

  # ── Properties + Resize ──────────────────────────────────────

  def handle_event("properties:open", _params, socket),
    do: {:noreply, assign(socket, :properties_open, true)}

  def handle_event("properties:close", _params, socket),
    do: {:noreply, assign(socket, :properties_open, false)}

  def handle_event("properties:save", params, socket) do
    case persist_map_properties(socket.assigns.map.id, params) do
      {:ok, _updated_fields} ->
        # Re-SELECT the full row so every field reflects DB truth, not
        # just the subset the form submitted. Handles columns the user
        # left blank or that have DB-level defaults/triggers.
        new_map = reload_map_full(socket.assigns.map)

        {:noreply,
         socket
         |> assign(:map, new_map)
         |> assign(:properties_open, false)
         |> assign(:save_status, "Properties saved")
         |> push_event("map:state", render_state(new_map, socket.assigns))}

      {:error, reason} ->
        {:noreply, assign(socket, :save_status, "Save failed: #{inspect(reason)}")}
    end
  end

  def handle_event("resize:open", _params, socket),
    do: {:noreply, assign(socket, :resize_open, true)}

  def handle_event("resize:close", _params, socket),
    do: {:noreply, assign(socket, :resize_open, false)}

  # ── Object / Event preset selection (now from right-panel inline) ──

  def handle_event("object_palette:select", %{"key" => key}, socket) do
    {:noreply,
     socket
     |> assign(:active_object_preset, key)
     |> assign(:active_tool, "object")
     |> assign(:object_panel_mode, :place)
     |> assign(:selected_object_id, nil)}
  end

  def handle_event("event_palette:select", %{"kind" => kind}, socket) do
    {:noreply,
     socket
     |> assign(:active_event_kind, kind)
     |> assign(:active_tool, "event")
     |> assign(:event_form, default_event_form(kind))}
  end

  # ── Per-tool panel events ────────────────────────────────────────

  def handle_event("pass:set_paint", %{"value" => v}, socket),
    do: {:noreply, assign(socket, :pass_paint_value, to_int(v))}

  def handle_event("pass:toggle_overlay", _params, socket),
    do: {:noreply, assign(socket, :pass_overlay_visible, !socket.assigns.pass_overlay_visible)}

  def handle_event("elev:set", %{"value" => v}, socket) do
    n = to_int(v) |> max(0) |> min(15)
    {:noreply, assign(socket, :paint_elevation, n)}
  end

  def handle_event("elev:step", %{"dir" => dir}, socket) do
    delta = if dir in ["up", "+"], do: 1, else: -1
    n = (socket.assigns.paint_elevation + delta) |> max(0) |> min(15)
    {:noreply, assign(socket, :paint_elevation, n)}
  end

  def handle_event("event:set_form_field", %{"field" => field, "value" => value}, socket) do
    form = Map.put(socket.assigns.event_form, field, value)
    {:noreply, assign(socket, :event_form, form)}
  end

  def handle_event("object:set_panel_mode", %{"mode" => mode}, socket) do
    m = if mode in ["edit", "Edit"], do: :edit, else: :place
    {:noreply, assign(socket, :object_panel_mode, m)}
  end

  def handle_event("event:set_panel_mode", %{"mode" => mode}, socket) do
    m = if mode in ["edit", "Edit"], do: :edit, else: :place
    {:noreply, assign(socket, :event_panel_mode, m)}
  end

  # Save edits to the currently-selected event. Replaces the data map
  # with the panel form's current state and writes an edit_event op.
  def handle_event("event:save_edit", _params, socket) do
    case socket.assigns[:selected_event_id] do
      nil ->
        {:noreply, assign(socket, :save_status, "No event selected")}

      eid ->
        prev = Enum.find(socket.assigns.events, &(&1.id == eid))
        new_data = socket.assigns[:event_form] || %{}

        events =
          Enum.map(socket.assigns.events, fn ev ->
            if ev.id == eid, do: %{ev | data: new_data}, else: ev
          end)

        persist_map_events(socket.assigns.map.id, events)

        prev_data = (prev && prev.data) || %{}

        {:noreply,
         socket
         |> append_phase2a_op("edit_event", %{
           "event_id" => eid,
           "fields" => %{"data" => new_data},
           "prev_fields" => %{"data" => prev_data}
         })
         |> assign(:events, events)
         |> assign(:dirty?, true)
         |> assign(:save_status, "Event updated")
         |> push_event("map:events", %{events: events})}
    end
  end

  def handle_event("event:delete_selected", _params, socket) do
    case socket.assigns[:selected_event_id] do
      nil ->
        {:noreply, socket}

      eid ->
        prev = Enum.find(socket.assigns.events, &(&1.id == eid))
        events = Enum.reject(socket.assigns.events, &(&1.id == eid))
        persist_map_events(socket.assigns.map.id, events)

        {:noreply,
         socket
         |> append_phase2a_op("delete_event", %{"event_id" => eid, "prev_event" => prev})
         |> assign(:events, events)
         |> assign(:selected_event_id, nil)
         |> assign(:event_panel_mode, :place)
         |> assign(:dirty?, true)
         |> assign(:save_status, "Event deleted")
         |> push_event("map:events", %{events: events})}
    end
  end

  def handle_event("spawn:select_zone", %{"id" => id}, socket) do
    {:noreply,
     socket
     |> assign(:selected_spawn_zone_id, id)
     |> push_event("zones:select", %{kind: "spawn", id: id})}
  end

  # Click on any zone box on the canvas — selects + switches the tool to
  # match (so the right panel shows the zone's editor).
  def handle_event("zone:select", %{"kind" => "spawn", "id" => id}, socket) do
    {:noreply,
     socket
     |> assign(:active_tool, "spawn_zone")
     |> assign(:selected_spawn_zone_id, id)
     |> assign(:selected_sound_zone_id, nil)
     |> push_event("zones:select", %{kind: "spawn", id: id})}
  end

  def handle_event("zone:select", %{"kind" => "sound", "id" => id}, socket) do
    {:noreply,
     socket
     |> assign(:active_tool, "sound_zone")
     |> assign(:selected_sound_zone_id, id)
     |> assign(:selected_spawn_zone_id, nil)
     |> push_event("zones:select", %{kind: "sound", id: id})}
  end

  # Drag-handle resize/move from the canvas. Clamps to map bounds, ensures
  # at least 1×1, persists, logs an edit op, and pushes a fresh zones list.
  def handle_event("zone:update_rect", %{"kind" => kind, "id" => id, "x1" => x1, "y1" => y1, "x2" => x2, "y2" => y2}, socket) do
    map = socket.assigns.map
    cx1 = clamp(to_int(x1), 0, map.width - 1)
    cy1 = clamp(to_int(y1), 0, map.height - 1)
    cx2 = clamp(to_int(x2), 0, map.width - 1)
    cy2 = clamp(to_int(y2), 0, map.height - 1)

    rect = %{
      x1: min(cx1, cx2),
      y1: min(cy1, cy2),
      x2: max(cx1, cx2),
      y2: max(cy1, cy2)
    }

    case kind do
      "spawn" -> apply_zone_rect_update(socket, :spawn, id, rect)
      "sound" -> apply_zone_rect_update(socket, :sound, id, rect)
      _ -> {:noreply, socket}
    end
  end

  def handle_event("spawn:deselect", _params, socket),
    do: {:noreply, assign(socket, :selected_spawn_zone_id, nil)}

  def handle_event("spawn:add_encounter", %{"id" => zone_id}, socket) do
    zones =
      Enum.map(socket.assigns.spawn_zones, fn z ->
        if z.id == zone_id do
          new_row = %{"npc_id" => "", "count" => 1, "level_scaling" => 1.0, "weight" => 1}
          %{z | encounter_table: (z.encounter_table || []) ++ [new_row]}
        else
          z
        end
      end)

    persist_spawn_zones(socket.assigns.map.id, zones)
    {:noreply, assign(socket, :spawn_zones, zones)}
  end

  def handle_event("spawn:set_encounter", %{"id" => zone_id, "row" => row, "field" => field, "value" => value}, socket) do
    row_idx = to_int(row)
    new_value = normalize_encounter_value(field, value)

    # Capture the prev value at the START of an editing session so the
    # debounce buffer's invert-fidelity is correct (deferred 2B.2 follow).
    prev_zone = Enum.find(socket.assigns.spawn_zones, &(&1.id == zone_id))
    prev_row = prev_zone && Enum.at(prev_zone.encounter_table || [], row_idx) || %{}
    prev_value = Map.get(prev_row, field)

    zones =
      Enum.map(socket.assigns.spawn_zones, fn z ->
        if z.id == zone_id do
          updated = List.update_at(z.encounter_table || [], row_idx, fn r ->
            Map.put(r || %{}, field, new_value)
          end)
          %{z | encounter_table: updated}
        else
          z
        end
      end)

    persist_spawn_zones(socket.assigns.map.id, zones)

    {:noreply,
     socket
     |> assign(:spawn_zones, zones)
     |> record_field_edit({:spawn_encounter, "#{zone_id}:#{row_idx}", field}, prev_value, new_value)}
  end

  def handle_event("spawn:remove_encounter", %{"id" => zone_id, "row" => row}, socket) do
    row_idx = to_int(row)

    zones =
      Enum.map(socket.assigns.spawn_zones, fn z ->
        if z.id == zone_id do
          updated = List.delete_at(z.encounter_table || [], row_idx)
          %{z | encounter_table: updated}
        else
          z
        end
      end)

    persist_spawn_zones(socket.assigns.map.id, zones)
    {:noreply, assign(socket, :spawn_zones, zones)}
  end

  def handle_event("spawn:set_field", %{"id" => zone_id, "field" => field, "value" => value}, socket) do
    prev_zone = Enum.find(socket.assigns.spawn_zones, &(&1.id == zone_id))
    prev_value = read_spawn_field(prev_zone, field)
    new_value = normalize_spawn_field(field, value)

    zones =
      Enum.map(socket.assigns.spawn_zones, fn z ->
        if z.id == zone_id, do: write_spawn_field(z, field, new_value), else: z
      end)

    persist_spawn_zones(socket.assigns.map.id, zones)

    {:noreply,
     socket
     |> assign(:spawn_zones, zones)
     # 2B.2: route the op log entry through the debounce buffer so a
     # rapid sequence of keystrokes / slider ticks coalesces into one op.
     |> record_field_edit({:spawn, zone_id, field}, prev_value, new_value)}
  end

  def handle_event("sound:select_zone", %{"id" => id}, socket) do
    {:noreply,
     socket
     |> assign(:selected_sound_zone_id, id)
     |> push_event("zones:select", %{kind: "sound", id: id})}
  end

  def handle_event("sound:deselect", _params, socket),
    do: {:noreply, assign(socket, :selected_sound_zone_id, nil)}

  def handle_event("sound:set_field", %{"id" => zone_id, "field" => field, "value" => value}, socket) do
    prev_zone = Enum.find(socket.assigns.sound_zones, &(&1.id == zone_id))
    prev_value = read_sound_field(prev_zone, field)
    new_value = normalize_sound_field(field, value)

    zones =
      Enum.map(socket.assigns.sound_zones, fn z ->
        if z.id == zone_id, do: write_sound_field(z, field, new_value), else: z
      end)

    persist_sound_zones(socket.assigns.map.id, zones)

    {:noreply,
     socket
     |> assign(:sound_zones, zones)
     |> record_field_edit({:sound, zone_id, field}, prev_value, new_value)
     |> push_event("map:zones", zones_payload(socket.assigns, socket.assigns.spawn_zones, zones))}
  end

  def handle_event("set_spawn", %{"x" => x, "y" => y}, socket) do
    map = socket.assigns.map
    sx = to_int(x) |> max(0) |> min(map.width - 1)
    sy = to_int(y) |> max(0) |> min(map.height - 1)

    case Repo.query("UPDATE game_maps SET spawn_x = ?, spawn_y = ? WHERE id = ?", [sx, sy, map.id]) do
      {:ok, _} ->
        updated_map = %{map | spawn_x: sx, spawn_y: sy}

        {:noreply,
         socket
         |> assign(:map, updated_map)
         |> assign(:save_status, "Spawn set to (#{sx}, #{sy})")
         |> push_event("map:spawn", %{x: sx, y: sy})}

      {:error, _} ->
        {:noreply, assign(socket, :save_status, "Failed to update spawn")}
    end
  end

  def handle_event("event:set_form_field_form", params, socket) do
    case params["_target"] do
      [field] when is_binary(field) ->
        value = Map.get(params, field, "")
        form = Map.put(socket.assigns.event_form, field, value)
        {:noreply, assign(socket, :event_form, form)}

      _ ->
        {:noreply, socket}
    end
  end

  def handle_event("zone:arm_creation", %{"kind" => kind}, socket) when kind in ["spawn_zone", "sound_zone"] do
    {:noreply,
     socket
     |> assign(:zone_creation_armed, true)
     |> assign(:active_tool, kind)
     |> assign(:save_status, "Drag a rectangle on the canvas to draw the zone")}
  end

  # Audio preview for a sound zone. The actual play happens client-side; we
  # push the sound URL and volume so the canvas hook (or a small helper)
  # can play a transient <audio> element. No-op if URL is blank.
  def handle_event("sound:preview", %{"id" => zone_id}, socket) do
    case Enum.find(socket.assigns.sound_zones, &(&1.id == zone_id)) do
      nil ->
        {:noreply, socket}

      %{sound_url: url} when url in [nil, ""] ->
        {:noreply, assign(socket, :save_status, "No URL set for this zone")}

      zone ->
        {:noreply, push_event(socket, "sound:preview", %{url: zone.sound_url, volume: zone.volume})}
    end
  end

  # Save edits to an existing object. Updates label/sprite/data; position
  # is unchanged here (drag-to-move is a future addition).
  def handle_event("object:save_edit", params, socket) do
    id = params["object_id"]

    parsed_data =
      case Jason.decode(params["data_json"] || "") do
        {:ok, m} when is_map(m) -> m
        _ -> %{}
      end

    fields_new = %{
      "label" => params["label"] || "",
      "sprite_url" => params["sprite_url"] || "",
      "data" => parsed_data
    }

    prev_obj = Enum.find(socket.assigns.objects, &(&1.id == id))

    fields_prev =
      case prev_obj do
        nil -> %{}
        o -> %{
          "label" => Map.get(o, :label, ""),
          "sprite_url" => Map.get(o, :sprite_url, ""),
          "data" => Map.get(o, :data, %{}) || %{}
        }
      end

    objects =
      Enum.map(socket.assigns.objects, fn obj ->
        if obj.id == id do
          obj
          |> Map.put(:label, params["label"] || obj.label)
          |> Map.put(:sprite_url, params["sprite_url"] || "")
          |> Map.put(:data, parsed_data)
        else
          obj
        end
      end)

    persist_map_objects(socket.assigns.map.id, objects)

    {:noreply,
     socket
     |> append_phase2a_op("edit_object", %{
       "object_id" => id,
       "fields" => fields_new,
       "prev_fields" => fields_prev
     })
     |> assign(:objects, objects)
     |> assign(:dirty?, true)
     |> assign(:save_status, "Object updated")
     |> push_event("map:state", render_state(socket.assigns.map, %{socket.assigns | objects: objects}))}
  end

  # Save current selection as a named stamp. Reuses persist_saved_stamp/4
  # (clipboard-keyed) but snapshots the selection on the fly so the user
  # doesn't have to Copy first.
  def handle_event("select:save_stamp", %{"name" => name}, socket) do
    case socket.assigns.select_rect do
      nil ->
        {:noreply, assign(socket, :save_status, "No selection to save")}

      rect ->
        layer = socket.assigns.active_layer
        snapshot = snapshot_region(socket.assigns.map, layer, rect)

        case persist_saved_stamp(socket.assigns.map.id, name, layer, snapshot) do
          :ok ->
            {:noreply,
             socket
             |> assign(:saved_stamps, list_saved_stamps(socket.assigns.map.id))
             |> assign(:save_status, "Stamp “#{name}” saved")}

          {:error, reason} ->
            {:noreply, assign(socket, :save_status, "Stamp save failed: #{inspect(reason)}")}
        end
    end
  end

  def handle_event("object:delete", %{"id" => id}, socket) do
    prev_obj = Enum.find(socket.assigns.objects, &(&1.id == id))
    objects = Enum.reject(socket.assigns.objects, &(&1.id == id))
    persist_map_objects(socket.assigns.map.id, objects)

    socket =
      socket
      |> append_phase2a_op("delete_object", %{
        "object_id" => id,
        "prev_object" => prev_obj
      })
      |> assign(:objects, objects)
      |> assign(:dirty?, true)

    {:noreply, push_event(socket, "map:state", render_state(socket.assigns.map, socket.assigns))}
  end

  def handle_event("object:move", %{"id" => id, "x" => x, "y" => y}, socket) do
    x_val = if is_binary(x), do: String.to_integer(x), else: x
    y_val = if is_binary(y), do: String.to_integer(y), else: y
    prev_obj = Enum.find(socket.assigns.objects, &(&1.id == id))

    if prev_obj do
      fields_new = %{"x" => x_val, "y" => y_val}
      fields_prev = %{"x" => prev_obj.x, "y" => prev_obj.y}

      objects =
        Enum.map(socket.assigns.objects, fn obj ->
          if obj.id == id do
            obj
            |> Map.put(:x, x_val)
            |> Map.put(:y, y_val)
          else
            obj
          end
        end)

      persist_map_objects(socket.assigns.map.id, objects)

      socket =
        socket
        |> append_phase2a_op("edit_object", %{
          "object_id" => id,
          "fields" => fields_new,
          "prev_fields" => fields_prev
        })
        |> assign(:objects, objects)
        |> assign(:dirty?, true)
        |> assign(:selected_object_id, id)
        |> push_event("map:state", render_state(socket.assigns.map, %{socket.assigns | objects: objects}))

      {:noreply, socket}
    else
      {:noreply, socket}
    end
  end

  def handle_event("event:link_script", %{"event_id" => eid, "script_id" => sid}, socket) do
    sid_i = if sid in ["", nil], do: nil, else: to_int(sid)

    events =
      Enum.map(socket.assigns.events, fn ev ->
        if ev.id == eid, do: %{ev | script_id: sid_i}, else: ev
      end)

    persist_map_events(socket.assigns.map.id, events)

    {:noreply,
     socket
     |> assign(:events, events)
     |> assign(:event_picker_target, nil)
     |> assign(:dirty?, true)}
  end

  def handle_event("event:picker_close", _params, socket),
    do: {:noreply, assign(socket, :event_picker_target, nil)}

  def handle_event("event:open_picker", %{"id" => id}, socket),
    do: {:noreply, assign(socket, :event_picker_target, id) |> assign(:available_scripts, list_available_scripts())}

  def handle_event("event:delete", %{"id" => id}, socket) do
    events = Enum.reject(socket.assigns.events, &(&1.id == id))
    persist_map_events(socket.assigns.map.id, events)

    {:noreply,
     socket
     |> assign(:events, events)
     |> assign(:dirty?, true)
     |> push_event("map:events", %{events: events})}
  end

  # ── Cell inspector hover ─────────────────────────────────────

  # ── Genre presets + Tiled import (M13) ───────────────────────

  @genre_presets %{
    "classic" => %{render_mode: "classic", label: "Top-Down (Classic / Tabletop)", icon: "🗺️"},
    "elevated" => %{render_mode: "2.5d", label: "Elevated 2.5D (Extruded Depth)", icon: "🏰"},
    "isometric" => %{render_mode: "isometric", label: "Isometric (Grid / Strategy)", icon: "📐"}
  }

  def handle_event("preset:apply", %{"key" => key}, socket) do
    case Map.get(@genre_presets, key) do
      nil ->
        {:noreply, socket}

      preset ->
        case Repo.query("UPDATE game_maps SET render_mode = ? WHERE id = ?", [preset.render_mode, socket.assigns.map.id]) do
          {:ok, _} ->
            map = %{socket.assigns.map | render_mode: preset.render_mode}

            {:noreply,
             socket
             |> assign(:map, map)
             |> assign(:save_status, "Preset applied: #{preset.label}")
             |> push_event("map:set_render_mode", %{mode: preset.render_mode})
             |> push_event("map:state", render_state(map, socket.assigns))}

          _ ->
            {:noreply, assign(socket, :save_status, "Preset apply failed")}
        end
    end
  end

  def handle_event("import_tiled", %{"json" => json}, socket) do
    case parse_tiled_json(json) do
      {:ok, %{width: w, height: h, layers: new_layers}} ->
        map = socket.assigns.map

        op = %{
          op_id: op_id(),
          op_type: "replace_layers",
          prev_layers: map.layers,
          new_layers: new_layers
        }

        updated = %{map | width: w, height: h, layers: new_layers}

        Repo.query("UPDATE game_maps SET width = ?, height = ? WHERE id = ?", [w, h, map.id])

        socket
        |> assign(:save_status, "Tiled map imported (#{w}×#{h})")
        |> commit_op(updated, op)

      {:error, reason} ->
        {:noreply, assign(socket, :save_status, "Tiled import failed: #{reason}")}
    end
  end

  # ── Spawn / Sound zones ──────────────────────────────────────

  def handle_event("zone:cancel", _params, socket),
    do: {:noreply, assign(socket, :pending_zone, nil)}

  def handle_event("zone:save_spawn", params, socket) do
    case socket.assigns.pending_zone do
      %{kind: "spawn_zone", rect: rect} ->
        zone = %{
          id: object_id(),
          rect: rect,
          encounter_table: parse_encounter_table(params["encounter_table"]),
          scaling_factor: parse_float(params["scaling_factor"], 1.0),
          flag: params["flag"] || "",
          enabled: params["enabled"] == "on" or params["enabled"] == "true",
          # 2A.5/E3 defaults
          cooldown_seconds: 30,
          max_concurrent: 4
        }

        zones = [zone | socket.assigns.spawn_zones]
        persist_spawn_zones(socket.assigns.map.id, zones)

        {:noreply,
         socket
         |> append_phase2a_op("place_spawn_zone", %{"zone" => zone})
         |> assign(:spawn_zones, zones)
         |> assign(:pending_zone, nil)
         |> assign(:dirty?, true)
         |> push_event("map:zones", zones_payload(socket.assigns, zones, socket.assigns.sound_zones))}

      _ ->
        {:noreply, socket}
    end
  end

  def handle_event("zone:save_sound", params, socket) do
    case socket.assigns.pending_zone do
      %{kind: "sound_zone", rect: rect} ->
        zone = %{
          id: object_id(),
          rect: rect,
          sound_url: params["sound_url"] || "",
          volume: parse_float(params["volume"], 0.6),
          loop: params["loop"] == "on" or params["loop"] == "true",
          fade_seconds: parse_float(params["fade_seconds"], 1.0)
        }

        zones = [zone | socket.assigns.sound_zones]
        persist_sound_zones(socket.assigns.map.id, zones)

        {:noreply,
         socket
         |> append_phase2a_op("place_sound_zone", %{"zone" => zone})
         |> assign(:sound_zones, zones)
         |> assign(:pending_zone, nil)
         |> assign(:dirty?, true)
         |> push_event("map:zones", zones_payload(socket.assigns, socket.assigns.spawn_zones, zones))}

      _ ->
        {:noreply, socket}
    end
  end

  def handle_event("spawn_zone:delete", %{"id" => id}, socket) do
    prev_zone = Enum.find(socket.assigns.spawn_zones, &(&1.id == id))
    zones = Enum.reject(socket.assigns.spawn_zones, &(&1.id == id))
    persist_spawn_zones(socket.assigns.map.id, zones)
    socket = append_phase2a_op(socket, "delete_spawn_zone", %{"zone_id" => id, "prev_zone" => prev_zone})

    {:noreply,
     socket
     |> assign(:spawn_zones, zones)
     |> push_event("map:zones", zones_payload(socket.assigns, zones, socket.assigns.sound_zones))}
  end

  def handle_event("sound_zone:delete", %{"id" => id}, socket) do
    prev_zone = Enum.find(socket.assigns.sound_zones, &(&1.id == id))
    zones = Enum.reject(socket.assigns.sound_zones, &(&1.id == id))
    persist_sound_zones(socket.assigns.map.id, zones)
    socket = append_phase2a_op(socket, "delete_sound_zone", %{"zone_id" => id, "prev_zone" => prev_zone})

    {:noreply,
     socket
     |> assign(:sound_zones, zones)
     |> push_event("map:zones", zones_payload(socket.assigns, socket.assigns.spawn_zones, zones))}
  end

  # ── Animated tiles ───────────────────────────────────────────

  def handle_event("tile_anim:open", %{"tile_id" => tile_id}, socket) do
    tid = to_int(tile_id)
    existing = Enum.find(socket.assigns.tile_anims, &(&1.tile_id == tid))

    {:noreply,
     socket
     |> assign(:tile_anim_open, true)
     |> assign(:tile_anim_target, existing || %{tile_id: tid, frames: [tid], fps: 6, trigger: "always"})}
  end

  def handle_event("tile_anim:close", _params, socket),
    do: {:noreply, assign(socket, :tile_anim_open, false) |> assign(:tile_anim_target, nil)}

  def handle_event("tile_anim:save", params, socket) do
    target = socket.assigns.tile_anim_target
    frames = parse_int_list(params["frames"])

    anim = %{
      tile_id: target.tile_id,
      frames: if(frames == [], do: [target.tile_id], else: frames),
      fps: parse_float(params["fps"], 6.0),
      trigger: params["trigger"] || "always"
    }

    anims =
      socket.assigns.tile_anims
      |> Enum.reject(&(&1.tile_id == anim.tile_id))
      |> List.insert_at(0, anim)

    persist_tile_anims(socket.assigns.map.id, anims)

    socket =
      socket
      |> assign(:tile_anims, anims)
      |> assign(:tile_anim_open, false)
      |> assign(:tile_anim_target, nil)
      |> assign(:dirty?, true)
      |> assign(:save_status, "Tile animation saved")

    {:noreply, push_event(socket, "map:state", render_state(socket.assigns.map, socket.assigns))}
  end

  def handle_event("tile_anim:delete", %{"tile_id" => tid}, socket) do
    n = to_int(tid)
    anims = Enum.reject(socket.assigns.tile_anims, &(&1.tile_id == n))
    persist_tile_anims(socket.assigns.map.id, anims)

    {:noreply,
     socket
     |> assign(:tile_anims, anims)
     |> assign(:save_status, "Tile animation removed")}
  end

  # ── Playtest-in-editor ───────────────────────────────────────

  # D10v2: playmode initial position uses the persisted spawn point
  # (set via the Spawn tool). Falls back to first walkable tile, then
  # to map center, if no spawn is set. spawn_x/spawn_y is NEVER mutated
  # by playmode — it's a fixed start tile per the D10 contract.
  def handle_event("play:start", _params, socket) do
    map = socket.assigns.map

    {sx, sy} =
      cond do
        is_integer(map.spawn_x) and is_integer(map.spawn_y) ->
          {map.spawn_x, map.spawn_y}

        true ->
          first_walkable(map) || {div(map.width, 2), div(map.height, 2)}
      end

    socket =
      socket
      |> assign(:play_mode, true)
      |> assign(:play_x, sx)
      |> assign(:play_y, sy)

    {:noreply,
     socket
     |> push_event("map:set_canvas_mode", %{mode: "play"})
     |> push_event("map:state", render_state(map, socket.assigns))}
  end

  def handle_event("play:stop", _params, socket) do
    socket = assign(socket, :play_mode, false)

    {:noreply,
     socket
     |> push_event("map:set_canvas_mode", %{mode: "edit"})
     |> push_event("map:state", render_state(socket.assigns.map, socket.assigns))}
  end

  # D10 invariant: play:step writes ONLY to the transient :play_x / :play_y
  # assigns. It must NEVER touch :spawn_x / :spawn_y (those are persisted
  # on the map row and represent the fixed start tile). Covered by the
  # MapOps test "set_spawn does NOT touch :play_x / :play_y" — and by
  # this code review check: grep for `spawn_x` in this clause; expected: 0.
  def handle_event("play:step", %{"dx" => dx, "dy" => dy}, socket) do
    if socket.assigns.play_mode do
      map = socket.assigns.map
      nx = socket.assigns.play_x + to_int(dx)
      ny = socket.assigns.play_y + to_int(dy)

      cond do
        nx < 0 or ny < 0 or nx >= map.width or ny >= map.height ->
          {:noreply, socket}

        playable_tile?(map, nx, ny) ->
          flash = collide_event_at(socket, nx, ny)

          socket =
            socket
            |> assign(:play_x, nx)
            |> assign(:play_y, ny)

          socket =
            case flash do
              nil -> socket
              msg -> put_flash(socket, :info, msg)
            end

          {:noreply, push_event(socket, "map:state", render_state(map, socket.assigns))}

        true ->
          {:noreply, socket}
      end
    else
      {:noreply, socket}
    end
  end

  # ── Export / Import ──────────────────────────────────────────

  def handle_event("export_map", _params, socket) do
    payload = %{
      version: 2,
      map: %{
        id: socket.assigns.map.id,
        name: socket.assigns.map.name,
        width: socket.assigns.map.width,
        height: socket.assigns.map.height,
        render_mode: socket.assigns.map.render_mode,
        layers: socket.assigns.map.layers,
        objects: socket.assigns.objects,
        events: socket.assigns.events
      }
    }

    json = Jason.encode!(payload, pretty: true)

    {:noreply,
     push_event(socket, "download", %{
       filename: "map-#{socket.assigns.map.id}-#{socket.assigns.map.name}.json",
       content: json,
       mime: "application/json"
     })}
  end

  def handle_event("import_map", %{"json" => json}, socket) do
    case Jason.decode(json) do
      {:ok, %{"map" => imported}} ->
        layers = imported["layers"] || %{}
        objects = (imported["objects"] || []) |> Enum.map(&normalize_object/1)
        events = (imported["events"] || []) |> Enum.map(&normalize_event/1)

        new_map_layers = %{
          "ground" => Map.get(layers, "ground", []),
          "overlay" => Map.get(layers, "overlay", []),
          "passability" => Map.get(layers, "passability", []),
          "fringe" => Map.get(layers, "fringe", []),
          "elevation" => Map.get(layers, "elevation", [])
        }

        op = %{
          op_id: op_id(),
          op_type: "replace_layers",
          prev_layers: socket.assigns.map.layers,
          new_layers: new_map_layers
        }

        updated = put_in(socket.assigns.map.layers, new_map_layers)

        persist_map_objects(updated.id, objects)
        persist_map_events(updated.id, events)

        socket
        |> assign(:objects, objects)
        |> assign(:events, events)
        |> commit_op(updated, op)

      _ ->
        {:noreply, assign(socket, :save_status, "Import failed: bad JSON")}
    end
  end

  def handle_event("minimap_click", %{"x" => x, "y" => y}, socket) do
    nx = clamp(to_int(x), 0, socket.assigns.map.width - 1)
    ny = clamp(to_int(y), 0, socket.assigns.map.height - 1)

    socket =
      if socket.assigns.play_mode do
        # In play mode the click jumps the player avatar
        socket
        |> assign(:play_x, nx)
        |> assign(:play_y, ny)
      else
        # In edit mode it pans the camera
        socket
        |> assign(:cam_x, nx)
        |> assign(:cam_y, ny)
      end

    {:noreply, push_event(socket, "map:state", render_state(socket.assigns.map, socket.assigns))}
  end

  def handle_event("hover_tile", %{"x" => x, "y" => y}, socket) do
    {:noreply, assign(socket, :hover_tile, %{x: to_int(x), y: to_int(y)})}
  end

  def handle_event("inspector:toggle", _params, socket),
    do: {:noreply, assign(socket, :inspector_open, !socket.assigns.inspector_open)}

  # ── Grid toggle ──
  def handle_event("toggle_grid", _params, socket) do
    {:noreply, assign(socket, :show_grid, !Map.get(socket.assigns, :show_grid, false))}
  end

  # ── Fit to Screen — tells the canvas hook to resize the Pixi backing
  # buffer to the available container space, preserving map aspect ratio.
  def handle_event("fit_to_screen", _params, socket) do
    {:noreply, push_event(socket, "fit_to_screen", %{})}
  end

  # ── Right-click eyedropper ──
  def handle_event("eyedrop_tile", %{"x" => x, "y" => y}, socket) do
    tx = to_int(x)
    ty = to_int(y)
    map = socket.assigns.map
    layer = socket.assigns.active_layer
    layer_data = map.layers[layer] || []
    idx = ty * map.width + tx
    tile_id = Enum.at(layer_data, idx) || 0
    {:noreply, assign(socket, :brush_tile_id, tile_id)}
  end

  # ── Pan camera ──
  def handle_event("pan", %{"dx" => dx, "dy" => dy}, socket) do
    cam_x = (socket.assigns.cam_x || 0) + (dx || 0)
    cam_y = (socket.assigns.cam_y || 0) + (dy || 0)
    map = socket.assigns.map
    cam_x = max(0, min(cam_x, map.width - 1))
    cam_y = max(0, min(cam_y, map.height - 1))
    {:noreply,
     socket
     |> assign(:cam_x, cam_x)
     |> assign(:cam_y, cam_y)
     |> push_event("map:state", render_state(map, %{socket.assigns | cam_x: cam_x, cam_y: cam_y}))}
  end

  # ── Room/building tool ──
  # Creates a walled room with floor and optional door.
  # wall_tile = tile ID for walls, floor_tile = tile ID for floor
  def handle_event("room:create", %{"x1" => x1, "y1" => y1, "x2" => x2, "y2" => y2} = params, socket) do
    ax = min(to_int(x1), to_int(x2))
    ay = min(to_int(y1), to_int(y2))
    bx = max(to_int(x1), to_int(x2))
    by = max(to_int(y1), to_int(y2))
    wall_tile = to_int(params["wall_tile"] || "1")
    floor_tile = to_int(params["floor_tile"] || "4")
    door_side = params["door_side"] || "south"
    map = socket.assigns.map

    # Build the room: walls around perimeter, floor inside
    ground = map.layers["ground"] || List.duplicate(0, map.width * map.height)
    passability = map.layers["passability"] || List.duplicate(0, map.width * map.height)

    {ground, passability} = Enum.reduce(ay..by, {ground, passability}, fn y, {g, p} ->
      Enum.reduce(ax..bx, {g, p}, fn x, {g2, p2} ->
        idx = y * map.width + x
        is_wall = x == ax || x == bx || y == ay || y == by
        tile = if is_wall, do: wall_tile, else: floor_tile
        pass = if is_wall, do: 1, else: 0
        {List.replace_at(g2, idx, tile), List.replace_at(p2, idx, pass)}
      end)
    end)

    # Add door (walkable gap in the wall)
    door_pos = case door_side do
      "north" -> {div(ax + bx, 2), ay}
      "south" -> {div(ax + bx, 2), by}
      "east" -> {bx, div(ay + by, 2)}
      "west" -> {ax, div(ay + by, 2)}
      _ -> {div(ax + bx, 2), by}
    end

    {dx, dy} = door_pos
    door_idx = dy * map.width + dx
    ground = List.replace_at(ground, door_idx, floor_tile)
    passability = List.replace_at(passability, door_idx, 0)

    updated_layers = map.layers
      |> Map.put("ground", ground)
      |> Map.put("passability", passability)
    updated_map = %{map | layers: updated_layers}

    commit_op(socket, "room", %{x1: ax, y1: ay, x2: bx, y2: by, wall: wall_tile, floor: floor_tile})

    {:noreply,
     socket
     |> assign(:map, updated_map)
     |> assign(:dirty?, true)
     |> push_event("map:state", render_state(updated_map, socket.assigns))}
  end

  def handle_event("resize:apply", %{"new_w" => nw, "new_h" => nh, "anchor" => anchor}, socket) do
    new_w = clamp(to_int(nw), 5, 200)
    new_h = clamp(to_int(nh), 5, 200)

    updated_map = resize_map(socket.assigns.map, new_w, new_h, anchor)

    case persist_resize(updated_map) do
      :ok ->
        {:noreply,
         socket
         |> assign(:map, updated_map)
         |> assign(:resize_open, false)
         |> assign(:dirty?, false)
         |> assign(:save_status, "Resized to #{new_w}×#{new_h}")
         |> push_event("map:state", render_state(updated_map, socket.assigns))}

      {:error, reason} ->
        {:noreply,
         socket
         |> assign(:save_status, "Resize failed: #{inspect(reason)}")}
    end
  end

  def handle_event("history:restore", %{"version_id" => vid}, socket) do
    case restore_version(socket.assigns.map.id, to_int(vid)) do
      {:ok, layers} ->
        map = put_in(socket.assigns.map.layers, layers)

        {:noreply,
         socket
         |> assign(:map, map)
         |> assign(:history_open, false)
         |> assign(:dirty?, true)
         |> assign(:save_status, "Version restored.")
         |> push_event("map:state", render_state(map, socket.assigns))}

      {:error, _} ->
        {:noreply, assign(socket, :save_status, "Restore failed")}
    end
  end

  def handle_event("save", _params, socket) do
    case flush_draft(socket.assigns.map) do
      :ok ->
        {:noreply,
         socket
         |> assign(:dirty?, false)
         |> assign(:save_status, "Saved.")
         |> put_flash(:info, "Map saved.")}

      {:error, reason} ->
        {:noreply, assign(socket, :save_status, "Error: #{reason}")}
    end
  end

  def handle_event("explore", _payload, socket), do: {:noreply, socket}

  def handle_event("cursor_move", %{"x" => x, "y" => y}, socket) do
    cursor = %{
      id: socket.assigns.editor_id,
      name: socket.assigns[:session_username] || "Staff",
      color: socket.assigns.editor_color,
      x: to_int(x),
      y: to_int(y),
      tool: socket.assigns.active_tool,
      layer: socket.assigns.active_layer
    }

    Phoenix.PubSub.broadcast_from(
      TePhoenix.PubSub,
      self(),
      "map:#{socket.assigns.map.id}:editor",
      {:remote_cursor, cursor}
    )

    {:noreply, socket}
  end

  def handle_event(_unhandled, _params, socket), do: {:noreply, socket}

  defp reload_map_full(map) do
    case Repo.query(
           "SELECT name, width, height, render_mode, schema_version, layers_json, tiles_json, description, ambient_dark, min_level, tileset_url FROM game_maps WHERE id = ?",
           [map.id]
         ) do
      {:ok, %{rows: [[name, w, h, render_mode, schema_v, lj, tj, description, ambient_dark, min_level, tileset_url]]}} ->
        layers = parse_layers(lj, tj, w, h)

        map
        |> Map.put(:name, name)
        |> Map.put(:width, w)
        |> Map.put(:height, h)
        |> Map.put(:render_mode, render_mode || "classic")
        |> Map.put(:schema_version, schema_v || 1)
        |> Map.put(:layers, layers)
        |> Map.put(:description, description)
        |> Map.put(:ambient_dark, ambient_dark)
        |> Map.put(:min_level, min_level)
        |> Map.put(:tileset_url, tileset_url)

      _ ->
        map
    end
  rescue
    _ -> map
  end

  defp first_walkable(map) do
    pass = Map.get(map.layers, "passability", [])

    Enum.find_value(0..(map.width * map.height - 1), nil, fn idx ->
      case Enum.at(pass, idx, 0) do
        0 -> {rem(idx, map.width), div(idx, map.width)}
        _ -> nil
      end
    end)
  end

  defp playable_tile?(map, x, y) do
    case Enum.at(Map.get(map.layers, "passability", []), y * map.width + x, 0) do
      0 -> true
      2 -> true
      _ -> false
    end
  end

  defp collide_event_at(socket, x, y) do
    case Enum.find(socket.assigns.events, &(&1.x == x and &1.y == y)) do
      nil ->
        nil

      ev ->
        case ev.script_id do
          nil ->
            "Triggered #{ev.kind} event at (#{x},#{y}) (no script linked)"

          sid ->
            run_event_script(sid, ev, socket)
        end
    end
  end

  defp run_event_script(script_id, ev, _socket) do
    # Playtest runs the interpreter in a supervised Task so any blocking
    # node (wait, npc_talk, choice) never freezes the editor LiveView.
    # The Task result is collected synchronously but bounded — the
    # editor's playtest can afford a few hundred ms of blocking; the
    # PRODUCTION path uses PlayerChannel and never waits on the Task.
    case Repo.query("SELECT name, graph_json FROM game_visual_scripts WHERE id = ?", [script_id]) do
      {:ok, %{rows: [[name, json]]}} ->
        case Jason.decode(json || "{}") do
          {:ok, graph} ->
            task =
              Task.async(fn ->
                TePhoenix.Game.ScriptInterpreter.run(graph,
                  effects: &TePhoenix.Game.ScriptInterpreter.dry_run_effect/2)
              end)

            case Task.yield(task, 500) || Task.shutdown(task, :brutal_kill) do
              {:ok, {:ok, %{trace: trace}}} ->
                "▶ #{name}: #{length(trace)} steps · #{Enum.map_join(Enum.take(trace, 5), " → ", & &1.type)}"

              {:ok, {:error, reason, _}} ->
                "▶ #{name}: error #{inspect(reason)}"

              nil ->
                "▶ #{name}: still running (async — use PlayerChannel for full run)"

              _ ->
                "▶ #{name}: crashed"
            end

          _ ->
            "Triggered #{ev.kind} (script #{script_id} unparseable)"
        end

      _ ->
        "Triggered #{ev.kind} (script #{script_id} not found)"
    end
  rescue
    _ -> "Triggered #{ev.kind} (script run failed)"
  end

  defp genre_presets, do: @genre_presets

  # Parse a Tiled .tmj (JSON) export. Supports orthogonal maps with at least
  # one tile layer. Tile gids are 1-indexed in Tiled; we subtract 1 to match
  # our 0-indexed convention. Empty cells (gid 0 in Tiled) become -1 on
  # overlay/fringe and 0 on ground.
  defp parse_tiled_json(json) do
    case Jason.decode(json) do
      {:ok, %{"width" => w, "height" => h, "layers" => tiled_layers}} when is_list(tiled_layers) ->
        tile_layers =
          Enum.filter(tiled_layers, fn l -> Map.get(l, "type") == "tilelayer" and is_list(Map.get(l, "data")) end)

        if tile_layers == [] do
          {:error, "no tile layers in file"}
        else
          [first | rest] = tile_layers

          ground = first["data"] |> Enum.map(fn gid -> if gid > 0, do: gid - 1, else: 0 end)

          overlay =
            case rest do
              [%{"data" => d} | _] -> d |> Enum.map(fn gid -> if gid > 0, do: gid - 1, else: -1 end)
              _ -> List.duplicate(-1, w * h)
            end

          fringe =
            case Enum.drop(rest, 1) do
              [%{"data" => d} | _] -> d |> Enum.map(fn gid -> if gid > 0, do: gid - 1, else: -1 end)
              _ -> List.duplicate(-1, w * h)
            end

          {:ok,
           %{
             width: w,
             height: h,
             layers: %{
               "ground" => ground,
               "overlay" => overlay,
               "fringe" => fringe,
               "passability" => List.duplicate(0, w * h),
               "elevation" => List.duplicate(0, w * h)
             }
           }}
        end

      {:ok, _} ->
        {:error, "missing width/height/layers"}

      {:error, _} ->
        {:error, "invalid JSON"}
    end
  end

  # ── Tool click dispatch ────────────────────────────────────

  # Rect tool: two-click rectangle. First click sets the anchor and asks
  # the client to draw a live preview; second click commits the fill.
  defp handle_tool_click("rect", x, y, socket) do
    case socket.assigns.rect_anchor do
      nil ->
        {:noreply,
         socket
         |> assign(:rect_anchor, {x, y})
         |> push_event("edit:set_preview", %{kind: "rect", anchor: %{x: x, y: y}})}

      {ax, ay} ->
        commit_rect(socket, ax, ay, x, y)
    end
  end

  # Select tool: first click anchors marquee, second click commits the
  # selection rect. Clicking again when a selection exists clears it.
  defp handle_tool_click("select", x, y, socket) do
    case {socket.assigns.select_rect, socket.assigns.rect_anchor} do
      {nil, nil} ->
        {:noreply,
         socket
         |> assign(:rect_anchor, {x, y})
         |> push_event("edit:set_preview", %{kind: "select", anchor: %{x: x, y: y}})}

      {nil, {ax, ay}} ->
        x1 = min(ax, x)
        y1 = min(ay, y)
        x2 = max(ax, x)
        y2 = max(ay, y)

        {:noreply,
         socket
         |> assign(:rect_anchor, nil)
         |> assign(:select_rect, %{x1: x1, y1: y1, x2: x2, y2: y2})
         |> push_event("edit:set_preview", %{
           kind: "selected",
           rect: %{x1: x1, y1: y1, x2: x2, y2: y2}
         })}

      {_existing, _} ->
        {:noreply,
         socket
         |> assign(:select_rect, nil)
         |> assign(:rect_anchor, nil)
         |> push_event("edit:set_preview", %{kind: nil})}
    end
  end

  # D10: Spawn tool's primary action is set_spawn (single tile). Zone
  # creation is opt-in via the right panel's "+ New zone" button which
  # sets :zone_creation_armed=true. Once armed, the next two clicks
  # create a zone (existing 2-click drag-rect flow), then disarm.
  defp handle_tool_click("spawn_zone", x, y, socket) do
    cond do
      socket.assigns.zone_anchor != nil or socket.assigns.zone_creation_armed ->
        handle_zone_tool_click("spawn_zone", x, y, socket)

      true ->
        handle_set_spawn(x, y, socket)
    end
  end

  defp handle_tool_click("sound_zone", x, y, socket),
    do: handle_zone_tool_click("sound_zone", x, y, socket)

  defp handle_tool_click("object", x, y, socket) do
    case Enum.find(socket.assigns.objects, fn obj -> obj.x == x and obj.y == y end) do
      nil ->
        preset = object_preset(socket.assigns.active_object_preset)
        object = %{
          id: object_id(),
          x: x,
          y: y,
          preset: preset.key,
          label: preset.label,
          icon: preset.icon,
          group: preset.group,
          blocking: preset.blocking
        }

        object = if light = preset[:light], do: Map.put(object, :light, light), else: object

        objects = [object | socket.assigns.objects]
        persist_map_objects(socket.assigns.map.id, objects)

        socket =
          socket
          |> append_phase2a_op("place_object", %{"object" => object})
          |> assign(:objects, objects)
          |> assign(:dirty?, true)
          |> assign(:selected_object_id, object.id)
          |> assign(:object_panel_mode, :edit)
          |> push_event("object:select", %{id: object.id})

        {:noreply, push_event(socket, "map:state", render_state(socket.assigns.map, socket.assigns))}

      existing ->
        socket =
          socket
          |> assign(:selected_object_id, existing.id)
          |> assign(:object_panel_mode, :edit)
          |> push_event("object:select", %{id: existing.id})

        {:noreply, socket}
    end
  end

  defp handle_tool_click("event", x, y, socket) do
    # 2A.5 / E2 Edit mode: clicking on an existing event tile selects it
    # for editing instead of placing a new one. Otherwise, place a new
    # event with the panel's current kind + form data.
    case Enum.find(socket.assigns.events, fn ev -> ev.x == x and ev.y == y end) do
      nil ->
        place_new_event(x, y, socket)

      existing ->
        # Pre-populate the form with the selected event's data so the
        # Edit tab shows the right values.
        form =
          case existing.data do
            m when is_map(m) -> m
            _ -> default_event_form(existing.kind)
          end

        {:noreply,
         socket
         |> assign(:selected_event_id, existing.id)
         |> assign(:event_panel_mode, :edit)
         |> assign(:active_event_kind, existing.kind)
         |> assign(:event_form, form)}
    end
  end

  defp handle_tool_click("brush", x, y, socket) do
    paint_with_brush(socket, x, y, socket.assigns.brush_tile_id)
  end

  defp handle_tool_click("eraser", x, y, socket) do
    layer = socket.assigns.active_layer
    paint_with_brush(socket, x, y, empty_value_for(layer))
  end

  defp handle_tool_click("autotile", x, y, socket) do
    map = socket.assigns.map
    layer = socket.assigns.active_layer
    brush = socket.assigns.brush_tile_id
    groups = socket.assigns.autotile_groups

    result =
      case find_autotile_group(groups, brush) do
        nil -> set_tile(map, layer, x, y, brush)
        group -> autotile_paint(map, layer, x, y, group)
      end

    case result do
      {:ok, updated_map, op} -> commit_op(socket, updated_map, op)
      {:error, _} -> {:noreply, socket}
    end
  end

  # Phase 2A: passability paints the panel-selected value (0=passable / 1=blocked)
  # rather than cycling through 0/1/2. The Pass right-panel makes the choice
  # explicit so users don't have to triple-click to get back where they started.
  defp handle_tool_click("passability", x, y, socket) do
    case set_tile(socket.assigns.map, "passability", x, y, socket.assigns.pass_paint_value) do
      {:ok, updated_map, op} -> commit_op(socket, updated_map, op)
      {:error, _} -> {:noreply, socket}
    end
  end

  # Phase 2A: elevation paints the panel-selected value (0..15) rather than
  # cycling 0..3. Wider range reflects the renderer's full elevation support.
  defp handle_tool_click("elevation", x, y, socket) do
    case set_tile(socket.assigns.map, "elevation", x, y, socket.assigns.paint_elevation) do
      {:ok, updated_map, op} -> commit_op(socket, updated_map, op)
      {:error, _} -> {:noreply, socket}
    end
  end

  defp handle_tool_click(tool, x, y, socket) do
    map = socket.assigns.map
    layer = socket.assigns.active_layer
    brush = socket.assigns.brush_tile_id

    case apply_tool(tool, map, layer, x, y, brush) do
      {:ok, updated_map, op} ->
        commit_op(socket, updated_map, op)

      :eyedrop ->
        tile_id = read_tile(map, layer, x, y)
        {:noreply, assign(socket, :brush_tile_id, tile_id)}

      {:error, _} ->
        {:noreply, socket}
    end
  end

  # Brush footprint for size N. `size` is the diameter; all sizes are odd
  # so the brush is symmetrically centered on (x,y).
  #   1 → a single cell at (x,y)
  #   3 → a 3×3 square centered on (x,y)
  #   5 → a 5×5 disc-ish centered on (x,y) with the four corners removed
  #   7 → a 7×7 disc-ish centered on (x,y) with the four corners removed
  defp brush_cells(1, x, y), do: [{x, y}]

  defp brush_cells(3, x, y), do: for(dy <- -1..1, dx <- -1..1, do: {x + dx, y + dy})

  defp brush_cells(5, x, y) do
    for dy <- -2..2, dx <- -2..2, not (abs(dx) == 2 and abs(dy) == 2), do: {x + dx, y + dy}
  end

  defp brush_cells(7, x, y) do
    for dy <- -3..3, dx <- -3..3, not (abs(dx) == 3 and abs(dy) == 3), do: {x + dx, y + dy}
  end

  defp brush_cells(_, x, y), do: [{x, y}]

  defp paint_with_brush(socket, x, y, value) do
    map = socket.assigns.map
    layer = socket.assigns.active_layer
    size = socket.assigns.brush_size

    case apply_brush_stamp(map, layer, brush_cells(size, x, y), value) do
      {:ok, updated_map, op} -> commit_op(socket, updated_map, op)
      {:error, _} -> {:noreply, socket}
    end
  end

  defp apply_brush_stamp(map, layer, cells, value) do
    layer_data = Map.get(map.layers, layer, [])

    {new_layer, recorded} =
      Enum.reduce(cells, {layer_data, []}, fn {tx, ty}, {d, c} ->
        cond do
          tx < 0 or ty < 0 or tx >= map.width or ty >= map.height ->
            {d, c}

          true ->
            idx = ty * map.width + tx
            prev = Enum.at(d, idx, 0)

            if prev == value do
              {d, c}
            else
              {List.replace_at(d, idx, value), [%{x: tx, y: ty, prev: prev, value: value} | c]}
            end
        end
      end)

    if recorded == [] do
      {:error, :nochange}
    else
      updated = put_in(map.layers[layer], new_layer)

      op = %{
        op_id: op_id(),
        op_type: "stamp",
        layer: layer,
        cells: Enum.reverse(recorded)
      }

      {:ok, updated, op}
    end
  end

  defp commit_op(socket, updated_map, op) do
    # Phase 2B.3: thread the op record (sequence/op_id/user_name) through
    # broadcast so receivers can update their History drawers without a
    # round-trip refetch. originator_id lets us skip our own broadcast.
    record =
      case persist_op(updated_map.id, op) do
        {:ok, persisted} -> persisted
        _ -> nil
      end

    broadcast_op(updated_map.id, op, record, socket.assigns[:editor_id])

    undo_stack = [op | Enum.take(socket.assigns.undo_stack, 49)]
    persist_draft_stacks(updated_map.id, undo_stack, [])

    new_head = (record && record.sequence) || updated_map[:head_seq] || 0

    {:noreply,
     socket
     |> assign(:map, Map.put(updated_map, :head_seq, max(new_head, updated_map[:head_seq] || 0)))
     |> assign(:dirty?, true)
     |> assign(:undo_stack, undo_stack)
     |> assign(:redo_stack, [])
     |> push_event("map:state", render_state(updated_map, socket.assigns))}
  end

  defp commit_rect(socket, ax, ay, bx, by) do
    map = socket.assigns.map
    layer = socket.assigns.active_layer
    brush = socket.assigns.brush_tile_id

    case apply_rect(map, layer, ax, ay, bx, by, brush) do
      {:ok, updated_map, op} ->
        socket
        |> assign(:rect_anchor, nil)
        |> push_event("edit:set_preview", %{kind: nil})
        |> commit_op(updated_map, op)

      {:error, _} ->
        {:noreply,
         socket
         |> assign(:rect_anchor, nil)
         |> push_event("edit:set_preview", %{kind: nil})}
    end
  end

  # ── PubSub — remote editor_op from another editor ──────────

  @impl true
  def handle_info({:remote_editor_op, %{originator_id: oid} = msg}, socket) when is_binary(oid) do
    # Skip our own broadcast (we already applied it locally in commit_op).
    if oid == socket.assigns[:editor_id] do
      {:noreply, socket}
    else
      apply_remote_msg(msg, socket)
    end
  end

  # New envelope format with no originator (e.g. server-side scripted ops).
  def handle_info({:remote_editor_op, %{patch: _} = msg}, socket),
    do: apply_remote_msg(msg, socket)

  # Legacy shape: raw patch without envelope. Pre-2B.3 producers send this.
  def handle_info({:remote_editor_op, op}, socket) when is_map(op),
    do: apply_remote_msg(%{patch: op, record: nil, originator_id: nil}, socket)

  # 2B.2: debounce timer fired — commit the buffered field-op.
  def handle_info({:flush_field_op, key}, socket),
    do: {:noreply, flush_field_op(socket, key)}

  # Phase 2B.3: apply remote op to local state AND keep the History drawer
  # / head_seq fresh so two concurrent editors see the same op log.
  def handle_info({:remote_cursor, cursor}, socket) do
    remote = Map.put(socket.assigns.remote_cursors, cursor.id, cursor)

    {:noreply,
     socket
     |> assign(:remote_cursors, remote)
     |> push_event("map:cursors", %{cursors: Map.values(remote)})}
  end

  def handle_info(%{event: "presence_diff", payload: %{leaves: leaves}}, socket) do
    remote =
      Enum.reduce(Map.keys(leaves), socket.assigns.remote_cursors, fn id, acc ->
        Map.delete(acc, id)
      end)

    {:noreply,
     socket
     |> assign(:remote_cursors, remote)
     |> push_event("map:cursors", %{cursors: Map.values(remote)})}
  end

  def handle_info(_msg, socket), do: {:noreply, socket}

  # ── Render ─────────────────────────────────────────────────

  @impl true
  def render(assigns) do
    ~H"""
    <div class="flex" style="height: calc(100vh - 40px); margin: -1rem -1.5rem;">
      <!-- Left: Layer panel -->
      <div class="w-48 bg-zinc-900/80 border-r border-zinc-800 flex flex-col shrink-0 overflow-y-auto">
        <div class="px-3 py-2 border-b border-zinc-800">
          <a href={~p"/sauce/world"} class="text-[10px] text-zinc-500 hover:text-zinc-300">
            ← Back to Maps
          </a>
          <h2 class="text-sm font-bold text-amber-400 mt-1 truncate">{@map.name}</h2>
          <p class="text-[10px] text-zinc-500">{@map.width}×{@map.height} · {@map.render_mode || "classic"}</p>
        </div>

        <div class="px-3 py-1.5">
          <span class="text-[10px] font-bold uppercase tracking-widest text-zinc-600/50">Layers</span>
        </div>
        <div :for={layer <- layer_names()}
          class={["flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-zinc-800/50 transition-colors",
            @active_layer == layer && "bg-amber-900/30"]}
          phx-click="select_layer" phx-value-layer={layer}>
          <button phx-click="toggle_layer_visibility" phx-value-layer={layer}
            class={["w-4 h-4 rounded border text-[8px] flex items-center justify-center shrink-0",
              Map.get(@layer_visibility, layer, true) && "border-amber-500 text-amber-500",
              !Map.get(@layer_visibility, layer, true) && "border-zinc-700 text-zinc-700"]}>
            {if Map.get(@layer_visibility, layer, true), do: "●", else: "○"}
          </button>
          <span class={["text-xs truncate",
            @active_layer == layer && "text-amber-300 font-medium",
            @active_layer != layer && "text-zinc-400"]}>{layer}</span>
        </div>

        <div class="mt-auto px-3 py-2 border-t border-zinc-800 text-[9px] text-zinc-600/50">
          Map Editor · v0.1
        </div>
      </div>

      <!-- Center: Toolbar + Canvas -->
      <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
        <!-- Top toolbar -->
        <div class="flex flex-wrap items-center gap-1 px-3 py-1.5 bg-zinc-900/80 border-b border-zinc-800 shrink-0">
          <button :for={tool <- @tools}
            phx-click="select_tool" phx-value-tool={tool.key}
            title={tool.label}
            class={["px-2 py-1.5 rounded text-xs transition-colors flex items-center gap-1",
              @active_tool == tool.key && "bg-amber-600 text-black font-bold",
              @active_tool != tool.key && "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"]}>
            <span>{tool.icon}</span>
            <span class="hidden md:inline">{tool.label}</span>
          </button>

          <div class="mx-2 h-5 w-px bg-zinc-700"></div>

          <button phx-click="undo" phx-window-keydown="undo" phx-key="z"
            title="Undo (Ctrl+Z)"
            disabled={@undo_stack == []}
            class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed">
            ↶ Undo
          </button>
          <button phx-click="redo"
            title="Redo (Ctrl+Shift+Z)"
            disabled={@redo_stack == []}
            class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed">
            ↷ Redo
          </button>

          <div class="mx-2 h-5 w-px bg-zinc-700"></div>

          <div class="flex items-center gap-1 text-xs text-zinc-400">
            <span>Brush:</span>
            <span class="px-2 py-1 bg-zinc-800 rounded font-mono text-amber-400">
              tile #{@brush_tile_id}
            </span>
          </div>

          <div class="flex items-center gap-0.5 ml-1">
            <span class="text-[10px] text-zinc-500 mr-1">Size</span>
            <button :for={n <- [1, 3, 5, 7]}
              phx-click="set_brush_size" phx-value-size={n}
              title={"Brush size #{n}"}
              class={["w-6 h-6 rounded text-[10px] font-bold transition-colors",
                @brush_size == n && "bg-amber-600 text-black",
                @brush_size != n && "bg-zinc-800 hover:bg-zinc-700 text-zinc-400"]}>
              {n}
            </button>
          </div>

          <div :if={@select_rect} class="mx-2 h-5 w-px bg-zinc-700"></div>
          <div :if={@select_rect} class="flex items-center gap-1">
            <button phx-click="select:copy" title="Copy (Ctrl+C)"
              class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-blue-700 text-zinc-300">📋 Copy</button>
            <button phx-click="select:cut" title="Cut (Ctrl+X)"
              class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-blue-700 text-zinc-300">✂ Cut</button>
            <button phx-click="select:paste" title="Paste (Ctrl+V)" disabled={is_nil(@select_clipboard)}
              class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-blue-700 text-zinc-300 disabled:opacity-40">📄 Paste</button>
            <button phx-click="select:delete" title="Delete (Del)"
              class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-red-700 text-zinc-300">🗑 Del</button>
          </div>

          <div class="ml-auto flex items-center gap-2">
            <!-- Online editors — 1 badge per present presence meta -->
            <div :if={Enum.any?(online_editors(@map))} class="flex items-center gap-1 mr-2">
              <span class="text-[9px] text-zinc-500 uppercase tracking-wide">Online</span>
              <span :for={ed <- online_editors(@map)}
                class="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold"
                style={"border-color: #{ed.color}; color: #{ed.color}; background: #{ed.color}22"}
                title={ed.name}>
                {String.first(ed.name || "?")}
              </span>
            </div>

            <span :if={@dirty?} class="text-[10px] text-yellow-400">● unsaved</span>
            <span :if={@save_status} class="text-[10px] text-green-400">{@save_status}</span>
            <button phx-click="templates:open" title="Templates & generators"
              class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
              🎲 Templates
            </button>
            <button phx-click="stamps:open" title="Saved stamps"
              class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
              📑 Stamps
            </button>
            <button phx-click="resize:open" title="Resize map"
              class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
              ↔ Resize
            </button>
            <form phx-change="preset:apply" class="inline-block">
              <select name="key" title="Apply a genre preset"
                class="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300">
                <option value="">Genre…</option>
                <option :for={{key, p} <- genre_presets()} value={key}>{p.icon} {p.label}</option>
              </select>
            </form>
            <label class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer" title="Import Tiled .tmj">
              ⬆ Tiled
              <input type="file" accept="application/json,.tmj" id="map-import-tiled-input" class="hidden" />
            </label>
            <button phx-click="toggle_grid" title="Toggle grid (G)"
              class={["px-2 py-1.5 rounded text-xs transition-colors",
                Map.get(assigns, :show_grid, false) && "bg-amber-600 text-black font-bold",
                !Map.get(assigns, :show_grid, false) && "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"]}>
              # Grid
            </button>
            <button type="button" phx-click="fit_to_screen" title="Fit map to screen"
              class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
              ⛶ Fit
            </button>
            <button :if={!@play_mode} phx-click="play:start" title="Playtest in editor (P)"
              class="px-3 py-1.5 rounded text-xs bg-emerald-700 hover:bg-emerald-600 text-white font-bold">
              ▶ Play
            </button>
            <button :if={@play_mode} phx-click="play:stop" title="Stop playtest (Esc)"
              class="px-3 py-1.5 rounded text-xs bg-red-700 hover:bg-red-600 text-white font-bold">
              ⏹ Stop
            </button>
            <button phx-click="export_map" title="Export to JSON"
              class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
              ⬇ Export
            </button>
            <label class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer" title="Import from JSON">
              ⬆ Import
              <input type="file" accept="application/json" id="map-import-input" class="hidden" />
            </label>
            <button phx-click="history:open" title="Version history"
              class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
              🕰 History
            </button>
            <button phx-click="save"
              class="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-xs font-bold">
              Save
            </button>
          </div>
        </div>

        <!-- Canvas mount point -->
        <main class="flex-1 overflow-auto bg-zinc-950 p-4">
          <div
            id={"map-canvas-#{@map.id}"}
            phx-hook="TwistedCanvas"
            phx-update="ignore"
            data-canvas-mode="edit"
            data-render-mode={@map.render_mode || "classic"}
            data-tile-size={@canvas_tile_size}
            data-viewport-w={@viewport_w}
            data-viewport-h={@viewport_h}
            data-map-id={@map.id}
            class="inline-block border-2 border-zinc-800 bg-black"
            style={"width: #{@viewport_w * (@canvas_tile_size + 1)}px; height: #{@viewport_h * (@canvas_tile_size + 1)}px;"}>
          </div>
        </main>
      </div>

      <!-- Right: tool-context panel (Phase 2A — reshapes per @right_panel_kind) -->
      <aside class="w-72 bg-zinc-900/80 border-l border-zinc-800 flex flex-col shrink-0 overflow-hidden">
        <!-- Consistent panel header -->
        <div class="px-3 py-2 border-b border-zinc-800 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-base shrink-0">{panel_icon(right_panel_kind(@active_tool))}</span>
            <span class="text-[11px] font-bold uppercase tracking-widest text-zinc-300 truncate">
              {panel_title(right_panel_kind(@active_tool))}
            </span>
          </div>
          <span class="text-[9px] text-zinc-600 shrink-0">{@active_tool}</span>
        </div>

        <%= case right_panel_kind(@active_tool) do %>
          <% :tile_palette -> %>
            <div class="px-3 py-2 border-b border-zinc-800">
              <form phx-change="palette_search">
                <input type="text" name="q" value={@palette_search} placeholder="search tiles…"
                  class="w-full px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500" />
              </form>
            </div>

            <div :if={@recent_tiles != []} class="px-3 py-2 border-b border-zinc-800">
              <div class="text-[9px] text-zinc-600 uppercase mb-1">Recent</div>
              <div class="flex gap-1 flex-wrap">
                <button :for={id <- @recent_tiles}
                  phx-click="set_brush_tile" phx-value-id={id}
                  title={"tile #{id}"}
                  class={["w-6 h-6 rounded border hover:scale-110 transition-transform",
                    @brush_tile_id == id && "border-amber-400 ring-2 ring-amber-400/40",
                    @brush_tile_id != id && "border-zinc-700"]}
                  style={"background: #{palette_color(@palette, id)}"}>
                </button>
              </div>
            </div>

            <div class="flex-1 overflow-y-auto px-3 py-2">
              <div class="grid grid-cols-7 gap-1">
                <button :for={entry <- filter_palette(@palette, @palette_search)}
                  phx-click="set_brush_tile" phx-value-id={entry.id}
                  title={"#{entry.label} (id #{entry.id})"}
                  class={["w-7 h-7 rounded border transition-all hover:scale-110",
                    @brush_tile_id == entry.id && "border-amber-400 ring-2 ring-amber-400/40 scale-110",
                    @brush_tile_id != entry.id && "border-zinc-700"]}
                  style={"background: #{entry.color}"}>
                </button>
              </div>
            </div>

            <div class="px-3 py-2 border-t border-zinc-800 text-[9px] text-zinc-600 flex items-center justify-between">
              <span>Selected: tile #<%= @brush_tile_id %></span>
              <button phx-click="tile_anim:open" phx-value-tile_id={@brush_tile_id}
                class="text-amber-500 hover:text-amber-300 text-[10px]" title="Animate this tile">
                🎞 Animate
              </button>
            </div>

          <% :pass -> %>
            <div class="flex-1 overflow-y-auto p-3 space-y-3">
              <div class="grid grid-cols-2 gap-2">
                <button phx-click="pass:set_paint" phx-value-value="0"
                  class={["px-3 py-3 rounded text-xs font-bold border-2 transition-colors",
                    @pass_paint_value == 0 && "bg-emerald-700/30 border-emerald-500 text-emerald-300",
                    @pass_paint_value != 0 && "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"]}>
                  ✓ Passable
                </button>
                <button phx-click="pass:set_paint" phx-value-value="1"
                  class={["px-3 py-3 rounded text-xs font-bold border-2 transition-colors",
                    @pass_paint_value == 1 && "bg-rose-700/30 border-rose-500 text-rose-300",
                    @pass_paint_value != 1 && "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"]}>
                  🚫 Blocked
                </button>
              </div>
              <label class="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={@pass_overlay_visible}
                  phx-click="pass:toggle_overlay" class="accent-amber-500" />
                Show passability overlay on canvas
              </label>
              <div class="text-[10px] text-zinc-500 leading-relaxed border-t border-zinc-800 pt-2">
                Click cells on the canvas to paint
                <span class={[
                  @pass_paint_value == 0 && "text-emerald-400 font-bold",
                  @pass_paint_value != 0 && "text-rose-400 font-bold"
                ]}>{if @pass_paint_value == 0, do: "passable (walkable)", else: "blocked"}</span>.
                Switch tools to brush to paint terrain instead.
              </div>
            </div>

          <% :auto -> %>
            <div class="flex-1 overflow-y-auto p-3 space-y-2">
              <div :if={@autotile_groups == []} class="text-[10px] text-zinc-500 italic py-4 text-center">
                No autotile groups configured.<br/>
                Configure groups in
                <a href="/sauce/settings/autotile" class="text-amber-500 hover:text-amber-300 underline">Autotile Settings</a>.
              </div>
              <div :for={group <- @autotile_groups}
                class={["rounded border p-2 transition-colors",
                  @brush_tile_id == group.base_tile_id && "bg-amber-900/20 border-amber-500",
                  @brush_tile_id != group.base_tile_id && "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"]}>
                <div class="flex items-center gap-2">
                  <div class="w-7 h-7 rounded border border-zinc-700"
                    style={"background: #{palette_color(@palette, group.base_tile_id)}"}></div>
                  <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold text-zinc-200 truncate">{group.name}</div>
                    <div class="text-[9px] text-zinc-500">base id #{group.base_tile_id} · {MapSet.size(group.members)} members</div>
                  </div>
                  <button phx-click="set_brush_tile" phx-value-id={group.base_tile_id}
                    class="px-2 py-1 text-[10px] bg-zinc-700 hover:bg-amber-700 text-zinc-200 hover:text-black rounded">
                    Use
                  </button>
                </div>
              </div>
              <div class="text-[10px] text-zinc-500 border-t border-zinc-800 pt-2 mt-2 leading-relaxed">
                Pick a group's base tile, then paint on the canvas — neighbor variants will fill in automatically.
              </div>
            </div>

          <% :elev -> %>
            <div class="flex-1 overflow-y-auto p-3 space-y-3">
              <div class="text-center">
                <div class="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Painting elevation</div>
                <div class="flex items-center justify-center gap-2">
                  <button phx-click="elev:step" phx-value-dir="down"
                    class="w-8 h-8 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-base font-bold disabled:opacity-30"
                    disabled={@paint_elevation <= 0}>−</button>
                  <form phx-change="elev:set" class="inline-block">
                    <input type="number" name="value" min="0" max="15" value={@paint_elevation}
                      class="w-16 px-2 py-1 text-center text-lg font-mono bg-zinc-800 border border-zinc-700 rounded text-amber-400" />
                  </form>
                  <button phx-click="elev:step" phx-value-dir="up"
                    class="w-8 h-8 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-base font-bold disabled:opacity-30"
                    disabled={@paint_elevation >= 15}>+</button>
                </div>
              </div>
              <div class="border-t border-zinc-800 pt-3">
                <div class="text-[9px] text-zinc-500 uppercase mb-2">Legend (0 → 15)</div>
                <div class="flex h-3 rounded overflow-hidden border border-zinc-700">
                  <div :for={n <- 0..15}
                    class={["flex-1", @paint_elevation == n && "ring-2 ring-amber-400 ring-inset"]}
                    style={"background: hsl(0, 0%, #{8 + n * 5}%)"}
                    title={"elevation #{n}"}></div>
                </div>
                <div class="flex justify-between text-[9px] text-zinc-600 mt-1">
                  <span>flat</span><span>peak</span>
                </div>
              </div>
              <div class="text-[10px] text-zinc-500 leading-relaxed border-t border-zinc-800 pt-2">
                Click cells to paint elevation level <span class="text-amber-400 font-bold">{@paint_elevation}</span>.
                Higher values render brighter in the editor preview.
              </div>
            </div>

          <% :object -> %>
            <div class="flex-1 flex flex-col overflow-hidden">
              <!-- Mode tabs -->
              <div class="flex border-b border-zinc-800">
                <button phx-click="object:set_panel_mode" phx-value-mode="place"
                  class={["flex-1 px-3 py-2 text-xs font-bold transition-colors",
                    @object_panel_mode == :place && "bg-zinc-800 text-amber-400 border-b-2 border-amber-500",
                    @object_panel_mode != :place && "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"]}>
                  Place
                </button>
                <button phx-click="object:set_panel_mode" phx-value-mode="edit"
                  disabled={is_nil(@selected_object_id)}
                  class={["flex-1 px-3 py-2 text-xs font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
                    @object_panel_mode == :edit && "bg-zinc-800 text-amber-400 border-b-2 border-amber-500",
                    @object_panel_mode != :edit && "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"]}>
                  Edit selected
                </button>
              </div>

              <!-- Place mode: preset grid -->
              <div :if={@object_panel_mode == :place} class="flex-1 overflow-y-auto p-3 space-y-3">
                <div :for={group <- ~w(LIGHT PROP DECO)}>
                  <h4 class="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">{group}</h4>
                  <div class="grid grid-cols-3 gap-1.5">
                    <button :for={p <- Enum.filter(object_presets(), &(&1.group == group))}
                      phx-click="object_palette:select" phx-value-key={p.key}
                      title={p.label}
                      class={["flex flex-col items-center justify-center p-2 rounded border transition-colors",
                        @active_object_preset == p.key && "bg-amber-900/40 border-amber-500",
                        @active_object_preset != p.key && "bg-zinc-800 border-zinc-700 hover:border-zinc-600"]}>
                      <div class="text-lg leading-none">{p.icon}</div>
                      <div class="text-[9px] text-zinc-400 mt-0.5 truncate w-full text-center">{p.label}</div>
                    </button>
                  </div>
                </div>
                <div class="text-[10px] text-zinc-500 leading-relaxed border-t border-zinc-800 pt-2">
                  Active: <span class="text-amber-400 font-bold">{@active_object_preset}</span>.
                  Click on the canvas to place it.
                </div>
              </div>

              <!-- Edit mode: inspector for selected object -->
              <div :if={@object_panel_mode == :edit} class="flex-1 overflow-y-auto p-3 space-y-3">
                <%= case Enum.find(@objects, &(&1.id == @selected_object_id)) do %>
                  <% nil -> %>
                    <div class="text-[10px] text-zinc-500 italic text-center py-4">
                      Click an existing object on the canvas to edit it.
                    </div>
                  <% obj -> %>
                    <form phx-submit="object:save_edit" class="space-y-2">
                      <input type="hidden" name="object_id" value={obj.id} />
                      <div>
                        <label class="text-[9px] text-zinc-500 uppercase">Label</label>
                        <input type="text" name="label" value={obj.label}
                          class="w-full px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
                      </div>
                      <div>
                        <label class="text-[9px] text-zinc-500 uppercase">Sprite (URL or preset)</label>
                        <input type="text" name="sprite_url" value={Map.get(obj, :sprite_url, "")}
                          placeholder="leave blank for preset icon"
                          class="w-full px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 placeholder-zinc-600" />
                      </div>
                      <div>
                        <label class="text-[9px] text-zinc-500 uppercase">Custom data (JSON)</label>
                        <textarea name="data_json" rows="3"
                          class="w-full px-2 py-1 text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded text-zinc-200">{Jason.encode!(Map.get(obj, :data, %{}) || %{})}</textarea>
                      </div>
                      <div class="flex items-center justify-between gap-2 pt-1">
                        <button type="submit"
                          class="flex-1 px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-black rounded text-xs font-bold">
                          Save
                        </button>
                        <button type="button" phx-click="object:delete" phx-value-id={obj.id}
                          data-confirm={"Delete object #{obj.label}?"}
                          class="px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white rounded text-xs">
                          Delete
                        </button>
                      </div>
                      <div class="text-[10px] text-zinc-500 pt-1 border-t border-zinc-800">
                        Position: ({obj.x}, {obj.y}) · drag on canvas to move (coming soon)
                      </div>
                    </form>
                <% end %>
              </div>
            </div>

          <% :event -> %>
            <div class="flex flex-col flex-1 overflow-hidden">
              <!-- Place / Edit tabs -->
              <div class="flex border-b border-zinc-800 shrink-0">
                <button phx-click="event:set_panel_mode" phx-value-mode="place"
                  class={["flex-1 px-3 py-2 text-xs font-bold transition-colors",
                    @event_panel_mode == :place && "bg-zinc-800 text-amber-400 border-b-2 border-amber-500",
                    @event_panel_mode != :place && "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"]}>
                  Place
                </button>
                <button phx-click="event:set_panel_mode" phx-value-mode="edit"
                  disabled={is_nil(@selected_event_id)}
                  class={["flex-1 px-3 py-2 text-xs font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
                    @event_panel_mode == :edit && "bg-zinc-800 text-amber-400 border-b-2 border-amber-500",
                    @event_panel_mode != :edit && "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"]}>
                  Edit selected
                </button>
              </div>

            <div :if={@event_panel_mode == :place} class="flex-1 overflow-y-auto p-3 space-y-3">
              <div class="text-[10px] text-zinc-500 italic">
                Click on an existing event tile to edit it, or click empty ground to place a new {@active_event_kind} event with the form values.
              </div>
              <!-- Kind picker with icons + descriptions -->
              <div class="grid grid-cols-2 gap-1.5">
                <button :for={kind <- event_kinds()}
                  phx-click="event_palette:select" phx-value-kind={kind}
                  title={event_kind_description(kind)}
                  class={["flex flex-col items-start p-2 rounded border text-left transition-colors",
                    @active_event_kind == kind && "bg-amber-900/40 border-amber-500",
                    @active_event_kind != kind && "bg-zinc-800 border-zinc-700 hover:border-zinc-600"]}>
                  <div class="flex items-center gap-1.5 w-full">
                    <span>{event_kind_icon(kind)}</span>
                    <span class={[
                      "text-[10px] font-bold",
                      @active_event_kind == kind && "text-amber-300",
                      @active_event_kind != kind && "text-zinc-300"
                    ]}>{kind}</span>
                  </div>
                  <div class="text-[9px] text-zinc-500 mt-0.5 leading-tight">{event_kind_description(kind)}</div>
                </button>
              </div>

              <!-- Per-kind data form. Single form, phx-change → event:set_form_field
                   uses _target to dispatch which field changed. -->
              <form phx-change="event:set_form_field_form" class="border-t border-zinc-800 pt-3 space-y-2">
                <div class="text-[9px] uppercase text-zinc-500 mb-1">{@active_event_kind} settings</div>

                <%= case @active_event_kind do %>
                  <% "TELEPORT" -> %>
                    <label class="block">
                      <span class="text-[9px] text-zinc-500 uppercase">Target map id</span>
                      <input type="text" name="target_map_id" value={Map.get(@event_form, "target_map_id", "")}
                        class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
                    </label>
                    <div class="grid grid-cols-2 gap-2">
                      <label>
                        <span class="text-[9px] text-zinc-500 uppercase">Target X</span>
                        <input type="number" name="target_x" value={Map.get(@event_form, "target_x", "0")}
                          class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
                      </label>
                      <label>
                        <span class="text-[9px] text-zinc-500 uppercase">Target Y</span>
                        <input type="number" name="target_y" value={Map.get(@event_form, "target_y", "0")}
                          class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
                      </label>
                    </div>

                  <% "LOOT" -> %>
                    <label class="block">
                      <span class="text-[9px] text-zinc-500 uppercase">Items table (JSON)</span>
                      <textarea name="items_table" rows="3"
                        class="w-full px-2 py-1 text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded text-zinc-200"
                      >{Map.get(@event_form, "items_table", "[]")}</textarea>
                    </label>
                    <label class="block">
                      <span class="text-[9px] text-zinc-500 uppercase">Respawn (seconds)</span>
                      <input type="number" min="0" name="respawn_seconds"
                        value={Map.get(@event_form, "respawn_seconds", "0")}
                        class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
                    </label>

                  <% "SHOP" -> %>
                    <label class="block">
                      <span class="text-[9px] text-zinc-500 uppercase">Shop id</span>
                      <input type="text" name="shop_id" value={Map.get(@event_form, "shop_id", "")}
                        class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
                    </label>

                  <% "NPC" -> %>
                    <label class="block">
                      <span class="text-[9px] text-zinc-500 uppercase">NPC template id</span>
                      <select name="npc_template_id" class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-amber-500">
                        <option value="">(Select NPC)</option>
                        <option :for={{npc_id, npc_name} <- @npcs} value={npc_id} selected={to_string(npc_id) == to_string(Map.get(@event_form, "npc_template_id"))}>
                          {npc_name} (ID {npc_id})
                        </option>
                      </select>
                    </label>
                    <label class="block">
                      <span class="text-[9px] text-zinc-500 uppercase">Dialogue id (optional)</span>
                      <input type="text" name="dialogue_id" value={Map.get(@event_form, "dialogue_id", "")}
                        class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
                    </label>

                  <% "ENEMY" -> %>
                    <label class="block">
                      <span class="text-[9px] text-zinc-500 uppercase">Enemy template id</span>
                      <select name="enemy_template_id" class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-amber-500">
                        <option value="">(Select Enemy/NPC)</option>
                        <option :for={{npc_id, npc_name} <- @npcs} value={npc_id} selected={to_string(npc_id) == to_string(Map.get(@event_form, "enemy_template_id"))}>
                          {npc_name} (ID {npc_id})
                        </option>
                      </select>
                    </label>
                    <label class="block">
                      <span class="text-[9px] text-zinc-500 uppercase">Level scaling</span>
                      <input type="number" step="0.1" min="0" name="level_scaling"
                        value={Map.get(@event_form, "level_scaling", "1.0")}
                        class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
                    </label>

                  <% "SCRIPT" -> %>
                    <label class="block">
                      <span class="text-[9px] text-zinc-500 uppercase">Script id</span>
                      <input type="text" name="script_id" value={Map.get(@event_form, "script_id", "")}
                        class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
                    </label>
                    <label class="block">
                      <span class="text-[9px] text-zinc-500 uppercase">Params (JSON)</span>
                      <textarea name="params" rows="3"
                        class="w-full px-2 py-1 text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded text-zinc-200"
                      >{Map.get(@event_form, "params", "{}")}</textarea>
                    </label>

                  <% "TERRAIN" -> %>
                    <label class="block">
                      <span class="text-[9px] text-zinc-500 uppercase">Terrain modifier</span>
                      <input type="text" name="terrain_modifier"
                        value={Map.get(@event_form, "terrain_modifier", "")}
                        placeholder="slow / poison / heal / …"
                        class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200 placeholder-zinc-600" />
                    </label>
                    <label class="block">
                      <span class="text-[9px] text-zinc-500 uppercase">Amount</span>
                      <input type="number" step="0.1" name="amount"
                        value={Map.get(@event_form, "amount", "0")}
                        class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
                    </label>

                  <% _ -> %>
                    <div class="text-[10px] text-zinc-500 italic">No additional fields for this kind.</div>
                <% end %>
              </form>

              <div class="text-[10px] text-zinc-500 leading-relaxed border-t border-zinc-800 pt-2">
                Click on the canvas to place a <span class="text-amber-400 font-bold">{@active_event_kind}</span> event with the settings above. The form values save into <code class="bg-zinc-800 px-1 rounded">events.data</code>.
              </div>
            </div>

            <!-- Edit-selected mode: pre-populated form for the selected event -->
            <div :if={@event_panel_mode == :edit} class="flex-1 overflow-y-auto p-3 space-y-3">
              <%= case Enum.find(@events, &(&1.id == @selected_event_id)) do %>
                <% nil -> %>
                  <div class="text-[10px] text-zinc-500 italic text-center py-4">
                    Click an existing event on the canvas to edit it.
                  </div>
                <% ev -> %>
                  <div class="bg-zinc-800/50 rounded border border-zinc-700 p-2 text-[10px]">
                    <div class="text-zinc-400">
                      <span>{event_kind_icon(ev.kind)}</span>
                      <span class="font-bold text-zinc-200 ml-1">{ev.kind}</span>
                      <span class="text-zinc-500 ml-2 font-mono">at ({ev.x}, {ev.y})</span>
                    </div>
                  </div>

                  <form phx-change="event:set_form_field_form" class="space-y-2">
                    <div class="text-[9px] uppercase text-zinc-500 mb-1">{ev.kind} settings</div>

                    <%= case ev.kind do %>
                      <% "TELEPORT" -> %>
                        <label class="block">
                          <span class="text-[9px] text-zinc-500 uppercase">Target map id</span>
                          <input type="text" name="target_map_id" value={Map.get(@event_form, "target_map_id", "")}
                            class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
                        </label>
                        <div class="grid grid-cols-2 gap-2">
                          <label>
                            <span class="text-[9px] text-zinc-500 uppercase">Target X</span>
                            <input type="number" name="target_x" value={Map.get(@event_form, "target_x", "0")}
                              class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
                          </label>
                          <label>
                            <span class="text-[9px] text-zinc-500 uppercase">Target Y</span>
                            <input type="number" name="target_y" value={Map.get(@event_form, "target_y", "0")}
                              class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
                          </label>
                        </div>

                      <% "LOOT" -> %>
                        <label class="block">
                          <span class="text-[9px] text-zinc-500 uppercase">Items table (JSON)</span>
                          <textarea name="items_table" rows="3"
                            class="w-full px-2 py-1 text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded text-zinc-200"
                          >{Map.get(@event_form, "items_table", "[]")}</textarea>
                        </label>

                      <% "SHOP" -> %>
                        <label class="block">
                          <span class="text-[9px] text-zinc-500 uppercase">Shop id</span>
                          <input type="text" name="shop_id" value={Map.get(@event_form, "shop_id", "")}
                            class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
                        </label>

                      <% "NPC" -> %>
                        <label class="block">
                          <span class="text-[9px] text-zinc-500 uppercase">NPC template id</span>
                          <select name="npc_template_id" class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-amber-500">
                            <option value="">(Select NPC)</option>
                            <option :for={{npc_id, npc_name} <- @npcs} value={npc_id} selected={to_string(npc_id) == to_string(Map.get(@event_form, "npc_template_id"))}>
                              {npc_name} (ID {npc_id})
                            </option>
                          </select>
                        </label>

                      <% "ENEMY" -> %>
                        <label class="block">
                          <span class="text-[9px] text-zinc-500 uppercase">Enemy template id</span>
                          <select name="enemy_template_id" class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-amber-500">
                            <option value="">(Select Enemy/NPC)</option>
                            <option :for={{npc_id, npc_name} <- @npcs} value={npc_id} selected={to_string(npc_id) == to_string(Map.get(@event_form, "enemy_template_id"))}>
                              {npc_name} (ID {npc_id})
                            </option>
                          </select>
                        </label>
                        <label class="block">
                          <span class="text-[9px] text-zinc-500 uppercase">Level scaling</span>
                          <input type="number" step="0.1" min="0" name="level_scaling"
                            value={Map.get(@event_form, "level_scaling", "1.0")}
                            class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
                        </label>

                      <% "SCRIPT" -> %>
                        <label class="block">
                          <span class="text-[9px] text-zinc-500 uppercase">Script id</span>
                          <input type="text" name="script_id" value={Map.get(@event_form, "script_id", "")}
                            class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
                        </label>

                      <% "TERRAIN" -> %>
                        <label class="block">
                          <span class="text-[9px] text-zinc-500 uppercase">Terrain modifier</span>
                          <input type="text" name="terrain_modifier"
                            value={Map.get(@event_form, "terrain_modifier", "")}
                            class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
                        </label>

                      <% _ -> %>
                        <div class="text-[10px] text-zinc-500 italic">No additional fields for this kind.</div>
                    <% end %>
                  </form>

                  <div class="flex items-center justify-between gap-2 pt-1 border-t border-zinc-800">
                    <button phx-click="event:save_edit"
                      class="flex-1 px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-black rounded text-xs font-bold">
                      Save changes
                    </button>
                    <button phx-click="event:delete_selected"
                      data-confirm={"Delete this #{ev.kind} event?"}
                      class="px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white rounded text-xs">
                      Delete
                    </button>
                  </div>
              <% end %>
            </div>
            </div>

          <% :spawn -> %>
            <div class="flex-1 overflow-y-auto p-3 space-y-3">
              <!-- Spawn point indicator -->
              <div class="bg-blue-950/30 border border-blue-800 rounded p-2 text-[10px]">
                <div class="text-blue-300 font-bold mb-0.5">🎯 Spawn point</div>
                <%= case {@map.spawn_x, @map.spawn_y} do %>
                  <% {nil, _} -> %>
                    <div class="text-zinc-400">Not set — click any tile to place spawn at that position.</div>
                  <% {_, nil} -> %>
                    <div class="text-zinc-400">Not set — click any tile to place spawn at that position.</div>
                  <% {sx, sy} -> %>
                    <div class="text-zinc-300">Currently at (<span class="font-mono text-amber-400">{sx}, {sy}</span>) · click another tile to move it.</div>
                <% end %>
              </div>

              <!-- Zone list -->
              <div>
                <div class="text-[9px] uppercase text-zinc-500 mb-1 flex items-center justify-between">
                  <span>Spawn zones ({length(@spawn_zones)})</span>
                  <button phx-click="zone:arm_creation" phx-value-kind="spawn_zone"
                    class="text-amber-500 hover:text-amber-300 text-[10px]" title="Drag a rectangle to create a zone">
                    + New zone
                  </button>
                </div>
                <div :if={@spawn_zones == []} class="text-[10px] text-zinc-600 italic py-2">No zones — click + New zone, then drag a rectangle on the canvas.</div>
                <ul class="space-y-1">
                  <li :for={z <- @spawn_zones}
                    class={["rounded border text-[10px]",
                      @selected_spawn_zone_id == z.id && "border-amber-500 bg-amber-900/10",
                      @selected_spawn_zone_id != z.id && "border-zinc-700 bg-zinc-800/40"]}>
                    <button phx-click="spawn:select_zone" phx-value-id={z.id}
                      class="w-full text-left px-2 py-1.5 hover:bg-zinc-800 flex items-center justify-between gap-2">
                      <span class="font-mono text-zinc-300">({z.rect.x1},{z.rect.y1}) → ({z.rect.x2},{z.rect.y2})</span>
                      <span class="text-zinc-500">{length(z.encounter_table || [])} enc</span>
                    </button>
                  </li>
                </ul>
              </div>

              <!-- Selected zone editor -->
              <%= case Enum.find(@spawn_zones, &(&1.id == @selected_spawn_zone_id)) do %>
                <% nil -> %><span></span>
                <% z -> %>
                  <div class="border-t border-zinc-800 pt-3 space-y-2">
                    <div class="text-[9px] uppercase text-zinc-500">Encounter table</div>
                    <div :if={(z.encounter_table || []) == []} class="text-[10px] text-zinc-600 italic">
                      No encounters yet.
                    </div>
                    <div :for={{row, idx} <- Enum.with_index(z.encounter_table || [])}
                      class="bg-zinc-800/50 rounded border border-zinc-700 p-2 space-y-1">
                      <div class="flex gap-1 items-center">
                        <select phx-change="spawn:set_encounter" phx-value-id={z.id} phx-value-row={idx} phx-value-field="npc_id"
                          class="flex-1 px-1 py-0.5 text-[10px] bg-zinc-900 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-amber-500">
                          <option value="">(Select NPC)</option>
                          <option :for={{npc_id, npc_name} <- @npcs} value={npc_id} selected={to_string(npc_id) == to_string(Map.get(row, "npc_id"))}>
                            {npc_name} (ID {npc_id})
                          </option>
                        </select>
                        <button phx-click="spawn:remove_encounter" phx-value-id={z.id} phx-value-row={idx}
                          class="px-1.5 py-0.5 text-[10px] text-rose-400 hover:text-rose-300">×</button>
                      </div>
                      <div class="grid grid-cols-3 gap-1 text-[9px] text-zinc-500">
                        <label class="flex flex-col gap-0.5">
                          <span>Count</span>
                          <input type="number" min="1" value={Map.get(row, "count", 1)}
                            phx-blur="spawn:set_encounter" phx-value-id={z.id} phx-value-row={idx} phx-value-field="count"
                            class="px-1 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-zinc-200" />
                        </label>
                        <label class="flex flex-col gap-0.5">
                          <span>Weight</span>
                          <input type="number" min="1" value={Map.get(row, "weight", 1)}
                            phx-blur="spawn:set_encounter" phx-value-id={z.id} phx-value-row={idx} phx-value-field="weight"
                            class="px-1 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-zinc-200" />
                        </label>
                        <label class="flex flex-col gap-0.5">
                          <span>Scale</span>
                          <input type="number" min="0" step="0.1" value={Map.get(row, "level_scaling", 1.0)}
                            phx-blur="spawn:set_encounter" phx-value-id={z.id} phx-value-row={idx} phx-value-field="level_scaling"
                            class="px-1 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-zinc-200" />
                        </label>
                      </div>
                    </div>
                    <button phx-click="spawn:add_encounter" phx-value-id={z.id}
                      class="w-full px-2 py-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 border border-dashed border-zinc-600 rounded text-zinc-300">
                      + Add encounter
                    </button>
                    <div class="grid grid-cols-2 gap-1 pt-2 border-t border-zinc-800">
                      <label class="text-[9px] text-zinc-500 flex flex-col gap-0.5">
                        <span>Scaling factor</span>
                        <input type="number" min="0" step="0.1" value={z.scaling_factor}
                          phx-blur="spawn:set_field" phx-value-id={z.id} phx-value-field="scaling_factor"
                          class="px-1.5 py-0.5 text-[10px] bg-zinc-900 border border-zinc-700 rounded text-zinc-200" />
                      </label>
                      <label class="text-[9px] text-zinc-500 flex flex-col gap-0.5">
                        <span>Flag</span>
                        <input type="text" value={z.flag}
                          phx-blur="spawn:set_field" phx-value-id={z.id} phx-value-field="flag"
                          class="px-1.5 py-0.5 text-[10px] bg-zinc-900 border border-zinc-700 rounded text-zinc-200" />
                      </label>
                      <label class="text-[9px] text-zinc-500 flex flex-col gap-0.5">
                        <span>Cooldown (s)</span>
                        <input type="number" min="0" step="1" value={Map.get(z, :cooldown_seconds, 30)}
                          phx-blur="spawn:set_field" phx-value-id={z.id} phx-value-field="cooldown_seconds"
                          class="px-1.5 py-0.5 text-[10px] bg-zinc-900 border border-zinc-700 rounded text-zinc-200" />
                      </label>
                      <label class="text-[9px] text-zinc-500 flex flex-col gap-0.5">
                        <span>Max concurrent</span>
                        <input type="number" min="1" max="50" step="1" value={Map.get(z, :max_concurrent, 4)}
                          phx-blur="spawn:set_field" phx-value-id={z.id} phx-value-field="max_concurrent"
                          class="px-1.5 py-0.5 text-[10px] bg-zinc-900 border border-zinc-700 rounded text-zinc-200" />
                      </label>
                    </div>
                    <div class="flex items-center justify-between pt-1">
                      <label class="flex items-center gap-1.5 text-[10px] text-zinc-400 cursor-pointer">
                        <input type="checkbox" checked={z.enabled}
                          phx-click="spawn:set_field" phx-value-id={z.id} phx-value-field="enabled" phx-value-value={if z.enabled, do: "false", else: "true"}
                          class="accent-amber-500" />
                        Enabled
                      </label>
                      <button phx-click="spawn_zone:delete" phx-value-id={z.id}
                        data-confirm="Delete this spawn zone?"
                        class="text-[10px] text-rose-500 hover:text-rose-300">
                        Delete zone
                      </button>
                    </div>
                  </div>
              <% end %>
            </div>

          <% :sound -> %>
            <div class="flex-1 overflow-y-auto p-3 space-y-3">
              <div>
                <div class="text-[9px] uppercase text-zinc-500 mb-1 flex items-center justify-between">
                  <span>Sound zones ({length(@sound_zones)})</span>
                  <button phx-click="zone:arm_creation" phx-value-kind="sound_zone"
                    class="text-amber-500 hover:text-amber-300 text-[10px]" title="Drag a rectangle to create a zone">
                    + New zone
                  </button>
                </div>
                <div :if={@sound_zones == []} class="text-[10px] text-zinc-600 italic py-2">No zones — click + New zone, then drag a rectangle on the canvas.</div>
                <ul class="space-y-1">
                  <li :for={z <- @sound_zones}
                    class={["rounded border text-[10px]",
                      @selected_sound_zone_id == z.id && "border-amber-500 bg-amber-900/10",
                      @selected_sound_zone_id != z.id && "border-zinc-700 bg-zinc-800/40"]}>
                    <button phx-click="sound:select_zone" phx-value-id={z.id}
                      class="w-full text-left px-2 py-1.5 hover:bg-zinc-800 flex items-center justify-between gap-2">
                      <span class="font-mono text-zinc-300 truncate">{if z.sound_url == "", do: "(no audio)", else: short_url(z.sound_url)}</span>
                      <span class="text-zinc-500">{trunc(z.volume * 100)}%</span>
                    </button>
                  </li>
                </ul>
              </div>

              <%= case Enum.find(@sound_zones, &(&1.id == @selected_sound_zone_id)) do %>
                <% nil -> %><span></span>
                <% z -> %>
                  <div class="border-t border-zinc-800 pt-3 space-y-3">
                    <div>
                      <label class="text-[9px] text-zinc-500 uppercase">Audio source URL</label>
                      <input type="url" value={z.sound_url}
                        phx-blur="sound:set_field" phx-value-id={z.id} phx-value-field="sound_url"
                        placeholder="https://..."
                        class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200 placeholder-zinc-600" />
                    </div>
                    <div>
                      <div class="flex items-center justify-between text-[9px] text-zinc-500 uppercase mb-1">
                        <span>Volume</span>
                        <span class="font-mono text-amber-400">{trunc(z.volume * 100)}%</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <form phx-change="sound:set_field" phx-value-id={z.id} phx-value-field="volume" class="flex-1">
                          <input type="range" min="0" max="1" step="0.01" value={z.volume}
                            name="value"
                            class="w-full accent-amber-500" />
                        </form>
                        <button phx-click="sound:preview" phx-value-id={z.id}
                          title="Preview"
                          class="px-2 py-1 text-[10px] bg-zinc-800 hover:bg-amber-700 hover:text-black border border-zinc-700 rounded text-zinc-300">
                          ▶
                        </button>
                      </div>
                    </div>
                    <label class="flex items-center gap-2 text-[10px] text-zinc-400 cursor-pointer">
                      <input type="checkbox" checked={z.loop}
                        phx-click="sound:set_field" phx-value-id={z.id} phx-value-field="loop" phx-value-value={if z.loop, do: "false", else: "true"}
                        class="accent-amber-500" />
                      Loop
                    </label>
                    <div>
                      <label class="text-[9px] text-zinc-500 uppercase">Fade (seconds)</label>
                      <input type="number" min="0" step="0.1" value={z.fade_seconds}
                        phx-blur="sound:set_field" phx-value-id={z.id} phx-value-field="fade_seconds"
                        class="w-full px-2 py-1 text-[11px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
                    </div>
                    <div class="flex items-center justify-between pt-2 border-t border-zinc-800">
                      <span class="text-[10px] text-zinc-500 font-mono">({z.rect.x1},{z.rect.y1}) → ({z.rect.x2},{z.rect.y2})</span>
                      <button phx-click="sound_zone:delete" phx-value-id={z.id}
                        data-confirm="Delete this sound zone?"
                        class="text-[10px] text-rose-500 hover:text-rose-300">
                        Delete zone
                      </button>
                    </div>
                  </div>
              <% end %>
            </div>

          <% :select -> %>
            <div class="flex-1 overflow-y-auto p-3 space-y-3">
              <%= case @select_rect do %>
                <% nil -> %>
                  <div class="text-[10px] text-zinc-500 italic text-center py-6 leading-relaxed">
                    Drag on the canvas to select a region.<br/><br/>
                    Or pick another tool to start painting.
                  </div>
                <% rect -> %>
                  <div class="bg-zinc-800/50 rounded border border-zinc-700 p-2 space-y-1 text-[10px]">
                    <div class="text-zinc-400">
                      <span class="text-zinc-500">From:</span>
                      <span class="font-mono text-zinc-200">({rect.x1}, {rect.y1})</span>
                    </div>
                    <div class="text-zinc-400">
                      <span class="text-zinc-500">To:</span>
                      <span class="font-mono text-zinc-200">({rect.x2}, {rect.y2})</span>
                    </div>
                    <div class="text-zinc-400">
                      <span class="text-zinc-500">Size:</span>
                      <span class="font-mono text-amber-400">{rect.x2 - rect.x1 + 1} × {rect.y2 - rect.y1 + 1}</span>
                    </div>
                  </div>

                  <div class="grid grid-cols-2 gap-1.5">
                    <button phx-click="select:copy"
                      class="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-200">
                      Copy <span class="text-[9px] text-zinc-500 ml-1">⌘C</span>
                    </button>
                    <button phx-click="select:cut"
                      class="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-200">
                      Cut <span class="text-[9px] text-zinc-500 ml-1">⌘X</span>
                    </button>
                    <button phx-click="select:paste" disabled={is_nil(@select_clipboard)}
                      class="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed">
                      Paste <span class="text-[9px] text-zinc-500 ml-1">⌘V</span>
                    </button>
                    <button phx-click="select:delete"
                      class="px-2 py-1.5 bg-rose-900/40 hover:bg-rose-800/50 border border-rose-800 rounded text-xs text-rose-200">
                      Delete <span class="text-[9px] text-rose-400 ml-1">⌫</span>
                    </button>
                  </div>

                  <form phx-submit="select:save_stamp" class="border-t border-zinc-800 pt-3 space-y-1.5">
                    <label class="text-[9px] text-zinc-500 uppercase">Save as stamp</label>
                    <div class="flex gap-1">
                      <input type="text" name="name" required placeholder="stamp name"
                        class="flex-1 px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 placeholder-zinc-600" />
                      <button type="submit"
                        class="px-3 py-1 bg-amber-700 hover:bg-amber-600 text-black rounded text-xs font-bold">
                        Save
                      </button>
                    </div>
                  </form>

                  <div class="text-[10px] text-zinc-500 border-t border-zinc-800 pt-2">
                    Clipboard: <%= if is_nil(@select_clipboard), do: "empty", else: "ready" %>
                  </div>
              <% end %>
            </div>
        <% end %>
      </aside>

      <!-- Templates & generators modal -->
      <div :if={@templates_open} class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
           phx-click="templates:close">
        <div class="w-[640px] max-h-[80vh] bg-zinc-900 border border-zinc-700 rounded-lg flex flex-col overflow-hidden"
             phx-click-away="templates:close">
          <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 class="text-sm font-bold text-amber-400">Templates &amp; Generators</h3>
            <button phx-click="templates:close" class="text-zinc-500 hover:text-zinc-200 text-lg">✕</button>
          </div>
          <div class="flex-1 overflow-y-auto p-4 space-y-5">
            <!-- Procedural generators -->
            <section>
              <h4 class="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Procedural — replaces entire map</h4>
              <div class="grid grid-cols-3 gap-3">
                <button :for={gen <- [%{kind: "bsp", label: "BSP Dungeon", icon: "🏰", desc: "Rooms + corridors"}, %{kind: "cave", label: "Cave (CA)", icon: "🕳️", desc: "Organic chambers"}, %{kind: "maze", label: "Perfect Maze", icon: "🌀", desc: "Single-path puzzles"}, %{kind: "town", label: "Town", icon: "🏘️", desc: "Buildings, paths, well"}]}
                  phx-click="templates:generate" phx-value-kind={gen.kind}
                  class="p-3 bg-zinc-800 hover:bg-amber-900/40 rounded border border-zinc-700 hover:border-amber-600 text-left transition-colors">
                  <div class="text-2xl mb-1">{gen.icon}</div>
                  <div class="text-xs font-bold text-amber-300">{gen.label}</div>
                  <div class="text-[10px] text-zinc-500">{gen.desc}</div>
                </button>
              </div>
              <p class="text-[10px] text-zinc-600 mt-2">Tip: generators can be undone (Ctrl+Z) like any other op.</p>
            </section>

            <!-- Room templates -->
            <section>
              <h4 class="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Room templates — pasted at selection or (0,0)</h4>
              <div class="grid grid-cols-3 gap-3">
                <button :for={t <- MapEditorTemplates.template_index()}
                  phx-click="templates:apply_room" phx-value-key={t.key}
                  class="p-3 bg-zinc-800 hover:bg-amber-900/40 rounded border border-zinc-700 hover:border-amber-600 text-left transition-colors">
                  <div class="text-xs font-bold text-amber-300">{t.label}</div>
                  <div class="text-[10px] text-zinc-500">{t.w} × {t.h}</div>
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      <!-- Stamps modal -->
      <div :if={@stamps_open} class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
           phx-click="stamps:close">
        <div class="w-[560px] max-h-[80vh] bg-zinc-900 border border-zinc-700 rounded-lg flex flex-col overflow-hidden"
             phx-click-away="stamps:close">
          <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 class="text-sm font-bold text-amber-400">Saved Stamps</h3>
            <button phx-click="stamps:close" class="text-zinc-500 hover:text-zinc-200 text-lg">✕</button>
          </div>
          <div class="px-4 py-3 border-b border-zinc-800">
            <form phx-submit="stamps:save" class="flex gap-2">
              <input name="name" type="text" placeholder="Save current clipboard as…"
                class="flex-1 px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200 focus:outline-none focus:border-amber-500" />
              <button type="submit"
                class="px-3 py-1 text-xs bg-amber-700 hover:bg-amber-600 text-black rounded font-bold">
                Save
              </button>
            </form>
            <p :if={is_nil(@select_clipboard)} class="text-[10px] text-zinc-600 mt-1">
              Cut or copy a selection first to save a stamp.
            </p>
          </div>
          <div class="flex-1 overflow-y-auto">
            <div :if={@saved_stamps == []} class="p-6 text-center text-zinc-500 text-xs">
              No stamps saved yet.
            </div>
            <ul class="divide-y divide-zinc-800">
              <li :for={s <- @saved_stamps} class="px-4 py-2 flex items-center justify-between hover:bg-zinc-800/50">
                <div>
                  <div class="text-xs text-zinc-200 font-mono">{s.name}</div>
                  <div class="text-[10px] text-zinc-500">{s.layer} · {s.at}</div>
                </div>
                <div class="flex gap-1">
                  <button phx-click="stamps:load" phx-value-id={s.id}
                    class="px-2 py-1 text-[10px] bg-amber-700 hover:bg-amber-600 text-black rounded font-bold">
                    Load
                  </button>
                  <button phx-click="stamps:delete" phx-value-id={s.id}
                    class="px-2 py-1 text-[10px] bg-red-800 hover:bg-red-700 text-zinc-100 rounded">
                    🗑
                  </button>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Map properties modal -->
      <div :if={@properties_open} class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
           phx-click="properties:close">
        <div class="w-[520px] bg-zinc-900 border border-zinc-700 rounded-lg flex flex-col overflow-hidden"
             phx-click-away="properties:close">
          <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 class="text-sm font-bold text-amber-400">Map Properties — {@map.name}</h3>
            <button phx-click="properties:close" class="text-zinc-500 hover:text-zinc-200 text-lg">✕</button>
          </div>
          <form phx-submit="properties:save" class="p-4 space-y-3 text-xs">
            <label class="block">
              <span class="text-zinc-400">Render mode</span>
              <select name="render_mode" class="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200">
                <option :for={mode <- ~w(classic 2.5d isometric)}
                  value={mode}
                  selected={@map.render_mode == mode}>
                  {mode}
                </option>
              </select>
            </label>
            <label class="block">
              <span class="text-zinc-400">Tileset URL</span>
              <input type="text" name="tileset_url" placeholder="https://…/tileset.png"
                class="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
            </label>
            <label class="block">
              <span class="text-zinc-400">Ambient darkness (0.0–1.0)</span>
              <input type="number" name="ambient_dark" step="0.05" min="0" max="1" value="0"
                class="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
            </label>
            <label class="block">
              <span class="text-zinc-400">Min level</span>
              <input type="number" name="min_level" step="1" min="1" value="1"
                class="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
            </label>
            <%!-- Phase 1.5e — Fog of War per-map controls. Uses the
                  existing `fog_of_war` column (tinyint, default 0).
                  Capability `:fog_of_war` must also be ON globally
                  for fog to actually render. ambient_visibility 0 =
                  pitch black outside vision; 1+ = N tiles of passive
                  terrain visible at the edge of fog. --%>
            <fieldset class="border border-zinc-800 rounded p-2 space-y-2">
              <legend class="text-[10px] uppercase tracking-wider text-amber-400/70 px-1">Fog of War</legend>
              <label class="flex items-center gap-2">
                <input type="checkbox" name="fog_of_war" value="1" checked={Map.get(@map, :fog_of_war, false) == true} />
                <span class="text-zinc-400">Fog enabled on this map</span>
              </label>
              <label class="block">
                <span class="text-zinc-400">Ambient visibility (tiles past vision)</span>
                <input type="number" name="ambient_visibility" step="1" min="0" max="5" value={Map.get(@map, :ambient_visibility, 0)}
                  class="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
              </label>
            </fieldset>
            <label class="block">
              <span class="text-zinc-400">Description</span>
              <textarea name="description" rows="3"
                class="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200"></textarea>
            </label>
            <div class="pt-2 flex justify-end gap-2">
              <button type="button" phx-click="properties:close"
                class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded">Cancel</button>
              <button type="submit"
                class="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-black rounded font-bold">Save</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Resize modal -->
      <div :if={@resize_open} class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
           phx-click="resize:close">
        <div class="w-[440px] bg-zinc-900 border border-zinc-700 rounded-lg flex flex-col overflow-hidden"
             phx-click-away="resize:close">
          <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 class="text-sm font-bold text-amber-400">Resize Map</h3>
            <button phx-click="resize:close" class="text-zinc-500 hover:text-zinc-200 text-lg">✕</button>
          </div>
          <form phx-submit="resize:apply" class="p-4 space-y-4 text-xs">
            <p class="text-[11px] text-zinc-500">Current: {@map.width} × {@map.height}</p>
            <div class="grid grid-cols-2 gap-3">
              <label>
                <span class="text-zinc-400">New width</span>
                <input type="number" name="new_w" min="5" max="200" value={@map.width}
                  class="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
              </label>
              <label>
                <span class="text-zinc-400">New height</span>
                <input type="number" name="new_h" min="5" max="200" value={@map.height}
                  class="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
              </label>
            </div>
            <fieldset>
              <legend class="text-zinc-400 mb-1">Anchor</legend>
              <div class="grid grid-cols-3 gap-1 w-32">
                <label
                  :for={{value, glyph, disabled?} <- [
                        {"tl", "↖", false}, {"t", "·", true},  {"tr", "↗", false},
                        {"l",  "·", true},  {"center", "●", false}, {"r",  "·", true},
                        {"bl", "↙", false}, {"b", "·", true},  {"br", "↘", false}
                      ]}
                  class={[
                    "flex items-center justify-center h-8 rounded border transition-colors",
                    disabled? && "bg-zinc-900 border-zinc-800 cursor-not-allowed",
                    !disabled? && "bg-zinc-800 border-zinc-700 cursor-pointer hover:bg-zinc-700 has-[:checked]:bg-amber-950/40 has-[:checked]:border-amber-500"
                  ]}>
                  <input type="radio" name="anchor" value={value} class="sr-only peer"
                    disabled={disabled?} checked={value == "center"} />
                  <span class={[
                    disabled? && "text-zinc-700",
                    !disabled? && "text-zinc-600 peer-checked:text-amber-400 peer-checked:font-bold"
                  ]}>{glyph}</span>
                </label>
              </div>
            </fieldset>
            <div class="pt-2 flex justify-end gap-2">
              <button type="button" phx-click="resize:close"
                class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded">Cancel</button>
              <button type="submit"
                class="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-black rounded font-bold">Resize</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Phase 2A: Object/Event palette modals retired — now inline in
           the right-side panel via @right_panel_kind = :object | :event. -->

      <!-- Cell inspector / object & event list (right of canvas, slides over palette) -->
      <div :if={@inspector_open} class="absolute left-4 bottom-4 w-64 bg-zinc-900/95 border border-zinc-700 rounded-lg shadow-xl text-xs z-30 max-h-[40vh] overflow-y-auto">
        <div class="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
          <span class="text-[10px] font-bold uppercase tracking-widest text-amber-400">Inspector</span>
          <button phx-click="inspector:toggle" class="text-zinc-500 hover:text-zinc-200">✕</button>
        </div>
        <div class="p-3 space-y-2">
          <div :if={@hover_tile}>
            <div class="text-zinc-400">Tile: ({@hover_tile.x}, {@hover_tile.y})</div>
            <div class="text-zinc-500">ground id: {Enum.at(Map.get(@map.layers, "ground", []), @hover_tile.y * @map.width + @hover_tile.x, 0)}</div>
            <div class="text-zinc-500">passability: {Enum.at(Map.get(@map.layers, "passability", []), @hover_tile.y * @map.width + @hover_tile.x, 0)}</div>
            <div class="text-zinc-500">elevation: {Enum.at(Map.get(@map.layers, "elevation", []), @hover_tile.y * @map.width + @hover_tile.x, 0)}</div>
          </div>
          <div :if={!@hover_tile} class="text-zinc-600">Hover a tile to inspect</div>

          <div class="border-t border-zinc-800 pt-2">
            <div class="text-[10px] uppercase text-zinc-500 mb-1">Objects ({length(@objects)})</div>
            <ul class="space-y-1 max-h-32 overflow-y-auto">
              <li :for={o <- Enum.take(@objects, 20)} class="flex items-center justify-between text-[10px]">
                <span class="text-zinc-400">{o.icon} {o.label} @ ({o.x},{o.y})</span>
                <button phx-click="object:delete" phx-value-id={o.id}
                  class="text-red-500 hover:text-red-300">×</button>
              </li>
            </ul>
          </div>

          <div class="border-t border-zinc-800 pt-2">
            <div class="text-[10px] uppercase text-zinc-500 mb-1">Events ({length(@events)})</div>
            <ul class="space-y-1 max-h-32 overflow-y-auto">
              <li :for={ev <- Enum.take(@events, 20)} class="flex items-center justify-between text-[10px]">
                <span class="text-zinc-400">
                  {ev.kind} @ ({ev.x},{ev.y})
                  <span :if={ev.script_id} class="text-amber-400 ml-1">S#{ev.script_id}</span>
                </span>
                <span class="flex items-center gap-1">
                  <button phx-click="event:open_picker" phx-value-id={ev.id}
                    class="text-amber-500 hover:text-amber-300" title="Link script">S</button>
                  <button phx-click="event:delete" phx-value-id={ev.id}
                    class="text-red-500 hover:text-red-300">x</button>
                </span>
              </li>
            </ul>
          </div>

          <div class="border-t border-zinc-800 pt-2">
            <div class="text-[10px] uppercase text-zinc-500 mb-1">Spawn Zones ({length(@spawn_zones)})</div>
            <ul class="space-y-1 max-h-24 overflow-y-auto">
              <li :for={z <- @spawn_zones} class="flex items-center justify-between text-[10px]">
                <span class="text-green-400">({z.rect.x1},{z.rect.y1})-({z.rect.x2},{z.rect.y2})</span>
                <button phx-click="spawn_zone:delete" phx-value-id={z.id}
                  class="text-red-500 hover:text-red-300">x</button>
              </li>
            </ul>
            <div :if={@spawn_zones == []} class="text-[10px] text-zinc-600 italic">None</div>
          </div>

          <div class="border-t border-zinc-800 pt-2">
            <div class="text-[10px] uppercase text-zinc-500 mb-1">Sound Zones ({length(@sound_zones)})</div>
            <ul class="space-y-1 max-h-24 overflow-y-auto">
              <li :for={z <- @sound_zones} class="flex items-center justify-between text-[10px]">
                <span class="text-blue-400">({z.rect.x1},{z.rect.y1})-({z.rect.x2},{z.rect.y2})</span>
                <button phx-click="sound_zone:delete" phx-value-id={z.id}
                  class="text-red-500 hover:text-red-300">x</button>
              </li>
            </ul>
            <div :if={@sound_zones == []} class="text-[10px] text-zinc-600 italic">None</div>
          </div>
        </div>
      </div>

      <!-- Event → script picker modal -->
      <div :if={@event_picker_target}
           class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
        <div class="w-[480px] max-h-[70vh] bg-zinc-900 border border-zinc-700 rounded-lg flex flex-col overflow-hidden"
             phx-click-away="event:picker_close">
          <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 class="text-sm font-bold text-amber-400">Link Event to Script</h3>
            <button phx-click="event:picker_close" class="text-zinc-500 hover:text-zinc-200 text-lg">✕</button>
          </div>
          <div class="flex-1 overflow-y-auto">
            <div :if={@available_scripts == []} class="p-6 text-center text-zinc-500 text-xs">
              No scripts found. Create one in <a href={~p"/sauce/scripts"} class="text-amber-400">Visual Scripts</a> first.
            </div>
            <ul class="divide-y divide-zinc-800">
              <li class="px-4 py-2 hover:bg-zinc-800/50">
                <button phx-click="event:link_script"
                  phx-value-event_id={@event_picker_target} phx-value-script_id=""
                  class="w-full text-left text-xs text-zinc-500">
                  ✕ No script (clear link)
                </button>
              </li>
              <li :for={s <- @available_scripts} class="px-4 py-2 hover:bg-zinc-800/50">
                <button phx-click="event:link_script"
                  phx-value-event_id={@event_picker_target} phx-value-script_id={s.id}
                  class="w-full text-left text-xs text-zinc-200">
                  📜 {s.name} <span class="text-zinc-500">(#{s.id})</span>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Pending spawn zone modal -->
      <div :if={@pending_zone && @pending_zone.kind == "spawn_zone"}
           class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
        <div class="w-[520px] bg-zinc-900 border border-zinc-700 rounded-lg flex flex-col overflow-hidden"
             phx-click-away="zone:cancel">
          <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 class="text-sm font-bold text-amber-400">New Spawn Zone</h3>
            <button phx-click="zone:cancel" class="text-zinc-500 hover:text-zinc-200 text-lg">✕</button>
          </div>
          <form phx-submit="zone:save_spawn" class="p-4 space-y-3 text-xs">
            <p class="text-[11px] text-zinc-500">
              Region: ({@pending_zone.rect.x1}, {@pending_zone.rect.y1}) → ({@pending_zone.rect.x2}, {@pending_zone.rect.y2})
            </p>
            <label class="block">
              <span class="text-zinc-400">Encounter table — JSON array of objects with <code>npc_id</code> and <code>weight</code></span>
              <textarea name="encounter_table" rows="4" placeholder='[{"npc_id":1,"weight":3},{"npc_id":2,"weight":1}]'
                class="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200 font-mono"></textarea>
            </label>
            <label class="block">
              <span class="text-zinc-400">Scaling factor</span>
              <input type="number" step="0.05" name="scaling_factor" value="1.0"
                class="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
            </label>
            <label class="block">
              <span class="text-zinc-400">Required world flag (optional)</span>
              <input type="text" name="flag" placeholder="e.g. crypt_unlocked"
                class="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" name="enabled" checked />
              <span class="text-zinc-400">Enabled</span>
            </label>
            <div class="pt-2 flex justify-end gap-2">
              <button type="button" phx-click="zone:cancel"
                class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded">Cancel</button>
              <button type="submit"
                class="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-black rounded font-bold">Save Zone</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Pending sound zone modal -->
      <div :if={@pending_zone && @pending_zone.kind == "sound_zone"}
           class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
        <div class="w-[480px] bg-zinc-900 border border-zinc-700 rounded-lg flex flex-col overflow-hidden"
             phx-click-away="zone:cancel">
          <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 class="text-sm font-bold text-amber-400">New Sound Zone</h3>
            <button phx-click="zone:cancel" class="text-zinc-500 hover:text-zinc-200 text-lg">✕</button>
          </div>
          <form phx-submit="zone:save_sound" class="p-4 space-y-3 text-xs">
            <p class="text-[11px] text-zinc-500">
              Region: ({@pending_zone.rect.x1}, {@pending_zone.rect.y1}) → ({@pending_zone.rect.x2}, {@pending_zone.rect.y2})
            </p>
            <label class="block">
              <span class="text-zinc-400">Sound URL</span>
              <input type="text" name="sound_url" placeholder="https://…/forest_loop.ogg" required
                class="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label>
                <span class="text-zinc-400">Volume (0–1)</span>
                <input type="number" step="0.05" min="0" max="1" name="volume" value="0.6"
                  class="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
              </label>
              <label>
                <span class="text-zinc-400">Fade seconds</span>
                <input type="number" step="0.1" min="0" name="fade_seconds" value="1.0"
                  class="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
              </label>
            </div>
            <label class="flex items-center gap-2">
              <input type="checkbox" name="loop" checked />
              <span class="text-zinc-400">Loop</span>
            </label>
            <div class="pt-2 flex justify-end gap-2">
              <button type="button" phx-click="zone:cancel"
                class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded">Cancel</button>
              <button type="submit"
                class="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-black rounded font-bold">Save Zone</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Tile animation modal -->
      <div :if={@tile_anim_open && @tile_anim_target}
           class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
           phx-click="tile_anim:close">
        <div class="w-[480px] bg-zinc-900 border border-zinc-700 rounded-lg flex flex-col overflow-hidden"
             phx-click-away="tile_anim:close">
          <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 class="text-sm font-bold text-amber-400">Tile #{@tile_anim_target.tile_id} Animation</h3>
            <button phx-click="tile_anim:close" class="text-zinc-500 hover:text-zinc-200 text-lg">✕</button>
          </div>
          <form phx-submit="tile_anim:save" class="p-4 space-y-3 text-xs">
            <label class="block">
              <span class="text-zinc-400">Frame tile IDs (comma or space separated)</span>
              <input type="text" name="frames" value={Enum.join(@tile_anim_target.frames, ",")}
                placeholder="0,1,2,1"
                class="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200 font-mono" />
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label>
                <span class="text-zinc-400">FPS</span>
                <input type="number" step="0.5" min="0.5" max="60" name="fps" value={@tile_anim_target.fps}
                  class="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
              </label>
              <label>
                <span class="text-zinc-400">Trigger</span>
                <select name="trigger" class="w-full mt-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-200">
                  <option :for={t <- ~w(always step_on interact world_flag)} value={t}
                    selected={@tile_anim_target.trigger == t}>{t}</option>
                </select>
              </label>
            </div>
            <div class="pt-2 flex justify-end gap-2">
              <button type="button" phx-click="tile_anim:delete" phx-value-tile_id={@tile_anim_target.tile_id}
                class="px-3 py-1.5 bg-red-800 hover:bg-red-700 text-zinc-100 rounded">Delete</button>
              <button type="button" phx-click="tile_anim:close"
                class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded">Cancel</button>
              <button type="submit"
                class="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-black rounded font-bold">Save</button>
            </div>
          </form>
        </div>
      </div>

      <!-- History drawer (Phase 2B: op log instead of snapshot list) -->
      <div :if={@history_open} class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
           phx-click="history:close">
        <div class="w-[720px] max-h-[80vh] bg-zinc-900 border border-zinc-700 rounded-lg flex flex-col overflow-hidden"
             phx-click-away="history:close">
          <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div>
              <h3 class="text-sm font-bold text-amber-400">Op History — {@map.name}</h3>
              <p class="text-[10px] text-zinc-500 mt-0.5">
                head_seq <span class="font-mono text-zinc-300">{Map.get(@map, :head_seq, "?")}</span>
                · {length(@history_versions)} most-recent ops shown
                · inverted ops are skipped during replay
              </p>
            </div>
            <button phx-click="history:close" class="text-zinc-500 hover:text-zinc-200 text-lg">✕</button>
          </div>

          <!-- Time-scrub slider — drag to preview state at any sequence -->
          <div class="px-4 py-3 border-b border-zinc-800 bg-zinc-950/50 space-y-2">
            <div class="flex items-center justify-between text-[10px]">
              <span class={[@scrub_active && "text-amber-400 font-bold", !@scrub_active && "text-zinc-500"]}>
                <%= if @scrub_active, do: "🕒 Previewing at seq #{@scrub_seq}", else: "Live state" %>
              </span>
              <div class="flex items-center gap-2">
                <span :if={@scrub_active && @new_ops_since_scrub > 0}
                  class="px-1.5 py-0.5 bg-emerald-700/40 border border-emerald-500 text-emerald-200 rounded text-[10px] font-bold animate-pulse"
                  title="Other editors have appended ops while you were scrubbing">
                  +{@new_ops_since_scrub} new
                </span>
                <button :if={@scrub_active} phx-click="history:scrub_reset"
                  class="text-[10px] text-zinc-400 hover:text-zinc-200 underline">
                  Reset to head
                </button>
                <button :if={@scrub_active && @scrub_seq < Map.get(@map, :head_seq, 0)}
                  phx-click="history:restore_to_seq" phx-value-seq={@scrub_seq}
                  data-confirm={"Mark all ops with seq > #{@scrub_seq} as inverted? This is reversible per-op via Redo, but affects many rows."}
                  class="px-2 py-0.5 text-[10px] bg-rose-900/40 hover:bg-rose-800 text-rose-200 rounded">
                  Restore to here
                </button>
              </div>
            </div>
            <form phx-change="history:scrub" class="flex items-center gap-2">
              <span class="text-[9px] text-zinc-600 font-mono w-6 text-right">0</span>
              <input type="range" min="0" max={Map.get(@map, :head_seq, 0)}
                value={if @scrub_active, do: @scrub_seq, else: Map.get(@map, :head_seq, 0)}
                name="value" step="1"
                class="flex-1 accent-amber-500" />
              <span class="text-[9px] text-zinc-600 font-mono w-12">{Map.get(@map, :head_seq, 0)}</span>
            </form>
          </div>

          <div class="flex-1 overflow-y-auto">
            <div :if={@history_versions == []} class="p-6 text-center text-zinc-500 text-xs">
              No ops logged yet. Paint or place something to start the history.
            </div>
            <ul class="divide-y divide-zinc-800">
              <li :for={op <- @history_versions}
                class={["px-4 py-2 flex items-center justify-between gap-3 transition-colors",
                  op.inverted && "opacity-50 bg-rose-950/10",
                  !op.inverted && "hover:bg-zinc-800/50"]}>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 text-xs">
                    <span class="font-mono text-zinc-500 shrink-0">#{op.sequence}</span>
                    <span class={["px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0",
                      op_type_color(op.op_type)]}>{op.op_type}</span>
                    <span class="text-zinc-300 truncate">{op_summary(op)}</span>
                  </div>
                  <div class="text-[10px] text-zinc-500 mt-0.5">
                    {op.user_name || "(system)"} · <span class="font-mono">{format_op_timestamp(op.created_at)}</span>
                    <span :if={op.inverted} class="ml-2 text-rose-400 font-bold">[inverted]</span>
                  </div>
                </div>
                <button :if={!op.inverted} phx-click="history:undo_op" phx-value-op_id={op.op_id}
                  title="Mark this op as inverted — replay will skip it"
                  class="px-2 py-1 text-[10px] bg-zinc-800 hover:bg-rose-800 hover:text-white text-zinc-300 rounded shrink-0">
                  Undo
                </button>
                <button :if={op.inverted} phx-click="history:redo_op" phx-value-op_id={op.op_id}
                  title="Re-apply this op"
                  class="px-2 py-1 text-[10px] bg-zinc-800 hover:bg-emerald-700 hover:text-white text-zinc-300 rounded shrink-0">
                  Redo
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
    """
  end

  defp filter_palette(palette, ""), do: palette

  defp filter_palette(palette, q) do
    q = String.downcase(q)

    Enum.filter(palette, fn entry ->
      String.contains?(String.downcase(entry.label), q) or
        String.contains?(Integer.to_string(entry.id), q)
    end)
  end

  defp palette_color(palette, id) do
    case Enum.find(palette, &(&1.id == id)) do
      nil -> "#444"
      entry -> entry.color
    end
  end

  # ── Data loading ───────────────────────────────────────────

  defp load_map(id_str) do
    case Integer.parse(id_str) do
      {id, _} when id > 0 ->
        case Repo.query(
               """
               SELECT id, name, width, height, tiles_json, layers_json, schema_version, render_mode, spawn_x, spawn_y
               FROM game_maps
               WHERE id = ?
               """,
               [id]
             ) do
          {:ok, %{rows: [[id, name, w, h, tiles_json, layers_json, schema_v, render_mode, spawn_x, spawn_y]]}} ->
            layers = parse_layers(layers_json, tiles_json, w, h)

            {:ok,
             %{
               id: id,
               name: name,
               width: w,
               height: h,
               render_mode: render_mode || "classic",
               schema_version: schema_v || 1,
               layers: layers,
               spawn_x: spawn_x,
               spawn_y: spawn_y
             }}

          _ ->
            {:error, :not_found}
        end

      _ ->
        {:error, :not_found}
    end
  end

  defp parse_layers(layers_json, _tiles_json, w, h) when is_binary(layers_json) and layers_json != "" do
    case Jason.decode(layers_json) do
      {:ok, %{"layers" => layers}} when is_map(layers) ->
        # Pad each layer to mapWidth*mapHeight. Without this, a map with
        # an empty/short layer in JSON would silently no-op every paint
        # (List.replace_at on an empty list returns []), leaving the
        # unsaved flag flipped but no tile change. Caught by JARVIS in
        # the T2 verification — paint dispatched but nothing visible.
        size = max(w, 1) * max(h, 1)

        %{
          "ground" => ensure_len(Map.get(layers, "ground", []), size, 0),
          "overlay" => ensure_len(Map.get(layers, "overlay", []), size, -1),
          "passability" => ensure_len(Map.get(layers, "passability", []), size, 0),
          "fringe" => ensure_len(Map.get(layers, "fringe", []), size, -1),
          "elevation" => ensure_len(Map.get(layers, "elevation", []), size, 0)
        }

      _ ->
        empty_layers(w, h)
    end
  end

  defp parse_layers(_, tiles_json, w, h) when is_binary(tiles_json) and tiles_json != "" do
    case Jason.decode(tiles_json) do
      {:ok, list} when is_list(list) ->
        cond do
          length(list) == w * h and (is_number(List.first(list)) or List.first(list) == nil) ->
            %{
              "ground" => list,
              "overlay" => List.duplicate(-1, w * h),
              "passability" => List.duplicate(0, w * h),
              "fringe" => List.duplicate(-1, w * h),
              "elevation" => List.duplicate(0, w * h)
            }

          length(list) >= 5 ->
            [g, o, p, f, e | _] = list

            %{
              "ground" => ensure_len(g, w * h),
              "overlay" => ensure_len(o, w * h),
              "passability" => ensure_len(p, w * h),
              "fringe" => ensure_len(f, w * h),
              "elevation" => ensure_len(e, w * h)
            }

          true ->
            empty_layers(w, h)
        end

      _ ->
        empty_layers(w, h)
    end
  end

  defp parse_layers(_, _, w, h), do: empty_layers(w, h)

  defp empty_layers(w, h) do
    size = max(w, 1) * max(h, 1)

    %{
      "ground" => List.duplicate(0, size),
      "overlay" => List.duplicate(-1, size),
      "passability" => List.duplicate(0, size),
      "fringe" => List.duplicate(-1, size),
      "elevation" => List.duplicate(0, size)
    }
  end

  defp ensure_len(list, target), do: ensure_len(list, target, 0)

  defp ensure_len(list, target, fill) when is_list(list) do
    cur = length(list)
    cond do
      cur == target -> list
      cur > target -> Enum.take(list, target)
      true -> list ++ List.duplicate(fill, target - cur)
    end
  end

  defp ensure_len(_, target, fill), do: List.duplicate(fill, target)

  # ── Tools ──────────────────────────────────────────────────

  defp tool_list do
    [
      %{key: "brush", label: "Brush", icon: "🖌️"},
      %{key: "fill", label: "Fill", icon: "🪣"},
      %{key: "rect", label: "Rect", icon: "▭"},
      %{key: "eraser", label: "Eraser", icon: "🧽"},
      %{key: "eyedrop", label: "Pick", icon: "💧"},
      %{key: "select", label: "Select", icon: "⬚"},
      %{key: "passability", label: "Pass", icon: "⛔"},
      %{key: "autotile", label: "Auto", icon: "🧩"},
      %{key: "elevation", label: "Elev", icon: "⛰️"},
      %{key: "object", label: "Object", icon: "🪵"},
      %{key: "event", label: "Event", icon: "✨"},
      %{key: "spawn_zone", label: "Spawn", icon: "🐾"},
      %{key: "sound_zone", label: "Sound", icon: "🔊"}
    ]
  end

  @object_presets [
    %{key: "TORCH", label: "Torch", icon: "🔥", group: "LIGHT", blocking: false, light: %{radius: 5, color: "#ffaa44", flicker: true}},
    %{key: "BRAZIER", label: "Brazier", icon: "🕯️", group: "LIGHT", blocking: true, light: %{radius: 6, color: "#ff8822", flicker: true}},
    %{key: "OIL_LAMP", label: "Oil Lamp", icon: "🪔", group: "LIGHT", blocking: false, light: %{radius: 4, color: "#ffcc55", flicker: false}},
    %{key: "CANDLE", label: "Candle", icon: "🕯️", group: "LIGHT", blocking: false, light: %{radius: 2, color: "#fff0aa", flicker: true}},
    %{key: "MOONLIGHT", label: "Moonlight", icon: "🌕", group: "LIGHT", blocking: false, light: %{radius: 8, color: "#aaccff", flicker: false}},
    %{key: "OIL_BARREL", label: "Oil Barrel", icon: "🛢", group: "PROP", blocking: true, battle_destroy_type: "fire_aoe", battle_hp: 5},
    %{key: "PILLAR", label: "Pillar", icon: "🪨", group: "PROP", blocking: true, battle_destroy_type: "crush", battle_hp: 20},
    %{key: "CAULDRON", label: "Cauldron", icon: "🍲", group: "PROP", blocking: true},
    %{key: "BED", label: "Bed", icon: "🛏", group: "PROP", blocking: true},
    %{key: "CHAIR", label: "Chair", icon: "🪑", group: "PROP", blocking: true},
    %{key: "TABLE", label: "Table", icon: "🪟", group: "PROP", blocking: true},
    %{key: "CHEST", label: "Chest", icon: "🧰", group: "PROP", blocking: true},
    %{key: "BARREL", label: "Barrel", icon: "🛢", group: "PROP", blocking: true},
    %{key: "CRATE", label: "Crate", icon: "📦", group: "PROP", blocking: true, battle_destroy_type: "crush", battle_hp: 3},
    %{key: "BOOKSHELF", label: "Bookshelf", icon: "📚", group: "PROP", blocking: true},
    %{key: "WEAPON_RACK", label: "Weapon Rack", icon: "⚔", group: "PROP", blocking: true},
    %{key: "ANVIL", label: "Anvil", icon: "🔨", group: "PROP", blocking: true},
    %{key: "FOUNTAIN", label: "Fountain", icon: "⛲", group: "PROP", blocking: true},
    %{key: "STATUE", label: "Statue", icon: "🗿", group: "PROP", blocking: true},
    %{key: "GRAVE", label: "Grave", icon: "🪦", group: "DECO", blocking: false},
    %{key: "SKULL", label: "Skull", icon: "💀", group: "DECO", blocking: false},
    %{key: "BUSH", label: "Bush", icon: "🌿", group: "DECO", blocking: false, battle_cover_value: 1},
    %{key: "TREE", label: "Tree", icon: "🌳", group: "DECO", blocking: true, battle_cover_value: 2},
    %{key: "FLOWER", label: "Flower", icon: "🌸", group: "DECO", blocking: false},
    %{key: "MUSHROOM", label: "Mushroom", icon: "🍄", group: "DECO", blocking: false}
  ]

  defp object_presets, do: @object_presets

  defp object_preset(key) do
    Enum.find(@object_presets, fn p -> p.key == key end) || List.first(@object_presets)
  end

  @event_kinds ~w(NPC TELEPORT ENEMY LOOT SHOP TERRAIN SCRIPT)
  defp event_kinds, do: @event_kinds

  defp layer_names, do: ~w(ground overlay fringe passability elevation)

  # Default 64-tile palette. Names + hex tuned for the dark Celtic fantasy
  # aesthetic — natural terrain (8–23), masonry (24–31), wood/vegetation
  # (32–39), cave/underworld (40–47), magical (48–55), structural (56–63).
  # Mirrors DEFAULT_TILE_COLORS in packages/render/src/renderer.ts for the
  # subset of tiles the renderer needs at boot.
  @tile_palette [
    # 0–7 — base terrain (legacy fixed)
    {0, "grass",          "#2e5d31"},
    {1, "stone",          "#3a3a3a"},
    {2, "dirt",           "#3a2a0a"},
    {3, "water",          "#1e3a5f"},
    {4, "wood",           "#7a5a2a"},
    {5, "cobble",         "#8a8a8a"},
    {6, "cave",           "#2a2a2a"},
    {7, "void",           "#1a1a1a"},
    # 8–23 — natural terrain
    {8,  "sand",          "#c9b27a"},
    {9,  "snow",          "#e8edf2"},
    {10, "ice",           "#a4c8e0"},
    {11, "mud",           "#4a3520"},
    {12, "lava",          "#c1331a"},
    {13, "ash",           "#5a544f"},
    {14, "tall grass",    "#4a7a3a"},
    {15, "heather",       "#8a5d8a"},
    {16, "moss",          "#3a5a30"},
    {17, "bog",           "#3d3823"},
    {18, "peat",          "#2b1f10"},
    {19, "mire",          "#3a3a25"},
    {20, "shallows",      "#3d6385"},
    {21, "ocean",         "#14304f"},
    {22, "river",         "#2d5478"},
    {23, "rapids",        "#5a8aaa"},
    # 24–31 — stone & masonry
    {24, "marble",        "#d6d2c8"},
    {25, "slate",         "#4a525a"},
    {26, "brick",         "#813833"},
    {27, "granite",       "#6d6e72"},
    {28, "sandstone",     "#b08a5a"},
    {29, "ruined cobble", "#5a574d"},
    {30, "ancient brick", "#5d3329"},
    {31, "dolmen",        "#3a3530"},
    # 32–39 — wood & vegetation
    {32, "planks",        "#6e4a25"},
    {33, "oak floor",     "#855e2e"},
    {34, "bark",          "#4a311a"},
    {35, "roots",         "#2d2010"},
    {36, "bramble",       "#4a3a3a"},
    {37, "fern",          "#3d6535"},
    {38, "thorns",        "#2a1f1a"},
    {39, "ivy",           "#2d5025"},
    # 40–47 — cave & underworld
    {40, "bone",          "#d8d0b8"},
    {41, "blood earth",   "#4a1c1c"},
    {42, "gore",          "#6e1c1c"},
    {43, "cinder",        "#1f1a18"},
    {44, "ember",         "#b8501a"},
    {45, "shadow",        "#15131a"},
    {46, "void rift",     "#1a0d2a"},
    {47, "blight",        "#3a3520"},
    # 48–55 — magic & rune
    {48, "rune",          "#6a5aa0"},
    {49, "ward",          "#5a8a90"},
    {50, "ley line",      "#80c0e8"},
    {51, "crystal",       "#8aa8d0"},
    {52, "amethyst",      "#7a4ab0"},
    {53, "emerald moss",  "#1a6a4a"},
    {54, "faerie ring",   "#d090b8"},
    {55, "ogham stone",   "#5a5040"},
    # 56–63 — structural & decorative
    {56, "trapdoor",      "#3a2515"},
    {57, "stairs up",     "#6a5a4a"},
    {58, "stairs down",   "#2a1f15"},
    {59, "pit",           "#050505"},
    {60, "spike",         "#8a8a90"},
    {61, "torch ground",  "#c08a35"},
    {62, "bridge plank",  "#5a4530"},
    {63, "doorstep",      "#4a4035"}
  ]

  defp palette do
    Enum.map(@tile_palette, fn {id, label, color} ->
      %{id: id, label: label, color: color}
    end)
  end

  # ── Right-panel-kind dispatch ──────────────────────────────
  #
  # Phase 2A: the right-side aside reshapes per the active tool. Painting
  # tools all share the tile palette; tools that have their own deep
  # config (object/event/zones/etc.) get a panel dedicated to that tool.
  defp right_panel_kind(tool) when tool in ~w(brush fill rect eraser eyedrop), do: :tile_palette
  defp right_panel_kind("passability"), do: :pass
  defp right_panel_kind("autotile"), do: :auto
  defp right_panel_kind("elevation"), do: :elev
  defp right_panel_kind("object"), do: :object
  defp right_panel_kind("event"), do: :event
  defp right_panel_kind("spawn_zone"), do: :spawn
  defp right_panel_kind("sound_zone"), do: :sound
  defp right_panel_kind("select"), do: :select
  defp right_panel_kind(_), do: :tile_palette

  defp panel_title(:tile_palette), do: "Tile Palette"
  defp panel_title(:pass), do: "Passability"
  defp panel_title(:auto), do: "Autotile"
  defp panel_title(:elev), do: "Elevation"
  defp panel_title(:object), do: "Objects"
  defp panel_title(:event), do: "Events"
  defp panel_title(:spawn), do: "Spawn Zones"
  defp panel_title(:sound), do: "Sound Zones"
  defp panel_title(:select), do: "Selection"

  defp panel_icon(:tile_palette), do: "🎨"
  defp panel_icon(:pass), do: "⛔"
  defp panel_icon(:auto), do: "🧩"
  defp panel_icon(:elev), do: "⛰️"
  defp panel_icon(:object), do: "🪵"
  defp panel_icon(:event), do: "✨"
  defp panel_icon(:spawn), do: "🐾"
  defp panel_icon(:sound), do: "🔊"
  defp panel_icon(:select), do: "⬚"

  # Default event form payload per kind. The form persists into events.data
  # JSON column when the user clicks the canvas with the Event tool.
  defp default_event_form("TELEPORT"), do: %{"target_map_id" => "", "target_x" => "0", "target_y" => "0"}
  defp default_event_form("LOOT"), do: %{"items_table" => "[]", "respawn_seconds" => "0"}
  defp default_event_form("SHOP"), do: %{"shop_id" => ""}
  defp default_event_form("NPC"), do: %{"npc_template_id" => "", "dialogue_id" => ""}
  defp default_event_form("ENEMY"), do: %{"enemy_template_id" => "", "level_scaling" => "1.0"}
  defp default_event_form("SCRIPT"), do: %{"script_id" => "", "params" => "{}"}
  defp default_event_form("TERRAIN"), do: %{"terrain_modifier" => "", "amount" => "0"}
  defp default_event_form(_), do: %{}

  defp event_kind_icon("TELEPORT"), do: "🌀"
  defp event_kind_icon("LOOT"), do: "💰"
  defp event_kind_icon("SHOP"), do: "🛒"
  defp event_kind_icon("NPC"), do: "👤"
  defp event_kind_icon("ENEMY"), do: "⚔️"
  defp event_kind_icon("SCRIPT"), do: "📜"
  defp event_kind_icon("TERRAIN"), do: "🌫"
  defp event_kind_icon(_), do: "✨"

  defp event_kind_description("TELEPORT"), do: "Move player to another map/coords"
  defp event_kind_description("LOOT"), do: "Pickable items + respawn"
  defp event_kind_description("SHOP"), do: "Open a vendor's inventory"
  defp event_kind_description("NPC"), do: "Talk-to actor + dialogue"
  defp event_kind_description("ENEMY"), do: "Hostile encounter trigger"
  defp event_kind_description("SCRIPT"), do: "Custom Visual Script"
  defp event_kind_description("TERRAIN"), do: "Damage/heal/slow zone"
  defp event_kind_description(_), do: ""

  # Compact a URL for display in the sound-zone list (drop scheme, trim).
  defp short_url(""), do: ""
  defp short_url(nil), do: ""

  defp short_url(url) when is_binary(url) do
    trimmed =
      url
      |> String.replace_prefix("https://", "")
      |> String.replace_prefix("http://", "")

    if String.length(trimmed) > 28, do: String.slice(trimmed, 0, 25) <> "…", else: trimmed
  end

  # ── History drawer formatting (Phase 2B) ────────────────────────

  defp op_type_color("paint_tile"), do: "bg-amber-900/40 text-amber-300"
  defp op_type_color("rect"), do: "bg-amber-800/40 text-amber-200"
  defp op_type_color("fill"), do: "bg-orange-800/40 text-orange-200"
  defp op_type_color("stamp"), do: "bg-violet-800/40 text-violet-200"
  defp op_type_color("place_object"), do: "bg-emerald-800/40 text-emerald-200"
  defp op_type_color("delete_object"), do: "bg-rose-900/40 text-rose-200"
  defp op_type_color("place_event"), do: "bg-cyan-800/40 text-cyan-200"
  defp op_type_color("delete_event"), do: "bg-rose-900/40 text-rose-200"
  defp op_type_color("replace_layers"), do: "bg-zinc-700 text-zinc-200"
  defp op_type_color("seed_from_snapshot"), do: "bg-zinc-700 text-zinc-300"
  defp op_type_color("set_property"), do: "bg-blue-800/40 text-blue-200"
  defp op_type_color(_), do: "bg-zinc-800 text-zinc-400"

  defp op_summary(%{op_type: "paint_tile", patch: %{"layer" => layer, "x" => x, "y" => y, "id" => id}}),
    do: "#{layer} (#{x},#{y}) ← tile #{id}"

  defp op_summary(%{op_type: "rect", patch: %{"layer" => layer, "value" => v, "cells" => cells}}),
    do: "#{layer} ← #{v} × #{length(cells)} cells"

  defp op_summary(%{op_type: "fill", patch: %{"layer" => layer, "value" => v, "cells" => cells}}),
    do: "fill #{layer} #{v} × #{length(cells)}"

  defp op_summary(%{op_type: "stamp", patch: %{"layer" => layer, "x" => x, "y" => y}}),
    do: "stamp on #{layer} at (#{x},#{y})"

  defp op_summary(%{op_type: "place_object", patch: %{"object" => o}}),
    do: "place #{Map.get(o, "preset", "object")} at (#{Map.get(o, "x", "?")},#{Map.get(o, "y", "?")})"

  defp op_summary(%{op_type: "delete_object", patch: %{"object_id" => id}}),
    do: "delete object #{String.slice(to_string(id), 0, 8)}"

  defp op_summary(%{op_type: "place_event", patch: %{"event" => ev}}),
    do: "place #{Map.get(ev, "kind", "event")} at (#{Map.get(ev, "x", "?")},#{Map.get(ev, "y", "?")})"

  defp op_summary(%{op_type: "replace_layers"}),
    do: "full save (legacy bulk save)"

  defp op_summary(%{op_type: "seed_from_snapshot"}),
    do: "root snapshot (history seed)"

  defp op_summary(%{op_type: "set_property", patch: %{"field" => f, "new" => v}}),
    do: "#{f} → #{inspect(v)}"

  defp op_summary(%{op_type: type}), do: "(#{type})"

  defp format_op_timestamp(nil), do: ""

  defp format_op_timestamp(%NaiveDateTime{} = ts),
    do: Calendar.strftime(ts, "%Y-%m-%d %H:%M:%S")

  defp format_op_timestamp(%DateTime{} = ts),
    do: Calendar.strftime(ts, "%Y-%m-%d %H:%M:%S")

  defp format_op_timestamp(other), do: to_string(other)

  # ── Autotile ───────────────────────────────────────────────
  #
  # 8-neighbor bitmask autotiling in the RPG-Maker / Wang-tile style.
  # A group defines:
  #   - base_tile_id: the id used as the "paint" handle
  #   - members:      set of tile ids that count as "same" for adjacency
  #   - variant_map:  %{bitmask => tile_id} — which variant to draw for a mask
  #
  # Mask layout (LSB→MSB): N, E, S, W, NE, SE, SW, NW. Corners only count
  # when both adjacent cardinals are set, collapsing 256 masks to 47.
  #
  # Groups are loaded from `game_autotile_groups` if the table exists;
  # otherwise a sensible default (stone on grass, water on grass) is used
  # so the feature is usable without DB setup.

  defp load_autotile_groups do
    case Repo.query("SHOW TABLES LIKE 'game_autotile_groups'") do
      {:ok, %{rows: [_ | _]}} ->
        case Repo.query("SELECT id, name, base_tile_id, members_json, variants_json FROM game_autotile_groups") do
          {:ok, %{rows: rows}} when rows != [] ->
            Enum.map(rows, fn [id, name, base, members_json, variants_json] ->
              %{
                id: id,
                name: name,
                base_tile_id: base,
                members: decode_int_list(members_json) |> MapSet.new(),
                variant_map: decode_variant_map(variants_json)
              }
            end)

          _ ->
            default_autotile_groups()
        end

      _ ->
        default_autotile_groups()
    end
  end

  defp default_autotile_groups do
    [
      %{
        id: :default_stone,
        name: "Stone Wall",
        base_tile_id: 1,
        members: MapSet.new([1, 26, 27, 30]),
        variant_map: %{}
      },
      %{
        id: :default_water,
        name: "Water Shoreline",
        base_tile_id: 3,
        members: MapSet.new([3, 20, 21, 22, 23]),
        variant_map: %{}
      },
      %{
        id: :default_dirt,
        name: "Dirt Path",
        base_tile_id: 2,
        members: MapSet.new([2, 8, 11, 18]),
        variant_map: %{}
      },
      %{
        id: :default_cobble,
        name: "Cobblestone Floor",
        base_tile_id: 5,
        members: MapSet.new([5, 29]),
        variant_map: %{}
      }
    ]
  end

  defp decode_int_list(json) when is_binary(json) do
    case Jason.decode(json) do
      {:ok, list} when is_list(list) -> Enum.map(list, &to_int/1)
      _ -> []
    end
  end

  defp decode_int_list(_), do: []

  defp decode_variant_map(json) when is_binary(json) do
    case Jason.decode(json) do
      {:ok, %{} = m} ->
        for {k, v} <- m, into: %{}, do: {to_int(k), to_int(v)}

      _ ->
        %{}
    end
  end

  defp decode_variant_map(_), do: %{}

  defp find_autotile_group(groups, tile_id) do
    Enum.find(groups, fn g -> g.base_tile_id == tile_id or MapSet.member?(g.members, tile_id) end)
  end

  # Paint (x,y) + recompute 8 neighbors into a single stamp op.
  defp autotile_paint(map, layer, x, y, group) do
    layer_data = Map.get(map.layers, layer, [])

    # Step 1: place the base tile at the click.
    layer_after_paint =
      if in_bounds?(map, x, y) do
        List.replace_at(layer_data, y * map.width + x, group.base_tile_id)
      else
        layer_data
      end

    candidates =
      for dy <- -1..1, dx <- -1..1, in_bounds?(map, x + dx, y + dy), do: {x + dx, y + dy}

    {final_layer, cells} =
      Enum.reduce(candidates, {layer_after_paint, []}, fn {cx, cy}, {d_acc, c_acc} ->
        if MapSet.member?(group.members, Enum.at(d_acc, cy * map.width + cx, -1)) do
          mask = autotile_mask(d_acc, map.width, map.height, cx, cy, group.members)
          variant = Map.get(group.variant_map, mask, group.base_tile_id)
          idx = cy * map.width + cx
          prev = Enum.at(layer_data, idx, 0)

          if Enum.at(d_acc, idx, 0) == variant and prev == variant do
            {d_acc, c_acc}
          else
            {List.replace_at(d_acc, idx, variant),
             [%{x: cx, y: cy, prev: prev, value: variant} | c_acc]}
          end
        else
          {d_acc, c_acc}
        end
      end)

    if cells == [] do
      {:error, :nochange}
    else
      updated = put_in(map.layers[layer], final_layer)

      op = %{
        op_id: op_id(),
        op_type: "stamp",
        layer: layer,
        cells: Enum.reverse(cells)
      }

      {:ok, updated, op}
    end
  end

  defp in_bounds?(map, x, y), do: x >= 0 and y >= 0 and x < map.width and y < map.height

  # 8-neighbor Wang-tile bitmask. Corners only count when both adjacent
  # cardinals are set — collapses 256 raw masks down to the canonical 47.
  defp autotile_mask(layer, w, h, x, y, members) do
    m = fn cx, cy ->
      cond do
        cx < 0 or cy < 0 or cx >= w or cy >= h -> false
        true -> MapSet.member?(members, Enum.at(layer, cy * w + cx, -1))
      end
    end

    n = m.(x, y - 1)
    e = m.(x + 1, y)
    s = m.(x, y + 1)
    w_ = m.(x - 1, y)
    ne = n and e and m.(x + 1, y - 1)
    se = s and e and m.(x + 1, y + 1)
    sw = s and w_ and m.(x - 1, y + 1)
    nw = n and w_ and m.(x - 1, y - 1)

    bit(n, 0) + bit(e, 1) + bit(s, 2) + bit(w_, 3) +
      bit(ne, 4) + bit(se, 5) + bit(sw, 6) + bit(nw, 7)
  end

  defp bit(true, shift), do: bsl(1, shift)
  defp bit(false, _), do: 0

  defp default_layer_visibility do
    # Visual layers are visible by default; debug layers (elevation numbers & passability overlay)
    # default to hidden so the map artwork remains clean. Toggled via the Layers panel.
    for l <- layer_names(), into: %{} do
      {l, l in ~w(ground overlay fringe)}
    end
  end

  # ── Tool dispatch ──────────────────────────────────────────

  defp apply_tool("brush", map, layer, x, y, brush) do
    set_tile(map, layer, x, y, brush)
  end

  defp apply_tool("eraser", map, layer, x, y, _brush) do
    empty = if layer in ["ground", "elevation", "passability"], do: 0, else: -1
    set_tile(map, layer, x, y, empty)
  end

  defp apply_tool("fill", map, layer, x, y, brush) do
    fill_flood(map, layer, x, y, brush)
  end

  defp apply_tool("eyedrop", _map, _layer, _x, _y, _brush), do: :eyedrop

  defp apply_tool("passability", map, _layer, x, y, _brush) do
    current = read_tile(map, "passability", x, y)
    next_val = rem(current + 1, 3)
    set_tile(map, "passability", x, y, next_val)
  end

  defp apply_tool("elevation", map, _layer, x, y, _brush) do
    current = read_tile(map, "elevation", x, y)
    next_val = rem(current + 1, 4)
    set_tile(map, "elevation", x, y, next_val)
  end

  # Rect, select, and autotile are dispatched from handle_tool_click before
  # reaching apply_tool, so they don't need clauses here.
  defp apply_tool(_, _, _, _, _, _), do: {:error, :unsupported_tool}

  # Commit a rectangle fill between (ax,ay) and (bx,by) inclusive on the
  # active layer. Records per-cell prev values so undo restores faithfully.
  defp apply_rect(map, layer, ax, ay, bx, by, value) do
    x1 = clamp(min(ax, bx), 0, map.width - 1)
    y1 = clamp(min(ay, by), 0, map.height - 1)
    x2 = clamp(max(ax, bx), 0, map.width - 1)
    y2 = clamp(max(ay, by), 0, map.height - 1)

    layer_data = Map.get(map.layers, layer, [])

    {new_layer, cells} =
      Enum.reduce(y1..y2, {layer_data, []}, fn ty, {data_acc, cells_acc} ->
        Enum.reduce(x1..x2, {data_acc, cells_acc}, fn tx, {d, c} ->
          idx = ty * map.width + tx
          prev = Enum.at(d, idx, 0)

          if prev == value do
            {d, c}
          else
            {List.replace_at(d, idx, value), [%{x: tx, y: ty, prev: prev} | c]}
          end
        end)
      end)

    if cells == [] do
      {:error, :nochange}
    else
      updated = put_in(map.layers[layer], new_layer)

      op = %{
        op_id: op_id(),
        op_type: "rect",
        layer: layer,
        cells: Enum.reverse(cells),
        value: value
      }

      {:ok, updated, op}
    end
  end

  defp clamp(v, lo, hi), do: v |> max(lo) |> min(hi)

  # Empty-cell sentinel per layer.
  #   ground  → -1 (matches overlay/fringe; renderer falls back to zinc).
  #   elevation/passability → 0 (real numeric defaults — flat ground, walkable).
  defp empty_value_for("ground"), do: -1
  defp empty_value_for(layer) when layer in ["elevation", "passability"], do: 0
  defp empty_value_for(_), do: -1

  defp snapshot_region(map, layer, %{x1: x1, y1: y1, x2: x2, y2: y2}) do
    data = Map.get(map.layers, layer, [])

    values =
      for ty <- y1..y2, tx <- x1..x2 do
        Enum.at(data, ty * map.width + tx, 0)
      end

    %{w: x2 - x1 + 1, h: y2 - y1 + 1, values: values}
  end

  defp apply_region_fill(map, layer, %{x1: x1, y1: y1, x2: x2, y2: y2}, value) do
    apply_rect(map, layer, x1, y1, x2, y2, value)
  end

  defp apply_region_stamp(map, layer, %{w: w, h: h, values: values}, ox, oy) do
    layer_data = Map.get(map.layers, layer, [])

    {new_layer, cells} =
      Enum.reduce(0..(h - 1), {layer_data, []}, fn dy, {d_acc, c_acc} ->
        Enum.reduce(0..(w - 1), {d_acc, c_acc}, fn dx, {d, c} ->
          tx = ox + dx
          ty = oy + dy

          if tx < 0 or ty < 0 or tx >= map.width or ty >= map.height do
            {d, c}
          else
            new_val = Enum.at(values, dy * w + dx, 0)
            idx = ty * map.width + tx
            prev = Enum.at(d, idx, 0)

            if prev == new_val do
              {d, c}
            else
              {List.replace_at(d, idx, new_val), [%{x: tx, y: ty, prev: prev, value: new_val} | c]}
            end
          end
        end)
      end)

    if cells == [] do
      {:error, :nochange}
    else
      updated = put_in(map.layers[layer], new_layer)

      op = %{
        op_id: op_id(),
        op_type: "stamp",
        layer: layer,
        cells: Enum.reverse(cells)
      }

      {:ok, updated, op}
    end
  end

  defp set_tile(map, layer, x, y, value) do
    if x < 0 or y < 0 or x >= map.width or y >= map.height do
      {:error, :oob}
    else
      idx = y * map.width + x
      layer_data = Map.get(map.layers, layer, [])
      prev = Enum.at(layer_data, idx, 0)

      if prev == value do
        {:error, :nochange}
      else
        new_layer = List.replace_at(layer_data, idx, value)
        updated = put_in(map.layers[layer], new_layer)

        op = %{
          op_id: op_id(),
          op_type: "set_tile",
          layer: layer,
          x: x,
          y: y,
          value: value,
          prev: prev
        }

        {:ok, updated, op}
      end
    end
  end

  defp fill_flood(map, layer, sx, sy, value) do
    layer_data = Map.get(map.layers, layer, [])
    target = Enum.at(layer_data, sy * map.width + sx, -999)

    if target == value do
      {:error, :nochange}
    else
      # 500-cell cap matches legacy renderer
      {filled, new_layer} = flood_bfs(layer_data, map.width, map.height, sx, sy, target, value, 500)

      if filled == [] do
        {:error, :nochange}
      else
        updated = put_in(map.layers[layer], new_layer)

        op = %{
          op_id: op_id(),
          op_type: "fill",
          layer: layer,
          cells: filled,
          value: value,
          target: target
        }

        {:ok, updated, op}
      end
    end
  end

  defp flood_bfs(layer, w, h, sx, sy, target, value, cap) do
    queue = [{sx, sy}]
    do_flood(queue, layer, w, h, target, value, cap, MapSet.new(), [])
  end

  defp do_flood([], layer, _w, _h, _target, _value, _cap, _seen, acc), do: {Enum.reverse(acc), layer}

  defp do_flood(_queue, layer, _w, _h, _target, _value, 0, _seen, acc), do: {Enum.reverse(acc), layer}

  defp do_flood([{x, y} | rest], layer, w, h, target, value, cap, seen, acc) do
    cond do
      x < 0 or y < 0 or x >= w or y >= h ->
        do_flood(rest, layer, w, h, target, value, cap, seen, acc)

      MapSet.member?(seen, {x, y}) ->
        do_flood(rest, layer, w, h, target, value, cap, seen, acc)

      true ->
        idx = y * w + x
        cur = Enum.at(layer, idx, -999)

        if cur == target do
          new_layer = List.replace_at(layer, idx, value)
          new_acc = [%{x: x, y: y} | acc]
          new_seen = MapSet.put(seen, {x, y})
          new_queue = rest ++ [{x + 1, y}, {x - 1, y}, {x, y + 1}, {x, y - 1}]
          do_flood(new_queue, new_layer, w, h, target, value, cap - 1, new_seen, new_acc)
        else
          do_flood(rest, layer, w, h, target, value, cap, seen, acc)
        end
    end
  end

  defp read_tile(map, layer, x, y) do
    if x < 0 or y < 0 or x >= map.width or y >= map.height do
      0
    else
      Map.get(map.layers, layer, [])
      |> Enum.at(y * map.width + x, 0)
    end
  end

  # ── Persistence ────────────────────────────────────────────

  # ── Draft-backed undo/redo persistence ────────────────────
  #
  # Undo/redo stacks are stored in the `game_map_drafts` row for each map
  # (user_id=0 = shared editor state) so closing the tab doesn't lose
  # history. On mount we reload from draft; on every commit/undo/redo we
  # upsert. Best-effort — a failure never blocks the edit.

  @draft_user_id 0

  defp persist_draft_stacks(map_id, undo, redo) do
    payload =
      Jason.encode!(%{
        "version" => 1,
        "undo" => undo,
        "redo" => redo,
        "saved_at" => DateTime.utc_now() |> DateTime.to_iso8601()
      })

    with {:ok, _} <-
           Repo.query(
             "DELETE FROM game_map_drafts WHERE map_id = ? AND user_id = ?",
             [map_id, @draft_user_id]
           ),
         {:ok, _} <-
           Repo.query(
             "INSERT INTO game_map_drafts (map_id, user_id, draft_json, updated_at) VALUES (?, ?, ?, NOW())",
             [map_id, @draft_user_id, payload]
           ) do
      :ok
    else
      {:error, reason} ->
        Logger.warning("[MapEditor] draft persist failed: #{inspect(reason)}")
        :ok
    end
  end

  defp load_draft_stacks(map_id) do
    case Repo.query(
           "SELECT draft_json FROM game_map_drafts WHERE map_id = ? AND user_id = ? ORDER BY updated_at DESC LIMIT 1",
           [map_id, @draft_user_id]
         ) do
      {:ok, %{rows: [[json]]}} when is_binary(json) ->
        case Jason.decode(json) do
          {:ok, %{"undo" => u, "redo" => r}} when is_list(u) and is_list(r) ->
            {normalize_ops(u), normalize_ops(r)}

          _ ->
            {[], []}
        end

      _ ->
        {[], []}
    end
  rescue
    _ -> {[], []}
  end

  # Convert a list of string-keyed ops (from JSON) back to atom-keyed maps
  # matching the in-memory op shape. Only a fixed, known set of keys is
  # converted so we never widen the atom table unsafely.
  @op_string_keys ~w(op_id op_type layer x y value prev cells target prev_layers new_layers)
  defp normalize_ops(ops) when is_list(ops) do
    Enum.map(ops, &normalize_op/1)
  end

  defp normalize_op(op) when is_map(op) do
    Enum.reduce(@op_string_keys, %{}, fn k, acc ->
      case Map.fetch(op, k) do
        {:ok, val} -> Map.put(acc, String.to_atom(k), normalize_op_value(k, val))
        :error -> acc
      end
    end)
  end

  defp normalize_op_value("cells", list) when is_list(list) do
    Enum.map(list, fn cell when is_map(cell) ->
      for {k, v} <- cell, k in ["x", "y", "prev", "value"], into: %{}, do: {String.to_atom(k), v}
    end)
  end

  defp normalize_op_value(k, %{} = layers) when k in ["prev_layers", "new_layers"] do
    %{
      "ground" => Map.get(layers, "ground", []),
      "overlay" => Map.get(layers, "overlay", []),
      "passability" => Map.get(layers, "passability", []),
      "fringe" => Map.get(layers, "fringe", []),
      "elevation" => Map.get(layers, "elevation", [])
    }
  end

  defp normalize_op_value(_, v), do: v

  # Phase 2B: route through Te.Game.MapOps so each op gets a monotonic
  # `sequence` per map (used by replay + history drawer + auto-snapshot).
  # The legacy table column layout is unchanged — Ops.append/5 hits the
  # same `game_map_ops_log` table.
  defp persist_op(map_id, op) do
    user_id = Map.get(op, :user_id) || Map.get(op, "user_id")

    TePhoenix.Game.MapOps.append(
      map_id,
      op.op_id,
      op.op_type,
      op,
      user_id: user_id,
      user_name: Map.get(op, :user_name) || "editor"
    )
  end

  # Broadcast a freshly-applied op to all peers on this map. `record` is
  # the persisted MapOps row (or nil if persist failed); `originator_id` is
  # the editor_id that produced the op so receivers can skip their own.
  defp broadcast_op(map_id, op, record, originator_id) do
    Phoenix.PubSub.broadcast(
      TePhoenix.PubSub,
      "map:#{map_id}:editor",
      {:remote_editor_op, %{patch: op, record: record, originator_id: originator_id}}
    )
  end

  defp apply_remote_op(map, %{"op_type" => "set_tile"} = op) do
    layer = op["layer"]
    idx = op["y"] * map.width + op["x"]
    data = Map.get(map.layers, layer, [])
    new_data = List.replace_at(data, idx, op["value"])
    {:ok, put_in(map.layers[layer], new_data)}
  end

  defp apply_remote_op(map, %{"op_type" => type, "layer" => layer, "cells" => cells, "value" => value})
       when type in ["rect", "fill"] do
    data = Map.get(map.layers, layer, [])

    new_data =
      Enum.reduce(cells, data, fn cell, acc ->
        x = cell["x"]
        y = cell["y"]
        List.replace_at(acc, y * map.width + x, value)
      end)

    {:ok, put_in(map.layers[layer], new_data)}
  end

  defp apply_remote_op(map, %{"op_type" => "stamp", "layer" => layer, "cells" => cells}) do
    data = Map.get(map.layers, layer, [])

    new_data =
      Enum.reduce(cells, data, fn cell, acc ->
        List.replace_at(acc, cell["y"] * map.width + cell["x"], cell["value"])
      end)

    {:ok, put_in(map.layers[layer], new_data)}
  end

  defp apply_remote_op(map, _), do: {:ok, map}

  # Undo: apply the inverse of a local op (set_tile → prev value; fill → previous values).
  defp apply_inverse(map, %{op_type: "set_tile", layer: layer, x: x, y: y, prev: prev}) do
    idx = y * map.width + x
    data = Map.get(map.layers, layer, [])
    {:ok, put_in(map.layers[layer], List.replace_at(data, idx, prev))}
  end

  defp apply_inverse(map, %{op_type: "fill", layer: layer, cells: cells, target: target}) do
    data = Map.get(map.layers, layer, [])

    new_data =
      Enum.reduce(cells, data, fn %{x: x, y: y}, acc ->
        List.replace_at(acc, y * map.width + x, target)
      end)

    {:ok, put_in(map.layers[layer], new_data)}
  end

  defp apply_inverse(map, %{op_type: "stamp", layer: layer, cells: cells}) do
    data = Map.get(map.layers, layer, [])

    new_data =
      Enum.reduce(cells, data, fn %{x: x, y: y, prev: prev}, acc ->
        List.replace_at(acc, y * map.width + x, prev)
      end)

    {:ok, put_in(map.layers[layer], new_data)}
  end

  defp apply_inverse(map, %{op_type: "rect", layer: layer, cells: cells}) do
    data = Map.get(map.layers, layer, [])

    new_data =
      Enum.reduce(cells, data, fn %{x: x, y: y, prev: prev}, acc ->
        List.replace_at(acc, y * map.width + x, prev)
      end)

    {:ok, put_in(map.layers[layer], new_data)}
  end

  defp apply_inverse(map, %{op_type: "replace_layers", prev_layers: prev}) do
    {:ok, put_in(map.layers, prev)}
  end

  defp apply_inverse(map, _), do: {:ok, map}

  # Redo: reapply a previously-undone op.
  defp apply_forward(map, %{op_type: "set_tile", layer: layer, x: x, y: y, value: value}) do
    idx = y * map.width + x
    data = Map.get(map.layers, layer, [])
    {:ok, put_in(map.layers[layer], List.replace_at(data, idx, value))}
  end

  defp apply_forward(map, %{op_type: "fill", layer: layer, cells: cells, value: value}) do
    data = Map.get(map.layers, layer, [])

    new_data =
      Enum.reduce(cells, data, fn %{x: x, y: y}, acc ->
        List.replace_at(acc, y * map.width + x, value)
      end)

    {:ok, put_in(map.layers[layer], new_data)}
  end

  defp apply_forward(map, %{op_type: "stamp", layer: layer, cells: cells}) do
    data = Map.get(map.layers, layer, [])

    new_data =
      Enum.reduce(cells, data, fn %{x: x, y: y, value: value}, acc ->
        List.replace_at(acc, y * map.width + x, value)
      end)

    {:ok, put_in(map.layers[layer], new_data)}
  end

  defp apply_forward(map, %{op_type: "rect", layer: layer, cells: cells, value: value}) do
    data = Map.get(map.layers, layer, [])

    new_data =
      Enum.reduce(cells, data, fn %{x: x, y: y}, acc ->
        List.replace_at(acc, y * map.width + x, value)
      end)

    {:ok, put_in(map.layers[layer], new_data)}
  end

  defp apply_forward(map, %{op_type: "replace_layers", new_layers: new}) do
    {:ok, put_in(map.layers, new)}
  end

  defp apply_forward(map, _), do: {:ok, map}

  defp flush_draft(map) do
    layers_json = Jason.encode!(%{schema_version: 2, layers: map.layers})

    case Repo.query(
           "UPDATE game_maps SET layers_json = ?, schema_version = 2 WHERE id = ?",
           [layers_json, map.id]
         ) do
      {:ok, _} ->
        write_version_snapshot(map, layers_json)
        Phoenix.PubSub.broadcast(TePhoenix.PubSub, "map:saved", {:map_saved, map.id})
        :ok

      {:error, reason} ->
        {:error, inspect(reason)}
    end
  end

  # Version history is best-effort: a failed snapshot must not block the
  # primary save of game_maps.
  defp write_version_snapshot(map, layers_json) do
    with {:ok, next_ver} <- next_version_num(map.id),
         {:ok, _} <-
           Repo.query(
             """
             INSERT INTO game_map_versions
               (map_id, version_num, label, tiles_json, collisions_json,
                objects_json, anims_json, width, height, created_by, created_at)
             VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, NOW())
             """,
             [
               map.id,
               next_ver,
               "editor-save",
               layers_json,
               map.width,
               map.height,
               "editor"
             ]
           ),
         {:ok, _} <-
           Repo.query(
             "DELETE FROM game_map_versions WHERE map_id = ? AND version_num < ?",
             [map.id, next_ver - 20]
           ) do
      :ok
    else
      {:error, reason} ->
        Logger.warning("[MapEditor] version snapshot skipped: #{inspect(reason)}")
        :ok
    end
  end

  defp next_version_num(map_id) do
    case Repo.query(
           "SELECT COALESCE(MAX(version_num), 0) FROM game_map_versions WHERE map_id = ?",
           [map_id]
         ) do
      {:ok, %{rows: [[n]]}} when is_integer(n) -> {:ok, n + 1}
      {:ok, _} -> {:ok, 1}
      other -> other
    end
  end

  # ── Initial state push ─────────────────────────────────────

  defp push_initial_state(socket, map) do
    state = render_state(map, socket.assigns)

    if connected?(socket) do
      socket
      |> push_event("map:state", state)
      |> push_event(
        "map:zones",
        zones_payload(socket.assigns, socket.assigns.spawn_zones, socket.assigns.sound_zones)
      )
      |> push_event("map:spawn", %{x: map.spawn_x, y: map.spawn_y})
    else
      socket
    end
  end

  defp render_state(map, assigns) do
    %{
      layers: %{
        ground: map.layers["ground"] || [],
        overlay: map.layers["overlay"] || [],
        passability: map.layers["passability"] || [],
        fringe: map.layers["fringe"] || [],
        elevation: map.layers["elevation"] || []
      },
      mapWidth: map.width,
      mapHeight: map.height,
      objects: serialize_objects_for_render(Map.get(assigns, :objects, [])),
      entities: [],
      tilePalette: build_tile_palette_payload(Map.get(assigns, :palette, palette()), Map.get(assigns, :tile_anims, [])),
      playerX: Map.get(assigns, :play_x, div(map.width, 2)),
      playerY: Map.get(assigns, :play_y, div(map.height, 2)),
      camX:
        if Map.get(assigns, :play_mode, false) do
          Map.get(assigns, :play_x, div(map.width, 2))
        else
          # In edit mode, use (vpW-1)/2 so tiles start at pixel 0
          (Map.get(assigns, :viewport_w, map.width) - 1) / 2.0
        end,
      camY:
        if Map.get(assigns, :play_mode, false) do
          Map.get(assigns, :play_y, div(map.height, 2))
        else
          (Map.get(assigns, :viewport_h, map.height) - 1) / 2.0
        end,
      viewportW: Map.get(assigns, :viewport_w, @default_viewport_w),
      showPassability: Map.get(assigns, :layer_visibility, %{}) |> Map.get("passability", true),
      showElevation: Map.get(assigns, :layer_visibility, %{}) |> Map.get("elevation", true),
      fogEnabled: false,
      tileset: Map.get(assigns, :tileset, %{
        url: "/tilesets/ashveil_tiles.png",
        tileWidth: 32,
        tileHeight: 32,
        columns: 8,
        rows: 8
      }),
      atmosphere: Map.get(assigns, :atmosphere, "embers"),
      dynamicLighting: true,
      backdropUrl: Map.get(assigns, :backdrop_url)
    }
  end

  # ── Helpers ────────────────────────────────────────────────

  defp op_id do
    Base.encode16(:crypto.strong_rand_bytes(16), case: :lower)
  end

  defp to_int(v) when is_integer(v), do: v

  defp to_int(v) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      _ -> 0
    end
  end

  defp to_int(_), do: 0

  defp editor_id do
    Base.encode16(:crypto.strong_rand_bytes(8), case: :lower)
  end

  @palette ~w(#f59e0b #10b981 #3b82f6 #ec4899 #8b5cf6 #ef4444 #14b8a6 #f97316)
  defp random_color, do: Enum.random(@palette)

  defp online_editors(%{id: map_id}) do
    MapEditorPresence.list("map:#{map_id}:editor")
    |> Enum.map(fn {_key, %{metas: [meta | _]}} -> meta end)
  end

  defp online_editors(_), do: []

  defp tool_for_shortcut(key) do
    case String.downcase(key) do
      "b" -> "brush"
      "f" -> "fill"
      "r" -> "rect"
      "x" -> "eraser"
      "i" -> "eyedrop"
      "m" -> "select"
      "a" -> "autotile"
      "g" -> "elevation"
      "p" -> "passability"
      _ -> nil
    end
  end

  # ── Templates / stamps / resize / properties ────────────────

  defp template_paste_origin(socket) do
    case socket.assigns.select_rect do
      %{x1: x1, y1: y1} -> {x1, y1}
      _ -> {0, 0}
    end
  end

  defp apply_template_stamp(map, layer, cells, ox, oy) do
    layer_data = Map.get(map.layers, layer, [])

    {new_layer, recorded} =
      Enum.reduce(cells, {layer_data, []}, fn %{x: dx, y: dy, value: v}, {d, c} ->
        tx = ox + dx
        ty = oy + dy

        cond do
          tx < 0 or ty < 0 or tx >= map.width or ty >= map.height ->
            {d, c}

          true ->
            idx = ty * map.width + tx
            prev = Enum.at(d, idx, 0)

            if prev == v do
              {d, c}
            else
              {List.replace_at(d, idx, v), [%{x: tx, y: ty, prev: prev, value: v} | c]}
            end
        end
      end)

    if recorded == [] do
      {:error, :nochange}
    else
      updated = put_in(map.layers[layer], new_layer)

      op = %{
        op_id: op_id(),
        op_type: "stamp",
        layer: layer,
        cells: Enum.reverse(recorded)
      }

      {:ok, updated, op}
    end
  end

  # Resize the map to (new_w × new_h), shifting tiles per anchor.
  # Anchor values: "tl", "tr", "bl", "br", "center".
  defp persist_resize(map) do
    layers_json = Jason.encode!(%{schema_version: 2, layers: map.layers})

    case Repo.query(
           "UPDATE game_maps SET width = ?, height = ?, layers_json = ?, schema_version = 2 WHERE id = ?",
           [map.width, map.height, layers_json, map.id]
         ) do
      {:ok, _} ->
        Phoenix.PubSub.broadcast(TePhoenix.PubSub, "map:saved", {:map_saved, map.id})
        :ok

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp resize_map(map, new_w, new_h, anchor) do
    {dx, dy} = resize_offset(map.width, map.height, new_w, new_h, anchor)

    new_layers =
      Map.new(map.layers, fn {name, data} ->
        empty = empty_value_for(name)
        {name, shift_layer(data, map.width, map.height, new_w, new_h, dx, dy, empty)}
      end)

    %{map | width: new_w, height: new_h, layers: new_layers}
  end

  defp resize_offset(old_w, old_h, new_w, new_h, anchor) do
    case anchor do
      "tl" -> {0, 0}
      "tr" -> {new_w - old_w, 0}
      "bl" -> {0, new_h - old_h}
      "br" -> {new_w - old_w, new_h - old_h}
      _center -> {div(new_w - old_w, 2), div(new_h - old_h, 2)}
    end
  end

  defp shift_layer(data, old_w, old_h, new_w, new_h, dx, dy, empty) do
    src = List.to_tuple(data)

    for ny <- 0..(new_h - 1), nx <- 0..(new_w - 1) do
      ox = nx - dx
      oy = ny - dy

      if ox < 0 or oy < 0 or ox >= old_w or oy >= old_h do
        empty
      else
        elem(src, oy * old_w + ox)
      end
    end
  end

  defp persist_map_properties(map_id, params) do
    # Phase 1.5e — make sure the fog columns exist before we try to
    # write them. ensure_schema is persistent_term-cached so this is
    # a single :ets read after the first call.
    TePhoenix.Game.Fog.ensure_schema()

    # Checkboxes only submit when checked. Coerce missing fog_of_war
    # to "0" so unchecking actually persists. The generic filter
    # below drops nil/"" but accepts "0".
    fog_flag = params["fog_of_war"] || "0"

    raw_fields = [
      {"render_mode", :render_mode, :string, params["render_mode"]},
      {"tileset_url", :tileset_url, :string, params["tileset_url"]},
      {"ambient_dark", :ambient_dark, :float, params["ambient_dark"]},
      {"min_level", :min_level, :int, params["min_level"]},
      {"description", :description, :string, params["description"]},
      {"fog_of_war", :fog_of_war, :int, fog_flag},
      {"ambient_visibility", :ambient_visibility, :int, params["ambient_visibility"]}
    ]

    fields =
      raw_fields
      |> Enum.filter(fn {_, _, _, v} -> not is_nil(v) and v != "" end)
      |> Enum.map(fn {col, key, kind, v} -> {col, key, coerce_field(kind, v)} end)

    case fields do
      [] ->
        {:ok, []}

      _ ->
        set_clause = Enum.map_join(fields, ", ", fn {col, _, _} -> "#{col} = ?" end)
        values = Enum.map(fields, fn {_, _, v} -> v end) ++ [map_id]

        case Repo.query("UPDATE game_maps SET #{set_clause} WHERE id = ?", values) do
          {:ok, %{num_rows: n}} when n > 0 ->
            {:ok, Enum.map(fields, fn {_, key, v} -> {key, v} end)}

          {:ok, _} ->
            {:error, :no_rows_updated}

          {:error, e} ->
            {:error, e}
        end
    end
  end

  defp coerce_field(:int, v) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      _ -> 0
    end
  end

  defp coerce_field(:float, v) when is_binary(v) do
    case Float.parse(v) do
      {f, _} -> f
      _ -> 0.0
    end
  end

  defp coerce_field(_, v), do: v

  defp list_saved_stamps(map_id) do
    case Repo.query(
           "SELECT id, name, layer, payload_json, created_at FROM game_map_stamps WHERE map_id = ? OR map_id IS NULL ORDER BY created_at DESC LIMIT 50",
           [map_id]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, name, layer, _payload, at] ->
          %{id: id, name: name || "untitled", layer: layer || "ground", at: to_string(at)}
        end)

      _ ->
        []
    end
  rescue
    _ -> []
  end

  defp persist_saved_stamp(map_id, name, layer, clip) do
    payload =
      Jason.encode!(%{
        "w" => clip.w,
        "h" => clip.h,
        "values" => clip.values
      })

    ensure_stamps_table()

    case Repo.query(
           "INSERT INTO game_map_stamps (map_id, name, layer, payload_json, created_at) VALUES (?, ?, ?, ?, NOW())",
           [map_id, name, layer, payload]
         ) do
      {:ok, _} -> :ok
      {:error, e} -> {:error, e}
    end
  end

  defp load_saved_stamp(id) do
    case Repo.query("SELECT layer, payload_json FROM game_map_stamps WHERE id = ?", [id]) do
      {:ok, %{rows: [[layer, json]]}} when is_binary(json) ->
        case Jason.decode(json) do
          {:ok, %{"w" => w, "h" => h, "values" => values}} ->
            {:ok, %{layer: layer, clip: %{w: w, h: h, values: values}}}

          _ ->
            {:error, :malformed}
        end

      _ ->
        {:error, :not_found}
    end
  rescue
    _ -> {:error, :missing_table}
  end

  defp delete_saved_stamp(id) do
    Repo.query("DELETE FROM game_map_stamps WHERE id = ?", [id])
    :ok
  rescue
    _ -> :ok
  end

  # ── Map objects & events persistence ────────────────────────
  #
  # Storage strategy (F18):
  #
  #   * `game_map_object_rows` — one row per object, indexed by map_id.
  #     Partial updates (insert/delete/update by object id) never touch
  #     unrelated rows, so a 10k-object map can add one object with a
  #     single INSERT instead of rewriting a 500KB JSON blob.
  #
  #   * `game_map_event_rows` — same pattern for events.
  #
  #   * `game_maps.objects_json` / `.collisions_json` are no longer the
  #     source of truth but are written on save for backwards-compat
  #     with anything that still reads the legacy columns.
  #
  # Legacy fallback: if the row table is empty, seed it from the
  # existing monolithic JSON column on first read so existing maps
  # migrate transparently.

  defp ensure_object_row_tables do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS game_map_object_rows (
      id VARCHAR(40) PRIMARY KEY,
      map_id INT NOT NULL,
      x INT NOT NULL,
      y INT NOT NULL,
      payload_json LONGTEXT NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_obj_map (map_id)
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS game_map_event_rows (
      id VARCHAR(40) PRIMARY KEY,
      map_id INT NOT NULL,
      x INT NOT NULL,
      y INT NOT NULL,
      kind VARCHAR(40) NOT NULL,
      script_id INT NULL,
      payload_json LONGTEXT NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_ev_map (map_id)
    )
    """)

    :ok
  rescue
    _ -> :ok
  end

  defp load_map_objects(map_id) do
    ensure_object_row_tables()

    rows =
      case Repo.query("SELECT payload_json FROM game_map_object_rows WHERE map_id = ?", [map_id]) do
        {:ok, %{rows: rows}} ->
          rows
          |> Enum.map(fn [json] -> Jason.decode(json || "{}") end)
          |> Enum.flat_map(fn
            {:ok, m} when is_map(m) -> [normalize_object(m)]
            _ -> []
          end)

        _ ->
          []
      end

    if rows == [] do
      # Legacy migration path — seed from the monolithic JSON column on
      # first access so existing maps pick up the new storage transparently.
      legacy = load_map_objects_legacy(map_id)

      Enum.each(legacy, fn o ->
        Repo.query(
          "INSERT IGNORE INTO game_map_object_rows (id, map_id, x, y, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, NOW())",
          [o.id, map_id, o.x, o.y, Jason.encode!(o)]
        )
      end)

      legacy
    else
      rows
    end
  rescue
    _ -> []
  end

  defp load_map_objects_legacy(map_id) do
    case Repo.query("SELECT objects_json FROM game_maps WHERE id = ?", [map_id]) do
      {:ok, %{rows: [[json]]}} when is_binary(json) and json != "" ->
        case Jason.decode(json) do
          {:ok, list} when is_list(list) -> Enum.map(list, &normalize_object/1)
          _ -> []
        end

      _ ->
        []
    end
  rescue
    _ -> []
  end

  defp normalize_object(%{} = obj) do
    %{
      id: obj["id"] || object_id(),
      x: obj["x"] || 0,
      y: obj["y"] || 0,
      preset: obj["preset"] || "TORCH",
      label: obj["label"] || obj["preset"] || "",
      icon: obj["icon"] || "",
      group: obj["group"] || "PROP",
      blocking: obj["blocking"] == true,
      light: obj["light"],
      sprite_url: obj["sprite_url"],
      sprite_w: obj["sprite_w"],
      sprite_h: obj["sprite_h"],
      anim_frames: obj["anim_frames"],
      anim_fps: obj["anim_fps"]
    }
  end

  defp persist_map_objects(map_id, objects) do
    ensure_object_row_tables()

    # Row-per-object persistence — delete all + insert current set. This
    # is still a full rewrite per save but it's row-level so indices
    # stay healthy and partial per-object writes are cheap when we add
    # them later. Legacy `objects_json` column is written too for
    # backwards compatibility.
    Repo.query("DELETE FROM game_map_object_rows WHERE map_id = ?", [map_id])

    Enum.each(objects, fn o ->
      Repo.query(
        "INSERT IGNORE INTO game_map_object_rows (id, map_id, x, y, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, NOW())",
        [o.id, map_id, o.x, o.y, Jason.encode!(o)]
      )
    end)

    Repo.query("UPDATE game_maps SET objects_json = ? WHERE id = ?", [Jason.encode!(objects), map_id])
    :ok
  rescue
    _ -> :ok
  end

  defp load_map_events(map_id) do
    ensure_object_row_tables()

    rows =
      case Repo.query("SELECT payload_json FROM game_map_event_rows WHERE map_id = ?", [map_id]) do
        {:ok, %{rows: rows}} ->
          rows
          |> Enum.map(fn [json] -> Jason.decode(json || "{}") end)
          |> Enum.flat_map(fn
            {:ok, m} when is_map(m) -> [normalize_event(m)]
            _ -> []
          end)

        _ ->
          []
      end

    if rows == [] do
      legacy = load_map_events_legacy(map_id)

      Enum.each(legacy, fn ev ->
        Repo.query(
          "INSERT IGNORE INTO game_map_event_rows (id, map_id, x, y, kind, script_id, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
          [ev.id, map_id, ev.x, ev.y, ev.kind, ev.script_id, Jason.encode!(ev)]
        )
      end)

      legacy
    else
      rows
    end
  rescue
    _ -> []
  end

  defp load_map_events_legacy(map_id) do
    case Repo.query("SELECT collisions_json FROM game_maps WHERE id = ?", [map_id]) do
      {:ok, %{rows: [[json]]}} when is_binary(json) and json != "" ->
        case Jason.decode(json) do
          {:ok, list} when is_list(list) -> Enum.map(list, &normalize_event/1)
          _ -> []
        end

      _ ->
        []
    end
  rescue
    _ -> []
  end

  defp normalize_event(%{} = ev) do
    %{
      id: ev["id"] || object_id(),
      x: ev["x"] || 0,
      y: ev["y"] || 0,
      kind: ev["kind"] || ev["type"] || "SCRIPT",
      script_id: ev["script_id"],
      data: ev["data"]
    }
  end

  defp list_available_scripts do
    case Repo.query("SELECT id, name FROM game_visual_scripts ORDER BY updated_at DESC LIMIT 200") do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [id, name] -> %{id: id, name: name} end)
      _ -> []
    end
  rescue
    _ -> []
  end

  defp persist_map_events(map_id, events) do
    ensure_object_row_tables()

    Repo.query("DELETE FROM game_map_event_rows WHERE map_id = ?", [map_id])

    Enum.each(events, fn ev ->
      Repo.query(
        "INSERT IGNORE INTO game_map_event_rows (id, map_id, x, y, kind, script_id, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
        [ev.id, map_id, ev.x, ev.y, ev.kind, ev.script_id, Jason.encode!(ev)]
      )
    end)

    Repo.query("UPDATE game_maps SET collisions_json = ? WHERE id = ?", [Jason.encode!(events), map_id])
    :ok
  rescue
    _ -> :ok
  end

  defp object_id, do: "obj_" <> Base.encode16(:crypto.strong_rand_bytes(6), case: :lower)

  # Convert an in-memory MapObject (atom keys, stored as the editor uses them)
  # into the camelCase JSON shape the @twisted/render renderer expects.
  # Renderer reads: x, y, icon, label, type ("LIGHT"|"PROP"|"DECO"),
  #                 blocking, light: %{radius, color, flicker}.
  defp serialize_objects_for_render(objects) when is_list(objects) do
    Enum.map(objects, fn o ->
      base = %{
        x: o.x,
        y: o.y,
        preset: o.preset,
        icon: o.icon || "",
        label: o.label || "",
        type: o.group || "PROP",
        blocking: o.blocking == true,
        sprite_url: Map.get(o, :sprite_url) || Map.get(o, "sprite_url"),
        sprite_w: Map.get(o, :sprite_w) || Map.get(o, "sprite_w"),
        sprite_h: Map.get(o, :sprite_h) || Map.get(o, "sprite_h"),
        anim_frames: Map.get(o, :anim_frames) || Map.get(o, "anim_frames"),
        anim_fps: Map.get(o, :anim_fps) || Map.get(o, "anim_fps")
      }

      case Map.get(o, :light) do
        nil -> base
        %{} = light ->
          Map.put(base, :light, %{
            radius: Map.get(light, :radius) || Map.get(light, "radius") || 4,
            color: Map.get(light, :color) || Map.get(light, "color") || "#ffaa44",
            flicker: Map.get(light, :flicker) || Map.get(light, "flicker") || false
          })
      end
    end)
  end

  defp serialize_objects_for_render(_), do: []

  # Build the TilePaletteEntry[] payload the @twisted/render renderer expects.
  # Overlays each tile's animation (if any) onto the static palette so the
  # renderer's frame-cycling logic kicks in at draw time.
  defp build_tile_palette_payload(palette, tile_anims) do
    anim_index = Map.new(tile_anims, fn a -> {a.tile_id, a} end)

    Enum.map(palette, fn entry ->
      base = %{id: entry.id, name: entry.label, color: entry.color}

      case Map.get(anim_index, entry.id) do
        nil ->
          base

        %{frames: frames, fps: fps} when is_list(frames) and length(frames) > 1 ->
          Map.merge(base, %{frame_tiles: frames, fps: fps})

        _ ->
          base
      end
    end)
  end

  # ── Spawn / sound zones + tile anim persistence ─────────────

  defp ensure_zone_tables do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS game_map_spawn_zones (
      map_id INT PRIMARY KEY,
      zones_json LONGTEXT NOT NULL,
      updated_at DATETIME NOT NULL
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS game_map_sound_zones (
      map_id INT PRIMARY KEY,
      zones_json LONGTEXT NOT NULL,
      updated_at DATETIME NOT NULL
    )
    """)
  rescue
    _ -> :ok
  end

  defp load_spawn_zones(map_id) do
    ensure_zone_tables()

    case Repo.query("SELECT zones_json FROM game_map_spawn_zones WHERE map_id = ?", [map_id]) do
      {:ok, %{rows: [[json]]}} when is_binary(json) ->
        case Jason.decode(json) do
          {:ok, list} when is_list(list) -> Enum.map(list, &normalize_spawn_zone/1)
          _ -> []
        end

      _ ->
        []
    end
  rescue
    _ -> []
  end

  defp normalize_spawn_zone(z) do
    %{
      id: z["id"] || object_id(),
      rect: %{
        x1: z["rect"]["x1"] || 0,
        y1: z["rect"]["y1"] || 0,
        x2: z["rect"]["x2"] || 0,
        y2: z["rect"]["y2"] || 0
      },
      encounter_table: z["encounter_table"] || [],
      scaling_factor: z["scaling_factor"] || 1.0,
      flag: z["flag"] || "",
      enabled: z["enabled"] != false,
      # 2A.5/E3 additions:
      cooldown_seconds: z["cooldown_seconds"] || 30,
      max_concurrent: z["max_concurrent"] || 4
    }
  end

  defp persist_spawn_zones(map_id, zones) do
    ensure_zone_tables()

    Repo.query(
      """
      INSERT INTO game_map_spawn_zones (map_id, zones_json, updated_at) VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE zones_json = VALUES(zones_json), updated_at = NOW()
      """,
      [map_id, Jason.encode!(zones)]
    )

    :ok
  rescue
    _ -> :ok
  end

  defp load_sound_zones(map_id) do
    ensure_zone_tables()

    case Repo.query("SELECT zones_json FROM game_map_sound_zones WHERE map_id = ?", [map_id]) do
      {:ok, %{rows: [[json]]}} when is_binary(json) ->
        case Jason.decode(json) do
          {:ok, list} when is_list(list) -> Enum.map(list, &normalize_sound_zone/1)
          _ -> []
        end

      _ ->
        []
    end
  rescue
    _ -> []
  end

  defp normalize_sound_zone(z) do
    %{
      id: z["id"] || object_id(),
      rect: %{
        x1: z["rect"]["x1"] || 0,
        y1: z["rect"]["y1"] || 0,
        x2: z["rect"]["x2"] || 0,
        y2: z["rect"]["y2"] || 0
      },
      sound_url: z["sound_url"] || "",
      volume: z["volume"] || 0.6,
      loop: z["loop"] != false,
      fade_seconds: z["fade_seconds"] || 1.0
    }
  end

  defp persist_sound_zones(map_id, zones) do
    ensure_zone_tables()

    Repo.query(
      """
      INSERT INTO game_map_sound_zones (map_id, zones_json, updated_at) VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE zones_json = VALUES(zones_json), updated_at = NOW()
      """,
      [map_id, Jason.encode!(zones)]
    )

    :ok
  rescue
    _ -> :ok
  end

  defp load_tile_anims(%{id: map_id}) do
    case Repo.query("SELECT anims_json FROM game_maps WHERE id = ?", [map_id]) do
      {:ok, %{rows: [[json]]}} when is_binary(json) and json != "" ->
        case Jason.decode(json) do
          {:ok, list} when is_list(list) -> Enum.map(list, &normalize_tile_anim/1)
          _ -> []
        end

      _ ->
        []
    end
  rescue
    _ -> []
  end

  defp normalize_tile_anim(a) do
    %{
      tile_id: a["tile_id"] || a["id"] || 0,
      frames: a["frames"] || [],
      fps: a["fps"] || 6.0,
      trigger: a["trigger"] || "always"
    }
  end

  defp persist_tile_anims(map_id, anims) do
    Repo.query("UPDATE game_maps SET anims_json = ? WHERE id = ?", [Jason.encode!(anims), map_id])
    :ok
  rescue
    _ -> :ok
  end

  defp parse_encounter_table(json) when is_binary(json) and json != "" do
    case Jason.decode(json) do
      {:ok, list} when is_list(list) -> list
      _ -> []
    end
  end

  defp parse_encounter_table(_), do: []

  defp parse_float(nil, default), do: default
  defp parse_float("", default), do: default

  defp parse_float(v, default) when is_binary(v) do
    case Float.parse(v) do
      {f, _} -> f
      :error -> default
    end
  end

  defp parse_float(v, _default) when is_number(v), do: v * 1.0
  defp parse_float(_, default), do: default

  defp parse_int_list(nil), do: []
  defp parse_int_list(""), do: []

  defp parse_int_list(s) when is_binary(s) do
    s
    |> String.split(~r/[,\s]+/, trim: true)
    |> Enum.map(&Integer.parse/1)
    |> Enum.flat_map(fn
      {n, _} -> [n]
      :error -> []
    end)
  end

  defp parse_int_list(_), do: []

  defp zones_payload(assigns, spawn_zones, sound_zones) do
    selected =
      cond do
        assigns[:selected_spawn_zone_id] -> %{kind: "spawn", id: assigns.selected_spawn_zone_id}
        assigns[:selected_sound_zone_id] -> %{kind: "sound", id: assigns.selected_sound_zone_id}
        true -> nil
      end

    do_zones_payload(spawn_zones, sound_zones, selected)
  end

  defp do_zones_payload(spawn_zones, sound_zones, selected) do
    %{
      spawn_zones:
        Enum.map(spawn_zones, fn z ->
          %{id: z.id, x1: z.rect.x1, y1: z.rect.y1, x2: z.rect.x2, y2: z.rect.y2}
        end),
      sound_zones:
        Enum.map(sound_zones, fn z ->
          %{
            id: z.id,
            x1: z.rect.x1,
            y1: z.rect.y1,
            x2: z.rect.x2,
            y2: z.rect.y2,
            sound_url: z.sound_url,
            volume: z.volume,
            loop: z.loop,
            fade_seconds: z.fade_seconds
          }
        end),
      selected: selected
    }
  end

  defp ensure_stamps_table do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS game_map_stamps (
      id INT AUTO_INCREMENT PRIMARY KEY,
      map_id INT NULL,
      name VARCHAR(120) NOT NULL,
      layer VARCHAR(40) NOT NULL,
      payload_json LONGTEXT NOT NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_stamps_map (map_id)
    )
    """)
  rescue
    _ -> :ok
  end

  defp restore_version(map_id, version_id) do
    case Repo.query(
           "SELECT tiles_json FROM game_map_versions WHERE id = ? AND map_id = ?",
           [version_id, map_id]
         ) do
      {:ok, %{rows: [[json]]}} when is_binary(json) ->
        case Jason.decode(json) do
          {:ok, %{"layers" => layers}} when is_map(layers) ->
            {:ok,
             %{
               "ground" => Map.get(layers, "ground", []),
               "overlay" => Map.get(layers, "overlay", []),
               "passability" => Map.get(layers, "passability", []),
               "fringe" => Map.get(layers, "fringe", []),
               "elevation" => Map.get(layers, "elevation", [])
             }}

          _ ->
            {:error, :malformed}
        end

      _ ->
        {:error, :not_found}
    end
  end
  # ── Helpers grouped here (Tier α + 2A/2B) ──
  # Moved out of the handle_event/handle_tool_click/handle_info clusters
  # so the compiler sees those clauses contiguously. Pure relocation;
  # no behavior change. Originally interleaved for topical reading.

  defp refresh_after_op_toggle(socket, status) do
    map = socket.assigns.map
    replayed = replay_map_state(map)

    updated_map = %{map | layers: replayed.layers}
    new_objects = replayed.objects
    new_events = replayed.events

    ops =
      TePhoenix.Game.MapOps.list(map.id, include_inverted: true)
      |> Enum.reverse()
      |> Enum.take(200)

    socket
    |> assign(:map, updated_map)
    |> assign(:objects, new_objects)
    |> assign(:events, new_events)
    |> assign(:history_versions, ops)
    |> assign(:save_status, status)
    |> push_event("map:state", render_state(updated_map, %{socket.assigns | objects: new_objects, events: new_events}))
  end

  # ── 2B.2: Debounced field-op buffer ─────────────────────────────
  #
  # Continuous edits (slider drag, text typing) call record_field_edit/4
  # which captures the FIRST edit's prev value and resets a 500ms timer.
  # On flush, ONE op is appended carrying session_start_value as `prev`
  # and the latest current_value as `new`. Net: no log flooding, full
  # undo fidelity (prev value matches what the user saw before editing).
  @debounce_ms 500

  defp record_field_edit(socket, key, prev_value, new_value) do
    pending = socket.assigns[:pending_field_ops] || %{}
    new_ref = Process.send_after(self(), {:flush_field_op, key}, @debounce_ms)

    entry =
      case Map.get(pending, key) do
        nil ->
          %{session_start_value: prev_value, current_value: new_value, timer_ref: new_ref}

        %{timer_ref: old_ref} = existing ->
          Process.cancel_timer(old_ref)
          %{existing | current_value: new_value, timer_ref: new_ref}
      end

    assign(socket, :pending_field_ops, Map.put(pending, key, entry))
  end

  # Force-flush any pending edit for `key` immediately (used by drag-release
  # paths and tool-switches that should commit an in-flight session).
  defp flush_field_op(socket, key) do
    case Map.get(socket.assigns[:pending_field_ops] || %{}, key) do
      nil ->
        socket

      %{timer_ref: ref} = entry ->
        Process.cancel_timer(ref)
        commit_field_edit(socket, key, entry)
    end
  end

  # Flush every pending entry. Used on tool change / drawer close so
  # nothing lingers as a half-committed op.
  defp flush_all_field_ops(socket) do
    pending = socket.assigns[:pending_field_ops] || %{}

    Enum.reduce(pending, socket, fn {key, _entry}, acc -> flush_field_op(acc, key) end)
  end

  defp commit_field_edit(socket, {kind, target_id, field}, entry) do
    pending = Map.delete(socket.assigns[:pending_field_ops] || %{}, {kind, target_id, field})

    if entry.session_start_value == entry.current_value do
      # Net no-op (user typed and reverted, or value identical) — drop.
      assign(socket, :pending_field_ops, pending)
    else
      payload = field_op_payload(kind, target_id, field, entry)

      socket
      |> append_phase2a_op(field_op_type(kind), payload)
      |> assign(:pending_field_ops, pending)
    end
  end

  defp field_op_type(:spawn), do: "edit_spawn_zone"
  defp field_op_type(:sound), do: "edit_sound_zone"
  defp field_op_type(:object), do: "edit_object"
  defp field_op_type(:event), do: "edit_event"
  defp field_op_type(:spawn_encounter), do: "edit_spawn_encounter"

  defp field_op_payload(kind, target_id, field, entry) when kind in [:spawn, :sound] do
    %{
      "zone_id" => target_id,
      "fields" => %{field => entry.current_value},
      "prev_fields" => %{field => entry.session_start_value}
    }
  end

  defp field_op_payload(:object, target_id, field, entry) do
    %{
      "object_id" => target_id,
      "fields" => %{field => entry.current_value},
      "prev_fields" => %{field => entry.session_start_value}
    }
  end

  defp field_op_payload(:event, target_id, field, entry) do
    %{
      "event_id" => target_id,
      "fields" => %{field => entry.current_value},
      "prev_fields" => %{field => entry.session_start_value}
    }
  end

  defp field_op_payload(:spawn_encounter, target_id, field, entry) do
    [zone_id, row_idx_str] = String.split(target_id, ":", parts: 2)

    %{
      "zone_id" => zone_id,
      "row" => to_int(row_idx_str),
      "field" => field,
      "new" => entry.current_value,
      "prev" => entry.session_start_value
    }
  end

  # Append a Phase 2A op to the log. Doesn't broadcast (broadcasting is
  # for collaborative live-share via PubSub; these ops are local mutations
  # whose effect is already pushed via map:state). Returns the socket
  # unchanged on append failure (we never want a logging hiccup to abort
  # an editor mutation).
  defp append_phase2a_op(socket, op_type, payload) do
    map_id = socket.assigns.map.id

    TePhoenix.Game.MapOps.append(
      map_id,
      object_id(),
      op_type,
      payload,
      user_id: socket.assigns[:editor_id],
      user_name: "editor"
    )

    socket
  end

  # Replay all non-inverted ops for a map onto a blank base. Used by
  # undo/redo and the time-scrub slider.
  defp replay_map_state(map, opts \\ []) do
    base = %{
      width: map.width,
      height: map.height,
      layers: %{
        "ground" => List.duplicate(-1, map.width * map.height),
        "overlay" => List.duplicate(-1, map.width * map.height),
        "passability" => List.duplicate(0, map.width * map.height),
        "fringe" => List.duplicate(-1, map.width * map.height),
        "elevation" => List.duplicate(0, map.width * map.height)
      },
      objects: [],
      events: [],
      properties: %{}
    }

    TePhoenix.Game.MapOps.replay(map.id, base, opts)
  end

  # ── Templates / generators ───────────────────────────────────

  defp apply_zone_rect_update(socket, :spawn, id, rect) do
    {prev, zones} =
      Enum.map_reduce(socket.assigns.spawn_zones, nil, fn z, acc ->
        if z.id == id, do: {%{z | rect: rect}, z.rect}, else: {z, acc}
      end)

    persist_spawn_zones(socket.assigns.map.id, prev)

    socket =
      socket
      |> append_phase2a_op("edit_spawn_zone", %{
        "zone_id" => id,
        "fields" => %{"rect" => rect},
        "prev_fields" => %{"rect" => zones}
      })
      |> assign(:spawn_zones, prev)

    {:noreply,
     push_event(socket, "map:zones", zones_payload(socket.assigns, prev, socket.assigns.sound_zones))}
  end

  defp apply_zone_rect_update(socket, :sound, id, rect) do
    {prev, zones} =
      Enum.map_reduce(socket.assigns.sound_zones, nil, fn z, acc ->
        if z.id == id, do: {%{z | rect: rect}, z.rect}, else: {z, acc}
      end)

    persist_sound_zones(socket.assigns.map.id, prev)

    socket =
      socket
      |> append_phase2a_op("edit_sound_zone", %{
        "zone_id" => id,
        "fields" => %{"rect" => rect},
        "prev_fields" => %{"rect" => zones}
      })
      |> assign(:sound_zones, prev)

    {:noreply,
     push_event(socket, "map:zones", zones_payload(socket.assigns, socket.assigns.spawn_zones, prev))}
  end

  defp read_spawn_field(nil, _field), do: nil
  defp read_spawn_field(z, "scaling_factor"), do: z.scaling_factor
  defp read_spawn_field(z, "flag"), do: z.flag
  defp read_spawn_field(z, "enabled"), do: z.enabled
  defp read_spawn_field(z, "cooldown_seconds"), do: Map.get(z, :cooldown_seconds, 30)
  defp read_spawn_field(z, "max_concurrent"), do: Map.get(z, :max_concurrent, 4)
  defp read_spawn_field(_, _), do: nil

  defp normalize_spawn_field("scaling_factor", v), do: parse_float(v, 1.0)
  defp normalize_spawn_field("flag", v), do: v
  defp normalize_spawn_field("enabled", v), do: v in ["true", "on", true]
  defp normalize_spawn_field("cooldown_seconds", v), do: to_int(v) |> max(0)
  defp normalize_spawn_field("max_concurrent", v), do: to_int(v) |> max(1) |> min(50)
  defp normalize_spawn_field(_, v), do: v

  defp write_spawn_field(z, "scaling_factor", v), do: %{z | scaling_factor: v}
  defp write_spawn_field(z, "flag", v), do: %{z | flag: v}
  defp write_spawn_field(z, "enabled", v), do: %{z | enabled: v}
  defp write_spawn_field(z, "cooldown_seconds", v), do: Map.put(z, :cooldown_seconds, v)
  defp write_spawn_field(z, "max_concurrent", v), do: Map.put(z, :max_concurrent, v)
  defp write_spawn_field(z, _, _), do: z

  defp read_sound_field(nil, _field), do: nil
  defp read_sound_field(z, "sound_url"), do: z.sound_url
  defp read_sound_field(z, "volume"), do: z.volume
  defp read_sound_field(z, "loop"), do: z.loop
  defp read_sound_field(z, "fade_seconds"), do: z.fade_seconds
  defp read_sound_field(_, _), do: nil

  defp normalize_sound_field("sound_url", v), do: v
  defp normalize_sound_field("volume", v), do: parse_float(v, 0.6) |> max(0.0) |> min(1.0)
  defp normalize_sound_field("loop", v), do: v in ["true", "on", true]
  defp normalize_sound_field("fade_seconds", v), do: parse_float(v, 1.0) |> max(0.0)
  defp normalize_sound_field(_, v), do: v

  defp write_sound_field(z, "sound_url", v), do: %{z | sound_url: v}
  defp write_sound_field(z, "volume", v), do: %{z | volume: v}
  defp write_sound_field(z, "loop", v), do: %{z | loop: v}
  defp write_sound_field(z, "fade_seconds", v), do: %{z | fade_seconds: v}
  defp write_sound_field(z, _, _), do: z

  # D10: spawn-as-fixed-start-tile. Persists the (x,y) on the map row.
  # Playmode movement updates the transient :play_x/:play_y assigns and
  # MUST NEVER touch :spawn_x/:spawn_y. See test in test/te_phoenix_web/
  # live/admin/map_editor_spawn_test.exs.
  defp normalize_encounter_value("count", v), do: to_int(v) |> max(1)
  defp normalize_encounter_value("weight", v), do: to_int(v) |> max(1)
  defp normalize_encounter_value("level_scaling", v), do: parse_float(v, 1.0)
  defp normalize_encounter_value("npc_id", v), do: to_int(v)
  defp normalize_encounter_value(_, v), do: v

  # Form-based event-form update. The form posts every named field; we use
  # _target to know which field changed, then update only that one.
  defp handle_zone_tool_click(zone_tool, x, y, socket) when zone_tool in ["spawn_zone", "sound_zone"] do
    case socket.assigns.zone_anchor do
      nil ->
        {:noreply,
         socket
         |> assign(:zone_anchor, {x, y, zone_tool})
         |> push_event("edit:set_preview", %{kind: "rect", anchor: %{x: x, y: y}})}

      {ax, ay, ^zone_tool} ->
        rect = %{
          x1: min(ax, x),
          y1: min(ay, y),
          x2: max(ax, x),
          y2: max(ay, y)
        }

        {:noreply,
         socket
         |> assign(:zone_anchor, nil)
         |> assign(:zone_creation_armed, false)
         |> assign(:pending_zone, %{kind: zone_tool, rect: rect})
         |> push_event("edit:set_preview", %{kind: nil})}

      _stale ->
        {:noreply, assign(socket, :zone_anchor, {x, y, zone_tool})}
    end
  end

  # Shared between handle_event("set_spawn", ...) and handle_tool_click("spawn_zone", ...).
  defp handle_set_spawn(x, y, socket) do
    map = socket.assigns.map
    sx = max(0, min(x, map.width - 1))
    sy = max(0, min(y, map.height - 1))

    case Repo.query("UPDATE game_maps SET spawn_x = ?, spawn_y = ? WHERE id = ?", [sx, sy, map.id]) do
      {:ok, _} ->
        updated_map = %{map | spawn_x: sx, spawn_y: sy}

        {:noreply,
         socket
         |> append_phase2a_op("set_spawn", %{
           "x" => sx,
           "y" => sy,
           "prev_x" => map.spawn_x,
           "prev_y" => map.spawn_y
         })
         |> assign(:map, updated_map)
         |> assign(:save_status, "Spawn set to (#{sx}, #{sy})")
         |> push_event("map:spawn", %{x: sx, y: sy})}

      {:error, _} ->
        {:noreply, assign(socket, :save_status, "Failed to update spawn")}
    end
  end

  defp place_new_event(x, y, socket) do
    event = %{
      id: object_id(),
      x: x,
      y: y,
      kind: socket.assigns.active_event_kind,
      script_id: nil,
      data: socket.assigns[:event_form] || %{}
    }

    events = [event | socket.assigns.events]
    persist_map_events(socket.assigns.map.id, events)

    {:noreply,
     socket
     |> append_phase2a_op("place_event", %{"event" => event})
     |> assign(:events, events)
     |> assign(:dirty?, true)
     |> assign(:event_picker_target, event.id)
     |> push_event("map:events", %{events: events})}
  end

  defp apply_remote_msg(%{patch: patch, record: record}, socket) do
    case apply_remote_op(socket.assigns.map, patch) do
      {:ok, updated_map} ->
        # Bump head_seq to the incoming sequence (if greater).
        new_head =
          case record do
            %{sequence: s} -> max(s, updated_map[:head_seq] || 0)
            _ -> updated_map[:head_seq] || 0
          end

        socket =
          socket
          |> assign(:map, Map.put(updated_map, :head_seq, new_head))
          |> push_event("map:state", render_state(updated_map, socket.assigns))

        socket = maybe_refresh_history_drawer(socket, record)

        {:noreply, socket}

      _ ->
        {:noreply, socket}
    end
  end

  # If the History drawer is open, prepend the new op to the visible list.
  # If the user is time-scrubbing back, don't auto-scroll past their cursor —
  # bump :new_ops_since_scrub so the drawer can show a "+N new" badge.
  defp maybe_refresh_history_drawer(socket, nil), do: socket

  defp maybe_refresh_history_drawer(socket, record) do
    if Map.get(socket.assigns, :history_open) do
      drawer_op = %{
        op_id: record.op_id,
        op_type: record.op_type,
        sequence: record.sequence,
        patch: record.patch,
        user_name: record.user_name,
        inverted: false,
        created_at: record[:created_at] || NaiveDateTime.utc_now()
      }

      versions = [drawer_op | List.wrap(socket.assigns[:history_versions])] |> Enum.take(200)

      cond do
        Map.get(socket.assigns, :scrub_active) ->
          assign(socket,
            history_versions: versions,
            new_ops_since_scrub: (socket.assigns[:new_ops_since_scrub] || 0) + 1
          )

        true ->
          assign(socket, :history_versions, versions)
      end
    else
      socket
    end
  end

end
