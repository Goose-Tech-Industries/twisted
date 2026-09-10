defmodule TePhoenix.AI.Providers.OpenAI do
  @moduledoc """
  HTTP provider for OpenAI and OpenAI-compatible API endpoints (vLLM, Groq, Together, DeepSeek).

  Features:
    * Supports `gpt-4o-mini`, `gpt-4o`, `o3-mini`, and compatible models
    * Base URL override via `OPENAI_BASE_URL` (defaults to `https://api.openai.com/v1`)
    * Configurable via `Application.get_env(:te_phoenix, :openai_api_key)` or `OPENAI_API_KEY`
    * Exponential backoff and retry handling
    * Cost estimation per token tier
  """

  require Logger

  @default_model "gpt-4o-mini"
  @default_base_url "https://api.openai.com/v1"
  @default_timeout_ms 60_000
  @max_retries 3
  @base_backoff_ms 500

  # Cents per million tokens
  @price_table %{
    "gpt-4o-mini" => %{input: 15, output: 60},
    "gpt-4o" => %{input: 250, output: 1000},
    "o3-mini" => %{input: 110, output: 440},
    "gpt-4-turbo" => %{input: 1000, output: 3000}
  }

  @type call_opts :: keyword()

  @type call_result :: %{
          text: String.t(),
          input_tokens: non_neg_integer(),
          output_tokens: non_neg_integer(),
          cost_cents: non_neg_integer(),
          provider: :openai,
          model: String.t()
        }

  @spec call(String.t(), String.t(), call_opts()) ::
          {:ok, call_result()} | {:error, atom() | String.t()}
  def call(model \\ @default_model, prompt, opts \\ [])
      when is_binary(model) and is_binary(prompt) do
    case resolve_api_key() do
      {:ok, api_key} ->
        body = build_body(model, prompt, opts)
        base_url = resolve_base_url()
        endpoint = "#{base_url}/chat/completions"
        retrying_request(endpoint, api_key, body, model, opts, @max_retries)

      {:error, :no_api_key} = err ->
        err
    end
  end

  defp retrying_request(endpoint, api_key, body, model, opts, attempts_left) do
    timeout = Keyword.get(opts, :timeout_ms, @default_timeout_ms)
    headers = [
      {"authorization", "Bearer #{api_key}"},
      {"content-type", "application/json"}
    ]

    case Req.post(endpoint, json: body, headers: headers, receive_timeout: timeout) do
      {:ok, %Req.Response{status: 200, body: resp_body}} ->
        parse_response(resp_body, model)

      {:ok, %Req.Response{status: status, body: resp_body}} ->
        Logger.warning("[OpenAI] HTTP #{status}: #{inspect(resp_body)}")

        if status in [429, 500, 502, 503] and attempts_left > 0 do
          sleep_ms = backoff_ms(@max_retries - attempts_left + 1)
          Logger.info("[OpenAI] Retrying in #{sleep_ms}ms...")
          Process.sleep(sleep_ms)
          retrying_request(endpoint, api_key, body, model, opts, attempts_left - 1)
        else
          {:error, "openai_http_#{status}"}
        end

      {:error, err} when attempts_left > 0 ->
        sleep_ms = backoff_ms(@max_retries - attempts_left + 1)
        Logger.warning("[OpenAI] Transport error #{inspect(err)}, retrying in #{sleep_ms}ms...")
        Process.sleep(sleep_ms)
        retrying_request(endpoint, api_key, body, model, opts, attempts_left - 1)

      {:error, err} ->
        Logger.error("[OpenAI] Transport error failed: #{inspect(err)}")
        {:error, :transport}
    end
  end

  defp backoff_ms(attempt) do
    jitter = :rand.uniform(200)
    trunc(@base_backoff_ms * :math.pow(2, attempt - 1)) + jitter
  end

  defp build_body(model, prompt, opts) do
    temperature = Keyword.get(opts, :temperature, 0.7)
    max_tokens = Keyword.get(opts, :max_tokens, 1024)
    system_prompt = Keyword.get(opts, :system)

    messages =
      if system_prompt do
        [%{"role" => "system", "content" => system_prompt}, %{"role" => "user", "content" => prompt}]
      else
        [%{"role" => "user", "content" => prompt}]
      end

    %{
      "model" => model,
      "messages" => messages,
      "temperature" => temperature,
      "max_tokens" => max_tokens
    }
  end

  defp parse_response(body, model) do
    text =
      case get_in(body, ["choices", Access.at(0), "message", "content"]) do
        t when is_binary(t) -> t
        _ -> ""
      end

    usage = Map.get(body, "usage", %{})
    in_tokens = Map.get(usage, "prompt_tokens", 0)
    out_tokens = Map.get(usage, "completion_tokens", 0)
    cost = calculate_cost_cents(model, in_tokens, out_tokens)

    {:ok,
     %{
       text: text,
       input_tokens: in_tokens,
       output_tokens: out_tokens,
       cost_cents: cost,
       provider: :openai,
       model: model
     }}
  end

  defp calculate_cost_cents(model, in_tokens, out_tokens) do
    prices = Map.get(@price_table, model, %{input: 15, output: 60})
    in_cost = (in_tokens / 1_000_000) * prices.input
    out_cost = (out_tokens / 1_000_000) * prices.output
    trunc(Float.ceil(in_cost + out_cost))
  end

  defp resolve_base_url do
    Application.get_env(:te_phoenix, :openai_base_url) ||
      System.get_env("OPENAI_BASE_URL") ||
      @default_base_url
  end

  defp resolve_api_key do
    key =
      Application.get_env(:te_phoenix, :openai_api_key) ||
        System.get_env("OPENAI_API_KEY")

    case key do
      k when is_binary(k) and byte_size(k) > 0 -> {:ok, k}
      _ -> {:error, :no_api_key}
    end
  end
end
