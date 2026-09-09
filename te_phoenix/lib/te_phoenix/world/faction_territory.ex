defmodule TePhoenix.World.FactionTerritory do
  @moduledoc """
  Dynamic Faction Territory Wars & District Turf Control Engine.

  Manages territorial control across town sectors between three primary factions:
    * `:syndicate` - Lowtown Thieves, Smugglers, and Silas's Network
    * `:watch`     - City Magistrate Watch & Halberdiers
    * `:cult`      - Sunken Ward Abyssal Cultists

  Shifting influence dynamically alters:
    - Town guard spawns and patrol aggression
    - Safehouse deed tax rates and Silas black market buy/sell margins
    - Nocturnal curfews and martial law lockdowns
  """

  require Logger
  alias TePhoenix.Repo
  alias TePhoenix.World.EngineFeatureFlags

  @table "game_district_territories"

  @default_districts [
    %{
      key: "lowtown",
      name: "Lowtown Waterfront & Docks",
      controlling: "syndicate",
      syndicate: 65,
      watch: 25,
      cult: 10,
      martial_law: false,
      tax: 5,
      guard: "Syndicate Thugs & Shadow Runners"
    },
    %{
      key: "haven_plaza",
      name: "Haven High Plaza & Magistrate Quarter",
      controlling: "watch",
      syndicate: 20,
      watch: 70,
      cult: 10,
      martial_law: false,
      tax: 12,
      guard: "City Watch Halberdiers & Inquisitors"
    },
    %{
      key: "sunken_ward",
      name: "The Sunken Ward & Cisterns",
      controlling: "cult",
      syndicate: 30,
      watch: 15,
      cult: 55,
      martial_law: false,
      tax: 0,
      guard: "Drowned Zealots & Void Warlocks"
    },
    %{
      key: "iron_foundry",
      name: "Iron Foundry & Blacksmith Row",
      controlling: "watch",
      syndicate: 42,
      watch: 48,
      cult: 10,
      martial_law: false,
      tax: 8,
      guard: "Armored Foundry Militia"
    }
  ]

  @doc """
  Ensures the territory table exists.
  """
  def ensure_schema! do
    case :persistent_term.get({__MODULE__, :schema_ready}, false) do
      true ->
        :ok

      false ->
        Repo.query!("""
        CREATE TABLE IF NOT EXISTS #{@table} (
          district_key VARCHAR(64) PRIMARY KEY,
          name VARCHAR(128) NOT NULL,
          controlling_faction VARCHAR(32) NOT NULL DEFAULT 'watch',
          syndicate_influence INT NOT NULL DEFAULT 33,
          watch_influence INT NOT NULL DEFAULT 33,
          cult_influence INT NOT NULL DEFAULT 34,
          martial_law_active TINYINT(1) NOT NULL DEFAULT 0,
          tax_rate_pct INT NOT NULL DEFAULT 10,
          guard_type VARCHAR(64) NOT NULL DEFAULT 'City Watch',
          updated_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        seed_default_districts!()
        :persistent_term.put({__MODULE__, :schema_ready}, true)
        :ok
    end
  end

  @doc """
  Seeds the default 4 town districts if absent.
  """
  def seed_default_districts! do
    now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)

    Enum.each(@default_districts, fn d ->
      Repo.query!(
        """
        INSERT IGNORE INTO #{@table}
        (district_key, name, controlling_faction, syndicate_influence, watch_influence, cult_influence, martial_law_active, tax_rate_pct, guard_type, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
          d.key,
          d.name,
          d.controlling,
          d.syndicate,
          d.watch,
          d.cult,
          if(d.martial_law, do: 1, else: 0),
          d.tax,
          d.guard,
          now
        ]
      )
    end)
  end

  @doc """
  Lists all districts with live territory balances.
  """
  def list_territories do
    ensure_schema!()

    case Repo.query("""
      SELECT district_key, name, controlling_faction, syndicate_influence, watch_influence, cult_influence, martial_law_active, tax_rate_pct, guard_type, updated_at
      FROM #{@table}
      ORDER BY district_key ASC
    """) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [key, name, ctrl, syn, wat, clt, mlaw, tax, guard, up_at] ->
          %{
            key: key,
            name: name,
            controlling_faction: ctrl,
            syndicate_pct: syn,
            watch_pct: wat,
            cult_pct: clt,
            martial_law_active: mlaw == 1,
            tax_rate_pct: tax,
            guard_type: guard,
            updated_at: up_at
          }
        end)

      _ ->
        []
    end
  end

  @doc """
  Shifts influence for a faction in a district (+10 to +25) and rebalances others.
  """
  def shift_influence(district_key, faction_str, delta, reason \\ nil) when is_integer(delta) do
    ensure_schema!()

    unless EngineFeatureFlags.is_enabled?("faction_territory_enabled") do
      {:error, "Faction territory wars are currently disabled by server policy"}
    else
      faction = to_string(faction_str) |> String.downcase()

      case Repo.query("SELECT syndicate_influence, watch_influence, cult_influence FROM #{@table} WHERE district_key = ?", [district_key]) do
        {:ok, %{rows: [[syn, wat, clt]]}} ->
          {new_syn, new_wat, new_clt} =
            case faction do
              "syndicate" ->
                s = min(100, max(0, syn + delta))
                remaining = 100 - s
                {s, round(remaining * 0.7), round(remaining * 0.3)}

              "watch" ->
                w = min(100, max(0, wat + delta))
                remaining = 100 - w
                {round(remaining * 0.6), w, round(remaining * 0.4)}

              "cult" ->
                c = min(100, max(0, clt + delta))
                remaining = 100 - c
                {round(remaining * 0.5), round(remaining * 0.5), c}

              _ ->
                {syn, wat, clt}
            end

          # Determine leading faction
          new_controlling =
            cond do
              new_syn >= new_wat and new_syn >= new_clt -> "syndicate"
              new_wat >= new_syn and new_wat >= new_clt -> "watch"
              true -> "cult"
            end

          new_guard =
            case new_controlling do
              "syndicate" -> "Syndicate Thugs & Shadow Runners"
              "watch" -> "City Watch Halberdiers & Inquisitors"
              "cult" -> "Drowned Zealots & Void Warlocks"
            end

          now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)

          Repo.query!(
            """
            UPDATE #{@table}
            SET syndicate_influence = ?, watch_influence = ?, cult_influence = ?, controlling_faction = ?, guard_type = ?, updated_at = ?
            WHERE district_key = ?
            """,
            [new_syn, new_wat, new_clt, new_controlling, new_guard, now, district_key]
          )

          payload = %{
            district_key: district_key,
            controlling_faction: new_controlling,
            syndicate_pct: new_syn,
            watch_pct: new_wat,
            cult_pct: new_clt,
            guard_type: new_guard,
            reason: reason || "Influence shift triggered by #{faction}"
          }

          TePhoenixWeb.Endpoint.broadcast("territory:updates", "territory_shifted", payload)
          {:ok, payload}

        _ ->
          {:error, "District not found"}
      end
    end
  end

  @doc """
  Triggers a dynamic turf skirmish event between factions in a district.
  """
  def trigger_turf_skirmish(district_key, attacking_faction) do
    shift_influence(district_key, attacking_faction, 15, "Turf skirmish victory by #{attacking_faction} forces!")
  end

  @doc """
  Toggles martial law in a district.
  """
  def toggle_martial_law(district_key, is_active) do
    ensure_schema!()
    now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)

    Repo.query!(
      "UPDATE #{@table} SET martial_law_active = ?, updated_at = ? WHERE district_key = ?",
      [if(is_active, do: 1, else: 0), now, district_key]
    )

    {:ok, %{district_key: district_key, martial_law_active: is_active}}
  end
end
