defmodule TePhoenixWeb.Admin.CombatRulesLive do
  @moduledoc """
  No-code editor for battle trigger rules (`/sauce/combat/rules`).

  Every row is a rule: when `trigger_event` fires during battle, if the
  JSON `condition` matches the current context, the JSON `effect` runs.
  Effects can apply/remove statuses, deal damage, heal, knock out,
  queue a runtime event, or invoke a visual-script graph.

  All of this flows through `TePhoenix.Battle.Triggers`, which the
  combat pipeline calls at every significant event: `limb_broken`,
  `ko`, `death`, `damage_taken`, `turn_start`, `turn_end`. Users can
  author any battle mechanic they want without touching Elixir code.
  """
  use TePhoenixWeb, :live_view

  alias TePhoenix.Battle.StatusRegistry
  alias TePhoenix.Repo

  @triggers ~w(
    limb_broken ko death damage_taken attack_landed crit_scored
    turn_start turn_end hp_threshold status_applied status_expired
    battle_start battle_end
  )

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:active_tab, :combat_rules)
     |> assign(:page_title, "Battle Rules")
     |> assign(:rules, StatusRegistry.list_rules() |> Enum.sort_by(&{&1.trigger, &1.key}))
     |> assign(:scripts, list_scripts())
     |> assign(:editing, nil)
     |> assign(:flash_msg, nil)
     |> assign(:triggers, @triggers)}
  end

  defp list_scripts do
    case Repo.query("SELECT id, name FROM game_visual_scripts ORDER BY name ASC") do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [id, name] -> %{id: id, name: name} end)
      _ -> []
    end
  rescue
    _ -> []
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="p-6 max-w-6xl mx-auto">
      <header class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-amber-400">Battle Rules</h1>
          <p class="text-xs text-zinc-500 mt-1">
            <%= length(@rules) %> rules loaded. Fires on events during combat — fully data-driven.
          </p>
        </div>
        <button phx-click="new" class="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-black rounded text-sm font-bold">
          + New Rule
        </button>
      </header>

      <div :if={@flash_msg} class="mb-4 p-3 bg-emerald-900/40 border border-emerald-700 text-emerald-200 text-sm rounded">
        <%= @flash_msg %>
      </div>

      <div :if={@editing} class="mb-6 p-4 border border-amber-700 rounded bg-zinc-950">
        <form phx-submit="save" class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="text-xs text-zinc-400">Key (unique id)</span>
              <input name="key" value={@editing["key"]} required
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Display Name</span>
              <input name="name" value={@editing["name"]} required
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Trigger Event</span>
              <select name="trigger" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                <%= for t <- @triggers do %>
                  <option value={t} selected={@editing["trigger"] == t}><%= t %></option>
                <% end %>
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Priority (higher runs first)</span>
              <input name="priority" type="number" value={@editing["priority"]}
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
          </div>

          <label class="block">
            <span class="text-xs text-zinc-400">Description</span>
            <textarea name="description" rows="2"
              class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm"><%= @editing["description"] %></textarea>
          </label>

          <.live_component
            module={TePhoenixWeb.Components.RuleBuilder}
            id="condition_builder"
            field_name="condition_json"
            schema={:battle_rule_condition}
            label="IF (conditions)"
            value={@editing["condition_json"]}
          />

          <.live_component
            module={TePhoenixWeb.Components.RuleBuilder}
            id="effect_builder"
            field_name="effect_json"
            schema={:battle_rule_effect}
            label="THEN (effects)"
            value={@editing["effect_json"]}
          />

          <div class="flex gap-2 pt-2">
            <button type="submit" class="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-black rounded text-sm font-bold">
              Save
            </button>
            <button type="button" phx-click="cancel"
              class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-sm">
              Cancel
            </button>
          </div>
        </form>
      </div>

      <table class="w-full text-sm border-collapse">
        <thead class="text-zinc-500 text-xs">
          <tr class="border-b border-zinc-800">
            <th class="text-left py-2">Key</th>
            <th class="text-left py-2">Name</th>
            <th class="text-left py-2">Trigger</th>
            <th class="text-left py-2">Condition</th>
            <th class="text-left py-2">Effect</th>
            <th class="text-left py-2">Priority</th>
            <th class="text-right py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          <%= for r <- @rules do %>
            <tr class="border-b border-zinc-900 hover:bg-zinc-900/40">
              <td class="py-2 font-mono text-xs text-zinc-400"><%= r.key %></td>
              <td class="py-2"><%= r.name %></td>
              <td class="py-2 text-xs text-amber-500"><%= r.trigger %></td>
              <td class="py-2 text-xs text-zinc-500 font-mono"><%= trunc_json(r.condition) %></td>
              <td class="py-2 text-xs text-zinc-500 font-mono"><%= trunc_json(r.effect) %></td>
              <td class="py-2 text-xs text-zinc-500"><%= r.priority %></td>
              <td class="py-2 text-right">
                <button phx-click="edit" phx-value-key={r.key}
                  class="text-xs text-amber-400 hover:underline mr-3">edit</button>
                <button phx-click="delete" phx-value-key={r.key}
                  data-confirm={"Delete rule #{r.key}?"}
                  class="text-xs text-red-400 hover:underline">delete</button>
              </td>
            </tr>
          <% end %>
        </tbody>
      </table>
    </div>
    """
  end

  # ── Events ──

  @impl true
  def handle_event("new", _, socket), do: {:noreply, assign(socket, :editing, blank_rule())}

  def handle_event("edit", %{"key" => key}, socket) do
    case Enum.find(StatusRegistry.list_rules(), &(&1.key == key)) do
      nil -> {:noreply, socket}
      r -> {:noreply, assign(socket, :editing, rule_to_form(r))}
    end
  end

  def handle_event("cancel", _, socket), do: {:noreply, assign(socket, :editing, nil)}

  def handle_event("delete", %{"key" => key}, socket) do
    StatusRegistry.delete_rule(key)
    {:noreply,
     socket
     |> assign(:rules, StatusRegistry.list_rules() |> Enum.sort_by(&{&1.trigger, &1.key}))
     |> assign(:flash_msg, "Deleted #{key}")}
  end

  def handle_event("save", params, socket) do
    rule = form_to_rule(params)
    StatusRegistry.upsert_rule(rule)

    {:noreply,
     socket
     |> assign(:editing, nil)
     |> assign(:rules, StatusRegistry.list_rules() |> Enum.sort_by(&{&1.trigger, &1.key}))
     |> assign(:flash_msg, "Saved #{rule.key}")}
  end

  # ── helpers ──

  defp blank_rule do
    %{
      "key" => "",
      "name" => "",
      "description" => "",
      "trigger" => "limb_broken",
      "condition_json" => "{}",
      "effect_json" => ~s({"apply_status": "bleed_light", "to": "victim"}),
      "priority" => 100
    }
  end

  defp rule_to_form(r) do
    %{
      "key" => r.key,
      "name" => r.name,
      "description" => r.description || "",
      "trigger" => r.trigger,
      "condition_json" => Jason.encode!(r.condition),
      "effect_json" => Jason.encode!(r.effect),
      "priority" => r.priority
    }
  end

  defp form_to_rule(p) do
    %{
      key: Map.get(p, "key", ""),
      name: Map.get(p, "name", ""),
      description: Map.get(p, "description", ""),
      trigger: Map.get(p, "trigger", "limb_broken"),
      condition: decode_map(Map.get(p, "condition_json")),
      effect: decode_map(Map.get(p, "effect_json")),
      priority: to_int(Map.get(p, "priority"), 100),
      enabled: true
    }
  end

  defp to_int(nil, d), do: d
  defp to_int("", d), do: d
  defp to_int(s, d) when is_binary(s) do
    case Integer.parse(s) do
      {i, _} -> i
      _ -> d
    end
  end
  defp to_int(i, _) when is_integer(i), do: i
  defp to_int(_, d), do: d

  defp decode_map(nil), do: %{}
  defp decode_map(""), do: %{}
  defp decode_map(s) do
    case Jason.decode(s) do
      {:ok, %{} = m} -> m
      _ -> %{}
    end
  end

  defp trunc_json(m) do
    s = Jason.encode!(m)
    if String.length(s) > 60, do: String.slice(s, 0, 57) <> "...", else: s
  end
end
