defmodule TePhoenix.World.NpcStalkerDrama do
  @moduledoc """
  Autonomous NPC-stalking-NPC emergent drama & murder mystery engine (*Dráma Faireoirí*).

  Simulates alive, emergent world violence and crime scenes:
    * **Predator NPCs Stalking Prey NPCs**: Assassins, bounty hunters, and loan shark enforcers
      stalk innocent shop apprentices, bards, or debt-ridden cutpurses through city alleys.
    * **Acoustic & Sightline Cues**: Players nearby overhear footsteps, muffled threats,
      or see shadows moving behind windowpanes.
    * **Intervention Options (The "Deadpool" Choice)**:
      - `ambush`: Ambush the stalker from behind before they strike.
      - `shout_warning`: Blow a city guard whistle or yell, scaring the stalker away.
      - `shadow`: Quietly trail the stalker back to their syndicate boss to discover an underworld bounty contract.
    * **Unchecked Murder ("Southside of Chicago")**:
      - If the player fails to intervene within the turn timer, the assassin strikes!
      - A bloodcurdling scream echoes across the map (`window_noise` / scream broadcast).
      - The victim is murdered on the street; a dead body with chalk marks & blood puddle spawns.
      - Dropped clues (poison vial, guild insignia, ransom note) spawn a full murder mystery investigation!
  """

  alias TePhoenix.Repo
  require Logger

  @doc """
  Ensures the database schema for NPC stalking dramas exists.
  """
  def ensure_schema! do
    Repo.query!("""
    CREATE TABLE IF NOT EXISTS game_npc_stalker_dramas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      map_id INT NOT NULL,
      stalker_name VARCHAR(64) NOT NULL,
      stalker_icon VARCHAR(16) NOT NULL DEFAULT '🗡️',
      stalker_role VARCHAR(32) NOT NULL DEFAULT 'assassin',
      victim_name VARCHAR(64) NOT NULL,
      victim_icon VARCHAR(16) NOT NULL DEFAULT '📜',
      victim_role VARCHAR(32) NOT NULL DEFAULT 'apprentice',
      motive VARCHAR(128) NOT NULL,
      stage VARCHAR(32) NOT NULL DEFAULT 'stalking',
      location_desc VARCHAR(128) NOT NULL,
      stalker_x INT NOT NULL DEFAULT 8,
      stalker_y INT NOT NULL DEFAULT 12,
      victim_x INT NOT NULL DEFAULT 10,
      victim_y INT NOT NULL DEFAULT 12,
      bounty_reward INT NOT NULL DEFAULT 120,
      clues_json LONGTEXT,
      witness_rumor VARCHAR(255) NOT NULL,
      turn_timer INT NOT NULL DEFAULT 6,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_drama_map (map_id),
      INDEX idx_drama_stage (stage)
    )
    """)
    :ok
  end

  @doc """
  Seeds default dramatic encounters where one NPC stalks another.
  """
  def seed_default_dramas!(map_id \\ 1) do
    ensure_schema!()

    defaults = [
      %{
        map_id: map_id,
        stalker_name: "Vane the Viper",
        stalker_icon: "🗡️",
        stalker_role: "syndicate_hitman",
        victim_name: "Tobias the Scribe",
        victim_icon: "📜",
        victim_role: "apprentice",
        motive: "Tobias discovered the Night Guild's forged tax ledgers in the cathedral archive.",
        location_desc: "The narrow cobblestone alley behind the old apothecary",
        stalker_x: 7,
        stalker_y: 11,
        victim_x: 9,
        victim_y: 11,
        bounty_reward: 150,
        clues_json: Jason.encode!(["Vial of Concentrated Nightshade", "Wax-sealed Night Guild Token", "Torn Black Silk Cloak"]),
        witness_rumor: "I saw a fellow in dark cowl shadowing the scribe boy right past the apothecary window!",
        turn_timer: 5
      },
      %{
        map_id: map_id,
        stalker_name: "Gilded Dagger Morvath",
        stalker_icon: "🥷",
        stalker_role: "enforcer",
        victim_name: "Lyra the Tavern Singer",
        victim_icon: "🎻",
        victim_role: "bard",
        motive: "Unpaid 300 gold gambling debt from the secret basement dice tables.",
        location_desc: "The foggy mist outside the Rusty Anchor Tavern backdoor",
        stalker_x: 14,
        stalker_y: 16,
        victim_x: 16,
        victim_y: 16,
        bounty_reward: 200,
        clues_json: Jason.encode!(["Loaded Bone Dice with Morvath's Crest", "Bloodstained Leather Knuckles"]),
        witness_rumor: "A brute with brass knuckles was pacing behind the tavern kitchen waiting for the singer!",
        turn_timer: 6
      }
    ]

    Enum.each(defaults, fn d ->
      case Repo.query("SELECT id FROM game_npc_stalker_dramas WHERE map_id = ? AND stalker_name = ? LIMIT 1", [d.map_id, d.stalker_name]) do
        {:ok, %{rows: []}} ->
          Repo.query("""
          INSERT INTO game_npc_stalker_dramas
            (map_id, stalker_name, stalker_icon, stalker_role, victim_name, victim_icon, victim_role,
             motive, stage, location_desc, stalker_x, stalker_y, victim_x, victim_y, bounty_reward,
             clues_json, witness_rumor, turn_timer)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'stalking', ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """, [
            d.map_id, d.stalker_name, d.stalker_icon, d.stalker_role, d.victim_name, d.victim_icon, d.victim_role,
            d.motive, d.location_desc, d.stalker_x, d.stalker_y, d.victim_x, d.victim_y, d.bounty_reward,
            d.clues_json, d.witness_rumor, d.turn_timer
          ])

        _ -> :ok
      end
    end)

    :ok
  end

  @doc """
  Fetches the current active drama for a map.
  """
  def get_active_drama(map_id) do
    ensure_schema!()

    case Repo.query("""
      SELECT id, map_id, stalker_name, stalker_icon, stalker_role, victim_name, victim_icon,
             victim_role, motive, stage, location_desc, stalker_x, stalker_y, victim_x, victim_y,
             bounty_reward, clues_json, witness_rumor, turn_timer
      FROM game_npc_stalker_dramas
      WHERE map_id = ? AND stage IN ('stalking', 'ambush_imminent', 'murdered')
      ORDER BY id ASC LIMIT 1
    """, [map_id]) do
      {:ok, %{rows: [row], columns: cols}} ->
        data = Enum.zip(cols, row) |> Map.new()
        parse_drama(data)

      _ -> nil
    end
  end

  @doc """
  Overhears or observes the stalking in progress through acoustics or window view.
  """
  def overhear_drama_acoustic(player, map_id) do
    ensure_schema!()
    drama = get_active_drama(map_id)

    if drama do
      px = player[:x] || player["x"] || 10
      py = player[:y] || player["y"] || 10
      dx = abs(px - drama.stalker_x)
      dy = abs(py - drama.stalker_y)
      dist = max(dx, dy)

      mo = player[:mo] || player["mo"] || 10
      wis_mod = div(mo - 10, 2)
      d20 = :rand.uniform(20)
      perception_total = d20 + wis_mod

      if dist <= 12 and perception_total >= 10 do
        status_msg = case drama.stage do
          "stalking" ->
            "Through the gloom near #{drama.location_desc}, you notice #{drama.stalker_name} (#{drama.stalker_icon}) creeping in the shadows, trailing #{drama.victim_name} (#{drama.victim_icon})! A murder is brewing!"

          "ambush_imminent" ->
            "URGENT: #{drama.stalker_name} has unsheathed a blade directly behind #{drama.victim_name}! They are about to strike!"

          "murdered" ->
            "CRIME SCENE: A pool of blood and chalk outline mark where #{drama.victim_name} was slain by #{drama.stalker_name}. The corpse awaits inspection."

          _ ->
            "The alley is quiet."
        end

        {:ok, %{
          detected: true,
          drama_id: drama.id,
          stage: drama.stage,
          stalker_name: drama.stalker_name,
          stalker_icon: drama.stalker_icon,
          victim_name: drama.victim_name,
          victim_icon: drama.victim_icon,
          motive: drama.motive,
          location_desc: drama.location_desc,
          distance: dist,
          turns_remaining: drama.turn_timer,
          message: status_msg
        }}
      else
        {:ok, %{detected: false, message: "You hear only the usual whistle of wind through the alleyway."}}
      end
    else
      {:ok, %{detected: false, message: "No active underworld stalking in this district."}}
    end
  end

  @doc """
  Player intervenes in the ongoing stalking situation (The Deadpool Choice!).
  Actions:
    * `:ambush_stalker` - Sneak attack or tackle the stalker (STR/AGI vs DC 12). Rescues victim & captures assassin.
    * `:shout_warning` - Booming shout or watch whistle (CHA vs DC 10). Assassin flees into the night.
    * `:shadow_stalker` - Trail the assassin back to their syndicate boss to uncover the master contractor.
  """
  def intervene(player, drama_id, action) do
    ensure_schema!()

    case Repo.query("SELECT id, map_id, stalker_name, stalker_icon, victim_name, victim_icon, motive, stage, bounty_reward, turn_timer FROM game_npc_stalker_dramas WHERE id = ? LIMIT 1", [drama_id]) do
      {:ok, %{rows: [[id, map_id, s_name, s_icon, v_name, v_icon, motive, stage, bounty, _timer]]}} ->
        if stage in ["rescued", "murdered"] do
          {:error, "The situation has already concluded."}
        else
          char_id = player[:id] || player["id"]
          char_name = player[:name] || player["name"] || "Hero"

          case action do
            :ambush_stalker ->
              atk = player[:atk] || player["atk"] || 10
              agi = player[:speed] || player["speed"] || 10
              mod = div(max(atk, agi) - 10, 2)
              d20 = :rand.uniform(20)
              total = d20 + mod
              dc = 12

              if total >= dc do
                # Success: Stalker neutralized, victim rescued!
                Repo.query!("UPDATE game_npc_stalker_dramas SET stage = 'rescued' WHERE id = ?", [id])
                award_gold(char_id, bounty)

                TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "npc_drama_resolved", %{
                  drama_id: id,
                  status: "rescued",
                  hero_name: char_name,
                  message: "#{char_name} vaulted from the shadows, tackling #{s_name} to the cobblestones before they could strike #{v_name}!"
                })

                {:ok, %{
                  success: true,
                  action: :ambush_stalker,
                  roll: d20,
                  total: total,
                  dc: dc,
                  bounty_gold: bounty,
                  message: "BAM! Just like a vigilante in the nick of time, you tackle #{s_name} (#{s_icon}) to the pavement! #{v_name} (#{v_icon}) gasps in shock and hands you a pouch of #{bounty} gold in gratitude! \"You saved my life!\""
                }}
              else
                # Stalker dodges and initiates combat
                Repo.query!("UPDATE game_npc_stalker_dramas SET stage = 'ambush_imminent', turn_timer = 1 WHERE id = ?", [id])
                {:ok, %{
                  success: false,
                  action: :ambush_stalker,
                  roll: d20,
                  total: total,
                  dc: dc,
                  message: "#{s_name} parries your tackle with their dagger! \"A meddler! I'll gut both of you!\" (Turn timer shortened!)"
                }}
              end

            :shout_warning ->
              mo = player[:mo] || player["mo"] || 10
              mod = div(mo - 10, 2)
              d20 = :rand.uniform(20)
              total = d20 + mod
              dc = 10

              # Blows city watch whistle!
              TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "watch_whistle_blown", %{
                drama_id: id,
                decibels: 90,
                message: "PEEEEEEP! A shrill brass watch whistle echoes across the district!"
              })

              if total >= dc do
                Repo.query!("UPDATE game_npc_stalker_dramas SET stage = 'rescued' WHERE id = ?", [id])
                small_bounty = div(bounty, 2)
                award_gold(char_id, small_bounty)

                {:ok, %{
                  success: true,
                  action: :shout_warning,
                  roll: d20,
                  total: total,
                  dc: dc,
                  bounty_gold: small_bounty,
                  message: "You blow your watch whistle and roar a warning! #{s_name} curses, drops a smoke pellet, and scrambles up the drainage pipes! #{v_name} runs to safety and presses #{small_bounty} gold into your hands!"
                }}
              else
                {:ok, %{
                  success: false,
                  action: :shout_warning,
                  roll: d20,
                  total: total,
                  dc: dc,
                  message: "Your shout is muffled by the city din. #{s_name} glances over their shoulder, sneers, and draws their garrote wire!"
                }}
              end

            :shadow_stalker ->
              # Stealth tracking to learn the mastermind
              agi = player[:speed] || player["speed"] || 10
              mod = div(agi - 10, 2)
              d20 = :rand.uniform(20)
              total = d20 + mod
              dc = 11

              if total >= dc do
                mastermind_intel = "Contract Lead: #{s_name} was commissioned by Baron Von Rell over: \"#{motive}\""
                imprint_intel(char_id, "Assassination Contract", mastermind_intel)

                {:ok, %{
                  success: true,
                  action: :shadow_stalker,
                  roll: d20,
                  total: total,
                  dc: dc,
                  intel: mastermind_intel,
                  xp_awarded: 100,
                  message: "You silently stalk the assassin like a shadow. You discover their hidden safehouse ledger: \"#{mastermind_intel}\" (+100 XP)"
                }}
              else
                {:ok, %{
                  success: false,
                  action: :shadow_stalker,
                  roll: d20,
                  total: total,
                  dc: dc,
                  message: "A stray pebble crunches under your boot. #{s_name} whirls around: \"Who's following who?!\""
                }}
              end
          end
        end

      _ ->
        {:error, "Drama incident not found."}
    end
  end

  @doc """
  Progresses turn timer. If timer expires without player rescue, MURDER HAPPENS!
  Spawns dead body, chalk outlines, blood pool, and crime scene clues.
  """
  def tick_drama(drama_id) do
    ensure_schema!()

    case Repo.query("SELECT id, map_id, stalker_name, stalker_icon, victim_name, victim_icon, location_desc, turn_timer, stage, clues_json FROM game_npc_stalker_dramas WHERE id = ? LIMIT 1", [drama_id]) do
      {:ok, %{rows: [[id, map_id, s_name, _s_icon, v_name, v_icon, loc, timer, stage, clues_raw]]}} ->
        if stage in ["rescued", "murdered"] do
          {:ok, :already_resolved}
        else
          new_timer = timer - 1

          if new_timer <= 0 do
            # MURDER COMMITTED!
            Repo.query!("UPDATE game_npc_stalker_dramas SET stage = 'murdered', turn_timer = 0 WHERE id = ?", [id])

            clues = decode_json(clues_raw, ["Dropped Assassin Dagger", "Spilled Red Ink", "Torn Scrap of Parchment"])

            # Broadcast horrific scream across the city
            TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "npc_murder_committed", %{
              drama_id: id,
              victim_name: v_name,
              victim_icon: v_icon,
              stalker_name: s_name,
              location_desc: loc,
              clues: clues,
              message: "A choked gasp and a sickening thud echo through #{loc}! #{s_name} has murdered #{v_name}! The assassin melts into the shadows leaving the corpse on the cobblestones!"
            })

            {:ok, %{
              stage: "murdered",
              message: "MURDER IN THE SOUTHSIDE: #{v_name} was slain by #{s_name}! A crime scene has formed."
            }}
          else
            next_stage = if new_timer <= 2, do: "ambush_imminent", else: "stalking"
            Repo.query!("UPDATE game_npc_stalker_dramas SET stage = ?, turn_timer = ? WHERE id = ?", [next_stage, new_timer, id])
            {:ok, %{stage: next_stage, turns_remaining: new_timer}}
          end
        end

      _ ->
        {:error, "Drama not found."}
    end
  end

  @doc """
  Investigates a murdered NPC's crime scene for forensic clues and bounty leads.
  """
  def investigate_crime_scene(player, drama_id) do
    ensure_schema!()

    case Repo.query("SELECT id, victim_name, stalker_name, location_desc, clues_json, stage, bounty_reward FROM game_npc_stalker_dramas WHERE id = ? LIMIT 1", [drama_id]) do
      {:ok, %{rows: [[_id, v_name, s_name, loc, clues_raw, stage, bounty]]}} ->
        if stage != "murdered" do
          {:error, "There is no corpse to investigate here."}
        else
          mo = player[:mo] || player["mo"] || 10
          int_mod = div(mo - 10, 2)
          d20 = :rand.uniform(20)
          total = d20 + int_mod
          dc = 10

          clues = decode_json(clues_raw, ["Dagger Sheath", "Wax Seal"])

          if total >= dc do
            char_id = player[:id] || player["id"]
            lead = "Homicide Report: #{v_name} was struck from behind with a serrated stiletto. Suspect: #{s_name}. Bounty: #{bounty}g."
            imprint_intel(char_id, "Murder Clue", lead)

            {:ok, %{
              success: true,
              roll: d20,
              total: total,
              clues_found: clues,
              lead: lead,
              bounty_active: true,
              message: "Forensic examination reveals #{Enum.join(clues, ", ")}! You have identified the assassin as #{s_name}! City Watch has authorized an active #{bounty} gold bounty hunt!"
            }}
          else
            {:ok, %{
              success: false,
              roll: d20,
              total: total,
              message: "The blood on the cobblestones is cold, but the assassin covered their tracks carefully."
            }}
          end
        end

      _ ->
        {:error, "Crime scene not found."}
    end
  end

  # ── Helpers ────────────────────────────────────────────────────────

  defp parse_drama(data) do
    %{
      id: data["id"],
      map_id: data["map_id"],
      stalker_name: data["stalker_name"],
      stalker_icon: data["stalker_icon"],
      stalker_role: data["stalker_role"],
      victim_name: data["victim_name"],
      victim_icon: data["victim_icon"],
      victim_role: data["victim_role"],
      motive: data["motive"],
      stage: data["stage"],
      location_desc: data["location_desc"],
      stalker_x: data["stalker_x"],
      stalker_y: data["stalker_y"],
      victim_x: data["victim_x"],
      victim_y: data["victim_y"],
      bounty_reward: data["bounty_reward"],
      clues: decode_json(data["clues_json"], []),
      witness_rumor: data["witness_rumor"],
      turn_timer: data["turn_timer"]
    }
  end

  defp award_gold(char_id, amount) do
    Repo.query("UPDATE characters SET gold = gold + ? WHERE id = ?", [amount, char_id])
  rescue
    _ -> :ok
  end

  defp imprint_intel(char_id, title, content) do
    Repo.query("""
    INSERT INTO character_intel (character_id, intel_key, category, title, content)
    VALUES (?, ?, 'bounty', ?, ?)
    ON DUPLICATE KEY UPDATE content = VALUES(content)
    """, [char_id, "drama_lead_#{System.system_time(:second)}", title, content])
  rescue
    _ -> :ok
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
