defmodule TePhoenixWeb.Admin.WavesLive do
  @moduledoc """
  No-code editor for wave sequence definitions (`/sauce/world/waves`).
  """
  use TePhoenixWeb, :live_view

  alias TePhoenix.Waves.Registry

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     socket
     |> assign(:active_tab, :world)
     |> assign(:page_title, "Wave Sequences")
     |> assign(:defs, Registry.list_all() |> Enum.sort_by(& &1.key))
     |> assign(:editing, nil)
     |> assign(:flash_msg, nil)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="p-6 max-w-6xl mx-auto">
      <header class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-amber-400">Wave Sequences</h1>
          <p class="text-xs text-zinc-500 mt-1">
            <%= length(@defs) %> sequences defined. Tower defense rounds, MOBA lanes, horde survival.
          </p>
        </div>
        <button phx-click="new" class="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-black rounded text-sm font-bold">
          + New Sequence
        </button>
      </header>

      <div :if={@flash_msg} class="mb-4 p-3 bg-emerald-900/40 border border-emerald-700 text-emerald-200 text-sm rounded">
        <%= @flash_msg %>
      </div>

      <div :if={@editing} class="mb-6 p-4 border border-amber-700 rounded bg-zinc-950">
        <form phx-submit="save" class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="text-xs text-zinc-400">Key</span>
              <input name="key" value={@editing["key"]} required
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Name</span>
              <input name="name" value={@editing["name"]} required
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Map ID (optional — binds to specific map)</span>
              <input name="map_id" type="number" value={@editing["map_id"]}
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="flex items-center gap-2 mt-4">
              <input type="checkbox" name="loop" value="1" checked={@editing["loop"] == true} />
              <span class="text-xs text-zinc-400">Loop (restart after final wave — MOBA, horde)</span>
            </label>
          </div>

          <label class="block">
            <span class="text-xs text-zinc-400">Description</span>
            <textarea name="description" rows="2"
              class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm"><%= @editing["description"] %></textarea>
          </label>

          <div class="block">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-zinc-400">
                Rounds — array of wave objects
              </span>
              <button type="button" phx-click="add_wave_round"
                class="text-xs text-amber-400 hover:text-amber-300 px-2 py-1 border border-amber-700 rounded">
                + Quick Add Wave
              </button>
            </div>
            <textarea name="rounds_json" rows="8"
              class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono"><%= @editing["rounds_json"] %></textarea>
            <p class="text-[10px] text-zinc-600 mt-1">
              Format: [&lbrace;"wave": 1, "delay_seconds": 5, "spawns": [&lbrace;"npc_template": "key", "count": 3, "zone_key": "zone", "interval_ms": 1000, "boss": false&rbrace;]&rbrace;]
            </p>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <.live_component module={TePhoenixWeb.Components.RuleBuilder} id="wave_scaling" field_name="scaling_json" schema={:wave_scaling} label="Wave Scaling" value={@editing["scaling_json"]} />
            <.live_component module={TePhoenixWeb.Components.RuleBuilder} id="wave_settings" field_name="settings_json" schema={:wave_settings} label="Wave Settings" value={@editing["settings_json"]} />
          </div>

          <div class="grid grid-cols-3 gap-3">
            <.live_component module={TePhoenixWeb.Components.RuleBuilder} id="wave_on_start" field_name="on_wave_start_json" schema={:objective_callback} label="On Wave Start" value={@editing["on_wave_start_json"]} />
            <.live_component module={TePhoenixWeb.Components.RuleBuilder} id="wave_on_clear" field_name="on_wave_clear_json" schema={:objective_callback} label="On Wave Clear" value={@editing["on_wave_clear_json"]} />
            <.live_component module={TePhoenixWeb.Components.RuleBuilder} id="wave_on_complete" field_name="on_sequence_complete_json" schema={:objective_callback} label="On Sequence Complete" value={@editing["on_sequence_complete_json"]} />
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
            <th class="text-left py-2">Map</th>
            <th class="text-left py-2">Waves</th>
            <th class="text-left py-2">Loop</th>
            <th class="text-right py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          <%= for d <- @defs do %>
            <tr class="border-b border-zinc-900 hover:bg-zinc-900/40">
              <td class="py-2 font-mono text-xs text-zinc-400"><%= d.key %></td>
              <td class="py-2"><%= d.name %></td>
              <td class="py-2 text-xs text-zinc-500"><%= d.map_id || "any" %></td>
              <td class="py-2 text-xs text-zinc-500"><%= length(d.rounds) %></td>
              <td class="py-2 text-xs text-zinc-500"><%= if d.loop, do: "yes", else: "-" %></td>
              <td class="py-2 text-right">
                <button phx-click="edit" phx-value-key={d.key} class="text-xs text-amber-400 hover:underline mr-3">edit</button>
                <button phx-click="delete" phx-value-key={d.key} data-confirm={"Delete #{d.key}?"} class="text-xs text-red-400 hover:underline">delete</button>
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

  def handle_event("add_wave_round", _, socket) do
    current = socket.assigns.editing["rounds_json"] || "[]"
    rounds = case Jason.decode(current) do
      {:ok, l} when is_list(l) -> l
      _ -> []
    end
    next_wave = length(rounds) + 1
    template = %{"wave" => next_wave, "delay_seconds" => 5, "spawns" => [
      %{"npc_template" => "goblin", "count" => 3, "zone_key" => "entrance", "interval_ms" => 1000, "boss" => false}
    ]}
    updated = rounds ++ [template]
    editing = Map.put(socket.assigns.editing, "rounds_json", Jason.encode!(updated, pretty: true))
    {:noreply, assign(socket, :editing, editing)}
  end

  def handle_event("edit", %{"key" => key}, socket) do
    case Registry.get(key) do
      nil -> {:noreply, socket}
      d -> {:noreply, assign(socket, :editing, def_to_form(d))}
    end
  end

  def handle_event("delete", %{"key" => key}, socket) do
    Registry.delete(key)
    {:noreply, socket |> assign(:defs, Registry.list_all() |> Enum.sort_by(& &1.key)) |> assign(:flash_msg, "Deleted #{key}")}
  end

  def handle_event("save", params, socket) do
    d = form_to_def(params)
    Registry.upsert(d)
    {:noreply, socket |> assign(:editing, nil) |> assign(:defs, Registry.list_all() |> Enum.sort_by(& &1.key)) |> assign(:flash_msg, "Saved #{d.key}")}
  end

  defp blank do
    %{
      "key" => "", "name" => "", "description" => "", "map_id" => nil, "loop" => false,
      "rounds_json" => "[\n  {\"wave\": 1, \"delay_seconds\": 5, \"spawns\": [\n    {\"npc_template\": \"goblin\", \"count\": 3, \"zone_key\": \"entrance\", \"interval_ms\": 1000}\n  ]}\n]",
      "scaling_json" => "{\"hp_mult_per_wave\": 0.1, \"atk_mult_per_wave\": 0.05}",
      "settings_json" => "{\"auto_start\": true, \"clear_condition\": \"all_dead\"}",
      "on_wave_start_json" => "{}", "on_wave_clear_json" => "{}", "on_sequence_complete_json" => "{}"
    }
  end

  defp def_to_form(d) do
    %{
      "key" => d.key, "name" => d.name, "description" => d.description || "",
      "map_id" => d.map_id, "loop" => d.loop,
      "rounds_json" => Jason.encode!(d.rounds, pretty: true),
      "scaling_json" => Jason.encode!(d.scaling),
      "settings_json" => Jason.encode!(d.settings),
      "on_wave_start_json" => Jason.encode!(d.on_wave_start),
      "on_wave_clear_json" => Jason.encode!(d.on_wave_clear),
      "on_sequence_complete_json" => Jason.encode!(d.on_sequence_complete)
    }
  end

  defp form_to_def(p) do
    %{
      key: p["key"] || "", name: p["name"] || "", description: p["description"] || "",
      map_id: to_int(p["map_id"]),
      rounds: decode(p["rounds_json"], []),
      scaling: decode(p["scaling_json"], %{}),
      on_wave_start: decode(p["on_wave_start_json"], %{}),
      on_wave_clear: decode(p["on_wave_clear_json"], %{}),
      on_sequence_complete: decode(p["on_sequence_complete_json"], %{}),
      settings: decode(p["settings_json"], %{}),
      loop: p["loop"] == "1",
      enabled: true
    }
  end

  defp to_int(nil), do: nil
  defp to_int(""), do: nil
  defp to_int(s) when is_binary(s), do: case(Integer.parse(s), do: ({i, _} -> i; _ -> nil))
  defp to_int(i) when is_integer(i), do: i
  defp to_int(_), do: nil

  defp decode(nil, d), do: d
  defp decode("", d), do: d
  defp decode(s, d), do: case(Jason.decode(s), do: ({:ok, v} -> v; _ -> d))
end
