defmodule TePhoenixWeb.Admin.ObjectivesLive do
  @moduledoc """
  No-code editor for objective definitions (`/sauce/world/objectives`).

  Create and configure any world objective type — towers, generators,
  switches, capture points, collect quests, survive waves, escort
  missions. All data-driven, all toggleable. Place instances on maps
  via the map editor or programmatically via the API.
  """
  use TePhoenixWeb, :live_view

  alias TePhoenix.Objectives.Registry

  @types ~w(interact hold destroy collect survive escort reach construct toggle custom)
  @progress_models ~w(boolean counter timer hp)

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:active_tab, :world)
     |> assign(:page_title, "Objectives")
     |> assign(:defs, Registry.list_defs() |> Enum.sort_by(& &1.key))
     |> assign(:editing, nil)
     |> assign(:flash_msg, nil)
     |> assign(:types, @types)
     |> assign(:progress_models, @progress_models)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="p-6 max-w-6xl mx-auto">
      <header class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-amber-400">Objectives & Interactables</h1>
          <p class="text-xs text-zinc-500 mt-1">
            <%= length(@defs) %> objective types defined. Towers, generators, switches, quests — all data-driven.
          </p>
        </div>
        <button phx-click="new" class="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-black rounded text-sm font-bold">
          + New Objective
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
              <span class="text-xs text-zinc-400">Icon</span>
              <input name="icon" value={@editing["icon"]}
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Type</span>
              <select name="type" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                <%= for t <- @types do %>
                  <option value={t} selected={@editing["type"] == t}><%= t %></option>
                <% end %>
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Progress Model</span>
              <select name="progress_model" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                <%= for pm <- @progress_models do %>
                  <option value={pm} selected={@editing["progress_model"] == pm}><%= pm %></option>
                <% end %>
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Target Value</span>
              <input name="target_value" type="number" value={@editing["target_value"]}
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Respawn (seconds, 0=none)</span>
              <input name="respawn_seconds" type="number" value={@editing["respawn_seconds"]}
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="flex items-center gap-2 mt-4">
              <input type="checkbox" name="team_owned" value="1" checked={@editing["team_owned"] == true} />
              <span class="text-xs text-zinc-400">Team-owned (MOBA towers, RTS buildings)</span>
            </label>
          </div>

          <label class="block">
            <span class="text-xs text-zinc-400">Description</span>
            <textarea name="description" rows="2"
              class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm"><%= @editing["description"] %></textarea>
          </label>

          <label class="block">
            <span class="text-xs text-zinc-400">on_progress JSON (fires each tick / advance)</span>
            <textarea name="on_progress_json" rows="2"
              class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono"><%= @editing["on_progress_json"] %></textarea>
          </label>

          <label class="block">
            <span class="text-xs text-zinc-400">on_complete JSON (fires when objective is done)</span>
            <textarea name="on_complete_json" rows="2"
              class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono"><%= @editing["on_complete_json"] %></textarea>
          </label>

          <label class="block">
            <span class="text-xs text-zinc-400">on_fail JSON (fires on failure)</span>
            <textarea name="on_fail_json" rows="2"
              class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono"><%= @editing["on_fail_json"] %></textarea>
          </label>

          <label class="block">
            <span class="text-xs text-zinc-400">Settings JSON (type-specific config: max_interactors, skill_check_interval, capture_radius, etc.)</span>
            <textarea name="settings_json" rows="3"
              class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono"><%= @editing["settings_json"] %></textarea>
          </label>

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
            <th class="text-left py-2">Icon</th>
            <th class="text-left py-2">Key</th>
            <th class="text-left py-2">Name</th>
            <th class="text-left py-2">Type</th>
            <th class="text-left py-2">Progress</th>
            <th class="text-left py-2">Target</th>
            <th class="text-left py-2">Team</th>
            <th class="text-right py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          <%= for d <- @defs do %>
            <tr class="border-b border-zinc-900 hover:bg-zinc-900/40">
              <td class="py-2"><%= d.icon %></td>
              <td class="py-2 font-mono text-xs text-zinc-400"><%= d.key %></td>
              <td class="py-2"><%= d.name %></td>
              <td class="py-2 text-xs text-amber-500"><%= d.type %></td>
              <td class="py-2 text-xs text-zinc-500"><%= d.progress_model %></td>
              <td class="py-2 text-xs text-zinc-500"><%= d.target_value %></td>
              <td class="py-2 text-xs text-zinc-500"><%= if d.team_owned, do: "yes", else: "-" %></td>
              <td class="py-2 text-right">
                <button phx-click="edit" phx-value-key={d.key}
                  class="text-xs text-amber-400 hover:underline mr-3">edit</button>
                <button phx-click="delete" phx-value-key={d.key}
                  data-confirm={"Delete objective #{d.key}?"}
                  class="text-xs text-red-400 hover:underline">delete</button>
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
    case Registry.get_def(key) do
      nil -> {:noreply, socket}
      d -> {:noreply, assign(socket, :editing, def_to_form(d))}
    end
  end

  def handle_event("delete", %{"key" => key}, socket) do
    Registry.delete_def(key)
    {:noreply,
     socket
     |> assign(:defs, Registry.list_defs() |> Enum.sort_by(& &1.key))
     |> assign(:flash_msg, "Deleted #{key}")}
  end

  def handle_event("save", params, socket) do
    d = form_to_def(params)
    Registry.upsert_def(d)

    {:noreply,
     socket
     |> assign(:editing, nil)
     |> assign(:defs, Registry.list_defs() |> Enum.sort_by(& &1.key))
     |> assign(:flash_msg, "Saved #{d.key}")}
  end

  # ── form helpers ──

  defp blank do
    %{
      "key" => "",
      "name" => "",
      "description" => "",
      "icon" => "🎯",
      "type" => "interact",
      "progress_model" => "boolean",
      "target_value" => 1,
      "team_owned" => false,
      "respawn_seconds" => 0,
      "on_progress_json" => "{}",
      "on_complete_json" => "{}",
      "on_fail_json" => "{}",
      "settings_json" => "{}"
    }
  end

  defp def_to_form(d) do
    %{
      "key" => d.key,
      "name" => d.name,
      "description" => d.description || "",
      "icon" => d.icon,
      "type" => d.type,
      "progress_model" => d.progress_model,
      "target_value" => d.target_value,
      "team_owned" => d.team_owned,
      "respawn_seconds" => d.respawn_seconds,
      "on_progress_json" => Jason.encode!(d.on_progress),
      "on_complete_json" => Jason.encode!(d.on_complete),
      "on_fail_json" => Jason.encode!(d.on_fail),
      "settings_json" => Jason.encode!(d.settings)
    }
  end

  defp form_to_def(p) do
    %{
      key: p["key"] || "",
      name: p["name"] || "",
      description: p["description"] || "",
      icon: p["icon"] || "🎯",
      type: p["type"] || "interact",
      progress_model: p["progress_model"] || "boolean",
      target_value: to_int(p["target_value"], 1),
      team_owned: p["team_owned"] == "1",
      respawn_seconds: to_int(p["respawn_seconds"], 0),
      on_progress: decode(p["on_progress_json"]),
      on_complete: decode(p["on_complete_json"]),
      on_fail: decode(p["on_fail_json"]),
      settings: decode(p["settings_json"]),
      enabled: true
    }
  end

  defp to_int(nil, d), do: d
  defp to_int("", d), do: d
  defp to_int(s, d) when is_binary(s), do: case(Integer.parse(s), do: ({i, _} -> i; _ -> d))
  defp to_int(i, _) when is_integer(i), do: i
  defp to_int(_, d), do: d

  defp decode(nil), do: %{}
  defp decode(""), do: %{}
  defp decode(s), do: case(Jason.decode(s), do: ({:ok, m} -> m; _ -> %{}))
end
