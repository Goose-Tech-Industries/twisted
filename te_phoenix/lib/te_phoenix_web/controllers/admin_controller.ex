defmodule TePhoenixWeb.AdminController do
  @moduledoc """
  Admin panel endpoints: settings, generic entity CRUD, player management,
  broadcast, and mod panel. Ported from routes/admin-settings.js,
  routes/admin-entities.js, routes/admin-players.js, routes/admin-broadcast.js,
  and routes/modPanel.js.
  """

  use TePhoenixWeb, :controller

  alias TePhoenix.Repo
  alias TePhoenix.Game.PlayerRegistry

  # ── Table whitelist for generic entity CRUD ──────────────────────

  @allowed_tables ~w(
    game_items game_npcs game_maps game_skills game_classes game_races
    game_quests game_statuses game_elements game_shops game_shop_supplies
    game_arenas game_regions game_achievements game_tile_types
    game_tile_animations game_battles game_settings system_settings
    game_inns game_mounts game_cards game_bounty_boards game_bounty_tasks
    game_fishing_spots game_gathering_nodes game_gathering_skills
    game_world_events game_scheduled_tasks game_structure_templates
    game_capsule_items game_training_config game_signature_abilities
    game_raid_bosses game_tournaments game_jobs game_housing
    game_cutscenes game_dm_campaigns
    game_dm_character_sheets game_dm_session_log game_dm_campaign_players
    game_campaign_rulesets game_action_windows game_ruleset_modifiers
    game_sagas game_saga_chapters game_saga_events game_saga_lore game_saga_participants
    game_techniques game_technique_abilities game_technique_learn_rules
    game_battle_templates game_battle_commands game_battle_conditions
    game_battle_items game_battle_terrain game_battle_rules
    game_limit_breaks game_ki_moves game_combo_chains game_combo_arts
    game_finishing_moves game_fusions game_fusion_types game_summons
    game_transformations game_passive_abilities game_formation_shapes
    game_terrain_interactions game_siege_structures game_win_conditions
    game_boss_phases game_enemy_scaling game_body_types game_limb_zones
    game_oghams game_ogham_families game_ogham_awakenings game_ogham_shards
    game_shard_recipes game_ogham_fusions game_ogham_corruption_tiers
    game_spell_tomes game_elemental_affinities game_elemental_reactions
    game_item_curses game_enchantments game_magic_schools game_rituals
    game_magic_resistances game_status_immunities game_fighting_styles
    game_fighting_style_ranks game_premade_sig_techs
    game_backgrounds game_feats game_subclasses game_class_mastery
    game_class_skills game_race_class_access game_racial_abilities
    game_stat_definitions game_stat_caps game_ability_scores game_ability_effects
    game_race_ability_bonuses game_class_ability_bonuses game_background_ability_bonuses
    game_equip_slots game_loot_tables game_craft_recipes game_quest_board
    game_arena_seasons game_season_effects game_capture_items
    game_treasure_trails game_furniture game_housing_plots game_card_rules
    game_dice_tables game_puzzles game_minigames game_item_sets
    game_roles game_titles game_themes game_auto_mod_rules
    game_npc_patrols game_npc_schedules game_npc_relationships game_npc_techniques
    game_companion_quests game_scheduled_events game_config_profiles
    game_scripts game_flavor_texts game_flavor_keywords game_discovery_themes
    game_defense_formulas game_battle_traps game_weapon_triangle
    game_bleed_tiers game_death_penalties game_battle_knockouts
    game_spell_slot_table game_link_attacks game_action_commands
    game_afterlife_worlds game_alignment_actions game_alignment_tiers
    game_scouter_tiers game_sensing_rules game_terminology game_templates
    game_map_hazards game_map_sound_zones game_region_weather game_region_rep_gates
    game_autotile_groups game_spawn_waves game_map_versions game_travel_routes
    game_weather_effects game_deployed_structures game_quest_battle_overrides
    legendary_artifacts artifact_powers artifact_hunts artifact_shrines
    game_relic_sets game_relic_radars game_assets game_webhooks
    game_artifact_rivalries codex_entries codex_discoveries
    staff_permissions staff_broadcast_templates game_signature_levels
    admin_role_sections gm_notes player_reports player_warnings player_appeals
    guilds npc_factions npc_memories npc_rumors level_requirements
    progression_config auction_listings factions world_flags
  )

  @valid_roles ~w(PLAYER MOD GM ADMIN OWNER)

  # =====================================================================
  # SETTINGS (from admin-settings.js)
  # =====================================================================

  def list_settings(conn, _params) do
    rows = query_rows("SELECT * FROM system_settings ORDER BY category, setting_key")
    json(conn, %{success: true, data: rows})
  end

  def update_setting(conn, %{"setting_key" => key, "setting_value" => value}) do
    case Repo.query(
      "UPDATE system_settings SET setting_value=? WHERE setting_key=?",
      [value, key]
    ) do
      {:ok, %{num_rows: n}} when n > 0 ->
        log_event("setting_update", conn.assigns[:user_id], nil, nil, nil, %{key: key})
        json(conn, %{success: true, message: "Setting updated."})

      _ ->
        json(conn, %{success: false, message: "Setting not found."})
    end
  end

  def update_setting(conn, _params) do
    json(conn, %{success: false, message: "setting_key and setting_value required."})
  end

  def list_categories(conn, _params) do
    rows = query_rows("SELECT DISTINCT category FROM system_settings ORDER BY category")
    categories = Enum.map(rows, fn r -> r["category"] end)
    json(conn, %{success: true, categories: categories})
  end

  # =====================================================================
  # GENERIC ENTITY CRUD (from admin-entities.js)
  # =====================================================================

  def list_entities(conn, %{"table" => table} = params) do
    case validate_table(table) do
      :ok ->
        page = max(parse_int(params["page"] || "1"), 1)
        limit = min(max(parse_int(params["limit"] || "50"), 1), 200)
        offset = (page - 1) * limit

        count_rows = query_rows(
          "SELECT COUNT(*) AS total FROM #{table}"
        )
        total = case count_rows do
          [%{"total" => t}] -> t
          _ -> 0
        end

        rows = query_rows(
          "SELECT * FROM #{table} ORDER BY id DESC LIMIT ? OFFSET ?",
          [limit, offset]
        )

        json(conn, %{success: true, data: rows, total: total, page: page, limit: limit})

      {:error, msg} ->
        conn |> put_status(400) |> json(%{success: false, message: msg})
    end
  end

  def list_entities(conn, _params) do
    conn |> put_status(400) |> json(%{success: false, message: "table param required."})
  end

  def get_entity(conn, %{"table" => table, "id" => id}) do
    case validate_table(table) do
      :ok ->
        case Repo.query("SELECT * FROM #{table} WHERE id=? LIMIT 1", [parse_int(id)]) do
          {:ok, %{rows: [row], columns: cols}} ->
            json(conn, %{success: true, data: Enum.zip(cols, row) |> Map.new()})

          _ ->
            json(conn, %{success: false, message: "Not found."})
        end

      {:error, msg} ->
        conn |> put_status(400) |> json(%{success: false, message: msg})
    end
  end

  def create_entity(conn, %{"table" => table} = params) do
    case validate_table(table) do
      :ok ->
        # Get valid columns from the table
        valid_cols = get_table_columns(table)
        data = build_entity_data(params, valid_cols)

        case data do
          d when map_size(d) == 0 ->
            conn |> put_status(400) |> json(%{success: false, message: "No valid data."})

          d ->
            {cols_list, vals} = Enum.unzip(d)
            placeholders = Enum.map(cols_list, fn _ -> "?" end) |> Enum.join(", ")
            col_names = Enum.join(cols_list, ", ")

            case Repo.query(
              "INSERT INTO #{table} (#{col_names}) VALUES (#{placeholders})",
              vals
            ) do
              {:ok, %{last_insert_id: insert_id}} ->
                case Repo.query("SELECT * FROM #{table} WHERE id=? LIMIT 1", [insert_id]) do
                  {:ok, %{rows: [row], columns: rcols}} ->
                    json(conn, %{success: true, data: Enum.zip(rcols, row) |> Map.new()})

                  _ ->
                    json(conn, %{success: true, id: insert_id})
                end

              {:error, err} ->
                json(conn, %{success: false, message: "Insert failed: #{inspect(err.message)}"})
            end
        end

      {:error, msg} ->
        conn |> put_status(400) |> json(%{success: false, message: msg})
    end
  end

  def update_entity(conn, %{"table" => table, "id" => id} = params) do
    case validate_table(table) do
      :ok ->
        valid_cols = get_table_columns(table)
        data = build_entity_data(params, valid_cols)

        case data do
          d when map_size(d) == 0 ->
            conn |> put_status(400) |> json(%{success: false, message: "No valid data."})

          d ->
            set_clause =
              Enum.map(d, fn {col, _val} -> "#{col}=?" end)
              |> Enum.join(", ")

            vals = Enum.map(d, fn {_col, val} -> val end)

            case Repo.query(
              "UPDATE #{table} SET #{set_clause} WHERE id=?",
              vals ++ [parse_int(id)]
            ) do
              {:ok, _} ->
                case Repo.query("SELECT * FROM #{table} WHERE id=? LIMIT 1", [parse_int(id)]) do
                  {:ok, %{rows: [row], columns: cols}} ->
                    json(conn, %{success: true, data: Enum.zip(cols, row) |> Map.new()})

                  _ ->
                    json(conn, %{success: true})
                end

              {:error, err} ->
                json(conn, %{success: false, message: "Update failed: #{inspect(err.message)}"})
            end
        end

      {:error, msg} ->
        conn |> put_status(400) |> json(%{success: false, message: msg})
    end
  end

  def delete_entity(conn, %{"table" => table, "id" => id}) do
    case validate_table(table) do
      :ok ->
        case Repo.query("DELETE FROM #{table} WHERE id=?", [parse_int(id)]) do
          {:ok, %{num_rows: n}} when n > 0 ->
            log_event("entity_delete", conn.assigns[:user_id], nil, nil, nil, %{table: table, id: id})
            json(conn, %{success: true, message: "Deleted."})

          {:ok, _} ->
            json(conn, %{success: false, message: "Not found."})

          {:error, err} ->
            json(conn, %{success: false, message: "Delete failed: #{inspect(err.message)}"})
        end

      {:error, msg} ->
        conn |> put_status(400) |> json(%{success: false, message: msg})
    end
  end

  # =====================================================================
  # PLAYERS (from admin-players.js)
  # =====================================================================

  def list_players(conn, params) do
    page = max(parse_int(params["page"] || "1"), 1)
    limit = min(max(parse_int(params["limit"] || "50"), 1), 200)
    offset = (page - 1) * limit
    q = (params["q"] || "") |> String.trim()

    {where, where_params} =
      if q != "" do
        {"WHERE u.username LIKE ? OR u.email LIKE ?", ["%#{q}%", "%#{q}%"]}
      else
        {"", []}
      end

    count_rows = query_rows(
      "SELECT COUNT(*) AS total FROM users u #{where}",
      where_params
    )
    total = case count_rows do
      [%{"total" => t}] -> t
      _ -> 0
    end

    rows = query_rows(
      """
      SELECT u.id, u.username, u.email, u.role, u.currency AS gold,
             u.is_banned, u.created_at, u.last_login,
             COUNT(c.id) AS char_count
      FROM users u
      LEFT JOIN characters c ON c.user_id=u.id
      #{where}
      GROUP BY u.id
      ORDER BY u.last_login DESC
      LIMIT ? OFFSET ?
      """,
      where_params ++ [limit, offset]
    )

    json(conn, %{success: true, data: rows, total: total, page: page, limit: limit})
  end

  def get_player(conn, %{"id" => id}) do
    user_id = parse_int(id)

    case Repo.query(
      "SELECT id, username, email, role, currency, is_banned, created_at, last_login FROM users WHERE id=?",
      [user_id]
    ) do
      {:ok, %{rows: [row], columns: cols}} ->
        user = Enum.zip(cols, row) |> Map.new()

        chars = query_rows(
          """
          SELECT c.*, gc.name AS class_name, gr.name AS race_name
          FROM characters c
          LEFT JOIN game_classes gc ON gc.id=c.class_id
          LEFT JOIN game_races gr ON gr.id=c.race_id
          WHERE c.user_id=?
          ORDER BY c.level DESC
          """,
          [user_id]
        )

        activity = query_rows(
          """
          SELECT * FROM game_event_log
          WHERE target_id=? OR actor_id=?
          ORDER BY created_at DESC LIMIT 20
          """,
          [user_id, user_id]
        )

        json(conn, %{success: true, data: %{user: user, chars: chars, activity: activity}})

      _ ->
        json(conn, %{success: false, message: "User not found."})
    end
  end

  def ban_player(conn, %{"id" => id}) do
    user_id = parse_int(id)

    case Repo.query("UPDATE users SET is_banned=1 WHERE id=?", [user_id]) do
      {:ok, _} ->
        log_event("gm_ban", conn.assigns[:user_id], nil, user_id, nil, %{})
        json(conn, %{success: true, message: "Player banned."})

      {:error, err} ->
        json(conn, %{success: false, message: "Ban failed: #{inspect(err.message)}"})
    end
  end

  def unban_player(conn, %{"id" => id}) do
    user_id = parse_int(id)

    case Repo.query("UPDATE users SET is_banned=0 WHERE id=?", [user_id]) do
      {:ok, _} ->
        log_event("gm_unban", conn.assigns[:user_id], nil, user_id, nil, %{})
        json(conn, %{success: true, message: "Player unbanned."})

      {:error, err} ->
        json(conn, %{success: false, message: "Unban failed: #{inspect(err.message)}"})
    end
  end

  def set_role(conn, %{"id" => id, "role" => role}) do
    if role in @valid_roles do
      user_id = parse_int(id)

      case Repo.query("UPDATE users SET role=? WHERE id=?", [role, user_id]) do
        {:ok, _} ->
          log_event("gm_role_change", conn.assigns[:user_id], nil, user_id, nil, %{role: role})
          json(conn, %{success: true, message: "Role set to #{role}."})

        {:error, err} ->
          json(conn, %{success: false, message: "Role change failed: #{inspect(err.message)}"})
      end
    else
      json(conn, %{success: false, message: "Invalid role."})
    end
  end

  def set_role(conn, _params) do
    json(conn, %{success: false, message: "id and role required."})
  end

  def give_gold(conn, %{"id" => id, "amount" => amount}) do
    user_id = parse_int(id)
    amt = parse_int(amount)

    if amt == 0 do
      json(conn, %{success: false, message: "Amount must be non-zero."})
    else
      case Repo.query("UPDATE users SET currency=GREATEST(0, currency+?) WHERE id=?", [amt, user_id]) do
        {:ok, _} ->
          log_event("gm_give_gold", conn.assigns[:user_id], nil, user_id, nil, %{amount: amt})
          json(conn, %{success: true, message: "#{if amt > 0, do: "+", else: ""}#{amt} gold applied."})

        {:error, err} ->
          json(conn, %{success: false, message: "Give gold failed: #{inspect(err.message)}"})
      end
    end
  end

  def give_gold(conn, _params) do
    json(conn, %{success: false, message: "id and amount required."})
  end

  def give_item(conn, %{"id" => _id, "charId" => char_id, "itemId" => item_id} = params) do
    cid = parse_int(char_id)
    iid = parse_int(item_id)
    qty = max(parse_int(params["qty"] || "1"), 1)

    case Repo.query(
      """
      INSERT INTO character_items (character_id, item_id, quantity)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE quantity=quantity+?
      """,
      [cid, iid, qty, qty]
    ) do
      {:ok, _} ->
        json(conn, %{success: true, message: "Item granted."})

      {:error, err} ->
        json(conn, %{success: false, message: "Give item failed: #{inspect(err.message)}"})
    end
  end

  def give_item(conn, _params) do
    json(conn, %{success: false, message: "charId and itemId required."})
  end

  # =====================================================================
  # BROADCAST (from admin-broadcast.js)
  # =====================================================================

  def broadcast_message(conn, %{"message" => message}) do
    TePhoenixWeb.Endpoint.broadcast!("social:lobby", "system_broadcast", %{
      message: message,
      from: "SYSTEM",
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
    })

    log_event("broadcast", conn.assigns[:user_id], nil, nil, nil, %{message: message})
    json(conn, %{success: true, message: "Broadcast sent."})
  end

  def broadcast_message(conn, _params) do
    json(conn, %{success: false, message: "message required."})
  end

  # =====================================================================
  # MOD PANEL (from modPanel.js)
  # =====================================================================

  def list_reports(conn, _params) do
    rows = query_rows(
      "SELECT * FROM player_reports ORDER BY created_at DESC LIMIT 100"
    )
    json(conn, %{success: true, data: rows})
  end

  def resolve_report(conn, %{"id" => id}) do
    case Repo.query(
      "UPDATE player_reports SET status='actioned' WHERE id=?",
      [parse_int(id)]
    ) do
      {:ok, %{num_rows: n}} when n > 0 ->
        log_event("resolve_report", conn.assigns[:user_id], nil, nil, nil, %{report_id: id})
        json(conn, %{success: true, message: "Report resolved."})

      {:ok, _} ->
        json(conn, %{success: false, message: "Report not found."})

      {:error, err} ->
        json(conn, %{success: false, message: "Resolve failed: #{inspect(err.message)}"})
    end
  end

  def online_players(conn, _params) do
    players = PlayerRegistry.all()
    json(conn, %{success: true, data: players, count: length(players)})
  end

  def chat_log(conn, params) do
    limit = min(max(parse_int(params["limit"] || "100"), 1), 500)

    mod_log = query_rows(
      "SELECT * FROM auto_mod_log ORDER BY created_at DESC LIMIT ?",
      [limit]
    )

    recent_chat = query_rows(
      "SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT ?",
      [limit]
    )

    json(conn, %{success: true, mod_log: mod_log, recent_chat: recent_chat})
  end

  # =====================================================================
  # PRIVATE HELPERS
  # =====================================================================

  defp validate_table(table) when table in @allowed_tables, do: :ok

  defp validate_table(_table), do: {:error, "Invalid or disallowed table."}

  defp get_table_columns(table) do
    case Repo.query("SHOW COLUMNS FROM #{table}") do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [name | _] -> name end)
        |> MapSet.new()

      _ ->
        MapSet.new()
    end
  end

  defp build_entity_data(params, valid_cols) do
    params
    |> Enum.reject(fn {k, _v} ->
      k in ["table", "id", "_json"] or not is_binary(k)
    end)
    |> Enum.filter(fn {k, _v} ->
      sanitize_column(k) != nil and MapSet.member?(valid_cols, k)
    end)
    |> Enum.into(%{})
  end

  @column_regex ~r/^[a-zA-Z_][a-zA-Z0-9_]*$/

  defp sanitize_column(col) when is_binary(col) do
    if Regex.match?(@column_regex, col) and String.length(col) <= 64 do
      col
    else
      nil
    end
  end

  defp sanitize_column(_), do: nil

  defp query_rows(sql, params \\ []) do
    case Repo.query(sql, params) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)

      _ ->
        []
    end
  end

  defp parse_int(val) when is_integer(val), do: val

  defp parse_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end

  defp parse_int(_), do: 0

  defp log_event(type, actor_id, actor_name, target_id, target_name, detail, map_id \\ nil) do
    Repo.query(
      """
      INSERT INTO game_event_log
        (event_type, actor_id, actor_name, target_id, target_name, detail_json, map_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      """,
      [type, actor_id, actor_name, target_id, target_name, Jason.encode!(detail), map_id]
    )
  rescue
    _ -> :ok
  end
end
