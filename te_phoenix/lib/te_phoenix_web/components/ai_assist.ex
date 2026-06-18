defmodule TePhoenixWeb.Components.AiAssist do
  @moduledoc """
  Universal AI accelerator. A small ✨ button beside any admin form
  field; on click opens a popover with prompt + cost preview + 3-5
  preset prompts; on Generate, streams a structured suggestion the
  user can Accept / Edit / Regenerate / Cancel.

  Implemented as a Phoenix.LiveComponent so each instance owns its
  own popover/prompt/result state without polluting the parent LV's
  assigns.

  ## Default-hide rule

  If `FeatureRegistry.available_for?/2` returns `{:error, _}` for the
  current user, the trigger button RENDERS NOTHING. The whole point
  of this component is "AI as accelerator, not gate" — a player who
  can't use AI shouldn't see broken sparkle buttons mocking them.

  ## Acceptance flow

  1. Click ✨ → popover opens
  2. User edits prompt or picks a preset
  3. Cost preview shows estimated tokens + cents (PRE-FIRE)
  4. Click Generate → call goes to `Te.Phoenix.Ai.Gateway`
  5. Result rendered in `SuggestionDiff` (before/after where applicable)
  6. User clicks Accept → component fires `on_accept` JS push to parent
     with the suggestion payload as `phx-value-suggestion`
  7. Parent LV applies suggestion to its form state (DOES NOT auto-save)
  8. User clicks Save in the parent form to persist

  ## Usage

      <.live_component
        module={TePhoenixWeb.Components.AiAssist}
        id={"rule-suggester-" <> editing_key}
        feature_key="rule_suggester"
        trigger_label="Suggest rule"
        context={%{name: name, trigger: trigger, schema_summary: "..."}}
        on_accept={JS.push("ai:apply")} />

  ## Required parent handle_event

      def handle_event("ai:apply", %{"suggestion" => json}, socket) do
        # parse json, merge into editing, do NOT persist
      end
  """

  use Phoenix.LiveComponent
  alias Phoenix.LiveView.JS
  alias TePhoenix.AI.{FeatureRegistry, Budget, Gateway}
  alias TePhoenixWeb.Components.AiAssist.{Popover, CostPreview, SuggestionDiff}

  @impl true
  def mount(socket) do
    {:ok,
     socket
     |> assign(:open, false)
     |> assign(:prompt, "")
     |> assign(:loading, false)
     |> assign(:result, nil)
     |> assign(:error, nil)
     |> assign(:budget_left, nil)
     |> assign(:availability, :unknown)}
  end

  @impl true
  def update(assigns, socket) do
    user = build_user_proxy(assigns)
    feature = FeatureRegistry.get(assigns[:feature_key])

    availability =
      cond do
        is_nil(feature) -> {:error, :feature_not_found}
        true -> FeatureRegistry.available_for?(user, assigns[:feature_key])
      end

    budget_left =
      case assigns[:user_id] do
        uid when is_integer(uid) ->
          Budget.remaining_for(uid, assigns[:feature_key])

        _ ->
          %{daily: 0, weekly: 0, daily_cap: 0, weekly_cap: 0}
      end

    {:ok,
     socket
     |> assign(assigns)
     |> assign(:feature, feature)
     |> assign(:availability, availability)
     |> assign(:budget_left, budget_left)
     |> assign_new(:trigger_label, fn -> default_trigger_label(feature) end)
     |> assign_new(:on_accept, fn -> %JS{} end)
     |> assign_new(:context, fn -> %{} end)
     |> assign_new(:custom_prompts, fn -> [] end)
     |> assign_new(:title, fn -> feature && feature.label end)
     |> assign_new(:prompt, fn -> default_prompt(feature, assigns[:context] || %{}) end)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div id={"ai-assist-#{@id}"} class="inline-block relative">
      <%= if @availability == :ok do %>
        <button
          type="button"
          phx-click="ai:open"
          phx-target={@myself}
          class="inline-flex items-center gap-1 px-2 py-1 text-xs rounded
                 bg-gradient-to-br from-amber-500/15 to-purple-500/15
                 border border-amber-500/40 hover:border-amber-400
                 text-amber-300 hover:text-amber-200 transition"
          title={@feature && @feature.description}>
          {@trigger_label}
        </button>

        <Popover.popover :if={@open} id={@id} target={@myself} title={@title}>
          <div :if={@error} class="mb-3 p-2 text-xs bg-rose-950/40 border border-rose-700 text-rose-200 rounded">
            {@error}
          </div>

          <div :if={!@result} class="space-y-3">
            <div class="text-[11px] text-zinc-400">{@feature && @feature.description}</div>

            <div :if={@custom_prompts != [] or has_preset_prompts?(@feature)} class="space-y-1">
              <div class="text-[10px] uppercase tracking-wider text-zinc-500">Quick prompts</div>
              <div class="flex flex-wrap gap-1">
                <button :for={preset <- preset_prompts(@feature, @custom_prompts)}
                  type="button"
                  phx-click="ai:set_prompt" phx-target={@myself} phx-value-text={preset}
                  class="text-[11px] px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-300">
                  {String.slice(preset, 0, 48)}{if String.length(preset) > 48, do: "…"}
                </button>
              </div>
            </div>

            <label class="block">
              <span class="text-[10px] uppercase tracking-wider text-zinc-500">Prompt</span>
              <textarea
                phx-blur="ai:set_prompt" phx-target={@myself}
                name="prompt" rows="4"
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs"><%= @prompt %></textarea>
            </label>

            <CostPreview.cost_preview
              prompt={@prompt}
              feature={@feature}
              budget_left={@budget_left} />

            <div class="flex items-center gap-2 pt-2">
              <button
                type="button"
                phx-click="ai:generate" phx-target={@myself}
                disabled={@loading or insufficient_budget?(@budget_left, @prompt, @feature)}
                class="px-3 py-1.5 text-xs font-bold rounded
                       bg-amber-600 hover:bg-amber-500 text-black
                       disabled:opacity-40 disabled:cursor-not-allowed">
                {if @loading, do: "Generating…", else: "Generate"}
              </button>
              <button
                type="button"
                phx-click="ai:close" phx-target={@myself}
                class="px-3 py-1.5 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                Cancel
              </button>
            </div>
          </div>

          <div :if={@result} class="space-y-3">
            <SuggestionDiff.suggestion_diff
              before={Map.get(@context, :before_value, "")}
              after_value={@result.text}
              feature={@feature}
              tokens={Map.get(@result, :input_tokens, 0) + Map.get(@result, :output_tokens, 0)}
              cost_cents={Map.get(@result, :cost_cents, 0)} />

            <div class="flex items-center gap-2 pt-2">
              <button
                type="button"
                phx-click={
                  @on_accept
                  |> JS.push("ai:close", target: @myself)
                }
                phx-value-suggestion={@result.text}
                phx-value-feature_key={@feature_key}
                class="px-3 py-1.5 text-xs font-bold rounded bg-emerald-600 hover:bg-emerald-500 text-black">
                Accept
              </button>
              <button
                type="button"
                phx-click="ai:regenerate" phx-target={@myself}
                disabled={@loading}
                class="px-3 py-1.5 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40">
                Regenerate
              </button>
              <button
                type="button"
                phx-click="ai:edit_prompt" phx-target={@myself}
                class="px-3 py-1.5 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                Edit prompt
              </button>
              <button
                type="button"
                phx-click="ai:close" phx-target={@myself}
                class="ml-auto px-3 py-1.5 text-xs rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                Close
              </button>
            </div>
          </div>
        </Popover.popover>
      <% end %>
    </div>
    """
  end

  # ── Events ─────────────────────────────────────────────────────

  @impl true
  def handle_event("ai:open", _, socket) do
    {:noreply, assign(socket, :open, true)}
  end

  def handle_event("ai:close", _, socket) do
    {:noreply, assign(socket, open: false, result: nil, error: nil)}
  end

  def handle_event("ai:set_prompt", %{"text" => text}, socket) do
    {:noreply, assign(socket, :prompt, text)}
  end

  def handle_event("ai:set_prompt", %{"value" => value}, socket) do
    {:noreply, assign(socket, :prompt, value)}
  end

  def handle_event("ai:set_prompt", _, socket), do: {:noreply, socket}

  def handle_event("ai:edit_prompt", _, socket) do
    {:noreply, assign(socket, :result, nil)}
  end

  def handle_event("ai:regenerate", _, socket) do
    handle_event("ai:generate", %{}, socket)
  end

  def handle_event("ai:generate", _, socket) do
    %{prompt: prompt, feature_key: feature_key, user_id: user_id, context: context} =
      socket.assigns

    full_prompt = compose_full_prompt(prompt, socket.assigns.feature, context)

    case Gateway.call(
           String.to_atom(feature_key),
           full_prompt,
           user_id: user_id,
           user: build_user_proxy(socket.assigns),
           max_tokens: 1024
         ) do
      {:ok, result} ->
        {:noreply,
         socket
         |> assign(:result, result)
         |> assign(:loading, false)
         |> assign(:error, nil)
         |> refresh_budget()}

      {:error, :budget_exceeded, %{scope: scope, remaining_today: rt, remaining_week: rw}} ->
        {:noreply,
         socket
         |> assign(:error,
           "#{scope |> to_string |> String.capitalize()} budget exceeded. " <>
             "Remaining today: #{rt} tokens · this week: #{rw}. " <>
             "Try again later or ask an admin to raise the cap.")
         |> assign(:loading, false)}

      {:error, reason} ->
        {:noreply,
         socket
         |> assign(:error, "AI call failed: #{inspect(reason)}")
         |> assign(:loading, false)}
    end
  end

  # ── Helpers ────────────────────────────────────────────────────

  defp build_user_proxy(%{user: user}) when not is_nil(user), do: user
  defp build_user_proxy(%{role: r, role_weight: w}), do: %{role: r, role_weight: w}
  defp build_user_proxy(%{role_weight: w}), do: %{role_weight: w}
  defp build_user_proxy(%{role: r}), do: %{role: r}
  defp build_user_proxy(_), do: %{role_weight: 0}

  defp default_trigger_label(nil), do: "✨ AI"
  defp default_trigger_label(%{label: nil}), do: "✨ AI"
  defp default_trigger_label(%{label: label}), do: "✨ #{label}"

  defp default_prompt(nil, _), do: ""

  defp default_prompt(_feature, context) when map_size(context) == 0, do: ""

  defp default_prompt(_feature, %{prompt_seed: seed}) when is_binary(seed), do: seed
  defp default_prompt(_feature, _context), do: ""

  defp has_preset_prompts?(nil), do: false
  defp has_preset_prompts?(%{prompt_template: nil}), do: false
  defp has_preset_prompts?(%{prompt_template: ""}), do: false

  defp has_preset_prompts?(%{prompt_template: mod_name}) when is_binary(mod_name) do
    case template_module(mod_name) do
      nil -> false
      mod -> function_exported?(mod, :preset_prompts, 0)
    end
  end

  defp has_preset_prompts?(_), do: false

  defp preset_prompts(_feature, custom) when is_list(custom) and custom != [], do: custom

  defp preset_prompts(%{prompt_template: mod_name}, _) when is_binary(mod_name) do
    case template_module(mod_name) do
      nil -> []
      mod -> if function_exported?(mod, :preset_prompts, 0), do: mod.preset_prompts(), else: []
    end
  end

  defp preset_prompts(_, _), do: []

  defp template_module(name) when is_binary(name) do
    try do
      String.to_existing_atom("Elixir." <> name)
    rescue
      _ -> nil
    end
  end

  defp template_module(_), do: nil

  defp compose_full_prompt(user_prompt, %{prompt_template: mod_name}, context)
       when is_binary(mod_name) and mod_name != "" do
    case template_module(mod_name) do
      nil ->
        user_prompt

      mod ->
        if function_exported?(mod, :base_prompt, 1) do
          mod.base_prompt(Map.put(context, :user_input, user_prompt))
        else
          user_prompt
        end
    end
  end

  defp compose_full_prompt(user_prompt, _, _), do: user_prompt

  defp insufficient_budget?(%{daily: 0, daily_cap: cap}, _, _) when cap > 0, do: true
  defp insufficient_budget?(_, _, _), do: false

  defp refresh_budget(socket) do
    case socket.assigns[:user_id] do
      uid when is_integer(uid) ->
        assign(socket, :budget_left, Budget.remaining_for(uid, socket.assigns.feature_key))

      _ ->
        socket
    end
  end
end
