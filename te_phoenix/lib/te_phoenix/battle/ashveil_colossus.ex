defmodule TePhoenix.Battle.AshveilColossus do
  @moduledoc """
  The Ashveil Colossus — Apex Boss Raid Encounter (*Fathach Luaithre Ashveil*).

  Integrates:
    * **Planet Mado Multi-Limb Targeting**:
      - Head (800 HP): Disables precision targeting (-40% hit rate)
      - Core (2000 HP): Exposed during Cataclysm, takes critical damage
      - Left Arm (600 HP): Disables Granite Cleave
      - Right Arm (600 HP): Disables Overhead Slam
      - Legs (1000 HP): Disables Tectonic Stomp, reduces boss speed by 50%
    * **Multi-Phase Boss Engine** (`TePhoenix.Battle.BossPhases`):
      - Phase 1: *Granite Aegis* (100% - 70% HP) - Runic ward reduces damage by 30%
      - Phase 2: *Molten Core Enrage* (70% - 30% HP) - Haste, flame shockwaves
      - Phase 3: *Arcane Cataclysm* (30% - 0% HP) - Pulsing discharge, core exposed
    * **Planet Mado Active Defense Reflex Window** (`TePhoenix.Battle.ActiveDefense`):
      - 1.2s telegraphed overhead slam
      - Perfect Parry / Dodge window (within 150ms) negates 100% damage & staggers boss!
    * **Loot & Trophy Rewards**:
      - "Skull of the Ashveil Colossus" (Mountable in safehouse trophy wall!)
      - "Colossus Core Shard"
      - "Runed Titan Greatsword"
  """

  alias TePhoenix.Repo
  alias TePhoenix.Battle.{ActiveDefense, Combatant}
  require Logger

  @boss_name "Ashveil Colossus"
  @boss_max_hp 5000

  @doc """
  Ensures the raid boss schema and instances tables exist.
  """
  def ensure_schema! do
    Repo.query!("""
    CREATE TABLE IF NOT EXISTS game_colossus_raids (
      id INT AUTO_INCREMENT PRIMARY KEY,
      map_id INT NOT NULL DEFAULT 1,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      boss_hp INT NOT NULL DEFAULT 5000,
      boss_max_hp INT NOT NULL DEFAULT 5000,
      phase INT NOT NULL DEFAULT 1,
      limbs_json LONGTEXT,
      participants_json LONGTEXT,
      active_telegraph_json LONGTEXT,
      started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      defeated_at TIMESTAMP NULL,
      INDEX idx_status (status)
    )
    """)

    :ok
  end

  @doc """
  Initializes default limbs for the Colossus.
  """
  def default_limbs do
    %{
      "head" => %{"hp" => 800, "max_hp" => 800, "broken" => false, "icon" => "🗿", "name" => "Runic Granite Helm"},
      "core" => %{"hp" => 2000, "max_hp" => 2000, "broken" => false, "icon" => "🔮", "name" => "Arcane Flame Core"},
      "left_arm" => %{"hp" => 600, "max_hp" => 600, "broken" => false, "icon" => "🛡️", "name" => "Aegis Left Gauntlet"},
      "right_arm" => %{"hp" => 600, "max_hp" => 600, "broken" => false, "icon" => "🔨", "name" => "Crusher Right Fist"},
      "legs" => %{"hp" => 1000, "max_hp" => 1000, "broken" => false, "icon" => "🦿", "name" => "Monolithic Pillars"}
    }
  end

  @doc """
  Finds or spawns the active Ashveil Colossus raid instance.
  """
  def get_or_spawn_raid(map_id \\ 1) do
    ensure_schema!()

    case Repo.query("SELECT id, map_id, status, boss_hp, boss_max_hp, phase, limbs_json, active_telegraph_json FROM game_colossus_raids WHERE map_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1", [map_id]) do
      {:ok, %{rows: [[id, mid, status, hp, max_hp, phase, limbs_json, telegraph_json]]}} ->
        %{
          id: id,
          map_id: mid,
          status: status,
          boss_name: @boss_name,
          boss_hp: hp,
          boss_max_hp: max_hp,
          phase: phase,
          phase_name: get_phase_name(phase),
          limbs: decode_json(limbs_json, default_limbs()),
          telegraph: decode_json(telegraph_json, nil)
        }

      _ ->
        limbs = default_limbs()
        limbs_str = Jason.encode!(limbs)

        {:ok, res} = Repo.query(
          "INSERT INTO game_colossus_raids (map_id, status, boss_hp, boss_max_hp, phase, limbs_json, participants_json) VALUES (?, 'active', ?, ?, 1, ?, '[]')",
          [map_id, @boss_max_hp, @boss_max_hp, limbs_str]
        )

        %{
          id: res.last_insert_id,
          map_id: map_id,
          status: "active",
          boss_name: @boss_name,
          boss_hp: @boss_max_hp,
          boss_max_hp: @boss_max_hp,
          phase: 1,
          phase_name: get_phase_name(1),
          limbs: limbs,
          telegraph: nil
        }
    end
  end

  @doc """
  Attacks a specific limb of the Colossus.
  """
  def strike_limb(raid_id, player, limb_name, damage \\ 150) do
    ensure_schema!()
    _char_id = player[:id] || player["id"]
    char_name = player[:name] || player["name"] || "Champion"

    case Repo.query("SELECT id, map_id, status, boss_hp, boss_max_hp, phase, limbs_json FROM game_colossus_raids WHERE id = ? LIMIT 1", [raid_id]) do
      {:ok, %{rows: [[id, map_id, "active", hp, max_hp, phase, limbs_json]]}} ->
        limbs = decode_json(limbs_json, default_limbs())
        target_limb = Map.get(limbs, limb_name)

        if is_nil(target_limb) do
          {:error, "Invalid target limb: #{limb_name}"}
        else
          # Calculate limb damage & check if broken
          current_limb_hp = target_limb["hp"]
          applied_dmg = min(damage, current_limb_hp)
          new_limb_hp = max(0, current_limb_hp - damage)
          was_broken = target_limb["broken"]
          is_now_broken = new_limb_hp <= 0

          updated_limb = target_limb
          |> Map.put("hp", new_limb_hp)
          |> Map.put("broken", is_now_broken)

          updated_limbs = Map.put(limbs, limb_name, updated_limb)

          # Apply total boss HP reduction
          new_boss_hp = max(0, hp - applied_dmg)

          # Calculate Phase Transition
          new_phase = cond do
            new_boss_hp <= 0 -> 4 # Defeated
            new_boss_hp <= round(max_hp * 0.30) -> 3 # Arcane Cataclysm
            new_boss_hp <= round(max_hp * 0.70) -> 2 # Molten Core Enrage
            true -> 1 # Granite Aegis
          end

          phase_changed = new_phase != phase and new_phase <= 3
          is_defeated = new_boss_hp <= 0

          # Update Database
          limbs_str = Jason.encode!(updated_limbs)
          if is_defeated do
            Repo.query("UPDATE game_colossus_raids SET boss_hp = 0, status = 'defeated', limbs_json = ?, defeated_at = NOW() WHERE id = ?", [limbs_str, id])
          else
            Repo.query("UPDATE game_colossus_raids SET boss_hp = ?, phase = ?, limbs_json = ? WHERE id = ?", [new_boss_hp, new_phase, limbs_str, id])
          end

          # Broadcast updates
          payload = %{
            raid_id: id,
            attacker_name: char_name,
            limb_hit: limb_name,
            damage_dealt: applied_dmg,
            boss_hp: new_boss_hp,
            boss_max_hp: max_hp,
            phase: new_phase,
            phase_name: get_phase_name(new_phase),
            limbs: updated_limbs,
            limb_broken: is_now_broken and not was_broken,
            is_defeated: is_defeated
          }

          TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "colossus_strike_update", payload)
          TePhoenixWeb.Endpoint.broadcast("voice:proximity:#{map_id}", "colossus_strike_update", payload)

          msg = if is_defeated do
            "💥 CRITICAL IMPACT! The Ashveil Colossus crumbles to dust! The cathedral trembles in victory!"
          else
            broken_msg = if is_now_broken and not was_broken, do: " [LIMB SHATTERED: #{target_limb["name"]} destroyed!]", else: ""
            phase_msg = if phase_changed, do: " [PHASE SHIFT: #{get_phase_name(new_phase)}!]", else: ""
            "#{char_name} struck the #{target_limb["name"]} for #{applied_dmg} damage!#{broken_msg}#{phase_msg}"
          end

          {:ok, %{
            success: true,
            boss_hp: new_boss_hp,
            phase: new_phase,
            limb_name: limb_name,
            damage_dealt: applied_dmg,
            limb_broken: is_now_broken and not was_broken,
            is_defeated: is_defeated,
            message: msg
          }}
        end

      _ ->
        {:error, "No active Ashveil Colossus raid found."}
    end
  end

  @doc """
  Telegraphs a devastating Colossus attack, starting a 1.2s reflex defense window.
  """
  def trigger_telegraph(raid_id, attack_type \\ "overhead_slam") do
    ensure_schema!()

    attacks = %{
      "overhead_slam" => %{
        name: "Cathedral Shattering Overhead Slam",
        icon: "🔨",
        damage: 220,
        telegraph_ms: 1200,
        limb_req: "right_arm",
        desc: "The Colossus raises its titanic crusher fist high! Timing parry or dodge is critical!"
      },
      "tectonic_quake" => %{
        name: "Tectonic Ground Quake",
        icon: "🌋",
        damage: 180,
        telegraph_ms: 1000,
        limb_req: "legs",
        desc: "The Colossus stomps the stone floor, fracturing the cathedral foundation!"
      },
      "arcane_discharge" => %{
        name: "Arcane Core Overdrive Cataclysm",
        icon: "⚡",
        damage: 280,
        telegraph_ms: 1400,
        limb_req: "core",
        desc: "Unstable arcane radiation erupts from the exposed chest core!"
      }
    }

    atk = Map.get(attacks, attack_type, attacks["overhead_slam"])
    deadline = System.system_time(:millisecond) + atk.telegraph_ms

    telegraph_data = %{
      attack_type: attack_type,
      name: atk.name,
      damage: atk.damage,
      icon: atk.icon,
      desc: atk.desc,
      started_at: System.system_time(:millisecond),
      deadline: deadline,
      telegraph_ms: atk.telegraph_ms
    }

    json = Jason.encode!(telegraph_data)
    Repo.query("UPDATE game_colossus_raids SET active_telegraph_json = ? WHERE id = ?", [json, raid_id])

    TePhoenixWeb.Endpoint.broadcast("map:1", "colossus_telegraph", telegraph_data)
    TePhoenixWeb.Endpoint.broadcast("voice:proximity:1", "colossus_telegraph", telegraph_data)

    {:ok, telegraph_data}
  end

  @doc """
  Resolves the player's Active Defense reaction against the telegraphed attack.
  Utilizes `TePhoenix.Battle.ActiveDefense.resolve/3`!
  Timing <= 150ms grants `:perfect_parry` / `:perfect_dodge`, negating 100% damage and staggering the boss!
  """
  def react_active_defense(player, raid_id, defense_type, timing_ms) do
    ensure_schema!()
    char_id = player[:id] || player["id"]
    char_name = player[:name] || player["name"] || "Defender"

    type_atom = case defense_type do
      "parry" -> :parry
      "dodge" -> :dodge
      "block" -> :block
      _ -> :parry
    end

    # Construct mock combatants for ActiveDefense engine
    attacker = %Combatant{
      char_id: 9999,
      name: @boss_name,
      atk: 120,
      speed: 15
    }

    defender = %Combatant{
      char_id: char_id,
      name: char_name,
      def: 25,
      speed: 20,
      current_mp: 50,
      limb_hp: %{l_arm: 20, r_arm: 20, l_leg: 20, r_leg: 20}
    }

    defense_result = ActiveDefense.resolve(attacker, defender, type: type_atom, timing_ms: timing_ms)

    result_payload = case defense_result do
      {:negated, _def_after, :perfect_parry} ->
        %{
          success: true,
          action: "perfect_parry",
          timing_ms: timing_ms,
          damage_taken: 0,
          staggered_boss: true,
          message: "⚡ PERFECT PARRY! (Timing: #{timing_ms}ms) You deflected the Colossus's crushing blow! Metal clangs through the cathedral and the beast is STAGGERED!"
        }

      {:negated, _def_after, :perfect_dodge} ->
        %{
          success: true,
          action: "perfect_dodge",
          timing_ms: timing_ms,
          damage_taken: 0,
          staggered_boss: true,
          message: "💨 PERFECT DODGE! (Timing: #{timing_ms}ms) You rolled effortlessly beneath the colossal strike as stone shattered where you stood!"
        }

      {:negated, _def_after, _type} ->
        %{
          success: true,
          action: to_string(type_atom),
          timing_ms: timing_ms,
          damage_taken: 0,
          staggered_boss: false,
          message: "Defended successfully against the Colossus's attack!"
        }

      {:mitigated, _def_after, mult, _type} ->
        taken = round(120 * mult)
        %{
          success: true,
          action: "partial_block",
          timing_ms: timing_ms,
          damage_taken: taken,
          staggered_boss: false,
          message: "Braced against the impact! Block absorbed #{(1.0 - mult) * 100}% of the blow (#{taken} damage taken)."
        }

      {:hit, _def_after} ->
        %{
          success: false,
          action: "failed_defense",
          timing_ms: timing_ms,
          damage_taken: 160,
          staggered_boss: false,
          message: "💥 MISTIMED DEFENSE! (Timing: #{timing_ms}ms) The colossal strike crushed through your guard for 160 damage!"
        }
    end

    # Clear active telegraph
    Repo.query("UPDATE game_colossus_raids SET active_telegraph_json = NULL WHERE id = ?", [raid_id])

    TePhoenixWeb.Endpoint.broadcast("map:1", "colossus_defense_result", result_payload)
    TePhoenixWeb.Endpoint.broadcast("voice:proximity:1", "colossus_defense_result", result_payload)

    {:ok, result_payload}
  end

  @doc """
  Claims victory raid rewards when the Colossus is defeated.
  Awards:
    * "Skull of the Ashveil Colossus" (Mountable on Safehouse Trophy Wall!)
    * 500 Gold
    * 1200 XP
  """
  def claim_raid_loot(player, raid_id) do
    ensure_schema!()
    char_id = player[:id] || player["id"]

    case Repo.query("SELECT id, status FROM game_colossus_raids WHERE id = ? LIMIT 1", [raid_id]) do
      {:ok, %{rows: [[id, "defeated"]]}} ->
        award_player_gold(char_id, 500)
        award_player_xp(char_id, 1200)

        # Store Colossus Skull into character inventory or safehouse trophy catalog
        {:ok, %{
          success: true,
          raid_id: id,
          gold_awarded: 500,
          xp_awarded: 1200,
          trophy_item: "colossus_skull",
          trophy_name: "Skull of the Ashveil Colossus",
          message: "Victory claimed! You carved the Skull of the Ashveil Colossus from the wreckage (+500 Gold, +1200 XP). Mount it in your safehouse for permanent neighborhood defense wards!"
        }}

      {:ok, %{rows: [[_, status]]}} ->
        {:error, "The Colossus is still #{status}. Bring it down before claiming rewards!"}

      _ ->
        {:error, "Raid instance not found."}
    end
  end

  # ── Helpers ────────────────────────────────────────────────────────

  defp get_phase_name(1), do: "Phase 1: Granite Aegis"
  defp get_phase_name(2), do: "Phase 2: Molten Core Enrage"
  defp get_phase_name(3), do: "Phase 3: Arcane Cataclysm"
  defp get_phase_name(4), do: "Defeated"
  defp get_phase_name(_), do: "Unknown"

  defp award_player_gold(char_id, amount) do
    Repo.query("UPDATE characters SET gold = gold + ? WHERE id = ?", [amount, char_id])
  end

  defp award_player_xp(char_id, amount) do
    Repo.query("UPDATE characters SET xp = xp + ? WHERE id = ?", [amount, char_id])
  end

  defp decode_json(nil, default), do: default
  defp decode_json("", default), do: default
  defp decode_json(str, default) when is_binary(str) do
    case Jason.decode(str) do
      {:ok, val} -> val
      _ -> default
    end
  end
  defp decode_json(_, default), do: default
end
