defmodule TePhoenix.AI.UileTest do
  use ExUnit.Case, async: false

  alias TePhoenix.AI.{Uile, UileOperations, SovereignBridge}

  setup do
    :ok = Ecto.Adapters.SQL.Sandbox.checkout(TePhoenix.Repo)
    :ok
  end

  describe "Uile plan extraction" do
    test "extracts structured plan from markdown json:plan blocks" do
      sample_text = """
      I have formulated an optimal blueprint for this subterranean zone.

      ```json:plan
      {
        "title": "Abyssal Crypt",
        "summary": "1 map with guardian",
        "actions": [
          {"action": "create_item", "name": "Crypt Key", "type": "quest", "price": 0}
        ]
      }
      ```

      Let me know if you would like me to execute this plan.
      """

      {clean_text, plan} = Uile.extract_plan(sample_text)

      assert plan != nil
      assert plan["title"] == "Abyssal Crypt"
      assert length(plan["actions"]) == 1
      assert hd(plan["actions"])["name"] == "Crypt Key"
      refute String.contains?(clean_text, "```json:plan")
    end

    test "returns nil plan when no json:plan block exists" do
      text = "Let's spitball some ideas for a clockwork boss."
      {clean, plan} = Uile.extract_plan(text)

      assert clean == text
      assert plan == nil
    end
  end

  describe "Uile procedural brainstorming" do
    test "responds with creative plan when asked about building a dungeon" do
      messages = [%{role: "user", content: "Let's build a sunken forge dungeon"}]
      {:ok, result} = Uile.chat(messages, voice: false)

      assert is_binary(result.message)
      assert result.plan != nil
      assert result.plan["actions"] != []
    end

    test "responds with God-Eye plan when asked to inspect minds or universe" do
      messages = [%{role: "user", content: "Inspect universe and who is online"}]
      {:ok, result} = Uile.chat(messages, voice: false)

      assert is_binary(result.message)
      assert result.plan != nil
      assert Enum.any?(result.plan["actions"], &(&1["action"] == "inspect_universe"))
    end

    test "responds with reality-warping plan when asked about weather or event" do
      messages = [%{role: "user", content: "Warp weather and broadcast calamity event"}]
      {:ok, result} = Uile.chat(messages, voice: false)

      assert is_binary(result.message)
      assert result.plan != nil
      assert Enum.any?(result.plan["actions"], &(&1["action"] in ["broadcast_event", "warp_weather"]))
    end
  end

  describe "UileOperations - Genesis" do
    test "creates an item successfully" do
      action = %{
        "action" => "create_item",
        "name" => "Uile Solar Brand",
        "type" => "weapon",
        "rarity" => "legendary",
        "price" => 1250,
        "description" => "A celestial brand forged by Uile"
      }

      result = UileOperations.execute_action(action)
      assert result.status == :ok
      assert result.type == :item
      assert result.name == "Uile Solar Brand"
    end

    test "creates a quest successfully" do
      action = %{
        "action" => "create_quest",
        "title" => "Trial of the Ildanach",
        "description" => "Overcome the crucible of the all-craftsman",
        "min_level" => 10,
        "reward_xp" => 2500,
        "reward_gold" => 600
      }

      result = UileOperations.execute_action(action)
      assert result.status == :ok
      assert result.type == :quest
      assert result.name == "Trial of the Ildanach"
    end

    test "creates a battle rule successfully" do
      action = %{
        "action" => "create_rule",
        "name" => "Solar Ignition Trigger",
        "description" => "Deals radiant burn at turn start",
        "trigger" => "on_turn_start"
      }

      result = UileOperations.execute_action(action)
      assert result.status == :ok
      assert result.type == :rule
      assert result.name == "Solar Ignition Trigger"
    end

    test "creates an NPC with Sovereign Soul attributes" do
      action = %{
        "action" => "create_npc",
        "name" => "Cormac the Iron-Willed",
        "role" => "guardian",
        "faction" => "sentinels",
        "level" => 15,
        "hp" => 800,
        "is_recruitable" => true,
        "traits" => %{"courage" => 90, "loyalty" => 85}
      }

      result = UileOperations.execute_action(action)
      assert result.status == :ok
      assert result.type == :npc
      assert result.name == "Cormac the Iron-Willed"
    end
  end

  describe "UileOperations - God-Eye & Reality Warping" do
    test "executes God-Eye inspect_universe" do
      action = %{"action" => "inspect_universe"}
      result = UileOperations.execute_action(action)

      assert result.status == :ok
      assert result.type == :telemetry
      assert is_map(result.data)
    end

    test "executes reality-warping broadcast_event" do
      action = %{
        "action" => "broadcast_event",
        "title" => "Dawn of Uile",
        "message" => "The Omni-Architect has stirred.",
        "severity" => "warning"
      }

      result = UileOperations.execute_action(action)
      assert result.status == :ok
      assert result.type == :reality_warp
      assert String.contains?(result.name, "Dawn of Uile")
    end

    test "executes weather warp" do
      action = %{
        "action" => "warp_weather",
        "map_id" => 1,
        "weather" => "blood_rain",
        "intensity" => 90
      }

      result = UileOperations.execute_action(action)
      assert result.status == :ok
      assert result.type == :reality_warp
    end

    test "executes multi-decade history simulation" do
      action = %{
        "action" => "simulate_history",
        "years" => 50,
        "region" => "Ashveil Basin"
      }

      result = UileOperations.execute_action(action)
      assert result.status == :ok
      assert result.type == :history_sim
      assert length(result.chronicles) > 0
    end
  end

  describe "SovereignBridge" do
    test "gracefully falls back when Sovereign Soul Engine is unreachable" do
      result = SovereignBridge.talk("lazuli", 999, "Tester", "Hello", timeout: 200)
      assert match?({:fallback, _}, result)
    end
  end
end
