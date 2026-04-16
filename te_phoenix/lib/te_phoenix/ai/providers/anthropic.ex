defmodule TePhoenix.AI.Providers.Anthropic do
  @moduledoc """
  HTTP provider for Anthropic's Messages API with production hardening:

    * Retry with exponential backoff on transient failures (429, 5xx, network)
    * Per-BEAM-node rate limiting via an ETS sliding window
    * Server-sent event streaming with a per-delta callback
    * Tool use — pass `:tools` and receive `tool_use` blocks in the response
    * Vision — pass `:images` (data URL or https URL) as image content blocks
    * Prompt caching headers (cache_control = ephemeral on the system prompt)

  ## Configuration

  API key is read in this order:
    1. `Application.get_env(:te_phoenix, :anthropic_api_key)`
    2. `System.get_env("ANTHROPIC_API_KEY")`

  ## Usage

      {:ok, result} = Anthropic.call(
        "claude-sonnet-4-6",
        "Write an NPC line for a grizzled druid.",
        max_tokens: 200,
        temperature: 0.7
      )

      # Streaming — call `on_delta` with each text chunk as it arrives.
      Anthropic.call("claude-sonnet-4-6", prompt,
        on_delta: fn text -> IO.write(text) end
      )

      # Tool use — model chooses a tool, returned as a tool_use block.
      {:ok, %{tool_calls: [_ | _]}} =
        Anthropic.call(model, "What's the weather in Dublin?",
          tools: [
            %{
              "name" => "get_weather",
              "description" => "Get current weather",
              "input_schema" => %{
                "type" => "object",
                "properties" => %{"location" => %{"type" => "string"}},
                "required" => ["location"]
              }
            }
          ])

      # Vision
      Anthropic.call(model, "Describe this concept art",
        images: ["https://example.com/art.png"]
      )
  """

  require Logger

  @endpoint "https://api.anthropic.com/v1/messages"
  @api_version "2023-06-01"
  @default_timeout_ms 60_000
  @max_retries 3
  @base_backoff_ms 500
  @rate_limit_table :anthropic_rl_window
  @rate_limit_max_per_minute 50

  # Cents per million tokens. Keep in sync with Anthropic's pricing page.
  @price_table %{
    "claude-sonnet-4-6" => %{input: 300, output: 1500},
    "claude-haiku-4-5-20251001" => %{input: 100, output: 500},
    "claude-opus-4-6" => %{input: 1500, output: 7500}
  }

  @type call_opts :: keyword()

  @type call_result :: %{
          text: String.t(),
          tool_calls: [map()],
          stop_reason: String.t() | nil,
          input_tokens: non_neg_integer(),
          output_tokens: non_neg_integer(),
          cost_cents: non_neg_integer(),
          provider: :anthropic,
          model: String.t()
        }

  @spec call(String.t(), String.t(), call_opts()) ::
          {:ok, call_result()} | {:error, atom() | String.t()}
  def call(model, prompt, opts \\ []) when is_binary(model) and is_binary(prompt) do
    with :ok <- rate_limit_acquire(),
         {:ok, api_key} <- resolve_api_key(),
         body <- build_body(model, prompt, opts) do
      if Keyword.has_key?(opts, :on_delta) do
        stream_request(api_key, body, model, opts)
      else
        retrying_request(api_key, body, model, opts, @max_retries)
      end
    end
  end

  # ── Non-streaming with retry ───────────────────────────────

  defp retrying_request(api_key, body, model, opts, attempts_left) do
    case http_post(api_key, body, opts) do
      {:ok, response} ->
        parse_response(response, model)

      {:error, reason} when attempts_left > 0 ->
        if retryable?(reason) do
          sleep_ms = backoff_ms(@max_retries - attempts_left + 1)
          Logger.info("[Anthropic] retry in #{sleep_ms}ms (reason=#{inspect(reason)})")
          Process.sleep(sleep_ms)
          retrying_request(api_key, body, model, opts, attempts_left - 1)
        else
          {:error, reason}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp retryable?(:transport), do: true
  defp retryable?("anthropic_http_429"), do: true
  defp retryable?("anthropic_http_" <> code), do: String.starts_with?(code, "5")
  defp retryable?(_), do: false

  defp backoff_ms(attempt) do
    jitter = :rand.uniform(250)
    trunc(@base_backoff_ms * :math.pow(2, attempt - 1)) + jitter
  end

  defp http_post(api_key, body, opts) do
    timeout = Keyword.get(opts, :timeout_ms, @default_timeout_ms)

    case Req.post(@endpoint,
           json: body,
           headers: request_headers(api_key),
           receive_timeout: timeout
         ) do
      {:ok, %Req.Response{status: 200, body: body}} ->
        {:ok, body}

      {:ok, %Req.Response{status: status, body: body}} ->
        Logger.warning("[Anthropic] non-200 response: #{status} #{inspect(body)}")
        {:error, "anthropic_http_#{status}"}

      {:error, err} ->
        Logger.error("[Anthropic] transport error: #{inspect(err)}")
        {:error, :transport}
    end
  end

  # ── Streaming (SSE) ────────────────────────────────────────
  #
  # Anthropic streams server-sent events with content_block_delta events
  # carrying incremental text. We parse the SSE stream, invoke the caller's
  # `:on_delta` callback with each text fragment, and return the assembled
  # full result at the end — same shape as the non-streaming call.

  defp stream_request(api_key, body, model, opts) do
    on_delta = Keyword.fetch!(opts, :on_delta)
    body = Map.put(body, "stream", true)
    timeout = Keyword.get(opts, :timeout_ms, @default_timeout_ms)

    state = %{
      buffer: "",
      text: "",
      tool_calls: [],
      current_tool: nil,
      current_tool_input: "",
      stop_reason: nil,
      input_tokens: 0,
      output_tokens: 0,
      on_delta: on_delta
    }

    acc_ref = :erlang.make_ref()
    Process.put({:anthropic_stream_state, acc_ref}, state)

    result =
      Req.post(@endpoint,
        json: body,
        headers: request_headers(api_key),
        receive_timeout: timeout,
        into: fn {:data, chunk}, {req, resp} ->
          current = Process.get({:anthropic_stream_state, acc_ref})
          updated = handle_sse_chunk(current, chunk)
          Process.put({:anthropic_stream_state, acc_ref}, updated)
          {:cont, {req, resp}}
        end
      )

    final = Process.delete({:anthropic_stream_state, acc_ref})

    case result do
      {:ok, %Req.Response{status: 200}} ->
        {:ok,
         %{
           text: final.text,
           tool_calls: Enum.reverse(final.tool_calls),
           stop_reason: final.stop_reason,
           input_tokens: final.input_tokens,
           output_tokens: final.output_tokens,
           cost_cents: estimate_cost_cents(model, final.input_tokens, final.output_tokens),
           provider: :anthropic,
           model: model
         }}

      {:ok, %Req.Response{status: status, body: body}} ->
        Logger.warning("[Anthropic] stream non-200: #{status} #{inspect(body)}")
        {:error, "anthropic_http_#{status}"}

      {:error, err} ->
        Logger.error("[Anthropic] stream transport error: #{inspect(err)}")
        {:error, :transport}
    end
  end

  # SSE framing: lines prefixed with `event:` / `data:`, separated by \n\n.
  defp handle_sse_chunk(state, chunk) do
    combined = state.buffer <> chunk
    {events, rest} = split_sse_events(combined)
    state = %{state | buffer: rest}
    Enum.reduce(events, state, &handle_sse_event/2)
  end

  defp split_sse_events(buffer) do
    parts = String.split(buffer, "\n\n")
    {Enum.drop(parts, -1), List.last(parts) || ""}
  end

  defp handle_sse_event(frame, state) do
    data_line =
      frame
      |> String.split("\n")
      |> Enum.find(&String.starts_with?(&1, "data:"))

    case data_line do
      nil ->
        state

      "data: " <> payload ->
        case Jason.decode(payload) do
          {:ok, event} -> apply_event(event, state)
          _ -> state
        end

      _ ->
        state
    end
  end

  defp apply_event(%{"type" => "content_block_start", "content_block" => %{"type" => "tool_use"} = tu}, state) do
    %{state | current_tool: %{id: tu["id"], name: tu["name"], input: %{}}, current_tool_input: ""}
  end

  defp apply_event(%{"type" => "content_block_delta", "delta" => %{"type" => "text_delta", "text" => text}}, state) do
    state.on_delta.(text)
    %{state | text: state.text <> text}
  end

  defp apply_event(%{"type" => "content_block_delta", "delta" => %{"type" => "input_json_delta", "partial_json" => frag}}, state) do
    %{state | current_tool_input: state.current_tool_input <> frag}
  end

  defp apply_event(%{"type" => "content_block_stop"}, state) do
    case state.current_tool do
      nil ->
        state

      tool ->
        input =
          case Jason.decode(state.current_tool_input) do
            {:ok, v} -> v
            _ -> %{}
          end

        tool = Map.put(tool, :input, input)
        %{state | tool_calls: [tool | state.tool_calls], current_tool: nil, current_tool_input: ""}
    end
  end

  defp apply_event(%{"type" => "message_delta", "delta" => %{"stop_reason" => stop}, "usage" => usage}, state) do
    %{
      state
      | stop_reason: stop,
        output_tokens: state.output_tokens + Map.get(usage, "output_tokens", 0)
    }
  end

  defp apply_event(%{"type" => "message_start", "message" => %{"usage" => usage}}, state) do
    %{state | input_tokens: Map.get(usage, "input_tokens", 0)}
  end

  defp apply_event(_, state), do: state

  # ── Request body ────────────────────────────────────────────

  defp build_body(model, prompt, opts) do
    content_blocks = message_content(prompt, Keyword.get(opts, :images, []))

    base = %{
      "model" => model,
      "max_tokens" => Keyword.get(opts, :max_tokens, 1024),
      "messages" => [%{"role" => "user", "content" => content_blocks}]
    }

    base
    |> put_system(Keyword.get(opts, :system))
    |> maybe_put("temperature", Keyword.get(opts, :temperature))
    |> maybe_put("tools", normalize_tools(Keyword.get(opts, :tools)))
    |> maybe_put("tool_choice", Keyword.get(opts, :tool_choice))
  end

  defp message_content(prompt, []), do: [%{"type" => "text", "text" => prompt}]

  defp message_content(prompt, images) when is_list(images) do
    image_blocks = Enum.map(images, &image_block/1)
    image_blocks ++ [%{"type" => "text", "text" => prompt}]
  end

  defp image_block(%{source: source}), do: %{"type" => "image", "source" => source}

  defp image_block("data:" <> _ = data_url) do
    [header, b64] = String.split(data_url, ",", parts: 2)
    mime = header |> String.replace_prefix("data:", "") |> String.split(";") |> List.first()

    %{
      "type" => "image",
      "source" => %{"type" => "base64", "media_type" => mime, "data" => b64}
    }
  end

  defp image_block(url) when is_binary(url) do
    %{"type" => "image", "source" => %{"type" => "url", "url" => url}}
  end

  defp put_system(body, nil), do: body

  defp put_system(body, system) when is_binary(system) do
    # Attach cache_control so repeated calls benefit from Anthropic's
    # prompt-cache. System prompts are the natural cache boundary.
    Map.put(body, "system", [
      %{"type" => "text", "text" => system, "cache_control" => %{"type" => "ephemeral"}}
    ])
  end

  defp normalize_tools(nil), do: nil
  defp normalize_tools([]), do: nil
  defp normalize_tools(tools) when is_list(tools), do: tools

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)

  defp request_headers(api_key) do
    [
      {"x-api-key", api_key},
      {"anthropic-version", @api_version},
      {"content-type", "application/json"}
    ]
  end

  # ── Response parsing (non-streaming) ───────────────────────

  defp parse_response(body, model) do
    with %{"content" => content, "usage" => usage} when is_list(content) <- body do
      text = extract_text(content)
      tool_calls = extract_tool_calls(content)
      input_tokens = Map.get(usage, "input_tokens", 0)
      output_tokens = Map.get(usage, "output_tokens", 0)

      {:ok,
       %{
         text: text,
         tool_calls: tool_calls,
         stop_reason: Map.get(body, "stop_reason"),
         input_tokens: input_tokens,
         output_tokens: output_tokens,
         cost_cents: estimate_cost_cents(model, input_tokens, output_tokens),
         provider: :anthropic,
         model: model
       }}
    else
      _ -> {:error, :malformed_response}
    end
  end

  defp extract_text(content) do
    content
    |> Enum.filter(fn b -> Map.get(b, "type") == "text" end)
    |> Enum.map(fn b -> Map.get(b, "text", "") end)
    |> Enum.join("\n")
  end

  defp extract_tool_calls(content) do
    content
    |> Enum.filter(fn b -> Map.get(b, "type") == "tool_use" end)
    |> Enum.map(fn b ->
      %{id: b["id"], name: b["name"], input: b["input"] || %{}}
    end)
  end

  # ── Cost estimation ────────────────────────────────────────

  defp estimate_cost_cents(model, input_tokens, output_tokens) do
    case Map.get(@price_table, model) do
      %{input: ic, output: oc} ->
        div(input_tokens * ic, 1_000_000) + div(output_tokens * oc, 1_000_000)

      _ ->
        0
    end
  end

  # ── API key resolution ────────────────────────────────────

  defp resolve_api_key do
    key =
      Application.get_env(:te_phoenix, :anthropic_api_key) ||
        System.get_env("ANTHROPIC_API_KEY")

    if is_binary(key) and String.length(key) > 0 do
      {:ok, key}
    else
      {:error, :no_api_key}
    end
  end

  # ── Rate limiting (sliding window, ETS) ───────────────────
  #
  # Lazy-init an ETS table the first time it's used. Records the timestamp
  # of each call; prunes records older than 60s; blocks if the window is
  # full. Per-BEAM-node, not distributed — good enough for a single box.

  defp rate_limit_acquire do
    ensure_rl_table()
    now = System.monotonic_time(:millisecond)
    cutoff = now - 60_000

    :ets.select_delete(@rate_limit_table, [{{:"$1"}, [{:<, :"$1", cutoff}], [true]}])
    count = :ets.info(@rate_limit_table, :size) || 0

    if count >= @rate_limit_max_per_minute do
      oldest = :ets.first(@rate_limit_table)
      wait_ms = max(60_000 - (now - oldest), 50)
      Logger.warning("[Anthropic] rate limit reached; waiting #{wait_ms}ms")
      Process.sleep(wait_ms)
      rate_limit_acquire()
    else
      :ets.insert(@rate_limit_table, {now})
      :ok
    end
  end

  defp ensure_rl_table do
    case :ets.whereis(@rate_limit_table) do
      :undefined ->
        :ets.new(@rate_limit_table, [:named_table, :public, :ordered_set])

      _ ->
        :ok
    end
  rescue
    # Race: another process created it between whereis and new
    _ -> :ok
  end
end
