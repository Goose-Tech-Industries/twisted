defmodule TePhoenix.Battle.Session8Test do
  @moduledoc """
  Session 8 — limb targeting, active defense, knockout.
  """

  use ExUnit.Case, async: true

  alias TePhoenix.Battle.{ActiveDefense, Combatant, DamagePipeline, Limb}

  describe "Limb.init/1" do
    test "splits max_hp across all six limbs" do
      limbs = Limb.init(100)
      assert Map.keys(limbs) |> Enum.sort() == Enum.sort(Limb.limbs())
      total = Enum.sum(Map.values(limbs))
      # init is sized so the sum is close to max_hp (rounding)
      assert_in_delta total, 100, 3
      assert limbs.head == 20
      assert limbs.torso == 35
    end

    test "head share is larger than a leg" do
      limbs = Limb.init(200)
      assert limbs.head > limbs.l_leg
    end
  end

  describe "Limb.apply_to/4" do
    test "damage absorbed up to limb cap, overflow bleeds back" do
      limbs = Limb.init(100)
      # head has 20 hp
      {new_limbs, leftover} = Limb.apply_to(limbs, :head, 30, 0.5)
      assert new_limbs.head == 0
      # 20 absorbed + 10 overflow * 0.5 = 25 reapplied
      assert leftover == 25
    end

    test "small damage leaves limb partially wounded" do
      limbs = Limb.init(100)
      {new_limbs, leftover} = Limb.apply_to(limbs, :r_arm, 5, 0.6)
      assert new_limbs.r_arm == 5
      assert leftover == 5
    end
  end

  describe "Limb.disabled? and restrictions" do
    test "limb at 0 is disabled" do
      limbs = Limb.init(100) |> Map.put(:l_leg, 0)
      assert Limb.disabled?(limbs, :l_leg)
      refute Limb.disabled?(limbs, :r_leg)
    end

    test "broken pair of legs prevents dodge" do
      limbs = Limb.init(100) |> Map.merge(%{l_leg: 0, r_leg: 0})
      r = Limb.restrictions(limbs)
      assert r.cannot_dodge
      refute r.cannot_parry
    end

    test "broken pair of arms prevents parry and block" do
      limbs = Limb.init(100) |> Map.merge(%{l_arm: 0, r_arm: 0})
      r = Limb.restrictions(limbs)
      assert r.cannot_parry
      assert r.cannot_block
    end
  end

  describe "ActiveDefense.choose/2" do
    test "defaults to dodge when fast and unrestricted" do
      c = %Combatant{speed: 20, def: 5, limb_hp: Limb.init(100)}
      assert ActiveDefense.choose(c, %{}) == :dodge
    end

    test "falls back to parry when legs broken" do
      limbs = Limb.init(100) |> Map.merge(%{l_leg: 0, r_leg: 0})
      c = %Combatant{speed: 20, def: 5, limb_hp: limbs}
      assert ActiveDefense.choose(c, %{}) == :parry
    end

    test "honours stated preference when capable" do
      c = %Combatant{speed: 10, def: 10, default_defense: :parry, limb_hp: Limb.init(100)}
      assert ActiveDefense.choose(c, %{}) == :parry
    end

    test "overrides preference if injury prevents it" do
      limbs = Limb.init(100) |> Map.merge(%{l_arm: 0, r_arm: 0})
      c = %Combatant{speed: 20, def: 5, default_defense: :parry, limb_hp: limbs}
      # both arms gone — parry is invalid, must pick dodge
      assert ActiveDefense.choose(c, %{}) == :dodge
    end
  end

  describe "ActiveDefense.resolve/3 — math" do
    setup do
      :rand.seed(:exsss, {1, 2, 3})
      :ok
    end

    test "dodge: huge speed advantage usually negates" do
      attacker = %Combatant{name: "A", atk: 10, speed: 1, limb_hp: Limb.init(100)}
      defender = %Combatant{name: "D", def: 5, speed: 100, current_mp: 50, limb_hp: Limb.init(100)}

      result = ActiveDefense.resolve(attacker, defender, type: :dodge, settings: %{
        dodge_base_chance: 0.50,
        dodge_speed_factor: 0.50,
        dodge_max_chance: 0.95
      })

      assert match?({:negated, _, :dodge}, result)
    end

    test "block: returns mitigated mult with both arms" do
      attacker = %Combatant{name: "A", atk: 10, speed: 10, limb_hp: Limb.init(100)}
      defender = %Combatant{name: "D", def: 12, speed: 5, current_mp: 50, limb_hp: Limb.init(100)}

      assert {:mitigated, _new_def, mult, :block} =
               ActiveDefense.resolve(attacker, defender,
                 type: :block,
                 settings: %{block_one_arm_reduction: 0.25, block_two_arm_reduction: 0.50}
               )

      assert mult < 1.0
      assert mult > 0.0
    end

    test "block: no arms → no defense" do
      limbs = Limb.init(100) |> Map.merge(%{l_arm: 0, r_arm: 0})
      attacker = %Combatant{name: "A", atk: 10, speed: 10, limb_hp: Limb.init(100)}
      defender = %Combatant{name: "D", def: 12, current_mp: 50, limb_hp: limbs}

      assert {:hit, _} = ActiveDefense.resolve(attacker, defender, type: :block, settings: %{})
    end

    test "dodge: no legs → no defense" do
      limbs = Limb.init(100) |> Map.merge(%{l_leg: 0, r_leg: 0})
      attacker = %Combatant{name: "A", atk: 10, speed: 5, limb_hp: Limb.init(100)}
      defender = %Combatant{name: "D", speed: 50, current_mp: 50, limb_hp: limbs}

      assert {:hit, _} = ActiveDefense.resolve(attacker, defender, type: :dodge, settings: %{})
    end

    test "insufficient mp falls through to plain hit" do
      attacker = %Combatant{name: "A", atk: 10, speed: 5, limb_hp: Limb.init(100)}
      defender = %Combatant{name: "D", def: 12, current_mp: 0, limb_hp: Limb.init(100)}

      assert {:hit, _} = ActiveDefense.resolve(attacker, defender, type: :block, settings: %{})
    end
  end

  describe "DamagePipeline — limb routing + knockout" do
    test "limb_routing step records limb damage and disable" do
      target = %Combatant{name: "T", max_hp: 100, current_hp: 100, limb_hp: Limb.init(100)}

      ctx = %{
        state: nil,
        actor: %Combatant{name: "A", atk: 10, limb_hp: Limb.init(100)},
        target: target,
        damage: 30,
        effects: %{},
        action_name: "test",
        settings: %{enable_limb_targeting: true, limb_bleed_through_default: 0.5},
        opts: %{},
        result: %{log: [], actions: []},
        meta: %{
          crit: false, dodged: false, absorbed: false, elements: [],
          effective_limb: :head, limb_result: nil,
          attacker_mods: %{damage_dealt_mult: 1.0},
          defender_mods: %{damage_taken_mult: 1.0},
          halted: false
        }
      }

      new_ctx = apply_step(:limb_routing, ctx)

      assert new_ctx.target.limb_hp.head == 0
      assert Enum.any?(new_ctx.result.actions, fn a -> a[:type] == :limb_disabled and a[:limb] == :head end)
    end

    test "knockout_check fires when head is broken" do
      limbs = Limb.init(100) |> Map.put(:head, 0)
      target = %Combatant{name: "T", max_hp: 100, current_hp: 100, limb_hp: limbs}

      ctx = base_ctx(target, 10)
      new_ctx = apply_step(:knockout_check, ctx)

      assert new_ctx.target.unconscious
      assert new_ctx.target.knocked_out
      assert Enum.any?(new_ctx.result.actions, fn a -> a[:type] == :knockout and a[:reason] == :head_broken end)
    end

    test "knockout_check fires when big hit lands while target is already low" do
      target = %Combatant{name: "T", max_hp: 100, current_hp: 10, limb_hp: Limb.init(100)}
      ctx = base_ctx(target, 50)
      new_ctx = apply_step(:knockout_check, ctx)
      assert new_ctx.target.unconscious
    end

    test "knockout_check skips when neither condition met" do
      target = %Combatant{name: "T", max_hp: 100, current_hp: 80, limb_hp: Limb.init(100)}
      ctx = base_ctx(target, 5)
      new_ctx = apply_step(:knockout_check, ctx)
      refute new_ctx.target.unconscious
    end
  end

  defp base_ctx(target, damage) do
    %{
      state: nil,
      actor: %Combatant{name: "A", limb_hp: Limb.init(100)},
      target: target,
      damage: damage,
      effects: %{},
      action_name: "test",
      settings: %{},
      opts: %{},
      result: %{log: [], actions: []},
      meta: %{
        crit: false, dodged: false, absorbed: false, elements: [],
        effective_limb: nil, limb_result: nil,
        attacker_mods: %{damage_dealt_mult: 1.0},
        defender_mods: %{damage_taken_mult: 1.0},
        halted: false
      }
    }
  end

  defp apply_step(step, ctx) do
    # Reach into DamagePipeline via a tiny private bypass — we test the
    # public default_steps order indirectly. Here we just rebuild one
    # step. If DamagePipeline's private step changes shape, this test
    # fails loudly.
    Code.ensure_loaded(DamagePipeline)
    apply(DamagePipeline, :__test_step__, [step, ctx])
  rescue
    UndefinedFunctionError ->
      raise """
      DamagePipeline.__test_step__/2 is not defined.
      Add a thin public helper in damage_pipeline.ex that delegates to execute_step/2 for tests:

          if Mix.env() == :test do
            def __test_step__(step, ctx), do: execute_step(step, ctx)
          end
      """
  end
end
