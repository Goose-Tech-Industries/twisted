defmodule TePhoenix.Battle.Deckbuilder do
  @moduledoc """
  Cards-as-skills combat subsystem.

  The deckbuilder is a gating layer on top of the existing damage/skill
  pipeline. Instead of every skill being available every turn, combatants
  build a deck of card-skills and draw a random hand each turn. Playing
  a card pays its cost, resolves its effects through the normal pipeline,
  then discards it.

  ## Architecture

  Card definitions live in `game_card_defs` — each card has a key, cost,
  type, rarity, and an `effects_json` blob that uses the SAME format as
  the existing skill effects system. The deckbuilder doesn't reinvent
  damage resolution; it just controls *which* skills are available on a
  given turn.

  Deck state is carried per-combatant in the `deck_state` field:

      %{
        deck: [...],        # undrawn cards (shuffled)
        hand: [...],        # currently available to play
        discard: [...],     # already played / voluntarily discarded
        max_hand_size: 7,
        draw_per_turn: 1
      }

  ## Capability gate

  The entire system is behind `enable_deckbuilder` in battle settings.
  When disabled, combatants use the normal skill list with no deck mechanics.

  ## Card definition table

      game_card_defs:
        key (VARCHAR PK), name, icon, description,
        type (attack/spell/item/trap), cost_json, effects_json,
        rarity (common/uncommon/rare/epic/legendary), enabled
  """

  require Logger
  alias TePhoenix.Repo

  @card_table "game_card_defs"

  # ── Table setup ────────────────────────────────────────────────

  @doc "Create the card definitions table if it doesn't exist."
  def ensure_table do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@card_table} (
      `key` VARCHAR(64) NOT NULL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      icon VARCHAR(32) DEFAULT '🃏',
      description TEXT,
      type VARCHAR(32) NOT NULL DEFAULT 'attack',
      cost_json VARCHAR(512) DEFAULT '{}',
      effects_json LONGTEXT NOT NULL,
      rarity VARCHAR(32) DEFAULT 'common',
      enabled TINYINT(1) DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_type (type),
      INDEX idx_rarity (rarity),
      INDEX idx_enabled (enabled)
    )
    """)

    seed_defaults()
  rescue
    e -> Logger.error("Deckbuilder ensure_table: #{inspect(e)}")
  end

  # ── Card CRUD ──────────────────────────────────────────────────

  @doc "Get a card definition by key."
  @spec get_card(String.t()) :: {:ok, map()} | {:error, :not_found}
  def get_card(key) do
    case Repo.query(
           "SELECT `key`, name, icon, description, type, cost_json, effects_json, rarity, enabled FROM #{@card_table} WHERE `key` = ?",
           [key]
         ) do
      {:ok, %{rows: [row]}} -> {:ok, parse_card(row)}
      _ -> {:error, :not_found}
    end
  rescue
    _ -> {:error, :not_found}
  end

  @doc "List all enabled card definitions."
  @spec list_cards(keyword()) :: [map()]
  def list_cards(opts \\ []) do
    type_filter = Keyword.get(opts, :type, nil)
    rarity_filter = Keyword.get(opts, :rarity, nil)
    only_enabled = Keyword.get(opts, :enabled, true)

    {clauses, params} = build_filter_clauses(type_filter, rarity_filter, only_enabled)
    where = if clauses == [], do: "", else: "WHERE " <> Enum.join(clauses, " AND ")

    case Repo.query(
           "SELECT `key`, name, icon, description, type, cost_json, effects_json, rarity, enabled FROM #{@card_table} #{where} ORDER BY name ASC",
           params
         ) do
      {:ok, %{rows: rows}} -> Enum.map(rows, &parse_card/1)
      _ -> []
    end
  rescue
    _ -> []
  end

  defp build_filter_clauses(type, rarity, enabled) do
    {c, p} = {[], []}
    {c, p} = if type, do: {["type = ?" | c], [type | p]}, else: {c, p}
    {c, p} = if rarity, do: {["rarity = ?" | c], [rarity | p]}, else: {c, p}
    {c, p} = if enabled, do: {["enabled = 1" | c], p}, else: {c, p}
    {Enum.reverse(c), Enum.reverse(p)}
  end

  # ── Deck initialization ────────────────────────────────────────

  @doc """
  Initialize a combatant's deck from a list of card keys.

  Loads the card definitions, shuffles the deck, and draws an opening hand.
  Returns the combatant with `deck_state` populated.

  Opening hand size is `max_hand_size` (default 5 for initial draw).
  """
  @spec init_deck(map(), [String.t()], keyword()) :: {:ok, map()} | {:error, term()}
  def init_deck(combatant, deck_card_keys, opts \\ []) do
    max_hand = Keyword.get(opts, :max_hand_size, 7)
    draw_per_turn = Keyword.get(opts, :draw_per_turn, 1)
    opening_draw = Keyword.get(opts, :opening_draw, 5)

    cards =
      deck_card_keys
      |> Enum.map(&get_card/1)
      |> Enum.filter(&match?({:ok, _}, &1))
      |> Enum.map(fn {:ok, card} -> card end)

    if cards == [] do
      {:error, :no_valid_cards}
    else
      shuffled = Enum.shuffle(cards)
      actual_draw = min(opening_draw, length(shuffled))
      {hand, remaining_deck} = Enum.split(shuffled, actual_draw)

      deck_state = %{
        deck: remaining_deck,
        hand: hand,
        discard: [],
        max_hand_size: max_hand,
        draw_per_turn: draw_per_turn
      }

      {:ok, Map.put(combatant, :deck_state, deck_state)}
    end
  end

  # ── Draw ───────────────────────────────────────────────────────

  @doc """
  Draw N cards from the deck into the hand. If the deck is empty,
  the discard pile is shuffled back in first.

  Respects max_hand_size — excess draws are silently skipped (hand full).
  """
  @spec draw(map(), non_neg_integer()) :: map()
  def draw(combatant, count \\ 1) do
    ds = combatant.deck_state
    {drawn, ds} = do_draw(ds, count, [])

    # Enforce max hand size
    space = max(ds.max_hand_size - length(ds.hand), 0)
    {to_hand, overflow} = Enum.split(drawn, space)

    ds = %{ds | hand: ds.hand ++ to_hand, discard: ds.discard ++ overflow}
    Map.put(combatant, :deck_state, ds)
  end

  defp do_draw(ds, 0, acc), do: {Enum.reverse(acc), ds}

  defp do_draw(%{deck: [], discard: []} = ds, _remaining, acc) do
    # Nothing left to draw from
    {Enum.reverse(acc), ds}
  end

  defp do_draw(%{deck: []} = ds, remaining, acc) do
    # Shuffle discard into deck, then continue drawing
    ds = shuffle_discard_into_deck_state(ds)
    do_draw(ds, remaining, acc)
  end

  defp do_draw(%{deck: [card | rest]} = ds, remaining, acc) do
    do_draw(%{ds | deck: rest}, remaining - 1, [card | acc])
  end

  # ── Play a card ────────────────────────────────────────────────

  @doc """
  Play a card from the combatant's hand by index.

  1. Validates the hand index
  2. Checks resource cost (mana, energy, etc.)
  3. Removes the card from hand
  4. Moves it to discard
  5. Returns the card's effects for resolution by the battle pipeline

  The caller (Combat module) is responsible for actually resolving the
  effects — this function just handles the deck mechanics and cost payment.
  """
  @spec play_card(map(), map(), non_neg_integer(), term()) ::
          {:ok, map(), map(), map()} | {:error, atom()}
  def play_card(state, combatant, hand_index, _target) do
    ds = combatant.deck_state

    if hand_index < 0 or hand_index >= length(ds.hand) do
      {:error, :invalid_hand_index}
    else
      card = Enum.at(ds.hand, hand_index)
      cost = card.cost

      case pay_cost(combatant, cost) do
        {:ok, combatant} ->
          remaining_hand = List.delete_at(ds.hand, hand_index)
          ds = %{ds | hand: remaining_hand, discard: [card | ds.discard]}
          combatant = Map.put(combatant, :deck_state, ds)

          # Update the combatant in battle state
          state = %{state | combatants: Map.put(state.combatants, combatant.char_id, combatant)}

          {:ok, state, combatant, card}

        {:error, reason} ->
          {:error, reason}
      end
    end
  end

  # ── Discard ────────────────────────────────────────────────────

  @doc """
  Voluntarily discard a card from hand. Some rulesets allow this to
  gain resources (draw a replacement, recover MP, etc).
  """
  @spec discard_card(map(), non_neg_integer()) :: {:ok, map(), map()} | {:error, atom()}
  def discard_card(combatant, hand_index) do
    ds = combatant.deck_state

    if hand_index < 0 or hand_index >= length(ds.hand) do
      {:error, :invalid_hand_index}
    else
      card = Enum.at(ds.hand, hand_index)
      remaining_hand = List.delete_at(ds.hand, hand_index)
      ds = %{ds | hand: remaining_hand, discard: [card | ds.discard]}
      combatant = Map.put(combatant, :deck_state, ds)
      {:ok, combatant, card}
    end
  end

  # ── Turn lifecycle ─────────────────────────────────────────────

  @doc """
  Auto-draw at end of turn based on `draw_per_turn` setting.
  Called by the battle state machine at turn end.
  """
  @spec end_turn_draw(map()) :: map()
  def end_turn_draw(combatant) do
    ds = combatant.deck_state
    draw(combatant, ds.draw_per_turn)
  end

  # ── Shuffle helpers ────────────────────────────────────────────

  @doc """
  Shuffle the discard pile back into the deck.
  Called automatically when the deck runs out, but can also be
  triggered by card effects (e.g. a "Reshuffle" card).
  """
  @spec shuffle_discard_into_deck(map()) :: map()
  def shuffle_discard_into_deck(combatant) do
    ds = combatant.deck_state
    ds = shuffle_discard_into_deck_state(ds)
    Map.put(combatant, :deck_state, ds)
  end

  defp shuffle_discard_into_deck_state(ds) do
    combined = Enum.shuffle(ds.deck ++ ds.discard)
    %{ds | deck: combined, discard: []}
  end

  # ── Inspection helpers ─────────────────────────────────────────

  @doc "Get the current hand for display to the player."
  @spec get_hand(map()) :: [map()]
  def get_hand(combatant) do
    case Map.get(combatant, :deck_state) do
      nil -> []
      ds -> ds.hand
    end
  end

  @doc "Get deck/hand/discard sizes for UI display."
  @spec deck_info(map()) :: map()
  def deck_info(combatant) do
    case Map.get(combatant, :deck_state) do
      nil ->
        %{deck: 0, hand: 0, discard: 0, max_hand_size: 0}

      ds ->
        %{
          deck: length(ds.deck),
          hand: length(ds.hand),
          discard: length(ds.discard),
          max_hand_size: ds.max_hand_size
        }
    end
  end

  # ── Cost payment ───────────────────────────────────────────────

  defp pay_cost(combatant, cost) when is_map(cost) do
    mp_cost = Map.get(cost, "mp", 0) || Map.get(cost, :mp, 0)
    energy_cost = Map.get(cost, "energy", 0) || Map.get(cost, :energy, 0)
    hp_cost = Map.get(cost, "hp", 0) || Map.get(cost, :hp, 0)

    cond do
      mp_cost > 0 and (combatant.current_mp || 0) < mp_cost ->
        {:error, :insufficient_mp}

      energy_cost > 0 and (Map.get(combatant, :energy, 0) || 0) < energy_cost ->
        {:error, :insufficient_energy}

      hp_cost > 0 and combatant.current_hp <= hp_cost ->
        {:error, :insufficient_hp}

      true ->
        combatant =
          combatant
          |> maybe_spend(:current_mp, mp_cost)
          |> maybe_spend(:energy, energy_cost)
          |> maybe_spend(:current_hp, hp_cost)

        {:ok, combatant}
    end
  end

  defp pay_cost(combatant, _cost), do: {:ok, combatant}

  defp maybe_spend(combatant, _field, 0), do: combatant
  defp maybe_spend(combatant, field, amount) when amount > 0 do
    current = Map.get(combatant, field, 0) || 0
    Map.put(combatant, field, current - amount)
  end
  defp maybe_spend(combatant, _field, _amount), do: combatant

  # ── Card parsing ───────────────────────────────────────────────

  defp parse_card([key, name, icon, desc, type, cost_json, effects_json, rarity, enabled]) do
    %{
      key: key,
      name: name,
      icon: icon || "🃏",
      description: desc,
      type: type,
      cost: decode_json(cost_json),
      effects: decode_json(effects_json),
      rarity: rarity || "common",
      enabled: enabled == 1 or enabled == true
    }
  end

  defp decode_json(nil), do: %{}
  defp decode_json(""), do: %{}
  defp decode_json(s) when is_binary(s) do
    case Jason.decode(s) do
      {:ok, v} -> v
      _ -> %{}
    end
  end
  defp decode_json(m) when is_map(m), do: m
  defp decode_json(_), do: %{}

  # ── Seed defaults ──────────────────────────────────────────────

  @doc "Seed the 10 default cards if the table is empty."
  def seed_defaults do
    case Repo.query("SELECT COUNT(*) FROM #{@card_table}") do
      {:ok, %{rows: [[0]]}} ->
        do_seed()

      {:ok, %{rows: [[n]]}} when n > 0 ->
        Logger.debug("Deckbuilder: #{n} cards already exist, skipping seed")
        :ok

      _ ->
        do_seed()
    end
  rescue
    e ->
      Logger.error("Deckbuilder seed error: #{inspect(e)}")
      :ok
  end

  defp do_seed do
    cards = [
      {"slash", "Slash", "⚔️", "A swift blade strike.", "attack", "common",
       %{mp: 0}, %{"damage" => %{"base" => 12, "type" => "physical", "element" => "none"}}},

      {"fireball", "Fireball", "🔥", "Hurl a ball of fire at the target.", "spell", "uncommon",
       %{mp: 8}, %{"damage" => %{"base" => 25, "type" => "magical", "element" => "fire"},
                    "aoe" => %{"radius" => 1}}},

      {"shield_block", "Shield Block", "🛡️", "Raise your shield, reducing incoming damage this turn.", "item", "common",
       %{mp: 3}, %{"buff" => %{"stat" => "def", "amount" => 10, "duration" => 1},
                    "status" => %{"key" => "blocking", "duration" => 1}}},

      {"heal", "Heal", "💚", "Restore health to a target.", "spell", "common",
       %{mp: 6}, %{"heal" => %{"base" => 20, "stat_scale" => "mo", "scale_factor" => 0.5}}},

      {"poison_dart", "Poison Dart", "🎯", "A poisoned projectile that deals damage over time.", "attack", "uncommon",
       %{mp: 4}, %{"damage" => %{"base" => 8, "type" => "physical"},
                    "status" => %{"key" => "poison", "duration" => 3, "damage_per_turn" => 5}}},

      {"lightning", "Lightning", "⚡", "Call down a bolt of lightning.", "spell", "rare",
       %{mp: 12}, %{"damage" => %{"base" => 30, "type" => "magical", "element" => "lightning"},
                     "status" => %{"key" => "stunned", "duration" => 1, "chance" => 0.25}}},

      {"backstab", "Backstab", "🗡️", "Strike from the shadows for massive damage.", "attack", "rare",
       %{mp: 5}, %{"damage" => %{"base" => 35, "type" => "physical",
                                   "stealth_bonus" => 1.5, "crit_bonus" => 0.2}}},

      {"war_cry", "War Cry", "📯", "Rally your allies, boosting attack for the team.", "spell", "uncommon",
       %{mp: 7}, %{"team_buff" => %{"stat" => "atk", "amount" => 5, "duration" => 3},
                    "status" => %{"key" => "rallied", "duration" => 3}}},

      {"ice_wall", "Ice Wall", "🧊", "Conjure a wall of ice that blocks movement and chills nearby enemies.", "trap", "rare",
       %{mp: 10}, %{"terrain" => %{"type" => "ice_wall", "duration" => 3, "blocking" => true},
                     "aoe_status" => %{"key" => "chilled", "duration" => 2, "radius" => 1,
                                       "speed_reduction" => 0.3}}},

      {"draw_two", "Draw Two", "🃏", "Draw two additional cards from your deck.", "item", "uncommon",
       %{mp: 2}, %{"draw" => %{"count" => 2}}}
    ]

    Enum.each(cards, fn {key, name, icon, desc, type, rarity, cost, effects} ->
      Repo.query(
        """
        INSERT IGNORE INTO #{@card_table}
          (`key`, name, icon, description, type, cost_json, effects_json, rarity, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        """,
        [key, name, icon, desc, type, Jason.encode!(cost), Jason.encode!(effects), rarity]
      )
    end)

    Logger.info("Deckbuilder: seeded 10 default cards")
    :ok
  end
end
