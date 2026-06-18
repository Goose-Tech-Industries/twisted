defmodule TePhoenixWeb.Components.RuleTreeBuilder do
  @moduledoc """
  No-code structured editor for trigger-rule data. Two modes:

    * `kind: :condition_tree` — boolean tree of leaf conditions
      (AND/OR + add/remove rows). Outputs a single-leaf map when only
      one row exists (matches existing battle_rule shape) or
      `%{"all_of" => [...]}` / `%{"any_of" => [...]}` for multiple.

    * `kind: :action_list` — flat list of action rows, each picking an
      action key + filling its typed params. Merges into a single map
      on save (multiple action rows = multiple top-level keys in the
      result map). Matches the existing `effect_json` shape exactly.

  Backwards-compatible: parses existing JSON shapes on load, emits the
  same shape on save. Single-leaf conditions stay single-leaf; multi-key
  effects merge as expected.

  Usage from a LiveView:

      <.rule_builder
        kind={:condition_tree}
        schema={TePhoenix.Web.RuleSchemas.BattleRule.condition_schema()}
        field_name="condition_json"
        value={@editing["condition_json"]} />

      <.rule_builder
        kind={:action_list}
        schema={TePhoenix.Web.RuleSchemas.BattleRule.action_schema()}
        field_name="effect_json"
        value={@editing["effect_json"]} />

  The wrapping form submits a hidden `<input>` named `field_name` whose
  value is the canonical JSON. The LV's existing decode_map/Jason logic
  parses it on save — no changes to backend persistence.

  Each rule_builder instance dispatches `phx-click` events to the parent
  LV. For the parent to react it must implement `handle_event` clauses
  for: `rb:add`, `rb:remove`, `rb:set_op`, `rb:set_field`, `rb:set_value`,
  `rb:set_condition_kind`. The helper `handle_event/2` in this module
  encapsulates that logic — delegate from your LV.
  """

  use Phoenix.Component
  alias TePhoenixWeb.Components.RuleTreeBuilder.{ConditionNode, ActionNode}

  attr :kind, :atom, required: true, values: [:condition_tree, :action_list]
  attr :schema, :map, required: true,
       doc: "Per-domain schema map. See TePhoenixWeb.Components.RuleSchemas.*"
  attr :field_name, :string, required: true,
       doc: "Form input name. The hidden input carrying the canonical JSON."
  attr :value, :any, default: nil,
       doc: "Existing value: a JSON string, decoded map, or nil for blank."
  attr :id, :string, default: nil
  attr :label, :string, default: nil
  attr :class, :string, default: ""

  def rule_tree_builder(assigns) do
    assigns =
      assigns
      |> assign_new(:id, fn ->
        prefix = if assigns.kind == :condition_tree, do: "rb-cond", else: "rb-act"
        "#{prefix}-#{assigns.field_name}"
      end)
      |> assign(:tree, parse(assigns.value, assigns.kind))

    case assigns.kind do
      :condition_tree -> render_condition_tree(assigns)
      :action_list -> render_action_list(assigns)
    end
  end

  # ── condition tree ──────────────────────────────────────────────

  defp render_condition_tree(assigns) do
    ~H"""
    <div id={@id} class={["space-y-2 p-3 border border-zinc-800 rounded bg-zinc-900/40", @class]}>
      <div :if={@label} class="text-xs uppercase tracking-wider text-zinc-500 mb-1">{@label}</div>

      <div class="flex items-center gap-2 mb-2">
        <span class="text-xs text-zinc-400">Match</span>
        <select
          name={"#{@field_name}[op]"}
          phx-change="rb:set_condition_kind"
          phx-value-id={@id}
          class="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs">
          <option value="all_of" selected={@tree.op == "all_of"}>ALL of (AND)</option>
          <option value="any_of" selected={@tree.op == "any_of"}>ANY of (OR)</option>
        </select>
        <span class="text-xs text-zinc-500">these conditions:</span>
      </div>

      <div class="space-y-1.5">
        <ConditionNode.render
          :for={{leaf, idx} <- Enum.with_index(@tree.leaves)}
          id={@id}
          index={idx}
          leaf={leaf}
          schema={@schema} />
      </div>

      <div class="flex items-center gap-2 pt-2">
        <button
          type="button"
          phx-click="rb:add"
          phx-value-id={@id}
          phx-value-kind="condition"
          class="px-2 py-1 text-xs bg-emerald-700/40 hover:bg-emerald-600/50 border border-emerald-600/60 text-emerald-200 rounded">
          + Add condition
        </button>
        <span :if={Enum.empty?(@tree.leaves)} class="text-xs text-zinc-500 italic">
          No conditions — rule will always fire when triggered.
        </span>
      </div>

      <input type="hidden" name={@field_name} value={encode_conditions(@tree)} />
    </div>
    """
  end

  # ── action list ─────────────────────────────────────────────────

  defp render_action_list(assigns) do
    ~H"""
    <div id={@id} class={["space-y-2 p-3 border border-zinc-800 rounded bg-zinc-900/40", @class]}>
      <div :if={@label} class="text-xs uppercase tracking-wider text-zinc-500 mb-1">{@label}</div>

      <div class="space-y-1.5">
        <ActionNode.render
          :for={{action, idx} <- Enum.with_index(@tree.actions)}
          id={@id}
          index={idx}
          action={action}
          schema={@schema} />
      </div>

      <div class="flex items-center gap-2 pt-2">
        <button
          type="button"
          phx-click="rb:add"
          phx-value-id={@id}
          phx-value-kind="action"
          class="px-2 py-1 text-xs bg-amber-700/40 hover:bg-amber-600/50 border border-amber-600/60 text-amber-200 rounded">
          + Add action
        </button>
        <span :if={Enum.empty?(@tree.actions)} class="text-xs text-zinc-500 italic">
          No actions — rule will fire but do nothing.
        </span>
      </div>

      <input type="hidden" name={@field_name} value={encode_actions(@tree)} />
    </div>
    """
  end

  # ── parse / serialize ───────────────────────────────────────────

  @doc false
  def parse(nil, :condition_tree), do: %{op: "all_of", leaves: []}
  def parse(nil, :action_list), do: %{actions: []}
  def parse("", kind), do: parse(nil, kind)

  def parse(s, kind) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, decoded} -> parse(decoded, kind)
      _ -> parse(nil, kind)
    end
  end

  def parse(%{"all_of" => list}, :condition_tree) when is_list(list),
    do: %{op: "all_of", leaves: Enum.map(list, &normalize_leaf/1)}

  def parse(%{"any_of" => list}, :condition_tree) when is_list(list),
    do: %{op: "any_of", leaves: Enum.map(list, &normalize_leaf/1)}

  # Single-leaf shape (existing battle_rule data: %{"stat" => ..., "operator" => ..., "value" => ...})
  def parse(%{} = m, :condition_tree) when map_size(m) > 0,
    do: %{op: "all_of", leaves: [normalize_leaf(m)]}

  def parse(_, :condition_tree), do: %{op: "all_of", leaves: []}

  # Action list — existing data is a flat map: each top-level key is one action
  def parse(%{} = m, :action_list) when map_size(m) > 0 do
    actions =
      m
      |> Enum.map(fn {k, v} ->
        case v do
          %{} = params -> %{key: to_string(k), params: stringify_keys(params)}
          # Bare value (e.g. apply_status: "bleed") — wrap as single-param.
          val -> %{key: to_string(k), params: %{"value" => val}}
        end
      end)

    %{actions: actions}
  end

  def parse(_, :action_list), do: %{actions: []}

  defp normalize_leaf(%{} = m) do
    %{
      field: m["field"] || m["stat"] || m["combatant_count"] || "",
      operator: m["operator"] || "==",
      value: m["value"],
      extras: extras_from(m)
    }
  end

  defp normalize_leaf(_), do: %{field: "", operator: "==", value: nil, extras: %{}}

  defp extras_from(m) do
    m
    |> Map.drop(~w(field stat combatant_count operator value))
    |> stringify_keys()
  end

  defp stringify_keys(%{} = m) do
    Map.new(m, fn {k, v} -> {to_string(k), v} end)
  end

  defp stringify_keys(other), do: other

  @doc false
  def encode_conditions(%{op: _op, leaves: []}), do: "{}"

  def encode_conditions(%{op: _op, leaves: [leaf]}) do
    # Single leaf — preserve the existing flat shape.
    Jason.encode!(leaf_to_map(leaf))
  end

  def encode_conditions(%{op: op, leaves: leaves}) do
    Jason.encode!(%{op => Enum.map(leaves, &leaf_to_map/1)})
  end

  defp leaf_to_map(%{field: field, operator: operator, value: value, extras: extras}) do
    base = %{"field" => field, "operator" => operator, "value" => value}
    Map.merge(base, extras)
  end

  @doc false
  def encode_actions(%{actions: []}), do: "{}"

  def encode_actions(%{actions: actions}) do
    map =
      actions
      |> Enum.reduce(%{}, fn %{key: k, params: params}, acc ->
        # If params is just %{"value" => x}, store the bare value
        # (round-trips e.g. apply_status: "bleed_light").
        v =
          case params do
            %{"value" => bare} when map_size(params) == 1 -> bare
            other -> other
          end

        Map.put(acc, k, v)
      end)

    Jason.encode!(map)
  end

  # ── handle_event helper for parent LVs ──────────────────────────

  @doc """
  Drop-in handler for rb:* events. Parse-mutate-encode against the
  caller's `:editing` (or other) assign — each rule_builder instance
  carries its kind and field_name in its id (`rb-cond-...` /
  `rb-act-...`), so this dispatcher can recover both without further
  config.

  Delegate from your LV like so:

      def handle_event("rb:" <> _ = ev, params, socket),
        do: TePhoenixWeb.Components.RuleTreeBuilder.dispatch(ev, params, socket)

  Pass `:assign` (default `:editing`) to target a different parent map.
  """
  def dispatch(event, params, socket, opts \\ []) do
    assign_key = Keyword.get(opts, :assign, :editing)
    id = Map.get(params, "id", "")

    case decode_id(id) do
      {kind, field_name} ->
        editing = Map.get(socket.assigns, assign_key, %{})
        current_json = Map.get(editing, field_name, "")
        tree = parse(current_json, kind)
        new_tree = mutate(tree, event, params, kind)

        new_json =
          case kind do
            :condition_tree -> encode_conditions(new_tree)
            :action_list -> encode_actions(new_tree)
          end

        {:noreply,
         Phoenix.Component.assign(socket, assign_key, Map.put(editing, field_name, new_json))}

      :unknown ->
        {:noreply, socket}
    end
  end

  defp decode_id("rb-cond-" <> field), do: {:condition_tree, field}
  defp decode_id("rb-act-" <> field), do: {:action_list, field}
  defp decode_id(_), do: :unknown

  # ── tree mutators ───────────────────────────────────────────────

  defp mutate(tree, "rb:add", %{"kind" => "condition"}, :condition_tree) do
    blank = %{field: "", operator: "==", value: nil, extras: %{}}
    %{tree | leaves: tree.leaves ++ [blank]}
  end

  defp mutate(tree, "rb:add", %{"kind" => "action"}, :action_list) do
    blank = %{key: "", params: %{}}
    %{tree | actions: tree.actions ++ [blank]}
  end

  defp mutate(tree, "rb:remove", %{"kind" => "condition", "index" => idx_str}, :condition_tree) do
    idx = to_int(idx_str)
    %{tree | leaves: List.delete_at(tree.leaves, idx)}
  end

  defp mutate(tree, "rb:remove", %{"kind" => "action", "index" => idx_str}, :action_list) do
    idx = to_int(idx_str)
    %{tree | actions: List.delete_at(tree.actions, idx)}
  end

  defp mutate(tree, "rb:set_condition_kind", %{"value" => op}, :condition_tree)
       when op in ["all_of", "any_of"] do
    %{tree | op: op}
  end

  # Field selector change for a condition leaf.
  defp mutate(tree, "rb:set_field", %{"index" => idx_str, "value" => new_field} = params, :condition_tree) do
    if Map.get(params, "kind") in [nil, "condition"] do
      idx = to_int(idx_str)
      leaves = List.update_at(tree.leaves, idx, &%{&1 | field: new_field, value: nil})
      %{tree | leaves: leaves}
    else
      tree
    end
  end

  # Action key change for an action row.
  defp mutate(tree, "rb:set_field", %{"kind" => "action", "index" => idx_str, "value" => new_key}, :action_list) do
    idx = to_int(idx_str)
    actions = List.update_at(tree.actions, idx, &%{&1 | key: new_key, params: %{}})
    %{tree | actions: actions}
  end

  defp mutate(tree, "rb:set_op", %{"index" => idx_str, "value" => op}, :condition_tree) do
    idx = to_int(idx_str)
    leaves = List.update_at(tree.leaves, idx, &%{&1 | operator: op})
    %{tree | leaves: leaves}
  end

  defp mutate(tree, _ev, _params, _kind), do: tree

  defp to_int(n) when is_integer(n), do: n
  defp to_int(s) when is_binary(s) do
    case Integer.parse(s) do
      {i, _} -> i
      _ -> 0
    end
  end
  defp to_int(_), do: 0
end
