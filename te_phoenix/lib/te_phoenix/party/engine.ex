defmodule TePhoenix.Party.Engine do
  @moduledoc """
  Universal Party Game Engine — powers Cards Against Humanity, Quiplash, Fibbage,
  Trivia, and more. General purpose, works with any theme.

  Tables: game_party_rooms, game_party_players, game_party_modes, game_party_state
  Phases: waiting → prompt → submit → reveal → vote → score → (next_round or end)
  """

  alias TePhoenix.Repo
  require Logger

  # ── Schemas ──────────────────────────────────────────────────────

  defmodule Room do
    use Ecto.Schema
    import Ecto.Changeset

    @primary_key {:id, :id, autogenerate: true}
    schema "game_party_rooms" do
      field :code, :string
      field :host_id, :integer
      field :game_mode, :string
      field :settings_json, :string, default: "{}"
      field :status, :string, default: "waiting"
      timestamps(inserted_at: :created_at, updated_at: false)
    end

    def changeset(room, attrs) do
      room
      |> cast(attrs, [:code, :host_id, :game_mode, :settings_json, :status])
      |> validate_required([:code, :host_id, :game_mode])
      |> validate_inclusion(:status, ~w(waiting playing finished))
      |> unique_constraint(:code)
    end
  end

  defmodule Player do
    use Ecto.Schema
    import Ecto.Changeset

    @primary_key {:id, :id, autogenerate: true}
    schema "game_party_players" do
      field :room_id, :integer
      field :player_id, :integer
      field :name, :string
      field :score, :integer, default: 0
      field :is_spectator, :boolean, default: false
      timestamps(inserted_at: :joined_at, updated_at: false)
    end

    def changeset(player, attrs) do
      player
      |> cast(attrs, [:room_id, :player_id, :name, :score, :is_spectator])
      |> validate_required([:room_id, :player_id, :name])
    end
  end

  defmodule Mode do
    use Ecto.Schema

    @primary_key {:id, :id, autogenerate: true}
    schema "game_party_modes" do
      field :key, :string
      field :name, :string
      field :description, :string
      field :min_players, :integer, default: 3
      field :max_players, :integer, default: 20
      field :rounds, :integer, default: 10
      field :has_judge, :boolean, default: false
      field :submissions_per_player, :integer, default: 1
      field :voting_type, :string, default: "majority"
      field :hand_size, :integer, default: 0
      field :uses_deck, :boolean, default: false
      field :audience_can_vote, :boolean, default: true
      field :audience_vote_weight, :float, default: 0.5
      field :phase_timers_json, :string, default: "{}"
      field :rules_json, :string, default: "{}"
    end
  end

  defmodule State do
    use Ecto.Schema
    import Ecto.Changeset

    @primary_key {:id, :id, autogenerate: true}
    schema "game_party_state" do
      field :room_id, :integer
      field :round, :integer, default: 1
      field :phase, :string, default: "waiting"
      field :prompt_json, :string, default: "{}"
      field :submissions_json, :string, default: "[]"
      field :votes_json, :string, default: "{}"
      field :judge_id, :integer
      field :timer_end_at, :utc_datetime
      field :revealed_indices_json, :string, default: "[]"
      field :deck_state_json, :string, default: "{}"
      field :hands_json, :string, default: "{}"
    end

    def changeset(state, attrs) do
      state
      |> cast(attrs, [
        :room_id, :round, :phase, :prompt_json, :submissions_json,
        :votes_json, :judge_id, :timer_end_at, :revealed_indices_json,
        :deck_state_json, :hands_json
      ])
      |> validate_required([:room_id])
      |> validate_inclusion(:phase, ~w(waiting prompt submit reveal vote score ended))
    end
  end

  # ── Phase Flow ──────────────────────────────────────────────────

  @phases ~w(waiting prompt submit reveal vote score)
  @code_chars ~c"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

  # ── Room System ─────────────────────────────────────────────────

  @doc "Create a party room with a 4-character alphanumeric code."
  def create_room(host_id, game_mode, opts \\ %{}) do
    code = generate_unique_code()
    settings = Map.drop(opts, [:spectator_mode])
    settings_json = Jason.encode!(settings)

    attrs = %{
      code: code,
      host_id: host_id,
      game_mode: game_mode,
      settings_json: settings_json,
      status: "waiting"
    }

    case Repo.insert(Room.changeset(%Room{}, attrs)) do
      {:ok, room} ->
        # Auto-join host as a player
        join_room(code, host_id, opts[:host_name] || "Host")
        {:ok, %{room_id: room.id, code: room.code, host_id: room.host_id}}

      {:error, cs} ->
        {:error, cs}
    end
  end

  @doc "Join a room by code. Supports players and spectators."
  def join_room(code, player_id, name, opts \\ %{}) do
    import Ecto.Query

    case Repo.one(from r in Room, where: r.code == ^code) do
      nil ->
        {:error, :room_not_found}

      room ->
        if room.status == "finished" do
          {:error, :room_finished}
        else
          mode = get_mode_config(room.game_mode)
          player_count = Repo.one(from p in Player, where: p.room_id == ^room.id and p.is_spectator == false, select: count())
          is_spectator = opts[:spectator] == true

          cond do
            # Already in room
            Repo.one(from p in Player, where: p.room_id == ^room.id and p.player_id == ^player_id) != nil ->
              {:ok, :already_joined}

            # Room full and not spectating
            !is_spectator and mode != nil and player_count >= mode.max_players ->
              {:error, :room_full}

            true ->
              attrs = %{
                room_id: room.id,
                player_id: player_id,
                name: name,
                score: 0,
                is_spectator: is_spectator
              }

              case Repo.insert(Player.changeset(%Player{}, attrs)) do
                {:ok, _} -> {:ok, :joined}
                {:error, cs} -> {:error, cs}
              end
          end
        end
    end
  end

  @doc "Leave a room."
  def leave_room(room_id, player_id) do
    import Ecto.Query

    case Repo.one(from p in Player, where: p.room_id == ^room_id and p.player_id == ^player_id) do
      nil -> {:error, :not_in_room}
      player ->
        Repo.delete(player)
        # If host leaves, transfer to next player or close room
        room = Repo.get(Room, room_id)
        if room && room.host_id == player_id do
          next_player = Repo.one(from p in Player, where: p.room_id == ^room_id and p.is_spectator == false, limit: 1)
          if next_player do
            Repo.update(Room.changeset(room, %{host_id: next_player.player_id}))
          else
            Repo.update(Room.changeset(room, %{status: "finished"}))
          end
        end
        {:ok, :left}
    end
  end

  @doc "Host starts the game. Validates minimum player count."
  def start_game(room_id, host_id) do
    import Ecto.Query

    room = Repo.get(Room, room_id)

    cond do
      room == nil ->
        {:error, :room_not_found}

      room.host_id != host_id ->
        {:error, :not_host}

      room.status != "waiting" ->
        {:error, :already_started}

      true ->
        mode = get_mode_config(room.game_mode)
        player_count = Repo.one(from p in Player, where: p.room_id == ^room_id and p.is_spectator == false, select: count())

        if mode != nil and player_count < mode.min_players do
          {:error, {:min_players, mode.min_players, player_count}}
        else
          Repo.update!(Room.changeset(room, %{status: "playing"}))

          # Initialize game state
          players = get_active_players(room_id)
          judge_id = if mode && mode.has_judge, do: hd(players).player_id, else: nil

          state_attrs = %{
            room_id: room_id,
            round: 1,
            phase: "prompt",
            judge_id: judge_id,
            timer_end_at: timer_from_now(mode, "prompt"),
            submissions_json: "[]",
            votes_json: "{}",
            revealed_indices_json: "[]",
            deck_state_json: "{}",
            hands_json: "{}"
          }

          Repo.insert!(State.changeset(%State{}, state_attrs))

          # If mode uses deck, initialize hands
          if mode && mode.uses_deck do
            initialize_deck_and_hands(room_id, mode)
          end

          {:ok, :started}
        end
    end
  end

  # ── Round State Machine ─────────────────────────────────────────

  @doc "Advance to the next phase in the round state machine."
  def advance_phase(room_id) do
    state = get_state(room_id)
    if state == nil, do: {:error, :no_game_state}, else: do_advance_phase(room_id, state)
  end

  defp do_advance_phase(room_id, state) do
    room = Repo.get(Room, room_id)
    mode = get_mode_config(room.game_mode)
    current_idx = Enum.find_index(@phases, &(&1 == state.phase))

    cond do
      state.phase == "score" ->
        # End of round — check if more rounds
        total_rounds = if mode, do: mode.rounds, else: 10
        if state.round >= total_rounds do
          # Game over
          update_state(state, %{phase: "ended"})
          Repo.update!(Room.changeset(room, %{status: "finished"}))
          {:ok, :game_ended}
        else
          # Next round
          next_round = state.round + 1
          judge_id = rotate_judge(room_id, state.judge_id, mode)

          update_state(state, %{
            round: next_round,
            phase: "prompt",
            judge_id: judge_id,
            submissions_json: "[]",
            votes_json: "{}",
            revealed_indices_json: "[]",
            prompt_json: "{}",
            timer_end_at: timer_from_now(mode, "prompt")
          })

          {:ok, :next_round, next_round}
        end

      current_idx != nil and current_idx < length(@phases) - 1 ->
        next_phase = Enum.at(@phases, current_idx + 1)

        # Phase-specific transitions
        case next_phase do
          "submit" ->
            # Draw a prompt if we're entering submit phase
            prompt_data = auto_draw_prompt(room_id, mode)
            update_state(state, %{
              phase: "submit",
              prompt_json: Jason.encode!(prompt_data),
              timer_end_at: timer_from_now(mode, "submit")
            })

          "reveal" ->
            # Shuffle submissions for reveal
            update_state(state, %{
              phase: "reveal",
              revealed_indices_json: "[]",
              timer_end_at: timer_from_now(mode, "reveal")
            })

          "vote" ->
            # Reveal all before voting
            update_state(state, %{
              phase: "vote",
              timer_end_at: timer_from_now(mode, "vote")
            })

          "score" ->
            # Auto-resolve if entering score phase
            do_resolve_round(room_id, state, mode)
            update_state(get_state(room_id), %{
              phase: "score",
              timer_end_at: timer_from_now(mode, "score")
            })

          _ ->
            update_state(state, %{
              phase: next_phase,
              timer_end_at: timer_from_now(mode, next_phase)
            })
        end

        {:ok, next_phase}

      true ->
        {:error, :invalid_phase}
    end
  end

  @doc "Get current phase and time remaining."
  def get_phase(room_id) do
    state = get_state(room_id)
    if state == nil do
      {:error, :no_game_state}
    else
      remaining = if state.timer_end_at do
        max(0, DateTime.diff(state.timer_end_at, DateTime.utc_now(), :second))
      else
        0
      end

      {:ok, %{
        phase: state.phase,
        time_remaining: remaining,
        timer_end_at: state.timer_end_at
      }}
    end
  end

  @doc "Get current round info."
  def get_round(room_id) do
    state = get_state(room_id)
    room = Repo.get(Room, room_id)

    if state == nil or room == nil do
      {:error, :no_game_state}
    else
      mode = get_mode_config(room.game_mode)
      total = if mode, do: mode.rounds, else: 10

      {:ok, %{
        current_round: state.round,
        total_rounds: total,
        phase: state.phase
      }}
    end
  end

  # ── Prompt / Response System ────────────────────────────────────

  @doc "Draw a prompt card from the active deck."
  def draw_prompt(room_id) do
    state = get_state(room_id)
    room = Repo.get(Room, room_id)

    if state == nil or room == nil do
      {:error, :no_game_state}
    else
      mode = get_mode_config(room.game_mode)
      prompt_data = auto_draw_prompt(room_id, mode)

      update_state(state, %{prompt_json: Jason.encode!(prompt_data)})
      {:ok, prompt_data}
    end
  end

  @doc "Submit a response during the submit phase. Text or card IDs."
  def submit_response(room_id, player_id, text_or_card_ids) do
    state = get_state(room_id)

    cond do
      state == nil ->
        {:error, :no_game_state}

      state.phase != "submit" ->
        {:error, :wrong_phase}

      state.judge_id == player_id ->
        {:error, :judge_cannot_submit}

      true ->
        submissions = decode_json(state.submissions_json, [])

        # Check if already submitted
        if Enum.any?(submissions, fn s -> s["player_id"] == player_id end) do
          {:error, :already_submitted}
        else
          response_text = case text_or_card_ids do
            ids when is_list(ids) ->
              # Card-based: look up card texts and remove from hand
              resolve_card_ids(room_id, player_id, ids)
            text when is_binary(text) ->
              text
            _ ->
              to_string(text_or_card_ids)
          end

          new_submission = %{
            "player_id" => player_id,
            "text" => response_text,
            "index" => length(submissions),
            "revealed" => false,
            "votes" => 0
          }

          updated = submissions ++ [new_submission]
          # Shuffle to anonymize order
          shuffled = Enum.shuffle(updated) |> Enum.with_index() |> Enum.map(fn {s, i} -> Map.put(s, "index", i) end)

          update_state(state, %{submissions_json: Jason.encode!(shuffled)})
          {:ok, :submitted}
        end
    end
  end

  @doc "Get submissions (anonymized unless revealed)."
  def get_submissions(room_id) do
    state = get_state(room_id)
    if state == nil, do: {:error, :no_game_state}, else: do_get_submissions(state)
  end

  defp do_get_submissions(state) do
    submissions = decode_json(state.submissions_json, [])
    revealed = decode_json(state.revealed_indices_json, [])

    anonymized = Enum.map(submissions, fn s ->
      base = %{
        "index" => s["index"],
        "text" => s["text"],
        "votes" => s["votes"] || 0,
        "revealed" => s["index"] in revealed
      }

      if s["index"] in revealed do
        Map.put(base, "player_id", s["player_id"])
      else
        base
      end
    end)

    {:ok, anonymized}
  end

  @doc "Reveal one submission at a time for dramatic effect."
  def reveal_next(room_id) do
    state = get_state(room_id)
    if state == nil, do: {:error, :no_game_state}, else: do_reveal_next(state)
  end

  defp do_reveal_next(state) do
    submissions = decode_json(state.submissions_json, [])
    revealed = decode_json(state.revealed_indices_json, [])
    all_indices = Enum.map(submissions, & &1["index"])
    unrevealed = all_indices -- revealed

    case unrevealed do
      [] ->
        {:ok, :all_revealed}

      [next | _] ->
        new_revealed = revealed ++ [next]
        update_state(state, %{revealed_indices_json: Jason.encode!(new_revealed)})
        entry = Enum.find(submissions, fn s -> s["index"] == next end)
        {:ok, %{index: next, text: entry["text"], player_id: entry["player_id"]}}
    end
  end

  @doc "Reveal all submissions at once."
  def reveal_all(room_id) do
    state = get_state(room_id)
    if state == nil, do: {:error, :no_game_state}, else: do_reveal_all(state)
  end

  defp do_reveal_all(state) do
    submissions = decode_json(state.submissions_json, [])
    all_indices = Enum.map(submissions, & &1["index"])
    update_state(state, %{revealed_indices_json: Jason.encode!(all_indices)})
    {:ok, submissions}
  end

  # ── Voting / Judging ────────────────────────────────────────────

  @doc "Cast a vote for a submission (majority voting)."
  def cast_vote(room_id, voter_id, submission_index) do
    state = get_state(room_id)

    cond do
      state == nil ->
        {:error, :no_game_state}

      state.phase != "vote" ->
        {:error, :wrong_phase}

      true ->
        votes = decode_json(state.votes_json, %{})
        voter_key = to_string(voter_id)

        # Check self-vote
        submissions = decode_json(state.submissions_json, [])
        target = Enum.find(submissions, fn s -> s["index"] == submission_index end)

        cond do
          target == nil ->
            {:error, :invalid_submission}

          target["player_id"] == voter_id ->
            {:error, :cannot_vote_self}

          Map.has_key?(votes, voter_key) ->
            {:error, :already_voted}

          true ->
            new_votes = Map.put(votes, voter_key, %{
              "submission_index" => submission_index,
              "weight" => 1.0,
              "is_audience" => false
            })

            update_state(state, %{votes_json: Jason.encode!(new_votes)})
            {:ok, :voted}
        end
    end
  end

  @doc "Judge picks a winner (CAH-style judging)."
  def judge_pick(room_id, judge_id, submission_index) do
    state = get_state(room_id)

    cond do
      state == nil ->
        {:error, :no_game_state}

      state.judge_id != judge_id ->
        {:error, :not_the_judge}

      state.phase != "vote" ->
        {:error, :wrong_phase}

      true ->
        submissions = decode_json(state.submissions_json, [])
        target = Enum.find(submissions, fn s -> s["index"] == submission_index end)

        if target == nil do
          {:error, :invalid_submission}
        else
          # Judge pick overrides all votes — single decisive vote with weight 1000
          votes = %{
            to_string(judge_id) => %{
              "submission_index" => submission_index,
              "weight" => 1000.0,
              "is_judge_pick" => true
            }
          }

          update_state(state, %{votes_json: Jason.encode!(votes)})
          {:ok, :judge_picked}
        end
    end
  end

  @doc "Resolve the round: tally votes, award points, prepare next round."
  def resolve_round(room_id) do
    state = get_state(room_id)
    if state == nil, do: {:error, :no_game_state}, else: do_resolve_public(room_id, state)
  end

  defp do_resolve_public(room_id, state) do
    room = Repo.get(Room, room_id)
    mode = get_mode_config(room.game_mode)
    do_resolve_round(room_id, state, mode)
  end

  defp do_resolve_round(room_id, state, mode) do
    import Ecto.Query

    submissions = decode_json(state.submissions_json, [])
    votes = decode_json(state.votes_json, %{})

    # Tally votes per submission index
    tallied = Enum.reduce(votes, %{}, fn {_voter, vote}, acc ->
      idx = vote["submission_index"]
      weight = vote["weight"] || 1.0
      Map.update(acc, idx, weight, &(&1 + weight))
    end)

    # Find winner(s)
    if map_size(tallied) == 0 do
      {:ok, :no_votes}
    else
      max_score = tallied |> Map.values() |> Enum.max()
      winners = tallied |> Enum.filter(fn {_, v} -> v == max_score end) |> Enum.map(fn {k, _} -> k end)

      # Award points
      points_per_win = if mode, do: calculate_points(mode, max_score), else: 100

      Enum.each(winners, fn winner_idx ->
        winner_sub = Enum.find(submissions, fn s -> s["index"] == winner_idx end)
        if winner_sub do
          pid = winner_sub["player_id"]
          Repo.update_all(
            from(p in Player, where: p.room_id == ^room_id and p.player_id == ^pid),
            inc: [score: points_per_win]
          )
        end
      end)

      # Bonus points for voting with the majority (if majority voting)
      if mode == nil or mode.voting_type == "majority" do
        Enum.each(votes, fn {voter_id_str, vote} ->
          if vote["submission_index"] in winners and not vote["is_audience"] do
            voter_id = String.to_integer(voter_id_str)
            Repo.update_all(
              from(p in Player, where: p.room_id == ^room_id and p.player_id == ^voter_id),
              inc: [score: 25]
            )
          end
        end)
      end

      {:ok, %{winners: winners, points: points_per_win, tallied: tallied}}
    end
  end

  @doc "Get current leaderboard."
  def get_scores(room_id) do
    import Ecto.Query

    players = Repo.all(
      from p in Player,
      where: p.room_id == ^room_id and p.is_spectator == false,
      order_by: [desc: p.score],
      select: %{player_id: p.player_id, name: p.name, score: p.score}
    )

    {:ok, players}
  end

  # ── Judge Rotation ──────────────────────────────────────────────

  @doc "Get the current judge for this round."
  def current_judge(room_id) do
    state = get_state(room_id)
    if state, do: {:ok, state.judge_id}, else: {:error, :no_game_state}
  end

  defp rotate_judge(room_id, current_judge_id, mode) do
    if mode == nil or not mode.has_judge do
      nil
    else
      players = get_active_players(room_id)
      ids = Enum.map(players, & &1.player_id)

      case ids do
        [] -> nil
        [single] -> single
        _ ->
          current_idx = Enum.find_index(ids, &(&1 == current_judge_id)) || 0
          next_idx = rem(current_idx + 1, length(ids))
          Enum.at(ids, next_idx)
      end
    end
  end

  # ── Audience ────────────────────────────────────────────────────

  @doc "Spectators can vote with fractional weight."
  def audience_vote(room_id, spectator_id, submission_index) do
    import Ecto.Query

    state = get_state(room_id)
    room = Repo.get(Room, room_id)

    cond do
      state == nil or room == nil ->
        {:error, :no_game_state}

      state.phase != "vote" ->
        {:error, :wrong_phase}

      true ->
        mode = get_mode_config(room.game_mode)

        if mode != nil and not mode.audience_can_vote do
          {:error, :audience_voting_disabled}
        else
          # Verify spectator
          spectator = Repo.one(
            from p in Player,
            where: p.room_id == ^room_id and p.player_id == ^spectator_id and p.is_spectator == true
          )

          if spectator == nil do
            {:error, :not_a_spectator}
          else
            votes = decode_json(state.votes_json, %{})
            voter_key = "aud_#{spectator_id}"
            weight = if mode, do: mode.audience_vote_weight, else: 0.5

            if Map.has_key?(votes, voter_key) do
              {:error, :already_voted}
            else
              new_votes = Map.put(votes, voter_key, %{
                "submission_index" => submission_index,
                "weight" => weight,
                "is_audience" => true
              })

              update_state(state, %{votes_json: Jason.encode!(new_votes)})
              {:ok, :audience_voted}
            end
          end
        end
    end
  end

  # ── Deck / Hand Management ─────────────────────────────────────

  defp initialize_deck_and_hands(room_id, mode) do
    state = get_state(room_id)
    if state == nil, do: :ok, else: do_init_deck(room_id, state, mode)
  end

  defp do_init_deck(room_id, state, mode) do
    # Try to load deck from room settings
    room = Repo.get(Room, room_id)
    settings = decode_json(room.settings_json, %{})
    pack_ids = settings["pack_ids"] || []
    user_id = room.host_id

    deck_state = if pack_ids != [] do
      case TePhoenix.Party.CardPacks.build_deck(user_id, pack_ids) do
        {:ok, ds} -> ds
        _ -> empty_deck()
      end
    else
      empty_deck()
    end

    # Deal initial hands to all active players
    players = get_active_players(room_id)
    hand_size = if mode, do: mode.hand_size, else: 7

    {hands, final_deck} = Enum.reduce(players, {%{}, deck_state}, fn player, {h, d} ->
      {drawn, remaining} = draw_n_responses(d, hand_size)
      {Map.put(h, to_string(player.player_id), drawn), remaining}
    end)

    update_state(state, %{
      deck_state_json: Jason.encode!(final_deck),
      hands_json: Jason.encode!(hands)
    })
  end

  defp draw_n_responses(deck_state, count) do
    responses = deck_state["responses"] || []
    {drawn, remaining} = Enum.split(responses, count)
    {drawn, Map.put(deck_state, "responses", remaining)}
  end

  defp empty_deck do
    %{"prompts" => [], "responses" => [], "prompt_idx" => 0}
  end

  defp resolve_card_ids(room_id, player_id, card_ids) do
    state = get_state(room_id)
    hands = decode_json(state.hands_json, %{})
    player_key = to_string(player_id)
    hand = hands[player_key] || []

    # Find cards by their text/id and remove from hand
    selected = Enum.filter(hand, fn card ->
      card_id = card["id"] || card["text"]
      card_id in card_ids or to_string(card_id) in Enum.map(card_ids, &to_string/1)
    end)

    remaining = hand -- selected
    new_hands = Map.put(hands, player_key, remaining)

    # Replenish hand from deck
    deck = decode_json(state.deck_state_json, empty_deck())
    needed = length(hand) - length(remaining)
    {drawn, new_deck} = draw_n_responses(deck, needed)
    final_hands = Map.put(new_hands, player_key, remaining ++ drawn)

    update_state(state, %{
      hands_json: Jason.encode!(final_hands),
      deck_state_json: Jason.encode!(new_deck)
    })

    Enum.map_join(selected, " ", fn c -> c["text"] || "" end)
  end

  @doc "Get a player's current hand of cards."
  def get_hand(room_id, player_id) do
    state = get_state(room_id)
    if state == nil do
      {:error, :no_game_state}
    else
      hands = decode_json(state.hands_json, %{})
      {:ok, hands[to_string(player_id)] || []}
    end
  end

  # ── Auto Prompt Drawing ─────────────────────────────────────────

  defp auto_draw_prompt(room_id, mode) do
    state = get_state(room_id)

    cond do
      mode != nil and mode.uses_deck ->
        deck = decode_json(state.deck_state_json, empty_deck())
        prompts = deck["prompts"] || []
        idx = deck["prompt_idx"] || 0

        if idx < length(prompts) do
          prompt = Enum.at(prompts, idx)
          new_deck = Map.put(deck, "prompt_idx", idx + 1)
          update_state(state, %{deck_state_json: Jason.encode!(new_deck)})
          %{"text" => prompt["text"] || prompt, "blanks" => prompt["blanks_count"] || 1}
        else
          # Deck exhausted, use fallback
          fallback_prompt(mode)
        end

      mode != nil and mode.key == "trivia" ->
        draw_trivia_prompt(state.round)

      mode != nil and mode.key == "fibbage" ->
        draw_fibbage_prompt(state.round)

      mode != nil and mode.key == "two_truths" ->
        %{"text" => "Write 2 truths and 1 lie about yourself!", "blanks" => 3, "type" => "two_truths"}

      mode != nil and mode.key == "debate" ->
        draw_debate_prompt(room_id, state.round)

      mode != nil and mode.key == "word_association" ->
        draw_word_association_prompt(state.round)

      mode != nil and mode.key == "ranking" ->
        draw_ranking_prompt(state.round)

      mode != nil and mode.key == "caption" ->
        draw_caption_prompt(state.round)

      true ->
        fallback_prompt(mode)
    end
  end

  defp fallback_prompt(_mode) do
    prompts = [
      %{"text" => "The worst thing to say at a job interview is ____.", "blanks" => 1},
      %{"text" => "My parents were shocked when they found ____ in my room.", "blanks" => 1},
      %{"text" => "____ is the reason I got banned from the grocery store.", "blanks" => 1},
      %{"text" => "I never thought I'd enjoy ____, but here we are.", "blanks" => 1},
      %{"text" => "The secret ingredient in grandma's recipe is ____.", "blanks" => 1},
      %{"text" => "If I could replace one body part with ____, I would.", "blanks" => 1},
      %{"text" => "The last thing you want to hear from your dentist is ____.", "blanks" => 1},
      %{"text" => "Scientists just discovered that ____ cures ____.", "blanks" => 2},
      %{"text" => "In a world where ____ is illegal, ____ is the only hope.", "blanks" => 2},
      %{"text" => "The award for worst superpower goes to ____.", "blanks" => 1}
    ]

    Enum.random(prompts)
  end

  defp draw_trivia_prompt(round) do
    trivia = [
      %{"text" => "What is the largest planet in our solar system?", "answer" => "Jupiter", "options" => ["Mars", "Jupiter", "Saturn", "Neptune"]},
      %{"text" => "In what year did the Berlin Wall fall?", "answer" => "1989", "options" => ["1987", "1989", "1991", "1985"]},
      %{"text" => "What element has the chemical symbol 'Au'?", "answer" => "Gold", "options" => ["Silver", "Gold", "Aluminum", "Argon"]},
      %{"text" => "Which country has the most time zones?", "answer" => "France", "options" => ["Russia", "USA", "France", "China"]},
      %{"text" => "What is the smallest bone in the human body?", "answer" => "Stapes", "options" => ["Stapes", "Malleus", "Incus", "Hyoid"]},
      %{"text" => "Who painted the Mona Lisa?", "answer" => "Leonardo da Vinci", "options" => ["Michelangelo", "Leonardo da Vinci", "Raphael", "Donatello"]},
      %{"text" => "What gas do plants absorb from the atmosphere?", "answer" => "Carbon dioxide", "options" => ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"]},
      %{"text" => "What is the capital of Australia?", "answer" => "Canberra", "options" => ["Sydney", "Melbourne", "Canberra", "Brisbane"]},
      %{"text" => "How many chromosomes do humans have?", "answer" => "46", "options" => ["23", "44", "46", "48"]},
      %{"text" => "What is the speed of light in km/s (approximately)?", "answer" => "300,000", "options" => ["150,000", "300,000", "500,000", "1,000,000"]},
      %{"text" => "Which planet is known as the Red Planet?", "answer" => "Mars", "options" => ["Venus", "Mars", "Jupiter", "Mercury"]},
      %{"text" => "What year did the Titanic sink?", "answer" => "1912", "options" => ["1905", "1912", "1918", "1923"]}
    ]

    idx = rem(round - 1, length(trivia))
    q = Enum.at(trivia, idx)
    Map.merge(q, %{"blanks" => 0, "type" => "trivia"})
  end

  defp draw_fibbage_prompt(round) do
    fibbages = [
      %{"text" => "In 2003, a man in Florida was arrested for throwing ____ at his neighbor.", "truth" => "an alligator", "blanks" => 1},
      %{"text" => "The world record for most ____ eaten in one sitting is 72.", "truth" => "hot dogs", "blanks" => 1},
      %{"text" => "In Japan, there is a holiday dedicated to ____.", "truth" => "cats", "blanks" => 1},
      %{"text" => "The original name for Google was ____.", "truth" => "Backrub", "blanks" => 1},
      %{"text" => "A group of flamingos is called a ____.", "truth" => "flamboyance", "blanks" => 1},
      %{"text" => "The longest word in the English language without a vowel is ____.", "truth" => "rhythms", "blanks" => 1},
      %{"text" => "Ancient Egyptians used ____ as currency.", "truth" => "bread and beer", "blanks" => 1},
      %{"text" => "The fear of long words is called ____.", "truth" => "hippopotomonstrosesquippedaliophobia", "blanks" => 1},
      %{"text" => "In Switzerland, it is illegal to own just one ____.", "truth" => "guinea pig", "blanks" => 1},
      %{"text" => "The inventor of the Pringles can is buried in ____.", "truth" => "a Pringles can", "blanks" => 1}
    ]

    idx = rem(round - 1, length(fibbages))
    q = Enum.at(fibbages, idx)
    Map.merge(q, %{"type" => "fibbage"})
  end

  defp draw_debate_prompt(room_id, _round) do
    topics = [
      "Is a hot dog a sandwich?",
      "Is cereal a soup?",
      "Would you rather fight 100 duck-sized horses or 1 horse-sized duck?",
      "Is water wet?",
      "Is it acceptable to put pineapple on pizza?",
      "Are pancakes better than waffles?",
      "Should toilet paper hang over or under?",
      "Is a taco a sandwich?",
      "Would you rather have unlimited money or unlimited time?",
      "Is it better to be too hot or too cold?"
    ]

    topic = Enum.random(topics)

    # Pick two random non-judge players as debaters
    players = get_active_players(room_id)
    state = get_state(room_id)
    non_judge = Enum.filter(players, fn p -> p.player_id != state.judge_id end)
    debaters = Enum.take_random(non_judge, min(2, length(non_judge)))

    %{
      "text" => topic,
      "blanks" => 0,
      "type" => "debate",
      "debater_ids" => Enum.map(debaters, & &1.player_id)
    }
  end

  defp draw_word_association_prompt(round) do
    words = [
      "Ocean", "Money", "Love", "Pizza", "School",
      "Adventure", "Magic", "Technology", "Party", "Dream",
      "Danger", "Music"
    ]

    idx = rem(round - 1, length(words))
    %{"text" => "What word do you associate with: #{Enum.at(words, idx)}?", "blanks" => 1, "type" => "word_association", "target_word" => Enum.at(words, idx)}
  end

  defp draw_ranking_prompt(round) do
    rankings = [
      %{"text" => "Rank these from best to worst pizza toppings:", "items" => ["Pepperoni", "Mushrooms", "Pineapple", "Anchovies", "Olives"]},
      %{"text" => "Rank these superpowers from most to least useful:", "items" => ["Flight", "Invisibility", "Teleportation", "Mind Reading", "Super Strength"]},
      %{"text" => "Rank these animals by cuteness:", "items" => ["Cat", "Dog", "Hamster", "Penguin", "Red Panda"]},
      %{"text" => "Rank these decades by music quality:", "items" => ["60s", "70s", "80s", "90s", "2000s"]},
      %{"text" => "Rank these from best to worst vacation:", "items" => ["Beach", "Mountains", "City", "Cruise", "Camping"]}
    ]

    idx = rem(round - 1, length(rankings))
    r = Enum.at(rankings, idx)
    Map.merge(r, %{"blanks" => 0, "type" => "ranking"})
  end

  defp draw_caption_prompt(round) do
    captions = [
      %{"text" => "Caption this: A dog wearing sunglasses at the beach", "emoji" => "🐕🕶️🏖️"},
      %{"text" => "Caption this: A cat sitting on a laptop during a video call", "emoji" => "🐱💻📹"},
      %{"text" => "Caption this: Two penguins sharing an umbrella", "emoji" => "🐧🐧☂️"},
      %{"text" => "Caption this: A squirrel driving a tiny car", "emoji" => "🐿️🚗"},
      %{"text" => "Caption this: An astronaut eating pizza in space", "emoji" => "👨‍🚀🍕🚀"},
      %{"text" => "Caption this: A ghost trying to use a phone", "emoji" => "👻📱"},
      %{"text" => "Caption this: A dinosaur at a modern coffee shop", "emoji" => "🦕☕"},
      %{"text" => "Caption this: A bear doing yoga in the woods", "emoji" => "🐻🧘🌲"}
    ]

    idx = rem(round - 1, length(captions))
    c = Enum.at(captions, idx)
    Map.merge(c, %{"blanks" => 1, "type" => "caption"})
  end

  # ── Score Calculation ───────────────────────────────────────────

  defp calculate_points(mode, vote_count) do
    base = case mode.voting_type do
      "judge" -> 200
      "majority" -> 100
      "ranked" -> 150
      _ -> 100
    end

    # Bonus for unanimous/strong vote counts
    bonus = cond do
      vote_count >= 10 -> 100
      vote_count >= 5 -> 50
      vote_count >= 3 -> 25
      true -> 0
    end

    base + bonus
  end

  # ── Mode Registry ───────────────────────────────────────────────

  @doc "Get mode configuration by key."
  def get_mode_config(key) do
    import Ecto.Query
    Repo.one(from m in Mode, where: m.key == ^key)
  end

  @doc "List all available game modes."
  def list_modes do
    Repo.all(Mode)
  end

  @doc "Seed all 10 game modes into the database."
  def seed_modes do
    modes = [
      %{
        key: "cah", name: "Cards Against Humanity",
        description: "Judge draws a prompt, players submit answers from their hand, judge picks the winner. The most hilariously wrong answer wins.",
        min_players: 3, max_players: 20, rounds: 10,
        has_judge: true, submissions_per_player: 1, voting_type: "judge",
        hand_size: 7, uses_deck: true, audience_can_vote: true, audience_vote_weight: 0.5,
        phase_timers_json: Jason.encode!(%{"prompt" => 10, "submit" => 60, "reveal" => 15, "vote" => 30, "score" => 10}),
        rules_json: Jason.encode!(%{"judge_rotates" => true, "draw_after_play" => true})
      },
      %{
        key: "quiplash", name: "Quiplash / Battle Taunts",
        description: "Everyone gets a prompt and writes their own answer. Everyone votes on the best one. No cards — pure wit.",
        min_players: 3, max_players: 16, rounds: 8,
        has_judge: false, submissions_per_player: 1, voting_type: "majority",
        hand_size: 0, uses_deck: false, audience_can_vote: true, audience_vote_weight: 0.5,
        phase_timers_json: Jason.encode!(%{"prompt" => 5, "submit" => 90, "reveal" => 10, "vote" => 30, "score" => 10}),
        rules_json: Jason.encode!(%{"quiplash_bonus" => true, "unanimous_bonus" => 100})
      },
      %{
        key: "fibbage", name: "Fibbage / Lore Lies",
        description: "One truth mixed with player-written lies. Guess which answer is real. Fool others for bonus points.",
        min_players: 3, max_players: 16, rounds: 8,
        has_judge: false, submissions_per_player: 1, voting_type: "majority",
        hand_size: 0, uses_deck: false, audience_can_vote: false, audience_vote_weight: 0.0,
        phase_timers_json: Jason.encode!(%{"prompt" => 5, "submit" => 90, "reveal" => 10, "vote" => 45, "score" => 10}),
        rules_json: Jason.encode!(%{"truth_mixed_in" => true, "fool_bonus" => 50, "correct_guess" => 100})
      },
      %{
        key: "trivia", name: "Trivia",
        description: "Multiple choice or free text trivia. Points for correct answers, bonus for speed.",
        min_players: 2, max_players: 50, rounds: 15,
        has_judge: false, submissions_per_player: 1, voting_type: "majority",
        hand_size: 0, uses_deck: false, audience_can_vote: false, audience_vote_weight: 0.0,
        phase_timers_json: Jason.encode!(%{"prompt" => 5, "submit" => 20, "reveal" => 5, "vote" => 0, "score" => 5}),
        rules_json: Jason.encode!(%{"speed_bonus" => true, "speed_multiplier" => 10, "max_speed_bonus" => 200})
      },
      %{
        key: "fill_blank", name: "Fill in the Blank",
        description: "Like Cards Against Humanity but free-text — no cards, write whatever you want.",
        min_players: 3, max_players: 20, rounds: 10,
        has_judge: true, submissions_per_player: 1, voting_type: "judge",
        hand_size: 0, uses_deck: false, audience_can_vote: true, audience_vote_weight: 0.5,
        phase_timers_json: Jason.encode!(%{"prompt" => 10, "submit" => 60, "reveal" => 15, "vote" => 30, "score" => 10}),
        rules_json: Jason.encode!(%{"judge_rotates" => true})
      },
      %{
        key: "caption", name: "Caption This",
        description: "An image or emoji scene is shown. Write the funniest caption. Everyone votes.",
        min_players: 3, max_players: 20, rounds: 8,
        has_judge: false, submissions_per_player: 1, voting_type: "majority",
        hand_size: 0, uses_deck: false, audience_can_vote: true, audience_vote_weight: 0.5,
        phase_timers_json: Jason.encode!(%{"prompt" => 5, "submit" => 60, "reveal" => 10, "vote" => 30, "score" => 10}),
        rules_json: Jason.encode!(%{"show_emoji" => true})
      },
      %{
        key: "word_association", name: "Word Association",
        description: "Given a word, everyone writes an association. The most common answer wins.",
        min_players: 3, max_players: 30, rounds: 10,
        has_judge: false, submissions_per_player: 1, voting_type: "majority",
        hand_size: 0, uses_deck: false, audience_can_vote: false, audience_vote_weight: 0.0,
        phase_timers_json: Jason.encode!(%{"prompt" => 5, "submit" => 15, "reveal" => 5, "vote" => 0, "score" => 5}),
        rules_json: Jason.encode!(%{"match_scoring" => true, "match_points" => 100, "unique_penalty" => 0})
      },
      %{
        key: "ranking", name: "Ranking",
        description: "Rank items from a list. Points for matching the group consensus.",
        min_players: 3, max_players: 30, rounds: 8,
        has_judge: false, submissions_per_player: 1, voting_type: "ranked",
        hand_size: 0, uses_deck: false, audience_can_vote: false, audience_vote_weight: 0.0,
        phase_timers_json: Jason.encode!(%{"prompt" => 5, "submit" => 30, "reveal" => 10, "vote" => 0, "score" => 10}),
        rules_json: Jason.encode!(%{"consensus_scoring" => true, "exact_match_bonus" => 50})
      },
      %{
        key: "two_truths", name: "Two Truths and a Lie",
        description: "Each player writes 2 truths and 1 lie about themselves. Others guess which is the lie.",
        min_players: 3, max_players: 16, rounds: 0,
        has_judge: false, submissions_per_player: 3, voting_type: "majority",
        hand_size: 0, uses_deck: false, audience_can_vote: true, audience_vote_weight: 0.5,
        phase_timers_json: Jason.encode!(%{"prompt" => 5, "submit" => 120, "reveal" => 15, "vote" => 45, "score" => 10}),
        rules_json: Jason.encode!(%{"rounds_equal_players" => true, "guess_the_lie" => true, "fool_bonus" => 50})
      },
      %{
        key: "debate", name: "Debate",
        description: "Two players debate a silly topic. The audience votes on who wins. Comedy over logic.",
        min_players: 4, max_players: 20, rounds: 5,
        has_judge: false, submissions_per_player: 1, voting_type: "majority",
        hand_size: 0, uses_deck: false, audience_can_vote: true, audience_vote_weight: 1.0,
        phase_timers_json: Jason.encode!(%{"prompt" => 5, "submit" => 120, "reveal" => 30, "vote" => 30, "score" => 10}),
        rules_json: Jason.encode!(%{"debaters_per_round" => 2, "audience_is_judge" => true})
      }
    ]

    Enum.each(modes, fn mode_attrs ->
      import Ecto.Query

      existing = Repo.one(from m in Mode, where: m.key == ^mode_attrs.key)

      if existing do
        Repo.update!(Ecto.Changeset.change(existing, mode_attrs))
      else
        Repo.insert!(%Mode{} |> Ecto.Changeset.change(mode_attrs))
      end
    end)

    {:ok, length(modes)}
  end

  # ── Convenience / Full Room State ───────────────────────────────

  @doc "Get full room info including players, scores, and game state."
  def get_room(room_id) do
    import Ecto.Query

    room = Repo.get(Room, room_id)

    if room == nil do
      {:error, :room_not_found}
    else
      players = Repo.all(from p in Player, where: p.room_id == ^room_id, order_by: [desc: p.score])
      state = get_state(room_id)
      mode = get_mode_config(room.game_mode)

      {:ok, %{
        room: room,
        players: Enum.filter(players, &(!&1.is_spectator)),
        spectators: Enum.filter(players, &(&1.is_spectator)),
        state: state,
        mode: mode,
        scores: Enum.map(players, fn p -> %{player_id: p.player_id, name: p.name, score: p.score} end)
      }}
    end
  end

  @doc "Find a room by its join code."
  def find_room_by_code(code) do
    import Ecto.Query
    case Repo.one(from r in Room, where: r.code == ^String.upcase(code)) do
      nil -> {:error, :room_not_found}
      room -> {:ok, room}
    end
  end

  @doc "Get the current prompt for a room."
  def get_prompt(room_id) do
    state = get_state(room_id)
    if state == nil do
      {:error, :no_game_state}
    else
      {:ok, decode_json(state.prompt_json, %{})}
    end
  end

  @doc "Check if all players have submitted for the current round."
  def all_submitted?(room_id) do
    state = get_state(room_id)
    if state == nil do
      false
    else
      submissions = decode_json(state.submissions_json, [])
      active = get_active_players(room_id)
      # Subtract judge if applicable
      expected = if state.judge_id, do: length(active) - 1, else: length(active)
      length(submissions) >= expected
    end
  end

  @doc "Check if all players have voted."
  def all_voted?(room_id) do
    state = get_state(room_id)
    if state == nil do
      false
    else
      votes = decode_json(state.votes_json, %{})
      player_votes = votes |> Enum.reject(fn {k, _} -> String.starts_with?(k, "aud_") end) |> length()
      active = get_active_players(room_id)

      # Judge mode: only the judge votes, so 1 vote ends the round.
      # Otherwise: every active player votes (can't vote for self → −1).
      expected =
        if state.judge_id do
          1
        else
          max(1, length(active) - 1)
        end

      player_votes >= expected
    end
  end

  @doc "Force-end a game (host or admin)."
  def force_end(room_id) do
    room = Repo.get(Room, room_id)
    state = get_state(room_id)

    if room do
      Repo.update!(Room.changeset(room, %{status: "finished"}))
      if state, do: update_state(state, %{phase: "ended"})
      {:ok, :ended}
    else
      {:error, :room_not_found}
    end
  end

  @doc "Clean up old finished rooms older than hours_ago hours."
  def cleanup_old_rooms(hours_ago \\ 24) do
    import Ecto.Query

    cutoff = DateTime.add(DateTime.utc_now(), -hours_ago * 3600, :second)

    rooms = Repo.all(
      from r in Room,
      where: r.status == "finished" and r.created_at < ^cutoff,
      select: r.id
    )

    Enum.each(rooms, fn room_id ->
      Repo.delete_all(from p in Player, where: p.room_id == ^room_id)
      Repo.delete_all(from s in State, where: s.room_id == ^room_id)
      Repo.delete_all(from r in Room, where: r.id == ^room_id)
    end)

    {:ok, length(rooms)}
  end

  # ── Word Association Special Scoring ────────────────────────────

  @doc "Score word association round: most common answer wins."
  def score_word_association(room_id) do
    import Ecto.Query

    state = get_state(room_id)
    if state == nil, do: {:error, :no_game_state}, else: do_score_word_association(room_id, state)
  end

  defp do_score_word_association(room_id, state) do
    import Ecto.Query

    submissions = decode_json(state.submissions_json, [])

    # Normalize and group answers
    grouped = submissions
    |> Enum.group_by(fn s -> String.downcase(String.trim(s["text"] || "")) end)

    # Find most common
    if map_size(grouped) == 0 do
      {:ok, :no_submissions}
    else
      max_count = grouped |> Map.values() |> Enum.map(&length/1) |> Enum.max()

      # Award points to players in the largest group(s)
      Enum.each(grouped, fn {_answer, subs} ->
        if length(subs) == max_count do
          Enum.each(subs, fn s ->
            Repo.update_all(
              from(p in Player, where: p.room_id == ^room_id and p.player_id == ^s["player_id"]),
              inc: [score: 100]
            )
          end)
        end
      end)

      {:ok, %{groups: Map.new(grouped, fn {k, v} -> {k, length(v)} end), winning_count: max_count}}
    end
  end

  # ── Ranking Special Scoring ─────────────────────────────────────

  @doc "Score ranking round: points for matching group consensus."
  def score_ranking(room_id) do
    import Ecto.Query

    state = get_state(room_id)
    if state == nil, do: {:error, :no_game_state}, else: do_score_ranking(room_id, state)
  end

  defp do_score_ranking(room_id, state) do
    import Ecto.Query

    submissions = decode_json(state.submissions_json, [])

    if length(submissions) < 2 do
      {:ok, :not_enough_submissions}
    else
      # Parse each submission as a JSON array of rankings
      rankings = Enum.map(submissions, fn s ->
        case Jason.decode(s["text"] || "[]") do
          {:ok, list} when is_list(list) -> {s["player_id"], list}
          _ -> {s["player_id"], String.split(s["text"] || "", ",")}
        end
      end)

      # Build consensus: average position of each item
      all_items = rankings |> Enum.flat_map(fn {_, items} -> items end) |> Enum.uniq()

      consensus = Enum.map(all_items, fn item ->
        positions = rankings
        |> Enum.map(fn {_, items} -> Enum.find_index(items, &(&1 == item)) end)
        |> Enum.reject(&is_nil/1)

        avg = if length(positions) > 0, do: Enum.sum(positions) / length(positions), else: 999.0
        {item, avg}
      end)
      |> Enum.sort_by(fn {_, avg} -> avg end)

      consensus_order = Enum.map(consensus, fn {item, _} -> item end)

      # Score each player by how close their ranking matches consensus
      Enum.each(rankings, fn {player_id, player_ranking} ->
        score = Enum.zip(player_ranking, consensus_order)
        |> Enum.count(fn {a, b} -> a == b end)
        |> Kernel.*(50)

        if score > 0 do
          Repo.update_all(
            from(p in Player, where: p.room_id == ^room_id and p.player_id == ^player_id),
            inc: [score: score]
          )
        end
      end)

      {:ok, %{consensus: consensus_order}}
    end
  end

  # ── Fibbage Special Scoring ─────────────────────────────────────

  @doc "Score fibbage round: points for guessing truth, bonus for fooling others."
  def score_fibbage(room_id) do
    import Ecto.Query

    state = get_state(room_id)
    if state == nil, do: {:error, :no_game_state}, else: do_score_fibbage(room_id, state)
  end

  defp do_score_fibbage(room_id, state) do
    import Ecto.Query

    prompt = decode_json(state.prompt_json, %{})
    truth = prompt["truth"]
    submissions = decode_json(state.submissions_json, [])
    votes = decode_json(state.votes_json, %{})

    # The truth is mixed in as a special submission
    truth_idx = Enum.find_index(submissions, fn s -> s["is_truth"] == true end)

    Enum.each(votes, fn {voter_str, vote} ->
      voter_id = String.to_integer(voter_str)
      voted_idx = vote["submission_index"]

      if voted_idx == truth_idx do
        # Correct guess: 100 points
        Repo.update_all(
          from(p in Player, where: p.room_id == ^room_id and p.player_id == ^voter_id),
          inc: [score: 100]
        )
      else
        # Voted for a lie — the liar gets 50 fool points
        liar_sub = Enum.find(submissions, fn s -> s["index"] == voted_idx end)
        if liar_sub && liar_sub["player_id"] do
          Repo.update_all(
            from(p in Player, where: p.room_id == ^room_id and p.player_id == ^liar_sub["player_id"]),
            inc: [score: 50]
          )
        end
      end
    end)

    {:ok, %{truth: truth, truth_index: truth_idx}}
  end

  # ── Trivia Scoring ──────────────────────────────────────────────

  @doc "Score trivia round: points for correct answer, bonus for speed."
  def score_trivia(room_id) do
    import Ecto.Query

    state = get_state(room_id)
    if state == nil, do: {:error, :no_game_state}, else: do_score_trivia(room_id, state)
  end

  defp do_score_trivia(room_id, state) do
    import Ecto.Query

    prompt = decode_json(state.prompt_json, %{})
    answer = String.downcase(prompt["answer"] || "")
    submissions = decode_json(state.submissions_json, [])

    results = Enum.map(submissions, fn sub ->
      player_answer = String.downcase(String.trim(sub["text"] || ""))
      correct = player_answer == answer or player_answer in (prompt["options"] || []) and player_answer == answer

      if correct do
        # Base 100 + speed bonus based on submission order (earlier = more bonus)
        order_bonus = max(0, 100 - sub["index"] * 10)
        total = 100 + order_bonus

        Repo.update_all(
          from(p in Player, where: p.room_id == ^room_id and p.player_id == ^sub["player_id"]),
          inc: [score: total]
        )

        %{player_id: sub["player_id"], correct: true, points: total}
      else
        %{player_id: sub["player_id"], correct: false, points: 0}
      end
    end)

    {:ok, %{answer: prompt["answer"], results: results}}
  end

  # ── Private Helpers ─────────────────────────────────────────────

  defp generate_unique_code do
    code = for _ <- 1..4, into: "", do: <<Enum.random(@code_chars)>>

    # Check uniqueness
    import Ecto.Query
    if Repo.one(from r in Room, where: r.code == ^code and r.status != "finished") do
      generate_unique_code()
    else
      code
    end
  end

  defp get_state(room_id) do
    import Ecto.Query
    Repo.one(from s in State, where: s.room_id == ^room_id)
  end

  defp update_state(state, attrs) do
    Repo.update!(State.changeset(state, attrs))
  end

  defp get_active_players(room_id) do
    import Ecto.Query
    Repo.all(from p in Player, where: p.room_id == ^room_id and p.is_spectator == false, order_by: p.id)
  end

  defp timer_from_now(mode, phase) do
    timers = if mode do
      decode_json(mode.phase_timers_json, %{})
    else
      %{"prompt" => 10, "submit" => 60, "reveal" => 15, "vote" => 30, "score" => 10}
    end

    seconds = timers[phase] || 30
    DateTime.add(DateTime.utc_now(), seconds, :second)
  end

  defp decode_json(nil, default), do: default
  defp decode_json(json_str, default) when is_binary(json_str) do
    case Jason.decode(json_str) do
      {:ok, val} -> val
      _ -> default
    end
  end
  defp decode_json(_, default), do: default
end
