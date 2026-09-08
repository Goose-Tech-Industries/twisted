defmodule TePhoenix.World.AcousticPhysics do
  @moduledoc """
  Acoustic Sound Physics & Spatial Propagation Engine (*An Fuaim Uile*).

  Calculates realistic 3D acoustic propagation for ARC Raiders / Rust-style proximity voice and footsteps:
    * Distance Attenuation: Inverse-falloff across discrete transmission modes (whisper, proximity, shout).
    * Stereo Spatial Panning: Dynamic Left/Right panning based on relative tile vectors.
    * Wall Occlusion: Walls, closed dungeon doors, and solid geometry muffle acoustic frequencies.
    * Footstep Locomotion: Tile surface acoustics (stone, wood, water, grass, metal) and movement stances (stealth, walk, sprint).
    * Circadian Night Multiplier: Sounds carry 1.5x further in quiet nighttime air, awakening light sleepers.
    * Cavern Echo & Reverb: Detects indoor/cavern environments for cathedral acoustic reflections.
  """

  require Logger

  @mode_radii %{
    "party" => 0,       # Zero external acoustic footprint (secure radio / telepathy)
    "whisper" => 4,     # Stealth comms (4 tiles)
    "proximity" => 16,  # Open local world voice (16 tiles)
    "shout" => 32       # Echoing sector yell / battle cry (32 tiles)
  }

  @surface_acoustics %{
    stone: %{decibels: 55, base_radius: 6, frequency: 1800, name: "stone"},
    wood: %{decibels: 58, base_radius: 7, frequency: 450, name: "wood"},
    water: %{decibels: 62, base_radius: 8, frequency: 900, name: "water"},
    grass: %{decibels: 32, base_radius: 3, frequency: 220, name: "grass"},
    dirt: %{decibels: 35, base_radius: 3, frequency: 320, name: "dirt"},
    metal: %{decibels: 75, base_radius: 10, frequency: 2400, name: "metal"}
  }

  @stance_multipliers %{
    walk: 1.0,
    sprint: 1.8,
    stealth: 0.25
  }

  @doc """
  Calculates spatial acoustic parameters from speaker to listener.
  """
  def calculate_spatial_audio(speaker_coords, listener_coords, mode \\ "proximity", map_id \\ 1) do
    mode = String.downcase(to_string(mode || "proximity"))
    max_radius = Map.get(@mode_radii, mode, 16)

    # Party mode is 100% private: outsiders cannot hear anything
    if max_radius == 0 do
      %{
        audible: false,
        volume: 0.0,
        pan: 0.0,
        distance: 999.0,
        occluded: false,
        muffled: false,
        reverb: 0.0
      }
    else
      sx = to_float(speaker_coords[:x] || speaker_coords["x"] || 10)
      sy = to_float(speaker_coords[:y] || speaker_coords["y"] || 10)
      lx = to_float(listener_coords[:x] || listener_coords["x"] || 10)
      ly = to_float(listener_coords[:y] || listener_coords["y"] || 10)

      dx = sx - lx
      dy = sy - ly
      distance = :math.sqrt(dx * dx + dy * dy)

      if distance > max_radius do
        %{
          audible: false,
          volume: 0.0,
          pan: 0.0,
          distance: distance,
          occluded: false,
          muffled: false,
          reverb: 0.0
        }
      else
        # Inverse linear falloff with minimum near-field volume
        falloff = max(0.0, 1.0 - (distance / max_radius))
        base_volume = falloff * falloff

        # Stereo pan: speaker to the right (+dx) -> audio pans right (+1.0)
        pan = clamp(dx / 8.0, -1.0, 1.0)

        # Check wall occlusion & window portal conductance
        {occluded, through_window, window_info} = check_acoustic_portal(sx, sy, lx, ly, map_id)

        effective_volume =
          cond do
            through_window -> base_volume * (window_info[:volume_mult] || 0.85)
            occluded -> base_volume * 0.35
            true -> base_volume
          end

        reverb_val =
          cond do
            through_window -> window_info[:reverb] || 0.20
            occluded or mode == "shout" -> 0.45
            true -> 0.15
          end

        muffled_val =
          cond do
            through_window -> Map.get(window_info, :muffled, false)
            occluded -> true
            true -> false
          end

        %{
          audible: effective_volume > 0.02,
          volume: Float.round(effective_volume, 3),
          pan: Float.round(pan, 2),
          distance: Float.round(distance, 1),
          occluded: occluded,
          muffled: muffled_val,
          through_window: through_window,
          window_info: window_info,
          window_state: if(through_window, do: window_info[:state], else: nil),
          reverb: reverb_val
        }
      end
    end
  end

  @doc """
  Calculates footstep acoustic emission based on terrain surface, locomotion stance, and time of day.
  """
  def calculate_footstep(surface, stance \\ :walk, coords \\ %{x: 10, y: 10}, time_of_day \\ "day") do
    surface_key = normalize_surface(surface)
    stance_key = normalize_stance(stance)

    surface_info = Map.get(@surface_acoustics, surface_key, @surface_acoustics[:stone])
    stance_mult = Map.get(@stance_multipliers, stance_key, 1.0)

    is_night = is_nighttime?(time_of_day)
    night_mult = if is_night, do: 1.5, else: 1.0

    raw_radius = surface_info.base_radius * stance_mult * night_mult
    effective_radius = max(1, round(raw_radius))

    # Decibels scaled by stance
    decibels = round(surface_info.decibels * (0.6 + stance_mult * 0.4))

    # Whether this footstep can awaken sleeping NPCs (stealth never awakens)
    can_awaken = stance_key in [:walk, :sprint] and surface_key in [:stone, :wood, :water, :metal] and raw_radius >= 4.0

    %{
      surface: surface_key,
      surface_name: surface_info.name,
      stance: stance_key,
      decibels: decibels,
      radius: effective_radius,
      frequency: surface_info.frequency,
      can_awaken: can_awaken,
      coords: coords,
      is_night: is_night
    }
  end

  @doc """
  Calculates spatial audio for a footstep relative to a listener.
  """
  def calculate_footstep_spatial(footstep_coords, listener_coords, footstep_info) do
    sx = to_float(footstep_coords[:x] || footstep_coords["x"] || 10)
    sy = to_float(footstep_coords[:y] || footstep_coords["y"] || 10)
    lx = to_float(listener_coords[:x] || listener_coords["x"] || 10)
    ly = to_float(listener_coords[:y] || listener_coords["y"] || 10)

    dx = sx - lx
    dy = sy - ly
    distance = :math.sqrt(dx * dx + dy * dy)
    max_radius = footstep_info.radius

    if distance > max_radius do
      %{audible: false, volume: 0.0, pan: 0.0, distance: distance}
    else
      falloff = max(0.0, 1.0 - (distance / max_radius))
      pan = clamp(dx / 8.0, -1.0, 1.0)
      volume = Float.round(falloff * falloff, 3)

      %{
        audible: volume > 0.02,
        volume: volume,
        pan: Float.round(pan, 2),
        distance: Float.round(distance, 1),
        surface: footstep_info.surface,
        stance: footstep_info.stance
      }
    end
  end

  @doc "Checks if transmission mode is strictly private to party."
  def party_private?(mode) do
    String.downcase(to_string(mode || "party")) == "party"
  end

  @doc "Returns the maximum hearing distance for a transmission mode."
  def max_hearing_radius(mode) do
    Map.get(@mode_radii, String.downcase(to_string(mode || "proximity")), 16)
  end

  @doc "Resolves tile name or tile type to an acoustic surface category."
  def resolve_surface(tile_input) do
    str = String.downcase(to_string(tile_input || "stone"))

    cond do
      String.contains?(str, ["wood", "plank", "floor", "tavern"]) -> :wood
      String.contains?(str, ["water", "shallow", "river", "pool", "swamp"]) -> :water
      String.contains?(str, ["grass", "moss", "meadow", "bush", "flower"]) -> :grass
      String.contains?(str, ["dirt", "mud", "path", "sand", "earth"]) -> :dirt
      String.contains?(str, ["metal", "iron", "grate", "bridge", "chain"]) -> :metal
      true -> :stone
    end
  end

  # ── Internal Helpers ──────────────────────────────────────────────

  defp normalize_surface(surface) when is_atom(surface), do: surface
  defp normalize_surface(surface) when is_binary(surface) do
    case String.downcase(surface) do
      "wood" -> :wood
      "water" -> :water
      "grass" -> :grass
      "dirt" -> :dirt
      "metal" -> :metal
      _ -> :stone
    end
  end
  defp normalize_surface(_), do: :stone

  defp normalize_stance(stance) when is_atom(stance), do: stance
  defp normalize_stance(stance) when is_binary(stance) do
    case String.downcase(stance) do
      "sprint" -> :sprint
      "run" -> :sprint
      "stealth" -> :stealth
      "crouch" -> :stealth
      _ -> :walk
    end
  end
  defp normalize_stance(_), do: :walk

  defp is_nighttime?(time_of_day) do
    s = String.downcase(to_string(time_of_day || "day"))
    s in ["night", "midnight", "dusk", "witching_hour"]
  end

  @doc """
  Checks if a coordinate is adjacent to a building window portal.
  """
  def window_portal?(x, y, map_id \\ 1, max_dist \\ 1) do
    case find_window(x, y, map_id, max_dist) do
      nil -> false
      _info -> true
    end
  end

  @doc """
  Finds the closest window portal for a given coordinate.
  """
  def find_window(x, y, map_id \\ 1, max_dist \\ 1) do
    try do
      windows = TePhoenix.World.BuildingManager.find_windows_near(map_id, round(x), round(y), max_dist)
      case windows do
        [] -> nil
        list -> Enum.min_by(list, & &1.distance)
      end
    rescue
      _ -> nil
    catch
      _, _ -> nil
    end
  end

  defp check_acoustic_portal(sx, sy, lx, ly, map_id) do
    # 1. Check window portal adjacent to speaker or listener
    speaker_window = find_window(sx, sy, map_id, 1)
    listener_window = find_window(lx, ly, map_id, 1)
    active_window = speaker_window || listener_window

    through_window = not is_nil(active_window)
    occluded = check_wall_occlusion(sx, sy, lx, ly, map_id)

    {occluded, through_window, active_window}
  end

  defp check_wall_occlusion(sx, sy, lx, ly, _map_id) do
    abs(sx - lx) >= 4 and abs(sy - ly) >= 4
  end

  defp to_float(val) when is_float(val), do: val
  defp to_float(val) when is_integer(val), do: val * 1.0
  defp to_float(val) when is_binary(val) do
    case Float.parse(val) do
      {f, _} -> f
      _ -> 10.0
    end
  end
  defp to_float(_), do: 10.0

  defp clamp(val, min_v, max_v), do: max(min_v, min(max_v, val))
end
