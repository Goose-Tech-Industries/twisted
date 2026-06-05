defmodule TePhoenix.World.Weather do
  @moduledoc """
  Dynamic weather system that affects gameplay.

  Each map has a current weather state tracked in an ETS-backed registry
  (with DB persistence for weather definitions). Weather affects:

    * Vision radius multiplier (fog, blizzard reduce visibility)
    * Movement speed multiplier (snow, sandstorm slow movement)
    * Surface spawn chance (rain spawns water tiles, blizzard spawns ice)
    * Periodic damage (sandstorm, thunderstorm deal damage per tick)
    * Element bonuses (rain boosts water damage, clear boosts fire damage)

  ## Table

    * `game_weather_defs` — weather type definitions with all modifiers

  ## Integration

    * `MapChannel` — calls `tick_weather` each game tick
    * `Vision` — multiplies vision_radius by weather's vision_mult
    * `Battle` — applies element bonuses from weather
    * `Surfaces` — weather can spawn surfaces on the map
    * PubSub broadcasts on `"weather:map:{map_id}"` when weather changes
  """

  require Logger
  alias TePhoenix.Repo

  @defs_table "game_weather_defs"

  # In-memory weather state per map: %{map_id => %{key, started_at, duration_ticks, ticks_elapsed}}
  @weather_ets :te_weather_state

  # ── Setup ───────────────────────────────────────────────────────

  def ensure_tables do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@defs_table} (
      `key` VARCHAR(40) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      icon VARCHAR(16) DEFAULT '☀️',
      vision_mult FLOAT DEFAULT 1.0,
      speed_mult FLOAT DEFAULT 1.0,
      surface_chance FLOAT DEFAULT 0.0,
      surface_type VARCHAR(40),
      damage_per_turn INT DEFAULT 0,
      damage_type VARCHAR(40),
      element_bonus_json LONGTEXT,
      visual VARCHAR(40),
      sound_loop VARCHAR(80),
      duration_range_min INT DEFAULT 30,
      duration_range_max INT DEFAULT 120,
      weight INT DEFAULT 10,
      enabled TINYINT(1) DEFAULT 1
    )
    """)

    seed_defaults()
    init_ets()
    Logger.info("[Weather] tables ensured")
  end

  defp init_ets do
    if :ets.whereis(@weather_ets) == :undefined do
      :ets.new(@weather_ets, [:named_table, :public, :set])
    end
  end

  defp seed_defaults do
    defaults = [
      {"clear", "Clear Sky", "☀️", 1.0, 1.0, 0.0, nil, 0, nil, ~s({"fire":10}), "clear", nil, 40, 120, 20},
      {"rain", "Rain", "🌧️", 0.9, 0.95, 0.05, "water", 0, nil, ~s({"water":10}), "rain", "rain_loop", 30, 90, 15},
      {"heavy_rain", "Heavy Rain", "⛈️", 0.7, 0.85, 0.15, "water", 0, nil, ~s({"water":20,"lightning":5}), "heavy_rain", "heavy_rain_loop", 20, 60, 8},
      {"snow", "Snow", "🌨️", 0.8, 0.8, 0.05, "ice", 0, nil, ~s({"ice":10}), "snow", "snow_loop", 30, 90, 10},
      {"blizzard", "Blizzard", "❄️", 0.3, 0.6, 0.2, "ice", 3, "ice", ~s({"ice":25}), "blizzard", "blizzard_loop", 15, 45, 5},
      {"fog", "Dense Fog", "🌫️", 0.5, 1.0, 0.0, nil, 0, nil, ~s({}), "fog", "fog_loop", 20, 60, 10},
      {"sandstorm", "Sandstorm", "🏜️", 0.4, 0.7, 0.1, "sand", 2, "earth", ~s({"earth":15}), "sandstorm", "sandstorm_loop", 15, 50, 5},
      {"thunderstorm", "Thunderstorm", "⚡", 0.6, 0.9, 0.1, "water", 5, "lightning", ~s({"lightning":20,"water":10}), "thunderstorm", "thunder_loop", 10, 40, 7}
    ]

    Enum.each(defaults, fn {key, name, icon, vis, spd, surf_ch, surf_t, dmg, dmg_t, elem, visual, sound, dur_min, dur_max, weight} ->
      Repo.query(
        """
        INSERT IGNORE INTO #{@defs_table}
          (`key`, name, icon, vision_mult, speed_mult, surface_chance, surface_type,
           damage_per_turn, damage_type, element_bonus_json, visual, sound_loop,
           duration_range_min, duration_range_max, weight)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [key, name, icon, vis, spd, surf_ch, surf_t, dmg, dmg_t, elem, visual, sound, dur_min, dur_max, weight]
      )
    end)
  end

  # ── Public API ─────────────────────────────────────────────────

  @doc "Set the weather on a map. Broadcasts to subscribers."
  def set_weather(map_id, weather_key) when is_binary(weather_key) do
    ensure_tables()

    case load_weather_def(weather_key) do
      nil ->
        {:error, :unknown_weather}

      def_data ->
        duration = Enum.random(def_data.duration_range_min..def_data.duration_range_max)

        state = %{
          key: weather_key,
          name: def_data.name,
          icon: def_data.icon,
          started_at: System.monotonic_time(:second),
          duration_ticks: duration,
          ticks_elapsed: 0
        }

        init_ets()
        :ets.insert(@weather_ets, {map_id, state})

        broadcast_weather_change(map_id, state)
        Logger.info("[Weather] map #{map_id} weather set to #{weather_key} (duration=#{duration})")
        {:ok, state}
    end
  end

  @doc "Get the current weather on a map. Returns the weather state or :clear default."
  def get_weather(map_id) do
    init_ets()

    case :ets.lookup(@weather_ets, map_id) do
      [{^map_id, state}] -> state
      [] -> %{key: "clear", name: "Clear Sky", icon: "☀️", ticks_elapsed: 0, duration_ticks: 999}
    end
  end

  @doc """
  Advance the weather timer by one tick. If the current weather expires,
  randomly selects new weather. Returns the current weather state.
  """
  def tick_weather(map_id) do
    ensure_tables()
    state = get_weather(map_id)
    new_ticks = state.ticks_elapsed + 1

    if new_ticks >= state.duration_ticks do
      # Weather expired, pick new weather
      new_key = pick_random_weather(nil)
      set_weather(map_id, new_key)
    else
      updated = %{state | ticks_elapsed: new_ticks}
      init_ets()
      :ets.insert(@weather_ets, {map_id, updated})
      updated
    end
  end

  @doc """
  Pick weather appropriate to a biome. Biomes influence the weight distribution.

    * `:desert` — favors sandstorm, clear; no snow/blizzard
    * `:arctic` — favors snow, blizzard; no sandstorm
    * `:tropical` — favors rain, heavy_rain, thunderstorm
    * `:temperate` — balanced weights
    * `nil` — use default weights
  """
  def random_weather(map_id, region_biome \\ nil) do
    ensure_tables()
    key = pick_random_weather(region_biome)
    set_weather(map_id, key)
  end

  @doc """
  Get the gameplay modifier bundle for a weather key.
  Used by battle/movement systems to apply weather effects.
  """
  def get_effects(weather_key) when is_binary(weather_key) do
    ensure_tables()

    case load_weather_def(weather_key) do
      nil ->
        %{vision_mult: 1.0, speed_mult: 1.0, surface_chance: 0.0, surface_type: nil,
          damage_per_turn: 0, damage_type: nil, element_bonuses: %{}}

      def_data ->
        %{
          vision_mult: def_data.vision_mult,
          speed_mult: def_data.speed_mult,
          surface_chance: def_data.surface_chance,
          surface_type: def_data.surface_type,
          damage_per_turn: def_data.damage_per_turn,
          damage_type: def_data.damage_type,
          element_bonuses: def_data.element_bonuses
        }
    end
  end

  @doc "List all weather definitions."
  def list_weather_defs do
    ensure_tables()

    case Repo.query(
           "SELECT `key`, name, icon, vision_mult, speed_mult, damage_per_turn, duration_range_min, duration_range_max, enabled FROM #{@defs_table} ORDER BY name"
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [key, name, icon, vis, spd, dmg, dur_min, dur_max, enabled] ->
          %{key: key, name: name, icon: icon, vision_mult: vis, speed_mult: spd,
            damage_per_turn: dmg, duration_range_min: dur_min, duration_range_max: dur_max,
            enabled: enabled == 1}
        end)

      _ ->
        []
    end
  end

  # ── Internal ───────────────────────────────────────────────────

  defp load_weather_def(key) do
    case Repo.query(
           """
           SELECT `key`, name, icon, vision_mult, speed_mult, surface_chance, surface_type,
                  damage_per_turn, damage_type, element_bonus_json, visual, sound_loop,
                  duration_range_min, duration_range_max, weight
           FROM #{@defs_table} WHERE `key` = ? AND enabled = 1
           """,
           [key]
         ) do
      {:ok, %{rows: [[k, name, icon, vis, spd, surf_ch, surf_t, dmg, dmg_t, elem_json, visual, sound, dur_min, dur_max, weight]]}} ->
        %{
          key: k, name: name, icon: icon,
          vision_mult: vis || 1.0, speed_mult: spd || 1.0,
          surface_chance: surf_ch || 0.0, surface_type: surf_t,
          damage_per_turn: dmg || 0, damage_type: dmg_t,
          element_bonuses: decode_json(elem_json, %{}),
          visual: visual, sound_loop: sound,
          duration_range_min: dur_min || 30, duration_range_max: dur_max || 120,
          weight: weight || 10
        }

      _ ->
        nil
    end
  end

  defp pick_random_weather(biome) do
    case Repo.query("SELECT `key`, weight FROM #{@defs_table} WHERE enabled = 1") do
      {:ok, %{rows: rows}} when rows != [] ->
        weighted =
          rows
          |> Enum.map(fn [key, weight] -> {key, adjust_weight(key, weight || 10, biome)} end)
          |> Enum.filter(fn {_, w} -> w > 0 end)

        total = Enum.reduce(weighted, 0, fn {_, w}, acc -> acc + w end)

        if total <= 0 do
          "clear"
        else
          roll = :rand.uniform(total)
          pick_from_weighted(weighted, roll)
        end

      _ ->
        "clear"
    end
  end

  defp adjust_weight(_key, base_weight, nil), do: base_weight

  defp adjust_weight(key, base_weight, biome) do
    case {biome, key} do
      {:desert, "snow"} -> 0
      {:desert, "blizzard"} -> 0
      {:desert, "sandstorm"} -> base_weight * 3
      {:desert, "clear"} -> base_weight * 2
      {:arctic, "sandstorm"} -> 0
      {:arctic, "snow"} -> base_weight * 3
      {:arctic, "blizzard"} -> base_weight * 2
      {:arctic, "clear"} -> div(base_weight, 2)
      {:tropical, "rain"} -> base_weight * 2
      {:tropical, "heavy_rain"} -> base_weight * 2
      {:tropical, "thunderstorm"} -> base_weight * 2
      {:tropical, "snow"} -> 0
      {:tropical, "blizzard"} -> 0
      _ -> base_weight
    end
  end

  defp pick_from_weighted([], _), do: "clear"

  defp pick_from_weighted([{key, weight} | rest], roll) do
    if roll <= weight do
      key
    else
      pick_from_weighted(rest, roll - weight)
    end
  end

  defp broadcast_weather_change(map_id, state) do
    Phoenix.PubSub.broadcast(
      TePhoenix.PubSub,
      "weather:map:#{map_id}",
      {:weather_changed, map_id, state}
    )
  rescue
    _ -> :ok
  end

  defp decode_json(nil, default), do: default
  defp decode_json("", default), do: default

  defp decode_json(json, default) when is_binary(json) do
    case Jason.decode(json) do
      {:ok, data} -> data
      _ -> default
    end
  end

  defp decode_json(_, default), do: default
end
