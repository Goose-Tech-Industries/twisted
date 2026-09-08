defmodule TePhoenixWeb.GameController do
  @moduledoc """
  Game endpoints: character CRUD, inventory, equipment, item usage.
  Ported from routes/game-character.js, routes/game-world.js, and routes/game-social.js.
  """

  use TePhoenixWeb, :controller

  alias TePhoenix.Repo

  # ── CHARACTER CREATION OPTIONS ───────────────────────────────────
  # GET /api/character-options
  # Returns the dropdown data the create-character form needs: races,
  # classes, backgrounds, feats. All four tables are read at once so
  # the new SvelteKit player can fetch them in a single request.
  def character_options(conn, _params) do
    races =
      case Repo.query("SELECT id, name, description, icon, bonus_hp, bonus_mp, bonus_atk, bonus_def, bonus_mo, bonus_md, bonus_speed, bonus_luck FROM game_races ORDER BY id") do
        {:ok, %{rows: rows}} ->
          Enum.map(rows, fn [id, name, desc, icon, bhp, bmp, batk, bdef, bmo, bmd, bspd, blck] ->
            %{id: id, name: name, description: desc, icon: icon, bonus_hp: bhp, bonus_mp: bmp, bonus_atk: batk, bonus_def: bdef, bonus_mo: bmo, bonus_md: bmd, bonus_speed: bspd, bonus_luck: blck}
          end)
        _ -> []
      end

    classes =
      case Repo.query("SELECT id, name, description, icon, base_hp, base_mp, base_atk, base_def, base_mo, base_md, base_speed, base_luck FROM game_classes ORDER BY sort_order, id") do
        {:ok, %{rows: rows}} ->
          Enum.map(rows, fn [id, name, desc, icon, hp, mp, atk, def_s, mo, md, spd, lck] ->
            %{id: id, name: name, description: desc, icon: icon, base_hp: hp, base_mp: mp, base_atk: atk, base_def: def_s, base_mo: mo, base_md: md, base_speed: spd, base_luck: lck}
          end)
        _ -> []
      end

    backgrounds =
      case Repo.query("""
        SELECT id, name, tag, icon, description,
               bonus_hp, bonus_mp, bonus_atk, bonus_def, bonus_mo, bonus_md, bonus_speed, bonus_luck,
               bonus_str, npc_reaction, companion_reaction, enemy_reaction, reaction_json
        FROM game_backgrounds ORDER BY id
      """) do
        {:ok, %{rows: rows, columns: cols}} ->
          Enum.map(rows, fn row ->
            m = Enum.zip(cols, row) |> Map.new()
            %{
              id: m["id"],
              name: m["name"],
              tag: m["tag"],
              icon: m["icon"] || "📜",
              description: m["description"],
              bonus_hp: m["bonus_hp"] || 0,
              bonus_mp: m["bonus_mp"] || 0,
              bonus_atk: m["bonus_atk"] || 0,
              bonus_def: m["bonus_def"] || 0,
              bonus_mo: m["bonus_mo"] || 0,
              bonus_md: m["bonus_md"] || 0,
              bonus_speed: m["bonus_speed"] || 0,
              bonus_luck: m["bonus_luck"] || 0,
              bonus_str: m["bonus_str"] || "",
              npc_reaction: m["npc_reaction"] || "",
              companion_reaction: m["companion_reaction"] || "",
              enemy_reaction: m["enemy_reaction"] || "",
              reaction_json: decode_field_json(m["reaction_json"])
            }
          end)
        _ -> []
      end

    subclasses =
      case Repo.query("""
        SELECT id, class_id, name, archetype_title, description, level_req, icon,
               passive_name, passive_desc, signature_ability, stat_bonuses
        FROM game_subclasses ORDER BY class_id, id
      """) do
        {:ok, %{rows: rows, columns: cols}} ->
          Enum.map(rows, fn row ->
            m = Enum.zip(cols, row) |> Map.new()
            %{
              id: m["id"],
              class_id: m["class_id"],
              name: m["name"],
              archetype_title: m["archetype_title"],
              description: m["description"],
              level_req: m["level_req"] || 3,
              icon: m["icon"] || "⚡",
              passive_name: m["passive_name"],
              passive_desc: m["passive_desc"],
              signature_ability: m["signature_ability"],
              stat_bonuses: decode_field_json(m["stat_bonuses"])
            }
          end)
        _ -> []
      end

    feats = list_options("game_feats")

    json(conn, %{
      success: true,
      races: races,
      classes: classes,
      backgrounds: backgrounds,
      subclasses: subclasses,
      feats: feats
    })
  end

  def list_subclasses(conn, params) do
    class_id = params["class_id"] || params["classId"]

    query =
      if class_id do
        {"SELECT id, class_id, name, archetype_title, description, level_req, icon, passive_name, passive_desc, signature_ability, stat_bonuses FROM game_subclasses WHERE class_id = ? ORDER BY id", [class_id]}
      else
        {"SELECT id, class_id, name, archetype_title, description, level_req, icon, passive_name, passive_desc, signature_ability, stat_bonuses FROM game_subclasses ORDER BY class_id, id", []}
      end

    case apply(Repo, :query, Tuple.to_list(query)) do
      {:ok, %{rows: rows, columns: cols}} ->
        subclasses = Enum.map(rows, fn row ->
          m = Enum.zip(cols, row) |> Map.new()
          %{
            id: m["id"],
            class_id: m["class_id"],
            name: m["name"],
            archetype_title: m["archetype_title"],
            description: m["description"],
            level_req: m["level_req"] || 3,
            icon: m["icon"] || "⚡",
            passive_name: m["passive_name"],
            passive_desc: m["passive_desc"],
            signature_ability: m["signature_ability"],
            stat_bonuses: decode_field_json(m["stat_bonuses"])
          }
        end)
        json(conn, %{success: true, count: length(subclasses), subclasses: subclasses})

      _ ->
        json(conn, %{success: false, count: 0, subclasses: []})
    end
  end

  def specialize_subclass(conn, %{"id" => id} = params) do
    user_id = conn.assigns[:user_id]
    subclass_id = params["subclassId"] || params["subclass_id"]

    if is_nil(subclass_id) do
      json(conn, %{success: false, message: "subclass_id is required."})
    else
      case Repo.query("SELECT id, user_id, level, class_id, subclass_id, max_hp, max_mp, atk, def, mo, md, speed, luck FROM characters WHERE id = ? AND user_id = ?", [id, user_id]) do
        {:ok, %{rows: [[char_id, _uid, level, char_class_id, _current_sub_id, _cur_hp, _cur_mp, _cur_atk, _cur_def, _cur_mo, _cur_md, _cur_spd, _cur_lck]]}} ->
          cond do
            level < 3 ->
              json(conn, %{success: false, message: "Character must reach Level 3 to specialize in an archetype."})

            true ->
              case Repo.query("SELECT id, class_id, name, archetype_title, description, passive_name, passive_desc, signature_ability, stat_bonuses FROM game_subclasses WHERE id = ? AND class_id = ?", [subclass_id, char_class_id]) do
                {:ok, %{rows: [[sub_id, _cid, sub_name, sub_title, sub_desc, pass_name, pass_desc, sig_ability, stat_bonuses_raw]]}} ->
                  stat_bonuses = decode_field_json(stat_bonuses_raw)
                  b_hp = to_int(stat_bonuses["hp"], 0)
                  b_mp = to_int(stat_bonuses["mp"], 0)
                  b_atk = to_int(stat_bonuses["atk"], 0)
                  b_def = to_int(stat_bonuses["def"], 0)
                  b_mo = to_int(stat_bonuses["mo"], 0)
                  b_md = to_int(stat_bonuses["md"], 0)
                  b_spd = to_int(stat_bonuses["speed"], 0)
                  b_lck = to_int(stat_bonuses["luck"], 0)

                  Repo.query!("""
                    UPDATE characters
                    SET subclass_id = ?,
                        max_hp = max_hp + ?,
                        current_hp = current_hp + ?,
                        max_mp = max_mp + ?,
                        current_mp = current_mp + ?,
                        atk = atk + ?,
                        def = def + ?,
                        mo = mo + ?,
                        md = md + ?,
                        speed = speed + ?,
                        luck = luck + ?
                    WHERE id = ?
                  """, [sub_id, b_hp, b_hp, b_mp, b_mp, b_atk, b_def, b_mo, b_md, b_spd, b_lck, char_id])

                  try do
                    TePhoenix.Game.PlayerRegistry.update(char_id, %{
                      subclass_id: sub_id,
                      subclass_name: sub_name,
                      subclass_title: sub_title
                    })
                  rescue
                    _ -> nil
                  end

                  json(conn, %{
                    success: true,
                    message: "Ascension Complete! You have chosen the path of #{sub_name} (#{sub_title}).",
                    subclass: %{
                      id: sub_id,
                      name: sub_name,
                      archetype_title: sub_title,
                      description: sub_desc,
                      passive_name: pass_name,
                      passive_desc: pass_desc,
                      signature_ability: sig_ability,
                      stat_bonuses: stat_bonuses
                    }
                  })

                _ ->
                  json(conn, %{success: false, message: "Invalid subclass for this character's class."})
              end
          end

        _ ->
          json(conn, %{success: false, message: "Character not found."})
      end
    end
  end

  defp decode_field_json(nil), do: %{}
  defp decode_field_json(val) when is_binary(val) do
    case Jason.decode(val) do
      {:ok, data} when is_map(data) -> data
      _ -> %{}
    end
  end
  defp decode_field_json(val) when is_map(val), do: val
  defp decode_field_json(_), do: %{}

  defp list_options(table) do
    case Repo.query("SELECT id, name, description FROM `#{table}` ORDER BY id") do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, name, description] ->
          %{id: id, name: name, description: description}
        end)

      _ ->
        []
    end
  end

  # ── LIST CHARACTERS ─────────────────────────────────────────────

  def list_characters(conn, _params) do
    user_id = conn.assigns[:user_id]

    case Repo.query(
      """
      SELECT c.id, c.name, c.level, c.current_hp, c.max_hp, c.current_mp, c.max_mp,
             c.atk, c.def, c.mo, c.md, c.speed, c.luck, c.map_id, c.x, c.y, c.experience,
             c.portrait_url, c.sprite_url, c.visual_prompt, c.subclass_id,
             cl.name AS class_name, r.name AS race_name,
             bg.name AS bg_name, bg.icon AS bg_icon,
             sub.name AS subclass_name, sub.archetype_title AS subclass_title
      FROM characters c
      LEFT JOIN game_classes cl ON c.class_id = cl.id
      LEFT JOIN game_races r ON c.race_id = r.id
      LEFT JOIN game_backgrounds bg ON c.background_id = bg.id
      LEFT JOIN game_subclasses sub ON c.subclass_id = sub.id
      WHERE c.user_id = ?
      """,
      [user_id]
    ) do
      {:ok, %{columns: columns, rows: rows}} ->
        characters = Enum.map(rows, fn row ->
          columns |> Enum.zip(row) |> Map.new()
        end)

        json(conn, %{success: true, count: length(characters), characters: characters})

      _ ->
        json(conn, %{success: false, count: 0, characters: []})
    end
  end

  # ── CREATE CHARACTER ────────────────────────────────────────────

  def create_character(conn, params) do
    user_id = conn.assigns[:user_id]
    raw_name = params["name"] || ""
    name = String.trim(raw_name)
    race_id = params["raceId"] || params["race_id"]
    class_id = params["classId"] || params["class_id"]
    background_id = params["backgroundId"] || params["background_id"] || 0
    feat_id = params["featId"] || params["feat_id"] || 0

    cond do
      name == "" ->
        json(conn, %{success: false, message: "Name required."})

      String.length(name) < 2 or String.length(name) > 20 ->
        json(conn, %{success: false, message: "Character name must be 2-20 characters."})

      not Regex.match?(~r/^[a-zA-Z][a-zA-Z0-9 '\-]*$/, name) ->
        json(conn, %{success: false, message: "Name may only contain letters, numbers, spaces, hyphens, apostrophes."})

      true ->
        do_create_character(conn, user_id, name, race_id, class_id, background_id, feat_id, params)
    end
  end

  defp do_create_character(conn, user_id, name, race_id, class_id, background_id, feat_id, params) do
    # Check name taken
    case Repo.query("SELECT id FROM characters WHERE name = ?", [name]) do
      {:ok, %{rows: [_ | _]}} ->
        json(conn, %{success: false, message: "Name taken."})

      _ ->
        # Check max characters per user
        max_chars = case Repo.query("SELECT setting_value FROM system_settings WHERE setting_key = 'max_characters_per_user'") do
          {:ok, %{rows: [[val]]}} ->
            case Integer.parse(to_string(val)) do
              {n, _} -> n
              :error -> 5
            end
          _ -> 5
        end

        case Repo.query("SELECT COUNT(*) FROM characters WHERE user_id = ?", [user_id]) do
          {:ok, %{rows: [[count]]}} when count >= max_chars ->
            json(conn, %{success: false, message: "Max #{max_chars} characters."})

          _ ->
            do_create_character_validated(conn, user_id, name, race_id, class_id, background_id, feat_id, params)
        end
    end
  end

  defp do_create_character_validated(conn, user_id, name, race_id, class_id, background_id, feat_id, params) do
    # Load class and race
    with {:ok, %{rows: [[_ | _] = class_row], columns: class_cols}} <-
           Repo.query("SELECT * FROM game_classes WHERE id = ?", [class_id]),
         {:ok, %{rows: [[_ | _] = race_row], columns: race_cols}} <-
           Repo.query("SELECT * FROM game_races WHERE id = ?", [race_id]) do

      c = Enum.zip(class_cols, class_row) |> Map.new()
      r = Enum.zip(race_cols, race_row) |> Map.new()

      # Background bonuses
      bg = load_background_bonuses(background_id)

      # Feat bonuses
      {feat_bonus, start_gold} = load_feat_bonuses(feat_id)

      # Calculate final stats
      hp  = to_int(c["base_hp"], 100)    + to_int(r["bonus_hp"], 0)    + to_int(bg["bonus_hp"], 0)    + feat_bonus.hp
      mp  = to_int(c["base_mp"], 50)     + to_int(r["bonus_mp"], 0)    + to_int(bg["bonus_mp"], 0)    + feat_bonus.mp
      atk = to_int(c["base_atk"], 10)    + to_int(r["bonus_atk"], 0)   + to_int(bg["bonus_atk"], 0)   + feat_bonus.atk
      def_stat = to_int(c["base_def"], 5) + to_int(r["bonus_def"], 0)  + to_int(bg["bonus_def"], 0)   + feat_bonus.def
      mo  = to_int(c["base_mo"], 5)      + to_int(r["bonus_mo"], 0)    + to_int(bg["bonus_mo"], 0)    + feat_bonus.mo
      md  = to_int(c["base_md"], 5)      + to_int(r["bonus_md"], 0)    + to_int(bg["bonus_md"], 0)    + feat_bonus.md
      spd = to_int(c["base_speed"], 10)  + to_int(r["bonus_speed"], 0) + to_int(bg["bonus_speed"], 0) + feat_bonus.speed
      lck = to_int(c["base_luck"], 5)    + to_int(r["bonus_luck"], 0)  + to_int(bg["bonus_luck"], 0)  + feat_bonus.luck

      portrait_url = params["portraitUrl"] || params["portrait_url"] || default_portrait_for_class(c["name"])
      visual_prompt = params["visualPrompt"] || params["visual_prompt"] || ""
      state_json =
        case params["visualTraits"] || params["state_json"] do
          traits when is_map(traits) -> Jason.encode!(traits)
          str when is_binary(str) and str != "" -> str
          _ -> "{}"
        end

      case Repo.query(
        """
        INSERT INTO characters
          (user_id, name, race_id, class_id, background_id, feat_id,
           current_hp, max_hp, current_mp, max_mp,
           atk, def, mo, md, speed, luck,
           level, experience, map_id, x, y, portrait_url, visual_prompt, state_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,1,10,10,?,?,?)
        """,
        [user_id, name, race_id, class_id, background_id || 0, feat_id || 0,
         hp, hp, mp, mp, atk, def_stat, mo, md, spd, lck, portrait_url, visual_prompt, state_json]
      ) do
        {:ok, %{last_insert_id: new_id}} ->
          # Insert default stat definitions
          insert_default_stats(new_id)

          # Apply feat and background starting gold
          bg_gold =
            if to_string(bg["tag"]) == "noble" or String.contains?(to_string(bg["bonus_str"]), "Gold") do
              100
            else
              0
            end

          total_start_gold = start_gold + bg_gold

          if total_start_gold > 0 do
            Repo.query("UPDATE users SET currency = currency + ? WHERE id = ?", [total_start_gold, user_id])
          end

          # Save ability scores if provided
          ability_scores = params["abilityScores"] || params["ability_scores"]
          if is_map(ability_scores) do
            save_ability_scores(new_id, ability_scores, race_id, class_id, background_id)
          end

          # Grant starting skills
          grant_starting_skills(new_id, class_id)

          json(conn, %{success: true, message: "Character created!", charId: new_id})

        _ ->
          json(conn, %{success: false, message: "Server error."})
      end
    else
      _ ->
        json(conn, %{success: false, message: "Invalid class/race."})
    end
  end

  defp default_portrait_for_class(class_name) do
    name = (class_name || "") |> to_string() |> String.downcase()

    cond do
      String.contains?(name, ["mage", "wizard", "sorcerer", "warlock", "necro", "chrono", "glyph", "storm"]) ->
        "/portraits/portrait_mage.png"

      String.contains?(name, ["rogue", "ranger", "monk", "thief", "assassin", "shadow", "hunter", "artificer"]) ->
        "/portraits/portrait_rogue.png"

      String.contains?(name, ["cleric", "druid"]) ->
        "/portraits/portrait_mage.png"

      true ->
        "/portraits/portrait_warrior.png"
    end
  end

  # ── GET CHARACTER ───────────────────────────────────────────────

  def get_character(conn, %{"id" => id}) do
    user_id = conn.assigns[:user_id]

    case Repo.query(
      """
      SELECT c.*, cl.name AS class_name, cl.description AS class_desc,
             r.name AS race_name, r.description AS race_desc,
             bg.name AS bg_name, bg.icon AS bg_icon, bg.description AS bg_desc, bg.tag AS bg_tag,
             bg.bonus_hp AS bg_bonus_hp, bg.bonus_str AS bg_bonus_str,
             bg.npc_reaction AS bg_npc_reaction, bg.companion_reaction AS bg_companion_reaction,
             bg.enemy_reaction AS bg_enemy_reaction, bg.reaction_json AS bg_reaction_json,
             sub.name AS subclass_name, sub.archetype_title AS subclass_title,
             sub.description AS subclass_desc, sub.passive_name AS subclass_passive_name,
             sub.passive_desc AS subclass_passive_desc, sub.signature_ability AS subclass_signature_ability,
             sub.icon AS subclass_icon,
             ft.name AS feat_name, ft.description AS feat_desc
      FROM characters c
      LEFT JOIN game_classes cl ON c.class_id = cl.id
      LEFT JOIN game_races r ON c.race_id = r.id
      LEFT JOIN game_backgrounds bg ON c.background_id = bg.id
      LEFT JOIN game_subclasses sub ON c.subclass_id = sub.id
      LEFT JOIN game_feats ft ON c.feat_id = ft.id
      WHERE c.id = ? AND c.user_id = ?
      """,
      [id, user_id]
    ) do
      {:ok, %{columns: columns, rows: [row]}} ->
        character = columns |> Enum.zip(row) |> Map.new()
        json(conn, %{success: true, character: character})

      _ ->
        json(conn, %{success: false, message: "Character not found."})
    end
  end

  # ── DELETE CHARACTER ────────────────────────────────────────────

  def delete_character(conn, %{"id" => id}) do
    user_id = conn.assigns[:user_id]

    # Verify ownership and get character info
    case Repo.query("SELECT id, name, current_hp FROM characters WHERE id = ? AND user_id = ?", [id, user_id]) do
      {:ok, %{rows: [[char_id, char_name, _current_hp]]}} ->
        # Clean up related data
        related_tables = [
          "character_items", "character_equipment", "character_stats",
          "character_ability_scores", "character_skills", "character_oghams",
          "character_quests", "character_mail", "character_fighting_styles",
          "character_signature_techs"
        ]

        Enum.each(related_tables, fn table ->
          try do
            Repo.query("DELETE FROM #{table} WHERE character_id = ?", [char_id])
          rescue
            _ -> :ok
          end
        end)

        Repo.query!("DELETE FROM characters WHERE id = ?", [char_id])
        json(conn, %{success: true, message: "#{char_name} has been released to the void."})

      _ ->
        json(conn, %{success: false, message: "Character not found."})
    end
  end

  # ── GET INVENTORY ───────────────────────────────────────────────

  def get_inventory(conn, %{"char_id" => char_id}) do
    user_id = conn.assigns[:user_id]

    case verify_ownership(user_id, char_id) do
      false ->
        json(conn, %{success: false, message: "Unauthorized."})

      true ->
        case Repo.query(
          """
          SELECT ci.id, ci.item_id, ci.quantity,
                 gi.name, gi.icon, gi.type, gi.slot, gi.description, gi.value,
                 gi.bonus_hp, gi.bonus_mp, gi.bonus_atk, gi.bonus_def,
                 gi.bonus_mo, gi.bonus_md, gi.bonus_speed, gi.bonus_luck,
                 gi.level_req, gi.elements, gi.set_status, gi.sprite_url
          FROM character_items ci
          JOIN game_items gi ON ci.item_id = gi.id
          WHERE ci.character_id = ?
          """,
          [char_id]
        ) do
          {:ok, %{columns: columns, rows: rows}} ->
            items = Enum.map(rows, fn row ->
              columns |> Enum.zip(row) |> Map.new()
            end)

            json(conn, %{success: true, items: items})

          _ ->
            json(conn, %{success: true, items: []})
        end
    end
  end

  # ── GET EQUIPMENT ───────────────────────────────────────────────

  def get_equipment(conn, %{"char_id" => char_id}) do
    user_id = conn.assigns[:user_id]

    case verify_ownership(user_id, char_id) do
      false ->
        json(conn, %{success: false, message: "Unauthorized."})

      true ->
        case Repo.query(
          """
          SELECT ce.slot_key, gi.*
          FROM character_equipment ce
          JOIN game_items gi ON ce.item_id = gi.id
          WHERE ce.character_id = ?
          """,
          [char_id]
        ) do
          {:ok, %{columns: columns, rows: rows}} ->
            equipment = Enum.map(rows, fn row ->
              columns |> Enum.zip(row) |> Map.new()
            end)

            json(conn, %{success: true, equipment: equipment})

          _ ->
            json(conn, %{success: true, equipment: []})
        end
    end
  end

  # ── EQUIP ITEM ──────────────────────────────────────────────────

  def equip_item(conn, params) do
    user_id = conn.assigns[:user_id]
    char_id = params["charId"] || params["char_id"]
    item_id = params["itemId"] || params["item_id"]
    slot_key = params["slotKey"] || params["slot_key"]

    case verify_ownership(user_id, char_id) do
      false ->
        json(conn, %{success: false, message: "Unauthorized."})

      true ->
        do_equip_item(conn, char_id, item_id, slot_key)
    end
  end

  defp do_equip_item(conn, char_id, item_id, slot_key) do
    # Verify item is in inventory
    case Repo.query("SELECT id, quantity FROM character_items WHERE character_id = ? AND item_id = ?", [char_id, item_id]) do
      {:ok, %{rows: [[inv_id, quantity]]}} ->
        # Verify item exists and slot matches
        case Repo.query("SELECT * FROM game_items WHERE id = ?", [item_id]) do
          {:ok, %{columns: cols, rows: [row]}} ->
            item = Enum.zip(cols, row) |> Map.new()
            item_slot = item["slot"]

            if item_slot != slot_key and item_slot != "ANY" do
              json(conn, %{success: false, message: "Goes in #{item_slot}."})
            else
              # Unequip current item in that slot (move back to inventory)
              case Repo.query("SELECT item_id FROM character_equipment WHERE character_id = ? AND slot_key = ?", [char_id, slot_key]) do
                {:ok, %{rows: [[old_item_id]]}} ->
                  Repo.query!("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,1)", [char_id, old_item_id])
                  Repo.query!("DELETE FROM character_equipment WHERE character_id = ? AND slot_key = ?", [char_id, slot_key])

                _ ->
                  :ok
              end

              # Equip new item
              Repo.query!("INSERT INTO character_equipment (character_id, slot_key, item_id) VALUES (?,?,?)", [char_id, slot_key, item_id])

              # Remove from inventory
              if quantity > 1 do
                Repo.query!("UPDATE character_items SET quantity = quantity - 1 WHERE id = ?", [inv_id])
              else
                Repo.query!("DELETE FROM character_items WHERE id = ?", [inv_id])
              end

              json(conn, %{success: true, message: "Equipped!"})
            end

          _ ->
            json(conn, %{success: false, message: "Item not found."})
        end

      _ ->
        json(conn, %{success: false, message: "Item not in inventory."})
    end
  end

  # ── UNEQUIP ITEM ────────────────────────────────────────────────

  def unequip_item(conn, params) do
    user_id = conn.assigns[:user_id]
    char_id = params["charId"] || params["char_id"]
    slot_key = params["slotKey"] || params["slot_key"]

    case verify_ownership(user_id, char_id) do
      false ->
        json(conn, %{success: false, message: "Unauthorized."})

      true ->
        case Repo.query("SELECT item_id FROM character_equipment WHERE character_id = ? AND slot_key = ?", [char_id, slot_key]) do
          {:ok, %{rows: [[item_id]]}} ->
            Repo.query!("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,1)", [char_id, item_id])
            Repo.query!("DELETE FROM character_equipment WHERE character_id = ? AND slot_key = ?", [char_id, slot_key])
            json(conn, %{success: true, message: "Unequipped."})

          _ ->
            json(conn, %{success: false, message: "Nothing there."})
        end
    end
  end

  # ── USE ITEM ────────────────────────────────────────────────────

  def use_item(conn, params) do
    user_id = conn.assigns[:user_id]
    char_id = params["charId"] || params["char_id"]
    item_id = params["itemId"] || params["item_id"]

    case verify_ownership(user_id, char_id) do
      false ->
        json(conn, %{success: false, message: "Unauthorized."})

      true ->
        do_use_item(conn, char_id, item_id)
    end
  end

  defp do_use_item(conn, char_id, item_id) do
    # Load item from inventory with game_items data
    case Repo.query(
      """
      SELECT ci.id, ci.quantity,
             gi.name, gi.type, gi.icon, gi.bonus_hp, gi.bonus_mp, gi.stats_json
      FROM character_items ci
      JOIN game_items gi ON ci.item_id = gi.id
      WHERE ci.character_id = ? AND ci.item_id = ?
      """,
      [char_id, item_id]
    ) do
      {:ok, %{columns: cols, rows: [row]}} ->
        item = Enum.zip(cols, row) |> Map.new()

        if item["type"] != "CONSUMABLE" do
          json(conn, %{success: false, message: "Cannot use outside of battle."})
        else
          apply_consumable(conn, char_id, item)
        end

      _ ->
        json(conn, %{success: false, message: "Item not in inventory."})
    end
  end

  defp apply_consumable(conn, char_id, item) do
    # Parse stats_json
    stats = case Jason.decode(to_string(item["stats_json"] || "{}")) do
      {:ok, map} when is_map(map) -> map
      _ -> %{}
    end

    # Load character HP/MP
    case Repo.query("SELECT current_hp, max_hp, current_mp, max_mp FROM characters WHERE id = ?", [char_id]) do
      {:ok, %{rows: [[current_hp, max_hp, current_mp, max_mp]]}} ->
        heal_hp = to_int(item["bonus_hp"], 0) + to_int(stats["heal_hp"], 0) +
                  floor(to_float(stats["heal_pct"], 0) * max_hp)
        heal_mp = to_int(item["bonus_mp"], 0) + to_int(stats["restore_mp"], 0) +
                  floor(to_float(stats["restore_pct"], 0) * max_mp)

        new_hp = min(max_hp, current_hp + heal_hp)
        new_mp = min(max_mp, current_mp + heal_mp)

        # Update character
        Repo.query!("UPDATE characters SET current_hp = ?, current_mp = ? WHERE id = ?", [new_hp, new_mp, char_id])

        # Consume item
        quantity = to_int(item["quantity"], 1)

        if quantity > 1 do
          Repo.query!("UPDATE character_items SET quantity = quantity - 1 WHERE id = ?", [item["id"]])
        else
          Repo.query!("DELETE FROM character_items WHERE id = ?", [item["id"]])
        end

        # Build message
        hp_gained = new_hp - current_hp
        mp_gained = new_mp - current_mp
        parts = []
        parts = if hp_gained > 0, do: parts ++ ["+#{hp_gained} HP"], else: parts
        parts = if mp_gained > 0, do: parts ++ ["+#{mp_gained} MP"], else: parts

        icon = item["icon"] || "🧪"
        item_name = item["name"]

        message = case parts do
          [] -> "Used #{item_name}."
          _ -> "#{icon} #{item_name}: #{Enum.join(parts, ", ")}!"
        end

        json(conn, %{success: true, message: message, newHp: new_hp, newMp: new_mp})

      _ ->
        json(conn, %{success: false, message: "Character not found."})
    end
  end

  # ══════════════════════════════════════════════════════════════════
  # Private helpers
  # ══════════════════════════════════════════════════════════════════

  defp verify_ownership(user_id, char_id) do
    case Repo.query("SELECT id FROM characters WHERE id = ? AND user_id = ?", [char_id, user_id]) do
      {:ok, %{rows: [_]}} -> true
      _ -> false
    end
  end

  defp to_int(nil, default), do: default
  defp to_int(val, _default) when is_integer(val), do: val

  defp to_int(val, default) do
    case Integer.parse(to_string(val)) do
      {n, _} -> n
      :error -> default
    end
  end

  defp to_float(nil, default), do: default
  defp to_float(val, _default) when is_float(val), do: val
  defp to_float(val, _default) when is_integer(val), do: val / 1

  defp to_float(val, default) do
    case Float.parse(to_string(val)) do
      {n, _} -> n
      :error -> default
    end
  end

  defp load_background_bonuses(background_id) when background_id in [nil, 0, "0"],
    do: %{}

  defp load_background_bonuses(background_id) do
    case Repo.query("SELECT * FROM game_backgrounds WHERE id = ?", [background_id]) do
      {:ok, %{columns: cols, rows: [row]}} ->
        Enum.zip(cols, row) |> Map.new()

      _ ->
        %{}
    end
  end

  defp load_feat_bonuses(feat_id) when feat_id in [nil, 0, "0"],
    do: {%{hp: 0, mp: 0, atk: 0, def: 0, mo: 0, md: 0, speed: 0, luck: 0}, 0}

  defp load_feat_bonuses(feat_id) do
    default = %{hp: 0, mp: 0, atk: 0, def: 0, mo: 0, md: 0, speed: 0, luck: 0}

    case Repo.query("SELECT effect_json FROM game_feats WHERE id = ?", [feat_id]) do
      {:ok, %{rows: [[effect_json]]}} when not is_nil(effect_json) ->
        case Jason.decode(to_string(effect_json)) do
          {:ok, ef} when is_map(ef) ->
            sb = ef["stat_bonus"] || %{}

            bonus = %{
              hp:    to_int(sb["hp"] || sb["bonus_hp"], 0),
              mp:    to_int(sb["mp"] || sb["bonus_mp"], 0),
              atk:   to_int(sb["atk"] || sb["bonus_atk"], 0),
              def:   to_int(sb["def"] || sb["bonus_def"], 0),
              mo:    to_int(sb["mo"] || sb["bonus_mo"], 0),
              md:    to_int(sb["md"] || sb["bonus_md"], 0),
              speed: to_int(sb["speed"] || sb["bonus_speed"], 0),
              luck:  to_int(sb["luck"] || sb["bonus_luck"], 0)
            }

            start_gold = to_int(ef["start_gold"], 0)
            {bonus, start_gold}

          _ ->
            {default, 0}
        end

      _ ->
        {default, 0}
    end
  end

  defp insert_default_stats(char_id) do
    case Repo.query("SELECT key_name, default_value FROM game_stat_definitions") do
      {:ok, %{rows: rows}} ->
        Enum.each(rows, fn [key, default_val] ->
          try do
            Repo.query!(
              "INSERT INTO character_stats (character_id, stat_key, current_value, max_value) VALUES (?,?,?,?)",
              [char_id, key, default_val, default_val]
            )
          rescue
            _ -> :ok
          end
        end)

      _ ->
        :ok
    end
  end

  defp save_ability_scores(char_id, ability_scores, race_id, class_id, background_id) do
    # Save each score
    Enum.each(ability_scores, fn {key, val} ->
      base = to_int(val, 8)

      try do
        Repo.query!(
          "INSERT INTO character_ability_scores (character_id, ability_key, base_value) VALUES (?,?,?) ON DUPLICATE KEY UPDATE base_value = ?",
          [char_id, key, base, base]
        )
      rescue
        _ -> :ok
      end
    end)

    # Apply racial + class + background ability bonuses
    try do
      race_bonuses = case Repo.query(
        "SELECT ab.key_name, rab.bonus FROM game_race_ability_bonuses rab JOIN game_ability_scores ab ON ab.id = rab.ability_id WHERE rab.race_id = ?",
        [race_id]
      ) do
        {:ok, %{rows: rows}} -> rows
        _ -> []
      end

      class_bonuses = case Repo.query(
        "SELECT ab.key_name, cab.bonus FROM game_class_ability_bonuses cab JOIN game_ability_scores ab ON ab.id = cab.ability_id WHERE cab.class_id = ?",
        [class_id]
      ) do
        {:ok, %{rows: rows}} -> rows
        _ -> []
      end

      bg_bonuses = if background_id && background_id != 0 do
        case Repo.query(
          "SELECT ab.key_name, bab.bonus FROM game_background_ability_bonuses bab JOIN game_ability_scores ab ON ab.id = bab.ability_id WHERE bab.background_id = ?",
          [background_id]
        ) do
          {:ok, %{rows: rows}} -> rows
          _ -> []
        end
      else
        []
      end

      # Combine all bonuses per ability
      all_bonuses = race_bonuses ++ class_bonuses ++ bg_bonuses

      total_bonuses = Enum.reduce(all_bonuses, %{}, fn [key_name, bonus], acc ->
        Map.update(acc, key_name, bonus, &(&1 + bonus))
      end)

      Enum.each(total_bonuses, fn {key, bonus} ->
        try do
          Repo.query!(
            "UPDATE character_ability_scores SET bonus_value = ? WHERE character_id = ? AND ability_key = ?",
            [bonus, char_id, key]
          )
        rescue
          _ -> :ok
        end
      end)
    rescue
      _ -> :ok
    end
  end

  defp grant_starting_skills(char_id, class_id) do
    try do
      case Repo.query("SELECT skill_id FROM game_class_skills WHERE class_id = ? AND learn_level <= 1", [class_id]) do
        {:ok, %{rows: rows}} ->
          Enum.each(rows, fn [skill_id] ->
            try do
              Repo.query!(
                "INSERT IGNORE INTO character_learned_skills (character_id, skill_id, learned_from) VALUES (?,?,?)",
                [char_id, skill_id, "starting"]
              )
            rescue
              _ -> :ok
            end
          end)

        _ ->
          :ok
      end
    rescue
      _ -> :ok
    end
  end
end
