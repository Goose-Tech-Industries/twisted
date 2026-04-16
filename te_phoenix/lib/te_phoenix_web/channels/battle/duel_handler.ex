defmodule TePhoenixWeb.Battle.DuelHandler do
  @moduledoc """
  Handles duel_challenge, duel_accept, duel_decline channel events.
  Ported from socket-battle.js duel system.
  """

  import Phoenix.Channel
  alias TePhoenix.Battle.{Duels, Manager}

  def handle("duel_challenge", %{"target_id" => target_id} = payload, socket) do
    user_id = socket.assigns.user_id
    char_id = socket.assigns[:char_id]
    char_name = socket.assigns[:char_name] || "Unknown"
    char_level = socket.assigns[:char_level] || 1
    wager = Map.get(payload, "wager_amount", 0)

    case Duels.challenge(char_id, char_name, char_level, user_id, target_id, wager) do
      {:ok, duel} ->
        # Schedule expiry after 60s
        timer_ref = Process.send_after(self(), {:duel_expired, duel.id}, 60_000)
        Duels.set_timer(duel.id, timer_ref)

        # Push challenge to target via PubSub (they may be on a different channel process)
        TePhoenixWeb.Endpoint.broadcast!(
          "user:#{target_id}",
          "duel_request",
          %{
            id: duel.id,
            challenger_id: char_id,
            challenger_name: char_name,
            challenger_level: char_level,
            target_id: target_id,
            wager_amount: duel.wager_amount,
            expires_at: duel.expires_at
          }
        )

        push(socket, "notification", %{
          text: "Duel challenge sent!",
          type: "info"
        })

        {:noreply, socket}

      {:error, reason} ->
        push(socket, "duel_error", %{reason: reason})
        {:noreply, socket}
    end
  end

  def handle("duel_accept", %{"request_id" => request_id}, socket) do
    char_id = socket.assigns[:char_id]
    user_id = socket.assigns.user_id

    # Validate accepter can afford wager before accepting
    case Duels.accept(request_id, char_id) do
      {:ok, duel} ->
        # Check accepter's balance before deducting
        can_afford = if duel.wager_amount > 0 do
          case TePhoenix.Repo.query("SELECT currency FROM users WHERE id=?", [user_id]) do
            {:ok, %{rows: [[currency]]}} when currency >= duel.wager_amount -> true
            _ -> false
          end
        else
          true
        end

        if not can_afford do
          # Decline — NO refund needed since no wager was deducted yet
          push(socket, "duel_error", %{reason: "Insufficient gold for that wager."})
          {:noreply, socket}
        else
          # Deduct wagers from both players
          if duel.wager_amount > 0 do
            TePhoenix.Repo.query!("UPDATE users SET currency=currency-? WHERE id=?",
              [duel.wager_amount, duel.challenger_user_id])
            TePhoenix.Repo.query!("UPDATE users SET currency=currency-? WHERE id=?",
              [duel.wager_amount, user_id])
          end

          # Notify challenger
          TePhoenixWeb.Endpoint.broadcast!(
          "user:#{duel.challenger_id}",
          "duel_accepted",
          %{request_id: request_id, accepter_name: socket.assigns[:char_name]}
        )

        # Start the battle
        case Manager.create_battle(duel.challenger_id, char_id, :pvp) do
          {:ok, battle_id} ->
            # Both players will join the battle channel topic
            TePhoenixWeb.Endpoint.broadcast!(
              "user:#{duel.challenger_id}",
              "battle_start_join",
              %{battle_id: battle_id, wager: duel.wager_amount, is_duel: true}
            )

            push(socket, "battle_start_join", %{
              battle_id: battle_id,
              wager: duel.wager_amount,
              is_duel: true
            })

            {:noreply, socket}

          {:error, _reason} ->
            # Refund wagers
            if duel.wager_amount > 0 do
              TePhoenix.Repo.query!("UPDATE users SET currency=currency+? WHERE id=?",
                [duel.wager_amount, duel.challenger_user_id])
              TePhoenix.Repo.query!("UPDATE users SET currency=currency+? WHERE id=?",
                [duel.wager_amount, user_id])
            end

            push(socket, "duel_error", %{reason: "Failed to start battle."})
            {:noreply, socket}
        end
        end  # end of can_afford else

      {:error, reason} ->
        push(socket, "duel_error", %{reason: reason})
        {:noreply, socket}
    end
  end

  def handle("duel_decline", %{"request_id" => request_id}, socket) do
    char_id = socket.assigns[:char_id]

    case Duels.decline(request_id, char_id) do
      :ok ->
        push(socket, "notification", %{text: "Duel challenge declined.", type: "info"})
      :not_found ->
        :ok
    end

    {:noreply, socket}
  end
end
