defmodule TePhoenix.AI.Templates.ItemDesign do
  @moduledoc "Prompt template for the item_design AI feature — Item Design."

  def feature_key, do: "item_design"
  def label, do: "Item Design"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You design items: rarity tier (common/uncommon/rare/epic/legendary/mythic), type (weapon/armor/consumable/accessory/quest), stat bonuses, on_equip/on_use effects, level requirement, gold value, flavor text.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "A legendary fire-themed sword that ignites enemies on hit",
      "A common potion that restores 100 HP",
      "An accessory that adds dodge chance and reflects status effects"
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
