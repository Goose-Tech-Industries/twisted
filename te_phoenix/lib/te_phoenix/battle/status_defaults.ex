defmodule TePhoenix.Battle.StatusDefaults do
  @moduledoc """
  Seed data for the data-driven status/rule system.

  All entries are written to the DB on first boot and then fully editable
  from AdminSauce. Nothing in this file is referenced by the runtime
  pipeline — the pipeline reads from `StatusRegistry` (ETS).

  The effects map uses a flat schema understood by
  `StatusEffects.compute_modifiers/1`:

    * `atk_mult`, `def_mult`, `mo_mult`, `md_mult`, `speed_mult` (floats)
    * `dodge_floor`, `dodge_ceiling` (floats, 0..1)
    * `advantage`, `disadvantage` (bool)
    * `prevent_action`, `prevent_magic`, `prevent_move` (bool)
    * `crit_mult_bonus`, `damage_taken_mult`, `damage_dealt_mult` (floats)
    * `drop_weapon` (bool)
    * Any custom key — power-coders can read them from status graphs.

  The tick map:

    * `{"kind" => "dot_pct_max", "amount" => 0.03}` — bleed/poison-style
    * `{"kind" => "dot_flat", "amount" => 12}`
    * `{"kind" => "hot_pct_max", "amount" => 0.05}` — regen
    * `{"kind" => "mp_regen_flat", "amount" => 5}`
    * `{"kind" => "custom", "script_id" => 42}` — drop into visual script

  A trigger rule effect:

    * `%{"apply_status" => "bleed_light", "to" => "self"|"target"|"attacker"|"victim"}`
    * `%{"remove_status" => "shield"}`
    * `%{"script_id" => 17}` — runs a visual scripting graph
    * `%{"queue_event" => "interrogation_prompt"}`
  """

  def statuses do
    [
      # ── Bleeds ────────────────────────────────────────────────
      %{
        key: "bleed_light",
        name: "Light Bleed",
        description: "Slow blood loss — 3% max HP per turn for 2 turns.",
        icon: "🩸",
        category: "dot",
        default_duration: 2,
        stacking: "refresh",
        max_stacks: 1,
        tick: %{"kind" => "dot_pct_max", "amount" => 0.03, "damage_type" => "physical"},
        cure_tags: ["bleed"]
      },
      %{
        key: "bleed_moderate",
        name: "Moderate Bleed",
        description: "Serious hemorrhage — 3% max HP for 4 turns.",
        icon: "🩸",
        category: "dot",
        default_duration: 4,
        stacking: "refresh",
        max_stacks: 1,
        tick: %{"kind" => "dot_pct_max", "amount" => 0.03, "damage_type" => "physical"},
        effects: %{"speed_mult" => 0.9},
        cure_tags: ["bleed"]
      },
      %{
        key: "bleed_heavy",
        name: "Heavy Bleed",
        description: "Catastrophic blood loss — 5% max HP for 5 turns, slows.",
        icon: "💉",
        category: "dot",
        default_duration: 5,
        stacking: "refresh",
        tick: %{"kind" => "dot_pct_max", "amount" => 0.05, "damage_type" => "physical"},
        effects: %{"speed_mult" => 0.8, "atk_mult" => 0.9},
        cure_tags: ["bleed"]
      },

      # ── Poison / Burn / Freeze ───────────────────────────────
      %{
        key: "poison",
        name: "Poisoned",
        description: "Toxins course through — 4% max HP per turn, 5 turns.",
        icon: "☠️",
        category: "dot",
        default_duration: 5,
        stacking: "refresh",
        tick: %{"kind" => "dot_pct_max", "amount" => 0.04, "damage_type" => "poison"},
        effects: %{"atk_mult" => 0.9},
        cure_tags: ["poison"]
      },
      %{
        key: "burn",
        name: "Burning",
        description: "Flames devour armor — 3% max HP per turn, -15% DEF.",
        icon: "🔥",
        category: "dot",
        default_duration: 4,
        stacking: "refresh",
        tick: %{"kind" => "dot_pct_max", "amount" => 0.03, "damage_type" => "fire"},
        effects: %{"def_mult" => 0.85},
        cure_tags: ["burn", "fire"]
      },
      %{
        key: "freeze",
        name: "Frozen",
        description: "Encased in ice — cannot act. Fire breaks the ice.",
        icon: "❄️",
        category: "control",
        default_duration: 2,
        stacking: "refresh",
        effects: %{"prevent_action" => true, "prevent_move" => true, "damage_taken_mult" => 1.5},
        cure_tags: ["freeze", "ice"]
      },

      # ── Control ──────────────────────────────────────────────
      %{
        key: "stun",
        name: "Stunned",
        description: "Dazed — skip next action, dodge halved.",
        icon: "💫",
        category: "control",
        default_duration: 1,
        stacking: "refresh",
        effects: %{"prevent_action" => true, "dodge_ceiling" => 0.45},
        cure_tags: ["stun"]
      },
      %{
        key: "sleep",
        name: "Asleep",
        description: "Unconscious in battle. Damage wakes the target.",
        icon: "💤",
        category: "control",
        default_duration: 3,
        stacking: "refresh",
        effects: %{"prevent_action" => true, "prevent_move" => true, "damage_taken_mult" => 1.3, "wake_on_damage" => true},
        cure_tags: ["sleep"]
      },
      %{
        key: "silence",
        name: "Silenced",
        description: "Cannot cast magic.",
        icon: "🤐",
        category: "control",
        default_duration: 3,
        stacking: "refresh",
        effects: %{"prevent_magic" => true},
        cure_tags: ["silence"]
      },
      %{
        key: "blind",
        name: "Blinded",
        description: "-60% accuracy.",
        icon: "🌑",
        category: "debuff",
        default_duration: 3,
        stacking: "refresh",
        effects: %{"miss_chance_bonus" => 0.60},
        cure_tags: ["blind"]
      },
      %{
        key: "confuse",
        name: "Confused",
        description: "May attack allies or self.",
        icon: "❓",
        category: "control",
        default_duration: 3,
        stacking: "refresh",
        effects: %{"confused" => true},
        cure_tags: ["confuse", "mind"]
      },
      %{
        key: "berserk",
        name: "Berserk",
        description: "+50% ATK, -25% DEF, auto-attacks only.",
        icon: "😤",
        category: "control",
        default_duration: 4,
        stacking: "refresh",
        effects: %{"atk_mult" => 1.5, "def_mult" => 0.75, "berserk" => true},
        cure_tags: ["mind", "berserk"]
      },

      # ── Buffs ────────────────────────────────────────────────
      %{
        key: "regen",
        name: "Regenerating",
        description: "Restores 5% max HP per turn.",
        icon: "💚",
        category: "hot",
        default_duration: 4,
        stacking: "refresh",
        tick: %{"kind" => "hot_pct_max", "amount" => 0.05}
      },
      %{
        key: "haste",
        name: "Hasted",
        description: "+50% speed, cooldowns tick 50% faster.",
        icon: "⚡",
        category: "buff",
        default_duration: 4,
        stacking: "refresh",
        effects: %{"speed_mult" => 1.5, "cooldown_rate" => 1.5}
      },
      %{
        key: "slow",
        name: "Slowed",
        description: "-40% speed, cooldowns tick 40% slower.",
        icon: "🐌",
        category: "debuff",
        default_duration: 4,
        stacking: "refresh",
        effects: %{"speed_mult" => 0.6, "cooldown_rate" => 0.6}
      },
      %{
        key: "shield",
        name: "Shielded",
        description: "Halves incoming damage.",
        icon: "🛡",
        category: "buff",
        default_duration: 3,
        stacking: "refresh",
        effects: %{"damage_taken_mult" => 0.5}
      },

      # ── Cripple variants (limb-broken consequences) ──────────
      %{
        key: "cripple_arm_left",
        name: "Left Arm Crippled",
        description: "Left arm disabled — -25% ATK, cannot dual-wield.",
        icon: "💔",
        category: "injury",
        default_duration: 99,
        permanent: true,
        stacking: "ignore",
        effects: %{"atk_mult" => 0.75, "no_dual_wield" => true},
        cure_tags: ["injury", "limb"]
      },
      %{
        key: "cripple_arm_right",
        name: "Right Arm Crippled",
        description: "Right arm disabled — -40% ATK, drops weapon.",
        icon: "💔",
        category: "injury",
        default_duration: 99,
        permanent: true,
        stacking: "ignore",
        effects: %{"atk_mult" => 0.60, "drop_weapon" => true},
        cure_tags: ["injury", "limb"]
      },
      %{
        key: "cripple_leg_left",
        name: "Left Leg Crippled",
        description: "-40% speed, dodge cap halved.",
        icon: "🦵",
        category: "injury",
        default_duration: 99,
        permanent: true,
        stacking: "ignore",
        effects: %{"speed_mult" => 0.6, "dodge_ceiling" => 0.45},
        cure_tags: ["injury", "limb"]
      },
      %{
        key: "cripple_leg_right",
        name: "Right Leg Crippled",
        description: "-40% speed, dodge cap halved.",
        icon: "🦵",
        category: "injury",
        default_duration: 99,
        permanent: true,
        stacking: "ignore",
        effects: %{"speed_mult" => 0.6, "dodge_ceiling" => 0.45},
        cure_tags: ["injury", "limb"]
      },
      %{
        key: "cripple_torso",
        name: "Torso Wounded",
        description: "Bleeding from the core — heavy bleed + -20% DEF.",
        icon: "🫀",
        category: "injury",
        default_duration: 99,
        permanent: true,
        stacking: "ignore",
        effects: %{"def_mult" => 0.8},
        tick: %{"kind" => "dot_pct_max", "amount" => 0.04, "damage_type" => "physical"},
        cure_tags: ["injury", "bleed"]
      }
    ]
  end

  def rules do
    [
      # Limb → cripple mapping. Edit freely: swap which status each limb applies,
      # add bleed stacking, fire a custom visual-script graph, etc.
      %{
        key: "limb_break_head",
        name: "Head Break → Knockout",
        trigger: "limb_broken",
        condition: %{"limb" => "head"},
        effect: %{"knockout" => true, "queue_event" => "interrogation_prompt", "to" => "victim"},
        priority: 100
      },
      %{
        key: "limb_break_torso",
        name: "Torso Break → Wound",
        trigger: "limb_broken",
        condition: %{"limb" => "torso"},
        effect: %{"apply_status" => "cripple_torso", "to" => "victim"},
        priority: 100
      },
      %{
        key: "limb_break_left_arm",
        name: "Left Arm Break → Cripple",
        trigger: "limb_broken",
        condition: %{"limb" => "left_arm"},
        effect: %{"apply_status" => "cripple_arm_left", "to" => "victim"},
        priority: 100
      },
      %{
        key: "limb_break_right_arm",
        name: "Right Arm Break → Cripple",
        trigger: "limb_broken",
        condition: %{"limb" => "right_arm"},
        effect: %{"apply_status" => "cripple_arm_right", "to" => "victim"},
        priority: 100
      },
      %{
        key: "limb_break_left_leg",
        name: "Left Leg Break → Cripple",
        trigger: "limb_broken",
        condition: %{"limb" => "left_leg"},
        effect: %{"apply_status" => "cripple_leg_left", "to" => "victim"},
        priority: 100
      },
      %{
        key: "limb_break_right_leg",
        name: "Right Leg Break → Cripple",
        trigger: "limb_broken",
        condition: %{"limb" => "right_leg"},
        effect: %{"apply_status" => "cripple_leg_right", "to" => "victim"},
        priority: 100
      },

      # KO → interrogation queue
      %{
        key: "ko_interrogation",
        name: "Knockout → Interrogation Prompt",
        trigger: "ko",
        condition: %{"nonlethal" => true},
        effect: %{"queue_event" => "interrogation_prompt", "to" => "victim"},
        priority: 100
      },

      # Damage taken while asleep wakes the sleeper
      %{
        key: "sleep_wake_on_damage",
        name: "Sleep — Wake on Damage",
        trigger: "damage_taken",
        condition: %{"has_status" => "sleep"},
        effect: %{"remove_status" => "sleep", "to" => "victim"},
        priority: 100
      },

      # Burn removed by freeze, freeze removed by fire (element interplay)
      %{
        key: "fire_melts_freeze",
        name: "Fire element melts Freeze",
        trigger: "damage_taken",
        condition: %{"element" => "fire", "has_status" => "freeze"},
        effect: %{"remove_status" => "freeze", "to" => "victim"},
        priority: 120
      }
    ]
  end
end
