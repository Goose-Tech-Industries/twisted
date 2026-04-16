defmodule TePhoenix.Game.SagaEngine do
  @moduledoc """
  AI Saga Engine — generates and runs multi-chapter story arcs.
  Handles: AI generation, chapter progression, broadcasting, scaling, recaps.
  """

  alias TePhoenix.Repo
  alias TePhoenix.Game.PlayerRegistry
  alias TePhoenix.NpcBrain
  require Logger

  # ── AI Saga Generation ──────────────────────────────────────────

  @doc "Generate a complete saga with AI. Returns {:ok, saga_id} or {:error, reason}."
  def generate_saga(opts \\ %{}) do
    state = gather_world_state()
    chapters = opts[:chapters] || 3
    theme = opts[:theme] || "dark_celtic"
    seed = opts[:seed_prompt] || ""

    prompt = build_generation_prompt(state, chapters, theme, seed)
    ai_config = NpcBrain.load_ai_config()

    case call_ai(prompt, ai_config, 2000) do
      {:ok, text} ->
        case parse_saga_response(text) do
          {:ok, saga_data} -> insert_saga(saga_data, theme)
          err -> err
        end
      _ ->
        # Fallback: generate a template saga
        {:ok, saga_data} = generate_fallback_saga(state, chapters, theme)
        insert_saga(saga_data, theme)
    end
  end

  @doc "Generate a recap for a player logging in mid-saga."
  def generate_recap(saga_id, character_id \\ nil) do
    saga = get_saga(saga_id)
    if saga == nil, do: {:error, "Saga not found"}, else: do_generate_recap(saga, character_id)
  end

  @doc "Generate interlude content between sagas."
  def generate_interlude(last_saga_id) do
    saga = get_saga(last_saga_id)
    state = gather_world_state()
    prompt = """
    You are the narrator of a dark Celtic fantasy MMO. The saga "#{saga && saga["name"] || "Unknown"}" just ended.
    #{if saga, do: "Outcome: #{saga["lore_summary"] || saga["description"]}", else: ""}

    Write a short interlude event (2-3 sentences) that bridges the gap to the next story arc.
    Include: atmospheric description, hint of what's to come, reference to the world state.
    Online players: #{state.online_count}. Keep it under 100 words. Dark, Celtic, ominous tone.
    """
    ai_config = NpcBrain.load_ai_config()
    case call_ai(prompt, ai_config, 300) do
      {:ok, text} -> {:ok, text}
      _ -> {:ok, "The embers of battle fade, but the ancient stones whisper of darker days ahead. The blood oghams pulse with unread warnings, and beyond the veil, something stirs..."}
    end
  end

  # ── Chapter Progression ─────────────────────────────────────────

  @doc "Advance to the next chapter of an active saga."
  def advance_chapter(saga_id) do
    saga = get_saga(saga_id)
    if saga == nil or saga["status"] != "active" do
      {:error, "Saga not active"}
    else
      current = get_current_chapter(saga_id)

      # Complete current chapter
      if current do
        Repo.query("UPDATE game_saga_chapters SET status='completed', completed_at=NOW() WHERE id=?", [current["id"]])
        distribute_rewards(saga_id, current)
        broadcast_narrative(current["narrative_outro"], current["affected_map_ids"])
      end

      # Find next chapter
      next_num = if current, do: current["chapter_number"] + 1, else: 1
      case Repo.query("SELECT id FROM game_saga_chapters WHERE saga_id=? AND chapter_number=? LIMIT 1", [saga_id, next_num]) do
        {:ok, %{rows: [[next_id]]}} ->
          Repo.query("UPDATE game_saga_chapters SET status='active', started_at=NOW() WHERE id=?", [next_id])
          Repo.query("UPDATE game_sagas SET current_chapter_id=? WHERE id=?", [next_id, saga_id])

          next = get_chapter(next_id)
          broadcast_narrative(next["narrative_intro"], next["affected_map_ids"])
          schedule_chapter_events(next)

          # Set countdown if applicable
          if next["countdown_hours"] && next["countdown_hours"] > 0 do
            deadline = NaiveDateTime.add(NaiveDateTime.utc_now(), next["countdown_hours"] * 3600)
            Repo.query("UPDATE game_saga_chapters SET trigger_deadline=? WHERE id=?", [deadline, next_id])
          end

          {:ok, next}

        _ ->
          # No more chapters — complete the saga
          complete_saga(saga_id)
      end
    end
  end

  @doc "Start a saga (activate first chapter)."
  def start_saga(saga_id) do
    Repo.query("UPDATE game_sagas SET status='active', started_at=NOW() WHERE id=?", [saga_id])
    advance_chapter(saga_id)
  end

  @doc "Complete a saga and generate lore summary."
  def complete_saga(saga_id) do
    saga = get_saga(saga_id)
    Repo.query("UPDATE game_sagas SET status='completed', completed_at=NOW() WHERE id=?", [saga_id])

    # Generate lore summary
    ai_config = NpcBrain.load_ai_config()
    chapters = get_all_chapters(saga_id)
    chapter_summaries = Enum.map(chapters, fn c -> "Ch#{c["chapter_number"]}: #{c["title"]} - #{c["status"]}" end) |> Enum.join(", ")

    prompt = """
    Write a 2-3 sentence lore summary for the completed saga "#{saga["name"]}".
    Villain: #{saga["villain_name"] || "unknown threat"}. Chapters: #{chapter_summaries}.
    Dark Celtic fantasy tone. This becomes permanent world history.
    """
    lore = case call_ai(prompt, ai_config, 200) do
      {:ok, text} -> text
      _ -> "The saga of #{saga["name"]} has ended. Its echoes will be felt for generations."
    end

    Repo.query("UPDATE game_sagas SET lore_summary=? WHERE id=?", [lore, saga_id])

    # Insert into lore book
    Repo.query(
      "INSERT INTO game_saga_lore (saga_id, title, body, category, unlocked_by_default) VALUES (?, ?, ?, 'history', 1)",
      [saga_id, saga["name"], lore]
    )

    # Broadcast completion
    broadcast_narrative("📜 **The saga of #{saga["name"]} has concluded.** #{lore}", nil)

    {:ok, saga_id}
  end

  @doc "Fail the current chapter and handle branching."
  def fail_chapter(saga_id) do
    current = get_current_chapter(saga_id)
    if current do
      Repo.query("UPDATE game_saga_chapters SET status='failed', completed_at=NOW() WHERE id=?", [current["id"]])

      case current["branch_on_fail"] do
        nil -> advance_chapter(saga_id)
        "" -> advance_chapter(saga_id)
        branch ->
          broadcast_narrative("💀 **#{current["title"]}** — The heroes have fallen. The darkness spreads...", current["affected_map_ids"])
          handle_branch(saga_id, current, branch)
      end
    else
      {:error, "No active chapter"}
    end
  end

  # ── Scaling & Participation ─────────────────────────────────────

  @doc "Register a character as participating in the active saga."
  def join_saga(saga_id, character_id, user_id) do
    Repo.query("""
      INSERT INTO game_saga_participants (saga_id, character_id, user_id, last_active)
      VALUES (?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE last_active=NOW()
    """, [saga_id, character_id, user_id])
  end

  @doc "Record contribution (damage, kills, etc)."
  def record_contribution(saga_id, character_id, %{} = data) do
    sets = []
    params = []

    {sets, params} = if data[:damage], do: {sets ++ ["damage_dealt=damage_dealt+?"], params ++ [data.damage]}, else: {sets, params}
    {sets, params} = if data[:boss_kill], do: {sets ++ ["bosses_killed=bosses_killed+1"], params}, else: {sets, params}
    {sets, params} = if data[:death], do: {sets ++ ["deaths=deaths+1"], params}, else: {sets, params}
    {sets, params} = if data[:score], do: {sets ++ ["contribution_score=contribution_score+?"], params ++ [data.score]}, else: {sets, params}

    if sets != [] do
      set_str = Enum.join(sets ++ ["last_active=NOW()"], ", ")
      Repo.query("UPDATE game_saga_participants SET #{set_str} WHERE saga_id=? AND character_id=?", params ++ [saga_id, character_id])
    end
  end

  @doc "Get scaled difficulty for current participant count."
  def scaled_difficulty(saga_id) do
    saga = get_saga(saga_id)
    base = saga["difficulty_base"] || 1
    mode = saga["scaling_mode"] || "fixed"

    case mode do
      "fixed" -> base
      "player_count" ->
        count = participant_count(saga_id)
        base * max(1, count / 3.0) |> Float.round(1)
      "adaptive" ->
        # Scale based on avg chapter completion time and death ratio
        participants = get_participants(saga_id)
        avg_deaths = if participants == [], do: 0, else: Enum.sum(Enum.map(participants, & &1["deaths"])) / max(length(participants), 1)
        if avg_deaths > 3, do: max(1, base * 0.8), else: base * 1.2
    end
  end

  # ── Queries ─────────────────────────────────────────────────────

  def get_saga(id) do
    case Repo.query("SELECT * FROM game_sagas WHERE id=?", [id]) do
      {:ok, %{rows: [row], columns: cols}} -> Enum.zip(cols, row) |> Map.new()
      _ -> nil
    end
  end

  def get_chapter(id) do
    case Repo.query("SELECT * FROM game_saga_chapters WHERE id=?", [id]) do
      {:ok, %{rows: [row], columns: cols}} -> Enum.zip(cols, row) |> Map.new()
      _ -> nil
    end
  end

  def get_current_chapter(saga_id) do
    case Repo.query("SELECT * FROM game_saga_chapters WHERE saga_id=? AND status='active' ORDER BY chapter_number LIMIT 1", [saga_id]) do
      {:ok, %{rows: [row], columns: cols}} -> Enum.zip(cols, row) |> Map.new()
      _ -> nil
    end
  end

  def get_all_chapters(saga_id) do
    case Repo.query("SELECT * FROM game_saga_chapters WHERE saga_id=? ORDER BY chapter_number", [saga_id]) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn r -> Enum.zip(cols, r) |> Map.new() end)
      _ -> []
    end
  end

  def get_participants(saga_id) do
    case Repo.query("""
      SELECT sp.*, c.name as char_name, c.level as char_level
      FROM game_saga_participants sp
      LEFT JOIN characters c ON c.id = sp.character_id
      WHERE sp.saga_id=? ORDER BY sp.contribution_score DESC
    """, [saga_id]) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn r -> Enum.zip(cols, r) |> Map.new() end)
      _ -> []
    end
  end

  def participant_count(saga_id) do
    case Repo.query("SELECT COUNT(*) FROM game_saga_participants WHERE saga_id=?", [saga_id]) do
      {:ok, %{rows: [[c]]}} -> c
      _ -> 0
    end
  end

  def list_sagas(status \\ nil) do
    {where, params} = if status, do: {"WHERE status=?", [status]}, else: {"", []}
    case Repo.query("SELECT * FROM game_sagas #{where} ORDER BY created_at DESC LIMIT 20", params) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn r -> Enum.zip(cols, r) |> Map.new() end)
      _ -> []
    end
  end

  def get_lore(saga_id) do
    case Repo.query("SELECT * FROM game_saga_lore WHERE saga_id=? ORDER BY created_at", [saga_id]) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn r -> Enum.zip(cols, r) |> Map.new() end)
      _ -> []
    end
  end

  # ── Private: AI Generation ──────────────────────────────────────

  defp build_generation_prompt(state, chapters, theme, seed) do
    map_list = case Repo.query("SELECT id, name, min_level FROM game_maps WHERE is_active=1 ORDER BY min_level LIMIT 15") do
      {:ok, %{rows: r}} -> Enum.map(r, fn [id, n, lvl] -> "#{n} (id:#{id}, lv#{lvl || 1})" end) |> Enum.join(", ")
      _ -> "various maps"
    end

    npc_list = case Repo.query("SELECT id, name FROM game_npcs WHERE is_active=1 ORDER BY RAND() LIMIT 10") do
      {:ok, %{rows: r}} -> Enum.map(r, fn [id, n] -> "#{n} (id:#{id})" end) |> Enum.join(", ")
      _ -> "various NPCs"
    end

    """
    Generate a #{chapters}-chapter saga for a dark Celtic fantasy MMO (Planet Mado rules).
    Theme: #{theme}. #{if seed != "", do: "Seed idea: #{seed}", else: ""}

    WORLD STATE:
    - Online players: #{state.online_count}
    - Player levels: #{inspect(state.levels)}
    - Available maps: #{map_list}
    - Known NPCs: #{npc_list}

    FORMAT your response EXACTLY as this JSON structure:
    {
      "name": "Saga name (evocative, dark Celtic)",
      "description": "1-2 sentence overview",
      "villain_name": "The antagonist's name",
      "villain_description": "2 sentences about the villain",
      "icon": "single emoji",
      "chapters": [
        {
          "chapter_number": 1,
          "title": "Chapter title",
          "description": "What happens in this chapter",
          "narrative_intro": "Atmospheric broadcast when chapter begins (2-3 sentences, dark Celtic tone)",
          "narrative_outro": "Broadcast when chapter ends (1-2 sentences)",
          "boss_name": "Boss name for this chapter (null if no boss)",
          "boss_level": 5,
          "countdown_hours": 48,
          "trigger_type": "manual",
          "reward_xp": 200,
          "reward_gold": 100,
          "broadcasts": [
            {"delay_minutes": 30, "message": "Atmospheric update broadcast"},
            {"delay_minutes": 120, "message": "Tension building broadcast"}
          ]
        }
      ]
    }

    RULES:
    - Each chapter must escalate in intensity and difficulty
    - Boss levels should match player level range (currently: #{inspect(state.levels)})
    - Countdown hours create urgency (24-72 hours per chapter)
    - Broadcasts build atmosphere during the chapter
    - Last chapter should have the main villain as boss
    - Include Celtic mythology references: fomorians, tuatha dé, sidhe, oghams, samhain, etc.
    - Make it feel like a DBZ saga arc: building tension, powerful new enemies, transformation moments
    - Return ONLY valid JSON, no markdown or explanation
    """
  end

  defp parse_saga_response(text) do
    # Strip markdown code blocks if present
    text = text
    |> String.replace(~r/```json\s*/, "")
    |> String.replace(~r/```\s*/, "")
    |> String.trim()

    case Jason.decode(text) do
      {:ok, data} when is_map(data) -> {:ok, data}
      _ -> {:error, "Failed to parse AI response as JSON"}
    end
  end

  defp insert_saga(data, theme) do
    chapters_data = data["chapters"] || []

    case Repo.query("""
      INSERT INTO game_sagas (name, description, icon, villain_name, villain_description, theme, total_chapters, ai_generated, ai_seed_prompt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    """, [
      data["name"] || "Unnamed Saga",
      data["description"],
      data["icon"] || "📜",
      data["villain_name"],
      data["villain_description"],
      theme,
      length(chapters_data),
      data["seed"] || ""
    ]) do
      {:ok, %{last_insert_id: saga_id}} ->
        # Insert chapters
        Enum.each(chapters_data, fn ch ->
          broadcasts_json = Jason.encode!(ch["broadcasts"] || [])
          Repo.query("""
            INSERT INTO game_saga_chapters
            (saga_id, chapter_number, title, description, narrative_intro, narrative_outro,
             boss_name, boss_level, countdown_hours, trigger_type, reward_xp, reward_gold,
             broadcasts_json, difficulty_modifier)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """, [
            saga_id, ch["chapter_number"], ch["title"], ch["description"],
            ch["narrative_intro"], ch["narrative_outro"],
            ch["boss_name"], ch["boss_level"], ch["countdown_hours"],
            ch["trigger_type"] || "manual",
            ch["reward_xp"] || 0, ch["reward_gold"] || 0,
            broadcasts_json, ch["chapter_number"] * 0.5 + 0.5
          ])
        end)

        # Generate villain lore entry
        if data["villain_name"] do
          Repo.query(
            "INSERT INTO game_saga_lore (saga_id, title, body, category) VALUES (?, ?, ?, 'villain')",
            [saga_id, data["villain_name"], data["villain_description"] || "A mysterious threat."]
          )
        end

        {:ok, saga_id}

      _ -> {:error, "Failed to insert saga"}
    end
  end

  defp generate_fallback_saga(state, chapters, _theme) do
    villain_names = ["The Hollow Wraith", "Crom Dubh", "The Morrigan's Shadow", "Balor the Reborn",
                     "The Fomorian King", "Dullahan of the Black Gate", "The Cailleach Risen"]
    villain = Enum.random(villain_names)

    saga_names = ["#{villain}'s Conquest", "The Blood Ogham War", "Rites of the Dark Solstice",
                  "The Fomorian Incursion", "Samhain's Reckoning", "The Curse of the Sidhe Court"]
    name = Enum.random(saga_names)

    avg_level = if state.levels == [], do: 1, else: div(Enum.sum(state.levels), max(length(state.levels), 1))

    chapters_data = for i <- 1..chapters do
      %{
        "chapter_number" => i,
        "title" => chapter_title(i, chapters, villain),
        "description" => chapter_desc(i, chapters),
        "narrative_intro" => chapter_intro(i, chapters, villain),
        "narrative_outro" => chapter_outro(i, chapters),
        "boss_name" => if(i == chapters, do: villain, else: "#{villain}'s Lieutenant"),
        "boss_level" => avg_level + i * 2,
        "countdown_hours" => 24 * i,
        "trigger_type" => "manual",
        "reward_xp" => 100 * i,
        "reward_gold" => 50 * i,
        "broadcasts" => [
          %{"delay_minutes" => 60, "message" => "Dark energy pulses from the ancient stones..."},
          %{"delay_minutes" => 180, "message" => "#{villain}'s power grows. The heroes must act."}
        ]
      }
    end

    {:ok, %{
      "name" => name, "description" => "#{villain} threatens the realm. Heroes must unite across #{chapters} trials to stop the encroaching darkness.",
      "icon" => Enum.random(~w(⚔️ 🗡️ 💀 🌑 🔥 👁️)), "villain_name" => villain,
      "villain_description" => "An ancient evil stirred from the cairns beneath the moorland. #{villain} commands dark ogham magic and an army of twisted fae.",
      "chapters" => chapters_data
    }}
  end

  defp chapter_title(1, _, villain), do: "#{villain}'s Herald"
  defp chapter_title(n, total, villain) when n == total, do: "The Fall of #{villain}"
  defp chapter_title(2, _, _), do: "The Gathering Storm"
  defp chapter_title(3, t, _) when t > 3, do: "Blood and Iron"
  defp chapter_title(n, _, _), do: "Trial #{n}"

  defp chapter_desc(1, _), do: "Dark omens appear across the land. Scouts report movement in the ancient cairns."
  defp chapter_desc(n, total) when n == total, do: "The final confrontation. All forces converge for the decisive battle."
  defp chapter_desc(_, _), do: "The enemy's strength grows. The heroes must push deeper into the darkness."

  defp chapter_intro(1, _, villain), do: "🌑 The stones tremble. Whispers carry on the wind — #{villain} has awakened. Dark shapes move through the mist. The blood oghams burn with warning. Heroes of the realm, steel yourselves..."
  defp chapter_intro(n, total, villain) when n == total, do: "⚔️ The hour of reckoning is upon us. #{villain} stands at the heart of the maelstrom, power crackling through ancient ley lines. This ends now. For the living and the dead — CHARGE!"
  defp chapter_intro(_, _, villain), do: "🔥 #{villain}'s forces spread across the moorlands like a plague. The ancient wards falter. Rally to the stones, warriors — the next trial awaits."

  defp chapter_outro(n, total) when n == total, do: "The darkness recedes. The realm breathes again... for now."
  defp chapter_outro(_, _), do: "A brief respite. But the worst is yet to come."

  # ── Private: Broadcasting ───────────────────────────────────────

  defp broadcast_narrative(nil, _), do: :ok
  defp broadcast_narrative("", _), do: :ok
  defp broadcast_narrative(message, _map_ids) do
    TePhoenixWeb.Endpoint.broadcast!("social:lobby", "system_broadcast", %{
      message: message,
      style: "saga",
      from: "SAGA",
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
    })
  end

  defp schedule_chapter_events(chapter) do
    broadcasts = case chapter["broadcasts_json"] do
      nil -> []
      "" -> []
      json when is_binary(json) -> case Jason.decode(json) do {:ok, l} -> l; _ -> [] end
      l when is_list(l) -> l
      _ -> []
    end

    Enum.each(broadcasts, fn b ->
      fire_at = NaiveDateTime.add(NaiveDateTime.utc_now(), (b["delay_minutes"] || 60) * 60)
      Repo.query("""
        INSERT INTO game_saga_events (saga_id, chapter_id, event_type, message, fire_at, target_map_id)
        VALUES (?, ?, 'broadcast', ?, ?, NULL)
      """, [chapter["saga_id"], chapter["id"], b["message"], fire_at])
    end)
  end

  defp distribute_rewards(saga_id, chapter) do
    xp = chapter["reward_xp"] || 0
    gold = chapter["reward_gold"] || 0

    if xp > 0 or gold > 0 do
      participants = get_participants(saga_id)
      Enum.each(participants, fn p ->
        if xp > 0 do
          Repo.query("UPDATE characters SET experience=experience+? WHERE id=?", [xp, p["character_id"]])
        end
        if gold > 0 do
          Repo.query("UPDATE users SET currency=currency+? WHERE id=?", [gold, p["user_id"]])
        end
        Repo.query("UPDATE game_saga_participants SET chapters_completed=chapters_completed+1 WHERE saga_id=? AND character_id=?", [saga_id, p["character_id"]])
      end)
    end
  end

  defp handle_branch(saga_id, _chapter, _branch_key) do
    # For now, just advance. Branching logic can be expanded.
    advance_chapter(saga_id)
  end

  # ── Private: Recap ──────────────────────────────────────────────

  defp do_generate_recap(saga, character_id) do
    chapters = get_all_chapters(saga["id"])
    completed = Enum.filter(chapters, fn c -> c["status"] in ["completed", "failed"] end)
    current = Enum.find(chapters, fn c -> c["status"] == "active" end)

    participation = if character_id do
      case Repo.query("SELECT contribution_score, chapters_completed, bosses_killed FROM game_saga_participants WHERE saga_id=? AND character_id=?", [saga["id"], character_id]) do
        {:ok, %{rows: [[score, ch, kills]]}} -> %{score: score, chapters: ch, kills: kills}
        _ -> nil
      end
    end

    chapter_summary = completed
    |> Enum.map(fn c -> "#{c["title"]}: #{c["status"]}" end)
    |> Enum.join(". ")

    prompt = """
    Write a "Previously on..." recap for the saga "#{saga["name"]}" in a dark Celtic fantasy MMO.
    Villain: #{saga["villain_name"]}. Completed chapters: #{chapter_summary}.
    Current chapter: #{if current, do: current["title"], else: "none"}.
    #{if participation, do: "This player has contributed #{participation.score} points and completed #{participation.chapters} chapters.", else: ""}
    Keep it under 80 words. Dramatic, like a DBZ narrator. Dark Celtic tone.
    """

    ai_config = NpcBrain.load_ai_config()
    case call_ai(prompt, ai_config, 200) do
      {:ok, text} -> {:ok, text}
      _ ->
        fallback = "The saga of #{saga["name"]} continues. #{saga["villain_name"]} grows stronger. #{length(completed)} trials have passed — #{if current, do: "#{current["title"]} now unfolds", else: "the final reckoning approaches"}."
        {:ok, fallback}
    end
  end

  # ── Private: Helpers ────────────────────────────────────────────

  defp gather_world_state do
    players = PlayerRegistry.all()
    %{
      online_count: length(players),
      levels: Enum.map(players, & &1.level) |> Enum.sort()
    }
  end

  defp call_ai(prompt, config, max_tokens) do
    provider = config["provider"] || config[:provider]
    api_key = config["apiKey"] || config[:api_key] || ""
    model = config["model"] || config[:model] || ""

    if provider in ["anthropic", "gemini", "openai"] and api_key != "" do
      try do
        case provider do
          "anthropic" ->
            url = "https://api.anthropic.com/v1/messages"
            headers = [{"x-api-key", api_key}, {"anthropic-version", "2023-06-01"}, {"content-type", "application/json"}]
            m = if model != "", do: model, else: "claude-haiku-4-5-20251001"
            body = Jason.encode!(%{model: m, max_tokens: max_tokens, temperature: 0.9,
              messages: [%{role: "user", content: prompt}]})
            case http_post(url, body, headers) do
              {:ok, json} ->
                text = get_in(json, ["content", Access.at(0), "text"])
                if text, do: {:ok, String.trim(text)}, else: nil
              _ -> nil
            end

          "gemini" ->
            m = if model != "", do: model, else: "gemini-1.5-flash"
            url = "https://generativelanguage.googleapis.com/v1beta/models/#{m}:generateContent?key=#{api_key}"
            body = Jason.encode!(%{contents: [%{parts: [%{text: prompt}]}],
              generationConfig: %{temperature: 0.9, maxOutputTokens: max_tokens}})
            case http_post(url, body) do
              {:ok, json} ->
                text = get_in(json, ["candidates", Access.at(0), "content", "parts", Access.at(0), "text"])
                if text, do: {:ok, String.trim(text)}, else: nil
              _ -> nil
            end

          "openai" ->
            base = if config["baseUrl"] && config["baseUrl"] != "", do: config["baseUrl"], else: "https://api.openai.com"
            url = "#{base}/v1/chat/completions"
            headers = [{"authorization", "Bearer #{api_key}"}, {"content-type", "application/json"}]
            m = if model != "", do: model, else: "gpt-4o-mini"
            body = Jason.encode!(%{model: m, max_tokens: max_tokens, temperature: 0.9,
              messages: [%{role: "user", content: prompt}]})
            case http_post(url, body, headers) do
              {:ok, json} ->
                text = get_in(json, ["choices", Access.at(0), "message", "content"])
                if text, do: {:ok, String.trim(text)}, else: nil
              _ -> nil
            end

          _ -> nil
        end
      rescue
        e -> Logger.warning("SagaEngine AI error: #{inspect(e)}"); nil
      end
    else
      nil
    end
  end

  defp http_post(url, body, headers \\ [{"content-type", "application/json"}]) do
    case :httpc.request(:post,
      {String.to_charlist(url),
       Enum.map(headers, fn {k,v} -> {String.to_charlist(k), String.to_charlist(v)} end),
       ~c"application/json", String.to_charlist(body)},
      [{:timeout, 30_000}], []) do
      {:ok, {{_, 200, _}, _, resp_body}} -> Jason.decode(to_string(resp_body))
      {:ok, {{_, code, _}, _, resp_body}} ->
        Logger.warning("SagaEngine HTTP #{code}: #{to_string(resp_body) |> String.slice(0, 200)}")
        nil
      {:error, reason} ->
        Logger.warning("SagaEngine HTTP error: #{inspect(reason)}")
        nil
    end
  end
end
