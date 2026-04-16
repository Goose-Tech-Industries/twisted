defmodule TePhoenix.Waves.Registry do
  @moduledoc """
  Data-driven wave/spawn sequence registry.

  A wave sequence defines a timed series of enemy waves for a map.
  Each wave specifies what to spawn, how many, from which zones,
  with per-wave scaling and boss triggers.

  Table: `game_wave_defs` — auto-created on boot, ETS-cached.

  ## Wave definition shape

      %{
        key: "td_forest_waves",
        name: "Forest Path Waves",
        map_id: 3,
        rounds: [
          %{"wave" => 1, "delay_seconds" => 5, "spawns" => [
            %{"npc_id" => 10, "count" => 3, "zone_key" => "entrance"}
          ]},
          %{"wave" => 2, "delay_seconds" => 20, "spawns" => [
            %{"npc_id" => 10, "count" => 5, "zone_key" => "entrance"},
            %{"npc_id" => 11, "count" => 1, "zone_key" => "entrance"}
          ]},
          %{"wave" => 3, "delay_seconds" => 30, "spawns" => [
            %{"npc_id" => 12, "count" => 1, "zone_key" => "boss_gate", "boss" => true}
          ]}
        ],
        scaling: %{"hp_mult_per_wave" => 0.1, "atk_mult_per_wave" => 0.05},
        on_wave_start: %{},
        on_wave_clear: %{},
        on_sequence_complete: %{},
        loop: false,
        enabled: true
      }
  """

  use GenServer
  require Logger

  alias TePhoenix.Repo

  @table "game_wave_defs"
  @ets :twisted_wave_defs

  def start_link(_opts \\ []), do: GenServer.start_link(__MODULE__, :ok, name: __MODULE__)

  # ── Public API ──────────────────────────────────────────────────

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

  def list_for_map(map_id) do
    list_all() |> Enum.filter(&(&1.map_id == map_id))
  end

  def reload, do: GenServer.call(__MODULE__, :reload)
  def upsert(%{} = d), do: GenServer.call(__MODULE__, {:upsert, d})
  def delete(key), do: GenServer.call(__MODULE__, {:delete, to_string(key)})

  # ── GenServer ───────────────────────────────────────────────────

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

  def handle_call({:upsert, d}, _from, s) do
    persist(d)
    load_all()
    {:reply, :ok, s}
  end

  def handle_call({:delete, key}, _from, s) do
    Repo.query("DELETE FROM #{@table} WHERE `key` = ?", [key])
    load_all()
    {:reply, :ok, s}
  end

  # ── ETS + DB ────────────────────────────────────────────────────

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
      map_id INT,
      rounds_json LONGTEXT NOT NULL,
      scaling_json LONGTEXT,
      on_wave_start_json LONGTEXT,
      on_wave_clear_json LONGTEXT,
      on_sequence_complete_json LONGTEXT,
      settings_json LONGTEXT,
      loop TINYINT(1) DEFAULT 0,
      enabled TINYINT(1) DEFAULT 1,
      updated_at DATETIME NOT NULL
    )
    """)
  rescue
    e -> Logger.error("Waves ensure_table: #{inspect(e)}")
  end

  defp load_all do
    :ets.delete_all_objects(@ets)

    case Repo.query("SELECT `key`, name, description, map_id, rounds_json, scaling_json, on_wave_start_json, on_wave_clear_json, on_sequence_complete_json, settings_json, loop, enabled FROM #{@table}") do
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

  defp row_to_def([key, name, desc, map_id, rounds_j, scaling_j, ws_j, wc_j, sc_j, set_j, loop, enabled]) do
    %{
      key: key,
      name: name,
      description: desc,
      map_id: map_id,
      rounds: decode_json(rounds_j, []),
      scaling: decode_json(scaling_j, %{}),
      on_wave_start: decode_json(ws_j, %{}),
      on_wave_clear: decode_json(wc_j, %{}),
      on_sequence_complete: decode_json(sc_j, %{}),
      settings: decode_json(set_j, %{}),
      loop: loop == 1 or loop == true,
      enabled: enabled == 1 or enabled == true
    }
  end

  defp persist(d) do
    key = to_string(d[:key] || d["key"])
    Repo.query(
      """
      INSERT INTO #{@table}
        (`key`, name, description, map_id, rounds_json, scaling_json,
         on_wave_start_json, on_wave_clear_json, on_sequence_complete_json,
         settings_json, loop, enabled, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        name=VALUES(name), description=VALUES(description), map_id=VALUES(map_id),
        rounds_json=VALUES(rounds_json), scaling_json=VALUES(scaling_json),
        on_wave_start_json=VALUES(on_wave_start_json), on_wave_clear_json=VALUES(on_wave_clear_json),
        on_sequence_complete_json=VALUES(on_sequence_complete_json),
        settings_json=VALUES(settings_json), loop=VALUES(loop),
        enabled=VALUES(enabled), updated_at=NOW()
      """,
      [
        key,
        fetch(d, :name, key),
        fetch(d, :description, ""),
        fetch(d, :map_id, nil),
        Jason.encode!(fetch(d, :rounds, [])),
        Jason.encode!(fetch(d, :scaling, %{})),
        Jason.encode!(fetch(d, :on_wave_start, %{})),
        Jason.encode!(fetch(d, :on_wave_clear, %{})),
        Jason.encode!(fetch(d, :on_sequence_complete, %{})),
        Jason.encode!(fetch(d, :settings, %{})),
        if(fetch(d, :loop, false), do: 1, else: 0),
        if(fetch(d, :enabled, true), do: 1, else: 0)
      ]
    )
  end

  defp fetch(m, k, d), do: Map.get(m, k, Map.get(m, to_string(k), d))

  defp decode_json(nil, d), do: d
  defp decode_json("", d), do: d
  defp decode_json(s, d) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, v} -> v
      _ -> d
    end
  end
  defp decode_json(v, _d) when is_map(v) or is_list(v), do: v
  defp decode_json(_, d), do: d

  defp seed_defaults_if_empty do
    # Seed any missing default defs (not just when table is empty)
    for d <- TePhoenix.Waves.Defaults.defs() do
      key = d[:key] || d["key"]
      case Repo.query("SELECT COUNT(*) FROM #{@table} WHERE `key` = ?", [key]) do
        {:ok, %{rows: [[0]]}} -> persist(d)
        _ -> :ok
      end
    end
  rescue
    _ -> :ok
  end
end
