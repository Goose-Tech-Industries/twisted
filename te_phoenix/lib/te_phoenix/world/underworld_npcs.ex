defmodule TePhoenix.World.UnderworldNpcs do
  @moduledoc """
  Living Underworld NPC Ecosystem (*Saoil Faoi Thalamh*).

  Simulates gritty, emergent real-life archetypes:
    * **Stalkers & Shadow Spies (`stalker`, `shadow_tail`)**:
      - Shadow players from 5-8 tiles away, peeping through windows and tailing players.
      - Can be spotted with Perception checks, interrogated for contractor intel,
        bribed into becoming allied informants, or trigger a flash powder escape.
    * **Rowdy Drunks & Cascading Brawlers (`drunk`, `brawler`)**:
      - Slurred speech, erratic decibels, easily provoked.
      - When an altercation escalates, triggers full tavern brawl cascades with flying tankards,
        overturned furniture, and window defenestration!
    * **Lotus Fiends & Gutter Addicts (`addict`, `fiend`, `shiverer`)**:
      - Trembling in dark alleys with delirium and hallucinations.
      - Giving them 5 gold or an herbal tincture rewards forbidden sewer grate passcodes,
        black-market cache coordinates, and high-value intel.
      - If threatened, they shriek at 75 dB, alerting town watchmen.
      - Idle players lingering nearby risk getting clumsily pickpocketed!
  """

  alias TePhoenix.Repo
  require Logger

  @doc """
  Ensures seed underworld NPCs exist in Map 1.
  """
  def seed_underworld_npcs!(map_id \\ 1) do
    npcs = [
      %{
        name: "Corvus the Whisper",
        icon: "🕵️",
        persona: "An agile shadow tail hired by an unknown syndicate to shadow adventurers and peek through tavern windows.",
        map_id: map_id,
        x: 8,
        y: 14,
        role: "stalker",
        faction: "shadow_syndicate",
        is_enemy: 0,
        is_hostile: 0,
        is_nocturnal: 1,
        is_active: 1,
        base_hp: 45,
        hp: 45,
        max_hp: 45,
        base_speed: 16
      },
      %{
        name: "Twitchy Fitch",
        icon: "🥀",
        persona: "A shivering dream-lotus fiend huddled in the damp alley behind the apothecary, desperate for dust or coin.",
        map_id: map_id,
        x: 4,
        y: 15,
        role: "addict",
        faction: "gutter_folk",
        is_enemy: 0,
        is_hostile: 0,
        is_nocturnal: 0,
        is_active: 1,
        base_hp: 25,
        hp: 25,
        max_hp: 25,
        base_speed: 10
      },
      %{
        name: "Groggy Brant",
        icon: "🍺",
        persona: "A red-nosed tavern regular who sways on the cobblestones looking for anyone who spilled his drink.",
        map_id: map_id,
        x: 6,
        y: 11,
        role: "drunk",
        faction: "townsfolk",
        is_enemy: 0,
        is_hostile: 0,
        is_nocturnal: 0,
        is_active: 1,
        base_hp: 60,
        hp: 60,
        max_hp: 60,
        base_speed: 8
      },
      %{
        name: "Iron-Tooth Silas",
        icon: "🥊",
        persona: "A scarred tavern brawler with iron fillings in his teeth, always spoiling for a bare-knuckle clash.",
        map_id: map_id,
        x: 8,
        y: 10,
        role: "brawler",
        faction: "townsfolk",
        is_enemy: 0,
        is_hostile: 0,
        is_nocturnal: 0,
        is_active: 1,
        base_hp: 85,
        hp: 85,
        max_hp: 85,
        base_speed: 11
      }
    ]

    Enum.each(npcs, fn npc ->
      case Repo.query("SELECT id FROM game_npcs WHERE map_id = ? AND name = ? LIMIT 1", [npc.map_id, npc.name]) do
        {:ok, %{rows: []}} ->
          Repo.query(
            """
            INSERT INTO game_npcs (name, icon, persona, map_id, x, y, role, faction, is_enemy, is_hostile, is_nocturnal, is_active, base_hp, hp, max_hp, base_speed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [npc.name, npc.icon, npc.persona, npc.map_id, npc.x, npc.y, npc.role, npc.faction, npc.is_enemy, npc.is_hostile, npc.is_nocturnal, npc.is_active, npc.base_hp, npc.hp, npc.max_hp, npc.base_speed]
          )

        _ -> :ok
      end
    end)
    :ok
  end

  # ── Stalker Mechanics ─────────────────────────────────────────────

  @doc """
  Player attempts a Perception check to spot a lurking stalker nearby.
  """
  def spot_stalker(player, map_id, stalker_id) do
    case Repo.query("SELECT id, name, icon, role, x, y, hp FROM game_npcs WHERE id = ? AND map_id = ? AND role = 'stalker' LIMIT 1", [stalker_id, map_id]) do
      {:ok, %{rows: [[id, name, icon, _role, sx, sy, _hp]]}} ->
        px = player[:x] || player["x"] || 10
        py = player[:y] || player["y"] || 10
        mo = player[:mo] || player["mo"] || 10
        wis_mod = div(mo - 10, 2)

        d20 = :rand.uniform(20)
        total = d20 + wis_mod
        dc = 12

        dx = abs(px - sx)
        dy = abs(py - sy)
        dist = max(dx, dy)

        if total >= dc do
          TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "stalker_unmasked", %{
            stalker_id: id,
            name: name,
            icon: icon,
            x: sx,
            y: sy,
            distance: dist,
            player_name: player[:name] || player["name"] || "You",
            message: "Sharp eyes! You caught #{name} watching you from the alley shadows at {#{sx}, #{sy}}!"
          })

          {:ok, %{
            spotted: true,
            stalker_id: id,
            name: name,
            icon: icon,
            x: sx,
            y: sy,
            distance: dist,
            roll: d20,
            total: total,
            dc: dc,
            available_actions: [:interrogate, :bribe, :attack],
            message: "You unmask #{name}! The shadow tail stiffens, realizing they have been spotted!"
          }}
        else
          {:ok, %{
            spotted: false,
            roll: d20,
            total: total,
            dc: dc,
            message: "You scan the gloomy alleys and window ledges, but notice nothing out of the ordinary."
          }}
        end

      _ ->
        {:error, "No stalker found."}
    end
  end

  @doc """
  Interacts with an unmasked stalker.
  Actions:
    * `:interrogate` - Roll Charisma/Intimidation vs DC 12 to extract who hired them.
    * `:bribe` - Pay 15 gold to hire them as an allied scout.
    * `:attack` - Forces stalker into hostility.
  """
  def interact_stalker(player, map_id, stalker_id, action) do
    case Repo.query("SELECT id, name, icon, role, x, y, faction FROM game_npcs WHERE id = ? AND map_id = ? LIMIT 1", [stalker_id, map_id]) do
      {:ok, %{rows: [[id, name, _icon, _role, sx, sy, _faction]]}} ->
        char_id = player[:id] || player["id"]

        case action do
          :interrogate ->
            atk = player[:atk] || player["atk"] || 10
            intimidate_mod = div(atk - 10, 2)
            d20 = :rand.uniform(20)
            total = d20 + intimidate_mod
            dc = 12

            if total >= dc do
              intel = "Hold your steel! Don't skewer me! It was the Night Guildmaster who paid me 25 silvers to track anyone snooping around the old apothecary! He's looking for the stolen catacomb ledger!"
              imprint_intel(name, char_id, "Contractor Intel", intel)

              {:ok, %{
                success: true,
                action: :interrogate,
                roll: d20,
                total: total,
                dc: dc,
                confession: intel,
                xp_awarded: 50,
                message: "#{name} cowers against the wall: \"#{intel}\""
              }}
            else
              # Stalker drops flash powder and flees!
              flee_x = min(max(sx + Enum.random([-6, 6]), 1), 30)
              flee_y = min(max(sy + Enum.random([-6, 6]), 1), 30)

              Repo.query("UPDATE game_npcs SET x = ?, y = ? WHERE id = ?", [flee_x, flee_y, id])

              TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "stalker_flash_powder", %{
                stalker_id: id,
                name: name,
                origin_x: sx,
                origin_y: sy,
                flee_x: flee_x,
                flee_y: flee_y,
                sound: "flash_powder",
                message: "POOF! #{name} slammed a vial of flash powder to the cobblestones and vanished into the fog!"
              })

              {:ok, %{
                success: false,
                action: :interrogate,
                roll: d20,
                total: total,
                dc: dc,
                fled: true,
                message: "BANG! Blinding sulfur ash fills your eyes as #{name} vaults over a garden wall and vanishes!"
              }}
            end

          :bribe ->
            gold = get_player_gold(player)
            cost = 15

            if gold < cost do
              {:error, "You need at least #{cost} gold to bribe #{name} (you have #{gold}g)."}
            else
              deduct_player_gold(char_id, cost)
              intel = "Pleasure doing business with a person of means. Watch your back near the docks—three cutpurses are lying in wait behind the fish barrels."

              TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "stalker_bribed", %{
                stalker_id: id,
                name: name,
                char_id: char_id,
                buff: "shadow_scout"
              })

              {:ok, %{
                success: true,
                action: :bribe,
                cost_gold: cost,
                tip: intel,
                buff: %{name: "Shadow Scout", description: "+3 Perception & Enemy Minimap Radar", duration_seconds: 300},
                message: "#{name} pockets the coins with a crooked grin: \"#{intel}\""
              }}
            end

          :attack ->
            Repo.query("UPDATE game_npcs SET is_enemy = 1, is_hostile = 1 WHERE id = ?", [id])

            TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "stalker_hostile", %{
              stalker_id: id,
              name: name,
              message: "#{name} draws a pair of jagged serrated daggers and lunges!"
            })

            {:ok, %{
              success: true,
              action: :attack,
              hostile: true,
              message: "#{name} draws twin daggers from under their cloak with a wicked hiss!"
            }}
        end

      _ ->
        {:error, "Stalker not found."}
    end
  end

  # ── Gutter Addict / Lotus Fiend Mechanics ──────────────────────────

  @doc """
  Interacts with a gutter addict / lotus fiend.
  Actions:
    * `:offer_fix` - Pay 5 gold or give herbal dust to calm their tremors and receive deep underworld secrets.
    * `:threaten` - Threats terrify them, emitting a 75 dB screech that alerts the town watch.
    * `:pickpocket_check` - Checks if the idling player gets their purse snatched.
  """
  def interact_addict(player, map_id, addict_id, action) do
    case Repo.query("SELECT id, name, icon, role, x, y FROM game_npcs WHERE id = ? AND map_id = ? LIMIT 1", [addict_id, map_id]) do
      {:ok, %{rows: [[id, name, _icon, _role, ax, ay]]}} ->
        char_id = player[:id] || player["id"]

        case action do
          :offer_fix ->
            gold = get_player_gold(player)
            cost = 5

            if gold < cost do
              {:error, "You lack 5 gold to offer #{name}."}
            else
              deduct_player_gold(char_id, cost)
              rumor = Enum.random([
                "The sewer grate behind Barnaby's Shop has a rusted iron latch. If you whisper 'Midnight Bloom', the fence down there sells unrefined black lotus!",
                "In the Prancing Mare cellar, the third wine cask on the left has a false bottom holding 100 counterfeit silver crowns!",
                "The guard captain takes a two-hour nap behind the east barracks every day at dusk—his strongbox key hangs loose from his belt!"
              ])

              imprint_intel(name, char_id, "Addict Secret", rumor)

              {:ok, %{
                success: true,
                action: :offer_fix,
                cost_gold: cost,
                secret: rumor,
                xp_awarded: 35,
                message: "#{name}'s violent tremors subside as they clench the coins: \"Blessed be your mercy, traveler! Listen close... #{rumor}\""
              }}
            end

          :threaten ->
            # Addict shrieks loudly
            TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "window_noise", %{
              window_x: ax,
              window_y: ay,
              decibels: 75,
              radius: 20,
              sound: "terrified_screech",
              description: "#{name} shrieked at the top of their lungs: \"MURDER! THE GUILD HAS COME TO GUT ME! GUARDS!\"",
              timestamp: System.system_time(:second)
            })

            # Alert nearby guards
            try do
              Repo.query(
                "UPDATE game_npcs SET is_sleeping = 0 WHERE map_id = ? AND role = 'guard'",
                [map_id]
              )
            rescue
              _ -> :ok
            end

            {:ok, %{
              success: true,
              action: :threaten,
              screech_decibels: 75,
              guards_alerted: true,
              message: "EEEEK! #{name} lets out an ear-piercing scream that echoes across the cobblestones! Armored footsteps begin pounding toward your alley!"
            }}

          :pickpocket_check ->
            # Addict attempts a desperate pickpocket if player lingers
            _luck = player[:luck] || player["luck"] || 10
            wis = player[:mo] || player["mo"] || 10
            passive_perception = 10 + div(wis - 10, 2)

            addict_roll = :rand.uniform(20) + 2

            if addict_roll > passive_perception do
              stolen_amount = min(get_player_gold(char_id), :rand.uniform(4))
              if stolen_amount > 0 do
                deduct_player_gold(char_id, stolen_amount)
              end

              {:ok, %{
                success: true,
                stolen: true,
                amount: stolen_amount,
                message: "While you were distracted, #{name}'s bony hand slipped into your pouch and snatched #{stolen_amount} gold!"
              }}
            else
              {:ok, %{
                success: true,
                stolen: false,
                amount: 0,
                message: "You catch #{name}'s trembling hand creeping toward your coin purse! They recoil with a whimpering apology!"
              }}
            end
        end

      _ ->
        {:error, "Addict not found."}
    end
  end

  # ── Cascading Tavern Brawl Mechanics ──────────────────────────────

  @doc """
  Escalates an altercation in or outside a tavern into a cascading tavern brawl!
  All nearby drunks and brawlers join in, hurling mugs and turning over tables.
  """
  def cascade_tavern_brawl(player, map_id, _tavern_building_id \\ nil) do
    _px = player[:x] || player["x"] || 10
    _py = player[:y] || player["y"] || 10

    # Find all nearby drunks & brawlers
    case Repo.query(
           "SELECT id, name, icon, role, x, y, hp FROM game_npcs WHERE map_id = ? AND role IN ('drunk', 'brawler', 'drunkard') AND is_active = 1",
           [map_id]
         ) do
      {:ok, %{rows: rows}} when rows != [] ->
        brawlers =
          Enum.map(rows, fn [id, name, icon, role, bx, by, hp] ->
            Repo.query("UPDATE game_npcs SET is_hostile = 1, is_enemy = 1 WHERE id = ?", [id])
            %{id: id, name: name, icon: icon, role: role, x: bx, y: by, hp: hp}
          end)

        # Broadcast chaos
        TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "tavern_brawl_cascade", %{
          map_id: map_id,
          initiator: player[:name] || player["name"] || "A patron",
          brawlers: brawlers,
          decibels: 80,
          description: "BAR FIGHT! Tankards shatter, chairs fly across the room, and #{length(brawlers)} brawlers lunge into the fray!",
          can_defenestrate: true,
          timestamp: System.system_time(:second)
        })

        {:ok, %{
          success: true,
          brawlers_count: length(brawlers),
          brawlers: brawlers,
          message: "A full-scale brawl erupts! Drunks roar with laughter, pewter mugs slam into jaws, and the scent of spilled ale fills the air! Watch the windows!"
        }}

      _ ->
        {:error, "No rowdy brawlers nearby to cascade the fight."}
    end
  end

  # ── Helper Functions ──────────────────────────────────────────────

  defp get_player_gold(player_or_id) do
    cond do
      is_map(player_or_id) and (Map.has_key?(player_or_id, :gold) or Map.has_key?(player_or_id, "gold")) ->
        player_or_id[:gold] || player_or_id["gold"] || 0

      is_integer(player_or_id) ->
        case Repo.query("SELECT gold FROM characters WHERE id = ? LIMIT 1", [player_or_id]) do
          {:ok, %{rows: [[g]]}} -> g || 0
          _ -> 0
        end

      is_map(player_or_id) and (Map.has_key?(player_or_id, :id) or Map.has_key?(player_or_id, "id")) ->
        get_player_gold(player_or_id[:id] || player_or_id["id"])

      true -> 0
    end
  end

  defp deduct_player_gold(char_id, amount) do
    Repo.query("UPDATE characters SET gold = GREATEST(0, gold - ?) WHERE id = ?", [amount, char_id])
  end

  defp imprint_intel(source_name, char_id, topic, text) do
    try do
      Repo.query(
        """
        INSERT INTO npc_memories (npc_name, char_id, speaker_name, topic, content, emotional_valence, importance)
        VALUES (?, ?, ?, ?, ?, 0.4, 0.8)
        """,
        [source_name, char_id, source_name, topic, text]
      )
    rescue
      _ -> :ok
    end
  end
end
