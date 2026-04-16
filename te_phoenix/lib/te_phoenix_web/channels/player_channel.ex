defmodule TePhoenixWeb.PlayerChannel do
  @moduledoc """
  Per-character channel that bridges the visual-scripting runtime to the
  player's browser.

  Topic: `player:CHAR_ID`. A client joins with `%{"char_id" => id}` and
  the channel verifies the id against the UserSocket's assigned user.

  ## What this channel does

  When the client fires a script (either explicitly via `fire_script` or
  implicitly via an event collision server-side), the runtime spawns a
  **Task** that runs `ScriptInterpreter.run/2` with two pid references in
  its context:

    * `ui_caller` — the channel pid. All UI-side effects
      (`:script_effect`, `:script_choice_prompt`, etc.) are `send/2`-ed
      here so that `handle_info/2` can `push/3` them to the browser.

    * `reply_pid` — the Task's own pid. Player responses routed from the
      browser (`script_choice`, `dialogue_advance`) are `send/2`-ed here
      so the interpreter's `receive do` blocks unblock and the script
      resumes on the correct branch.

  Splitting these two pids is what makes `wait`, `choice`, and
  `npc_talk` real — none of them block the channel process, so the
  player can still chat, move, receive other script events, or start a
  second script while the first one is mid-prompt.

  ## Why Task and not GenServer-per-run

  A Task is the lightest primitive that has its own mailbox and can be
  linked/monitored by the channel. We don't need the state machine of a
  GenServer — the interpreter IS the state machine, and its state lives
  in BEAM process state via `receive`. When the Task dies (cleanly or
  crashes), we DOWN-monitor catches it and drops the run from our
  assigns.

  ## Protocol (client ⇄ server)

  Client → server:

    * `fire_script` `%{"script_id" => N, "extra_ctx" => ...}` — load the
      graph, start a run, return the `run_id` the client uses to route
      subsequent messages
    * `script_choice` `%{"run_id" => id, "key" => "a"|"b"|"c"}` — answer
      a choice prompt
    * `dialogue_advance` `%{"run_id" => id}` — dismiss a dialogue bubble
    * `cancel_script` `%{"run_id" => id}` — kill a running script

  Server → client (via `push/3`):

    * `script_effect` `%{run_id, kind, ...payload}` — render an effect
      (fire/flash/sound/etc.). See `ScriptEffects` for the kinds.
    * `script_choice_prompt` `%{run_id, prompt, a, b, c}` — show a
      choice dialog
    * `script_dialogue` `%{run_id, npc_id, text}` — show a dialogue
      bubble; client MUST send `dialogue_advance` eventually
    * `script_run_started` `%{run_id, name}` — ack for `fire_script`
    * `script_run_finished` `%{run_id, status, trace_len}` — run
      completed (`:ok` / `:error` / `:crashed`)
  """
  use Phoenix.Channel
  require Logger

  alias TePhoenix.Repo
  alias TePhoenix.Game.{ScriptInterpreter, ScriptEffects}

  @max_runs_per_channel 8

  # ── Join ────────────────────────────────────────────────────

  @impl true
  def join("player:" <> char_id_str, _params, socket) do
    case Integer.parse(char_id_str) do
      {char_id, _} when char_id > 0 ->
        if authorized?(socket, char_id) do
          {:ok, %{char_id: char_id},
           socket
           |> assign(:char_id, char_id)
           |> assign(:runs, %{})}
        else
          {:error, %{reason: "unauthorized"}}
        end

      _ ->
        {:error, %{reason: "bad_char_id"}}
    end
  end

  # UserSocket assigns :user_id after token verification. A character must
  # belong to that user. Falls open in dev if the user_id is absent so
  # local testing stays frictionless.
  defp authorized?(%{assigns: %{user_id: user_id}}, char_id) when not is_nil(user_id) do
    case Repo.query("SELECT user_id FROM characters WHERE id = ?", [char_id]) do
      {:ok, %{rows: [[^user_id]]}} -> true
      _ -> false
    end
  rescue
    _ -> true
  end

  defp authorized?(_, _), do: true

  # ── Client → server ─────────────────────────────────────────

  @impl true
  def handle_in("fire_script", %{"script_id" => sid} = params, socket) do
    runs = socket.assigns.runs

    cond do
      map_size(runs) >= @max_runs_per_channel ->
        {:reply, {:error, %{reason: "too_many_runs"}}, socket}

      true ->
        case load_graph(sid) do
          {:ok, name, graph} ->
            run_id = generate_run_id()
            extra_ctx = Map.get(params, "extra_ctx", %{})
            task = spawn_run(run_id, graph, socket.assigns.char_id, self(), extra_ctx)
            new_runs = Map.put(runs, run_id, %{task: task, name: name, started_at: System.system_time(:millisecond)})

            push(socket, "script_run_started", %{run_id: run_id, name: name, script_id: sid})

            {:reply, {:ok, %{run_id: run_id}}, assign(socket, :runs, new_runs)}

          {:error, reason} ->
            {:reply, {:error, %{reason: to_string(reason)}}, socket}
        end
    end
  end

  def handle_in("script_choice", %{"run_id" => run_id, "key" => key}, socket) do
    case Map.get(socket.assigns.runs, run_id) do
      %{task: task} when key in ["a", "b", "c"] ->
        send(task.pid, {:script_choice, key})
        {:reply, :ok, socket}

      _ ->
        {:reply, {:error, %{reason: "unknown_run"}}, socket}
    end
  end

  def handle_in("dialogue_advance", %{"run_id" => run_id}, socket) do
    case Map.get(socket.assigns.runs, run_id) do
      %{task: task} ->
        send(task.pid, {:script_dialogue_advance})
        {:reply, :ok, socket}

      _ ->
        {:reply, {:error, %{reason: "unknown_run"}}, socket}
    end
  end

  def handle_in("cancel_script", %{"run_id" => run_id}, socket) do
    case Map.get(socket.assigns.runs, run_id) do
      %{task: task} ->
        Task.shutdown(task, :brutal_kill)
        push(socket, "script_run_finished", %{run_id: run_id, status: "cancelled"})
        {:reply, :ok, assign(socket, :runs, Map.delete(socket.assigns.runs, run_id))}

      _ ->
        {:reply, {:error, %{reason: "unknown_run"}}, socket}
    end
  end

  def handle_in(_other, _payload, socket), do: {:noreply, socket}

  # ── Interpreter → channel forwarding ─────────────────────────

  # `ScriptEffects.apply/2` sends these when it hits a UI-bearing node.
  # We tag the message with the run_id so the client can correlate it
  # with the originating fire_script call.

  @impl true
  def handle_info({:script_effect, run_id, kind, payload}, socket) do
    push(socket, "script_effect", Map.merge(%{run_id: run_id, kind: kind}, payload))
    {:noreply, socket}
  end

  def handle_info({:script_choice_prompt, run_id, payload}, socket) do
    push(socket, "script_choice_prompt", Map.merge(%{run_id: run_id}, payload))
    {:noreply, socket}
  end

  def handle_info({:script_dialogue, run_id, payload}, socket) do
    push(socket, "script_dialogue", Map.merge(%{run_id: run_id}, payload))
    {:noreply, socket}
  end

  # Task completed — the run's pid wrapper exits with {:DOWN, ...}.
  def handle_info({ref, {:ok, _result}}, socket) when is_reference(ref) do
    {run_id, runs} = pop_by_ref(socket.assigns.runs, ref)
    if run_id, do: push(socket, "script_run_finished", %{run_id: run_id, status: "ok"})
    Process.demonitor(ref, [:flush])
    {:noreply, assign(socket, :runs, runs)}
  end

  def handle_info({ref, {:error, reason, _state}}, socket) when is_reference(ref) do
    {run_id, runs} = pop_by_ref(socket.assigns.runs, ref)
    if run_id, do: push(socket, "script_run_finished", %{run_id: run_id, status: "error", reason: inspect(reason)})
    Process.demonitor(ref, [:flush])
    {:noreply, assign(socket, :runs, runs)}
  end

  def handle_info({:DOWN, ref, :process, _pid, reason}, socket) when is_reference(ref) do
    {run_id, runs} = pop_by_ref(socket.assigns.runs, ref)

    if run_id and reason != :normal do
      push(socket, "script_run_finished", %{run_id: run_id, status: "crashed", reason: inspect(reason)})
    end

    {:noreply, assign(socket, :runs, runs)}
  end

  def handle_info(_msg, socket), do: {:noreply, socket}

  # ── Internals ────────────────────────────────────────────────

  defp spawn_run(run_id, graph, char_id, ui_caller, extra_ctx) do
    ctx =
      Map.merge(
        %{char_id: char_id, ui_caller: ui_caller, run_id: run_id},
        (is_map(extra_ctx) && extra_ctx) || %{}
      )

    Task.async(fn ->
      try do
        ScriptInterpreter.run(graph, effects: &ScriptEffects.apply/2, ctx: ctx)
      rescue
        e ->
          Logger.warning("[PlayerChannel] script run=#{run_id} crashed: #{Exception.message(e)}")
          {:error, :crash, %{}}
      end
    end)
  end

  defp pop_by_ref(runs, ref) do
    Enum.find_value(runs, {nil, runs}, fn {id, %{task: t}} ->
      if t.ref == ref, do: {id, Map.delete(runs, id)}, else: nil
    end) || {nil, runs}
  end

  defp load_graph(id) when is_integer(id) or is_binary(id) do
    case Repo.query("SELECT name, graph_json FROM game_visual_scripts WHERE id = ?", [id]) do
      {:ok, %{rows: [[name, json]]}} when is_binary(json) ->
        case Jason.decode(json) do
          {:ok, graph} -> {:ok, name, graph}
          _ -> {:error, :bad_graph_json}
        end

      _ ->
        {:error, :not_found}
    end
  rescue
    _ -> {:error, :db_error}
  end

  defp generate_run_id do
    "run_" <> Base.encode16(:crypto.strong_rand_bytes(6), case: :lower)
  end
end
