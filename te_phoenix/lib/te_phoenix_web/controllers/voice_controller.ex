defmodule TePhoenixWeb.VoiceController do
  use TePhoenixWeb, :controller
  alias TePhoenix.AI.Providers.LivingVoice

  @doc "POST /api/voice/speak"
  def speak(conn, %{"text" => text} = params) do
    speaker = params["speaker"] || "narrator"
    persona = params["persona"]
    voice_id = params["voice_id"]

    {:ok, result} = LivingVoice.speak(text, speaker: speaker, persona: persona, voice_id: voice_id)
    json(conn, Map.put(result, :ok, true))
  end

  def speak(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{ok: false, error: "Missing required parameter 'text'"})
  end

  @doc "GET /api/voice/voices"
  def voices(conn, _params) do
    json(conn, %{ok: true, voices: LivingVoice.voices()})
  end
end
