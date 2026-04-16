defmodule TePhoenix.Game.ScriptInterpreter do
  @moduledoc """
  Runtime interpreter for visual scripting graphs.

  A graph is a `%{nodes: [...], connections: [...]}` map. Every interpreter
  run walks the graph from a `start` node (or, if multiple, every start
  node sequentially) and follows flow connections, applying each node's
  effect via the supplied `effects` callback.

  ## Why the effects callback?

  Decoupling. The interpreter is pure logic — it doesn't know how to talk
  to the inventory, world flag store, or battle system. The caller passes
  in an `effects` function `fn(node, ctx) -> {:ok, ctx} | {:error, reason}`
  that knows how to route side-effects to the live engine. In production,
  the `Game.GameDirector` will provide this. In tests, a stub callback
  collects every call into a trace list.

  This also means the interpreter is trivially testable and supports
  dry-runs in the editor — pass an `effects` that records but doesn't
  mutate, render the trace as a timeline, done.

  ## Trace format

  Every executed node appears in the trace as
  `%{node_id, type, ts_ms, ctx_diff}` so the editor can show a step-by-step
  replay. The trace is capped at `max_steps` (default 1_000) to prevent
  infinite loops from runaway graphs.
  """

  alias TePhoenix.Game.ScriptNodes

  @typedoc "Node effect callback."
  @type effects_fn :: (map(), map() -> {:ok, map()} | {:error, term()})

  @doc """
  Run a graph. Returns `{:ok, %{ctx, trace}}` on success or
  `{:error, reason, %{trace, ctx}}` on a failure inside an effect.

  Options:
    * `:effects` — required; the side-effect callback
    * `:max_steps` — default 1_000; safety cap on visited nodes
    * `:ctx` — initial context map (defaults to `%{}`)
  """
  @spec run(map(), keyword()) ::
          {:ok, %{ctx: map(), trace: list()}}
          | {:error, term(), %{ctx: map(), trace: list()}}
  def run(graph, opts \\ []) do
    effects = Keyword.fetch!(opts, :effects)
    max_steps = Keyword.get(opts, :max_steps, 1_000)
    ctx = Keyword.get(opts, :ctx, %{})

    nodes = (graph["nodes"] || graph[:nodes] || []) |> Enum.map(&normalize_node/1)
    conns = (graph["connections"] || graph[:connections] || []) |> Enum.map(&normalize_conn/1)

    nodes_by_id = Map.new(nodes, fn n -> {n.id, n} end)
    conns_by_source = Enum.group_by(conns, fn c -> {c.from_node, c.from_port} end)

    starts = Enum.filter(nodes, &(&1.type == "start"))

    if starts == [] do
      {:error, :no_start_node, %{ctx: ctx, trace: []}}
    else
      Enum.reduce_while(starts, {:ok, %{ctx: ctx, trace: []}}, fn start, {:ok, acc} ->
        case walk(start, nodes_by_id, conns_by_source, effects, acc.ctx, acc.trace, max_steps, MapSet.new()) do
          {:ok, new_ctx, new_trace} -> {:cont, {:ok, %{ctx: new_ctx, trace: new_trace}}}
          {:error, reason, ctx, trace} -> {:halt, {:error, reason, %{ctx: ctx, trace: trace}}}
        end
      end)
    end
  end

  # ── Walker ───────────────────────────────────────────────────

  defp walk(_node, _nodes, _conns, _eff, ctx, trace, 0, _visited),
    do: {:error, :max_steps_exceeded, ctx, trace}

  defp walk(node, nodes, conns, eff, ctx, trace, steps, visited) do
    if MapSet.member?(visited, node.id) do
      # Cycle — record but don't loop forever
      {:ok, ctx, trace ++ [%{node_id: node.id, type: node.type, note: "cycle_skip"}]}
    else
      case eff.(node, ctx) do
        {:ok, new_ctx, branch} when is_binary(branch) ->
          step = %{node_id: node.id, type: node.type, branch: branch, ts_ms: System.system_time(:millisecond)}
          next = next_node(node, branch, conns, nodes)
          continue(next, nodes, conns, eff, new_ctx, trace ++ [step], steps - 1, MapSet.put(visited, node.id))

        {:ok, new_ctx} ->
          step = %{node_id: node.id, type: node.type, branch: default_out(node), ts_ms: System.system_time(:millisecond)}
          next = next_node(node, default_out(node), conns, nodes)
          continue(next, nodes, conns, eff, new_ctx, trace ++ [step], steps - 1, MapSet.put(visited, node.id))

        {:error, reason} ->
          {:error, reason, ctx, trace ++ [%{node_id: node.id, type: node.type, error: reason}]}
      end
    end
  end

  defp continue(nil, _nodes, _conns, _eff, ctx, trace, _steps, _visited), do: {:ok, ctx, trace}

  defp continue(next, nodes, conns, eff, ctx, trace, steps, visited),
    do: walk(next, nodes, conns, eff, ctx, trace, steps, visited)

  defp next_node(node, port_key, conns_by_source, nodes_by_id) do
    case Map.get(conns_by_source, {node.id, port_key}) do
      [c | _] -> Map.get(nodes_by_id, c.to_node)
      _ -> nil
    end
  end

  defp default_out(%{type: type}) do
    case ScriptNodes.get(type) do
      %{outputs: [%{key: k} | _]} -> k
      _ -> "out"
    end
  end

  # ── Normalisers ──────────────────────────────────────────────

  defp normalize_node(%{} = n) do
    %{
      id: n["id"] || n[:id],
      type: n["type"] || n[:type],
      x: n["x"] || n[:x] || 0,
      y: n["y"] || n[:y] || 0,
      props: n["props"] || n[:props] || %{}
    }
  end

  defp normalize_conn(%{} = c) do
    %{
      from_node: c["from_node"] || c[:from_node],
      from_port: c["from_port"] || c[:from_port] || "out",
      to_node: c["to_node"] || c[:to_node],
      to_port: c["to_port"] || c[:to_port] || "in"
    }
  end

  # ── Default tracing effect for dry-runs ─────────────────────

  @doc """
  A safe effect callback for editor dry-runs. Records the node into the
  context's `:trace` and never mutates engine state. Branches on `:choice`
  always pick `"a"`; conditionals always pick `"true"` for predictability.
  """
  @spec dry_run_effect(map(), map()) :: {:ok, map(), String.t()} | {:ok, map()}
  def dry_run_effect(node, ctx) do
    case node.type do
      "choice" -> {:ok, ctx, "a"}
      "conditional" -> {:ok, ctx, "true"}
      _ -> {:ok, ctx}
    end
  end

  @doc """
  Multi-branch dry run. Walks every possible execution path from each
  start node, exploring every output of every choice/conditional in turn.
  Returns a tree-shaped trace where each branching node carries the trace
  for each branch in `:branches`.

  Use this for the editor's "Run" button when you want to verify every
  possible path is wired correctly without actually executing effects.

  Cycles are still detected per-path so a graph with a self-referencing
  loop won't explode the trace.
  """
  @spec dry_run_all(map(), keyword()) :: %{trees: list(), truncated: boolean(), nodes_visited: non_neg_integer()}
  def dry_run_all(graph, opts \\ []) do
    max_depth = Keyword.get(opts, :max_depth, 256)
    # Total node-visit budget across ALL branches. Prevents 3^N explosion
    # on graphs with deep chains of choice/conditional nodes. Default is
    # 5_000 visits which is enough to explore any realistic quest graph
    # but bounds runtime to low-ms even for pathological inputs.
    max_visits = Keyword.get(opts, :max_visits, 5_000)

    nodes = (graph["nodes"] || graph[:nodes] || []) |> Enum.map(&normalize_node/1)
    conns = (graph["connections"] || graph[:connections] || []) |> Enum.map(&normalize_conn/1)
    nodes_by_id = Map.new(nodes, fn n -> {n.id, n} end)
    conns_by_source = Enum.group_by(conns, fn c -> {c.from_node, c.from_port} end)
    starts = Enum.filter(nodes, &(&1.type == "start"))

    # The budget is a shared counter across the recursive explore calls.
    # We thread it through as a tuple {trees_acc, remaining_budget} so a
    # single deep chain can't starve later sibling branches of visits.
    {trees, final_budget} =
      Enum.reduce(starts, {[], max_visits}, fn start, {acc, budget} ->
        {tree, new_budget} = explore(start, nodes_by_id, conns_by_source, MapSet.new(), max_depth, budget)
        {[tree | acc], new_budget}
      end)

    %{
      trees: Enum.reverse(trees),
      truncated: final_budget <= 0,
      nodes_visited: max_visits - max(final_budget, 0)
    }
  end

  defp explore(_node, _nodes, _conns, _visited, 0, budget),
    do: {%{type: "...", note: "depth_limit"}, budget}

  defp explore(_node, _nodes, _conns, _visited, _depth, 0),
    do: {%{type: "...", note: "visit_budget_exhausted"}, 0}

  defp explore(node, nodes, conns, visited, depth, budget) do
    if MapSet.member?(visited, node.id) do
      {%{node_id: node.id, type: node.type, note: "cycle_skip"}, budget - 1}
    else
      visited = MapSet.put(visited, node.id)
      budget = budget - 1

      ports =
        case node.type do
          "choice" -> ["a", "b", "c"]
          "conditional" -> ["true", "false"]
          _ -> [default_out(node)]
        end

      {branches, budget_after} =
        Enum.reduce(ports, {[], budget}, fn port, {acc, b} ->
          if b <= 0 do
            {[{port, %{type: "...", note: "visit_budget_exhausted"}} | acc], 0}
          else
            child = next_via(node, port, conns, nodes)

            {sub, new_b} =
              if child do
                explore(child, nodes, conns, visited, depth - 1, b)
              else
                {nil, b}
              end

            {[{port, sub} | acc], new_b}
          end
        end)

      {%{node_id: node.id, type: node.type, branches: Enum.reverse(branches)}, budget_after}
    end
  end

  defp next_via(node, port, conns_by_source, nodes_by_id) do
    case Map.get(conns_by_source, {node.id, port}) do
      [c | _] -> Map.get(nodes_by_id, c.to_node)
      _ -> nil
    end
  end

  @doc """
  Validate a graph for editor-time correctness.

  Checks:

    * **No start node** — every executable graph needs at least one start
    * **Multiple starts** (warning, not error)
    * **Dangling required inputs** — any non-start node with no incoming
      flow connection on its `in` port is unreachable
    * **Connection to unknown node** — connection references a node id
      that no longer exists
    * **Connection to unknown port** — port key not in the node type's
      declared port list
    * **Type-mismatched ports** — flow port connected to value port (the
      port system supports both kinds)
    * **Unreachable nodes** — exists in the graph but no path from any
      start

  Returns `[%{level: :error | :warning, node_id: id|nil, message: string}]`.
  Empty list means the graph is valid.
  """
  @spec validate(map()) :: [%{level: atom(), node_id: any(), message: String.t()}]
  def validate(graph) do
    nodes = (graph["nodes"] || graph[:nodes] || []) |> Enum.map(&normalize_node/1)
    conns = (graph["connections"] || graph[:connections] || []) |> Enum.map(&normalize_conn/1)
    nodes_by_id = Map.new(nodes, fn n -> {n.id, n} end)

    issues = []

    issues = issues ++ validate_starts(nodes)
    issues = issues ++ validate_connections(conns, nodes_by_id)
    issues = issues ++ validate_dangling_inputs(nodes, conns)
    issues = issues ++ validate_reachability(nodes, conns)

    issues
  end

  defp validate_starts(nodes) do
    starts = Enum.filter(nodes, &(&1.type == "start"))

    cond do
      starts == [] ->
        [%{level: :error, node_id: nil, message: "Graph has no Start node — nothing will execute"}]

      length(starts) > 1 ->
        [%{level: :warning, node_id: nil, message: "Graph has #{length(starts)} Start nodes — each will run independently"}]

      true ->
        []
    end
  end

  defp validate_connections(conns, nodes_by_id) do
    # Build a per-type port-signature cache once so we don't call
    # ScriptNodes.get/1 (O(n) list scan) once per connection. For a
    # typical quest graph with 50 nodes and 40 connections this takes
    # type-lookups from 80 list scans to ~12 map puts.
    type_cache =
      for {_id, node} <- nodes_by_id, into: %{} do
        nt = TePhoenix.Game.ScriptNodes.get(node.type)

        sig =
          if nt do
            %{
              outputs: Map.new(nt.outputs, fn p -> {p.key, p.kind} end),
              inputs: Map.new(nt.inputs, fn p -> {p.key, p.kind} end)
            }
          else
            nil
          end

        {node.type, sig}
      end

    Enum.flat_map(conns, fn c ->
      from = nodes_by_id[c.from_node]
      to = nodes_by_id[c.to_node]

      cond do
        is_nil(from) ->
          [%{level: :error, node_id: c.from_node, message: "Connection from missing node #{c.from_node}"}]

        is_nil(to) ->
          [%{level: :error, node_id: c.to_node, message: "Connection to missing node #{c.to_node}"}]

        true ->
          from_sig = Map.get(type_cache, from.type)
          to_sig = Map.get(type_cache, to.type)
          from_port_kind = from_sig && Map.get(from_sig.outputs, c.from_port)
          to_port_kind = to_sig && Map.get(to_sig.inputs, c.to_port)
          # Wrap in port-like maps so the existing cond branches still work
          from_port = from_port_kind && %{key: c.from_port, kind: from_port_kind}
          to_port = to_port_kind && %{key: c.to_port, kind: to_port_kind}

          cond do
            is_nil(from_port) ->
              [%{level: :error, node_id: from.id, message: "Output port '#{c.from_port}' does not exist on #{from.type}"}]

            is_nil(to_port) ->
              [%{level: :error, node_id: to.id, message: "Input port '#{c.to_port}' does not exist on #{to.type}"}]

            from_port.kind != to_port.kind ->
              [%{level: :error, node_id: from.id, message: "Port kind mismatch: #{from.type}.#{c.from_port} (#{from_port.kind}) → #{to.type}.#{c.to_port} (#{to_port.kind})"}]

            true ->
              []
          end
      end
    end)
  end

  defp validate_dangling_inputs(nodes, conns) do
    incoming =
      Enum.reduce(conns, MapSet.new(), fn c, acc -> MapSet.put(acc, c.to_node) end)

    Enum.flat_map(nodes, fn n ->
      cond do
        n.type == "start" ->
          []

        not MapSet.member?(incoming, n.id) ->
          [%{level: :warning, node_id: n.id, message: "Node #{n.type} (#{n.id}) has no incoming connection — unreachable"}]

        true ->
          []
      end
    end)
  end

  defp validate_reachability(nodes, conns) do
    starts = Enum.filter(nodes, &(&1.type == "start")) |> Enum.map(& &1.id)

    if starts == [] do
      []
    else
      adjacency = Enum.group_by(conns, & &1.from_node, & &1.to_node)
      reachable = bfs_reach(starts, adjacency, MapSet.new())
      all_ids = MapSet.new(Enum.map(nodes, & &1.id))
      unreached = MapSet.difference(all_ids, reachable)

      Enum.map(unreached, fn id ->
        %{level: :warning, node_id: id, message: "Node #{id} is not reachable from any Start"}
      end)
    end
  end

  defp bfs_reach([], _adj, acc), do: acc

  defp bfs_reach([id | rest], adj, acc) do
    if MapSet.member?(acc, id) do
      bfs_reach(rest, adj, acc)
    else
      acc = MapSet.put(acc, id)
      next = Map.get(adj, id, [])
      bfs_reach(rest ++ next, adj, acc)
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # BATTLE BRIDGE
  # ══════════════════════════════════════════════════════════════════
  #
  # `run_for_status/4` and `run_for_trigger/4` are the power-code entry
  # points from the data-driven status/trigger system. A status def can
  # attach a graph id to its `on_apply`, `on_tick`, or `on_expire` phase;
  # a rule can dispatch its `effect` to a graph id. Both funnel through
  # here.
  #
  # The graph executes with a battle-aware context:
  #
  #     %{
  #       "phase"     => "on_apply" | "on_tick" | "on_expire" | "trigger",
  #       "combatant" => %{...},  # serialized combatant fields
  #       "trigger"   => %{...},  # optional trigger ctx (limb/element/crit/...)
  #       "hp"        => 42,
  #       "hp_pct"    => 0.42,
  #       ...
  #     }
  #
  # Battle nodes (`apply_status`, `remove_status`, `damage_target`,
  # `heal_target`, `has_status`, `read_stat`) read from this context and
  # mutate the passed-in battle state via the effect callback.

  alias TePhoenix.Battle.{StatusEffects, Combatant}

  @doc """
  Run a script graph attached to a status-effect phase. Returns
  `{combatant, result}` with any mutations applied. Called from
  `StatusEffects.maybe_run_script/4`.
  """
  def run_for_status(script_id, combatant, phase, result) do
    case load_graph(script_id) do
      nil ->
        {combatant, result}

      graph ->
        Process.put(:battle_script_combatant, combatant)
        Process.put(:battle_script_result, result)
        Process.put(:battle_script_mode, :status)

        ctx = build_status_ctx(combatant, phase)
        _ = run(graph, effects: &battle_node_effect/2, ctx: ctx)

        final_combatant = Process.get(:battle_script_combatant, combatant)
        final_result = Process.get(:battle_script_result, result)

        Process.delete(:battle_script_combatant)
        Process.delete(:battle_script_result)
        Process.delete(:battle_script_mode)

        {final_combatant, final_result}
    end
  rescue
    _ -> {combatant, result}
  end

  @doc """
  Run a script graph attached to a trigger rule effect. Returns
  `{state, result}` with any mutations applied. Called from
  `Triggers.run_script_effect/3`.
  """
  def run_for_trigger(script_id, state, trig_ctx, result) do
    case load_graph(script_id) do
      nil ->
        {state, result}

      graph ->
        Process.put(:battle_script_state, state)
        Process.put(:battle_script_result, result)
        Process.put(:battle_script_trig_ctx, trig_ctx)
        Process.put(:battle_script_mode, :trigger)

        ctx = build_trigger_ctx(trig_ctx)
        _ = run(graph, effects: &battle_node_effect/2, ctx: ctx)

        final_state = Process.get(:battle_script_state, state)
        final_result = Process.get(:battle_script_result, result)

        Process.delete(:battle_script_state)
        Process.delete(:battle_script_result)
        Process.delete(:battle_script_trig_ctx)
        Process.delete(:battle_script_mode)

        {final_state, final_result}
    end
  rescue
    _ -> {state, result}
  end

  # ── Graph loader ─────────────────────────────────────────────

  defp load_graph(id) when is_integer(id) do
    case TePhoenix.Repo.query("SELECT graph_json FROM game_visual_scripts WHERE id = ?", [id]) do
      {:ok, %{rows: [[json]]}} when is_binary(json) ->
        case Jason.decode(json) do
          {:ok, g} -> g
          _ -> nil
        end

      _ ->
        nil
    end
  rescue
    _ -> nil
  end

  defp load_graph(_), do: nil

  # ── Context builders ─────────────────────────────────────────

  defp build_status_ctx(%Combatant{} = c, phase) do
    %{
      "phase" => to_string(phase),
      "combatant" => serialize_combatant(c),
      "hp" => c.current_hp,
      "max_hp" => c.max_hp,
      "hp_pct" => if(c.max_hp > 0, do: c.current_hp / c.max_hp, else: 0.0),
      "mp" => c.current_mp,
      "max_mp" => c.max_mp,
      "mp_pct" => if(c.max_mp > 0, do: c.current_mp / c.max_mp, else: 0.0)
    }
  end

  defp build_status_ctx(c, phase) when is_map(c) do
    %{"phase" => to_string(phase), "combatant" => c, "hp" => c[:current_hp] || 0, "max_hp" => c[:max_hp] || 1}
  end

  defp build_trigger_ctx(trig_ctx) do
    %{
      "phase" => "trigger",
      "attacker" => trig_ctx[:attacker] && serialize_combatant(trig_ctx[:attacker]),
      "victim" => trig_ctx[:victim] && serialize_combatant(trig_ctx[:victim]),
      "limb" => trig_ctx[:limb],
      "element" => trig_ctx[:element],
      "damage" => trig_ctx[:damage],
      "crit" => !!trig_ctx[:crit],
      "nonlethal" => !!trig_ctx[:nonlethal]
    }
  end

  defp serialize_combatant(%Combatant{} = c) do
    %{
      "char_id" => c.char_id,
      "name" => c.name,
      "hp" => c.current_hp,
      "max_hp" => c.max_hp,
      "mp" => c.current_mp,
      "max_mp" => c.max_mp,
      "atk" => c.atk,
      "def" => c.def,
      "speed" => c.speed,
      "level" => c.level,
      "team_id" => c.team_id
    }
  end

  defp serialize_combatant(other), do: other

  # ── Battle node effect handler ───────────────────────────────

  defp battle_node_effect(node, ctx) do
    case node.type do
      "start" ->
        {:ok, ctx}

      "apply_status" ->
        key = node.props["status_key"] || "bleed_light"
        dur = (node.props["duration"] || 0) |> as_int()
        target = node.props["target"] || "self"

        mutate_actor(target, fn actor, result ->
          opts = if dur > 0, do: [duration: dur], else: []
          StatusEffects.apply_status(actor, key, result, opts)
        end)

        {:ok, ctx}

      "remove_status" ->
        key = node.props["status_key"] || ""
        target = node.props["target"] || "self"

        mutate_actor(target, fn actor, result ->
          {StatusEffects.remove(actor, key), result}
        end)

        {:ok, ctx}

      "has_status" ->
        key = node.props["status_key"] || ""
        target = node.props["target"] || "self"
        actor = lookup_actor(target)
        branch = if actor && StatusEffects.has?(actor, key), do: "true", else: "false"
        {:ok, ctx, branch}

      "damage_target" ->
        amt = (node.props["amount"] || 0) |> as_int()
        pct = (node.props["pct"] || 0.0) |> as_float()
        target = node.props["target"] || "victim"

        mutate_actor(target, fn actor, result ->
          dmg = if pct > 0, do: trunc(actor.max_hp * pct), else: amt
          dmg = max(1, dmg)
          updated = Combatant.apply_damage(actor, dmg)
          r = %{result |
            log: ["💢 #{actor.name} takes #{dmg} script damage." | result.log],
            actions: [%{type: :script_damage, target: actor.name, amount: dmg} | result.actions]
          }
          {updated, r}
        end)

        {:ok, ctx}

      "heal_target" ->
        amt = (node.props["amount"] || 0) |> as_int()
        pct = (node.props["pct"] || 0.0) |> as_float()
        target = node.props["target"] || "self"

        mutate_actor(target, fn actor, result ->
          heal = if pct > 0, do: trunc(actor.max_hp * pct), else: amt
          heal = max(1, heal)
          updated = Combatant.apply_healing(actor, heal)
          r = %{result |
            log: ["💚 #{actor.name} heals #{heal} HP." | result.log],
            actions: [%{type: :script_heal, target: actor.name, amount: heal} | result.actions]
          }
          {updated, r}
        end)

        {:ok, ctx}

      "read_stat" ->
        stat = node.props["stat"] || "hp_pct"
        op = node.props["op"] || "lt"
        value = (node.props["value"] || 0) |> as_float()
        target = node.props["target"] || "self"
        actor = lookup_actor(target)
        observed = stat_value(actor, stat)

        passes =
          case op do
            "lt" -> observed < value
            "lte" -> observed <= value
            "gt" -> observed > value
            "gte" -> observed >= value
            "eq" -> observed == value
            _ -> false
          end

        {:ok, ctx, if(passes, do: "true", else: "false")}

      "conditional" -> {:ok, ctx, "true"}
      "choice" -> {:ok, ctx, "a"}

      _ -> {:ok, ctx}
    end
  end

  # Mutation plumbing via the process dictionary. We avoid threading
  # state through every node callback by stashing it in Process for
  # the duration of a single run_for_status/run_for_trigger call.
  # This is safe because the interpreter runs synchronously on the
  # caller's BEAM process.

  defp mutate_actor(target, fun) do
    case Process.get(:battle_script_mode) do
      :status ->
        c = Process.get(:battle_script_combatant)
        r = Process.get(:battle_script_result)

        if c do
          {updated, new_r} = fun.(c, r)
          Process.put(:battle_script_combatant, updated)
          Process.put(:battle_script_result, new_r)
        end

      :trigger ->
        state = Process.get(:battle_script_state)
        r = Process.get(:battle_script_result)
        trig_ctx = Process.get(:battle_script_trig_ctx) || %{}

        actor = resolve_trig_actor(state, trig_ctx, target)

        if actor do
          {updated, new_r} = fun.(actor, r)
          state = put_in(state.combatants[updated.char_id], updated)
          Process.put(:battle_script_state, state)
          Process.put(:battle_script_result, new_r)
        end

      _ ->
        :ok
    end
  end

  defp lookup_actor(target) do
    case Process.get(:battle_script_mode) do
      :status ->
        Process.get(:battle_script_combatant)

      :trigger ->
        state = Process.get(:battle_script_state)
        trig_ctx = Process.get(:battle_script_trig_ctx) || %{}
        resolve_trig_actor(state, trig_ctx, target)

      _ ->
        nil
    end
  end

  defp resolve_trig_actor(_state, ctx, "self"), do: ctx[:victim] || ctx[:attacker]
  defp resolve_trig_actor(_state, ctx, "victim"), do: ctx[:victim]
  defp resolve_trig_actor(_state, ctx, "attacker"), do: ctx[:attacker]
  defp resolve_trig_actor(_state, ctx, "target"), do: ctx[:victim] || ctx[:target]
  defp resolve_trig_actor(_state, _ctx, _), do: nil

  defp stat_value(nil, _stat), do: 0.0

  defp stat_value(%Combatant{} = c, stat) do
    case stat do
      "hp_pct" -> if c.max_hp > 0, do: c.current_hp / c.max_hp, else: 0.0
      "mp_pct" -> if c.max_mp > 0, do: c.current_mp / c.max_mp, else: 0.0
      "atk" -> c.atk || 0
      "def" -> c.def || 0
      "speed" -> c.speed || 0
      "level" -> c.level || 0
      _ -> 0.0
    end
  end

  defp stat_value(_, _), do: 0.0

  defp as_int(v) when is_integer(v), do: v
  defp as_int(v) when is_float(v), do: trunc(v)
  defp as_int(v) when is_binary(v), do: case(Integer.parse(v), do: ({i, _} -> i; _ -> 0))
  defp as_int(_), do: 0

  defp as_float(v) when is_float(v), do: v
  defp as_float(v) when is_integer(v), do: v * 1.0
  defp as_float(v) when is_binary(v), do: case(Float.parse(v), do: ({f, _} -> f; _ -> 0.0))
  defp as_float(_), do: 0.0
end
