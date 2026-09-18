defmodule TePhoenix.Game.TransformationsTest do
  use ExUnit.Case, async: true
  alias TePhoenix.Game.Transformations

  setup do
    base_form = %{
      "id" => 1,
      "name" => "Super Warrior",
      "power_multiplier" => "1.5",
      "drain_per_turn_pct" => "5.0",
      "activation_cost_pct" => "10.0",
      "is_stackable" => 0,
      "duration_type" => "sustained",
      "controllable" => 1,
      "aura_color" => "#FFD700",
      "aura_effect" => "flame",
      "hair_color" => "golden",
      "eye_color" => "teal",
      "skin_color" => nil,
      "sprite_override" => "ssj_warrior",
      "particle_effect" => "sparks",
      "screen_shake" => 1,
      "transform_dialogue" => "HAAAA!",
      "uncontrolled_behavior" => nil,
      "memory_loss" => 0
    }

    stackable_form = %{
      "id" => 2,
      "name" => "Kaioken",
      "power_multiplier" => "1.2",
      "drain_per_turn_pct" => "2.0",
      "is_stackable" => 1,
      "duration_type" => "sustained",
      "controllable" => 1,
      "stack_tiers_json" => Jason.encode!([
        %{"tier" => 1, "name" => "Kaioken x2", "multiplier" => 1.5, "drain" => 4.0},
        %{"tier" => 2, "name" => "Kaioken x4", "multiplier" => 2.0, "drain" => 10.0}
      ])
    }

    wild_form = %{
      "id" => 3,
      "name" => "Great Ape",
      "power_multiplier" => "3.0",
      "drain_per_turn_pct" => "0.0",
      "controllable" => 0,
      "uncontrolled_behavior" => "attack_random",
      "memory_loss" => 1,
      "duration_type" => "event",
      "event_trigger" => "full_moon"
    }

    {:ok, base_form: base_form, stackable_form: stackable_form, wild_form: wild_form}
  end

  test "1. to_float converts nil to 0.0" do
    assert Transformations.to_float(nil) == 0.0
  end

  test "2. to_float converts integer to float" do
    assert Transformations.to_float(42) == 42.0
  end

  test "3. to_float preserves float values" do
    assert Transformations.to_float(3.14) == 3.14
  end

  test "4. to_float parses numeric strings" do
    assert Transformations.to_float("2.5") == 2.5
    assert Transformations.to_float("100") == 100.0
  end

  test "5. to_float safely returns 0.0 for invalid strings" do
    assert Transformations.to_float("banana") == 0.0
  end

  test "6. calculate_drain computes exact turn drain and new attack power" do
    result = Transformations.calculate_drain(100, 10.0)
    assert result.drain == 10
    assert result.new_atk == 90
    assert result.reverted == false
  end

  test "7. calculate_drain returns 0 drain for zero percentage" do
    result = Transformations.calculate_drain(100, 0)
    assert result.drain == 0
    assert result.new_atk == 100
    assert result.reverted == false
  end

  test "8. calculate_drain flags reverted: true when energy is fully exhausted" do
    result = Transformations.calculate_drain(10, 100.0)
    assert result.new_atk == 1
    assert result.reverted == true
  end

  test "9. calculate_drain never drops ATK below 1" do
    result = Transformations.calculate_drain(5, 500.0)
    assert result.new_atk == 1
  end

  test "10. calculate_activation_cost deducts cost from power score" do
    result = Transformations.calculate_activation_cost(200, 20.0)
    assert result.cost == 40
    assert result.remaining_atk == 160
  end

  test "11. calculate_activation_cost costs 0 for nil or zero cost_pct" do
    assert Transformations.calculate_activation_cost(150, nil).cost == 0
    assert Transformations.calculate_activation_cost(150, 0).cost == 0
  end

  test "12. calculate_activation_cost ensures remaining ATK stays at least 1" do
    result = Transformations.calculate_activation_cost(50, 150.0)
    assert result.remaining_atk == 1
  end

  test "13. resolve_form_tier returns base power multiplier and drain for non-stackable form", %{base_form: form} do
    {multiplier, name, drain} = Transformations.resolve_form_tier(form, 0)
    assert multiplier == 1.5
    assert name == "Super Warrior"
    assert drain == 5.0
  end

  test "14. resolve_form_tier returns base stats for stackable form when tier is 0", %{stackable_form: form} do
    {multiplier, name, drain} = Transformations.resolve_form_tier(form, 0)
    assert multiplier == 1.2
    assert name == "Kaioken"
    assert drain == 2.0
  end

  test "15. resolve_form_tier resolves tier 1 multiplier and drain from JSON", %{stackable_form: form} do
    {multiplier, name, drain} = Transformations.resolve_form_tier(form, 1)
    assert multiplier == 1.5
    assert name == "Kaioken x2"
    assert drain == 4.0
  end

  test "16. resolve_form_tier resolves tier 2 multiplier and drain from JSON", %{stackable_form: form} do
    {multiplier, name, drain} = Transformations.resolve_form_tier(form, 2)
    assert multiplier == 2.0
    assert name == "Kaioken x4"
    assert drain == 10.0
  end

  test "17. resolve_form_tier falls back to base values if requested tier does not exist", %{stackable_form: form} do
    {multiplier, name, drain} = Transformations.resolve_form_tier(form, 99)
    assert multiplier == 1.2
    assert name == "Kaioken"
    assert drain == 2.0
  end

  test "18. build_transformation_payload includes full visual package", %{base_form: form} do
    payload = Transformations.build_transformation_payload(form)
    assert payload.visuals.aura_color == "#FFD700"
    assert payload.visuals.hair_color == "golden"
    assert payload.visuals.sprite_override == "ssj_warrior"
    assert payload.visuals.screen_shake == true
  end

  test "19. build_transformation_payload marks controllable correctly when form is controllable", %{base_form: form} do
    payload = Transformations.build_transformation_payload(form)
    assert payload.controllable == true
    assert payload.uncontrolled_behavior == nil
    assert payload.memory_loss == false
  end

  test "20. build_transformation_payload applies uncontrolled behavior and memory loss when uncontrollable", %{wild_form: form} do
    payload = Transformations.build_transformation_payload(form)
    assert payload.controllable == false
    assert payload.uncontrolled_behavior == "attack_random"
    assert payload.memory_loss == true
  end

  test "21. build_transformation_payload sets turns_remaining for timed forms" do
    timed_form = %{
      "name" => "Haste Burst",
      "power_multiplier" => 1.3,
      "drain_per_turn_pct" => 0,
      "duration_type" => "timed",
      "duration_turns" => 5
    }
    payload = Transformations.build_transformation_payload(timed_form)
    assert payload.duration_type == "timed"
    assert payload.turns_remaining == 5
  end

  test "22. check_loss_match triggers loss when matching event condition occurs" do
    conditions = [
      %{"type" => "tail_cut", "message" => "The tail was severed! The ape shrinks back!"},
      %{"type" => "hp_zero", "message" => "Knocked unconscious!"}
    ]
    assert {:lost, "The tail was severed! The ape shrinks back!"} =
             Transformations.check_loss_match(conditions, "tail_cut")
  end

  test "23. check_loss_match returns :ok when event does not match conditions" do
    conditions = [%{"type" => "tail_cut"}]
    assert :ok = Transformations.check_loss_match(conditions, "fire_damage")
  end

  test "24. check_near_death_eligible selects forms whose near-death HP threshold is met" do
    forms = [
      %{"id" => 1, "near_death_unlock" => 1, "near_death_hp_pct" => 0.15},
      %{"id" => 2, "near_death_unlock" => 1, "near_death_hp_pct" => 0.05},
      %{"id" => 3, "near_death_unlock" => 0, "near_death_hp_pct" => 0.50}
    ]
    # At 0.10 (10% HP), form 1 qualifies, form 2 does not, form 3 is not near_death
    eligible = Transformations.check_near_death_eligible(forms, 0.10)
    assert length(eligible) == 1
    assert hd(eligible)["id"] == 1
  end

  test "25. check_event_eligible filters forms matching event trigger name", %{wild_form: form} do
    forms = [form, %{"duration_type" => "sustained"}]
    matched = Transformations.check_event_eligible(forms, "full_moon")
    assert length(matched) == 1
    assert hd(matched)["name"] == "Great Ape"

    unmatched = Transformations.check_event_eligible(forms, "solar_eclipse")
    assert unmatched == []
  end
end
