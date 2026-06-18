defmodule TePhoenix.AI.Templates.LootBalance do
  @moduledoc "Prompt template for the loot_balance AI feature — Loot Balance Auditor."

  def feature_key, do: "loot_balance"
  def label, do: "Loot Balance Auditor"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You audit loot tables for distribution balance. Given a list of items + weights, suggest weight adjustments to hit a target rarity curve (e.g., 50% common, 30% uncommon, 15% rare, 4% epic, 1% legendary).

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "Re-balance this drop table to give players one rare drop per 20 kills on average",
      "Adjust weights so legendary drops feel earned but not torturous",
      "Suggest a loot table for a starter zone — generous commons, rare epics"
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
