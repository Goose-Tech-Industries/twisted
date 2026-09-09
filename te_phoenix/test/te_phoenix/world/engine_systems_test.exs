defmodule TePhoenix.World.EngineSystemsTest do
  use ExUnit.Case, async: false

  alias TePhoenix.Repo
  alias TePhoenix.World.EngineFeatureFlags
  alias TePhoenix.World.SafehouseWorkshop
  alias TePhoenix.World.CatacombGenerator
  alias TePhoenix.World.FactionTerritory
  alias TePhoenix.World.ForensicMystery
  alias TePhoenix.Combat.VoiceCombat

  setup do
    :ok = Ecto.Adapters.SQL.Sandbox.checkout(Repo, sandbox: false)

    EngineFeatureFlags.ensure_schema!()
    SafehouseWorkshop.ensure_schema!()
    CatacombGenerator.ensure_schema!()
    FactionTerritory.ensure_schema!()
    ForensicMystery.ensure_schema!()

    Repo.query!("DELETE FROM game_district_territories")
    FactionTerritory.seed_default_districts!()

    Repo.query!("DELETE FROM game_case_suspects")
    Repo.query!("DELETE FROM game_case_clues")
    Repo.query!("DELETE FROM game_forensic_cases")
    ForensicMystery.seed_default_case!()

    :ok
  end

  describe "1. Master Feature Flags Matrix" do
    test "lists all 10 default feature flags with metadata" do
      flags = EngineFeatureFlags.list_all_flags()
      assert length(flags) >= 10

      colossus_flag = Enum.find(flags, &(&1.feature_key == "colossus_raids_enabled"))
      assert colossus_flag != nil
      assert colossus_flag.is_enabled == true
    end

    test "toggles feature flag and reflects in fast cached lookup" do
      assert EngineFeatureFlags.is_enabled?("spoken_catacombs_enabled") == true

      {:ok, payload} = EngineFeatureFlags.toggle_flag("spoken_catacombs_enabled", false)
      assert payload.is_enabled == false
      assert EngineFeatureFlags.is_enabled?("spoken_catacombs_enabled") == false

      # Reset back
      {:ok, _} = EngineFeatureFlags.toggle_flag("spoken_catacombs_enabled", true)
      assert EngineFeatureFlags.is_enabled?("spoken_catacombs_enabled") == true
    end
  end

  describe "2. Safehouse Bastion Workshop" do
    test "sockets trophy rune on gear and calculates bonuses" do
      prop_id = 991
      item_id = "ebon_blade"
      item_name = "Ebon Glass Blade"
      rune_key = "colossus_skull_rune"

      {:ok, res} = SafehouseWorkshop.socket_rune(prop_id, item_id, item_name, rune_key, "primary")
      assert res.bonus_stat == "parry_window_ms"
      assert res.bonus_value == 50

      runes = SafehouseWorkshop.list_socketed_runes(prop_id)
      assert length(runes) == 1
      assert hd(runes).rune_key == "colossus_skull_rune"
    end

    test "brews alchemy concoction and lists active brews" do
      prop_id = 992
      recipe_key = "valyrian_elixir"

      {:ok, res} = SafehouseWorkshop.brew_concoction(prop_id, recipe_key)
      assert res.recipe_key == "valyrian_elixir"

      brews = SafehouseWorkshop.list_alembic_brews(prop_id)
      assert length(brews) >= 1
      assert hd(brews).recipe_key == "valyrian_elixir"
    end

    test "dispatches companion on timed smuggler heist mission" do
      prop_id = 993
      cid = 42
      cname = "Valeria the Shieldmaiden"
      mtype = "contraband_heist"

      {:ok, res} = SafehouseWorkshop.start_dispatch(prop_id, cid, cname, mtype)
      assert res.mission_type == "contraband_heist"

      dispatches = SafehouseWorkshop.list_dispatches(prop_id)
      assert length(dispatches) >= 1
      assert hd(dispatches).companion_name == cname
    end
  end

  describe "3. Spoken Dungeon Catacombs On-Demand" do
    test "procedurally generates 5-room progressive catacomb from prompt" do
      creator_id = 1
      prompt = "Spawn a flooded crypt with drowned spectres and an ancient sunken hydra"

      {:ok, dungeon} = CatacombGenerator.generate_catacomb(creator_id, prompt, "sunken_crypt", "elite")
      assert dungeon.name =~ "Catacombs"
      assert dungeon.status == "active"
      assert length(dungeon.rooms) == 5

      # Verify progressive rooms: entrance, hall, trap, treasure, boss_arena
      types = Enum.map(dungeon.rooms, & &1.type)
      assert "entrance" in types
      assert "boss_arena" in types
    end

    test "clears catacomb chamber and updates dungeon progression" do
      creator_id = 2
      {:ok, dungeon} = CatacombGenerator.generate_catacomb(creator_id, "Test Catacomb")

      {:ok, res} = CatacombGenerator.clear_room(dungeon.id, 1)
      assert res.status == "active"
    end
  end

  describe "4. Dynamic Faction Territory Wars" do
    test "lists default districts with influence breakdown" do
      districts = FactionTerritory.list_territories()
      assert length(districts) >= 4

      lowtown = Enum.find(districts, &(&1.key == "lowtown"))
      assert lowtown != nil
      assert lowtown.controlling_faction == "syndicate"
    end

    test "shifts influence and dynamically recalculates controlling faction and guards" do
      district_key = "lowtown"
      # Shift City Watch by +50 to overpower Syndicate
      {:ok, res} = FactionTerritory.shift_influence(district_key, "watch", 50, "City Guard Incursion")

      assert res.controlling_faction == "watch"
      assert res.guard_type =~ "City Watch"
    end

    test "triggers turf skirmish event in district" do
      district_key = "haven_plaza"
      {:ok, res} = FactionTerritory.trigger_turf_skirmish(district_key, "syndicate")
      assert res.district_key == "haven_plaza"
    end
  end

  describe "5. Forensic Murder Mystery & Courtroom Trials" do
    test "lists active murder mystery cases" do
      cases = ForensicMystery.list_active_cases()
      assert length(cases) >= 1
      assert hd(cases).case_code == "CASE-701"
    end

    test "inspects crime scene and uncovers physical clues" do
      case_item = hd(ForensicMystery.list_active_cases())
      {:ok, res} = ForensicMystery.inspect_crime_scene(case_item.id)
      assert length(res.clues) == 3
      assert Enum.all?(res.clues, &(&1.is_discovered == true))
    end

    test "interrogates suspect and extracts confession under pressure" do
      case_item = hd(ForensicMystery.list_active_cases())
      # Barnaby the Blacksmith (suspect_id = 2) is the culprit
      {:ok, res1} = ForensicMystery.interrogate_suspect(case_item.id, 2, "pressure")
      assert res1.confessed == false

      # Second interrogation with evidence breaks him
      {:ok, res2} = ForensicMystery.interrogate_suspect(case_item.id, 2, "evidence")
      assert res2.confessed == true
      assert res2.message =~ "hurl"
    end

    test "holds courtroom trial: guilty conviction awards full bounty gold" do
      case_item = hd(ForensicMystery.list_active_cases())
      # Accuse true culprit (suspect_id = 2)
      {:ok, res} = ForensicMystery.hold_courtroom_trial(case_item.id, 2)
      assert res.verdict == :guilty_convicted
      assert res.reward_gold == 450
    end
  end

  describe "6. Real-Time Spoken Combat Spellcrafting & Squad Voice Tactics" do
    test "casts spoken incantation 'Ignis Tempest' with vocal resonance bonus" do
      char_id = 1
      phrase = "Ignis Tempest!"
      pitch = 240
      amp = -8.0

      {:ok, res} = VoiceCombat.cast_spoken_incantation(char_id, phrase, pitch, amp)
      assert res.spell_name == "Ignis Tempest"
      assert res.element == "fire"
      assert res.resonance_pct == 35
      assert res.total_power > 180
    end

    test "issues tactical voice command to squad companion" do
      char_id = 1
      cmd = "Valeria shield the line!"

      {:ok, res} = VoiceCombat.issue_squad_voice_command(char_id, cmd)
      assert res.companion == "Valeria the Shieldmaiden"
      assert res.action == "aegis_shield_intercept"
      assert res.shout =~ "Hold fast"
    end
  end
end
