defmodule TePhoenixWeb.Admin.MatchModesLive do
  @moduledoc "No-code editor for match mode definitions (`/sauce/matches`)."
  use TePhoenixWeb, :live_view

  alias TePhoenix.Matches.Registry
  alias TePhoenixWeb.Components.PowerUserField
  alias TePhoenixWeb.Components.RuleTreeBuilder
  alias TePhoenixWeb.Components.RuleSchemas.MatchMode

  @queue_types ~w(casual ranked custom)

  @impl true
  def mount(_params, _session, socket) do
    user_id = socket.assigns[:session_user_id]
    role_weight = PowerUserField.role_weight_for(socket.assigns[:session_role])
    field_views = PowerUserField.load_field_views(user_id)

    {:ok,
     socket
     |> assign(:active_tab, :gameplay)
     |> assign(:page_title, "Match Modes")
     |> assign(:modes, Registry.list_all() |> Enum.sort_by(& &1.key))
     |> assign(:editing, nil)
     |> assign(:flash_msg, nil)
     |> assign(:queue_types, @queue_types)
     |> assign(:role_weight, role_weight)
     |> assign(:field_views, field_views)
     |> assign(:settings_schema, MatchMode.settings_schema())
     |> assign(:win_condition_schema, MatchMode.win_condition_schema())
     |> assign(:rewards_schema, MatchMode.rewards_schema())}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="p-6 max-w-6xl mx-auto">
      <header class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-amber-400">Match Modes</h1>
          <p class="text-xs text-zinc-500 mt-1"><%= length(@modes) %> modes. Queue, lobby, match lifecycle — all data-driven.</p>
        </div>
        <div class="flex items-center gap-2">
          <.live_component
            module={TePhoenixWeb.Components.AiAssist}
            id="ai-match-win"
            feature_key="match_win_condition"
            user_id={@session_user_id}
            role={@session_role}
            role_weight={@role_weight}
            trigger_label="✨ Suggest mode"
            context={%{
              before_value: (@editing && (@editing["win_conditions_json"] || "")) || ""
            }}
            on_accept={Phoenix.LiveView.JS.push("ai:apply_match_suggestion")} />
          <button phx-click="new" class="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-black rounded text-sm font-bold">+ New Mode</button>
        </div>
      </header>

      <div :if={@flash_msg} class="mb-4 p-3 bg-emerald-900/40 border border-emerald-700 text-emerald-200 text-sm rounded"><%= @flash_msg %></div>

      <div :if={@editing} class="mb-6 p-4 border border-amber-700 rounded bg-zinc-950">
        <form phx-submit="save" class="space-y-3">
          <div class="grid grid-cols-3 gap-3">
            <label class="block">
              <span class="text-xs text-zinc-400">Key</span>
              <input name="key" value={@editing["key"]} required class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Name</span>
              <input name="name" value={@editing["name"]} required class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Queue Type</span>
              <select name="queue_type" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                <%= for qt <- @queue_types do %>
                  <option value={qt} selected={@editing["queue_type"] == qt}><%= qt %></option>
                <% end %>
              </select>
            </label>
          </div>
          <div class="grid grid-cols-4 gap-3">
            <label class="block">
              <span class="text-xs text-zinc-400">Team Size</span>
              <input name="team_size" type="number" value={@editing["team_size"]} class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Team Count</span>
              <input name="team_count" type="number" value={@editing["team_count"]} class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Ready Check (s)</span>
              <input name="ready_check_seconds" type="number" value={@editing["ready_check_seconds"]} class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Match Time Limit (s, 0=none)</span>
              <input name="match_time_limit_seconds" type="number" value={@editing["match_time_limit_seconds"]} class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
          </div>
          <label class="block">
            <span class="text-xs text-zinc-400">Description</span>
            <textarea name="description" rows="2" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm"><%= @editing["description"] %></textarea>
          </label>
          <div class="grid grid-cols-2 gap-3">
            <PowerUserField.power_user_field
              label="Win Condition"
              help_text="How the match resolves — elimination, score target, time limit, objective capture."
              form_id="match_mode"
              field_name="win_conditions_json"
              user_id={@session_user_id}
              role_weight={@role_weight}
              view={Map.get(@field_views, "match_mode.win_conditions_json", "structured")}>
              <:structured>
                <RuleTreeBuilder.rule_tree_builder
                  kind={:condition_tree}
                  schema={@win_condition_schema}
                  field_name="win_conditions_json"
                  value={@editing["win_conditions_json"]} />
              </:structured>
              <:raw>
                <textarea name="win_conditions_json" rows="3"
                  class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono"><%= @editing["win_conditions_json"] %></textarea>
              </:raw>
            </PowerUserField.power_user_field>

            <PowerUserField.power_user_field
              label="Rewards"
              help_text="XP, gold, rank points awarded per match outcome."
              form_id="match_mode"
              field_name="rewards_json"
              user_id={@session_user_id}
              role_weight={@role_weight}
              view={Map.get(@field_views, "match_mode.rewards_json", "structured")}>
              <:structured>
                <RuleTreeBuilder.rule_tree_builder
                  kind={:action_list}
                  schema={@rewards_schema}
                  field_name="rewards_json"
                  value={@editing["rewards_json"]} />
              </:structured>
              <:raw>
                <textarea name="rewards_json" rows="3"
                  class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono"><%= @editing["rewards_json"] %></textarea>
              </:raw>
            </PowerUserField.power_user_field>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="text-xs text-zinc-400">Map Pool (comma-separated map IDs)</span>
              <input name="map_pool_json" value={@editing["map_pool_json"]} class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono" />
            </label>
            <PowerUserField.power_user_field
              label="Settings"
              help_text="Asymmetric, ranked, queue threshold, lobby timeout, rewards. Add an action per setting."
              form_id="match_mode"
              field_name="settings_json"
              user_id={@session_user_id}
              role_weight={@role_weight}
              view={Map.get(@field_views, "match_mode.settings_json", "structured")}>
              <:structured>
                <RuleTreeBuilder.rule_tree_builder
                  kind={:action_list}
                  schema={@settings_schema}
                  field_name="settings_json"
                  value={@editing["settings_json"]} />
              </:structured>
              <:raw>
                <textarea name="settings_json" rows="3"
                  class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono"><%= @editing["settings_json"] %></textarea>
              </:raw>
            </PowerUserField.power_user_field>
          </div>
          <div class="flex gap-2 pt-2">
            <button type="submit" class="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-black rounded text-sm font-bold">Save</button>
            <button type="button" phx-click="cancel" class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-sm">Cancel</button>
          </div>
        </form>
      </div>

      <table class="w-full text-sm border-collapse">
        <thead class="text-zinc-500 text-xs">
          <tr class="border-b border-zinc-800">
            <th class="text-left py-2">Key</th>
            <th class="text-left py-2">Name</th>
            <th class="text-left py-2">Teams</th>
            <th class="text-left py-2">Queue</th>
            <th class="text-left py-2">Time</th>
            <th class="text-right py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          <%= for m <- @modes do %>
            <tr class="border-b border-zinc-900 hover:bg-zinc-900/40">
              <td class="py-2 font-mono text-xs text-zinc-400"><%= m.key %></td>
              <td class="py-2"><%= m.name %></td>
              <td class="py-2 text-xs text-zinc-500"><%= m.team_size %>v<%= m.team_size %> (<%= m.team_count %> teams)</td>
              <td class="py-2 text-xs text-amber-500"><%= m.queue_type %></td>
              <td class="py-2 text-xs text-zinc-500"><%= if m.match_time_limit_seconds > 0, do: "#{div(m.match_time_limit_seconds, 60)}m", else: "none" %></td>
              <td class="py-2 text-right">
                <button phx-click="edit" phx-value-key={m.key} class="text-xs text-amber-400 hover:underline mr-3">edit</button>
                <button phx-click="delete" phx-value-key={m.key} data-confirm={"Delete #{m.key}?"} class="text-xs text-red-400 hover:underline">delete</button>
              </td>
            </tr>
          <% end %>
        </tbody>
      </table>
    </div>
    """
  end

  @impl true
  def handle_event("new", _, socket), do: {:noreply, assign(socket, :editing, blank())}
  def handle_event("cancel", _, socket), do: {:noreply, assign(socket, :editing, nil)}
  def handle_event("edit", %{"key" => key}, socket) do
    case Registry.get(key) do
      nil -> {:noreply, socket}
      m -> {:noreply, assign(socket, :editing, mode_to_form(m))}
    end
  end
  def handle_event("delete", %{"key" => key}, socket) do
    Registry.delete(key)
    {:noreply, socket |> assign(:modes, Registry.list_all() |> Enum.sort_by(& &1.key)) |> assign(:flash_msg, "Deleted #{key}")}
  end
  def handle_event("save", params, socket) do
    d = from_form(params)
    Registry.upsert(d)
    {:noreply, socket |> assign(:editing, nil) |> assign(:modes, Registry.list_all() |> Enum.sort_by(& &1.key)) |> assign(:flash_msg, "Saved #{d.key}")}
  end

  # Tier α infrastructure events
  def handle_event("rb:" <> _ = ev, params, socket),
    do: RuleTreeBuilder.dispatch(ev, params, socket, assign: :editing)

  def handle_event("power_user_field:toggle", params, socket),
    do: PowerUserField.handle_toggle(params, socket)

  # AI Assist accept — merge suggestion into current editing state
  def handle_event("ai:apply_match_suggestion", %{"suggestion" => json}, socket) do
    editing = socket.assigns.editing || blank()

    new_editing =
      case Jason.decode(json) do
        {:ok, %{} = parsed} ->
          editing
          |> apply_if(parsed, "name", "name")
          |> apply_if(parsed, "description", "description")
          |> apply_if(parsed, "win_conditions_json", "win_conditions")
          |> apply_if(parsed, "rewards_json", "rewards")
          |> apply_if(parsed, "settings_json", "settings")

        _ ->
          Map.put(editing, "description", json)
      end

    {:noreply,
     socket
     |> assign(:editing, new_editing)
     |> assign(:flash_msg, "AI suggestion applied — review and Save to commit.")}
  end

  def handle_event("ai:apply_match_suggestion", _, socket), do: {:noreply, socket}

  defp apply_if(editing, parsed, target_key, source_key) do
    case Map.get(parsed, source_key) do
      nil -> editing
      "" -> editing
      val when is_binary(val) -> Map.put(editing, target_key, val)
      val -> Map.put(editing, target_key, Jason.encode!(val))
    end
  end

  defp blank do
    %{"key" => "", "name" => "", "description" => "", "team_size" => 5, "team_count" => 2,
      "queue_type" => "casual", "ready_check_seconds" => 15, "match_time_limit_seconds" => 0,
      "win_conditions_json" => ~s({"type": "last_standing"}),
      "rewards_json" => ~s({"xp_win": 300, "xp_loss": 100, "gold_win": 150, "gold_loss": 50}),
      "map_pool_json" => "[]", "settings_json" => "{}"}
  end

  defp mode_to_form(m) do
    %{"key" => m.key, "name" => m.name, "description" => m.description || "",
      "team_size" => m.team_size, "team_count" => m.team_count,
      "queue_type" => m.queue_type, "ready_check_seconds" => m.ready_check_seconds,
      "match_time_limit_seconds" => m.match_time_limit_seconds,
      "win_conditions_json" => Jason.encode!(m.win_conditions),
      "rewards_json" => Jason.encode!(m.rewards),
      "map_pool_json" => Jason.encode!(m.map_pool),
      "settings_json" => Jason.encode!(m.settings)}
  end

  defp from_form(p) do
    %{key: p["key"] || "", name: p["name"] || "", description: p["description"] || "",
      team_size: ti(p["team_size"], 1), team_count: ti(p["team_count"], 2),
      queue_type: p["queue_type"] || "casual",
      ready_check_seconds: ti(p["ready_check_seconds"], 15),
      match_time_limit_seconds: ti(p["match_time_limit_seconds"], 0),
      win_conditions: dec(p["win_conditions_json"], %{}),
      rewards: dec(p["rewards_json"], %{}),
      map_pool: dec(p["map_pool_json"], []),
      settings: dec(p["settings_json"], %{}),
      enabled: true}
  end

  defp ti(nil, d), do: d
  defp ti("", d), do: d
  defp ti(s, d) when is_binary(s), do: case(Integer.parse(s), do: ({i, _} -> i; _ -> d))
  defp ti(i, _) when is_integer(i), do: i
  defp ti(_, d), do: d

  defp dec(nil, d), do: d
  defp dec("", d), do: d
  defp dec(s, d), do: case(Jason.decode(s), do: ({:ok, v} -> v; _ -> d))
end
