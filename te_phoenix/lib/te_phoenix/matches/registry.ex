defmodule TePhoenix.Matches.Registry do
  @moduledoc """
  Match mode definition registry.

  Each mode defines the rules for a matchmade game: team sizes, map
  pool, win conditions, lobby settings, post-match rewards. All data-
  driven, editable from AdminSauce.

  Table: `game_match_modes` — auto-created, ETS-cached.

  ## Mode definition shape

      %{
        key: "5v5_moba",
        name: "5v5 MOBA",
        team_size: 5,
        team_count: 2,
        map_pool: [3, 7, 12],
        queue_type: "ranked",       # ranked / casual / custom
        allow_spectators: true,
        lobby_timeout_seconds: 120,
        ready_check_seconds: 15,
        match_time_limit_seconds: 1800,  # 0 = no limit
        win_conditions: %{
          "type" => "objective",      # objective / last_standing / score / timer
          "objective_key" => "nexus", # destroy enemy nexus
        },
        rewards: %{
          "xp_win" => 500, "xp_loss" => 150,
          "gold_win" => 200, "gold_loss" => 50,
          "rank_win" => 25, "rank_loss" => -15
        },
        settings: %{},
        enabled: true
      }
  """

  use GenServer
  require Logger

  alias TePhoenix.Repo

  @table "game_match_modes"
  @ets :twisted_match_modes

  def start_link(_opts \\ []), do: GenServer.start_link(__MODULE__, :ok, name: __MODULE__)

  def get(key) when is_binary(key) do
    case :ets.lookup(@ets, key) do
      [{^key, d}] -> d
      _ -> nil
    end
  rescue
    ArgumentError -> nil
  end

  def list_all do
    :ets.tab2list(@ets) |> Enum.map(fn {_k, v} -> v end)
  rescue
    ArgumentError -> []
  end

  def reload, do: GenServer.call(__MODULE__, :reload)
  def upsert(%{} = d), do: GenServer.call(__MODULE__, {:upsert, d})
  def delete(key), do: GenServer.call(__MODULE__, {:delete, to_string(key)})

  @impl true
  def init(:ok) do
    ensure_ets()
    ensure_table()
    seed_defaults_if_empty()
    load_all()
    {:ok, %{}}
  end

  @impl true
  def handle_call(:reload, _from, s), do: (load_all(); {:reply, :ok, s})
  def handle_call({:upsert, d}, _from, s), do: (persist(d); load_all(); {:reply, :ok, s})
  def handle_call({:delete, key}, _from, s) do
    Repo.query("DELETE FROM #{@table} WHERE `key` = ?", [key])
    load_all()
    {:reply, :ok, s}
  end

  defp ensure_ets do
    case :ets.info(@ets) do
      :undefined -> :ets.new(@ets, [:set, :public, :named_table, read_concurrency: true])
      _ -> :ok
    end
  end

  defp ensure_table do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@table} (
      `key` VARCHAR(80) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      team_size INT DEFAULT 1,
      team_count INT DEFAULT 2,
      map_pool_json LONGTEXT,
      queue_type VARCHAR(16) DEFAULT 'casual',
      allow_spectators TINYINT(1) DEFAULT 1,
      lobby_timeout_seconds INT DEFAULT 120,
      ready_check_seconds INT DEFAULT 15,
      match_time_limit_seconds INT DEFAULT 0,
      win_conditions_json LONGTEXT,
      rewards_json LONGTEXT,
      settings_json LONGTEXT,
      enabled TINYINT(1) DEFAULT 1,
      updated_at DATETIME NOT NULL
    )
    """)
  rescue
    e -> Logger.error("Match modes ensure_table: #{inspect(e)}")
  end

  defp load_all do
    :ets.delete_all_objects(@ets)
    case Repo.query("SELECT `key`, name, description, team_size, team_count, map_pool_json, queue_type, allow_spectators, lobby_timeout_seconds, ready_check_seconds, match_time_limit_seconds, win_conditions_json, rewards_json, settings_json, enabled FROM #{@table}") do
      {:ok, %{rows: rows}} ->
        for row <- rows do
          d = row_to_def(row)
          if d.enabled, do: :ets.insert(@ets, {d.key, d})
        end
      _ -> :ok
    end
  rescue
    _ -> :ok
  end

  defp row_to_def([key, name, desc, ts, tc, mp, qt, sp, lt, rc, mtl, wc, rw, st, en]) do
    %{
      key: key, name: name, description: desc,
      team_size: ts || 1, team_count: tc || 2,
      map_pool: decode(mp, []), queue_type: qt || "casual",
      allow_spectators: en?(sp), lobby_timeout_seconds: lt || 120,
      ready_check_seconds: rc || 15, match_time_limit_seconds: mtl || 0,
      win_conditions: decode(wc, %{}), rewards: decode(rw, %{}),
      settings: decode(st, %{}), enabled: en?(en)
    }
  end

  defp persist(d) do
    key = to_string(d[:key] || d["key"])
    Repo.query(
      """
      INSERT INTO #{@table}
        (`key`, name, description, team_size, team_count, map_pool_json,
         queue_type, allow_spectators, lobby_timeout_seconds, ready_check_seconds,
         match_time_limit_seconds, win_conditions_json, rewards_json,
         settings_json, enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        name=VALUES(name), description=VALUES(description),
        team_size=VALUES(team_size), team_count=VALUES(team_count),
        map_pool_json=VALUES(map_pool_json), queue_type=VALUES(queue_type),
        allow_spectators=VALUES(allow_spectators),
        lobby_timeout_seconds=VALUES(lobby_timeout_seconds),
        ready_check_seconds=VALUES(ready_check_seconds),
        match_time_limit_seconds=VALUES(match_time_limit_seconds),
        win_conditions_json=VALUES(win_conditions_json),
        rewards_json=VALUES(rewards_json), settings_json=VALUES(settings_json),
        enabled=VALUES(enabled), updated_at=NOW()
      """,
      [
        key, f(d, :name, key), f(d, :description, ""),
        f(d, :team_size, 1), f(d, :team_count, 2),
        Jason.encode!(f(d, :map_pool, [])), f(d, :queue_type, "casual"),
        if(f(d, :allow_spectators, true), do: 1, else: 0),
        f(d, :lobby_timeout_seconds, 120), f(d, :ready_check_seconds, 15),
        f(d, :match_time_limit_seconds, 0),
        Jason.encode!(f(d, :win_conditions, %{})),
        Jason.encode!(f(d, :rewards, %{})),
        Jason.encode!(f(d, :settings, %{})),
        if(f(d, :enabled, true), do: 1, else: 0)
      ]
    )
  end

  defp f(m, k, d), do: Map.get(m, k, Map.get(m, to_string(k), d))
  defp en?(1), do: true
  defp en?(true), do: true
  defp en?(_), do: false

  defp decode(nil, d), do: d
  defp decode("", d), do: d
  defp decode(s, d) when is_binary(s), do: case(Jason.decode(s), do: ({:ok, v} -> v; _ -> d))
  defp decode(v, _d) when is_map(v) or is_list(v), do: v
  defp decode(_, d), do: d

  defp seed_defaults_if_empty do
    case Repo.query("SELECT COUNT(*) FROM #{@table}") do
      {:ok, %{rows: [[0]]}} -> Enum.each(TePhoenix.Matches.Defaults.modes(), &persist/1)
      _ -> :ok
    end
  rescue
    _ -> :ok
  end
end
