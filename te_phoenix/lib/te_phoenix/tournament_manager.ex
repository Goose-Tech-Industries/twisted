defmodule TePhoenix.TournamentManager do
  @moduledoc """
  Tournament system — bracket generation, match recording, prize distribution.
  Ported from tournament_manager.js.
  """

  require Logger
  alias TePhoenix.Repo

  def register(tournament_id, char_id) do
    case Repo.query("SELECT status, min_level, max_level, max_participants, entry_fee FROM game_tournaments WHERE id=?", [tournament_id]) do
      {:ok, %{rows: [[status, min_lvl, max_lvl, max_p, fee]]}} ->
        if status != "REGISTRATION", do: {:error, "Registration is not open."}

        # Level check
        case Repo.query("SELECT level FROM characters WHERE id=?", [char_id]) do
          {:ok, %{rows: [[level]]}} ->
            cond do
              level < (min_lvl || 1) or level > (max_lvl || 99) ->
                {:error, "Level must be #{min_lvl}-#{max_lvl}"}

              true ->
                # Capacity check
                max_participants = max_p || 16
                case Repo.query("SELECT COUNT(*) FROM game_tournament_participants WHERE tournament_id=?", [tournament_id]) do
                  {:ok, %{rows: [[count]]}} when count >= max_participants ->
                    {:error, "Tournament is full"}

                  _ ->
                    # Entry fee
                    if (fee || 0) > 0 do
                      case Repo.query("SELECT u.currency, c.user_id FROM characters c JOIN users u ON u.id=c.user_id WHERE c.id=?", [char_id]) do
                        {:ok, %{rows: [[currency, user_id]]}} when currency >= fee ->
                          Repo.query!("UPDATE users SET currency=currency-? WHERE id=?", [fee, user_id])
                        _ -> {:error, "Entry fee: #{fee} gold"}
                      end
                    end

                    try do
                      Repo.query!("INSERT INTO game_tournament_participants (tournament_id, character_id) VALUES (?,?)", [tournament_id, char_id])
                      {:ok, "Registered!"}
                    rescue
                      _ -> {:error, "Already registered"}
                    end
                end
            end

          _ -> {:error, "Character not found"}
        end

      _ -> {:error, "Tournament not found"}
    end
  end

  def generate_bracket(tournament_id) do
    case Repo.query(
      "SELECT gtp.character_id, c.level, c.name FROM game_tournament_participants gtp JOIN characters c ON c.id=gtp.character_id WHERE gtp.tournament_id=? AND gtp.status='registered' ORDER BY c.level DESC",
      [tournament_id]
    ) do
      {:ok, %{rows: participants}} when length(participants) >= 2 ->
        num_participants = length(participants)
        num_rounds = ceil(:math.log2(num_participants)) |> trunc()
        bracket_size = trunc(:math.pow(2, num_rounds))

        # Set seeds
        participants
        |> Enum.with_index(1)
        |> Enum.each(fn {[char_id, _, _], seed} ->
          Repo.query!("UPDATE game_tournament_participants SET seed=?, status='active' WHERE tournament_id=? AND character_id=?",
            [seed, tournament_id, char_id])
        end)

        # Create rounds
        round_names = build_round_names(num_rounds)
        round_ids = Enum.map(1..num_rounds, fn r ->
          {:ok, res} = Repo.query(
            "INSERT INTO game_tournament_rounds (tournament_id, round_number, round_name, status) VALUES (?,?,?,?)",
            [tournament_id, r, Enum.at(round_names, r - 1), if(r == 1, do: "active", else: "pending")]
          )
          res.last_insert_id
        end)

        # Create first round matches with seeding
        padded = participants ++ List.duplicate(nil, bracket_size - num_participants)
        match_count = div(bracket_size, 2)

        Enum.each(0..(match_count - 1), fn m ->
          p1 = Enum.at(padded, m)
          p2 = Enum.at(padded, bracket_size - 1 - m)
          p1_id = if p1, do: Enum.at(p1, 0)
          p2_id = if p2, do: Enum.at(p2, 0)
          is_bye = is_nil(p1) or is_nil(p2)

          Repo.query!(
            "INSERT INTO game_tournament_matches (tournament_id, round_id, match_order, p1_char_id, p2_char_id, winner_char_id, status) VALUES (?,?,?,?,?,?,?)",
            [tournament_id, List.first(round_ids), m + 1, p1_id, p2_id,
             if(is_bye, do: p1_id || p2_id), if(is_bye, do: "bye", else: "pending")]
          )
        end)

        Repo.query!("UPDATE game_tournaments SET status='ACTIVE', started_at=NOW() WHERE id=?", [tournament_id])

        {:ok, %{rounds: num_rounds, participants: num_participants, bracket_size: bracket_size}}

      _ -> {:error, "Need at least 2 participants"}
    end
  end

  def record_match_result(match_id, winner_char_id, battle_id) do
    case Repo.query("SELECT tournament_id, round_id, p1_char_id, p2_char_id FROM game_tournament_matches WHERE id=?", [match_id]) do
      {:ok, %{rows: [[t_id, round_id, p1, p2]]}} ->
        loser = if p1 == winner_char_id, do: p2, else: p1

        Repo.query!("UPDATE game_tournament_matches SET winner_char_id=?, battle_id=?, status='completed', completed_at=NOW() WHERE id=?",
          [winner_char_id, battle_id, match_id])
        Repo.query!("UPDATE game_tournament_participants SET wins=wins+1 WHERE tournament_id=? AND character_id=?",
          [t_id, winner_char_id])
        if loser do
          Repo.query!("UPDATE game_tournament_participants SET losses=losses+1, status='eliminated' WHERE tournament_id=? AND character_id=?",
            [t_id, loser])
        end

        advance_round(t_id, round_id)

      _ -> {:error, "Match not found"}
    end
  end

  def advance_round(tournament_id, round_id) do
    # Check if all matches done
    case Repo.query("SELECT COUNT(*) FROM game_tournament_matches WHERE round_id=? AND status IN ('pending','active')", [round_id]) do
      {:ok, %{rows: [[0]]}} ->
        Repo.query!("UPDATE game_tournament_rounds SET status='completed', ended_at=NOW() WHERE id=?", [round_id])

        # Get round number
        case Repo.query("SELECT round_number FROM game_tournament_rounds WHERE id=?", [round_id]) do
          {:ok, %{rows: [[current_round]]}} ->
            # Get winners
            case Repo.query("SELECT winner_char_id FROM game_tournament_matches WHERE round_id=? AND winner_char_id IS NOT NULL ORDER BY match_order", [round_id]) do
              {:ok, %{rows: winners}} ->
                # Check for next round
                case Repo.query("SELECT id FROM game_tournament_rounds WHERE tournament_id=? AND round_number=?", [tournament_id, current_round + 1]) do
                  {:ok, %{rows: [[next_round_id]]}} ->
                    Repo.query!("UPDATE game_tournament_rounds SET status='active' WHERE id=?", [next_round_id])

                    # Create next round matches
                    winners
                    |> Enum.chunk_every(2, 2, [nil])
                    |> Enum.with_index(1)
                    |> Enum.each(fn {pair, match_order} ->
                      p1 = Enum.at(pair, 0)
                      p2 = Enum.at(pair, 1)
                      p1_id = if p1, do: List.first(p1)
                      p2_id = if p2, do: List.first(p2)
                      is_bye = is_nil(p1_id) or is_nil(p2_id)

                      Repo.query!(
                        "INSERT INTO game_tournament_matches (tournament_id, round_id, match_order, p1_char_id, p2_char_id, winner_char_id, status) VALUES (?,?,?,?,?,?,?)",
                        [tournament_id, next_round_id, match_order, p1_id, p2_id,
                         if(is_bye, do: p1_id || p2_id), if(is_bye, do: "bye", else: "pending")]
                      )
                    end)

                    {:ok, %{round_complete: true, next_round: current_round + 1}}

                  _ ->
                    # No more rounds — tournament over
                    champion = case List.first(winners) do
                      [cid] -> cid
                      _ -> nil
                    end
                    end_tournament(tournament_id, champion)
                end

              _ -> {:ok, %{round_complete: true}}
            end

          _ -> {:error, "Round not found"}
        end

      _ -> {:ok, %{round_complete: false}}
    end
  end

  def end_tournament(tournament_id, champion_char_id) do
    Repo.query!("UPDATE game_tournaments SET status='COMPLETED', ended_at=NOW(), winner_char_id=? WHERE id=?",
      [champion_char_id, tournament_id])

    if champion_char_id do
      Repo.query!("UPDATE game_tournament_participants SET status='winner' WHERE tournament_id=? AND character_id=?",
        [tournament_id, champion_char_id])
    end

    # Distribute prizes
    case Repo.query("SELECT prize_pool_json FROM game_tournaments WHERE id=?", [tournament_id]) do
      {:ok, %{rows: [[prizes_json]]}} ->
        prizes = case Jason.decode(to_string(prizes_json || "{}")) do {:ok, p} -> p; _ -> %{} end
        distribute_prizes(tournament_id, champion_char_id, prizes)
      _ -> nil
    end

    # Announce
    if champion_char_id do
      name = case Repo.query("SELECT name FROM characters WHERE id=?", [champion_char_id]) do
        {:ok, %{rows: [[n]]}} -> n; _ -> "Unknown"
      end
      t_name = case Repo.query("SELECT name FROM game_tournaments WHERE id=?", [tournament_id]) do
        {:ok, %{rows: [[n]]}} -> n; _ -> "Tournament"
      end
      TePhoenixWeb.Endpoint.broadcast!("social:lobby", "tournament_announcement", %{
        tournamentId: tournament_id,
        message: "#{name} wins the #{t_name}!",
        champion: champion_char_id
      })
    end

    {:ok, %{champion: champion_char_id}}
  end

  def get_bracket(tournament_id) do
    tournament = case Repo.query("SELECT * FROM game_tournaments WHERE id=?", [tournament_id]) do
      {:ok, %{rows: [row], columns: cols}} -> Enum.zip(cols, row) |> Map.new()
      _ -> nil
    end

    if is_nil(tournament), do: nil

    rounds = query_rows("SELECT * FROM game_tournament_rounds WHERE tournament_id=? ORDER BY round_number", [tournament_id])
    matches = query_rows(
      "SELECT gtm.*, c1.name AS p1_name, c2.name AS p2_name, cw.name AS winner_name FROM game_tournament_matches gtm LEFT JOIN characters c1 ON c1.id=gtm.p1_char_id LEFT JOIN characters c2 ON c2.id=gtm.p2_char_id LEFT JOIN characters cw ON cw.id=gtm.winner_char_id WHERE gtm.tournament_id=? ORDER BY gtm.round_id, gtm.match_order",
      [tournament_id]
    )
    participants = query_rows(
      "SELECT gtp.*, c.name, c.level FROM game_tournament_participants gtp JOIN characters c ON c.id=gtp.character_id WHERE gtp.tournament_id=? ORDER BY gtp.seed",
      [tournament_id]
    )

    %{tournament: tournament, rounds: rounds, matches: matches, participants: participants}
  end

  def list(status \\ nil) do
    {where, params} = if status, do: {"WHERE status=?", [status]}, else: {"WHERE status != ?", ["CANCELLED"]}
    query_rows(
      "SELECT gt.*, COUNT(gtp.id) AS participant_count, c.name AS winner_name FROM game_tournaments gt LEFT JOIN game_tournament_participants gtp ON gtp.tournament_id=gt.id LEFT JOIN characters c ON c.id=gt.winner_char_id #{where} GROUP BY gt.id ORDER BY gt.created_at DESC",
      params
    )
  end

  def leaderboard(limit \\ 10) do
    query_rows(
      "SELECT gth.character_id, c.name, c.level, COUNT(*) AS tournaments_entered, SUM(CASE WHEN gth.placement=1 THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN gth.placement<=3 THEN 1 ELSE 0 END) AS podiums, MIN(gth.placement) AS best_placement FROM game_tournament_history gth JOIN characters c ON c.id=gth.character_id GROUP BY gth.character_id ORDER BY wins DESC, podiums DESC LIMIT ?",
      [limit]
    )
  end

  # ── Private ──────────────────────────────────────────────────────

  defp distribute_prizes(tournament_id, champion_id, prizes) do
    placements = [
      if(champion_id, do: {champion_id, 1}),
      find_runner_up(tournament_id, champion_id)
    ] |> Enum.filter(& &1)

    place_keys = %{1 => "1st", 2 => "2nd", 3 => "3rd"}

    Enum.each(placements, fn {char_id, placement} ->
      prize_data = prizes[place_keys[placement]]
      if prize_data do
        if prize_data["gold"] do
          case Repo.query("SELECT user_id FROM characters WHERE id=?", [char_id]) do
            {:ok, %{rows: [[uid]]}} ->
              Repo.query("UPDATE users SET currency=currency+? WHERE id=?", [prize_data["gold"], uid])
            _ -> nil
          end
        end

        if is_list(prize_data["items"]) do
          Enum.each(prize_data["items"], fn item ->
            Repo.query("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+?",
              [char_id, item["item_id"], item["qty"] || 1, item["qty"] || 1])
          end)
        end

        Repo.query("INSERT INTO game_tournament_history (tournament_id, character_id, placement, prize_json) VALUES (?,?,?,?)",
          [tournament_id, char_id, placement, Jason.encode!(prize_data)])
      end
    end)
  end

  defp find_runner_up(tournament_id, champion_id) do
    case Repo.query(
      "SELECT gtr.id FROM game_tournament_rounds gtr WHERE gtr.tournament_id=? ORDER BY round_number DESC LIMIT 1",
      [tournament_id]
    ) do
      {:ok, %{rows: [[final_round_id]]}} ->
        case Repo.query("SELECT p1_char_id, p2_char_id FROM game_tournament_matches WHERE round_id=? LIMIT 1", [final_round_id]) do
          {:ok, %{rows: [[p1, p2]]}} ->
            runner_up = if p1 == champion_id, do: p2, else: p1
            if runner_up, do: {runner_up, 2}
          _ -> nil
        end
      _ -> nil
    end
  end

  defp build_round_names(num_rounds) do
    base = []
    base = if num_rounds >= 4, do: base ++ ["Round of 16"], else: base
    base = if num_rounds >= 3, do: base ++ ["Quarter-Finals"], else: base
    base = if num_rounds >= 2, do: base ++ ["Semi-Finals"], else: base
    base = base ++ ["Finals"]
    # Pad front
    while_pad(base, num_rounds)
  end

  defp while_pad(names, target) when length(names) >= target, do: names
  defp while_pad(names, target), do: while_pad(["Round #{length(names) + 1}" | names], target)

  defp query_rows(sql, params) do
    case Repo.query(sql, params) do
      {:ok, %{rows: rows, columns: cols}} -> Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
  end
end
