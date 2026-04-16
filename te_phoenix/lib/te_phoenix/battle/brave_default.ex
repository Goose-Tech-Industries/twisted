defmodule TePhoenix.Battle.BraveDefault do
  @moduledoc """
  Brave/Default turn banking system.
  Ported from te/battle/bravedefault.js

  DEFAULT: Skip turn → bank 1 BP → +25% defense while defaulting
  BRAVE: Spend BP for extra actions (up to 4 total, can go negative -3)
  Negative BP → forced turn skips until repaid
  """

  # alias TePhoenix.Battle.Combatant

  @doc "Initialize BP for all combatants"
  def init_brave_default(state) do
    settings = state.settings
    if not settings[:enable_brave_default] do
      state
    else
      starting_bp = settings[:bd_starting_bp] || 0

      combatants =
        Enum.reduce(state.combatants, state.combatants, fn {id, c}, combs ->
          c = c
          |> Map.put(:bp, starting_bp)
          |> Map.put(:bp_max, settings[:bd_max_bp] || 3)
          |> Map.put(:bp_min, settings[:bd_min_bp] || -3)
          |> Map.put(:is_defaulting, false)
          |> Map.put(:brave_actions, 0)

          Map.put(combs, id, c)
        end)

      %{state | combatants: combatants}
    end
  end

  @doc "Resolve DEFAULT action: bank 1 BP, skip action, gain defense"
  def resolve_default(state, combatant_id) do
    settings = state.settings
    if not settings[:enable_brave_default] do
      {:error, "Brave/Default system disabled"}
    else
      case Map.get(state.combatants, combatant_id) do
        nil -> {:error, "Combatant not found"}
        c ->
          max_bp = Map.get(c, :bp_max, 3)
          if c.bp >= max_bp do
            {:error, "Already at max BP (#{max_bp})"}
          else
            new_bp = min(max_bp, c.bp + 1)
            def_bonus = settings[:bd_default_defense_bonus] || 0.25

            c = %{c | bp: new_bp}
            c = Map.put(c, :is_defaulting, true)
            state = %{state | combatants: Map.put(state.combatants, combatant_id, c)}

            {:ok, state, %{
              action: :default,
              combatant: c.name,
              bp: new_bp,
              defense_bonus: def_bonus,
              message: "#{c.name} defaults! BP: #{new_bp}/#{max_bp} (+#{round(def_bonus * 100)}% defense this turn)"
            }}
          end
      end
    end
  end

  @doc "Resolve BRAVE action: spend BP for extra actions"
  def resolve_brave(state, combatant_id, count \\ 1) do
    settings = state.settings
    if not settings[:enable_brave_default] do
      {:error, "Brave/Default system disabled"}
    else
      case Map.get(state.combatants, combatant_id) do
        nil -> {:error, "Combatant not found"}
        c ->
          requested = max(1, min(4, count))
          bp_cost = requested - 1  # First action is free
          min_bp = Map.get(c, :bp_min, -3)
          new_bp = c.bp - bp_cost

          if new_bp < min_bp do
            max_actions = c.bp - min_bp + 1
            {:error, "Not enough BP. Max actions: #{max_actions}"}
          else
            c = %{c | bp: new_bp}
            c = Map.put(c, :brave_actions, requested - 1)
            c = Map.put(c, :is_defaulting, false)
            state = %{state | combatants: Map.put(state.combatants, combatant_id, c)}

            {:ok, state, %{
              action: :brave,
              combatant: c.name,
              bp: new_bp,
              total_actions: requested,
              message: "#{c.name} braves for #{requested} action#{if requested > 1, do: "s", else: ""}! BP: #{new_bp}"
            }}
          end
      end
    end
  end

  @doc "Check if combatant has queued brave actions remaining"
  def has_brave_actions?(state, combatant_id) do
    if not state.settings[:enable_brave_default], do: false
    case Map.get(state.combatants, combatant_id) do
      nil -> false
      c -> Map.get(c, :brave_actions, 0) > 0
    end
  end

  @doc "Consume one brave action"
  def consume_brave_action(state, combatant_id) do
    case Map.get(state.combatants, combatant_id) do
      nil -> state
      c ->
        brave = max(0, Map.get(c, :brave_actions, 0) - 1)
        c = Map.put(c, :brave_actions, brave)
        %{state | combatants: Map.put(state.combatants, combatant_id, c)}
    end
  end

  @doc "Check if combatant must skip turn (negative BP)"
  def must_skip_turn?(state, combatant_id) do
    settings = state.settings
    if not settings[:enable_brave_default] or (settings[:bd_negative_bp_skip_turn] == false) do
      false
    else
      case Map.get(state.combatants, combatant_id) do
        nil -> false
        c -> c.bp < 0
      end
    end
  end

  @doc "Tick BP at start of turn: restore 1 if negative, clear default state"
  def tick_bp(state, combatant_id) do
    settings = state.settings
    if not settings[:enable_brave_default] do
      state
    else
      case Map.get(state.combatants, combatant_id) do
        nil -> state
        c ->
          if c.current_hp <= 0 or c.knocked_out do
            state
          else
            c = Map.put(c, :is_defaulting, false)
            c = Map.put(c, :brave_actions, 0)

            # If negative BP, restore 1 per skipped turn
            c = if c.bp < 0, do: %{c | bp: c.bp + 1}, else: c

            # Optional auto-regen
            regen = settings[:bd_bp_regen_per_turn] || 0
            c = if regen > 0 and c.bp >= 0 do
              max_bp = Map.get(c, :bp_max, 3)
              %{c | bp: min(max_bp, c.bp + regen)}
            else
              c
            end

            %{state | combatants: Map.put(state.combatants, combatant_id, c)}
          end
      end
    end
  end

  @doc "Get defense modifier from defaulting"
  def default_defense_bonus(state, combatant_id) do
    settings = state.settings
    if not settings[:enable_brave_default] do
      0
    else
      case Map.get(state.combatants, combatant_id) do
        nil -> 0
        c -> if Map.get(c, :is_defaulting, false), do: settings[:bd_default_defense_bonus] || 0.25, else: 0
      end
    end
  end
end
