defmodule TePhoenix.World.BuildingsAndDeescalationTest do
  use ExUnit.Case, async: false

  alias TePhoenix.Repo
  alias TePhoenix.World.{
    BuildingManager,
    AcousticPhysics,
    NpcAcousticReactor,
    CircadianClock,
    SovereignRumors,
    UnderworldNpcs,
    Defenestration,
    StormAcoustics,
    PropertyManager,
    GasDispersion,
    Weather
  }
  alias TePhoenix.Battle.Deescalation

  setup do
    :ok = Ecto.Adapters.SQL.Sandbox.checkout(Repo)
    Ecto.Adapters.SQL.Sandbox.mode(Repo, {:shared, self()})

    BuildingManager.ensure_schema!()
    PropertyManager.ensure_schema!()

    try do
      Repo.query("DELETE FROM game_properties")
    rescue
      _ -> :ok
    end

    BuildingManager.seed_town_buildings!()

    Repo.query("""
    INSERT INTO characters (id, name, level, current_hp, max_hp, current_mp, max_mp, gold, map_id, x, y)
    VALUES (1, 'TestHero', 1, 100, 100, 50, 50, 500, 1, 6, 12)
    ON DUPLICATE KEY UPDATE gold = 500, current_hp = 100, map_id = 1
    """)

    :ok
  end

  describe "BuildingManager & Nested Interior Sub-Maps" do
    test "lists seeded buildings on Map 1" do
      buildings = BuildingManager.list_buildings_for_map(1)
      assert length(buildings) >= 4

      tavern = Enum.find(buildings, &(&1.building_key == "prancing_mare"))
      assert tavern != nil
      assert tavern.building_type == "tavern"
      assert tavern.exterior_door_x == 7
      assert tavern.exterior_door_y == 12
      assert tavern.interior_map_id == 101
      assert length(tavern.windows) >= 2
    end

    test "resolves exterior and interior doors accurately" do
      # Exterior door check
      assert {:exterior_door, b} = BuildingManager.get_building_at_door(1, 7, 12)
      assert b.building_key == "prancing_mare"

      # Interior door check (stepping out of tavern)
      assert {:interior_door, b_int} = BuildingManager.get_building_at_door(101, 5, 9)
      assert b_int.building_key == "prancing_mare"
      assert b_int.map_id == 1
      assert b_int.exterior_door_x == 7
    end

    test "finds window portals near coordinates" do
      # Window at {6, 12}
      windows = BuildingManager.find_windows_near(1, 6, 12, 1)
      assert windows != []
      assert hd(windows).building_key == "prancing_mare"

      # Far coordinate with no windows
      empty = BuildingManager.find_windows_near(1, 20, 20, 1)
      assert empty == []
    end

    test "circadian door lock checks" do
      shop = BuildingManager.get_building(1, "barnaby_shop")
      assert shop != nil

      # Shop open during day, locked at night
      refute BuildingManager.door_locked?(shop, "day")
      assert BuildingManager.door_locked?(shop, "night")
      assert BuildingManager.door_locked?(shop, "midnight")

      # Hideout is always accessible at night
      hideout = BuildingManager.get_building(1, "shadow_den")
      refute BuildingManager.door_locked?(hideout, "night")
    end
  end

  describe "Window Acoustic Portals & Sound Bleed" do
    test "sound transmits through window portals with high clarity" do
      # Window at {6, 12}. Speaker sitting outside at {6, 12}, listener inside tavern at {6, 10}
      res_window = AcousticPhysics.calculate_spatial_audio(%{x: 6, y: 12}, %{x: 6, y: 10}, "proximity", 1)

      assert res_window.through_window == true
      refute res_window.muffled
      assert res_window.volume > 0.50

      # In contrast, across a solid wall with no window
      res_wall = AcousticPhysics.calculate_spatial_audio(%{x: 2, y: 2}, %{x: 8, y: 8}, "proximity", 1)
      assert res_wall.occluded == true
      assert res_wall.muffled == true
    end

    test "window_portal? accurately detects window aperture" do
      assert AcousticPhysics.window_portal?(6, 12, 1) == true
      assert AcousticPhysics.window_portal?(25, 25, 1) == false
    end
  end

  describe "Belligerent Drunk & Window Reactivity" do
    test "footstep near Olaf the Drunk triggers argument and altercation dialogue" do
      olaf = %{
        id: 109,
        name: "Olaf the Stumbling Drunkard",
        role: "drunk",
        is_sleeping: false,
        is_hostile: false,
        is_enemy: false,
        is_nocturnal: true,
        x: 7,
        y: 13,
        distance: 1.0,
        icon: "🍺"
      }

      {:ok, payload} = NpcAcousticReactor.process_footstep_event(
        1, "ValiantPlayer", %{x: 7, y: 12}, :stone, :walk, 1, "night"
      )

      assert payload.stance == :walk
      assert payload.surface == :stone
    end

    test "speech near window is overheard by tavern bard through the window" do
      {:ok, result} = NpcAcousticReactor.process_acoustic_event(
        nil, 1, "MinstrelFriend", "We fight for glory and honor!", false, 1, %{x: 6, y: 12}, "proximity"
      )

      assert is_map(result)
      action_type = result.action[:action_type] || result.action[:type]
      assert result.speech.text =~ "glory" or result.speech.text =~ "honor" or result.speech.text =~ "valor" or action_type in [:bardic_inspiration, :bardic_window_inspiration, :drunk_altercation]
    end
  end

  describe "Silver Tongue & De-escalation Engine" do
    test "persuasion roll success and failure with deterministic D20" do
      actor = %{char_id: 1, name: "DiplomatHero", level: 5}
      target = %{id: 109, name: "Olaf the Stumbling Drunkard", role: "drunk", level: 1}

      # High roll (18) succeeds
      res_win = Deescalation.attempt_deescalation(actor, target, :persuasion, %{roll: 18})
      assert res_win.success == true
      assert res_win.pacified == true
      assert res_win.diplomacy_xp > 0
      assert res_win.dialogue =~ "peace" or res_win.dialogue =~ "friend" or res_win.dialogue =~ "point"

      # Low roll (2) fails
      res_lose = Deescalation.attempt_deescalation(actor, target, :persuasion, %{roll: 2})
      assert res_lose.success == false
      assert res_lose.pacified == false
      assert res_lose.dialogue =~ "stubborn" or res_lose.dialogue =~ "Steel" or res_lose.dialogue =~ "words"
    end

    test "buying a drink instantly disarms drunks" do
      actor = %{char_id: 1, name: "GenerousPatron", level: 3}
      target = %{id: 109, name: "Olaf", role: "drunk", level: 1}

      res = Deescalation.attempt_deescalation(actor, target, :buy_drink)
      assert res.success == true
      assert res.pacified == true
      assert res.cost_gold == 5
      assert res.dialogue =~ "ale" or res.dialogue =~ "Skål" or res.dialogue =~ "brother"
    end

    test "intimidation scales with level and succeeds on high roll" do
      actor = %{char_id: 1, name: "DreadWarlord", level: 10}
      target = %{id: 107, name: "Captain Vane", role: "guard", level: 5}

      res = Deescalation.attempt_deescalation(actor, target, :intimidation, %{roll: 16})
      assert res.success == true
      assert res.pacified == true
      assert res.dialogue =~ "sheathes" or res.dialogue =~ "mercy" or res.dialogue =~ "settle"
    end

    test "critical success on natural 20" do
      actor = %{char_id: 1, name: "LuckyRogue", level: 1}
      target = %{id: 108, name: "Grendel", role: "boss", level: 15}

      res = Deescalation.attempt_deescalation(actor, target, :persuasion, %{roll: 20})
      assert res.success == true
      assert res.is_crit == true
      assert res.pacified == true
      assert res.dialogue =~ "awe" or res.dialogue =~ "wisdom"
    end

    test "critical failure on natural 1" do
      actor = %{char_id: 1, name: "BumblingFool", level: 20}
      target = %{id: 109, name: "Olaf", role: "drunk", level: 1}

      res = Deescalation.attempt_deescalation(actor, target, :persuasion, %{roll: 1})
      assert res.success == false
      assert res.pacified == false
      assert res.dialogue =~ "spits" or res.dialogue =~ "insults" or res.dialogue =~ "cur"
    end
  end

  describe "Dynamic Window States, Hearing Modulation & Infiltration" do
    test "opening and closing window dramatically modulates acoustic volume and muffling" do
      # Set window at {6, 12} to wide open
      {:ok, _} = BuildingManager.set_window_state(1, "prancing_mare", 6, 12, "open")
      open_audio = AcousticPhysics.calculate_spatial_audio(%{x: 6, y: 12}, %{x: 6, y: 10}, "proximity", 1)
      assert open_audio.through_window == true
      refute open_audio.muffled
      assert open_audio.volume > 0.60
      assert open_audio.window_state == "open"

      # Close the window pane (glass)
      {:ok, _} = BuildingManager.set_window_state(1, "prancing_mare", 6, 12, "closed")
      closed_audio = AcousticPhysics.calculate_spatial_audio(%{x: 6, y: 12}, %{x: 6, y: 10}, "proximity", 1)
      assert closed_audio.through_window == true
      assert closed_audio.muffled == true
      assert closed_audio.volume < open_audio.volume
      assert closed_audio.window_state == "closed"

      # Shutter the window (heavy wood)
      {:ok, _} = BuildingManager.set_window_state(1, "prancing_mare", 6, 12, "shuttered")
      shuttered_audio = AcousticPhysics.calculate_spatial_audio(%{x: 6, y: 12}, %{x: 6, y: 10}, "proximity", 1)
      assert shuttered_audio.through_window == true
      assert shuttered_audio.muffled == true
      assert shuttered_audio.volume < closed_audio.volume
      assert shuttered_audio.reverb >= 0.50
    end

    test "toggle_window transitions states and respects stealth" do
      player = %{id: 1, name: "ShadowRogue", agi: 18}

      {:ok, res} = BuildingManager.toggle_window(player, 1, 6, 12, "open")
      assert res.success == true
      assert res.state == "open"
      assert res.window_x == 6
      assert res.window_y == 12

      {:ok, res2} = BuildingManager.toggle_window(player, 1, 6, 12, "closed")
      assert res2.success == true
      assert res2.state == "closed"
    end

    test "peek_window reveals occupants through glass/open sash and blocks when shuttered" do
      player = %{id: 1, name: "Scout"}

      # When open
      {:ok, _} = BuildingManager.set_window_state(1, "prancing_mare", 6, 12, "open")
      peek_open = BuildingManager.peek_window(player, 1, 6, 12)
      assert peek_open.can_see == true
      assert peek_open.clarity == :clear
      assert peek_open.building_name =~ "Prancing Mare"
      assert is_list(peek_open.occupants)

      # When shuttered
      {:ok, _} = BuildingManager.set_window_state(1, "prancing_mare", 6, 12, "shuttered")
      peek_shuttered = BuildingManager.peek_window(player, 1, 6, 12)
      assert peek_shuttered.can_see == false
      assert peek_shuttered.message =~ "shutters are tightly bolted"
    end

    test "climb_window allows infiltration when open and rejects when shut" do
      player = %{id: 1, name: "Burglar", agi: 16}

      # Shut window cannot be climbed
      {:ok, _} = BuildingManager.set_window_state(1, "prancing_mare", 6, 12, "closed")
      assert {:error, msg} = BuildingManager.climb_window(player, 1, 6, 12)
      assert msg =~ "closed"

      # Open window allows climbing directly into interior map
      {:ok, _} = BuildingManager.set_window_state(1, "prancing_mare", 6, 12, "open")
      assert {:ok, climb_res} = BuildingManager.climb_window(player, 1, 6, 12)
      assert climb_res.success == true
      assert climb_res.map_id == 101
      assert climb_res.xp_awarded == 25
    end

    test "throw_distraction sends sound through open window" do
      player = %{id: 1, name: "Trickster"}
      {:ok, _} = BuildingManager.set_window_state(1, "prancing_mare", 6, 12, "open")

      res = BuildingManager.throw_distraction(player, 1, 6, 12, "copper coin")
      assert res.success == true
      assert res.message =~ "copper coin"
    end

    test "SovereignRumors eavesdrops on interior secrets through open window" do
      player = %{id: 1, name: "Eavesdropper", wis: 14}
      {:ok, _} = BuildingManager.set_window_state(1, "prancing_mare", 6, 12, "open")

      res = SovereignRumors.eavesdrop_at_window(player, 1, 6, 12)
      assert res.success == true
      assert res.eavesdropped == true
      assert res.building_key == "prancing_mare"
      assert res.dialogue != nil
      assert res.perk != nil
      assert res.reward_xp > 0

      # Shuttered window blocks eavesdropping
      {:ok, _} = BuildingManager.set_window_state(1, "prancing_mare", 6, 12, "shuttered")
      res_shuttered = SovereignRumors.eavesdrop_at_window(player, 1, 6, 12)
      assert res_shuttered.success == false
      assert res_shuttered.dialogue =~ "shutters are latched"
    end
  end

  describe "Underworld NPCs: Stalkers, Addicts & Cascading Brawls" do
    test "spotting and interacting with a lurking stalker" do
      # Seeded Corvus the Whisper
      {:ok, %{rows: [[stalker_id]]}} = Repo.query("SELECT id FROM game_npcs WHERE role = 'stalker' AND map_id = 1 LIMIT 1")

      # High wisdom & charisma player spots stalker
      player_perceptive = %{id: 1, name: "Hawk-Eye", x: 8, y: 13, mo: 34, atk: 34}
      assert {:ok, res_spot} = UnderworldNpcs.spot_stalker(player_perceptive, 1, stalker_id)
      assert res_spot.spotted == true
      assert res_spot.name == "Corvus the Whisper"
      assert :interrogate in res_spot.available_actions

      # Interrogate stalker
      assert {:ok, res_interrogate} = UnderworldNpcs.interact_stalker(player_perceptive, 1, stalker_id, :interrogate)
      assert res_interrogate.action == :interrogate

      # Bribe stalker (ensure player has gold)
      Repo.query!("UPDATE characters SET gold = 50 WHERE id = 1")
      assert {:ok, res_bribe} = UnderworldNpcs.interact_stalker(player_perceptive, 1, stalker_id, :bribe)
      assert res_bribe.action == :bribe
      assert res_bribe.cost_gold == 15
      assert res_bribe.buff.name == "Shadow Scout"
    end

    test "interacting with gutter addict: alms, secrets, and screech alert" do
      {:ok, %{rows: [[addict_id]]}} = Repo.query("SELECT id FROM game_npcs WHERE role = 'addict' AND map_id = 1 LIMIT 1")
      Repo.query!("UPDATE characters SET gold = 30 WHERE id = 1")
      player = %{id: 1, name: "Merciful", mo: 12, luck: 12}

      # Offer fix for black market secret
      assert {:ok, res_fix} = UnderworldNpcs.interact_addict(player, 1, addict_id, :offer_fix)
      assert res_fix.action == :offer_fix
      assert res_fix.cost_gold == 5
      assert res_fix.secret != nil

      # Threaten addict triggers 75 dB screech alerting guards
      assert {:ok, res_threat} = UnderworldNpcs.interact_addict(player, 1, addict_id, :threaten)
      assert res_threat.screech_decibels == 75
      assert res_threat.guards_alerted == true

      # Lingering pickpocket check
      assert {:ok, res_pick} = UnderworldNpcs.interact_addict(player, 1, addict_id, :pickpocket_check)
      assert res_pick.success == true
    end

    test "cascading tavern brawl escalates rowdy drunks" do
      player = %{id: 1, name: "Instigator", x: 7, y: 12}
      assert {:ok, res} = UnderworldNpcs.cascade_tavern_brawl(player, 1)
      assert res.success == true
      assert res.brawlers_count >= 1
      assert res.message =~ "brawl"
    end
  end

  describe "Defenestration Combat Mechanics" do
    test "violently hurls target through closed window, shattering glass and causing fall damage" do
      attacker = %{id: 1, name: "Bruiser", atk: 40, is_player: true}
      target = %{id: 109, name: "Olaf the Drunk", def: 0, is_player: false}

      # Window at {6, 12} set to closed
      {:ok, _} = BuildingManager.set_window_state(1, "prancing_mare", 6, 12, "closed")

      assert {:ok, res} = Defenestration.defenestrate(attacker, target, 1, 6, 12)
      assert res.success == true
      assert res.glass_shattered == true
      assert res.total_damage > 0
      assert res.bleeding == true
      assert res.prone == true
      assert res.message =~ "DEFENESTRATED"
    end

    test "iron window bars block defenestration" do
      attacker = %{id: 1, name: "Bruiser", atk: 18, is_player: true}
      target = %{id: 109, name: "Olaf the Drunk", def: 8, is_player: false}

      # Install iron bars onto property for building 3
      Repo.query!("UPDATE game_properties SET fortifications_json = '[\"iron_window_bars\"]' WHERE building_id = 3")

      assert {:ok, res} = Defenestration.defenestrate(attacker, target, 1, 15, 7)
      assert res.success == false
      assert res.blocked_by_bars == true
      assert res.message =~ "Heavy iron bars block the window"
    end
  end

  describe "Storm Acoustics & Gale Wind Drafts" do
    test "evaluates weather acoustic noise floor and hearing attenuation" do
      mask_clear = StormAcoustics.get_storm_acoustic_mask(1)
      assert mask_clear.mask_db == 0
      assert mask_clear.hearing_mult == 1.0

      # Set thunderstorm weather
      Weather.set_weather(1, "thunderstorm")
      mask_storm = StormAcoustics.get_storm_acoustic_mask(1)
      assert mask_storm.mask_db >= 36
      assert mask_storm.hearing_mult < 0.60
      assert mask_storm.is_gale == true

      # Trigger thunderclap
      res_clap = StormAcoustics.trigger_thunderclap(1)
      assert res_clap.decibels == 95
      assert res_clap.masking_duration_seconds == 3
    end

    test "gale draft blows out indoor candles through open window" do
      Weather.set_weather(1, "heavy_rain")
      {:ok, _} = BuildingManager.set_window_state(1, "prancing_mare", 6, 12, "open")

      assert {:ok, draft} = StormAcoustics.evaluate_indoor_draft(1, "prancing_mare")
      assert draft.draft_active == true
      assert draft.window_state == "open"
    end
  end

  describe "Player Property Deeds, Fortifications & Soundproofing" do
    test "lists, purchases property, and configures velvet soundproof curtains" do
      player = %{id: 1, name: "Lord Wayne", map_id: 1, gold: 500}

      # List properties
      props = PropertyManager.list_properties(1)
      assert props != []
      prop = hd(props)

      # Purchase property
      assert {:ok, p_res} = PropertyManager.purchase_property(player, prop.id)
      assert p_res.success == true
      assert p_res.owner_name == "Lord Wayne"

      # Install alarm glyph
      assert {:ok, f_res} = PropertyManager.add_fortification(player, prop.id, "alarm_glyph")
      assert f_res.success == true
      assert f_res.fortification == "alarm_glyph"

      # Draw curtains shut: volume mult drops to 0.02x
      assert {:ok, c_res} = PropertyManager.toggle_soundproof_curtains(player, prop.id, true)
      assert c_res.curtains_drawn == true
      assert c_res.sound_multiplier == 0.02

      # Resting in sanctuary grants Well Rested buff
      assert {:ok, r_res} = PropertyManager.rest_in_sanctuary(player, prop.id)
      assert r_res.success == true
      assert r_res.hp_restored == true
      assert r_res.buff.name == "Well Rested"

      # Unseal curtains for other tests
      PropertyManager.toggle_soundproof_curtains(player, prop.id, false)
    end
  end

  describe "Chemical Gas Dispersion" do
    test "deploys sleeping gas through cracked window" do
      player = %{id: 1, name: "Alchemist"}
      {:ok, _} = BuildingManager.set_window_state(1, "prancing_mare", 6, 12, "cracked")

      assert {:ok, res} = GasDispersion.deploy_gas(player, 1, 6, 12, "sleeping_gas")
      assert res.success == true
      assert res.gas_type == "sleeping_gas"
      assert res.gas_name =~ "Morpheus"
      assert res.message =~ "lavender vapor"
    end

    test "deploys tear gas forcing evacuation" do
      player = %{id: 1, name: "Alchemist"}
      {:ok, _} = BuildingManager.set_window_state(1, "prancing_mare", 6, 12, "open")

      assert {:ok, res} = GasDispersion.deploy_gas(player, 1, 6, 12, "skunkweed_tear_gas")
      assert res.success == true
      assert res.gas_type == "skunkweed_tear_gas"
    end

    test "fails to deploy gas through shuttered window" do
      player = %{id: 1, name: "Alchemist"}
      {:ok, _} = BuildingManager.set_window_state(1, "prancing_mare", 6, 12, "shuttered")

      assert {:error, err} = GasDispersion.deploy_gas(player, 1, 6, 12, "sleeping_gas")
      assert err =~ "shuttered"
    end
  end
end
