defmodule TePhoenix.World.EngineFeatureFlags do
  @moduledoc """
  The Master Feature Matrix & Toggle Engine for Twisted RPG.

  Provides idempotent persistence, zero-cost ETS-cached reads, real-time
  Phoenix Channel synchronization, and dynamic runtime control over all major
  gameplay systems:

    1. colossus_raids_enabled
    2. npc_schedules_enabled
    3. bounties_fence_enabled
    4. safehouse_vaults_enabled
    5. godseye_sonar_enabled
    6. runeforge_dispatch_enabled
    7. spoken_catacombs_enabled
    8. faction_territory_enabled
    9. forensic_mysteries_enabled
    10. voice_spellcraft_enabled
  """

  require Logger
  alias TePhoenix.Repo

  @table "game_engine_feature_flags"

  @default_flags [
    %{
      key: "colossus_raids_enabled",
      label: "Apex Raid: Ashveil Colossus & Planet Mado QTE",
      description: "Engage the multi-limb Colossus with 150ms Active Defense parry/dodge reactions.",
      category: "combat",
      enabled: true
    },
    %{
      key: "npc_schedules_enabled",
      label: "Autonomous Town Living Schedules & Circadian Shift",
      description: "NPCs dynamically migrate between work stalls, taverns, and homes according to town time.",
      category: "world",
      enabled: true
    },
    %{
      key: "bounties_fence_enabled",
      label: "Lowtown Bounty Notice Board & Silas Black Market Fence",
      description: "Accept wanted dead/alive contracts and trade illicit contraband with the fence syndicate.",
      category: "underworld",
      enabled: true
    },
    %{
      key: "safehouse_vaults_enabled",
      label: "Safehouse Loot Vaults, Trophy Wall & Sentry Guards",
      description: "Store gold/gear, mount monster trophies for buffs, and station companions as guards.",
      category: "property",
      enabled: true
    },
    %{
      key: "godseye_sonar_enabled",
      label: "God's Eye Acoustic Sonar Radar & Soul Wiretap",
      description: "Orbital radar grid with acoustic sonar pinging and live NPC subconscious mind telemetry.",
      category: "telemetry",
      enabled: true
    },
    %{
      key: "runeforge_dispatch_enabled",
      label: "Safehouse Bastion: Trophy Runeforging & Smuggler Dispatch",
      description: "Carve monster trophies into socketed gear runes, brew alchemy gas, and dispatch offline missions.",
      category: "crafting",
      enabled: true
    },
    %{
      key: "spoken_catacombs_enabled",
      label: "Spoken Dungeon Catacombs On-Demand via Uile",
      description: "Speak multi-floor procedural crypt generation prompts to Uile to instantly manifest playable dungeons.",
      category: "dungeon",
      enabled: true
    },
    %{
      key: "faction_territory_enabled",
      label: "Dynamic Faction Territory Wars & District Turf Control",
      description: "Lowtown Syndicate vs City Watch vs Cults battling for district control, guards, and taxes.",
      category: "factions",
      enabled: true
    },
    %{
      key: "forensic_mysteries_enabled",
      label: "Forensic Crime Mystery & Magistrate Courtroom Trials",
      description: "Autonomous murder mysteries, forensic clue collection, interrogations, and courtroom verdicts.",
      category: "underworld",
      enabled: true
    },
    %{
      key: "voice_spellcraft_enabled",
      label: "Real-Time Spoken Spellcrafting & Squad Voice Tactics",
      description: "Mic-based voice spell incantations and tactical spoken companion voice directives.",
      category: "voice",
      enabled: true
    }
  ]

  @doc """
  Ensures the MariaDB table and cache exist.
  """
  def ensure_schema! do
    case :persistent_term.get({__MODULE__, :schema_ready}, false) do
      true ->
        :ok

      false ->
        Repo.query!("""
        CREATE TABLE IF NOT EXISTS #{@table} (
          feature_key VARCHAR(64) PRIMARY KEY,
          label VARCHAR(128) NOT NULL,
          description TEXT,
          category VARCHAR(32) NOT NULL DEFAULT 'general',
          is_enabled TINYINT(1) NOT NULL DEFAULT 1,
          updated_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        seed_default_flags!()
        :persistent_term.put({__MODULE__, :schema_ready}, true)
        :ok
    end
  end

  @doc """
  Seeds the default 10 feature flags if absent from database and warm cache.
  """
  def seed_default_flags! do
    now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)

    Enum.each(@default_flags, fn flag ->
      Repo.query!(
        """
        INSERT IGNORE INTO #{@table} (feature_key, label, description, category, is_enabled, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [flag.key, flag.label, flag.description, flag.category, if(flag.enabled, do: 1, else: 0), now]
      )
    end)

    sync_cache_from_db!()
  end

  @doc """
  Reads all flags from DB into persistent_term cache.
  """
  def sync_cache_from_db! do
    case Repo.query("SELECT feature_key, is_enabled FROM #{@table}") do
      {:ok, %{rows: rows}} ->
        map =
          Enum.into(rows, %{}, fn [key, enabled] ->
            {key, enabled == 1}
          end)

        :persistent_term.put({__MODULE__, :flags_cache}, map)
        :ok

      _ ->
        :ok
    end
  end

  @doc """
  Fast cached lookup to check if a feature is enabled.
  """
  def is_enabled?(feature_key, default \\ true) do
    flags_map = :persistent_term.get({__MODULE__, :flags_cache}, nil)

    if is_nil(flags_map) do
      ensure_schema!()
      sync_cache_from_db!()
      flags_map = :persistent_term.get({__MODULE__, :flags_cache}, %{})
      Map.get(flags_map, to_string(feature_key), default)
    else
      Map.get(flags_map, to_string(feature_key), default)
    end
  end

  @doc """
  Toggles a feature on or off in MariaDB, updates cache, and broadcasts change.
  """
  def toggle_flag(feature_key, is_enabled) when is_boolean(is_enabled) do
    ensure_schema!()
    key_str = to_string(feature_key)
    now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)

    Repo.query!(
      """
      UPDATE #{@table}
      SET is_enabled = ?, updated_at = ?
      WHERE feature_key = ?
      """,
      [if(is_enabled, do: 1, else: 0), now, key_str]
    )

    current_map = :persistent_term.get({__MODULE__, :flags_cache}, %{})
    updated_map = Map.put(current_map, key_str, is_enabled)
    :persistent_term.put({__MODULE__, :flags_cache}, updated_map)

    payload = %{
      feature_key: key_str,
      is_enabled: is_enabled,
      updated_at: now
    }

    TePhoenixWeb.Endpoint.broadcast("engine:feature_flags", "flag_toggled", payload)
    {:ok, payload}
  end

  @doc """
  Lists all feature flags with metadata for GM/Admin dashboard.
  """
  def list_all_flags do
    ensure_schema!()

    case Repo.query("""
      SELECT feature_key, label, description, category, is_enabled, updated_at
      FROM #{@table}
      ORDER BY category ASC, feature_key ASC
    """) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [key, label, desc, cat, enabled, updated_at] ->
          %{
            feature_key: key,
            label: label,
            description: desc,
            category: cat,
            is_enabled: enabled == 1,
            updated_at: updated_at
          }
        end)

      _ ->
        []
    end
  end

  @doc """
  Bulk updates flags from a map of %{"colossus_raids_enabled" => true, ...}
  """
  def set_all_flags(flags_map) when is_map(flags_map) do
    ensure_schema!()

    Enum.each(flags_map, fn {key, val} ->
      toggle_flag(key, val == true or val == 1 or val == "true")
    end)

    list_all_flags()
  end
end
