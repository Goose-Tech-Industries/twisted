defmodule TePhoenix.Waves.Defaults do
  @moduledoc """
  Seed wave sequence templates. Written to DB on first boot.
  """

  def defs do
    [
      %{
        key: "td_basic",
        name: "Basic Tower Defense",
        description: "5 waves of increasing difficulty. Wave 5 is a boss.",
        map_id: nil,
        rounds: [
          %{"wave" => 1, "delay_seconds" => 5, "spawns" => [
            %{"npc_template" => "goblin", "count" => 3, "zone_key" => "spawn_entrance", "interval_ms" => 1500}
          ]},
          %{"wave" => 2, "delay_seconds" => 25, "spawns" => [
            %{"npc_template" => "goblin", "count" => 5, "zone_key" => "spawn_entrance", "interval_ms" => 1200}
          ]},
          %{"wave" => 3, "delay_seconds" => 25, "spawns" => [
            %{"npc_template" => "goblin", "count" => 4, "zone_key" => "spawn_entrance", "interval_ms" => 1000},
            %{"npc_template" => "orc", "count" => 2, "zone_key" => "spawn_entrance", "interval_ms" => 2000}
          ]},
          %{"wave" => 4, "delay_seconds" => 30, "spawns" => [
            %{"npc_template" => "orc", "count" => 5, "zone_key" => "spawn_entrance", "interval_ms" => 1500},
            %{"npc_template" => "goblin_archer", "count" => 3, "zone_key" => "spawn_flank", "interval_ms" => 2000}
          ]},
          %{"wave" => 5, "delay_seconds" => 35, "spawns" => [
            %{"npc_template" => "boss_troll", "count" => 1, "zone_key" => "spawn_entrance", "interval_ms" => 0, "boss" => true},
            %{"npc_template" => "orc", "count" => 3, "zone_key" => "spawn_flank", "interval_ms" => 1000}
          ]}
        ],
        scaling: %{"hp_mult_per_wave" => 0.1, "atk_mult_per_wave" => 0.05, "xp_mult_per_wave" => 0.15},
        on_wave_start: %{"broadcast" => "wave_start"},
        on_wave_clear: %{"broadcast" => "wave_clear"},
        on_sequence_complete: %{"broadcast" => "sequence_complete", "set_world_flag" => "td_cleared"},
        settings: %{"auto_start" => true, "clear_condition" => "all_dead"},
        loop: false
      },
      %{
        key: "moba_lane",
        name: "MOBA Lane Minions",
        description: "Infinite looping lane minion waves. 3 melee + 1 ranged every 30s.",
        map_id: nil,
        rounds: [
          %{"wave" => 1, "delay_seconds" => 0, "spawns" => [
            %{"npc_template" => "lane_melee", "count" => 3, "zone_key" => "base_spawn", "interval_ms" => 500},
            %{"npc_template" => "lane_ranged", "count" => 1, "zone_key" => "base_spawn", "interval_ms" => 500}
          ]}
        ],
        scaling: %{"hp_mult_per_wave" => 0.02, "atk_mult_per_wave" => 0.01},
        on_wave_start: %{},
        on_wave_clear: %{},
        on_sequence_complete: %{},
        settings: %{"wave_interval_seconds" => 30, "auto_start" => true, "clear_condition" => "timer"},
        loop: true
      },
      %{
        key: "horde_survival",
        name: "Horde Survival",
        description: "Endless escalating waves. Survive as long as possible.",
        map_id: nil,
        rounds: [
          %{"wave" => 1, "delay_seconds" => 10, "spawns" => [
            %{"npc_template" => "zombie", "count" => 5, "zone_key" => "perimeter", "interval_ms" => 800}
          ]},
          %{"wave" => 2, "delay_seconds" => 20, "spawns" => [
            %{"npc_template" => "zombie", "count" => 8, "zone_key" => "perimeter", "interval_ms" => 600},
            %{"npc_template" => "fast_zombie", "count" => 2, "zone_key" => "perimeter", "interval_ms" => 400}
          ]},
          %{"wave" => 3, "delay_seconds" => 25, "spawns" => [
            %{"npc_template" => "zombie", "count" => 10, "zone_key" => "perimeter", "interval_ms" => 500},
            %{"npc_template" => "fast_zombie", "count" => 4, "zone_key" => "perimeter", "interval_ms" => 300},
            %{"npc_template" => "brute", "count" => 1, "zone_key" => "perimeter", "interval_ms" => 0, "boss" => true}
          ]}
        ],
        scaling: %{"hp_mult_per_wave" => 0.15, "atk_mult_per_wave" => 0.10, "count_add_per_loop" => 2},
        on_wave_clear: %{"broadcast" => "wave_survived"},
        on_sequence_complete: %{},
        settings: %{"auto_start" => false, "clear_condition" => "all_dead"},
        loop: true
      }
    ]
  end
end
