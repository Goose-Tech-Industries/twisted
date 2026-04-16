defmodule TePhoenix.Battle.Surfaces do
  @moduledoc """
  BG3-style surface/terrain interaction system.

  Surfaces are tile-level effects on the battle grid: fire, ice, oil,
  poison cloud, water, acid, electrified water, blessed ground, etc.
  They persist for a number of turns, deal damage or apply statuses to
  combatants standing on them, and react with each other when layered.

  ## Surface definition (DB-driven, `game_surface_defs`)

      %{
        key: "fire",
        name: "Fire",
        icon: "🔥",
        damage_per_turn: 8,
        damage_type: "fire",
        status_on_enter: "burn",
        duration_turns: 3,
        spread_to: ["oil"],           # fire spreads to adjacent oil tiles
        reacts_with: %{
          "water" => "steam",         # fire + water = steam (obscured)
          "ice" => "water",           # fire + ice = water
          "oil" => "fire"             # fire + oil = more fire (spread)
        },
        blocks_movement: false,
        visual: "fire_surface"
      }

  ## How it works

  1. **Placement**: projectile miss, spell AoE, shove-into-barrel,
     ability effect, or trigger rule places a surface on tiles.
  2. **Tick**: each turn, every combatant standing on a surface takes
     damage and/or gains a status. Surfaces with duration decrement.
  3. **Reactions**: when a new surface is placed on a tile that already
     has one, the `reacts_with` table determines the result. Fire on
     oil = fire spreads; water on fire = steam; ice on water = frozen.
  4. **Spreading**: surfaces with `spread_to` check adjacent tiles
     on placement. If a neighbor has a matching surface type, the new
     surface spreads there too.
  5. **Movement**: walking through a surface triggers `status_on_enter`.
     Some surfaces block movement (e.g., wall of fire at high level).

  All surface types are data-driven and editable from AdminSauce.
  """

  require Logger
  alias TePhoenix.Battle.{Combatant, StatusEffects}
  alias TePhoenix.Repo

  @defs_table "game_surface_defs"

  # ── Setup ───────────────────────────────────────────────────────

  def ensure_table do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@defs_table} (
      `key` VARCHAR(80) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      icon VARCHAR(16) DEFAULT '🔥',
      damage_per_turn INT DEFAULT 0,
      damage_type VARCHAR(32) DEFAULT 'fire',
      status_on_enter VARCHAR(80),
      duration_turns INT DEFAULT 3,
      spread_to_json LONGTEXT,
      reacts_with_json LONGTEXT,
      blocks_movement TINYINT(1) DEFAULT 0,
      visual VARCHAR(80) DEFAULT 'default',
      enabled TINYINT(1) DEFAULT 1,
      updated_at DATETIME NOT NULL
    )
    """)

    seed_defaults()
  rescue
    e -> Logger.error("Surfaces ensure_table: #{inspect(e)}")
  end

  # ── Surface definitions ─────────────────────────────────────────

  def get_def(key) do
    case Repo.query("SELECT `key`, name, icon, damage_per_turn, damage_type, status_on_enter, duration_turns, spread_to_json, reacts_with_json, blocks_movement, visual FROM #{@defs_table} WHERE `key` = ? AND enabled = 1", [key]) do
      {:ok, %{rows: [row]}} -> parse_def(row)
      _ -> nil
    end
  rescue
    _ -> nil
  end

  def list_defs do
    case Repo.query("SELECT `key`, name, icon, damage_per_turn, damage_type, status_on_enter, duration_turns, spread_to_json, reacts_with_json, blocks_movement, visual FROM #{@defs_table} WHERE enabled = 1 ORDER BY `key`") do
      {:ok, %{rows: rows}} -> Enum.map(rows, &parse_def/1)
      _ -> []
    end
  rescue
    _ -> []
  end

  # ── Place a surface ─────────────────────────────────────────────

  @doc """
  Place a surface on battle tiles. Handles reactions with existing
  surfaces and spreading to adjacent tiles.

  `tiles` is a list of `{x, y}` tuples.
  Returns `{state, result}`.
  """
  def place(state, surface_key, tiles, result \\ %{log: [], actions: []}) do
    sdef = get_def(surface_key)

    if is_nil(sdef) do
      {state, result}
    else
      surfaces = state.terrain_map || %{}
      surface_durations = Map.get(state, :surface_durations, %{})

      {surfaces, surface_durations, result, spread_tiles} =
        Enum.reduce(tiles, {surfaces, surface_durations, result, []}, fn {x, y}, {s, sd, r, sp} ->
          tile_key = "#{x},#{y}"
          existing = Map.get(s, tile_key)

          {new_surface, r} =
            if existing && existing != surface_key do
              resolve_reaction(existing, surface_key, sdef, tile_key, r)
            else
              {surface_key, r}
            end

          s = Map.put(s, tile_key, new_surface)
          placed_def = get_def(new_surface) || sdef
          sd = Map.put(sd, tile_key, placed_def.duration_turns)

          r = %{r |
            actions: [%{type: :surface_placed, x: x, y: y, surface: new_surface, icon: placed_def.icon, visual: placed_def.visual} | r.actions]
          }

          # Check spreading
          sp_new = check_spread(sdef, x, y, s)
          {s, sd, r, sp ++ sp_new}
        end)

      # Apply spreading (one level deep to prevent infinite recursion)
      {surfaces, surface_durations, result} =
        Enum.reduce(spread_tiles, {surfaces, surface_durations, result}, fn {sx, sy, spread_key}, {s, sd, r} ->
          tile_key = "#{sx},#{sy}"

          unless Map.has_key?(s, tile_key) do
            sdef2 = get_def(spread_key) || sdef
            s = Map.put(s, tile_key, spread_key)
            sd = Map.put(sd, tile_key, sdef2.duration_turns)
            r = %{r |
              log: ["#{sdef.icon} #{sdef.name} spreads to (#{sx},#{sy})!" | r.log],
              actions: [%{type: :surface_spread, x: sx, y: sy, surface: spread_key} | r.actions]
            }
            {s, sd, r}
          else
            {s, sd, r}
          end
        end)

      state = %{state | terrain_map: surfaces}
      state = Map.put(state, :surface_durations, surface_durations)

      result = %{result | log: ["#{sdef.icon} #{sdef.name} covers the ground!" | result.log]}
      {state, result}
    end
  end

  # ── Tick surfaces ───────────────────────────────────────────────

  @doc """
  Called at turn end. For each combatant standing on a surface:
  - Apply damage_per_turn
  - Apply status_on_enter
  Decrement surface durations. Remove expired surfaces.
  Returns `{state, result}`.
  """
  def tick(state, result \\ %{log: [], actions: []}) do
    surfaces = state.terrain_map || %{}
    durations = Map.get(state, :surface_durations, %{})

    if surfaces == %{} do
      {state, result}
    else
      # Damage combatants on surfaces
      {state, result} =
        Enum.reduce(state.combatants, {state, result}, fn {_id, c}, {st, r} ->
          if Combatant.alive?(c) do
            tile_key = "#{c.grid_x},#{c.grid_y}"

            case Map.get(surfaces, tile_key) do
              nil -> {st, r}
              surface_key ->
                sdef = get_def(surface_key)
                if sdef, do: apply_surface_effect(st, c, sdef, r), else: {st, r}
            end
          else
            {st, r}
          end
        end)

      # Decrement durations, remove expired
      {new_surfaces, new_durations, result} =
        Enum.reduce(surfaces, {%{}, %{}, result}, fn {tile_key, surface_key}, {ns, nd, r} ->
          remaining = Map.get(durations, tile_key, 1) - 1

          if remaining <= 0 do
            sdef = get_def(surface_key)
            r = %{r | actions: [%{type: :surface_expired, tile: tile_key, surface: surface_key} | r.actions]}
            icon = (sdef && sdef.icon) || "💨"
            r = %{r | log: ["#{icon} Surface at #{tile_key} fades." | r.log]}
            {ns, nd, r}
          else
            {Map.put(ns, tile_key, surface_key), Map.put(nd, tile_key, remaining), r}
          end
        end)

      state = %{state | terrain_map: new_surfaces}
      state = Map.put(state, :surface_durations, new_durations)
      {state, result}
    end
  end

  # ── Movement through surfaces ───────────────────────────────────

  @doc """
  Check if a combatant moving to `{x, y}` would enter a surface.
  Returns `{combatant, result}` with status applied if applicable.
  """
  def on_enter_tile(state, combatant, x, y, result) do
    surfaces = state.terrain_map || %{}
    tile_key = "#{x},#{y}"

    case Map.get(surfaces, tile_key) do
      nil -> {combatant, result}
      surface_key ->
        sdef = get_def(surface_key)

        if sdef && sdef.status_on_enter do
          {combatant, result} = StatusEffects.apply_status(combatant, sdef.status_on_enter, result)
          result = %{result | log: ["#{sdef.icon} #{combatant.name} steps into #{sdef.name}!" | result.log]}
          {combatant, result}
        else
          {combatant, result}
        end
    end
  end

  @doc "Check if a tile blocks movement."
  def blocks_movement?(state, x, y) do
    surfaces = state.terrain_map || %{}
    tile_key = "#{x},#{y}"

    case Map.get(surfaces, tile_key) do
      nil -> false
      surface_key ->
        sdef = get_def(surface_key)
        sdef && sdef.blocks_movement
    end
  end

  # ── Internal ────────────────────────────────────────────────────

  defp apply_surface_effect(state, combatant, sdef, result) do
    {combatant, result} =
      if sdef.damage_per_turn > 0 do
        dmg = sdef.damage_per_turn
        c = Combatant.apply_damage(combatant, dmg)
        r = %{result |
          log: ["#{sdef.icon} #{c.name} takes #{dmg} #{sdef.damage_type} damage from #{sdef.name}!" | result.log],
          actions: [%{type: :surface_damage, target: c.name, amount: dmg, surface: sdef.key, damage_type: sdef.damage_type} | result.actions]
        }
        {c, r}
      else
        {combatant, result}
      end

    {combatant, result} =
      if sdef.status_on_enter do
        StatusEffects.apply_status(combatant, sdef.status_on_enter, result)
      else
        {combatant, result}
      end

    state = put_in(state.combatants[combatant.char_id], combatant)
    {state, result}
  end

  defp resolve_reaction(existing_key, new_key, new_def, tile_key, result) do
    reactions = new_def.reacts_with || %{}

    case Map.get(reactions, existing_key) do
      nil ->
        {new_key, result}

      product ->
        product_def = get_def(product)
        icon = (product_def && product_def.icon) || "💥"

        result = %{result |
          log: ["#{icon} #{existing_key} + #{new_key} = #{product} at #{tile_key}!" | result.log],
          actions: [%{type: :surface_reaction, tile: tile_key, from: [existing_key, new_key], to: product} | result.actions]
        }

        {product, result}
    end
  end

  defp check_spread(sdef, x, y, existing_surfaces) do
    spread_to = sdef.spread_to || []

    if spread_to == [] do
      []
    else
      for dx <- -1..1, dy <- -1..1, {dx, dy} != {0, 0} do
        nx = x + dx
        ny = y + dy
        neighbor_key = "#{nx},#{ny}"

        case Map.get(existing_surfaces, neighbor_key) do
          nil -> nil
          existing -> if existing in spread_to, do: {nx, ny, sdef.key}, else: nil
        end
      end
      |> Enum.reject(&is_nil/1)
    end
  end

  # ── Parse ───────────────────────────────────────────────────────

  defp parse_def([key, name, icon, dmg, dtype, status, dur, spread_j, react_j, blocks, visual]) do
    %{
      key: key, name: name, icon: icon || "🔥",
      damage_per_turn: dmg || 0, damage_type: dtype || "fire",
      status_on_enter: status, duration_turns: dur || 3,
      spread_to: decode_list(spread_j), reacts_with: decode_map(react_j),
      blocks_movement: blocks == 1 or blocks == true,
      visual: visual || "default"
    }
  end

  defp decode_map(nil), do: %{}
  defp decode_map(""), do: %{}
  defp decode_map(s) when is_binary(s), do: case(Jason.decode(s), do: ({:ok, %{} = m} -> m; _ -> %{}))
  defp decode_map(m) when is_map(m), do: m
  defp decode_map(_), do: %{}

  defp decode_list(nil), do: []
  defp decode_list(""), do: []
  defp decode_list(s) when is_binary(s), do: case(Jason.decode(s), do: ({:ok, l} when is_list(l) -> l; _ -> []))
  defp decode_list(l) when is_list(l), do: l
  defp decode_list(_), do: []

  # ── Seed defaults ───────────────────────────────────────────────

  defp seed_defaults do
    case Repo.query("SELECT COUNT(*) FROM #{@defs_table}") do
      {:ok, %{rows: [[0]]}} ->
        for s <- default_surfaces() do
          Repo.query(
            "INSERT INTO #{@defs_table} (`key`, name, icon, damage_per_turn, damage_type, status_on_enter, duration_turns, spread_to_json, reacts_with_json, blocks_movement, visual, enabled, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,NOW())",
            [s.key, s.name, s.icon, s.dmg, s.dtype, s.status, s.dur,
             Jason.encode!(s.spread), Jason.encode!(s.reacts),
             if(s.blocks, do: 1, else: 0), s.visual]
          )
        end
      _ -> :ok
    end
  rescue
    _ -> :ok
  end

  defp default_surfaces do
    [
      %{key: "fire", name: "Fire", icon: "🔥", dmg: 8, dtype: "fire", status: "burn", dur: 3,
        spread: ["oil"], reacts: %{"water" => "steam", "ice" => "water", "oil" => "fire"}, blocks: false, visual: "fire"},
      %{key: "oil", name: "Oil", icon: "🛢️", dmg: 0, dtype: nil, status: "slow", dur: 5,
        spread: [], reacts: %{"fire" => "fire"}, blocks: false, visual: "oil"},
      %{key: "ice", name: "Ice", icon: "❄️", dmg: 0, dtype: nil, status: nil, dur: 4,
        spread: ["water"], reacts: %{"fire" => "water"}, blocks: false, visual: "ice"},
      %{key: "water", name: "Water", icon: "🌊", dmg: 0, dtype: nil, status: nil, dur: 6,
        spread: [], reacts: %{"fire" => "steam", "ice" => "frozen", "lightning" => "electrified_water"}, blocks: false, visual: "water"},
      %{key: "poison_cloud", name: "Poison Cloud", icon: "☠️", dmg: 5, dtype: "poison", status: "poison", dur: 3,
        spread: [], reacts: %{"fire" => "explosion"}, blocks: false, visual: "poison"},
      %{key: "steam", name: "Steam", icon: "♨️", dmg: 0, dtype: nil, status: "blind", dur: 2,
        spread: [], reacts: %{}, blocks: false, visual: "steam"},
      %{key: "frozen", name: "Frozen Ground", icon: "🧊", dmg: 0, dtype: nil, status: "freeze", dur: 3,
        spread: [], reacts: %{"fire" => "water"}, blocks: false, visual: "frozen"},
      %{key: "electrified_water", name: "Electrified Water", icon: "⚡", dmg: 12, dtype: "lightning", status: "stun", dur: 2,
        spread: ["water"], reacts: %{}, blocks: false, visual: "electrified"},
      %{key: "acid", name: "Acid", icon: "🟢", dmg: 10, dtype: "acid", status: nil, dur: 4,
        spread: [], reacts: %{}, blocks: false, visual: "acid"},
      %{key: "blessed", name: "Blessed Ground", icon: "✨", dmg: -5, dtype: "holy", status: "regen", dur: 3,
        spread: [], reacts: %{"cursed" => "neutral"}, blocks: false, visual: "blessed"},
      %{key: "cursed", name: "Cursed Ground", icon: "💀", dmg: 3, dtype: "dark", status: nil, dur: 4,
        spread: [], reacts: %{"blessed" => "neutral"}, blocks: false, visual: "cursed"}
    ]
  end
end
