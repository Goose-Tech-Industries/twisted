defmodule TePhoenix.Game.LevelUpTest do
  use ExUnit.Case, async: false

  alias TePhoenix.Game.LevelUp

  describe "LevelUp.allocate_ap/2 input validations" do
    test "rejects unrecognized stat keys" do
      result = LevelUp.allocate_ap(1, %{"fake_stat" => 2})
      assert {:error, msg} = result
      assert String.contains?(msg, "Invalid stats: fake_stat")
    end

    test "rejects multiple invalid stat keys" do
      result = LevelUp.allocate_ap(1, %{"fake_1" => 2, "fake_2" => 3})
      assert {:error, msg} = result
      assert String.contains?(msg, "Invalid stats")
    end

    test "rejects negative integer allocation values" do
      result = LevelUp.allocate_ap(1, %{"atk" => -2})
      assert {:error, "All allocation values must be non-negative integers."} = result
    end

    test "rejects floating point allocation values" do
      result = LevelUp.allocate_ap(1, %{"atk" => 2.5})
      assert {:error, "All allocation values must be non-negative integers."} = result
    end

    test "rejects string allocation values" do
      result = LevelUp.allocate_ap(1, %{"atk" => "three"})
      assert {:error, "All allocation values must be non-negative integers."} = result
    end

    test "rejects zero total points spent" do
      result = LevelUp.allocate_ap(1, %{"atk" => 0, "def" => 0})
      assert {:error, "No points allocated."} = result
    end

    test "accepts valid stat keys (atk, def, mo, md, speed, luck, hp, mp)" do
      # All stats are valid keys, even if char doesn't exist in DB (will return DB error or insufficient AP, not invalid stat error)
      valid_stats = %{"atk" => 1, "def" => 1, "mo" => 1, "md" => 1, "speed" => 1, "luck" => 1, "hp" => 1, "mp" => 1}
      case LevelUp.allocate_ap(999_999, valid_stats) do
        {:error, msg} ->
          refute String.contains?(msg, "Invalid stats")
          refute String.contains?(msg, "non-negative")
        _ ->
          :ok
      end
    end
  end
end
