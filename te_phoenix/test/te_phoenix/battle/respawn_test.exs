defmodule TePhoenix.Battle.RespawnTest do
  use ExUnit.Case, async: true
  alias TePhoenix.Battle.{Respawn, Combatant}

  setup do
    c1 = %Combatant{
      char_id: "c1",
      name: "Rook",
      team_id: 1,
      current_hp: 0,
      max_hp: 100,
      current_mp: 0,
      max_mp: 50,
      grid_x: 3,
      grid_y: 3,
      knocked_out: true,
      unconscious: true,
      statuses: [%{key: "poison", name: "Poison"}]
    }

    c2 = %Combatant{
      char_id: "c2",
      name: "Viper",
      team_id: 2,
      current_hp: 0,
      max_hp: 80,
      current_mp: 0,
      max_mp: 40,
      grid_x: 4,
      grid_y: 4,
      knocked_out: true
    }

    state = %{
      turn_number: 6,
      grid_w: 10,
      grid_h: 6,
      settings: %{
        respawn: %{
          "type" => "timed",
          "base_seconds" => 4,
          "scale_per_turn" => 1.0,
          "max_seconds" => 30,
          "respawn_hp_pct" => 0.8,
          "respawn_mp_pct" => 0.6,
          "clear_statuses" => true,
          "clear_cooldowns" => true,
          "invuln_seconds" => 2,
          "respawn_at" => "base"
        }
      },
      combatants: %{"c1" => c1, "c2" => c2}
    }

    res = %{log: [], actions: []}

    {:ok, state: state, c1: c1, c2: c2, res: res}
  end

  test "1. get_config returns default configuration when none set" do
    empty_state = %{settings: %{}}
    config = Respawn.get_config(empty_state)
    assert config["type"] == "permanent"
    assert config["base_seconds"] == 5
  end

  test "2. get_config merges custom settings with defaults", %{state: state} do
    config = Respawn.get_config(state)
    assert config["type"] == "timed"
    assert config["base_seconds"] == 4
    assert config["respawn_hp_pct"] == 0.8
  end

  test "3. calculate_timed_delay scales delay by turn number" do
    config = %{"base_seconds" => 5, "scale_per_turn" => 0.5, "max_seconds" => 30}
    # 5 + trunc(10 * 0.5) = 5 + 5 = 10
    assert Respawn.calculate_timed_delay(config, 10) == 10
  end

  test "4. calculate_timed_delay caps delay at max_seconds" do
    config = %{"base_seconds" => 5, "scale_per_turn" => 2.0, "max_seconds" => 20}
    # 5 + (20 * 2) = 45 -> capped at 20
    assert Respawn.calculate_timed_delay(config, 20) == 20
  end

  test "5. calculate_timed_delay uses base_seconds when turn is 0" do
    config = %{"base_seconds" => 8, "scale_per_turn" => 1.0, "max_seconds" => 40}
    assert Respawn.calculate_timed_delay(config, 0) == 8
  end

  test "6. reset_position preserves position when respawn_at is last_position", %{c1: c1, state: state} do
    config = %{"respawn_at" => "last_position"}
    reset = Respawn.reset_position(c1, config, state)
    assert reset.grid_x == c1.grid_x
    assert reset.grid_y == c1.grid_y
  end

  test "7. reset_position preserves position when respawn_at is checkpoint", %{c1: c1, state: state} do
    config = %{"respawn_at" => "checkpoint"}
    reset = Respawn.reset_position(c1, config, state)
    assert reset.grid_x == c1.grid_x
  end

  test "8. reset_position sets team 1 starting base coordinates", %{c1: c1, state: state} do
    config = %{"respawn_at" => "base"}
    reset = Respawn.reset_position(c1, config, state)
    # Team 1 starts at x: 0, y: grid_h / 2 = 6/2 = 3
    assert reset.grid_x == 0
    assert reset.grid_y == 3
  end

  test "9. reset_position sets team 2 starting base coordinates", %{c2: c2, state: state} do
    config = %{"respawn_at" => "base"}
    reset = Respawn.reset_position(c2, config, state)
    # Team 2 starts at x: grid_w - 1 = 10 - 1 = 9, y: 3
    assert reset.grid_x == 9
    assert reset.grid_y == 3
  end

  test "10. on_death with permanent respawn marks death permanent", %{state: state, c1: c1, res: res} do
    perm_state = put_in(state.settings[:respawn]["type"], "permanent")
    {s, r} = Respawn.on_death(perm_state, c1, res)
    assert s == perm_state
    assert Enum.any?(r.actions, &(&1.type == :permanent_death and &1.char_id == "c1"))
  end

  test "11. on_death with round flags combatant with respawn_at_round", %{state: state, c1: c1, res: res} do
    round_state = put_in(state.settings[:respawn]["type"], "round")
    {s, r} = Respawn.on_death(round_state, c1, res)
    updated_c1 = s.combatants["c1"]
    assert updated_c1.respawn_at_round == true
    assert Enum.any?(r.actions, &(&1.type == :respawn_round))
  end

  test "12. on_death with wave flags combatant with respawn_at_wave_clear", %{state: state, c1: c1, res: res} do
    wave_state = put_in(state.settings[:respawn]["type"], "wave")
    {s, r} = Respawn.on_death(wave_state, c1, res)
    updated_c1 = s.combatants["c1"]
    assert updated_c1.respawn_at_wave_clear == true
    assert Enum.any?(r.actions, &(&1.type == :respawn_wave))
  end

  test "13. on_death with timed schedules respawn timer action", %{state: state, c1: c1, res: res} do
    {_s, r} = Respawn.on_death(state, c1, res)
    timer_action = Enum.find(r.actions, &(&1.type == :respawn_timer))
    assert timer_action != nil
    assert timer_action.char_id == "c1"
    assert timer_action.delay_seconds == 10  # 4 + trunc(6 * 1.0) = 10
  end

  test "14. on_death with lives increments lives_used when lives remain", %{state: state, c1: c1, res: res} do
    lives_state = put_in(state.settings[:respawn]["type"], "lives")
    lives_state = put_in(lives_state.settings[:respawn]["lives"], 3)

    {s, r} = Respawn.on_death(lives_state, c1, res)
    assert s.combatants["c1"].lives_used == 1
    assert Enum.any?(r.actions, &(&1.type == :respawn_timer))
  end

  test "15. on_death with lives terminates permanently when max lives reached", %{state: state, c1: c1, res: res} do
    lives_state = put_in(state.settings[:respawn]["type"], "lives")
    lives_state = put_in(lives_state.settings[:respawn]["lives"], 3)
    exhausted_c1 = Map.put(c1, :lives_used, 2)

    {_s, r} = Respawn.on_death(lives_state, exhausted_c1, res)
    death_action = Enum.find(r.actions, &(&1.type == :permanent_death))
    assert death_action != nil
    assert death_action.lives_used == 3
  end

  test "16. on_death with checkpoint schedules checkpoint respawn", %{state: state, c1: c1, res: res} do
    cp_state = put_in(state.settings[:respawn]["type"], "checkpoint")
    {_s, r} = Respawn.on_death(cp_state, c1, res)
    assert Enum.any?(r.actions, &(&1.type == :respawn_timer))
  end

  test "17. execute_respawn restores HP according to respawn_hp_pct", %{state: state} do
    {s, _r} = Respawn.execute_respawn(state, "c1")
    revived = s.combatants["c1"]
    # max_hp 100 * 0.8 = 80
    assert revived.current_hp == 80
  end

  test "18. execute_respawn restores MP according to respawn_mp_pct", %{state: state} do
    {s, _r} = Respawn.execute_respawn(state, "c1")
    revived = s.combatants["c1"]
    # max_mp 50 * 0.6 = 30
    assert revived.current_mp == 30
  end

  test "19. execute_respawn clears knocked_out and unconscious flags", %{state: state} do
    {s, _r} = Respawn.execute_respawn(state, "c1")
    revived = s.combatants["c1"]
    assert revived.knocked_out == false
    assert revived.unconscious == false
  end

  test "20. execute_respawn clears statuses when clear_statuses is true", %{state: state} do
    {s, _r} = Respawn.execute_respawn(state, "c1")
    revived = s.combatants["c1"]
    # poisoned status was cleared, only temporary invuln added
    refute Enum.any?(revived.statuses, &(&1[:key] == "poison"))
  end

  test "21. execute_respawn clears cooldowns when clear_cooldowns is true", %{state: state, c1: c1} do
    c1_with_cds = Map.put(c1, :cooldowns, %{101 => 3})
    state = put_in(state.combatants["c1"], c1_with_cds)

    {s, _r} = Respawn.execute_respawn(state, "c1")
    revived = s.combatants["c1"]
    assert revived.cooldowns == %{}
  end

  test "22. execute_respawn applies temporary invulnerability buff when invuln_seconds > 0", %{state: state} do
    {s, r} = Respawn.execute_respawn(state, "c1")
    revived = s.combatants["c1"]
    invuln = Enum.find(revived.statuses, &(&1[:key] == "respawn_invuln"))
    assert invuln != nil
    assert invuln[:duration] == 2
    assert Enum.any?(r.log, &String.contains?(&1, "invulnerable"))
  end

  test "23. execute_respawn removes respawn_at_round and respawn_at_wave_clear flags", %{state: state, c1: c1} do
    flagged = c1 |> Map.put(:respawn_at_round, true) |> Map.put(:respawn_at_wave_clear, true)
    state = put_in(state.combatants["c1"], flagged)

    {s, _r} = Respawn.execute_respawn(state, "c1")
    revived = s.combatants["c1"]
    assert Map.get(revived, :respawn_at_round) == nil
    assert Map.get(revived, :respawn_at_wave_clear) == nil
  end

  test "24. respawn_round revives all combatants flagged for round respawn", %{state: state, c1: c1, c2: c2} do
    s1 = put_in(state.combatants["c1"], Map.put(c1, :respawn_at_round, true))
    s2 = put_in(s1.combatants["c2"], Map.put(c2, :respawn_at_round, true))

    {s_out, r_out} = Respawn.respawn_round(s2)
    assert s_out.combatants["c1"].current_hp > 0
    assert s_out.combatants["c2"].current_hp > 0
    assert length(Enum.filter(r_out.actions, &(&1.type == :respawn))) == 2
  end

  test "25. respawn_wave_clear revives all combatants flagged for wave clear", %{state: state, c1: c1} do
    s1 = put_in(state.combatants["c1"], Map.put(c1, :respawn_at_wave_clear, true))

    {s_out, r_out} = Respawn.respawn_wave_clear(s1)
    assert s_out.combatants["c1"].current_hp > 0
    assert Enum.any?(r_out.actions, &(&1.type == :respawn and &1.char_id == "c1"))
  end
end
