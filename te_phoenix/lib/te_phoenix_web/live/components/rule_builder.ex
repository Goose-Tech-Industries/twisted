defmodule TePhoenixWeb.Components.RuleBuilder do
  @moduledoc """
  Universal no-code rule builder LiveComponent.

  Replaces JSON textareas with dropdown-based "When X, If Y, Then Z"
  forms. A 12-year-old can build "when you get hit in the head, you
  get stunned" — zero typing, zero code knowledge.

  ## Usage in a LiveView:

      <.live_component
        module={TePhoenixWeb.Components.RuleBuilder}
        id="my_rule"
        field_name="effect_json"
        schema={:battle_rule_effect}
        value={@editing["effect_json"]}
      />

  ## Schemas

  Each schema defines what keys are available and their input types:
  - `:battle_rule_condition` — limb, element, crit, hp_threshold, has_status, etc.
  - `:battle_rule_effect` — apply_status, remove_status, damage, heal, knockout, etc.
  - `:objective_callback` — set_world_flag, broadcast, script_id, actions
  - `:surface_reaction` — element → result surface mappings
  - `:wave_spawn` — npc_template, count, zone_key, interval
  - `:match_win_condition` — type, objective_key, required_count
  - `:match_rewards` — xp_win, xp_loss, gold_win, gold_loss, rank
  - `:generic_json` — fallback freeform editor
  """

  use TePhoenixWeb, :live_component

  @condition_keys [
    %{key: "limb", label: "Limb is", type: :select, options: ["head", "torso", "left_arm", "right_arm", "left_leg", "right_leg"]},
    %{key: "element", label: "Element is", type: :select, options: ["fire", "ice", "water", "lightning", "poison", "dark", "holy", "wind", "earth"]},
    %{key: "crit", label: "Was critical hit", type: :bool},
    %{key: "nonlethal", label: "Is nonlethal", type: :bool},
    %{key: "has_status", label: "Target has status", type: :text, placeholder: "status key"},
    %{key: "hp_below_pct", label: "HP below %", type: :number, step: 0.05, min: 0, max: 1},
    %{key: "hp_above_pct", label: "HP above %", type: :number, step: 0.05, min: 0, max: 1},
    %{key: "team", label: "Team is", type: :number},
    %{key: "damage_type", label: "Damage type is", type: :select, options: ["physical", "magic", "fire", "ice", "lightning", "poison", "true"]},
    %{key: "is_ranged", label: "Is ranged attack", type: :bool}
  ]

  @effect_keys [
    %{key: "apply_status", label: "Apply status", type: :text, placeholder: "status key (e.g. burn, stun)"},
    %{key: "remove_status", label: "Remove status", type: :text, placeholder: "status key"},
    %{key: "to", label: "Target", type: :select, options: ["victim", "attacker", "self", "target"]},
    %{key: "damage_flat", label: "Deal flat damage", type: :number},
    %{key: "heal_pct_max", label: "Heal % of max HP", type: :number, step: 0.05, min: 0, max: 1},
    %{key: "knockout", label: "Knockout target", type: :bool},
    %{key: "queue_event", label: "Queue event", type: :text, placeholder: "event name"},
    %{key: "script_id", label: "Run visual script", type: :number},
    %{key: "increment_limit_gauge", label: "Fill limit gauge", type: :bool},
    %{key: "set_world_flag", label: "Set world flag", type: :text, placeholder: "flag name"},
    %{key: "value", label: "Flag value", type: :text, placeholder: "1 or toggle"}
  ]

  @callback_keys [
    %{key: "set_world_flag", label: "Set world flag", type: :text, placeholder: "flag name"},
    %{key: "value", label: "Flag value", type: :text, placeholder: "1 or toggle"},
    %{key: "broadcast", label: "Broadcast event", type: :text, placeholder: "event name"},
    %{key: "script_id", label: "Run visual script", type: :number},
    %{key: "heal_full", label: "Full heal", type: :bool}
  ]

  @win_condition_keys [
    %{key: "type", label: "Win type", type: :select, options: ["last_standing", "objective", "score", "timer", "wave_clear"]},
    %{key: "objective_key", label: "Objective key", type: :text, placeholder: "e.g. nexus"},
    %{key: "required_count", label: "Required count", type: :number},
    %{key: "wave_def_key", label: "Wave sequence key", type: :text, placeholder: "e.g. td_basic"}
  ]

  @reward_keys [
    %{key: "xp_win", label: "XP (winner)", type: :number},
    %{key: "xp_loss", label: "XP (loser)", type: :number},
    %{key: "gold_win", label: "Gold (winner)", type: :number},
    %{key: "gold_loss", label: "Gold (loser)", type: :number},
    %{key: "rank_win", label: "Rank points (win)", type: :number},
    %{key: "rank_loss", label: "Rank points (loss)", type: :number}
  ]

  @spawn_keys [
    %{key: "npc_template", label: "NPC template", type: :text, placeholder: "e.g. goblin"},
    %{key: "count", label: "Count", type: :number},
    %{key: "zone_key", label: "Spawn zone", type: :text, placeholder: "e.g. entrance"},
    %{key: "interval_ms", label: "Spawn interval (ms)", type: :number},
    %{key: "boss", label: "Is boss", type: :bool}
  ]

  @reaction_keys [
    %{key: "water", label: "Reacts with Water →", type: :text, placeholder: "result surface key"},
    %{key: "fire", label: "Reacts with Fire →", type: :text, placeholder: "result surface key"},
    %{key: "ice", label: "Reacts with Ice →", type: :text, placeholder: "result surface key"},
    %{key: "oil", label: "Reacts with Oil →", type: :text, placeholder: "result surface key"},
    %{key: "lightning", label: "Reacts with Lightning →", type: :text, placeholder: "result surface key"},
    %{key: "poison", label: "Reacts with Poison →", type: :text, placeholder: "result surface key"},
    %{key: "blessed", label: "Reacts with Blessed →", type: :text, placeholder: "result surface key"},
    %{key: "cursed", label: "Reacts with Cursed →", type: :text, placeholder: "result surface key"}
  ]

  @status_effect_keys [
    %{key: "atk_mult", label: "ATK multiplier", type: :number, step: 0.05},
    %{key: "def_mult", label: "DEF multiplier", type: :number, step: 0.05},
    %{key: "mo_mult", label: "Magic OFF multiplier", type: :number, step: 0.05},
    %{key: "md_mult", label: "Magic DEF multiplier", type: :number, step: 0.05},
    %{key: "speed_mult", label: "Speed multiplier", type: :number, step: 0.05},
    %{key: "cooldown_rate", label: "Cooldown tick rate", type: :number, step: 0.1},
    %{key: "damage_taken_mult", label: "Damage taken multiplier", type: :number, step: 0.1},
    %{key: "damage_dealt_mult", label: "Damage dealt multiplier", type: :number, step: 0.1},
    %{key: "dodge_ceiling", label: "Dodge cap", type: :number, step: 0.05, min: 0, max: 1},
    %{key: "dodge_floor", label: "Dodge floor", type: :number, step: 0.05, min: 0, max: 1},
    %{key: "miss_chance_bonus", label: "Miss chance bonus", type: :number, step: 0.05},
    %{key: "crit_mult_bonus", label: "Crit multiplier bonus", type: :number, step: 0.1},
    %{key: "prevent_action", label: "Prevent all actions", type: :bool},
    %{key: "prevent_magic", label: "Prevent magic", type: :bool},
    %{key: "prevent_move", label: "Prevent movement", type: :bool},
    %{key: "advantage", label: "Advantage (roll twice, take best)", type: :bool},
    %{key: "disadvantage", label: "Disadvantage (roll twice, take worst)", type: :bool},
    %{key: "drop_weapon", label: "Drop weapon", type: :bool},
    %{key: "confused", label: "Confused (may hit allies)", type: :bool},
    %{key: "berserk", label: "Berserk (auto-attack only)", type: :bool},
    %{key: "wake_on_damage", label: "Wake up when damaged", type: :bool}
  ]

  @tick_keys [
    %{key: "kind", label: "Tick type", type: :select, options: ["dot_pct_max", "dot_flat", "hot_pct_max", "mp_regen_flat", "custom"]},
    %{key: "amount", label: "Amount (% or flat)", type: :number, step: 0.01},
    %{key: "damage_type", label: "Damage type", type: :select, options: ["physical", "fire", "ice", "lightning", "poison", "dark", "holy"]},
    %{key: "script_id", label: "Custom script ID", type: :number}
  ]

  def schema_keys(:status_effects), do: @status_effect_keys
  def schema_keys(:status_tick), do: @tick_keys
  def schema_keys(:battle_rule_condition), do: @condition_keys
  def schema_keys(:battle_rule_effect), do: @effect_keys
  def schema_keys(:objective_callback), do: @callback_keys
  def schema_keys(:surface_reaction), do: @reaction_keys
  def schema_keys(:wave_spawn), do: @spawn_keys
  def schema_keys(:match_win_condition), do: @win_condition_keys
  def schema_keys(:match_rewards), do: @reward_keys
  def schema_keys(_), do: []

  @impl true
  def mount(socket) do
    {:ok, assign(socket, parsed: %{}, show_add: false)}
  end

  @impl true
  def update(assigns, socket) do
    parsed = parse_value(assigns[:value])
    schema = assigns[:schema] || :generic_json

    {:ok,
     socket
     |> assign(:id, assigns.id)
     |> assign(:field_name, assigns[:field_name] || "data")
     |> assign(:schema, schema)
     |> assign(:label, assigns[:label] || schema_label(schema))
     |> assign(:parsed, parsed)
     |> assign(:keys, schema_keys(schema))
     |> assign(:available_keys, available_keys(schema_keys(schema), parsed))
     |> assign(:show_add, false)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="border border-zinc-800 rounded p-3 bg-zinc-950/50">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-bold text-amber-400/70 uppercase tracking-wider"><%= @label %></span>
        <button type="button" phx-click="toggle_add" phx-target={@myself}
          class="text-xs text-amber-400 hover:text-amber-300">+ Add</button>
      </div>

      <%!-- Active rules as editable rows --%>
      <div class="space-y-2">
        <%= for {key, val} <- @parsed do %>
          <% field_def = Enum.find(@keys, &(&1.key == key)) %>
          <div class="flex items-center gap-2 bg-zinc-900/50 rounded px-2 py-1.5">
            <span class="text-xs text-zinc-400 w-36 shrink-0 font-medium">
              <%= if field_def, do: field_def.label, else: key %>
            </span>

            <%= if field_def do %>
              <%= case field_def.type do %>
                <% :select -> %>
                  <select name={"#{@field_name}[#{key}]"}
                    phx-change="update_field" phx-target={@myself} phx-value-key={key}
                    class="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs">
                    <%= for opt <- field_def.options do %>
                      <option value={opt} selected={to_string(val) == opt}><%= opt %></option>
                    <% end %>
                  </select>

                <% :bool -> %>
                  <label class="flex items-center gap-2">
                    <input type="checkbox" name={"#{@field_name}[#{key}]"} value="true"
                      checked={val == true or val == "true"}
                      phx-click="toggle_bool" phx-target={@myself} phx-value-key={key} />
                    <span class="text-xs text-zinc-300">Enabled</span>
                  </label>

                <% :number -> %>
                  <input type="number" name={"#{@field_name}[#{key}]"} value={val}
                    step={field_def[:step] || 1} min={field_def[:min]} max={field_def[:max]}
                    phx-blur="update_field" phx-target={@myself} phx-value-key={key}
                    class="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs w-24" />

                <% _ -> %>
                  <input type="text" name={"#{@field_name}[#{key}]"} value={val}
                    placeholder={field_def[:placeholder] || ""}
                    phx-blur="update_field" phx-target={@myself} phx-value-key={key}
                    class="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs" />
              <% end %>
            <% else %>
              <input type="text" name={"#{@field_name}[#{key}]"} value={val}
                class="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs" />
            <% end %>

            <button type="button" phx-click="remove_field" phx-target={@myself} phx-value-key={key}
              class="text-red-400 hover:text-red-300 text-xs px-1">✕</button>
          </div>
        <% end %>
      </div>

      <%!-- Add new field dropdown --%>
      <div :if={@show_add and @available_keys != []} class="mt-2 flex items-center gap-2">
        <select id={"#{@id}_add_select"} phx-change="add_field" phx-target={@myself} name="new_key"
          class="flex-1 bg-zinc-900 border border-amber-700 rounded px-2 py-1.5 text-xs">
          <option value="">Choose what to add...</option>
          <%= for fdef <- @available_keys do %>
            <option value={fdef.key}><%= fdef.label %></option>
          <% end %>
        </select>
      </div>

      <div :if={@parsed == %{}} class="text-xs text-zinc-600 italic mt-1">No rules set. Click + Add to configure.</div>

      <%!-- Hidden field with the serialized JSON for form submission --%>
      <input type="hidden" name={@field_name} value={Jason.encode!(@parsed)} />
    </div>
    """
  end

  @impl true
  def handle_event("toggle_add", _, socket) do
    {:noreply, assign(socket, :show_add, !socket.assigns.show_add)}
  end

  def handle_event("add_field", %{"new_key" => ""}, socket), do: {:noreply, socket}

  def handle_event("add_field", %{"new_key" => key}, socket) do
    fdef = Enum.find(socket.assigns.keys, &(&1.key == key))
    default = case fdef && fdef.type do
      :bool -> true
      :number -> 0
      :select -> List.first(fdef.options)
      _ -> ""
    end

    parsed = Map.put(socket.assigns.parsed, key, default)

    {:noreply,
     socket
     |> assign(:parsed, parsed)
     |> assign(:available_keys, available_keys(socket.assigns.keys, parsed))
     |> assign(:show_add, false)}
  end

  def handle_event("remove_field", %{"key" => key}, socket) do
    parsed = Map.delete(socket.assigns.parsed, key)

    {:noreply,
     socket
     |> assign(:parsed, parsed)
     |> assign(:available_keys, available_keys(socket.assigns.keys, parsed))}
  end

  def handle_event("toggle_bool", %{"key" => key}, socket) do
    current = Map.get(socket.assigns.parsed, key)
    new_val = !(current == true or current == "true")
    parsed = Map.put(socket.assigns.parsed, key, new_val)
    {:noreply, assign(socket, :parsed, parsed)}
  end

  def handle_event("update_field", %{"key" => key, "value" => val}, socket) do
    fdef = Enum.find(socket.assigns.keys, &(&1.key == key))
    coerced = coerce_value(val, fdef)
    parsed = Map.put(socket.assigns.parsed, key, coerced)
    {:noreply, assign(socket, :parsed, parsed)}
  end

  def handle_event("update_field", params, socket) do
    key = params["key"]
    val = params[key] || params["value"] || ""
    fdef = Enum.find(socket.assigns.keys, &(&1.key == key))
    coerced = coerce_value(val, fdef)
    parsed = Map.put(socket.assigns.parsed, key, coerced)
    {:noreply, assign(socket, :parsed, parsed)}
  end

  # ── Helpers ──

  defp parse_value(nil), do: %{}
  defp parse_value(""), do: %{}
  defp parse_value(%{} = m), do: m
  defp parse_value(s) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, %{} = m} -> m
      _ -> %{}
    end
  end
  defp parse_value(_), do: %{}

  defp available_keys(all_keys, parsed) do
    used = Map.keys(parsed) |> MapSet.new()
    Enum.reject(all_keys, &MapSet.member?(used, &1.key))
  end

  defp coerce_value(val, nil), do: val
  defp coerce_value(val, %{type: :number}) do
    case Float.parse(to_string(val)) do
      {f, _} -> if f == trunc(f), do: trunc(f), else: f
      _ -> 0
    end
  end
  defp coerce_value("true", %{type: :bool}), do: true
  defp coerce_value("false", %{type: :bool}), do: false
  defp coerce_value(val, _), do: val

  defp schema_label(:battle_rule_condition), do: "Conditions (IF)"
  defp schema_label(:battle_rule_effect), do: "Effects (THEN)"
  defp schema_label(:objective_callback), do: "Callback"
  defp schema_label(:surface_reaction), do: "Reacts With"
  defp schema_label(:wave_spawn), do: "Spawn Config"
  defp schema_label(:match_win_condition), do: "Win Condition"
  defp schema_label(:match_rewards), do: "Rewards"
  defp schema_label(_), do: "Configuration"
end
