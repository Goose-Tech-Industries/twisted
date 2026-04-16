defmodule TePhoenixWeb.Admin.SmartFields do
  @moduledoc """
  Smart field rendering for HubCrud forms. Detects column names and
  types, then renders the appropriate no-code input:

    * JSON columns ending in `_json` / `effects` / `elements` →
      RuleBuilder component with the right schema
    * Columns named `class_id`, `race_id`, `status_id`, etc. →
      dropdown populated from the referenced table
    * Columns named `type`, `category`, `target_type` →
      enum dropdown with known values
    * Boolean columns → checkbox
    * Numeric columns → number input with step
    * Everything else → text input

  This makes every HubCrud tab no-code automatically — no per-table
  LiveView needed. The SmartFields module inspects the column name
  and returns the appropriate component.
  """

  alias TePhoenix.Repo

  @json_schemas %{
    "effects" => :battle_rule_effect,
    "effects_json" => :status_effects,
    "tick_json" => :status_tick,
    "condition_json" => :battle_rule_condition,
    "effect_json" => :battle_rule_effect,
    "on_complete_json" => :objective_callback,
    "on_progress_json" => :objective_callback,
    "on_fail_json" => :objective_callback,
    "on_enter_json" => :battle_rule_effect,
    "on_exit_json" => :battle_rule_effect,
    "reacts_with_json" => :surface_reaction,
    "rewards_json" => :match_rewards,
    "win_conditions_json" => :match_win_condition,
    "settings_json" => nil,
    "heal_status" => :battle_rule_effect,
    "battlemod" => :battle_rule_effect,
    "inventorymod" => :objective_callback,
    "equipmod" => :status_effects,
    "statusmod" => :status_effects
  }

  @enum_fields %{
    "type" => ~w(physical magic fire ice water lightning poison dark holy wind earth true percent_hp),
    "target_type" => ~w(ENEMY ALLY SELF ALL),
    "target_pvp" => ~w(ENEMY ALLY SELF ALL),
    "category" => ~w(buff debuff dot hot control injury other),
    "stacking" => ~w(refresh stack upgrade ignore),
    "queue_type" => ~w(casual ranked custom),
    "progress_model" => ~w(boolean counter timer hp),
    "rarity" => ~w(common uncommon rare epic legendary),
    "slot_type" => ~w(weapon armor helmet accessory shield ring),
    "damage_type" => ~w(physical magic fire ice water lightning poison dark holy wind earth true),
    "gender" => ~w(male female nonbinary),
    "alignment" => ~w(lawful_good neutral_good chaotic_good lawful_neutral true_neutral chaotic_neutral lawful_evil neutral_evil chaotic_evil),
    "difficulty" => ~w(easy normal hard nightmare),
    "element" => ~w(fire ice water lightning poison dark holy wind earth void),
    "trigger_event" => ~w(damage_taken attack_landed limb_broken ko death turn_start turn_end crit_scored equip_item unequip_item item_used location_enter level_up battle_start battle_end boss_phase)
  }

  @fk_tables %{
    "class_id" => "game_classes",
    "race_id" => "game_races",
    "skill_id" => "game_skills",
    "item_id" => "game_items",
    "map_id" => "game_maps",
    "npc_id" => "game_npcs",
    "quest_id" => "game_quest_defs",
    "region_id" => "game_regions",
    "status_id" => "game_battle_statuses",
    "element_id" => "game_elements",
    "script_id" => "game_visual_scripts",
    "pack_id" => "game_card_packs",
    "objective_key" => "game_objective_defs",
    "wave_key" => "game_wave_defs",
    "surface_key" => "game_surface_defs",
    "building_key" => "game_strategy_buildings",
    "unit_key" => "game_strategy_units"
  }

  @doc "Get the smart field type for a column."
  def smart_type(col) do
    cond do
      Map.has_key?(@json_schemas, col) -> {:rule_builder, Map.get(@json_schemas, col)}
      String.ends_with?(col, "_json") -> {:rule_builder, nil}
      String.ends_with?(col, "elements") and col != "elements" -> {:rule_builder, nil}
      Map.has_key?(@enum_fields, col) -> {:enum, Map.get(@enum_fields, col)}
      Map.has_key?(@fk_tables, col) -> {:fk, Map.get(@fk_tables, col)}
      col in ~w(icon emoji sprite) -> :emoji
      col in ~w(description descript battle_text persona) -> :textarea
      col in ~w(effects equipmod battlemod inventorymod statusmod) -> {:rule_builder, :status_effects}
      true -> nil
    end
  end

  @doc "Get dropdown options for a foreign key column."
  def fk_options(table) do
    name_col = cond do
      table in ~w(game_battle_statuses game_surface_defs game_objective_defs game_wave_defs) -> "key"
      true -> "name"
    end

    case Repo.query("SELECT id, #{name_col} FROM #{table} ORDER BY #{name_col} ASC LIMIT 500") do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, name] -> %{id: id, name: name || "##{id}"} end)
      _ -> []
    end
  rescue
    _ -> []
  end

  @doc "Get enum options for a column."
  def enum_options(col) do
    Map.get(@enum_fields, col, [])
  end

  @doc "Get the rule builder schema for a JSON column."
  def json_schema(col) do
    Map.get(@json_schemas, col)
  end

  @doc """
  Detect if a column has special elements that should be rendered as
  multi-select checkboxes (e.g. elements, weaknesses, status arrays).
  """
  def is_multi_select?(col) do
    col in ~w(elements weaknesses weapon_elements blockstatus autostatus heal_status setstatusarray healstatusarray elementalarray blockstatusarray classarray equipslots)
  end

  @doc "Get multi-select options for array-type columns."
  def multi_select_options(col) do
    cond do
      col in ~w(elements weaknesses weapon_elements elementalarray) ->
        ~w(fire ice water lightning poison dark holy wind earth void)

      col in ~w(blockstatus autostatus setstatusarray healstatusarray) ->
        list_status_keys()

      col in ~w(classarray) ->
        list_class_names()

      col in ~w(equipslots) ->
        ~w(rhand lhand head body accessory i1 i2 i3 i4 i5)

      true -> []
    end
  end

  defp list_status_keys do
    case Repo.query("SELECT `key` FROM game_battle_statuses ORDER BY `key` ASC LIMIT 200") do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [k] -> k end)
      _ -> []
    end
  rescue
    _ -> []
  end

  defp list_class_names do
    case Repo.query("SELECT name FROM game_classes ORDER BY name ASC LIMIT 100") do
      {:ok, %{rows: rows}} -> Enum.map(rows, fn [n] -> n end)
      _ -> []
    end
  rescue
    _ -> []
  end
end
