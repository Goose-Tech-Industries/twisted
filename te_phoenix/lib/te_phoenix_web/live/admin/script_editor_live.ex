defmodule TePhoenixWeb.Admin.ScriptEditorLive do
  @moduledoc """
  Visual scripting graph editor — `/sauce/scripts/:id/edit`.

  ## Layout

    * **Left**: node catalog grouped by `flow / rewards / world / npc / game`.
      Click a node type to add it to the centre canvas at a free spot.
    * **Centre**: the graph canvas. Nodes are absolutely-positioned DOM
      elements. Connections are SVG bezier paths drawn in a sibling layer.
      The `ScriptCanvas` JS hook handles pointer dragging on node headers
      (pushes `node:move` events, throttled) and click-to-connect on ports.
    * **Right**: properties panel for the selected node, schema-driven from
      `ScriptNodes.get(type).props`.
    * **Top toolbar**: Save · Run (dry-run via `ScriptInterpreter` with the
      built-in tracing effect, results shown in a modal) · Undo · Delete
      Selected · Rename.

  ## Source of truth

  The graph lives server-side in the LiveView assigns. Every mutation
  (add/move/delete node, add/delete connection, edit prop) goes through a
  `commit/2` helper that persists to `game_visual_scripts.graph_json` and pushes
  `graph:state` to the client so the canvas re-lays the SVG paths.

  This means undo just snapshots the previous graph onto a stack — no diff
  algebra needed.
  """
  use TePhoenixWeb, :live_view

  alias TePhoenix.{ClipboardServer, Repo}
  alias TePhoenix.Game.{ScriptNodes, ScriptInterpreter}

  @clipboard_kind :script_nodes
  @draft_table "game_visual_script_drafts"

  @impl true
  def mount(%{"id" => id_str}, _session, socket) do
    ensure_draft_table()

    case load_script(id_str) do
      {:ok, script} ->
        # Restore the draft graph + undo stack if one exists. Draft wins
        # over the persisted main graph because it represents work in
        # progress the user hadn't explicitly saved.
        {draft_graph, draft_undo} = load_draft(script.id, script.graph)

        {:ok,
         socket
         |> assign(:active_tab, :gameplay)
         |> assign(:page_title, "Script: #{script.name}")
         |> assign(:script, script)
         |> assign(:graph, draft_graph)
         |> assign(:undo_stack, draft_undo)
         |> assign(:selected_node_id, nil)
         |> assign(:pending_connect, nil)
         |> assign(:run_modal, nil)
         |> assign(:last_prop_edit_node, nil)
         |> assign(:validation, ScriptInterpreter.validate(draft_graph))
         |> assign(:current_user_id, socket.assigns[:current_user_id] || socket.assigns[:user_id] || 0)
         |> push_initial()}

      _ ->
        {:ok,
         socket
         |> put_flash(:error, "Script not found")
         |> push_navigate(to: ~p"/sauce/scripts")}
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="flex h-full">
      <!-- Left: node catalog -->
      <aside class="w-56 bg-zinc-900/80 border-r border-zinc-800 flex flex-col shrink-0 overflow-y-auto">
        <div class="px-3 py-3 border-b border-zinc-800">
          <a href={~p"/sauce/scripts"} class="text-[10px] text-zinc-500 hover:text-zinc-300">← All Scripts</a>
          <h2 class="text-sm font-bold text-amber-400 mt-1 truncate">{@script.name}</h2>
        </div>

        <div :for={group <- ~w(flow rewards world npc game)}>
          <div class="px-3 py-1.5 mt-1">
            <span class="text-[10px] font-bold uppercase tracking-widest text-zinc-600/50">{group}</span>
          </div>
          <button :for={nt <- nodes_in_group(group)}
            phx-click="add_node" phx-value-type={nt.id}
            class="w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-800/50 flex items-center gap-2"
            style={"border-left: 3px solid #{nt.color};"}>
            <span class="text-zinc-300">{nt.label}</span>
          </button>
        </div>
      </aside>

      <!-- Centre: canvas -->
      <div class="flex-1 flex flex-col min-w-0">
        <div class="flex items-center gap-2 px-3 py-2 bg-zinc-900/80 border-b border-zinc-800 shrink-0">
          <button phx-click="save" class="px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded text-xs font-bold">Save</button>
          <button phx-click="run" class="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-black rounded text-xs font-bold">▶ Run</button>
          <.live_component
            module={TePhoenixWeb.Components.AiAssist}
            id="ai-script-from-text"
            feature_key="script_from_text"
            user_id={@session_user_id}
            role={@session_role}
            trigger_label="✨ From text"
            context={%{before_value: ""}}
            on_accept={Phoenix.LiveView.JS.push("ai:apply_script_suggestion")} />
          <button phx-click="undo" disabled={@undo_stack == []}
            class="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs disabled:opacity-40">↶ Undo</button>
          <button :if={@selected_node_id} phx-click="delete_selected"
            class="px-2 py-1.5 bg-red-800 hover:bg-red-700 text-zinc-100 rounded text-xs">Delete Node</button>

          <form phx-submit="rename" class="ml-auto flex items-center gap-1">
            <input name="name" value={@script.name}
              class="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
            <button type="submit" class="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs">Rename</button>
          </form>
        </div>

        <div :if={@validation != []} class="bg-zinc-900 border-b border-zinc-800 px-3 py-2 text-[10px] space-y-0.5 max-h-32 overflow-y-auto shrink-0">
          <div :for={issue <- @validation} class="flex items-center gap-2">
            <span class={if issue.level == :error, do: "text-red-400", else: "text-amber-400"}>
              {if issue.level == :error, do: "⚠", else: "⚡"}
            </span>
            <span class="text-zinc-300">{issue.message}</span>
            <button :if={issue.node_id} phx-click="node:select" phx-value-id={issue.node_id}
              class="ml-auto text-amber-500 hover:text-amber-300 text-[9px]">jump→</button>
          </div>
        </div>

        <main class="flex-1 overflow-auto bg-zinc-950 relative">
          <div id="script-canvas" phx-hook="ScriptCanvas" phx-update="ignore"
            class="absolute inset-0 min-w-[2000px] min-h-[1500px]">
            <!-- JS hook owns this subtree: nodes + svg connections -->
          </div>

          <div :if={@pending_connect}
            class="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-amber-900/80 border border-amber-600 rounded text-xs text-amber-200">
            Click a target input port to connect, or click the same output to cancel.
          </div>
        </main>
      </div>

      <!-- Right: properties -->
      <aside class="w-64 bg-zinc-900/80 border-l border-zinc-800 flex flex-col shrink-0 overflow-y-auto">
        <div class="px-3 py-3 border-b border-zinc-800">
          <span class="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Properties</span>
        </div>

        <div :if={!@selected_node_id} class="p-4 text-xs text-zinc-600">
          Select a node on the canvas to edit its properties.
        </div>

        <div :if={@selected_node_id} class="p-3 space-y-3">
          <% selected = selected_node(@graph, @selected_node_id) %>
          <% nt = selected && ScriptNodes.get(selected["type"]) %>
          <div :if={nt} class="text-[10px] uppercase tracking-widest" style={"color: #{nt.color}"}>
            {nt.label}
          </div>

          <form :if={nt} phx-change="prop_change" phx-submit="prop_change" phx-debounce="350">
            <input type="hidden" name="node_id" value={@selected_node_id} />
            <div :for={prop <- nt.props} class="mb-2">
              <label class="block text-[10px] text-zinc-500 mb-0.5">{prop.label}</label>

              <%= cond do %>
                <% prop.kind == "select" -> %>
                  <select name={prop.key} class="w-full px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200">
                    <option :for={opt <- prop.options || []} value={opt}
                      selected={current_prop(selected, prop) == opt}>{opt}</option>
                  </select>

                <% prop.kind == "bool" -> %>
                  <input type="checkbox" name={prop.key} value="true"
                    checked={current_prop(selected, prop) == true or current_prop(selected, prop) == "true"} />

                <% prop.kind == "int" -> %>
                  <input type="number" name={prop.key} value={current_prop(selected, prop)}
                    class="w-full px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />

                <% prop.kind == "float" -> %>
                  <input type="number" step="0.1" name={prop.key} value={current_prop(selected, prop)}
                    class="w-full px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />

                <% true -> %>
                  <input type="text" name={prop.key} value={current_prop(selected, prop)}
                    class="w-full px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-200" />
              <% end %>
            </div>
          </form>
        </div>
      </aside>

      <!-- Run trace modal -->
      <div :if={@run_modal} class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
           phx-click="close_run">
        <div class="w-[640px] max-h-[80vh] bg-zinc-900 border border-zinc-700 rounded-lg flex flex-col overflow-hidden"
             phx-click-away="close_run">
          <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 class="text-sm font-bold text-amber-400">Dry Run Trace</h3>
            <button phx-click="close_run" class="text-zinc-500 hover:text-zinc-200 text-lg">✕</button>
          </div>
          <div class="flex-1 overflow-y-auto p-4 text-xs space-y-0.5 font-mono">
            <div :if={@run_modal.error} class="text-red-400 mb-2">Error: {@run_modal.error}</div>
            <p class="text-[10px] text-zinc-500 mb-2">Multi-branch dry-run — every branch of every choice/conditional is exercised.</p>
            <div :for={{step, idx} <- Enum.with_index(@run_modal.trace)} class="flex gap-2 text-zinc-300">
              <span class="text-zinc-600 w-8 text-right">{idx + 1}.</span>
              <span class="text-zinc-700" style={"padding-left: #{(step.depth || 0) * 12}px"}>↳</span>
              <span class="text-amber-400 w-32 truncate">{step.type}</span>
              <span class="text-zinc-500">{step.branch}</span>
              <span :if={step.note != ""} class="text-zinc-600 italic">{step.note}</span>
            </div>
            <div :if={@run_modal.trace == []} class="text-zinc-600">No steps — graph has no start node.</div>
          </div>
        </div>
      </div>
    </div>
    """
  end

  # ── Event handlers ─────────────────────────────────────────────

  @impl true
  def handle_event("ai:apply_script_suggestion", %{"suggestion" => json}, socket) do
    # Script editor is graph-based; the AI suggestion is plain English →
    # we surface it for the user to read alongside the canvas, but don't
    # auto-mutate the graph (that risks corrupting hand-edited scripts).
    summary =
      case Jason.decode(json) do
        {:ok, %{"nodes" => nodes}} when is_list(nodes) ->
          "AI suggested #{length(nodes)} nodes. See full payload to copy/paste."

        _ ->
          "AI script suggestion received. Open the right panel for the full text."
      end

    {:noreply,
     socket
     |> put_flash(:info, summary)
     |> assign(:ai_last_suggestion, json)}
  end

  def handle_event("ai:apply_script_suggestion", _, socket), do: {:noreply, socket}

  def handle_event("add_node", %{"type" => type}, socket) do
    case ScriptNodes.get(type) do
      nil ->
        {:noreply, socket}

      nt ->
        new_node = %{
          "id" => "n_" <> Base.encode16(:crypto.strong_rand_bytes(4), case: :lower),
          "type" => nt.id,
          "x" => 100 + :rand.uniform(400),
          "y" => 100 + :rand.uniform(300),
          "props" => Map.new(nt.props, fn p -> {p.key, p.default} end)
        }

        graph = Map.update(socket.assigns.graph, "nodes", [new_node], fn list -> list ++ [new_node] end)
        commit(socket, graph)
    end
  end

  def handle_event("node:move", %{"id" => id, "x" => x, "y" => y}, socket) do
    nodes =
      Enum.map(socket.assigns.graph["nodes"] || [], fn n ->
        if n["id"] == id, do: Map.merge(n, %{"x" => x, "y" => y}), else: n
      end)

    graph = Map.put(socket.assigns.graph, "nodes", nodes)
    # Move ops don't enter the undo stack — too noisy. Persist on save.
    {:noreply, socket |> assign(:graph, graph) |> push_event("graph:state", graph)}
  end

  def handle_event("node:select", %{"id" => id}, socket) do
    {:noreply,
     socket
     |> assign(:selected_node_id, id)
     |> assign(:last_prop_edit_node, nil)}
  end

  def handle_event("port:click", %{"node_id" => nid, "port" => port, "kind" => kind}, socket) do
    case {socket.assigns.pending_connect, kind} do
      {nil, "out"} ->
        {:noreply, assign(socket, :pending_connect, %{from_node: nid, from_port: port})}

      {%{from_node: ^nid, from_port: ^port}, "out"} ->
        {:noreply, assign(socket, :pending_connect, nil)}

      {%{from_node: from_n, from_port: from_p}, "in"} ->
        new_conn = %{
          "from_node" => from_n,
          "from_port" => from_p,
          "to_node" => nid,
          "to_port" => port
        }

        existing = socket.assigns.graph["connections"] || []
        # Remove any prior connection into this input (one-source rule)
        cleaned = Enum.reject(existing, fn c -> c["to_node"] == nid and c["to_port"] == port end)
        graph = Map.put(socket.assigns.graph, "connections", cleaned ++ [new_conn])

        socket
        |> assign(:pending_connect, nil)
        |> commit(graph)

      _ ->
        {:noreply, assign(socket, :pending_connect, nil)}
    end
  end

  # Copy — snapshots the current selection to the server-side clipboard
  # keyed by user_id so it survives page reloads + works across tabs.
  # The client still sends the node/connection list (the LiveView doesn't
  # track selection server-side on purpose), but the authoritative copy
  # lives on the server from here forward.
  def handle_event("clipboard:copy", %{"payload" => payload}, socket) do
    case Jason.decode(payload) do
      {:ok, %{"nodes" => _, "connections" => _} = clip} ->
        ClipboardServer.put(socket.assigns.current_user_id, @clipboard_kind, clip)

        {:noreply,
         socket
         |> assign(:save_status, "Copied #{length(clip["nodes"])} node(s) to clipboard")}

      _ ->
        {:noreply, socket}
    end
  end

  def handle_event("clipboard:paste", _params, socket) do
    case ClipboardServer.get(socket.assigns.current_user_id, @clipboard_kind) do
      :empty ->
        {:noreply, assign(socket, :save_status, "Clipboard is empty")}

      {:ok, %{"nodes" => nodes, "connections" => conns}} when is_list(nodes) ->
        id_map =
          Map.new(nodes, fn n ->
            {n["id"], "n_" <> Base.encode16(:crypto.strong_rand_bytes(4), case: :lower)}
          end)

        offset_x = 30
        offset_y = 30

        new_nodes =
          Enum.map(nodes, fn n ->
            n
            |> Map.put("id", id_map[n["id"]])
            |> Map.put("x", (n["x"] || 0) + offset_x)
            |> Map.put("y", (n["y"] || 0) + offset_y)
          end)

        new_conns =
          Enum.map(conns || [], fn c ->
            %{
              "from_node" => id_map[c["from_node"]] || c["from_node"],
              "from_port" => c["from_port"],
              "to_node" => id_map[c["to_node"]] || c["to_node"],
              "to_port" => c["to_port"]
            }
          end)
          |> Enum.filter(fn c -> id_map[c["from_node"]] != nil or id_map[c["to_node"]] != nil end)

        graph = %{
          "nodes" => (socket.assigns.graph["nodes"] || []) ++ new_nodes,
          "connections" => (socket.assigns.graph["connections"] || []) ++ new_conns
        }

        commit(socket, graph)

      _ ->
        {:noreply, socket}
    end
  end

  def handle_event("connection:delete", %{"index" => idx}, socket) do
    i = if is_integer(idx), do: idx, else: String.to_integer(to_string(idx))
    conns = socket.assigns.graph["connections"] || []

    if i < 0 or i >= length(conns) do
      {:noreply, socket}
    else
      new_conns = List.delete_at(conns, i)
      graph = Map.put(socket.assigns.graph, "connections", new_conns)
      commit(socket, graph)
    end
  end

  def handle_event("delete_selected", _params, socket) do
    case socket.assigns.selected_node_id do
      nil ->
        {:noreply, socket}

      id ->
        nodes = Enum.reject(socket.assigns.graph["nodes"] || [], &(&1["id"] == id))
        conns = Enum.reject(socket.assigns.graph["connections"] || [], fn c ->
          c["from_node"] == id or c["to_node"] == id
        end)

        graph = %{"nodes" => nodes, "connections" => conns}

        socket
        |> assign(:selected_node_id, nil)
        |> commit(graph)
    end
  end

  def handle_event("prop_change", params, socket) do
    node_id = params["node_id"] || socket.assigns.selected_node_id

    nodes =
      Enum.map(socket.assigns.graph["nodes"] || [], fn n ->
        if n["id"] == node_id do
          nt = ScriptNodes.get(n["type"])

          new_props =
            (nt && nt.props || [])
            |> Enum.reduce(n["props"] || %{}, fn p, acc ->
              raw = Map.get(params, p.key)
              Map.put(acc, p.key, coerce_prop(p, raw))
            end)

          Map.put(n, "props", new_props)
        else
          n
        end
      end)

    graph = Map.put(socket.assigns.graph, "nodes", nodes)

    # Group consecutive prop edits on the same node into a single undo entry
    # so the user gets one undo per "edit session" not per keystroke.
    same_node = socket.assigns.last_prop_edit_node == node_id

    socket = assign(socket, :last_prop_edit_node, node_id)

    if same_node do
      persist(socket.assigns.script.id, graph)

      {:noreply,
       socket
       |> assign(:graph, graph)
       |> push_event("graph:state", graph)}
    else
      commit(socket, graph)
    end
  end

  def handle_event("save", _params, socket) do
    persist(socket.assigns.script.id, socket.assigns.graph)
    clear_draft(socket.assigns.script.id)
    {:noreply, put_flash(socket, :info, "Script saved.")}
  end

  def handle_event("undo", _params, socket) do
    case socket.assigns.undo_stack do
      [] ->
        {:noreply, socket}

      [prev | rest] ->
        {:noreply,
         socket
         |> assign(:graph, prev)
         |> assign(:undo_stack, rest)
         |> push_event("graph:state", prev)}
    end
  end

  def handle_event("rename", %{"name" => name}, socket) do
    Repo.query("UPDATE game_visual_scripts SET name = ? WHERE id = ?", [name, socket.assigns.script.id])

    {:noreply,
     assign(socket, :script, %{socket.assigns.script | name: name})
     |> assign(:page_title, "Script: #{name}")}
  end

  def handle_event("run", _params, socket) do
    result = ScriptInterpreter.dry_run_all(socket.assigns.graph)
    flat = Enum.flat_map(result.trees, &flatten_tree/1)

    err =
      if Map.get(result, :truncated, false),
        do: "Branch explosion — visit budget exhausted after #{result.nodes_visited} nodes",
        else: nil

    {:noreply,
     assign(socket, :run_modal, %{trace: flat, error: err, trees: result.trees, visits: result.nodes_visited})}
  end

  def handle_event("close_run", _params, socket),
    do: {:noreply, assign(socket, :run_modal, nil)}

  def handle_event(_other, _params, socket), do: {:noreply, socket}

  # ── Helpers ────────────────────────────────────────────────────

  defp commit(socket, graph) do
    persist(socket.assigns.script.id, graph)
    undo = [socket.assigns.graph | Enum.take(socket.assigns.undo_stack, 49)]
    # Autosave: draft row captures the post-commit graph + the undo
    # stack so a page reload (or an accidental tab close) doesn't lose
    # work. Save endpoint clears this entry.
    save_draft(socket.assigns.script.id, graph, undo)

    {:noreply,
     socket
     |> assign(:graph, graph)
     |> assign(:undo_stack, undo)
     |> assign(:validation, ScriptInterpreter.validate(graph))
     |> push_event("graph:state", graph)}
  end

  defp persist(script_id, graph) do
    Repo.query(
      "UPDATE game_visual_scripts SET graph_json = ?, updated_at = NOW() WHERE id = ?",
      [Jason.encode!(graph), script_id]
    )
  rescue
    _ -> :ok
  end

  defp push_initial(socket) do
    if connected?(socket),
      do: push_event(socket, "graph:state", socket.assigns.graph),
      else: socket
  end

  defp load_script(id_str) do
    case Integer.parse(id_str) do
      {id, _} when id > 0 ->
        case Repo.query("SELECT id, name, graph_json FROM game_visual_scripts WHERE id = ?", [id]) do
          {:ok, %{rows: [[id, name, json]]}} ->
            graph =
              case Jason.decode(json || "{}") do
                {:ok, m} when is_map(m) ->
                  %{
                    "nodes" => Map.get(m, "nodes", []),
                    "connections" => Map.get(m, "connections", [])
                  }

                _ ->
                  %{"nodes" => [], "connections" => []}
              end

            {:ok, %{id: id, name: name, graph: graph}}

          _ ->
            {:error, :not_found}
        end

      _ ->
        {:error, :not_found}
    end
  rescue
    _ -> {:error, :not_found}
  end

  defp nodes_in_group(group), do: Enum.filter(ScriptNodes.all(), &(&1.group == group))

  defp selected_node(graph, id) do
    Enum.find(graph["nodes"] || [], &(&1["id"] == id))
  end

  defp current_prop(node, prop) do
    Map.get(node["props"] || %{}, prop.key, prop.default)
  end

  defp coerce_prop(%{kind: "int"}, v) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      _ -> 0
    end
  end

  defp coerce_prop(%{kind: "int"}, v) when is_integer(v), do: v
  defp coerce_prop(%{kind: "int"}, _), do: 0

  defp coerce_prop(%{kind: "float"}, v) when is_binary(v) do
    case Float.parse(v) do
      {f, _} -> f
      _ -> 0.0
    end
  end

  defp coerce_prop(%{kind: "float"}, v) when is_number(v), do: v * 1.0
  defp coerce_prop(%{kind: "float"}, _), do: 0.0

  defp coerce_prop(%{kind: "bool"}, "true"), do: true
  defp coerce_prop(%{kind: "bool"}, "on"), do: true
  defp coerce_prop(%{kind: "bool"}, true), do: true
  defp coerce_prop(%{kind: "bool"}, _), do: false

  defp coerce_prop(_, v), do: v

  # ── Draft autosave ───────────────────────────────────────────

  defp ensure_draft_table do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@draft_table} (
      script_id INT PRIMARY KEY,
      graph_json LONGTEXT NOT NULL,
      undo_json LONGTEXT NOT NULL,
      updated_at DATETIME NOT NULL
    )
    """)
  rescue
    _ -> :ok
  end

  defp load_draft(script_id, fallback_graph) do
    case Repo.query("SELECT graph_json, undo_json FROM #{@draft_table} WHERE script_id = ?", [script_id]) do
      {:ok, %{rows: [[gj, uj]]}} when is_binary(gj) ->
        graph =
          case Jason.decode(gj) do
            {:ok, g} when is_map(g) -> g
            _ -> fallback_graph
          end

        undo =
          case Jason.decode(uj || "[]") do
            {:ok, list} when is_list(list) -> list
            _ -> []
          end

        {graph, undo}

      _ ->
        {fallback_graph, []}
    end
  rescue
    _ -> {fallback_graph, []}
  end

  defp save_draft(script_id, graph, undo) do
    Repo.query(
      """
      INSERT INTO #{@draft_table} (script_id, graph_json, undo_json, updated_at)
      VALUES (?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE graph_json = VALUES(graph_json), undo_json = VALUES(undo_json), updated_at = NOW()
      """,
      [script_id, Jason.encode!(graph), Jason.encode!(undo)]
    )

    :ok
  rescue
    _ -> :ok
  end

  defp clear_draft(script_id) do
    Repo.query("DELETE FROM #{@draft_table} WHERE script_id = ?", [script_id])
    :ok
  rescue
    _ -> :ok
  end

  # Flatten a multi-branch tree into a depth-tagged step list for display.
  defp flatten_tree(tree, depth \\ 0)

  defp flatten_tree(%{branches: branches} = tree, depth) when is_list(branches) do
    [%{type: tree.type, branch: "→", note: "", depth: depth} |
     Enum.flat_map(branches, fn
       {port, nil} -> [%{type: "(end)", branch: port, note: "no target", depth: depth + 1}]
       {port, child} ->
         [%{type: child[:type] || "?", branch: port, note: "", depth: depth + 1} | flatten_tree(child, depth + 2)]
     end)]
  end

  defp flatten_tree(%{type: type} = tree, depth) do
    [%{type: type, branch: "", note: tree[:note] || "", depth: depth}]
  end

  defp flatten_tree(_, _), do: []
end
