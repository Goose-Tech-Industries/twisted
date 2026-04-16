defmodule TePhoenix.NpcBrain do
  @moduledoc """
  Multi-provider AI NPC dialogue system with rule-based fallback.
  Ported from npc_brain.js. Supports Gemini, Anthropic, OpenAI, Ollama.

  Provider priority: DB config (system_settings) > env vars > rule-based fallback.
  Configure via AdminSauce > Settings > AI Brain.
  """

  require Logger

  alias TePhoenix.Repo

  @doc "Get an NPC reply. Tries AI provider, falls back to rule-based."
  def get_reply(opts) do
    prompt = build_prompt(opts)
    ai_config = opts[:ai_config] || load_ai_config()

    provider = ai_config["provider"] || ai_config[:provider]

    result = case provider do
      "gemini" -> call_provider(:gemini, prompt, ai_config)
      "anthropic" -> call_provider(:anthropic, prompt, ai_config)
      "openai" -> call_provider(:openai, prompt, ai_config)
      "ollama" -> call_provider(:ollama, prompt, ai_config)
      _ -> nil
    end

    case result do
      {:ok, text} when text != "" -> text
      _ -> rule_based_reply(opts[:npc], opts[:message], opts[:memory])
    end
  end

  @doc "Extract facts from a player message."
  def extract_facts(message, existing_facts \\ []) do
    msg = String.downcase(message)
    facts = existing_facts

    facts = if contains_any?(msg, ~w(warrior fighter sword shield)), do: add_fact(facts, "Appears to be a warrior type"), else: facts
    facts = if contains_any?(msg, ~w(mage wizard spell magic)), do: add_fact(facts, "Appears to be a mage type"), else: facts
    facts = if contains_any?(msg, ~w(rogue thief sneak steal)), do: add_fact(facts, "Appears to be a rogue type"), else: facts
    facts = if contains_any?(msg, ~w(quest job task mission)), do: add_fact(facts, "Has asked about quests"), else: facts
    facts = if contains_any?(msg, ~w(buy sell shop trade price)), do: add_fact(facts, "Is interested in trading"), else: facts
    facts = if contains_any?(msg, ~w(thanks grateful)), do: add_fact(facts, "Was polite and thankful"), else: facts
    facts = if contains_any?(msg, ~w(damn fool idiot useless)), do: add_fact(facts, "Was rude"), else: facts
    facts = if contains_any?(msg, ~w(ogham blood carved groove)), do: add_fact(facts, "Has asked about Blood Oghams"), else: facts

    Enum.take(facts, -10)
  end

  @doc "Calculate reputation change from a message."
  def reputation_delta(message) do
    msg = String.downcase(message)
    cond do
      contains_any?(msg, ~w(thank grateful appreciate impressive)) -> Enum.random([3, 4, 5])
      contains_any?(msg, ~w(damn fool idiot useless worthless pathetic)) -> Enum.random([-5, -6, -8])
      contains_any?(msg, ~w(help please need urgent)) -> 1
      true -> 0
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # PROMPT BUILDER
  # ══════════════════════════════════════════════════════════════════

  defp build_prompt(opts) do
    npc = opts[:npc] || %{}
    player = opts[:player] || %{}
    message = opts[:message] || ""
    history = opts[:history] || []
    memory = opts[:memory] || %{}
    _world_flags = opts[:world_flags] || %{}
    _region = opts[:region]
    ai_config = opts[:ai_config] || %{}

    npc_name = npc["name"] || npc[:name] || "Stranger"
    persona = npc["persona"] || npc[:persona] || "A weathered inhabitant of this world."

    hist = history
      |> Enum.take(-8)
      |> Enum.map(fn h ->
        role = h["role"] || h[:role]
        text = h["text"] || h[:text]
        if role == "user", do: "PLAYER: #{text}", else: "#{String.upcase(npc_name)}: #{text}"
      end)
      |> Enum.join("\n")

    facts = memory["facts"] || memory[:facts] || []
    rep = memory["reputation"] || memory[:reputation] || 0

    facts_str = if facts != [] do
      "What you remember about #{player[:name] || "the player"}:\n" <>
        Enum.map_join(facts, "\n", fn f -> "  - #{f}" end)
    else
      ""
    end

    rep_tone = cond do
      rep > 50 -> "You respect and like this player. Be warm and generous with information."
      rep < -30 -> "You distrust this player deeply. Be cold, guarded, or openly hostile."
      true -> "You are neutral toward this player. Cautious but not unfriendly."
    end

    world_desc = (ai_config["systemPrompt"] || ai_config[:system_prompt] || "")
      |> to_string()
      |> String.trim()
      |> then(fn s -> if s == "", do: "a dark Celtic fantasy world. Dark, grounded tone. Celtic gothic.", else: s end)

    address = if player[:title], do: "#{player[:name]} #{player[:title]}", else: player[:name] || "traveler"

    [
      "You are #{npc_name}, a character in #{world_desc}",
      "Your persona: #{persona}",
      "You are speaking to #{address}.",
      rep_tone,
      facts_str,
      "Rules:",
      "- Reply as #{npc_name} ONLY. 1-3 short sentences maximum.",
      "- Stay completely in character. No meta-commentary.",
      "- Do NOT start your reply with your own name.",
      "",
      if(hist != "", do: "Conversation so far:\n#{hist}\n", else: ""),
      "PLAYER: #{message}",
      "#{String.upcase(npc_name)}:"
    ]
    |> Enum.filter(fn s -> s != nil and s != "" end)
    |> Enum.join("\n")
  end

  # ══════════════════════════════════════════════════════════════════
  # AI PROVIDERS
  # ══════════════════════════════════════════════════════════════════

  defp call_provider(provider, prompt, config) do
    api_key = config["apiKey"] || config[:api_key] || ""
    model = config["model"] || config[:model] || ""
    base_url = config["baseUrl"] || config[:base_url] || ""
    max_tokens = config["maxTokens"] || config[:max_tokens] || 256
    temperature = config["temperature"] || config[:temperature] || 0.85

    try do
      case provider do
        :gemini ->
          m = if model != "", do: model, else: "gemini-1.5-flash"
          url = "https://generativelanguage.googleapis.com/v1beta/models/#{m}:generateContent?key=#{api_key}"
          body = Jason.encode!(%{
            contents: [%{parts: [%{text: prompt}]}],
            generationConfig: %{temperature: temperature, maxOutputTokens: max_tokens}
          })
          case http_post(url, body) do
            {:ok, json} ->
              text = get_in(json, ["candidates", Access.at(0), "content", "parts", Access.at(0), "text"])
              if text, do: {:ok, String.trim(text)}, else: nil
            _ -> nil
          end

        :anthropic ->
          url = "https://api.anthropic.com/v1/messages"
          headers = [{"x-api-key", api_key}, {"anthropic-version", "2023-06-01"}, {"content-type", "application/json"}]
          m = if model != "", do: model, else: "claude-haiku-4-5-20251001"
          body = Jason.encode!(%{model: m, max_tokens: max_tokens, messages: [%{role: "user", content: prompt}]})
          case http_post(url, body, headers) do
            {:ok, json} ->
              text = get_in(json, ["content", Access.at(0), "text"])
              if text, do: {:ok, String.trim(text)}, else: nil
            _ -> nil
          end

        :openai ->
          endpoint = if base_url != "", do: String.trim_trailing(base_url, "/") <> "/chat/completions",
                      else: "https://api.openai.com/v1/chat/completions"
          headers = [{"authorization", "Bearer #{api_key}"}, {"content-type", "application/json"}]
          m = if model != "", do: model, else: "gpt-4o-mini"
          body = Jason.encode!(%{model: m, max_tokens: max_tokens, temperature: temperature, messages: [%{role: "user", content: prompt}]})
          case http_post(endpoint, body, headers) do
            {:ok, json} ->
              text = get_in(json, ["choices", Access.at(0), "message", "content"])
              if text, do: {:ok, String.trim(text)}, else: nil
            _ -> nil
          end

        :ollama ->
          url = if base_url != "", do: base_url, else: "http://localhost:11434/api/generate"
          m = if model != "", do: model, else: "llama3"
          body = Jason.encode!(%{model: m, prompt: prompt, stream: false})
          case http_post(url, body) do
            {:ok, json} ->
              text = json["response"] || json["text"]
              if text, do: {:ok, String.trim(to_string(text))}, else: nil
            _ -> nil
          end
      end
    rescue
      e ->
        Logger.warning("NPC Brain #{provider} error: #{Exception.message(e)}")
        nil
    end
  end

  defp http_post(url, body, extra_headers \\ []) do
    headers = [{"content-type", "application/json"} | extra_headers]
    case :httpc.request(:post, {String.to_charlist(url), Enum.map(headers, fn {k, v} -> {String.to_charlist(k), String.to_charlist(v)} end), ~c"application/json", body}, [{:timeout, 15000}], []) do
      {:ok, {{_, 200, _}, _, resp_body}} ->
        case Jason.decode(to_string(resp_body)) do
          {:ok, json} -> {:ok, json}
          _ -> :error
        end
      {:ok, {{_, status, _}, _, _}} ->
        Logger.warning("NPC Brain HTTP #{status}")
        :error
      {:error, reason} ->
        Logger.warning("NPC Brain HTTP error: #{inspect(reason)}")
        :error
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # RULE-BASED FALLBACK
  # ══════════════════════════════════════════════════════════════════

  defp rule_based_reply(npc, message, memory) do
    npc_name = (npc || %{})["name"] || (npc || %{})[:name] || "NPC"
    msg = String.downcase(message || "")
    rep = (memory || %{})["reputation"] || (memory || %{})[:reputation] || 0
    mood = (npc || %{})["mood"] || (npc || %{})[:mood]

    cond do
      rep < -50 -> pick(["\"I have nothing to say to you.\"", "*#{npc_name} turns away without a word.*"])
      mood == "grieving" -> pick(["\"Not now. Please.\"", "*#{npc_name}'s eyes are red.* \"...What do you need?\""])
      mood == "fearful" -> pick(["*#{npc_name} glances around nervously.* \"Keep your voice down.\"", "\"Something's wrong here.\""])
      mood == "angry" -> pick(["\"You picked a bad time.\"", "\"Speak. But choose your words.\""])
      mood == "excited" -> pick(["\"You came at the right time!\"", "\"I was hoping someone would pass through.\""])
      contains_any?(msg, ~w(help danger urgent please)) -> pick(["\"Tell me what happened. Quickly.\"", "\"I'm listening. What's wrong?\""])
      contains_any?(msg, ~w(quest job task mission work)) -> pick(["\"There's always something that needs doing.\"", "\"You want coin or purpose? Choose one.\""])
      contains_any?(msg, ~w(buy sell shop trade)) -> pick(["\"Got something worth trading?\"", "\"Everything has a price.\""])
      contains_any?(msg, ~w(bye goodbye farewell later)) -> pick(["\"Watch your back.\"", "*#{npc_name} nods once.* \"Until next time.\""])
      true -> pick(["\"Careful. That kind of talk gets people noticed.\"", "\"Say what you mean, traveler.\"", "*#{npc_name} studies you for a moment.* \"Ask a clearer question.\""])
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # HELPERS
  # ══════════════════════════════════════════════════════════════════

  def load_ai_config do
    keys = ~w(ai_provider ai_api_key ai_model ai_base_url ai_temperature ai_max_tokens ai_system_prompt)
    config = Enum.reduce(keys, %{}, fn key, acc ->
      case Repo.query("SELECT setting_value FROM system_settings WHERE setting_key=? LIMIT 1", [key]) do
        {:ok, %{rows: [[val]]}} -> Map.put(acc, key, val)
        _ -> acc
      end
    end)

    %{
      "provider" => config["ai_provider"],
      "apiKey" => config["ai_api_key"],
      "model" => config["ai_model"],
      "baseUrl" => config["ai_base_url"],
      "temperature" => parse_float(config["ai_temperature"], 0.85),
      "maxTokens" => parse_int(config["ai_max_tokens"], 256),
      "systemPrompt" => config["ai_system_prompt"]
    }
  end

  defp pick(list), do: Enum.random(list)
  defp contains_any?(str, words), do: Enum.any?(words, fn w -> String.contains?(str, w) end)
  defp add_fact(facts, fact) do
    if fact in facts or length(facts) >= 10, do: facts, else: facts ++ [fact]
  end

  defp parse_int(nil, default), do: default
  defp parse_int(val, _default) when is_integer(val), do: val
  defp parse_int(val, default) when is_binary(val) do
    case Integer.parse(val) do {n, _} -> n; :error -> default end
  end
  defp parse_int(_, default), do: default

  defp parse_float(nil, default), do: default
  defp parse_float(val, _default) when is_float(val), do: val
  defp parse_float(val, default) when is_binary(val) do
    case Float.parse(val) do {f, _} -> f; :error -> default end
  end
  defp parse_float(_, default), do: default
end
