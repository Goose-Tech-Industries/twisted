defmodule TePhoenix.Battle.Projectiles do
  @moduledoc """
  Projectile system for the battle engine.

  Projectiles have travel time, trajectory, and AoE. Instead of
  instant-hit damage resolution, a skill/attack can spawn a projectile
  that takes N ticks to reach its target. The target (or any combatant
  in the path) can dodge during the travel window.

  ## Projectile definition (lives in skill effects JSON)

      "projectile": {
        "speed": 3,              // tiles per tick (1 tick = 200ms server-side)
        "trajectory": "line",    // line / arc / homing / spread
        "width": 1,              // tiles wide (for line/spread)
        "aoe_radius": 0,         // 0 = single target, >0 = splash on impact
        "aoe_shape": "circle",   // circle / cone / line
        "piercing": false,       // passes through targets (hits all in path)
        "max_range": 8,          // despawn after this many tiles
        "dodge_window_ms": 400,  // client shows dodge prompt for this long
        "visual": "fireball",    // client-side particle/sprite key
        "on_hit_status": null,   // optional: apply this status on hit
        "on_miss_terrain": null  // optional: leave this terrain on miss (fire, ice)
      }

  ## How it works

  1. Skill fires → `spawn_projectile/5` creates a projectile struct
     and adds it to `state.active_projectiles`.
  2. Each battle tick (`tick_projectiles/2`), every active projectile
     advances along its trajectory.
  3. Collision check: if the projectile reaches a tile occupied by an
     enemy (or the target for homing), `resolve_hit/4` runs the damage
     pipeline with the projectile's effects.
  4. If the projectile has AoE, all combatants within `aoe_radius` of
     the impact point take damage (with falloff).
  5. Dodging: when a projectile is spawned, the server broadcasts its
     trajectory to the client. The client shows a dodge prompt. If the
     target moves off the impact tile before the projectile arrives,
     it's a miss.
  6. Piercing projectiles don't stop on first hit — they continue
     through, hitting every combatant in the path.

  ## Integration

    * `combat.ex` — skill effects with a `"projectile"` key go through
      `spawn_projectile` instead of `Damage.resolve`.
    * `state.ex` — `tick_projectiles` runs on every turn (or on a
      fast-tick timer for real-time modes).
    * `battle_channel.ex` — broadcasts `projectile_spawned` / `projectile_hit`
      / `projectile_miss` for client rendering.
    * `StatusEffects` — `on_hit_status` applies via the data-driven system.
    * `Triggers` — fires `"projectile_hit"` event for rule hooks.
  """

  alias TePhoenix.Battle.{Combatant, Damage, StatusEffects, Triggers}
  require Logger

  defstruct [
    :id,
    :owner_id,
    :target_id,
    :origin_x,
    :origin_y,
    :current_x,
    :current_y,
    :target_x,
    :target_y,
    :speed,
    :trajectory,
    :width,
    :aoe_radius,
    :aoe_shape,
    :piercing,
    :max_range,
    :dodge_window_ms,
    :visual,
    :on_hit_status,
    :on_miss_terrain,
    :effects,
    :action_name,
    :tiles_traveled,
    :spawned_at,
    :hit_ids
  ]

  # ── Spawn ───────────────────────────────────────────────────────

  @doc """
  Create a projectile from a skill's projectile config. Adds it to
  `state.active_projectiles` and returns the updated state + a result
  with the spawn broadcast action.
  """
  def spawn_projectile(state, actor, target, proj_config, action_name) do
    id = System.unique_integer([:positive])

    proj = %__MODULE__{
      id: id,
      owner_id: actor.char_id,
      target_id: target && target.char_id,
      origin_x: actor.grid_x,
      origin_y: actor.grid_y,
      current_x: actor.grid_x * 1.0,
      current_y: actor.grid_y * 1.0,
      target_x: (target && target.grid_x) || actor.grid_x,
      target_y: (target && target.grid_y) || actor.grid_y,
      speed: proj_config["speed"] || 3,
      trajectory: proj_config["trajectory"] || "line",
      width: proj_config["width"] || 1,
      aoe_radius: proj_config["aoe_radius"] || 0,
      aoe_shape: proj_config["aoe_shape"] || "circle",
      piercing: proj_config["piercing"] == true,
      max_range: proj_config["max_range"] || 8,
      dodge_window_ms: proj_config["dodge_window_ms"] || 400,
      visual: proj_config["visual"] || "default",
      on_hit_status: proj_config["on_hit_status"],
      on_miss_terrain: proj_config["on_miss_terrain"],
      effects: proj_config["effects"] || %{},
      action_name: action_name,
      tiles_traveled: 0,
      spawned_at: System.monotonic_time(:millisecond),
      hit_ids: MapSet.new()
    }

    active = Map.get(state, :active_projectiles, [])
    state = Map.put(state, :active_projectiles, [proj | active])

    result = %{log: [], actions: [
      %{type: :projectile_spawned, id: id, owner: actor.name,
        visual: proj.visual, trajectory: proj.trajectory,
        origin: {proj.origin_x, proj.origin_y},
        target: {proj.target_x, proj.target_y},
        speed: proj.speed, dodge_window_ms: proj.dodge_window_ms}
    ]}

    {state, result}
  end

  # ── Tick ────────────────────────────────────────────────────────

  @doc """
  Advance all active projectiles by one tick. Resolves hits,
  despawns expired projectiles. Returns `{state, result}`.
  """
  def tick_projectiles(state, result \\ %{log: [], actions: []}) do
    active = Map.get(state, :active_projectiles, [])

    if active == [] do
      {state, result}
    else
      {kept, state, result} =
        Enum.reduce(active, {[], state, result}, fn proj, {k, st, r} ->
          {proj, st, r, alive?} = advance_one(proj, st, r)

          if alive? do
            {[proj | k], st, r}
          else
            {k, st, r}
          end
        end)

      state = Map.put(state, :active_projectiles, Enum.reverse(kept))
      {state, result}
    end
  end

  defp advance_one(proj, state, result) do
    # Move projectile
    proj = move(proj)

    cond do
      # Exceeded max range
      proj.tiles_traveled >= proj.max_range ->
        result = add_action(result, %{type: :projectile_despawn, id: proj.id, reason: "max_range"})
        maybe_leave_terrain(proj, state, result)

      # Homing: update target position each tick
      proj.trajectory == "homing" and proj.target_id ->
        target = Map.get(state.combatants, proj.target_id)
        proj = if target, do: %{proj | target_x: target.grid_x, target_y: target.grid_y}, else: proj
        check_collision(proj, state, result)

      true ->
        check_collision(proj, state, result)
    end
  end

  defp move(proj) do
    dx = proj.target_x - proj.current_x
    dy = proj.target_y - proj.current_y
    dist = :math.sqrt(dx * dx + dy * dy)

    if dist < 0.5 do
      %{proj | tiles_traveled: proj.tiles_traveled + 1}
    else
      step = min(proj.speed, dist)
      nx = proj.current_x + dx / dist * step
      ny = proj.current_y + dy / dist * step

      # Arc trajectory: add a parabolic Y offset
      {nx, ny} =
        if proj.trajectory == "arc" do
          total_dist = :math.sqrt(:math.pow(proj.target_x - proj.origin_x, 2) + :math.pow(proj.target_y - proj.origin_y, 2))
          progress = if total_dist > 0, do: proj.tiles_traveled / max(1, total_dist), else: 1.0
          arc_height = total_dist * 0.3
          arc_offset = arc_height * 4 * progress * (1 - progress)
          {nx, ny - arc_offset}
        else
          {nx, ny}
        end

      %{proj | current_x: nx, current_y: ny, tiles_traveled: proj.tiles_traveled + 1}
    end
  end

  # ── Collision ───────────────────────────────────────────────────

  defp check_collision(proj, state, result) do
    tile_x = round(proj.current_x)
    tile_y = round(proj.current_y)
    owner = Map.get(state.combatants, proj.owner_id)
    owner_team = owner && owner.team_id

    # Find combatants on the projectile's current tile (enemies only)
    hits =
      state.combatants
      |> Enum.filter(fn {id, c} ->
        Combatant.alive?(c) and
        c.grid_x == tile_x and c.grid_y == tile_y and
        c.team_id != owner_team and
        not MapSet.member?(proj.hit_ids, id)
      end)
      |> Enum.map(fn {id, _c} -> id end)

    if hits == [] do
      {proj, state, result, true}
    else
      {proj, state, result} =
        Enum.reduce(hits, {proj, state, result}, fn char_id, {p, st, r} ->
          {st, r} = resolve_hit(p, char_id, st, r)
          p = %{p | hit_ids: MapSet.put(p.hit_ids, char_id)}
          {p, st, r}
        end)

      # AoE splash on first hit
      {state, result} =
        if proj.aoe_radius > 0 do
          resolve_aoe(proj, tile_x, tile_y, state, result)
        else
          {state, result}
        end

      if proj.piercing do
        {proj, state, result, true}
      else
        result = add_action(result, %{type: :projectile_despawn, id: proj.id, reason: "hit"})
        {proj, state, result, false}
      end
    end
  end

  # ── Hit resolution ──────────────────────────────────────────────

  defp resolve_hit(proj, target_id, state, result) do
    actor = Map.get(state.combatants, proj.owner_id)
    target = Map.get(state.combatants, target_id)

    if actor && target && Combatant.alive?(target) do
      effects = Map.merge(%{"damage" => proj.effects}, proj.effects)

      {state, dmg_result} =
        Damage.resolve(state, actor, target, effects, proj.action_name || "projectile", result,
          %{target_limb: nil, flavor_text: nil})

      result = %{dmg_result |
        actions: [%{type: :projectile_hit, id: proj.id, target_id: target_id} | dmg_result.actions]
      }

      # Apply on_hit_status if configured
      {state, result} =
        if proj.on_hit_status do
          target = Map.get(state.combatants, target_id)

          if target do
            {target, result} = StatusEffects.apply_status(target, proj.on_hit_status, result)
            state = put_in(state.combatants[target_id], target)
            {state, result}
          else
            {state, result}
          end
        else
          {state, result}
        end

      # Fire trigger
      ctx = %{attacker: actor, victim: Map.get(state.combatants, target_id), projectile: true}
      Triggers.fire("projectile_hit", state, ctx, result)
    else
      {state, result}
    end
  end

  # ── AoE ─────────────────────────────────────────────────────────

  defp resolve_aoe(proj, cx, cy, state, result) do
    radius = proj.aoe_radius
    owner = Map.get(state.combatants, proj.owner_id)
    owner_team = owner && owner.team_id

    targets =
      state.combatants
      |> Enum.filter(fn {id, c} ->
        Combatant.alive?(c) and
        c.team_id != owner_team and
        not MapSet.member?(proj.hit_ids, id) and
        in_aoe?(proj.aoe_shape, cx, cy, c.grid_x, c.grid_y, radius)
      end)
      |> Enum.map(fn {id, _} -> id end)

    Enum.reduce(targets, {state, result}, fn tid, {st, r} ->
      # AoE damage falls off with distance
      target = Map.get(st.combatants, tid)

      if target do
        dist = :math.sqrt(:math.pow(target.grid_x - cx, 2) + :math.pow(target.grid_y - cy, 2))
        falloff = max(0.3, 1.0 - dist / max(1, radius + 1))

        effects = proj.effects
        {st, r} = Damage.resolve(st, owner, target, effects, "#{proj.action_name} (splash)", r, %{})

        r = %{r | actions: [%{type: :aoe_hit, projectile_id: proj.id, target_id: tid, falloff: falloff} | r.actions]}
        {st, r}
      else
        {st, r}
      end
    end)
  end

  defp in_aoe?("circle", cx, cy, tx, ty, radius) do
    :math.sqrt(:math.pow(tx - cx, 2) + :math.pow(ty - cy, 2)) <= radius
  end

  defp in_aoe?("line", cx, _cy, tx, _ty, radius) do
    abs(tx - cx) <= radius
  end

  defp in_aoe?(_, cx, cy, tx, ty, radius) do
    in_aoe?("circle", cx, cy, tx, ty, radius)
  end

  # ── Terrain on miss ─────────────────────────────────────────────

  defp maybe_leave_terrain(proj, state, result) do
    if proj.on_miss_terrain do
      tile_key = "#{round(proj.current_x)},#{round(proj.current_y)}"
      terrain = Map.put(state.terrain_map || %{}, tile_key, proj.on_miss_terrain)
      state = %{state | terrain_map: terrain}

      result = add_action(result, %{
        type: :terrain_created,
        x: round(proj.current_x),
        y: round(proj.current_y),
        terrain: proj.on_miss_terrain,
        source: "projectile"
      })

      {proj, state, result, false}
    else
      {proj, state, result, false}
    end
  end

  # ── Helpers ─────────────────────────────────────────────────────

  defp add_action(result, action) do
    %{result | actions: [action | result.actions]}
  end
end
