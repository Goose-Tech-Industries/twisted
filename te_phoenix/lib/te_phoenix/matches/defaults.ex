defmodule TePhoenix.Matches.Defaults do
  def modes do
    [
      %{
        key: "1v1_duel",
        name: "Ranked Duel",
        description: "1v1 PvP combat. Best of 1.",
        team_size: 1, team_count: 2,
        queue_type: "ranked",
        lobby_timeout_seconds: 60,
        ready_check_seconds: 10,
        match_time_limit_seconds: 300,
        win_conditions: %{"type" => "last_standing"},
        rewards: %{"xp_win" => 200, "xp_loss" => 50, "gold_win" => 100, "gold_loss" => 25, "rank_win" => 20, "rank_loss" => -10}
      },
      %{
        key: "3v3_arena",
        name: "3v3 Arena",
        description: "Team deathmatch. First team to eliminate all enemies wins.",
        team_size: 3, team_count: 2,
        queue_type: "casual",
        lobby_timeout_seconds: 90,
        ready_check_seconds: 15,
        match_time_limit_seconds: 600,
        win_conditions: %{"type" => "last_standing"},
        rewards: %{"xp_win" => 350, "xp_loss" => 100, "gold_win" => 150, "gold_loss" => 40}
      },
      %{
        key: "5v5_moba",
        name: "5v5 MOBA",
        description: "Destroy the enemy nexus. Lanes, towers, jungle.",
        team_size: 5, team_count: 2,
        queue_type: "ranked",
        lobby_timeout_seconds: 120,
        ready_check_seconds: 15,
        match_time_limit_seconds: 2400,
        win_conditions: %{"type" => "objective", "objective_key" => "nexus"},
        rewards: %{"xp_win" => 600, "xp_loss" => 200, "gold_win" => 250, "gold_loss" => 75, "rank_win" => 25, "rank_loss" => -15},
        settings: %{"ban_phase" => true, "pick_phase" => true, "ban_count" => 2}
      },
      %{
        key: "4v1_horror",
        name: "4v1 Horror",
        description: "4 survivors vs 1 killer. Repair generators, escape.",
        team_size: 4, team_count: 2,
        queue_type: "casual",
        lobby_timeout_seconds: 90,
        ready_check_seconds: 15,
        match_time_limit_seconds: 900,
        win_conditions: %{"type" => "objective", "objective_key" => "dbd_generator", "required_count" => 5},
        rewards: %{"xp_win" => 400, "xp_loss" => 150, "gold_win" => 175, "gold_loss" => 50},
        settings: %{"asymmetric" => true, "killer_team_size" => 1, "survivor_team_size" => 4}
      },
      %{
        key: "ffa_battle_royale",
        name: "Battle Royale (FFA)",
        description: "Last player standing wins. Shrinking zone.",
        team_size: 1, team_count: 20,
        queue_type: "casual",
        lobby_timeout_seconds: 180,
        ready_check_seconds: 10,
        match_time_limit_seconds: 900,
        win_conditions: %{"type" => "last_standing"},
        rewards: %{"xp_win" => 500, "xp_loss" => 75, "gold_win" => 300, "gold_loss" => 25},
        settings: %{"shrink_zone" => true, "shrink_interval_seconds" => 60, "shrink_damage" => 5}
      },
      %{
        key: "td_coop",
        name: "Co-op Tower Defense",
        description: "Survive all waves together. One team, shared towers.",
        team_size: 4, team_count: 1,
        queue_type: "casual",
        lobby_timeout_seconds: 60,
        ready_check_seconds: 10,
        match_time_limit_seconds: 0,
        win_conditions: %{"type" => "wave_clear", "wave_def_key" => "td_basic"},
        rewards: %{"xp_win" => 400, "gold_win" => 200}
      }
    ]
  end
end
