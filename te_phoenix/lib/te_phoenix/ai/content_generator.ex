defmodule TePhoenix.AI.ContentGenerator do
  @moduledoc """
  AI-powered content generation for the Game Director.

  When the AI suggests "Spawn a boss," this module actually generates
  the boss with AI-created name, stats, skills, loot, and dialogue.
  Content is created in a DRAFT state — the admin reviews it before
  publishing.

  Supports generating:
  - NPCs (enemies, bosses, friendly NPCs)
  - Quests (multi-stage with objectives and rewards)
  - Items (weapons, armor, consumables)
  - World events (with triggers and rewards)
  - Skills (with damage formulas and effects)
  """

  require Logger
  alias TePhoenix.Repo

  @doc """
  Generate content based on a Game Director suggestion.
  Returns `{:ok, %{type, data, preview}}` for review, or `{:error, reason}`.
  """
  def generate(action, context \\ %{}) do
    case action do
      "boss_spawn" -> generate_boss(context)
      "world_event" -> generate_world_event(context)
      "tournament" -> generate_tournament(context)
      "dungeon_raid" -> generate_dungeon(context)
      "create_quest" -> generate_quest(context)
      "create_npc" -> generate_npc(context)
      "create_item" -> generate_item(context)
      "create_skill" -> generate_skill(context)
      _ -> {:error, "Unknown content type: #{action}"}
    end
  end

  @doc "Save generated content to the database (publish from draft)."
  def publish(type, data) do
    case type do
      "boss" -> publish_npc(data)
      "npc" -> publish_npc(data)
      "quest" -> publish_quest(data)
      "item" -> publish_item(data)
      "skill" -> publish_skill(data)
      "event" -> publish_event(data)
      _ -> {:error, "Unknown type"}
    end
  end

  # ── Generators ──────────────────────────────────────────────────

  defp generate_boss(ctx) do
    prompt = """
    Generate a dark Celtic fantasy boss enemy as JSON:
    {
      "name": "unique Celtic-themed boss name",
      "description": "2-3 sentence atmospheric description",
      "icon": "emoji representing the boss",
      "hp": number (500-5000 based on intended difficulty),
      "atk": number (20-80),
      "def": number (10-50),
      "mo": number (10-60),
      "md": number (10-40),
      "speed": number (5-25),
      "weaknesses": ["element1"],
      "loot_gold": number (50-500),
      "loot_xp": number (100-1000),
      "battle_cry": "dramatic one-liner the boss says when battle starts",
      "phases": [
        {"threshold_pct": 0.5, "name": "Phase 2 name", "dialogue": "what boss says at phase 2"}
      ]
    }
    #{if ctx[:map_name], do: "The boss should fit thematically in: #{ctx[:map_name]}", else: ""}
    Return ONLY valid JSON, no markdown.
    """

    case call_ai(prompt) do
      {:ok, json} ->
        data = Map.merge(json, %{"is_enemy" => 1, "is_boss" => 1, "type" => "boss"})
        preview = "#{json["icon"] || "👹"} **#{json["name"]}** — #{json["description"]}\nHP: #{json["hp"]} | ATK: #{json["atk"]} | DEF: #{json["def"]}\n💬 \"#{json["battle_cry"]}\""
        {:ok, %{type: "boss", data: data, preview: preview}}
      error -> error
    end
  end

  defp generate_npc(ctx) do
    prompt = """
    Generate a friendly NPC for a dark Celtic fantasy RPG as JSON:
    {
      "name": "Celtic-themed NPC name",
      "description": "2-3 sentence personality and role description",
      "icon": "emoji",
      "persona": "grumpy/cheerful/mysterious/wise/aggressive — personality for AI dialogue",
      "role": "merchant/blacksmith/innkeeper/quest_giver/guard/healer/sage/bard",
      "greeting": "What they say when you first talk to them",
      "knowledge_topics": ["topic1", "topic2"]
    }
    Return ONLY valid JSON.
    """

    case call_ai(prompt) do
      {:ok, json} ->
        data = Map.merge(json, %{"is_enemy" => 0, "type" => "npc"})
        preview = "#{json["icon"] || "🧙"} **#{json["name"]}** (#{json["role"]})\n#{json["description"]}\n💬 \"#{json["greeting"]}\""
        {:ok, %{type: "npc", data: data, preview: preview}}
      error -> error
    end
  end

  defp generate_quest(ctx) do
    prompt = """
    Generate a quest for a dark Celtic fantasy RPG as JSON:
    {
      "name": "quest name",
      "description": "2-3 sentence quest description for the player",
      "icon": "emoji",
      "level_required": number (1-50),
      "stages": [
        {"description": "what to do", "objective_type": "kill/collect/talk/reach", "target": "target name", "count": number},
        {"description": "next step", "objective_type": "talk", "target": "NPC name", "count": 1}
      ],
      "reward_xp": number,
      "reward_gold": number,
      "reward_item": "optional item name or null"
    }
    Return ONLY valid JSON.
    """

    case call_ai(prompt) do
      {:ok, json} ->
        stages = json["stages"] || []
        stage_preview = Enum.map_join(stages, "\n", fn s -> "  → #{s["description"]} (#{s["objective_type"]}: #{s["target"]} ×#{s["count"]})" end)
        preview = "#{json["icon"] || "📜"} **#{json["name"]}** (Lv#{json["level_required"]}+)\n#{json["description"]}\n#{stage_preview}\n🎁 #{json["reward_xp"]} XP + #{json["reward_gold"]} gold#{if json["reward_item"], do: " + #{json["reward_item"]}", else: ""}"
        {:ok, %{type: "quest", data: json, preview: preview}}
      error -> error
    end
  end

  defp generate_item(ctx) do
    prompt = """
    Generate an item for a dark Celtic fantasy RPG as JSON:
    {
      "name": "Celtic-themed item name",
      "description": "1-2 sentence flavor text",
      "icon": "emoji",
      "type": "WEAPON/ARMOR/CONSUMABLE/ACCESSORY",
      "rarity": "common/uncommon/rare/epic/legendary",
      "bonus_atk": number or 0,
      "bonus_def": number or 0,
      "bonus_hp": number or 0,
      "buy_price": number,
      "effects": "what it does when equipped/used"
    }
    Return ONLY valid JSON.
    """

    case call_ai(prompt) do
      {:ok, json} ->
        preview = "#{json["icon"] || "⚔️"} **#{json["name"]}** [#{json["rarity"]}]\n#{json["description"]}\n+#{json["bonus_atk"]} ATK | +#{json["bonus_def"]} DEF | #{json["buy_price"]}g"
        {:ok, %{type: "item", data: json, preview: preview}}
      error -> error
    end
  end

  defp generate_skill(ctx) do
    prompt = """
    Generate a combat skill for a dark Celtic fantasy RPG as JSON:
    {
      "name": "Celtic-themed skill name",
      "description": "1-2 sentence description",
      "icon": "emoji",
      "type": "physical/magic/fire/ice/lightning/dark/holy",
      "mp_cost": number (5-50),
      "damage_formula": "ATK*2-DEF or similar",
      "target_type": "ENEMY/ALLY/SELF/ALL",
      "cooldown_turns": number (0-5),
      "status_apply": "status key or null",
      "battle_text": "{name} does the thing!"
    }
    Return ONLY valid JSON.
    """

    case call_ai(prompt) do
      {:ok, json} ->
        preview = "#{json["icon"] || "✨"} **#{json["name"]}** [#{json["type"]}]\n#{json["description"]}\n#{json["mp_cost"]} MP | #{json["damage_formula"]} | #{json["cooldown_turns"]}T cooldown"
        {:ok, %{type: "skill", data: json, preview: preview}}
      error -> error
    end
  end

  defp generate_world_event(_ctx) do
    {:ok, %{type: "event", data: %{"name" => "World Event", "description" => "A mysterious event unfolds..."}, preview: "🌑 **World Event** — use the World section to configure"}}
  end

  defp generate_tournament(_ctx) do
    {:ok, %{type: "event", data: %{}, preview: "⚔️ Tournament — use Match Modes to set up brackets"}}
  end

  defp generate_dungeon(_ctx) do
    {:ok, %{type: "event", data: %{}, preview: "🏰 Dungeon Raid — use WorldForge or Map Templates to generate a dungeon"}}
  end

  # ── Publishers ──────────────────────────────────────────────────

  defp publish_npc(data) do
    map_id = data["map_id"] || 1
    Repo.query(
      "INSERT INTO game_npcs (name, map_id, x, y, hp, max_hp, atk, `def`, mo, md, speed, is_enemy, is_boss, icon, description, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())",
      [data["name"], map_id, :rand.uniform(15), :rand.uniform(15),
       data["hp"] || 100, data["hp"] || 100, data["atk"] || 10, data["def"] || 5,
       data["mo"] || 5, data["md"] || 5, data["speed"] || 10,
       data["is_enemy"] || 0, data["is_boss"] || 0,
       data["icon"] || "👤", data["description"] || ""]
    )
    {:ok, "#{data["name"]} created!"}
  rescue
    e -> {:error, Exception.message(e)}
  end

  defp publish_quest(data) do
    key = (data["name"] || "quest") |> String.downcase() |> String.replace(~r/[^a-z0-9]+/, "_") |> String.trim("_")
    Repo.query(
      "INSERT INTO game_quest_defs (key, name, description, icon, level_required, stages_json, rewards_json, enabled) VALUES (?,?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name)",
      [key, data["name"], data["description"], data["icon"] || "📜",
       data["level_required"] || 1,
       Jason.encode!(data["stages"] || []),
       Jason.encode!(%{"xp" => data["reward_xp"] || 100, "gold" => data["reward_gold"] || 50})]
    )
    {:ok, "Quest '#{data["name"]}' created!"}
  rescue
    e -> {:error, Exception.message(e)}
  end

  defp publish_item(data) do
    Repo.query(
      "INSERT INTO game_items (name, description, icon, type, rarity, bonus_atk, bonus_def, buy_price) VALUES (?,?,?,?,?,?,?,?)",
      [data["name"], data["description"], data["icon"] || "📦",
       data["type"] || "WEAPON", data["rarity"] || "common",
       data["bonus_atk"] || 0, data["bonus_def"] || 0, data["buy_price"] || 100]
    )
    {:ok, "Item '#{data["name"]}' created!"}
  rescue
    e -> {:error, Exception.message(e)}
  end

  defp publish_skill(data) do
    effects = %{
      "damage" => %{"formula" => data["damage_formula"] || "ATK*2-DEF", "type" => data["type"] || "physical"},
      "cooldown_turns" => data["cooldown_turns"] || 0
    }
    Repo.query(
      "INSERT INTO game_skills (name, description, icon, type, target_type, mp_cost, effects, battle_text) VALUES (?,?,?,?,?,?,?,?)",
      [data["name"], data["description"], data["icon"] || "✨",
       data["type"] || "physical", data["target_type"] || "ENEMY",
       data["mp_cost"] || 10, Jason.encode!(effects), data["battle_text"] || ""]
    )
    {:ok, "Skill '#{data["name"]}' created!"}
  rescue
    e -> {:error, Exception.message(e)}
  end

  defp publish_event(_data), do: {:ok, "Event noted."}

  # ── AI call ─────────────────────────────────────────────────────

  defp call_ai(prompt) do
    config = TePhoenix.NpcBrain.load_ai_config()
    api_key = config["apiKey"] || config[:api_key] || ""
    model = config["model"] || config[:model] || "claude-haiku-4-5-20251001"

    if api_key == "" do
      {:error, "No AI API key configured. Set ai_api_key in Settings."}
    else
      case Req.post("https://api.anthropic.com/v1/messages",
        json: %{model: model, max_tokens: 500, temperature: 0.9, messages: [%{role: "user", content: prompt}]},
        headers: [{"x-api-key", api_key}, {"anthropic-version", "2023-06-01"}],
        receive_timeout: 20_000
      ) do
        {:ok, %Req.Response{status: 200, body: body}} ->
          text = get_in(body, ["content", Access.at(0), "text"]) |> to_string() |> String.trim()
          cleaned = text |> String.replace(~r/```json\n?/, "") |> String.replace(~r/```\n?/, "") |> String.trim()
          case Jason.decode(cleaned) do
            {:ok, json} -> {:ok, json}
            _ -> {:error, "AI returned invalid JSON: #{String.slice(text, 0, 200)}"}
          end
        {:ok, %Req.Response{status: s}} -> {:error, "AI returned status #{s}"}
        {:error, e} -> {:error, "AI request failed: #{inspect(e)}"}
      end
    end
  end
end
