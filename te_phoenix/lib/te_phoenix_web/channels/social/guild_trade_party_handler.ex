defmodule TePhoenixWeb.Social.GuildTradePartyHandler do
  @moduledoc """
  Guild, trade, and party handlers (22 events).
  Ported from socket-social.js guild/trade/party sections.
  """

  import Phoenix.Channel

  alias TePhoenix.Game.PlayerRegistry
  alias TePhoenix.Repo

  # ── Guild (8 events) ──────────────────────────────────────────

  def handle("guild_invite", %{"targetCharId" => target_char_id}, socket) do
    char_id = socket.assigns[:char_id]
    p = PlayerRegistry.get(char_id)
    tid = parse_int(target_char_id)
    if is_nil(p), do: {:noreply, socket}

    try do
      # Verify caller is leader or officer
      case Repo.query(
        "SELECT gm.guild_id, gm.rank, g.name AS guild_name FROM guild_members gm JOIN guilds g ON g.id=gm.guild_id WHERE gm.character_id=? AND gm.is_active=1",
        [char_id]
      ) do
        {:ok, %{rows: [[guild_id, rank, guild_name]]}} when rank in ["LEADER", "OFFICER"] ->
          # Check target not already in a guild
          case Repo.query("SELECT id FROM guild_members WHERE character_id=? AND is_active=1", [tid]) do
            {:ok, %{rows: [_]}} ->
              push(socket, "notification", %{type: "error", message: "That player is already in a guild."})

            _ ->
              Repo.query!(
                "INSERT INTO guild_invites (guild_id, inviter_id, invitee_id, status, created_at) VALUES (?,?,?,'pending',NOW())",
                [guild_id, char_id, tid]
              )
              TePhoenixWeb.Endpoint.broadcast!("user:#{tid}", "guild_invite_received", %{
                guildId: guild_id, guildName: guild_name,
                fromCharId: char_id, fromName: p.name
              })
              push(socket, "notification", %{type: "success", message: "Guild invite sent."})
          end

        _ ->
          push(socket, "notification", %{type: "error", message: "You must be a guild leader or officer to invite."})
      end
    rescue
      _ -> push(socket, "notification", %{type: "error", message: "Failed to send invite."})
    end

    {:noreply, socket}
  end

  def handle("guild_accept", %{"guildId" => guild_id}, socket) do
    char_id = socket.assigns[:char_id]
    gid = parse_int(guild_id)

    try do
      # Validate invite exists, not expired
      case Repo.query(
        "SELECT id FROM guild_invites WHERE guild_id=? AND invitee_id=? AND status='pending' AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY) ORDER BY created_at DESC LIMIT 1",
        [gid, char_id]
      ) do
        {:ok, %{rows: [[invite_id]]}} ->
          # Check guild has space (max 50)
          case Repo.query("SELECT COUNT(*) FROM guild_members WHERE guild_id=? AND is_active=1", [gid]) do
            {:ok, %{rows: [[count]]}} when count >= 50 ->
              push(socket, "notification", %{type: "error", message: "Guild is full."})

            _ ->
              Repo.query!("INSERT INTO guild_members (guild_id, character_id, rank, is_active, joined_at) VALUES (?,?,'MEMBER',1,NOW())", [gid, char_id])
              Repo.query!("UPDATE guild_invites SET status='accepted' WHERE id=?", [invite_id])

              p = PlayerRegistry.get(char_id)
              player_name = if p, do: p.name, else: "Unknown"

              TePhoenixWeb.Endpoint.broadcast!("guild:#{gid}", "guild_joined", %{
                charId: char_id, name: player_name
              })
              TePhoenixWeb.Endpoint.broadcast!("guild:#{gid}", "guild_update", %{guildId: gid})
              push(socket, "notification", %{type: "success", message: "You joined the guild!"})
          end

        _ ->
          push(socket, "notification", %{type: "error", message: "No valid invite found."})
      end
    rescue
      _ -> push(socket, "notification", %{type: "error", message: "Failed to accept invite."})
    end

    {:noreply, socket}
  end

  def handle("guild_decline", %{"guildId" => guild_id}, socket) do
    char_id = socket.assigns[:char_id]
    gid = parse_int(guild_id)

    try do
      Repo.query!(
        "UPDATE guild_invites SET status='declined' WHERE guild_id=? AND invitee_id=? AND status='pending'",
        [gid, char_id]
      )
      push(socket, "notification", %{type: "info", message: "Invite declined."})
    rescue
      _ -> nil
    end

    {:noreply, socket}
  end

  def handle("guild_leave", _payload, socket) do
    char_id = socket.assigns[:char_id]

    try do
      case Repo.query(
        "SELECT guild_id, rank FROM guild_members WHERE character_id=? AND is_active=1",
        [char_id]
      ) do
        {:ok, %{rows: [[guild_id, rank]]}} ->
          Repo.query!("UPDATE guild_members SET is_active=0 WHERE character_id=? AND guild_id=?", [char_id, guild_id])

          if rank == "LEADER" do
            # Transfer leadership to next officer, or next member, or disband
            case Repo.query(
              "SELECT character_id FROM guild_members WHERE guild_id=? AND is_active=1 AND character_id!=? ORDER BY FIELD(rank,'OFFICER','MEMBER') ASC, joined_at ASC LIMIT 1",
              [guild_id, char_id]
            ) do
              {:ok, %{rows: [[next_id]]}} ->
                Repo.query!("UPDATE guild_members SET rank='LEADER' WHERE character_id=? AND guild_id=?", [next_id, guild_id])
                TePhoenixWeb.Endpoint.broadcast!("guild:#{guild_id}", "guild_update", %{guildId: guild_id, newLeader: next_id})

              _ ->
                # No members left, disband
                Repo.query!("UPDATE guilds SET is_active=0 WHERE id=?", [guild_id])
                TePhoenixWeb.Endpoint.broadcast!("guild:#{guild_id}", "guild_disbanded", %{guildId: guild_id})
            end
          else
            TePhoenixWeb.Endpoint.broadcast!("guild:#{guild_id}", "guild_update", %{guildId: guild_id})
          end

          push(socket, "notification", %{type: "info", message: "You left the guild."})

        _ ->
          push(socket, "notification", %{type: "error", message: "You are not in a guild."})
      end
    rescue
      _ -> push(socket, "notification", %{type: "error", message: "Failed to leave guild."})
    end

    {:noreply, socket}
  end

  def handle("guild_kick", %{"targetCharId" => target_char_id}, socket) do
    char_id = socket.assigns[:char_id]
    tid = parse_int(target_char_id)

    try do
      case Repo.query(
        "SELECT guild_id, rank FROM guild_members WHERE character_id=? AND is_active=1",
        [char_id]
      ) do
        {:ok, %{rows: [[guild_id, rank]]}} when rank in ["LEADER", "OFFICER"] ->
          # Can't kick yourself or someone of equal/higher rank
          case Repo.query(
            "SELECT rank FROM guild_members WHERE character_id=? AND guild_id=? AND is_active=1",
            [tid, guild_id]
          ) do
            {:ok, %{rows: [[target_rank]]}} ->
              if target_rank == "LEADER" or (rank == "OFFICER" and target_rank == "OFFICER") do
                push(socket, "notification", %{type: "error", message: "Cannot kick that member."})
              else
                Repo.query!("UPDATE guild_members SET is_active=0 WHERE character_id=? AND guild_id=?", [tid, guild_id])
                TePhoenixWeb.Endpoint.broadcast!("user:#{tid}", "guild_kicked", %{guildId: guild_id})
                TePhoenixWeb.Endpoint.broadcast!("guild:#{guild_id}", "guild_update", %{guildId: guild_id})
                push(socket, "notification", %{type: "success", message: "Member removed."})
              end

            _ ->
              push(socket, "notification", %{type: "error", message: "Target not in guild."})
          end

        _ ->
          push(socket, "notification", %{type: "error", message: "You must be a leader or officer."})
      end
    rescue
      _ -> push(socket, "notification", %{type: "error", message: "Failed to kick member."})
    end

    {:noreply, socket}
  end

  def handle("guild_set_rank", %{"targetCharId" => target_char_id, "rank" => new_rank}, socket) do
    char_id = socket.assigns[:char_id]
    tid = parse_int(target_char_id)
    valid_ranks = ~w(MEMBER OFFICER LEADER)
    if new_rank not in valid_ranks, do: {:noreply, socket}

    try do
      case Repo.query(
        "SELECT guild_id, rank FROM guild_members WHERE character_id=? AND is_active=1",
        [char_id]
      ) do
        {:ok, %{rows: [[guild_id, "LEADER"]]}} ->
          Repo.query!("UPDATE guild_members SET rank=? WHERE character_id=? AND guild_id=? AND is_active=1", [new_rank, tid, guild_id])

          # If promoting to LEADER, demote self to OFFICER
          if new_rank == "LEADER" do
            Repo.query!("UPDATE guild_members SET rank='OFFICER' WHERE character_id=? AND guild_id=?", [char_id, guild_id])
          end

          TePhoenixWeb.Endpoint.broadcast!("guild:#{guild_id}", "guild_update", %{guildId: guild_id})
          push(socket, "notification", %{type: "success", message: "Rank updated."})

        _ ->
          push(socket, "notification", %{type: "error", message: "Only the guild leader can change ranks."})
      end
    rescue
      _ -> push(socket, "notification", %{type: "error", message: "Failed to set rank."})
    end

    {:noreply, socket}
  end

  def handle("guild_promote", %{"targetCharId" => target_char_id}, socket) do
    handle("guild_set_rank", %{"targetCharId" => target_char_id, "rank" => "OFFICER"}, socket)
  end

  def handle("guild_demote", %{"targetCharId" => target_char_id}, socket) do
    handle("guild_set_rank", %{"targetCharId" => target_char_id, "rank" => "MEMBER"}, socket)
  end

  # ── Trade (9 events) ──────────────────────────────────────────

  def handle("trade_request", %{"targetCharId" => target_char_id}, socket) do
    char_id = socket.assigns[:char_id]
    p = PlayerRegistry.get(char_id)
    tid = parse_int(target_char_id)
    if is_nil(p), do: {:noreply, socket}

    TePhoenixWeb.Endpoint.broadcast!("user:#{tid}", "trade_request_incoming", %{
      fromCharId: char_id, fromName: p.name
    })
    push(socket, "notification", %{type: "info", message: "Trade request sent."})

    {:noreply, socket}
  end

  def handle("trade_accept", %{"targetCharId" => target_char_id}, socket) do
    char_id = socket.assigns[:char_id]
    tid = parse_int(target_char_id)
    ensure_trade_table()

    trade_id = "trade_#{min(char_id, tid)}_#{max(char_id, tid)}_#{System.system_time(:millisecond)}"

    trade = %{
      id: trade_id,
      sides: %{
        char_id => %{items: [], gold: 0, locked: false, confirmed: false},
        tid => %{items: [], gold: 0, locked: false, confirmed: false}
      },
      participants: [char_id, tid],
      started_at: System.system_time(:millisecond)
    }

    :ets.insert(:active_trades, {trade_id, trade})
    # Also index by participant for fast lookup
    :ets.insert(:active_trades, {{:by_char, char_id}, trade_id})
    :ets.insert(:active_trades, {{:by_char, tid}, trade_id})

    TePhoenixWeb.Endpoint.broadcast!("user:#{char_id}", "trade_start", %{tradeId: trade_id, partnerId: tid})
    TePhoenixWeb.Endpoint.broadcast!("user:#{tid}", "trade_start", %{tradeId: trade_id, partnerId: char_id})

    {:noreply, socket}
  end

  def handle("trade_decline", %{"targetCharId" => target_char_id}, socket) do
    char_id = socket.assigns[:char_id]
    tid = parse_int(target_char_id)
    p = PlayerRegistry.get(char_id)

    TePhoenixWeb.Endpoint.broadcast!("user:#{tid}", "trade_declined", %{
      fromCharId: char_id, fromName: if(p, do: p.name, else: "Unknown")
    })

    {:noreply, socket}
  end

  def handle("trade_add_item", %{"tradeId" => trade_id, "itemId" => item_id}, socket) do
    char_id = socket.assigns[:char_id]
    ensure_trade_table()

    case :ets.lookup(:active_trades, trade_id) do
      [{^trade_id, trade}] ->
        if char_id in trade.participants do
          # Verify item in inventory
          case Repo.query("SELECT ci.id, i.name, i.icon, i.rarity FROM character_items ci JOIN game_items i ON i.id=ci.item_id WHERE ci.character_id=? AND ci.item_id=?", [char_id, parse_int(item_id)]) do
            {:ok, %{rows: [[_inv_id, name, icon, rarity]]}} ->
              iid = parse_int(item_id)
              my_side = trade.sides[char_id]
              updated_items = my_side.items ++ [%{itemId: iid, name: name, icon: icon, rarity: rarity}]
              updated_side = %{my_side | items: updated_items, confirmed: false}

              # Reset both confirms
              partner_id = Enum.find(trade.participants, fn id -> id != char_id end)
              partner_side = %{trade.sides[partner_id] | confirmed: false}

              updated_trade = %{trade | sides: %{char_id => updated_side, partner_id => partner_side}}
              :ets.insert(:active_trades, {trade_id, updated_trade})

              broadcast_trade_update(trade_id, updated_trade)

            _ ->
              push(socket, "notification", %{type: "error", message: "Item not in inventory."})
          end
        end

      _ ->
        push(socket, "notification", %{type: "error", message: "Trade not found."})
    end

    {:noreply, socket}
  end

  def handle("trade_remove_item", %{"tradeId" => trade_id, "itemId" => item_id}, socket) do
    char_id = socket.assigns[:char_id]
    ensure_trade_table()

    case :ets.lookup(:active_trades, trade_id) do
      [{^trade_id, trade}] ->
        if char_id in trade.participants do
          iid = parse_int(item_id)
          my_side = trade.sides[char_id]
          updated_items = List.delete_at(my_side.items, Enum.find_index(my_side.items, fn i -> i.itemId == iid end) || -1)
          updated_side = %{my_side | items: updated_items, confirmed: false}

          partner_id = Enum.find(trade.participants, fn id -> id != char_id end)
          partner_side = %{trade.sides[partner_id] | confirmed: false}

          updated_trade = %{trade | sides: %{char_id => updated_side, partner_id => partner_side}}
          :ets.insert(:active_trades, {trade_id, updated_trade})

          broadcast_trade_update(trade_id, updated_trade)
        end

      _ ->
        push(socket, "notification", %{type: "error", message: "Trade not found."})
    end

    {:noreply, socket}
  end

  def handle("trade_set_gold", %{"tradeId" => trade_id, "gold" => gold}, socket) do
    char_id = socket.assigns[:char_id]
    amount = max(0, parse_int(gold))
    ensure_trade_table()

    case :ets.lookup(:active_trades, trade_id) do
      [{^trade_id, trade}] ->
        if char_id in trade.participants do
          my_side = trade.sides[char_id]
          updated_side = %{my_side | gold: amount, confirmed: false}

          partner_id = Enum.find(trade.participants, fn id -> id != char_id end)
          partner_side = %{trade.sides[partner_id] | confirmed: false}

          updated_trade = %{trade | sides: %{char_id => updated_side, partner_id => partner_side}}
          :ets.insert(:active_trades, {trade_id, updated_trade})

          broadcast_trade_update(trade_id, updated_trade)
        end

      _ ->
        push(socket, "notification", %{type: "error", message: "Trade not found."})
    end

    {:noreply, socket}
  end

  def handle("trade_lock", %{"tradeId" => trade_id}, socket) do
    char_id = socket.assigns[:char_id]
    ensure_trade_table()

    case :ets.lookup(:active_trades, trade_id) do
      [{^trade_id, trade}] ->
        if char_id in trade.participants do
          my_side = trade.sides[char_id]
          updated_side = %{my_side | locked: !my_side.locked}

          updated_trade = %{trade | sides: Map.put(trade.sides, char_id, updated_side)}
          :ets.insert(:active_trades, {trade_id, updated_trade})

          broadcast_trade_update(trade_id, updated_trade)
        end

      _ ->
        push(socket, "notification", %{type: "error", message: "Trade not found."})
    end

    {:noreply, socket}
  end

  def handle("trade_confirm", %{"tradeId" => trade_id}, socket) do
    char_id = socket.assigns[:char_id]
    ensure_trade_table()

    case :ets.lookup(:active_trades, trade_id) do
      [{^trade_id, trade}] ->
        if char_id in trade.participants do
          my_side = %{trade.sides[char_id] | confirmed: true}
          partner_id = Enum.find(trade.participants, fn id -> id != char_id end)
          partner_side = trade.sides[partner_id]

          updated_trade = %{trade | sides: Map.put(trade.sides, char_id, my_side)}

          if my_side.locked and partner_side.locked and partner_side.confirmed do
            # Both locked and confirmed — execute the trade
            execute_trade(trade_id, updated_trade, char_id, partner_id, socket)
          else
            :ets.insert(:active_trades, {trade_id, updated_trade})
            broadcast_trade_update(trade_id, updated_trade)
          end
        end

      _ ->
        push(socket, "notification", %{type: "error", message: "Trade not found."})
    end

    {:noreply, socket}
  end

  def handle("trade_cancel", %{"tradeId" => trade_id}, socket) do
    char_id = socket.assigns[:char_id]
    ensure_trade_table()

    case :ets.lookup(:active_trades, trade_id) do
      [{^trade_id, trade}] ->
        if char_id in trade.participants do
          Enum.each(trade.participants, fn pid ->
            TePhoenixWeb.Endpoint.broadcast!("user:#{pid}", "trade_cancelled", %{tradeId: trade_id, cancelledBy: char_id})
          end)
          cleanup_trade(trade_id, trade)
        end

      _ -> nil
    end

    {:noreply, socket}
  end

  # ── Party (5 events) ──────────────────────────────────────────

  def handle("party_invite", %{"targetCharId" => target_char_id}, socket) do
    char_id = socket.assigns[:char_id]
    p = PlayerRegistry.get(char_id)
    tid = parse_int(target_char_id)
    if is_nil(p), do: {:noreply, socket}

    try do
      # Check if player already has a party
      party_id = case Repo.query(
        "SELECT party_id FROM character_party_members WHERE character_id=? AND is_active=1 LIMIT 1",
        [char_id]
      ) do
        {:ok, %{rows: [[pid]]}} -> pid
        _ ->
          # Create a new party
          {:ok, result} = Repo.query(
            "INSERT INTO character_parties (leader_id, created_at, is_active) VALUES (?,NOW(),1)",
            [char_id]
          )
          new_party_id = result.last_insert_id
          Repo.query!(
            "INSERT INTO character_party_members (party_id, character_id, is_active, joined_at) VALUES (?,?,1,NOW())",
            [new_party_id, char_id]
          )
          new_party_id
      end

      # Check target not already in a party
      case Repo.query("SELECT id FROM character_party_members WHERE character_id=? AND is_active=1", [tid]) do
        {:ok, %{rows: [_]}} ->
          push(socket, "notification", %{type: "error", message: "That player is already in a party."})

        _ ->
          TePhoenixWeb.Endpoint.broadcast!("user:#{tid}", "party_invite_received", %{
            partyId: party_id, fromCharId: char_id, fromName: p.name
          })
          push(socket, "notification", %{type: "success", message: "Party invite sent."})
      end
    rescue
      _ -> push(socket, "notification", %{type: "error", message: "Failed to create party invite."})
    end

    {:noreply, socket}
  end

  def handle("party_accept", %{"partyId" => party_id}, socket) do
    char_id = socket.assigns[:char_id]
    pid = parse_int(party_id)

    try do
      # Verify party exists and is active
      case Repo.query("SELECT id FROM character_parties WHERE id=? AND is_active=1", [pid]) do
        {:ok, %{rows: [_]}} ->
          Repo.query!(
            "INSERT INTO character_party_members (party_id, character_id, is_active, joined_at) VALUES (?,?,1,NOW())",
            [pid, char_id]
          )

          p = PlayerRegistry.get(char_id)
          player_name = if p, do: p.name, else: "Unknown"

          # Broadcast to all party members
          case Repo.query("SELECT character_id FROM character_party_members WHERE party_id=? AND is_active=1", [pid]) do
            {:ok, %{rows: rows}} ->
              Enum.each(rows, fn [member_id] ->
                TePhoenixWeb.Endpoint.broadcast!("user:#{member_id}", "party_update", %{
                  partyId: pid, event: "joined", charId: char_id, name: player_name
                })
              end)
            _ -> nil
          end

          push(socket, "notification", %{type: "success", message: "You joined the party!"})

        _ ->
          push(socket, "notification", %{type: "error", message: "Party not found or disbanded."})
      end
    rescue
      _ -> push(socket, "notification", %{type: "error", message: "Failed to join party."})
    end

    {:noreply, socket}
  end

  def handle("party_decline", %{"partyId" => party_id}, socket) do
    char_id = socket.assigns[:char_id]
    pid = parse_int(party_id)
    p = PlayerRegistry.get(char_id)

    # Notify leader
    case Repo.query("SELECT leader_id FROM character_parties WHERE id=?", [pid]) do
      {:ok, %{rows: [[leader_id]]}} ->
        TePhoenixWeb.Endpoint.broadcast!("user:#{leader_id}", "party_invite_declined", %{
          partyId: pid, fromCharId: char_id, fromName: if(p, do: p.name, else: "Unknown")
        })
      _ -> nil
    end

    {:noreply, socket}
  end

  def handle("party_leave", _payload, socket) do
    char_id = socket.assigns[:char_id]

    try do
      case Repo.query(
        "SELECT pm.party_id, p.leader_id FROM character_party_members pm JOIN character_parties p ON p.id=pm.party_id WHERE pm.character_id=? AND pm.is_active=1 LIMIT 1",
        [char_id]
      ) do
        {:ok, %{rows: [[party_id, leader_id]]}} ->
          Repo.query!("UPDATE character_party_members SET is_active=0 WHERE character_id=? AND party_id=?", [char_id, party_id])

          # Check remaining members
          case Repo.query("SELECT character_id FROM character_party_members WHERE party_id=? AND is_active=1", [party_id]) do
            {:ok, %{rows: [_ | _] = remaining}} ->
              if char_id == leader_id do
                # Transfer leadership
                [[new_leader_id] | _] = remaining
                Repo.query!("UPDATE character_parties SET leader_id=? WHERE id=?", [new_leader_id, party_id])
              end

              Enum.each(remaining, fn [member_id] ->
                TePhoenixWeb.Endpoint.broadcast!("user:#{member_id}", "party_update", %{
                  partyId: party_id, event: "left", charId: char_id
                })
              end)

            _ ->
              # No members left, disband
              Repo.query!("UPDATE character_parties SET is_active=0 WHERE id=?", [party_id])
          end

          push(socket, "notification", %{type: "info", message: "You left the party."})

        _ ->
          push(socket, "notification", %{type: "error", message: "You are not in a party."})
      end
    rescue
      _ -> push(socket, "notification", %{type: "error", message: "Failed to leave party."})
    end

    {:noreply, socket}
  end

  def handle("party_kick", %{"targetCharId" => target_char_id}, socket) do
    char_id = socket.assigns[:char_id]
    tid = parse_int(target_char_id)

    try do
      case Repo.query(
        "SELECT pm.party_id, p.leader_id FROM character_party_members pm JOIN character_parties p ON p.id=pm.party_id WHERE pm.character_id=? AND pm.is_active=1 LIMIT 1",
        [char_id]
      ) do
        {:ok, %{rows: [[party_id, leader_id]]}} when leader_id == char_id ->
          # Verify target is in the same party
          case Repo.query(
            "SELECT id FROM character_party_members WHERE party_id=? AND character_id=? AND is_active=1",
            [party_id, tid]
          ) do
            {:ok, %{rows: [_]}} ->
              Repo.query!("UPDATE character_party_members SET is_active=0 WHERE character_id=? AND party_id=?", [tid, party_id])

              TePhoenixWeb.Endpoint.broadcast!("user:#{tid}", "party_kicked", %{partyId: party_id})

              # Notify remaining members
              case Repo.query("SELECT character_id FROM character_party_members WHERE party_id=? AND is_active=1", [party_id]) do
                {:ok, %{rows: rows}} ->
                  Enum.each(rows, fn [member_id] ->
                    TePhoenixWeb.Endpoint.broadcast!("user:#{member_id}", "party_update", %{
                      partyId: party_id, event: "kicked", charId: tid
                    })
                  end)
                _ -> nil
              end

              push(socket, "notification", %{type: "success", message: "Player removed from party."})

            _ ->
              push(socket, "notification", %{type: "error", message: "Target not in your party."})
          end

        _ ->
          push(socket, "notification", %{type: "error", message: "Only the party leader can kick members."})
      end
    rescue
      _ -> push(socket, "notification", %{type: "error", message: "Failed to kick member."})
    end

    {:noreply, socket}
  end

  # ── Catch-all ─────────────────────────────────────────────────

  def handle(_, _, socket), do: {:noreply, socket}

  # ── Private — Trade helpers ───────────────────────────────────

  defp ensure_trade_table do
    case :ets.whereis(:active_trades) do
      :undefined -> :ets.new(:active_trades, [:named_table, :public, :set])
      _ -> :ok
    end
  end

  defp broadcast_trade_update(trade_id, trade) do
    Enum.each(trade.participants, fn pid ->
      partner_id = Enum.find(trade.participants, fn id -> id != pid end)
      TePhoenixWeb.Endpoint.broadcast!("user:#{pid}", "trade_update", %{
        tradeId: trade_id,
        mySide: trade.sides[pid],
        theirSide: trade.sides[partner_id]
      })
    end)
  end

  defp execute_trade(trade_id, trade, char_id, partner_id, _socket) do
    my_side = trade.sides[char_id]
    their_side = trade.sides[partner_id]

    try do
      # Verify gold availability for both sides
      my_gold_ok = if my_side.gold > 0 do
        case Repo.query("SELECT gold FROM characters WHERE id=? AND gold>=?", [char_id, my_side.gold]) do
          {:ok, %{rows: [_]}} -> true
          _ -> false
        end
      else
        true
      end

      their_gold_ok = if their_side.gold > 0 do
        case Repo.query("SELECT gold FROM characters WHERE id=? AND gold>=?", [partner_id, their_side.gold]) do
          {:ok, %{rows: [_]}} -> true
          _ -> false
        end
      else
        true
      end

      if not my_gold_ok or not their_gold_ok do
        Enum.each(trade.participants, fn pid ->
          TePhoenixWeb.Endpoint.broadcast!("user:#{pid}", "trade_error", %{tradeId: trade_id, message: "Insufficient gold."})
        end)
      else
        # Swap gold
        if my_side.gold > 0 do
          Repo.query!("UPDATE characters SET gold=gold-? WHERE id=?", [my_side.gold, char_id])
          Repo.query!("UPDATE characters SET gold=gold+? WHERE id=?", [my_side.gold, partner_id])
        end

        if their_side.gold > 0 do
          Repo.query!("UPDATE characters SET gold=gold-? WHERE id=?", [their_side.gold, partner_id])
          Repo.query!("UPDATE characters SET gold=gold+? WHERE id=?", [their_side.gold, char_id])
        end

        # Swap items: my items -> partner
        Enum.each(my_side.items, fn item ->
          case Repo.query("SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=?", [char_id, item.itemId]) do
            {:ok, %{rows: [[inv_id, qty]]}} ->
              if qty <= 1 do
                Repo.query!("DELETE FROM character_items WHERE id=?", [inv_id])
              else
                Repo.query!("UPDATE character_items SET quantity=quantity-1 WHERE id=?", [inv_id])
              end
              Repo.query!("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1", [partner_id, item.itemId])
            _ -> nil
          end
        end)

        # Swap items: their items -> me
        Enum.each(their_side.items, fn item ->
          case Repo.query("SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=?", [partner_id, item.itemId]) do
            {:ok, %{rows: [[inv_id, qty]]}} ->
              if qty <= 1 do
                Repo.query!("DELETE FROM character_items WHERE id=?", [inv_id])
              else
                Repo.query!("UPDATE character_items SET quantity=quantity-1 WHERE id=?", [inv_id])
              end
              Repo.query!("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1", [char_id, item.itemId])
            _ -> nil
          end
        end)

        # Broadcast completion
        Enum.each(trade.participants, fn pid ->
          TePhoenixWeb.Endpoint.broadcast!("user:#{pid}", "trade_complete", %{tradeId: trade_id})
        end)

        cleanup_trade(trade_id, trade)
      end
    rescue
      _ ->
        Enum.each(trade.participants, fn pid ->
          TePhoenixWeb.Endpoint.broadcast!("user:#{pid}", "trade_error", %{tradeId: trade_id, message: "Trade failed. Items may not have transferred."})
        end)
        cleanup_trade(trade_id, trade)
    end
  end

  defp cleanup_trade(trade_id, trade) do
    :ets.delete(:active_trades, trade_id)
    Enum.each(trade.participants, fn pid ->
      :ets.delete(:active_trades, {:by_char, pid})
    end)
  end

  # ── Private — Utilities ───────────────────────────────────────

  defp parse_int(val) when is_integer(val), do: val
  defp parse_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp parse_int(_), do: 0
end
