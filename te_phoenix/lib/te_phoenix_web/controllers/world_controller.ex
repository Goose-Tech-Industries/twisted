defmodule TePhoenixWeb.WorldController do
  use TePhoenixWeb, :controller
  alias TePhoenix.{Repo, Game.MapData}

  def get_map(conn, %{"id" => id}) do
    map = MapData.get(parse_int(id))
    if map, do: json(conn, %{success: true, map: map}), else: json(conn, %{success: false})
  end

  def get_map_npcs(conn, %{"id" => id}) do
    npcs = MapData.get_npcs(parse_int(id))
    json(conn, %{success: true, npcs: npcs})
  end

  def list_regions(conn, _params) do
    regions = query_rows("SELECT id, name, danger_level, is_sanctuary, pvp_enabled, xp_mult, gold_mult FROM game_regions ORDER BY name")
    json(conn, %{success: true, regions: regions})
  end

  def get_shop(conn, %{"id" => id}) do
    case Repo.query("SELECT s.*, ss.item_id, ss.price, ss.stock, i.name AS item_name, i.icon, i.type AS item_type, i.rarity FROM game_shops s LEFT JOIN game_shop_supplies ss ON ss.shop_id=s.id LEFT JOIN game_items i ON i.id=ss.item_id WHERE s.id=?", [id]) do
      {:ok, %{rows: rows, columns: cols}} when rows != [] ->
        items = Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
        json(conn, %{success: true, shop: %{id: id, items: items}})
      _ -> json(conn, %{success: false, message: "Shop not found."})
    end
  end

  def worldforge_generate(conn, params) do
    prompt = params["prompt"] || "Generate a small fantasy village"

    # Load AI config from system_settings
    settings = case Repo.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('ai_provider','ai_api_key','ai_model')") do
      {:ok, %{rows: rows}} -> Map.new(rows, fn [k, v] -> {k, v} end)
      _ -> %{}
    end

    provider = settings["ai_provider"] || "anthropic"
    api_key = settings["ai_api_key"]
    model = settings["ai_model"] || "claude-haiku-4-5-20251001"

    if is_nil(api_key) or api_key == "" do
      json(conn, %{success: false, message: "No AI API key configured. Set ai_api_key in system_settings."})
    else
      system_prompt = """
      You are a game world generator for a dark Celtic fantasy RPG called Twisted Engine.
      Generate game content as valid JSON with these fields:
      {
        "map": {"name": "string", "width": 20, "height": 20, "description": "string"},
        "npcs": [{"name": "string", "is_enemy": 0, "icon": "emoji", "x": 0, "y": 0, "persona": "string", "base_hp": 100, "base_atk": 5, "base_def": 5}],
        "enemies": [{"name": "string", "is_enemy": 1, "icon": "emoji", "x": 0, "y": 0, "base_hp": 60, "base_atk": 12, "base_def": 4}],
        "items": [{"name": "string", "type": "WEAPON|ARMOR|CONSUMABLE", "icon": "emoji", "description": "string", "bonus_atk": 0, "bonus_def": 0, "buy_price": 100}],
        "shops": [{"name": "string", "items": ["item_name"]}],
        "quests": [{"name": "string", "description": "string", "type": "KILL|EXPLORE", "target_count": 1, "reward_xp": 100, "reward_gold": 50}]
      }
      Return ONLY the JSON object, no markdown, no explanation.
      """

      case call_ai(provider, api_key, model, system_prompt, prompt) do
        {:ok, text} ->
          case Jason.decode(text) do
            {:ok, data} ->
              json(conn, %{success: true, message: "WorldForge generation complete.", data: data,
                map: data["map"] || %{"name" => "Generated Map", "width" => 20, "height" => 20}})
            {:error, _} ->
              # Try extracting JSON from markdown code blocks
              cleaned = text |> String.replace(~r/```json\n?/, "") |> String.replace(~r/```\n?/, "") |> String.trim()
              case Jason.decode(cleaned) do
                {:ok, data} ->
                  json(conn, %{success: true, message: "WorldForge generation complete.", data: data,
                    map: data["map"] || %{"name" => "Generated Map", "width" => 20, "height" => 20}})
                {:error, _} ->
                  json(conn, %{success: false, message: "AI returned invalid JSON.", raw: String.slice(text, 0, 500)})
              end
          end
        {:error, reason} ->
          json(conn, %{success: false, message: "AI generation failed: #{reason}"})
      end
    end
  end

  defp call_ai("anthropic", api_key, model, system_prompt, user_prompt) do
    url = "https://api.anthropic.com/v1/messages"
    headers = [
      {"x-api-key", api_key},
      {"anthropic-version", "2023-06-01"},
      {"content-type", "application/json"},
    ]
    body = Jason.encode!(%{
      model: model,
      max_tokens: 4096,
      system: system_prompt,
      messages: [%{role: "user", content: user_prompt}]
    })

    case :httpc.request(:post, {String.to_charlist(url), Enum.map(headers, fn {k,v} -> {String.to_charlist(k), String.to_charlist(v)} end), ~c"application/json", body}, [{:timeout, 60_000}], []) do
      {:ok, {{_, 200, _}, _, resp_body}} ->
        case Jason.decode(to_string(resp_body)) do
          {:ok, %{"content" => [%{"text" => text} | _]}} -> {:ok, text}
          {:ok, other} -> {:error, "Unexpected response: #{inspect(other) |> String.slice(0, 200)}"}
          {:error, _} -> {:error, "Failed to parse AI response"}
        end
      {:ok, {{_, status, _}, _, resp_body}} ->
        {:error, "HTTP #{status}: #{to_string(resp_body) |> String.slice(0, 200)}"}
      {:error, reason} ->
        {:error, "Request failed: #{inspect(reason)}"}
    end
  end

  defp call_ai(provider, _key, _model, _sys, _user) do
    {:error, "Unsupported AI provider: #{provider}"}
  end

  def list_artifacts(conn, _params) do
    artifacts = query_rows("SELECT * FROM legendary_artifacts WHERE is_active=1 ORDER BY name")
    json(conn, %{success: true, artifacts: artifacts})
  end

  def get_artifact(conn, %{"id" => id}) do
    case Repo.query("SELECT * FROM legendary_artifacts WHERE id=?", [id]) do
      {:ok, %{rows: [row], columns: cols}} ->
        json(conn, %{success: true, artifact: Enum.zip(cols, row) |> Map.new()})
      _ -> json(conn, %{success: false})
    end
  end

  defp query_rows(sql, params \\ []) do
    case Repo.query(sql, params) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
  end

  defp parse_int(val) when is_integer(val), do: val
  defp parse_int(val) when is_binary(val) do
    case Integer.parse(val) do {n, _} -> n; :error -> 0 end
  end
  defp parse_int(_), do: 0
end
