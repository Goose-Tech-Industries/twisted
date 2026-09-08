defmodule TePhoenix.World.NpcAcousticReactor do
  @moduledoc """
  Acoustic Perception & World NPC Reactivity Engine (*An t-Éisteoir*).

  Enables world NPCs, townspeople, merchants, sentries, and dungeon bosses to
  **physically hear and react** to players' spoken plans, shouts, telepathic thoughts, and footsteps:
    * ARC Raiders Proximity Model: In 'proximity', 'whisper', or 'shout' modes, sound propagates
      spatially. In 'party' mode, communication is 100% private and cannot be overheard.
    * Footstep Locomotion Acoustics: Tile surfaces (stone, wood, water, grass, metal) and movement
      stances (stealth, walk, sprint) emit realistic decibels that alert sentries and awaken sleeping denizens.
    * Non-Hostile Dynamic Reactivity:
      - Tavern bards compose ballads and grant Bardic Inspiration (+20% Morale).
      - Priests grant Hearth Blessings (+20 HP/MP Regen) upon hearing cries of pain or prayer.
      - Merchants pitch wares and grant trade discount buffs upon hearing purchase intentions.
      - Beggars and street urchins offer hidden clues and rumors in exchange for alms.
      - Scholars guide players on ancient oghams and grant Arcane Attunement buffs.
    * Nocturnal Denizens & Sleeping Diurnal Denizens:
      - At night, nocturnal fences, smugglers, shadow prowlers, and night watchmen awaken.
      - Sleeping diurnal townspeople are startled awake by loud commotions and footsteps.
      - Telepathic thoughts bleed into sleeping NPCs' minds via DreamCycle subconscious interception.
    * Sovereign Soul Conscious Mind:
      - If registered in Sovereign Soul Engine, conscious souls process acoustic overhear events
        with genuine psychological tells and living voice speech.
  """

  alias TePhoenix.Repo
  alias TePhoenix.World.{AcousticPhysics, CircadianClock}
  alias TePhoenix.AI.{DreamCycle, SovereignBridge}
  alias TePhoenix.AI.Providers.SomaticVoice
  require Logger

  @doc """
  Processes an acoustic voice event occurring in voice chat or on a map.
  Supports transmission modes: 'party' (private), 'whisper' (4 tiles), 'proximity' (16 tiles), 'shout' (32 tiles).
  """
  def process_acoustic_event(party_id, char_id, speaker_name, text, is_thought, map_id, coords \\ nil, mode \\ "proximity") do
    mode_str = String.downcase(to_string(mode || "proximity"))

    # 1. Privacy enforcement: If talking in private party mode, enemies & NPCs CANNOT overhear!
    if mode_str == "party" and not is_thought do
      {:ok, :party_private_encrypted}
    else
      {px, py, map_id} = resolve_player_coordinates(char_id, map_id, coords)
      is_battle_cry = String.contains?(String.upcase(text || ""), "LEEROY")

      time_of_day = CircadianClock.current_time_of_day(map_id)
      is_night = CircadianClock.night?(time_of_day)

      base_radius =
        cond do
          is_battle_cry -> 32
          is_thought -> 10
          true -> AcousticPhysics.max_hearing_radius(mode_str)
        end

      # Sound travels 1.5x further in cool night air
      listening_radius = if is_night, do: round(base_radius * 1.5), else: base_radius

      nearby_npcs = find_npcs_in_range(map_id, px, py, listening_radius, is_thought)

      if nearby_npcs != [] do
        # Select the most perceptive or closest nearby NPC
        npc = Enum.min_by(nearby_npcs, & &1.distance)

        {reply_text, action} =
          generate_npc_reaction_and_action(npc, text, is_thought, is_battle_cry, speaker_name, px, py, mode_str, time_of_day, char_id)

        # 2. Execute physical world updates for the NPC
        execute_npc_action(npc, action, map_id, px, py)

        # 3. Subconscious Memory Imprinting: save into npc_memories for future dialogue and gossip
        imprint_overheard_memory(npc.name, char_id, speaker_name, text)

        # 4. Synthesize spoken voice audio with 3D spatial positioning
        spatial = AcousticPhysics.calculate_spatial_audio(%{x: npc.x, y: npc.y}, %{x: px, y: py}, mode_str, map_id)

        audio_result =
          try do
            case SomaticVoice.speak(reply_text, emotional: action[:emotional] || %{}, somatic: action[:somatic] || %{}, speaker: npc.name) do
              {:ok, res} -> res[:audio_url]
              _ -> nil
            end
          rescue
            _ -> nil
          end

        speech_payload = %{
          npc_id: npc.id,
          name: npc.name,
          icon: npc.icon || "👤",
          role: npc.role,
          text: reply_text,
          audio_url: audio_result,
          distance_tiles: npc.distance,
          is_thought_intercept: is_thought,
          is_enemy: npc.is_enemy || npc.is_hostile,
          is_nocturnal: npc.is_nocturnal,
          is_sleeping: npc.is_sleeping,
          spatial: spatial,
          timestamp: System.system_time(:second)
        }

        action_payload = %{
          npc_id: npc.id,
          npc_name: npc.name,
          icon: npc.icon || "👤",
          action_type: action.type,
          action_name: action.name,
          description: action.description,
          target_name: speaker_name,
          distance_tiles: npc.distance,
          buff: action[:buff],
          new_coords: action[:new_coords],
          alarm_triggered: action[:alarm_triggered] || false,
          is_thought_intercept: is_thought,
          is_awakened: action[:is_awakened] || false,
          spatial: spatial,
          timestamp: System.system_time(:second)
        }

        # 5. Broadcast to party voice room
        TePhoenixWeb.Endpoint.broadcast("voice:party:#{party_id}", "npc_overheard_reaction", speech_payload)
        TePhoenixWeb.Endpoint.broadcast("voice:party:#{party_id}", "npc_action_executed", action_payload)

        # 6. Broadcast onto proximity voice channel and map channel
        TePhoenixWeb.Endpoint.broadcast("voice:proximity:#{map_id}", "npc_spatial_voice", speech_payload)
        TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "npc_chatter", %{
          npc_id: npc.id,
          name: npc.name,
          line: reply_text
        })
        TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "npc_action_fx", action_payload)

        {:ok, %{npc: npc, speech: speech_payload, action: action_payload}}
      else
        {:ok, :no_npcs_in_earshot}
      end
    end
  end

  @doc """
  Processes an acoustic footstep event when a player moves across a surface.
  Supports surface types (:stone, :wood, :water, :grass, :dirt, :metal) and stances (:walk, :sprint, :stealth).
  """
  def process_footstep_event(char_id, player_name, coords, surface, stance \\ :walk, map_id \\ 1, time_of_day \\ nil) do
    time_of_day = time_of_day || CircadianClock.current_time_of_day(map_id)
    footstep = AcousticPhysics.calculate_footstep(surface, stance, coords, time_of_day)

    {px, py, map_id} = resolve_player_coordinates(char_id, map_id, coords)
    nearby_npcs = find_npcs_in_range(map_id, px, py, footstep.radius, false)

    # 1. Check if any sleeping NPC is startled awake or if sentry is alerted
    Enum.each(nearby_npcs, fn npc ->
      cond do
        # Belligerent Drunk outside tavern startled / bumped by footsteps
        npc.role in ["drunk", "brawler", "drunkard"] and npc.distance <= 2 ->
          provoke_drunk_by_footstep(npc, map_id, player_name, footstep, px, py, char_id)

        # Sleeping NPC awakened through window if stepping loudly right outside window
        npc.is_sleeping and footstep.can_awaken and AcousticPhysics.window_portal?(px, py, map_id) ->
          win = AcousticPhysics.find_window(px, py, map_id)
          win_state = if win, do: (win[:state] || "closed"), else: "closed"
          if win_state in ["open", "cracked", "broken"] or footstep.stance == :sprint do
            awaken_npc_via_window(npc, map_id, player_name, footstep)
          else
            :ok
          end

        # Sleeping NPC awakened by loud footstep
        npc.is_sleeping and footstep.can_awaken and npc.distance <= footstep.radius ->
          awaken_npc(npc, map_id, player_name, footstep)

        # Hostile Sentry or Predator hears running / loud footsteps
        (npc.is_hostile or npc.is_enemy) and footstep.stance == :sprint and not npc.is_sleeping ->
          alert_sentry_to_footsteps(npc, map_id, player_name, footstep, px, py)

        # Nocturnal Smuggler welcomes stealth or scolds sprinting
        npc.is_nocturnal and not npc.is_sleeping ->
          react_nocturnal_footsteps(npc, map_id, player_name, footstep)

        true ->
          :ok
      end
    end)

    # 2. Broadcast footstep acoustic event to proximity and map channels for 3D spatial playback
    footstep_payload = %{
      char_id: char_id,
      player_name: player_name,
      surface: footstep.surface,
      surface_name: footstep.surface_name,
      stance: footstep.stance,
      decibels: footstep.decibels,
      radius: footstep.radius,
      coords: %{x: px, y: py, map_id: map_id},
      timestamp: System.system_time(:second)
    }

    TePhoenixWeb.Endpoint.broadcast("voice:proximity:#{map_id}", "player_footstep", footstep_payload)
    TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "player_footstep_fx", footstep_payload)

    {:ok, footstep_payload}
  end

  # ── Footstep Reactivity Helpers ────────────────────────────────────

  defp awaken_npc(npc, map_id, player_name, footstep) do
    try do
      Repo.query("UPDATE game_npcs SET is_sleeping = 0 WHERE id = ?", [npc.id])
    rescue
      _ -> :ok
    end

    reaction_text =
      if npc.role in ["guard", "watchman"] do
        "Halt! Who goes stomping across the #{footstep.surface_name}?! Identify yourself to the Night Watch!"
      else
        "Gah! Who is running around like a frantic boar at this hour?! Have some courtesy for the sleeping!"
      end

    action_payload = %{
      npc_id: npc.id,
      npc_name: npc.name,
      icon: npc.icon || "👤",
      action_type: :startled_awake,
      action_name: "Startled Awakening",
      description: "#{npc.name} was startled awake by #{player_name}'s #{footstep.stance} footsteps on #{footstep.surface_name} and lit a candle!",
      is_awakened: true,
      alarm_triggered: npc.role in ["guard", "watchman"],
      timestamp: System.system_time(:second)
    }

    TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "npc_awakened", action_payload)
    TePhoenixWeb.Endpoint.broadcast("voice:proximity:#{map_id}", "npc_spatial_voice", %{
      npc_id: npc.id,
      name: npc.name,
      icon: npc.icon || "👤",
      text: reaction_text,
      timestamp: System.system_time(:second)
    })
  end

  defp provoke_drunk_by_footstep(npc, map_id, player_name, footstep, px, py, char_id) do
    insult = Enum.random(["clodhopper", "oaf", "two-left-footed donkey", "clumsy lout"])
    text = "Hic! Watch where you're stomping, #{player_name}! You almost kicked over my tankard, you #{insult}! Put 'em up!"

    action_payload = %{
      npc_id: npc.id,
      npc_name: npc.name,
      icon: npc.icon || "🍺",
      action_type: :drunk_altercation,
      action_name: "Drunk Argument Started",
      description: "#{npc.name} stumbled into #{player_name} after hearing heavy #{footstep.stance} footsteps on #{footstep.surface_name}, slurring angrily!",
      player_name: player_name,
      char_id: char_id,
      text: text,
      available_approaches: [:buy_drink, :persuasion, :intimidation, :bribe, :deception],
      new_coords: %{x: px, y: py},
      timestamp: System.system_time(:second)
    }

    TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "drunk_confrontation", action_payload)
    TePhoenixWeb.Endpoint.broadcast("voice:proximity:#{map_id}", "npc_spatial_voice", %{
      npc_id: npc.id,
      name: npc.name,
      icon: npc.icon || "🍺",
      text: text,
      timestamp: System.system_time(:second)
    })
  end

  defp awaken_npc_via_window(npc, map_id, player_name, footstep) do
    try do
      Repo.query("UPDATE game_npcs SET is_sleeping = 0 WHERE id = ?", [npc.id])
    rescue
      _ -> :ok
    end

    reaction_text = "Who goes stomping right outside my window?! Begone, #{player_name}, before I summon the Night Watch!"

    action_payload = %{
      npc_id: npc.id,
      npc_name: npc.name,
      icon: npc.icon || "🪟",
      action_type: :window_awakened,
      action_name: "Window Disturbance",
      description: "#{npc.name} was startled awake by #{player_name}'s #{footstep.stance} footsteps right outside the window!",
      is_awakened: true,
      through_window: true,
      timestamp: System.system_time(:second)
    }

    TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "npc_awakened", action_payload)
    TePhoenixWeb.Endpoint.broadcast("voice:proximity:#{map_id}", "npc_spatial_voice", %{
      npc_id: npc.id,
      name: npc.name,
      icon: npc.icon || "🪟",
      text: reaction_text,
      timestamp: System.system_time(:second)
    })
  end

  defp alert_sentry_to_footsteps(npc, map_id, _player_name, footstep, px, py) do
    action_payload = %{
      npc_id: npc.id,
      npc_name: npc.name,
      icon: npc.icon || "👹",
      action_type: :sentry_footstep_investigate,
      action_name: "Footstep Investigation",
      description: "#{npc.name} heard heavy #{footstep.stance} on the #{footstep.surface_name}! Turning to investigate (#{px}, #{py})!",
      alarm_triggered: true,
      new_coords: intercept_step(npc.x, npc.y, px, py),
      timestamp: System.system_time(:second)
    }

    TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "npc_action_fx", action_payload)
  end

  defp react_nocturnal_footsteps(npc, map_id, player_name, footstep) do
    if footstep.stance == :stealth do
      TePhoenixWeb.Endpoint.broadcast("voice:proximity:#{map_id}", "npc_spatial_voice", %{
        npc_id: npc.id,
        name: npc.name,
        icon: npc.icon || "🗝️",
        text: "Impressive tread, #{player_name}... you move like smoke. Step closer to the alley.",
        timestamp: System.system_time(:second)
      })
    end
  end

  # ── Subconscious Memory Imprinting ────────────────────────────────

  defp imprint_overheard_memory(npc_name, char_id, speaker_name, text) do
    try do
      case Repo.query("SELECT facts_json, reputation FROM npc_memories WHERE char_id = ? AND npc_name = ? LIMIT 1", [char_id, npc_name]) do
        {:ok, %{rows: [[facts_json, _rep]]}} ->
          facts =
            case Jason.decode(facts_json || "[]") do
              {:ok, list} when is_list(list) -> list
              _ -> []
            end

          clean_text = text |> to_string() |> String.slice(0, 100)
          new_fact = "Overheard #{speaker_name} saying: \"#{clean_text}\""
          updated_facts = ([new_fact] ++ facts) |> Enum.take(10)

          Repo.query(
            "UPDATE npc_memories SET facts_json = ?, last_seen = NOW() WHERE char_id = ? AND npc_name = ?",
            [Jason.encode!(updated_facts), char_id, npc_name]
          )

        _ ->
          clean_text = text |> to_string() |> String.slice(0, 100)
          facts = ["Overheard #{speaker_name} saying: \"#{clean_text}\""]

          Repo.query(
            "INSERT INTO npc_memories (char_id, npc_name, facts_json, reputation) VALUES (?, ?, ?, 0)",
            [char_id, npc_name, Jason.encode!(facts)]
          )
      end
    rescue
      _ -> :ok
    end
  end

  # ── Location & Acoustic Queries ───────────────────────────────────

  defp resolve_player_coordinates(char_id, map_id, coords) do
    cond do
      is_map(coords) && coords[:x] && coords[:y] ->
        {coords.x, coords.y, coords[:map_id] || map_id || 1}

      true ->
        case TePhoenix.Game.PlayerRegistry.get(char_id) do
          %{x: x, y: y, map_id: m_id} ->
            {x, y, m_id || map_id || 1}

          _ ->
            case Repo.query("SELECT map_id, x, y FROM characters WHERE id = ? LIMIT 1", [char_id]) do
              {:ok, %{rows: [[m_id, x, y]]}} ->
                {x || 10, y || 10, m_id || map_id || 1}

              _ ->
                {10, 10, map_id || 1}
            end
        end
    end
  end

  defp find_npcs_in_range(map_id, px, py, max_radius, is_thought) do
    try do
      case Repo.query(
        """
        SELECT id, name, persona, role, faction, is_enemy, is_hostile, x, y, icon, sovereign_soul_id, is_nocturnal, is_sleeping
          FROM game_npcs
         WHERE map_id = ?
         LIMIT 50
        """,
        [map_id]
      ) do
        {:ok, %{rows: rows}} ->
          rows
          |> Enum.map(fn [id, name, persona, role, faction, is_enemy, is_hostile, x, y, icon, soul_id, is_nocturnal, is_sleeping] ->
            nx = x || 10
            ny = y || 10
            dist = abs(nx - px) + abs(ny - py)

            %{
              id: id,
              name: name || "Denizen",
              persona: persona || "",
              role: role || "villager",
              faction: faction || "neutral",
              is_enemy: is_enemy == 1 or is_enemy == true,
              is_hostile: is_hostile == 1 or is_hostile == true or role == "boss",
              is_nocturnal: is_nocturnal == 1 or is_nocturnal == true,
              is_sleeping: is_sleeping == 1 or is_sleeping == true,
              map_id: map_id,
              x: nx,
              y: ny,
              icon: icon || "👤",
              soul_id: soul_id,
              distance: dist
            }
          end)
          |> Enum.filter(fn npc ->
            within_dist = npc.distance <= max_radius

            if is_thought do
              within_dist and (is_psionic_npc?(npc) or npc.is_sleeping)
            else
              within_dist
            end
          end)

        _ ->
          []
      end
    rescue
      _ -> []
    end
  end

  defp is_psionic_npc?(npc) do
    npc.soul_id != nil or
      npc.role in ["boss", "mage", "seer", "witch", "cultist", "lich", "dragon", "scholar"] or
      String.contains?(String.downcase(npc.persona || ""), ["telepath", "mind", "psionic", "seer", "magic", "witch", "soul"])
  end

  # ── Reaction & Action Formulation ──────────────────────────────────

  defp generate_npc_reaction_and_action(npc, text, is_thought, is_battle_cry, speaker_name, px, py, mode, time_of_day, char_id) do
    down = String.downcase(text || "")
    is_hostile = npc.is_hostile or npc.is_enemy
    is_night = CircadianClock.night?(time_of_day)
    npc_map_id = npc[:map_id] || 1
    window = AcousticPhysics.find_window(px, py, npc_map_id) || AcousticPhysics.find_window(npc.x, npc.y, npc_map_id)
    is_through_window = not is_nil(window)
    window_state = if window, do: (window[:state] || "open"), else: "none"

    # Acoustic transmission filter based on window state
    window_penetrates =
      case window_state do
        "open" -> true
        "broken" -> true
        "cracked" -> mode != "whisper"
        "closed" -> mode in ["shout", "normal"] or is_battle_cry
        "shuttered" -> mode == "shout" or is_battle_cry
        _ -> true
      end

    cond do
      # ── 1. Belligerent Tavern Drunk Outside ──
      npc.role in ["drunk", "brawler", "drunkard"] ->
        handle_drunk_reaction(npc, down, speaker_name, px, py, char_id, npc_map_id)

      # ── 2. Window Portal Acoustic Bleed: Sleeping Resident ──
      npc.is_sleeping and is_through_window and window_penetrates ->
        handle_window_sleeping_reaction(npc, speaker_name)

      # ── 3. Window Portal Acoustic Bleed: Tavern Bard ──
      is_through_window and window_penetrates and npc.role in ["bard", "minstrel", "skald"] ->
        handle_bard_window_reaction(npc, down, speaker_name)

      # ── 4. Sleeping NPC Reactions (General) ──
      npc.is_sleeping ->
        handle_sleeping_npc_reaction(npc, text, is_thought, speaker_name, mode)

      # ── 5. Battle Cry ("LEEROY JENKINS!") ──
      is_battle_cry ->
        handle_battle_cry_reaction(npc, is_hostile, speaker_name, px, py)

      # ── 6. Psionic Thought Intercepted ──
      is_thought ->
        handle_psionic_thought_reaction(npc, speaker_name)

      # ── 7. Sovereign Soul Conscious Mind ──
      npc.soul_id != nil ->
        handle_sovereign_soul_reaction(npc, text, speaker_name, char_id, px, py)

      # ── 8. Hostile Sentry Overhearing Ambush/Attack ──
      is_hostile and (String.contains?(down, ["kill", "attack", "ambush", "boss", "flank", "strike"])) ->
        handle_hostile_ambush_reaction(npc, px, py)

      # ── 9. Non-Hostile: Tavern Bard / Minstrel ──
      npc.role in ["bard", "minstrel", "skald"] ->
        handle_bard_reaction(npc, down, speaker_name)

      # ── 10. Non-Hostile: Priest / Cleric / Healer ──
      npc.role in ["priest", "cleric", "healer", "druid", "shaman"] ->
        handle_priest_reaction(npc, down, speaker_name)

      # ── 11. Non-Hostile: Merchant / Shopkeeper ──
      npc.role in ["merchant", "shopkeeper", "trader", "vendor"] or String.contains?(String.downcase(npc.name), "shop") ->
        handle_merchant_reaction(npc, down, speaker_name)

      # ── 12. Non-Hostile: Beggar / Street Urchin / Informant ──
      npc.role in ["beggar", "urchin", "informant", "vagrant"] ->
        handle_beggar_reaction(npc, down, speaker_name)

      # ── 13. Non-Hostile: Scholar / Alchemist / Sage ──
      npc.role in ["scholar", "alchemist", "sage", "wizard", "scribe"] ->
        handle_scholar_reaction(npc, down, speaker_name)

      # ── 14. Nocturnal Smuggler / Shadow Fence ──
      npc.is_nocturnal or npc.role in ["smuggler", "fence", "thief"] ->
        handle_nocturnal_fence_reaction(npc, speaker_name, is_night)

      # ── 15. Town Watchman / Guard ──
      npc.role in ["guard", "watchman", "patrol", "soldier"] ->
        handle_guard_reaction(npc, speaker_name, is_night, mode, px, py)

      # ── 16. Default Town Civilian / Villager ──
      true ->
        handle_civilian_reaction(npc, speaker_name)
    end
  end

  # ── Reaction Handlers ─────────────────────────────────────────────

  defp handle_sleeping_npc_reaction(npc, _text, is_thought, speaker_name, mode) do
    if is_thought do
      # Telepathic thought bleeds into subconscious dream state
      reply = "[Dream Murmur] ...#{speaker_name}... the ancient bell chimes in the lake of memories..."
      action = %{
        type: :dream_murmur,
        name: "Subconscious Dream Intercept",
        description: "#{npc.name} murmured in their sleep as #{speaker_name}'s telepathic thought echoed in their dream.",
        alarm_triggered: false,
        is_awakened: false,
        emotional: %{"curiosity" => 60},
        somatic: %{}
      }
      {reply, action}
    else
      # Loud shouting or proximity comms startle the sleeper awake
      if mode in ["shout", "proximity"] do
        try do
          Repo.query("UPDATE game_npcs SET is_sleeping = 0 WHERE id = ?", [npc.id])
        rescue
          _ -> :ok
        end

        reply = "Gah! Who in the blazes is screaming?! Have you no decency waking folk at this hour?!"
        action = %{
          type: :awakened,
          name: "Startled Awakening",
          description: "#{npc.name} was startled awake by #{speaker_name}'s shouting and lit a guttering candle!",
          alarm_triggered: false,
          is_awakened: true,
          emotional: %{"anger" => 80},
          somatic: %{}
        }
        {reply, action}
      else
        reply = "[Soft Snore] Zzz... just the wind on the eaves..."
        action = %{
          type: :light_sleep,
          name: "Restless Slumber",
          description: "#{npc.name} stirred in their sleep but remained dreaming.",
          alarm_triggered: false,
          is_awakened: false
        }
        {reply, action}
      end
    end
  end

  defp handle_battle_cry_reaction(npc, is_hostile, speaker_name, px, py) do
    reply =
      if is_hostile do
        "WHAT IN THE OBLIVION WAS THAT?! WARRIORS TO ARMS! THEY'RE CHARGING THE GATE!"
      else
        "By the Divines, #{speaker_name} is screaming like a berserker into battle! Clear the street!"
      end

    action = %{
      type: :alarm_reinforcements,
      name: "War Horn & Defensive Scramble",
      description: "#{npc.name} sounded the war horn! Denizens scramble to intercept (#{px}, #{py})!",
      alarm_triggered: true,
      buff: %{stat: "defense", value: 30, duration_seconds: 45},
      new_coords: intercept_step(npc.x, npc.y, px, py),
      emotional: %{"anger" => 90, "fear" => 70},
      somatic: %{"pain" => 0}
    }
    {reply, action}
  end

  defp handle_psionic_thought_reaction(npc, speaker_name) do
    reply = "[Psionic Echo] I feel your thoughts rippling across the aether, #{speaker_name}. Did you truly believe your mind was unobserved?"
    action = %{
      type: :psionic_counter_ward,
      name: "Eldritch Mind Ward",
      description: "#{npc.name} intercepted your telepathic scheme, erecting a psychic barrier.",
      alarm_triggered: false,
      buff: %{stat: "magic_def", value: 35, duration_seconds: 60},
      new_coords: %{x: npc.x, y: npc.y},
      emotional: %{"confidence" => 85},
      somatic: %{}
    }
    {reply, action}
  end

  defp handle_sovereign_soul_reaction(npc, text, speaker_name, char_id, px, py) do
    prompt = "[Acoustic Perception at #{npc.distance} tiles]: #{text}"
    case SovereignBridge.talk(npc.soul_id, char_id, speaker_name, prompt) do
      {:ok, sse_res} ->
        reply = sse_res.reply || "I hear your voice, #{speaker_name}."
        action = %{
          type: :sovereign_conscious_reply,
          name: "Conscious Soul Reaction",
          description: "#{npc.name} #{sse_res.tell || "listened with keen psychological awareness"}.",
          buff: nil,
          new_coords: %{x: npc.x, y: npc.y},
          emotional: %{"trust" => 65}
        }
        {reply, action}

      _ ->
        handle_civilian_reaction(npc, speaker_name)
    end
  end

  defp handle_hostile_ambush_reaction(npc, px, py) do
    reply = "Did you hear that?! The intruders are whispering about an attack! Form a shield wall!"
    action = %{
      type: :hostile_intercept,
      name: "Defensive Barricade & Intercept",
      description: "#{npc.name} overheard your tactical plan! Raising shields (+30% DEF) and shifting position to intercept!",
      alarm_triggered: true,
      buff: %{stat: "defense", value: 30, duration_seconds: 60},
      new_coords: intercept_step(npc.x, npc.y, px, py),
      emotional: %{"anger" => 80, "confidence" => 70},
      somatic: %{}
    }
    {reply, action}
  end

  defp handle_drunk_reaction(npc, _down, speaker_name, px, py, char_id, map_id) do
    insult = Enum.random(["swine-herder", "milk-drinker", "gutter-snipe", "feather-brain", "city-slicker"])
    reply = "Hic! Who you callin' a #{insult}, #{speaker_name}?! You think you can stand outside the Prancing Mare and look at me crooked?! Put up your fists or buy me a flagon of mead!"

    action = %{
      type: :drunk_altercation,
      name: "Drunk Argument Started",
      description: "#{npc.name} stumbled forward clutching a half-empty mug, challenging #{speaker_name} to a tavern brawl!",
      alarm_triggered: true,
      confrontation: true,
      target_char_id: npc.id,
      target_name: npc.name,
      available_approaches: [:buy_drink, :persuasion, :intimidation, :bribe, :deception],
      new_coords: %{x: px, y: py},
      emotional: %{"anger" => 75, "inebriation" => 95}
    }

    TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "drunk_confrontation", %{
      npc_id: npc.id,
      npc_name: npc.name,
      icon: npc.icon || "🍺",
      text: reply,
      player_name: speaker_name,
      char_id: char_id,
      available_approaches: [:buy_drink, :persuasion, :intimidation, :bribe, :deception],
      timestamp: System.system_time(:second)
    })

    {reply, action}
  end

  defp handle_bard_window_reaction(npc, down, speaker_name) do
    reply = "Hark! The breeze carries words through the tavern window... #{speaker_name} speaks of #{down}! Let the strings of my lute roar with a grand chorus for tonight's ballad!"
    action = %{
      type: :bardic_window_inspiration,
      name: "Window Ballad Overhear",
      description: "#{npc.name} overheard #{speaker_name} through the tavern window and composed a verse (+20% Morale)!",
      alarm_triggered: false,
      through_window: true,
      buff: %{stat: "morale", value: 20, duration_seconds: 120},
      emotional: %{"joy" => 90, "inspiration" => 95}
    }
    {reply, action}
  end

  defp handle_window_sleeping_reaction(npc, speaker_name) do
    reply = "Gah! Who's whispering right outside my bedroom window?! Away with you, #{speaker_name}, or I'll dump cold washwater on your head!"
    action = %{
      type: :window_disturbance,
      name: "Window Disturbance",
      description: "#{npc.name} awoke irritated by voices drifting through the window.",
      alarm_triggered: false,
      through_window: true,
      is_awakened: true,
      emotional: %{"anger" => 60, "tired" => 80}
    }
    {reply, action}
  end

  defp handle_bard_reaction(npc, down, speaker_name) do
    if String.contains?(down, ["fight", "kill", "charge", "glory", "slay", "dungeon", "dragon", "honor"]) do
      reply = "Hark! #{speaker_name} speaks of valor! Let the strings of my lute roar with the Ballad of the Ashveil!"
      action = %{
        type: :bardic_inspiration,
        name: "Bardic Inspiration",
        description: "#{npc.name} struck a soaring chord on the lute, granting Bardic Inspiration (+20% Morale/Crit)!",
        alarm_triggered: false,
        buff: %{stat: "morale", value: 20, duration_seconds: 90},
        emotional: %{"joy" => 85, "confidence" => 80}
      }
      {reply, action}
    else
      reply = "Sing on, wanderer! Every whispered scheme on these stones makes for a grand tavern song!"
      action = %{
        type: :bard_listening,
        name: "Minstrel Ear",
        description: "#{npc.name} leaned back against the counter, jotting down notes for a ballad.",
        alarm_triggered: false
      }
      {reply, action}
    end
  end

  defp handle_priest_reaction(npc, down, speaker_name) do
    if String.contains?(down, ["hurt", "pain", "heal", "help", "dying", "bleed", "wound", "pray", "mercy"]) do
      reply = "Peace to your spirit, #{speaker_name}. The Sacred Hearth shall mend what is broken."
      action = %{
        type: :hearth_blessing,
        name: "Blessing of the Hearth",
        description: "#{npc.name} raised their talisman, granting a soothing regeneration blessing (+20 HP/MP Regen)!",
        alarm_triggered: false,
        buff: %{stat: "hp_regen", value: 20, duration_seconds: 60},
        emotional: %{"compassion" => 90}
      }
      {reply, action}
    else
      reply = "May the Divines steady your steps on these dangerous roads, #{speaker_name}."
      action = %{
        type: :priest_blessing,
        name: "Quiet Benediction",
        description: "#{npc.name} bowed their head in silent prayer for your party.",
        alarm_triggered: false
      }
      {reply, action}
    end
  end

  defp handle_merchant_reaction(npc, down, speaker_name) do
    cond do
      String.contains?(down, ["steal", "rob", "thief", "gold", "pickpocket", "break in"]) ->
        reply = "Thieves! I have sharp ears, wanderers! The strongbox is bolted and the city watch is summoned!"
        action = %{
          type: :lock_shop,
          name: "Merchant Lockdown",
          description: "#{npc.name} locked their inventory vault and raised prices (+50%).",
          alarm_triggered: true,
          buff: %{stat: "trade_cost_mult", value: 1.5, duration_seconds: 120},
          new_coords: %{x: npc.x, y: npc.y},
          emotional: %{"fear" => 75, "anger" => 60}
        }
        {reply, action}

      String.contains?(down, ["buy", "sell", "potion", "sword", "gear", "trade", "armor", "shield", "supplies"]) ->
        reply = "Looking for tempered steel and restorative draughts, #{speaker_name}? Step right up, I'll knock 15% off for silver-tongued adventurers!"
        action = %{
          type: :merchant_discount,
          name: "Merchant Patronage",
          description: "#{npc.name} overheard your purchasing plans and offered a 15% merchant discount!",
          alarm_triggered: false,
          buff: %{stat: "trade_discount", value: 15, duration_seconds: 120},
          emotional: %{"greed" => 70, "joy" => 60}
        }
        {reply, action}

      true ->
        reply = "Fine wares from all corners of the realm! Step inside before the dust settles!"
        action = %{
          type: :merchant_pitch,
          name: "Shopkeeper Pitch",
          description: "#{npc.name} gestured toward the display counter.",
          alarm_triggered: false
        }
        {reply, action}
    end
  end

  defp handle_beggar_reaction(npc, down, speaker_name) do
    if String.contains?(down, ["gold", "treasure", "boss", "dungeon", "loot", "key", "secret", "vault"]) do
      reply = "Psst! You speak of riches, #{speaker_name}! Toss a shiny copper to poor #{npc.name} and I'll tell you which sewer grate leads straight to the vault..."
      action = %{
        type: :beggar_secret,
        name: "Alley Secret Clue",
        description: "#{npc.name} winked and held out a grime-stained palm, offering a dungeon bypass rumor!",
        alarm_triggered: false,
        buff: %{stat: "luck", value: 10, duration_seconds: 90}
      }
      {reply, action}
    else
      reply = "Spare a copper for an old wanderer? Even a warm loaf of bread would ease the winter chill..."
      action = %{
        type: :beggar_alms,
        name: "Alms Appeal",
        description: "#{npc.name} rattled an empty clay bowl as you passed.",
        alarm_triggered: false
      }
      {reply, action}
    end
  end

  defp handle_scholar_reaction(npc, down, speaker_name) do
    if String.contains?(down, ["magic", "rune", "ogham", "artifact", "ruin", "spell", "arcane", "portal"]) do
      reply = "Fascinating resonance, #{speaker_name}... your words carry the ancient cadence. Let me attune your senses to the arcane currents."
      action = %{
        type: :arcane_lore,
        name: "Arcane Attunement",
        description: "#{npc.name} traced a glowing glyph in the air, granting Arcane Attunement (+25 Magic Power)!",
        alarm_triggered: false,
        buff: %{stat: "magic_atk", value: 25, duration_seconds: 90},
        emotional: %{"curiosity" => 90}
      }
      {reply, action}
    else
      reply = "Mind your step near the old archives. Some texts bite back when disturbed."
      action = %{
        type: :scholar_counsel,
        name: "Scholarly Counsel",
        description: "#{npc.name} adjusted their spectacles and returned to an illuminated scroll.",
        alarm_triggered: false
      }
      {reply, action}
    end
  end

  defp handle_nocturnal_fence_reaction(npc, speaker_name, is_night) do
    if is_night do
      reply = "Keep it low, #{speaker_name}. The shadows have ears, but so do I. What contraband do you seek under the moonlight?"
      action = %{
        type: :midnight_blackmarket,
        name: "Moonlight Black Market",
        description: "#{npc.name} unlatched a hidden compartment in the alley brickwork, revealing rare nocturnal wares.",
        alarm_triggered: false,
        buff: %{stat: "stealth", value: 15, duration_seconds: 120}
      }
      {reply, action}
    else
      reply = "I'm just a simple cobbler by day, traveler. Come back after dusk if you know the knock."
      action = %{
        type: :daytime_disguise,
        name: "Innocent Cover",
        description: "#{npc.name} tapped a hammer against an old boot, ignoring inquiries.",
        alarm_triggered: false
      }
      {reply, action}
    end
  end

  defp handle_guard_reaction(npc, speaker_name, is_night, mode, px, py) do
    if is_night do
      if mode == "shout" do
        reply = "Halt! Disturbing the peace during curfew, #{speaker_name}?! The Night Watch is investigating!"
        action = %{
          type: :curfew_enforcement,
          name: "Night Watch Intercept",
          description: "#{npc.name} raised a glowing lantern and marched toward your shouting coordinates (#{px}, #{py})!",
          alarm_triggered: true,
          new_coords: intercept_step(npc.x, npc.y, px, py)
        }
        {reply, action}
      else
        reply = "Curfew is in effect, citizen. Keep your lantern lit and your blades sheathed."
        action = %{
          type: :curfew_patrol,
          name: "Curfew Watch",
          description: "#{npc.name} nodded solemnly as their lantern cast long shadows on the cobbles.",
          alarm_triggered: false
        }
        {reply, action}
      end
    else
      reply = "Keep moving, citizen #{speaker_name}. The Watch sees all on these stones."
      action = %{
        type: :guard_patrol,
        name: "Daylight Patrol",
        description: "#{npc.name} adjusted their halberd and kept watch.",
        alarm_triggered: false
      }
      {reply, action}
    end
  end

  defp handle_civilian_reaction(npc, speaker_name) do
    reply = "Greetings, #{speaker_name}. The air feels restless today, keep your wits about you."
    action = %{
      type: :civilian_greeting,
      name: "Friendly Citizen Greeting",
      description: "#{npc.name} offered a warm nod as you passed.",
      alarm_triggered: false
    }
    {reply, action}
  end

  defp execute_npc_action(npc, action, map_id, _px, _py) do
    try do
      if action[:new_coords] && (action[:new_coords][:x] != npc.x or action[:new_coords][:y] != npc.y) do
        nx = action[:new_coords][:x]
        ny = action[:new_coords][:y]
        Repo.query("UPDATE game_npcs SET x = ?, y = ? WHERE id = ?", [nx, ny, npc.id])
      end
    rescue
      _ -> :ok
    end
  end

  defp intercept_step(npc_x, npc_y, px, py) do
    dx = px - npc_x
    dy = py - npc_y

    step_x =
      cond do
        dx > 0 -> npc_x + 1
        dx < 0 -> npc_x - 1
        true -> npc_x
      end

    step_y =
      cond do
        dy > 0 -> npc_y + 1
        dy < 0 -> npc_y - 1
        true -> npc_y
      end

    %{x: step_x, y: step_y}
  end
end
