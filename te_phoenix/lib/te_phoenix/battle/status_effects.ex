defmodule TePhoenix.Battle.StatusEffects do
  @moduledoc """
  Runtime status-effect engine. All functions are pure — they take a
  combatant (and an append-only `result` log) and return updated values.

  Combatant statuses are a list of maps:

      %{
        key: "bleed_light",          # definition lookup key
        name: "Light Bleed",
        icon: "🩸",
        duration: 2,                 # turns remaining (nil if permanent)
        stacks: 1,
        applied_at_turn: 12,
        source_id: nil,              # char_id who applied it (optional)
        effects: %{...},             # cached from definition
        tick: %{...},
        cure_tags: [...],
        permanent: false
      }

  Nothing downstream reads the `:key` field as a tag switch — mechanics
  are driven by `:effects` and `:tick` only. The key is for UI, cures
  (by tag), and event conditions.
  """

  alias TePhoenix.Battle.{Combatant, StatusRegistry}

  # ── Apply ────────────────────────────────────────────────────────

  @doc """
  Apply a status to a combatant by definition key.

  Respects stacking mode from the status definition:

    * `"refresh"` (default) — if already present, reset duration
    * `"stack"`   — add a new instance up to `max_stacks`
    * `"upgrade"` — replace with the new one (same as refresh for single instance)
    * `"ignore"`  — no-op if already present

  Returns `{combatant, result}`.
  """
  def apply_status(combatant, key, result, opts \\ []) do
    case StatusRegistry.get_status(to_string(key)) do
      nil ->
        {combatant, append_log(result, "Unknown status: #{key}")}

      def ->
        do_apply(combatant, def, result, opts)
    end
  end

  defp do_apply(combatant, def, result, opts) do
    statuses = Map.get(combatant, :statuses, []) || []
    existing = Enum.find(statuses, &(&1[:key] == def.key))
    duration = Keyword.get(opts, :duration, def.default_duration)
    source_id = Keyword.get(opts, :source_id)

    {new_statuses, log_msg} =
      case def.stacking do
        "ignore" when not is_nil(existing) ->
          {statuses, nil}

        "refresh" ->
          instance = build_instance(def, duration, source_id)
          {replace_or_add(statuses, def.key, instance),
           "#{def.icon} #{combatant.name} is afflicted with #{def.name}!"}

        "upgrade" ->
          instance = build_instance(def, duration, source_id)
          {replace_or_add(statuses, def.key, instance),
           "#{def.icon} #{combatant.name}'s #{def.name} intensifies!"}

        "stack" ->
          existing_count = Enum.count(statuses, &(&1[:key] == def.key))

          if existing_count >= def.max_stacks do
            {statuses, nil}
          else
            instance = build_instance(def, duration, source_id)
            {statuses ++ [instance],
             "#{def.icon} #{combatant.name} stacks #{def.name} (#{existing_count + 1}/#{def.max_stacks})!"}
          end

        _ ->
          instance = build_instance(def, duration, source_id)
          {replace_or_add(statuses, def.key, instance),
           "#{def.icon} #{combatant.name} is afflicted with #{def.name}!"}
      end

    combatant = Map.put(combatant, :statuses, new_statuses)

    result =
      if log_msg do
        %{result |
          log: [log_msg | result.log],
          actions: [%{type: :status_applied, target: combatant.name, status: def.key, label: def.name} | result.actions]
        }
      else
        result
      end

    # Fire on_apply trigger (if any script is attached)
    {combatant, result} = maybe_run_script(def[:on_apply_script_id], combatant, result, :on_apply)

    {combatant, result}
  end

  defp build_instance(def, duration, source_id) do
    %{
      key: def.key,
      name: def.name,
      icon: def.icon,
      category: def.category,
      duration: if(def.permanent, do: nil, else: duration),
      permanent: def.permanent,
      stacks: 1,
      source_id: source_id,
      effects: def.effects,
      tick: def.tick,
      disabled_commands: def.disabled_commands,
      cure_tags: def.cure_tags
    }
  end

  defp replace_or_add(statuses, key, instance) do
    case Enum.find_index(statuses, &(&1[:key] == key)) do
      nil -> statuses ++ [instance]
      idx -> List.replace_at(statuses, idx, instance)
    end
  end

  # ── Remove / query ───────────────────────────────────────────────

  def remove(combatant, key) do
    statuses = Enum.reject(Map.get(combatant, :statuses, []) || [], &(&1[:key] == to_string(key)))
    Map.put(combatant, :statuses, statuses)
  end

  def has?(combatant, key) do
    key = to_string(key)
    Enum.any?(Map.get(combatant, :statuses, []) || [], &(&1[:key] == key))
  end

  def cure_by_tag(combatant, tags) when is_list(tags) do
    tagset = MapSet.new(Enum.map(tags, &to_string/1))

    statuses =
      (Map.get(combatant, :statuses, []) || [])
      |> Enum.reject(fn s ->
        (s[:cure_tags] || []) |> Enum.any?(&MapSet.member?(tagset, to_string(&1)))
      end)

    Map.put(combatant, :statuses, statuses)
  end

  # ── Tick (call at turn end) ──────────────────────────────────────

  @doc """
  Run all status ticks on a combatant: DoT damage, HoT heals, duration
  countdown, expiry. Returns `{combatant, result}`.
  """
  def tick(combatant, result) do
    statuses = Map.get(combatant, :statuses, []) || []

    Enum.reduce(statuses, {combatant, result, []}, fn status, {c, r, kept} ->
      {c, r} = apply_tick_effect(c, status, r)
      # Run on_tick graph if the status def attached one. Separate from
      # the built-in tick kinds so power-coders can combine both.
      {c, r} = maybe_run_script(status[:on_tick_script_id], c, r, :on_tick)

      new_duration =
        cond do
          status[:permanent] -> nil
          is_nil(status[:duration]) -> nil
          true -> status[:duration] - 1
        end

      if not is_nil(new_duration) and new_duration <= 0 do
        r = append_log(r, "#{status[:icon]} #{c.name}'s #{status[:name]} fades.")
        {c, r} = maybe_run_script(status[:on_expire_script_id], c, r, :on_expire)
        {c, r, kept}
      else
        updated = if is_nil(new_duration), do: status, else: Map.put(status, :duration, new_duration)
        {c, r, [updated | kept]}
      end
    end)
    |> then(fn {c, r, kept} ->
      {Map.put(c, :statuses, Enum.reverse(kept)), r}
    end)
  end

  defp apply_tick_effect(combatant, status, result) do
    case status[:tick] || %{} do
      %{"kind" => "dot_pct_max", "amount" => amt} ->
        dmg = max(1, trunc(combatant.max_hp * (amt || 0)))
        c = Combatant.apply_damage(combatant, dmg)
        r = %{result |
          log: ["#{status[:icon]} #{c.name} suffers #{dmg} from #{status[:name]}!" | result.log],
          actions: [%{type: :status_tick, target: c.name, status: status[:key], amount: dmg, kind: "dot"} | result.actions]
        }
        {c, r}

      %{"kind" => "dot_flat", "amount" => amt} ->
        dmg = max(1, trunc(amt || 0))
        c = Combatant.apply_damage(combatant, dmg)
        r = %{result |
          log: ["#{status[:icon]} #{c.name} suffers #{dmg} from #{status[:name]}!" | result.log],
          actions: [%{type: :status_tick, target: c.name, status: status[:key], amount: dmg, kind: "dot"} | result.actions]
        }
        {c, r}

      %{"kind" => "hot_pct_max", "amount" => amt} ->
        heal = max(1, trunc(combatant.max_hp * (amt || 0)))
        c = Combatant.apply_healing(combatant, heal)
        r = %{result |
          log: ["#{status[:icon]} #{c.name} regenerates #{heal} HP!" | result.log],
          actions: [%{type: :status_tick, target: c.name, status: status[:key], amount: heal, kind: "hot"} | result.actions]
        }
        {c, r}

      %{"kind" => "mp_regen_flat", "amount" => amt} ->
        regen = max(0, trunc(amt || 0))
        c = %{combatant | current_mp: min(combatant.max_mp, combatant.current_mp + regen)}
        {c, result}

      %{"kind" => "custom", "script_id" => sid} when is_integer(sid) ->
        maybe_run_script(sid, combatant, result, :on_tick)

      _ ->
        {combatant, result}
    end
  end

  # ── compute_modifiers — one pass over all active statuses ────────

  @doc """
  Reduces all active statuses on a combatant into a single modifier
  bundle that the damage/stat pipeline can consume without knowing any
  individual status name. Example output:

      %{
        atk_mult: 0.75,
        def_mult: 1.0,
        speed_mult: 0.6,
        dodge_floor: 0.0,
        dodge_ceiling: 0.45,
        prevent_action: false,
        prevent_magic: true,
        damage_taken_mult: 1.3,
        damage_dealt_mult: 1.0,
        crit_mult_bonus: 0.0,
        miss_chance_bonus: 0.0,
        disabled_commands: MapSet.new(["magic"]),
        flags: %{"drop_weapon" => true}
      }
  """
  def compute_modifiers(combatant) do
    statuses = Map.get(combatant, :statuses, []) || []

    init = %{
      atk_mult: 1.0,
      def_mult: 1.0,
      mo_mult: 1.0,
      md_mult: 1.0,
      speed_mult: 1.0,
      dodge_floor: 0.0,
      dodge_ceiling: 1.0,
      prevent_action: false,
      prevent_magic: false,
      prevent_move: false,
      damage_taken_mult: 1.0,
      damage_dealt_mult: 1.0,
      crit_mult_bonus: 0.0,
      miss_chance_bonus: 0.0,
      cooldown_rate: 1.0,
      disabled_commands: MapSet.new(),
      flags: %{}
    }

    Enum.reduce(statuses, init, fn s, acc ->
      effects = s[:effects] || %{}
      disabled = s[:disabled_commands] || []

      acc
      |> mult(:atk_mult, effects, "atk_mult")
      |> mult(:def_mult, effects, "def_mult")
      |> mult(:mo_mult, effects, "mo_mult")
      |> mult(:md_mult, effects, "md_mult")
      |> mult(:speed_mult, effects, "speed_mult")
      |> mult(:damage_taken_mult, effects, "damage_taken_mult")
      |> mult(:damage_dealt_mult, effects, "damage_dealt_mult")
      |> add(:crit_mult_bonus, effects, "crit_mult_bonus")
      |> add(:miss_chance_bonus, effects, "miss_chance_bonus")
      |> min_of(:dodge_ceiling, effects, "dodge_ceiling")
      |> max_of(:dodge_floor, effects, "dodge_floor")
      |> mult(:cooldown_rate, effects, "cooldown_rate")
      |> or_flag(:prevent_action, effects, "prevent_action")
      |> or_flag(:prevent_magic, effects, "prevent_magic")
      |> or_flag(:prevent_move, effects, "prevent_move")
      |> merge_flags(effects)
      |> Map.update!(:disabled_commands, &Enum.reduce(disabled, &1, fn c, set -> MapSet.put(set, to_string(c)) end))
    end)
  end

  defp mult(acc, key, effects, effect_key) do
    case Map.get(effects, effect_key) do
      v when is_number(v) -> Map.update!(acc, key, &(&1 * v))
      _ -> acc
    end
  end

  defp add(acc, key, effects, effect_key) do
    case Map.get(effects, effect_key) do
      v when is_number(v) -> Map.update!(acc, key, &(&1 + v))
      _ -> acc
    end
  end

  defp min_of(acc, key, effects, effect_key) do
    case Map.get(effects, effect_key) do
      v when is_number(v) -> Map.update!(acc, key, &min(&1, v))
      _ -> acc
    end
  end

  defp max_of(acc, key, effects, effect_key) do
    case Map.get(effects, effect_key) do
      v when is_number(v) -> Map.update!(acc, key, &max(&1, v))
      _ -> acc
    end
  end

  defp or_flag(acc, key, effects, effect_key) do
    if Map.get(effects, effect_key) == true, do: Map.put(acc, key, true), else: acc
  end

  @passthrough_flags ~w(drop_weapon no_dual_wield confused berserk wake_on_damage)
  defp merge_flags(acc, effects) do
    Enum.reduce(@passthrough_flags, acc, fn f, a ->
      case Map.get(effects, f) do
        nil -> a
        v -> Map.update!(a, :flags, &Map.put(&1, f, v))
      end
    end)
  end

  # ── Script bridge (power-code) ───────────────────────────────────
  #
  # Returns `{combatant, result}` so mutations from the graph (HP,
  # status add/remove, etc.) land back on the combatant. Non-fatal —
  # a broken user graph never crashes the battle pipeline.

  defp maybe_run_script(nil, c, result, _phase), do: {c, result}

  defp maybe_run_script(sid, combatant, result, phase) when is_integer(sid) do
    try do
      TePhoenix.Game.ScriptInterpreter.run_for_status(sid, combatant, phase, result)
    rescue
      _ -> {combatant, result}
    catch
      _, _ -> {combatant, result}
    end
  end

  defp maybe_run_script(_other, c, result, _phase), do: {c, result}

  # ── Helpers ──────────────────────────────────────────────────────

  defp append_log(result, msg), do: %{result | log: [msg | result.log]}
end
