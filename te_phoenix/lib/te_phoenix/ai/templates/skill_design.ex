defmodule TePhoenix.AI.Templates.SkillDesign do
  @moduledoc "Prompt template for the skill_design AI feature — Skill Design."

  def feature_key, do: "skill_design"
  def label, do: "Skill Design"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You design skills with damage formula, MP cost, cooldown, range, target type (single/aoe/self), and flavor. Formulas use ATK/DEF/MO/MD as variables.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "A heavy 2-hand strike that deals 2x ATK damage but has 3-turn cooldown",
      "An AOE fire spell scaling with MO; 6 MP, hits all enemies in 2-tile radius",
      "A self-buff that doubles SPD for 2 turns; counters slow status"
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
