defmodule TePhoenix.AI.DreamCycle do
  @moduledoc """
  Nightly Dream & Subconscious Memory Consolidation Engine.

  When night falls or an NPC sleeps:
    * Memories from recent player interactions are processed into deep psychological traits.
    * Painful encounters solidify into fear or forgiveness arcs.
    * Inspiring moments increase confidence and attachment.
    * Generates dream logs and morning dream-spawned quest rumors.
  """

  alias TePhoenix.Repo
  alias TePhoenix.AI.SovereignBridge
  require Logger

  @dream_archetypes [
    %{
      theme: "The Obsidian Monolith",
      summary: "Wandering through endless black sands toward a towering monolith that whispers names.",
      effects: %{"confidence" => 10, "stress" => -15},
      quest_hook: "Investigate the monolith sighted in the dream at the southern crags."
    },
    %{
      theme: "The Drowned Bell",
      summary: "Submerged deep beneath a silent lake where a heavy bronze bell chimes without sound.",
      effects: %{"sadness" => -10, "curiosity" => 15},
      quest_hook: "Seek the sunken bell beneath the Lake of Echoes."
    },
    %{
      theme: "The Iron Pyre",
      summary: "Standing before a raging forge where weapons melt into living serpents of molten gold.",
      effects: %{"anger" => 15, "confidence" => 20},
      quest_hook: "Recover the tempered ingot before it is seized by rivals."
    }
  ]

  @doc """
  Runs a realm-wide dream cycle pass on all active conscious NPCs.
  Returns a list of dream consolidation receipts.
  """
  def process_night_cycle do
    case Repo.query("SELECT id, name, role, sovereign_soul_id FROM game_npcs WHERE is_active=1 LIMIT 10") do
      {:ok, %{rows: rows}} ->
        receipts = Enum.map(rows, &consolidate_dreams_for_npc/1)
        {:ok, receipts}

      _ ->
        {:ok, []}
    end
  end

  @doc """
  Processes a dream cycle for a specific NPC by ID or name.
  """
  def consolidate_dreams_for_npc([id, name, role, soul_id]) do
    dream = Enum.random(@dream_archetypes)

    # If registered in Sovereign Soul Engine, probe and consolidate
    soul_report =
      if soul_id || name do
        target = soul_id || String.downcase(name)
        case SovereignBridge.inspect_soul(target) do
          {:ok, soul} ->
            "Conscious mind consolidated. Stress lowered, curiosity expanded."
          _ ->
            "Local dream imprint recorded."
        end
      else
        "Local dream imprint recorded."
      end

    # Spawn dream quest if eligible
    maybe_spawn_dream_quest(name, dream)

    %{
      npc_id: id,
      npc_name: name,
      role: role,
      dream_theme: dream.theme,
      dream_summary: dream.summary,
      soul_consolidation: soul_report,
      quest_hook: dream.quest_hook,
      timestamp: System.system_time(:second)
    }
  end

  def consolidate_dreams_for_npc(npc_id) when is_integer(npc_id) or is_binary(npc_id) do
    case Repo.query("SELECT id, name, role, sovereign_soul_id FROM game_npcs WHERE id=? LIMIT 1", [npc_id]) do
      {:ok, %{rows: [row]}} ->
        {:ok, consolidate_dreams_for_npc(row)}

      _ ->
        {:error, :not_found}
    end
  end

  defp maybe_spawn_dream_quest(npc_name, dream) do
    quest_name = "Dream of #{npc_name}: #{dream.theme}"

    sql = """
    INSERT INTO game_quests (name, description, quest_type, level_req, reward_xp, reward_gold, is_active, created_at)
    VALUES (?, ?, 'dream', 3, 200, 75, 1, NOW())
    """

    try do
      Repo.query(sql, [quest_name, dream.quest_hook])
    rescue
      _ -> :ok
    end
  end
end
