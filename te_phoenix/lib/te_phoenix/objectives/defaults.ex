defmodule TePhoenix.Objectives.Defaults do
  @moduledoc """
  Seed templates for common objective types. Written to DB on first
  boot, then fully editable from AdminSauce. Users can create any
  custom objective type — these are just starting points.
  """

  def defs do
    [
      %{
        key: "lever",
        name: "Lever",
        icon: "🔧",
        type: "toggle",
        progress_model: "boolean",
        target_value: 1,
        description: "A lever that can be flipped on/off. Triggers on_complete each toggle.",
        on_complete: %{"set_world_flag" => "lever_active", "value" => "toggle"},
        settings: %{"toggle_cooldown_seconds" => 2}
      },
      %{
        key: "pressure_plate",
        name: "Pressure Plate",
        icon: "⬛",
        type: "interact",
        progress_model: "boolean",
        target_value: 1,
        description: "Activates when stepped on. Deactivates when left.",
        settings: %{"auto_deactivate_on_leave" => true}
      },
      %{
        key: "dbd_generator",
        name: "Generator",
        icon: "⚡",
        type: "hold",
        progress_model: "timer",
        target_value: 30,
        description: "Hold to repair — 30 seconds of continuous interaction. DBD-style.",
        on_progress: %{"broadcast" => "generator_progress"},
        on_complete: %{"set_world_flag" => "generator_online", "broadcast" => "generator_complete"},
        settings: %{
          "max_interactors" => 2,
          "skill_check_interval" => 8,
          "skill_check_window" => 1.5,
          "regress_on_cancel" => true,
          "regress_rate" => 0.5
        }
      },
      %{
        key: "moba_tower",
        name: "Tower",
        icon: "🏰",
        type: "destroy",
        progress_model: "hp",
        target_value: 500,
        team_owned: true,
        description: "Team-owned structure. Attacks nearby enemies. Falls when HP reaches 0.",
        on_complete: %{"broadcast" => "tower_destroyed", "set_world_flag" => "tower_down"},
        settings: %{
          "attack_range" => 3,
          "attack_damage" => 25,
          "attack_speed_ms" => 2000,
          "target_priority" => "closest_enemy",
          "invulnerable_until_flag" => ""
        }
      },
      %{
        key: "rts_building",
        name: "Building",
        icon: "🏗️",
        type: "construct",
        progress_model: "timer",
        target_value: 20,
        team_owned: true,
        description: "Build by holding interact. Once built, becomes functional. Destroyable.",
        on_complete: %{"broadcast" => "building_complete"},
        settings: %{
          "build_cost_gold" => 100,
          "constructed_type" => "destroy",
          "constructed_hp" => 300,
          "constructed_icon" => "🏠"
        }
      },
      %{
        key: "collect_quest",
        name: "Collection Objective",
        icon: "📦",
        type: "collect",
        progress_model: "counter",
        target_value: 5,
        description: "Collect N items or kill N enemies. Counter incremented by game events.",
        on_progress: %{"broadcast" => "collect_progress"},
        on_complete: %{"broadcast" => "collect_complete"}
      },
      %{
        key: "survive_wave",
        name: "Survive",
        icon: "⏱️",
        type: "survive",
        progress_model: "timer",
        target_value: 60,
        description: "Survive for N seconds. Auto-ticks while active. Fails if all players KO.",
        on_complete: %{"broadcast" => "survive_complete"},
        on_fail: %{"broadcast" => "survive_failed"}
      },
      %{
        key: "escort_npc",
        name: "Escort",
        icon: "🚶",
        type: "escort",
        progress_model: "counter",
        target_value: 1,
        description: "Escort NPC to destination. Fails if NPC dies. Counter = waypoints reached.",
        on_fail: %{"broadcast" => "escort_failed"},
        on_complete: %{"broadcast" => "escort_complete"},
        settings: %{"npc_id" => nil, "destination_x" => 0, "destination_y" => 0}
      },
      %{
        key: "capture_point",
        name: "Capture Point",
        icon: "🚩",
        type: "hold",
        progress_model: "timer",
        target_value: 15,
        team_owned: true,
        description: "Stand in zone to capture. Contested if enemies present — progress pauses.",
        on_complete: %{"broadcast" => "point_captured"},
        settings: %{
          "capture_radius" => 2,
          "contest_pauses" => true,
          "uncaptured_regress_rate" => 1.0
        }
      },
      %{
        key: "td_waypoint",
        name: "Waypoint",
        icon: "📍",
        type: "reach",
        progress_model: "boolean",
        target_value: 1,
        description: "Tower defense path node. Enemies path toward this, players defend.",
        settings: %{"next_waypoint_key" => "", "enemy_speed_mult" => 1.0}
      }
    ]
  end
end
