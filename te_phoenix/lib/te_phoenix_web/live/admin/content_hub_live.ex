defmodule TePhoenixWeb.Admin.ContentHubLive do
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo

  @tabs ~w(items shops loot crafting quests achievements)
  @per_page 30

  @quest_types ~w(main side daily bounty guild arena)
  @objective_types ~w(kill collect talk explore escort)
  @craft_categories ~w(WEAPON ARMOR POTION FOOD MISC)
  @unlock_modes ~w(ALWAYS LEARNED)

  # ── Mount ──────────────────────────────────────────────────────────

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       active_tab: :content,
       tab: "items",
       tabs: @tabs,
       search: "",
       page: 1,
       rows: [],
       total: 0,
       # Quest form state
       quest_form: nil,
       quest_editing_id: nil,
       form_objectives: [],
       form_rewards: %{"xp" => 0, "gold" => 0, "items" => []},
       # Crafting form state
       recipe_form: nil,
       recipe_editing_id: nil,
       form_ingredients: [],
       # Achievement form state
       achievement_form: nil,
       achievement_editing_id: nil,
       # Smart editor state
       expanded_id: nil,
       expanded_data: nil,
       item_search: "",
       # Shared
       game_items_list: [],
       flash_msg: nil
     )
     |> load_tab()}
  end

  # ── Tab / Search / Pagination Events ───────────────────────────────

  @impl true
  def handle_event("change_tab", %{"tab" => tab}, socket) do
    socket = assign(socket, tab: tab, search: "", page: 1, quest_form: nil, quest_editing_id: nil, recipe_form: nil, recipe_editing_id: nil, achievement_form: nil, achievement_editing_id: nil, expanded_id: nil, expanded_data: nil, item_search: "", flash_msg: nil)
    socket = if tab in ["quests", "crafting", "shops", "loot"] do
      load_game_items(socket)
    else
      socket
    end
    {:noreply, load_tab(socket)}
  end

  def handle_event("search", %{"search" => q}, socket) do
    {:noreply, assign(socket, search: q, page: 1) |> load_tab()}
  end

  def handle_event("prev_page", _params, socket) do
    {:noreply, assign(socket, page: max(1, socket.assigns.page - 1)) |> load_tab()}
  end

  def handle_event("next_page", _params, socket) do
    max_p = max(1, ceil(socket.assigns.total / @per_page))
    {:noreply, assign(socket, page: min(max_p, socket.assigns.page + 1)) |> load_tab()}
  end

  # ── Smart Editor Events ─────────────────────────────────────────────

  def handle_event("expand_row", %{"id" => id}, socket) do
    id = to_int(id)
    if socket.assigns.expanded_id == id do
      {:noreply, assign(socket, expanded_id: nil, expanded_data: nil, item_search: "")}
    else
      data = load_expanded_data(socket.assigns.tab, id)
      socket = if socket.assigns.tab in ["shops", "loot"] and socket.assigns.game_items_list == [] do
        load_game_items(socket)
      else
        socket
      end
      {:noreply, assign(socket, expanded_id: id, expanded_data: data, item_search: "")}
    end
  end

  def handle_event("item_search_change", %{"value" => q}, socket) do
    {:noreply, assign(socket, item_search: q)}
  end

  def handle_event("item_search_change", %{"item_search" => q}, socket) do
    {:noreply, assign(socket, item_search: q)}
  end

  # Shop inventory: add item
  def handle_event("shop_add_item", %{"item-id" => item_id}, socket) do
    shop_id = socket.assigns.expanded_id
    item_id = to_int(item_id)
    if shop_id && item_id > 0 do
      Repo.query("INSERT INTO game_shop_supplies (shop_id, item_id, buy_price, sell_price, stock) VALUES (?, ?, 100, 50, -1)", [shop_id, item_id])
      data = load_expanded_data("shops", shop_id)
      {:noreply, assign(socket, expanded_data: data, item_search: "", flash_msg: "Item added to shop") |> load_tab()}
    else
      {:noreply, socket}
    end
  end

  # Shop inventory: remove item
  def handle_event("shop_remove_item", %{"supply-id" => supply_id}, socket) do
    Repo.query("DELETE FROM game_shop_supplies WHERE id=?", [to_int(supply_id)])
    data = load_expanded_data("shops", socket.assigns.expanded_id)
    {:noreply, assign(socket, expanded_data: data, flash_msg: "Item removed") |> load_tab()}
  end

  # Shop inventory: update price/stock
  def handle_event("shop_update_supply", params, socket) do
    supply_id = to_int(params["supply-id"])
    field = params["field"]
    value = to_int(params["value"])
    if field in ["buy_price", "sell_price", "stock"] and supply_id > 0 do
      Repo.query("UPDATE game_shop_supplies SET #{field}=? WHERE id=?", [value, supply_id])
      data = load_expanded_data("shops", socket.assigns.expanded_id)
      {:noreply, assign(socket, expanded_data: data)}
    else
      {:noreply, socket}
    end
  end

  # Loot table: add drop entry
  def handle_event("loot_add_drop", %{"item-id" => item_id}, socket) do
    npc_id = socket.assigns.expanded_id
    item_id = to_int(item_id)
    if npc_id do
      drops = (socket.assigns.expanded_data || [])
      new_drop = %{"item_id" => (if item_id > 0, do: item_id, else: nil), "chance" => 50, "min_qty" => 1, "max_qty" => 1}
      updated = drops ++ [new_drop]
      json = Jason.encode!(updated)
      Repo.query("UPDATE game_npcs SET drop_table_json=? WHERE id=?", [json, npc_id])
      {:noreply, assign(socket, expanded_data: updated, item_search: "", flash_msg: "Drop added") |> load_tab()}
    else
      {:noreply, socket}
    end
  end

  # Loot table: remove drop entry
  def handle_event("loot_remove_drop", %{"index" => idx}, socket) do
    npc_id = socket.assigns.expanded_id
    drops = socket.assigns.expanded_data || []
    updated = List.delete_at(drops, to_int(idx))
    json = Jason.encode!(updated)
    Repo.query("UPDATE game_npcs SET drop_table_json=? WHERE id=?", [json, npc_id])
    {:noreply, assign(socket, expanded_data: updated, flash_msg: "Drop removed") |> load_tab()}
  end

  # Loot table: update drop field
  def handle_event("loot_update_drop", %{"index" => idx, "field" => field, "value" => value}, socket) when field in ~w(item_id chance min_qty max_qty) do
    npc_id = socket.assigns.expanded_id
    drops = socket.assigns.expanded_data || []
    i = to_int(idx)
    if i >= 0 and i < length(drops) do
      entry = Enum.at(drops, i)
      val = if field == "item_id" do
        case to_int(value) do 0 -> nil; n -> n end
      else
        to_int(value)
      end
      updated = List.replace_at(drops, i, Map.put(entry, field, val))
      json = Jason.encode!(updated)
      Repo.query("UPDATE game_npcs SET drop_table_json=? WHERE id=?", [json, npc_id])
      {:noreply, assign(socket, expanded_data: updated)}
    else
      {:noreply, socket}
    end
  end

  # ── Quest CRUD Events ──────────────────────────────────────────────

  def handle_event("new_quest", _params, socket) do
    {:noreply,
     socket
     |> load_game_items()
     |> assign(
       quest_form: %{
         "name" => "",
         "description" => "",
         "quest_type" => "side",
         "level_req" => 1,
         "is_repeatable" => false,
         "cooldown_hours" => 0,
         "max_completions" => 0,
         "is_active" => true
       },
       quest_editing_id: nil,
       form_objectives: [default_objective()],
       form_rewards: %{"xp" => 0, "gold" => 0, "items" => []}
     )}
  end

  def handle_event("edit_quest", %{"id" => id}, socket) do
    id = to_int(id)

    case Repo.query("SELECT id, name, description, quest_type, level_req, is_repeatable, cooldown_hours, max_completions, is_active, objectives_json, reward_xp, reward_gold, rewards_json FROM game_quests WHERE id = ?", [id]) do
      {:ok, %{rows: [[qid, name, desc, qtype, lvl, rep, cd_hrs, max_comp, active, obj_json, rxp, rgold, rew_json]]}} ->
        objectives = parse_json(obj_json, [])
        objectives = if is_list(objectives) and objectives != [] do
          Enum.map(objectives, fn o ->
            %{"type" => o["type"] || "kill", "target" => o["target"] || "", "count" => o["count"] || 1, "label" => o["label"] || ""}
          end)
        else
          [default_objective()]
        end

        reward_items = case parse_json(rew_json, nil) do
          %{"items" => items} when is_list(items) -> Enum.map(items, fn i -> %{"item_id" => i["item_id"] || 0, "quantity" => i["quantity"] || 1} end)
          _ -> []
        end

        {:noreply,
         socket
         |> load_game_items()
         |> assign(
           quest_form: %{
             "name" => name || "",
             "description" => desc || "",
             "quest_type" => qtype || "side",
             "level_req" => lvl || 1,
             "is_repeatable" => rep in [1, true, "1"],
             "cooldown_hours" => cd_hrs || 0,
             "max_completions" => max_comp || 0,
             "is_active" => active in [1, true, "1"]
           },
           quest_editing_id: qid,
           form_objectives: objectives,
           form_rewards: %{"xp" => rxp || 0, "gold" => rgold || 0, "items" => reward_items}
         )}

      _ ->
        {:noreply, assign(socket, flash_msg: "Quest not found")}
    end
  end

  def handle_event("cancel_quest", _params, socket) do
    {:noreply, assign(socket, quest_form: nil, quest_editing_id: nil)}
  end

  def handle_event("update_quest_field", %{"field" => field, "value" => value}, socket) do
    form = Map.put(socket.assigns.quest_form, field, value)
    {:noreply, assign(socket, quest_form: form)}
  end

  def handle_event("toggle_quest_field", %{"field" => field}, socket) do
    form = Map.put(socket.assigns.quest_form, field, !socket.assigns.quest_form[field])
    {:noreply, assign(socket, quest_form: form)}
  end

  # Objectives
  def handle_event("add_objective", _params, socket) do
    {:noreply, assign(socket, form_objectives: socket.assigns.form_objectives ++ [default_objective()])}
  end

  def handle_event("remove_objective", %{"index" => idx}, socket) do
    idx = to_int(idx)
    objectives = List.delete_at(socket.assigns.form_objectives, idx)
    objectives = if objectives == [], do: [default_objective()], else: objectives
    {:noreply, assign(socket, form_objectives: objectives)}
  end

  def handle_event("update_objective", %{"index" => idx, "field" => field, "value" => value}, socket) do
    idx = to_int(idx)
    objectives = List.update_at(socket.assigns.form_objectives, idx, fn obj ->
      Map.put(obj, field, value)
    end)
    {:noreply, assign(socket, form_objectives: objectives)}
  end

  # Rewards
  def handle_event("update_reward_field", %{"field" => field, "value" => value}, socket) do
    rewards = Map.put(socket.assigns.form_rewards, field, value)
    {:noreply, assign(socket, form_rewards: rewards)}
  end

  def handle_event("add_reward_item", _params, socket) do
    items = (socket.assigns.form_rewards["items"] || []) ++ [%{"item_id" => 0, "quantity" => 1}]
    rewards = Map.put(socket.assigns.form_rewards, "items", items)
    {:noreply, assign(socket, form_rewards: rewards)}
  end

  def handle_event("remove_reward_item", %{"index" => idx}, socket) do
    idx = to_int(idx)
    items = List.delete_at(socket.assigns.form_rewards["items"] || [], idx)
    rewards = Map.put(socket.assigns.form_rewards, "items", items)
    {:noreply, assign(socket, form_rewards: rewards)}
  end

  def handle_event("update_reward_item", %{"index" => idx, "field" => field, "value" => value}, socket) do
    idx = to_int(idx)
    items = List.update_at(socket.assigns.form_rewards["items"] || [], idx, fn item ->
      Map.put(item, field, value)
    end)
    rewards = Map.put(socket.assigns.form_rewards, "items", items)
    {:noreply, assign(socket, form_rewards: rewards)}
  end

  # Save quest
  def handle_event("save_quest", _params, socket) do
    form = socket.assigns.quest_form
    objectives = socket.assigns.form_objectives
    rewards = socket.assigns.form_rewards

    name = String.trim(form["name"] || "")
    if name == "" do
      {:noreply, assign(socket, flash_msg: "Quest name is required")}
    else
      objectives_json = Jason.encode!(Enum.map(objectives, fn o ->
        %{type: o["type"], target: o["target"], count: to_int(o["count"], 1), label: o["label"]}
      end))

      reward_items = Enum.map(rewards["items"] || [], fn i ->
        %{item_id: to_int(i["item_id"]), quantity: to_int(i["quantity"], 1)}
      end)
      rewards_json = Jason.encode!(%{items: reward_items})

      is_repeatable = if form["is_repeatable"], do: 1, else: 0
      is_active = if form["is_active"], do: 1, else: 0

      cooldown_hours = to_int(form["cooldown_hours"])
      max_completions = to_int(form["max_completions"])

      case socket.assigns.quest_editing_id do
        nil ->
          Repo.query(
            "INSERT INTO game_quests (name, description, quest_type, level_req, is_repeatable, cooldown_hours, max_completions, is_active, objectives_json, reward_xp, reward_gold, rewards_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [name, form["description"], form["quest_type"], to_int(form["level_req"], 1), is_repeatable, cooldown_hours, max_completions, is_active, objectives_json, to_int(rewards["xp"]), to_int(rewards["gold"]), rewards_json]
          )

        id ->
          Repo.query(
            "UPDATE game_quests SET name = ?, description = ?, quest_type = ?, level_req = ?, is_repeatable = ?, cooldown_hours = ?, max_completions = ?, is_active = ?, objectives_json = ?, reward_xp = ?, reward_gold = ?, rewards_json = ? WHERE id = ?",
            [name, form["description"], form["quest_type"], to_int(form["level_req"], 1), is_repeatable, cooldown_hours, max_completions, is_active, objectives_json, to_int(rewards["xp"]), to_int(rewards["gold"]), rewards_json, id]
          )
      end

      {:noreply,
       assign(socket, quest_form: nil, quest_editing_id: nil, flash_msg: "Quest saved!")
       |> load_tab()}
    end
  end

  def handle_event("delete_quest", %{"id" => id}, socket) do
    Repo.query("DELETE FROM game_quests WHERE id = ?", [to_int(id)])
    {:noreply, assign(socket, flash_msg: "Quest deleted") |> load_tab()}
  end

  # ── Crafting CRUD Events ───────────────────────────────────────────

  def handle_event("new_recipe", _params, socket) do
    {:noreply,
     socket
     |> load_game_items()
     |> assign(
       recipe_form: %{
         "name" => "",
         "icon" => "",
         "category" => "MISC",
         "result_item_id" => 0,
         "result_qty" => 1,
         "level_req" => 1,
         "unlock_mode" => "ALWAYS",
         "description" => "",
         "is_active" => true
       },
       recipe_editing_id: nil,
       form_ingredients: [default_ingredient()]
     )}
  end

  def handle_event("edit_recipe", %{"id" => id}, socket) do
    id = to_int(id)

    case Repo.query("SELECT id, name, icon, category, result_item_id, result_qty, level_req, unlock_mode, description, is_active, ingredients_json FROM game_craft_recipes WHERE id = ?", [id]) do
      {:ok, %{rows: [[rid, name, icon, cat, res_id, res_qty, lvl, unlock, desc, active, ing_json]]}} ->
        ingredients = parse_json(ing_json, [])
        ingredients = if is_list(ingredients) and ingredients != [] do
          Enum.map(ingredients, fn i ->
            %{"item_id" => to_string(i["item_id"] || 0), "qty" => to_string(i["qty"] || i["quantity"] || 1)}
          end)
        else
          [default_ingredient()]
        end

        {:noreply,
         socket
         |> load_game_items()
         |> assign(
           recipe_form: %{
             "name" => name || "",
             "icon" => icon || "",
             "category" => cat || "MISC",
             "result_item_id" => res_id || 0,
             "result_qty" => res_qty || 1,
             "level_req" => lvl || 1,
             "unlock_mode" => unlock || "ALWAYS",
             "description" => desc || "",
             "is_active" => active in [1, true, "1"]
           },
           recipe_editing_id: rid,
           form_ingredients: ingredients
         )}

      _ ->
        {:noreply, assign(socket, flash_msg: "Recipe not found")}
    end
  end

  def handle_event("cancel_recipe", _params, socket) do
    {:noreply, assign(socket, recipe_form: nil, recipe_editing_id: nil)}
  end

  def handle_event("update_recipe_field", %{"field" => field, "value" => value}, socket) do
    form = Map.put(socket.assigns.recipe_form, field, value)
    {:noreply, assign(socket, recipe_form: form)}
  end

  def handle_event("toggle_recipe_field", %{"field" => field}, socket) do
    form = Map.put(socket.assigns.recipe_form, field, !socket.assigns.recipe_form[field])
    {:noreply, assign(socket, recipe_form: form)}
  end

  # Ingredients
  def handle_event("add_ingredient", _params, socket) do
    {:noreply, assign(socket, form_ingredients: socket.assigns.form_ingredients ++ [default_ingredient()])}
  end

  def handle_event("remove_ingredient", %{"index" => idx}, socket) do
    idx = to_int(idx)
    ingredients = List.delete_at(socket.assigns.form_ingredients, idx)
    ingredients = if ingredients == [], do: [default_ingredient()], else: ingredients
    {:noreply, assign(socket, form_ingredients: ingredients)}
  end

  def handle_event("update_ingredient", %{"index" => idx, "field" => field, "value" => value}, socket) do
    idx = to_int(idx)
    ingredients = List.update_at(socket.assigns.form_ingredients, idx, fn ing ->
      Map.put(ing, field, value)
    end)
    {:noreply, assign(socket, form_ingredients: ingredients)}
  end

  # Save recipe
  def handle_event("save_recipe", _params, socket) do
    form = socket.assigns.recipe_form
    ingredients = socket.assigns.form_ingredients

    name = String.trim(form["name"] || "")
    if name == "" do
      {:noreply, assign(socket, flash_msg: "Recipe name is required")}
    else
      ingredients_json = Jason.encode!(Enum.map(ingredients, fn i ->
        %{item_id: to_int(i["item_id"]), qty: to_int(i["qty"], 1)}
      end))

      is_active = if form["is_active"], do: 1, else: 0

      case socket.assigns.recipe_editing_id do
        nil ->
          Repo.query(
            "INSERT INTO game_craft_recipes (name, icon, category, result_item_id, result_qty, level_req, unlock_mode, description, is_active, ingredients_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [name, form["icon"], form["category"], to_int(form["result_item_id"]), to_int(form["result_qty"], 1), to_int(form["level_req"], 1), form["unlock_mode"], form["description"], is_active, ingredients_json]
          )

        id ->
          Repo.query(
            "UPDATE game_craft_recipes SET name = ?, icon = ?, category = ?, result_item_id = ?, result_qty = ?, level_req = ?, unlock_mode = ?, description = ?, is_active = ?, ingredients_json = ? WHERE id = ?",
            [name, form["icon"], form["category"], to_int(form["result_item_id"]), to_int(form["result_qty"], 1), to_int(form["level_req"], 1), form["unlock_mode"], form["description"], is_active, ingredients_json, id]
          )
      end

      {:noreply,
       assign(socket, recipe_form: nil, recipe_editing_id: nil, flash_msg: "Recipe saved!")
       |> load_tab()}
    end
  end

  def handle_event("delete_recipe", %{"id" => id}, socket) do
    Repo.query("DELETE FROM game_craft_recipes WHERE id = ?", [to_int(id)])
    {:noreply, assign(socket, flash_msg: "Recipe deleted") |> load_tab()}
  end

  # ── Achievement CRUD ──────────────────────────────────────────────

  @achievement_categories [{"⚔️ Combat", "combat"}, {"🗺️ Exploration", "exploration"}, {"📈 Progression", "progression"}, {"👥 Social", "social"}, {"⭐ Other", "other"}]
  @achievement_triggers [{"👹 PvE Wins", "pve_wins"}, {"⚔️ PvP Wins", "pvp_wins"}, {"📜 Quests Done", "quests_done"}, {"🗺️ Maps Visited", "maps_visited"}, {"📈 Level Reached", "level_reached"}, {"📅 Login Streak", "login_streak"}, {"💰 Gold Owned", "gold_owned"}, {"⚔️ Total Battles", "battles_total"}, {"🔧 Manual", "manual"}]

  def handle_event("create_achievement", _p, socket) do
    {:noreply, assign(socket, achievement_form: default_achievement_form(), achievement_editing_id: nil)}
  end

  def handle_event("edit_achievement", %{"id" => id}, socket) do
    case Repo.query("SELECT * FROM game_achievements WHERE id=?", [to_int(id)]) do
      {:ok, %{rows: [row], columns: cols}} ->
        data = Enum.zip(cols, row) |> Map.new()
        form = %{
          "key_name" => data["key_name"] || "", "title" => data["title"] || "",
          "description" => data["description"] || "", "icon" => data["icon"] || "🏆",
          "category" => data["category"] || "other", "trigger_type" => data["trigger_type"] || "manual",
          "trigger_value" => to_string(data["trigger_value"] || 1),
          "reward_gold" => to_string(data["reward_gold"] || 0), "reward_title" => data["reward_title"] || "",
          "is_hidden" => to_string(data["is_hidden"] || 0), "is_active" => to_string(data["is_active"] || 1),
          "sort_order" => to_string(data["sort_order"] || 0),
          "chain_group" => data["chain_group"] || "", "chain_tier" => to_string(data["chain_tier"] || 1),
          "chain_next_id" => to_string(data["chain_next_id"] || "")
        }
        {:noreply, assign(socket, achievement_form: form, achievement_editing_id: to_int(id))}
      _ -> {:noreply, socket}
    end
  end

  def handle_event("cancel_achievement", _p, socket) do
    {:noreply, assign(socket, achievement_form: nil, achievement_editing_id: nil)}
  end

  def handle_event("achievement_form_change", params, socket) do
    form = socket.assigns.achievement_form || default_achievement_form()
    updated = Map.merge(form, Map.take(params, Map.keys(form)))
    {:noreply, assign(socket, :achievement_form, updated)}
  end

  def handle_event("save_achievement", params, socket) do
    form = Map.merge(socket.assigns.achievement_form || %{}, params)
    title = String.trim(form["title"] || "")
    if title == "" do
      {:noreply, assign(socket, flash_msg: "Title required")}
    else
      key = case String.trim(form["key_name"] || "") do
        "" -> title |> String.downcase() |> String.replace(~r/[^a-z0-9]+/, "_") |> String.trim("_")
        k -> k
      end

      cols = ~w(key_name title description icon category trigger_type trigger_value reward_gold reward_title is_hidden is_active sort_order chain_group chain_tier chain_next_id)
      vals = [key, title, form["description"], form["icon"], form["category"], form["trigger_type"],
              to_int(form["trigger_value"]), to_int(form["reward_gold"]), form["reward_title"],
              to_int(form["is_hidden"]), to_int(form["is_active"]), to_int(form["sort_order"]),
              nilify(form["chain_group"]), to_int(form["chain_tier"]),
              case to_int(form["chain_next_id"]) do 0 -> nil; n -> n end]

      if socket.assigns.achievement_editing_id do
        set = cols |> Enum.map(&"#{&1}=?") |> Enum.join(", ")
        Repo.query("UPDATE game_achievements SET #{set} WHERE id=?", vals ++ [socket.assigns.achievement_editing_id])
        {:noreply, assign(socket, achievement_form: nil, achievement_editing_id: nil, flash_msg: "Achievement updated") |> load_tab()}
      else
        placeholders = Enum.map(cols, fn _ -> "?" end) |> Enum.join(", ")
        col_str = Enum.join(cols, ", ")
        Repo.query("INSERT INTO game_achievements (#{col_str}) VALUES (#{placeholders})", vals)
        {:noreply, assign(socket, achievement_form: nil, flash_msg: "Achievement created") |> load_tab()}
      end
    end
  end

  def handle_event("delete_achievement", %{"id" => id}, socket) do
    Repo.query("DELETE FROM game_achievements WHERE id=?", [to_int(id)])
    {:noreply, assign(socket, flash_msg: "Achievement deleted") |> load_tab()}
  end

  defp default_achievement_form do
    %{"key_name" => "", "title" => "", "description" => "", "icon" => "🏆",
      "category" => "other", "trigger_type" => "manual", "trigger_value" => "1",
      "reward_gold" => "0", "reward_title" => "", "is_hidden" => "0", "is_active" => "1",
      "sort_order" => "0", "chain_group" => "", "chain_tier" => "1", "chain_next_id" => ""}
  end

  defp nilify(""), do: nil
  defp nilify(v), do: v

  # ── Smart Editor Data Loading ──────────────────────────────────────

  defp load_expanded_data("items", item_id) do
    # Find everywhere this item is used: shops, recipes, quests, loot
    shops = case Repo.query(
      "SELECT s.name, ss.buy_price, ss.sell_price FROM game_shop_supplies ss JOIN game_shops s ON s.id = ss.shop_id WHERE ss.item_id=?", [item_id]) do
      {:ok, %{rows: r}} -> Enum.map(r, fn [name, buy, sell] -> %{name: name, buy: buy, sell: sell} end)
      _ -> []
    end

    recipes_as_ingredient = case Repo.query(
      "SELECT id, name, ingredients_json FROM game_craft_recipes WHERE ingredients_json LIKE ?", ["%\"item_id\":\"#{item_id}\"%"]) do
      {:ok, %{rows: r}} -> Enum.map(r, fn [id, name, _] -> %{id: id, name: name, role: "ingredient"} end)
      _ -> []
    end

    recipes_as_result = case Repo.query(
      "SELECT id, name FROM game_craft_recipes WHERE result_item_id=?", [item_id]) do
      {:ok, %{rows: r}} -> Enum.map(r, fn [id, name] -> %{id: id, name: name, role: "result"} end)
      _ -> []
    end

    quests = case Repo.query(
      "SELECT id, name, rewards_json FROM game_quests WHERE rewards_json LIKE ?", ["%\"item_id\":#{item_id}%"]) do
      {:ok, %{rows: r}} -> Enum.map(r, fn [id, name, _] -> %{id: id, name: name} end)
      _ -> []
    end

    loot_npcs = case Repo.query(
      "SELECT id, name FROM game_npcs WHERE drop_table_json LIKE ?", ["%\"item_id\":#{item_id}%"]) do
      {:ok, %{rows: r}} -> Enum.map(r, fn [id, name] -> %{id: id, name: name} end)
      _ -> []
    end

    %{shops: shops, recipes: recipes_as_ingredient ++ recipes_as_result, quests: quests, loot_npcs: loot_npcs}
  end

  defp load_expanded_data("shops", shop_id) do
    case Repo.query(
      "SELECT ss.id, ss.item_id, ss.buy_price, ss.sell_price, ss.stock, i.name, i.icon, i.rarity FROM game_shop_supplies ss LEFT JOIN game_items i ON i.id = ss.item_id WHERE ss.shop_id=? ORDER BY i.name", [shop_id]) do
      {:ok, %{rows: r}} ->
        Enum.map(r, fn [id, item_id, buy, sell, stock, name, icon, rarity] ->
          %{id: id, item_id: item_id, buy_price: buy, sell_price: sell, stock: stock, name: name || "???", icon: icon || "📦", rarity: rarity}
        end)
      _ -> []
    end
  end

  defp load_expanded_data("loot", npc_id) do
    case Repo.query("SELECT drop_table_json FROM game_npcs WHERE id=?", [npc_id]) do
      {:ok, %{rows: [[json]]}} -> parse_json(json, [])
      _ -> []
    end
  end

  defp load_expanded_data(_, _), do: nil

  # ── Data Loading ──────────────────────────────────────────────────

  defp load_game_items(socket) do
    items =
      case Repo.query("SELECT id, name, icon FROM game_items ORDER BY name", []) do
        {:ok, %{rows: r}} ->
          Enum.map(r, fn [id, name, icon] -> %{id: id, name: name, icon: icon} end)
        _ -> []
      end
    assign(socket, game_items_list: items)
  end

  defp load_tab(%{assigns: %{tab: "items"}} = socket) do
    search = socket.assigns.search
    offset = (socket.assigns.page - 1) * @per_page

    {where, params} =
      if search != "" do
        {"WHERE name LIKE ?", ["%#{search}%"]}
      else
        {"", []}
      end

    total =
      case Repo.query("SELECT COUNT(*) FROM game_items #{where}", params) do
        {:ok, %{rows: [[c]]}} -> c
        _ -> 0
      end

    rows =
      case Repo.query(
             "SELECT id, name, type, icon, rarity, value, level_req FROM game_items #{where} ORDER BY id DESC LIMIT ? OFFSET ?",
             params ++ [@per_page, offset]
           ) do
        {:ok, %{rows: r}} ->
          Enum.map(r, fn [id, name, type, icon, rarity, value, lvl] ->
            %{id: id, name: name, type: type, icon: icon, rarity: rarity, value: value, level_req: lvl}
          end)

        _ ->
          []
      end

    assign(socket, rows: rows, total: total)
  end

  defp load_tab(%{assigns: %{tab: "shops"}} = socket) do
    search = socket.assigns.search
    offset = (socket.assigns.page - 1) * @per_page

    {where, params} =
      if search != "" do
        {"WHERE s.name LIKE ?", ["%#{search}%"]}
      else
        {"", []}
      end

    total =
      case Repo.query("SELECT COUNT(*) FROM game_shops s #{where}", params) do
        {:ok, %{rows: [[c]]}} -> c
        _ -> 0
      end

    rows =
      case Repo.query(
             """
             SELECT s.id, s.name, s.icon, s.map_id, s.description,
                    (SELECT COUNT(*) FROM game_shop_supplies ss WHERE ss.shop_id = s.id) AS item_count
             FROM game_shops s #{where}
             ORDER BY s.id DESC LIMIT ? OFFSET ?
             """,
             params ++ [@per_page, offset]
           ) do
        {:ok, %{rows: r}} ->
          Enum.map(r, fn [id, name, icon, map_id, desc, item_count] ->
            %{id: id, name: name, icon: icon, map_id: map_id, description: truncate(desc, 60), item_count: item_count}
          end)

        _ ->
          []
      end

    assign(socket, rows: rows, total: total)
  end

  defp load_tab(%{assigns: %{tab: "loot"}} = socket) do
    search = socket.assigns.search
    offset = (socket.assigns.page - 1) * @per_page

    {where, params} =
      if search != "" do
        {"AND name LIKE ?", ["%#{search}%"]}
      else
        {"", []}
      end

    total =
      case Repo.query("SELECT COUNT(*) FROM game_npcs WHERE drop_table_json IS NOT NULL #{where}", params) do
        {:ok, %{rows: [[c]]}} -> c
        _ -> 0
      end

    rows =
      case Repo.query(
             "SELECT id, name, drop_table_json FROM game_npcs WHERE drop_table_json IS NOT NULL #{where} ORDER BY id DESC LIMIT ? OFFSET ?",
             params ++ [@per_page, offset]
           ) do
        {:ok, %{rows: r}} ->
          Enum.map(r, fn [id, name, drops] ->
            parsed = parse_json(drops, [])
            %{id: id, name: name, drop_count: length(parsed),
              drop_preview: parsed |> Enum.map(fn d -> "#{d["chance"]}%" end) |> Enum.join(", ")}
          end)

        _ ->
          []
      end

    assign(socket, rows: rows, total: total)
  end

  defp load_tab(%{assigns: %{tab: "crafting"}} = socket) do
    search = socket.assigns.search
    offset = (socket.assigns.page - 1) * @per_page

    case Repo.query("SELECT COUNT(*) FROM game_craft_recipes", []) do
      {:ok, %{rows: [[_]]}} ->
        {where, params} =
          if search != "" do
            {"WHERE r.name LIKE ?", ["%#{search}%"]}
          else
            {"", []}
          end

        total =
          case Repo.query("SELECT COUNT(*) FROM game_craft_recipes r #{where}", params) do
            {:ok, %{rows: [[t]]}} -> t
            _ -> 0
          end

        rows =
          case Repo.query(
                 """
                 SELECT r.id, r.name, r.icon, r.category, r.result_item_id, r.result_qty, r.level_req, r.unlock_mode, r.is_active,
                        COALESCE(i.name, 'Unknown') AS item_name
                 FROM game_craft_recipes r
                 LEFT JOIN game_items i ON i.id = r.result_item_id
                 #{where}
                 ORDER BY r.id DESC LIMIT ? OFFSET ?
                 """,
                 params ++ [@per_page, offset]
               ) do
            {:ok, %{rows: r}} ->
              Enum.map(r, fn [id, name, icon, cat, res_id, res_qty, lvl, unlock, active, item_name] ->
                %{
                  id: id,
                  name: name,
                  icon: icon,
                  category: cat,
                  result_item_id: res_id,
                  result_qty: res_qty,
                  level_req: lvl,
                  unlock_mode: unlock,
                  is_active: active,
                  item_name: item_name
                }
              end)

            _ ->
              []
          end

        assign(socket, rows: rows, total: total)

      _ ->
        assign(socket, rows: [], total: -1)
    end
  end

  defp load_tab(%{assigns: %{tab: "quests"}} = socket) do
    search = socket.assigns.search
    offset = (socket.assigns.page - 1) * @per_page

    {where, params} =
      if search != "" do
        {"WHERE name LIKE ?", ["%#{search}%"]}
      else
        {"", []}
      end

    total =
      case Repo.query("SELECT COUNT(*) FROM game_quests #{where}", params) do
        {:ok, %{rows: [[c]]}} -> c
        _ -> 0
      end

    rows =
      case Repo.query(
             "SELECT id, name, quest_type, level_req, is_active, is_repeatable, description FROM game_quests #{where} ORDER BY id DESC LIMIT ? OFFSET ?",
             params ++ [@per_page, offset]
           ) do
        {:ok, %{rows: r}} ->
          Enum.map(r, fn [id, name, qtype, rlvl, active, repeatable, desc] ->
            %{id: id, name: name, quest_type: qtype, level_req: rlvl, is_active: active, is_repeatable: repeatable, description: truncate(desc, 50)}
          end)

        _ ->
          []
      end

    assign(socket, rows: rows, total: total)
  end

  defp load_tab(%{assigns: %{tab: "achievements"}} = socket) do
    search = socket.assigns.search
    offset = (socket.assigns.page - 1) * @per_page

    {where, params} =
      if search != "" do
        {"WHERE title LIKE ?", ["%#{search}%"]}
      else
        {"", []}
      end

    total =
      case Repo.query("SELECT COUNT(*) FROM game_achievements #{where}", params) do
        {:ok, %{rows: [[c]]}} -> c
        _ -> 0
      end

    rows =
      case Repo.query(
             "SELECT id, title, description, icon, category, trigger_type, trigger_value, reward_gold, reward_title FROM game_achievements #{where} ORDER BY sort_order, id DESC LIMIT ? OFFSET ?",
             params ++ [@per_page, offset]
           ) do
        {:ok, %{rows: r}} ->
          Enum.map(r, fn [id, title, desc, icon, category, trigger_type, trigger_value, reward_gold, reward_title] ->
            %{id: id, title: title, description: truncate(desc, 60), icon: icon, category: category, trigger_type: trigger_type, trigger_value: trigger_value, reward_gold: reward_gold, reward_title: reward_title}
          end)

        _ ->
          []
      end

    assign(socket, rows: rows, total: total)
  end

  defp load_tab(socket), do: assign(socket, rows: [], total: 0)

  # ── Render ────────────────────────────────────────────────────────

  @impl true
  def render(assigns) do
    max_page = max(1, ceil(assigns.total / @per_page))
    assigns = assign(assigns, max_page: max_page)

    ~H"""
    <div>
      <h2 class="text-2xl font-bold text-amber-400 mb-6">Content Hub</h2>

      <!-- Flash -->
      <div :if={@flash_msg} class="mb-4 px-4 py-2 bg-amber-900/40 border border-amber-700 rounded text-amber-300 text-sm">
        {@flash_msg}
      </div>

      <!-- Tab Bar -->
      <div class="flex gap-1 mb-6 border-b border-zinc-800 pb-3">
        <button :for={t <- @tabs} phx-click="change_tab" phx-value-tab={t}
          class={["px-3 py-1.5 rounded-t text-sm font-medium transition-colors",
            @tab == t && "bg-amber-600 text-white",
            @tab != t && "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"]}>
          {String.capitalize(t)}
        </button>
      </div>

      <!-- Search + Pagination -->
      <div class="flex items-center gap-4 mb-4">
        <form phx-submit="search" class="flex-1">
          <input type="text" name="search" value={@search} placeholder="Search by name..."
            phx-debounce="300"
            class="w-full max-w-sm px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-600 focus:border-amber-500 focus:outline-none" />
        </form>
        <div :if={@total > 0} class="flex items-center gap-2 shrink-0">
          <span class="text-xs text-zinc-600">{@total} records</span>
          <button phx-click="prev_page" disabled={@page <= 1}
            class="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs hover:bg-zinc-700 disabled:opacity-30">Prev</button>
          <span class="text-xs text-zinc-500">{@page} / {@max_page}</span>
          <button phx-click="next_page" disabled={@page >= @max_page}
            class="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs hover:bg-zinc-700 disabled:opacity-30">Next</button>
        </div>
      </div>

      <!-- Tab Content -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl overflow-x-auto">
        {render_tab(assigns)}
      </div>
    </div>
    """
  end

  # ── Items Tab ──────────────────────────────────────────────────────

  defp render_tab(%{tab: "items"} = assigns) do
    ~H"""
    <table class="w-full">
      <thead>
        <tr class="border-b border-zinc-800 text-left">
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-8"></th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Name</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Type</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Icon</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Rarity</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Value</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Lvl</th>
        </tr>
      </thead>
      <tbody>
        <%= for row <- @rows do %>
        <tr phx-click="expand_row" phx-value-id={row.id}
          class={["border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer",
                   @expanded_id == row.id && "bg-amber-900/10 border-amber-800/30"]}>
          <td class="px-3 py-2 text-xs text-zinc-600">{if @expanded_id == row.id, do: "▼", else: "▶"}</td>
          <td class="px-3 py-2 text-sm text-zinc-200 font-medium">{row.name}</td>
          <td class="px-3 py-2 text-sm text-zinc-400">{row.type}</td>
          <td class="px-3 py-2 text-lg">{row.icon}</td>
          <td class="px-3 py-2 text-sm"><span class={rarity_color(row.rarity)}>{row.rarity}</span></td>
          <td class="px-3 py-2 text-sm text-amber-400">{row.value}g</td>
          <td class="px-3 py-2 text-sm text-zinc-400">{row.level_req}</td>
        </tr>
        <!-- Relationship Explorer Panel -->
        <tr :if={@expanded_id == row.id && @expanded_data} class="bg-zinc-950/50">
          <td colspan="7" class="p-0">
            <div class="px-6 py-4 border-l-2 border-amber-600/50">
              <h4 class="text-xs font-bold uppercase tracking-wider text-amber-400 mb-3">Where This Item Appears</h4>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <!-- Shops -->
                <div>
                  <div class="text-[10px] text-zinc-500 uppercase mb-2 flex items-center gap-1">
                    <span>🏪</span> Sold In ({length(@expanded_data.shops)})
                  </div>
                  <div :if={@expanded_data.shops == []} class="text-xs text-zinc-600 italic">None</div>
                  <div :for={s <- @expanded_data.shops} class="text-xs text-zinc-300 mb-1 flex justify-between">
                    <span>{s.name}</span>
                    <span class="text-amber-500">{s.buy}g / {s.sell}g</span>
                  </div>
                </div>
                <!-- Recipes -->
                <div>
                  <div class="text-[10px] text-zinc-500 uppercase mb-2 flex items-center gap-1">
                    <span>🔨</span> Recipes ({length(@expanded_data.recipes)})
                  </div>
                  <div :if={@expanded_data.recipes == []} class="text-xs text-zinc-600 italic">None</div>
                  <div :for={r <- @expanded_data.recipes} class="text-xs text-zinc-300 mb-1">
                    {r.name} <span class={if r.role == "result", do: "text-green-400", else: "text-zinc-500"}>({r.role})</span>
                  </div>
                </div>
                <!-- Quests -->
                <div>
                  <div class="text-[10px] text-zinc-500 uppercase mb-2 flex items-center gap-1">
                    <span>📜</span> Quest Rewards ({length(@expanded_data.quests)})
                  </div>
                  <div :if={@expanded_data.quests == []} class="text-xs text-zinc-600 italic">None</div>
                  <div :for={q <- @expanded_data.quests} class="text-xs text-zinc-300 mb-1">{q.name}</div>
                </div>
                <!-- Loot -->
                <div>
                  <div class="text-[10px] text-zinc-500 uppercase mb-2 flex items-center gap-1">
                    <span>💀</span> Dropped By ({length(@expanded_data.loot_npcs)})
                  </div>
                  <div :if={@expanded_data.loot_npcs == []} class="text-xs text-zinc-600 italic">None</div>
                  <div :for={n <- @expanded_data.loot_npcs} class="text-xs text-zinc-300 mb-1">{n.name}</div>
                </div>
              </div>
            </div>
          </td>
        </tr>
        <% end %>
      </tbody>
    </table>
    <div :if={@rows == []} class="p-8 text-center text-zinc-600 text-sm">No items found</div>
    """
  end

  # ── Shops Tab ──────────────────────────────────────────────────────

  defp render_tab(%{tab: "shops"} = assigns) do
    ~H"""
    <table class="w-full">
      <thead>
        <tr class="border-b border-zinc-800 text-left">
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-8"></th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Shop</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Map</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Description</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Items</th>
        </tr>
      </thead>
      <tbody>
        <%= for row <- @rows do %>
        <tr phx-click="expand_row" phx-value-id={row.id}
          class={["border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer",
                   @expanded_id == row.id && "bg-amber-900/10 border-amber-800/30"]}>
          <td class="px-3 py-2 text-xs text-zinc-600">{if @expanded_id == row.id, do: "▼", else: "▶"}</td>
          <td class="px-3 py-2 text-sm text-zinc-200 font-medium"><span class="mr-1">{row.icon}</span> {row.name}</td>
          <td class="px-3 py-2 text-sm text-zinc-400">Map #{row.map_id}</td>
          <td class="px-3 py-2 text-sm text-zinc-400 max-w-[200px] truncate">{row.description}</td>
          <td class="px-3 py-2">
            <span class="text-xs px-2 py-0.5 rounded bg-amber-900/30 text-amber-400">{row.item_count} items</span>
          </td>
        </tr>
        <!-- Shop Inventory Manager -->
        <tr :if={@expanded_id == row.id} class="bg-zinc-950/50">
          <td colspan="5" class="p-0">
            <div class="px-6 py-4 border-l-2 border-amber-600/50">
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-xs font-bold uppercase tracking-wider text-amber-400">Inventory Manager</h4>
                <!-- Add item search -->
                <div class="flex gap-2 items-center">
                  <input type="text" placeholder="Search items to add..." value={@item_search}
                    phx-keyup="item_search_change" phx-value-item_search=""
                    name="item_search"
                    class="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 w-48" />
                </div>
              </div>
              <!-- Item picker dropdown -->
              <div :if={@item_search != "" && String.length(@item_search) >= 2} class="mb-4 bg-zinc-900 border border-zinc-700 rounded p-2 max-h-32 overflow-y-auto">
                <div class="text-[10px] text-zinc-500 mb-1">Click to add:</div>
                <%= for item <- Enum.filter(@game_items_list, fn i -> String.contains?(String.downcase(i.name), String.downcase(@item_search)) end) |> Enum.take(8) do %>
                  <button phx-click="shop_add_item" phx-value-item-id={item.id}
                    class="block w-full text-left px-2 py-1 text-xs text-zinc-300 hover:bg-amber-900/30 hover:text-amber-300 rounded transition-colors">
                    <span class="mr-1">{item.icon}</span> {item.name}
                  </button>
                <% end %>
              </div>
              <!-- Current inventory -->
              <div :if={@expanded_data && @expanded_data != []} class="space-y-1">
                <div class="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 text-[10px] text-zinc-500 uppercase mb-1 px-2">
                  <span>Item</span><span>Buy Price</span><span>Sell Price</span><span>Stock</span><span></span>
                </div>
                <%= for supply <- @expanded_data || [] do %>
                <div class="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-center px-2 py-1.5 rounded hover:bg-zinc-800/50 group">
                  <div class="flex items-center gap-2">
                    <span class="text-sm">{supply.icon}</span>
                    <span class="text-xs text-zinc-200">{supply.name}</span>
                    <span :if={supply.rarity} class={["text-[10px]", rarity_color(supply.rarity)]}>{supply.rarity}</span>
                  </div>
                  <input type="number" value={supply.buy_price}
                    phx-blur="shop_update_supply" phx-value-supply-id={supply.id} phx-value-field="buy_price"
                    class="w-20 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-amber-400 text-right" />
                  <input type="number" value={supply.sell_price}
                    phx-blur="shop_update_supply" phx-value-supply-id={supply.id} phx-value-field="sell_price"
                    class="w-20 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 text-right" />
                  <input type="number" value={supply.stock}
                    phx-blur="shop_update_supply" phx-value-supply-id={supply.id} phx-value-field="stock"
                    title="-1 = unlimited"
                    class="w-20 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 text-right" />
                  <button phx-click="shop_remove_item" phx-value-supply-id={supply.id}
                    data-confirm="Remove this item from shop?"
                    class="text-red-500 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                </div>
                <% end %>
              </div>
              <div :if={@expanded_data == nil || @expanded_data == []} class="text-xs text-zinc-600 italic py-2">
                Empty shop — search above to add items
              </div>
            </div>
          </td>
        </tr>
        <% end %>
      </tbody>
    </table>
    <div :if={@rows == []} class="p-8 text-center text-zinc-600 text-sm">No shops found</div>
    """
  end

  # ── Loot Tab ───────────────────────────────────────────────────────

  defp render_tab(%{tab: "loot"} = assigns) do
    ~H"""
    <table class="w-full">
      <thead>
        <tr class="border-b border-zinc-800 text-left">
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-8"></th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">NPC</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Drops</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Preview</th>
        </tr>
      </thead>
      <tbody>
        <%= for row <- @rows do %>
        <tr phx-click="expand_row" phx-value-id={row.id}
          class={["border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer",
                   @expanded_id == row.id && "bg-amber-900/10 border-amber-800/30"]}>
          <td class="px-3 py-2 text-xs text-zinc-600">{if @expanded_id == row.id, do: "▼", else: "▶"}</td>
          <td class="px-3 py-2 text-sm text-zinc-200 font-medium">💀 {row.name}</td>
          <td class="px-3 py-2">
            <span class="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">{row.drop_count} entries</span>
          </td>
          <td class="px-3 py-2 text-xs text-zinc-500 font-mono max-w-[300px] truncate">{row.drop_preview}</td>
        </tr>
        <!-- Loot Table Visual Editor -->
        <tr :if={@expanded_id == row.id} class="bg-zinc-950/50">
          <td colspan="4" class="p-0">
            <div class="px-6 py-4 border-l-2 border-purple-600/50">
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-xs font-bold uppercase tracking-wider text-purple-400">Drop Table Editor</h4>
                <div class="flex gap-2 items-center">
                  <input type="text" placeholder="Search item to add..." value={@item_search}
                    phx-keyup="item_search_change" name="item_search"
                    class="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 w-48" />
                  <button phx-click="loot_add_drop" phx-value-item-id="0"
                    class="px-2 py-1 bg-purple-700 hover:bg-purple-600 text-white rounded text-xs">+ Generic Drop</button>
                </div>
              </div>
              <!-- Item picker for loot -->
              <div :if={@item_search != "" && String.length(@item_search) >= 2} class="mb-4 bg-zinc-900 border border-zinc-700 rounded p-2 max-h-32 overflow-y-auto">
                <div class="text-[10px] text-zinc-500 mb-1">Click to add as drop:</div>
                <%= for item <- Enum.filter(@game_items_list, fn i -> String.contains?(String.downcase(i.name), String.downcase(@item_search)) end) |> Enum.take(8) do %>
                  <button phx-click="loot_add_drop" phx-value-item-id={item.id}
                    class="block w-full text-left px-2 py-1 text-xs text-zinc-300 hover:bg-purple-900/30 hover:text-purple-300 rounded transition-colors">
                    <span class="mr-1">{item.icon}</span> {item.name}
                  </button>
                <% end %>
              </div>
              <!-- Drop entries -->
              <div :if={@expanded_data && @expanded_data != []} class="space-y-2">
                <%= for {drop, idx} <- Enum.with_index(@expanded_data || []) do %>
                <div class="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 items-center px-3 py-2 rounded bg-zinc-900/50 border border-zinc-800/50 group">
                  <div class="flex items-center gap-2">
                    <span class="text-zinc-500 text-xs font-mono w-4">{idx + 1}.</span>
                    <select phx-blur="loot_update_drop" phx-value-index={idx} phx-value-field="item_id"
                      class="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200">
                      <option value="0" selected={drop["item_id"] == nil}>🎲 Random / Generic</option>
                      <option :for={item <- @game_items_list} value={item.id} selected={drop["item_id"] == item.id}>
                        {item.icon} {item.name}
                      </option>
                    </select>
                  </div>
                  <div>
                    <label class="text-[10px] text-zinc-500 block">Chance %</label>
                    <input type="number" value={drop["chance"]} min="1" max="100"
                      phx-blur="loot_update_drop" phx-value-index={idx} phx-value-field="chance"
                      class="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-purple-400 text-right" />
                  </div>
                  <div>
                    <label class="text-[10px] text-zinc-500 block">Min Qty</label>
                    <input type="number" value={drop["min_qty"]} min="1"
                      phx-blur="loot_update_drop" phx-value-index={idx} phx-value-field="min_qty"
                      class="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 text-right" />
                  </div>
                  <div>
                    <label class="text-[10px] text-zinc-500 block">Max Qty</label>
                    <input type="number" value={drop["max_qty"]} min="1"
                      phx-blur="loot_update_drop" phx-value-index={idx} phx-value-field="max_qty"
                      class="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 text-right" />
                  </div>
                  <button phx-click="loot_remove_drop" phx-value-index={idx}
                    data-confirm="Remove this drop?"
                    class="text-red-500 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity mt-3">✕</button>
                </div>
                <!-- Visual chance bar -->
                <div class="px-3 ml-7">
                  <div class="w-full bg-zinc-800 rounded-full h-1.5">
                    <div class="bg-purple-500 h-1.5 rounded-full transition-all" style={"width: #{min(drop["chance"] || 0, 100)}%"}></div>
                  </div>
                </div>
                <% end %>
              </div>
              <div :if={@expanded_data == nil || @expanded_data == []} class="text-xs text-zinc-600 italic py-2">
                No drops configured — add items above
              </div>
            </div>
          </td>
        </tr>
        <% end %>
      </tbody>
    </table>
    <div :if={@rows == []} class="p-8 text-center text-zinc-600 text-sm">No NPCs with loot tables found</div>
    """
  end

  # ── Crafting Tab ───────────────────────────────────────────────────

  defp render_tab(%{tab: "crafting", total: -1} = assigns) do
    ~H"""
    <div class="p-8 text-center text-zinc-600 text-sm">No crafting recipes configured</div>
    """
  end

  defp render_tab(%{tab: "crafting"} = assigns) do
    categories = craft_categories()
    unlock_modes = unlock_modes()
    assigns = assign(assigns, categories: categories, unlock_modes: unlock_modes)

    ~H"""
    <div class="p-4">
      <!-- New Recipe Button -->
      <div :if={@recipe_form == nil} class="mb-4">
        <button phx-click="new_recipe" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-medium">
          + New Recipe
        </button>
      </div>

      <!-- Recipe Form -->
      <div :if={@recipe_form != nil} class="mb-6 bg-zinc-800 border border-zinc-700 rounded-lg p-5">
        <h3 class="text-lg font-bold text-amber-400 mb-4">
          {if @recipe_editing_id, do: "Edit Recipe ##{@recipe_editing_id}", else: "New Recipe"}
        </h3>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Name</label>
            <input type="text" value={@recipe_form["name"]}
              phx-blur="update_recipe_field" phx-value-field="name"
              phx-keyup="update_recipe_field" phx-value-field="name"
              class="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Icon (emoji)</label>
            <input type="text" value={@recipe_form["icon"]}
              phx-blur="update_recipe_field" phx-value-field="icon"
              phx-keyup="update_recipe_field" phx-value-field="icon"
              class="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Category</label>
            <select phx-change="update_recipe_field" phx-value-field="category" name="value"
              class="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
              <option :for={c <- @categories} value={c} selected={@recipe_form["category"] == c}>{c}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Result Item</label>
            <select phx-change="update_recipe_field" phx-value-field="result_item_id" name="value"
              class="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
              <option value="0">-- Select Item --</option>
              <option :for={item <- @game_items_list} value={item.id} selected={to_int(@recipe_form["result_item_id"]) == item.id}>
                {item.icon} {item.name} (#{item.id})
              </option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Result Qty</label>
            <input type="number" value={@recipe_form["result_qty"]} min="1"
              phx-blur="update_recipe_field" phx-value-field="result_qty"
              class="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Level Req</label>
            <input type="number" value={@recipe_form["level_req"]} min="1"
              phx-blur="update_recipe_field" phx-value-field="level_req"
              class="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Unlock Mode</label>
            <select phx-change="update_recipe_field" phx-value-field="unlock_mode" name="value"
              class="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
              <option :for={m <- @unlock_modes} value={m} selected={@recipe_form["unlock_mode"] == m}>{m}</option>
            </select>
          </div>
          <div class="flex items-end gap-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <span class="text-xs text-zinc-500">Active</span>
              <button type="button" phx-click="toggle_recipe_field" phx-value-field="is_active"
                class={["w-10 h-5 rounded-full transition-colors relative",
                  @recipe_form["is_active"] && "bg-green-600",
                  !@recipe_form["is_active"] && "bg-zinc-700"]}>
                <span class={["absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                  @recipe_form["is_active"] && "left-5",
                  !@recipe_form["is_active"] && "left-0.5"]}></span>
              </button>
            </label>
          </div>
        </div>
        <div class="mb-4">
          <label class="block text-xs text-zinc-500 mb-1">Description</label>
          <textarea phx-blur="update_recipe_field" phx-value-field="description"
            rows="2"
            class="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">{@recipe_form["description"]}</textarea>
        </div>

        <!-- Ingredients Builder -->
        <div class="mb-4">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-sm font-bold text-zinc-300">Ingredients</h4>
            <button type="button" phx-click="add_ingredient" class="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded text-xs">+ Add Ingredient</button>
          </div>
          <div :for={{ing, idx} <- Enum.with_index(@form_ingredients)} class="flex items-center gap-3 mb-2">
            <select phx-change="update_ingredient" phx-value-index={idx} phx-value-field="item_id" name="value"
              class="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
              <option value="0">-- Select Item --</option>
              <option :for={item <- @game_items_list} value={item.id} selected={to_string(item.id) == to_string(ing["item_id"])}>
                {item.icon} {item.name} (#{item.id})
              </option>
            </select>
            <div class="w-24">
              <input type="number" value={ing["qty"]} min="1" placeholder="Qty"
                phx-blur="update_ingredient" phx-value-index={idx} phx-value-field="qty"
                class="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
            </div>
            <button type="button" phx-click="remove_ingredient" phx-value-index={idx}
              class="px-2 py-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded text-sm">X</button>
          </div>
        </div>

        <!-- Form Actions -->
        <div class="flex gap-3">
          <button phx-click="save_recipe" class="px-5 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-medium">
            {if @recipe_editing_id, do: "Update Recipe", else: "Create Recipe"}
          </button>
          <button phx-click="cancel_recipe" class="px-5 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded text-sm">Cancel</button>
        </div>
      </div>

      <!-- Recipe Table -->
      <table class="w-full">
        <thead>
          <tr class="border-b border-zinc-800 text-left">
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">ID</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Icon</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Name</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Category</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Result</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Qty</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Lvl</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Unlock</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Active</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr :for={row <- @rows} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
            <td class="px-3 py-2 text-sm text-zinc-500 font-mono">{row.id}</td>
            <td class="px-3 py-2 text-sm">{row.icon}</td>
            <td class="px-3 py-2 text-sm text-zinc-200 font-medium">{row.name}</td>
            <td class="px-3 py-2 text-sm text-zinc-400">{row.category}</td>
            <td class="px-3 py-2 text-sm text-zinc-300">{row.item_name}</td>
            <td class="px-3 py-2 text-sm text-zinc-400">{row.result_qty}</td>
            <td class="px-3 py-2 text-sm text-zinc-400">{row.level_req}</td>
            <td class="px-3 py-2 text-sm text-zinc-400">{row.unlock_mode}</td>
            <td class="px-3 py-2 text-sm">{bool_badge(row.is_active)}</td>
            <td class="px-3 py-2 text-sm">
              <div class="flex gap-1">
                <button phx-click="edit_recipe" phx-value-id={row.id}
                  class="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded text-xs">Edit</button>
                <button phx-click="delete_recipe" phx-value-id={row.id}
                  data-confirm="Delete this recipe?"
                  class="px-2 py-1 bg-red-900/50 hover:bg-red-800/50 text-red-400 rounded text-xs">Del</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div :if={@rows == []} class="p-8 text-center text-zinc-600 text-sm">No crafting recipes found</div>
    </div>
    """
  end

  # ── Quests Tab ─────────────────────────────────────────────────────

  defp render_tab(%{tab: "quests"} = assigns) do
    quest_types = quest_types()
    objective_types = objective_types()
    assigns = assign(assigns, quest_types: quest_types, objective_types: objective_types)

    ~H"""
    <div class="p-4">
      <!-- New Quest Button -->
      <div :if={@quest_form == nil} class="mb-4">
        <button phx-click="new_quest" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-medium">
          + New Quest
        </button>
      </div>

      <!-- Quest Form -->
      <div :if={@quest_form != nil} class="mb-6 bg-zinc-800 border border-zinc-700 rounded-lg p-5">
        <h3 class="text-lg font-bold text-amber-400 mb-4">
          {if @quest_editing_id, do: "Edit Quest ##{@quest_editing_id}", else: "New Quest"}
        </h3>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Name</label>
            <input type="text" value={@quest_form["name"]}
              phx-blur="update_quest_field" phx-value-field="name"
              phx-keyup="update_quest_field" phx-value-field="name"
              class="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Quest Type</label>
            <select phx-change="update_quest_field" phx-value-field="quest_type" name="value"
              class="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
              <option :for={qt <- @quest_types} value={qt} selected={@quest_form["quest_type"] == qt}>{String.capitalize(qt)}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Required Level</label>
            <input type="number" value={@quest_form["level_req"]} min="1"
              phx-blur="update_quest_field" phx-value-field="level_req"
              class="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
          </div>
          <div class="flex items-end gap-6">
            <label class="flex items-center gap-2 cursor-pointer">
              <span class="text-xs text-zinc-500">Repeatable</span>
              <button type="button" phx-click="toggle_quest_field" phx-value-field="is_repeatable"
                class={["w-10 h-5 rounded-full transition-colors relative",
                  @quest_form["is_repeatable"] && "bg-green-600",
                  !@quest_form["is_repeatable"] && "bg-zinc-700"]}>
                <span class={["absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                  @quest_form["is_repeatable"] && "left-5",
                  !@quest_form["is_repeatable"] && "left-0.5"]}></span>
              </button>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <span class="text-xs text-zinc-500">Active</span>
              <button type="button" phx-click="toggle_quest_field" phx-value-field="is_active"
                class={["w-10 h-5 rounded-full transition-colors relative",
                  @quest_form["is_active"] && "bg-green-600",
                  !@quest_form["is_active"] && "bg-zinc-700"]}>
                <span class={["absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                  @quest_form["is_active"] && "left-5",
                  !@quest_form["is_active"] && "left-0.5"]}></span>
              </button>
            </label>
          </div>
        </div>
        <div :if={@quest_form["is_repeatable"]} class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Cooldown (hours)</label>
            <input type="number" value={@quest_form["cooldown_hours"]} min="0"
              phx-blur="update_quest_field" phx-value-field="cooldown_hours"
              class="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
            <div class="text-[10px] text-zinc-600 mt-0.5">0 = no cooldown</div>
          </div>
          <div>
            <label class="block text-xs text-zinc-500 mb-1">Max Completions</label>
            <input type="number" value={@quest_form["max_completions"]} min="0"
              phx-blur="update_quest_field" phx-value-field="max_completions"
              class="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
            <div class="text-[10px] text-zinc-600 mt-0.5">0 = unlimited</div>
          </div>
        </div>
        <div class="mb-4">
          <label class="block text-xs text-zinc-500 mb-1">Description</label>
          <textarea phx-blur="update_quest_field" phx-value-field="description"
            rows="3"
            class="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">{@quest_form["description"]}</textarea>
        </div>

        <!-- Objectives Builder -->
        <div class="mb-4">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-sm font-bold text-zinc-300">Objectives</h4>
            <button type="button" phx-click="add_objective" class="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded text-xs">+ Add Objective</button>
          </div>
          <div :for={{obj, idx} <- Enum.with_index(@form_objectives)} class="flex items-center gap-2 mb-2 bg-zinc-900/50 border border-zinc-700/50 rounded p-2">
            <select phx-change="update_objective" phx-value-index={idx} phx-value-field="type" name="value"
              class="w-28 px-2 py-1.5 bg-zinc-900 border border-zinc-600 rounded text-xs text-zinc-200 focus:border-amber-500 focus:outline-none">
              <option :for={ot <- @objective_types} value={ot} selected={obj["type"] == ot}>{String.capitalize(ot)}</option>
            </select>
            <input type="text" value={obj["target"]} placeholder="Target"
              phx-blur="update_objective" phx-value-index={idx} phx-value-field="target"
              class="flex-1 px-2 py-1.5 bg-zinc-900 border border-zinc-600 rounded text-xs text-zinc-200 focus:border-amber-500 focus:outline-none" />
            <input type="number" value={obj["count"]} min="1" placeholder="#"
              phx-blur="update_objective" phx-value-index={idx} phx-value-field="count"
              class="w-16 px-2 py-1.5 bg-zinc-900 border border-zinc-600 rounded text-xs text-zinc-200 focus:border-amber-500 focus:outline-none" />
            <input type="text" value={obj["label"]} placeholder="Label"
              phx-blur="update_objective" phx-value-index={idx} phx-value-field="label"
              class="flex-1 px-2 py-1.5 bg-zinc-900 border border-zinc-600 rounded text-xs text-zinc-200 focus:border-amber-500 focus:outline-none" />
            <button type="button" phx-click="remove_objective" phx-value-index={idx}
              class="px-2 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded text-xs">X</button>
          </div>
        </div>

        <!-- Rewards Builder -->
        <div class="mb-4">
          <h4 class="text-sm font-bold text-zinc-300 mb-2">Rewards</h4>
          <div class="grid grid-cols-2 gap-4 mb-3">
            <div>
              <label class="block text-xs text-zinc-500 mb-1">XP Reward</label>
              <input type="number" value={@form_rewards["xp"]} min="0"
                phx-blur="update_reward_field" phx-value-field="xp"
                class="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
            </div>
            <div>
              <label class="block text-xs text-zinc-500 mb-1">Gold Reward</label>
              <input type="number" value={@form_rewards["gold"]} min="0"
                phx-blur="update_reward_field" phx-value-field="gold"
                class="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
            </div>
          </div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-zinc-500">Item Rewards</span>
            <button type="button" phx-click="add_reward_item" class="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded text-xs">+ Add Item</button>
          </div>
          <div :for={{ri, idx} <- Enum.with_index(@form_rewards["items"] || [])} class="flex items-center gap-3 mb-2">
            <select phx-change="update_reward_item" phx-value-index={idx} phx-value-field="item_id" name="value"
              class="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none">
              <option value="0">-- Select Item --</option>
              <option :for={item <- @game_items_list} value={item.id} selected={to_string(item.id) == to_string(ri["item_id"])}>
                {item.icon} {item.name} (#{item.id})
              </option>
            </select>
            <div class="w-24">
              <input type="number" value={ri["quantity"]} min="1" placeholder="Qty"
                phx-blur="update_reward_item" phx-value-index={idx} phx-value-field="quantity"
                class="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 rounded text-sm text-zinc-200 focus:border-amber-500 focus:outline-none" />
            </div>
            <button type="button" phx-click="remove_reward_item" phx-value-index={idx}
              class="px-2 py-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded text-sm">X</button>
          </div>
        </div>

        <!-- Form Actions -->
        <div class="flex gap-3">
          <button phx-click="save_quest" class="px-5 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-medium">
            {if @quest_editing_id, do: "Update Quest", else: "Create Quest"}
          </button>
          <button phx-click="cancel_quest" class="px-5 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded text-sm">Cancel</button>
        </div>
      </div>

      <!-- Quest Table -->
      <table class="w-full">
        <thead>
          <tr class="border-b border-zinc-800 text-left">
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">ID</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Name</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Type</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Lvl</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Active</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Repeatable</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Description</th>
            <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr :for={row <- @rows} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
            <td class="px-3 py-2 text-sm text-zinc-500 font-mono">{row.id}</td>
            <td class="px-3 py-2 text-sm text-zinc-200 font-medium">{row.name}</td>
            <td class="px-3 py-2 text-sm text-zinc-400">{row.quest_type}</td>
            <td class="px-3 py-2 text-sm text-zinc-400">{row.level_req}</td>
            <td class="px-3 py-2 text-sm">{bool_badge(row.is_active)}</td>
            <td class="px-3 py-2 text-sm">{bool_badge(row.is_repeatable)}</td>
            <td class="px-3 py-2 text-sm text-zinc-500 max-w-[200px] truncate">{row.description}</td>
            <td class="px-3 py-2 text-sm">
              <div class="flex gap-1">
                <button phx-click="edit_quest" phx-value-id={row.id}
                  class="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded text-xs">Edit</button>
                <button phx-click="delete_quest" phx-value-id={row.id}
                  data-confirm="Delete this quest?"
                  class="px-2 py-1 bg-red-900/50 hover:bg-red-800/50 text-red-400 rounded text-xs">Del</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div :if={@rows == []} class="p-8 text-center text-zinc-600 text-sm">No quests found</div>
    </div>
    """
  end

  # ── Achievements Tab ───────────────────────────────────────────────

  defp render_tab(%{tab: "achievements"} = assigns) do
    categories = @achievement_categories
    triggers = @achievement_triggers
    assigns = assign(assigns, :ach_categories, categories) |> assign(:ach_triggers, triggers)

    ~H"""
    <!-- Create button -->
    <div class="flex justify-end mb-4">
      <button :if={!@achievement_form} phx-click="create_achievement"
        class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium">+ New Achievement</button>
    </div>

    <!-- Create/Edit Form -->
    <div :if={@achievement_form} class="bg-zinc-900 border border-amber-800/30 rounded-xl p-5 mb-6">
      <h3 class="text-sm font-bold uppercase tracking-wider text-amber-400 mb-4">
        {if @achievement_editing_id, do: "Edit Achievement", else: "Create Achievement"}
      </h3>
      <form phx-submit="save_achievement" phx-change="achievement_form_change" class="space-y-3">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label class="text-[10px] text-zinc-500 uppercase block mb-1">Title</label>
            <input type="text" name="title" value={@achievement_form["title"]}
              class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200" />
          </div>
          <div>
            <label class="text-[10px] text-zinc-500 uppercase block mb-1">Key Name</label>
            <input type="text" name="key_name" value={@achievement_form["key_name"]} placeholder="auto from title"
              class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200" />
          </div>
          <div>
            <label class="text-[10px] text-zinc-500 uppercase block mb-1">Icon</label>
            <input type="text" name="icon" value={@achievement_form["icon"]}
              class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200" />
          </div>
          <div>
            <label class="text-[10px] text-zinc-500 uppercase block mb-1">Sort Order</label>
            <input type="number" name="sort_order" value={@achievement_form["sort_order"]}
              class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200" />
          </div>
        </div>
        <div>
          <label class="text-[10px] text-zinc-500 uppercase block mb-1">Description</label>
          <textarea name="description" rows="2" class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200">{@achievement_form["description"]}</textarea>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label class="text-[10px] text-zinc-500 uppercase block mb-1">Category</label>
            <select name="category" class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200">
              <option :for={{label, val} <- @ach_categories} value={val} selected={@achievement_form["category"] == val}>{label}</option>
            </select>
          </div>
          <div>
            <label class="text-[10px] text-zinc-500 uppercase block mb-1">Trigger Type</label>
            <select name="trigger_type" class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200">
              <option :for={{label, val} <- @ach_triggers} value={val} selected={@achievement_form["trigger_type"] == val}>{label}</option>
            </select>
          </div>
          <div>
            <label class="text-[10px] text-zinc-500 uppercase block mb-1">Trigger Value</label>
            <input type="number" name="trigger_value" value={@achievement_form["trigger_value"]}
              class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200" />
          </div>
          <div>
            <label class="text-[10px] text-zinc-500 uppercase block mb-1">Reward Gold</label>
            <input type="number" name="reward_gold" value={@achievement_form["reward_gold"]}
              class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200" />
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label class="text-[10px] text-zinc-500 uppercase block mb-1">Reward Title</label>
            <input type="text" name="reward_title" value={@achievement_form["reward_title"]} placeholder="Title granted"
              class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200" />
          </div>
          <label class="flex items-center gap-2 py-4 cursor-pointer">
            <input type="hidden" name="is_hidden" value="0" />
            <input type="checkbox" name="is_hidden" value="1" checked={@achievement_form["is_hidden"] == "1"}
              class="rounded bg-zinc-800 border-zinc-600" />
            <span class="text-xs text-zinc-300">Hidden until unlocked</span>
          </label>
          <label class="flex items-center gap-2 py-4 cursor-pointer">
            <input type="hidden" name="is_active" value="0" />
            <input type="checkbox" name="is_active" value="1" checked={@achievement_form["is_active"] != "0"}
              class="rounded bg-zinc-800 border-zinc-600" />
            <span class="text-xs text-zinc-300">Active</span>
          </label>
        </div>
        <div class="flex gap-2">
          <button type="submit" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium">
            {if @achievement_editing_id, do: "Save Changes", else: "Create Achievement"}
          </button>
          <button type="button" phx-click="cancel_achievement" class="px-4 py-2 bg-zinc-700 text-zinc-300 rounded text-xs">Cancel</button>
        </div>
      </form>
    </div>

    <!-- Table -->
    <table class="w-full">
      <thead>
        <tr class="border-b border-zinc-800 text-left">
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Icon</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Title</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Category</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Trigger</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Value</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Reward</th>
          <th class="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-20">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr :for={row <- @rows} class="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
          <td class="px-3 py-2 text-lg">{row.icon || "🏆"}</td>
          <td class="px-3 py-2 text-sm text-zinc-200 font-medium">{row.title}</td>
          <td class="px-3 py-2"><span class="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">{row.category}</span></td>
          <td class="px-3 py-2 text-xs text-zinc-400">{row.trigger_type}</td>
          <td class="px-3 py-2 text-sm text-zinc-300 font-mono">{row.trigger_value}</td>
          <td class="px-3 py-2 text-sm text-amber-400">{if row.reward_gold > 0, do: "#{row.reward_gold}g", else: ""} {row.reward_title}</td>
          <td class="px-3 py-2">
            <div class="flex gap-2">
              <button phx-click="edit_achievement" phx-value-id={row.id} class="text-xs text-amber-500 hover:text-amber-400">Edit</button>
              <button phx-click="delete_achievement" phx-value-id={row.id} data-confirm="Delete this achievement?"
                class="text-xs text-red-500 hover:text-red-400">Del</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <div :if={@rows == []} class="p-8 text-center text-zinc-600 text-sm">No achievements found</div>
    """
  end

  defp render_tab(assigns) do
    ~H"""
    <div class="p-8 text-center text-zinc-600 text-sm">Unknown tab</div>
    """
  end

  # ── Helpers ───────────────────────────────────────────────────────

  defp default_objective, do: %{"type" => "kill", "target" => "", "count" => 1, "label" => ""}
  defp default_ingredient, do: %{"item_id" => "0", "qty" => "1"}

  defp quest_types, do: @quest_types
  defp objective_types, do: @objective_types
  defp craft_categories, do: @craft_categories
  defp unlock_modes, do: @unlock_modes

  defp to_int(val) when is_integer(val), do: val
  defp to_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp to_int(_), do: 0

  defp to_int(val, _default) when is_integer(val), do: val
  defp to_int(val, default) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> default
    end
  end
  defp to_int(_, default), do: default

  defp parse_json(nil, default), do: default
  defp parse_json("", default), do: default
  defp parse_json(val, default) when is_binary(val) do
    case Jason.decode(val) do
      {:ok, parsed} -> parsed
      _ -> default
    end
  end
  defp parse_json(val, _default) when is_map(val) or is_list(val), do: val
  defp parse_json(_, default), do: default

  defp truncate(nil, _len), do: ""
  defp truncate(val, len) when is_binary(val) do
    if String.length(val) > len, do: String.slice(val, 0, len) <> "...", else: val
  end
  defp truncate(val, _len), do: to_string(val)

  defp rarity_color(nil), do: "text-zinc-500"
  defp rarity_color(r) when is_binary(r) do
    case String.downcase(r) do
      "common" -> "text-zinc-400"
      "uncommon" -> "text-green-400"
      "rare" -> "text-blue-400"
      "epic" -> "text-purple-400"
      "legendary" -> "text-amber-400"
      _ -> "text-zinc-400"
    end
  end
  defp rarity_color(_), do: "text-zinc-500"

  defp bool_badge(val) when val in [1, true, "1", "true"] do
    Phoenix.HTML.raw(~s(<span class="text-xs px-2 py-0.5 rounded bg-green-900/50 text-green-400">Yes</span>))
  end
  defp bool_badge(_val) do
    Phoenix.HTML.raw(~s(<span class="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-500">No</span>))
  end
end
