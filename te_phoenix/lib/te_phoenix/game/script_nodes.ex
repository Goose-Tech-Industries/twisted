defmodule TePhoenix.Game.ScriptNodes do
  @moduledoc """
  Catalog of all 25 node types for the visual scripting editor.

  Each node type declares:

    * `id` — string, unique
    * `group` — `"flow" | "rewards" | "world" | "npc" | "game"`
    * `label` — display name in the editor
    * `color` — hex string for the node header
    * `inputs` — list of input ports `[%{key, kind}]` (kind: `"flow" | "value"`)
    * `outputs` — list of output ports `[%{key, kind}]`
    * `props` — list of `%{key, kind, default, label}` for the property panel
      (kind: `"text" | "int" | "float" | "bool" | "select", options: [...]`)

  This is the canonical source of truth for the editor UI, the persisted
  graph format, and the runtime interpreter. Any change to a node's port
  signature must include a migration path for existing graphs.

  ## Why this lives in `te_phoenix.game`

  Because the runtime interpreter needs to invoke real engine systems
  (give_item touches the inventory, teleport touches the world, npc_talk
  hooks the dialogue manager). The catalog is data; the interpreter
  (`TePhoenix.Game.ScriptInterpreter`) is the side-effecting half.
  """

  @typedoc "A port spec: `%{key, kind}`."
  @type port_spec :: %{key: String.t(), kind: String.t()}

  @typedoc "A property spec for the per-node form."
  @type prop_spec :: %{
          key: String.t(),
          kind: String.t(),
          default: term(),
          label: String.t(),
          options: [String.t()] | nil
        }

  @typedoc "A node type definition."
  @type node_type :: %{
          id: String.t(),
          group: String.t(),
          label: String.t(),
          color: String.t(),
          inputs: [port_spec()],
          outputs: [port_spec()],
          props: [prop_spec()]
        }

  # Single flow-in / flow-out is the most common shape — factor a helper.
  defp flow_in, do: [%{key: "in", kind: "flow"}]
  defp flow_out, do: [%{key: "out", kind: "flow"}]
  defp prop(key, kind, default, label, options \\ nil),
    do: %{key: key, kind: kind, default: default, label: label, options: options}

  @doc "All built-in node types in catalog order."
  @spec all() :: [node_type()]
  def all, do: flow() ++ rewards() ++ world() ++ npc_nodes() ++ game() ++ battle()

  @spec get(String.t()) :: node_type() | nil
  def get(id) when is_binary(id), do: Enum.find(all(), &(&1.id == id))

  # ── FLOW (3 nodes) ───────────────────────────────────────────

  defp flow do
    [
      %{
        id: "start",
        group: "flow",
        label: "Start",
        color: "#10b981",
        inputs: [],
        outputs: flow_out(),
        props: [prop("trigger", "select", "always", "Trigger", ["always", "step_on", "interact", "world_flag"])]
      },
      %{
        id: "choice",
        group: "flow",
        label: "Choice",
        color: "#f59e0b",
        inputs: flow_in(),
        outputs: [
          %{key: "a", kind: "flow"},
          %{key: "b", kind: "flow"},
          %{key: "c", kind: "flow"}
        ],
        props: [
          prop("prompt", "text", "Make a choice…", "Prompt"),
          prop("label_a", "text", "Yes", "Choice A label"),
          prop("label_b", "text", "No", "Choice B label"),
          prop("label_c", "text", "", "Choice C label (blank = hidden)")
        ]
      },
      %{
        id: "conditional",
        group: "flow",
        label: "If / Else",
        color: "#f59e0b",
        inputs: flow_in(),
        outputs: [
          %{key: "true", kind: "flow"},
          %{key: "false", kind: "flow"}
        ],
        props: [
          prop("kind", "select", "flag", "Condition kind", ["flag", "world_flag", "item_count_gte", "level_gte", "gold_gte"]),
          prop("key", "text", "", "Key (flag name / item id)"),
          prop("value", "int", 0, "Threshold")
        ]
      }
    ]
  end

  # ── REWARDS (6 nodes) ────────────────────────────────────────

  defp rewards do
    [
      %{
        id: "give_item",
        group: "rewards",
        label: "Give Item",
        color: "#3b82f6",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("item_id", "int", 1, "Item id"),
          prop("amount", "int", 1, "Amount")
        ]
      },
      %{
        id: "take_item",
        group: "rewards",
        label: "Take Item",
        color: "#3b82f6",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("item_id", "int", 1, "Item id"),
          prop("amount", "int", 1, "Amount")
        ]
      },
      %{
        id: "give_gold",
        group: "rewards",
        label: "Give Gold",
        color: "#3b82f6",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [prop("amount", "int", 100, "Gold")]
      },
      %{
        id: "give_xp",
        group: "rewards",
        label: "Give XP",
        color: "#3b82f6",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [prop("amount", "int", 50, "XP")]
      },
      %{
        id: "heal",
        group: "rewards",
        label: "Heal",
        color: "#10b981",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("kind", "select", "hp", "Resource", ["hp", "mp", "both"]),
          prop("amount", "int", 50, "Amount (-1 = full)")
        ]
      },
      %{
        id: "damage",
        group: "rewards",
        label: "Damage",
        color: "#ef4444",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("amount", "int", 10, "Damage"),
          prop("element", "select", "physical", "Element", ["physical", "fire", "ice", "lightning", "holy", "shadow"])
        ]
      }
    ]
  end

  # ── WORLD (7 nodes) ──────────────────────────────────────────

  defp world do
    [
      %{
        id: "teleport",
        group: "world",
        label: "Teleport",
        color: "#8b5cf6",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("map_id", "int", 1, "Map id"),
          prop("x", "int", 5, "Target x"),
          prop("y", "int", 5, "Target y")
        ]
      },
      %{
        id: "set_flag",
        group: "world",
        label: "Set Flag",
        color: "#8b5cf6",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("flag", "text", "", "Local flag name"),
          prop("value", "bool", true, "Value")
        ]
      },
      %{
        id: "set_world_flag",
        group: "world",
        label: "Set World Flag",
        color: "#8b5cf6",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("flag", "text", "", "World flag name"),
          prop("value", "bool", true, "Value")
        ]
      },
      %{
        id: "inc_flag",
        group: "world",
        label: "Increment Flag",
        color: "#8b5cf6",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("flag", "text", "", "Flag name"),
          prop("amount", "int", 1, "Amount")
        ]
      },
      %{
        id: "screen_effect",
        group: "world",
        label: "Screen Effect",
        color: "#ec4899",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("kind", "select", "shake", "Effect", ["shake", "flash", "fade_in", "fade_out", "tint"]),
          prop("intensity", "float", 1.0, "Intensity"),
          prop("duration_ms", "int", 500, "Duration ms")
        ]
      },
      %{
        id: "wait",
        group: "world",
        label: "Wait",
        color: "#64748b",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [prop("ms", "int", 1000, "Milliseconds")]
      },
      %{
        id: "sound",
        group: "world",
        label: "Play Sound",
        color: "#64748b",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("url", "text", "", "Sound URL"),
          prop("volume", "float", 0.6, "Volume 0-1")
        ]
      }
    ]
  end

  # ── NPC (4 nodes) ────────────────────────────────────────────

  defp npc_nodes do
    [
      %{
        id: "npc_talk",
        group: "npc",
        label: "NPC Talk",
        color: "#14b8a6",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("npc_id", "int", 1, "NPC id"),
          prop("text", "text", "...", "Dialogue line")
        ]
      },
      %{
        id: "set_npc_mood",
        group: "npc",
        label: "NPC Mood",
        color: "#14b8a6",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("npc_id", "int", 1, "NPC id"),
          prop("mood", "select", "neutral", "Mood", ["happy", "neutral", "sad", "angry", "afraid"])
        ]
      },
      %{
        id: "kill_npc",
        group: "npc",
        label: "Kill NPC",
        color: "#ef4444",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [prop("npc_id", "int", 1, "NPC id")]
      },
      %{
        id: "faction_rep",
        group: "npc",
        label: "Faction Rep",
        color: "#14b8a6",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("faction", "text", "", "Faction"),
          prop("delta", "int", 5, "Delta")
        ]
      }
    ]
  end

  # ── GAME (5 nodes) ───────────────────────────────────────────

  defp game do
    [
      %{
        id: "battle",
        group: "game",
        label: "Start Battle",
        color: "#ef4444",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("encounter_id", "int", 1, "Encounter id"),
          prop("escapable", "bool", true, "Escapable?")
        ]
      },
      %{
        id: "shop",
        group: "game",
        label: "Open Shop",
        color: "#3b82f6",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [prop("shop_id", "int", 1, "Shop id")]
      },
      %{
        id: "quest_start",
        group: "game",
        label: "Start Quest",
        color: "#a3e635",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [prop("quest_id", "int", 1, "Quest id")]
      },
      %{
        id: "quest_advance",
        group: "game",
        label: "Advance Quest",
        color: "#a3e635",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("quest_id", "int", 1, "Quest id"),
          prop("step", "int", 1, "Step")
        ]
      },
      %{
        id: "quest_complete",
        group: "game",
        label: "Complete Quest",
        color: "#a3e635",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [prop("quest_id", "int", 1, "Quest id")]
      }
    ]
  end

  # ── BATTLE (6 nodes) ─────────────────────────────────────────
  # These only do something when the interpreter is called with a
  # battle-aware context (combatant/ctx present on the ctx map).
  # In the regular event runner they fall through as no-ops.

  defp battle do
    [
      %{
        id: "apply_status",
        group: "battle",
        label: "Apply Status",
        color: "#ef4444",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("status_key", "text", "bleed_light", "Status key"),
          prop("target", "select", "victim", "Target", ["self", "victim", "attacker", "target"]),
          prop("duration", "int", 0, "Duration override (0 = default)")
        ]
      },
      %{
        id: "remove_status",
        group: "battle",
        label: "Remove Status",
        color: "#ef4444",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("status_key", "text", "freeze", "Status key"),
          prop("target", "select", "victim", "Target", ["self", "victim", "attacker", "target"])
        ]
      },
      %{
        id: "has_status",
        group: "battle",
        label: "Has Status?",
        color: "#f97316",
        inputs: flow_in(),
        outputs: [
          %{key: "true", kind: "flow"},
          %{key: "false", kind: "flow"}
        ],
        props: [
          prop("status_key", "text", "poison", "Status key"),
          prop("target", "select", "victim", "Target", ["self", "victim", "attacker", "target"])
        ]
      },
      %{
        id: "damage_target",
        group: "battle",
        label: "Damage Target",
        color: "#ef4444",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("amount", "int", 10, "Flat damage (ignored if pct > 0)"),
          prop("pct", "float", 0.0, "Percent of max HP (0..1)"),
          prop("target", "select", "victim", "Target", ["self", "victim", "attacker", "target"])
        ]
      },
      %{
        id: "heal_target",
        group: "battle",
        label: "Heal Target",
        color: "#22c55e",
        inputs: flow_in(),
        outputs: flow_out(),
        props: [
          prop("amount", "int", 20, "Flat heal (ignored if pct > 0)"),
          prop("pct", "float", 0.0, "Percent of max HP (0..1)"),
          prop("target", "select", "self", "Target", ["self", "victim", "attacker", "target"])
        ]
      },
      %{
        id: "read_stat",
        group: "battle",
        label: "Stat Threshold",
        color: "#f97316",
        inputs: flow_in(),
        outputs: [
          %{key: "true", kind: "flow"},
          %{key: "false", kind: "flow"}
        ],
        props: [
          prop("stat", "select", "hp_pct", "Stat", ["hp_pct", "mp_pct", "atk", "def", "speed", "level"]),
          prop("op", "select", "lt", "Operator", ["lt", "lte", "gt", "gte", "eq"]),
          prop("value", "float", 0.25, "Compare value"),
          prop("target", "select", "self", "Target", ["self", "victim", "attacker", "target"])
        ]
      }
    ]
  end
end
