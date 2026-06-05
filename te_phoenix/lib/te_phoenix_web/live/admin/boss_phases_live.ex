defmodule TePhoenixWeb.Admin.BossPhasesLive do
  @moduledoc """
  No-code boss phase + transformation editor (`/sauce/combat/bosses`).

  Every field is a form input — no JSON typing required. Users build
  multi-phase boss fights and full transformations (Broly → Super Broly)
  entirely through dropdowns, sliders, and text fields.
  """
  use TePhoenixWeb, :live_view

  alias TePhoenix.Battle.BossPhases
  alias TePhoenix.Repo

  @impl true
  def mount(_params, _session, socket) do
    BossPhases.ensure_table()

    {:ok,
     socket
     |> assign(:active_tab, :combat)
     |> assign(:page_title, "Boss Phases")
     |> assign(:bosses, list_boss_npcs())
     |> assign(:phases, [])
     |> assign(:selected_boss, nil)
     |> assign(:editing, nil)
     |> assign(:flash_msg, nil)
     |> assign(:statuses, list_status_keys())}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="p-6 max-w-6xl mx-auto">
      <header class="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold text-amber-400">Boss Phases & Transformations</h1>
          <p class="text-xs text-zinc-500 mt-1">No-code multi-phase boss fights. Full form changes — new name, sprite, HP, stats, moveset.</p>
        </div>
        <.live_component
          module={TePhoenixWeb.Components.AiAssist}
          id="ai-boss-phase-progression"
          feature_key="boss_phase_progression"
          user_id={@session_user_id}
          role={@session_role}
          trigger_label="✨ Suggest progression"
          context={%{before_value: ""}}
          on_accept={Phoenix.LiveView.JS.push("ai:apply_boss_suggestion")} />
      </header>

      <div :if={@flash_msg} class="mb-4 p-3 bg-emerald-900/40 border border-emerald-700 text-emerald-200 text-sm rounded"><%= @flash_msg %></div>

      <div class="mb-6 flex items-center gap-3">
        <label class="text-sm text-zinc-400">Select Boss NPC:</label>
        <select phx-change="select_boss" name="boss_id" class="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm">
          <option value="">(choose a boss)</option>
          <%= for b <- @bosses do %>
            <option value={b.id} selected={@selected_boss == b.id}><%= b.name %> (#<%= b.id %>)</option>
          <% end %>
        </select>
        <button :if={@selected_boss} phx-click="new_phase" class="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-black rounded text-sm font-bold">+ Add Phase</button>
      </div>

      <div :if={@phases != []} class="space-y-3 mb-6">
        <%= for p <- @phases do %>
          <div class="p-3 border border-zinc-800 rounded bg-zinc-950 flex items-center justify-between">
            <div>
              <span class="text-amber-400 font-bold">Phase <%= p.phase %></span>
              <span class="text-zinc-400 text-sm ml-2"><%= p.name %></span>
              <span class="text-zinc-600 text-xs ml-2">(&lt;= <%= trunc(p.hp_threshold_pct * 100) %>% HP)</span>
              <%= if t = (p.on_enter || %{})["transform"] do %>
                <span class="text-red-400 text-xs ml-2">Transforms → <%= t["name"] || "?" %></span>
              <% end %>
            </div>
            <div class="flex gap-2">
              <button phx-click="edit_phase" phx-value-phase={p.phase} class="text-xs text-amber-400 hover:underline">edit</button>
              <button phx-click="delete_phase" phx-value-phase={p.phase} data-confirm="Delete this phase?" class="text-xs text-red-400 hover:underline">delete</button>
            </div>
          </div>
        <% end %>
      </div>

      <div :if={@editing} class="p-4 border border-amber-700 rounded bg-zinc-950">
        <h2 class="text-lg font-bold text-amber-400 mb-3">Phase <%= @editing["phase"] %></h2>
        <form phx-submit="save_phase" class="space-y-4">
          <input type="hidden" name="boss_id" value={@selected_boss} />

          <div class="grid grid-cols-3 gap-3">
            <label class="block">
              <span class="text-xs text-zinc-400">Phase Number</span>
              <input name="phase" type="number" value={@editing["phase"]} required class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">Phase Name</span>
              <input name="name" value={@editing["name"]} class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
            <label class="block">
              <span class="text-xs text-zinc-400">HP Threshold (%)</span>
              <input name="hp_pct" type="number" step="1" min="1" max="99" value={@editing["hp_pct"]} class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
            </label>
          </div>

          <fieldset class="border border-zinc-800 rounded p-3">
            <legend class="text-xs text-amber-400 px-2">Transformation (optional)</legend>
            <div class="grid grid-cols-3 gap-3">
              <label class="block">
                <span class="text-xs text-zinc-400">New Name</span>
                <input name="t_name" value={@editing["t_name"]} placeholder="(keep current)" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
              </label>
              <label class="block">
                <span class="text-xs text-zinc-400">New Icon</span>
                <input name="t_icon" value={@editing["t_icon"]} placeholder="👹" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
              </label>
              <label class="block">
                <span class="text-xs text-zinc-400">Sprite URL</span>
                <input name="t_sprite" value={@editing["t_sprite"]} placeholder="/sprites/boss_form2.png" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
              </label>
              <label class="block">
                <span class="text-xs text-zinc-400">New Max HP</span>
                <input name="t_max_hp" type="number" value={@editing["t_max_hp"]} placeholder="(keep current)" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
              </label>
              <label class="block">
                <span class="text-xs text-zinc-400">Restore HP %</span>
                <input name="t_restore_pct" type="number" step="0.1" min="0" max="1" value={@editing["t_restore_pct"] || "1.0"} class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
              </label>
              <label class="block">
                <span class="text-xs text-zinc-400">Animation Key</span>
                <input name="t_animation" value={@editing["t_animation"]} placeholder="transform_burst" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
              </label>
            </div>
            <div class="grid grid-cols-5 gap-3 mt-3">
              <label class="block"><span class="text-xs text-zinc-400">ATK</span>
                <input name="t_atk" type="number" value={@editing["t_atk"]} placeholder="-" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" /></label>
              <label class="block"><span class="text-xs text-zinc-400">DEF</span>
                <input name="t_def" type="number" value={@editing["t_def"]} placeholder="-" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" /></label>
              <label class="block"><span class="text-xs text-zinc-400">MO</span>
                <input name="t_mo" type="number" value={@editing["t_mo"]} placeholder="-" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" /></label>
              <label class="block"><span class="text-xs text-zinc-400">SPD</span>
                <input name="t_spd" type="number" value={@editing["t_spd"]} placeholder="-" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" /></label>
              <label class="block"><span class="text-xs text-zinc-400">LCK</span>
                <input name="t_lck" type="number" value={@editing["t_lck"]} placeholder="-" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" /></label>
            </div>
            <div class="grid grid-cols-2 gap-3 mt-3">
              <label class="block"><span class="text-xs text-zinc-400">Weaknesses (comma-separated)</span>
                <input name="t_weaknesses" value={@editing["t_weaknesses"]} placeholder="ice, holy" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" /></label>
              <label class="block"><span class="text-xs text-zinc-400">Weapon Elements (comma-separated)</span>
                <input name="t_elements" value={@editing["t_elements"]} placeholder="fire, dark" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" /></label>
            </div>
            <div class="flex gap-4 mt-3">
              <label class="flex items-center gap-2"><input type="checkbox" name="t_clear_statuses" value="1" checked={@editing["t_clear_statuses"]} /> <span class="text-xs text-zinc-400">Clear all statuses on transform</span></label>
              <label class="flex items-center gap-2"><input type="checkbox" name="t_clear_cooldowns" value="1" checked={@editing["t_clear_cooldowns"]} /> <span class="text-xs text-zinc-400">Clear all cooldowns</span></label>
            </div>
          </fieldset>

          <fieldset class="border border-zinc-800 rounded p-3">
            <legend class="text-xs text-amber-400 px-2">Phase Effects</legend>
            <div class="grid grid-cols-2 gap-3">
              <label class="block"><span class="text-xs text-zinc-400">Apply Statuses (comma-separated keys)</span>
                <input name="apply_statuses" value={@editing["apply_statuses"]} placeholder="berserk, haste" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" /></label>
              <label class="block"><span class="text-xs text-zinc-400">Remove Statuses (comma-separated keys)</span>
                <input name="remove_statuses" value={@editing["remove_statuses"]} placeholder="shield" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" /></label>
            </div>
            <div class="grid grid-cols-2 gap-3 mt-3">
              <label class="block"><span class="text-xs text-zinc-400">Dialogue (boss speaks)</span>
                <input name="dialogue" value={@editing["dialogue"]} placeholder="You dare challenge me?!" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" /></label>
              <label class="block"><span class="text-xs text-zinc-400">Music Key</span>
                <input name="music" value={@editing["music"]} placeholder="boss_phase2" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" /></label>
            </div>
          </fieldset>

          <div class="flex gap-2 pt-2">
            <button type="submit" class="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-black rounded text-sm font-bold">Save Phase</button>
            <button type="button" phx-click="cancel" class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-sm">Cancel</button>
          </div>
        </form>
      </div>
    </div>
    """
  end

  @impl true
  def handle_event("ai:apply_boss_suggestion", %{"suggestion" => json}, socket) do
    target = socket.assigns.editing || %{}

    new_editing =
      TePhoenixWeb.Admin.AiApplyHelpers.merge(json, target,
        ~w(name phase hp_threshold_pct stat_mods_json on_enter_json on_exit_json
           t_name t_animation t_clear_statuses sprite_id active_abilities_json))

    {:noreply,
     socket
     |> assign(:editing, new_editing)
     |> assign(:flash_msg, "AI suggestion applied — review and Save to commit.")}
  end

  def handle_event("ai:apply_boss_suggestion", _, socket), do: {:noreply, socket}

  def handle_event("select_boss", %{"boss_id" => ""}, socket), do: {:noreply, assign(socket, selected_boss: nil, phases: [], editing: nil)}
  def handle_event("select_boss", %{"boss_id" => id_str}, socket) do
    boss_id = String.to_integer(id_str)
    phases = BossPhases.get_phases(boss_id)
    {:noreply, assign(socket, selected_boss: boss_id, phases: phases, editing: nil)}
  end

  def handle_event("new_phase", _, socket) do
    next = case socket.assigns.phases do
      [] -> 1
      ps -> Enum.max_by(ps, & &1.phase).phase + 1
    end
    {:noreply, assign(socket, :editing, blank(next))}
  end

  def handle_event("edit_phase", %{"phase" => phase_str}, socket) do
    phase_num = String.to_integer(phase_str)
    p = Enum.find(socket.assigns.phases, &(&1.phase == phase_num))
    if p, do: {:noreply, assign(socket, :editing, phase_to_form(p))}, else: {:noreply, socket}
  end

  def handle_event("cancel", _, socket), do: {:noreply, assign(socket, :editing, nil)}

  def handle_event("delete_phase", %{"phase" => phase_str}, socket) do
    BossPhases.delete_phase(socket.assigns.selected_boss, String.to_integer(phase_str))
    phases = BossPhases.get_phases(socket.assigns.selected_boss)
    {:noreply, assign(socket, phases: phases, flash_msg: "Deleted phase #{phase_str}")}
  end

  def handle_event("save_phase", params, socket) do
    boss_id = socket.assigns.selected_boss
    phase_num = ti(params["phase"], 1)

    transform = build_transform(params)
    on_enter = %{
      "apply_status" => split_csv(params["apply_statuses"]),
      "remove_status" => split_csv(params["remove_statuses"]),
      "dialogue" => nne(params["dialogue"]),
      "music" => nne(params["music"])
    }
    on_enter = if transform != %{}, do: Map.put(on_enter, "transform", transform), else: on_enter
    on_enter = Map.reject(on_enter, fn {_k, v} -> is_nil(v) or v == [] or v == "" end)

    BossPhases.upsert_phase(boss_id, phase_num, %{
      hp_threshold_pct: (ti(params["hp_pct"], 50)) / 100.0,
      name: params["name"] || "Phase #{phase_num}",
      on_enter: on_enter
    })

    phases = BossPhases.get_phases(boss_id)
    {:noreply, assign(socket, phases: phases, editing: nil, flash_msg: "Saved phase #{phase_num}")}
  end

  # ── helpers ──

  defp blank(phase_num) do
    %{"phase" => phase_num, "name" => "Phase #{phase_num}", "hp_pct" => 50,
      "t_name" => "", "t_icon" => "", "t_sprite" => "", "t_max_hp" => "",
      "t_restore_pct" => "1.0", "t_animation" => "",
      "t_atk" => "", "t_def" => "", "t_mo" => "", "t_spd" => "", "t_lck" => "",
      "t_weaknesses" => "", "t_elements" => "",
      "t_clear_statuses" => false, "t_clear_cooldowns" => false,
      "apply_statuses" => "", "remove_statuses" => "",
      "dialogue" => "", "music" => ""}
  end

  defp phase_to_form(p) do
    on = p.on_enter || %{}
    t = on["transform"] || %{}
    stats = t["stat_overrides"] || %{}

    %{
      "phase" => p.phase,
      "name" => p.name,
      "hp_pct" => trunc(p.hp_threshold_pct * 100),
      "t_name" => t["name"] || "",
      "t_icon" => t["icon"] || "",
      "t_sprite" => t["sprite_url"] || "",
      "t_max_hp" => t["new_max_hp"] || "",
      "t_restore_pct" => t["restore_hp_pct"] || "1.0",
      "t_animation" => t["animation"] || "",
      "t_atk" => stats["atk"] || "", "t_def" => stats["def"] || "",
      "t_mo" => stats["mo"] || "", "t_spd" => stats["speed"] || "", "t_lck" => stats["luck"] || "",
      "t_weaknesses" => Enum.join(t["weaknesses"] || [], ", "),
      "t_elements" => Enum.join(t["weapon_elements"] || [], ", "),
      "t_clear_statuses" => t["clear_statuses"] == true,
      "t_clear_cooldowns" => t["clear_cooldowns"] == true,
      "apply_statuses" => Enum.join(on["apply_status"] || [], ", "),
      "remove_statuses" => Enum.join(on["remove_status"] || [], ", "),
      "dialogue" => on["dialogue"] || "",
      "music" => on["music"] || ""
    }
  end

  defp build_transform(p) do
    t = %{}
    t = put_nne(t, "name", p["t_name"])
    t = put_nne(t, "icon", p["t_icon"])
    t = put_nne(t, "sprite_url", p["t_sprite"])
    t = put_nne(t, "animation", p["t_animation"])
    t = if(p["t_max_hp"] not in ["", nil], do: Map.put(t, "new_max_hp", ti(p["t_max_hp"], nil)), else: t)
    t = if(p["t_restore_pct"] not in ["", nil], do: Map.put(t, "restore_hp_pct", tf(p["t_restore_pct"], 1.0)), else: t)

    stats = %{}
    stats = put_ti(stats, "atk", p["t_atk"])
    stats = put_ti(stats, "def", p["t_def"])
    stats = put_ti(stats, "mo", p["t_mo"])
    stats = put_ti(stats, "speed", p["t_spd"])
    stats = put_ti(stats, "luck", p["t_lck"])
    t = if stats != %{}, do: Map.put(t, "stat_overrides", stats), else: t

    t = put_csv(t, "weaknesses", p["t_weaknesses"])
    t = put_csv(t, "weapon_elements", p["t_elements"])
    t = if p["t_clear_statuses"] == "1", do: Map.put(t, "clear_statuses", true), else: t
    t = if p["t_clear_cooldowns"] == "1", do: Map.put(t, "clear_cooldowns", true), else: t
    t
  end

  defp put_nne(m, _k, nil), do: m
  defp put_nne(m, _k, ""), do: m
  defp put_nne(m, k, v), do: Map.put(m, k, v)

  defp nne(""), do: nil
  defp nne(nil), do: nil
  defp nne(v), do: v

  defp put_ti(m, _k, nil), do: m
  defp put_ti(m, _k, ""), do: m
  defp put_ti(m, k, v), do: Map.put(m, k, ti(v, nil))

  defp put_csv(m, _k, nil), do: m
  defp put_csv(m, _k, ""), do: m
  defp put_csv(m, k, v) do
    list = split_csv(v)
    if list == [], do: m, else: Map.put(m, k, list)
  end

  defp split_csv(nil), do: []
  defp split_csv(""), do: []
  defp split_csv(s), do: s |> String.split(",") |> Enum.map(&String.trim/1) |> Enum.reject(&(&1 == ""))

  defp ti(nil, d), do: d
  defp ti("", d), do: d
  defp ti(s, d) when is_binary(s), do: case(Integer.parse(s), do: ({i, _} -> i; _ -> d))
  defp ti(i, _) when is_integer(i), do: i
  defp ti(_, d), do: d

  defp tf(nil, d), do: d
  defp tf("", d), do: d
  defp tf(s, d) when is_binary(s), do: case(Float.parse(s), do: ({f, _} -> f; _ -> d))
  defp tf(f, _) when is_float(f), do: f
  defp tf(_, d), do: d

  defp list_boss_npcs do
    case Repo.query("SELECT id, name FROM game_npcs WHERE is_enemy = 1 ORDER BY name ASC LIMIT 200") do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [id, name] -> %{id: id, name: name || "NPC ##{id}"} end)
      _ -> []
    end
  rescue
    _ -> []
  end

  defp list_status_keys do
    TePhoenix.Battle.StatusRegistry.list_statuses() |> Enum.map(& &1.key) |> Enum.sort()
  rescue
    _ -> []
  end
end
