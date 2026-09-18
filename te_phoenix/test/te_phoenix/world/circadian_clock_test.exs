defmodule TePhoenix.World.CircadianClockTest do
  use ExUnit.Case, async: false

  alias TePhoenix.World.CircadianClock

  describe "CircadianClock.night?/1 pure phase checks" do
    test "recognizes dusk as night" do
      assert CircadianClock.night?("dusk") == true
      assert CircadianClock.night?(:dusk) == true
    end

    test "recognizes night as night" do
      assert CircadianClock.night?("night") == true
      assert CircadianClock.night?(:night) == true
    end

    test "recognizes midnight as night" do
      assert CircadianClock.night?("midnight") == true
      assert CircadianClock.night?(:midnight) == true
    end

    test "recognizes witching_hour as night" do
      assert CircadianClock.night?("witching_hour") == true
    end

    test "recognizes day as not night" do
      assert CircadianClock.night?("day") == false
      assert CircadianClock.night?(:day) == false
    end

    test "recognizes dawn as not night" do
      assert CircadianClock.night?("dawn") == false
      assert CircadianClock.night?(:dawn) == false
    end

    test "is case-insensitive for phase names" do
      assert CircadianClock.night?("NIGHT") == true
      assert CircadianClock.night?("DUSK") == true
      assert CircadianClock.night?("DAY") == false
    end
  end

  describe "CircadianClock phase transitions and queries" do
    test "current_time_of_day returns a valid phase string" do
      phase = CircadianClock.current_time_of_day(1)
      assert phase in ["dawn", "day", "dusk", "night", "midnight"]
    end

    test "set_time_of_day sets valid phases" do
      assert {:ok, "night"} = CircadianClock.set_time_of_day("night", 1)
      assert CircadianClock.current_time_of_day(1) == "night"

      assert {:ok, "dawn"} = CircadianClock.set_time_of_day("dawn", 1)
      assert CircadianClock.current_time_of_day(1) == "dawn"
    end

    test "set_time_of_day rejects invalid phase with error" do
      assert {:error, :invalid_phase} = CircadianClock.set_time_of_day("apocalypse_now", 1)
      assert {:error, :invalid_phase} = CircadianClock.set_time_of_day("", 1)
    end

    test "advance_phase cycles to next phase in order" do
      CircadianClock.set_time_of_day("dawn", 1)
      assert {:ok, "day"} = CircadianClock.advance_phase(1)
      assert {:ok, "dusk"} = CircadianClock.advance_phase(1)
      assert {:ok, "night"} = CircadianClock.advance_phase(1)
      assert {:ok, "midnight"} = CircadianClock.advance_phase(1)
      assert {:ok, "dawn"} = CircadianClock.advance_phase(1)
    end

    test "different map IDs maintain distinct phases" do
      CircadianClock.set_time_of_day("night", 10)
      CircadianClock.set_time_of_day("day", 20)

      assert CircadianClock.current_time_of_day(10) == "night"
      assert CircadianClock.current_time_of_day(20) == "day"
    end
  end
end
