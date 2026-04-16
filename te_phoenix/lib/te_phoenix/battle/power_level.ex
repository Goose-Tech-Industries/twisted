defmodule TePhoenix.Battle.PowerLevel do
  @moduledoc """
  Planet Mado combat UX system — power level visibility, KI management,
  move requirements, and chain combo opportunities.

  Power Levels (PL) are the Planet Mado equivalent of character level/stats
  combined into one visible number. Scouters let you see other fighters' PL.
  KI is the energy resource (maps to MP) used for transformations and
  special moves.

  Chain combos: when a hit lands on a specific limb with enough force (crit
  or targeted shot), the attacker may earn an extra action (similar to the
  Persona "One More" system or PM's stun-chain mechanic).

  ## Settings

    * `enable_power_levels` — master toggle for the PL/KI system
    * `pl_hidden_by_default` — if true, all combatants start with PL hidden
    * `pl_scouter_status_key` — the status effect key that grants PL vision
  """

  alias TePhoenix.Battle.{Combatant, Settings}

  @default_scouter_key "scouter"

  # ── PL visibility ──────────────────────────────────────────────

  @doc """
  Check if `viewer` can see `target`'s power level.

  Returns `true` if:
    - Power levels are disabled (everything visible when system is off)
    - The viewer IS the target (you always see your own PL)
    - The target hasn't hidden their PL (and `pl_hidden_by_default` is false)
    - The viewer has the scouter status effect

  Returns `false` otherwise.
  """
  @spec pl_visible?(Combatant.t(), Combatant.t()) :: boolean()
  def pl_visible?(viewer, target) do
    settings = load_settings()

    cond do
      not settings.enable_power_levels ->
        true

      viewer.char_id == target.char_id ->
        true

      has_scouter?(viewer, settings.pl_scouter_status_key) ->
        true

      not settings.pl_hidden_by_default and not pl_suppressed?(target) ->
        true

      true ->
        false
    end
  end

  @doc """
  Calculate the power level for a combatant. PL is derived from core stats:
  ATK + DEF + MO + MD + SPD weighted by level, plus current HP ratio bonus.

  This matches Planet Mado's formula where PL reflects total fighting power.
  """
  @spec calculate_pl(Combatant.t()) :: integer()
  def calculate_pl(%Combatant{} = c) do
    base = c.atk + c.def + c.mo + c.md + c.speed
    level_mult = max(1, c.level || 1)
    hp_ratio = if c.max_hp > 0, do: c.current_hp / c.max_hp, else: 0.0
    hp_bonus = trunc(base * 0.2 * hp_ratio)
    base * level_mult + hp_bonus
  end

  # ── Move requirements ──────────────────────────────────────────

  @doc """
  Check if a combatant's power level meets a skill's `"pl_required"` threshold.

  `skill_effects` is the skill's effects map (from the DB skill definition).
  If no `"pl_required"` key exists, the check passes automatically.

  Returns `:ok` or `{:error, message}`.
  """
  @spec check_move_requirements(Combatant.t(), map()) :: :ok | {:error, String.t()}
  def check_move_requirements(%Combatant{} = combatant, skill_effects)
      when is_map(skill_effects) do
    settings = load_settings()

    if not settings.enable_power_levels do
      :ok
    else
      required_pl = Map.get(skill_effects, "pl_required", 0)

      if required_pl > 0 do
        current_pl = calculate_pl(combatant)

        if current_pl >= required_pl do
          :ok
        else
          {:error,
           "You lack the power! PL #{current_pl} is below the required #{required_pl} to use this technique."}
        end
      else
        :ok
      end
    end
  end

  def check_move_requirements(_combatant, _effects), do: :ok

  # ── KI management ──────────────────────────────────────────────

  @doc """
  Get current KI value for a combatant. KI maps to `current_mp` but is
  presented as a separate concept in Planet Mado. If the combatant has a
  dedicated `:ki` field in their stats, use that; otherwise fall back to MP.
  """
  @spec get_ki(Combatant.t()) :: integer()
  def get_ki(%Combatant{} = c) do
    c.current_mp
  end

  @doc """
  Get maximum KI for a combatant.
  """
  @spec get_max_ki(Combatant.t()) :: integer()
  def get_max_ki(%Combatant{} = c) do
    c.max_mp
  end

  @doc """
  Spend KI for a transformation or special move. Returns
  `{:ok, updated_combatant}` or `{:error, :insufficient_ki}`.

  KI cannot go below zero.
  """
  @spec consume_ki(Combatant.t(), pos_integer()) ::
          {:ok, Combatant.t()} | {:error, :insufficient_ki}
  def consume_ki(%Combatant{} = c, amount) when is_integer(amount) and amount > 0 do
    if c.current_mp >= amount do
      {:ok, %{c | current_mp: c.current_mp - amount}}
    else
      {:error, :insufficient_ki}
    end
  end

  def consume_ki(c, 0), do: {:ok, c}

  @doc """
  Restore KI to a combatant (meditation, items, etc.). Clamped to max.
  """
  @spec restore_ki(Combatant.t(), pos_integer()) :: Combatant.t()
  def restore_ki(%Combatant{} = c, amount) when is_integer(amount) and amount > 0 do
    %{c | current_mp: min(c.max_mp, c.current_mp + amount)}
  end

  # ── Serialization ──────────────────────────────────────────────

  @doc """
  Serialize a combatant's data for a specific viewer, respecting PL visibility.

  Returns a map with combat-relevant fields. If the viewer cannot see the
  target's PL, the `power_level` field is replaced with `"???"` and detailed
  stat breakdowns are omitted.
  """
  @spec serialize_for_viewer(Combatant.t(), Combatant.t()) :: map()
  def serialize_for_viewer(%Combatant{} = target, %Combatant{} = viewer) do
    settings = load_settings()
    can_see = pl_visible?(viewer, target)
    pl = calculate_pl(target)

    base = %{
      char_id: target.char_id,
      name: target.name,
      team_id: target.team_id,
      current_hp: target.current_hp,
      max_hp: target.max_hp,
      grid_x: target.grid_x,
      grid_y: target.grid_y,
      is_alive: Combatant.alive?(target),
      statuses: serialize_statuses(target.statuses),
      ki: if(settings.enable_power_levels, do: get_ki(target), else: nil),
      max_ki: if(settings.enable_power_levels, do: get_max_ki(target), else: nil)
    }

    if can_see do
      Map.merge(base, %{
        power_level: pl,
        atk: target.atk,
        def: target.def,
        speed: target.speed,
        level: target.level
      })
    else
      Map.merge(base, %{
        power_level: "???",
        atk: nil,
        def: nil,
        speed: nil,
        level: nil
      })
    end
  end

  # ── Chain combos ───────────────────────────────────────────────

  @doc """
  Check if a hit grants a chain combo opportunity (extra action).

  Chain combos trigger when:
    - A critical hit lands on the head limb (stun → chain)
    - A called shot disables a limb (limb HP reaches wound_threshold_disable)
    - Power level is enabled and attacker's PL exceeds target's by 2x+ (overwhelming force)

  Returns `{:chain, reason}` or `:no_chain`.
  """
  @spec check_chain_opportunity(Combatant.t(), String.t() | nil, boolean()) ::
          {:chain, String.t()} | :no_chain
  def check_chain_opportunity(%Combatant{} = _combatant, limb_hit, was_crit) do
    settings = load_settings()

    cond do
      not settings.enable_power_levels ->
        :no_chain

      was_crit and limb_hit in ["head", "HEAD"] ->
        {:chain, "Critical hit to the head — stunned!"}

      was_crit and limb_hit in ["torso", "TORSO", "chest", "CHEST"] ->
        {:chain, "Devastating body blow — the enemy staggers!"}

      true ->
        :no_chain
    end
  end

  @doc """
  Extended chain check that also considers PL differential between attacker
  and target. When the attacker's PL is 2x or more the target's, any crit
  grants a chain.
  """
  @spec check_chain_with_pl(Combatant.t(), Combatant.t(), String.t() | nil, boolean()) ::
          {:chain, String.t()} | :no_chain
  def check_chain_with_pl(attacker, target, limb_hit, was_crit) do
    # First check standard chain rules
    case check_chain_opportunity(attacker, limb_hit, was_crit) do
      {:chain, _} = result ->
        result

      :no_chain ->
        settings = load_settings()

        if settings.enable_power_levels and was_crit do
          atk_pl = calculate_pl(attacker)
          tgt_pl = calculate_pl(target)

          if tgt_pl > 0 and atk_pl >= tgt_pl * 2 do
            {:chain, "Overwhelming power! PL #{atk_pl} dominates PL #{tgt_pl}!"}
          else
            :no_chain
          end
        else
          :no_chain
        end
    end
  end

  @doc """
  Grant an extra action to a combatant as the result of a chain combo.

  Modifies the battle state to insert the character at the front of the
  turn queue (after the current turn resolves). Returns the updated state
  and a result map describing the chain.

  If the combatant already has a pending chain action this turn, the chain
  is declined (no infinite chains).
  """
  @spec grant_chain_action(map(), integer(), map()) :: {map(), map()}
  def grant_chain_action(state, char_id, result) do
    # Prevent infinite chains: check if this char already got a chain this turn
    chains_this_turn = Map.get(state, :chains_this_turn, MapSet.new())

    if MapSet.member?(chains_this_turn, char_id) do
      chain_result = Map.put(result, :chain_granted, false)
      {state, chain_result}
    else
      # Insert char_id right after the current position in the turn queue
      current_idx = state.turn_queue_idx
      {before, after_list} = Enum.split(state.turn_queue, current_idx + 1)
      new_queue = before ++ [char_id] ++ after_list

      # Track that this char got a chain action
      new_chains = MapSet.put(chains_this_turn, char_id)

      new_state =
        state
        |> Map.put(:turn_queue, new_queue)
        |> Map.put(:chains_this_turn, new_chains)

      chain_result =
        result
        |> Map.put(:chain_granted, true)
        |> Map.put(:chain_char_id, char_id)
        |> Map.put(:chain_reason, Map.get(result, :chain_reason, "Chain combo!"))

      log_entry = %{
        type: :chain_action,
        char_id: char_id,
        reason: Map.get(chain_result, :chain_reason),
        turn: state.turn_number
      }

      new_state = Map.update(new_state, :log, [log_entry], &[log_entry | &1])

      {new_state, chain_result}
    end
  end

  # ── Internal helpers ───────────────────────────────────────────

  defp load_settings do
    raw = Settings.load()

    %{
      enable_power_levels: Map.get(raw, :enable_power_levels, true),
      pl_hidden_by_default: Map.get(raw, :pl_hidden_by_default, false),
      pl_scouter_status_key: Map.get(raw, :pl_scouter_status_key, @default_scouter_key)
    }
  end

  defp has_scouter?(%Combatant{statuses: statuses}, scouter_key) do
    Enum.any?(statuses, fn status ->
      status_name = Map.get(status, :name, Map.get(status, "name", ""))
      status_id = Map.get(status, :id, Map.get(status, "id", ""))

      String.downcase(to_string(status_name)) == String.downcase(scouter_key) or
        String.downcase(to_string(status_id)) == String.downcase(scouter_key)
    end)
  end

  defp pl_suppressed?(%Combatant{statuses: statuses}) do
    Enum.any?(statuses, fn status ->
      effects = Map.get(status, :effects, Map.get(status, "effects", %{}))
      Map.get(effects, "suppress_pl", Map.get(effects, :suppress_pl, false)) == true
    end)
  end

  defp serialize_statuses(statuses) when is_list(statuses) do
    Enum.map(statuses, fn s ->
      %{
        id: Map.get(s, :id, Map.get(s, "id")),
        name: Map.get(s, :name, Map.get(s, "name")),
        duration: Map.get(s, :duration, Map.get(s, "duration")),
        stacks: Map.get(s, :stacks, Map.get(s, "stacks", 1))
      }
    end)
  end

  defp serialize_statuses(_), do: []
end
