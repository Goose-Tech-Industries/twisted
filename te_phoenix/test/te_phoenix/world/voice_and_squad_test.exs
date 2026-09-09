defmodule TePhoenix.World.VoiceAndSquadTest do
  use ExUnit.Case, async: false
  import Phoenix.ChannelTest
  @endpoint TePhoenixWeb.Endpoint

  alias TePhoenixWeb.{UserSocket, VoiceChannel}
  alias TePhoenix.Repo
  alias TePhoenix.AI.{CompanionVoiceMind, UileOperations}
  alias TePhoenix.World.{RaidForge, LegendChronicler}

  setup do
    :ok = Ecto.Adapters.SQL.Sandbox.checkout(Repo, sandbox: false)
    :ok
  end

  describe "VoiceChannel real-time voice chat & battle cries" do
    test "players can join party voice room and broadcast speaking states" do
      {:ok, socket} = connect(UserSocket, %{"token" => Phoenix.Token.sign(@endpoint, "user socket", 1)})
      {:ok, reply, socket} = subscribe_and_join(socket, VoiceChannel, "voice:party:100", %{"char_id" => 1})

      assert reply.party_id == "100"
      assert is_binary(reply.name)

      # Speaking activity
      ref = push(socket, "speaking", %{"is_speaking" => true})
      assert_reply ref, :ok

      # WebRTC signal relay
      ref2 = push(socket, "signal", %{
        "target_char_id" => 2,
        "signal" => %{"type" => "offer", "sdp" => "v=0..."}
      })
      assert_reply ref2, :ok

      # Battle Cry
      ref3 = push(socket, "battle_cry", %{"cry" => "LEEROY JENKINS!!!"})
      assert_reply ref3, :ok, %{cry: "LEEROY JENKINS!!!"}

      # Party Speech (planning discussion)
      ref4 = push(socket, "party_speech", %{"text" => "Should we charge the boss or flank?"})
      assert_reply ref4, :ok
    end

    test "players can join custom voice rooms" do
      {:ok, socket} = connect(UserSocket, %{"token" => Phoenix.Token.sign(@endpoint, "user socket", 1)})
      {:ok, reply, _socket} = subscribe_and_join(socket, VoiceChannel, "voice:room:dungeon_catacombs", %{"char_id" => 1, "name" => "RaidLeader"})

      assert reply.room_id == "dungeon_catacombs"
      assert reply.name == "RaidLeader"
    end
  end

  describe "CompanionVoiceMind" do
    test "companions react to tactical speech in voice chat" do
      {:ok, reaction} = CompanionVoiceMind.react_to_speech("party_100", 1, "Let's attack the boss together!")

      assert is_map(reaction)
      assert reaction.speaker_type == :companion
      assert is_binary(reaction.name)
      assert is_binary(reaction.text)
    end

    test "companions react to LEEROY JENKINS battle cries" do
      {:ok, reaction} = CompanionVoiceMind.react_to_battle_cry("party_100", 1, "Leeroy")

      assert is_map(reaction)
      assert reaction.speaker_type == :companion
      assert reaction.is_battle_cry_reaction == true
      assert String.contains?(reaction.text, "!")
    end
  end

  describe "RaidForge & LegendChronicler" do
    test "create_raid procedurally generates multi-floor citadel with scaled boss" do
      raid = RaidForge.create_raid("Abyssal Citadel", theme: "infernal", floors: 3, difficulty: 6)

      assert raid.status == :ok
      assert length(raid.floors) == 3
      assert raid.boss.hp > 10000
      assert String.contains?(raid.companion_reward, "Soulstone")
    end

    test "record_legend records world history and tavern songs" do
      {:ok, legend} = LegendChronicler.record_legend(
        :battle_cry_charge,
        "The Fall of Upper Blackrock",
        "Leeroy rushed with 16 active companions into the dragon whelp clutch."
      )

      assert legend.category == :battle_cry_charge
      assert String.contains?(legend.bard_song, "Ballad of The Fall of Upper Blackrock")

      recent = LegendChronicler.recent_legends()
      assert length(recent) >= 1
    end

    test "UileOperations executes create_raid and record_legend blueprints" do
      raid_res = UileOperations.execute_action(%{
        "action" => "create_raid",
        "title" => "Citadel of the Lich King",
        "floors" => 2,
        "difficulty" => 4
      })

      assert raid_res.status == :ok
      assert raid_res.type == :raid_forge

      leg_res = UileOperations.execute_action(%{
        "action" => "record_legend",
        "title" => "The Charge at Dawn",
        "detail" => "The party broke the siege with war cries.",
        "category" => "battle_cry_charge"
      })

      assert leg_res.status == :ok
      assert leg_res.type == :legend_recorded
    end
  end

  describe "Physical Actions & Acoustic Perception" do
    alias TePhoenix.World.NpcAcousticReactor
    alias TePhoenix.AI.UileAcousticDirector

    test "companions react with physical in-game actions, buffs, and position shifts" do
      # Test defensive ward action
      {:ok, res_def} = CompanionVoiceMind.react_to_speech_and_action(
        "party_100",
        1,
        "Sir Arthur",
        "Heal me, I'm low on health! Shields up!"
      )

      assert res_def.action.action_type == :defensive_ward
      assert res_def.action.buff.stat == "defense"
      assert res_def.action.pos_shift.label == "Shield Intercept"

      # Test offensive charge action
      {:ok, res_atk} = CompanionVoiceMind.react_to_speech_and_action(
        "party_100",
        1,
        "Sir Arthur",
        "Charge and kill the dungeon boss! Flank now!"
      )

      assert res_atk.action.action_type == :offensive_charge
      assert res_atk.action.buff.stat == "attack"
      assert res_atk.action.pos_shift.dx == 1

      # Test telepathic thought action
      {:ok, res_th} = CompanionVoiceMind.react_to_speech_and_action(
        "party_100",
        1,
        "Sir Arthur",
        "Telepathic coordinate link",
        is_thought: true
      )

      assert res_th.action.action_type == :telepathic_harmony
      assert res_th.action.is_thought_reaction == true
    end

    test "NpcAcousticReactor enables world NPCs to overhear plans and execute counter-intercepts" do
      try do
        Repo.query("DELETE FROM game_npcs WHERE id = 99991")
        Repo.query(
          "INSERT INTO game_npcs (id, map_id, name, persona, role, faction, is_enemy, is_hostile, x, y, icon) VALUES (99991, 99, 'Gorgar the Sentry', 'Vigilant dungeon guard', 'boss', 'Orc Vanguard', 1, 1, 12, 12, '👹')"
        )
      rescue
        _ -> :ok
      end

      {:ok, res} = NpcAcousticReactor.process_acoustic_event(
        "party_99",
        1,
        "RaidLead",
        "We attack the boss from behind!",
        false,
        99,
        %{x: 10, y: 10, map_id: 99}
      )

      assert res.npc.id == 99991
      assert res.action.action_type == :hostile_intercept
      assert res.action.alarm_triggered == true
      assert res.action.buff.stat == "defense"
      assert res.action.new_coords.x != nil

      try do
        Repo.query("DELETE FROM game_npcs WHERE id = 99991")
      rescue
        _ -> :ok
      end
    end

    test "UileAcousticDirector recognizes vocal puzzle incantations and reality warps" do
      # Test vocal puzzle unseal
      {:ok, unseal} = UileAcousticDirector.process_vocal_reality(
        "party_1",
        1,
        "MageLord",
        "Mellon! Speak friend and enter!",
        false,
        %{x: 5, y: 5, map_id: 1}
      )

      assert unseal.warp_type == :incantation_unseal
      assert String.contains?(unseal.message, "pathway opens")

      # Test divine invocation
      {:ok, divine} = UileAcousticDirector.process_vocal_reality(
        "party_1",
        1,
        "PaladinLead",
        "Uile save us! Grant us sanctuary!",
        false,
        %{x: 5, y: 5, map_id: 1}
      )

      assert divine.warp_type == :divine_sanctuary
      assert String.contains?(divine.title, "Divine Sanctuary")

      # Test voice-driven entity creation
      {:ok, spawn_warp} = UileAcousticDirector.process_vocal_reality(
        "party_1",
        1,
        "Creator",
        "Uile spawn shadow hound in the courtyard!",
        false,
        %{x: 8, y: 8, map_id: 1}
      )

      assert spawn_warp.warp_type == :voice_entity_spawn
      assert String.contains?(spawn_warp.message, "Shadow Stalker")
    end

    test "AcousticPhysics calculates spatial audio, falloff, stereo pan, and party privacy" do
      alias TePhoenix.World.AcousticPhysics

      # Party mode is 100% private to outsiders
      party_res = AcousticPhysics.calculate_spatial_audio(%{x: 10, y: 10}, %{x: 12, y: 12}, "party")
      assert party_res.audible == false
      assert party_res.volume == 0.0

      # Proximity mode with speaker to the right
      prox_res = AcousticPhysics.calculate_spatial_audio(%{x: 14, y: 10}, %{x: 10, y: 10}, "proximity")
      assert prox_res.audible == true
      assert prox_res.volume > 0.0
      assert prox_res.pan > 0.0 # Panned right!

      # Out of range whisper (5 tiles away)
      whisp_res = AcousticPhysics.calculate_spatial_audio(%{x: 15, y: 10}, %{x: 10, y: 10}, "whisper")
      assert whisp_res.audible == false

      # Privacy mode blocks enemy overhearing
      {:ok, priv} = NpcAcousticReactor.process_acoustic_event(
        "party_1",
        1,
        "RaidLead",
        "Kill the boss secretly",
        false,
        1,
        %{x: 10, y: 10, map_id: 1},
        "party"
      )
      assert priv == :party_private_encrypted
    end

    test "non-hostile NPCs dynamically react to overheard speech (Bard, Priest, Merchant)" do
      alias TePhoenix.World.NpcAcousticReactor

      Repo.query("UPDATE game_npcs SET x = 8, y = 12 WHERE name = 'Rowan the Tavern Bard' AND map_id = 1")
      Repo.query("UPDATE game_npcs SET x = 14, y = 8 WHERE name = 'Mother Althea the Priestess' AND map_id = 1")
      Repo.query("UPDATE game_npcs SET x = 12, y = 14 WHERE name = 'Barnaby the Quartermaster' AND map_id = 1")

      # 1. Rowan the Bard hears heroic battle plans and grants Bardic Inspiration
      {:ok, res_bard} = NpcAcousticReactor.process_acoustic_event(
        "party_1",
        1,
        "Hero",
        "We are marching to slay the dungeon dragon with great glory!",
        false,
        1,
        %{x: 8, y: 12, map_id: 1},
        "proximity"
      )

      assert res_bard.npc.name == "Rowan the Tavern Bard"
      assert String.contains?(res_bard.speech.text, "strings of my lute")
      assert res_bard.action.buff.stat == "morale"
      assert res_bard.action.buff.value == 20

      # 2. Mother Althea the Priestess hears pain and grants Hearth Blessing
      {:ok, res_priest} = NpcAcousticReactor.process_acoustic_event(
        "party_1",
        1,
        "WoundedWarrior",
        "I am bleeding and hurt, my wounds need holy heal!",
        false,
        1,
        %{x: 14, y: 8, map_id: 1},
        "proximity"
      )

      assert res_priest.npc.name == "Mother Althea the Priestess"
      assert String.contains?(res_priest.speech.text, "Sacred Hearth")
      assert res_priest.action.buff.stat == "hp_regen"
      assert res_priest.action.buff.value == 20

      # 3. Barnaby the Merchant hears buying plans and offers discount
      {:ok, res_merchant} = NpcAcousticReactor.process_acoustic_event(
        "party_1",
        1,
        "Shopper",
        "I need to buy a tempered sword and health potion supplies",
        false,
        1,
        %{x: 12, y: 14, map_id: 1},
        "proximity"
      )

      assert res_merchant.npc.name == "Barnaby the Quartermaster"
      assert String.contains?(res_merchant.speech.text, "15%")
      assert res_merchant.action.buff.stat == "trade_discount"
    end

    test "footstep locomotion acoustics emits decibels, surface physics, and awakens sleeping denizens" do
      alias TePhoenix.World.{AcousticPhysics, NpcAcousticReactor}

      # Test AcousticPhysics footstep calculations
      walk_stone = AcousticPhysics.calculate_footstep(:stone, :walk, %{x: 10, y: 10}, "day")
      assert walk_stone.decibels > 0
      assert walk_stone.radius >= 4
      assert walk_stone.can_awaken == true

      sprint_wood = AcousticPhysics.calculate_footstep(:wood, :sprint, %{x: 10, y: 10}, "day")
      assert sprint_wood.radius > walk_stone.radius

      stealth_grass = AcousticPhysics.calculate_footstep(:grass, :stealth, %{x: 10, y: 10}, "day")
      assert stealth_grass.can_awaken == false # Stealth NEVER awakens sleeping denizens!

      # Put an NPC to sleep for test
      Repo.query("UPDATE game_npcs SET is_sleeping = 1 WHERE id = 104")

      # Loud sprint footstep near sleeping Pippin wakes him up!
      {:ok, step_payload} = NpcAcousticReactor.process_footstep_event(
        1,
        "SprintRunner",
        %{x: 6, y: 16, map_id: 1},
        :stone,
        :sprint,
        1,
        "night"
      )

      assert step_payload.stance == :sprint
      assert step_payload.surface == :stone

      # Verify Pippin was awakened
      {:ok, %{rows: [[is_sleeping]]}} = Repo.query("SELECT is_sleeping FROM game_npcs WHERE id = 104")
      assert is_sleeping == 0
    end

    test "CircadianClock manages day/night cycle, nocturnal awakenings, and night sound amplification" do
      alias TePhoenix.World.{AcousticPhysics, CircadianClock}

      assert CircadianClock.night?("night") == true
      assert CircadianClock.night?("midnight") == true
      assert CircadianClock.night?("day") == false

      {:ok, phase} = CircadianClock.set_time_of_day("night", 1)
      assert phase == "night"

      # Night acoustics carry 1.5x further
      day_step = AcousticPhysics.calculate_footstep(:stone, :walk, %{x: 10, y: 10}, "day")
      night_step = AcousticPhysics.calculate_footstep(:stone, :walk, %{x: 10, y: 10}, "night")
      assert night_step.radius > day_step.radius
      assert night_step.is_night == true
    end
  end
end
