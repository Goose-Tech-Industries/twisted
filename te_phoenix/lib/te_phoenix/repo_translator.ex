defmodule TePhoenix.Repo.Result do
  @enforce_keys []
  defstruct [:command, :columns, :rows, :num_rows, :last_insert_id, :connection_id, :messages]
end

defmodule TePhoenix.RepoTranslator do
  @moduledoc """
  Transparent query translator macro and engine for `TePhoenix.Repo`.
  Enables the application to execute legacy MySQL-formatted raw SQL
  transparently against PostgreSQL (e.g., parameter placeholders `?` -> `$1`,
  backtick column identifiers -> double quotes, DDL syntax, and `INSERT IGNORE`).
  """

  @tables_with_id MapSet.new([
    "characters", "character_cards", "character_companions", "character_equipment",
    "character_known_spells", "character_learned_recipes", "character_oghams",
    "character_progress_counters", "character_spell_cooldowns", "character_titles",
    "character_achievements", "game_achievements", "game_action_windows",
    "game_autotile_groups", "game_backgrounds", "game_battle_commands",
    "game_battle_referees", "game_bounty_boards", "game_bounty_tasks",
    "game_buildings", "game_campaign_rulesets", "game_card_matches",
    "game_card_rules", "game_cards", "game_case_clues", "game_case_suspects",
    "game_catacomb_dungeons", "game_catacomb_rooms", "game_character_action_log",
    "game_character_bounties", "game_class_skills", "game_classes",
    "game_colossus_raids", "game_companion_affinity_tiers", "game_craft_recipes",
    "game_dm_campaign_players", "game_dm_campaigns", "game_dm_character_sheets",
    "game_dm_session_log", "game_elements", "game_feats", "game_forensic_cases",
    "game_gathering_skills", "game_items", "game_limit_breaks",
    "game_lottery_tickets", "game_map_drafts", "game_map_ops_log",
    "game_map_snapshots", "game_map_spawn_zones", "game_map_stamps",
    "game_maps", "game_npc_relationships", "game_npc_schedules",
    "game_npc_stalker_dramas", "game_npcs", "game_objective_instances",
    "game_ogham_families", "game_oghams", "game_party_modes",
    "game_party_players", "game_party_rooms", "game_party_state",
    "game_physical_shelves", "game_player_armies", "game_player_buildings",
    "game_player_shopping_baskets", "game_properties", "game_property_stashes",
    "game_property_trophies", "game_quest_defs", "game_quests", "game_races",
    "game_rules", "game_ruleset_modifiers", "game_safehouse_alembic",
    "game_safehouse_dispatches", "game_safehouse_runes", "game_scheduled_tasks",
    "game_skills", "game_spawns", "game_spells", "game_statuses",
    "game_subclasses", "game_tile_types", "game_town_lottery",
    "game_visual_scripts", "gm_notes", "staff_messages", "system_settings",
    "users", "vision_radius_overrides", "game_map_event_rows", "game_map_object_rows"
  ])

  defmacro __before_compile__(_env) do
    quote do
      defoverridable query: 3, query!: 3

      def query(sql, params, opts) do
        {sql, params, expects_returning} = TePhoenix.RepoTranslator.translate(sql, params)
        case super(sql, params, opts) do
          {:ok, result} -> {:ok, TePhoenix.RepoTranslator.wrap_result(result, expects_returning)}
          error -> error
        end
      end

      def query!(sql, params, opts) do
        {sql, params, expects_returning} = TePhoenix.RepoTranslator.translate(sql, params)
        super(sql, params, opts)
        |> TePhoenix.RepoTranslator.wrap_result(expects_returning)
      end
    end
  end

  @doc """
  Translates a SQL query string and parameter list into PostgreSQL-compatible format.
  """
  def translate(sql, params) when is_binary(sql) do
    translated_sql =
      sql
      |> replace_escaped_quotes()
      |> replace_backticks()
      |> replace_mysql_types()
      |> replace_insert_ignore()
      |> replace_on_duplicate_key()
      |> replace_placeholders()

    {final_sql, expects_returning} = maybe_append_returning_id(translated_sql)

    {final_sql, params, expects_returning}
  end

  def translate(sql, params), do: {sql, params, false}

  defp replace_escaped_quotes(sql) do
    sql
    |> String.replace("\\'", "''")
    |> String.replace("\\\"", "\"")
  end

  defp maybe_append_returning_id(sql) do
    case Regex.run(~r/^\s*INSERT\s+INTO\s+["`]?(\w+)["`]?/i, sql) do
      [_, table_name] ->
        table_lower = String.downcase(table_name)
        if MapSet.member?(@tables_with_id, table_lower) and not String.contains?(String.upcase(sql), "RETURNING") do
          trimmed = sql |> String.trim_trailing() |> String.trim_trailing(";")
          {trimmed <> " RETURNING id", true}
        else
          {sql, false}
        end

      _ ->
        {sql, false}
    end
  end

  def wrap_result(%Postgrex.Result{} = result, expects_returning) do
    last_id =
      cond do
        expects_returning ->
          case result.rows do
            [[id | _] | _] when is_integer(id) -> id
            _ -> 0
          end

        result.command == :insert and is_list(result.rows) and result.rows != [] ->
          case result.rows do
            [[id | _] | _] when is_integer(id) -> id
            _ -> 0
          end

        true ->
          0
      end

    %TePhoenix.Repo.Result{
      command: result.command,
      columns: result.columns,
      rows: result.rows,
      num_rows: result.num_rows,
      last_insert_id: last_id,
      connection_id: result.connection_id,
      messages: result.messages
    }
  end

  def wrap_result(%TePhoenix.Repo.Result{} = result, _), do: result
  def wrap_result(other, _), do: other

  # 1. Replace backticks `col` -> "col"
  defp replace_backticks(sql) do
    Regex.replace(~r/`([^`]+)`/, sql, "\"\\1\"")
  end

  # 2. Replace MySQL DDL quirks, date functions, and inline index syntax
  defp replace_mysql_types(sql) do
    sql
    |> String.replace(~r/\bBIGINT\s+UNSIGNED\s+AUTO_INCREMENT\b/i, "BIGSERIAL")
    |> String.replace(~r/\bBIGINT\s+AUTO_INCREMENT\b/i, "BIGSERIAL")
    |> String.replace(~r/\bINT\s+UNSIGNED\s+AUTO_INCREMENT\b/i, "SERIAL")
    |> String.replace(~r/\bINT\s+AUTO_INCREMENT\b/i, "SERIAL")
    |> String.replace(~r/\bAUTO_INCREMENT\b/i, "SERIAL")
    |> String.replace(~r/\bAS\s+SIGNED(\s+INTEGER)?\b/i, "AS BIGINT")
    |> String.replace(~r/\bAS\s+UNSIGNED(\s+INTEGER)?\b/i, "AS BIGINT")
    |> String.replace(~r/\bUNSIGNED\b/i, "")
    |> String.replace(~r/\bTINYINT(\(\d+\))?/i, "SMALLINT")
    |> String.replace(~r/\bLONGTEXT\b/i, "TEXT")
    |> String.replace(~r/\bMEDIUMTEXT\b/i, "TEXT")
    |> String.replace(~r/\bDATETIME(\(\d+\))?/i, "TIMESTAMP")
    |> String.replace(~r/\bINT\(\d+\)/i, "INT")
    |> String.replace(~r/\bON\s+UPDATE\s+CURRENT_TIMESTAMP\b/i, "")
    |> String.replace(~r/\bIFNULL\(/i, "COALESCE(")
    |> replace_mysql_if()
    |> replace_date_add_sub()
    |> replace_mysql_show_index()
    |> replace_mysql_alter_table()
    |> clean_mysql_create_table_indexes()
  end

  defp replace_mysql_if(sql) do
    Regex.replace(~r/\bIF\s*\(([^,]+),\s*([^,]+(?:\([^)]*\))?)\s*,\s*([^)]+)\)/i, sql, "CASE WHEN \\1 THEN \\2 ELSE \\3 END")
  end

  defp replace_date_add_sub(sql) do
    sql
    |> (&Regex.replace(~r/DATE_ADD\s*\(\s*(NOW\(\)|CURRENT_TIMESTAMP)\s*,\s*INTERVAL\s+([^)]+?)\s+([A-Z]+)\s*\)/i, &1, "(\\1 + ((\\2) * INTERVAL '1 \\3'))")).()
    |> (&Regex.replace(~r/DATE_SUB\s*\(\s*(NOW\(\)|CURRENT_TIMESTAMP)\s*,\s*INTERVAL\s+([^)]+?)\s+([A-Z]+)\s*\)/i, &1, "(\\1 - ((\\2) * INTERVAL '1 \\3'))")).()
  end

  defp replace_mysql_show_index(sql) do
    case Regex.run(~r/SHOW\s+INDEX\s+FROM\s+(\w+)\s+WHERE\s+Key_name\s*=\s*'([^']+)'/i, sql) do
      [_, table, key] ->
        "SELECT indexname AS \"Key_name\" FROM pg_indexes WHERE tablename = '#{String.downcase(table)}' AND indexname = '#{key}'"
      _ ->
        sql
    end
  end

  defp replace_mysql_alter_table(sql) do
    Regex.replace(
      ~r/ALTER\s+TABLE\s+(\w+)\s+ADD\s+UNIQUE\s+KEY\s+(\w+)\s*(\([^)]+\))/i,
      sql,
      "ALTER TABLE \\1 ADD CONSTRAINT \\2 UNIQUE \\3"
    )
  end

  # Clean inline MySQL INDEX / KEY / UNIQUE KEY in CREATE TABLE statements
  defp clean_mysql_create_table_indexes(sql) do
    if String.starts_with?(String.trim_leading(sql), "CREATE TABLE") do
      sql
      # UNIQUE KEY uk_name (col1, col2) -> UNIQUE (col1, col2)
      |> (&Regex.replace(~r/,\s*UNIQUE\s+KEY\s+\w+\s*(\([^)]+\))/i, &1, ", UNIQUE \\1")).()
      # Strip inline INDEX or KEY idx_name (col)
      |> (&Regex.replace(~r/,\s*(INDEX|KEY)\s+\w+\s*\([^)]+\)/i, &1, "")).()
      # Strip ENGINE=... DEFAULT CHARSET=... COLLATE=...
      |> (&Regex.replace(~r/\)\s*(ENGINE\b|DEFAULT\s+CHARSET\b|COLLATE\b)[^;]*/is, &1, ")")).()
    else
      sql
    end
  end

  # 3. Replace INSERT IGNORE INTO ... with INSERT INTO ... ON CONFLICT DO NOTHING
  defp replace_insert_ignore(sql) do
    if Regex.match?(~r/\bINSERT\s+IGNORE\s+INTO\b/i, sql) do
      base = Regex.replace(~r/\bINSERT\s+IGNORE\s+INTO\b/i, sql, "INSERT INTO")
      if String.contains?(String.upcase(base), "ON CONFLICT") do
        base
      else
        base <> " ON CONFLICT DO NOTHING"
      end
    else
      sql
    end
  end

  @conflict_targets %{
    "character_achievements" => "character_id, achievement_id",
    "character_cards" => "character_id, card_id",
    "character_companions" => "character_id, npc_id",
    "character_equipment" => "character_id, slot_key",
    "character_items" => "character_id, item_id",
    "character_bank" => "character_id, item_id",
    "character_gathering_levels" => "character_id, skill_id",
    "character_bounties" => "character_id, bounty_id",
    "character_ability_scores" => "character_id, ability_key",
    "character_creatures" => "character_id, npc_id",
    "character_friends" => "character_id, friend_char_id",
    "character_known_spells" => "character_id, spell_id",
    "character_learned_recipes" => "character_id, recipe_id",
    "character_oghams" => "character_id, item_id, slot_index",
    "character_progress_counters" => "character_id, counter_key",
    "character_spell_cooldowns" => "character_id, spell_key",
    "character_titles" => "character_id, title_id",
    "character_techniques" => "character_id, technique_id",
    "game_achievements" => "key_name",
    "game_autotile_groups" => "group_key",
    "game_battle_referees" => "battle_id, user_id",
    "game_bounty_boards" => "board_key",
    "game_buildings" => "map_id, building_key",
    "game_class_skills" => "class_id, skill_id",
    "game_dm_campaign_players" => "campaign_id, user_id",
    "game_dm_character_sheets" => "campaign_id, user_id",
    "game_forensic_cases" => "case_code",
    "game_map_ops_log" => "map_id, op_id",
    "game_npc_relationships" => "npc_id_a, npc_id_b",
    "game_party_modes" => "key",
    "game_party_rooms" => "code",
    "game_party_state" => "room_id",
    "game_player_armies" => "char_id, unit_key",
    "game_player_buildings" => "char_id, building_key",
    "game_player_resources" => "char_id, resource_type",
    "game_player_shopping_baskets" => "char_id, shop_id",
    "game_quest_defs" => "key",
    "game_quest_progress" => "char_id, quest_id",
    "game_faction_rep" => "char_id, faction",
    "character_seen_tiles" => "character_id, map_id, x, y",
    "game_spells" => "key",
    "game_map_object_state" => "map_id, object_index",
    "game_battle_logs" => "battle_id",
    "game_capability_state" => "capability_id",
    "world_flags" => "flag_key",
    "game_world_flags" => "flag",
    "system_settings" => "setting_key",
    "branding_settings" => "setting_key",
    "lfp_listings" => "character_id",
    "characters" => "id"
  }

  # 4. Replace ON DUPLICATE KEY UPDATE with ON CONFLICT (...) DO UPDATE SET
  defp replace_on_duplicate_key(sql) do
    if Regex.match?(~r/\bON\s+DUPLICATE\s+KEY\s+UPDATE\b/i, sql) do
      table =
        case Regex.run(~r/INSERT\s+INTO\s+["`]?(\w+)["`]?/i, sql) do
          [_, t] -> String.downcase(t)
          _ -> nil
        end

      target = Map.get(@conflict_targets, table, "id")

      transformed =
        sql
        |> (&Regex.replace(~r/\bON\s+DUPLICATE\s+KEY\s+UPDATE\b/i, &1, "ON CONFLICT (#{target}) DO UPDATE SET")).()
        |> (&Regex.replace(~r/\bVALUES\s*\(\s*([a-zA-Z0-9_"`]+)\s*\)/i, &1, "EXCLUDED.\\1")).()

      if table do
        qualify_update_set_columns(transformed, table)
      else
        transformed
      end
    else
      sql
    end
  end

  defp qualify_update_set_columns(sql, table) do
    case String.split(sql, ~r/\bDO\s+UPDATE\s+SET\b/i, parts: 2) do
      [before_set, set_clause] ->
        assignments = String.split(set_clause, ",")

        new_assignments =
          Enum.map(assignments, fn assign ->
            case String.split(assign, "=", parts: 2) do
              [lhs, rhs] ->
                clean_lhs = lhs |> String.trim() |> String.replace(~r/["`]/, "")
                qualified_rhs = Regex.replace(~r/(?<!\.)\b#{Regex.escape(clean_lhs)}\b/, rhs, "#{table}.#{clean_lhs}")
                "#{lhs}=#{qualified_rhs}"

              _ ->
                assign
            end
          end)

        before_set <> "DO UPDATE SET" <> Enum.join(new_assignments, ",")

      _ ->
        sql
    end
  end

  # 5. Replace '?' with '$1', '$2', ... outside of string literals
  defp replace_placeholders(sql) do
    parts = Regex.split(~r/'(?:[^']|'')*'/, sql, include_captures: true)

    {new_parts, _} =
      Enum.reduce(parts, {[], 1}, fn part, {acc, counter} ->
        if String.starts_with?(part, "'") do
          {[part | acc], counter}
        else
          {replaced, new_counter} = replace_question_marks(part, counter)
          {[replaced | acc], new_counter}
        end
      end)

    new_parts |> Enum.reverse() |> Enum.join()
  end

  defp replace_question_marks(str, counter) do
    if String.contains?(str, "?") do
      chars = String.graphemes(str)
      {new_chars, final_counter} =
        Enum.reduce(chars, {[], counter}, fn
          "?", {acc, idx} -> {["$#{idx}" | acc], idx + 1}
          char, {acc, idx} -> {[char | acc], idx}
        end)

      {new_chars |> Enum.reverse() |> Enum.join(), final_counter}
    else
      {str, counter}
    end
  end
end
