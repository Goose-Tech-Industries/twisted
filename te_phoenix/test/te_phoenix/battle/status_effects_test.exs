defmodule TePhoenix.Battle.StatusEffectsTest do
  use ExUnit.Case, async: false

  alias TePhoenix.Battle.{Combatant, StatusEffects, Triggers}

  @ets_statuses :twisted_battle_statuses
  @ets_rules :twisted_battle_rules
  @ets_rules_by_trigger :twisted_battle_rules_by_trigger

  setup do
    ensure_table(@ets_statuses)
    ensure_table(@ets_rules)
    ensure_table(@ets_rules_by_trigger)

    :ets.delete_all_objects(@ets_statuses)
    :ets.delete_all_objects(@ets_rules)
    :ets.delete_all_objects(@ets_rules_by_trigger)

    seed_status(%{
      key: "bleed_light",
      name: "Light Bleed",
      icon: "🩸",
      category: "dot",
      default_duration: 2,
      permanent: false,
      stacking: "refresh",
      max_stacks: 1,
      effects: %{},
      tick: %{"kind" => "dot_pct_max", "amount" => 0.10},
      disabled_commands: [],
      cure_tags: ["bleed"]
    })

    seed_status(%{
      key: "cripple_leg",
      name: "Leg Cripple",
      icon: "🦵",
      category: "injury",
      default_duration: 99,
      permanent: true,
      stacking: "ignore",
      max_stacks: 1,
      effects: %{"speed_mult" => 0.5, "dodge_ceiling" => 0.4},
      tick: %{},
      disabled_commands: [],
      cure_tags: ["injury"]
    })

    seed_status(%{
      key: "regen",
      name: "Regen",
      icon: "💚",
      category: "hot",
      default_duration: 2,
      permanent: false,
      stacking: "refresh",
      max_stacks: 1,
      effects: %{},
      tick: %{"kind" => "hot_pct_max", "amount" => 0.20},
      disabled_commands: [],
      cure_tags: []
    })

    :ok
  end

  describe "apply_status/4" do
    test "adds a new status with default duration" do
      c = combatant()
      {c, r} = StatusEffects.apply_status(c, "bleed_light", empty_result())

      assert length(c.statuses) == 1
      assert hd(c.statuses)[:key] == "bleed_light"
      assert hd(c.statuses)[:duration] == 2
      assert r.log != []
    end

    test "refresh stacking mode resets duration instead of adding" do
      c = combatant()
      {c, r} = StatusEffects.apply_status(c, "bleed_light", empty_result(), duration: 1)
      {c, _} = StatusEffects.apply_status(c, "bleed_light", r, duration: 5)

      assert length(c.statuses) == 1
      assert hd(c.statuses)[:duration] == 5
    end

    test "ignore stacking mode is idempotent" do
      c = combatant()
      {c, r} = StatusEffects.apply_status(c, "cripple_leg", empty_result())
      {c, _} = StatusEffects.apply_status(c, "cripple_leg", r)

      assert length(c.statuses) == 1
    end
  end

  describe "tick/2" do
    test "DoT deals pct-max damage and counts down" do
      c = combatant(max_hp: 100, current_hp: 100)
      {c, _} = StatusEffects.apply_status(c, "bleed_light", empty_result())
      {c, _} = StatusEffects.tick(c, empty_result())

      assert c.current_hp == 90
      assert hd(c.statuses)[:duration] == 1
    end

    test "HoT heals and clamps at max_hp" do
      c = combatant(max_hp: 100, current_hp: 50)
      {c, _} = StatusEffects.apply_status(c, "regen", empty_result())
      {c, _} = StatusEffects.tick(c, empty_result())

      assert c.current_hp == 70
    end

    test "status expires at duration 0" do
      c = combatant()
      {c, _} = StatusEffects.apply_status(c, "bleed_light", empty_result(), duration: 1)
      {c, _} = StatusEffects.tick(c, empty_result())

      assert c.statuses == []
    end

    test "permanent status is never removed" do
      c = combatant()
      {c, _} = StatusEffects.apply_status(c, "cripple_leg", empty_result())
      {c, _} = StatusEffects.tick(c, empty_result())
      {c, _} = StatusEffects.tick(c, empty_result())

      assert length(c.statuses) == 1
    end
  end

  describe "compute_modifiers/1" do
    test "baseline values when no statuses" do
      mods = StatusEffects.compute_modifiers(combatant())
      assert mods.atk_mult == 1.0
      assert mods.speed_mult == 1.0
      assert mods.dodge_ceiling == 1.0
    end

    test "multipliers compound across statuses" do
      c = combatant()
      {c, _} = StatusEffects.apply_status(c, "cripple_leg", empty_result())

      mods = StatusEffects.compute_modifiers(c)
      assert mods.speed_mult == 0.5
      assert mods.dodge_ceiling == 0.4
    end
  end

  describe "cure_by_tag/2" do
    test "removes statuses matching any tag" do
      c = combatant()
      {c, _} = StatusEffects.apply_status(c, "bleed_light", empty_result())
      {c, _} = StatusEffects.apply_status(c, "cripple_leg", empty_result())

      c = StatusEffects.cure_by_tag(c, ["bleed"])
      keys = Enum.map(c.statuses, & &1[:key])

      refute "bleed_light" in keys
      assert "cripple_leg" in keys
    end
  end

  describe "Triggers.fire/4" do
    test "limb_broken rule applies the configured status" do
      seed_rule(%{
        key: "test_leg_rule",
        name: "test",
        trigger: "limb_broken",
        condition: %{"limb" => "left_leg"},
        effect: %{"apply_status" => "cripple_leg", "to" => "victim"},
        priority: 100,
        enabled: true
      })

      victim = combatant(char_id: 1, name: "Alice")
      state = %{combatants: %{1 => victim}, turn_number: 1, pending_events: []}
      ctx = %{victim: victim, attacker: nil, limb: "left_leg"}

      {state, _r} = Triggers.fire("limb_broken", state, ctx, empty_result())
      updated = state.combatants[1]

      assert StatusEffects.has?(updated, "cripple_leg")
    end

    test "rule condition gates the effect" do
      seed_rule(%{
        key: "test_arm_rule",
        name: "test",
        trigger: "limb_broken",
        condition: %{"limb" => "right_arm"},
        effect: %{"apply_status" => "bleed_light", "to" => "victim"},
        priority: 100,
        enabled: true
      })

      victim = combatant(char_id: 2)
      state = %{combatants: %{2 => victim}, turn_number: 1, pending_events: []}
      ctx = %{victim: victim, attacker: nil, limb: "left_leg"}

      {state, _r} = Triggers.fire("limb_broken", state, ctx, empty_result())
      refute StatusEffects.has?(state.combatants[2], "bleed_light")
    end

    test "queue_event effect appends to pending_events" do
      seed_rule(%{
        key: "test_ko_rule",
        name: "test",
        trigger: "ko",
        condition: %{},
        effect: %{"queue_event" => "interrogation_prompt", "to" => "victim"},
        priority: 100,
        enabled: true
      })

      victim = combatant(char_id: 3)
      state = %{combatants: %{3 => victim}, turn_number: 5, pending_events: []}
      ctx = %{victim: victim, attacker: nil, nonlethal: true}

      {state, _r} = Triggers.fire("ko", state, ctx, empty_result())

      assert length(state.pending_events) == 1
      event = hd(state.pending_events)
      assert event.event == "interrogation_prompt"
      assert event.char_id == 3
    end
  end

  describe "cooldown_rate modifier" do
    test "haste doubles cooldown_rate" do
      seed_status(%{
        key: "cd_haste",
        name: "CD Haste",
        icon: "⚡",
        category: "buff",
        default_duration: 3,
        permanent: false,
        stacking: "refresh",
        max_stacks: 1,
        effects: %{"cooldown_rate" => 2.0},
        tick: %{},
        disabled_commands: [],
        cure_tags: []
      })

      c = combatant()
      {c, _} = StatusEffects.apply_status(c, "cd_haste", empty_result())
      mods = StatusEffects.compute_modifiers(c)

      assert mods.cooldown_rate == 2.0
    end

    test "no statuses means cooldown_rate is 1.0" do
      mods = StatusEffects.compute_modifiers(combatant())
      assert mods.cooldown_rate == 1.0
    end
  end

  # ── helpers ──

  defp combatant(overrides \\ []) do
    Kernel.struct(Combatant, Keyword.merge([
      char_id: 99,
      name: "Test",
      max_hp: 100,
      current_hp: 100,
      atk: 10,
      def: 5,
      speed: 10
    ], overrides))
  end

  defp empty_result, do: %{log: [], actions: []}

  defp ensure_table(tab) do
    case :ets.info(tab) do
      :undefined -> :ets.new(tab, [:set, :public, :named_table, read_concurrency: true])
      _ -> :ok
    end
  end

  defp seed_status(def), do: :ets.insert(@ets_statuses, {def.key, def})

  defp seed_rule(rule) do
    :ets.insert(@ets_rules, {rule.key, rule})
    existing = case :ets.lookup(@ets_rules_by_trigger, rule.trigger) do
      [{_, rules}] -> rules
      _ -> []
    end
    :ets.insert(@ets_rules_by_trigger, {rule.trigger, existing ++ [rule]})
  end
end
