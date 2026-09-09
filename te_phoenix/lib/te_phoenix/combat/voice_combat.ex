defmodule TePhoenix.Combat.VoiceCombat do
  @moduledoc """
  Real-Time Spoken Combat Spellcrafting & Squad Voice Tactics Engine.

  Enables microphone-driven combat actions:
    1. Spoken Spell Incantations ("Ignis Tempest", "Aegis Barricade", "Glacial Nova", "Siphon Soul")
       with voice resonance amplification multipliers (+10% to +35%).
    2. Tactical Spoken Squad Commands directing companion behavior trees
       ("Valeria shield", "Barnaby strike", "Rowan distract") with real-time audio acknowledgments.
  """

  require Logger
  alias TePhoenix.World.EngineFeatureFlags

  @spells %{
    "ignis tempest" => %{
      name: "Ignis Tempest",
      element: "fire",
      base_damage: 180,
      icon: "🔥",
      desc: "Raining fiery meteors strike all targets in the combat arena"
    },
    "aegis barricade" => %{
      name: "Aegis Barricade",
      element: "kinetic",
      base_shield: 160,
      icon: "🛡️",
      desc: "A luminous kinetic forcefield absorbs incoming boss attacks"
    },
    "glacial nova" => %{
      name: "Glacial Nova",
      element: "frost",
      base_damage: 130,
      freeze_duration_s: 3,
      icon: "❄️",
      desc: "Flash-freezes all enemy limbs, delaying telegraph timers by 3s"
    },
    "siphon soul" => %{
      name: "Siphon Soul",
      element: "shadow",
      base_damage: 120,
      heal_amount: 120,
      icon: "💀",
      desc: "Drains life force from the target and heals the caster"
    }
  }

  @squad_commands %{
    "shield" => %{
      companion: "Valeria the Shieldmaiden",
      action: "aegis_shield_intercept",
      icon: "🛡️",
      shout: "'Hold fast behind my shield! Nothing passes!'"
    },
    "strike" => %{
      companion: "Barnaby the Blacksmith",
      action: "colossus_hammer_smash",
      icon: "🔨",
      shout: "'Foundry hammer coming down with full force!'"
    },
    "distract" => %{
      companion: "Rowan the Tavern Bard",
      action: "sonic_discord_riff",
      icon: "🪕",
      shout: "'Listen closely to this discordant chord! Look over here!'"
    },
    "retreat" => %{
      companion: "Squad All",
      action: "turtle_formation",
      icon: "🐢",
      shout: "'Fall back to defensive posture! Regroup!'"
    }
  }

  @doc """
  Casts a spoken incantation with calculated vocal resonance bonus.
  """
  def cast_spoken_incantation(char_id, spoken_phrase, pitch_hz \\ 220, amplitude_db \\ -12.0) do
    unless EngineFeatureFlags.is_enabled?("voice_spellcraft_enabled") do
      {:error, "Voice combat is currently disabled by server policy"}
    else
      normalized = String.downcase(to_string(spoken_phrase)) |> String.trim()

      # Find matching spell
      matched_spell =
        Enum.find(@spells, fn {incantation, _} ->
          String.contains?(normalized, incantation)
        end)

      case matched_spell do
        {_, spell} ->
          # Calculate resonance multiplier based on vocal intensity
          resonance_pct =
            cond do
              amplitude_db > -10.0 and pitch_hz >= 200 -> 35
              amplitude_db > -18.0 -> 20
              true -> 10
            end

          total_power =
            if Map.has_key?(spell, :base_damage) do
              round(spell.base_damage * (1 + resonance_pct / 100))
            else
              round(spell.base_shield * (1 + resonance_pct / 100))
            end

          payload = %{
            char_id: char_id,
            spell_name: spell.name,
            element: spell.element,
            icon: spell.icon,
            resonance_pct: resonance_pct,
            total_power: total_power,
            message: "VOCAL RESONANCE #{resonance_pct}%! Cast #{spell.name} for #{total_power} #{spell.element} power!"
          }

          {:ok, payload}

        nil ->
          {:error, "Unrecognized incantation: '#{spoken_phrase}'. Valid spells: Ignis Tempest, Aegis Barricade, Glacial Nova, Siphon Soul."}
      end
    end
  end

  @doc """
  Issues a real-time tactical voice order to active squad companions.
  """
  def issue_squad_voice_command(char_id, command_phrase) do
    unless EngineFeatureFlags.is_enabled?("voice_spellcraft_enabled") do
      {:error, "Squad voice commands are currently disabled by server policy"}
    else
      normalized = String.downcase(to_string(command_phrase)) |> String.trim()

      matched_cmd =
        Enum.find(@squad_commands, fn {trigger, _} ->
          String.contains?(normalized, trigger)
        end)

      case matched_cmd do
        {_, cmd} ->
          payload = %{
            char_id: char_id,
            companion: cmd.companion,
            action: cmd.action,
            icon: cmd.icon,
            shout: cmd.shout,
            message: "#{cmd.companion} acknowledges command: #{cmd.shout}"
          }

          {:ok, payload}

        nil ->
          {:error, "Unknown squad command: '#{command_phrase}'. Try saying 'shield', 'strike', 'distract', or 'retreat'."}
      end
    end
  end

  @doc """
  Returns all registered spell incantations and tactical squad commands.
  """
  def list_voice_capabilities do
    %{
      spells: Map.values(@spells),
      squad_commands: Map.values(@squad_commands),
      is_enabled: EngineFeatureFlags.is_enabled?("voice_spellcraft_enabled")
    }
  end
end
