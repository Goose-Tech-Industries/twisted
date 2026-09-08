defmodule TePhoenix.AI.Providers.SomaticVoice do
  @moduledoc """
  Somatic Voice Modulator: Synthesizes living spoken fantasy voices that dynamically
  respond to the speaker's internal psychological and somatic condition.

  Modulates ElevenLabs parameters (stability, style, pacing, tremors) based on:
    * Somatic State: pain, fatigue, hunger, illness
    * Emotional State: anger, fear, stress, confidence
  """

  alias TePhoenix.AI.Providers.LivingVoice
  require Logger

  @doc """
  Synthesizes speech with somatic vocal tremors, gasps, and emotional cadence.
  Returns `{:ok, %{audio_url: url, modulated_text: text, profile: profile}}` or `{:error, reason}`.
  """
  def speak(text, opts \\ []) do
    emotional = Keyword.get(opts, :emotional, %{})
    somatic = Keyword.get(opts, :somatic, %{})
    speaker = Keyword.get(opts, :speaker, "narrator")

    {modulated_text, voice_profile} = apply_somatic_cadence(text, emotional, somatic)

    case LivingVoice.speak(modulated_text, Keyword.merge(opts, [speaker: speaker])) do
      {:ok, %{audio_url: audio_url}} when is_binary(audio_url) ->
        {:ok,
         %{
           audio_url: audio_url,
           modulated_text: modulated_text,
           profile: voice_profile
         }}

      {:ok, other} ->
        {:ok, Map.merge(other, %{modulated_text: modulated_text, profile: voice_profile})}
    end
  end

  @doc """
  Applies somatic indicators and calculates vocal parameters based on bio-metrics.
  """
  def apply_somatic_cadence(text, emotional, somatic) do
    pain = to_int(Map.get(somatic, "pain") || Map.get(somatic, :pain), 0)
    fatigue = to_int(Map.get(somatic, "fatigue") || Map.get(somatic, :fatigue), 0)
    anger = to_int(Map.get(emotional, "anger") || Map.get(emotional, :anger), 0)
    fear = to_int(Map.get(emotional, "fear") || Map.get(emotional, :fear), 0)

    # 1. Somatic text annotations
    text_mod =
      cond do
        pain >= 70 ->
          "*[groans in agony]* #{text} *[sharp gasp for breath]*"

        pain >= 40 ->
          "*[strains through pain]* #{text}"

        anger >= 75 ->
          "*[furious snarl]* #{String.upcase(text)}!"

        fear >= 65 ->
          "*[voice trembling]* #{text}..."

        fatigue >= 60 ->
          "*[weary exhale]* #{text}..."

        true ->
          text
      end

    # 2. Vocal modulation profile
    profile = %{
      stability: calculate_stability(anger, fear, pain),
      intensity: max(anger, fear),
      somatic_pain: pain,
      somatic_fatigue: fatigue
    }

    {text_mod, profile}
  end

  defp calculate_stability(anger, fear, pain) do
    base = 0.50
    # Trembling or agony decreases stability
    penalty = (fear * 0.002) + (pain * 0.002)
    # Intense focused anger increases stability
    boost = anger * 0.001

    max(0.15, min(0.90, base - penalty + boost))
    |> Float.round(2)
  end

  defp to_int(n, _default) when is_integer(n), do: n
  defp to_int(s, default) when is_binary(s) do
    case Integer.parse(s) do
      {i, _} -> i
      _ -> default
    end
  end
  defp to_int(_, default), do: default
end
