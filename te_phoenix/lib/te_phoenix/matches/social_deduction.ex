defmodule TePhoenix.Matches.SocialDeduction do
  @moduledoc """
  Complete Among Us / Mafia / Werewolf / Town of Salem social deduction
  game mode.

  Manages role assignment, emergency meetings, voting/ejection, vent
  traversal, kill mechanics, chat gating (living vs ghost), and win
  condition evaluation.

  All role definitions are persisted in `game_social_deduction_roles` and
  editable from AdminSauce. Runtime match state lives in-memory (passed
  through function args) — the caller (match GenServer) owns the state map.

  ## State shape

      %{
        phase: :gameplay | :discussion | :voting | :reveal,
        roles: %{char_id => role_key},
        alive: MapSet.t(),
        ghosts: MapSet.t(),
        votes: %{voter_id => target_id | :skip},
        bodies: [{char_id, x, y}],
        vent_occupants: %{char_id => vent_id},
        vent_links: %{vent_id => [linked_vent_id, ...]},
        meeting_caller: char_id | nil,
        meeting_reason: :emergency | :body_report,
        meetings_remaining: %{char_id => count},
        kill_cooldowns: %{char_id => DateTime.t()},
        discussion_timer: integer(),    # seconds
        voting_timer: integer(),        # seconds
        tasks_complete: %{char_id => float()},
        settings: map()
      }
  """

  require Logger
  alias TePhoenix.Repo

  @roles_table "game_social_deduction_roles"

  # ── Default role definitions ───────────────────────────────────

  @default_roles [
    %{
      key: "crewmate",
      name: "Crewmate",
      team: "crew",
      abilities: [],
      vision_radius: 5,
      description: "Complete tasks to win. Vote out impostors."
    },
    %{
      key: "impostor",
      name: "Impostor",
      team: "impostor",
      abilities: ["kill", "vent", "sabotage"],
      vision_radius: 7,
      description: "Eliminate crewmates without getting caught. Can use vents."
    },
    %{
      key: "detective",
      name: "Detective",
      team: "crew",
      abilities: ["investigate"],
      vision_radius: 6,
      description: "Can investigate one player per round to learn their team alignment."
    },
    %{
      key: "medic",
      name: "Medic",
      team: "crew",
      abilities: ["heal"],
      vision_radius: 5,
      description: "Can protect one player per round from being killed."
    },
    %{
      key: "engineer",
      name: "Engineer",
      team: "crew",
      abilities: ["vent", "fix_fast"],
      vision_radius: 5,
      description: "Can use vents (crew-side) and repairs sabotages faster."
    },
    %{
      key: "jester",
      name: "Jester",
      team: "neutral",
      abilities: [],
      vision_radius: 4,
      description: "Wins if ejected by vote. No other win condition."
    },
    %{
      key: "shapeshifter",
      name: "Shapeshifter",
      team: "impostor",
      abilities: ["kill", "vent", "disguise"],
      vision_radius: 7,
      description: "Can disguise as another player. Impostor team."
    },
    %{
      key: "guardian",
      name: "Guardian",
      team: "crew",
      abilities: ["shield"],
      vision_radius: 5,
      description: "Has a one-time shield that blocks a kill attempt on the targeted player."
    }
  ]

  # ── Table setup ────────────────────────────────────────────────

  def ensure_tables do
    Repo.query("""
    CREATE TABLE IF NOT EXISTS #{@roles_table} (
      `key` VARCHAR(80) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      team VARCHAR(20) NOT NULL DEFAULT 'crew',
      abilities_json LONGTEXT,
      vision_radius INT DEFAULT 5,
      description TEXT,
      enabled TINYINT(1) DEFAULT 1,
      updated_at DATETIME NOT NULL
    )
    """)

    seed_defaults_if_empty()
  rescue
    e -> Logger.error("SocialDeduction ensure_tables: #{inspect(e)}")
  end

  defp seed_defaults_if_empty do
    case Repo.query("SELECT COUNT(*) FROM #{@roles_table}") do
      {:ok, %{rows: [[0]]}} ->
        Enum.each(@default_roles, fn r ->
          Repo.query(
            """
            INSERT INTO #{@roles_table}
              (`key`, name, team, abilities_json, vision_radius, description, enabled, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, NOW())
            """,
            [r.key, r.name, r.team, Jason.encode!(r.abilities), r.vision_radius, r.description]
          )
        end)

      _ ->
        :ok
    end
  rescue
    _ -> :ok
  end

  # ── Role definitions from DB ───────────────────────────────────

  def get_role_def(key) do
    case Repo.query(
           "SELECT `key`, name, team, abilities_json, vision_radius, description FROM #{@roles_table} WHERE `key` = ? AND enabled = 1",
           [key]
         ) do
      {:ok, %{rows: [row]}} -> parse_role_row(row)
      _ -> nil
    end
  rescue
    _ -> nil
  end

  def list_role_defs do
    case Repo.query(
           "SELECT `key`, name, team, abilities_json, vision_radius, description FROM #{@roles_table} WHERE enabled = 1 ORDER BY `key`"
         ) do
      {:ok, %{rows: rows}} -> Enum.map(rows, &parse_role_row/1)
      _ -> []
    end
  rescue
    _ -> []
  end

  defp parse_role_row([key, name, team, abilities_j, vr, desc]) do
    %{
      key: key,
      name: name,
      team: team || "crew",
      abilities: decode(abilities_j, []),
      vision_radius: vr || 5,
      description: desc
    }
  end

  # ── State initialisation ───────────────────────────────────────

  @doc """
  Build a fresh social deduction state. Call once when the match starts.

  Settings:
    - `:impostor_count` — number of impostors (default 1)
    - `:role_list` — ordered list of role keys to assign; extras filled with crewmate
    - `:discussion_seconds` — discussion phase length (default 30)
    - `:voting_seconds` — voting phase length (default 30)
    - `:kill_cooldown_seconds` — seconds between kills (default 25)
    - `:kill_range` — max distance for a kill (default 2)
    - `:meetings_per_player` — emergency meetings each player gets (default 1)
    - `:vent_links` — %{vent_id => [linked_vent_ids]} map from map data
  """
  def init_state(player_ids, settings \\ %{}) do
    roles = assign_roles(player_ids, settings)
    alive = MapSet.new(player_ids)
    meetings_per = Map.get(settings, :meetings_per_player, 1)

    %{
      phase: :gameplay,
      roles: roles,
      alive: alive,
      ghosts: MapSet.new(),
      votes: %{},
      bodies: [],
      vent_occupants: %{},
      vent_links: Map.get(settings, :vent_links, %{}),
      meeting_caller: nil,
      meeting_reason: nil,
      meetings_remaining: Map.new(player_ids, fn id -> {id, meetings_per} end),
      kill_cooldowns: %{},
      discussion_timer: Map.get(settings, :discussion_seconds, 30),
      voting_timer: Map.get(settings, :voting_seconds, 30),
      kill_cooldown_seconds: Map.get(settings, :kill_cooldown_seconds, 25),
      kill_range: Map.get(settings, :kill_range, 2),
      tasks_complete: Map.new(player_ids, fn id -> {id, 0.0} end),
      protected: MapSet.new(),
      shield_used: MapSet.new(),
      settings: settings
    }
  end

  # ── Role assignment ────────────────────────────────────────────

  @doc """
  Randomly assigns roles to players.

  If `settings[:role_list]` is provided, uses those role keys in order
  (shuffled players). Otherwise, picks `impostor_count` impostors and
  fills the rest with crewmates.

  Returns `%{char_id => role_key}`.
  """
  def assign_roles(player_ids, settings \\ %{}) do
    shuffled = Enum.shuffle(player_ids)
    role_list = Map.get(settings, :role_list, nil)
    impostor_count = Map.get(settings, :impostor_count, 1)

    cond do
      is_list(role_list) and length(role_list) > 0 ->
        # Use the provided role list. If fewer roles than players, fill rest with crewmate.
        padded =
          if length(role_list) >= length(shuffled) do
            Enum.take(role_list, length(shuffled))
          else
            role_list ++ List.duplicate("crewmate", length(shuffled) - length(role_list))
          end

        shuffled_roles = Enum.shuffle(padded)
        Map.new(Enum.zip(shuffled, shuffled_roles))

      true ->
        # Auto-generate: N impostors, rest crewmates
        safe_count = min(impostor_count, div(length(shuffled), 3) |> max(1))
        {impostors, crew} = Enum.split(shuffled, safe_count)

        impostor_map = Map.new(impostors, fn id -> {id, "impostor"} end)
        crew_map = Map.new(crew, fn id -> {id, "crewmate"} end)

        Map.merge(impostor_map, crew_map)
    end
  end

  # ── Meeting system ─────────────────────────────────────────────

  @doc """
  Start an emergency meeting. Only living players can call meetings.
  Requires meetings_remaining > 0 for `:emergency` reason.
  Body reports (`:body_report`) do not consume meeting charges.

  Transitions phase: :gameplay -> :discussion
  """
  def call_meeting(state, caller_id, reason \\ :emergency) do
    cond do
      state.phase != :gameplay ->
        {:error, :wrong_phase}

      not MapSet.member?(state.alive, caller_id) ->
        {:error, :caller_dead}

      reason == :emergency and Map.get(state.meetings_remaining, caller_id, 0) <= 0 ->
        {:error, :no_meetings_left}

      true ->
        new_remaining =
          if reason == :emergency do
            Map.update!(state.meetings_remaining, caller_id, &max(0, &1 - 1))
          else
            state.meetings_remaining
          end

        # Eject all vent occupants back to their vent position
        updated_state =
          state
          |> Map.put(:phase, :discussion)
          |> Map.put(:meeting_caller, caller_id)
          |> Map.put(:meeting_reason, reason)
          |> Map.put(:votes, %{})
          |> Map.put(:meetings_remaining, new_remaining)
          |> Map.put(:vent_occupants, %{})

        {:ok, updated_state}
    end
  end

  @doc """
  Transition from discussion to voting phase.
  """
  def start_voting(state) do
    if state.phase != :discussion do
      {:error, :wrong_phase}
    else
      {:ok, Map.put(state, :phase, :voting)}
    end
  end

  @doc """
  Cast a vote during the voting phase.
  `target_id` can be a char_id to vote to eject, or `:skip` / nil to skip.
  Only living players can vote.
  """
  def cast_vote(state, voter_id, target_id) do
    cond do
      state.phase != :voting ->
        {:error, :wrong_phase}

      not MapSet.member?(state.alive, voter_id) ->
        {:error, :voter_dead}

      Map.has_key?(state.votes, voter_id) ->
        {:error, :already_voted}

      target_id != nil and target_id != :skip and not MapSet.member?(state.alive, target_id) ->
        {:error, :target_not_alive}

      true ->
        vote_value = if target_id == nil, do: :skip, else: target_id
        {:ok, put_in(state.votes[voter_id], vote_value)}
    end
  end

  @doc """
  Returns the current vote tally (anonymised — counts per target, not who voted for whom).
  """
  def get_votes(state) do
    state.votes
    |> Enum.reduce(%{}, fn {_voter, target}, acc ->
      Map.update(acc, target, 1, &(&1 + 1))
    end)
  end

  @doc """
  Returns the full vote map %{voter_id => target_id} (for post-reveal).
  """
  def get_votes_detailed(state), do: state.votes

  @doc """
  All living players have voted (or we want to force-resolve).
  Determines majority eject or tie/no-eject.

  Returns `{updated_state, ejected_id | nil, vote_tally}`.
  The state transitions to :reveal phase. Caller should then transition
  back to :gameplay after showing results.
  """
  def resolve_votes(state) do
    tally = get_votes(state)
    alive_count = MapSet.size(state.alive)

    # Find top voted (excluding :skip)
    candidate_votes =
      tally
      |> Enum.reject(fn {target, _} -> target == :skip end)
      |> Enum.sort_by(fn {_, count} -> count end, :desc)

    {ejected, updated_state} =
      case candidate_votes do
        [] ->
          # Everyone skipped
          {nil, state}

        [{top_target, top_count} | rest] ->
          # Check for tie with another candidate
          tied = Enum.any?(rest, fn {_, c} -> c == top_count end)

          # Majority = more than half of alive voters
          majority_threshold = div(alive_count, 2) + 1

          if tied or top_count < majority_threshold do
            # Tie or no majority — no eject
            {nil, state}
          else
            # Eject the target
            ejected_role = Map.get(state.roles, top_target)

            new_state =
              state
              |> kill_player(top_target)
              |> check_jester_eject(top_target, ejected_role)

            {top_target, new_state}
          end
      end

    final_state =
      updated_state
      |> Map.put(:phase, :reveal)
      |> Map.put(:meeting_caller, nil)
      |> Map.put(:meeting_reason, nil)

    {final_state, ejected, tally}
  end

  defp check_jester_eject(state, ejected_id, _ejected_role) do
    role_key = Map.get(state.roles, ejected_id)

    if role_key == "jester" do
      Map.put(state, :jester_ejected, ejected_id)
    else
      state
    end
  end

  @doc """
  Transition from :reveal back to :gameplay. Clears meeting state.
  """
  def end_meeting(state) do
    state
    |> Map.put(:phase, :gameplay)
    |> Map.put(:votes, %{})
    |> Map.put(:bodies, [])
  end

  # ── Kill mechanics ─────────────────────────────────────────────

  @doc """
  Attempt to kill a target. Validates:
    - Killer has :kill ability
    - Killer is alive and not in a vent
    - Target is alive
    - Kill cooldown has elapsed
    - Phase is :gameplay
    - Range check (caller provides positions)

  `positions` is `%{char_id => {x, y}}` for range checking.
  """
  def attempt_kill(state, killer_id, target_id, positions \\ %{}) do
    killer_role = Map.get(state.roles, killer_id)
    role_def = get_role_def(killer_role)
    abilities = if role_def, do: role_def.abilities, else: []

    cond do
      state.phase != :gameplay ->
        {:error, :wrong_phase}

      not MapSet.member?(state.alive, killer_id) ->
        {:error, :killer_dead}

      not MapSet.member?(state.alive, target_id) ->
        {:error, :target_dead}

      killer_id == target_id ->
        {:error, :self_kill}

      "kill" not in abilities ->
        {:error, :no_kill_ability}

      Map.has_key?(state.vent_occupants, killer_id) ->
        {:error, :in_vent}

      not cooldown_elapsed?(state, killer_id) ->
        {:error, :on_cooldown}

      not in_range?(positions, killer_id, target_id, state.kill_range) ->
        {:error, :out_of_range}

      MapSet.member?(state.protected, target_id) ->
        # Target is protected (medic heal or guardian shield)
        new_protected = MapSet.delete(state.protected, target_id)
        new_cooldowns = set_cooldown(state.kill_cooldowns, killer_id, state.kill_cooldown_seconds)
        updated = %{state | protected: new_protected, kill_cooldowns: new_cooldowns}
        {:blocked, updated}

      true ->
        {kx, ky} = Map.get(positions, target_id, {0, 0})

        new_state =
          state
          |> kill_player(target_id)
          |> Map.update!(:bodies, fn bodies -> [{target_id, kx, ky} | bodies] end)
          |> Map.put(:kill_cooldowns, set_cooldown(state.kill_cooldowns, killer_id, state.kill_cooldown_seconds))

        {:ok, new_state}
    end
  end

  defp cooldown_elapsed?(state, char_id) do
    case Map.get(state.kill_cooldowns, char_id) do
      nil -> true
      expires -> DateTime.compare(DateTime.utc_now(), expires) != :lt
    end
  end

  defp set_cooldown(cooldowns, char_id, seconds) do
    Map.put(cooldowns, char_id, DateTime.add(DateTime.utc_now(), seconds, :second))
  end

  defp in_range?(positions, id_a, id_b, max_range) do
    case {Map.get(positions, id_a), Map.get(positions, id_b)} do
      {{ax, ay}, {bx, by}} ->
        dx = ax - bx
        dy = ay - by
        :math.sqrt(dx * dx + dy * dy) <= max_range

      _ ->
        # No position data — allow (caller's responsibility to provide positions)
        true
    end
  end

  defp kill_player(state, char_id) do
    state
    |> Map.update!(:alive, &MapSet.delete(&1, char_id))
    |> Map.update!(:ghosts, &MapSet.put(&1, char_id))
  end

  # ── Body reporting ─────────────────────────────────────────────

  @doc """
  Report a body. Triggers an emergency meeting with :body_report reason.
  Reporter must be alive and body must exist.
  """
  def report_body(state, reporter_id, body_char_id) do
    cond do
      state.phase != :gameplay ->
        {:error, :wrong_phase}

      not MapSet.member?(state.alive, reporter_id) ->
        {:error, :reporter_dead}

      not Enum.any?(state.bodies, fn {cid, _, _} -> cid == body_char_id end) ->
        {:error, :body_not_found}

      true ->
        call_meeting(state, reporter_id, :body_report)
    end
  end

  # ── Vent system ────────────────────────────────────────────────

  @doc """
  Enter a vent. Requires :vent ability and phase :gameplay.
  `vent_id` is the identifier of the vent tile the player is standing on.
  """
  def vent_enter(state, char_id, vent_id) do
    role_key = Map.get(state.roles, char_id)
    role_def = get_role_def(role_key)
    abilities = if role_def, do: role_def.abilities, else: []

    cond do
      state.phase != :gameplay ->
        {:error, :wrong_phase}

      not MapSet.member?(state.alive, char_id) ->
        {:error, :player_dead}

      "vent" not in abilities ->
        {:error, :no_vent_ability}

      Map.has_key?(state.vent_occupants, char_id) ->
        {:error, :already_in_vent}

      not Map.has_key?(state.vent_links, vent_id) ->
        {:error, :not_a_vent}

      true ->
        {:ok, put_in(state.vent_occupants[char_id], vent_id)}
    end
  end

  @doc """
  Exit a vent at a linked vent location.
  The exit_vent_id must be linked to the vent the player is currently in.
  Passing the same vent_id as entry is allowed (pop out same vent).
  """
  def vent_exit(state, char_id, exit_vent_id) do
    current_vent = Map.get(state.vent_occupants, char_id)

    cond do
      is_nil(current_vent) ->
        {:error, :not_in_vent}

      exit_vent_id != current_vent and
          exit_vent_id not in Map.get(state.vent_links, current_vent, []) ->
        {:error, :vent_not_linked}

      true ->
        new_occupants = Map.delete(state.vent_occupants, char_id)
        {:ok, %{state | vent_occupants: new_occupants}, exit_vent_id}
    end
  end

  # ── Chat gating ────────────────────────────────────────────────

  @doc """
  Determines if a player can send chat messages.
  - During :discussion / :voting: living players can chat.
  - During :gameplay: living players CANNOT chat.
  - Ghosts can always chat with other ghosts but never with living players.

  Returns `{can_send, audience}` where audience is :all | :ghosts_only.
  """
  def can_chat?(state, char_id) do
    cond do
      is_ghost?(state, char_id) ->
        {true, :ghosts_only}

      state.phase in [:discussion, :voting] and MapSet.member?(state.alive, char_id) ->
        {true, :all}

      true ->
        {false, :none}
    end
  end

  @doc """
  Check if a player is a ghost (dead but still in match).
  """
  def is_ghost?(state, char_id) do
    MapSet.member?(state.ghosts, char_id)
  end

  # ── Role abilities ─────────────────────────────────────────────

  @doc """
  Detective investigates a target — returns their team alignment.
  Usable once per round (tracked externally by caller).
  """
  def investigate(state, detective_id, target_id) do
    det_role = Map.get(state.roles, detective_id)

    cond do
      det_role != "detective" ->
        {:error, :not_detective}

      not MapSet.member?(state.alive, detective_id) ->
        {:error, :detective_dead}

      not MapSet.member?(state.alive, target_id) ->
        {:error, :target_dead}

      true ->
        target_role_key = Map.get(state.roles, target_id)
        target_def = get_role_def(target_role_key)
        team = if target_def, do: target_def.team, else: "crew"
        {:ok, team}
    end
  end

  @doc """
  Medic protects a target for the current round.
  Protected players survive one kill attempt.
  """
  def heal(state, medic_id, target_id) do
    medic_role = Map.get(state.roles, medic_id)

    cond do
      medic_role != "medic" ->
        {:error, :not_medic}

      not MapSet.member?(state.alive, medic_id) ->
        {:error, :medic_dead}

      not MapSet.member?(state.alive, target_id) ->
        {:error, :target_dead}

      true ->
        {:ok, Map.update!(state, :protected, &MapSet.put(&1, target_id))}
    end
  end

  @doc """
  Guardian applies a one-time shield to a target.
  The shield persists until used (blocks one kill). Guardian can only
  shield once per match.
  """
  def shield(state, guardian_id, target_id) do
    guardian_role = Map.get(state.roles, guardian_id)

    cond do
      guardian_role != "guardian" ->
        {:error, :not_guardian}

      not MapSet.member?(state.alive, guardian_id) ->
        {:error, :guardian_dead}

      MapSet.member?(state.shield_used, guardian_id) ->
        {:error, :shield_already_used}

      not MapSet.member?(state.alive, target_id) ->
        {:error, :target_dead}

      true ->
        new_state =
          state
          |> Map.update!(:protected, &MapSet.put(&1, target_id))
          |> Map.update!(:shield_used, &MapSet.put(&1, guardian_id))

        {:ok, new_state}
    end
  end

  @doc """
  Shapeshifter disguises as another player. Returns updated state with
  the disguise mapping. The disguise is revealed on the next meeting.
  """
  def disguise(state, shifter_id, target_id) do
    shifter_role = Map.get(state.roles, shifter_id)

    cond do
      shifter_role != "shapeshifter" ->
        {:error, :not_shapeshifter}

      not MapSet.member?(state.alive, shifter_id) ->
        {:error, :shifter_dead}

      not MapSet.member?(state.alive, target_id) ->
        {:error, :target_dead}

      true ->
        disguises = Map.get(state, :disguises, %{})
        {:ok, Map.put(state, :disguises, Map.put(disguises, shifter_id, target_id))}
    end
  end

  @doc """
  Clear all active disguises (called when a meeting starts).
  """
  def clear_disguises(state) do
    Map.put(state, :disguises, %{})
  end

  @doc """
  Update a player's task completion percentage (0.0 to 1.0).
  """
  def update_tasks(state, char_id, pct) when pct >= 0.0 and pct <= 1.0 do
    {:ok, put_in(state.tasks_complete[char_id], pct)}
  end

  def update_tasks(_state, _char_id, _pct), do: {:error, :invalid_percentage}

  @doc """
  Get aggregate task completion across all living crewmates.
  Returns a float 0.0 to 1.0.
  """
  def total_task_progress(state) do
    crew_ids =
      state.roles
      |> Enum.filter(fn {_id, role_key} ->
        role_def = get_role_def(role_key)
        role_def && role_def.team == "crew"
      end)
      |> Enum.map(fn {id, _} -> id end)

    case length(crew_ids) do
      0 ->
        0.0

      count ->
        total = Enum.sum(Enum.map(crew_ids, fn id -> Map.get(state.tasks_complete, id, 0.0) end))
        Float.round(total / count, 4)
    end
  end

  # ── Win conditions ─────────────────────────────────────────────

  @doc """
  Check if any win condition is met.

  Returns:
    - `nil` — game continues
    - `{:impostors_win, reason}` — impostors >= crew alive
    - `{:crew_wins, reason}` — all impostors eliminated
    - `{:jester_wins, char_id}` — jester was ejected
    - `{:crew_wins, :tasks_complete}` — all crew tasks done
  """
  def check_win(state) do
    # Jester win takes priority (checked after ejection)
    jester_ejected = Map.get(state, :jester_ejected)

    if jester_ejected do
      {:jester_wins, jester_ejected}
    else
      role_defs_cache = Map.new(list_role_defs(), &{&1.key, &1})

      alive_by_team =
        state.alive
        |> Enum.reduce(%{impostor: 0, crew: 0, neutral: 0}, fn id, acc ->
          role_key = Map.get(state.roles, id)
          role_def = Map.get(role_defs_cache, role_key)
          team = if role_def, do: String.to_atom(role_def.team), else: :crew
          Map.update(acc, team, 1, &(&1 + 1))
        end)

      impostor_count = Map.get(alive_by_team, :impostor, 0)
      crew_count = Map.get(alive_by_team, :crew, 0)

      cond do
        impostor_count == 0 ->
          {:crew_wins, :all_impostors_eliminated}

        impostor_count >= crew_count ->
          {:impostors_win, :impostors_outnumber_crew}

        total_task_progress(state) >= 1.0 ->
          {:crew_wins, :tasks_complete}

        true ->
          nil
      end
    end
  end

  # ── Helpers ────────────────────────────────────────────────────

  @doc """
  Get the role info visible to a specific player.
  Players only know their own role unless they have investigate results.
  """
  def get_player_view(state, char_id) do
    role_key = Map.get(state.roles, char_id)
    role_def = get_role_def(role_key)

    # Impostors know each other
    teammates =
      if role_def && role_def.team == "impostor" do
        state.roles
        |> Enum.filter(fn {id, rk} ->
          id != char_id and
            (fn ->
               rd = get_role_def(rk)
               rd && rd.team == "impostor"
             end).()
        end)
        |> Enum.map(fn {id, rk} -> %{id: id, role: rk} end)
      else
        []
      end

    %{
      role: role_key,
      role_def: role_def,
      team: if(role_def, do: role_def.team, else: "crew"),
      teammates: teammates,
      alive: MapSet.member?(state.alive, char_id),
      ghost: is_ghost?(state, char_id),
      phase: state.phase,
      meetings_remaining: Map.get(state.meetings_remaining, char_id, 0)
    }
  end

  @doc """
  Get a sanitised state snapshot suitable for broadcasting.
  Hides role assignments (only shows player's own role via get_player_view).
  """
  def public_state(state) do
    %{
      phase: state.phase,
      alive: MapSet.to_list(state.alive),
      ghosts: MapSet.to_list(state.ghosts),
      bodies: state.bodies,
      meeting_caller: state.meeting_caller,
      meeting_reason: state.meeting_reason,
      vote_tally: if(state.phase in [:voting, :reveal], do: get_votes(state), else: %{}),
      task_progress: total_task_progress(state)
    }
  end

  @doc """
  Clear round-specific state (protections, disguises) at the start of
  a new gameplay round.
  """
  def new_round(state) do
    state
    |> Map.put(:protected, MapSet.new())
    |> clear_disguises()
  end

  # ── JSON decode helper ─────────────────────────────────────────

  defp decode(nil, d), do: d
  defp decode("", d), do: d
  defp decode(s, d) when is_binary(s), do: case(Jason.decode(s), do: ({:ok, v} -> v; _ -> d))
  defp decode(v, _) when is_map(v) or is_list(v), do: v
  defp decode(_, d), do: d
end
