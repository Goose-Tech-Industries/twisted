defmodule TePhoenixWeb.Admin.AiFeaturesLive do
  @moduledoc """
  Admin control panel for AI features (`/sauce/ai-features`).

  Lists every row in `ai_features` with inline-editable role gate +
  daily/weekly token caps + global toggle + genre allowlist. Top of
  the page shows aggregate spend (today / this week / by feature)
  pulled from `ai_usage_log`.

  Admin-only — gated by role.weight >= 90.
  """

  use TePhoenixWeb, :live_view

  alias TePhoenix.AI.FeatureRegistry
  alias TePhoenix.Repo
  alias TePhoenixWeb.Components.PowerUserField

  @impl true
  def mount(_params, _session, socket) do
    role_weight = PowerUserField.role_weight(socket.assigns[:session_role])

    if role_weight < 90 do
      {:ok, push_navigate(socket, to: "/sauce")}
    else
      FeatureRegistry.ensure_columns()
      maybe_seed()

      {:ok,
       socket
       |> assign(:active_tab, :ai_features)
       |> assign(:page_title, "AI Features")
       |> assign(:role_weight, role_weight)
       |> assign(:features, FeatureRegistry.list_features())
       |> assign(:spend_today, spend_summary("DAY"))
       |> assign(:spend_week, spend_summary("WEEK"))
       |> assign(:spend_by_feature, spend_by_feature())
       |> assign(:flash_msg, nil)}
    end
  end

  defp maybe_seed do
    case Repo.query("SELECT COUNT(*) FROM ai_features WHERE prompt_template IS NOT NULL") do
      {:ok, %{rows: [[n]]}} when n >= 20 ->
        :ok

      _ ->
        FeatureRegistry.seed_canonical_features()
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="p-6 max-w-6xl mx-auto">
      <header class="mb-6">
        <h1 class="text-xl font-bold text-amber-400 flex items-center gap-2">
          <span>✨</span><span>AI Features</span>
        </h1>
        <p class="text-xs text-zinc-500 mt-1">
          {length(@features)} features · per-feature toggles, role gates,
          and daily/weekly token caps. AI is opt-in — turning a feature off
          hides its <span class="text-amber-400">✨</span> button across the admin.
        </p>
      </header>

      <div :if={@flash_msg} class="mb-4 p-3 bg-emerald-900/40 border border-emerald-700 text-emerald-200 text-sm rounded">
        {@flash_msg}
      </div>

      <%!-- ── Spend dashboard ──────────────────────────────── --%>
      <section class="mb-6 grid grid-cols-3 gap-3">
        <div class="p-3 bg-zinc-900/60 border border-zinc-800 rounded">
          <div class="text-[10px] uppercase tracking-wider text-zinc-500">Tokens today</div>
          <div class="text-xl font-mono font-bold text-amber-400">{@spend_today.tokens}</div>
          <div class="text-[10px] text-zinc-500">{format_cents(@spend_today.cost_cents)} · {@spend_today.calls} calls</div>
        </div>
        <div class="p-3 bg-zinc-900/60 border border-zinc-800 rounded">
          <div class="text-[10px] uppercase tracking-wider text-zinc-500">Tokens this week</div>
          <div class="text-xl font-mono font-bold text-amber-400">{@spend_week.tokens}</div>
          <div class="text-[10px] text-zinc-500">{format_cents(@spend_week.cost_cents)} · {@spend_week.calls} calls</div>
        </div>
        <div class="p-3 bg-zinc-900/60 border border-zinc-800 rounded">
          <div class="text-[10px] uppercase tracking-wider text-zinc-500">Top feature (week)</div>
          <div class="text-base font-mono text-zinc-200 truncate">{top_feature_label(@spend_by_feature)}</div>
          <div class="text-[10px] text-zinc-500">{top_feature_tokens(@spend_by_feature)} tokens</div>
        </div>
      </section>

      <%!-- ── Feature table ────────────────────────────────── --%>
      <section>
        <table class="w-full text-sm border-collapse">
          <thead class="text-zinc-500 text-xs">
            <tr class="border-b border-zinc-800">
              <th class="text-left py-2 w-48">Feature</th>
              <th class="text-left py-2 w-24">Category</th>
              <th class="text-left py-2 w-20">On</th>
              <th class="text-left py-2 w-24">Min Role</th>
              <th class="text-left py-2 w-28">Daily cap</th>
              <th class="text-left py-2 w-28">Weekly cap</th>
              <th class="text-left py-2">Genres</th>
            </tr>
          </thead>
          <tbody>
            <%= for f <- @features do %>
              <tr class="border-b border-zinc-900 hover:bg-zinc-900/40">
                <td class="py-1.5">
                  <div class="font-mono text-xs text-zinc-300">{f.feature_key}</div>
                  <div class="text-[10px] text-zinc-500 truncate max-w-xs" title={f.description}>{f.label}</div>
                </td>
                <td class="py-1.5 text-xs text-amber-400/80">{f.category}</td>
                <td class="py-1.5">
                  <input type="checkbox"
                    phx-click="toggle_enabled" phx-value-key={f.feature_key}
                    checked={f.enabled_globally}
                    class="cursor-pointer" />
                </td>
                <td class="py-1.5">
                  <select
                    phx-change="set_role_weight" phx-value-key={f.feature_key} name="weight"
                    class="bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-[11px]">
                    <option value="0" selected={f.min_role_weight == 0}>Anyone</option>
                    <option value="20" selected={f.min_role_weight == 20}>Premium+</option>
                    <option value="60" selected={f.min_role_weight == 60}>Staff+</option>
                    <option value="70" selected={f.min_role_weight == 70}>Mod+</option>
                    <option value="80" selected={f.min_role_weight == 80}>GM+</option>
                    <option value="90" selected={f.min_role_weight == 90}>Admin+</option>
                    <option value="100" selected={f.min_role_weight == 100}>Owner only</option>
                  </select>
                </td>
                <td class="py-1.5">
                  <input type="number" min="0" max="9999999" step="1000"
                    phx-blur="set_daily_cap" phx-value-key={f.feature_key} name="cap"
                    value={f.daily_token_cap}
                    class="w-24 bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-[11px] font-mono" />
                </td>
                <td class="py-1.5">
                  <input type="number" min="0" max="9999999" step="5000"
                    phx-blur="set_weekly_cap" phx-value-key={f.feature_key} name="cap"
                    value={f.weekly_token_cap}
                    class="w-24 bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-[11px] font-mono" />
                </td>
                <td class="py-1.5">
                  <input type="text"
                    phx-blur="set_genres" phx-value-key={f.feature_key} name="genres"
                    value={f.genres || "all"}
                    placeholder="all OR rpg,rts"
                    class="w-full bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-[11px] font-mono" />
                </td>
              </tr>
            <% end %>
          </tbody>
        </table>
      </section>
    </div>
    """
  end

  # ── Events ─────────────────────────────────────────────────────

  @impl true
  def handle_event("toggle_enabled", %{"key" => key}, socket) do
    feature = FeatureRegistry.get(key)
    new_enabled = !feature.enabled_globally
    FeatureRegistry.update_field(key, :enabled_globally, new_enabled)

    {:noreply,
     socket
     |> assign(:features, FeatureRegistry.list_features())
     |> assign(:flash_msg, "#{if new_enabled, do: "Enabled", else: "Disabled"} #{key}")}
  end

  def handle_event("set_role_weight", %{"key" => key, "value" => value}, socket) do
    FeatureRegistry.update_field(key, :min_role_weight, value)
    {:noreply, assign(socket, :features, FeatureRegistry.list_features())}
  end

  def handle_event("set_daily_cap", %{"key" => key, "value" => value}, socket) do
    FeatureRegistry.update_field(key, :daily_token_cap, value)
    {:noreply, assign(socket, :features, FeatureRegistry.list_features())}
  end

  def handle_event("set_weekly_cap", %{"key" => key, "value" => value}, socket) do
    FeatureRegistry.update_field(key, :weekly_token_cap, value)
    {:noreply, assign(socket, :features, FeatureRegistry.list_features())}
  end

  def handle_event("set_genres", %{"key" => key, "value" => value}, socket) do
    FeatureRegistry.update_field(key, :genres, value)
    {:noreply, assign(socket, :features, FeatureRegistry.list_features())}
  end

  # ── Helpers ────────────────────────────────────────────────────

  defp spend_summary(period) do
    interval = if period == "WEEK", do: "7 DAY", else: "1 DAY"

    case Repo.query("""
         SELECT
           COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
           COALESCE(SUM(cost_cents), 0) AS cost_cents,
           COUNT(*) AS calls
         FROM ai_usage_log
         WHERE success = 1 AND created_at >= DATE_SUB(NOW(), INTERVAL #{interval})
         """) do
      {:ok, %{rows: [[tokens, cost, calls]]}} ->
        %{tokens: tokens || 0, cost_cents: cost || 0, calls: calls || 0}

      _ ->
        %{tokens: 0, cost_cents: 0, calls: 0}
    end
  end

  defp spend_by_feature do
    case Repo.query("""
         SELECT feature_key,
                COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
         FROM ai_usage_log
         WHERE success = 1 AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
         GROUP BY feature_key
         ORDER BY tokens DESC
         LIMIT 5
         """) do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [k, t] -> %{key: k, tokens: t} end)
      _ -> []
    end
  end

  defp top_feature_label([]), do: "—"
  defp top_feature_label([%{key: k} | _]), do: k

  defp top_feature_tokens([]), do: 0
  defp top_feature_tokens([%{tokens: t} | _]), do: t

  defp format_cents(0), do: "$0.00"
  defp format_cents(c) when is_integer(c) do
    "$#{div(c, 100)}.#{rem(c, 100) |> Integer.to_string() |> String.pad_leading(2, "0")}"
  end
  defp format_cents(_), do: "$0.00"
end
