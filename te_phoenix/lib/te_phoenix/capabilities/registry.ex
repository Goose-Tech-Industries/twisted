defmodule TePhoenix.Capabilities.Registry do
  @moduledoc """
  Stateful registry of enabled capability modules for the active project.

  Loads from the `game_capability_state` table on boot. Falls back to each
  module's `:default_enabled` when no DB row exists. Writes are persisted
  immediately so the next boot reflects the user's choices.

  This GenServer is referenced indirectly via `TePhoenix.Capabilities` —
  prefer those public helpers over calling the registry directly.
  """
  use GenServer

  alias TePhoenix.Repo

  @table "game_capability_state"

  # ── Public API ───────────────────────────────────────────────

  def start_link(_opts \\ []) do
    GenServer.start_link(__MODULE__, :ok, name: __MODULE__)
  end

  @doc "Whether capability `id` is currently enabled."
  def enabled?(id) when is_atom(id), do: GenServer.call(__MODULE__, {:enabled?, id})

  @doc "Set the enabled state for capability `id`."
  def set_enabled(id, on?) when is_atom(id) and is_boolean(on?),
    do: GenServer.call(__MODULE__, {:set_enabled, id, on?})

  @doc "Snapshot of the entire enabled-state map."
  def all, do: GenServer.call(__MODULE__, :all)

  # ── GenServer callbacks ──────────────────────────────────────

  @impl true
  def init(:ok) do
    ensure_table()
    state = load_state()
    {:ok, state}
  end

  @impl true
  def handle_call({:enabled?, id}, _from, state) do
    {:reply, Map.get(state, id, default_for(id)), state}
  end

  def handle_call({:set_enabled, id, on?}, _from, state) do
    persist(id, on?)
    {:reply, :ok, Map.put(state, id, on?)}
  end

  def handle_call(:all, _from, state) do
    snapshot =
      for m <- TePhoenix.Capabilities.built_in_modules(), into: %{} do
        {m.id, Map.get(state, m.id, m.default_enabled)}
      end

    {:reply, snapshot, state}
  end

  # ── DB plumbing ──────────────────────────────────────────────

  defp ensure_table do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@table} (
      capability_id VARCHAR(80) PRIMARY KEY,
      enabled BOOLEAN NOT NULL,
      updated_at DATETIME NOT NULL
    )
    """)
  rescue
    _ -> :ok
  end

  defp load_state do
    case Repo.query("SELECT capability_id, enabled FROM #{@table}") do
      {:ok, %{rows: rows}} ->
        for [id, enabled] <- rows, into: %{} do
          {String.to_atom(id), enabled == 1 or enabled == true}
        end

      _ ->
        %{}
    end
  rescue
    _ -> %{}
  end

  defp persist(id, on?) do
    val = if on?, do: 1, else: 0

    Repo.query(
      """
      INSERT INTO #{@table} (capability_id, enabled, updated_at)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_at = NOW()
      """,
      [Atom.to_string(id), val]
    )
  rescue
    _ -> :ok
  end

  defp default_for(id) do
    case TePhoenix.Capabilities.get(id) do
      %{default_enabled: v} -> v
      _ -> false
    end
  end
end
