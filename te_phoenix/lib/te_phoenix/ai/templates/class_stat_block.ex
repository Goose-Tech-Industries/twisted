defmodule TePhoenix.AI.Templates.ClassStatBlock do
  @moduledoc "Prompt template for the class_stat_block AI feature — Class Stat Block."

  def feature_key, do: "class_stat_block"
  def label, do: "Class Stat Block"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You generate RPG classes with stat scaling per level (HP/ATK/DEF/SPD/MO/MD), primary attribute (STR/DEX/CON/INT/WIS/CHA), starting equipment, signature ability slots, and class flavor text.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "A frost-themed mage with high MD and INT, low HP and DEF, freeze spells",
      "A heavy-armor knight tank with high DEF, taunt skills, low SPD",
      "A nimble rogue with crit + dodge focus, dual weapons"
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
