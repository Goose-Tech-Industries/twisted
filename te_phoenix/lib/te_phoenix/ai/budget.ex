defmodule TePhoenix.AI.Budget do
  @moduledoc """
  Token-based budget enforcement for AI features. Complements the
  cents-based per-user budget already in `TePhoenix.AI.Gateway`.

  Token caps are PER-FEATURE (defined in `ai_features.daily_token_cap`
  + `weekly_token_cap`) and PER-USER (summed from `ai_usage_log`).
  Hitting either cap returns `{:error, :budget_exceeded, %{...}}` with
  remaining headroom for the UI to surface.

  ## Why two budgets

  The cents budget covers global cost-of-AI-as-a-business — the per-user
  monthly cap stops a single account from melting the company card.
  The token budget covers per-feature noisy-neighbor protection — even
  if a user has plenty of cents, we don't want one feature dominating
  their budget if the admin set a tighter cap on it.

  Both budgets must clear before a generation runs.
  """

  alias TePhoenix.Repo
  alias TePhoenix.AI.FeatureRegistry

  @doc "Total tokens (input + output) consumed by this user TODAY."
  def daily_usage(nil), do: 0

  def daily_usage(user_id) when is_integer(user_id) do
    sum_tokens(user_id, nil, "DAY")
  end

  @doc "Total tokens consumed by this user in the last 7 days."
  def weekly_usage(nil), do: 0

  def weekly_usage(user_id) when is_integer(user_id) do
    sum_tokens(user_id, nil, "WEEK")
  end

  @doc "Tokens this user spent on this specific feature today."
  def daily_feature_usage(nil, _), do: 0

  def daily_feature_usage(user_id, feature_key) when is_integer(user_id) do
    sum_tokens(user_id, to_string(feature_key), "DAY")
  end

  @doc "Tokens this user spent on this specific feature this week."
  def weekly_feature_usage(nil, _), do: 0

  def weekly_feature_usage(user_id, feature_key) when is_integer(user_id) do
    sum_tokens(user_id, to_string(feature_key), "WEEK")
  end

  @doc """
  Pre-flight budget check. Returns `:ok` or
  `{:error, :budget_exceeded, %{remaining_today, remaining_week, scope}}`.

  `scope` is `:daily` or `:weekly` depending on which cap blew first.

  Anonymous calls (`user_id: nil`) skip the budget check — they're
  used by sysadmin tooling and stub fallback paths.
  """
  def check_budget(nil, _feature_key, _est_tokens), do: :ok

  def check_budget(user_id, feature_key, est_tokens)
      when is_integer(user_id) and is_integer(est_tokens) do
    case FeatureRegistry.get(feature_key) do
      nil ->
        {:error, :feature_not_found, %{}}

      feature ->
        used_today = daily_feature_usage(user_id, feature_key)
        used_week = weekly_feature_usage(user_id, feature_key)
        remaining_today = max(feature.daily_token_cap - used_today, 0)
        remaining_week = max(feature.weekly_token_cap - used_week, 0)

        cond do
          used_today + est_tokens > feature.daily_token_cap ->
            {:error, :budget_exceeded,
             %{
               scope: :daily,
               remaining_today: remaining_today,
               remaining_week: remaining_week,
               cap: feature.daily_token_cap,
               used: used_today,
               estimate: est_tokens
             }}

          used_week + est_tokens > feature.weekly_token_cap ->
            {:error, :budget_exceeded,
             %{
               scope: :weekly,
               remaining_today: remaining_today,
               remaining_week: remaining_week,
               cap: feature.weekly_token_cap,
               used: used_week,
               estimate: est_tokens
             }}

          true ->
            :ok
        end
    end
  end

  @doc """
  Lightweight summary for the cost-preview UI. Doesn't gate; returns
  what's left so the popover can show "You have N tokens left today
  before this feature is rate-limited."
  """
  def remaining_for(user_id, feature_key) do
    case FeatureRegistry.get(feature_key) do
      nil ->
        %{daily: 0, weekly: 0, daily_cap: 0, weekly_cap: 0}

      feature ->
        used_today = daily_feature_usage(user_id, feature_key)
        used_week = weekly_feature_usage(user_id, feature_key)

        %{
          daily: max(feature.daily_token_cap - used_today, 0),
          weekly: max(feature.weekly_token_cap - used_week, 0),
          daily_cap: feature.daily_token_cap,
          weekly_cap: feature.weekly_token_cap
        }
    end
  end

  # ── Private ────────────────────────────────────────────────────

  defp sum_tokens(user_id, feature_key, period) do
    interval =
      case period do
        "DAY" -> "1 DAY"
        "WEEK" -> "7 DAY"
        _ -> "1 DAY"
      end

    {sql, params} =
      if feature_key do
        {
          """
          SELECT COALESCE(SUM(input_tokens + output_tokens), 0)
          FROM ai_usage_log
          WHERE user_id = ?
            AND feature_key = ?
            AND success = 1
            AND created_at >= DATE_SUB(NOW(), INTERVAL #{interval})
          """,
          [user_id, feature_key]
        }
      else
        {
          """
          SELECT COALESCE(SUM(input_tokens + output_tokens), 0)
          FROM ai_usage_log
          WHERE user_id = ?
            AND success = 1
            AND created_at >= DATE_SUB(NOW(), INTERVAL #{interval})
          """,
          [user_id]
        }
      end

    case Repo.query(sql, params) do
      {:ok, %{rows: [[n]]}} when is_integer(n) -> n
      _ -> 0
    end
  end
end
