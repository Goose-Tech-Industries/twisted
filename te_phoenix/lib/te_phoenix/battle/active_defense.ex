defmodule TePhoenix.Battle.ActiveDefense do
  @moduledoc """
  Session 8 — active defense.

  When attacked, the defender selects one of three actions:

    * `:parry`   — full negate on success, requires an intact arm,
                  effectiveness scales with luck + def
    * `:dodge`   — full negate on success, requires an intact leg,
                  effectiveness scales with speed
    * `:block`   — partial mitigation, requires an intact arm,
                  effectiveness scales with def + armor

  Each defense costs current_mp (used as the stamina pool — combatants
  do not have a dedicated stamina field yet; using mp keeps the change
  surface small for session 8). Insufficient mp falls through to a
  passive hit.
  """

  alias TePhoenix.Battle.{Combatant, Limb}

  @default_costs %{parry: 6, dodge: 4, block: 3}

  @doc "Default defense pick when defender has not set a preference."
  def choose(%Combatant{default_defense: nil} = defender, _ctx) do
    pick_by_capability(defender)
  end

  def choose(%Combatant{default_defense: pref} = defender, _ctx) when is_atom(pref) do
    restrictions = Limb.restrictions(defender.limb_hp)

    cond do
      pref == :dodge and restrictions.cannot_dodge -> pick_by_capability(defender)
      pref in [:parry, :block] and restrictions.cannot_parry -> pick_by_capability(defender)
      true -> pref
    end
  end

  def choose(%Combatant{} = defender, _ctx), do: pick_by_capability(defender)

  defp pick_by_capability(%Combatant{} = c) do
    r = Limb.restrictions(c.limb_hp)
    cond do
      not r.cannot_dodge and c.speed >= c.def -> :dodge
      not r.cannot_parry -> :parry
      not r.cannot_dodge -> :dodge
      true -> :none
    end
  end

  @doc """
  Resolve a defense. Returns one of:

    * `{:negated, defender_after, type}`        — full prevent
    * `{:mitigated, defender_after, mult, type}`— partial: caller scales damage by mult (0.0..1.0)
    * `{:hit, defender_after}`                  — no defense applied
  """
  def resolve(%Combatant{} = attacker, %Combatant{} = defender, opts \\ []) do
    settings = opts[:settings] || %{}
    type = opts[:type] || choose(defender, %{attacker: attacker})

    case type do
      :none -> {:hit, defender}
      _other -> attempt(type, attacker, defender, settings)
    end
  end

  defp attempt(:dodge, attacker, defender, settings) do
    r = Limb.restrictions(defender.limb_hp)
    cost = @default_costs.dodge

    cond do
      r.cannot_dodge -> {:hit, defender}
      defender.current_mp < cost -> {:hit, defender}
      true ->
        base = settings[:dodge_base_chance] || 0.15
        speed_factor = settings[:dodge_speed_factor] || 0.35
        max_c = settings[:dodge_max_chance] || 0.90

        chance = clamp(base + (defender.speed - attacker.speed) * speed_factor / 100.0, 0.0, max_c)
        defender = pay(defender, cost)

        if :rand.uniform() <= chance do
          {:negated, defender, :dodge}
        else
          {:hit, defender}
        end
    end
  end

  defp attempt(:parry, attacker, defender, settings) do
    r = Limb.restrictions(defender.limb_hp)
    cost = @default_costs.parry

    cond do
      r.cannot_parry -> {:hit, defender}
      defender.current_mp < cost -> {:hit, defender}
      true ->
        # luck-and-def driven, attacker atk pushes back
        chance =
          clamp(
            0.10 + (defender.def + defender.luck - attacker.atk) / 100.0,
            0.0,
            settings[:parry_max_chance] || 0.75
          )

        defender = pay(defender, cost)

        if :rand.uniform() <= chance do
          {:negated, defender, :parry}
        else
          {:hit, defender}
        end
    end
  end

  defp attempt(:block, attacker, defender, settings) do
    cost = @default_costs.block
    one_arm_red = settings[:block_one_arm_reduction] || 0.25
    two_arm_red = settings[:block_two_arm_reduction] || 0.50

    arm_count =
      Enum.count([:l_arm, :r_arm], fn a -> not Limb.disabled?(defender.limb_hp, a) end)

    cond do
      arm_count == 0 -> {:hit, defender}
      defender.current_mp < cost -> {:hit, defender}
      true ->
        reduction = if arm_count >= 2, do: two_arm_red, else: one_arm_red
        # def-vs-atk modulation, max +0.20 swing
        swing = clamp((defender.def - attacker.atk) / 100.0, -0.20, 0.20)
        mult = clamp(1.0 - (reduction + swing), 0.10, 1.0)
        defender = pay(defender, cost)
        {:mitigated, defender, mult, :block}
    end
  end

  defp attempt(_, _attacker, defender, _settings), do: {:hit, defender}

  defp pay(%Combatant{} = c, cost) do
    %{c | current_mp: max(0, c.current_mp - cost)}
  end

  defp clamp(v, lo, hi) when is_number(v), do: max(lo, min(hi, v))
end
