defmodule TePhoenix.Battle.Limb do
  @moduledoc """
  Session 8 — limb targeting.

  Each combatant has six limbs: head, torso, l_arm, r_arm, l_leg, r_leg.
  Per-limb HP is a fraction of max_hp. Damage routed to a limb spills
  back to torso (and thence the core hp pool) once the limb hits zero,
  scaled by the `limb_bleed_through_default` setting.

  Restrictions from disabled limbs:

    * broken head → unconscious immediately
    * both legs broken → cannot dodge, cannot reposition
    * both arms broken → cannot parry, cannot wield two-handed weapons
    * torso at 0 → core hp follows, normal death rules apply

  Wound levels track partial damage and feed UI text only.
  """

  @limbs [:head, :torso, :l_arm, :r_arm, :l_leg, :r_leg]

  @hp_share %{
    head: 0.20,
    torso: 0.35,
    l_arm: 0.10,
    r_arm: 0.10,
    l_leg: 0.125,
    r_leg: 0.125
  }

  def limbs, do: @limbs

  @doc "Build a limb_hp map sized off max_hp."
  def init(max_hp) when is_integer(max_hp) and max_hp > 0 do
    Map.new(@limbs, fn limb ->
      {limb, max(1, round(max_hp * Map.fetch!(@hp_share, limb)))}
    end)
  end

  def init(_), do: init(100)

  @doc "Max hp per limb for the given total max_hp — used for wound thresholds."
  def max_for(limb, max_hp) when limb in @limbs do
    max(1, round(max_hp * Map.fetch!(@hp_share, limb)))
  end

  @doc """
  Apply damage to a specific limb. Damage in excess of the limb's
  remaining HP bleeds through to the torso scaled by `bleed_through`
  (defaults to 0.60). Returns `{limb_hp, leftover_to_core}` where
  leftover is damage that should still be applied to current_hp.
  """
  def apply_to(limb_hp, limb, damage, bleed_through \\ 0.60)
      when limb in @limbs and is_integer(damage) and damage >= 0 do
    current = Map.get(limb_hp, limb, 0)
    absorbed = min(current, damage)
    overflow = damage - absorbed
    new_limb = current - absorbed
    new_map = Map.put(limb_hp, limb, new_limb)
    leftover = round(overflow * bleed_through) + absorbed
    {new_map, leftover}
  end

  @doc "True if the named limb is at 0 HP."
  def disabled?(limb_hp, limb) when limb in @limbs do
    Map.get(limb_hp, limb, 1) <= 0
  end

  @doc "List of limbs currently disabled."
  def disabled_limbs(limb_hp) do
    Enum.filter(@limbs, &disabled?(limb_hp, &1))
  end

  @doc "Compute restrictions imposed by current limb state."
  def restrictions(limb_hp) do
    %{
      cannot_dodge: disabled?(limb_hp, :l_leg) and disabled?(limb_hp, :r_leg),
      cannot_parry: disabled?(limb_hp, :l_arm) and disabled?(limb_hp, :r_arm),
      cannot_block: disabled?(limb_hp, :l_arm) and disabled?(limb_hp, :r_arm),
      head_broken: disabled?(limb_hp, :head),
      torso_broken: disabled?(limb_hp, :torso)
    }
  end

  @doc """
  Categorise a limb's wound severity based on its remaining fraction
  of max. Thresholds match the values in Battle.Settings defaults.
  """
  def wound_level(limb_hp, limb, max_hp) when limb in @limbs do
    cur = Map.get(limb_hp, limb, 0)
    max = max_for(limb, max_hp)
    pct = if max > 0, do: cur / max, else: 0.0

    cond do
      pct <= 0.0 -> :disabled
      pct <= 0.50 -> :heavy
      pct <= 0.75 -> :light
      true -> :ok
    end
  end
end
