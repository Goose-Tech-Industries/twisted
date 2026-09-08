defmodule TePhoenixWeb.Router do
  use TePhoenixWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {TePhoenixWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json"]
    plug :fetch_session
    plug :put_secure_browser_headers
  end

  pipeline :auth do
    plug TePhoenixWeb.Plugs.Auth
  end

  pipeline :staff do
    plug TePhoenixWeb.Plugs.Auth
    plug TePhoenixWeb.Plugs.RequireStaff
  end

  # ══════════════════════════════════════════════════════════════════
  # PUBLIC (no auth required)
  # ══════════════════════════════════════════════════════════════════

  # Kickstarter marketing landing — standalone page, no admin shell.
  scope "/", TePhoenixWeb do
    pipe_through :browser

    get "/kickstarter", KickstarterController, :index
    post "/kickstarter/signup", KickstarterController, :signup
  end

  # Public character & voice API (no auth required)
  scope "/api", TePhoenixWeb do
    pipe_through :api

    get "/character/:id", CharacterApiController, :show
    get "/character-options", GameController, :character_options
    get "/characters/options", GameController, :character_options
    get "/subclasses", GameController, :list_subclasses
    post "/voice/speak", VoiceController, :speak
    get "/voice/voices", VoiceController, :voices

    # ── Universal Party Game & Social Deduction Engine ───────────
    get "/party-games/modes", PartyGameController, :list_modes
    post "/party-games/rooms/create", PartyGameController, :create_room
    post "/party-games/rooms/join", PartyGameController, :join_room
    get "/party-games/rooms/:code", PartyGameController, :get_room
    post "/party-games/rooms/:code/start", PartyGameController, :start_game
    post "/party-games/rooms/:code/advance", PartyGameController, :advance_phase
    post "/party-games/rooms/:code/submit", PartyGameController, :submit_response
    post "/party-games/rooms/:code/vote", PartyGameController, :vote
    get "/social-deduction/roles", PartyGameController, :list_social_roles
  end

  scope "/api/auth", TePhoenixWeb do
    pipe_through :api

    post "/check-field", AuthController, :check_field
    post "/register", AuthController, :register
    post "/login", AuthController, :login
    post "/logout", AuthController, :logout
    post "/resend-verify", AuthController, :resend_verify
    get "/verify-email", AuthController, :verify_email
    get "/me", AuthController, :me
    get "/invite-code", AuthController, :invite_code
    post "/report-player", AuthController, :report_player
  end

  # ══════════════════════════════════════════════════════════════════
  # AUTHENTICATED (player must be logged in)
  # ══════════════════════════════════════════════════════════════════

  scope "/api", TePhoenixWeb do
    pipe_through [:api, :auth]

    # ── Characters ────────────────────────────────────────────────
    get "/character-options", GameController, :character_options
    get "/characters/options", GameController, :character_options
    get "/characters", GameController, :list_characters
    post "/characters/create", GameController, :create_character
    get "/characters/:id", GameController, :get_character
    post "/characters/:id/delete", GameController, :delete_character
    post "/characters/:id/subclass", GameController, :specialize_subclass
    get "/subclasses", GameController, :list_subclasses

    # ── Wilderness Camp, Inns & SSE Streamed Cutscenes ────────────
    get "/camp/status/:char_id", CutsceneController, :camp_status
    get "/cutscenes/stream", CutsceneController, :stream_cutscene
    post "/cutscenes/choice", CutsceneController, :handle_choice
    post "/camp/rest", CutsceneController, :perform_rest
    post "/camp/resolve_ambush", CutsceneController, :resolve_ambush
    get "/camp/cooking/:char_id", CutsceneController, :cooking_status
    post "/camp/cook", CutsceneController, :cook_meal
    post "/camp/companion-fusion", CutsceneController, :companion_fusion
    get "/camp/companion-fusion/status/:char_id", CutsceneController, :companion_fusion_status
    post "/camp/companion-fusion/defuse", CutsceneController, :defuse_companion

    # ── Fire Emblem Companion Supports & Bonds ───────────────────
    get "/companions/supports/:char_id", CutsceneController, :support_status
    get "/companions/support_stream", CutsceneController, :stream_support_conversation
    post "/companions/support_complete", CutsceneController, :complete_support_conversation
    get "/companions/crisis_status/:char_id", CutsceneController, :crisis_status
    get "/companions/crisis_stream", CutsceneController, :stream_crisis_conversation
    post "/companions/crisis_resolve", CutsceneController, :resolve_crisis

    # ── Living Nemesis & Factions ─────────────────────────────────
    get "/nemesis/dossier/:char_id", NemesisController, :get_dossier
    post "/nemesis/encounter", NemesisController, :record_encounter
    post "/nemesis/faction_shift", NemesisController, :faction_shift
    get "/nemesis/check_ambush/:char_id", NemesisController, :check_ambush
    post "/nemesis/generate", NemesisController, :generate

    # ── Inventory & Equipment ─────────────────────────────────────
    get "/inventory/:char_id", GameController, :get_inventory
    get "/equipment/:char_id", GameController, :get_equipment
    post "/equip-item", GameController, :equip_item
    post "/unequip-item", GameController, :unequip_item
    post "/use-item", GameController, :use_item

    # ── World Data ────────────────────────────────────────────────
    get "/maps/:id", WorldController, :get_map
    get "/maps/:id/npcs", WorldController, :get_map_npcs
    get "/regions", WorldController, :list_regions
    get "/shops/:id", WorldController, :get_shop

    # ── Quests ────────────────────────────────────────────────────
    get "/quests", QuestController, :list_quests
    get "/quests/:id", QuestController, :get_quest
    post "/quests/progress", QuestController, :update_progress
    post "/quests/complete", QuestController, :complete_quest
    get "/questboard", QuestController, :get_questboard

    # ── Guilds ────────────────────────────────────────────────────
    get "/guilds", GuildController, :list_guilds
    get "/guilds/:id", GuildController, :get_guild
    post "/guilds/create", GuildController, :create_guild
    get "/guilds/:id/members", GuildController, :get_members
    get "/guilds/:id/news", GuildController, :get_news
    post "/guilds/:id/news", GuildController, :post_news

    # ── Parties & Friends ─────────────────────────────────────────
    get "/party", PartyController, :get_party
    get "/friends", PartyController, :list_friends
    post "/friends/request", PartyController, :send_friend_request
    post "/friends/accept", PartyController, :accept_friend
    post "/friends/remove", PartyController, :remove_friend

    # ── Companions (2-4 Active Companions Squad) ──────────────────
    get "/companions/:char_id", CompanionController, :list
    post "/companions/:id/active", CompanionController, :set_active
    post "/companions/:id/tactic", CompanionController, :set_tactic

    # ── Mail ──────────────────────────────────────────────────────
    get "/mail", MailController, :inbox
    get "/mail/unread-count", MailController, :unread_count
    get "/mail/:id", MailController, :read_message
    post "/mail/send", MailController, :send_message
    post "/mail/:id/delete", MailController, :delete_message

    # ── Auction House ─────────────────────────────────────────────
    get "/auction", AuctionController, :list_auctions
    post "/auction/create", AuctionController, :create_listing
    post "/auction/buy", AuctionController, :buy_listing
    post "/auction/cancel", AuctionController, :cancel_listing

    # ── Crafting ──────────────────────────────────────────────────
    get "/crafting/recipes", CraftingController, :list_recipes
    post "/crafting/craft", CraftingController, :craft_item

    # ── Leaderboard ───────────────────────────────────────────────
    get "/leaderboard/:type", LeaderboardController, :get_leaderboard

    # ── Achievements ──────────────────────────────────────────────
    get "/achievements", AchievementController, :list_achievements
    get "/achievements/:char_id", AchievementController, :get_character_achievements

    # ── Progression ───────────────────────────────────────────────
    get "/progression/:char_id", ProgressionController, :get_progression

    # ── LFP (Looking for Party) ───────────────────────────────────
    get "/lfp", LfpController, :list_listings
    post "/lfp/list", LfpController, :create_listing
    post "/lfp/delist", LfpController, :remove_listing

    # ── Profile & Social ──────────────────────────────────────────
    get "/profile/:char_id", SocialController, :get_profile
    post "/profile/update", SocialController, :update_profile
    get "/guestbook/:char_id", SocialController, :get_guestbook
    post "/guestbook/:char_id", SocialController, :post_guestbook

    # ── Spotify ───────────────────────────────────────────────────
    get "/spotify/now-playing/:char_id", SocialController, :spotify_now_playing
    post "/spotify/set-track", SocialController, :spotify_set_track

    # ── World Forge ───────────────────────────────────────────────
    post "/worldforge/generate", WorldController, :worldforge_generate

    # ── Artifacts ─────────────────────────────────────────────────
    get "/artifacts", WorldController, :list_artifacts
    get "/artifacts/:id", WorldController, :get_artifact
  end

  # ══════════════════════════════════════════════════════════════════
  # ADMIN (staff only)
  # ══════════════════════════════════════════════════════════════════

  scope "/api/admin", TePhoenixWeb do
    pipe_through [:api, :staff]

    # ── Settings ──────────────────────────────────────────────────
    get "/settings", AdminController, :list_settings
    post "/settings", AdminController, :update_setting
    get "/settings/categories", AdminController, :list_categories

    # ── Entities (CRUD for all game tables) ───────────────────────
    get "/entities/:table", AdminController, :list_entities
    get "/entities/:table/:id", AdminController, :get_entity
    post "/entities/:table", AdminController, :create_entity
    put "/entities/:table/:id", AdminController, :update_entity
    delete "/entities/:table/:id", AdminController, :delete_entity

    # ── Players ───────────────────────────────────────────────────
    get "/players", AdminController, :list_players
    get "/players/:id", AdminController, :get_player
    post "/players/:id/ban", AdminController, :ban_player
    post "/players/:id/unban", AdminController, :unban_player
    post "/players/:id/set-role", AdminController, :set_role
    post "/players/:id/give-gold", AdminController, :give_gold
    post "/players/:id/give-item", AdminController, :give_item

    # ── Broadcast ─────────────────────────────────────────────────
    post "/broadcast", AdminController, :broadcast_message

    # ── Mod Panel ─────────────────────────────────────────────────
    get "/reports", AdminController, :list_reports
    post "/reports/:id/resolve", AdminController, :resolve_report
    get "/mod/online", AdminController, :online_players
    get "/mod/chat-log", AdminController, :chat_log

    # ── Campaign Rulesets ────────────────────────────────────────
    get "/rulesets", RulesetController, :index
    post "/rulesets", RulesetController, :create
    get "/rulesets/:id", RulesetController, :show
    put "/rulesets/:id", RulesetController, :update
    delete "/rulesets/:id", RulesetController, :delete
    get "/rulesets/:id/windows", RulesetController, :windows
    get "/rulesets/:id/modifiers", RulesetController, :modifiers
  end

  # ══════════════════════════════════════════════════════════════════
  # ADMIN LIVEVIEW (replaces React AdminSauce)
  # ══════════════════════════════════════════════════════════════════

  scope "/sauce", TePhoenixWeb.Admin do
    pipe_through [:browser, :fetch_session]

    live_session :admin_sauce, on_mount: TePhoenixWeb.Admin.RequireStaffHook do
      live "/", DashboardLive, :index
      live "/uile", UileLive, :index
      live "/gods_eye", GodsEyeLive, :index
      live "/jarvis", UileLive, :index
      live "/onboarding", OnboardingLive, :index
      live "/capabilities", CapabilitiesLive, :index
      live "/settings", SettingsLive, :index
      live "/entities", EntityManagerLive, :index
      live "/players", PlayerManagerLive, :index
      live "/players/:id", PlayerProfileLive, :show
      live "/characters/create", CharacterCreateLive, :new
      live "/world", WorldHubLive, :index
      live "/world/maps/:id/edit", MapEditorLive, :edit
      live "/world/map-connections", MapConnectionsLive, :index
      live "/world/objectives", ObjectivesLive, :index
      live "/world/waves", WavesLive, :index
      live "/dialogue", DialogueTreeLive, :index
      live "/quests", QuestDesignerLive, :index
      live "/scripts", ScriptListLive, :index
      live "/scripts/:id/edit", ScriptEditorLive, :edit
      live "/matches", MatchModesLive, :index
      live "/combat", CombatHubLive, :index
      live "/combat/statuses", CombatStatusesLive, :index
      live "/combat/rules", CombatRulesLive, :index
      live "/combat/bosses", BossPhasesLive, :index
      live "/combat/surfaces", SurfacesLive, :index
      live "/content", ContentHubLive, :index
      live "/social", SocialHubLive, :index
      live "/campaigns", CampaignHubLive, :index
      live "/gm", GmHubLive, :index
      live "/gameplay", GameplayHubLive, :index
      live "/magic", MagicHubLive, :index
      live "/roles", RoleManagerLive, :index
      live "/system", SystemHubLive, :index
      live "/economy", EconomyHubLive, :index
      live "/config", ConfigHubLive, :index
    end
  end
end
