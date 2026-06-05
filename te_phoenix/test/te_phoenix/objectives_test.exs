defmodule TePhoenix.ObjectivesTest do
  use ExUnit.Case, async: false

  alias TePhoenix.Objectives.Registry

  @ets_defs :twisted_objective_defs

  setup do
    case :ets.info(@ets_defs) do
      :undefined -> :ets.new(@ets_defs, [:set, :public, :named_table, read_concurrency: true])
      _ -> :ok
    end

    :ets.delete_all_objects(@ets_defs)

    seed_def(%{
      key: "test_switch",
      name: "Test Switch",
      icon: "🔧",
      type: "interact",
      progress_model: "boolean",
      target_value: 1,
      team_owned: false,
      respawn_seconds: 0,
      on_progress: %{},
      on_complete: %{},
      on_fail: %{},
      settings: %{},
      enabled: true
    })

    seed_def(%{
      key: "test_tower",
      name: "Test Tower",
      icon: "🏰",
      type: "destroy",
      progress_model: "hp",
      target_value: 100,
      team_owned: true,
      respawn_seconds: 0,
      on_progress: %{},
      on_complete: %{},
      on_fail: %{},
      settings: %{},
      enabled: true
    })

    seed_def(%{
      key: "test_generator",
      name: "Test Generator",
      icon: "⚡",
      type: "hold",
      progress_model: "timer",
      target_value: 10,
      team_owned: false,
      respawn_seconds: 30,
      on_progress: %{},
      on_complete: %{},
      on_fail: %{},
      settings: %{"regress_on_cancel" => true, "regress_rate" => 1.0},
      enabled: true
    })

    seed_def(%{
      key: "test_collect",
      name: "Test Collect",
      icon: "📦",
      type: "collect",
      progress_model: "counter",
      target_value: 5,
      team_owned: false,
      respawn_seconds: 0,
      on_progress: %{},
      on_complete: %{},
      on_fail: %{},
      settings: %{},
      enabled: true
    })

    :ok
  end

  describe "Registry.get_def/1" do
    test "returns definition by key" do
      assert %{key: "test_switch", type: "interact"} = Registry.get_def("test_switch")
    end

    test "returns nil for unknown key" do
      assert nil == Registry.get_def("nonexistent")
    end
  end

  describe "Registry.list_defs/0" do
    test "returns all seeded definitions" do
      defs = Registry.list_defs()
      keys = Enum.map(defs, & &1.key)
      assert "test_switch" in keys
      assert "test_tower" in keys
      assert "test_generator" in keys
      assert "test_collect" in keys
    end
  end

  describe "definition data integrity" do
    test "hp-type objective has correct target_value" do
      d = Registry.get_def("test_tower")
      assert d.progress_model == "hp"
      assert d.target_value == 100
      assert d.team_owned == true
    end

    test "timer-type objective has settings" do
      d = Registry.get_def("test_generator")
      assert d.progress_model == "timer"
      assert d.target_value == 10
      assert d.settings["regress_on_cancel"] == true
    end
  end

  defp seed_def(d), do: :ets.insert(@ets_defs, {d.key, d})
end
