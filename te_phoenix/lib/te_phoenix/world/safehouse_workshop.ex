defmodule TePhoenix.World.SafehouseWorkshop do
  @moduledoc """
  Safehouse Bastion Workshop: Trophy Runeforging, Underworld Alchemy, and Smuggler Dispatch.

  Provides full MariaDB persistence, timer progression, and stat bonuses for:
    1. Trophy Runeforging: Carving monster skulls and relics into socketed gear runes.
    2. Underworld Alchemy: Brewing contraband potions and tactical gas vials.
    3. Smuggler Dispatch: Sending idle companions on timed underworld heist & recon expeditions.
  """

  require Logger
  alias TePhoenix.Repo
  alias TePhoenix.World.EngineFeatureFlags

  @runes_table "game_safehouse_runes"
  @alembic_table "game_safehouse_alembic"
  @dispatches_table "game_safehouse_dispatches"

  @rune_blueprints %{
    "colossus_skull_rune" => %{
      name: "Rune of the Granite Colossus",
      icon: "💀",
      stat: "parry_window_ms",
      value: 50,
      description: "Expands Active Defense parry window by +50ms (from 150ms to 200ms) and adds +15 Defense"
    },
    "colossus_core_rune" => %{
      name: "Rune of the Molten Core",
      icon: "🔮",
      stat: "fire_damage",
      value: 25,
      description: "Imbues weapons with +25 fiery arcane strike damage"
    },
    "syndicate_crest_rune" => %{
      name: "Rune of the Shadow Syndicate",
      icon: "🗡️",
      stat: "crit_stealth_pct",
      value: 20,
      description: "Grants +20% critical strike chance when striking from shadows"
    },
    "masterwork_key_rune" => %{
      name: "Rune of the Skeleton Key",
      icon: "🔑",
      stat: "fence_payout_pct",
      value: 15,
      description: "Silas pays +15% extra gold for all fenced contraband"
    },
    "bard_lute_rune" => %{
      name: "Rune of Rowan's Resonance",
      icon: "🪕",
      stat: "xp_multiplier_pct",
      value: 30,
      description: "Amplifies all quest, combat, and bounty XP rewards by +30%"
    }
  }

  @alchemy_recipes %{
    "valyrian_elixir" => %{
      name: "Valyrian Restorative Elixir",
      icon: "🧪",
      brew_seconds: 20,
      description: "Instantly restores 150 HP and cures poisons"
    },
    "chloroform_knockout_vial" => %{
      name: "Masterwork Chloroform Vial",
      icon: "🧴",
      brew_seconds: 30,
      description: "Subdues Wanted Alive bounty targets without bloodshed (+15% bounty bonus)"
    },
    "skunkweed_tear_gas" => %{
      name: "Skunkweed Tear Gas",
      icon: "💨",
      brew_seconds: 20,
      description: "Tactical gas vial that blinds all room occupants through windows"
    },
    "ghostwalk_tincture" => %{
      name: "Ghostwalk Shadow Tincture",
      icon: "🌌",
      brew_seconds: 40,
      description: "Grants 15s of complete shadow invisibility and silent movement"
    }
  }

  @dispatch_missions %{
    "syndicate_recon" => %{
      name: "Lowtown Shadow Recon",
      icon: "🕵️",
      duration_seconds: 25,
      gold: 75,
      xp: 120,
      item_name: "Smuggler Intel Cache",
      item_key: "smuggler_intel_cache"
    },
    "contraband_heist" => %{
      name: "Magistrate Cargo Interception",
      icon: "💼",
      duration_seconds: 45,
      gold: 180,
      xp: 250,
      item_name: "Forged City Seal",
      item_key: "forged_city_seal"
    },
    "colossus_excavation" => %{
      name: "Ashveil Relic Excavation",
      icon: "⛏️",
      duration_seconds: 60,
      gold: 320,
      xp: 450,
      item_name: "Runic Granite Shards",
      item_key: "runic_granite_shards"
    }
  }

  @doc """
  Ensures the safehouse workshop tables exist.
  """
  def ensure_schema! do
    case :persistent_term.get({__MODULE__, :schema_ready}, false) do
      true ->
        :ok

      false ->
        Repo.query!("""
        CREATE TABLE IF NOT EXISTS #{@runes_table} (
          id INT AUTO_INCREMENT PRIMARY KEY,
          property_id INT NOT NULL,
          item_id VARCHAR(64) NOT NULL,
          item_name VARCHAR(128) NOT NULL,
          rune_key VARCHAR(64) NOT NULL,
          rune_name VARCHAR(128) NOT NULL,
          rune_icon VARCHAR(16) DEFAULT '✨',
          bonus_stat VARCHAR(64) NOT NULL,
          bonus_value INT NOT NULL DEFAULT 0,
          socket_slot VARCHAR(32) NOT NULL DEFAULT 'primary',
          created_at DATETIME NOT NULL,
          INDEX idx_prop (property_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        Repo.query!("""
        CREATE TABLE IF NOT EXISTS #{@alembic_table} (
          id INT AUTO_INCREMENT PRIMARY KEY,
          property_id INT NOT NULL,
          recipe_key VARCHAR(64) NOT NULL,
          concoction_name VARCHAR(128) NOT NULL,
          icon VARCHAR(16) DEFAULT '🧪',
          quantity INT NOT NULL DEFAULT 1,
          brew_seconds INT NOT NULL DEFAULT 30,
          started_at DATETIME NOT NULL,
          finishes_at DATETIME NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'brewing',
          INDEX idx_prop (property_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        Repo.query!("""
        CREATE TABLE IF NOT EXISTS #{@dispatches_table} (
          id INT AUTO_INCREMENT PRIMARY KEY,
          property_id INT NOT NULL,
          companion_id INT NOT NULL,
          companion_name VARCHAR(128) NOT NULL,
          mission_type VARCHAR(64) NOT NULL,
          mission_name VARCHAR(128) NOT NULL,
          icon VARCHAR(16) DEFAULT '💼',
          duration_seconds INT NOT NULL DEFAULT 30,
          started_at DATETIME NOT NULL,
          finishes_at DATETIME NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'active',
          reward_gold INT NOT NULL DEFAULT 0,
          reward_xp INT NOT NULL DEFAULT 0,
          reward_item_name VARCHAR(128),
          reward_item_key VARCHAR(64),
          INDEX idx_prop (property_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        :persistent_term.put({__MODULE__, :schema_ready}, true)
        :ok
    end
  end

  @doc """
  Retrieves the full workshop state for a safehouse (runes, active brews, dispatches).
  """
  def get_workshop_state(property_id) when is_integer(property_id) do
    ensure_schema!()

    runes = list_socketed_runes(property_id)
    alembic = list_alembic_brews(property_id)
    dispatches = list_dispatches(property_id)

    %{
      property_id: property_id,
      runes: runes,
      available_runes: Map.values(@rune_blueprints),
      alembic: alembic,
      available_recipes: Map.values(@alchemy_recipes),
      dispatches: dispatches,
      available_missions: Map.values(@dispatch_missions),
      is_enabled: EngineFeatureFlags.is_enabled?("runeforge_dispatch_enabled")
    }
  end

  # ============================================================================
  # 1. RUNEFORGING ANVIL
  # ============================================================================

  def socket_rune(property_id, item_id, item_name, rune_key, slot \\ "primary") do
    ensure_schema!()

    unless EngineFeatureFlags.is_enabled?("runeforge_dispatch_enabled") do
      {:error, "Runeforging is currently disabled by server policy"}
    else
      blueprint = Map.get(@rune_blueprints, rune_key)

      if is_nil(blueprint) do
        {:error, "Unknown rune blueprint: #{rune_key}"}
      else
        now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)

        # Remove any existing rune in that slot on this item
        Repo.query!(
          "DELETE FROM #{@runes_table} WHERE property_id = ? AND item_id = ? AND socket_slot = ?",
          [property_id, to_string(item_id), slot]
        )

        Repo.query!(
          """
          INSERT INTO #{@runes_table}
          (property_id, item_id, item_name, rune_key, rune_name, rune_icon, bonus_stat, bonus_value, socket_slot, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
          [
            property_id,
            to_string(item_id),
            item_name,
            rune_key,
            blueprint.name,
            blueprint.icon,
            blueprint.stat,
            blueprint.value,
            slot,
            now
          ]
        )

        {:ok,
         %{
           message: "Carved #{blueprint.name} into #{item_name}! Active bonus: +#{blueprint.value} #{blueprint.stat}.",
           rune_key: rune_key,
           item_id: item_id,
           socket_slot: slot,
           bonus_stat: blueprint.stat,
           bonus_value: blueprint.value
         }}
      end
    end
  end

  def unsocket_rune(property_id, rune_id) do
    ensure_schema!()

    case Repo.query("DELETE FROM #{@runes_table} WHERE property_id = ? AND id = ?", [property_id, rune_id]) do
      {:ok, %{num_rows: 1}} ->
        {:ok, %{message: "Rune extracted back into your safehouse vault."}}

      _ ->
        {:error, "Rune not found"}
    end
  end

  def list_socketed_runes(property_id) do
    ensure_schema!()

    case Repo.query(
           "SELECT id, item_id, item_name, rune_key, rune_name, rune_icon, bonus_stat, bonus_value, socket_slot FROM #{@runes_table} WHERE property_id = ?",
           [property_id]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, item_id, item_name, rkey, rname, ricon, bstat, bval, slot] ->
          %{
            id: id,
            item_id: item_id,
            item_name: item_name,
            rune_key: rkey,
            rune_name: rname,
            rune_icon: ricon,
            bonus_stat: bstat,
            bonus_value: bval,
            socket_slot: slot
          }
        end)

      _ ->
        []
    end
  end

  # ============================================================================
  # 2. UNDERWORLD ALCHEMY ALEMBIC
  # ============================================================================

  def brew_concoction(property_id, recipe_key) do
    ensure_schema!()

    unless EngineFeatureFlags.is_enabled?("runeforge_dispatch_enabled") do
      {:error, "Alchemy alembic is currently disabled by server policy"}
    else
      recipe = Map.get(@alchemy_recipes, recipe_key)

      if is_nil(recipe) do
        {:error, "Unknown alchemy recipe: #{recipe_key}"}
      else
        now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)
        finishes_at = NaiveDateTime.add(now, recipe.brew_seconds, :second)

        Repo.query!(
          """
          INSERT INTO #{@alembic_table}
          (property_id, recipe_key, concoction_name, icon, quantity, brew_seconds, started_at, finishes_at, status)
          VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'brewing')
          """,
          [property_id, recipe_key, recipe.name, recipe.icon, recipe.brew_seconds, now, finishes_at]
        )

        {:ok,
         %{
           message: "Alembic ignited! Brewing #{recipe.name} (ready in #{recipe.brew_seconds}s).",
           recipe_key: recipe_key,
           finishes_at: finishes_at
         }}
      end
    end
  end

  def claim_concoction(property_id, brew_id) do
    ensure_schema!()
    now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)

    case Repo.query(
           "SELECT recipe_key, concoction_name, finishes_at, status FROM #{@alembic_table} WHERE property_id = ? AND id = ?",
           [property_id, brew_id]
         ) do
      {:ok, %{rows: [[rkey, cname, finishes_at, status]]}} ->
        cond do
          status == "claimed" ->
            {:error, "Concoction already claimed"}

          NaiveDateTime.compare(now, finishes_at) == :lt ->
            remaining = NaiveDateTime.diff(finishes_at, now)
            {:error, "Alembic still bubbling! #{remaining}s remaining."}

          true ->
            Repo.query!("UPDATE #{@alembic_table} SET status = 'claimed' WHERE id = ?", [brew_id])
            {:ok, %{message: "Bottled #{cname}! Added to your safehouse stash.", item_key: rkey, item_name: cname}}
        end

      _ ->
        {:error, "Brew batch not found"}
    end
  end

  def list_alembic_brews(property_id) do
    ensure_schema!()
    now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)

    case Repo.query(
           "SELECT id, recipe_key, concoction_name, icon, quantity, brew_seconds, started_at, finishes_at, status FROM #{@alembic_table} WHERE property_id = ? ORDER BY id DESC LIMIT 10",
           [property_id]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, rkey, cname, icon, qty, bsec, started, finishes, status] ->
          is_ready = status != "claimed" and NaiveDateTime.compare(now, finishes) != :lt
          time_remaining = if is_ready, do: 0, else: max(0, NaiveDateTime.diff(finishes, now))

          %{
            id: id,
            recipe_key: rkey,
            concoction_name: cname,
            icon: icon,
            quantity: qty,
            brew_seconds: bsec,
            started_at: started,
            finishes_at: finishes,
            status: if(is_ready, do: "ready", else: status),
            seconds_remaining: time_remaining
          }
        end)

      _ ->
        []
    end
  end

  # ============================================================================
  # 3. SMUGGLER EXPEDITION DISPATCH
  # ============================================================================

  def start_dispatch(property_id, companion_id, companion_name, mission_type) do
    ensure_schema!()

    unless EngineFeatureFlags.is_enabled?("runeforge_dispatch_enabled") do
      {:error, "Companion dispatch is currently disabled by server policy"}
    else
      mission = Map.get(@dispatch_missions, mission_type)

      if is_nil(mission) do
        {:error, "Unknown dispatch mission: #{mission_type}"}
      else
        now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)
        finishes_at = NaiveDateTime.add(now, mission.duration_seconds, :second)

        Repo.query!(
          """
          INSERT INTO #{@dispatches_table}
          (property_id, companion_id, companion_name, mission_type, mission_name, icon, duration_seconds, started_at, finishes_at, status, reward_gold, reward_xp, reward_item_name, reward_item_key)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
          """,
          [
            property_id,
            companion_id,
            companion_name,
            mission_type,
            mission.name,
            mission.icon,
            mission.duration_seconds,
            now,
            finishes_at,
            mission.gold,
            mission.xp,
            mission.item_name,
            mission.item_key
          ]
        )

        {:ok,
         %{
           message: "Dispatched #{companion_name} on '#{mission.name}'! Return expected in #{mission.duration_seconds}s.",
           mission_type: mission_type,
           finishes_at: finishes_at
         }}
      end
    end
  end

  def claim_dispatch(property_id, dispatch_id) do
    ensure_schema!()
    now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)

    case Repo.query(
           "SELECT companion_name, mission_name, reward_gold, reward_xp, reward_item_name, finishes_at, status FROM #{@dispatches_table} WHERE property_id = ? AND id = ?",
           [property_id, dispatch_id]
         ) do
      {:ok, %{rows: [[cname, mname, rgold, rxp, ritem, finishes_at, status]]}} ->
        cond do
          status == "claimed" ->
            {:error, "Expedition spoils already claimed"}

          NaiveDateTime.compare(now, finishes_at) == :lt ->
            remaining = NaiveDateTime.diff(finishes_at, now)
            {:error, "#{cname} is still on the mission! #{remaining}s remaining."}

          true ->
            Repo.query!("UPDATE #{@dispatches_table} SET status = 'claimed' WHERE id = ?", [dispatch_id])

            {:ok,
             %{
               message: "#{cname} returned victorious from '#{mname}'! Acquired +#{rgold}g, +#{rxp} XP, and #{ritem}.",
               reward_gold: rgold,
               reward_xp: rxp,
               reward_item: ritem
             }}
        end

      _ ->
        {:error, "Dispatch mission not found"}
    end
  end

  def list_dispatches(property_id) do
    ensure_schema!()
    now = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)

    case Repo.query(
           "SELECT id, companion_id, companion_name, mission_type, mission_name, icon, duration_seconds, started_at, finishes_at, status, reward_gold, reward_xp, reward_item_name FROM #{@dispatches_table} WHERE property_id = ? ORDER BY id DESC LIMIT 10",
           [property_id]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, cid, cname, mtype, mname, icon, dsec, started, finishes, status, rgold, rxp, ritem] ->
          is_complete = status != "claimed" and NaiveDateTime.compare(now, finishes) != :lt
          time_remaining = if is_complete, do: 0, else: max(0, NaiveDateTime.diff(finishes, now))

          %{
            id: id,
            companion_id: cid,
            companion_name: cname,
            mission_type: mtype,
            mission_name: mname,
            icon: icon,
            duration_seconds: dsec,
            started_at: started,
            finishes_at: finishes,
            status: if(is_complete, do: "completed", else: status),
            seconds_remaining: time_remaining,
            reward_gold: rgold,
            reward_xp: rxp,
            reward_item_name: ritem
          }
        end)

      _ ->
        []
    end
  end
end
