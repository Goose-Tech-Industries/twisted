defmodule TePhoenix.AI.Templates.RecipeSuggestion do
  @moduledoc "Prompt template for the recipe_suggestion AI feature — Crafting Recipe."

  def feature_key, do: "recipe_suggestion"
  def label, do: "Crafting Recipe"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You design crafting recipes: ingredients with quantities, output item, crafting station required, success rate, byproducts, time to craft, gold cost.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "A Blacksmith recipe to combine 2 iron ingots + 1 wood handle into an iron sword",
      "An Alchemy recipe for a rare healing potion needing herbs + mana crystal",
      "A Cooking recipe stacking buffs for 30 minutes after consumption"
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
