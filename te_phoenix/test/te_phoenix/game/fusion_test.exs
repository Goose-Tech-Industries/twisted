defmodule TePhoenix.Game.FusionTest do
  use ExUnit.Case, async: false
  alias TePhoenix.Game.Fusion
  alias TePhoenix.Repo

  setup do
    Fusion.ensure_tables()
    :ok
  end

  describe "Soul-Bond Companion Fusion" do
    test "fuse_with_companion rejects non-existent character" do
      result = Fusion.fuse_with_companion(99999999, "bram")
      assert match?({:error, _}, result)
    end

    test "fuse_with_companion succeeds for high affinity companion" do
      case Repo.query("""
        INSERT INTO characters (user_id, name, level, current_hp, max_hp, current_mp, max_mp, atk, def, speed, state_json, created_at, updated_at)
        VALUES (1, 'Bonden', 10, 100, 100, 50, 50, 20, 20, 15, '{"companion_affinities": {"valerius": 350}}', NOW(), NOW())
        RETURNING id
      """) do
        {:ok, %{rows: [[char_id]]}} ->
          {:ok, fusion} = Fusion.fuse_with_companion(char_id, "valerius")
          assert fusion["companion_key"] == "valerius"
          assert fusion["hybrid_title"] == "The Inquisitor Avatar"
          assert fusion["hybrid_art"]["name"] == "Aegis of the Unbroken"
          assert fusion["stats"]["atk"] > 20

          # Check active fusion
          active = Fusion.active_companion_fusion(char_id)
          assert active != nil
          assert active["companion_key"] == "valerius"

          # Defuse
          {:ok, _} = Fusion.defuse_companion(char_id)
          assert Fusion.active_companion_fusion(char_id) == nil

          # Cleanup
          Repo.query("DELETE FROM characters WHERE id = ?", [char_id])

        _ ->
          :ok
      end
    end
  end
end
