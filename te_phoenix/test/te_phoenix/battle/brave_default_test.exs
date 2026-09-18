defmodule TePhoenix.Battle.BraveDefaultTest do
  use ExUnit.Case, async: true

  alias TePhoenix.Battle.BraveDefault

  defp base_state(opts \\ []) do
    enabled = Keyword.get(opts, :enable_brave_default, true)
    starting_bp = Keyword.get(opts, :bd_starting_bp, 0)
    max_bp = Keyword.get(opts, :bd_max_bp, 3)
    min_bp = Keyword.get(opts, :bd_min_bp, -3)

    %{
      settings: %{
        enable_brave_default: enabled,
        bd_starting_bp: starting_bp,
        bd_max_bp: max_bp,
        bd_min_bp: min_bp,
        bd_default_defense_bonus: 0.25,
        bd_negative_bp_skip_turn: true
      },
      combatants: %{
        1 => %{id: 1, name: "Warrior", current_hp: 100, knocked_out: false},
        2 => %{id: 2, name: "Rogue", current_hp: 80, knocked_out: false}
      }
    }
  end

  describe "BraveDefault.init_brave_default/1" do
    test "initializes BP, max/min limits, and default flags for all combatants" do
      state = base_state() |> BraveDefault.init_brave_default()

      c1 = state.combatants[1]
      assert c1.bp == 0
      assert c1.bp_max == 3
      assert c1.bp_min == -3
      assert c1.is_defaulting == false
      assert c1.brave_actions == 0
    end

    test "respects custom starting BP configuration" do
      state = base_state(bd_starting_bp: 2) |> BraveDefault.init_brave_default()
      assert state.combatants[1].bp == 2
      assert state.combatants[2].bp == 2
    end

    test "does not mutate combatants when enable_brave_default is false" do
      state = base_state(enable_brave_default: false) |> BraveDefault.init_brave_default()
      refute Map.has_key?(state.combatants[1], :bp)
    end
  end

  describe "BraveDefault.resolve_default/2" do
    test "banks 1 BP and sets is_defaulting true" do
      state = base_state() |> BraveDefault.init_brave_default()
      assert {:ok, new_state, info} = BraveDefault.resolve_default(state, 1)

      c = new_state.combatants[1]
      assert c.bp == 1
      assert c.is_defaulting == true
      assert info.action == :default
      assert info.bp == 1
      assert info.defense_bonus == 0.25
    end

    test "returns error when already at max BP" do
      state = base_state(bd_starting_bp: 3) |> BraveDefault.init_brave_default()
      assert {:error, msg} = BraveDefault.resolve_default(state, 1)
      assert String.contains?(msg, "Already at max BP")
    end

    test "returns error when system is disabled" do
      state = base_state(enable_brave_default: false)
      assert {:error, "Brave/Default system disabled"} = BraveDefault.resolve_default(state, 1)
    end

    test "returns error when combatant is not found" do
      state = base_state() |> BraveDefault.init_brave_default()
      assert {:error, "Combatant not found"} = BraveDefault.resolve_default(state, 999)
    end
  end

  describe "BraveDefault.resolve_brave/3" do
    test "spends 1 BP for 2 actions" do
      state = base_state() |> BraveDefault.init_brave_default()
      assert {:ok, new_state, info} = BraveDefault.resolve_brave(state, 1, 2)

      c = new_state.combatants[1]
      assert c.bp == -1
      assert c.brave_actions == 1
      assert info.action == :brave
      assert info.total_actions == 2
    end

    test "spends 2 BP for 3 actions" do
      state = base_state(bd_starting_bp: 1) |> BraveDefault.init_brave_default()
      assert {:ok, new_state, info} = BraveDefault.resolve_brave(state, 1, 3)

      c = new_state.combatants[1]
      assert c.bp == -1
      assert c.brave_actions == 2
      assert info.total_actions == 3
    end

    test "spends 3 BP for 4 actions when starting with sufficient BP" do
      state = base_state(bd_starting_bp: 3) |> BraveDefault.init_brave_default()
      assert {:ok, new_state, info} = BraveDefault.resolve_brave(state, 1, 4)

      c = new_state.combatants[1]
      assert c.bp == 0
      assert c.brave_actions == 3
      assert info.total_actions == 4
    end

    test "clears is_defaulting when braving" do
      state = base_state(bd_starting_bp: 1) |> BraveDefault.init_brave_default()
      {:ok, state, _} = BraveDefault.resolve_default(state, 1)
      assert state.combatants[1].is_defaulting == true

      {:ok, state, _} = BraveDefault.resolve_brave(state, 1, 2)
      assert state.combatants[1].is_defaulting == false
    end

    test "rejects braving if result would drop below min_bp" do
      state = base_state(bd_starting_bp: -2, bd_min_bp: -3) |> BraveDefault.init_brave_default()
      # Spending 2 BP (3 actions) would drop to -4, below min_bp of -3
      assert {:error, msg} = BraveDefault.resolve_brave(state, 1, 3)
      assert String.contains?(msg, "Not enough BP")
    end

    test "clamps requested count to maximum of 4 actions" do
      state = base_state(bd_starting_bp: 3) |> BraveDefault.init_brave_default()
      assert {:ok, _new_state, info} = BraveDefault.resolve_brave(state, 1, 10)
      assert info.total_actions == 4
    end

    test "returns error when combatant does not exist" do
      state = base_state() |> BraveDefault.init_brave_default()
      assert {:error, "Combatant not found"} = BraveDefault.resolve_brave(state, 404, 2)
    end
  end

  describe "Brave action consumption and querying" do
    test "has_brave_actions? returns true when brave_actions > 0" do
      state = base_state() |> BraveDefault.init_brave_default()
      {:ok, state, _} = BraveDefault.resolve_brave(state, 1, 3)
      assert BraveDefault.has_brave_actions?(state, 1) == true
      assert BraveDefault.has_brave_actions?(state, 2) == false
    end

    test "consume_brave_action decrements queued actions" do
      state = base_state() |> BraveDefault.init_brave_default()
      {:ok, state, _} = BraveDefault.resolve_brave(state, 1, 3)
      assert state.combatants[1].brave_actions == 2

      state = BraveDefault.consume_brave_action(state, 1)
      assert state.combatants[1].brave_actions == 1

      state = BraveDefault.consume_brave_action(state, 1)
      assert state.combatants[1].brave_actions == 0

      # Consuming past zero clamps at zero
      state = BraveDefault.consume_brave_action(state, 1)
      assert state.combatants[1].brave_actions == 0
    end

    test "consume_brave_action returns state unchanged for unknown combatant" do
      state = base_state() |> BraveDefault.init_brave_default()
      assert BraveDefault.consume_brave_action(state, 999) == state
    end
  end

  describe "BraveDefault.must_skip_turn?/2" do
    test "returns true when BP is negative" do
      state = base_state() |> BraveDefault.init_brave_default()
      {:ok, state, _} = BraveDefault.resolve_brave(state, 1, 2)
      assert state.combatants[1].bp == -1
      assert BraveDefault.must_skip_turn?(state, 1) == true
    end

    test "returns false when BP is zero or positive" do
      state = base_state(bd_starting_bp: 1) |> BraveDefault.init_brave_default()
      assert BraveDefault.must_skip_turn?(state, 1) == false
    end

    test "returns false when unknown combatant or disabled" do
      state = base_state(enable_brave_default: false)
      assert BraveDefault.must_skip_turn?(state, 1) == false
      assert BraveDefault.must_skip_turn?(state, 999) == false
    end
  end

  describe "BraveDefault.tick_bp/2" do
    test "restores 1 BP when negative" do
      state = base_state() |> BraveDefault.init_brave_default()
      {:ok, state, _} = BraveDefault.resolve_brave(state, 1, 3)
      assert state.combatants[1].bp == -2

      state = BraveDefault.tick_bp(state, 1)
      assert state.combatants[1].bp == -1

      state = BraveDefault.tick_bp(state, 1)
      assert state.combatants[1].bp == 0
    end

    test "clears is_defaulting and brave_actions on turn tick" do
      state = base_state() |> BraveDefault.init_brave_default()
      {:ok, state, _} = BraveDefault.resolve_default(state, 1)
      assert state.combatants[1].is_defaulting == true

      state = BraveDefault.tick_bp(state, 1)
      assert state.combatants[1].is_defaulting == false
      assert state.combatants[1].brave_actions == 0
    end

    test "does not modify knocked out combatant" do
      state = base_state() |> BraveDefault.init_brave_default()
      c = %{state.combatants[1] | knocked_out: true, current_hp: 0, bp: -2}
      state = %{state | combatants: Map.put(state.combatants, 1, c)}

      state = BraveDefault.tick_bp(state, 1)
      assert state.combatants[1].bp == -2
    end
  end

  describe "BraveDefault.default_defense_bonus/2" do
    test "returns configured defense bonus when defaulting" do
      state = base_state() |> BraveDefault.init_brave_default()
      {:ok, state, _} = BraveDefault.resolve_default(state, 1)
      assert BraveDefault.default_defense_bonus(state, 1) == 0.25
    end

    test "returns 0 when not defaulting" do
      state = base_state() |> BraveDefault.init_brave_default()
      assert BraveDefault.default_defense_bonus(state, 1) == 0
    end
  end
end
