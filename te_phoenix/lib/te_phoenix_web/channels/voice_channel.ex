defmodule TePhoenixWeb.VoiceChannel do
  @moduledoc """
  Real-time Voice Chat & WebRTC Signaling Channel between grouped players and nearby world denizens.

  Features:
    * ARC Raiders Proximity Voice: Players and random NPCs on the map hear nearby voices with 3D spatial attenuation.
    * Private Party Encryption: Option to switch to 'party' band where communication is 100% private (enemies CANNOT overhear).
    * Whisper Mode: Short-range (4 tiles) stealth communications.
    * Shout / Battle Cry Mode: Echoing sector-wide shouts (32 tiles) that alert dungeon sentries and spawn reinforcements.
    * Mesh WebRTC signaling (offer, answer, ICE candidate relay).
    * Voice room presence & speaking state indicators (green audio rings).
    * Companion Voice Mind: active squad listens, replies, and physically acts.
    * NPC Acoustic Overhearing: nearby dungeon hostiles and town sentries hear and react.
    * Uile Omniscient Reality Director: voice-activated puzzle incantations, divine interventions, and voice terraforming.
  """

  use TePhoenixWeb, :channel
  alias TePhoenix.Repo
  alias TePhoenix.AI.{CompanionVoiceMind, UileAcousticDirector}
  alias TePhoenix.World.{LegendChronicler, NpcAcousticReactor}
  require Logger

  @impl true
  def join("voice:party:" <> party_id_str, payload, socket) do
    char_id = payload["char_id"] || socket.assigns[:party_char_id] || socket.assigns[:user_id]

    char_name =
      case Repo.query("SELECT name FROM characters WHERE id = ?", [char_id]) do
        {:ok, %{rows: [[name]]}} -> name
        _ -> "Player_#{char_id}"
      end

    socket =
      socket
      |> assign(:party_id, party_id_str)
      |> assign(:char_id, char_id)
      |> assign(:char_name, char_name)

    send(self(), :after_join)

    {:ok, %{party_id: party_id_str, char_id: char_id, name: char_name}, socket}
  end

  def join("voice:proximity:" <> map_id_str, payload, socket) do
    char_id = payload["char_id"] || socket.assigns[:party_char_id] || socket.assigns[:user_id] || 1

    char_name =
      case Repo.query("SELECT name FROM characters WHERE id = ?", [char_id]) do
        {:ok, %{rows: [[name]]}} -> name
        _ -> "Player_#{char_id}"
      end

    socket =
      socket
      |> assign(:party_id, "proximity:" <> map_id_str)
      |> assign(:map_id, map_id_str)
      |> assign(:char_id, char_id)
      |> assign(:char_name, char_name)

    send(self(), :after_join)

    {:ok, %{map_id: map_id_str, char_id: char_id, name: char_name, channel_type: :proximity}, socket}
  end

  def join("voice:room:" <> room_id, payload, socket) do
    char_id = payload["char_id"] || 1
    char_name = payload["name"] || "Adventurer"

    socket =
      socket
      |> assign(:party_id, room_id)
      |> assign(:char_id, char_id)
      |> assign(:char_name, char_name)

    send(self(), :after_join)

    {:ok, %{room_id: room_id, char_id: char_id, name: char_name}, socket}
  end

  def join(_topic, _payload, _socket) do
    {:error, %{reason: "invalid_voice_room"}}
  end

  @impl true
  def handle_info(:after_join, socket) do
    broadcast_from!(socket, "peer_joined", %{
      char_id: socket.assigns.char_id,
      name: socket.assigns.char_name,
      timestamp: System.system_time(:second)
    })

    {:noreply, socket}
  end

  # WebRTC Signaling Relay (Offer, Answer, ICE Candidates)
  @impl true
  def handle_in("signal", %{"target_char_id" => target_id, "signal" => signal_data}, socket) do
    broadcast!(socket, "signal:#{target_id}", %{
      from_char_id: socket.assigns.char_id,
      from_name: socket.assigns.char_name,
      signal: signal_data
    })

    {:reply, :ok, socket}
  end

  # Speaking activity toggle (lights up voice indicator on party avatars)
  @impl true
  def handle_in("speaking", %{"is_speaking" => is_speaking}, socket) do
    broadcast_from!(socket, "peer_speaking", %{
      char_id: socket.assigns.char_id,
      is_speaking: !!is_speaking
    })

    {:reply, :ok, socket}
  end

  # Player shares a plan, idea, or vocal speech
  # Supports mode: "party" (private), "proximity" (spatial open mic), "whisper" (stealth), "shout" (loud)
  @impl true
  def handle_in("party_speech", payload, socket) do
    text = payload["text"] || payload[:text] || ""
    is_thought = !!(payload["is_thought"] || payload[:is_thought])
    mode = payload["mode"] || payload[:mode] || (if is_thought, do: "mind", else: "party")
    map_id = payload["map_id"] || payload[:map_id] || 1
    coords = %{x: payload["x"], y: payload["y"], map_id: map_id}

    event_name = if is_thought, do: "peer_thought", else: "peer_speech"

    # 1. Broadcast to party
    broadcast_from!(socket, event_name, %{
      char_id: socket.assigns.char_id,
      name: socket.assigns.char_name,
      text: text,
      is_thought: is_thought,
      mode: mode,
      coords: coords,
      timestamp: System.system_time(:second)
    })

    # 2. If spoken in proximity/whisper/shout, ALSO broadcast to map proximity channel so nearby random players hear it!
    if mode in ["proximity", "whisper", "shout"] and not is_thought do
      TePhoenixWeb.Endpoint.broadcast("voice:proximity:#{map_id}", "spatial_peer_speech", %{
        char_id: socket.assigns.char_id,
        name: socket.assigns.char_name,
        text: text,
        mode: mode,
        coords: coords,
        timestamp: System.system_time(:second)
      })
    end

    party_id = socket.assigns.party_id
    char_id = socket.assigns.char_id
    speaker_name = socket.assigns.char_name
    caller = self()

    # 3. Active companions listen, respond with voice, and physically execute tactical actions
    Task.start(fn ->
      try do
        Ecto.Adapters.SQL.Sandbox.allow(Repo, caller, self())
      rescue
        _ -> :ok
      end

      try do
        CompanionVoiceMind.react_to_speech_and_action(party_id, char_id, speaker_name, text,
          is_thought: is_thought,
          map_id: map_id
        )
      rescue
        _ -> :ok
      catch
        _, _ -> :ok
      end
    end)

    # 4. Nearby world NPCs and hostiles hear/intercept and react with words & physical actions
    # NOTE: If mode == "party", NpcAcousticReactor guarantees enemies and world NPCs CANNOT overhear!
    Task.start(fn ->
      try do
        Ecto.Adapters.SQL.Sandbox.allow(Repo, caller, self())
      rescue
        _ -> :ok
      end

      try do
        NpcAcousticReactor.process_acoustic_event(party_id, char_id, speaker_name, text, is_thought, map_id, coords, mode)
      rescue
        _ -> :ok
      catch
        _, _ -> :ok
      end
    end)

    # 5. Uile reality director perceives ciphers, invocations, reality warps, and voice terraforming
    Task.start(fn ->
      try do
        Ecto.Adapters.SQL.Sandbox.allow(Repo, caller, self())
      rescue
        _ -> :ok
      end

      try do
        UileAcousticDirector.process_vocal_reality(party_id, char_id, speaker_name, text, is_thought, coords)
      rescue
        _ -> :ok
      catch
        _, _ -> :ok
      end
    end)

    {:reply, :ok, socket}
  end

  # Telepathic thought transmission
  @impl true
  def handle_in("party_thought", payload, socket) do
    thought_text = payload["thought"] || payload["text"] || ""
    new_payload = Map.merge(payload, %{"text" => thought_text, "is_thought" => true, "mode" => "mind"})
    handle_in("party_speech", new_payload, socket)
  end

  # Party Battle Cry ("LEEROY JENKINS!")
  @impl true
  def handle_in("battle_cry", payload, socket) do
    cry = payload["cry"] || "LEEROY JENKINS!!!"
    party_id = socket.assigns.party_id
    char_id = socket.assigns.char_id
    speaker_name = socket.assigns.char_name
    map_id = payload["map_id"] || 1
    coords = %{x: payload["x"], y: payload["y"], map_id: map_id}
    caller = self()

    broadcast!(socket, "battle_cry", %{
      char_id: char_id,
      name: speaker_name,
      cry: cry,
      coords: coords,
      timestamp: System.system_time(:second)
    })

    # Shout echoes into proximity across the map!
    TePhoenixWeb.Endpoint.broadcast("voice:proximity:#{map_id}", "spatial_peer_speech", %{
      char_id: char_id,
      name: speaker_name,
      text: cry,
      mode: "shout",
      coords: coords,
      timestamp: System.system_time(:second)
    })

    # Companions execute heroic charge
    Task.start(fn ->
      try do
        Ecto.Adapters.SQL.Sandbox.allow(Repo, caller, self())
      rescue
        _ -> :ok
      end

      try do
        CompanionVoiceMind.react_to_battle_cry(party_id, char_id, speaker_name, map_id: map_id)
      rescue
        _ -> :ok
      catch
        _, _ -> :ok
      end
    end)

    # Nearby hostiles within 32 tiles sound war horns and intercept!
    Task.start(fn ->
      try do
        Ecto.Adapters.SQL.Sandbox.allow(Repo, caller, self())
      rescue
        _ -> :ok
      end

      try do
        NpcAcousticReactor.process_acoustic_event(party_id, char_id, speaker_name, cry, false, map_id, coords, "shout")
      rescue
        _ -> :ok
      catch
        _, _ -> :ok
      end
    end)

    # Chronicler records the legendary charge in world history
    Task.start(fn ->
      try do
        Ecto.Adapters.SQL.Sandbox.allow(Repo, caller, self())
      rescue
        _ -> :ok
      end

      try do
        LegendChronicler.record_legend(
          :battle_cry_charge,
          "#{speaker_name}'s Charge",
          "#{speaker_name} and their companion squad shouted '#{cry}' and plunged headfirst into the abyss!"
        )
      rescue
        _ -> :ok
      catch
        _, _ -> :ok
      end
    end)

    {:reply, {:ok, %{cry: cry}}, socket}
  end

  # Player manually mutes or deafens
  @impl true
  def handle_in("mute_state", %{"muted" => muted, "deafened" => deafened}, socket) do
    broadcast_from!(socket, "peer_mute_state", %{
      char_id: socket.assigns.char_id,
      muted: !!muted,
      deafened: !!deafened
    })

    {:reply, :ok, socket}
  end

  # ── Interactive World, Underworld, Property & Colossus Delegations ─

  @impl true
  def handle_in("bounty_" <> _ = e, p, socket), do: TePhoenixWeb.Game.BountyAndSyndicateHandler.handle(e, p, socket)

  @impl true
  def handle_in("fence_" <> _ = e, p, socket), do: TePhoenixWeb.Game.BountyAndSyndicateHandler.handle(e, p, socket)

  @impl true
  def handle_in("schedules_" <> _ = e, p, socket), do: TePhoenixWeb.Game.BountyAndSyndicateHandler.handle(e, p, socket)

  @impl true
  def handle_in("property_" <> _ = e, p, socket), do: TePhoenixWeb.Game.BountyAndSyndicateHandler.handle(e, p, socket)

  @impl true
  def handle_in("colossus_" <> _ = e, p, socket), do: TePhoenixWeb.Game.AshveilColossusHandler.handle(e, p, socket)

  @impl true
  def handle_in("get_properties" = e, p, socket), do: TePhoenixWeb.Game.CoreHandler.handle(e, p, socket)

  @impl true
  def handle_in("purchase_property" = e, p, socket), do: TePhoenixWeb.Game.CoreHandler.handle(e, p, socket)

  @impl true
  def handle_in("add_fortification" = e, p, socket), do: TePhoenixWeb.Game.CoreHandler.handle(e, p, socket)

  @impl true
  def handle_in("toggle_soundproof_curtains" = e, p, socket), do: TePhoenixWeb.Game.CoreHandler.handle(e, p, socket)

  @impl true
  def handle_in("rest_property" = e, p, socket), do: TePhoenixWeb.Game.CoreHandler.handle(e, p, socket)

  @impl true
  def handle_in("check_indoor_draft" = e, p, socket), do: TePhoenixWeb.Game.CoreHandler.handle(e, p, socket)

  @impl true
  def handle_in("deploy_window_gas" = e, p, socket), do: TePhoenixWeb.Game.CoreHandler.handle(e, p, socket)

  @impl true
  def handle_in("get_npc_drama" = e, p, socket), do: TePhoenixWeb.Game.CoreHandler.handle(e, p, socket)

  @impl true
  def handle_in("trigger_nocturnal_stalking" = e, p, socket), do: TePhoenixWeb.Game.CoreHandler.handle(e, p, socket)

  @impl true
  def handle_in("intervene_npc_drama" = e, p, socket), do: TePhoenixWeb.Game.CoreHandler.handle(e, p, socket)

  @impl true
  def handle_in("tick_npc_drama" = e, p, socket), do: TePhoenixWeb.Game.CoreHandler.handle(e, p, socket)

  @impl true
  def handle_in("spot_stalker" = e, p, socket), do: TePhoenixWeb.Game.CoreHandler.handle(e, p, socket)

  @impl true
  def handle_in("investigate_crime_scene" = e, p, socket), do: TePhoenixWeb.Game.CoreHandler.handle(e, p, socket)

  @impl true
  def handle_in("defenestrate_target" = e, p, socket), do: TePhoenixWeb.Game.CoreHandler.handle(e, p, socket)

  @impl true
  def handle_in("cascade_brawl" = e, p, socket), do: TePhoenixWeb.Game.CoreHandler.handle(e, p, socket)

  @impl true
  def handle_in("brawl_round_tick" = e, p, socket), do: TePhoenixWeb.Game.CoreHandler.handle(e, p, socket)

  # Next-Tier Systems & Feature Matrix
  @impl true
  def handle_in("get_feature_flags" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("toggle_feature_flag" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("set_all_feature_flags" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)

  @impl true
  def handle_in("get_safehouse_workshop" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("socket_workshop_rune" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("unsocket_workshop_rune" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("brew_workshop_concoction" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("claim_workshop_concoction" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("start_workshop_dispatch" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("claim_workshop_dispatch" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)

  @impl true
  def handle_in("generate_catacomb" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("get_catacomb_state" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("clear_catacomb_room" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)

  @impl true
  def handle_in("get_faction_territories" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("shift_faction_influence" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("trigger_turf_skirmish" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("toggle_district_martial_law" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)

  @impl true
  def handle_in("get_forensic_cases" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("get_forensic_case_details" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("inspect_crime_scene_clues" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("interrogate_case_suspect" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("hold_courtroom_trial" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("bribe_frame_suspect" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)

  @impl true
  def handle_in("cast_spoken_spell" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("issue_squad_voice_cmd" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)
  @impl true
  def handle_in("get_voice_combat_capabilities" = e, p, s), do: TePhoenixWeb.Game.EngineSystemsHandler.handle(e, p, s)

  @impl true
  def terminate(_reason, socket) do
    if socket.assigns[:char_id] do
      broadcast_from!(socket, "peer_left", %{
        char_id: socket.assigns.char_id,
        name: socket.assigns.char_name
      })
    end

    :ok
  end
end
