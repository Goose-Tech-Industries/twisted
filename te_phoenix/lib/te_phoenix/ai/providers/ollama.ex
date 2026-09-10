defmodule TePhoenix.AI.Providers.Ollama do
  @moduledoc """
  HTTP provider for locally-hosted Ollama / vLLM open-weights models.

  Features:
    * Zero external network dependencies or API keys
    * Zero cost per token
    * Defaults to `llama3.1:8b` on `http://127.0.0.1:11434`
    * Configurable host via `OLLAMA_HOST`
  """

  require Logger

  @default_model "llama3.1:8b"
  @default_host "http://127.0.0.1:11434"
  @default_timeout_ms 120_000

  @type call_opts :: keyword()

  @type call_result :: %{
          text: String.t(),
          input_tokens: non_neg_integer(),
          output_tokens: non_neg_integer(),
          cost_cents: 0,
          provider: :local_ollama,
          model: String.t()
        }

  @spec call(String.t(), String.t(), call_opts()) ::
          {:ok, call_result()} | {:error, atom() | String.t()}
  def call(model \\ @default_model, prompt, opts \\ [])
      when is_binary(model) and is_binary(prompt) do
    host = resolve_host()
    endpoint = "#{host}/api/generate"
    timeout = Keyword.get(opts, :timeout_ms, @default_timeout_ms)
    temperature = Keyword.get(opts, :temperature, 0.7)
    system = Keyword.get(opts, :system)

    body = %{
      "model" => model,
      "prompt" => prompt,
      "stream" => false,
      "options" => %{
        "temperature" => temperature
      }
    }

    body =
      if system do
        Map.put(body, "system", system)
      else
        body
      end

    case Req.post(endpoint, json: body, receive_timeout: timeout) do
      {:ok, %Req.Response{status: 200, body: resp_body}} ->
        text = Map.get(resp_body, "response", "")
        in_tokens = Map.get(resp_body, "prompt_eval_count", div(byte_size(prompt), 4))
        out_tokens = Map.get(resp_body, "eval_count", div(byte_size(text), 4))

        {:ok,
         %{
           text: text,
           input_tokens: in_tokens,
           output_tokens: out_tokens,
           cost_cents: 0,
           provider: :local_ollama,
           model: model
         }}

      {:ok, %Req.Response{status: status, body: resp_body}} ->
        Logger.warning("[Ollama] HTTP #{status}: #{inspect(resp_body)}")
        {:error, "ollama_http_#{status}"}

      {:error, err} ->
        Logger.info("[Ollama] Local instance unavailable (#{inspect(err)})")
        {:error, :ollama_unavailable}
    end
  end

  defp resolve_host do
    Application.get_env(:te_phoenix, :ollama_host) ||
      System.get_env("OLLAMA_HOST") ||
      @default_host
  end
end
