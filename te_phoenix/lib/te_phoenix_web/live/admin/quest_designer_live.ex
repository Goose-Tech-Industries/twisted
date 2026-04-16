defmodule TePhoenixWeb.Admin.QuestDesignerLive do
  @moduledoc """
  No-code quest designer (`/sauce/quests`).

  Create multi-stage quests with objectives (kill, collect, talk, reach,
  escort, interact, custom), prerequisites, rewards, and stage callbacks
  via the RuleBuilder component. All data stored in `game_quest_defs`
  (auto-created on mount) as JSON columns for stages/rewards/prereqs.
  """
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo
  require Logger

  @objective_types ~w(kill collect talk reach escort interact custom)

  # ── Mount ──────────────────────────────────────────────────────

  @impl true
  def mount(_params, _session, socket) do
    ensure_table()

    {:ok,
     socket
     |> assign(:active_tab, :world)
     |> assign(:page_title, "Quest Designer")
     |> assign(:quests, list_quests())
     |> assign(:editing, nil)
     |> assign(:flash_msg, nil)}
  end

  # ── Render ─────────────────────────────────────────────────────

  @impl true
  def render(assigns) do
    ~H"""
    <div class="p-6 max-w-6xl mx-auto">
      <header class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-amber-400">Quest Designer</h1>
          <p class="text-xs text-zinc-500 mt-1"><%= length(@quests) %> quests defined.</p>
        </div>
        <button phx-click="new" class="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-black rounded text-sm font-bold">
          + New Quest
        </button>
      </header>

      <div :if={@flash_msg} class="mb-4 p-3 bg-emerald-900/40 border border-emerald-700 text-emerald-200 text-sm rounded">
        <%= @flash_msg %>
      </div>

      <%!-- Edit form --%>
      <div :if={@editing} class="mb-6 p-4 border border-amber-700 rounded bg-zinc-950">
        <form phx-submit="save" class="space-y-4">
          <input type="hidden" name="original_id" value={@editing["id"]} />

          <%!-- Basic info --%>
          <fieldset class="border border-zinc-800 rounded p-3">
            <legend class="text-xs text-amber-400 px-2 font-bold">Basic Info</legend>
            <div class="grid grid-cols-3 gap-3">
              <label class="block">
                <span class="text-xs text-zinc-400">Key (unique)</span>
                <input name="key" value={@editing["key"]} required
                  class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono" />
              </label>
              <label class="block">
                <span class="text-xs text-zinc-400">Name</span>
                <input name="name" value={@editing["name"]} required
                  class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
              </label>
              <label class="block">
                <span class="text-xs text-zinc-400">Icon</span>
                <input name="icon" value={@editing["icon"]} placeholder="/icons/quest.png"
                  class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
              </label>
            </div>
            <label class="block mt-3">
              <span class="text-xs text-zinc-400">Description</span>
              <textarea name="description" rows="2"
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm"><%= @editing["description"] %></textarea>
            </label>
            <div class="grid grid-cols-3 gap-3 mt-3">
              <label class="block">
                <span class="text-xs text-zinc-400">Level Required</span>
                <input name="level_required" type="number" min="0" value={@editing["level_required"]}
                  class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
              </label>
              <label class="flex items-center gap-2 pt-5">
                <input type="checkbox" name="repeatable" value="1" checked={@editing["repeatable"]} />
                <span class="text-sm text-zinc-300">Repeatable</span>
              </label>
              <label class="flex items-center gap-2 pt-5">
                <input type="checkbox" name="enabled" value="1" checked={@editing["enabled"]} />
                <span class="text-sm text-zinc-300">Enabled</span>
              </label>
            </div>
          </fieldset>

          <%!-- Prerequisites --%>
          <fieldset class="border border-zinc-800 rounded p-3">
            <legend class="text-xs text-amber-400 px-2 font-bold">Prerequisites</legend>
            <label class="block">
              <span class="text-xs text-zinc-400">Quest keys that must be completed first (comma-separated)</span>
              <input name="prerequisites" value={@editing["prerequisites"]}
                placeholder="e.g. main_quest_1, side_intro"
                class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono" />
            </label>
          </fieldset>

          <%!-- Stages --%>
          <fieldset class="border border-zinc-800 rounded p-3">
            <legend class="text-xs text-amber-400 px-2 font-bold">Stages</legend>
            <div class="space-y-3">
              <%= for {stage, sidx} <- Enum.with_index(@editing["stages"] || []) do %>
                <div class="p-3 bg-zinc-900/50 border border-zinc-700 rounded">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-bold text-zinc-400">Stage <%= sidx + 1 %></span>
                    <div class="flex gap-1">
                      <button :if={sidx > 0} type="button" phx-click="move_stage" phx-value-index={sidx} phx-value-dir="up"
                        class="text-xs text-zinc-500 hover:text-amber-400 px-1">up</button>
                      <button :if={sidx < length(@editing["stages"] || []) - 1} type="button" phx-click="move_stage" phx-value-index={sidx} phx-value-dir="down"
                        class="text-xs text-zinc-500 hover:text-amber-400 px-1">dn</button>
                      <button type="button" phx-click="remove_stage" phx-value-index={sidx}
                        class="text-xs text-red-400 hover:text-red-300 px-1">X</button>
                    </div>
                  </div>
                  <div class="grid grid-cols-3 gap-3">
                    <label class="block col-span-2">
                      <span class="text-xs text-zinc-400">Description</span>
                      <input name={"stage_desc_#{sidx}"} value={stage["description"]}
                        placeholder="What the player needs to do..."
                        class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
                    </label>
                    <label class="block">
                      <span class="text-xs text-zinc-400">Objective Type</span>
                      <select name={"stage_type_#{sidx}"} class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                        <%= for t <- objective_types() do %>
                          <option value={t} selected={stage["objective_type"] == t}><%= t %></option>
                        <% end %>
                      </select>
                    </label>
                  </div>
                  <div class="grid grid-cols-3 gap-3 mt-2">
                    <label class="block">
                      <span class="text-xs text-zinc-400">Target (NPC/item/location)</span>
                      <input name={"stage_target_#{sidx}"} value={stage["target"]}
                        placeholder="e.g. goblin_chief, herb_moonpetal"
                        class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono" />
                    </label>
                    <label class="block">
                      <span class="text-xs text-zinc-400">Count (for kill/collect)</span>
                      <input name={"stage_count_#{sidx}"} type="number" min="1" value={stage["count"] || 1}
                        class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
                    </label>
                    <label class="block">
                      <span class="text-xs text-zinc-400">Optional hint</span>
                      <input name={"stage_hint_#{sidx}"} value={stage["hint"]}
                        placeholder="Look near the old ruins"
                        class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
                    </label>
                  </div>
                  <div class="mt-2">
                    <.live_component
                      module={TePhoenixWeb.Components.RuleBuilder}
                      id={"stage_callback_#{sidx}"}
                      field_name={"stage_callback_#{sidx}"}
                      schema={:objective_callback}
                      label="On Complete (set flag, give item, etc.)"
                      value={Jason.encode!(stage["on_complete"] || %{})}
                    />
                  </div>
                </div>
              <% end %>
            </div>
            <button type="button" phx-click="add_stage" class="mt-2 text-xs text-amber-400 hover:underline">
              + Add Stage
            </button>
          </fieldset>

          <%!-- Rewards --%>
          <fieldset class="border border-zinc-800 rounded p-3">
            <legend class="text-xs text-amber-400 px-2 font-bold">Rewards</legend>
            <.live_component
              module={TePhoenixWeb.Components.RuleBuilder}
              id="quest_rewards"
              field_name="rewards_json"
              schema={:match_rewards}
              label="Quest Rewards (XP, Gold, Items)"
              value={@editing["rewards_json"]}
            />
          </fieldset>

          <div class="flex gap-2 pt-2">
            <button type="submit" class="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-black rounded text-sm font-bold">Save Quest</button>
            <button type="button" phx-click="cancel" class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-sm">Cancel</button>
          </div>
        </form>
      </div>

      <%!-- Quest table --%>
      <table class="w-full text-sm border-collapse">
        <thead class="text-zinc-500 text-xs">
          <tr class="border-b border-zinc-800">
            <th class="text-left py-2">Key</th>
            <th class="text-left py-2">Name</th>
            <th class="text-left py-2">Lvl</th>
            <th class="text-left py-2">Stages</th>
            <th class="text-left py-2">Repeat</th>
            <th class="text-left py-2">On</th>
            <th class="text-right py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          <%= for q <- @quests do %>
            <tr class="border-b border-zinc-900 hover:bg-zinc-900/40">
              <td class="py-2 font-mono text-xs text-zinc-400"><%= q.key %></td>
              <td class="py-2"><%= q.name %></td>
              <td class="py-2 text-xs text-zinc-500"><%= q.level_required %></td>
              <td class="py-2 text-xs text-zinc-500"><%= length(q.stages) %></td>
              <td class="py-2 text-xs"><%= if q.repeatable, do: "Yes", else: "-" %></td>
              <td class="py-2 text-xs"><span class={if q.enabled, do: "text-emerald-400", else: "text-red-400"}><%= if q.enabled, do: "yes", else: "no" %></span></td>
              <td class="py-2 text-right">
                <button phx-click="edit" phx-value-id={q.id} class="text-xs text-amber-400 hover:underline mr-3">edit</button>
                <button phx-click="delete" phx-value-id={q.id} data-confirm={"Delete quest '#{q.key}'?"} class="text-xs text-red-400 hover:underline">delete</button>
              </td>
            </tr>
          <% end %>
        </tbody>
      </table>

      <p :if={@quests == []} class="text-zinc-500 text-sm italic mt-4">No quests defined yet.</p>
    </div>
    """
  end

  # ── Events ─────────────────────────────────────────────────────

  @impl true
  def handle_event("new", _, socket) do
    {:noreply, assign(socket, :editing, blank_quest())}
  end

  def handle_event("cancel", _, socket) do
    {:noreply, assign(socket, :editing, nil)}
  end

  def handle_event("edit", %{"id" => id_str}, socket) do
    id = String.to_integer(id_str)
    quest = Enum.find(socket.assigns.quests, &(&1.id == id))

    if quest do
      {:noreply, assign(socket, :editing, quest_to_form(quest))}
    else
      {:noreply, socket}
    end
  end

  def handle_event("delete", %{"id" => id_str}, socket) do
    id = String.to_integer(id_str)
    Repo.query("DELETE FROM game_quest_defs WHERE id = ?", [id])

    {:noreply,
     socket
     |> assign(:quests, list_quests())
     |> assign(:flash_msg, "Quest deleted.")}
  end

  def handle_event("add_stage", _, socket) do
    editing = socket.assigns.editing
    stages = (editing["stages"] || []) ++ [blank_stage()]
    {:noreply, assign(socket, :editing, Map.put(editing, "stages", stages))}
  end

  def handle_event("remove_stage", %{"index" => idx_str}, socket) do
    idx = String.to_integer(idx_str)
    editing = socket.assigns.editing
    stages = List.delete_at(editing["stages"] || [], idx)
    {:noreply, assign(socket, :editing, Map.put(editing, "stages", stages))}
  end

  def handle_event("move_stage", %{"index" => idx_str, "dir" => dir}, socket) do
    idx = String.to_integer(idx_str)
    editing = socket.assigns.editing
    stages = editing["stages"] || []
    target = if dir == "up", do: idx - 1, else: idx + 1

    if target >= 0 and target < length(stages) do
      stages = swap_at(stages, idx, target)
      {:noreply, assign(socket, :editing, Map.put(editing, "stages", stages))}
    else
      {:noreply, socket}
    end
  end

  def handle_event("save", params, socket) do
    original_id = parse_int(params["original_id"])
    key = String.trim(params["key"] || "")
    name = String.trim(params["name"] || "")

    if key == "" or name == "" do
      {:noreply, assign(socket, :flash_msg, "Key and name are required.")}
    else
      stages = collect_stages(params)
      prerequisites = split_csv(params["prerequisites"])
      rewards = decode_json(params["rewards_json"])

      quest_data = %{
        key: key,
        name: name,
        description: params["description"] || "",
        icon: params["icon"] || "",
        level_required: to_int(params["level_required"], 0),
        repeatable: params["repeatable"] == "1",
        enabled: params["enabled"] == "1",
        stages_json: Jason.encode!(stages),
        prerequisites_json: Jason.encode!(prerequisites),
        rewards_json: Jason.encode!(rewards)
      }

      if original_id do
        Repo.query(
          """
          UPDATE game_quest_defs
          SET `key` = ?, name = ?, description = ?, icon = ?, level_required = ?,
              repeatable = ?, enabled = ?, stages_json = ?, prerequisites_json = ?,
              rewards_json = ?
          WHERE id = ?
          """,
          [
            quest_data.key, quest_data.name, quest_data.description, quest_data.icon,
            quest_data.level_required, if(quest_data.repeatable, do: 1, else: 0),
            if(quest_data.enabled, do: 1, else: 0),
            quest_data.stages_json, quest_data.prerequisites_json, quest_data.rewards_json,
            original_id
          ]
        )
      else
        Repo.query(
          """
          INSERT INTO game_quest_defs
            (`key`, name, description, icon, level_required, repeatable, enabled,
             stages_json, prerequisites_json, rewards_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
          [
            quest_data.key, quest_data.name, quest_data.description, quest_data.icon,
            quest_data.level_required, if(quest_data.repeatable, do: 1, else: 0),
            if(quest_data.enabled, do: 1, else: 0),
            quest_data.stages_json, quest_data.prerequisites_json, quest_data.rewards_json
          ]
        )
      end

      {:noreply,
       socket
       |> assign(:editing, nil)
       |> assign(:quests, list_quests())
       |> assign(:flash_msg, "Saved quest '#{key}'")}
    end
  end

  # ── DB ─────────────────────────────────────────────────────────

  defp ensure_table do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS game_quest_defs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      `key` VARCHAR(100) NOT NULL DEFAULT '',
      name VARCHAR(255) NOT NULL DEFAULT '',
      description TEXT,
      icon VARCHAR(255) DEFAULT '',
      level_required INT NOT NULL DEFAULT 0,
      repeatable TINYINT(1) NOT NULL DEFAULT 0,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      stages_json LONGTEXT NOT NULL DEFAULT '[]',
      rewards_json LONGTEXT NOT NULL DEFAULT '{}',
      prerequisites_json LONGTEXT NOT NULL DEFAULT '[]',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_key (`key`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
  rescue
    _ -> :ok
  end

  defp list_quests do
    case Repo.query("""
         SELECT id, `key`, name, description, icon, level_required, repeatable, enabled,
                stages_json, rewards_json, prerequisites_json, updated_at
         FROM game_quest_defs ORDER BY name ASC
         """) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, key, name, desc, icon, lvl, rep, en, sj, rj, pj, upd] ->
          %{
            id: id,
            key: key || "",
            name: name || "",
            description: desc || "",
            icon: icon || "",
            level_required: lvl || 0,
            repeatable: rep == 1,
            enabled: en == 1,
            stages: decode_list(sj),
            rewards: decode_json(rj),
            prerequisites: decode_list(pj),
            updated_at: upd
          }
        end)

      _ ->
        []
    end
  rescue
    _ -> []
  end

  # ── Form helpers ───────────────────────────────────────────────

  defp blank_quest do
    %{
      "id" => nil,
      "key" => "",
      "name" => "",
      "description" => "",
      "icon" => "",
      "level_required" => 0,
      "repeatable" => false,
      "enabled" => true,
      "stages" => [blank_stage()],
      "prerequisites" => "",
      "rewards_json" => "{}"
    }
  end

  defp blank_stage do
    %{
      "description" => "",
      "objective_type" => "kill",
      "target" => "",
      "count" => 1,
      "hint" => "",
      "on_complete" => %{}
    }
  end

  defp quest_to_form(q) do
    %{
      "id" => q.id,
      "key" => q.key,
      "name" => q.name,
      "description" => q.description,
      "icon" => q.icon,
      "level_required" => q.level_required,
      "repeatable" => q.repeatable,
      "enabled" => q.enabled,
      "stages" => q.stages,
      "prerequisites" => Enum.join(q.prerequisites, ", "),
      "rewards_json" => Jason.encode!(q.rewards)
    }
  end

  defp collect_stages(params) do
    params
    |> Enum.filter(fn {k, _} -> String.starts_with?(k, "stage_desc_") end)
    |> Enum.map(fn {k, desc} ->
      idx = String.replace_prefix(k, "stage_desc_", "")

      %{
        "description" => desc,
        "objective_type" => params["stage_type_#{idx}"] || "kill",
        "target" => params["stage_target_#{idx}"] || "",
        "count" => to_int(params["stage_count_#{idx}"], 1),
        "hint" => params["stage_hint_#{idx}"] || "",
        "on_complete" => decode_json(params["stage_callback_#{idx}"])
      }
    end)
    |> Enum.sort_by(fn _ -> 0 end)
  end

  defp objective_types, do: @objective_types

  defp swap_at(list, i, j) do
    a = Enum.at(list, i)
    b = Enum.at(list, j)

    list
    |> List.replace_at(i, b)
    |> List.replace_at(j, a)
  end

  defp split_csv(nil), do: []
  defp split_csv(""), do: []

  defp split_csv(s) do
    s |> String.split(",") |> Enum.map(&String.trim/1) |> Enum.reject(&(&1 == ""))
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

  defp parse_int(nil), do: nil
  defp parse_int(""), do: nil

  defp parse_int(s) when is_binary(s) do
    case Integer.parse(s) do
      {n, _} -> n
      _ -> nil
    end
  end

  defp parse_int(n) when is_integer(n), do: n
  defp parse_int(_), do: nil

  defp decode_json(nil), do: %{}
  defp decode_json(""), do: %{}

  defp decode_json(s) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, %{} = m} -> m
      _ -> %{}
    end
  end

  defp decode_json(_), do: %{}

  defp decode_list(nil), do: []
  defp decode_list(""), do: []

  defp decode_list(s) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, l} when is_list(l) -> l
      _ -> []
    end
  end

  defp decode_list(_), do: []
end
