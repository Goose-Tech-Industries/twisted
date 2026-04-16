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

        {:ok,
         socket
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
         |> assign(:viewport_w, @default_viewport_w)
         |> assign(:viewport_h, @default_viewport_h)
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
         |> assign(:object_palette_open, false)
         |> assign(:event_palette_open, false)
         |> assign(:hover_tile, nil)
         |> assign(:inspector_open, true)
         |> assign(:play_mode, false)
         |> assign(:play_x, div(map.width, 2))
         |> assign(:play_y, div(map.height, 2))
         |> assign(:cam_x, div(map.width, 2))
         |> assign(:cam_y, div(map.height, 2))
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
    {:noreply,
     socket
     |> assign(:active_tool, tool)
     |> assign(:rect_anchor, nil)
     |> assign(:select_rect, nil)
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
    versions = list_map_versions(socket.assigns.map.id)
    {:noreply, assign(socket, :history_versions, versions) |> assign(:history_open, true)}
  end

  def handle_event("history:close", _params, socket) do
    {:noreply, assign(socket, :history_open, false)}
  end

  # ── Templates / generators ───────────────────────────────────

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
            "elevation" => Map.get(map.layers, "elevation", List.duplicate(0, map.width * map.height))
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

  def handle_event("resize:open", _params, socket),
    do: {:noreply, assign(socket, :resize_open, true)}

  def handle_event("resize:close", _params, socket),
    do: {:noreply, assign(socket, :resize_open, false)}

  # ── Object / Event palettes ──────────────────────────────────

  def handle_event("object_palette:open", _params, socket),
    do: {:noreply, assign(socket, :object_palette_open, true)}

  def handle_event("object_palette:close", _params, socket),
    do: {:noreply, assign(socket, :object_palette_open, false)}

  def handle_event("object_palette:select", %{"key" => key}, socket) do
    {:noreply,
     socket
     |> assign(:active_object_preset, key)
     |> assign(:active_tool, "object")
     |> assign(:object_palette_open, false)}
  end

  def handle_event("event_palette:open", _params, socket),
    do: {:noreply, assign(socket, :event_palette_open, true)}

  def handle_event("event_palette:close", _params, socket),
    do: {:noreply, assign(socket, :event_palette_open, false)}

  def handle_event("event_palette:select", %{"kind" => kind}, socket) do
    {:noreply,
     socket
     |> assign(:active_event_kind, kind)
     |> assign(:active_tool, "event")
     |> assign(:event_palette_open, false)}
  end

  def handle_event("object:delete", %{"id" => id}, socket) do
    objects = Enum.reject(socket.assigns.objects, &(&1.id == id))
    persist_map_objects(socket.assigns.map.id, objects)

    socket = assign(socket, :objects, objects) |> assign(:dirty?, true)
    {:noreply, push_event(socket, "map:state", render_state(socket.assigns.map, socket.assigns))}
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
    "jrpg" => %{render_mode: "classic", label: "JRPG", icon: "⚔️"},
    "tactics" => %{render_mode: "isometric", label: "Tactics", icon: "♟"},
    "arpg" => %{render_mode: "2.5d", label: "ARPG", icon: "🗡"},
    "side_scroll" => %{render_mode: "side-scroll", label: "Side-scroll", icon: "🏃"},
    "vn" => %{render_mode: "classic", label: "Visual Novel", icon: "📖"},
    "dungeon_crawler" => %{render_mode: "first-person", label: "Dungeon Crawler", icon: "🕯"}
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
          enabled: params["enabled"] == "on" or params["enabled"] == "true"
        }

        zones = [zone | socket.assigns.spawn_zones]
        persist_spawn_zones(socket.assigns.map.id, zones)

        {:noreply,
         socket
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
         |> assign(:sound_zones, zones)
         |> assign(:pending_zone, nil)
         |> assign(:dirty?, true)
         |> push_event("map:zones", zones_payload(socket.assigns, socket.assigns.spawn_zones, zones))}

      _ ->
        {:noreply, socket}
    end
  end

  def handle_event("spawn_zone:delete", %{"id" => id}, socket) do
    zones = Enum.reject(socket.assigns.spawn_zones, &(&1.id == id))
    persist_spawn_zones(socket.assigns.map.id, zones)

    {:noreply,
     socket
     |> assign(:spawn_zones, zones)
     |> push_event("map:zones", zones_payload(socket.assigns, zones, socket.assigns.sound_zones))}
  end

  def handle_event("sound_zone:delete", %{"id" => id}, socket) do
    zones = Enum.reject(socket.assigns.sound_zones, &(&1.id == id))
    persist_sound_zones(socket.assigns.map.id, zones)

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

  def handle_event("play:start", _params, socket) do
    map = socket.assigns.map
    {sx, sy} = first_walkable(map) || {div(map.width, 2), div(map.height, 2)}

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

  defp handle_tool_click(zone_tool, x, y, socket) when zone_tool in ["spawn_zone", "sound_zone"] do
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
         |> assign(:pending_zone, %{kind: zone_tool, rect: rect})
         |> push_event("edit:set_preview", %{kind: nil})}

      _stale ->
        {:noreply, assign(socket, :zone_anchor, {x, y, zone_tool})}
    end
  end

  defp handle_tool_click("object", x, y, socket) do
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

    socket = assign(socket, :objects, objects) |> assign(:dirty?, true)

    {:noreply, push_event(socket, "map:state", render_state(socket.assigns.map, socket.assigns))}
  end

  defp handle_tool_click("event", x, y, socket) do
    event = %{
      id: object_id(),
      x: x,
      y: y,
      kind: socket.assigns.active_event_kind,
      script_id: nil,
      data: nil
    }

    events = [event | socket.assigns.events]
    persist_map_events(socket.assigns.map.id, events)

    {:noreply,
     socket
     |> assign(:events, events)
     |> assign(:dirty?, true)
     |> assign(:event_picker_target, event.id)
     |> push_event("map:events", %{events: events})}
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

  # Brush footprint for size N.
  #   1 → a single cell at (x,y)
  #   2 → a 2×2 square anchored top-left at (x,y)
  #   3 → a 3×3 square centered on (x,y)
  #   5 → a 5×5 disc-ish square centered on (x,y) with the four corners removed
  defp brush_cells(1, x, y), do: [{x, y}]

  defp brush_cells(2, x, y), do: for(dy <- 0..1, dx <- 0..1, do: {x + dx, y + dy})

  defp brush_cells(3, x, y), do: for(dy <- -1..1, dx <- -1..1, do: {x + dx, y + dy})

  defp brush_cells(5, x, y) do
    for dy <- -2..2, dx <- -2..2, not (abs(dx) == 2 and abs(dy) == 2), do: {x + dx, y + dy}
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
    persist_op(updated_map.id, op)
    broadcast_op(updated_map.id, op)
    undo_stack = [op | Enum.take(socket.assigns.undo_stack, 49)]
    persist_draft_stacks(updated_map.id, undo_stack, [])

    {:noreply,
     socket
     |> assign(:map, updated_map)
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
  def handle_info({:remote_editor_op, op}, socket) do
    # Apply the remote patch to our local map state
    case apply_remote_op(socket.assigns.map, op) do
      {:ok, updated_map} ->
        {:noreply,
         socket
         |> assign(:map, updated_map)
         |> push_event("map:state", render_state(updated_map, socket.assigns))}

      _ ->
        {:noreply, socket}
    end
  end

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
    <div class="flex h-full">
      <!-- Left: Layer panel -->
      <div class="w-52 bg-zinc-900/80 border-r border-zinc-800 flex flex-col shrink-0 overflow-y-auto">
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
      <div class="flex-1 flex flex-col min-w-0">
        <!-- Top toolbar -->
        <div class="flex items-center gap-1 px-3 py-2 bg-zinc-900/80 border-b border-zinc-800 shrink-0">
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
            <button :for={n <- [1, 2, 3, 5]}
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
            <button phx-click="object_palette:open" title="Object palette"
              class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
              🪵 Object: {@active_object_preset}
            </button>
            <button phx-click="event_palette:open" title="Event palette"
              class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
              ✨ Event: {@active_event_kind}
            </button>
            <button phx-click="templates:open" title="Templates & generators"
              class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
              🎲 Templates
            </button>
            <button phx-click="stamps:open" title="Saved stamps"
              class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
              📑 Stamps
            </button>
            <button phx-click="properties:open" title="Map properties"
              class="px-2 py-1.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
              ⚙ Props
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

      <!-- Right: Brush palette -->
      <aside class="w-56 bg-zinc-900/80 border-l border-zinc-800 flex flex-col shrink-0 overflow-hidden">
        <div class="px-3 py-2 border-b border-zinc-800">
          <span class="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Brush Palette</span>
          <form phx-change="palette_search" class="mt-2">
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
          <div class="grid grid-cols-6 gap-1">
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
                <button :for={gen <- [%{kind: "bsp", label: "BSP Dungeon", icon: "🏰", desc: "Rooms + corridors"}, %{kind: "cave", label: "Cave (CA)", icon: "🕳️", desc: "Organic chambers"}, %{kind: "maze", label: "Perfect Maze", icon: "🌀", desc: "Single-path puzzles"}]}
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
                <option :for={mode <- ~w(classic 2.5d isometric hex side-scroll first-person 3d)}
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
                <label class="flex items-center justify-center h-8 bg-zinc-800 border border-zinc-700 rounded cursor-pointer hover:bg-zinc-700">
                  <input type="radio" name="anchor" value="tl" class="hidden peer" />
                  <span class="text-zinc-500 peer-checked:text-amber-400">↖</span>
                </label>
                <label class="flex items-center justify-center h-8 bg-zinc-800 border border-zinc-700 rounded cursor-pointer hover:bg-zinc-700">
                  <input type="radio" name="anchor" value="t" class="hidden peer" disabled />
                  <span class="text-zinc-700">·</span>
                </label>
                <label class="flex items-center justify-center h-8 bg-zinc-800 border border-zinc-700 rounded cursor-pointer hover:bg-zinc-700">
                  <input type="radio" name="anchor" value="tr" class="hidden peer" />
                  <span class="text-zinc-500 peer-checked:text-amber-400">↗</span>
                </label>
                <label class="flex items-center justify-center h-8 bg-zinc-800 border border-zinc-700 rounded cursor-pointer hover:bg-zinc-700">
                  <input type="radio" name="anchor" value="l" class="hidden peer" disabled />
                  <span class="text-zinc-700">·</span>
                </label>
                <label class="flex items-center justify-center h-8 bg-zinc-800 border border-zinc-700 rounded cursor-pointer hover:bg-zinc-700">
                  <input type="radio" name="anchor" value="center" class="hidden peer" checked />
                  <span class="text-zinc-500 peer-checked:text-amber-400">●</span>
                </label>
                <label class="flex items-center justify-center h-8 bg-zinc-800 border border-zinc-700 rounded cursor-pointer hover:bg-zinc-700">
                  <input type="radio" name="anchor" value="r" class="hidden peer" disabled />
                  <span class="text-zinc-700">·</span>
                </label>
                <label class="flex items-center justify-center h-8 bg-zinc-800 border border-zinc-700 rounded cursor-pointer hover:bg-zinc-700">
                  <input type="radio" name="anchor" value="bl" class="hidden peer" />
                  <span class="text-zinc-500 peer-checked:text-amber-400">↙</span>
                </label>
                <label class="flex items-center justify-center h-8 bg-zinc-800 border border-zinc-700 rounded cursor-pointer hover:bg-zinc-700">
                  <input type="radio" name="anchor" value="b" class="hidden peer" disabled />
                  <span class="text-zinc-700">·</span>
                </label>
                <label class="flex items-center justify-center h-8 bg-zinc-800 border border-zinc-700 rounded cursor-pointer hover:bg-zinc-700">
                  <input type="radio" name="anchor" value="br" class="hidden peer" />
                  <span class="text-zinc-500 peer-checked:text-amber-400">↘</span>
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

      <!-- Object palette modal -->
      <div :if={@object_palette_open} class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
           phx-click="object_palette:close">
        <div class="w-[680px] max-h-[80vh] bg-zinc-900 border border-zinc-700 rounded-lg flex flex-col overflow-hidden"
             phx-click-away="object_palette:close">
          <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 class="text-sm font-bold text-amber-400">Object Palette — 25 presets</h3>
            <button phx-click="object_palette:close" class="text-zinc-500 hover:text-zinc-200 text-lg">✕</button>
          </div>
          <div class="flex-1 overflow-y-auto p-4 space-y-4">
            <div :for={group <- ~w(LIGHT PROP DECO)}>
              <h4 class="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">{group}</h4>
              <div class="grid grid-cols-5 gap-2">
                <button :for={p <- Enum.filter(object_presets(), &(&1.group == group))}
                  phx-click="object_palette:select" phx-value-key={p.key}
                  class={["p-2 rounded border text-center transition-colors",
                    @active_object_preset == p.key && "bg-amber-900/40 border-amber-500",
                    @active_object_preset != p.key && "bg-zinc-800 hover:bg-zinc-700 border-zinc-700"]}>
                  <div class="text-xl">{p.icon}</div>
                  <div class="text-[10px] text-zinc-400 mt-0.5">{p.label}</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Event palette modal -->
      <div :if={@event_palette_open} class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
           phx-click="event_palette:close">
        <div class="w-[440px] bg-zinc-900 border border-zinc-700 rounded-lg flex flex-col overflow-hidden"
             phx-click-away="event_palette:close">
          <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 class="text-sm font-bold text-amber-400">Event Kind</h3>
            <button phx-click="event_palette:close" class="text-zinc-500 hover:text-zinc-200 text-lg">✕</button>
          </div>
          <div class="p-4 grid grid-cols-2 gap-2">
            <button :for={kind <- event_kinds()}
              phx-click="event_palette:select" phx-value-kind={kind}
              class={["px-3 py-2 text-xs rounded border transition-colors",
                @active_event_kind == kind && "bg-amber-900/40 border-amber-500 text-amber-300",
                @active_event_kind != kind && "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300"]}>
              {kind}
            </button>
          </div>
        </div>
      </div>

      <!-- Cell inspector / object & event list (right of canvas, slides over palette) -->
      <div :if={@inspector_open} class="absolute right-60 bottom-4 w-72 bg-zinc-900/95 border border-zinc-700 rounded-lg shadow-xl text-xs z-30 max-h-[50vh] overflow-y-auto">
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
                  <span :if={ev.script_id} class="text-amber-400 ml-1">📜#{ev.script_id}</span>
                </span>
                <span class="flex items-center gap-1">
                  <button phx-click="event:open_picker" phx-value-id={ev.id}
                    class="text-amber-500 hover:text-amber-300" title="Link script">📜</button>
                  <button phx-click="event:delete" phx-value-id={ev.id}
                    class="text-red-500 hover:text-red-300">×</button>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Event → script picker modal -->
      <div :if={@event_picker_target}
           class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
           phx-click="event:picker_close">
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
           class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
           phx-click="zone:cancel">
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
           class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
           phx-click="zone:cancel">
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

      <!-- Version history modal -->
      <div :if={@history_open} class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
           phx-click="history:close">
        <div class="w-[640px] max-h-[80vh] bg-zinc-900 border border-zinc-700 rounded-lg flex flex-col overflow-hidden"
             phx-click-away="history:close">
          <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 class="text-sm font-bold text-amber-400">Version History — {@map.name}</h3>
            <button phx-click="history:close" class="text-zinc-500 hover:text-zinc-200 text-lg">✕</button>
          </div>
          <div class="flex-1 overflow-y-auto">
            <div :if={@history_versions == []} class="p-6 text-center text-zinc-500 text-xs">
              No version history yet. Save the map to create the first snapshot.
            </div>
            <ul class="divide-y divide-zinc-800">
              <li :for={v <- @history_versions} class="px-4 py-2 flex items-center justify-between hover:bg-zinc-800/50">
                <div>
                  <div class="text-xs text-zinc-200 font-mono">v{v.version_num} — {v.label}</div>
                  <div class="text-[10px] text-zinc-500">{v.at} · {v.by}</div>
                </div>
                <button phx-click="history:restore" phx-value-version_id={v.id}
                  class="px-2 py-1 text-[10px] bg-amber-700 hover:bg-amber-600 text-black rounded font-bold">
                  Restore
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
               SELECT id, name, width, height, tiles_json, layers_json, schema_version, render_mode
               FROM game_maps
               WHERE id = ?
               """,
               [id]
             ) do
          {:ok, %{rows: [[id, name, w, h, tiles_json, layers_json, schema_v, render_mode]]}} ->
            layers = parse_layers(layers_json, tiles_json, w, h)

            {:ok,
             %{
               id: id,
               name: name,
               width: w,
               height: h,
               render_mode: render_mode || "classic",
               schema_version: schema_v || 1,
               layers: layers
             }}

          _ ->
            {:error, :not_found}
        end

      _ ->
        {:error, :not_found}
    end
  end

  defp parse_layers(layers_json, _tiles_json, _w, _h) when is_binary(layers_json) and layers_json != "" do
    case Jason.decode(layers_json) do
      {:ok, %{"layers" => layers}} when is_map(layers) ->
        %{
          "ground" => Map.get(layers, "ground", []),
          "overlay" => Map.get(layers, "overlay", []),
          "passability" => Map.get(layers, "passability", []),
          "fringe" => Map.get(layers, "fringe", []),
          "elevation" => Map.get(layers, "elevation", [])
        }

      _ ->
        empty_layers(1, 1)
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

  defp ensure_len(list, target) when is_list(list) do
    cur = length(list)
    cond do
      cur == target -> list
      cur > target -> Enum.take(list, target)
      true -> list ++ List.duplicate(0, target - cur)
    end
  end

  defp ensure_len(_, target), do: List.duplicate(0, target)

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

  # Default 64-tile palette. Mirrors DEFAULT_TILE_COLORS in
  # packages/render/src/renderer.ts for named tiles and fills the rest with
  # a synthesized HSL spread so every slot is pickable.
  defp palette do
    named = %{
      0 => {"grass", "#2e5d31"},
      1 => {"stone", "#3a3a3a"},
      2 => {"dirt", "#3a2a0a"},
      3 => {"water", "#1e3a5f"},
      4 => {"wood", "#7a5a2a"},
      5 => {"cobble", "#8a8a8a"},
      6 => {"cave", "#2a2a2a"},
      7 => {"void", "#1a1a1a"}
    }

    for id <- 0..63 do
      case Map.get(named, id) do
        {label, hex} -> %{id: id, label: label, color: hex}
        nil -> %{id: id, label: "tile #{id}", color: hsl_for(id)}
      end
    end
  end

  defp hsl_for(id) do
    hue = rem(id * 137, 360)
    "hsl(#{hue}, 45%, 40%)"
  end

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
    # Default: stone (1) is its own group, members {1}, every mask → 1.
    # Users can override with DB rows for real sprite sheets.
    [
      %{
        id: :default_stone,
        name: "stone",
        base_tile_id: 1,
        members: MapSet.new([1]),
        variant_map: %{}
      },
      %{
        id: :default_water,
        name: "water",
        base_tile_id: 3,
        members: MapSet.new([3]),
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
    for l <- layer_names(), into: %{}, do: {l, true}
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

  defp empty_value_for(layer) when layer in ["ground", "elevation", "passability"], do: 0
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

  defp persist_op(map_id, op) do
    Repo.query(
      """
      INSERT IGNORE INTO game_map_ops_log
        (map_id, op_id, op_type, patch_json, author_id, author_name)
      VALUES (?, ?, ?, ?, ?, ?)
      """,
      [map_id, op.op_id, op.op_type, Jason.encode!(op), nil, "editor"]
    )
  end

  defp broadcast_op(map_id, op) do
    Phoenix.PubSub.broadcast(
      TePhoenix.PubSub,
      "map:#{map_id}:editor",
      {:remote_editor_op, op}
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
          Map.get(assigns, :cam_x, div(map.width, 2))
        end,
      camY:
        if Map.get(assigns, :play_mode, false) do
          Map.get(assigns, :play_y, div(map.height, 2))
        else
          Map.get(assigns, :cam_y, div(map.height, 2))
        end,
      viewportW: Map.get(assigns, :viewport_w, @default_viewport_w),
      viewportH: Map.get(assigns, :viewport_h, @default_viewport_h),
      showPassability: Map.get(assigns, :layer_visibility, %{}) |> Map.get("passability", true),
      showElevation: Map.get(assigns, :layer_visibility, %{}) |> Map.get("elevation", true),
      fogEnabled: false
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

  defp list_map_versions(map_id) do
    case Repo.query(
           "SELECT id, version_num, label, created_by, created_at FROM game_map_versions WHERE map_id = ? ORDER BY version_num DESC LIMIT 20",
           [map_id]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, num, label, by, at] ->
          %{id: id, version_num: num, label: label || "", by: by || "", at: to_string(at)}
        end)

      _ ->
        []
    end
  rescue
    _ -> []
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
    raw_fields = [
      {"render_mode", :render_mode, :string, params["render_mode"]},
      {"tileset_url", :tileset_url, :string, params["tileset_url"]},
      {"ambient_dark", :ambient_dark, :float, params["ambient_dark"]},
      {"min_level", :min_level, :int, params["min_level"]},
      {"description", :description, :string, params["description"]}
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
      enabled: z["enabled"] != false
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

  defp zones_payload(_assigns, spawn_zones, sound_zones) do
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
        end)
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
end
