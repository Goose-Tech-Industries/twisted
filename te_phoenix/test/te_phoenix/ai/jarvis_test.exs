defmodule TePhoenix.AI.JarvisTest do
  use ExUnit.Case, async: false

  alias TePhoenix.AI.{Jarvis, JarvisOperations, SovereignBridge}

  setup do
    :ok = Ecto.Adapters.SQL.Sandbox.checkout(TePhoenix.Repo)
    :ok
  end

  describe "Jarvis plan extraction" do
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

      {clean_text, plan} = Jarvis.extract_plan(sample_text)

      assert plan != nil
      assert plan["title"] == "Abyssal Crypt"
      assert length(plan["actions"]) == 1
      assert hd(plan["actions"])["name"] == "Crypt Key"
      refute String.contains?(clean_text, "```json:plan")
    end

    test "returns nil plan when no json:plan block exists" do
      text = "Let's spitball some ideas for a clockwork boss."
      {clean, plan} = Jarvis.extract_plan(text)

      assert clean == text
      assert plan == nil
    end
  end

  describe "Jarvis procedural fallback" do
    test "responds with creative plan when asked about building a dungeon" do
      messages = [%{role: "user", content: "Let's build a sunken forge dungeon"}]
      {:ok, result} = Jarvis.chat(messages)

      assert is_binary(result.message)
      assert result.plan != nil
      assert result.plan["actions"] != []
    end
  end

  describe "JarvisOperations" do
    test "creates an item successfully" do
      action = %{
        "action" => "create_item",
        "name" => "Jarvis Test Blade",
        "type" => "weapon",
        "rarity" => "rare",
        "price" => 150,
        "description" => "A test blade forged by JARVIS"
      }

      result = JarvisOperations.execute_action(action)
      assert result.status == :ok
      assert result.type == :item
      assert result.name == "Jarvis Test Blade"
    end

    test "creates a quest successfully" do
      action = %{
        "action" => "create_quest",
        "title" => "Jarvis Test Quest",
        "description" => "Test quest created during test run",
        "min_level" => 1,
        "reward_xp" => 100,
        "reward_gold" => 25
      }

      result = JarvisOperations.execute_action(action)
      assert result.status == :ok
      assert result.type == :quest
      assert result.name == "Jarvis Test Quest"
    end

    test "creates a battle rule successfully" do
      action = %{
        "action" => "create_rule",
        "name" => "Jarvis Overclock Rule",
        "description" => "Test rule modifier",
        "trigger" => "on_turn_start"
      }

      result = JarvisOperations.execute_action(action)
      assert result.status == :ok
      assert result.type == :rule
      assert result.name == "Jarvis Overclock Rule"
    end
  end

  describe "SovereignBridge" do
    test "gracefully falls back when Sovereign Soul Engine is unreachable" do
      # Point to an unused local port to guarantee fallback
      result = SovereignBridge.talk("lazuli", 999, "Tester", "Hello", timeout: 200)
      assert match?({:fallback, _}, result)
    end
  end
end
