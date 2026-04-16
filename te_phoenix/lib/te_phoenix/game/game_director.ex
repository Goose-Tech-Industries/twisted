defmodule TePhoenix.Game.GameDirector do
  @moduledoc """
  AI Game Director — analyzes live game state and suggests GM actions.
  Reads online players, level distribution, map activity, economy, battles,
  and generates event suggestions via the configured AI provider.
  """

  alias TePhoenix.Repo
  alias TePhoenix.Game.PlayerRegistry
  alias TePhoenix.NpcBrain

  def analyze do
    state = gather_state()
    prompt = build_prompt(state)
    ai_config = NpcBrain.load_ai_config()

    case call_ai(prompt, ai_config) do
      {:ok, text} -> parse_suggestions(text, state)
      _ -> fallback_suggestions(state)
    end
  end

  def gather_state do
    players = PlayerRegistry.all()
    online_count = length(players)

    # Group by map
    map_names = case Repo.query("SELECT id, name FROM game_maps WHERE is_active=1") do
      {:ok, %{rows: r}} -> Map.new(r, fn [id, n] -> {id, n} end)
      _ -> %{}
    end

    by_map = Enum.group_by(players, fn p -> p.map_id end)
    |> Enum.map(fn {map_id, ps} ->
      %{map_id: map_id, name: Map.get(map_names, map_id, "Map #{map_id}"), count: length(ps),
        levels: Enum.map(ps, & &1.level) |> Enum.sort(), names: Enum.map(ps, & &1.name)}
    end)
    |> Enum.sort_by(& &1.count, :desc)

    # Level clusters
    levels = Enum.map(players, & &1.level) |> Enum.sort()
    level_clusters = find_level_clusters(levels)

    # Recent battle count (last hour)
    battles_hour = case Repo.query("SELECT COUNT(*) FROM game_battles WHERE created_at > NOW() - INTERVAL 1 HOUR") do
      {:ok, %{rows: [[c]]}} -> c || 0
      _ -> 0
    end

    # Economy snapshot
    avg_gold = case Repo.query("SELECT AVG(currency) FROM users WHERE is_banned=0") do
      {:ok, %{rows: [[v]]}} when not is_nil(v) -> round_num(v)
      _ -> 0
    end

    # Active world events
    active_events = case Repo.query("SELECT name, event_type FROM game_world_events WHERE is_active=1 AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 5") do
      {:ok, %{rows: r}} -> Enum.map(r, fn [n, t] -> "#{n} (#{t})" end)
      _ -> []
    end

    # Time of day context
    hour = DateTime.utc_now().hour

    %{
      online_count: online_count,
      by_map: by_map,
      levels: levels,
      level_clusters: level_clusters,
      battles_hour: battles_hour,
      avg_gold: avg_gold,
      active_events: active_events,
      hour: hour,
      map_names: map_names
    }
  end

  defp build_prompt(state) do
    map_summary = state.by_map
    |> Enum.take(8)
    |> Enum.map(fn m -> "  #{m.name}: #{m.count} players (levels: #{Enum.join(m.levels, ",")})" end)
    |> Enum.join("\n")

    cluster_text = state.level_clusters
    |> Enum.map(fn {range, count} -> "  #{range}: #{count} players" end)
    |> Enum.join("\n")

    events_text = if state.active_events == [], do: "  None", else: Enum.join(state.active_events, ", ")

    """
    You are the AI Game Director for a dark Celtic fantasy MMO (Planet Mado ruleset).
    Analyze the current game state and suggest 3-5 GM actions to increase engagement.

    CURRENT STATE:
    - Online players: #{state.online_count}
    - Recent battles (last hour): #{state.battles_hour}
    - Average player gold: #{state.avg_gold}
    - Server hour (UTC): #{state.hour}
    - Active world events: #{events_text}

    MAP DISTRIBUTION:
    #{if map_summary == "", do: "  No players online", else: map_summary}

    LEVEL CLUSTERS:
    #{if cluster_text == "", do: "  No data", else: cluster_text}

    RULES FOR SUGGESTIONS:
    - Each suggestion needs: emoji icon, short title (under 40 chars), 1-2 sentence description, action type
    - Action types: tournament, world_event, dungeon_raid, double_xp, boss_spawn, weather, broadcast, gold_drop
    - Consider: player clustering (same map = social event), level ranges (matched = tournament), low activity (incentive event), high activity (challenge event)
    - If few/no players online, suggest scheduled events or prep work instead
    - Keep suggestions thematic to dark Celtic fantasy (blood oghams, ancient rituals, cursed lands, fae courts)

    FORMAT each suggestion EXACTLY as:
    [ICON] TITLE | DESCRIPTION | ACTION_TYPE | PRIORITY(1-5)

    Example:
    ⚔️ Blood Moon Tournament | 5 warriors within Lv1-3 — perfect bracket for a quick single-elimination bout | tournament | 4
    """
  end

  defp call_ai(prompt, config) do
    provider = config["provider"] || config[:provider]
    api_key = config["apiKey"] || config[:api_key] || ""
    model = config["model"] || config[:model] || ""
    max_tokens = 600
    temperature = 0.9

    if provider in ["anthropic", "gemini", "openai", "ollama"] and api_key != "" do
      try do
        case provider do
          "anthropic" ->
            url = "https://api.anthropic.com/v1/messages"
            headers = [{"x-api-key", api_key}, {"anthropic-version", "2023-06-01"}, {"content-type", "application/json"}]
            m = if model != "", do: model, else: "claude-haiku-4-5-20251001"
            body = Jason.encode!(%{model: m, max_tokens: max_tokens, temperature: temperature,
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
              generationConfig: %{temperature: temperature, maxOutputTokens: max_tokens}})
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
            body = Jason.encode!(%{model: m, max_tokens: max_tokens, temperature: temperature,
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
        e -> require Logger; Logger.warning("GameDirector AI error: #{inspect(e)}"); nil
      end
    else
      nil
    end
  end

  defp http_post(url, body, headers \\ [{"content-type", "application/json"}]) do
    case :httpc.request(:post, {String.to_charlist(url), Enum.map(headers, fn {k,v} -> {String.to_charlist(k), String.to_charlist(v)} end), ~c"application/json", String.to_charlist(body)}, [{:timeout, 15_000}], []) do
      {:ok, {{_, 200, _}, _, resp_body}} ->
        Jason.decode(to_string(resp_body))
      {:ok, {{_, code, _}, _, resp_body}} ->
        require Logger
        Logger.warning("GameDirector HTTP #{code}: #{to_string(resp_body) |> String.slice(0, 200)}")
        nil
      {:error, reason} ->
        require Logger
        Logger.warning("GameDirector HTTP error: #{inspect(reason)}")
        nil
    end
  end

  def parse_suggestions(text, _state) do
    text
    |> String.split("\n")
    |> Enum.map(&String.trim/1)
    |> Enum.filter(fn line -> String.contains?(line, "|") end)
    |> Enum.map(fn line ->
      parts = String.split(line, "|") |> Enum.map(&String.trim/1)
      case parts do
        [title, desc, action, priority] ->
          %{title: title, description: desc, action: String.downcase(action),
            priority: parse_priority(priority)}
        [title, desc, action] ->
          %{title: title, description: desc, action: String.downcase(action), priority: 3}
        [title, desc] ->
          %{title: title, description: desc, action: "broadcast", priority: 2}
        _ -> nil
      end
    end)
    |> Enum.reject(&is_nil/1)
    |> Enum.take(5)
  end

  def fallback_suggestions(state) do
    suggestions = []

    # Tournament suggestion if level-matched players exist
    suggestions = Enum.reduce(state.level_clusters, suggestions, fn {range, count}, acc ->
      if count >= 3 do
        [%{title: "⚔️ Blood Rite Tournament", description: "#{count} warriors in #{range} range — summon them to the arena for single-elimination combat",
          action: "tournament", priority: 4} | acc]
      else
        acc
      end
    end)

    # Map clustering suggestion
    suggestions = case state.by_map do
      [%{count: c, name: name} | _] when c >= 3 ->
        [%{title: "🏰 Siege of #{name}", description: "#{c} players gathered in #{name} — spawn a dungeon boss or trigger a raid event",
          action: "boss_spawn", priority: 4} | suggestions]
      _ -> suggestions
    end

    # Low activity suggestions
    suggestions = if state.online_count <= 2 and state.online_count > 0 do
      [%{title: "✨ Double XP Hour", description: "Only #{state.online_count} online — activate double XP to reward the loyal",
        action: "double_xp", priority: 3} | suggestions]
    else
      suggestions
    end

    # No activity
    suggestions = if state.online_count == 0 do
      [%{title: "📢 Call to Arms", description: "No players online — schedule a broadcast for peak hours announcing an upcoming event",
        action: "broadcast", priority: 2},
       %{title: "🗺️ Dungeon Prep", description: "Good time to set up a new world event or dungeon while the realm is quiet",
        action: "world_event", priority: 1} | suggestions]
    else
      suggestions
    end

    # Economy suggestion
    suggestions = if state.avg_gold > 5000 do
      [%{title: "💰 Gold Sink Event", description: "Average gold is #{state.avg_gold} — consider a rare item auction or expensive vendor event",
        action: "gold_drop", priority: 3} | suggestions]
    else
      suggestions
    end

    suggestions |> Enum.sort_by(& &1.priority, :desc) |> Enum.take(5)
  end

  defp find_level_clusters(levels) when levels == [], do: []
  defp find_level_clusters(levels) do
    levels
    |> Enum.frequencies()
    |> Enum.group_by(fn {level, _} ->
      cond do
        level <= 5 -> "Lv1-5"
        level <= 10 -> "Lv6-10"
        level <= 20 -> "Lv11-20"
        level <= 30 -> "Lv21-30"
        level <= 50 -> "Lv31-50"
        true -> "Lv50+"
      end
    end)
    |> Enum.map(fn {range, entries} -> {range, Enum.sum(Enum.map(entries, fn {_, c} -> c end))} end)
    |> Enum.sort_by(fn {_, c} -> -c end)
  end

  defp parse_priority(s) do
    case Integer.parse(String.trim(s)) do
      {n, _} -> min(max(n, 1), 5)
      _ -> 3
    end
  end

  defp round_num(%Decimal{} = d), do: Decimal.to_integer(d)
  defp round_num(f) when is_float(f), do: round(f)
  defp round_num(i) when is_integer(i), do: i
  defp round_num(_), do: 0
end
