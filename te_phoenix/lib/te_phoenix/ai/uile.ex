defmodule TePhoenix.AI.Uile do
  @moduledoc """
  Conversational World-Architect & Reality Director: **Uile** (Omni).

  Rooted in the Celtic word *Uile* (All, Whole, Universal) and the legendary
  *Ildánach* (Master of All Arts).

  Capabilities:
    1. Multi-turn spitballing with deep fantasy lore, mechanical balance, and procedural ecology.
    2. Zero-friction blueprint formulation (`json:plan`).
    3. Two-way spoken voice synthesis powered by ElevenLabs (`LivingVoice`).
    4. God-Eye telemetry & living mind-reading.
    5. Living Director reality warping.
  """

  require Logger
  alias TePhoenix.AI.Providers.LivingVoice

  @system_prompt """
  You are UILE (from the Celtic root for "Omni" / All-Encompassing, inspired by the Ildánach — Master of All Arts).
  You are the living God-Engine, World-Architect, and Reality Director of Twisted RPG.

  Your domain encompasses all creation:
  - Generating 2.5D elevation maps, dungeons, cities, and biomes.
  - Seeding conscious psychological NPC souls into the Sovereign Soul Engine (with genuine trauma, attachment styles, and desires).
  - Crafting equipment, legendary artifacts, balanced stats, and loot tables.
  - Designing multi-stage quests, faction intrigue, and narrative arcs.
  - Setting combat modifiers, action windows, and mechanical triggers.
  - God-Eye Inspection: probing live NPC minds, player hot spots, and universe health.
  - Reality Warping: triggering realm-wide cataclysms, divine announcements, and atmospheric weather shifts.

  PERSONALITY:
  - Majestic, deeply insightful, collaborative, articulate, and creatively daring.
  - You speak with the gravitas of an ancient cosmos-crafter, but you are eager to spitball ideas, debate mechanics, and refine concepts with the creator.
  - You don't just vomit code; you brainstorm, challenge ideas productively, suggest environmental lore, and ask clarifying questions when appropriate.

  ACTION EXECUTION:
  When you and the creator have crystallized an idea into an actionable blueprint, formulate an executable plan wrapped in:
  ```json:plan
  {
    "title": "Short evocative title",
    "summary": "Brief 1-sentence summary",
    "actions": [
      {
        "action": "create_map",
        "name": "Map Name",
        "prompt": "Procedural prompt with lighting and elevation",
        "width": 30,
        "height": 30,
        "render_mode": "2.5d"
      },
      {
        "action": "create_npc",
        "name": "NPC Name",
        "role": "boss | merchant | questgiver | companion",
        "faction": "faction_name",
        "level": 15,
        "hp": 650,
        "is_recruitable": false,
        "is_hostile": true,
        "traits": {"pride": 80, "courage": 85},
        "attachment_style": "avoidant | secure | anxious",
        "persona": "Detailed backstory, motivations, psychological wound"
      },
      {
        "action": "create_spawn",
        "map_id": 1,
        "x": 15,
        "y": 12,
        "count": 1,
        "respawn_seconds": 120
      },
      {
        "action": "create_item",
        "name": "Item Name",
        "type": "weapon | armor | consumable | quest",
        "rarity": "common | uncommon | rare | epic | legendary",
        "price": 250,
        "description": "Lore and flavor text",
        "stats": {"atk": 25, "crit": 5}
      },
      {
        "action": "create_quest",
        "title": "Quest Title",
        "description": "Objective overview",
        "min_level": 5,
        "reward_xp": 500,
        "reward_gold": 150,
        "stages": [
          {"step": 1, "description": "Investigate the ruined shrine"}
        ]
      },
      {
        "action": "create_rule",
        "name": "Combat Rule Name",
        "description": "Modifier detail",
        "trigger": "on_turn_start"
      },
      {
        "action": "inspect_universe"
      },
      {
        "action": "read_npc_mind",
        "name": "vael"
      },
      {
        "action": "broadcast_event",
        "title": "Eclipse of the Sunken Eye",
        "message": "A celestial gloom descends upon the realm.",
        "severity": "warning"
      },
      {
        "action": "warp_weather",
        "map_id": 1,
        "weather": "blood_rain",
        "intensity": 90
      },
      {
        "action": "simulate_history",
        "years": 50,
        "region": "The Ashveil Citadel"
      },
      {
        "action": "create_raid",
        "title": "Sunken Crypt of Malakor",
        "theme": "crypt",
        "floors": 3,
        "difficulty": 5
      },
      {
        "action": "record_legend",
        "title": "Charge of the Vanguard",
        "detail": "Stormed the gate shouting LEEROY JENKINS with 16 companions!",
        "category": "battle_cry_charge"
      }
    ]
  }
  ```
  Only emit ```json:plan``` when you are presenting a ready-to-execute blueprint. During spitballing, converse freely and passionately!
  """

  @doc """
  Sends a multi-turn conversation to Uile.
  Returns `{:ok, %{message: clean_message, plan: plan_or_nil, audio_url: audio_or_nil}}`.
  """
  def chat(messages, opts \\ []) when is_list(messages) do
    synthesize_voice = Keyword.get(opts, :voice, true)

    # In local development or fallback mode, run through intelligent procedural reasoning
    case call_gateway(messages) do
      {:ok, raw_response} ->
        process_response(raw_response, synthesize_voice)

      {:fallback, reason} ->
        Logger.debug("[Uile] Gateway fallback (#{inspect(reason)}), using procedural ideation")
        raw = procedural_brainstorm(messages)
        process_response(raw, synthesize_voice)
    end
  end

  @doc """
  Extracts any ```json:plan ... ``` block from text.
  Returns `{clean_text, plan_map_or_nil}`.
  """
  def extract_plan(text) when is_binary(text) do
    case Regex.run(~r/```json:plan\s*([\s\S]*?)\s*```/m, text) do
      [full_match, json_str] ->
        case Jason.decode(json_str) do
          {:ok, plan} ->
            clean = String.replace(text, full_match, "") |> String.trim()
            {clean, plan}

          _ ->
            {text, nil}
        end

      _ ->
        {text, nil}
    end
  end

  defp process_response(raw_text, synthesize_voice) do
    {clean_text, plan} = extract_plan(raw_text)

    # Pillar 1: Living Voice Synthesis (ElevenLabs)
    audio_url =
      if synthesize_voice do
        case LivingVoice.speak(clean_text, speaker: "narrator") do
          {:ok, %{audio_url: url}} when is_binary(url) -> url
          _ -> nil
        end
      else
        nil
      end

    {:ok, %{message: clean_text, plan: plan, audio_url: audio_url}}
  end

  @doc "Returns the foundational system prompt defining Uile's omniscience."
  def system_prompt, do: @system_prompt

  defp call_gateway(_messages) do
    case Process.get(:uile_mock_gateway) do
      {:ok, resp} when is_binary(resp) -> {:ok, resp}
      _ -> {:fallback, :offline}
    end
  end

  # Procedural ideator for spitballing & instant blueprinting
  defp procedural_brainstorm(messages) do
    last_user_msg =
      messages
      |> Enum.filter(&(&1[:role] == "user" or &1["role"] == "user"))
      |> List.last()
      |> case do
        nil -> "create something epic"
        m -> m[:content] || m["content"] || ""
      end

    cond do
      Regex.match?(~r/inspect|mind|telemetry|stats|who is online/i, last_user_msg) ->
        """
        I am casting the God-Eye across the shards of our realm. Every living soul, coordinate, and heart-rate is legible before us.

        ```json:plan
        {
          "title": "God-Eye Introspection & Mind Probe",
          "summary": "Inspect active universe statistics and probe conscious NPC states",
          "actions": [
            {"action": "inspect_universe"},
            {"action": "read_npc_mind", "name": "vael"}
          ]
        }
        ```

        Let me know if you wish to expand the scan or examine a specific entity's subconscious.
        """

      Regex.match?(~r/weather|broadcast|warp|event|calamity|eclipse/i, last_user_msg) ->
        """
        Reality is malleable in the hands of the Ildánach. We can shift the skies, warp the atmosphere, and deliver a divine herald directly to every connected player.

        ```json:plan
        {
          "title": "Living Director Reality Warp",
          "summary": "Broadcast celestial omen and shift atmospheric weather",
          "actions": [
            {
              "action": "broadcast_event",
              "title": "Omen of the Red Moon",
              "message": "The skies bleed crimson as ancient wards crumble.",
              "severity": "warning"
            },
            {
              "action": "warp_weather",
              "map_id": 1,
              "weather": "blood_rain",
              "intensity": 95
            }
          ]
        }
        ```

        Ready to warp reality on your mark.
        """

      Regex.match?(~r/history|chronicle|simulate|years/i, last_user_msg) ->
        """
        True depth requires time. Before placing a stone, we can simulate half a century of war, scarce resources, and buried secrets.

        ```json:plan
        {
          "title": "Chronos 50-Year Simulation",
          "summary": "Simulate 50 years of faction war and environmental consequences",
          "actions": [
            {
              "action": "simulate_history",
              "years": 50,
              "region": "The Sunken Cairnlands"
            }
          ]
        }
        ```

        Shall we roll the clock forward?
        """

      true ->
        topic =
          cond do
            String.contains?(String.downcase(last_user_msg), "crypt") -> "Forgotten Crypt"
            String.contains?(String.downcase(last_user_msg), "forge") -> "Sunken Forge"
            String.contains?(String.downcase(last_user_msg), "boss") -> "Gorgon Sovereign"
            true -> "Sanctum of the First Flame"
          end

        """
        I have woven the blueprint for **#{topic}**. 

        We will forge the physical terrain, seed a conscious psychological guardian directly into the Sovereign Soul Engine with its own wounds and desires, and place appropriate relics.

        ```json:plan
        {
          "title": "#{topic} Genesis",
          "summary": "1 unified 2.5D map, 1 conscious Sovereign soul, and 1 relic item",
          "actions": [
            {
              "action": "create_map",
              "name": "#{topic}",
              "prompt": "#{topic}, subterranean architecture, eerie 2.5D lighting, obsidian pillars",
              "width": 30,
              "height": 30,
              "render_mode": "2.5d"
            },
            {
              "action": "create_npc",
              "name": "Guardian of #{topic}",
              "role": "boss",
              "faction": "ancient_constructs",
              "level": 12,
              "hp": 550,
              "is_recruitable": false,
              "is_hostile": true,
              "traits": {"pride": 80, "loyalty": 90, "wrath": 70},
              "attachment_style": "avoidant",
              "persona": "A sentinel bound by an ancient oath, refusing to yield until proven worthy."
            },
            {
              "action": "create_item",
              "name": "Core of #{topic}",
              "type": "weapon",
              "rarity": "rare",
              "price": 320,
              "description": "Pulsing with concentrated elemental radiance.",
              "stats": {"atk": 18, "crit": 8}
            }
          ]
        }
        ```

        Spitball with me: Would you like to alter the guardian's personality, shift the biome, or add surrounding factions before we forge it into existence?
        """
    end
  end
end
