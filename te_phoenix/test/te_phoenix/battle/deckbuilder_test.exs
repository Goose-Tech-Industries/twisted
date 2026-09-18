defmodule TePhoenix.Battle.DeckbuilderTest do
  use ExUnit.Case, async: true

  alias TePhoenix.Battle.Deckbuilder

  # Helper to construct a standard mock combatant
  defp build_combatant(attrs \\ %{}) do
    deck_state = %{
      deck: [
        %{key: "slash", name: "Slash", cost: %{mp: 0}},
        %{key: "fireball", name: "Fireball", cost: %{mp: 8}},
        %{key: "heal", name: "Heal", cost: %{mp: 6}}
      ],
      hand: [],
      discard: [],
      max_hand_size: 5,
      draw_per_turn: 2
    }

    base = %{
      char_id: 101,
      name: "Deck Duelist",
      current_hp: 100,
      max_hp: 100,
      current_mp: 50,
      max_mp: 50,
      energy: 20,
      deck_state: deck_state
    }

    Map.merge(base, attrs)
  end

  defp build_battle_state(combatant) do
    %{
      battle_id: "battle_deck_1",
      combatants: %{combatant.char_id => combatant}
    }
  end

  describe "Deckbuilder.draw/2 mechanics" do
    test "1. draws 1 card by default into empty hand" do
      combatant = build_combatant()
      updated = Deckbuilder.draw(combatant)

      assert length(updated.deck_state.hand) == 1
      assert length(updated.deck_state.deck) == 2
      assert hd(updated.deck_state.hand).key == "slash"
    end

    test "2. draws multiple cards at once" do
      combatant = build_combatant()
      updated = Deckbuilder.draw(combatant, 2)

      assert length(updated.deck_state.hand) == 2
      assert length(updated.deck_state.deck) == 1
      assert Enum.map(updated.deck_state.hand, & &1.key) == ["slash", "fireball"]
    end

    test "3. respects max_hand_size and places overflow directly into discard pile" do
      combatant = build_combatant()
      # Limit max hand size to 2
      combatant = put_in(combatant.deck_state.max_hand_size, 2)
      updated = Deckbuilder.draw(combatant, 3)

      assert length(updated.deck_state.hand) == 2
      assert length(updated.deck_state.discard) == 1
      assert hd(updated.deck_state.discard).key == "heal"
    end

    test "4. with already full hand sends drawn cards directly to discard" do
      combatant = build_combatant()
      combatant = put_in(combatant.deck_state.max_hand_size, 1)
      combatant = put_in(combatant.deck_state.hand, [%{key: "existing", name: "Existing", cost: %{}}])

      updated = Deckbuilder.draw(combatant, 2)

      assert length(updated.deck_state.hand) == 1
      assert length(updated.deck_state.discard) == 2
    end

    test "5. when deck is empty automatically shuffles discard pile back into deck to draw" do
      combatant = build_combatant()
      combatant =
        combatant
        |> put_in([:deck_state, :deck], [])
        |> put_in([:deck_state, :discard], [
          %{key: "discarded_1", name: "D1", cost: %{}},
          %{key: "discarded_2", name: "D2", cost: %{}}
        ])

      updated = Deckbuilder.draw(combatant, 1)

      assert length(updated.deck_state.hand) == 1
      assert length(updated.deck_state.deck) == 1
      assert updated.deck_state.discard == []
    end

    test "6. when both deck and discard are empty returns unchanged state without error" do
      combatant = build_combatant()
      combatant =
        combatant
        |> put_in([:deck_state, :deck], [])
        |> put_in([:deck_state, :discard], [])

      updated = Deckbuilder.draw(combatant, 3)

      assert updated.deck_state.hand == []
      assert updated.deck_state.deck == []
      assert updated.deck_state.discard == []
    end

    test "7. partial draw when deck and discard combined have fewer cards than requested count" do
      combatant = build_combatant()
      combatant =
        combatant
        |> put_in([:deck_state, :deck], [%{key: "c1", name: "C1", cost: %{}}])
        |> put_in([:deck_state, :discard], [%{key: "c2", name: "C2", cost: %{}}])

      updated = Deckbuilder.draw(combatant, 5)

      assert length(updated.deck_state.hand) == 2
      assert updated.deck_state.deck == []
      assert updated.deck_state.discard == []
    end
  end

  describe "Deckbuilder.play_card/4 cost payment & validation" do
    test "8. successfully plays a zero-cost card and moves it to discard" do
      combatant = build_combatant()
      card = %{key: "free_strike", name: "Free Strike", cost: %{mp: 0}}
      combatant = put_in(combatant.deck_state.hand, [card])
      state = build_battle_state(combatant)

      assert {:ok, new_state, new_combatant, played_card} = Deckbuilder.play_card(state, combatant, 0, nil)
      assert played_card.key == "free_strike"
      assert new_combatant.deck_state.hand == []
      assert length(new_combatant.deck_state.discard) == 1
      assert new_state.combatants[combatant.char_id].deck_state.discard == [card]
    end

    test "9. successfully deducts MP cost from combatant and updates battle state" do
      combatant = build_combatant(%{current_mp: 20})
      card = %{key: "pyroblast", name: "Pyroblast", cost: %{mp: 12}}
      combatant = put_in(combatant.deck_state.hand, [card])
      state = build_battle_state(combatant)

      assert {:ok, _new_state, new_combatant, _card} = Deckbuilder.play_card(state, combatant, 0, nil)
      assert new_combatant.current_mp == 8
    end

    test "10. successfully deducts energy cost from combatant" do
      combatant = build_combatant(%{energy: 15})
      card = %{key: "sprint_attack", name: "Sprint Attack", cost: %{energy: 7}}
      combatant = put_in(combatant.deck_state.hand, [card])
      state = build_battle_state(combatant)

      assert {:ok, _new_state, new_combatant, _card} = Deckbuilder.play_card(state, combatant, 0, nil)
      assert new_combatant.energy == 8
    end

    test "11. successfully deducts HP cost from combatant" do
      combatant = build_combatant(%{current_hp: 50})
      card = %{key: "blood_pact", name: "Blood Pact", cost: %{hp: 10}}
      combatant = put_in(combatant.deck_state.hand, [card])
      state = build_battle_state(combatant)

      assert {:ok, _new_state, new_combatant, _card} = Deckbuilder.play_card(state, combatant, 0, nil)
      assert new_combatant.current_hp == 40
    end

    test "12. returns {:error, :insufficient_mp} when combatant does not have enough MP" do
      combatant = build_combatant(%{current_mp: 5})
      card = %{key: "meteor", name: "Meteor", cost: %{mp: 20}}
      combatant = put_in(combatant.deck_state.hand, [card])
      state = build_battle_state(combatant)

      assert Deckbuilder.play_card(state, combatant, 0, nil) == {:error, :insufficient_mp}
    end

    test "13. returns {:error, :insufficient_energy} when combatant does not have enough energy" do
      combatant = build_combatant(%{energy: 2})
      card = %{key: "whirlwind", name: "Whirlwind", cost: %{energy: 10}}
      combatant = put_in(combatant.deck_state.hand, [card])
      state = build_battle_state(combatant)

      assert Deckbuilder.play_card(state, combatant, 0, nil) == {:error, :insufficient_energy}
    end

    test "14. returns {:error, :insufficient_hp} when card HP cost is greater than or equal to current HP" do
      combatant = build_combatant(%{current_hp: 10})
      card = %{key: "suicide_strike", name: "Suicide Strike", cost: %{hp: 10}}
      combatant = put_in(combatant.deck_state.hand, [card])
      state = build_battle_state(combatant)

      # Cannot reduce HP to 0 or negative via cost payment
      assert Deckbuilder.play_card(state, combatant, 0, nil) == {:error, :insufficient_hp}
    end

    test "15. returns {:error, :invalid_hand_index} for negative index" do
      combatant = build_combatant()
      combatant = put_in(combatant.deck_state.hand, [%{key: "card", cost: %{}}])
      state = build_battle_state(combatant)

      assert Deckbuilder.play_card(state, combatant, -1, nil) == {:error, :invalid_hand_index}
    end

    test "16. returns {:error, :invalid_hand_index} for index equal to or greater than hand length" do
      combatant = build_combatant()
      combatant = put_in(combatant.deck_state.hand, [%{key: "single_card", cost: %{}}])
      state = build_battle_state(combatant)

      assert Deckbuilder.play_card(state, combatant, 1, nil) == {:error, :invalid_hand_index}
      assert Deckbuilder.play_card(state, combatant, 5, nil) == {:error, :invalid_hand_index}
    end

    test "17. returns {:error, :invalid_hand_index} when hand is empty" do
      combatant = build_combatant()
      combatant = put_in(combatant.deck_state.hand, [])
      state = build_battle_state(combatant)

      assert Deckbuilder.play_card(state, combatant, 0, nil) == {:error, :invalid_hand_index}
    end

    test "18. preserves other cards in hand and maintains order of remaining cards" do
      c1 = %{key: "card1", cost: %{}}
      c2 = %{key: "card2", cost: %{}}
      c3 = %{key: "card3", cost: %{}}

      combatant = build_combatant()
      combatant = put_in(combatant.deck_state.hand, [c1, c2, c3])
      state = build_battle_state(combatant)

      {:ok, _st, new_combatant, played} = Deckbuilder.play_card(state, combatant, 1, nil)
      assert played == c2
      assert new_combatant.deck_state.hand == [c1, c3]
    end
  end

  describe "Deckbuilder.discard_card/2 & lifecycle" do
    test "19. successfully moves card from hand to discard pile" do
      c1 = %{key: "throwaway", cost: %{}}
      combatant = build_combatant()
      combatant = put_in(combatant.deck_state.hand, [c1])

      assert {:ok, updated, discarded} = Deckbuilder.discard_card(combatant, 0)
      assert discarded == c1
      assert updated.deck_state.hand == []
      assert updated.deck_state.discard == [c1]
    end

    test "20. returns {:error, :invalid_hand_index} for negative discard index" do
      combatant = build_combatant()
      assert Deckbuilder.discard_card(combatant, -1) == {:error, :invalid_hand_index}
    end

    test "21. returns {:error, :invalid_hand_index} for out-of-bounds discard index" do
      combatant = build_combatant()
      combatant = put_in(combatant.deck_state.hand, [%{key: "only_card", cost: %{}}])
      assert Deckbuilder.discard_card(combatant, 4) == {:error, :invalid_hand_index}
    end

    test "22. end_turn_draw/1 draws exact number of cards specified by draw_per_turn" do
      combatant = build_combatant()
      combatant = put_in(combatant.deck_state.draw_per_turn, 2)

      updated = Deckbuilder.end_turn_draw(combatant)
      assert length(updated.deck_state.hand) == 2
      assert length(updated.deck_state.deck) == 1
    end

    test "23. shuffle_discard_into_deck/1 merges discard pile into deck and clears discard" do
      combatant = build_combatant()
      combatant =
        combatant
        |> put_in([:deck_state, :deck], [%{key: "d1"}])
        |> put_in([:deck_state, :discard], [%{key: "d2"}, %{key: "d3"}])

      updated = Deckbuilder.shuffle_discard_into_deck(combatant)
      assert length(updated.deck_state.deck) == 3
      assert updated.deck_state.discard == []
    end

    test "24. get_hand/1 returns list of cards in hand or empty list if no deck_state" do
      card = %{key: "test_card"}
      combatant = build_combatant()
      combatant = put_in(combatant.deck_state.hand, [card])

      assert Deckbuilder.get_hand(combatant) == [card]
      assert Deckbuilder.get_hand(%{name: "NoDeckStar"}) == []
    end

    test "25. deck_info/1 returns accurate counts for deck, hand, discard and max_hand_size" do
      combatant = build_combatant()
      combatant =
        combatant
        |> put_in([:deck_state, :deck], [%{key: "a"}, %{key: "b"}])
        |> put_in([:deck_state, :hand], [%{key: "c"}])
        |> put_in([:deck_state, :discard], [%{key: "d"}, %{key: "e"}, %{key: "f"}])
        |> put_in([:deck_state, :max_hand_size], 6)

      info = Deckbuilder.deck_info(combatant)
      assert info == %{deck: 2, hand: 1, discard: 3, max_hand_size: 6}

      nil_info = Deckbuilder.deck_info(%{})
      assert nil_info == %{deck: 0, hand: 0, discard: 0, max_hand_size: 0}
    end
  end
end
