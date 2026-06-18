defmodule TePhoenix.AI.Templates.RuleSuggester do
  @moduledoc "Prompt template for the rule_suggester AI feature — Battle Rule Suggester."

  def feature_key, do: "rule_suggester"
  def label, do: "Battle Rule Suggester"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You convert plain-English combat rules into structured RuleBuilder JSON. The engine fires rules on triggers like turn_start, on_damage_taken, on_kill, hp_threshold. Conditions reference stats (hp_pct, mp_pct), statuses, or surface types. Actions include apply_status, damage, heal, stat_mod, announce, summon.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "When HP drops below 25%, gain a Berserker buff increasing ATK by 50%",
      "Apply Bleed status on every critical hit, lasting 3 turns",
      "Reflect 50% of physical damage when defending"
    ]
  end

  def parse_response(text) when is_binary(text) do
    cleaned =
      text
      |> String.replace(~r/^.*?\`\`\`json\s*/s, "")
      |> String.replace(~r/\s*\`\`\`.*$/s, "")
      |> String.trim()

    case Jason.decode(cleaned) do
      {:ok, decoded} -> {:ok, decoded}
      _ -> {:ok, %{"text" => text}}
    end
  end

  def parse_response(other), do: {:ok, other}
end
