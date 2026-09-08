defmodule TePhoenix.World.GodsEyeTest do
  use ExUnit.Case, async: false

  alias TePhoenix.World.{GodsEye, AutonomousSociety}
  alias TePhoenix.AI.{DreamCycle, Providers.SomaticVoice}

  setup do
    :ok = Ecto.Adapters.SQL.Sandbox.checkout(TePhoenix.Repo)
    :ok
  end

  describe "God's Eye Surveillance Grid" do
    test "scan_realm gathers players, npcs, maps, and predictive alerts" do
      scan = GodsEye.scan_realm()

      assert is_list(scan.players)
      assert is_list(scan.npcs)
      assert is_list(scan.maps)
      assert is_list(scan.critical_events)
      assert is_integer(scan.total_tracked)
    end

    test "orbital_strike broadcasts lightning impact event" do
      result = GodsEye.orbital_strike(1, 15, 20, damage: 1000)

      assert result.status == :ok
      assert result.action == :orbital_strike
      assert result.coords == {15, 20}
    end

    test "orbital_supply_drop broadcasts celestial cache event" do
      result = GodsEye.orbital_supply_drop(1, 12, 14)

      assert result.status == :ok
      assert result.action == :supply_drop
      assert result.coords == {12, 14}
    end

    test "orbital_whisper broadcasts direct divine transmission" do
      result = GodsEye.orbital_whisper(99, "Uile sees all.")

      assert result.status == :ok
      assert result.action == :orbital_whisper
      assert result.message == "Uile sees all."
    end
  end

  describe "Autonomous Living Society" do
    test "tick executes an autonomous emergent interaction" do
      {:ok, event} = AutonomousSociety.tick()

      assert is_binary(event.text)
      assert event.category in [:commerce, :diplomacy, :skirmish, :lore, :travel]
    end

    test "recent_events retrieves emergent event logs" do
      events = AutonomousSociety.recent_events()
      assert is_list(events)
    end

    test "territory_matrix tracks territorial influence across maps" do
      matrix = AutonomousSociety.territory_matrix()

      assert is_map(matrix)
      assert Map.has_key?(matrix, 1)
      assert is_binary(matrix[1].dominant)
      assert is_integer(matrix[1].influence)
    end

    test "shift_influence shifts regional power and triggers hegemony transition" do
      # Shift Map 1 away from Iron Vanguard to Ashveil Syndicate
      {:ok, updated} = AutonomousSociety.shift_influence(1, "Ashveil Syndicate", 30)

      assert updated.map_id == 1
      assert is_binary(updated.dominant)
      assert is_integer(updated.influence)
    end
  end

  describe "Nightly Dream Cycle & Memory Consolidation" do
    test "process_night_cycle consolidates dreams across active NPCs" do
      {:ok, receipts} = DreamCycle.process_night_cycle()

      assert is_list(receipts)
    end
  end

  describe "Somatic Living Voice Modulator" do
    test "modulates vocal cadence and stability for high pain" do
      text = "I will stand my ground."
      emotional = %{"fear" => 20, "anger" => 10}
      somatic = %{"pain" => 80}

      {mod_text, profile} = SomaticVoice.apply_somatic_cadence(text, emotional, somatic)

      assert String.contains?(mod_text, "agony") or String.contains?(mod_text, "gasp")
      assert profile.stability < 0.50
      assert profile.somatic_pain == 80
    end

    test "modulates vocal cadence for intense rage" do
      text = "You will pay for this betrayal."
      emotional = %{"anger" => 90}
      somatic = %{}

      {mod_text, profile} = SomaticVoice.apply_somatic_cadence(text, emotional, somatic)

      assert String.contains?(mod_text, "snarl") or String.contains?(mod_text, "!")
      assert profile.stability > 0.50
    end
  end
end
