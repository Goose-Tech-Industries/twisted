defmodule TePhoenix.World.Vision do
  @moduledoc """
  Stealth/detection/vision system.

  Every entity (player, NPC, ward, tower) has a vision profile:

      %{
        vision_radius: 5,           # tiles of sight
        vision_type: "circle",      # circle / cone / global
        cone_angle: 90,             # degrees (for cone type)
        cone_direction: "south",    # facing direction
        stealth_level: 0,           # 0 = visible, 1+ = harder to detect
        detection_power: 0,         # can detect stealth_level <= this
        alert_state: "idle",        # idle / suspicious / alert / searching
        noise_radius: 2             # tiles — running/fighting makes noise
      }

  ## How it works

  1. Server computes visibility per player each tick:
     - For each other entity on the map, check if they're within the
       player's vision_radius AND not stealthed above detection power.
     - Stealthed entities are invisible unless the viewer's
       detection_power >= the entity's stealth_level.
     - Cone vision: entity must be within the angle arc.

  2. The server ONLY sends entity data for visible entities to each
     client. This prevents maphacking — the client literally doesn't
     have position data for hidden entities.

  3. Alert states (for AI NPCs):
     - `idle` → NPC hasn't seen anything unusual
     - `suspicious` → noise detected, NPC investigates
     - `alert` → enemy spotted, NPC engages
     - `searching` → lost sight of enemy, searching last known position

  4. Stealth mechanics:
     - Entering stealth: action or ability sets stealth_level > 0
     - Breaking stealth: attacking, taking damage, or entering a
       detection zone (ward, tower range)
     - Partial detection: noise from running/combat alerts nearby NPCs
       without revealing the player's exact position

  ## Integration

    * `MapChannel` — filter entity broadcasts through vision check
    * `Objectives` — towers/wards provide detection zones
    * `Battle` — stealth_active combatant field already exists
    * `Fog of war` — capability already exists, this replaces the simple
      radius-only model with per-entity vision profiles
    * `Triggers` — fires "entity_spotted" / "entity_lost" events

  ## Game modes this enables

    * DBD: killer has narrow cone vision, survivors have circle
    * MOBA: brush = stealth zones, wards = detection zones
    * RTS: fog of war per unit with different vision radii
    * Stealth RPG: sneak past guards, noise alerts, detection cones
    * Horror: limited vision, flashlight = narrow cone
  """

  @doc """
  Check if `viewer` can see `target` given their vision profiles.
  Returns `{:visible, reason}` or `{:hidden, reason}`.
  """
  def can_see?(viewer, target) do
    vr = viewer[:vision_radius] || 5
    vt = viewer[:vision_type] || "circle"
    det = viewer[:detection_power] || 0
    stealth = target[:stealth_level] || 0

    dx = (target[:x] || target[:grid_x] || 0) - (viewer[:x] || viewer[:grid_x] || 0)
    dy = (target[:y] || target[:grid_y] || 0) - (viewer[:y] || viewer[:grid_y] || 0)
    dist = :math.sqrt(dx * dx + dy * dy)

    cond do
      # Global vision sees everything
      vt == "global" and stealth <= det ->
        {:visible, :global}

      # Out of range
      dist > vr ->
        {:hidden, :out_of_range}

      # Stealthed beyond detection power
      stealth > 0 and stealth > det ->
        {:hidden, :stealth}

      # Cone vision angle check
      vt == "cone" ->
        angle = viewer[:cone_angle] || 90
        direction = viewer[:cone_direction] || "south"

        if in_cone?(dx, dy, direction, angle) do
          {:visible, :cone}
        else
          {:hidden, :outside_cone}
        end

      # Circle vision — in range and not stealthed
      true ->
        {:visible, :circle}
    end
  end

  @doc """
  Filter a list of entities to only those visible to the viewer.
  Returns the visible subset.
  """
  def filter_visible(viewer, entities) do
    Enum.filter(entities, fn entity ->
      case can_see?(viewer, entity) do
        {:visible, _} -> true
        _ -> false
      end
    end)
  end

  @doc """
  Compute the full visibility map for a viewer against all entities.
  Returns `%{entity_id => :visible | :hidden}`.
  """
  def compute_visibility(viewer, entities) do
    Map.new(entities, fn {id, entity} ->
      {visible?, _reason} = can_see?(viewer, entity)
      {id, visible?}
    end)
  end

  @doc """
  Check if a position is within a detection zone (ward, tower).
  Detection zones override stealth within their radius.
  """
  def in_detection_zone?(x, y, zones) do
    Enum.any?(zones, fn zone ->
      dx = x - zone.x
      dy = y - zone.y
      dist = :math.sqrt(dx * dx + dy * dy)
      dist <= (zone.detection_radius || 3)
    end)
  end

  @doc """
  Calculate noise level from an action. Higher noise = larger detection radius.
  """
  def noise_for_action(action) do
    case action do
      :walk -> 1
      :run -> 3
      :attack -> 5
      :skill -> 4
      :stealth_walk -> 0
      :idle -> 0
      _ -> 2
    end
  end

  @doc """
  Process a noise event: alert nearby NPCs within noise_radius.
  Returns a list of `{npc_id, new_alert_state}` transitions.
  """
  def process_noise(source_x, source_y, noise_level, npcs) do
    Enum.flat_map(npcs, fn {id, npc} ->
      nx = npc[:x] || npc[:grid_x] || 0
      ny = npc[:y] || npc[:grid_y] || 0
      dx = source_x - nx
      dy = source_y - ny
      dist = :math.sqrt(dx * dx + dy * dy)

      if dist <= noise_level do
        current_alert = npc[:alert_state] || "idle"

        new_alert =
          cond do
            dist <= 1 -> "alert"
            current_alert == "idle" -> "suspicious"
            current_alert == "suspicious" -> "alert"
            true -> current_alert
          end

        if new_alert != current_alert do
          [{id, new_alert, %{last_noise_x: source_x, last_noise_y: source_y}}]
        else
          []
        end
      else
        []
      end
    end)
  end

  @doc """
  Update an NPC's alert state based on time elapsed without stimuli.
  Alert states decay: alert → searching → suspicious → idle.
  """
  def decay_alert(npc, seconds_since_last_stimulus) do
    current = npc[:alert_state] || "idle"

    cond do
      current == "idle" -> "idle"
      current == "suspicious" and seconds_since_last_stimulus > 10 -> "idle"
      current == "searching" and seconds_since_last_stimulus > 15 -> "suspicious"
      current == "alert" and seconds_since_last_stimulus > 5 -> "searching"
      true -> current
    end
  end

  # ── Cone geometry ───────────────────────────────────────────────

  defp in_cone?(dx, dy, direction, angle_deg) do
    # Direction to angle (radians, 0 = east, counterclockwise)
    dir_rad =
      case direction do
        "east" -> 0.0
        "north" -> :math.pi() / 2
        "west" -> :math.pi()
        "south" -> -:math.pi() / 2
        "northeast" -> :math.pi() / 4
        "northwest" -> 3 * :math.pi() / 4
        "southeast" -> -:math.pi() / 4
        "southwest" -> -3 * :math.pi() / 4
        _ -> -:math.pi() / 2
      end

    # Angle to target
    target_rad = :math.atan2(dy, dx)

    # Angular difference (wrapped to [-pi, pi])
    diff = target_rad - dir_rad
    diff = :math.fmod(diff + 3 * :math.pi(), 2 * :math.pi()) - :math.pi()

    half_angle = angle_deg / 2 * :math.pi() / 180
    abs(diff) <= half_angle
  end
end
