defmodule TePhoenix.AI.Providers.Gemini do
  @moduledoc """
  HTTP provider for Google's Gemini API (Gemini 2.5 Flash, 2.0 Flash, 1.5 Pro).

  Features:
    * Supports Gemini 2.0 Flash (ultra-fast, low-latency) and Gemini 1.5 Pro
    * Configurable via `Application.get_env(:te_phoenix, :gemini_api_key)` or `GEMINI_API_KEY`
    * Robust retry with exponential backoff on transient errors
    * Graceful dev fallback if no API key is provided
  """

  require Logger

  @default_model "gemini-2.0-flash"
  @base_url "https://generativelanguage.googleapis.com/v1beta/models"
  @default_timeout_ms 60_000
  @max_retries 3
  @base_backoff_ms 500

  # Cents per million tokens
  @price_table %{
    "gemini-2.0-flash" => %{input: 10, output: 40},
    "gemini-2.5-flash" => %{input: 10, output: 40},
    "gemini-1.5-flash" => %{input: 15, output: 60},
    "gemini-1.5-pro" => %{input: 350, output: 1050}
  }

  @type call_opts :: keyword()

  @type call_result :: %{
          text: String.t(),
          input_tokens: non_neg_integer(),
          output_tokens: non_neg_integer(),
          cost_cents: non_neg_integer(),
          provider: :gemini,
          model: String.t()
        }

  @spec call(String.t(), String.t(), call_opts()) ::
          {:ok, call_result()} | {:error, atom() | String.t()}
  def call(model \\ @default_model, prompt, opts \\ [])
      when is_binary(model) and is_binary(prompt) do
    case resolve_api_key() do
      {:ok, api_key} ->
        body = build_body(prompt, opts)
        url = "#{@base_url}/#{model}:generateContent?key=#{api_key}"
        retrying_request(url, body, model, opts, @max_retries)

      {:error, :no_api_key} = err ->
        err
    end
  end

  defp retrying_request(url, body, model, opts, attempts_left) do
    timeout = Keyword.get(opts, :timeout_ms, @default_timeout_ms)

    case Req.post(url, json: body, receive_timeout: timeout) do
      {:ok, %Req.Response{status: 200, body: resp_body}} ->
        parse_response(resp_body, model)

      {:ok, %Req.Response{status: status, body: resp_body}} ->
        Logger.warning("[Gemini] HTTP #{status}: #{inspect(resp_body)}")

        if status in [429, 500, 503] and attempts_left > 0 do
          sleep_ms = backoff_ms(@max_retries - attempts_left + 1)
          Logger.info("[Gemini] Retrying in #{sleep_ms}ms...")
          Process.sleep(sleep_ms)
          retrying_request(url, body, model, opts, attempts_left - 1)
        else
          {:error, "gemini_http_#{status}"}
        end

      {:error, err} when attempts_left > 0 ->
        sleep_ms = backoff_ms(@max_retries - attempts_left + 1)
        Logger.warning("[Gemini] Transport error #{inspect(err)}, retrying in #{sleep_ms}ms...")
        Process.sleep(sleep_ms)
        retrying_request(url, body, model, opts, attempts_left - 1)

      {:error, err} ->
        Logger.error("[Gemini] Transport error failed: #{inspect(err)}")
        {:error, :transport}
    end
  end

  defp backoff_ms(attempt) do
    jitter = :rand.uniform(200)
    trunc(@base_backoff_ms * :math.pow(2, attempt - 1)) + jitter
  end

  defp build_body(prompt, opts) do
    temperature = Keyword.get(opts, :temperature, 0.7)
    max_tokens = Keyword.get(opts, :max_tokens, 2048)
    system_instruction = Keyword.get(opts, :system)

    base = %{
      "contents" => [
        %{
          "role" => "user",
          "parts" => [%{"text" => prompt}]
        }
      ],
      "generationConfig" => %{
        "temperature" => temperature,
        "maxOutputTokens" => max_tokens
      }
    }

    if system_instruction do
      Map.put(base, "systemInstruction", %{
        "parts" => [%{"text" => system_instruction}]
      })
    else
      base
    end
  end

  defp parse_response(body, model) do
    text =
      case get_in(body, ["candidates", Access.at(0), "content", "parts", Access.at(0), "text"]) do
        t when is_binary(t) -> t
        _ -> ""
      end

    usage = Map.get(body, "usageMetadata", %{})
    in_tokens = Map.get(usage, "promptTokenCount", 0)
    out_tokens = Map.get(usage, "candidatesTokenCount", 0)
    cost = calculate_cost_cents(model, in_tokens, out_tokens)

    {:ok,
     %{
       text: text,
       input_tokens: in_tokens,
       output_tokens: out_tokens,
       cost_cents: cost,
       provider: :gemini,
       model: model
     }}
  end

  defp calculate_cost_cents(model, in_tokens, out_tokens) do
    prices = Map.get(@price_table, model, %{input: 10, output: 40})
    in_cost = (in_tokens / 1_000_000) * prices.input
    out_cost = (out_tokens / 1_000_000) * prices.output
    trunc(Float.ceil(in_cost + out_cost))
  end

  defp resolve_api_key do
    key =
      Application.get_env(:te_phoenix, :gemini_api_key) ||
        System.get_env("GEMINI_API_KEY") ||
        System.get_env("GOOGLE_API_KEY")

    case key do
      k when is_binary(k) and byte_size(k) > 0 -> {:ok, k}
      _ -> {:error, :no_api_key}
    end
  end
end
