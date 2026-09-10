defmodule TePhoenixWeb.Game.EngineSystemsHandler do
  @moduledoc """
  Phoenix Channel dispatch handler for the 5 Next-Tier RPG Systems and Master Feature Flags:
    1. Engine Feature Matrix & Flags
    2. Safehouse Bastion Workshop (Runeforging, Alchemy Alembic, Smuggler Dispatch)
    3. Spoken Dungeon Catacombs On-Demand via Uile
    4. Dynamic Faction Territory Wars & District Turf Control
    5. Forensic Murder Mysteries & Courtroom Trials
    6. Real-Time Spoken Spellcrafting & Squad Voice Tactics
  """

  import Phoenix.Channel

  alias TePhoenix.World.EngineFeatureFlags
  alias TePhoenix.World.SafehouseWorkshop
  alias TePhoenix.World.CatacombGenerator
  alias TePhoenix.World.FactionTerritory
  alias TePhoenix.World.ForensicMystery
  alias TePhoenix.Combat.VoiceCombat

  # ============================================================================
  # DISPATCH ENTRYPOINT
  # ============================================================================

  def handle(event, payload, socket) do
    handle_in(event, payload, socket)
  end

  # ============================================================================
  # 1. ENGINE FEATURE MATRIX & FLAGS
  # ============================================================================

  def handle_in("get_feature_flags", _params, socket) do
    flags = EngineFeatureFlags.list_all_flags()
    push(socket, "feature_flags_state", %{flags: flags})
    {:reply, {:ok, %{flags: flags}}, socket}
  end

  def handle_in("toggle_feature_flag", %{"feature_key" => key, "is_enabled" => enabled}, socket) do
    {:ok, payload} = EngineFeatureFlags.toggle_flag(key, enabled)
    push(socket, "feature_flag_toggled", payload)
    flags = EngineFeatureFlags.list_all_flags()
    push(socket, "feature_flags_state", %{flags: flags})
    {:reply, {:ok, payload}, socket}
  end

  def handle_in("set_all_feature_flags", %{"flags" => flags_map}, socket) do
    flags = EngineFeatureFlags.set_all_flags(flags_map)
    push(socket, "feature_flags_state", %{flags: flags})
    {:reply, {:ok, %{flags: flags}}, socket}
  end

  # ============================================================================
  # 2. SAFEHOUSE BASTION WORKSHOP
  # ============================================================================

  def handle_in("get_safehouse_workshop", %{"property_id" => prop_id}, socket) do
    state = SafehouseWorkshop.get_workshop_state(prop_id)
    push(socket, "safehouse_workshop_state", state)
    {:reply, {:ok, state}, socket}
  end

  def handle_in("socket_workshop_rune", %{"property_id" => prop_id, "item_id" => i_id, "item_name" => iname, "rune_key" => rkey} = params, socket) do
    slot = Map.get(params, "slot", "primary")

    case SafehouseWorkshop.socket_rune(prop_id, i_id, iname, rkey, slot) do
      {:ok, res} ->
        state = SafehouseWorkshop.get_workshop_state(prop_id)
        push(socket, "safehouse_workshop_state", state)
        push(socket, "workshop_rune_result", res)
        {:reply, {:ok, Map.merge(res, %{workshop: state})}, socket}

      {:error, reason} ->
        push(socket, "workshop_rune_result", %{error: reason})
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in("unsocket_workshop_rune", %{"property_id" => prop_id, "rune_id" => rune_id}, socket) do
    case SafehouseWorkshop.unsocket_rune(prop_id, rune_id) do
      {:ok, res} ->
        state = SafehouseWorkshop.get_workshop_state(prop_id)
        push(socket, "safehouse_workshop_state", state)
        push(socket, "workshop_rune_result", res)
        {:reply, {:ok, Map.merge(res, %{workshop: state})}, socket}

      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in("brew_workshop_concoction", %{"property_id" => prop_id, "recipe_key" => rkey}, socket) do
    case SafehouseWorkshop.brew_concoction(prop_id, rkey) do
      {:ok, res} ->
        state = SafehouseWorkshop.get_workshop_state(prop_id)
        push(socket, "safehouse_workshop_state", state)
        push(socket, "workshop_brew_result", res)
        {:reply, {:ok, Map.merge(res, %{workshop: state})}, socket}

      {:error, reason} ->
        push(socket, "workshop_brew_result", %{error: reason})
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in("claim_workshop_concoction", %{"property_id" => prop_id, "brew_id" => bid}, socket) do
    case SafehouseWorkshop.claim_concoction(prop_id, bid) do
      {:ok, res} ->
        state = SafehouseWorkshop.get_workshop_state(prop_id)
        push(socket, "safehouse_workshop_state", state)
        push(socket, "workshop_brew_result", res)
        {:reply, {:ok, Map.merge(res, %{workshop: state})}, socket}

      {:error, reason} ->
        push(socket, "workshop_brew_result", %{error: reason})
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in("start_workshop_dispatch", %{"property_id" => prop_id, "companion_id" => cid, "companion_name" => cname, "mission_type" => mtype}, socket) do
    case SafehouseWorkshop.start_dispatch(prop_id, cid, cname, mtype) do
      {:ok, res} ->
        state = SafehouseWorkshop.get_workshop_state(prop_id)
        push(socket, "safehouse_workshop_state", state)
        push(socket, "workshop_dispatch_result", res)
        {:reply, {:ok, Map.merge(res, %{workshop: state})}, socket}

      {:error, reason} ->
        push(socket, "workshop_dispatch_result", %{error: reason})
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in("claim_workshop_dispatch", %{"property_id" => prop_id, "dispatch_id" => did}, socket) do
    case SafehouseWorkshop.claim_dispatch(prop_id, did) do
      {:ok, res} ->
        state = SafehouseWorkshop.get_workshop_state(prop_id)
        push(socket, "safehouse_workshop_state", state)
        push(socket, "workshop_dispatch_result", res)
        {:reply, {:ok, Map.merge(res, %{workshop: state})}, socket}

      {:error, reason} ->
        push(socket, "workshop_dispatch_result", %{error: reason})
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  # ============================================================================
  # 3. SPOKEN DUNGEON CATACOMBS ON-DEMAND VIA UILE
  # ============================================================================

  def handle_in("generate_catacomb", %{"prompt" => prompt} = params, socket) do
    cid = Map.get(params, "creator_char_id", 1)
    theme = Map.get(params, "theme", "sunken_crypt")
    dlevel = Map.get(params, "danger_level", "hard")

    case CatacombGenerator.generate_catacomb(cid, prompt, theme, dlevel) do
      {:ok, dungeon} ->
        push(socket, "catacomb_dungeon_state", dungeon)
        {:reply, {:ok, dungeon}, socket}

      {:error, reason} ->
        push(socket, "catacomb_error", %{error: reason})
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in("get_catacomb_state", %{"dungeon_id" => did}, socket) do
    case CatacombGenerator.get_catacomb_state(did) do
      {:ok, dungeon} ->
        push(socket, "catacomb_dungeon_state", dungeon)
        {:reply, {:ok, dungeon}, socket}

      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in("clear_catacomb_room", %{"dungeon_id" => did, "room_index" => r_idx}, socket) do
    case CatacombGenerator.clear_room(did, r_idx) do
      {:ok, res} ->
        {:ok, dungeon} = CatacombGenerator.get_catacomb_state(did)
        push(socket, "catacomb_dungeon_state", dungeon)
        push(socket, "catacomb_action_result", res)
        {:reply, {:ok, Map.merge(res, %{dungeon: dungeon})}, socket}
    end
  end

  # ============================================================================
  # 4. DYNAMIC FACTION TERRITORY WARS & TURF CONTROL
  # ============================================================================

  def handle_in("get_faction_territories", _params, socket) do
    territories = FactionTerritory.list_territories()
    payload = %{districts: territories, is_enabled: EngineFeatureFlags.is_enabled?("faction_territory_enabled")}
    push(socket, "faction_territories_state", payload)
    {:reply, {:ok, payload}, socket}
  end

  def handle_in("shift_faction_influence", %{"district_key" => dkey, "faction" => fac, "delta" => delta} = params, socket) do
    reason = Map.get(params, "reason")

    case FactionTerritory.shift_influence(dkey, fac, delta, reason) do
      {:ok, res} ->
        territories = FactionTerritory.list_territories()
        payload = Map.merge(res, %{districts: territories})
        push(socket, "faction_territories_state", %{districts: territories})
        push(socket, "territory_shift_result", res)
        {:reply, {:ok, payload}, socket}

      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in("trigger_turf_skirmish", %{"district_key" => dkey, "attacking_faction" => afac}, socket) do
    case FactionTerritory.trigger_turf_skirmish(dkey, afac) do
      {:ok, res} ->
        territories = FactionTerritory.list_territories()
        push(socket, "faction_territories_state", %{districts: territories})
        push(socket, "territory_shift_result", res)
        {:reply, {:ok, Map.merge(res, %{districts: territories})}, socket}

      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in("toggle_district_martial_law", %{"district_key" => dkey, "is_active" => is_act}, socket) do
    case FactionTerritory.toggle_martial_law(dkey, is_act) do
      {:ok, res} ->
        territories = FactionTerritory.list_territories()
        push(socket, "faction_territories_state", %{districts: territories})
        {:reply, {:ok, Map.merge(res, %{districts: territories})}, socket}
    end
  end

  # ============================================================================
  # 5. FORENSIC MURDER MYSTERY & COURTROOM TRIALS
  # ============================================================================

  def handle_in("get_forensic_cases", _params, socket) do
    cases = ForensicMystery.list_active_cases()
    payload = %{cases: cases, is_enabled: EngineFeatureFlags.is_enabled?("forensic_mysteries_enabled")}
    push(socket, "forensic_cases_state", payload)
    {:reply, {:ok, payload}, socket}
  end

  def handle_in("get_forensic_case_details", %{"case_id" => cid}, socket) do
    case ForensicMystery.get_case_details(cid) do
      {:ok, case_info} ->
        push(socket, "forensic_case_details", case_info)
        {:reply, {:ok, case_info}, socket}

      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in("inspect_crime_scene_clues", %{"case_id" => cid}, socket) do
    case ForensicMystery.inspect_crime_scene(cid) do
      {:ok, res} ->
        {:ok, details} = ForensicMystery.get_case_details(cid)
        push(socket, "forensic_case_details", details)
        push(socket, "forensic_action_result", res)
        {:reply, {:ok, Map.merge(res, %{case: details})}, socket}

      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in("interrogate_case_suspect", %{"case_id" => cid, "suspect_id" => sid} = params, socket) do
    tactic = Map.get(params, "tactic", "pressure")

    case ForensicMystery.interrogate_suspect(cid, sid, tactic) do
      {:ok, res} ->
        {:ok, details} = ForensicMystery.get_case_details(cid)
        push(socket, "forensic_case_details", details)
        push(socket, "forensic_action_result", res)
        {:reply, {:ok, Map.merge(res, %{case: details})}, socket}

      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in("hold_courtroom_trial", %{"case_id" => cid, "accused_suspect_id" => aid}, socket) do
    case ForensicMystery.hold_courtroom_trial(cid, aid) do
      {:ok, res} ->
        {:ok, details} = ForensicMystery.get_case_details(cid)
        push(socket, "forensic_case_details", details)
        push(socket, "forensic_verdict_result", res)
        {:reply, {:ok, Map.merge(res, %{case: details})}, socket}

      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in("bribe_frame_suspect", %{"case_id" => cid, "frame_suspect_id" => fid} = params, socket) do
    bribe_gold = Map.get(params, "bribe_gold", 350)

    case ForensicMystery.accept_bribe_to_frame(cid, fid, bribe_gold) do
      {:ok, res} ->
        {:ok, details} = ForensicMystery.get_case_details(cid)
        push(socket, "forensic_case_details", details)
        push(socket, "forensic_verdict_result", res)
        {:reply, {:ok, Map.merge(res, %{case: details})}, socket}
    end
  end

  # ============================================================================
  # 6. REAL-TIME SPOKEN COMBAT SPELLCRAFTING & SQUAD VOICE TACTICS
  # ============================================================================

  def handle_in("cast_spoken_spell", %{"phrase" => phrase} = params, socket) do
    cid = Map.get(params, "char_id", 1)
    pitch = Map.get(params, "pitch_hz", 220)
    amplitude = Map.get(params, "amplitude_db", -12.0)

    case VoiceCombat.cast_spoken_incantation(cid, phrase, pitch, amplitude) do
      {:ok, res} ->
        push(socket, "spoken_spell_result", res)
        {:reply, {:ok, res}, socket}

      {:error, reason} ->
        push(socket, "spoken_spell_result", %{error: reason})
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in("issue_squad_voice_cmd", %{"command" => cmd} = params, socket) do
    cid = Map.get(params, "char_id", 1)

    case VoiceCombat.issue_squad_voice_command(cid, cmd) do
      {:ok, res} ->
        push(socket, "squad_voice_cmd_result", res)
        {:reply, {:ok, res}, socket}

      {:error, reason} ->
        push(socket, "squad_voice_cmd_result", %{error: reason})
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in("get_voice_combat_capabilities", _params, socket) do
    caps = VoiceCombat.list_voice_capabilities()
    push(socket, "voice_combat_capabilities", caps)
    {:reply, {:ok, caps}, socket}
  end

  def handle_in(_event, _payload, socket) do
    {:noreply, socket}
  end
end
