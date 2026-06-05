defmodule TePhoenixWeb.Admin.WavesLive do
  @moduledoc """
  No-code editor for wave sequence definitions (`/sauce/world/waves`).
  """
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo
  alias TePhoenix.Waves.Registry
  alias TePhoenixWeb.Components.PowerUserField
  alias TePhoenixWeb.Components.RuleTreeBuilder
  alias TePhoenixWeb.Components.RuleSchemas.WaveRound

  @impl true
  def mount(_params, _session, socket) do
    user_id = socket.assigns[:session_user_id]
    role_weight = PowerUserField.role_weight_for(socket.assigns[:session_role])
    field_views = PowerUserField.load_field_views(user_id)

    {:ok,
     socket
     |> assign(:active_tab, :world)
     |> assign(:page_title, "Wave Sequences")
     |> assign(:defs, Registry.list_all() |> Enum.sort_by(& &1.key))
     |> assign(:editing, nil)
     |> assign(:flash_msg, nil)
     |> assign(:role_weight, role_weight)
     |> assign(:field_views, field_views)
     |> assign(:scaling_schema, WaveRound.scaling_schema())
     |> assign(:settings_schema, WaveRound.settings_schema())
     |> assign(:callback_schema, WaveRound.callback_schema())
     |> assign(:npc_options, list_npc_options())}
  end

  defp list_npc_options do
    case Repo.query(
      "SELECT id, name FROM game_npcs WHERE is_active=1 ORDER BY name ASC LIMIT 500"
    ) do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [id, name] -> {to_string(id), name} end)
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

          <PowerUserField.power_user_field
            label="Rounds"
            help_text="Each round is a wave with delay + spawn list. Quick Add appends a starter wave; structured view summarizes; raw shows the full JSON."
            form_id="waves"
            field_name="rounds_json"
            user_id={@session_user_id}
            role_weight={@role_weight}
            view={Map.get(@field_views, "waves.rounds_json", "structured")}>
            <:structured>
              <div class="border border-zinc-800 rounded bg-zinc-900/40 p-3 space-y-2">
                <div class="flex items-center justify-between">
                  <% rounds = parsed_rounds(@editing["rounds_json"]) %>
                  <% total_spawns = Enum.sum(Enum.map(rounds, fn r -> Enum.sum(Enum.map(r["spawns"] || [], &(&1["count"] || 0))) end)) %>
                  <% est_seconds = Enum.sum(Enum.map(rounds, fn r -> r["delay_seconds"] || 0 end)) %>
                  <span class="text-xs text-zinc-400">
                    {length(rounds)} round<%= if length(rounds) != 1, do: "s" %> ·
                    <span class="text-amber-400 font-bold">{total_spawns}</span> total enemies ·
                    est <span class="text-zinc-300 font-mono">{est_seconds}s</span>
                  </span>
                  <button type="button" phx-click="add_wave_round"
                    class="text-xs text-amber-400 hover:text-amber-300 px-2 py-1 border border-amber-700 rounded">
                    + Quick Add Wave
                  </button>
                </div>

                <table :if={rounds != []} class="w-full text-xs">
                  <thead class="text-[10px] uppercase text-zinc-500">
                    <tr class="border-b border-zinc-800">
                      <th class="text-left py-1 w-10">#</th>
                      <th class="text-left py-1 w-32">NPC</th>
                      <th class="text-left py-1 w-16">Count</th>
                      <th class="text-left py-1 w-24">Zone</th>
                      <th class="text-left py-1 w-16">Diff ×</th>
                      <th class="text-left py-1 w-16">Delay</th>
                      <th class="text-right py-1 w-16">Edit</th>
                    </tr>
                  </thead>
                  <tbody>
                    <%= for {r, idx} <- Enum.with_index(rounds) do %>
                      <% first_spawn = (r["spawns"] || []) |> List.first() || %{} %>
                      <% extra_spawn_count = max(length(r["spawns"] || []) - 1, 0) %>
                      <tr class="border-b border-zinc-900 hover:bg-zinc-900/40">
                        <td class="py-1 font-mono text-zinc-300">{r["wave"] || (idx + 1)}</td>
                        <td class="py-1">
                          <select
                            phx-change="round_set_npc"
                            phx-value-index={idx}
                            name="npc"
                            class="w-full bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-[11px]">
                            <option value="">— pick —</option>
                            <option :for={{id, name} <- @npc_options}
                              value={id}
                              selected={to_string(first_spawn["npc_template"] || first_spawn["npc_id"] || "") == id}>
                              {name}
                            </option>
                            <%!-- if the round refers to an NPC slug not in the live list, surface it --%>
                            <option :if={
                                first_spawn["npc_template"] not in [nil, ""] and
                                not Enum.any?(@npc_options, fn {id, _} -> id == to_string(first_spawn["npc_template"]) end)
                              }
                              value={first_spawn["npc_template"]} selected>
                              {first_spawn["npc_template"]} (slug)
                            </option>
                          </select>
                        </td>
                        <td class="py-1">
                          <input type="number" min="1" max="50"
                            phx-blur="round_set_count" phx-value-index={idx}
                            name="count" value={first_spawn["count"] || 1}
                            class="w-full bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-[11px] font-mono" />
                        </td>
                        <td class="py-1">
                          <input type="text"
                            phx-blur="round_set_zone" phx-value-index={idx}
                            name="zone" value={first_spawn["zone_key"] || ""}
                            placeholder="entrance"
                            class="w-full bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-[11px] font-mono" />
                        </td>
                        <td class="py-1">
                          <input type="number" step="0.1" min="0.1" max="10"
                            phx-blur="round_set_difficulty" phx-value-index={idx}
                            name="difficulty" value={first_spawn["level_scaling"] || 1.0}
                            class="w-full bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-[11px] font-mono" />
                        </td>
                        <td class="py-1">
                          <input type="number" min="0" max="120"
                            phx-blur="round_set_delay" phx-value-index={idx}
                            name="delay" value={r["delay_seconds"] || 0}
                            class="w-full bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-[11px] font-mono" />
                        </td>
                        <td class="py-1 text-right">
                          <span :if={extra_spawn_count > 0}
                            class="text-[9px] text-amber-500/70 mr-1"
                            title="Extra spawn rows in this round — switch to Raw to edit">
                            +{extra_spawn_count}
                          </span>
                          <button type="button" phx-click="duplicate_wave_round" phx-value-index={idx}
                            class="text-[10px] text-zinc-500 hover:text-zinc-300 mr-1" title="Duplicate">⎘</button>
                          <button type="button" phx-click="delete_wave_round" phx-value-index={idx}
                            data-confirm={"Delete round #{r["wave"] || (idx + 1)}?"}
                            class="text-[10px] text-rose-500 hover:text-rose-400" title="Delete">✕</button>
                        </td>
                      </tr>
                    <% end %>
                  </tbody>
                </table>

                <div :if={rounds == []} class="text-[11px] text-zinc-500 italic text-center py-3">
                  No rounds yet — click <span class="text-amber-400">+ Quick Add Wave</span> to start, or switch to Raw to paste JSON.
                </div>

                <%!-- Hidden input keeps the JSON in sync with the form submit --%>
                <input type="hidden" name="rounds_json" value={@editing["rounds_json"]} />
              </div>
            </:structured>
            <:raw>
              <textarea name="rounds_json" rows="8"
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono"><%= @editing["rounds_json"] %></textarea>
              <p class="text-[10px] text-zinc-600 mt-1">
                Format: [&lbrace;"wave": 1, "delay_seconds": 5, "spawns": [&lbrace;"npc_template": "key", "count": 3, "zone_key": "zone", "interval_ms": 1000, "boss": false&rbrace;]&rbrace;]
              </p>
            </:raw>
          </PowerUserField.power_user_field>

          <div class="grid grid-cols-2 gap-3">
            <PowerUserField.power_user_field
              label="Wave Scaling"
              help_text="HP/ATK/XP/SPD multipliers applied per wave. Example: 0.10 = +10% per wave."
              form_id="waves" field_name="scaling_json"
              user_id={@session_user_id} role_weight={@role_weight}
              view={Map.get(@field_views, "waves.scaling_json", "structured")}>
              <:structured>
                <RuleTreeBuilder.rule_tree_builder kind={:action_list}
                  schema={@scaling_schema} field_name="scaling_json"
                  value={@editing["scaling_json"]} />
              </:structured>
              <:raw>
                <textarea name="scaling_json" rows="3"
                  class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono"><%= @editing["scaling_json"] %></textarea>
              </:raw>
            </PowerUserField.power_user_field>

            <PowerUserField.power_user_field
              label="Wave Settings"
              help_text="Auto-start, clear condition, intervals, max active spawns."
              form_id="waves" field_name="settings_json"
              user_id={@session_user_id} role_weight={@role_weight}
              view={Map.get(@field_views, "waves.settings_json", "structured")}>
              <:structured>
                <RuleTreeBuilder.rule_tree_builder kind={:action_list}
                  schema={@settings_schema} field_name="settings_json"
                  value={@editing["settings_json"]} />
              </:structured>
              <:raw>
                <textarea name="settings_json" rows="3"
                  class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono"><%= @editing["settings_json"] %></textarea>
              </:raw>
            </PowerUserField.power_user_field>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <PowerUserField.power_user_field
              label="On Wave Start"
              help_text="Side-effects fired at the start of each wave."
              form_id="waves" field_name="on_wave_start_json"
              user_id={@session_user_id} role_weight={@role_weight}
              view={Map.get(@field_views, "waves.on_wave_start_json", "structured")}>
              <:structured>
                <RuleTreeBuilder.rule_tree_builder kind={:action_list}
                  schema={@callback_schema} field_name="on_wave_start_json"
                  value={@editing["on_wave_start_json"]} />
              </:structured>
              <:raw>
                <textarea name="on_wave_start_json" rows="3"
                  class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono"><%= @editing["on_wave_start_json"] %></textarea>
              </:raw>
            </PowerUserField.power_user_field>

            <PowerUserField.power_user_field
              label="On Wave Clear"
              help_text="Side-effects fired when a wave clears (between-wave hooks)."
              form_id="waves" field_name="on_wave_clear_json"
              user_id={@session_user_id} role_weight={@role_weight}
              view={Map.get(@field_views, "waves.on_wave_clear_json", "structured")}>
              <:structured>
                <RuleTreeBuilder.rule_tree_builder kind={:action_list}
                  schema={@callback_schema} field_name="on_wave_clear_json"
                  value={@editing["on_wave_clear_json"]} />
              </:structured>
              <:raw>
                <textarea name="on_wave_clear_json" rows="3"
                  class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono"><%= @editing["on_wave_clear_json"] %></textarea>
              </:raw>
            </PowerUserField.power_user_field>

            <PowerUserField.power_user_field
              label="On Sequence Complete"
              help_text="Side-effects fired when the entire sequence resolves (final reward, broadcast)."
              form_id="waves" field_name="on_sequence_complete_json"
              user_id={@session_user_id} role_weight={@role_weight}
              view={Map.get(@field_views, "waves.on_sequence_complete_json", "structured")}>
              <:structured>
                <RuleTreeBuilder.rule_tree_builder kind={:action_list}
                  schema={@callback_schema} field_name="on_sequence_complete_json"
                  value={@editing["on_sequence_complete_json"]} />
              </:structured>
              <:raw>
                <textarea name="on_sequence_complete_json" rows="3"
                  class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs font-mono"><%= @editing["on_sequence_complete_json"] %></textarea>
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

  def handle_event("duplicate_wave_round", %{"index" => idx}, socket) do
    rounds = parsed_rounds(socket.assigns.editing["rounds_json"])
    n = String.to_integer(idx)

    case Enum.at(rounds, n) do
      nil ->
        {:noreply, socket}

      orig ->
        bumped = Map.put(orig, "wave", (orig["wave"] || (n + 1)) + 1)
        new_rounds = List.insert_at(rounds, n + 1, bumped)
        editing = Map.put(socket.assigns.editing, "rounds_json", Jason.encode!(new_rounds, pretty: true))
        {:noreply, assign(socket, :editing, editing)}
    end
  end

  def handle_event("delete_wave_round", %{"index" => idx}, socket) do
    rounds = parsed_rounds(socket.assigns.editing["rounds_json"])
    n = String.to_integer(idx)
    new_rounds = List.delete_at(rounds, n)
    editing = Map.put(socket.assigns.editing, "rounds_json", Jason.encode!(new_rounds, pretty: true))
    {:noreply, assign(socket, :editing, editing)}
  end

  def handle_event("power_user_field:toggle", params, socket),
    do: PowerUserField.handle_toggle(params, socket)

  def handle_event("rb:" <> _ = ev, params, socket),
    do: RuleTreeBuilder.dispatch(ev, params, socket, assign: :editing)

  # ── Inline cell editing for the round table ────────────────────
  # phx-blur on each cell carries `value` (the input value) plus the
  # phx-value-index we set on the input. The events update the FIRST
  # spawn of the targeted round (multi-spawn rounds show a +N badge
  # and direct admins to Raw mode for full editing).

  def handle_event("round_set_delay", %{"index" => idx, "value" => v}, socket) do
    {:noreply, update_round(socket, idx, fn r -> Map.put(r, "delay_seconds", to_int(v)) end)}
  end

  def handle_event("round_set_npc", %{"index" => idx, "value" => v}, socket) do
    {:noreply, update_first_spawn(socket, idx, fn s -> Map.put(s, "npc_template", v) end)}
  end

  def handle_event("round_set_count", %{"index" => idx, "value" => v}, socket) do
    {:noreply, update_first_spawn(socket, idx, fn s -> Map.put(s, "count", to_int(v)) end)}
  end

  def handle_event("round_set_zone", %{"index" => idx, "value" => v}, socket) do
    {:noreply, update_first_spawn(socket, idx, fn s -> Map.put(s, "zone_key", v) end)}
  end

  def handle_event("round_set_difficulty", %{"index" => idx, "value" => v}, socket) do
    {:noreply, update_first_spawn(socket, idx, fn s -> Map.put(s, "level_scaling", to_float(v)) end)}
  end

  defp update_round(socket, idx_str, mutator) do
    idx = String.to_integer(to_string(idx_str))
    rounds = parsed_rounds(socket.assigns.editing["rounds_json"])

    case Enum.at(rounds, idx) do
      nil ->
        socket

      round ->
        new_round = mutator.(round)
        new_rounds = List.replace_at(rounds, idx, new_round)
        editing = Map.put(socket.assigns.editing, "rounds_json", Jason.encode!(new_rounds, pretty: true))
        assign(socket, :editing, editing)
    end
  end

  defp update_first_spawn(socket, idx_str, spawn_mutator) do
    update_round(socket, idx_str, fn round ->
      spawns = round["spawns"] || []

      new_spawns =
        case spawns do
          [] ->
            [spawn_mutator.(blank_spawn())]

          [first | rest] ->
            [spawn_mutator.(first) | rest]
        end

      Map.put(round, "spawns", new_spawns)
    end)
  end

  defp blank_spawn do
    %{"npc_template" => "", "count" => 1, "zone_key" => "", "interval_ms" => 1000, "boss" => false}
  end

  defp to_float(nil), do: 1.0
  defp to_float(""), do: 1.0
  defp to_float(s) when is_binary(s) do
    case Float.parse(s) do
      {f, _} -> f
      _ -> 1.0
    end
  end
  defp to_float(n) when is_number(n), do: n / 1
  defp to_float(_), do: 1.0

  defp parsed_rounds(nil), do: []
  defp parsed_rounds(""), do: []
  defp parsed_rounds(s) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, l} when is_list(l) -> l
      _ -> []
    end
  end
  defp parsed_rounds(_), do: []

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
