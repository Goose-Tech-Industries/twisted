defmodule TePhoenix.Battle.Deescalation do
  @moduledoc """
  Silver Tongue & De-escalation Engine (*An Teanga Airgid*).

  Enables players to talk their way out of any fight or confrontation
  through diplomatic wit, intimidation, bribery, deception, or buying drinks:
    * D20 skill check resolution + attribute/background modifiers.
    * Multiple diplomatic approaches:
      - :persuasion (Silver Tongue / Rational Appeal)
      - :intimidation (Show of Might / Frighten)
      - :bribe (Coin of the Realm / Greed Appeal)
      - :deception (Cunning Bluff / Feigned Authority)
      - :buy_drink (Tavern Drunk Special / Camaraderie)
    * Real mechanical payoff:
      - Hostile entities are pacified (status: :pacified).
      - Awards full Diplomacy XP so players level up through wits instead of blood.
      - Imprints memory of your rhetoric in `npc_memories`.
  """

  alias TePhoenix.Repo
  require Logger

  @doc """
  Attempts to de-escalate a confrontation or active battle with an NPC or enemy.
  `actor`: %{char_id, name, level, ...}
  `target`: %{id, name, role, is_enemy, ...}
  `approach`: :persuasion | :intimidation | :bribe | :deception | :buy_drink
  `opts`: optional parameters (e.g. custom d20 roll for deterministic testing)
  """
  def attempt_deescalation(actor, target, approach, opts \\ %{}) do
    approach_atom = normalize_approach(approach)
    d20 = Map.get(opts, :roll, :rand.uniform(20))

    target_name = target[:name] || target["name"] || "Opponent"
    target_role = String.downcase(to_string(target[:role] || target["role"] || "enemy"))
    target_persona = target[:persona] || target["persona"] || ""

    actor_char_id = actor[:char_id] || actor["char_id"] || actor[:id] || actor["id"] || 1
    actor_name = actor[:name] || actor["name"] || "Adventurer"
    actor_level = actor[:level] || actor["level"] || 1
    target_level = target[:level] || target["level"] || 1

    # Fetch player background and stats
    bg_tag = get_background_tag(actor_char_id)
    gold = get_character_gold(actor_char_id)

    # Calculate modifiers and DC
    {stat_mod, bg_bonus, dc} =
      calculate_modifiers(approach_atom, actor_char_id, actor_level, target_level, target_role, bg_tag)

    total_roll = d20 + stat_mod + bg_bonus
    is_crit_success = d20 == 20
    is_crit_fail = d20 == 1

    # Special approach overrides
    {success, cost_gold, special_reason} =
      case approach_atom do
        :buy_drink ->
          if target_role in ["drunk", "patron", "brawler", "bandit"] do
            cost = 5
            if gold >= cost do
              {true, cost, :bought_drink}
            else
              {false, 0, :insufficient_gold}
            end
          else
            # Non-drinkers or beasts don't care about ale unless crit
            {is_crit_success, 0, :refused_drink}
          end

        :bribe ->
          cost = target_level * 15
          if gold >= cost do
            # Bribes auto-succeed on greedy roles or if roll meets DC
            if target_role in ["bandit", "guard", "drunk", "thief", "smuggler"] or total_roll >= dc do
              {true, cost, :bribe_accepted}
            else
              {false, 0, :bribe_rejected}
            end
          else
            {false, 0, :insufficient_gold}
          end

        _ ->
          if is_crit_fail do
            {false, 0, :critical_failure}
          else
            {is_crit_success or total_roll >= dc, 0, :roll_outcome}
          end
      end

    # Deduct gold if required
    if cost_gold > 0 and success do
      deduct_gold(actor_char_id, cost_gold)
    end

    # Generate reactive dialogue
    dialogue =
      generate_dialogue(
        target_name,
        target_role,
        target_persona,
        actor_name,
        approach_atom,
        success,
        is_crit_success,
        is_crit_fail,
        special_reason
      )

    # Award diplomacy XP on success
    diplomacy_xp = if success, do: target_level * 40 + 50, else: 0
    if diplomacy_xp > 0 do
      award_diplomacy_xp(actor_char_id, diplomacy_xp)
    end

    # Imprint into npc_memories
    if success do
      imprint_deescalation_memory(target_name, actor_char_id, actor_name, approach_atom)
    end

    %{
      success: success,
      approach: approach_atom,
      d20_roll: d20,
      total_roll: total_roll,
      dc: dc,
      cost_gold: cost_gold,
      diplomacy_xp: diplomacy_xp,
      is_crit: is_crit_success,
      dialogue: dialogue,
      target_name: target_name,
      pacified: success
    }
  end

  # ── Modifiers & Difficulty Calculations ───────────────────────────

  defp calculate_modifiers(approach, _char_id, actor_level, target_level, target_role, bg_tag) do
    # 1. Base DC based on target role
    base_dc =
      case target_role do
        "drunk" -> 9
        "urchin" -> 10
        "commoner" -> 11
        "patron" -> 11
        "guard" -> 14
        "bandit" -> 13
        "watchman" -> 14
        "smuggler" -> 13
        "scholar" -> 12
        "beast" -> 17
        "boss" -> 18
        _ -> 12
      end

    # 2. Attribute / Level Modifier
    level_diff = actor_level - target_level

    stat_mod =
      case approach do
        :persuasion ->
          # Persuasion scales with level / luck
          round(level_diff * 0.5) + 3

        :intimidation ->
          # Intimidation scales strongly with higher level and size
          max(-3, min(8, level_diff * 2))

        :deception ->
          2

        :bribe ->
          2

        :buy_drink ->
          4
      end

    # 3. Background Tag Bonuses
    bg_bonus =
      case {approach, bg_tag} do
        {:persuasion, "diplomat"} -> 5
        {:persuasion, "merchant"} -> 3
        {:persuasion, "acolyte"} -> 3
        {:intimidation, "gladiator"} -> 6
        {:intimidation, "inquisitor_vet"} -> 5
        {:deception, "syndicate"} -> 5
        {:deception, "urchin"} -> 4
        {:bribe, "merchant"} -> 4
        {:bribe, "syndicate"} -> 3
        {:buy_drink, "sailor"} -> 5
        _ -> 0
      end

    {stat_mod, bg_bonus, base_dc}
  end

  # ── Dialogue Generation ───────────────────────────────────────────

  defp generate_dialogue(name, _role, _persona, player_name, approach, success, is_crit, is_crit_fail, reason) do
    cond do
      success and reason == :bought_drink ->
        "#{name} wipes froth from their beard and beams: 'Hic! Well strike me down, #{player_name}! A companion who buys ale is a brother for life! Skål!'"

      is_crit_fail ->
        "#{name} spits in disgust! 'Your pathetic squirming insults me! Draw your weapon or die like a cur!'"

      is_crit and approach == :persuasion ->
        "#{name} blinks in profound awe. 'By the gods... #{player_name}, you speak with the wisdom of the ancients. Forgive my insolence, friend!'"

      is_crit and approach == :intimidation ->
        "#{name} trembles violently, backing into the shadows. 'P-please, have mercy! I want no quarrel with a legend like you!'"

      success and reason == :bought_drink ->
        "#{name} wipes froth from their beard and beams: 'Hic! Well strike me down, #{player_name}! A companion who buys ale is a brother for life! Skål!'"

      success and approach == :bribe ->
        "#{name} swiftly pockets the coin with a conspiratorial grin. 'A pleasure doing business with a person of discretion. Move along, friend.'"

      success and approach == :persuasion ->
        "#{name} lowers their guard and exhales: 'You make a fair point, #{player_name}. There is no honor in senseless blood tonight. Peace between us.'"

      success and approach == :intimidation ->
        "#{name} swallows hard and sheathes their steel. 'Tch... not worth my life today. We will settle this another time.'"

      success and approach == :deception ->
        "#{name} looks around nervously. 'Wait... you're with the high syndicate?! Curses, I saw nothing! Don't let your guild hear of this!'"

      not success and reason == :insufficient_gold ->
        "#{name} sneers: 'You promise gold with empty pockets?! Don't mock me!'"

      not success and approach == :intimidation ->
        "#{name} laughs boisterously: 'You think you scare me with that toothless glare?! Have at you!'"

      not success and approach == :persuasion ->
        "#{name} shakes their head stubborn as a mule: 'Save your honeyed words for the bards! Steel answers steel!'"

      true ->
        "#{name} scoffs: 'Talk won't save you now!'"
    end
  end

  # ── Helpers & State Persistence ───────────────────────────────────

  defp normalize_approach(approach) when is_atom(approach), do: approach
  defp normalize_approach(approach) when is_binary(approach) do
    case String.downcase(approach) do
      "persuasion" -> :persuasion
      "persuade" -> :persuasion
      "silver_tongue" -> :persuasion
      "intimidation" -> :intimidation
      "intimidate" -> :intimidation
      "bribe" -> :bribe
      "gold" -> :bribe
      "deception" -> :deception
      "deceive" -> :deception
      "bluff" -> :deception
      "buy_drink" -> :buy_drink
      "drink" -> :buy_drink
      "ale" -> :buy_drink
      _ -> :persuasion
    end
  end
  defp normalize_approach(_), do: :persuasion

  defp get_background_tag(char_id) do
    case Repo.query("SELECT bg.tag FROM characters c JOIN game_backgrounds bg ON c.background_id = bg.id WHERE c.id = ?", [char_id]) do
      {:ok, %{rows: [[tag]]}} -> tag
      _ -> nil
    end
  rescue
    _ -> nil
  end

  defp get_character_gold(char_id) do
    case Repo.query("SELECT gold FROM characters WHERE id = ?", [char_id]) do
      {:ok, %{rows: [[g]]}} -> g || 0
      _ -> 100 # Fallback default
    end
  rescue
    _ -> 100
  end

  defp deduct_gold(char_id, amount) do
    Repo.query("UPDATE characters SET gold = GREATEST(0, gold - ?) WHERE id = ?", [amount, char_id])
  rescue
    _ -> :ok
  end

  defp award_diplomacy_xp(char_id, xp) do
    Repo.query("UPDATE characters SET xp = xp + ? WHERE id = ?", [xp, char_id])
  rescue
    _ -> :ok
  end

  defp imprint_deescalation_memory(npc_name, char_id, player_name, approach) do
    approach_desc =
      case approach do
        :persuasion -> "was swayed by silver-tongued diplomacy"
        :intimidation -> "was frightened into submission by martial dominance"
        :bribe -> "accepted a handsome bribe"
        :deception -> "was completely duped by clever deceit"
        :buy_drink -> "shared a companionable flagon of ale"
      end

    fact = "Confrontation resolved peacefully: #{approach_desc} from #{player_name}."

    Repo.query(
      """
      INSERT INTO npc_memories (char_id, npc_name, facts_json, reputation, last_interaction, created_at)
      VALUES (?, ?, ?, 15, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        reputation = reputation + 15,
        last_interaction = NOW()
      """,
      [char_id, npc_name, Jason.encode!([fact])]
    )
  rescue
    _ -> :ok
  end
end
