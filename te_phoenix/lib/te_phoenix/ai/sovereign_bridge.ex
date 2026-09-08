defmodule TePhoenix.AI.SovereignBridge do
  @moduledoc """
  HTTP & PubSub bridge between Twisted RPG and Sovereign Soul Engine.

  Allows Twisted in-game characters and companions to communicate directly
  with stateful, conscious Sovereign Soul Engine actors (running on port 4002).

  Features:
    * Stateful 1:1 NPC dialogue with true psychological consequence
    * Involuntary physical tells (narrator beats)
    * Real-time companion recruitment/dismissal based on earned trust
    * Seamless fallback to local procedural dialogue when SSE is offline
  """

  require Logger

  @default_endpoint "http://localhost:4002"
  @default_timeout_ms 5000

  @doc """
  Talks to a Sovereign Soul Engine NPC.
  Returns `{:ok, response_map}` on success, or `{:fallback, reason}` when SSE is offline.
  """
  def talk(npc_name_or_id, char_id, player_name, message, opts \\ []) do
    url = "#{endpoint_url()}/sse/api/npc_chat"
    timeout = Keyword.get(opts, :timeout, @default_timeout_ms)

    npc_ref = to_string(npc_name_or_id) |> String.downcase() |> String.trim()

    payload = %{
      "external_source" => "twisted",
      "external_player_id" => to_string(char_id),
      "external_player_name" => to_string(player_name),
      "npc_id" => npc_ref,
      "message" => message
    }

    headers = [
      {"authorization", "Bearer #{api_key()}"},
      {"content-type", "application/json"}
    ]

    try do
      case Req.post(url, json: payload, headers: headers, receive_timeout: timeout) do
        {:ok, %{status: 200, body: %{} = body}} ->
          {:ok,
           %{
             npc_name: body["npc_name"],
             reply: body["reply"],
             tell: body["tell"],
             audio_url: body["audio_url"],
             joined_player: body["joined_player"] == true,
             left_player: body["left_player"] == true
           }}

        {:ok, %{status: status, body: body}} ->
          Logger.debug("[SovereignBridge] SSE returned HTTP #{status}: #{inspect(body)}")
          {:fallback, {:http_error, status}}

        {:error, reason} ->
          Logger.debug("[SovereignBridge] SSE unavailable (#{inspect(reason)}), falling back to local")
          {:fallback, :unreachable}
      end
    rescue
      e ->
        Logger.debug("[SovereignBridge] Exception calling SSE: #{inspect(e)}")
        {:fallback, :exception}
    end
  end

  @doc """
  Checks if Sovereign Soul Engine is online and responding.
  """
  def online? do
    url = "#{endpoint_url()}/sse/api/characters"
    headers = [{"authorization", "Bearer #{api_key()}"}]

    try do
      case Req.get(url, headers: headers, receive_timeout: 1500) do
        {:ok, %{status: 200}} -> true
        _ -> false
      end
    rescue
      _ -> false
    end
  end

  @doc """
  Lists all conscious NPC souls registered in Sovereign Soul Engine.
  """
  def list_souls do
    url = "#{endpoint_url()}/sse/api/characters"
    headers = [{"authorization", "Bearer #{api_key()}"}]

    try do
      case Req.get(url, headers: headers, receive_timeout: 3000) do
        {:ok, %{status: 200, body: %{"characters" => chars}}} when is_list(chars) ->
          {:ok, chars}

        {:ok, %{status: 200, body: chars}} when is_list(chars) ->
          {:ok, chars}

        other ->
          {:error, other}
      end
    rescue
      e -> {:error, e}
    end
  end

  @doc """
  Seeds a complete, conscious psychological soul into Sovereign Soul Engine.
  Returns `{:ok, soul_receipt}` or `{:error, reason}`.
  """
  def seed_soul(attrs) when is_map(attrs) do
    url = "#{endpoint_url()}/sse/api/characters"
    headers = [
      {"authorization", "Bearer #{api_key()}"},
      {"content-type", "application/json"}
    ]

    try do
      case Req.post(url, json: attrs, headers: headers, receive_timeout: 6000) do
        {:ok, %{status: status, body: %{"status" => "ok"} = body}} when status in [200, 201] ->
          {:ok, body}

        {:ok, %{status: status, body: body}} ->
          {:error, "SSE returned HTTP #{status}: #{inspect(body)}"}

        {:error, reason} ->
          {:error, reason}
      end
    rescue
      e -> {:error, e}
    end
  end

  @doc """
  Inspects a character's complete soul, emotional, and somatic state from Sovereign Soul Engine.
  """
  def inspect_soul(id_or_slug) do
    url = "#{endpoint_url()}/sse/api/characters/#{id_or_slug}"
    headers = [{"authorization", "Bearer #{api_key()}"}]

    try do
      case Req.get(url, headers: headers, receive_timeout: 4000) do
        {:ok, %{status: 200, body: %{} = body}} ->
          {:ok, body}

        {:ok, %{status: status, body: body}} ->
          {:error, "SSE returned HTTP #{status}: #{inspect(body)}"}

        {:error, reason} ->
          {:error, reason}
      end
    rescue
      e -> {:error, e}
    end
  end

  def endpoint_url do
    System.get_env("SOVEREIGN_SOUL_URL") || @default_endpoint
  end

  def api_key do
    System.get_env("SOVEREIGN_SOUL_API_KEY") || "twisted_dev_key"
  end
end
