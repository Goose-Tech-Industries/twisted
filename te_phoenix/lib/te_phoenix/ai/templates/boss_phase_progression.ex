defmodule TePhoenix.AI.Templates.BossPhaseProgression do
  @moduledoc "Prompt template for the boss_phase_progression AI feature — Boss Phase Progression."

  def feature_key, do: "boss_phase_progression"
  def label, do: "Boss Phase Progression"

  def base_prompt(context) do
    user_input = Map.get(context, :user_input, "")
    """
    You design boss phase progressions: HP threshold transitions with stat modifiers, screen effects, dialogue announcements, and signature ability unlocks per phase.

    User's request: #{user_input}

    Return your suggestion as a JSON object matching the schema for this feature.
    Include flavor text where the engine has a flavor field. Keep numeric ranges
    within the engine's stated bounds. Don't invent fields the schema doesn't list.
    """
  end

  def preset_prompts do
    [
      "A 3-phase fire dragon: civil → enraged → desperate, gaining new fire abilities each phase",
      "Twin bosses that revive each other; one phase 1 transitions when the partner dies",
      "A swordsman boss that gradually loses armor pieces; ATK rises but DEF falls"
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
