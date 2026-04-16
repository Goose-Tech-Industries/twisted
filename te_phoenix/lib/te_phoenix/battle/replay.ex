defmodule TePhoenix.Battle.Replay do
  @moduledoc """
  Battle replay recording and playback system.

  Records every action_result broadcast by the battle channel during a fight,
  then persists the event log to `game_battle_replays` so battles can be
  reviewed, spectated after the fact, or analyzed for balance tuning.

  ## Recording lifecycle

      start_recording(battle_id)        # called at battle start
      record_event(battle_id, event)    # called after each action resolves
      stop_recording(battle_id)         # called at battle end — flushes to DB

  ## Playback

      get_replay(battle_id)             # => %{events: [...], metadata: %{...}}

  Events are the same action_result maps the battle channel already
  broadcasts — no custom format needed. The replay is a complete,
  ordered log of everything that happened.

  ## Storage

  Uses an ETS table for in-flight recording (fast appends, crash-safe
  within the BEAM), then flushes to MySQL on stop. Completed replays
  live in `game_battle_replays`.
  """

  require Logger
  alias TePhoenix.Repo

  @replay_table "game_battle_replays"
  @ets_table :battle_replay_events

  # ── Table setup ────────────────────────────────────────────────

  @doc "Create the replay table if it doesn't exist."
  def ensure_table do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@replay_table} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      battle_id VARCHAR(64) NOT NULL,
      events_json LONGTEXT NOT NULL,
      metadata_json LONGTEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE INDEX idx_battle_id (battle_id),
      INDEX idx_created (created_at)
    )
    """)
  rescue
    e -> Logger.error("Replay ensure_table: #{inspect(e)}")
  end

  @doc "Ensure the ETS table for in-flight recordings exists."
  def ensure_ets do
    case :ets.whereis(@ets_table) do
      :undefined ->
        :ets.new(@ets_table, [:named_table, :public, :set])

      _ref ->
        @ets_table
    end
  end

  # ── Recording ──────────────────────────────────────────────────

  @doc """
  Start recording a battle. Initializes an empty event buffer in ETS.

  Call this at battle start (or when auto-replay is enabled in settings).
  """
  @spec start_recording(term()) :: :ok
  def start_recording(battle_id) do
    ensure_ets()
    start_ms = System.system_time(:millisecond)
    :ets.insert(@ets_table, {battle_id, [], %{start_ms: start_ms}})
    Logger.debug("Replay: started recording battle #{inspect(battle_id)}")
    :ok
  end

  @doc """
  Append an event to the in-flight recording for a battle.

  Each event should be the action_result map from Combat.execute/4,
  enriched with timing and turn info:

      %{
        type: :action | :turn_start | :turn_end | :battle_end,
        turn: 3,
        timestamp_ms: 1713200000000,
        actor: "Kael",
        target: "Goblin A",
        actions: [...],
        log: [...]
      }
  """
  @spec record_event(term(), map()) :: :ok | :not_recording
  def record_event(battle_id, event) when is_map(event) do
    ensure_ets()

    enriched = Map.merge(
      %{
        timestamp_ms: System.system_time(:millisecond),
        type: Map.get(event, :type, :action)
      },
      event
    )

    case :ets.lookup(@ets_table, battle_id) do
      [{^battle_id, events, meta}] ->
        :ets.insert(@ets_table, {battle_id, [enriched | events], meta})
        :ok

      [] ->
        :not_recording
    end
  end

  @doc """
  Stop recording and flush accumulated events to the database.

  Accepts optional metadata about the battle outcome. If not provided,
  metadata is built from whatever was captured during recording.
  """
  @spec stop_recording(term(), map()) :: {:ok, integer()} | {:error, term()}
  def stop_recording(battle_id, metadata \\ %{}) do
    ensure_ets()

    case :ets.lookup(@ets_table, battle_id) do
      [{^battle_id, events_reversed, record_meta}] ->
        :ets.delete(@ets_table, battle_id)
        events = Enum.reverse(events_reversed)
        end_ms = System.system_time(:millisecond)
        start_ms = Map.get(record_meta, :start_ms, end_ms)
        duration_seconds = div(end_ms - start_ms, 1000)

        full_metadata =
          %{
            duration_seconds: duration_seconds,
            event_count: length(events),
            recorded_at: DateTime.utc_now() |> DateTime.to_iso8601()
          }
          |> Map.merge(metadata)

        persist_replay(battle_id, events, full_metadata)

      [] ->
        {:error, :not_recording}
    end
  end

  # ── Retrieval ──────────────────────────────────────────────────

  @doc """
  Load a completed replay from the database.

  Returns `{:ok, %{events: [...], metadata: %{...}}}` or `{:error, :not_found}`.
  """
  @spec get_replay(term()) :: {:ok, map()} | {:error, :not_found}
  def get_replay(battle_id) do
    case Repo.query(
           "SELECT events_json, metadata_json, created_at FROM #{@replay_table} WHERE battle_id = ?",
           [to_string(battle_id)]
         ) do
      {:ok, %{rows: [[events_json, meta_json, created_at]]}} ->
        events = decode_json(events_json)
        metadata = decode_json(meta_json) |> Map.put("created_at", created_at)

        {:ok, %{events: events, metadata: metadata}}

      _ ->
        {:error, :not_found}
    end
  rescue
    e ->
      Logger.error("Replay get_replay error: #{inspect(e)}")
      {:error, :not_found}
  end

  @doc """
  List recent replays with pagination.

  Options:
    - `:limit` — max results (default 20)
    - `:offset` — pagination offset (default 0)
    - `:battle_id` — filter by specific battle_id pattern (LIKE)

  Returns a list of replay summaries (metadata only, no full event log).
  """
  @spec list_replays(keyword()) :: [map()]
  def list_replays(opts \\ []) do
    limit = Keyword.get(opts, :limit, 20)
    offset = Keyword.get(opts, :offset, 0)
    battle_id_filter = Keyword.get(opts, :battle_id, nil)

    {where_clause, params} =
      if battle_id_filter do
        {"WHERE battle_id LIKE ?", ["%#{battle_id_filter}%"]}
      else
        {"", []}
      end

    case Repo.query(
           "SELECT battle_id, metadata_json, created_at FROM #{@replay_table} #{where_clause} ORDER BY created_at DESC LIMIT ? OFFSET ?",
           params ++ [limit, offset]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [bid, meta_json, created_at] ->
          %{
            battle_id: bid,
            metadata: decode_json(meta_json),
            created_at: created_at
          }
        end)

      _ ->
        []
    end
  rescue
    _ -> []
  end

  @doc """
  Delete a replay by battle_id. Used for cleanup or privacy.
  """
  @spec delete_replay(term()) :: :ok | {:error, term()}
  def delete_replay(battle_id) do
    case Repo.query("DELETE FROM #{@replay_table} WHERE battle_id = ?", [to_string(battle_id)]) do
      {:ok, _} -> :ok
      {:error, e} -> {:error, e}
    end
  rescue
    e -> {:error, e}
  end

  @doc """
  Check if a battle is currently being recorded.
  """
  @spec recording?(term()) :: boolean()
  def recording?(battle_id) do
    ensure_ets()

    case :ets.lookup(@ets_table, battle_id) do
      [{^battle_id, _events, _meta}] -> true
      [] -> false
    end
  end

  @doc """
  Check if auto-replay is enabled in the battle settings and start
  recording if so. Called at battle initialization.
  """
  @spec maybe_auto_record(term(), map()) :: :ok | :disabled
  def maybe_auto_record(battle_id, settings) when is_map(settings) do
    if Map.get(settings, :enable_auto_replay, false) or
         Map.get(settings, "enable_auto_replay", false) do
      start_recording(battle_id)
    else
      :disabled
    end
  end

  def maybe_auto_record(_battle_id, _settings), do: :disabled

  @doc """
  Get the current event count for an in-flight recording.
  Useful for spectator UIs showing live event count.
  """
  @spec event_count(term()) :: non_neg_integer() | nil
  def event_count(battle_id) do
    ensure_ets()

    case :ets.lookup(@ets_table, battle_id) do
      [{^battle_id, events, _meta}] -> length(events)
      [] -> nil
    end
  end

  # ── Private ────────────────────────────────────────────────────

  defp persist_replay(battle_id, events, metadata) do
    events_json = Jason.encode!(events)
    meta_json = Jason.encode!(metadata)
    bid = to_string(battle_id)

    case Repo.query(
           """
           INSERT INTO #{@replay_table} (battle_id, events_json, metadata_json, created_at)
           VALUES (?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE events_json = VALUES(events_json),
                                    metadata_json = VALUES(metadata_json),
                                    created_at = NOW()
           """,
           [bid, events_json, meta_json]
         ) do
      {:ok, %{last_insert_id: id}} ->
        Logger.info("Replay: persisted #{length(events)} events for battle #{bid}")
        {:ok, id}

      {:error, e} ->
        Logger.error("Replay: failed to persist battle #{bid}: #{inspect(e)}")
        {:error, e}
    end
  rescue
    e ->
      Logger.error("Replay: persist_replay exception: #{inspect(e)}")
      {:error, e}
  end

  defp decode_json(nil), do: %{}
  defp decode_json(""), do: %{}

  defp decode_json(s) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, v} -> v
      _ -> %{}
    end
  end

  defp decode_json(m) when is_map(m), do: m
  defp decode_json(l) when is_list(l), do: l
  defp decode_json(_), do: %{}
end
