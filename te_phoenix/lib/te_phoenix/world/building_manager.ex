defmodule TePhoenix.World.BuildingManager do
  @moduledoc """
  Building Structures & Nested Interior Sub-Map Engine (*Bainisteoir Foirgneamh*).

  Manages multi-structure town architecture:
    * Exterior building footprints with door portals and window apertures.
    * Nested interior sub-maps: entering a tavern, shop, or cottage transitions
      the player into an interior sub-map without breaking immersion.
    * Window portals: connects exterior positions to interior rooms, allowing
      sound to bleed through glass/open shutters.
    * Circadian lock states: doors lock at night when diurnal townspeople sleep.
  """

  alias TePhoenix.Repo
  alias TePhoenix.World.CircadianClock
  require Logger

  @doc """
  Ensures the `game_buildings` database schema exists.
  """
  def ensure_schema! do
    Repo.query!("""
    CREATE TABLE IF NOT EXISTS game_buildings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      map_id INT NOT NULL,
      building_key VARCHAR(64) NOT NULL,
      name VARCHAR(128) NOT NULL,
      building_type VARCHAR(32) NOT NULL DEFAULT 'house',
      exterior_door_x INT NOT NULL,
      exterior_door_y INT NOT NULL,
      interior_map_id INT NOT NULL,
      interior_door_x INT NOT NULL DEFAULT 5,
      interior_door_y INT NOT NULL DEFAULT 8,
      windows_json LONGTEXT,
      is_locked TINYINT(1) NOT NULL DEFAULT 0,
      lock_difficulty INT NOT NULL DEFAULT 12,
      owner_npc_id INT NULL,
      description TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_map_building_key (map_id, building_key),
      INDEX idx_map_doors (map_id, exterior_door_x, exterior_door_y),
      INDEX idx_interior_map (interior_map_id)
    )
    """)
    :ok
  end

  @doc """
  Returns all buildings registered on a given exterior map.
  """
  def list_buildings_for_map(map_id) do
    ensure_schema!()

    case Repo.query(
           "SELECT id, map_id, building_key, name, building_type, exterior_door_x, exterior_door_y, interior_map_id, interior_door_x, interior_door_y, windows_json, is_locked, lock_difficulty, owner_npc_id, description FROM game_buildings WHERE map_id = ?",
           [map_id]
         ) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row ->
          b = Enum.zip(cols, row) |> Map.new()
          parse_building_row(b)
        end)

      _ ->
        []
    end
  end

  @doc """
  Retrieves a building by ID or building_key on a map.
  """
  def get_building(map_id, building_key) when is_binary(building_key) do
    ensure_schema!()

    case Repo.query(
           "SELECT id, map_id, building_key, name, building_type, exterior_door_x, exterior_door_y, interior_map_id, interior_door_x, interior_door_y, windows_json, is_locked, lock_difficulty, owner_npc_id, description FROM game_buildings WHERE map_id = ? AND building_key = ? LIMIT 1",
           [map_id, building_key]
         ) do
      {:ok, %{rows: [row], columns: cols}} ->
        Enum.zip(cols, row) |> Map.new() |> parse_building_row()

      _ ->
        nil
    end
  end

  def get_building(building_id) when is_integer(building_id) do
    ensure_schema!()

    case Repo.query(
           "SELECT id, map_id, building_key, name, building_type, exterior_door_x, exterior_door_y, interior_map_id, interior_door_x, interior_door_y, windows_json, is_locked, lock_difficulty, owner_npc_id, description FROM game_buildings WHERE id = ? LIMIT 1",
           [building_id]
         ) do
      {:ok, %{rows: [row], columns: cols}} ->
        Enum.zip(cols, row) |> Map.new() |> parse_building_row()

      _ ->
        nil
    end
  end

  def get_building(building_key) when is_binary(building_key) do
    get_building(1, building_key)
  end

  @doc """
  Finds a building matching an exterior or interior door at {x, y}.
  Returns `{:exterior_door, building}` or `{:interior_door, building}` or nil.
  """
  def get_building_at_door(map_id, x, y) do
    ensure_schema!()

    # 1. Check if standing at an exterior door
    case Repo.query(
           "SELECT id, map_id, building_key, name, building_type, exterior_door_x, exterior_door_y, interior_map_id, interior_door_x, interior_door_y, windows_json, is_locked, lock_difficulty, owner_npc_id, description FROM game_buildings WHERE map_id = ? AND exterior_door_x = ? AND exterior_door_y = ? LIMIT 1",
           [map_id, x, y]
         ) do
      {:ok, %{rows: [row], columns: cols}} ->
        building = Enum.zip(cols, row) |> Map.new() |> parse_building_row()
        {:exterior_door, building}

      _ ->
        # 2. Check if standing at an interior exit door
        case Repo.query(
               "SELECT id, map_id, building_key, name, building_type, exterior_door_x, exterior_door_y, interior_map_id, interior_door_x, interior_door_y, windows_json, is_locked, lock_difficulty, owner_npc_id, description FROM game_buildings WHERE interior_map_id = ? AND interior_door_x = ? AND interior_door_y = ? LIMIT 1",
               [map_id, x, y]
             ) do
          {:ok, %{rows: [row], columns: cols}} ->
            building = Enum.zip(cols, row) |> Map.new() |> parse_building_row()
            {:interior_door, building}

          _ ->
            nil
        end
    end
  end

  @window_acoustics %{
    "open" => %{volume_mult: 0.95, reverb: 0.05, muffled: false, can_climb: true, can_peek: true, label: "Wide Open"},
    "broken" => %{volume_mult: 1.00, reverb: 0.05, muffled: false, can_climb: true, can_peek: true, label: "Shattered Glass"},
    "cracked" => %{volume_mult: 0.75, reverb: 0.15, muffled: false, can_climb: false, can_peek: true, label: "Cracked Ajar"},
    "closed" => %{volume_mult: 0.35, reverb: 0.40, muffled: true, can_climb: false, can_peek: true, label: "Glass Pane Closed"},
    "shuttered" => %{volume_mult: 0.15, reverb: 0.60, muffled: true, can_climb: false, can_peek: false, label: "Heavy Wooden Shutter"}
  }

  @doc """
  Returns the acoustic properties for a window state.
  """
  def window_acoustics(state) do
    Map.get(@window_acoustics, state, @window_acoustics["closed"])
  end

  @doc """
  Finds all window portals near a coordinate on a map.
  Returns list of decorated window maps including acoustic properties.
  """
  def find_windows_near(map_id, x, y, max_dist \\ 1) do
    buildings = list_buildings_for_map(map_id)

    Enum.flat_map(buildings, fn b ->
      Enum.reduce(b.windows, [], fn win, acc ->
        wx = win["x"] || win[:x] || 0
        wy = win["y"] || win[:y] || 0
        state = win["state"] || win[:state] || "closed"
        latch = win["latch_locked"] || win[:latch_locked] || false
        dx = abs(wx - x)
        dy = abs(wy - y)
        dist = max(dx, dy)

        if dist <= max_dist do
          spec = window_acoustics(state)

          {vol_mult, muffled, can_climb, can_peek, label, iron_bars} =
            try do
              case Repo.query("SELECT fortifications_json, curtains_drawn FROM game_properties WHERE building_id = ? LIMIT 1", [b.id]) do
                {:ok, %{rows: [[f_json, curtains]]}} when curtains == 1 ->
                  {0.02, true, false, false, "Velvet Soundproof Curtains Sealed", String.contains?(to_string(f_json), "iron_window_bars")}
                {:ok, %{rows: [[f_json, _]]}} ->
                  bars = String.contains?(to_string(f_json), "iron_window_bars")
                  {spec.volume_mult, spec.muffled, (if bars, do: false, else: spec.can_climb), spec.can_peek, (if bars, do: "#{spec.label} (Iron Bars)", else: spec.label), bars}
                _ ->
                  {spec.volume_mult, spec.muffled, spec.can_climb, spec.can_peek, spec.label, false}
              end
            rescue
              _ -> {spec.volume_mult, spec.muffled, spec.can_climb, spec.can_peek, spec.label, false}
            end

          [
            %{
              building_id: b.id,
              building_key: b.building_key,
              building_name: b.name,
              building_type: b.building_type,
              interior_map_id: b.interior_map_id,
              interior_door_x: b.interior_door_x,
              interior_door_y: b.interior_door_y,
              window_x: wx,
              window_y: wy,
              facing: win["facing"] || win[:facing] || "south",
              state: state,
              latch_locked: latch,
              volume_mult: vol_mult,
              reverb: spec.reverb,
              muffled: muffled,
              can_climb: can_climb,
              can_peek: can_peek,
              label: label,
              iron_bars: iron_bars,
              distance: dist
            }
            | acc
          ]
        else
          acc
        end
      end)
    end)
  end

  @doc """
  Finds the specific window matching or adjacent to {x, y}.
  """
  def get_window_at(map_id, x, y, max_dist \\ 1) do
    case find_windows_near(map_id, x, y, max_dist) do
      [] -> nil
      windows -> Enum.min_by(windows, & &1.distance)
    end
  end

  @doc """
  Updates the persistent state of a window ('open', 'cracked', 'closed', 'shuttered', 'broken').
  Broadcasts state change to both exterior and interior map channels.
  """
  def set_window_state(map_id, building_id_or_key, window_x, window_y, new_state) do
    ensure_schema!()

    building =
      cond do
        is_integer(building_id_or_key) -> get_building(building_id_or_key)
        is_binary(building_id_or_key) -> get_building(map_id, building_id_or_key)
        true -> nil
      end

    if is_nil(building) do
      {:error, :building_not_found}
    else
      updated_windows =
        Enum.map(building.windows, fn win ->
          wx = win["x"] || win[:x]
          wy = win["y"] || win[:y]

          if wx == window_x and wy == window_y do
            Map.put(win, "state", new_state)
          else
            win
          end
        end)

      json = Jason.encode!(updated_windows)

      Repo.query!(
        "UPDATE game_buildings SET windows_json = ? WHERE id = ?",
        [json, building.id]
      )

      spec = window_acoustics(new_state)

      payload = %{
        building_id: building.id,
        building_key: building.building_key,
        building_name: building.name,
        window_x: window_x,
        window_y: window_y,
        state: new_state,
        volume_mult: spec.volume_mult,
        reverb: spec.reverb,
        muffled: spec.muffled,
        label: spec.label,
        can_climb: spec.can_climb,
        can_peek: spec.can_peek,
        timestamp: System.system_time(:second)
      }

      TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "window_state_changed", payload)
      TePhoenixWeb.Endpoint.broadcast("map:#{building.interior_map_id}", "window_state_changed", payload)
      TePhoenixWeb.Endpoint.broadcast("voice:proximity:#{map_id}", "window_state_changed", payload)

      {:ok, payload}
    end
  end

  @doc """
  Toggles a window between open, cracked, closed, or shuttered.
  Performs an Agility stealth check to determine if rusty hinges screech.
  """
  def toggle_window(player, map_id, window_x, window_y, target_state \\ nil) do
    window = get_window_at(map_id, window_x, window_y, 1)

    if is_nil(window) do
      {:error, "No window within reach."}
    else
      current_state = window.state

      next_state =
        if target_state && target_state != "" do
          target_state
        else
          case current_state do
            "closed" -> "open"
            "open" -> "closed"
            "shuttered" -> "cracked"
            "cracked" -> "open"
            "broken" -> "broken"
            _ -> "open"
          end
        end

      # Stealth Agility check for silent operation
      agi = player[:agi] || player["agi"] || 10
      agi_mod = div(agi - 10, 2)
      d20 = :rand.uniform(20)
      total_roll = d20 + agi_mod
      dc = if current_state == "shuttered" or next_state == "shuttered", do: 13, else: 10
      is_silent = total_roll >= dc

      actor_name = player[:name] || player["name"] || "You"

      message =
        cond do
          next_state == "broken" ->
            "The window glass is shattered and jagged."

          is_silent and next_state in ["open", "cracked"] ->
            "With nimble fingertips, #{actor_name} silently slid the window #{next_state}."

          is_silent and next_state in ["closed", "shuttered"] ->
            "With careful precision, #{actor_name} drew the window #{next_state} without a sound."

          not is_silent ->
            "CREAAAK! The rusty iron hinges of the window groaned loudly as the sash moved!"
        end

      # If noisy, emit acoustic event that alerts NPCs and players
      if not is_silent do
        TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "window_noise", %{
          window_x: window_x,
          window_y: window_y,
          decibels: 48,
          radius: 6,
          sound: "creaking_hinge",
          description: "A rusty window hinge creaked loudly at {#{window_x}, #{window_y}}!",
          timestamp: System.system_time(:second)
        })

        TePhoenixWeb.Endpoint.broadcast("map:#{window.interior_map_id}", "window_noise", %{
          window_x: window_x,
          window_y: window_y,
          decibels: 48,
          radius: 6,
          sound: "creaking_hinge",
          description: "A window sash creaked loudly from the street!",
          timestamp: System.system_time(:second)
        })
      end

      set_window_state(map_id, window.building_id, window_x, window_y, next_state)

      {:ok,
       %{
         success: true,
         state: next_state,
         previous_state: current_state,
         silent: is_silent,
         roll: d20,
         total_roll: total_roll,
         dc: dc,
         window_x: window_x,
         window_y: window_y,
         building_name: window.building_name,
         message: message
       }}
    end
  end

  @doc """
  Peeks through a window to survey interior room occupants and atmosphere.
  """
  def peek_window(_player, map_id, window_x, window_y) do
    window = get_window_at(map_id, window_x, window_y, 1)

    if is_nil(window) do
      {:error, "No window within reach."}
    else
      if window.state == "shuttered" do
        %{
          can_see: false,
          state: "shuttered",
          building_name: window.building_name,
          message: "The heavy wooden shutters are tightly bolted from within. You cannot see through."
        }
      else
        occupants =
          case Repo.query(
                 "SELECT id, name, role, icon, is_sleeping, hp, max_hp, description FROM game_npcs WHERE map_id = ? AND is_active = 1",
                 [window.interior_map_id]
               ) do
            {:ok, %{rows: rows, columns: cols}} ->
              Enum.map(rows, fn r ->
                npc = Enum.zip(cols, r) |> Map.new()

                activity =
                  cond do
                    npc["is_sleeping"] == 1 -> "Sleeping soundly"
                    npc["role"] in ["bard", "minstrel"] -> "Tuning lute by the hearth"
                    npc["role"] in ["merchant", "apothecary"] -> "Inspecting medicine bottles"
                    npc["role"] in ["priest", "acolyte"] -> "Praying at the stone altar"
                    npc["role"] in ["drunk", "brawler"] -> "Slumped over an empty tankard"
                    true -> "Standing watch"
                  end

                %{
                  id: npc["id"],
                  name: npc["name"],
                  role: npc["role"],
                  icon: npc["icon"] || "👤",
                  is_sleeping: npc["is_sleeping"] == 1,
                  activity: activity
                }
              end)

            _ ->
              []
          end

        clarity = if window.state == "closed", do: :distorted, else: :clear

        message =
          if window.state == "closed" do
            "Peering through the wavy glass pane of #{window.building_name}, you make out #{length(occupants)} figure(s) inside through the dim candle-glow."
          else
            "Looking through the #{window.state} window into #{window.building_name}, you have a crystal-clear view of the interior."
          end

        %{
          can_see: true,
          clarity: clarity,
          building_name: window.building_name,
          building_desc: "Interior room with warm hearth embers and sturdy wooden furniture.",
          state: window.state,
          occupants: occupants,
          message: message
        }
      end
    end
  end

  @doc """
  Climbs through an open or broken window into an interior sub-map.
  Bypasses locked front doors and awards infiltration XP.
  """
  def climb_window(player, map_id, window_x, window_y) do
    window = get_window_at(map_id, window_x, window_y, 1)

    if is_nil(window) do
      {:error, "No window within reach."}
    else
      if window.state not in ["open", "broken"] do
        {:error, "The window is #{window.state}! You cannot climb through until it is opened or broken."}
      else
        target_map = window.interior_map_id
        target_x = window.interior_door_x
        target_y = window.interior_door_y

        char_id = player[:id] || player["id"]

        if char_id do
          TePhoenix.Game.PlayerRegistry.update_coords(char_id, target_map, target_x, target_y)
        end

        damage = if window.state == "broken", do: 2, else: 0

        TePhoenixWeb.Endpoint.broadcast("map:#{target_map}", "player_window_infiltrate", %{
          player_name: player[:name] || player["name"] || "A shadow",
          char_id: char_id,
          x: target_x,
          y: target_y,
          building_name: window.building_name,
          timestamp: System.system_time(:second)
        })

        {:ok,
         %{
           success: true,
           map_id: target_map,
           x: target_x,
           y: target_y,
           damage: damage,
           xp_awarded: 25,
           building_name: window.building_name,
           message: "You hoist yourself up and slip agilely through the #{window.state} window into #{window.building_name}!"
         }}
      end
    end
  end

  @doc """
  Breaks a window, causing loud noise and shattering glass into shards.
  """
  def break_window(player, map_id, window_x, window_y) do
    window = get_window_at(map_id, window_x, window_y, 1)

    if is_nil(window) do
      {:error, "No window within reach."}
    else
      set_window_state(map_id, window.building_id, window_x, window_y, "broken")

      player_name = player[:name] || player["name"] || "A rogue"

      TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "window_noise", %{
        window_x: window_x,
        window_y: window_y,
        decibels: 75,
        radius: 18,
        sound: "glass_shattered",
        description: "CRASH! #{player_name} shattered a window on #{window.building_name}!",
        timestamp: System.system_time(:second)
      })

      try do
        Repo.query("UPDATE game_npcs SET is_sleeping = 0 WHERE map_id = ?", [window.interior_map_id])
      rescue
        _ -> :ok
      end

      {:ok,
       %{
         success: true,
         state: "broken",
         building_name: window.building_name,
         message: "CRASH! You smash the glass to pieces! Shards scatter everywhere as the sound echoes across the street!"
       }}
    end
  end

  @doc """
  Throws a pebble or coin through an open/cracked window to create an interior acoustic distraction.
  """
  def throw_distraction(_player, map_id, window_x, window_y, item \\ "pebble") do
    window = get_window_at(map_id, window_x, window_y, 1)

    if is_nil(window) do
      {:error, "No window within reach."}
    else
      if window.state in ["shuttered"] do
        %{
          success: false,
          state: window.state,
          message: "The #{item} bounces off the heavy wooden shutter with a dull, harmless thud."
        }
      else
        TePhoenixWeb.Endpoint.broadcast("map:#{window.interior_map_id}", "window_distraction_impact", %{
          x: window.interior_door_x,
          y: window.interior_door_y,
          item: item,
          decibels: 40,
          description: "A small #{item} flew through the #{window.state} window and clattered across the floorboards!",
          timestamp: System.system_time(:second)
        })

        %{
          success: true,
          state: window.state,
          building_name: window.building_name,
          message: "You flick a #{item} through the #{window.state} window. A crisp clatter echoes inside #{window.building_name}!"
        }
      end
    end
  end

  @doc """
  Circadian curfew updates: shutters/closes residential and shop windows at night,
  cracks/opens tavern windows by day.
  """
  def apply_circadian_window_curfew(map_id, phase) do
    ensure_schema!()

    buildings = list_buildings_for_map(map_id)

    Enum.each(buildings, fn b ->
      new_windows =
        Enum.map(b.windows, fn win ->
          wx = win["x"] || win[:x]
          wy = win["y"] || win[:y]

          cond do
            phase in ["night", "midnight"] and b.building_type in ["house", "shop"] ->
              Map.put(win, "state", "shuttered")

            phase in ["dawn", "day"] and b.building_type == "tavern" ->
              if wx == 6 and wy == 12, do: Map.put(win, "state", "open"), else: Map.put(win, "state", "cracked")

            true ->
              win
          end
        end)

      Repo.query!(
        "UPDATE game_buildings SET windows_json = ? WHERE id = ?",
        [Jason.encode!(new_windows), b.id]
      )
    end)

    Logger.info("[BuildingManager] Circadian window curfew updated for Map #{map_id} on phase #{phase}.")
  end

  @doc """
  Checks if a building door is locked.
  Accounts for nocturnal closing hours: shops & private homes lock at night unless nocturnal.
  """
  def door_locked?(building, time_of_day \\ nil) do
    if building.is_locked == 1 or building.is_locked == true do
      true
    else
      current_phase = time_of_day || CircadianClock.current_time_of_day(building.map_id)

      case building.building_type do
        "shop" -> CircadianClock.night?(current_phase)
        "house" -> CircadianClock.night?(current_phase)
        "sanctuary" -> current_phase in ["night", "midnight"]
        "tavern" -> current_phase == "midnight"
        "hideout" -> false
        _ -> false
      end
    end
  end

  @doc """
  Registers or seeds default town buildings for Map 1.
  """
  def seed_town_buildings! do
    ensure_schema!()

    buildings = [
      %{
        map_id: 1,
        building_key: "prancing_mare",
        name: "The Prancing Mare Tavern",
        building_type: "tavern",
        exterior_door_x: 7,
        exterior_door_y: 12,
        interior_map_id: 101,
        interior_door_x: 5,
        interior_door_y: 9,
        windows: [
          %{"x" => 6, "y" => 12, "facing" => "south", "state" => "open"},
          %{"x" => 8, "y" => 12, "facing" => "south", "state" => "cracked"},
          %{"x" => 6, "y" => 10, "facing" => "west", "state" => "closed"}
        ],
        is_locked: 0,
        lock_difficulty: 10,
        owner_npc_id: 101,
        description: "Raucous two-story tavern smelling of spiced mead, roasted boar, and peat fire."
      },
      %{
        map_id: 1,
        building_key: "barnaby_shop",
        name: "Barnaby's Apothecary & Provisioner",
        building_type: "shop",
        exterior_door_x: 12,
        exterior_door_y: 13,
        interior_map_id: 102,
        interior_door_x: 4,
        interior_door_y: 7,
        windows: [
          %{"x" => 11, "y" => 13, "facing" => "south", "state" => "closed"},
          %{"x" => 13, "y" => 13, "facing" => "south", "state" => "shuttered"}
        ],
        is_locked: 0,
        lock_difficulty: 15,
        owner_npc_id: 103,
        description: "Cluttered apothecary stocked with bubbling glass alembics, salves, and tempered blades."
      },
      %{
        map_id: 1,
        building_key: "dawn_hearth",
        name: "Sanctuary of the Dawn Hearth",
        building_type: "sanctuary",
        exterior_door_x: 14,
        exterior_door_y: 7,
        interior_map_id: 103,
        interior_door_x: 6,
        interior_door_y: 8,
        windows: [
          %{"x" => 13, "y" => 7, "facing" => "south", "state" => "open"},
          %{"x" => 15, "y" => 7, "facing" => "south", "state" => "closed"}
        ],
        is_locked: 0,
        lock_difficulty: 18,
        owner_npc_id: 102,
        description: "Serene stone temple lined with burning votive candles and restorative herb beds."
      },
      %{
        map_id: 1,
        building_key: "shadow_den",
        name: "Silas's Shadow Den & Smugglers' Cellar",
        building_type: "hideout",
        exterior_door_x: 4,
        exterior_door_y: 17,
        interior_map_id: 104,
        interior_door_x: 3,
        interior_door_y: 6,
        windows: [
          %{"x" => 3, "y" => 17, "facing" => "south", "state" => "shuttered"}
        ],
        is_locked: 0,
        lock_difficulty: 20,
        owner_npc_id: 106,
        description: "Concealed cellar entrance hidden beneath rotten crates, leading into an illicit black market."
      }
    ]

    Enum.each(buildings, fn b ->
      Repo.query!(
        """
        INSERT INTO game_buildings (
          map_id, building_key, name, building_type, exterior_door_x, exterior_door_y,
          interior_map_id, interior_door_x, interior_door_y, windows_json,
          is_locked, lock_difficulty, owner_npc_id, description
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          building_type = VALUES(building_type),
          exterior_door_x = VALUES(exterior_door_x),
          exterior_door_y = VALUES(exterior_door_y),
          interior_map_id = VALUES(interior_map_id),
          interior_door_x = VALUES(interior_door_x),
          interior_door_y = VALUES(interior_door_y),
          windows_json = VALUES(windows_json),
          is_locked = VALUES(is_locked),
          lock_difficulty = VALUES(lock_difficulty),
          owner_npc_id = VALUES(owner_npc_id),
          description = VALUES(description)
        """,
        [
          b.map_id,
          b.building_key,
          b.name,
          b.building_type,
          b.exterior_door_x,
          b.exterior_door_y,
          b.interior_map_id,
          b.interior_door_x,
          b.interior_door_y,
          Jason.encode!(b.windows),
          b.is_locked,
          b.lock_difficulty,
          b.owner_npc_id,
          b.description
        ]
      )
    end)

    Enum.each(buildings, fn b ->
      Repo.query!(
        """
        INSERT INTO game_maps (id, name, description, width, height, render_mode, is_active)
        VALUES (?, ?, ?, 12, 12, 'classic', 1)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          is_active = 1
        """,
        [b.interior_map_id, "#{b.name} (Interior)", b.description]
      )
    end)

    # Seed Olaf the Stumbling Drunkard outside the Prancing Mare tavern at {x: 7, y: 13}
    Repo.query!(
      """
      INSERT INTO game_npcs (id, map_id, name, role, faction, is_enemy, is_hostile, is_nocturnal, is_sleeping, x, y, icon, persona, is_active)
      VALUES (109, 1, 'Olaf the Stumbling Drunkard', 'drunk', 'Civilians', 0, 0, 1, 0, 7, 13, '🍺', 'Belligerent tavern regular swaying outside the Prancing Mare looking for a brawl or free ale.', 1)
      ON DUPLICATE KEY UPDATE
        map_id = 1,
        name = VALUES(name),
        role = 'drunk',
        is_enemy = 0,
        is_hostile = 0,
        x = 7,
        y = 13,
        icon = '🍺',
        persona = VALUES(persona),
        is_active = 1
      """
    )

    TePhoenix.World.UnderworldNpcs.seed_underworld_npcs!(1)
    TePhoenix.World.PropertyManager.seed_default_properties!(1)

    Logger.info("[BuildingManager] Seeded 4 default town buildings, Olaf the Drunk, underworld NPCs, and deed properties onto Map 1.")
    :ok
  end

  # ── Private Helpers ───────────────────────────────────────────────

  defp parse_building_row(row) do
    windows =
      case row["windows_json"] do
        nil -> []
        "" -> []
        json when is_binary(json) ->
          case Jason.decode(json) do
            {:ok, list} when is_list(list) -> list
            _ -> []
          end
        list when is_list(list) -> list
        _ -> []
      end

    %{
      id: row["id"],
      map_id: row["map_id"],
      building_key: row["building_key"],
      name: row["name"],
      building_type: row["building_type"],
      exterior_door_x: row["exterior_door_x"],
      exterior_door_y: row["exterior_door_y"],
      interior_map_id: row["interior_map_id"],
      interior_door_x: row["interior_door_x"],
      interior_door_y: row["interior_door_y"],
      windows: windows,
      is_locked: row["is_locked"] == 1 or row["is_locked"] == true,
      lock_difficulty: row["lock_difficulty"] || 12,
      owner_npc_id: row["owner_npc_id"],
      description: row["description"]
    }
  end
end
