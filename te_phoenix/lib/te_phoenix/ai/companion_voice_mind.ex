defmodule TePhoenix.AI.CompanionVoiceMind do
  @moduledoc """
  Companion Voice Mind: Gives summoned companions active voices and bodies in party voice chat!

  Companions listen to players' ideas, tactics, thoughts, and shouts, chiming in over voice chat
  with in-character commentary synthesized via SomaticVoice AND physically executing
  tactical in-game actions (wards, shield intercepts, flank rushes, stealth shrouds).
  """

  alias TePhoenix.Repo
  alias TePhoenix.AI.Providers.SomaticVoice
  require Logger

  @doc """
  Processes player speech within a party voice room, selecting active companions to react.
  Backward-compatible wrapper for `react_to_speech_and_action/5`.
  """
  def react_to_speech(party_id, char_id, speech_text, opts \\ []) do
    speaker_name = Keyword.get(opts, :speaker_name, "Player_#{char_id}")
    react_to_speech_and_action(party_id, char_id, speaker_name, speech_text, opts)
  end

  @doc """
  Processes player speech or telepathic thoughts, generating both verbal dialogue
  AND executing physical in-game companion tactical actions (wards, charges, stealth, repositioning).
  """
  def react_to_speech_and_action(party_id, char_id, speaker_name, speech_text, opts \\ []) do
    active_companions = get_party_companions(char_id)
    is_thought = Keyword.get(opts, :is_thought, false)
    map_id = Keyword.get(opts, :map_id)

    if active_companions != [] do
      comp = Enum.random(active_companions)
      reaction = generate_reaction_text(comp, speech_text, is_thought, speaker_name)
      action = synthesize_tactical_action(comp, speech_text, speaker_name, is_thought)

      # 1. Update companion tactical stance in DB if changed
      if action.new_tactic && action.new_tactic != comp.tactic do
        try do
          Repo.query("UPDATE character_companions SET tactics = ?, updated_at = NOW() WHERE id = ?", [
            action.new_tactic,
            comp.id
          ])
        rescue
          _ -> :ok
        end
      end

      # 2. Update PlayerRegistry with companion tactical buff if player is online
      try do
        case TePhoenix.Game.PlayerRegistry.get(char_id) do
          nil -> :ok
          p ->
            active_buffs = Map.get(p, :companion_buffs, %{})
            updated_buffs = Map.put(active_buffs, comp.name, action.buff)
            TePhoenix.Game.PlayerRegistry.put(char_id, Map.put(p, :companion_buffs, updated_buffs))
        end
      rescue
        _ -> :ok
      end

      # 3. Synthesize voice audio
      {emotional, somatic} = tactic_to_emotional_state(action.new_tactic || comp.tactic)

      audio_result =
        try do
          case SomaticVoice.speak(reaction, emotional: emotional, somatic: somatic, speaker: comp.name) do
            {:ok, res} -> res[:audio_url]
            _ -> nil
          end
        rescue
          _ -> nil
        end

      speech_payload = %{
        companion_id: comp.id,
        name: comp.name,
        icon: comp.icon || "🐺",
        text: reaction,
        audio_url: audio_result,
        tactic: action.new_tactic || comp.tactic,
        speaker_type: :companion,
        is_thought: is_thought,
        timestamp: System.system_time(:second)
      }

      action_payload = %{
        companion_id: comp.id,
        companion_name: comp.name,
        icon: comp.icon || "🐺",
        action_type: action.type,
        action_name: action.name,
        description: action.description,
        target_name: speaker_name,
        buff: action.buff,
        pos_shift: action.pos_shift,
        animation: action.animation,
        is_thought_reaction: is_thought,
        timestamp: System.system_time(:second)
      }

      # 4. Broadcast speech and physical action into voice party room
      TePhoenixWeb.Endpoint.broadcast("voice:party:#{party_id}", "companion_voice_spoke", speech_payload)
      TePhoenixWeb.Endpoint.broadcast("voice:party:#{party_id}", "companion_action_executed", action_payload)

      # 5. Broadcast to map channel if active
      if map_id do
        TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "companion_action_fx", action_payload)
      end

      {:ok, Map.merge(speech_payload, %{action: action_payload, speech: speech_payload})}
    else
      {:ok, :no_active_companions}
    end
  end

  @doc """
  Reacts immediately to a "LEEROY JENKINS!" battle cry shout with word and physical charge.
  """
  def react_to_battle_cry(party_id, char_id, speaker_name, opts \\ []) do
    active_companions = get_party_companions(char_id)
    map_id = Keyword.get(opts, :map_id)

    if active_companions != [] do
      comp = Enum.random(active_companions)

      reaction =
        case comp.tactic do
          "AGGRESSIVE" ->
            "BLOOD AND GLORY! #{speaker_name} LEADS, WE REAP! NO MERCY!"

          "DEFENSIVE" ->
            "BY THE HEAVENS, #{speaker_name} HAS GONE MAD! SHIELDS UP! COVER THEIR REAR!"

          "SUPPORT" ->
            "WAIT—THE WARDS AREN'T READY! KEEP THEM ALIVE, PRAY TO THE DIVINE!"

          _ ->
            "HERE WE GO AGAIN! CHARGE BEFORE THEY GET SURROUNDED!"
        end

      audio_result =
        try do
          case SomaticVoice.speak(reaction, emotional: %{"anger" => 80, "fear" => 50}, somatic: %{"pain" => 10}, speaker: comp.name) do
            {:ok, res} -> res[:audio_url]
            _ -> nil
          end
        rescue
          _ -> nil
        end

      speech_payload = %{
        companion_id: comp.id,
        name: comp.name,
        icon: comp.icon || "⚔️",
        text: reaction,
        audio_url: audio_result,
        tactic: comp.tactic,
        speaker_type: :companion,
        is_battle_cry_reaction: true,
        timestamp: System.system_time(:second)
      }

      action_payload = %{
        companion_id: comp.id,
        companion_name: comp.name,
        icon: comp.icon || "⚔️",
        action_type: :frenetic_charge,
        action_name: "Frantic Heroic Overdrive",
        description: "#{comp.name} surges forward into the fray at maximum speed alongside #{speaker_name}!",
        target_name: speaker_name,
        buff: %{stat: "speed", value: 35, duration_seconds: 30},
        pos_shift: %{dx: 2, dy: -1, label: "Heroic Overdrive"},
        animation: "charge_dust",
        is_battle_cry: true,
        timestamp: System.system_time(:second)
      }

      TePhoenixWeb.Endpoint.broadcast("voice:party:#{party_id}", "companion_voice_spoke", speech_payload)
      TePhoenixWeb.Endpoint.broadcast("voice:party:#{party_id}", "companion_action_executed", action_payload)

      if map_id do
        TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "companion_action_fx", action_payload)
      end

      {:ok, speech_payload}
    else
      {:ok, :no_active_companions}
    end
  end

  # ── Helpers ───────────────────────────────────────────────────────

  defp get_party_companions(char_id) do
    try do
      case Repo.query(
        """
        SELECT cc.id, cc.tactics, n.name, n.icon
          FROM character_companions cc
          JOIN game_npcs n ON n.id = cc.npc_id
         WHERE cc.character_id = ? AND cc.is_active = 1
        """,
        [char_id]
      ) do
        {:ok, %{rows: rows}} when rows != [] ->
          Enum.map(rows, fn [id, tactics, name, icon] ->
            %{
              id: id,
              tactic: (tactics || "BALANCED") |> String.upcase(),
              name: name || "Companion",
              icon: icon || "🐾"
            }
          end)

        _ ->
          default_fallback_companions()
      end
    rescue
      _ ->
        default_fallback_companions()
    end
  end

  defp default_fallback_companions do
    [
      %{id: 1, tactic: "AGGRESSIVE", name: "Valerius the Paladin", icon: "🛡️"},
      %{id: 2, tactic: "SUPPORT", name: "Lyra the Moon Mage", icon: "🔮"}
    ]
  end

  defp generate_reaction_text(comp, input_text, is_thought, speaker_name) do
    down = String.downcase(input_text || "")
    prefix = if is_thought, do: "[Telepathic Link] ", else: ""

    text =
      cond do
        String.contains?(down, "boss") or String.contains?(down, "dragon") or String.contains?(down, "kill") or String.contains?(down, "burn") ->
          case comp.tactic do
            "AGGRESSIVE" -> "Target their weak point when they wind up! I'll draw their focus!"
            "DEFENSIVE" -> "Form a defensive perimeter around the spellcasters first!"
            "SUPPORT" -> "Save your strongest cooldowns until my barrier is anchored."
            _ -> "We take them down as one. Stick to the formation."
          end

        String.contains?(down, "heal") or String.contains?(down, "low") or String.contains?(down, "help") or String.contains?(down, "save") or String.contains?(down, "shield") ->
          case comp.tactic do
            "SUPPORT" -> "Hold on! Channelling mend wounds now—fall back toward me!"
            "DEFENSIVE" -> "Fall behind my shield! I will hold the line while you recover!"
            _ -> "Do not fall now! Break through their vanguard!"
          end

        String.contains?(down, "stealth") or String.contains?(down, "sneak") or String.contains?(down, "hide") or String.contains?(down, "quiet") ->
          case comp.tactic do
            "AGGRESSIVE" -> "I'll hold back my blade until they pass into our trap."
            "SUPPORT" -> "Dousing lights and casting muffling charms. Tread softly."
            _ -> "Cloaking steps now. Shadows envelop us."
          end

        String.contains?(down, "run") or String.contains?(down, "retreat") or String.contains?(down, "flee") ->
          case comp.tactic do
            "AGGRESSIVE" -> "Retreat?! We can crush them if we push harder!"
            "DEFENSIVE" -> "A fighting retreat! I'll secure the doorway while you evacuate!"
            _ -> "Good call. Live to fight another dawn."
          end

        true ->
          case comp.tactic do
            "AGGRESSIVE" -> "A bold stratagem, #{speaker_name}. Let's strike swiftly before they realize our numbers!"
            "DEFENSIVE" -> "I like the caution in your approach. Keep an eye on the high ground."
            "SUPPORT" -> "Agreed. I have warded our flanks for when the fight begins."
            _ -> "Count on me. I'll follow your lead into the fray."
          end
      end

    prefix <> text
  end

  defp synthesize_tactical_action(comp, input_text, speaker_name, is_thought) do
    down = String.downcase(input_text || "")

    cond do
      String.contains?(down, "heal") or String.contains?(down, "low") or String.contains?(down, "help") or String.contains?(down, "shield") or String.contains?(down, "protect") or String.contains?(down, "turtle") ->
        %{
          type: :defensive_ward,
          name: "Aegis Shield of Warding",
          new_tactic: "DEFENSIVE",
          description: "#{comp.name} steps between #{speaker_name} and incoming threats, anchoring an Aegis ward (+25 DEF).",
          buff: %{stat: "defense", value: 25, duration_seconds: 60},
          pos_shift: %{dx: -1, dy: 0, label: "Shield Intercept"},
          animation: "shield_ward"
        }

      String.contains?(down, "kill") or String.contains?(down, "boss") or String.contains?(down, "charge") or String.contains?(down, "burn") or String.contains?(down, "attack") or String.contains?(down, "flank") ->
        %{
          type: :offensive_charge,
          name: "Bloodrush Vanguard Surge",
          new_tactic: "AGGRESSIVE",
          description: "#{comp.name} unsheathes enchanted weapons and surges forward into flanking position (+20 ATK).",
          buff: %{stat: "attack", value: 20, duration_seconds: 60},
          pos_shift: %{dx: 1, dy: -1, label: "Flank Advance"},
          animation: "bloodrush"
        }

      String.contains?(down, "stealth") or String.contains?(down, "sneak") or String.contains?(down, "hide") or String.contains?(down, "quiet") or String.contains?(down, "ambush") ->
        %{
          type: :stealth_shroud,
          name: "Cloak of the Shadow Veil",
          new_tactic: "AMBUSH",
          description: "#{comp.name} activates smoke shrouds, dropping party detection footprint by 50%.",
          buff: %{stat: "stealth", value: 50, duration_seconds: 60},
          pos_shift: %{dx: -2, dy: 0, label: "Shadow Stalk"},
          animation: "smoke_shroud"
        }

      String.contains?(down, "run") or String.contains?(down, "retreat") or String.contains?(down, "flee") or String.contains?(down, "withdraw") ->
        %{
          type: :tactical_retreat,
          name: "Fighting Withdrawal Screen",
          new_tactic: "DEFENSIVE",
          description: "#{comp.name} drops defensive smoke and establishes a rearguard exit (+20 Speed).",
          buff: %{stat: "speed", value: 20, duration_seconds: 30},
          pos_shift: %{dx: -1, dy: 1, label: "Rearguard Screen"},
          animation: "wind_dash"
        }

      is_thought ->
        %{
          type: :telepathic_harmony,
          name: "Psionic Thought Resonance",
          new_tactic: comp.tactic || "SUPPORT",
          description: "#{comp.name} receives the silent psionic command from #{speaker_name} and adjusts posture unseen (+15 Focus).",
          buff: %{stat: "focus", value: 15, duration_seconds: 60},
          pos_shift: %{dx: 0, dy: 0, label: "Psionic Focus"},
          animation: "psionic_gleam"
        }

      true ->
        %{
          type: :tactical_alignment,
          name: "Combat Stance Alignment",
          new_tactic: comp.tactic || "BALANCED",
          description: "#{comp.name} locks into tactical readiness, matching stride with #{speaker_name}.",
          buff: %{stat: "all_stats", value: 5, duration_seconds: 60},
          pos_shift: %{dx: 0, dy: 0, label: "Combat Lock"},
          animation: "focus_gleam"
        }
    end
  end

  defp tactic_to_emotional_state("AGGRESSIVE"), do: {%{"anger" => 60, "confidence" => 80}, %{"pain" => 0}}
  defp tactic_to_emotional_state("DEFENSIVE"), do: {%{"fear" => 20, "confidence" => 70}, %{"pain" => 0}}
  defp tactic_to_emotional_state("SUPPORT"), do: {%{"stress" => 30, "confidence" => 60}, %{"pain" => 0}}
  defp tactic_to_emotional_state("AMBUSH"), do: {%{"confidence" => 75}, %{}}
  defp tactic_to_emotional_state(_), do: {%{"confidence" => 50}, %{}}
end
