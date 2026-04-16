defmodule TePhoenix.AI.NpcDialogue do
  @moduledoc """
  AI-powered NPC conversations with personality, memory, and action triggers.

  Each NPC has a personality card (tone, knowledge, secrets, faction) stored in
  `game_npc_personalities`. Conversations are tracked per NPC/character pair in
  `game_conversation_memory` (last 20 messages + rolling summary).

  The system builds a rich prompt from:
    * NPC personality card (tone, role, knowledge topics, secrets)
    * World context (player quest, reputation, time of day, location)
    * Conversation memory (prior messages + summary)
    * Available action triggers the AI can embed in its response

  Action triggers are parsed from the AI response text:
    * `[GIVE_ITEM:sword_of_light]` — NPC gives an item to the player
    * `[START_QUEST:missing_merchant]` — NPC starts a quest
    * `[REVEAL_SECRET:hidden_passage]` — NPC reveals a secret

  Falls back to the NPC's static `greeting` field if AI is unavailable.

  Settings: `enable_ai_dialogue`, `ai_dialogue_model`, `ai_dialogue_max_tokens`
  """

  require Logger
  alias TePhoenix.Repo
  alias TePhoenix.AI.Gateway

  @personalities_table "game_npc_personalities"
  @memory_table "game_conversation_memory"
  @max_memory_messages 20

  # ── Setup ───────────────────────────────────────────────────────

  def ensure_tables do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@personalities_table} (
      npc_id INT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      role VARCHAR(80) DEFAULT 'villager',
      tone VARCHAR(40) DEFAULT 'neutral',
      knowledge_topics_json LONGTEXT,
      secrets_json LONGTEXT,
      faction VARCHAR(80),
      greeting TEXT,
      farewell TEXT,
      backstory TEXT,
      speech_patterns TEXT,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """)

    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@memory_table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      npc_id INT NOT NULL,
      char_id INT NOT NULL,
      messages_json LONGTEXT,
      summary TEXT,
      last_talked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_npc_char (npc_id, char_id)
    )
    """)

    Logger.info("[NpcDialogue] tables ensured")
  end

  # ── Public API ─────────────────────────────────────────────────

  @doc """
  Generate an AI response for an NPC talking to a player character.

  Options:
    * `:user_id` — for AI gateway billing/permissions
    * `:quest` — current quest name/description
    * `:reputation` — player's reputation with NPC's faction
    * `:time_of_day` — "morning", "afternoon", "evening", "night"
    * `:location` — current map/area name
  """
  def talk(npc_id, char_id, player_message, opts \\ []) do
    ensure_tables()

    case get_personality(npc_id) do
      nil ->
        Logger.warning("[NpcDialogue] no personality for npc_id=#{npc_id}")
        {:error, :no_personality}

      personality ->
        memory = get_memory(npc_id, char_id)
        system_prompt = build_system_prompt(personality, memory, opts)
        user_prompt = build_user_prompt(player_message, memory)

        case call_ai(system_prompt, user_prompt, opts) do
          {:ok, ai_text} ->
            {clean_text, actions} = parse_actions(ai_text)
            save_memory(npc_id, char_id, player_message, clean_text, memory)
            {:ok, %{text: clean_text, actions: actions, npc_name: personality.name}}

          {:error, _reason} ->
            fallback = personality.greeting || "..."
            {:ok, %{text: fallback, actions: [], npc_name: personality.name}}
        end
    end
  end

  @doc "Load personality config for an NPC."
  def get_personality(npc_id) do
    ensure_tables()

    case Repo.query(
           """
           SELECT npc_id, name, role, tone, knowledge_topics_json, secrets_json,
                  faction, greeting, farewell, backstory, speech_patterns
           FROM #{@personalities_table} WHERE npc_id = ?
           """,
           [npc_id]
         ) do
      {:ok, %{rows: [[npc_id, name, role, tone, knowledge, secrets, faction, greeting, farewell, backstory, speech]]}} ->
        %{
          npc_id: npc_id,
          name: name,
          role: role,
          tone: tone || "neutral",
          knowledge_topics: decode_json(knowledge, []),
          secrets: decode_json(secrets, []),
          faction: faction,
          greeting: greeting,
          farewell: farewell,
          backstory: backstory,
          speech_patterns: speech
        }

      _ ->
        nil
    end
  end

  @doc "Create or update an NPC's personality from AdminSauce."
  def set_personality(npc_id, attrs) when is_map(attrs) do
    ensure_tables()

    name = Map.get(attrs, :name, Map.get(attrs, "name", "Unknown"))
    role = Map.get(attrs, :role, Map.get(attrs, "role", "villager"))
    tone = Map.get(attrs, :tone, Map.get(attrs, "tone", "neutral"))
    knowledge = Map.get(attrs, :knowledge_topics, Map.get(attrs, "knowledge_topics", []))
    secrets = Map.get(attrs, :secrets, Map.get(attrs, "secrets", []))
    faction = Map.get(attrs, :faction, Map.get(attrs, "faction"))
    greeting = Map.get(attrs, :greeting, Map.get(attrs, "greeting"))
    farewell = Map.get(attrs, :farewell, Map.get(attrs, "farewell"))
    backstory = Map.get(attrs, :backstory, Map.get(attrs, "backstory"))
    speech = Map.get(attrs, :speech_patterns, Map.get(attrs, "speech_patterns"))

    knowledge_json = Jason.encode!(knowledge)
    secrets_json = Jason.encode!(secrets)

    case Repo.query(
           """
           INSERT INTO #{@personalities_table}
             (npc_id, name, role, tone, knowledge_topics_json, secrets_json,
              faction, greeting, farewell, backstory, speech_patterns, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             name = VALUES(name), role = VALUES(role), tone = VALUES(tone),
             knowledge_topics_json = VALUES(knowledge_topics_json),
             secrets_json = VALUES(secrets_json), faction = VALUES(faction),
             greeting = VALUES(greeting), farewell = VALUES(farewell),
             backstory = VALUES(backstory), speech_patterns = VALUES(speech_patterns),
             updated_at = NOW()
           """,
           [npc_id, name, role, tone, knowledge_json, secrets_json, faction, greeting, farewell, backstory, speech]
         ) do
      {:ok, _} ->
        Logger.info("[NpcDialogue] personality saved for npc_id=#{npc_id}")
        :ok

      {:error, reason} ->
        Logger.error("[NpcDialogue] failed to save personality: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc "Get conversation history between an NPC and a character."
  def get_memory(npc_id, char_id) do
    ensure_tables()

    case Repo.query(
           "SELECT messages_json, summary, last_talked_at FROM #{@memory_table} WHERE npc_id = ? AND char_id = ?",
           [npc_id, char_id]
         ) do
      {:ok, %{rows: [[messages_json, summary, last_talked_at]]}} ->
        %{
          messages: decode_json(messages_json, []),
          summary: summary,
          last_talked_at: last_talked_at
        }

      _ ->
        %{messages: [], summary: nil, last_talked_at: nil}
    end
  end

  @doc "Clear conversation memory between an NPC and a character."
  def clear_memory(npc_id, char_id) do
    ensure_tables()
    Repo.query("DELETE FROM #{@memory_table} WHERE npc_id = ? AND char_id = ?", [npc_id, char_id])
    :ok
  end

  # ── Prompt Building ────────────────────────────────────────────

  defp build_system_prompt(personality, memory, opts) do
    quest = Keyword.get(opts, :quest, "none")
    reputation = Keyword.get(opts, :reputation, "neutral")
    time_of_day = Keyword.get(opts, :time_of_day, "day")
    location = Keyword.get(opts, :location, "unknown")

    topics_str =
      case personality.knowledge_topics do
        [] -> "general topics"
        topics -> Enum.join(topics, ", ")
      end

    secrets_str =
      case personality.secrets do
        [] -> "none"
        secrets -> Enum.join(secrets, "; ")
      end

    backstory_section =
      if personality.backstory do
        "\nBackstory: #{personality.backstory}"
      else
        ""
      end

    speech_section =
      if personality.speech_patterns do
        "\nSpeech patterns: #{personality.speech_patterns}"
      else
        ""
      end

    summary_section =
      if memory.summary do
        "\n\nPrevious conversation summary: #{memory.summary}"
      else
        ""
      end

    """
    You are #{personality.name}, a #{personality.role} in a dark Celtic fantasy world.
    Your tone is #{personality.tone}. Your faction is #{personality.faction || "unaffiliated"}.#{backstory_section}#{speech_section}

    Knowledge topics you can discuss: #{topics_str}
    Secrets you may reveal if the player earns your trust: #{secrets_str}

    WORLD CONTEXT:
    - Player's current quest: #{quest}
    - Player's reputation with your faction: #{reputation}
    - Time of day: #{time_of_day}
    - Location: #{location}
    #{summary_section}

    AVAILABLE ACTIONS (embed in your response ONLY when narratively appropriate):
    - [GIVE_ITEM:item_key] — give an item to the player
    - [START_QUEST:quest_key] — offer/start a quest
    - [REVEAL_SECRET:secret_key] — reveal a hidden secret

    RULES:
    - Stay in character at all times. Never break the fourth wall.
    - Keep responses under 3 paragraphs. Be concise but flavorful.
    - Use action tags sparingly — only when the conversation naturally leads there.
    - If the player is hostile, respond according to your tone (a grumpy NPC might threaten, a wise one might deflect).
    - Reference prior conversations when relevant.
    - Adjust warmth based on reputation: hostile reputation = guarded, friendly = open.
    """
  end

  defp build_user_prompt(player_message, memory) do
    history_str =
      memory.messages
      |> Enum.take(-6)
      |> Enum.map(fn msg ->
        role = Map.get(msg, "role", Map.get(msg, :role, "unknown"))
        text = Map.get(msg, "text", Map.get(msg, :text, ""))
        "#{role}: #{text}"
      end)
      |> Enum.join("\n")

    if history_str == "" do
      "Player says: #{player_message}"
    else
      "Recent conversation:\n#{history_str}\n\nPlayer says: #{player_message}"
    end
  end

  # ── AI Call ────────────────────────────────────────────────────

  defp call_ai(system_prompt, user_prompt, opts) do
    user_id = Keyword.get(opts, :user_id)
    max_tokens = Keyword.get(opts, :max_tokens, 512)

    case Gateway.call(:npc_dialogue, user_prompt,
           user_id: user_id,
           system: system_prompt,
           max_tokens: max_tokens
         ) do
      {:ok, %{text: text}} ->
        {:ok, text}

      {:error, reason} ->
        Logger.warning("[NpcDialogue] AI call failed: #{inspect(reason)}")
        {:error, reason}
    end
  end

  # ── Action Parsing ─────────────────────────────────────────────

  @action_regex ~r/\[(GIVE_ITEM|START_QUEST|REVEAL_SECRET):([^\]]+)\]/

  defp parse_actions(ai_text) do
    actions =
      Regex.scan(@action_regex, ai_text)
      |> Enum.map(fn [_full, action_type, value] ->
        %{
          type: String.downcase(action_type) |> String.to_atom(),
          value: String.trim(value)
        }
      end)

    clean_text = Regex.replace(@action_regex, ai_text, "") |> String.trim()
    {clean_text, actions}
  end

  # ── Memory Persistence ────────────────────────────────────────

  defp save_memory(npc_id, char_id, player_message, npc_response, existing_memory) do
    new_messages =
      existing_memory.messages
      |> Enum.concat([
        %{role: "player", text: player_message, at: DateTime.utc_now() |> DateTime.to_iso8601()},
        %{role: "npc", text: npc_response, at: DateTime.utc_now() |> DateTime.to_iso8601()}
      ])
      |> Enum.take(-@max_memory_messages)

    messages_json = Jason.encode!(new_messages)

    summary =
      if length(new_messages) >= @max_memory_messages do
        build_summary(existing_memory.summary, new_messages)
      else
        existing_memory.summary
      end

    Repo.query(
      """
      INSERT INTO #{@memory_table} (npc_id, char_id, messages_json, summary, last_talked_at)
      VALUES (?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        messages_json = VALUES(messages_json),
        summary = VALUES(summary),
        last_talked_at = NOW()
      """,
      [npc_id, char_id, messages_json, summary]
    )
  end

  defp build_summary(existing_summary, messages) do
    oldest_messages =
      messages
      |> Enum.take(10)
      |> Enum.map(fn msg ->
        role = Map.get(msg, "role", Map.get(msg, :role, "unknown"))
        text = Map.get(msg, "text", Map.get(msg, :text, ""))
        "#{role}: #{text}"
      end)
      |> Enum.join("; ")

    base = existing_summary || ""

    truncated =
      if byte_size(base) > 500 do
        String.slice(base, -500, 500)
      else
        base
      end

    "#{truncated} | #{oldest_messages}"
    |> String.slice(0, 1000)
  end

  # ── Helpers ────────────────────────────────────────────────────

  defp decode_json(nil, default), do: default
  defp decode_json("", default), do: default

  defp decode_json(json, default) when is_binary(json) do
    case Jason.decode(json) do
      {:ok, data} -> data
      _ -> default
    end
  end

  defp decode_json(data, _default) when is_list(data) or is_map(data), do: data
  defp decode_json(_, default), do: default
end
