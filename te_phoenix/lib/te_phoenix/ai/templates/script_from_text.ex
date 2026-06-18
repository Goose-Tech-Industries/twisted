defmodule TePhoenix.AI.Templates.ScriptFromText do
  @moduledoc "Prompt template for the script_from_text AI feature — Visual Script From Text."

  def feature_key, do: "script_from_text"
  def label, do: "Visual Script From Text"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You convert plain-English scripted sequences into a visual script graph: nodes with type (event/condition/action), connections, and stable IDs.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "When the player enters the room, lock the door and spawn 3 enemies",
      "If the player has the gold key, open the chest; otherwise show a lock icon",
      "Trigger a cutscene: NPC walks to the player, says a line, then opens a portal"
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
