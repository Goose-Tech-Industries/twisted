defmodule TePhoenix.Battle.ChargeMechanics do
  @moduledoc """
  Charge interrupt and brace mechanics for the battle system.

  ## Charge Interrupts

  A combatant's `charging` field is a map like:

      %{skill_id: 5, turns_left: 2, skill_name: "Spirit Bomb", charge_limb: "right_arm"}

  Charges can be interrupted by:

  1. **Stun**: any stun status applied cancels the charge outright.
  2. **Limb loss**: if the limb stored in `charge_limb` is disabled
     (wound level reaches 0 HP), the charge cancels. A mage channeling
     with their right arm loses the spell if that arm is crippled.

  ## Brace

  While charging, a combatant can choose to "brace" instead of dodging
  or blocking. Bracing halves the next incoming damage instance but
  keeps the charge going. Without bracing, taking a hit during charge
  still preserves the charge (only stun/limb-loss cancel it), but
  bracing gives a defensive option for the charger.

  The brace flag is transient — it lasts for one incoming damage
  application and then clears.

  ## Wire Points

  - Call `check_charge_interrupt/3` from `StatusEffects.apply_status`
    when a stun is applied, and from limb damage resolution when a limb
    reaches the disabled threshold.
  - Call `can_brace?/1` to check if the "brace" defense option should
    appear for this combatant.
  - Call `apply_brace/1` when the combatant chooses brace as their
    active defense. The damage pipeline checks `combatant.bracing` and
    halves damage, then clears the flag via `consume_brace/1`.
  """

  require Logger

  # ── Charge interrupt ───────────────────────────────────────────

  @doc """
  Check whether a charge should be interrupted by the given event.

  `event` is one of:
    - `{:stun_applied, status_key}` — a stun-category status was applied
    - `{:limb_disabled, limb_key}` — a limb reached 0 HP / disabled wound level

  `ctx` is a map of optional context: `%{turn: n, source_name: "..."}`.

  Returns `{combatant, result}` where the charge is cancelled if
  conditions are met, or the combatant is returned unchanged.
  """
  def check_charge_interrupt(combatant, event, ctx \\ %{}) do
    charging = Map.get(combatant, :charging)

    cond do
      is_nil(charging) or charging == false ->
        {combatant, no_interrupt_result()}

      match?({:stun_applied, _}, event) ->
        cancel_charge(combatant, charging, :stun, event, ctx)

      match?({:limb_disabled, _}, event) ->
        {_, disabled_limb} = event
        charge_limb = Map.get(charging, :charge_limb) || Map.get(charging, "charge_limb")

        if charge_limb != nil and normalize_limb(charge_limb) == normalize_limb(disabled_limb) do
          cancel_charge(combatant, charging, :limb_disabled, event, ctx)
        else
          {combatant, no_interrupt_result()}
        end

      true ->
        {combatant, no_interrupt_result()}
    end
  end

  defp cancel_charge(combatant, charging, reason, event, ctx) do
    skill_name = Map.get(charging, :skill_name) || Map.get(charging, "skill_name") || "unknown"
    char_name = Map.get(combatant, :name) || "Combatant"

    log_msg =
      case reason do
        :stun ->
          {_, status_key} = event
          "#{char_name}'s charge (#{skill_name}) was interrupted by #{status_key}!"

        :limb_disabled ->
          {_, limb_key} = event
          "#{char_name}'s charge (#{skill_name}) was interrupted — #{limb_key} disabled!"
      end

    Logger.info("[ChargeMechanics] #{log_msg}")

    combatant =
      combatant
      |> Map.put(:charging, nil)
      |> Map.put(:charging_fire, false)

    result = %{
      interrupted: true,
      reason: reason,
      skill_name: skill_name,
      turn: Map.get(ctx, :turn),
      log: [log_msg],
      actions: [
        %{
          type: :charge_interrupted,
          target: char_name,
          skill: skill_name,
          reason: reason,
          event: format_event(event)
        }
      ]
    }

    {combatant, result}
  end

  defp no_interrupt_result do
    %{interrupted: false, reason: nil, skill_name: nil, turn: nil, log: [], actions: []}
  end

  defp format_event({tag, value}), do: "#{tag}:#{value}"

  defp normalize_limb(limb) when is_atom(limb), do: Atom.to_string(limb)
  defp normalize_limb(limb) when is_binary(limb), do: String.downcase(String.trim(limb))
  defp normalize_limb(limb), do: to_string(limb)

  # ── Brace ──────────────────────────────────────────────────────

  @doc """
  Returns `true` if the combatant is currently charging and therefore
  eligible to use the "brace" defense option instead of dodge/block/counter.
  """
  def can_brace?(combatant) do
    charging = Map.get(combatant, :charging)
    charging != nil and charging != false
  end

  @doc """
  Set the transient brace flag on a combatant. The damage pipeline
  should check `combatant.bracing == true`, halve the incoming damage,
  then call `consume_brace/1` to clear the flag.

  Bracing does NOT cancel the charge — that's the whole point. The
  combatant takes reduced damage and keeps charging.
  """
  def apply_brace(combatant) do
    if can_brace?(combatant) do
      char_name = Map.get(combatant, :name) || "Combatant"
      Logger.info("[ChargeMechanics] #{char_name} braces while charging")
      Map.put(combatant, :bracing, true)
    else
      combatant
    end
  end

  @doc """
  Consume the brace flag after damage has been halved. Returns the
  combatant with `bracing` set to `false`.
  """
  def consume_brace(combatant) do
    Map.put(combatant, :bracing, false)
  end

  @doc """
  Check if the combatant is currently bracing. Used by the damage
  pipeline to decide whether to halve incoming damage.
  """
  def bracing?(combatant) do
    Map.get(combatant, :bracing, false) == true
  end

  @doc """
  Apply brace damage reduction. Call this from the damage pipeline
  when `bracing?/1` returns true. Halves the damage, consumes the
  brace flag, and appends a log entry.

  Returns `{combatant, reduced_damage, result}`.
  """
  def apply_brace_reduction(combatant, damage, result) do
    reduced = max(1, div(damage, 2))
    char_name = Map.get(combatant, :name) || "Combatant"

    log_msg = "#{char_name} braces through the hit! (#{damage} -> #{reduced} damage)"

    result = %{
      result
      | log: [log_msg | Map.get(result, :log, [])],
        actions: [
          %{
            type: :brace_reduction,
            target: char_name,
            original_damage: damage,
            reduced_damage: reduced
          }
          | Map.get(result, :actions, [])
        ]
    }

    combatant = consume_brace(combatant)
    {combatant, reduced, result}
  end

  # ── Charge setup helper ────────────────────────────────────────

  @doc """
  Start a charge on a combatant, optionally recording which limb is
  used. This is a convenience for setting the charging map with the
  `charge_limb` field included.

  `opts` fields:
    - `:skill_id` — the skill being charged (required)
    - `:skill_name` — display name (required)
    - `:turns` — number of turns to charge (required)
    - `:charge_limb` — the limb key used to channel, e.g. "right_arm" (optional)
  """
  def start_charge(combatant, opts) do
    skill_id = Keyword.fetch!(opts, :skill_id)
    skill_name = Keyword.fetch!(opts, :skill_name)
    turns = Keyword.fetch!(opts, :turns)
    charge_limb = Keyword.get(opts, :charge_limb)

    charging = %{
      skill_id: skill_id,
      skill_name: skill_name,
      turns_left: turns,
      charge_limb: charge_limb
    }

    char_name = Map.get(combatant, :name) || "Combatant"

    limb_msg = if charge_limb, do: " (channeling through #{charge_limb})", else: ""
    Logger.info("[ChargeMechanics] #{char_name} begins charging #{skill_name} for #{turns} turns#{limb_msg}")

    Map.put(combatant, :charging, charging)
  end

  @doc """
  Tick a charge down by one turn. If the charge reaches 0 turns,
  sets `charging_fire` to true so the combat pipeline knows to
  release the charged skill this turn.

  Returns `{combatant, :charging | :ready}`.
  """
  def tick_charge(combatant) do
    charging = Map.get(combatant, :charging)

    cond do
      is_nil(charging) or charging == false ->
        {combatant, :no_charge}

      true ->
        turns_left = Map.get(charging, :turns_left, 0) - 1

        if turns_left <= 0 do
          combatant =
            combatant
            |> Map.put(:charging, nil)
            |> Map.put(:charging_fire, true)

          {combatant, :ready}
        else
          charging = Map.put(charging, :turns_left, turns_left)
          combatant = Map.put(combatant, :charging, charging)
          {combatant, :charging}
        end
    end
  end

  @doc """
  Get a list of defense options available to this combatant. Includes
  "brace" if currently charging, in addition to the standard options.

  Returns a list of atoms, e.g. `[:dodge, :block, :counter, :brace]`.
  """
  def defense_options(combatant) do
    base = [:dodge, :block, :counter]

    if can_brace?(combatant) do
      base ++ [:brace]
    else
      base
    end
  end
end
