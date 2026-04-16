defmodule TePhoenix.Battle.DefenseResolution do
  @moduledoc """
  Defense Resolution Engine — resolves dodge, block, counter, absorb
  against incoming attacks using per-ruleset configurable formulas.

  Supports:
    - PL-ratio scaling (Planet Mado: +35% dodge per 2x PL advantage)
    - Stat-diff scaling (BG3: AC vs attack roll)
    - Flat chance (FF: fixed dodge%)
    - Custom formulas
    - Stun penalties, diminishing returns, ki dodge bonuses
    - Block dice rolls (d6, d12 when stunned)
    - Counter energy-vs-energy resolution

  All formula values come from game_defense_formulas table.
  Nothing is hardcoded — admin changes the formulas, combat changes.
  """

  alias TePhoenix.Repo
  require Logger

  # Cache defense formulas per ruleset (ETS)
  @cache_ttl 300_000

  defp cache_table do
    case :ets.whereis(:defense_formulas) do
      :undefined -> :ets.new(:defense_formulas, [:named_table, :public, :set]); :defense_formulas
      _ -> :defense_formulas
    end
  end

  @doc "Load defense formulas for a ruleset (cached)."
  def get_formulas(ruleset_id) do
    key = {:formulas, ruleset_id}
    case :ets.lookup(cache_table(), key) do
      [{_, %{data: data, at: at}}] when is_integer(at) ->
        if System.system_time(:millisecond) - at < @cache_ttl, do: data, else: fetch_and_cache(ruleset_id, key)
      _ -> fetch_and_cache(ruleset_id, key)
    end
  end

  defp fetch_and_cache(ruleset_id, key) do
    data = case Repo.query("SELECT * FROM game_defense_formulas WHERE ruleset_id=? AND is_active=1 ORDER BY sort_order", [ruleset_id]) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
    :ets.insert(cache_table(), {key, %{data: data, at: System.system_time(:millisecond)}})
    data
  end

  def clear_cache(ruleset_id \\ nil) do
    if ruleset_id do
      :ets.delete(cache_table(), {:formulas, ruleset_id})
    else
      :ets.delete_all_objects(cache_table())
    end
  end

  # ═════════════════════════════════════════════════════════════
  # RESOLVE DEFENSE — Main entry point
  # ═════════════════════════════════════════════════════════════

  @doc """
  Resolve all applicable defenses against an attack.

  Returns:
    %{
      dodged: boolean,
      blocked: boolean,
      block_reduction: float (0-1),
      countered: boolean,
      counter_damage: integer,
      final_damage: integer,
      events: [%{type, message}]  # narrative events
    }
  """
  def resolve(%{
    ruleset_id: ruleset_id,
    attacker_pl: atk_pl,
    defender_pl: def_pl,
    raw_damage: raw_damage,
    technique: technique,
    defender_stunned: stunned,
    repeat_count: repeat_count,
    defender_charging: defender_charging,
    defender_style_bonuses: style_bonuses
  }) do
    formulas = get_formulas(ruleset_id)
    events = []

    # ── 1. DODGE ──
    {dodged, events} = resolve_dodge(formulas, %{
      atk_pl: atk_pl, def_pl: def_pl,
      technique: technique, stunned: stunned,
      repeat_count: repeat_count, style_bonuses: style_bonuses
    }, events)

    if dodged do
      %{dodged: true, blocked: false, block_reduction: 0, countered: false,
        counter_damage: 0, final_damage: 0, events: events}
    else
      # ── 2. BLOCK ──
      {blocked, block_reduction, events} = resolve_block(formulas, %{
        technique: technique, stunned: stunned, style_bonuses: style_bonuses
      }, events)

      # ── 3. COUNTER (energy attacks only) ──
      {countered, counter_damage, events} = resolve_counter(formulas, %{
        technique: technique, atk_pl: atk_pl, def_pl: def_pl,
        raw_damage: raw_damage, defender_charging: defender_charging,
        stunned: stunned, style_bonuses: style_bonuses
      }, events)

      if countered do
        %{dodged: false, blocked: false, block_reduction: 0, countered: true,
          counter_damage: counter_damage, final_damage: 0, events: events}
      else
        # ── 4. APPLY DAMAGE ──
        final = round(raw_damage * (1.0 - block_reduction))
        events = if blocked, do: events ++ [%{type: :damage, message: "Blocked! #{round(block_reduction * 100)}% reduced. #{final} damage."}], else: events ++ [%{type: :damage, message: "Hit! #{final} damage."}]

        %{dodged: false, blocked: blocked, block_reduction: block_reduction,
          countered: false, counter_damage: 0, final_damage: final, events: events}
      end
    end
  end

  # Fallback for missing args
  def resolve(_), do: %{dodged: false, blocked: false, block_reduction: 0, countered: false, counter_damage: 0, final_damage: 0, events: []}

  # ── DODGE ──────────────────────────────────────────────────

  defp resolve_dodge(formulas, ctx, events) do
    formula = Enum.find(formulas, fn f -> f["defense_type"] == "dodge" end)
    if is_nil(formula) do
      {false, events}
    else
      # Can this attack be dodged?
      if ctx.technique["guaranteed_hit"] == 1 or ctx.technique["can_be_dodged"] == 0 do
        {false, events}
      else
        base = to_float(formula["base_chance_pct"])
        max_chance = to_float(formula["max_chance_pct"]) || 90.0

        # Scale by power difference
        chance = case formula["scale_mode"] do
          "pl_ratio" ->
            ratio = if ctx.atk_pl > 0, do: ctx.def_pl / ctx.atk_pl, else: 1.0
            scale_val = to_float(formula["scale_value"]) || 35.0
            # +scale_val per doubling of defender's PL over attacker's
            if ratio > 1.05 do
              doublings = :math.log2(ratio)
              base + doublings * scale_val
            else
              base
            end

          "stat_diff" ->
            # BG3 style: compare AC vs attack roll
            base

          "flat" ->
            base

          _ -> base
        end

        # Ki attack bonus dodge for opponent
        ki_bonus = if ctx.technique["attack_type"] in ["beam", "blast", "ranged"] do
          to_float(formula["ki_dodge_bonus_pct"]) || 0.0
        else
          0.0
        end

        # Diminishing returns (same attack repeated)
        repeat_bonus = min(
          (ctx.repeat_count || 0) * (to_float(formula["repeat_dodge_bonus_pct"]) || 0.0),
          to_float(formula["repeat_dodge_max_pct"]) || 15.0
        )

        # Stun penalty
        stun_penalty = if ctx.stunned do
          to_float(formula["stun_penalty_pct"]) || 50.0
        else
          0.0
        end

        # Style bonuses
        style_dodge = to_float(ctx.style_bonuses[:dodge_bonus_pct]) || 0.0

        final_chance = min(max_chance, max(0, chance + ki_bonus + repeat_bonus + style_dodge - stun_penalty))
        roll = :rand.uniform(10000) / 100.0  # 0.01 - 100.00

        if roll <= final_chance do
          {true, events ++ [%{type: :dodge, message: "Dodged! (#{Float.round(final_chance, 1)}% chance)"}]}
        else
          {false, events}
        end
      end
    end
  end

  # ── BLOCK ──────────────────────────────────────────────────

  defp resolve_block(formulas, ctx, events) do
    formula = Enum.find(formulas, fn f -> f["defense_type"] == "block" end)
    if is_nil(formula) or ctx.technique["guard_crush"] == 1 or ctx.technique["can_be_blocked"] == 0 do
      {false, 0.0, events}
    else
      # Determine dice
      dice_str = if ctx.stunned, do: "d12", else: (formula["block_dice"] || "d6")
      dice_max = case dice_str do
        "d6" -> 6; "d12" -> 12; "d20" -> 20; _ -> 6
      end

      # Parse success range (e.g. "1-2")
      {success_min, success_max} = case String.split(formula["block_success_range"] || "1-2", "-") do
        [a, b] -> {String.to_integer(a), String.to_integer(b)}
        [a] -> {String.to_integer(a), String.to_integer(a)}
        _ -> {1, 2}
      end

      # Roll twice
      roll1 = :rand.uniform(dice_max)
      roll2 = :rand.uniform(dice_max)
      block1 = roll1 >= success_min and roll1 <= success_max
      block2 = roll2 >= success_min and roll2 <= success_max

      style_block = to_float(ctx.style_bonuses[:block_bonus_pct]) || 0.0
      single_red = (to_float(formula["block_reduction_single"]) || 25.0) / 100.0
      double_red = (to_float(formula["block_reduction_double"]) || 50.0) / 100.0

      cond do
        block1 and block2 and roll1 != roll2 ->
          red = min(1.0, double_red + style_block / 100.0)
          {true, red, events ++ [%{type: :block, message: "Full block! (#{dice_str}: #{roll1}, #{roll2}) #{round(red * 100)}% reduced."}]}

        block1 or block2 ->
          red = min(1.0, single_red + style_block / 100.0)
          {true, red, events ++ [%{type: :block, message: "Partial block! (#{dice_str}: #{roll1}, #{roll2}) #{round(red * 100)}% reduced."}]}

        true ->
          {false, 0.0, events}
      end
    end
  end

  # ── COUNTER ────────────────────────────────────────────────

  defp resolve_counter(formulas, ctx, events) do
    formula = Enum.find(formulas, fn f -> f["defense_type"] == "counter" end)
    can_counter = ctx.technique["can_be_countered"] == 1 or ctx.technique["attack_type"] in ["beam", "blast"]

    if is_nil(formula) or not can_counter do
      {false, 0, events}
    else
      requires_stronger = formula["counter_requires_stronger"] == 1
      base = to_float(formula["base_chance_pct"]) || 25.0
      charging_bonus = if ctx.defender_charging, do: to_float(formula["counter_charging_bonus_pct"]) || 25.0, else: 0.0
      max_chance = to_float(formula["max_chance_pct"]) || 90.0
      stun_penalty = if ctx.stunned, do: to_float(formula["stun_penalty_pct"]) || 50.0, else: 0.0
      style_counter = to_float(ctx.style_bonuses[:counter_bonus_pct]) || 0.0

      final_chance = min(max_chance, max(0, base + charging_bonus + style_counter - stun_penalty))
      roll = :rand.uniform(10000) / 100.0

      if roll <= final_chance do
        # Check if defender is stronger (required for overpower)
        if requires_stronger and ctx.def_pl <= ctx.atk_pl do
          {false, 0, events ++ [%{type: :counter_fail, message: "Counter attempt! But not strong enough to overpower."}]}
        else
          counter_dmg = round(ctx.raw_damage * 0.5)  # reflected damage
          {true, counter_dmg, events ++ [%{type: :counter, message: "Countered! Blast deflected! #{counter_dmg} damage reflected."}]}
        end
      else
        {false, 0, events}
      end
    end
  end

  # ═════════════════════════════════════════════════════════════
  # DAMAGE CALCULATION
  # ═════════════════════════════════════════════════════════════

  @doc "Calculate raw damage for a technique."
  def calculate_damage(%{
    attacker_pl: atk_pl,
    technique: tech,
    tech_level: tech_level,
    is_crit: _is_crit
  }) do
    # Get damage from level scaling if signature, else from base
    damage_pct = if tech["is_signature"] == 1 and tech["level_damage_scale"] do
      scale = case tech["level_damage_scale"] do
        s when is_binary(s) -> Jason.decode!(s)
        s when is_list(s) -> s
        _ -> []
      end
      entry = Enum.find(scale, fn e -> e["level"] == tech_level end)
      if entry, do: to_float(entry["damage_pct"]), else: to_float(tech["damage_pct"])
    else
      to_float(tech["damage_pct"])
    end

    raw = round(atk_pl * damage_pct / 100.0)

    # Physical min damage floor
    min_pct = to_float(tech["min_damage_pct"])
    raw = if min_pct && min_pct > 0 do
      floor = round(atk_pl * min_pct / 100.0)
      max(raw, floor)
    else
      if tech["category"] == "physical" do
        max(raw, round(raw / 2))  # PM: physical can never go below half
      else
        raw
      end
    end

    raw
  end

  @doc "Roll for crit."
  def roll_crit(technique) do
    chance = to_float(technique["crit_chance_pct"]) || 3.0
    mult = to_float(technique["crit_damage_mult"]) || 1.5
    roll = :rand.uniform(10000) / 100.0
    if roll <= chance, do: {true, mult}, else: {false, 1.0}
  end

  @doc "Roll for stun."
  def roll_stun(technique) do
    chance = to_float(technique["stun_chance_pct"]) || 0.0
    duration = technique["stun_duration"] || 0
    if chance > 0 and duration > 0 do
      roll = :rand.uniform(10000) / 100.0
      if roll <= chance, do: {true, duration}, else: {false, 0}
    else
      {false, 0}
    end
  end

  @doc "Roll for bleed."
  def roll_bleed(technique) do
    chance = to_float(technique["bleed_chance_pct"]) || 0.0
    severity = technique["bleed_severity"] || "none"
    if chance > 0 and severity != "none" do
      roll = :rand.uniform(10000) / 100.0
      if roll <= chance, do: {true, severity}, else: {false, "none"}
    else
      {false, "none"}
    end
  end

  @doc "Roll for combo (extra attack)."
  def roll_combo(technique) do
    chance = to_float(technique["combo_chance_pct"]) || 0.0
    if chance > 0 do
      roll = :rand.uniform(10000) / 100.0
      roll <= chance
    else
      false
    end
  end

  @doc "Calculate cost for using a technique."
  def calculate_cost(technique, attacker_pl, tech_level \\ 1) do
    cost_pct = if technique["is_signature"] == 1 and technique["level_damage_scale"] do
      scale = case technique["level_damage_scale"] do
        s when is_binary(s) -> Jason.decode!(s)
        s when is_list(s) -> s
        _ -> []
      end
      entry = Enum.find(scale, fn e -> e["level"] == tech_level end)
      if entry, do: to_float(entry["cost_pct"]), else: to_float(technique["cost_pct"])
    else
      to_float(technique["cost_pct"])
    end

    round(attacker_pl * cost_pct / 100.0)
  end

  # ═════════════════════════════════════════════════════════════
  # TECHNIQUE OBSERVATION / LEARNING BY WATCHING
  # ═════════════════════════════════════════════════════════════

  @doc """
  Record that a character was exposed to a technique in combat.
  Called after every attack resolution. Checks if they learn it.

  Returns {:learned, technique_name} | :not_yet | :already_known | :cant_learn
  """
  def record_exposure(defender_char_id, technique, opts \\ []) do
    tech_id = technique["id"]
    has_scouter = Keyword.get(opts, :has_scouter, false)
    ruleset_id = Keyword.get(opts, :ruleset_id, nil)

    # Check if already known
    case Repo.query("SELECT 1 FROM character_techniques WHERE character_id=? AND technique_id=?", [defender_char_id, tech_id]) do
      {:ok, %{rows: [_]}} -> :already_known
      _ ->
        # Check learn rules
        learn_rule = case Repo.query(
          "SELECT * FROM game_technique_learn_rules WHERE technique_id=? AND is_active=1",
          [tech_id]
        ) do
          {:ok, %{rows: [row], columns: cols}} -> Enum.zip(cols, row) |> Map.new()
          _ ->
            # Fallback to ruleset default
            if ruleset_id do
              case Repo.query(
                "SELECT * FROM game_technique_learn_rules WHERE technique_id IS NULL AND ruleset_id=? AND is_active=1",
                [ruleset_id]
              ) do
                {:ok, %{rows: [row], columns: cols}} -> Enum.zip(cols, row) |> Map.new()
                _ -> nil
              end
            end
        end

        if is_nil(learn_rule) or learn_rule["can_learn_by_observation"] != 1 do
          :cant_learn
        else
          # Upsert exposure record
          scouter_bonus = if has_scouter, do: learn_rule["scouter_exposure_bonus"] || 3, else: 0
          increment = 1 + scouter_bonus

          try do
            Repo.query!("""
              INSERT INTO character_technique_exposure
                (character_id, technique_id, times_seen, times_hit_by, scouter_recorded)
              VALUES (?, ?, ?, 1, ?)
              ON DUPLICATE KEY UPDATE
                times_seen = times_seen + ?,
                times_hit_by = times_hit_by + 1,
                scouter_recorded = IF(? = 1, 1, scouter_recorded),
                last_seen_at = NOW()
            """, [defender_char_id, tech_id, increment, if(has_scouter, do: 1, else: 0),
                  increment, if(has_scouter, do: 1, else: 0)])
          rescue _ -> nil
          end

          # Check if threshold met for learn attempt
          case Repo.query(
            "SELECT times_seen, scouter_recorded FROM character_technique_exposure WHERE character_id=? AND technique_id=? AND learned=0",
            [defender_char_id, tech_id]
          ) do
            {:ok, %{rows: [[times_seen, scouter_rec]]}} ->
              needed = learn_rule["exposures_needed"] || 5
              if times_seen >= needed do
                # Roll to learn
                base_chance = to_float(learn_rule["learn_chance_pct"]) || 75.0
                extra_per = to_float(learn_rule["learn_chance_per_extra"]) || 10.0
                max_chance = to_float(learn_rule["max_learn_chance"]) || 95.0
                scouter_bonus_pct = if scouter_rec == 1, do: to_float(learn_rule["scouter_learn_chance_bonus"]) || 25.0, else: 0.0
                difficulty = to_float(learn_rule["difficulty_multiplier"]) || 1.0

                extra_exposures = max(0, times_seen - needed)
                chance = min(max_chance, (base_chance + extra_exposures * extra_per + scouter_bonus_pct) / difficulty)

                roll = :rand.uniform(10000) / 100.0
                if roll <= chance do
                  # Learned!
                  try do
                    Repo.query!("INSERT INTO character_techniques (character_id, technique_id) VALUES (?,?) ON DUPLICATE KEY UPDATE current_level=1",
                      [defender_char_id, tech_id])
                    Repo.query!("UPDATE character_technique_exposure SET learned=1, learned_at=NOW() WHERE character_id=? AND technique_id=?",
                      [defender_char_id, tech_id])
                  rescue _ -> nil
                  end
                  {:learned, technique["name"] || "a technique"}
                else
                  :not_yet
                end
              else
                :not_yet
              end
            _ -> :not_yet
          end
        end
    end
  end

  # ── Helpers ─────────────────────────────────────────────────

  defp to_float(nil), do: 0.0
  defp to_float(v) when is_float(v), do: v
  defp to_float(v) when is_integer(v), do: v / 1.0
  defp to_float(%Decimal{} = v), do: Decimal.to_float(v)
  defp to_float(v) when is_binary(v) do
    case Float.parse(v) do
      {f, _} -> f
      :error -> 0.0
    end
  end
  defp to_float(_), do: 0.0
end
