defmodule TePhoenix.World.UnifiedWorldBuilder do
  @moduledoc """
  Unified World Builder: One-shot generative world pipeline.
  Takes a prompt (e.g. "Sunken dwarven forge with bioluminescent water") and builds:
  1. Custom pixel art tileset via local ComfyUI GPU (or offline procedural fallback).
  2. Procedural map layout (BSP dungeon, cavern, or maze).
  3. 2.5D wall auto-elevation.
  4. Atmospheric lighting with flickering torches/braziers.
  5. Saved game_map record ready to open and play.

  100% FREE & OFFLINE — requires zero API tokens (no Claude/Gemini keys needed).
  """

  require Logger
  alias TePhoenix.Repo
  alias TePhoenix.World.MapGenerators
  alias TePhoenix.AI.Providers.ComfyUI

  @doc """
  Builds a complete, playable world from a single text prompt.
  """
  def build(prompt, opts \\ []) do
    w = Keyword.get(opts, :width, 30)
    h = Keyword.get(opts, :height, 30)
    render_mode = Keyword.get(opts, :render_mode, "2.5d")

    # Step 1: Detect layout style from prompt semantics
    kind = detect_layout_kind(prompt)

    # Step 2: Generate map layout & 2.5D elevations
    layout =
      case kind do
        :cave ->
          MapGenerators.generate_cave(w, h, elevated_walls: true)

        :maze ->
          MapGenerators.generate_maze(w, h, elevated_walls: true)

        :dungeon ->
          MapGenerators.generate_dungeon(w, h, elevated_walls: true)
      end

    # Step 3: Generate custom tileset image (Local ComfyUI on GPU, or offline fallback)
    tileset_url = resolve_tileset(prompt)

    # Step 4: Generate atmospheric lighting & placed torches/braziers
    objects = generate_atmosphere_objects(layout, prompt, w, h)

    # Step 5: Format layers for schema v2
    empty_layer = List.duplicate(-1, w * h)
    layers = %{
      "ground" => layout.ground,
      "overlay" => empty_layer,
      "fringe" => empty_layer,
      "elevation" => layout.elevation,
      "passability" => layout.passability
    }

    # Step 6: Derive title from prompt
    map_name = derive_name(prompt)

    # Step 7: Insert into game_maps database
    layers_json = Jason.encode!(%{"layers" => layers})
    objects_json = Jason.encode!(objects)
    ambient_dark = 0.82

    case Repo.query(
           """
           INSERT INTO game_maps
             (name, description, width, height, render_mode, ambient_dark,
              tileset_url, layers_json, objects_json, schema_version, is_active,
              fast_travel_enabled, min_level, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 2, 1, 1, 1, NOW())
           """,
           [
             map_name,
             prompt,
             w,
             h,
             render_mode,
             ambient_dark,
             tileset_url,
             layers_json,
             objects_json
           ]
         ) do
      {:ok, %{last_insert_id: map_id}} ->
        Logger.info("[UnifiedWorldBuilder] Built world ##{map_id}: '#{map_name}' with tileset #{tileset_url}")
        {:ok, %{id: map_id, name: map_name, tileset_url: tileset_url, render_mode: render_mode}}

      {:error, reason} ->
        Logger.error("[UnifiedWorldBuilder] DB insert failed: #{inspect(reason)}")
        {:error, reason}
    end
  end

  # Determine layout algorithm from prompt keywords
  defp detect_layout_kind(prompt) do
    cond do
      Regex.match?(~r/cave|cavern|grotto|tunnel|mine|burrow|chasm/i, prompt) -> :cave
      Regex.match?(~r/maze|labyrinth|catacomb|prison|sewer|ruins/i, prompt) -> :maze
      true -> :dungeon
    end
  end

  # Try local GPU ComfyUI first, fall back to offline static asset
  defp resolve_tileset(prompt) do
    case ComfyUI.status() do
      {:ok, %{online: true}} ->
        Logger.info("[UnifiedWorldBuilder] Local ComfyUI online, dispatching prompt to GPU...")
        case ComfyUI.generate_tileset(prompt) do
          {:ok, url} -> url
          {:error, err} ->
            Logger.warning("[UnifiedWorldBuilder] ComfyUI generation failed (#{inspect(err)}), using default tileset")
            "/tilesets/forest_tiles.png"
        end

      _ ->
        Logger.info("[UnifiedWorldBuilder] ComfyUI offline, using bundled starter tileset")
        "/tilesets/forest_tiles.png"
    end
  end

  # Automatically place flickering braziers & torches in carved rooms/open areas
  defp generate_atmosphere_objects(layout, prompt, w, h) do
    # Warm amber for fire, or eerie cyan/purple for bioluminescent/arcane
    color =
      cond do
        Regex.match?(~r/bioluminescent|water|ice|frost|crystal/i, prompt) -> "#38bdf8"
        Regex.match?(~r/poison|acid|venom|toxic|swamp/i, prompt) -> "#22c55e"
        Regex.match?(~r/blood|void|shadow|abyss|death/i, prompt) -> "#a855f7"
        true -> "#ff9933" # Default warm torch fire
      end

    rooms = Map.get(layout, :rooms, [])

    if rooms != [] do
      Enum.map(rooms, fn room ->
        cx = room.x + div(room.w, 2)
        cy = room.y + div(room.h, 2)
        %{
          "x" => cx,
          "y" => cy,
          "name" => "Brazier",
          "type" => "LIGHT",
          "preset" => "TORCH",
          "light" => %{
            "radius" => 4.5,
            "color" => color,
            "flicker" => true
          }
        }
      end)
    else
      # If cave/maze with no discrete rooms, scatter 4-6 lights in walkable floor cells
      for y <- 2..(h - 3)//5, x <- 2..(w - 3)//5, Enum.at(layout.ground, y * w + x) != 1 do
        %{
          "x" => x,
          "y" => y,
          "name" => "Torch",
          "type" => "LIGHT",
          "preset" => "TORCH",
          "light" => %{
            "radius" => 3.5,
            "color" => color,
            "flicker" => true
          }
        }
      end
    end
  end

  defp derive_name(prompt) do
    prompt
    |> String.split(~r/[.,;!]/, trim: true)
    |> List.first()
    |> to_string()
    |> String.trim()
    |> String.slice(0, 48)
    |> String.split()
    |> Enum.map(&String.capitalize/1)
    |> Enum.join(" ")
  end
end
