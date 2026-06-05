defmodule TePhoenixWeb.Admin.DialogueTreeLive do
  @moduledoc """
  No-code visual conversation builder (`/sauce/dialogue`).

  Lets users build NPC dialogue trees entirely through a form UI.
  Each tree is a set of nodes: NPC speech, player response choices,
  condition checks, actions (give item, set flag), shop opens, and
  exit nodes. Includes a "Test Conversation" mode to walk the tree
  as a player would, with breadcrumb navigation.

  Persisted in `game_dialogue_trees` (auto-created on mount).
  """
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo
  require Logger

  @node_types ~w(dialogue condition action shop exit)

  # ── Mount ──────────────────────────────────────────────────────

  @impl true
  def mount(_params, _session, socket) do
    ensure_table()

    {:ok,
     socket
     |> assign(:active_tab, :world)
     |> assign(:page_title, "Dialogue Trees")
     |> assign(:trees, list_trees())
     |> assign(:npcs, list_npcs())
     |> assign(:selected_tree_id, nil)
     |> assign(:tree, nil)
     |> assign(:nodes, %{})
     |> assign(:editing_node_id, nil)
     |> assign(:test_mode, false)
     |> assign(:test_node_id, nil)
     |> assign(:breadcrumbs, [])
     |> assign(:flash_msg, nil)
     |> assign(:new_tree_name, "")
     |> assign(:new_tree_npc, "")}
  end

  # ── Render ─────────────────────────────────────────────────────

  @impl true
  def render(assigns) do
    ~H"""
    <div class="p-6 max-w-7xl mx-auto flex gap-6">
      <%!-- Left panel: tree list --%>
      <div class="w-72 shrink-0 space-y-4">
        <div class="flex items-center justify-between">
          <h1 class="text-xl font-bold text-amber-400">Dialogue Trees</h1>
          <.live_component
            module={TePhoenixWeb.Components.AiAssist}
            id="ai-dialogue-branch"
            feature_key="dialogue_branch"
            user_id={@session_user_id}
            role={@session_role}
            trigger_label="✨ Branch"
            context={%{before_value: ""}}
            on_accept={Phoenix.LiveView.JS.push("ai:apply_dialogue_suggestion")} />
        </div>

        <div class="space-y-2">
          <input type="text" placeholder="New tree name..." value={@new_tree_name}
            phx-keyup="update_new_name" phx-value-field="name"
            class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm" />
          <select phx-change="update_new_npc" name="npc_id" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm">
            <option value="">(optional NPC)</option>
            <%= for n <- @npcs do %>
              <option value={n.id} selected={to_string(n.id) == @new_tree_npc}><%= n.name %> (#<%= n.id %>)</option>
            <% end %>
          </select>
          <button phx-click="create_tree" class="w-full px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-black rounded text-sm font-bold">
            + Create Tree
          </button>
        </div>

        <div class="space-y-1">
          <%= for t <- @trees do %>
            <div class={"flex items-center justify-between px-2 py-1.5 rounded cursor-pointer text-sm #{if @selected_tree_id == t.id, do: "bg-amber-900/40 text-amber-300", else: "hover:bg-zinc-800 text-zinc-300"}"}
              phx-click="select_tree" phx-value-id={t.id}>
              <div class="truncate">
                <span class="font-medium"><%= t.name %></span>
                <span :if={t.npc_id} class="text-xs text-zinc-500 ml-1">NPC#<%= t.npc_id %></span>
              </div>
              <div class="flex gap-1 shrink-0">
                <button phx-click="duplicate_tree" phx-value-id={t.id} title="Duplicate"
                  class="text-xs text-zinc-500 hover:text-amber-400 px-1">dup</button>
                <button phx-click="delete_tree" phx-value-id={t.id}
                  data-confirm={"Delete '#{t.name}'?"}
                  class="text-xs text-red-400 hover:text-red-300 px-1">del</button>
              </div>
            </div>
          <% end %>
        </div>

        <p :if={@trees == []} class="text-xs text-zinc-600 italic">No dialogue trees yet.</p>
      </div>

      <%!-- Right panel: tree editor / test mode --%>
      <div class="flex-1 min-w-0">
        <div :if={@flash_msg} class="mb-4 p-3 bg-emerald-900/40 border border-emerald-700 text-emerald-200 text-sm rounded">
          <%= @flash_msg %>
        </div>

        <%= if @tree do %>
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-amber-400"><%= @tree.name %></h2>
            <div class="flex gap-2">
              <button phx-click="toggle_test" class={"px-3 py-1.5 rounded text-sm font-bold #{if @test_mode, do: "bg-emerald-700 text-black", else: "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"}"}>
                <%= if @test_mode, do: "Exit Test", else: "Test Conversation" %>
              </button>
              <button :if={!@test_mode} phx-click="add_node" class="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-black rounded text-sm font-bold">
                + Add Node
              </button>
            </div>
          </div>

          <%!-- Test mode --%>
          <%= if @test_mode do %>
            <.test_view nodes={@nodes} node_id={@test_node_id} breadcrumbs={@breadcrumbs} />
          <% else %>
            <%!-- Editor mode: node list --%>
            <.editor_view nodes={@nodes} editing_node_id={@editing_node_id} node_types={node_types()} all_node_ids={all_node_ids(@nodes)} />
          <% end %>
        <% else %>
          <div class="text-zinc-500 text-sm mt-12 text-center">Select or create a dialogue tree to begin.</div>
        <% end %>
      </div>
    </div>
    """
  end

  # ── Test mode component ────────────────────────────────────────

  defp test_view(assigns) do
    node = if assigns.node_id, do: Map.get(assigns.nodes, assigns.node_id)
    assigns = assign(assigns, :node, node)

    ~H"""
    <div class="space-y-4">
      <%!-- Breadcrumbs --%>
      <div :if={@breadcrumbs != []} class="flex flex-wrap gap-1 text-xs text-zinc-500">
        <%= for {bc_id, bc_text, idx} <- Enum.with_index(@breadcrumbs) |> Enum.map(fn {{id, text}, i} -> {id, text, i} end) do %>
          <button phx-click="test_jump" phx-value-index={idx}
            class="hover:text-amber-400 underline"><%= bc_text %></button>
          <span>/</span>
        <% end %>
        <span class="text-amber-400">Current</span>
      </div>

      <%= if @node do %>
        <div class="space-y-3">
          <%!-- Node type indicator --%>
          <span class={"inline-block px-2 py-0.5 rounded text-xs font-bold #{type_badge_class(@node["type"])}"}><%= @node["type"] || "dialogue" %></span>

          <%= case @node["type"] do %>
            <% "condition" -> %>
              <div class="p-4 bg-indigo-900/20 border border-indigo-700 rounded">
                <p class="text-sm text-indigo-300">Checking condition: <span class="font-mono text-xs"><%= Jason.encode!(@node["condition"] || %{}) %></span></p>
                <div class="mt-2 flex gap-2">
                  <button :if={@node["true_node_id"]} phx-click="test_navigate" phx-value-node-id={@node["true_node_id"]}
                    class="px-3 py-1 bg-emerald-700 text-black rounded text-sm">TRUE path</button>
                  <button :if={@node["false_node_id"]} phx-click="test_navigate" phx-value-node-id={@node["false_node_id"]}
                    class="px-3 py-1 bg-red-700 text-black rounded text-sm">FALSE path</button>
                </div>
              </div>

            <% "action" -> %>
              <div class="p-4 bg-purple-900/20 border border-purple-700 rounded">
                <p class="text-sm text-purple-300">Action: <span class="font-mono text-xs"><%= Jason.encode!(@node["action"] || %{}) %></span></p>
                <button :if={@node["next_node_id"]} phx-click="test_navigate" phx-value-node-id={@node["next_node_id"]}
                  class="mt-2 px-3 py-1 bg-zinc-700 text-zinc-200 rounded text-sm">Continue</button>
              </div>

            <% "shop" -> %>
              <div class="p-4 bg-yellow-900/20 border border-yellow-700 rounded">
                <p class="text-sm text-yellow-300">[Shop interface would open here]</p>
                <button :if={@node["next_node_id"]} phx-click="test_navigate" phx-value-node-id={@node["next_node_id"]}
                  class="mt-2 px-3 py-1 bg-zinc-700 text-zinc-200 rounded text-sm">Leave shop</button>
              </div>

            <% "exit" -> %>
              <div class="p-4 bg-zinc-800 border border-zinc-600 rounded">
                <p class="text-sm text-zinc-400">[Conversation ends]</p>
                <button phx-click="test_restart" class="mt-2 px-3 py-1 bg-amber-700 text-black rounded text-sm">Restart</button>
              </div>

            <% _ -> %>
              <%!-- Dialogue node --%>
              <div class="p-4 bg-zinc-900 border border-zinc-700 rounded">
                <div class="text-xs text-zinc-500 mb-1">NPC says:</div>
                <p class="text-zinc-100 text-sm whitespace-pre-wrap"><%= @node["text"] || "(empty)" %></p>
              </div>
              <div :if={(@node["responses"] || []) != []} class="space-y-1.5">
                <%= for {resp, _idx} <- Enum.with_index(@node["responses"] || []) do %>
                  <button phx-click="test_navigate" phx-value-node-id={resp["next_node_id"]}
                    class={"w-full text-left px-3 py-2 rounded text-sm #{if resp["next_node_id"], do: "bg-amber-900/30 border border-amber-700 hover:bg-amber-900/50 text-amber-200", else: "bg-zinc-800 border border-zinc-700 text-zinc-500 cursor-not-allowed"}"}>
                    > <%= resp["text"] || "(no text)" %>
                  </button>
                <% end %>
              </div>
              <p :if={(@node["responses"] || []) == []} class="text-xs text-zinc-600 italic">No responses configured.</p>
          <% end %>
        </div>
      <% else %>
        <p class="text-zinc-500 text-sm">No start node found. Add a node with id "start" or navigate manually.</p>
        <button phx-click="test_restart" class="mt-2 px-3 py-1 bg-amber-700 text-black rounded text-sm">Pick first node</button>
      <% end %>
    </div>
    """
  end

  # ── Editor view component ──────────────────────────────────────

  defp editor_view(assigns) do
    sorted = assigns.nodes |> Enum.sort_by(fn {id, _} -> id end)
    assigns = assign(assigns, :sorted_nodes, sorted)

    ~H"""
    <div class="space-y-3">
      <%= for {node_id, node} <- @sorted_nodes do %>
        <div class={"p-3 border rounded #{if @editing_node_id == node_id, do: "border-amber-600 bg-zinc-900", else: "border-zinc-800 bg-zinc-950"}"}>
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs text-zinc-500">ID: <%= node_id %></span>
              <span class={"px-1.5 py-0.5 rounded text-xs font-bold #{type_badge_class(node["type"])}"}><%= node["type"] || "dialogue" %></span>
            </div>
            <div class="flex gap-2">
              <button phx-click="edit_node" phx-value-id={node_id}
                class="text-xs text-amber-400 hover:underline">edit</button>
              <button phx-click="delete_node" phx-value-id={node_id}
                data-confirm={"Delete node #{node_id}?"}
                class="text-xs text-red-400 hover:underline">delete</button>
            </div>
          </div>

          <%!-- Preview of node content --%>
          <%= case node["type"] do %>
            <% "condition" -> %>
              <p class="text-xs text-indigo-400">Condition: <span class="font-mono"><%= trunc_str(Jason.encode!(node["condition"] || %{}), 80) %></span></p>
              <p class="text-xs text-zinc-500">True -> <span class="font-mono"><%= node["true_node_id"] || "?" %></span> | False -> <span class="font-mono"><%= node["false_node_id"] || "?" %></span></p>

            <% "action" -> %>
              <p class="text-xs text-purple-400">Action: <span class="font-mono"><%= trunc_str(Jason.encode!(node["action"] || %{}), 80) %></span></p>
              <p class="text-xs text-zinc-500">Next -> <span class="font-mono"><%= node["next_node_id"] || "?" %></span></p>

            <% "shop" -> %>
              <p class="text-xs text-yellow-400">Opens shop interface</p>
              <p class="text-xs text-zinc-500">Next -> <span class="font-mono"><%= node["next_node_id"] || "?" %></span></p>

            <% "exit" -> %>
              <p class="text-xs text-zinc-500 italic">End conversation</p>

            <% _ -> %>
              <p class="text-sm text-zinc-300 mb-1"><%= trunc_str(node["text"] || "(empty)", 120) %></p>
              <div :if={node["responses"]} class="flex flex-wrap gap-1">
                <%= for resp <- node["responses"] || [] do %>
                  <span class="text-xs bg-zinc-800 px-2 py-0.5 rounded text-zinc-400">
                    "<%= trunc_str(resp["text"] || "", 30) %>" -> <%= resp["next_node_id"] || "?" %>
                  </span>
                <% end %>
              </div>
          <% end %>

          <%!-- Edit form (inline) --%>
          <div :if={@editing_node_id == node_id} class="mt-3 pt-3 border-t border-zinc-700">
            <form phx-submit="save_node" class="space-y-3">
              <input type="hidden" name="node_id" value={node_id} />

              <div class="grid grid-cols-2 gap-3">
                <label class="block">
                  <span class="text-xs text-zinc-400">Node ID</span>
                  <input name="new_node_id" value={node_id} required
                    class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono" />
                </label>
                <label class="block">
                  <span class="text-xs text-zinc-400">Type</span>
                  <select name="type" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                    <%= for t <- @node_types do %>
                      <option value={t} selected={(node["type"] || "dialogue") == t}><%= t %></option>
                    <% end %>
                  </select>
                </label>
              </div>

              <%!-- Dialogue fields --%>
              <div :if={(node["type"] || "dialogue") == "dialogue"}>
                <label class="block mb-2">
                  <span class="text-xs text-zinc-400">NPC Text</span>
                  <textarea name="text" rows="3"
                    class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm"><%= node["text"] %></textarea>
                </label>

                <div class="space-y-2">
                  <span class="text-xs text-zinc-400 font-bold">Player Responses</span>
                  <%= for {resp, ridx} <- Enum.with_index(node["responses"] || []) do %>
                    <div class="flex items-center gap-2">
                      <input name={"resp_text_#{ridx}"} value={resp["text"]} placeholder="Player says..."
                        class="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm" />
                      <select name={"resp_next_#{ridx}"} class="w-32 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                        <option value="">(none)</option>
                        <%= for nid <- @all_node_ids do %>
                          <option value={nid} selected={resp["next_node_id"] == nid}><%= nid %></option>
                        <% end %>
                      </select>
                      <button type="button" phx-click="remove_response" phx-value-node-id={node_id} phx-value-index={ridx}
                        class="text-red-400 hover:text-red-300 text-xs px-1">X</button>
                    </div>
                  <% end %>
                  <button type="button" phx-click="add_response" phx-value-node-id={node_id}
                    class="text-xs text-amber-400 hover:underline">+ Add Response</button>
                </div>
              </div>

              <%!-- Condition fields --%>
              <div :if={node["type"] == "condition"} class="space-y-2">
                <.live_component
                  module={TePhoenixWeb.Components.RuleBuilder}
                  id="dialogue_condition"
                  field_name="condition_json"
                  schema={:objective_callback}
                  label="Condition (check flags/quests)"
                  value={Jason.encode!(node["condition"] || %{})}
                />
                <div class="grid grid-cols-2 gap-3">
                  <label class="block">
                    <span class="text-xs text-zinc-400">If TRUE, go to node</span>
                    <select name="true_node_id" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                      <option value="">(none)</option>
                      <%= for nid <- @all_node_ids do %>
                        <option value={nid} selected={node["true_node_id"] == nid}><%= nid %></option>
                      <% end %>
                    </select>
                  </label>
                  <label class="block">
                    <span class="text-xs text-zinc-400">If FALSE, go to node</span>
                    <select name="false_node_id" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                      <option value="">(none)</option>
                      <%= for nid <- @all_node_ids do %>
                        <option value={nid} selected={node["false_node_id"] == nid}><%= nid %></option>
                      <% end %>
                    </select>
                  </label>
                </div>
              </div>

              <%!-- Action fields --%>
              <div :if={node["type"] == "action"} class="space-y-2">
                <.live_component
                  module={TePhoenixWeb.Components.RuleBuilder}
                  id="dialogue_action"
                  field_name="action_json"
                  schema={:objective_callback}
                  label="Action (give item, set flag, heal)"
                  value={Jason.encode!(node["action"] || %{})}
                />
                <label class="block">
                  <span class="text-xs text-zinc-400">Then go to node</span>
                  <select name="next_node_id" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                    <option value="">(none)</option>
                    <%= for nid <- @all_node_ids do %>
                      <option value={nid} selected={node["next_node_id"] == nid}><%= nid %></option>
                    <% end %>
                  </select>
                </label>
              </div>

              <%!-- Shop fields --%>
              <div :if={node["type"] == "shop"}>
                <label class="block">
                  <span class="text-xs text-zinc-400">After shop, go to node</span>
                  <select name="next_node_id" class="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm">
                    <option value="">(none)</option>
                    <%= for nid <- @all_node_ids do %>
                      <option value={nid} selected={node["next_node_id"] == nid}><%= nid %></option>
                    <% end %>
                  </select>
                </label>
              </div>

              <%!-- Exit: no extra fields --%>

              <div class="flex gap-2 pt-2">
                <button type="submit" class="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-black rounded text-sm font-bold">Save Node</button>
                <button type="button" phx-click="cancel_edit" class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-sm">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      <% end %>

      <p :if={@sorted_nodes == []} class="text-zinc-500 text-sm italic">No nodes yet. Click "+ Add Node" to start building the conversation.</p>
    </div>
    """
  end

  # ── Events: Tree CRUD ──────────────────────────────────────────

  @impl true
  def handle_event("ai:apply_dialogue_suggestion", %{"suggestion" => json}, socket) do
    # Stash the suggestion in a flash + assign so the user can see what
    # the AI proposed before manually adding nodes. Auto-merging into
    # the live graph would risk corrupting the in-progress edit.
    summary =
      case Jason.decode(json) do
        {:ok, %{} = parsed} ->
          npc = parsed["npc_name"] || parsed["speaker"] || "NPC"
          line = parsed["text"] || parsed["body"] || parsed["line"] || ""
          "AI suggestion for #{npc}: #{String.slice(line, 0, 100)}"

        _ ->
          "AI suggestion received — see console for full payload."
      end

    {:noreply,
     socket
     |> put_flash(:info, summary)
     |> assign(:ai_last_suggestion, json)}
  end

  def handle_event("ai:apply_dialogue_suggestion", _, socket), do: {:noreply, socket}

  def handle_event("update_new_name", %{"value" => val}, socket) do
    {:noreply, assign(socket, :new_tree_name, val)}
  end

  def handle_event("update_new_npc", %{"npc_id" => val}, socket) do
    {:noreply, assign(socket, :new_tree_npc, val)}
  end

  def handle_event("create_tree", _, socket) do
    name = String.trim(socket.assigns.new_tree_name)

    if name == "" do
      {:noreply, assign(socket, :flash_msg, "Name required.")}
    else
      npc_id = parse_int(socket.assigns.new_tree_npc)
      start_nodes = %{"start" => %{"type" => "dialogue", "text" => "Hello, traveler.", "responses" => []}}

      Repo.query(
        "INSERT INTO game_dialogue_trees (npc_id, name, tree_json) VALUES (?, ?, ?)",
        [npc_id, name, Jason.encode!(start_nodes)]
      )

      {:noreply,
       socket
       |> assign(:trees, list_trees())
       |> assign(:new_tree_name, "")
       |> assign(:new_tree_npc, "")
       |> assign(:flash_msg, "Created '#{name}'")}
    end
  end

  def handle_event("select_tree", %{"id" => id_str}, socket) do
    id = String.to_integer(id_str)
    tree = Enum.find(socket.assigns.trees, &(&1.id == id))

    if tree do
      nodes = decode_nodes(tree.tree_json)

      {:noreply,
       socket
       |> assign(:selected_tree_id, id)
       |> assign(:tree, tree)
       |> assign(:nodes, nodes)
       |> assign(:editing_node_id, nil)
       |> assign(:test_mode, false)
       |> assign(:test_node_id, nil)
       |> assign(:breadcrumbs, [])}
    else
      {:noreply, socket}
    end
  end

  def handle_event("delete_tree", %{"id" => id_str}, socket) do
    id = String.to_integer(id_str)
    Repo.query("DELETE FROM game_dialogue_trees WHERE id = ?", [id])

    new_socket =
      if socket.assigns.selected_tree_id == id do
        socket
        |> assign(:selected_tree_id, nil)
        |> assign(:tree, nil)
        |> assign(:nodes, %{})
      else
        socket
      end

    {:noreply,
     new_socket
     |> assign(:trees, list_trees())
     |> assign(:flash_msg, "Tree deleted.")}
  end

  def handle_event("duplicate_tree", %{"id" => id_str}, socket) do
    id = String.to_integer(id_str)
    tree = Enum.find(socket.assigns.trees, &(&1.id == id))

    if tree do
      new_name = tree.name <> " (copy)"

      Repo.query(
        "INSERT INTO game_dialogue_trees (npc_id, name, tree_json) VALUES (?, ?, ?)",
        [tree.npc_id, new_name, tree.tree_json]
      )

      {:noreply,
       socket
       |> assign(:trees, list_trees())
       |> assign(:flash_msg, "Duplicated as '#{new_name}'")}
    else
      {:noreply, socket}
    end
  end

  # ── Events: Node editing ───────────────────────────────────────

  def handle_event("add_node", _, socket) do
    nodes = socket.assigns.nodes
    new_id = next_node_id(nodes)
    node = %{"type" => "dialogue", "text" => "", "responses" => []}
    nodes = Map.put(nodes, new_id, node)
    save_nodes(socket.assigns.selected_tree_id, nodes)

    {:noreply,
     socket
     |> assign(:nodes, nodes)
     |> assign(:editing_node_id, new_id)}
  end

  def handle_event("edit_node", %{"id" => id}, socket) do
    {:noreply, assign(socket, :editing_node_id, id)}
  end

  def handle_event("cancel_edit", _, socket) do
    {:noreply, assign(socket, :editing_node_id, nil)}
  end

  def handle_event("delete_node", %{"id" => id}, socket) do
    nodes = Map.delete(socket.assigns.nodes, id)
    save_nodes(socket.assigns.selected_tree_id, nodes)
    editing = if socket.assigns.editing_node_id == id, do: nil, else: socket.assigns.editing_node_id
    {:noreply, socket |> assign(:nodes, nodes) |> assign(:editing_node_id, editing)}
  end

  def handle_event("add_response", %{"node-id" => node_id}, socket) do
    nodes = socket.assigns.nodes
    node = Map.get(nodes, node_id, %{})
    responses = (node["responses"] || []) ++ [%{"text" => "", "next_node_id" => nil}]
    nodes = Map.put(nodes, node_id, Map.put(node, "responses", responses))
    save_nodes(socket.assigns.selected_tree_id, nodes)
    {:noreply, assign(socket, :nodes, nodes)}
  end

  def handle_event("remove_response", %{"node-id" => node_id, "index" => idx_str}, socket) do
    idx = String.to_integer(idx_str)
    nodes = socket.assigns.nodes
    node = Map.get(nodes, node_id, %{})
    responses = List.delete_at(node["responses"] || [], idx)
    nodes = Map.put(nodes, node_id, Map.put(node, "responses", responses))
    save_nodes(socket.assigns.selected_tree_id, nodes)
    {:noreply, assign(socket, :nodes, nodes)}
  end

  def handle_event("save_node", params, socket) do
    old_id = params["node_id"]
    new_id = String.trim(params["new_node_id"] || old_id)
    new_id = if new_id == "", do: old_id, else: new_id
    type = params["type"] || "dialogue"

    node =
      case type do
        "dialogue" ->
          responses = collect_responses(params)
          %{"type" => "dialogue", "text" => params["text"] || "", "responses" => responses}

        "condition" ->
          %{
            "type" => "condition",
            "condition" => decode_json(params["condition_json"]),
            "true_node_id" => nne(params["true_node_id"]),
            "false_node_id" => nne(params["false_node_id"])
          }

        "action" ->
          %{
            "type" => "action",
            "action" => decode_json(params["action_json"]),
            "next_node_id" => nne(params["next_node_id"])
          }

        "shop" ->
          %{"type" => "shop", "next_node_id" => nne(params["next_node_id"])}

        "exit" ->
          %{"type" => "exit"}

        _ ->
          %{"type" => "dialogue", "text" => "", "responses" => []}
      end

    nodes = socket.assigns.nodes
    nodes = if old_id != new_id, do: Map.delete(nodes, old_id), else: nodes
    nodes = Map.put(nodes, new_id, node)
    save_nodes(socket.assigns.selected_tree_id, nodes)

    {:noreply,
     socket
     |> assign(:nodes, nodes)
     |> assign(:editing_node_id, nil)
     |> assign(:flash_msg, "Saved node '#{new_id}'")}
  end

  # ── Events: Test mode ──────────────────────────────────────────

  def handle_event("toggle_test", _, socket) do
    entering = !socket.assigns.test_mode
    start_id = if entering, do: find_start_node(socket.assigns.nodes), else: nil

    {:noreply,
     socket
     |> assign(:test_mode, entering)
     |> assign(:test_node_id, start_id)
     |> assign(:breadcrumbs, [])
     |> assign(:editing_node_id, nil)}
  end

  def handle_event("test_navigate", %{"node-id" => ""}, socket), do: {:noreply, socket}

  def handle_event("test_navigate", %{"node-id" => next_id}, socket) do
    current = socket.assigns.test_node_id
    node = Map.get(socket.assigns.nodes, current)
    label = node_label(node, current)
    breadcrumbs = socket.assigns.breadcrumbs ++ [{current, label}]

    {:noreply,
     socket
     |> assign(:test_node_id, next_id)
     |> assign(:breadcrumbs, breadcrumbs)}
  end

  def handle_event("test_jump", %{"index" => idx_str}, socket) do
    idx = String.to_integer(idx_str)
    {kept, _} = Enum.split(socket.assigns.breadcrumbs, idx)
    {target_id, _} = Enum.at(socket.assigns.breadcrumbs, idx)

    {:noreply,
     socket
     |> assign(:test_node_id, target_id)
     |> assign(:breadcrumbs, kept)}
  end

  def handle_event("test_restart", _, socket) do
    start_id = find_start_node(socket.assigns.nodes)
    {:noreply, socket |> assign(:test_node_id, start_id) |> assign(:breadcrumbs, [])}
  end

  # ── DB helpers ─────────────────────────────────────────────────

  defp ensure_table do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS game_dialogue_trees (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      npc_id BIGINT UNSIGNED NULL,
      name VARCHAR(255) NOT NULL DEFAULT 'Untitled',
      tree_json LONGTEXT NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_npc (npc_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
  rescue
    _ -> :ok
  end

  defp list_trees do
    case Repo.query("SELECT id, npc_id, name, tree_json, updated_at FROM game_dialogue_trees ORDER BY name ASC") do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, npc_id, name, tree_json, updated_at] ->
          %{id: id, npc_id: npc_id, name: name || "Untitled", tree_json: tree_json || "{}", updated_at: updated_at}
        end)

      _ ->
        []
    end
  rescue
    _ -> []
  end

  defp list_npcs do
    case Repo.query("SELECT id, name FROM game_npcs ORDER BY name ASC LIMIT 500") do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [id, name] -> %{id: id, name: name || "NPC ##{id}"} end)
      _ -> []
    end
  rescue
    _ -> []
  end

  defp save_nodes(tree_id, nodes) when is_integer(tree_id) do
    json = Jason.encode!(nodes)
    Repo.query("UPDATE game_dialogue_trees SET tree_json = ? WHERE id = ?", [json, tree_id])
  end

  defp save_nodes(_, _), do: :ok

  defp decode_nodes(nil), do: %{}
  defp decode_nodes(""), do: %{}

  defp decode_nodes(json) when is_binary(json) do
    case Jason.decode(json) do
      {:ok, %{} = m} -> m
      _ -> %{}
    end
  end

  defp decode_nodes(_), do: %{}

  # ── Helpers ────────────────────────────────────────────────────

  defp node_types, do: @node_types

  defp all_node_ids(nodes), do: Map.keys(nodes) |> Enum.sort()

  defp next_node_id(nodes) do
    existing = Map.keys(nodes)
    numbered = Enum.flat_map(existing, fn id ->
      case Integer.parse(id) do
        {n, ""} -> [n]
        _ -> []
      end
    end)

    next = if numbered == [], do: 1, else: Enum.max(numbered) + 1
    "node_#{next}"
  end

  defp find_start_node(nodes) do
    cond do
      Map.has_key?(nodes, "start") -> "start"
      nodes == %{} -> nil
      true -> nodes |> Map.keys() |> Enum.sort() |> List.first()
    end
  end

  defp collect_responses(params) do
    # Gather resp_text_0, resp_next_0, resp_text_1, resp_next_1, ...
    params
    |> Enum.filter(fn {k, _} -> String.starts_with?(k, "resp_text_") end)
    |> Enum.map(fn {k, text} ->
      idx = String.replace_prefix(k, "resp_text_", "")
      next = params["resp_next_#{idx}"]
      %{"text" => text, "next_node_id" => nne(next)}
    end)
    |> Enum.sort_by(fn _ -> 0 end)
  end

  defp node_label(nil, id), do: id
  defp node_label(%{"text" => t}, _id) when is_binary(t) and t != "", do: trunc_str(t, 30)
  defp node_label(%{"type" => type}, id), do: "#{type}:#{id}"
  defp node_label(_, id), do: id

  defp type_badge_class("condition"), do: "bg-indigo-900/60 text-indigo-300"
  defp type_badge_class("action"), do: "bg-purple-900/60 text-purple-300"
  defp type_badge_class("shop"), do: "bg-yellow-900/60 text-yellow-300"
  defp type_badge_class("exit"), do: "bg-zinc-700 text-zinc-400"
  defp type_badge_class(_), do: "bg-zinc-800 text-zinc-300"

  defp trunc_str(s, max) do
    if String.length(s) > max, do: String.slice(s, 0, max - 3) <> "...", else: s
  end

  defp nne(""), do: nil
  defp nne(nil), do: nil
  defp nne(v), do: v

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
end
