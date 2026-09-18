defmodule TePhoenix.CapabilitiesTest do
  use ExUnit.Case, async: false

  alias TePhoenix.Capabilities

  describe "Capabilities.built_in_modules/0 manifests" do
    test "returns a non-empty list of capability manifests" do
      mods = Capabilities.built_in_modules()
      assert is_list(mods)
      assert length(mods) >= 12
    end

    test "all manifests have valid required keys" do
      required_keys = [:id, :name, :description, :version, :default_enabled, :provides, :genres]

      for m <- Capabilities.built_in_modules() do
        for key <- required_keys do
          assert Map.has_key?(m, key), "Module #{inspect(m[:id])} missing #{key}"
        end
      end
    end

    test "all module ids are unique atoms" do
      ids = Enum.map(Capabilities.built_in_modules(), & &1.id)
      assert length(ids) == length(Enum.uniq(ids))
      assert Enum.all?(ids, &is_atom/1)
    end

    test "all module names and descriptions are non-empty strings" do
      for m <- Capabilities.built_in_modules() do
        assert is_binary(m.name) and String.length(m.name) > 0
        assert is_binary(m.description) and String.length(m.description) > 0
        assert is_binary(m.version) and String.match?(m.version, ~r/^\d+\.\d+\.\d+/)
      end
    end

    test "all modules provide at least one capability feature symbol" do
      for m <- Capabilities.built_in_modules() do
        assert is_list(m.provides)
        assert length(m.provides) > 0
        assert Enum.all?(m.provides, &is_atom/1)
      end
    end

    test "all module genres are non-empty lists of atoms" do
      for m <- Capabilities.built_in_modules() do
        assert is_list(m.genres)
        assert length(m.genres) > 0
        assert Enum.all?(m.genres, &is_atom/1)
      end
    end

    test "core combat, inventory, and dialogue modules are present" do
      ids = Enum.map(Capabilities.built_in_modules(), & &1.id)
      assert :combat in ids
      assert :inventory in ids
      assert :dialogue in ids
      assert :pathfinding in ids
    end
  end

  describe "Capabilities.get/1" do
    test "retrieves combat module manifest by atom id" do
      mod = Capabilities.get(:combat)
      assert is_map(mod)
      assert mod.id == :combat
      assert mod.name == "Combat"
      assert :battle in mod.provides
    end

    test "retrieves inventory module manifest by atom id" do
      mod = Capabilities.get(:inventory)
      assert is_map(mod)
      assert mod.id == :inventory
      assert mod.name == "Inventory"
      assert :items in mod.provides
    end

    test "retrieves pathfinding module manifest by atom id" do
      mod = Capabilities.get(:pathfinding)
      assert is_map(mod)
      assert mod.id == :pathfinding
      assert :astar in mod.provides
    end

    test "retrieves visual scripting module manifest" do
      mod = Capabilities.get(:scripting)
      assert is_map(mod)
      assert mod.id == :scripting
      assert :script_interpreter in mod.provides
    end

    test "returns nil for nonexistent module id" do
      assert Capabilities.get(:nonexistent_module_xyz) == nil
    end

    test "returns nil for non-atom lookup without raising" do
      # Since get guards with when is_atom(id), function clause error or nil
      assert_raise FunctionClauseError, fn ->
        Capabilities.get("combat")
      end
    end
  end

  describe "Capabilities.list_for_genre/1" do
    test "returns sensible default capabilities for :rpg" do
      rpg_caps = Capabilities.list_for_genre(:rpg)
      assert :combat in rpg_caps
      assert :inventory in rpg_caps
      assert :dialogue in rpg_caps
      assert :magic in rpg_caps
    end

    test "returns sensible default capabilities for :rts" do
      rts_caps = Capabilities.list_for_genre(:rts)
      assert :combat in rts_caps
      assert :fog_of_war in rts_caps
      assert :pathfinding in rts_caps
      assert :strategy_economy in rts_caps
    end

    test "returns sensible default capabilities for :moba" do
      moba_caps = Capabilities.list_for_genre(:moba)
      assert :combat in moba_caps
      assert :matchmaking in moba_caps
      assert :waves in moba_caps
      assert :pathfinding in moba_caps
    end

    test "returns sensible default capabilities for :tower_defense" do
      td_caps = Capabilities.list_for_genre(:tower_defense)
      assert :waves in td_caps
      assert :objectives in td_caps
      assert :pathfinding in td_caps
    end

    test "returns sensible default capabilities for :roguelike" do
      rl_caps = Capabilities.list_for_genre(:roguelike)
      assert :combat in rl_caps
      assert :inventory in rl_caps
      assert :fog_of_war in rl_caps
    end

    test "returns empty list for unrecognized genre" do
      assert Capabilities.list_for_genre(:racing_simulator) == []
    end
  end

  describe "Capabilities dependency graph and topological sort" do
    test "every module dependency in :requires exists in built_in_modules" do
      all_ids = MapSet.new(Enum.map(Capabilities.built_in_modules(), & &1.id))

      for m <- Capabilities.built_in_modules(), req <- (m[:requires] || []) do
        assert MapSet.member?(all_ids, req),
               "Module #{m.id} requires #{req} which does not exist in built_in_modules"
      end
    end

    test "economy requires inventory" do
      econ = Capabilities.get(:economy)
      assert :inventory in econ.requires
    end

    test "crafting requires inventory" do
      crafting = Capabilities.get(:crafting)
      assert :inventory in crafting.requires
    end

    test "magic requires combat" do
      magic = Capabilities.get(:magic)
      assert :combat in magic.requires
    end

    test "waves requires spawn_zones" do
      waves = Capabilities.get(:waves)
      assert :spawn_zones in waves.requires
    end

    test "spawn_zones requires npc_behavior" do
      spawns = Capabilities.get(:spawn_zones)
      assert :npc_behavior in spawns.requires
    end

    test "load_order returns an ordered list where dependencies precede dependents" do
      order = Capabilities.load_order()
      assert is_list(order)

      # If both inventory and economy are in load_order, inventory must come before economy
      if :inventory in order and :economy in order do
        inv_idx = Enum.find_index(order, &(&1 == :inventory))
        econ_idx = Enum.find_index(order, &(&1 == :economy))
        assert inv_idx < econ_idx, "inventory must load before economy"
      end

      # If both combat and magic are in load_order, combat must come before magic
      if :combat in order and :magic in order do
        combat_idx = Enum.find_index(order, &(&1 == :combat))
        magic_idx = Enum.find_index(order, &(&1 == :magic))
        assert combat_idx < magic_idx, "combat must load before magic"
      end
    end
  end
end
