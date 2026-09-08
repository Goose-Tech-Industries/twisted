defmodule TePhoenix.AI.Providers.LivingVoice do
  @moduledoc """
  Living Voice Audio Provider: Integrates ElevenLabs TTS with Sovereign Soul voice routing.
  Streams NPC dialogue lines into spoken fantasy character voices with:
  1. Local caching in `priv/static/voice/` keyed on SHA256(text + voice_id).
  2. Zero-token Web Speech API fallback when `ELEVENLABS_API_KEY` is not present.
  3. Sovereign Soul voice mapping based on NPC persona and speaker name.
  """

  require Logger

  @default_voice_id "pNInz6obpgDQGcFmaJgB" # "Adam" - deep narrative fantasy voice
  @elevenlabs_api_url "https://api.elevenlabs.io/v1/text-to-speech"

  # Sovereign Soul Archetype Voice Map
  @archetype_voices %{
    "narrator" => "pNInz6obpgDQGcFmaJgB", # Adam
    "elder" => "VR6AewLTigWG4xSOukaG",    # Arnold
    "maiden" => "21m00Tcm4TlvDq8ikWAM",   # Rachel
    "warrior" => "ErXwobaYiN019PkySvjV",  # Antoni
    "witch" => "EXAVITQu4vr4xnSDxMaL",    # Bella
    "rogue" => "AZnzlk1XvdvUeBnXmlld"     # Domi
  }

  @doc "Synthesizes speech for dialogue text."
  def speak(text, opts \\ []) do
    clean_text = clean_dialogue_text(text)

    if clean_text == "" do
      {:ok, %{audio_url: nil, fallback: true}}
    else
      speaker = Keyword.get(opts, :speaker, "narrator")
      voice_id = Keyword.get(opts, :voice_id) || resolve_voice_id(speaker, opts[:persona])
      api_key = System.get_env("ELEVENLABS_API_KEY")

      cond do
        api_key != nil and api_key != "" ->
          synthesize_elevenlabs(clean_text, voice_id, api_key)

        true ->
          # Offline / No ElevenLabs key: client uses Web Speech API or procedural tone
          {:ok, %{audio_url: nil, fallback: :web_speech, voice_id: voice_id, speaker: speaker, text: clean_text}}
      end
    end
  end

  @doc "Returns known Sovereign Soul voice presets."
  def voices do
    @archetype_voices
  end

  # Resolve appropriate voice ID from speaker name and persona
  defp resolve_voice_id(speaker, persona) do
    combined = String.downcase("#{speaker} #{persona || ""}")
    cond do
      Regex.match?(~r/elder|wizard|sage|ancient|druid|old/i, combined) -> @archetype_voices["elder"]
      Regex.match?(~r/witch|sorceress|priestess|banshee/i, combined) -> @archetype_voices["witch"]
      Regex.match?(~r/warrior|knight|guard|paladin|captain/i, combined) -> @archetype_voices["warrior"]
      Regex.match?(~r/rogue|thief|shadow|assassin/i, combined) -> @archetype_voices["rogue"]
      Regex.match?(~r/maiden|healer|girl|fairy|nymph/i, combined) -> @archetype_voices["maiden"]
      true -> @default_voice_id
    end
  end

  # Synthesize via ElevenLabs REST API with disk caching
  defp synthesize_elevenlabs(text, voice_id, api_key) do
    cache_key = :crypto.hash(:sha256, "#{voice_id}:#{text}") |> Base.encode16(case: :lower)
    filename = "voice_#{cache_key}.mp3"

    out_dir = Path.join(:code.priv_dir(:te_phoenix), "static/voice")
    File.mkdir_p!(out_dir)
    dest_path = Path.join(out_dir, filename)

    if File.exists?(dest_path) do
      {:ok, %{audio_url: "/voice/#{filename}", cached: true, provider: :elevenlabs}}
    else
      url = "#{@elevenlabs_api_url}/#{voice_id}"

      body = %{
        "text" => text,
        "model_id" => "eleven_monolingual_v1",
        "voice_settings" => %{
          "stability" => 0.5,
          "similarity_boost" => 0.75
        }
      }

      headers = [
        {"xi-api-key", api_key},
        {"Content-Type", "application/json"},
        {"Accept", "audio/mpeg"}
      ]

      case Req.post(url, headers: headers, json: body, receive_timeout: 15_000) do
        {:ok, %{status: 200, body: binary}} when is_binary(binary) ->
          File.write!(dest_path, binary)
          {:ok, %{audio_url: "/voice/#{filename}", cached: false, provider: :elevenlabs}}

        {:ok, %{status: status, body: err_body}} ->
          Logger.warning("[LivingVoice] ElevenLabs returned #{status}: #{inspect(err_body)}")
          {:ok, %{audio_url: nil, fallback: :web_speech, error: status}}

        {:error, reason} ->
          Logger.warning("[LivingVoice] ElevenLabs request failed: #{inspect(reason)}")
          {:ok, %{audio_url: nil, fallback: :web_speech, error: reason}}
      end
    end
  end

  # Strip markdown formatting (*actions*, quotes) for cleaner speech
  defp clean_dialogue_text(text) do
    text
    |> String.replace(~r/\*[^*]+\*/, "")
    |> String.replace(~r/["']/, "")
    |> String.trim()
  end
end
