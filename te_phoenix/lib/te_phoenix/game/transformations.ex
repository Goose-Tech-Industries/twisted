defmodule TePhoenix.Game.Transformations do
  @moduledoc """
  Transformation system — handles form changes, power multipliers,
  unlock checks, duration/drain, controllability, and visual effects.

  All transformation data comes from `game_transformations` table.
  Admin configures everything — forms, chains, unlock conditions,
  multipliers, visuals, loss conditions.
  """

  alias TePhoenix.Repo
  require Logger

  @cache_ttl 300_000

  defp cache do
    case :ets.whereis(:transformations_cache) do
      :undefined -> :ets.new(:transformations_cache, [:named_table, :public, :set]); :transformations_cache
      _ -> :transformations_cache
    end
  end

  def get_available(char_id, opts \\ []) do
    race = Keyword.get(opts, :race)
    _class_name = Keyword.get(opts, :class_name)
    ruleset_id = Keyword.get(opts, :ruleset_id)

    # Get all transformations for this race/ruleset
    all_forms = get_forms(ruleset_id, race)

    # Get character's unlocked transformations
    unlocked = case Repo.query(
      "SELECT transformation_id, is_controlled, times_triggered, current_stack_tier FROM character_transformations WHERE character_id=? AND is_unlocked=1",
      [char_id]
    ) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
    unlocked_ids = MapSet.new(Enum.map(unlocked, & &1["transformation_id"]))

    # Get active transformation
    active = case Repo.query(
      "SELECT transformation_id, stack_tier, turns_remaining FROM character_active_transformation WHERE character_id=?",
      [char_id]
    ) do
      {:ok, %{rows: [[tid, tier, turns]]}} -> %{transformation_id: tid, stack_tier: tier, turns_remaining: turns}
      _ -> nil
    end

    %{
      forms: Enum.map(all_forms, fn f ->
        is_unlocked = MapSet.member?(unlocked_ids, f["id"])
        char_data = Enum.find(unlocked, fn u -> u["transformation_id"] == f["id"] end)
        Map.merge(f, %{
          "unlocked" => is_unlocked,
          "is_controlled" => char_data && char_data["is_controlled"] == 1,
          "times_used" => char_data && char_data["times_triggered"] || 0,
          "is_active" => active && active.transformation_id == f["id"],
          "current_tier" => if(active && active.transformation_id == f["id"], do: active.stack_tier, else: 0)
        })
      end),
      active: active
    }
  end

  @doc "Attempt to transform. Returns {:ok, effects} or {:error, reason}"
  def transform(char_id, transformation_id, opts \\ []) do
    stack_tier = Keyword.get(opts, :stack_tier, 0)

    form = get_form(transformation_id)
    if is_nil(form), do: {:error, "Transformation not found"}

    # Check if already active
    case Repo.query("SELECT transformation_id FROM character_active_transformation WHERE character_id=?", [char_id]) do
      {:ok, %{rows: [[existing_id]]}} when existing_id != transformation_id ->
        {:error, "Already transformed. Revert first."}
      _ -> :ok
    end

    # Check unlocked
    case Repo.query("SELECT is_unlocked, is_controlled FROM character_transformations WHERE character_id=? AND transformation_id=?",
      [char_id, transformation_id]) do
      {:ok, %{rows: [[1, controlled]]}} ->
        # Check controllability
        controllable = form["controllable"] == 1 or controlled == 1

        # Activation cost
        cost_pct = to_float(form["activation_cost_pct"])
        if cost_pct > 0 do
          case Repo.query("SELECT atk FROM characters WHERE id=?", [char_id]) do
            {:ok, %{rows: [[pl]]}} ->
              cost = round(pl * cost_pct / 100)
              Repo.query!("UPDATE characters SET atk = GREATEST(1, atk - ?) WHERE id=?", [cost, char_id])
            _ -> nil
          end
        end

        # Get multiplier (handle stackable tiers)
        {multiplier, tier_name, drain} = if form["is_stackable"] == 1 and stack_tier > 0 do
          tiers = case form["stack_tiers_json"] do
            j when is_binary(j) -> (try do Jason.decode!(j) rescue _ -> [] end)
            j when is_list(j) -> j
            _ -> []
          end
          tier = Enum.find(tiers, fn t -> t["tier"] == stack_tier end)
          if tier do
            {to_float(tier["multiplier"]), tier["name"] || form["name"], to_float(tier["drain"])}
          else
            {to_float(form["power_multiplier"]), form["name"], to_float(form["drain_per_turn_pct"])}
          end
        else
          {to_float(form["power_multiplier"]), form["name"], to_float(form["drain_per_turn_pct"])}
        end

        # Set active
        turns = case form["duration_type"] do
          "timed" -> form["duration_turns"]
          _ -> nil
        end

        try do
          Repo.query!("DELETE FROM character_active_transformation WHERE character_id=?", [char_id])
          Repo.query!(
            "INSERT INTO character_active_transformation (character_id, transformation_id, stack_tier, activated_at, turns_remaining) VALUES (?,?,?,NOW(),?)",
            [char_id, transformation_id, stack_tier, turns])
          Repo.query!("UPDATE character_transformations SET times_triggered=times_triggered+1, last_used_at=NOW(), current_stack_tier=? WHERE character_id=? AND transformation_id=?",
            [stack_tier, char_id, transformation_id])
        rescue _ -> nil
        end

        {:ok, %{
          name: tier_name,
          multiplier: multiplier,
          controllable: controllable,
          drain_per_turn: drain,
          duration_type: form["duration_type"],
          turns_remaining: turns,
          visuals: %{
            aura_color: form["aura_color"],
            aura_effect: form["aura_effect"],
            hair_color: form["hair_color"],
            eye_color: form["eye_color"],
            skin_color: form["skin_color"],
            sprite_override: form["sprite_override"],
            particle_effect: form["particle_effect"],
            screen_shake: form["screen_shake"] == 1
          },
          transform_dialogue: form["transform_dialogue"],
          uncontrolled_behavior: if(!controllable, do: form["uncontrolled_behavior"]),
          memory_loss: form["memory_loss"] == 1 and !controllable
        }}

      {:ok, %{rows: [[0, _]]}} -> {:error, "Transformation not unlocked yet."}
      _ -> {:error, "Transformation not available."}
    end
  end

  @doc "Revert to base form."
  def revert(char_id) do
    case Repo.query("SELECT transformation_id FROM character_active_transformation WHERE character_id=?", [char_id]) do
      {:ok, %{rows: [[_tid]]}} ->
        Repo.query!("DELETE FROM character_active_transformation WHERE character_id=?", [char_id])
        {:ok, "Reverted to base form."}
      _ -> {:error, "Not transformed."}
    end
  end

  @doc "Check if a near-death event should trigger an unlock."
  def check_near_death_unlock(char_id, current_hp_pct, opts \\ []) do
    race = Keyword.get(opts, :race)
    ruleset_id = Keyword.get(opts, :ruleset_id)

    forms = get_forms(ruleset_id, race)
    |> Enum.filter(fn f ->
      f["near_death_unlock"] == 1 and
      current_hp_pct <= to_float(f["near_death_hp_pct"])
    end)

    Enum.flat_map(forms, fn form ->
      # Check if already unlocked
      case Repo.query("SELECT is_unlocked FROM character_transformations WHERE character_id=? AND transformation_id=?",
        [char_id, form["id"]]) do
        {:ok, %{rows: [[1]]}} -> []  # Already unlocked
        _ ->
          # Unlock it!
          try do
            Repo.query!(
              "INSERT INTO character_transformations (character_id, transformation_id, is_unlocked, unlocked_at) VALUES (?,?,1,NOW()) ON DUPLICATE KEY UPDATE is_unlocked=1, unlocked_at=NOW()",
              [char_id, form["id"]])
          rescue _ -> nil
          end
          [{:transformation_unlocked, form}]
      end
    end)
  end

  @doc "Check event-triggered transformations (full moon, devil's star, etc.)"
  def check_event_triggers(char_id, event_name, opts \\ []) do
    race = Keyword.get(opts, :race)
    ruleset_id = Keyword.get(opts, :ruleset_id)

    forms = get_forms(ruleset_id, race)
    |> Enum.filter(fn f ->
      f["duration_type"] == "event" and f["event_trigger"] == event_name
    end)

    Enum.flat_map(forms, fn form ->
      case Repo.query("SELECT is_unlocked FROM character_transformations WHERE character_id=? AND transformation_id=? AND is_unlocked=1",
        [char_id, form["id"]]) do
        {:ok, %{rows: [[1]]}} -> [{:event_transform, form}]
        _ -> []
      end
    end)
  end

  @doc "Process turn drain for sustained transformations. Returns :ok or {:reverted, reason}"
  def process_turn_drain(char_id) do
    case Repo.query(
      "SELECT a.transformation_id, a.stack_tier, a.turns_remaining, a.drain_accumulated, t.* FROM character_active_transformation a JOIN game_transformations t ON t.id=a.transformation_id WHERE a.character_id=?",
      [char_id]
    ) do
      {:ok, %{rows: [row], columns: cols}} ->
        data = Enum.zip(cols, row) |> Map.new()

        # Timed duration
        if data["turns_remaining"] do
          remaining = data["turns_remaining"] - 1
          if remaining <= 0 do
            revert(char_id)
            {:reverted, "#{data["name"]} has worn off."}
          else
            Repo.query!("UPDATE character_active_transformation SET turns_remaining=? WHERE character_id=?", [remaining, char_id])
            :ok
          end
        else
          # Sustained drain
          drain_pct = to_float(data["drain_per_turn_pct"])
          if drain_pct > 0 do
            case Repo.query("SELECT atk FROM characters WHERE id=?", [char_id]) do
              {:ok, %{rows: [[pl]]}} ->
                drain = round(pl * drain_pct / 100)
                new_pl = max(1, pl - drain)
                Repo.query!("UPDATE characters SET atk=? WHERE id=?", [new_pl, char_id])

                if new_pl <= 1 do
                  revert(char_id)
                  {:reverted, "Your energy is spent... #{data["name"]} fades."}
                else
                  :ok
                end
              _ -> :ok
            end
          else
            :ok
          end
        end

      _ -> :ok
    end
  end

  @doc "Check loss conditions (tail cut, HP threshold, etc.)"
  def check_loss_conditions(char_id, event) do
    case Repo.query(
      "SELECT a.transformation_id, t.name, t.loss_conditions_json FROM character_active_transformation a JOIN game_transformations t ON t.id=a.transformation_id WHERE a.character_id=?",
      [char_id]
    ) do
      {:ok, %{rows: [[_tid, name, conditions_json]]}} ->
        conditions = case conditions_json do
          j when is_binary(j) -> (try do Jason.decode!(j) rescue _ -> [] end)
          j when is_list(j) -> j
          _ -> []
        end

        lost = Enum.find(conditions, fn c -> c["type"] == event end)
        if lost do
          revert(char_id)
          {:lost, lost["message"] || "#{name} has ended."}
        else
          :ok
        end

      _ -> :ok
    end
  end

  # ── Data Loading ─────────────────────────────────────────────

  defp get_forms(ruleset_id, race) do
    key = {:forms, ruleset_id, race}
    case :ets.lookup(cache(), key) do
      [{_, %{data: d, at: at}}] when is_integer(at) ->
        if System.system_time(:millisecond) - at < @cache_ttl, do: d, else: fetch_forms(ruleset_id, race, key)
      _ -> fetch_forms(ruleset_id, race, key)
    end
  end

  defp fetch_forms(ruleset_id, race, key) do
    query = "SELECT * FROM game_transformations WHERE active=1 AND (ruleset_id=? OR ruleset_id IS NULL) AND (required_race=? OR required_race IS NULL) ORDER BY chain_group, chain_order"
    data = case Repo.query(query, [ruleset_id, race && String.downcase(race)]) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
    :ets.insert(cache(), {key, %{data: data, at: System.system_time(:millisecond)}})
    data
  end

  defp get_form(id) do
    case Repo.query("SELECT * FROM game_transformations WHERE id=?", [id]) do
      {:ok, %{rows: [row], columns: cols}} -> Enum.zip(cols, row) |> Map.new()
      _ -> nil
    end
  end

  def clear_cache, do: :ets.delete_all_objects(cache())

  # ── Pure Calculation Helpers ─────────────────────────────────────

  @doc "Converts various number representations to float."
  def to_float(nil), do: 0.0
  def to_float(v) when is_float(v), do: v
  def to_float(v) when is_integer(v), do: v / 1.0
  def to_float(%Decimal{} = v), do: Decimal.to_float(v)
  def to_float(v) when is_binary(v) do
    case Float.parse(v) do
      {f, _} -> f
      :error -> 0.0
    end
  end
  def to_float(_), do: 0.0

  @doc "Calculate energy drain per turn based on current attack power and drain percentage."
  def calculate_drain(atk, drain_pct) do
    pct = to_float(drain_pct)
    if pct > 0 do
      drain = round(atk * pct / 100)
      new_atk = max(1, atk - drain)
      %{drain: drain, new_atk: new_atk, reverted: new_atk <= 1}
    else
      %{drain: 0, new_atk: atk, reverted: false}
    end
  end

  @doc "Calculate activation cost based on base attack power and cost percentage."
  def calculate_activation_cost(atk, cost_pct) do
    pct = to_float(cost_pct)
    if pct > 0 do
      cost = round(atk * pct / 100)
      remaining = max(1, atk - cost)
      %{cost: cost, remaining_atk: remaining}
    else
      %{cost: 0, remaining_atk: atk}
    end
  end

  @doc "Resolve multiplier, tier name, and drain for a form given a stack tier."
  def resolve_form_tier(form, stack_tier \\ 0) do
    if form["is_stackable"] == 1 and stack_tier > 0 do
      tiers = case form["stack_tiers_json"] do
        j when is_binary(j) -> (try do Jason.decode!(j) rescue _ -> [] end)
        j when is_list(j) -> j
        _ -> []
      end
      tier = Enum.find(tiers, fn t -> t["tier"] == stack_tier end)
      if tier do
        {to_float(tier["multiplier"]), tier["name"] || form["name"], to_float(tier["drain"])}
      else
        {to_float(form["power_multiplier"]), form["name"], to_float(form["drain_per_turn_pct"])}
      end
    else
      {to_float(form["power_multiplier"]), form["name"], to_float(form["drain_per_turn_pct"])}
    end
  end

  @doc "Build the transformation payload and visual bundle."
  def build_transformation_payload(form, opts \\ []) do
    stack_tier = Keyword.get(opts, :stack_tier, 0)
    is_controlled = Keyword.get(opts, :is_controlled, false)
    controllable = form["controllable"] == 1 or is_controlled == true

    {multiplier, tier_name, drain} = resolve_form_tier(form, stack_tier)

    turns = case form["duration_type"] do
      "timed" -> form["duration_turns"]
      _ -> nil
    end

    %{
      name: tier_name,
      multiplier: multiplier,
      controllable: controllable,
      drain_per_turn: drain,
      duration_type: form["duration_type"],
      turns_remaining: turns,
      visuals: %{
        aura_color: form["aura_color"],
        aura_effect: form["aura_effect"],
        hair_color: form["hair_color"],
        eye_color: form["eye_color"],
        skin_color: form["skin_color"],
        sprite_override: form["sprite_override"],
        particle_effect: form["particle_effect"],
        screen_shake: form["screen_shake"] == 1
      },
      transform_dialogue: form["transform_dialogue"],
      uncontrolled_behavior: if(!controllable, do: form["uncontrolled_behavior"]),
      memory_loss: form["memory_loss"] == 1 and !controllable
    }
  end

  @doc "Check whether loss conditions match a given event."
  def check_loss_match(conditions_json, event) do
    conditions = case conditions_json do
      j when is_binary(j) -> (try do Jason.decode!(j) rescue _ -> [] end)
      j when is_list(j) -> j
      _ -> []
    end

    case Enum.find(conditions, fn c -> c["type"] == event end) do
      nil -> :ok
      lost -> {:lost, lost["message"] || "#{lost["type"]} triggered form loss."}
    end
  end

  @doc "Filter forms eligible for near-death unlock."
  def check_near_death_eligible(forms, current_hp_pct) do
    Enum.filter(forms, fn f ->
      f["near_death_unlock"] == 1 and
        current_hp_pct <= to_float(f["near_death_hp_pct"])
    end)
  end

  @doc "Filter forms eligible for event triggers."
  def check_event_eligible(forms, event_name) do
    Enum.filter(forms, fn f ->
      f["duration_type"] == "event" and f["event_trigger"] == event_name
    end)
  end
end
