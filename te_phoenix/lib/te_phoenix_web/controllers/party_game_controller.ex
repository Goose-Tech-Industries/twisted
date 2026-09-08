defmodule TePhoenixWeb.PartyGameController do
  use TePhoenixWeb, :controller
  alias TePhoenix.Party.Engine
  alias TePhoenix.Matches.SocialDeduction
  alias TePhoenix.Repo
  import Ecto.Query

  # ── Party Game Modes ───────────────────────────────────────────

  def list_modes(conn, _params) do
    modes = Engine.list_modes()
    json(conn, %{ok: true, modes: modes})
  end

  # ── Rooms ──────────────────────────────────────────────────────

  def create_room(conn, params) do
    user_id = conn.assigns[:user_id] || params["player_id"] || 1
    game_mode = params["mode"] || "cah"
    host_name = params["name"] || "Host"

    opts = %{
      host_name: host_name,
      rounds: params["rounds"] || 8,
      spectator_mode: params["spectators"] != false
    }

    case Engine.create_room(user_id, game_mode, opts) do
      {:ok, room_info} ->
        json(conn, %{ok: true, room: room_info})

      {:error, reason} ->
        conn
        |> put_status(:bad_request)
        |> json(%{ok: false, error: inspect(reason)})
    end
  end

  def join_room(conn, params) do
    user_id = conn.assigns[:user_id] || params["player_id"] || 1
    code = String.trim(params["code"] || "") |> String.upcase()
    name = params["name"] || "Player #{user_id}"
    is_spectator = params["spectator"] == true

    case Engine.join_room(code, user_id, name, %{spectator: is_spectator}) do
      {:ok, status} ->
        case Repo.one(from r in Engine.Room, where: r.code == ^code) do
          nil -> json(conn, %{ok: true, status: status})
          room ->
            state = Repo.one(from s in Engine.State, where: s.room_id == ^room.id)
            players = Repo.all(from p in Engine.Player, where: p.room_id == ^room.id, order_by: p.id)
            json(conn, %{
              ok: true,
              status: status,
              room_id: room.id,
              code: room.code,
              mode: room.game_mode,
              host_id: room.host_id,
              players: Enum.map(players, &player_summary/1),
              phase: state && state.phase || "waiting"
            })
        end

      {:error, reason} ->
        conn
        |> put_status(:bad_request)
        |> json(%{ok: false, error: to_string(reason)})
    end
  end

  def get_room(conn, %{"code" => code_param}) do
    code = String.trim(code_param) |> String.upcase()

    case Repo.one(from r in Engine.Room, where: r.code == ^code) do
      nil ->
        conn
        |> put_status(:not_found)
        |> json(%{ok: false, error: "Room not found"})

      room ->
        players = Repo.all(from p in Engine.Player, where: p.room_id == ^room.id, order_by: [desc: p.score])
        state = Repo.one(from s in Engine.State, where: s.room_id == ^room.id)
        mode = Engine.get_mode_config(room.game_mode)

        prompt = if state && state.prompt_json do
          Jason.decode(state.prompt_json) |> elem(1)
        else
          nil
        end

        submissions = if state && state.submissions_json do
          Jason.decode(state.submissions_json) |> elem(1) || []
        else
          []
        end

        votes = if state && state.votes_json do
          Jason.decode(state.votes_json) |> elem(1) || %{}
        else
          %{}
        end

        time_remaining = if state && state.timer_end_at do
          max(0, DateTime.diff(state.timer_end_at, DateTime.utc_now(), :second))
        else
          0
        end

        json(conn, %{
          ok: true,
          room: %{
            id: room.id,
            code: room.code,
            mode: room.game_mode,
            host_id: room.host_id,
            status: room.status,
            round: state && state.round || 1,
            phase: state && state.phase || "waiting",
            judge_id: state && state.judge_id,
            time_remaining: time_remaining,
            prompt: prompt,
            submissions: submissions,
            votes: votes,
            mode_info: mode && %{
              name: mode.name,
              description: mode.description,
              has_judge: mode.has_judge,
              voting_type: mode.voting_type,
              uses_deck: mode.uses_deck,
              hand_size: mode.hand_size
            }
          },
          players: Enum.map(players, &player_summary/1)
        })
    end
  end

  def start_game(conn, %{"code" => code_param} = params) do
    user_id = conn.assigns[:user_id] || params["player_id"] || 1
    code = String.trim(code_param) |> String.upcase()

    case Repo.one(from r in Engine.Room, where: r.code == ^code) do
      nil ->
        conn |> put_status(:not_found) |> json(%{ok: false, error: "Room not found"})

      room ->
        case Engine.start_game(room.id, user_id) do
          {:ok, :started} ->
            json(conn, %{ok: true, status: "started"})

          {:error, {:min_players, req, cur}} ->
            conn
            |> put_status(:bad_request)
            |> json(%{ok: false, error: "Need at least #{req} players (currently #{cur})"})

          {:error, reason} ->
            conn
            |> put_status(:bad_request)
            |> json(%{ok: false, error: to_string(reason)})
        end
    end
  end

  def advance_phase(conn, %{"code" => code_param}) do
    code = String.trim(code_param) |> String.upcase()

    case Repo.one(from r in Engine.Room, where: r.code == ^code) do
      nil ->
        conn |> put_status(:not_found) |> json(%{ok: false, error: "Room not found"})

      room ->
        case Engine.advance_phase(room.id) do
          {:ok, next_phase} ->
            json(conn, %{ok: true, phase: next_phase})

          {:ok, :next_round, r} ->
            json(conn, %{ok: true, phase: "prompt", round: r})

          {:ok, :game_ended} ->
            json(conn, %{ok: true, phase: "ended"})

          {:error, reason} ->
            conn
            |> put_status(:bad_request)
            |> json(%{ok: false, error: to_string(reason)})
        end
    end
  end

  def submit_response(conn, %{"code" => code_param} = params) do
    user_id = conn.assigns[:user_id] || params["player_id"] || 1
    code = String.trim(code_param) |> String.upcase()
    response_data = params["response"] || params["card_ids"] || ""

    case Repo.one(from r in Engine.Room, where: r.code == ^code) do
      nil ->
        conn |> put_status(:not_found) |> json(%{ok: false, error: "Room not found"})

      room ->
        case Engine.submit_response(room.id, user_id, response_data) do
          {:ok, :submitted} ->
            json(conn, %{ok: true, status: "submitted"})

          {:error, reason} ->
            conn
            |> put_status(:bad_request)
            |> json(%{ok: false, error: to_string(reason)})
        end
    end
  end

  def vote(conn, %{"code" => code_param} = params) do
    user_id = conn.assigns[:user_id] || params["player_id"] || 1
    code = String.trim(code_param) |> String.upcase()
    idx = params["submission_index"]

    case Repo.one(from r in Engine.Room, where: r.code == ^code) do
      nil ->
        conn |> put_status(:not_found) |> json(%{ok: false, error: "Room not found"})

      room ->
        state = Repo.one(from s in Engine.State, where: s.room_id == ^room.id)

        res = if state && state.judge_id == user_id do
          Engine.judge_pick(room.id, user_id, idx)
        else
          Engine.cast_vote(room.id, user_id, idx)
        end

        case res do
          {:ok, _} -> json(conn, %{ok: true, status: "voted"})
          {:error, reason} -> conn |> put_status(:bad_request) |> json(%{ok: false, error: to_string(reason)})
        end
    end
  end

  # ── Social Deduction ───────────────────────────────────────────

  def list_social_roles(conn, _params) do
    case Repo.query("SELECT `key`, name, team, abilities_json, vision_radius, description FROM game_social_deduction_roles WHERE enabled=1") do
      {:ok, %{rows: rows, columns: cols}} ->
        roles = Enum.map(rows, fn r ->
          row_map = Enum.zip(cols, r) |> Map.new()
          Map.put(row_map, "abilities", Jason.decode(row_map["abilities_json"] || "[]") |> elem(1) || [])
        end)
        json(conn, %{ok: true, roles: roles})

      _ ->
        json(conn, %{ok: true, roles: []})
    end
  end

  # ── Helpers ────────────────────────────────────────────────────

  defp player_summary(p) do
    %{
      id: p.id,
      player_id: p.player_id,
      name: p.name,
      score: p.score,
      is_spectator: p.is_spectator
    }
  end
end
