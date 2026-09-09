defmodule TePhoenix.World.UnderworldImmersionAndShopsTest do
  use ExUnit.Case, async: false

  alias TePhoenix.Repo
  alias TePhoenix.World.{
    NpcStalkerDrama,
    PhysicalShop,
    GamblingDen
  }

  setup do
    :ok = Ecto.Adapters.SQL.Sandbox.checkout(Repo)
    Ecto.Adapters.SQL.Sandbox.mode(Repo, {:shared, self()})

    NpcStalkerDrama.ensure_schema!()
    PhysicalShop.ensure_schema!()
    GamblingDen.ensure_schema!()

    try do
      Repo.query("DELETE FROM game_npc_stalker_dramas")
      Repo.query("DELETE FROM game_physical_shelves")
      Repo.query("DELETE FROM game_player_shopping_baskets")
      Repo.query("DELETE FROM game_lottery_tickets")
    rescue
      _ -> :ok
    end

    Repo.query("""
    INSERT INTO characters (id, name, level, current_hp, max_hp, current_mp, max_mp, gold, map_id, x, y, atk, speed, mo, luck)
    VALUES (1, 'VigilanteHero', 5, 100, 100, 50, 50, 600, 1, 8, 11, 16, 16, 16, 16)
    ON DUPLICATE KEY UPDATE gold = 600, current_hp = 100, map_id = 1, atk = 16, speed = 16, mo = 16, luck = 16
    """)

    :ok
  end

  describe "NpcStalkerDrama (Emergent AI Drama & Murder)" do
    test "seeds and retrieves active stalking situations" do
      NpcStalkerDrama.seed_default_dramas!(1)
      drama = NpcStalkerDrama.get_active_drama(1)
      assert drama != nil
      assert drama.stalker_name == "Vane the Viper"
      assert drama.victim_name == "Tobias the Scribe"
      assert drama.stage == "stalking"
      assert drama.turn_timer >= 4
    end

    test "player overhears drama through acoustic and sightline perception" do
      NpcStalkerDrama.seed_default_dramas!(1)
      player = %{id: 1, name: "VigilanteHero", x: 8, y: 11, mo: 16}
      assert {:ok, res} = NpcStalkerDrama.overhear_drama_acoustic(player, 1)
      assert res.detected == true
      assert res.stalker_name == "Vane the Viper"
      assert res.victim_name == "Tobias the Scribe"
    end

    test "player intervenes by ambushing stalker (The Deadpool rescue)" do
      NpcStalkerDrama.seed_default_dramas!(1)
      drama = NpcStalkerDrama.get_active_drama(1)
      player = %{id: 1, name: "VigilanteHero", atk: 18, speed: 18}

      assert {:ok, res} = NpcStalkerDrama.intervene(player, drama.id, :ambush_stalker)
      assert res.action == :ambush_stalker
      if res.success do
        assert res.bounty_gold > 0
        updated = NpcStalkerDrama.get_active_drama(1)
        # Stage became "rescued", so next active drama or nil is returned
        assert is_nil(updated) or updated.id != drama.id
      end
    end

    test "player intervenes with shout or watch whistle" do
      NpcStalkerDrama.seed_default_dramas!(1)
      drama = NpcStalkerDrama.get_active_drama(1)
      player = %{id: 1, name: "VigilanteHero", mo: 18}

      assert {:ok, res} = NpcStalkerDrama.intervene(player, drama.id, :shout_warning)
      assert res.action == :shout_warning
    end

    test "player intervenes by shadowing stalker to safehouse" do
      NpcStalkerDrama.seed_default_dramas!(1)
      drama = NpcStalkerDrama.get_active_drama(1)
      player = %{id: 1, name: "VigilanteHero", speed: 18}

      assert {:ok, res} = NpcStalkerDrama.intervene(player, drama.id, :shadow_stalker)
      assert res.action == :shadow_stalker
    end

    test "player executes Deadpool sarcastic talkdown intervention" do
      NpcStalkerDrama.seed_default_dramas!(1)
      drama = NpcStalkerDrama.get_active_drama(1)
      # High luck/charisma guarantees success (DC 12)
      player = %{id: 1, name: "WadeWilson", mo: 20, luck: 20}

      assert {:ok, res} = NpcStalkerDrama.intervene(player, drama.id, :deadpool_talkdown)
      assert res.action == :deadpool_talkdown
      assert res.roll >= 1
      assert is_binary(res.quote)
      if res.success do
        assert res.bounty_gold > 0
        assert res.xp_awarded == 75
        assert is_binary(res.contract_intel)
      end
    end

    test "player intervenes via tackle, eavesdrop, and attack aliases" do
      NpcStalkerDrama.seed_default_dramas!(1)
      drama = NpcStalkerDrama.get_active_drama(1)

      player = %{id: 1, name: "VigilanteHero", atk: 20, speed: 20, mo: 20}
      assert {:ok, tackle_res} = NpcStalkerDrama.intervene(player, drama.id, :tackle)
      assert tackle_res.action == :ambush_stalker

      # Re-seed for eavesdrop & attack
      Repo.query!("DELETE FROM game_npc_stalker_dramas")
      NpcStalkerDrama.seed_default_dramas!(1)
      drama2 = NpcStalkerDrama.get_active_drama(1)

      assert {:ok, eavesdrop_res} = NpcStalkerDrama.intervene(player, drama2.id, :eavesdrop)
      assert eavesdrop_res.action == :shadow_stalker

      assert {:ok, attack_res} = NpcStalkerDrama.intervene(player, drama2.id, :attack)
      assert attack_res.action == :attack
      assert attack_res.hostile == true
    end

    test "simulates nocturnal stalking broadcasts altercation" do
      NpcStalkerDrama.seed_default_dramas!(1)
      assert {:ok, payload} = TePhoenix.World.UnderworldNpcs.simulate_nocturnal_stalking(1)
      assert payload.stalker_name != nil
      assert payload.victim_name != nil
      assert :deadpool_talkdown in payload.available_actions
      assert :tackle in payload.available_actions
    end

    test "defenestrate brawler automatically finds nearest window and resolves damage" do
      # Seed town buildings and underworld NPCs
      TePhoenix.World.BuildingManager.seed_town_buildings!()
      TePhoenix.World.UnderworldNpcs.seed_underworld_npcs!(1)

      player = %{id: 1, name: "VigilanteHero", atk: 20, x: 6, y: 12}
      target = %{id: 86, name: "Iron-Tooth Silas", role: "brawler", def: 10}

      assert {:ok, res} = TePhoenix.World.UnderworldNpcs.defenestrate_brawler(player, 1, target)
      assert res.attacker_roll >= 1
      if res.success do
        assert res.total_damage >= 0
      else
        assert res.defender_roll >= 1
      end
    end

    test "brawl round tick simulates autonomous tavern chaos" do
      TePhoenix.World.UnderworldNpcs.seed_underworld_npcs!(1)
      assert {:ok, res} = TePhoenix.World.UnderworldNpcs.brawl_round_tick(1)
      assert res.action in [:pewter_tankard, :chair_smash, :defenestration]
    end

    test "ticking drama without rescue leads to murder and crime scene investigation" do
      NpcStalkerDrama.seed_default_dramas!(1)
      drama = NpcStalkerDrama.get_active_drama(1)

      # Force tick until murder occurs
      Enum.each(1..6, fn _ ->
        NpcStalkerDrama.tick_drama(drama.id)
      end)

      # Now drama should be in murdered stage
      case Repo.query("SELECT stage FROM game_npc_stalker_dramas WHERE id = ?", [drama.id]) do
        {:ok, %{rows: [[stage]]}} ->
          assert stage == "murdered"
        _ -> flunk("Drama record missing")
      end

      # Player investigates the crime scene
      player = %{id: 1, name: "VigilanteHero", mo: 18}
      assert {:ok, inv} = NpcStalkerDrama.investigate_crime_scene(player, drama.id)
      if inv.success do
        assert inv.bounty_active == true
        assert length(inv.clues_found) >= 1
      end
    end
  end

  describe "PhysicalShop (Retail Shelves, Baskets & Shoplifting)" do
    test "seeds and lists physical shop fixtures" do
      PhysicalShop.seed_default_shelves!(1, 1)
      shelves = PhysicalShop.list_shelves(1, 1)
      assert length(shelves) == 4

      weapon_rack = Enum.find(shelves, &(&1.shelf_type == "weapons"))
      assert weapon_rack != nil
      assert length(weapon_rack.items) >= 2
    end

    test "player picks up item from shelf into shopping basket" do
      PhysicalShop.seed_default_shelves!(1, 1)
      shelves = PhysicalShop.list_shelves(1, 1)
      weapon_shelf = Enum.find(shelves, &(&1.shelf_type == "weapons"))
      item = hd(weapon_shelf.items)

      player = %{id: 1, name: "Shopper", gold: 500}
      assert {:ok, res} = PhysicalShop.pick_up_item(player, 1, weapon_shelf.id, item["id"] || item[:id])
      assert res.basket_count == 1
      assert res.total_price == (item["price"] || item[:price])

      basket = PhysicalShop.get_basket(1, 1)
      assert length(basket.items) == 1
    end

    test "player puts item back on shelf from basket" do
      PhysicalShop.seed_default_shelves!(1, 1)
      shelves = PhysicalShop.list_shelves(1, 1)
      potion_shelf = Enum.find(shelves, &(&1.shelf_type == "consumables"))
      item = hd(potion_shelf.items)

      player = %{id: 1, name: "Shopper", gold: 500}
      {:ok, _} = PhysicalShop.pick_up_item(player, 1, potion_shelf.id, item["id"] || item[:id])

      assert {:ok, put_res} = PhysicalShop.put_back_item(player, 1, potion_shelf.id, item["id"] || item[:id])
      assert put_res.basket_count == 0
      assert put_res.total_price == 0
    end

    test "player rings up basket at counter with persuasion haggle" do
      PhysicalShop.seed_default_shelves!(1, 1)
      shelves = PhysicalShop.list_shelves(1, 1)
      shelf = hd(shelves)
      item = hd(shelf.items)

      player = %{id: 1, name: "Shopper", gold: 500, mo: 18}
      {:ok, _} = PhysicalShop.pick_up_item(player, 1, shelf.id, item["id"] || item[:id])

      assert {:ok, pay_res} = PhysicalShop.checkout_basket(player, 1, :persuasion)
      assert pay_res.success == true
      assert pay_res.purchased_count == 1
      assert pay_res.final_price <= pay_res.base_price

      # Basket is now empty
      empty_basket = PhysicalShop.get_basket(1, 1)
      assert length(empty_basket.items) == 0
    end

    test "player attempts to shoplift and sneak out" do
      PhysicalShop.seed_default_shelves!(1, 1)
      shelves = PhysicalShop.list_shelves(1, 1)
      shelf = hd(shelves)
      item = hd(shelf.items)

      player = %{id: 1, name: "SneakyThief", speed: 20, map_id: 1}
      {:ok, _} = PhysicalShop.pick_up_item(player, 1, shelf.id, item["id"] || item[:id])

      assert {:ok, steal_res} = PhysicalShop.attempt_shoplift(player, 1)
      assert steal_res.total > 0
      if steal_res.success do
        assert length(steal_res.stolen_items) == 1
      else
        assert steal_res.caught == true
        assert steal_res.bounty_added > 0
      end
    end
  end

  describe "GamblingDen (Scratch-Offs, Dice & Town Lottery)" do
    test "purchases and evaluates a Silver Serpent scratch card" do
      player = %{id: 1, name: "Gambler", gold: 500}
      assert {:ok, card} = GamblingDen.buy_scratch_card(player, "silver")
      assert card.cost == 25
      assert length(card.cells) == 9
      assert card.remaining_gold >= 0
      if card.is_winner do
        assert card.multiplier > 0
        assert card.payout_gold > 0
      else
        assert card.payout_gold == 0
      end
    end

    test "plays tavern dice match against NPC house" do
      player = %{id: 1, name: "DiceRoller", gold: 500}
      assert {:ok, dice} = GamblingDen.play_tavern_dice(player, 20)
      assert dice.bet == 20
      assert length(dice.player_dice) == 3
      assert length(dice.house_dice) == 3
      assert dice.player_total >= 3 and dice.player_total <= 18
      assert dice.house_total >= 3 and dice.house_total <= 18
    end

    test "buys lottery ticket and checks town jackpot" do
      jackpot = GamblingDen.get_current_jackpot(1)
      assert jackpot >= 2500

      player = %{id: 1, name: "LottoFan", gold: 500}
      assert {:ok, lotto} = GamblingDen.buy_lottery_ticket(player, [4, 9, 17], 1)
      assert lotto.success == true
      assert lotto.cost == 10
      assert lotto.current_jackpot >= jackpot

      # Draw daily lottery
      assert {:ok, draw} = GamblingDen.draw_daily_lottery(1)
      assert length(draw.winning_numbers) == 3
      assert draw.next_jackpot >= 2500
    end
  end
end
