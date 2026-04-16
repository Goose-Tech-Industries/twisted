defmodule TePhoenixWeb.Admin.CombatStatusesLive do
  @moduledoc """
  No-code editor for the data-driven battle status registry
  (`/sauce/combat/statuses`).

  Every status effect in the engine — bleeds, stuns, poisons, cripples,
  regen, haste, burn, confuse, berserk and anything the user wants to
  invent — is a row in `game_battle_statuses` and is edited here. The
  battle pipeline reads from ETS via `StatusRegistry`; saves here call
  `StatusRegistry.reload/0` so changes go live without a restart.

  Power-coders can attach visual-script graph IDs to the
  `on_apply` / `on_tick` / `on_expire` phases for full programmability.
  """
  use TePhoenixWeb, :live_view

  alias TePhoenix.Battle.StatusRegistry
  alias TePhoenix.Repo

  @stacking_modes ~w(refresh stack upgrade ignore)
  @categories ~w(buff debuff dot hot control injury other)

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:active_tab, :combat_statuses)
     |> assign(:page_title, "Status Effects")
     |> assign(:statuses, StatusRegistry.list_statuses() |> Enum.sort_by(& &1.key))
     |> assign(:scripts, list_scripts())
     |> assign(:editing, nil)
     |> assign(:flash_msg, nil)
     |> assign(:stacking_modes, @stacking_modes)
     |> assign(:categories, @categories)
     |> assign(:cure_tag_options, ~w(bleed poison burn freeze stun sleep silence blind confuse mind injury limb fire ice))
     |> assign(:disabled_command_options, ~w(attack magic item defend flee skill combo))}
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
          <h1 class="text-xl font-bold text-amber-400">Status Effects</h1>
          <p class="text-xs text-zinc-500 mt-1">
            Data-driven registry — <%= length(@statuses) %> effects loaded.
            Edits take effect immediately, no restart.
          </p>
        </div>
        <button phx-click="new" class="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-black rounded text-sm font-bold">
          + New Status
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
              <span class="text-xs text-zinc-400">Category</span>
              <select name="category" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                <%= for c <- @categories do %>
                  <option value={c} selected={@editing["category"] == c}><%= c %></option>
                <% end %>
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Default Duration (turns)</span>
              <input name="default_duration" type="number" value={@editing["default_duration"]}
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Stacking</span>
              <select name="stacking" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                <%= for s <- @stacking_modes do %>
                  <option value={s} selected={@editing["stacking"] == s}><%= s %></option>
                <% end %>
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Max Stacks</span>
              <input name="max_stacks" type="number" value={@editing["max_stacks"]}
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="flex items-center gap-2 mt-4">
              <input type="checkbox" name="permanent" value="1" checked={@editing["permanent"] == true} />
              <span class="text-xs text-zinc-400">Permanent (no duration countdown)</span>
            </label>
          </div>

          <label class="block">
            <span class="text-xs text-zinc-400">Description</span>
            <textarea name="description" rows="2"
              class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm"><%= @editing["description"] %></textarea>
          </label>

          <.live_component module={TePhoenixWeb.Components.RuleBuilder} id="status_effects" field_name="effects_json" schema={:status_effects} label="Stat Modifiers" value={@editing["effects_json"]} />
          <.live_component module={TePhoenixWeb.Components.RuleBuilder} id="status_tick" field_name="tick_json" schema={:status_tick} label="Per-Turn Tick" value={@editing["tick_json"]} />

          <div class="grid grid-cols-2 gap-3">
            <div class="block">
              <span class="text-xs text-zinc-400 block mb-1">Cure Tags</span>
              <div class="flex flex-wrap gap-2">
                <label :for={tag <- @cure_tag_options} class="flex items-center gap-1 text-xs">
                  <input type="checkbox" name="cure_tags[]" value={tag} checked={tag in parse_list(@editing["cure_tags_json"])} />
                  <span class="text-zinc-300"><%= tag %></span>
                </label>
              </div>
            </div>
            <div class="block">
              <span class="text-xs text-zinc-400 block mb-1">Disabled Commands</span>
              <div class="flex flex-wrap gap-2">
                <label :for={cmd <- @disabled_command_options} class="flex items-center gap-1 text-xs">
                  <input type="checkbox" name="disabled_commands[]" value={cmd} checked={cmd in parse_list(@editing["disabled_commands_json"])} />
                  <span class="text-zinc-300"><%= cmd %></span>
                </label>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <label class="block">
              <span class="text-xs text-zinc-400">on_apply graph</span>
              <select name="on_apply_script_id" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                <option value="">(none)</option>
                <%= for s <- @scripts do %>
                  <option value={s.id} selected={to_string(@editing["on_apply_script_id"]) == to_string(s.id)}>
                    <%= s.name %> (#<%= s.id %>)
                  </option>
                <% end %>
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">on_tick graph</span>
              <select name="on_tick_script_id" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                <option value="">(none)</option>
                <%= for s <- @scripts do %>
                  <option value={s.id} selected={to_string(@editing["on_tick_script_id"]) == to_string(s.id)}>
                    <%= s.name %> (#<%= s.id %>)
                  </option>
                <% end %>
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">on_expire graph</span>
              <select name="on_expire_script_id" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                <option value="">(none)</option>
                <%= for s <- @scripts do %>
                  <option value={s.id} selected={to_string(@editing["on_expire_script_id"]) == to_string(s.id)}>
                    <%= s.name %> (#<%= s.id %>)
                  </option>
                <% end %>
              </select>
            </label>
          </div>

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
            <th class="text-left py-2">Category</th>
            <th class="text-left py-2">Stacking</th>
            <th class="text-left py-2">Duration</th>
            <th class="text-right py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          <%= for s <- @statuses do %>
            <tr class="border-b border-zinc-900 hover:bg-zinc-900/40">
              <td class="py-2"><%= s.icon %></td>
              <td class="py-2 font-mono text-xs text-zinc-400"><%= s.key %></td>
              <td class="py-2"><%= s.name %></td>
              <td class="py-2 text-xs text-zinc-500"><%= s.category %></td>
              <td class="py-2 text-xs text-zinc-500"><%= s.stacking %></td>
              <td class="py-2 text-xs text-zinc-500"><%= if s.permanent, do: "permanent", else: s.default_duration %></td>
              <td class="py-2 text-right">
                <button phx-click="edit" phx-value-key={s.key}
                  class="text-xs text-amber-400 hover:underline mr-3">edit</button>
                <button phx-click="delete" phx-value-key={s.key}
                  data-confirm={"Delete status #{s.key}?"}
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
  def handle_event("new", _, socket) do
    {:noreply, assign(socket, :editing, blank_status())}
  end

  def handle_event("edit", %{"key" => key}, socket) do
    case StatusRegistry.get_status(key) do
      nil -> {:noreply, socket}
      s -> {:noreply, assign(socket, :editing, status_to_form(s))}
    end
  end

  def handle_event("cancel", _, socket), do: {:noreply, assign(socket, :editing, nil)}

  def handle_event("delete", %{"key" => key}, socket) do
    StatusRegistry.delete_status(key)
    {:noreply,
     socket
     |> assign(:statuses, StatusRegistry.list_statuses() |> Enum.sort_by(& &1.key))
     |> assign(:flash_msg, "Deleted #{key}")}
  end

  def handle_event("save", params, socket) do
    def = form_to_status(params)
    StatusRegistry.upsert_status(def)

    {:noreply,
     socket
     |> assign(:editing, nil)
     |> assign(:statuses, StatusRegistry.list_statuses() |> Enum.sort_by(& &1.key))
     |> assign(:flash_msg, "Saved #{def.key}")}
  end

  # ── Form helpers ──

  defp blank_status do
    %{
      "key" => "",
      "name" => "",
      "description" => "",
      "icon" => "⚡",
      "category" => "debuff",
      "default_duration" => 3,
      "permanent" => false,
      "stacking" => "refresh",
      "max_stacks" => 1,
      "effects_json" => "{}",
      "tick_json" => "{}",
      "cure_tags_json" => "[]",
      "disabled_commands_json" => "[]",
      "on_apply_script_id" => nil,
      "on_tick_script_id" => nil,
      "on_expire_script_id" => nil
    }
  end

  defp status_to_form(s) do
    %{
      "key" => s.key,
      "name" => s.name,
      "description" => s.description || "",
      "icon" => s.icon,
      "category" => s.category,
      "default_duration" => s.default_duration,
      "permanent" => s.permanent,
      "stacking" => s.stacking,
      "max_stacks" => s.max_stacks,
      "effects_json" => Jason.encode!(s.effects),
      "tick_json" => Jason.encode!(s.tick),
      "cure_tags_json" => Jason.encode!(s.cure_tags),
      "disabled_commands_json" => Jason.encode!(s.disabled_commands),
      "on_apply_script_id" => s.on_apply_script_id,
      "on_tick_script_id" => s.on_tick_script_id,
      "on_expire_script_id" => s.on_expire_script_id
    }
  end

  defp form_to_status(p) do
    %{
      key: Map.get(p, "key", ""),
      name: Map.get(p, "name", ""),
      description: Map.get(p, "description", ""),
      icon: Map.get(p, "icon", "⚡"),
      category: Map.get(p, "category", "debuff"),
      default_duration: to_int(Map.get(p, "default_duration"), 3),
      permanent: Map.get(p, "permanent") == "1",
      stacking: Map.get(p, "stacking", "refresh"),
      max_stacks: to_int(Map.get(p, "max_stacks"), 1),
      effects: decode_map(Map.get(p, "effects_json")),
      tick: decode_map(Map.get(p, "tick_json")),
      cure_tags: Map.get(p, "cure_tags", []) |> List.wrap(),
      disabled_commands: Map.get(p, "disabled_commands", []) |> List.wrap(),
      on_apply_script_id: to_int_or_nil(Map.get(p, "on_apply_script_id")),
      on_tick_script_id: to_int_or_nil(Map.get(p, "on_tick_script_id")),
      on_expire_script_id: to_int_or_nil(Map.get(p, "on_expire_script_id")),
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

  defp to_int_or_nil(nil), do: nil
  defp to_int_or_nil(""), do: nil
  defp to_int_or_nil(s) when is_binary(s) do
    case Integer.parse(s) do
      {i, _} -> i
      _ -> nil
    end
  end
  defp to_int_or_nil(i) when is_integer(i), do: i
  defp to_int_or_nil(_), do: nil

  defp decode_map(nil), do: %{}
  defp decode_map(""), do: %{}
  defp decode_map(s) do
    case Jason.decode(s) do
      {:ok, %{} = m} -> m
      _ -> %{}
    end
  end

  defp parse_list(nil), do: []
  defp parse_list(""), do: []
  defp parse_list(s) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, l} when is_list(l) -> l
      _ -> []
    end
  end
  defp parse_list(l) when is_list(l), do: l
  defp parse_list(_), do: []
end
