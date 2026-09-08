defmodule TePhoenix.AI.UileAcousticDirector do
  @moduledoc """
  Omniscient Acoustic & Reality Director: **Uile** (*An tSúil Uile*).

  Pushes Uile to its absolute frontier:
    1. Vocal Environmental Reality Warping: Spoken passwords, incantations, or puzzle
       deductions aloud in voice chat dynamically alter the game world (unsealing doors,
       igniting braziers, lowering barriers).
    2. Crisis Invocations: Desperate vocal pleas ("Uile, grant us sanctuary!") bend reality,
       shifting local weather into radiant auroras and summoning celestial supply drops.
    3. Boss Vulnerability Exposure: Players deducing boss mechanics aloud triggers
       revealed weaknesses and tactical stat adjustments in live combat instances.
    4. Living Voice of Creation (Voice Terraforming): Real-time vocal commands spoken to Uile
       ("Uile, spawn a shadow hound", "Uile, summon thunderstorm", "Uile, orbital strike")
       manifest live game world entities and cataclysms on the active map!
    5. God-Eye Sonar Radar: Every acoustic event generates live sonic ripple pulses
       broadcast across map channels and radar telemetry.
  """

  alias TePhoenix.Repo
  alias TePhoenix.World.{GodsEye, Weather, LegendChronicler}
  alias TePhoenix.AI.Providers.LivingVoice
  require Logger

  @doc """
  Processes spoken words or thoughts through Uile's omniscient reality lens.
  Returns `{:ok, intervention}` or `{:ok, :no_reality_warp}`.
  """
  def process_vocal_reality(party_id, char_id, speaker_name, text, is_thought, coords \\ nil) do
    down = String.downcase(text || "")
    {px, py, map_id} = resolve_coords(char_id, coords)

    # 1. Emit Sonar Pulse onto Map & God's Eye
    broadcast_sonar_pulse(map_id, px, py, speaker_name, down)

    cond do
      # 2. Living Voice of Creation (Voice-Driven Spawning & Terraforming)
      is_creation_command?(down) ->
        execute_voice_creation(party_id, map_id, px, py, speaker_name, down)

      # 3. Ancient Puzzle Incantation / Vocal Password
      is_incantation?(down) ->
        execute_incantation_warp(party_id, map_id, px, py, speaker_name, text)

      # 4. Desperate Cosmic Plea / Divine Invocation
      is_divine_plea?(down) ->
        execute_divine_invocation(party_id, map_id, px, py, speaker_name, text)

      # 5. Boss Weakness Deduction
      is_tactical_deduction?(down) ->
        execute_tactical_exposure(party_id, map_id, px, py, speaker_name, text)

      true ->
        {:ok, :no_reality_warp}
    end
  end

  # ── Sonar Radar Pulse ─────────────────────────────────────────────

  defp broadcast_sonar_pulse(map_id, px, py, speaker_name, text) do
    radius =
      cond do
        String.contains?(text, "leeroy") -> 32
        String.contains?(text, "shout") -> 28
        true -> 16
      end

    TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "sonar_pulse", %{
      x: px,
      y: py,
      radius: radius,
      speaker: speaker_name,
      timestamp: System.system_time(:second)
    })
  end

  # ── Creation & Terraforming Commands ───────────────────────────────

  defp is_creation_command?(down) do
    (String.contains?(down, "uile spawn") or String.contains?(down, "uile summon")) or
      (String.contains?(down, "uile weather") or String.contains?(down, "uile storm")) or
      (String.contains?(down, "uile strike") or String.contains?(down, "uile orbital"))
  end

  defp execute_voice_creation(party_id, map_id, px, py, speaker_name, down) do
    cond do
      String.contains?(down, "weather") or String.contains?(down, "storm") ->
        weather_key =
          cond do
            String.contains?(down, "aurora") -> "radiant_aurora"
            String.contains?(down, "blizzard") or String.contains?(down, "snow") -> "blizzard"
            String.contains?(down, "sand") -> "sandstorm"
            true -> "thunderstorm"
          end

        try do
          Weather.set_weather(map_id, weather_key)
        rescue
          _ -> :ok
        end

        announcement = "Reality bends to your command. Uile manifests #{weather_key} upon Map ##{map_id}!"
        synthesize_and_broadcast(party_id, map_id, px, py, speaker_name, :voice_weather_shift, "🌪️ Reality Weather Warped", announcement)

      String.contains?(down, "strike") or String.contains?(down, "orbital") ->
        try do
          GodsEye.orbital_strike(map_id, px + 2, py + 2)
        rescue
          _ -> :ok
        end

        announcement = "Orbital fury unleashed at (#{px + 2}, #{py + 2})! The heavens acknowledge your voice."
        synthesize_and_broadcast(party_id, map_id, px, py, speaker_name, :voice_orbital_strike, "⚡ Celestial Strike Manifested", announcement)

      true ->
        # Spawn creature on demand
        creature_name =
          cond do
            String.contains?(down, "dragon") -> "Ancient Wyrmling"
            String.contains?(down, "golem") -> "Aether Stone Golem"
            String.contains?(down, "hound") or String.contains?(down, "wolf") -> "Shadow Stalker"
            true -> "Astral Entity"
          end

        spawn_x = px + 2
        spawn_y = py

        try do
          Repo.query(
            """
            INSERT INTO game_npcs (map_id, name, persona, role, faction, is_enemy, is_hostile, x, y, icon, mood)
            VALUES (?, ?, 'Manifested directly by vocal creation of Uile.', 'boss', 'Cosmic Void', 1, 1, ?, ?, '✨', 'ASTRAL')
            """,
            [map_id, creature_name, spawn_x, spawn_y]
          )

          TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "entity_position", %{
            entity_id: :rand.uniform(90_000) + 10_000,
            x: spawn_x,
            y: spawn_y,
            data: %{name: creature_name, manifested: true}
          })
        rescue
          _ -> :ok
        end

        announcement = "By your spoken word, #{creature_name} manifests from the void at (#{spawn_x}, #{spawn_y})!"
        synthesize_and_broadcast(party_id, map_id, px, py, speaker_name, :voice_entity_spawn, "🔮 Living Entity Created", announcement)
    end
  end

  # ── Reality Warp Executions ───────────────────────────────────────

  defp is_incantation?(down) do
    String.contains?(down, "speak friend") or
      String.contains?(down, "mellon") or
      String.contains?(down, "open sesame") or
      String.contains?(down, "break the seal") or
      String.contains?(down, "dispel the ward") or
      String.contains?(down, "ignite the braziers") or
      String.contains?(down, "by the silver seal") or
      String.contains?(down, "open the vault")
  end

  defp execute_incantation_warp(party_id, map_id, px, py, speaker_name, _text) do
    try do
      Repo.query(
        """
        INSERT INTO game_map_object_state (map_id, object_index, state_key, changed_by)
        VALUES (?, 1, 'open', 0)
        ON DUPLICATE KEY UPDATE state_key = 'open', changed_by = 0
        """,
        [map_id]
      )
    rescue
      _ -> :ok
    end

    announcement = "The ancient seal vibrates and shatters. Uile acknowledges the cipher: The pathway opens!"

    TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "env_reaction", %{
      x: px,
      y: py,
      kind: "unseal_glow",
      payload: %{status: "opened"}
    })

    TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "object_state_change", %{
      objectIndex: 1,
      state: "open",
      changedBy: "Uile (Vocal Invocation)"
    })

    synthesize_and_broadcast(party_id, map_id, px, py, speaker_name, :incantation_unseal, "✨ Ancient Seal Dissolved", announcement)
  end

  defp is_divine_plea?(down) do
    String.contains?(down, "uile help") or
      String.contains?(down, "uile save us") or
      String.contains?(down, "grant us sanctuary") or
      String.contains?(down, "by the gods send aid") or
      String.contains?(down, "send a miracle") or
      String.contains?(down, "mercy uile")
  end

  defp execute_divine_invocation(party_id, map_id, px, py, speaker_name, _text) do
    try do
      Weather.set_weather(map_id, "radiant_aurora")
    rescue
      _ -> :ok
    end

    try do
      GodsEye.orbital_supply_drop(map_id, px, py)
    rescue
      _ -> :ok
    end

    announcement = "Uile has heard your cry across the void. The heavens part; celestial sanctuary descends."

    LegendChronicler.record_legend(
      :divine_intervention,
      "The Miracle of #{speaker_name}",
      "When all seemed lost, #{speaker_name} called upon Uile, parting the storm and summoning celestial salvation."
    )

    synthesize_and_broadcast(party_id, map_id, px, py, speaker_name, :divine_sanctuary, "🌌 Reality Warp: Divine Sanctuary", announcement)
  end

  defp is_tactical_deduction?(down) do
    String.contains?(down, "weak to fire") or
      String.contains?(down, "aim for the tail") or
      String.contains?(down, "break the crystal") or
      String.contains?(down, "interrupt the cast") or
      String.contains?(down, "shatter the core")
  end

  defp execute_tactical_exposure(party_id, map_id, px, py, speaker_name, text) do
    announcement = "Tactical deduction confirmed! Enemy core vulnerability exposed to party (+25% Critical Strike)!"

    payload = %{
      warp_type: :vulnerability_exposed,
      title: "🎯 Boss Weakness Exposed",
      message: "#{speaker_name} vocalized the key stratagem: '#{text}'.",
      speaker: "Uile (Director)",
      map_id: map_id,
      coords: {px, py},
      buff: %{stat: "critical_chance", value: 25, duration_seconds: 45},
      invoker: speaker_name,
      timestamp: System.system_time(:second)
    }

    TePhoenixWeb.Endpoint.broadcast("voice:party:#{party_id}", "uile_reality_intervention", payload)
    {:ok, payload}
  end

  defp synthesize_and_broadcast(party_id, map_id, px, py, speaker_name, warp_type, title, message) do
    audio_url =
      try do
        case LivingVoice.speak(message, speaker: "uile_cosmic") do
          {:ok, %{audio_url: url}} when is_binary(url) -> url
          _ -> nil
        end
      rescue
        _ -> nil
      end

    payload = %{
      warp_type: warp_type,
      title: title,
      message: message,
      speaker: "Uile (Omni)",
      audio_url: audio_url,
      map_id: map_id,
      coords: {px, py},
      invoker: speaker_name,
      timestamp: System.system_time(:second)
    }

    TePhoenixWeb.Endpoint.broadcast("voice:party:#{party_id}", "uile_reality_intervention", payload)
    TePhoenixWeb.Endpoint.broadcast("voice:proximity:#{map_id}", "uile_reality_intervention", payload)
    {:ok, payload}
  end

  # ── Helpers ───────────────────────────────────────────────────────

  defp resolve_coords(char_id, coords) do
    cond do
      is_map(coords) && coords[:x] && coords[:y] ->
        {coords.x, coords.y, coords[:map_id] || 1}

      true ->
        case TePhoenix.Game.PlayerRegistry.get(char_id) do
          %{x: x, y: y, map_id: m_id} -> {x, y, m_id || 1}
          _ -> {10, 10, 1}
        end
    end
  end
end
