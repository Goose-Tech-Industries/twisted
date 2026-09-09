defmodule TePhoenixWeb.GameChannel do
  @moduledoc """
  Main game session channel. Replaces socket-game.js.
  Topic format: "game:lobby" (single topic — all players join the same channel,
  then use map-based PubSub for location-specific broadcasts).

  Handles: join_game, select_character, move, teleport, fast_travel,
  interact, disconnect, and delegates to sub-handler modules for
  items, DM campaigns, world events, etc.
  """

  use Phoenix.Channel
  require Logger

  alias TePhoenix.Repo

  alias TePhoenixWeb.Game.{
    CoreHandler,
    ItemHandler,
    CharacterHandler,
    WorldHandler,
    DmHandler,
    AiHandler,
    LookupHandler,
    NpcHandler,
    ShopHandler,
    GodsEyeHandler,
    BountyAndSyndicateHandler,
    AshveilColossusHandler,
    EngineSystemsHandler
  }

  # ══════════════════════════════════════════════════════════════════
  # JOIN — authenticates but doesn't start game session yet
  # ══════════════════════════════════════════════════════════════════

  @impl true
  def join("game:lobby", _params, socket) do
    user_id = socket.assigns.user_id

    # Check ban
    case Repo.query("SELECT is_banned FROM users WHERE id=?", [user_id]) do
      {:ok, %{rows: [[1]]}} ->
        push(socket, "force_disconnect", %{reason: "Your account has been banned."})
        {:error, %{reason: "banned"}}
      {:ok, %{rows: [[true]]}} ->
        push(socket, "force_disconnect", %{reason: "Your account has been banned."})
        {:error, %{reason: "banned"}}
      _ ->
        {:ok, %{user_id: user_id}, socket}
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # CORE GAME EVENTS (delegated to CoreHandler)
  # ══════════════════════════════════════════════════════════════════

  @impl true
  def handle_in("join_game", payload, socket),
    do: CoreHandler.handle("join_game", payload, socket)

  def handle_in("select_character", payload, socket),
    do: CoreHandler.handle("join_game", payload, socket)  # alias

  def handle_in("move", payload, socket),
    do: CoreHandler.handle("move", payload, socket)

  def handle_in("teleport", payload, socket),
    do: CoreHandler.handle("teleport", payload, socket)

  def handle_in("fast_travel", payload, socket),
    do: CoreHandler.handle("fast_travel", payload, socket)

  def handle_in("interact", payload, socket),
    do: CoreHandler.handle("interact", payload, socket)

  # ══════════════════════════════════════════════════════════════════
  # ITEMS & EQUIPMENT
  # ══════════════════════════════════════════════════════════════════

  def handle_in("equip_item" = e, p, s), do: ItemHandler.handle(e, p, s)
  def handle_in("unequip_item" = e, p, s), do: ItemHandler.handle(e, p, s)
  def handle_in("drop_item" = e, p, s), do: ItemHandler.handle(e, p, s)
  def handle_in("pickup_item" = e, p, s), do: ItemHandler.handle(e, p, s)
  def handle_in("get_ground_items" = e, p, s), do: ItemHandler.handle(e, p, s)
  def handle_in("use_item" = e, p, s), do: ItemHandler.handle(e, p, s)
  def handle_in("use_item_on_map" = e, p, s), do: ItemHandler.handle(e, p, s)
  def handle_in("use_capsule" = e, p, s), do: ItemHandler.handle(e, p, s)
  def handle_in("use_ability" = e, p, s), do: ItemHandler.handle(e, p, s)
  def handle_in("get_abilities" = e, p, s), do: ItemHandler.handle(e, p, s)

  # ══════════════════════════════════════════════════════════════════
  # CHARACTER (rest, respawn, AP, tutorial, preferences, fog)
  # ══════════════════════════════════════════════════════════════════

  def handle_in("request_respawn" = e, p, s), do: CharacterHandler.handle(e, p, s)
  def handle_in("short_rest" = e, p, s), do: CharacterHandler.handle(e, p, s)
  def handle_in("long_rest" = e, p, s), do: CharacterHandler.handle(e, p, s)
  def handle_in("rest_at_inn" = e, p, s), do: CharacterHandler.handle(e, p, s)
  def handle_in("distribute_ap" = e, p, s), do: CharacterHandler.handle(e, p, s)
  def handle_in("tutorial_complete" = e, p, s), do: CharacterHandler.handle(e, p, s)
  def handle_in("get_preferences" = e, p, s), do: CharacterHandler.handle(e, p, s)
  def handle_in("save_preferences" = e, p, s), do: CharacterHandler.handle(e, p, s)
  def handle_in("get_fog_exploration" = e, p, s), do: CharacterHandler.handle(e, p, s)
  def handle_in("save_fog_exploration" = e, p, s), do: CharacterHandler.handle(e, p, s)

  # ══════════════════════════════════════════════════════════════════
  # WORLD EVENTS, STRUCTURES, PARTICLES
  # ══════════════════════════════════════════════════════════════════

  def handle_in("interact_object" = e, p, s), do: WorldHandler.handle(e, p, s)
  def handle_in("spawn_map_particle" = e, p, s), do: WorldHandler.handle(e, p, s)
  def handle_in("enter_structure" = e, p, s), do: WorldHandler.handle(e, p, s)
  def handle_in("exit_structure" = e, p, s), do: WorldHandler.handle(e, p, s)
  def handle_in("world_events_get_active" = e, p, s), do: WorldHandler.handle(e, p, s)
  def handle_in("world_events_get_history" = e, p, s), do: WorldHandler.handle(e, p, s)
  def handle_in("world_event_join" = e, p, s), do: WorldHandler.handle(e, p, s)
  def handle_in("event_list" = e, p, s), do: WorldHandler.handle(e, p, s)
  def handle_in("event_signup" = e, p, s), do: WorldHandler.handle(e, p, s)
  def handle_in("event_cancel_signup" = e, p, s), do: WorldHandler.handle(e, p, s)
  def handle_in("event_create" = e, p, s), do: WorldHandler.handle(e, p, s)

  # ══════════════════════════════════════════════════════════════════
  # AI GENERATION
  # ══════════════════════════════════════════════════════════════════

  def handle_in("ai_" <> _ = e, p, s), do: AiHandler.handle(e, p, s)

  # ══════════════════════════════════════════════════════════════════
  # DM CAMPAIGNS
  # ══════════════════════════════════════════════════════════════════

  def handle_in("dm_" <> _ = e, p, s), do: DmHandler.handle(e, p, s)
  def handle_in("get_action_slots" = e, p, s), do: DmHandler.handle(e, p, s)
  def handle_in("campaign_action" = e, p, s), do: DmHandler.handle(e, p, s)
  def handle_in("check_campaign_moves" = e, p, s), do: DmHandler.handle(e, p, s)

  # ══════════════════════════════════════════════════════════════════
  # LOOKUPS (bank, bounty, mounts, creatures, jobs, cards)
  # ══════════════════════════════════════════════════════════════════

  def handle_in("bank_get_items" = e, p, s), do: LookupHandler.handle(e, p, s)
  def handle_in("bounty_get_tasks" = e, p, s), do: LookupHandler.handle(e, p, s)
  def handle_in("mount_get_list" = e, p, s), do: LookupHandler.handle(e, p, s)
  def handle_in("creature_get_list" = e, p, s), do: LookupHandler.handle(e, p, s)
  def handle_in("job_get_list" = e, p, s), do: LookupHandler.handle(e, p, s)
  def handle_in("card_get_collection" = e, p, s), do: LookupHandler.handle(e, p, s)

  # ══════════════════════════════════════════════════════════════════
  # SHOPS (buy, sell, browse)
  # ══════════════════════════════════════════════════════════════════

  def handle_in("shop_get_items" = e, p, s), do: ShopHandler.handle(e, p, s)
  def handle_in("shop_buy_item" = e, p, s), do: ShopHandler.handle(e, p, s)
  def handle_in("shop_sell_item" = e, p, s), do: ShopHandler.handle(e, p, s)

  # ══════════════════════════════════════════════════════════════════
  # NPC INTERACTIONS (dialogue, companions, training, sparring)
  # ══════════════════════════════════════════════════════════════════

  def handle_in("npc_talk" = e, p, s), do: NpcHandler.handle(e, p, s)
  def handle_in("accept_npc_need" = e, p, s), do: NpcHandler.handle(e, p, s)
  def handle_in("npc_menu_choice" = e, p, s), do: NpcHandler.handle(e, p, s)
  def handle_in("companion_set_tactics" = e, p, s), do: NpcHandler.handle(e, p, s)
  def handle_in("companion_dismiss" = e, p, s), do: NpcHandler.handle(e, p, s)
  def handle_in("companion_get_affinity" = e, p, s), do: NpcHandler.handle(e, p, s)
  def handle_in("companion_quest_accept" = e, p, s), do: NpcHandler.handle(e, p, s)
  def handle_in("master_train" = e, p, s), do: NpcHandler.handle(e, p, s)
  def handle_in("train" = e, p, s), do: NpcHandler.handle(e, p, s)
  def handle_in("spar_request" = e, p, s), do: NpcHandler.handle(e, p, s)
  def handle_in("spar_accept" = e, p, s), do: NpcHandler.handle(e, p, s)

  # ══════════════════════════════════════════════════════════════════
  # EVENT CHOICE (from EventRunner CHOICE actions)
  # ══════════════════════════════════════════════════════════════════

  def handle_in("event_choice", payload, socket) do
    NpcHandler.handle("event_choice", payload, socket)
  end

  # ══════════════════════════════════════════════════════════════════
  # GOD'S EYE SURVEILLANCE & SONAR RADAR
  # ══════════════════════════════════════════════════════════════════

  def handle_in("gods_eye_" <> _ = e, p, s), do: GodsEyeHandler.handle(e, p, s)

  # ══════════════════════════════════════════════════════════════════
  # BOUNTY BOARD & BLACK MARKET FENCE
  # ══════════════════════════════════════════════════════════════════

  def handle_in("bounty_" <> _ = e, p, s), do: BountyAndSyndicateHandler.handle(e, p, s)
  def handle_in("fence_" <> _ = e, p, s), do: BountyAndSyndicateHandler.handle(e, p, s)
  def handle_in("schedules_" <> _ = e, p, s), do: BountyAndSyndicateHandler.handle(e, p, s)
  def handle_in("property_" <> _ = e, p, s), do: BountyAndSyndicateHandler.handle(e, p, s)
  def handle_in("get_properties" = e, p, s), do: CoreHandler.handle(e, p, s)
  def handle_in("purchase_property" = e, p, s), do: CoreHandler.handle(e, p, s)
  def handle_in("add_fortification" = e, p, s), do: CoreHandler.handle(e, p, s)
  def handle_in("toggle_soundproof_curtains" = e, p, s), do: CoreHandler.handle(e, p, s)
  def handle_in("rest_property" = e, p, s), do: CoreHandler.handle(e, p, s)
  def handle_in("check_indoor_draft" = e, p, s), do: CoreHandler.handle(e, p, s)

  # ══════════════════════════════════════════════════════════════════
  # LOWTOWN NOCTURNAL SHADOWS, DRAMA & FORENSICS
  # ══════════════════════════════════════════════════════════════════

  def handle_in("get_npc_drama" = e, p, s), do: CoreHandler.handle(e, p, s)
  def handle_in("trigger_nocturnal_stalking" = e, p, s), do: CoreHandler.handle(e, p, s)
  def handle_in("intervene_npc_drama" = e, p, s), do: CoreHandler.handle(e, p, s)
  def handle_in("tick_npc_drama" = e, p, s), do: CoreHandler.handle(e, p, s)
  def handle_in("spot_stalker" = e, p, s), do: CoreHandler.handle(e, p, s)
  def handle_in("investigate_crime_scene" = e, p, s), do: CoreHandler.handle(e, p, s)
  def handle_in("defenestrate_target" = e, p, s), do: CoreHandler.handle(e, p, s)
  def handle_in("cascade_brawl" = e, p, s), do: CoreHandler.handle(e, p, s)
  def handle_in("defenestrate_brawler" = e, p, s), do: CoreHandler.handle(e, p, s)
  def handle_in("brawl_round_tick" = e, p, s), do: CoreHandler.handle(e, p, s)
  def handle_in("deploy_window_gas" = e, p, s), do: CoreHandler.handle(e, p, s)

  # ══════════════════════════════════════════════════════════════════
  # ASHVEIL COLOSSUS APEX RAID & ACTIVE DEFENSE
  # ══════════════════════════════════════════════════════════════════

  def handle_in("colossus_" <> _ = e, p, s), do: AshveilColossusHandler.handle(e, p, s)

  # ══════════════════════════════════════════════════════════════════
  # NEXT-TIER SYSTEMS & MASTER FEATURE MATRIX
  # ══════════════════════════════════════════════════════════════════

  def handle_in("get_feature_flags" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("toggle_feature_flag" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("set_all_feature_flags" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)

  def handle_in("get_safehouse_workshop" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("socket_workshop_rune" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("unsocket_workshop_rune" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("brew_workshop_concoction" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("claim_workshop_concoction" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("start_workshop_dispatch" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("claim_workshop_dispatch" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)

  def handle_in("generate_catacomb" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("get_catacomb_state" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("clear_catacomb_room" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)

  def handle_in("get_faction_territories" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("shift_faction_influence" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("trigger_turf_skirmish" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("toggle_district_martial_law" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)

  def handle_in("get_forensic_cases" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("get_forensic_case_details" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("inspect_crime_scene_clues" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("interrogate_case_suspect" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("hold_courtroom_trial" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("bribe_frame_suspect" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)

  def handle_in("cast_spoken_spell" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("issue_squad_voice_cmd" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)
  def handle_in("get_voice_combat_capabilities" = e, p, s), do: EngineSystemsHandler.handle(e, p, s)

  # Catch-all
  def handle_in(event, _payload, socket) do
    Logger.warning("Unknown game event: #{event}")
    {:noreply, socket}
  end

  # ══════════════════════════════════════════════════════════════════
  # FOG OF WAR PubSub → client push
  # ══════════════════════════════════════════════════════════════════

  @impl true
  def handle_info(%{event: :fog_delta} = msg, socket) do
    push(socket, "fog_delta", %{
      newly_visible: msg[:newly_visible] || [],
      newly_explored: msg[:newly_explored] || [],
      newly_hidden: msg[:newly_hidden] || [],
    })
    {:noreply, socket}
  end

  def handle_info(%{event: :fog_reset} = msg, socket) do
    push(socket, "fog_reset", %{})
    {:noreply, socket}
  end

  # Catch-all for unexpected PubSub messages (e.g. map:* broadcasts
  # that Phoenix delivers to all socket channels)
  def handle_info(_msg, socket), do: {:noreply, socket}

  # ══════════════════════════════════════════════════════════════════
  # TERMINATE (disconnect cleanup)
  # ══════════════════════════════════════════════════════════════════

  @impl true
  def terminate(_reason, socket) do
    CoreHandler.handle_disconnect(socket)
    :ok
  end
end
