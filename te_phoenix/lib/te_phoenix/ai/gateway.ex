defmodule TePhoenix.AI.Gateway do
  @moduledoc """
  Central routing layer for every AI call in the engine.

  ## Design goals

    * **Single entry point** — every AI call across the codebase goes through
      `Gateway.call/3`. No feature module ever imports Anthropic SDK directly.
    * **Opt-in by feature** — each call names a `feature_key`. The gateway
      checks the user's `ai_user_settings` + the global `ai_features.default_enabled`
      before proceeding. Denied calls short-circuit with `{:error, :disabled}`.
    * **Multi-provider** — adapter layer supports `:anthropic`, `:openai`,
      `:gemini`, `:local_ollama`, `:webnn_on_device`. Default is Claude.
    * **BYOK support** — if the user has configured their own key, route
      through it and skip margin billing.
    * **Budget enforcement** — per-user daily/monthly cents caps block calls
      that would exceed. Returns `{:error, :budget_exceeded}`.
    * **Audit log** — every call is written to `ai_usage_log` with token
      counts, cost, duration, success flag.
    * **Hot-swappable backends** — Layer 2 (fine-tuned open models) and
      Layer 3 (WebNN on-device) drop in as adapters without touching callers.

  ## Usage

      alias TePhoenix.AI.Gateway

      case Gateway.call(:npc_dialogue, prompt, user_id: user_id) do
        {:ok, %{text: text, cost_cents: cost}} ->
          # use the generated text

        {:error, :disabled} ->
          # user/feature toggle is off, fall back to manual flow

        {:error, :budget_exceeded} ->
          # hit their monthly cap, show upgrade prompt

        {:error, reason} ->
          # provider error, audit logged
      end

  See project_ai_architecture.md and project_ai_business_model.md for the
  full design context.
  """

  alias TePhoenix.Repo
  alias TePhoenix.AI.{Budget, FeatureRegistry}
  require Logger

  @type feature_key :: atom()
  @type call_opts :: [
          user_id: non_neg_integer() | nil,
          provider_override: atom() | nil,
          model_override: String.t() | nil,
          max_tokens: non_neg_integer() | nil,
          metadata: map()
        ]

  @type call_result :: %{
          text: String.t(),
          input_tokens: non_neg_integer(),
          output_tokens: non_neg_integer(),
          cost_cents: non_neg_integer(),
          provider: atom(),
          model: String.t(),
          duration_ms: non_neg_integer()
        }

  @doc """
  Dispatch an AI call through the gateway.

  Returns `{:ok, result}` on success, or `{:error, reason}` on failure
  (disabled, budget exceeded, provider error, etc). Every call is logged.
  """
  @spec call(feature_key(), String.t(), call_opts()) ::
          {:ok, call_result()} | {:error, atom() | String.t()}
  def call(feature_key, prompt, opts \\ []) when is_atom(feature_key) and is_binary(prompt) do
    user_id = Keyword.get(opts, :user_id)
    user = Keyword.get(opts, :user)
    est_tokens = Keyword.get(opts, :estimated_tokens, estimated_tokens(prompt, opts))
    started = System.monotonic_time(:millisecond)

    with :ok <- check_role_gate(feature_key, user, user_id),
         :ok <- check_feature_enabled(feature_key, user_id),
         :ok <- check_budget(user_id),
         :ok <- check_token_budget(user_id, feature_key, est_tokens),
         {:ok, provider, model} <- resolve_provider(user_id, opts),
         {:ok, result} <- dispatch(provider, model, prompt, opts) do
      duration = System.monotonic_time(:millisecond) - started
      log_usage(user_id, feature_key, provider, model, result, true, nil, duration)
      {:ok, Map.put(result, :duration_ms, duration)}
    else
      {:error, reason} = err ->
        duration = System.monotonic_time(:millisecond) - started
        log_usage(user_id, feature_key, :unknown, "unknown", %{input_tokens: 0, output_tokens: 0, cost_cents: 0}, false, inspect(reason), duration)
        err
    end
  end

  # ── Gates ──────────────────────────────────────────────────────

  # Tier α-AI: role-weight gate. If FeatureRegistry has a row for this
  # feature with a min_role_weight set, enforce it. Falls through to
  # `:ok` for legacy features that haven't been registered yet so the
  # existing :npc_dialogue path keeps working.
  defp check_role_gate(feature_key, user, user_id) do
    case FeatureRegistry.get(feature_key) do
      nil ->
        :ok

      feature ->
        case FeatureRegistry.available_for?(user || %{role_weight: lookup_role_weight(user_id)}, feature.feature_key) do
          :ok -> :ok
          {:error, _reason} = err -> err
        end
    end
  end

  defp lookup_role_weight(nil), do: 100  # backend-initiated calls bypass role gate
  defp lookup_role_weight(user_id) when is_integer(user_id) do
    case Repo.query("SELECT role FROM users WHERE id = ?", [user_id]) do
      {:ok, %{rows: [[role]]}} ->
        TePhoenixWeb.Components.PowerUserField.role_weight(role)

      _ ->
        0
    end
  end

  defp check_token_budget(user_id, feature_key, est_tokens) do
    case Budget.check_budget(user_id, feature_key, est_tokens) do
      :ok -> :ok
      {:error, :feature_not_found, _} -> :ok  # legacy / unregistered feature → skip
      {:error, :budget_exceeded, _meta} = err -> err
    end
  end

  # Cheap pre-flight estimate: ~4 chars/token in + max_tokens out.
  defp estimated_tokens(prompt, opts) do
    in_est = div(byte_size(prompt), 4)
    out_est = Keyword.get(opts, :max_tokens, 1024)
    in_est + out_est
  end

  defp check_feature_enabled(feature_key, user_id) do
    key_str = Atom.to_string(feature_key)

    feature_row =
      case Repo.query("SELECT default_enabled FROM ai_features WHERE feature_key = ?", [key_str]) do
        {:ok, %{rows: [[enabled]]}} -> enabled
        _ -> nil
      end

    user_row =
      if user_id do
        case Repo.query(
               "SELECT global_enabled, feature_overrides_json FROM ai_user_settings WHERE user_id = ?",
               [user_id]
             ) do
          {:ok, %{rows: [[global, overrides]]}} -> {global, overrides}
          _ -> {1, nil}
        end
      else
        {1, nil}
      end

    {user_global, user_overrides} = user_row
    override = user_override_for(user_overrides, key_str)

    cond do
      user_global in [0, false] -> {:error, :global_disabled}
      override == true -> :ok
      override == false -> {:error, :feature_disabled_by_user}
      feature_row in [1, true] -> :ok
      true -> {:error, :feature_default_disabled}
    end
  end

  defp user_override_for(nil, _), do: nil
  defp user_override_for("", _), do: nil

  defp user_override_for(json, key) when is_binary(json) do
    case Jason.decode(json) do
      {:ok, %{} = map} -> Map.get(map, key)
      _ -> nil
    end
  end

  defp check_budget(nil), do: :ok

  defp check_budget(user_id) do
    case Repo.query(
           "SELECT daily_budget_cents, monthly_budget_cents FROM ai_user_settings WHERE user_id = ?",
           [user_id]
         ) do
      {:ok, %{rows: [[daily_cap, monthly_cap]]}} ->
        spent_today = sum_cents(user_id, "DAY")
        spent_month = sum_cents(user_id, "MONTH")

        cond do
          daily_cap > 0 and spent_today >= daily_cap -> {:error, :daily_budget_exceeded}
          monthly_cap > 0 and spent_month >= monthly_cap -> {:error, :monthly_budget_exceeded}
          true -> :ok
        end

      _ ->
        :ok
    end
  end

  defp sum_cents(user_id, period) do
    unit = if period == "DAY", do: "DAY", else: "MONTH"

    case Repo.query(
           "SELECT COALESCE(SUM(cost_cents), 0) FROM ai_usage_log WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 #{unit})",
           [user_id]
         ) do
      {:ok, %{rows: [[n]]}} when is_integer(n) -> n
      _ -> 0
    end
  end

  # ── Provider resolution ────────────────────────────────────────

  defp resolve_provider(user_id, opts) do
    if provider = Keyword.get(opts, :provider_override) do
      {:ok, provider, Keyword.get(opts, :model_override, default_model_for(provider))}
    else
      case user_preferred_provider(user_id) do
        {provider, model} -> {:ok, provider, model}
        nil -> {:ok, :anthropic, "claude-sonnet-4-6"}
      end
    end
  end

  defp user_preferred_provider(nil), do: nil

  defp user_preferred_provider(user_id) do
    case Repo.query(
           "SELECT preferred_provider, preferred_model FROM ai_user_settings WHERE user_id = ?",
           [user_id]
         ) do
      {:ok, %{rows: [[provider, model]]}} -> {String.to_atom(provider), model}
      _ -> nil
    end
  end

  defp default_model_for(:anthropic), do: "claude-sonnet-4-6"
  defp default_model_for(:openai), do: "gpt-4o-mini"
  defp default_model_for(:gemini), do: "gemini-2.0-flash"
  defp default_model_for(:local_ollama), do: "llama3.1:8b"
  defp default_model_for(:webnn_on_device), do: "phi-3-mini"
  defp default_model_for(_), do: "claude-sonnet-4-6"

  # ── Dispatch ───────────────────────────────────────────────────

  defp dispatch(:anthropic, model, prompt, opts) do
    Logger.debug("[AI Gateway] anthropic call: model=#{model}, bytes=#{byte_size(prompt)}")

    anthro_opts = Keyword.take(opts, [:max_tokens, :system, :temperature])

    case TePhoenix.AI.Providers.Anthropic.call(model, prompt, anthro_opts) do
      {:ok, _result} = ok ->
        ok

      {:error, :no_api_key} ->
        # Fallback to stub when no key is configured, so dev environments
        # without ANTHROPIC_API_KEY still get a coherent plumbing response.
        Logger.info("[AI Gateway] anthropic no key — returning stub response")
        max = Keyword.get(opts, :max_tokens, 1024)

        {:ok,
         %{
           text:
             "[AI stub — no ANTHROPIC_API_KEY configured] prompt was " <>
               "#{byte_size(prompt)} bytes, model=#{model}",
           input_tokens: div(byte_size(prompt), 4),
           output_tokens: max,
           cost_cents: 0,
           provider: :anthropic,
           model: model
         }}

      {:error, reason} = err ->
        Logger.warning("[AI Gateway] anthropic error: #{inspect(reason)}")
        err
    end
  end

  defp dispatch(:gemini, model, prompt, opts) do
    Logger.debug("[AI Gateway] gemini call: model=#{model}, bytes=#{byte_size(prompt)}")
    gemini_opts = Keyword.take(opts, [:max_tokens, :system, :temperature])

    case TePhoenix.AI.Providers.Gemini.call(model, prompt, gemini_opts) do
      {:ok, _result} = ok ->
        ok

      {:error, :no_api_key} ->
        Logger.info("[AI Gateway] gemini no key — returning dev fallback response")
        max = Keyword.get(opts, :max_tokens, 1024)

        {:ok,
         %{
           text:
             "[AI stub — no GEMINI_API_KEY configured] prompt was " <>
               "#{byte_size(prompt)} bytes, model=#{model}",
           input_tokens: div(byte_size(prompt), 4),
           output_tokens: max,
           cost_cents: 0,
           provider: :gemini,
           model: model
         }}

      {:error, reason} = err ->
        Logger.warning("[AI Gateway] gemini error: #{inspect(reason)}")
        err
    end
  end

  defp dispatch(:openai, model, prompt, opts) do
    Logger.debug("[AI Gateway] openai call: model=#{model}, bytes=#{byte_size(prompt)}")
    openai_opts = Keyword.take(opts, [:max_tokens, :system, :temperature])

    case TePhoenix.AI.Providers.OpenAI.call(model, prompt, openai_opts) do
      {:ok, _result} = ok ->
        ok

      {:error, :no_api_key} ->
        Logger.info("[AI Gateway] openai no key — returning dev fallback response")
        max = Keyword.get(opts, :max_tokens, 1024)

        {:ok,
         %{
           text:
             "[AI stub — no OPENAI_API_KEY configured] prompt was " <>
               "#{byte_size(prompt)} bytes, model=#{model}",
           input_tokens: div(byte_size(prompt), 4),
           output_tokens: max,
           cost_cents: 0,
           provider: :openai,
           model: model
         }}

      {:error, reason} = err ->
        Logger.warning("[AI Gateway] openai error: #{inspect(reason)}")
        err
    end
  end

  defp dispatch(:local_ollama, model, prompt, opts) do
    Logger.debug("[AI Gateway] ollama local call: model=#{model}, bytes=#{byte_size(prompt)}")
    ollama_opts = Keyword.take(opts, [:system, :temperature, :timeout_ms])

    case TePhoenix.AI.Providers.Ollama.call(model, prompt, ollama_opts) do
      {:ok, _result} = ok ->
        ok

      {:error, :ollama_unavailable} ->
        Logger.info("[AI Gateway] ollama unavailable — returning local standby response")
        max = Keyword.get(opts, :max_tokens, 512)

        {:ok,
         %{
           text:
             "[AI local standby — Ollama server offline on localhost:11434] prompt was " <>
               "#{byte_size(prompt)} bytes, model=#{model}",
           input_tokens: div(byte_size(prompt), 4),
           output_tokens: max,
           cost_cents: 0,
           provider: :local_ollama,
           model: model
         }}

      {:error, reason} = err ->
        Logger.warning("[AI Gateway] ollama error: #{inspect(reason)}")
        err
    end
  end

  defp dispatch(provider, model, prompt, _opts) do
    Logger.info("[AI Gateway] #{provider} call (generic standby): model=#{model}")

    {:ok,
     %{
       text: "[AI standby — #{provider}/#{model}]",
       input_tokens: div(byte_size(prompt), 4),
       output_tokens: 512,
       cost_cents: 0,
       provider: provider,
       model: model
     }}
  end

  # Cost estimation now lives per-provider (e.g. TePhoenix.AI.Providers.Anthropic).
  # Gateway just forwards whatever `cost_cents` the provider returns to the audit log.

  # ── Usage log ──────────────────────────────────────────────────

  defp log_usage(user_id, feature_key, provider, model, result, success, error, duration) do
    Repo.query(
      """
      INSERT INTO ai_usage_log
        (user_id, feature_key, provider, model, input_tokens, output_tokens, cost_cents, success, error_message, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      """,
      [
        user_id,
        Atom.to_string(feature_key),
        Atom.to_string(provider),
        model,
        Map.get(result, :input_tokens, 0),
        Map.get(result, :output_tokens, 0),
        Map.get(result, :cost_cents, 0),
        if(success, do: 1, else: 0),
        error,
        duration
      ]
    )
  end
end
