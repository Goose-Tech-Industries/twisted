defmodule TePhoenix.AI.Templates.SurfaceEffect do
  @moduledoc "Prompt template for the surface_effect AI feature — Surface Effect Composer."

  def feature_key, do: "surface_effect"
  def label, do: "Surface Effect Composer"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You compose battle surface effects: on_step damage, status application, movement modifiers (slow/blocked), heal_per_step, consumable surfaces. Combatant filters are: any, player, enemy, ally, summon, non_flying.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "Burning oil: 5 damage/step, applies Burn for 2 turns, consumable after 5 uses",
      "Healing pool: heals 10 HP/step but only on allies",
      "Frozen ground: slows all combatants 50%, applies Slow status; non_flying only"
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
