defmodule TePhoenixWeb.Admin.ScriptListLive do
  @moduledoc """
  Index of all visual-scripting graphs — `/sauce/scripts`.

  Each row links to the per-script editor at `/sauce/scripts/:id/edit`.
  Lazy-creates the `game_visual_scripts` table on first hit.
  """
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo

  @impl true
  def mount(_params, _session, socket) do
    ensure_table()

    {:ok,
     socket
     |> assign(:active_tab, :gameplay)
     |> assign(:page_title, "Visual Scripts")
     |> assign(:scripts, list_scripts())}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="p-6 max-w-4xl mx-auto">
      <header class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-amber-400">Visual Scripts</h1>
          <p class="text-xs text-zinc-500 mt-1">25-node graph editor for events, dialogue, quests, world rules.</p>
        </div>
        <button phx-click="create"
          class="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-black rounded text-sm font-bold">
          + New Script
        </button>
      </header>

      <div :if={@scripts == []} class="text-center text-zinc-500 text-sm py-12 border border-dashed border-zinc-800 rounded">
        No scripts yet. Click <strong>+ New Script</strong> to create your first graph.
      </div>

      <ul class="space-y-2">
        <li :for={s <- @scripts} class="bg-zinc-900 border border-zinc-800 rounded p-3 flex items-center justify-between hover:border-amber-700">
          <div>
            <a href={~p"/sauce/scripts/#{s.id}/edit"} class="text-amber-300 font-bold hover:text-amber-200">{s.name}</a>
            <div class="text-[10px] text-zinc-500">{s.node_count} nodes · updated {s.updated_at}</div>
          </div>
          <div class="flex items-center gap-2">
            <a href={~p"/sauce/scripts/#{s.id}/edit"}
              class="px-2 py-1 text-[10px] bg-amber-700 hover:bg-amber-600 text-black rounded font-bold">Edit</a>
            <button phx-click="delete" phx-value-id={s.id} data-confirm={"Delete \"#{s.name}\"?"}
              class="px-2 py-1 text-[10px] bg-red-800 hover:bg-red-700 text-zinc-100 rounded">Delete</button>
          </div>
        </li>
      </ul>
    </div>
    """
  end

  @impl true
  def handle_event("create", _params, socket) do
    case Repo.query(
           "INSERT INTO game_visual_scripts (name, graph_json, updated_at) VALUES (?, ?, NOW())",
           ["Untitled Script", Jason.encode!(%{nodes: [], connections: []})]
         ) do
      {:ok, %{last_insert_id: id}} when is_integer(id) and id > 0 ->
        {:noreply, push_navigate(socket, to: ~p"/sauce/scripts/#{id}/edit")}

      _ ->
        {:noreply, put_flash(socket, :error, "Failed to create script")}
    end
  end

  def handle_event("delete", %{"id" => id}, socket) do
    Repo.query("DELETE FROM game_visual_scripts WHERE id = ?", [id])
    {:noreply, assign(socket, :scripts, list_scripts())}
  end

  defp list_scripts do
    case Repo.query("SELECT id, name, graph_json, updated_at FROM game_visual_scripts ORDER BY updated_at DESC") do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, name, graph, at] ->
          count =
            case Jason.decode(graph || "{}") do
              {:ok, %{"nodes" => list}} when is_list(list) -> length(list)
              _ -> 0
            end

          %{id: id, name: name, node_count: count, updated_at: to_string(at)}
        end)

      _ ->
        []
    end
  rescue
    _ -> []
  end

  defp ensure_table do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS game_visual_scripts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      graph_json LONGTEXT NOT NULL,
      updated_at DATETIME NOT NULL
    )
    """)
  rescue
    _ -> :ok
  end
end
