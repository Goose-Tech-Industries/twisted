defmodule TePhoenixWeb.Admin.PlayerProfileLive do
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo
  alias TePhoenix.Game.AdminAudit
  alias TePhoenix.Game.PlayerRegistry

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    user_id = to_int(id)

    classes = query_rows("SELECT id, name FROM game_classes ORDER BY name")
    races = query_rows("SELECT id, name FROM game_races ORDER BY name")
    maps = query_rows("SELECT id, name FROM game_maps WHERE is_active=1 ORDER BY name")

    {stat_mode, primary_stat_name, custom_stats} = load_stat_mode()
    toggles = load_toggles()

    duration_options = [{"Permanent", "permanent"}, {"15 min", "15m"}, {"1 hour", "1h"}, {"6 hours", "6h"}, {"24 hours", "24h"}, {"3 days", "3d"}, {"7 days", "7d"}, {"30 days", "30d"}]

    {:ok, assign(socket,
      active_tab: :players,
      user_id: user_id,
      editing: nil,
      edit_value: "",
      editing_char: nil,
      char_edit_field: nil,
      char_edit_value: "",
      custom_color_1: "#4ade80",
      custom_color_2: "#1a1a1a",
      custom_color_3: "#2dd4bf",
      inventory_open: nil,
      inventory_items: [],
      inv_search: "",
      all_items: [],
      note_input: "",
      classes: classes,
      races: races,
      maps_list: maps,
      stat_mode: stat_mode,
      primary_stat_name: primary_stat_name,
      custom_stats: custom_stats,
      use_classes: toggles.use_classes,
      use_races: toggles.use_races,
      use_hp_mp: toggles.use_hp_mp,
      # Timed ban/mute
      ban_duration: "permanent",
      ban_reason: "",
      mute_duration: "permanent",
      duration_options: duration_options,
      # Teleport
      teleport_char: nil,
      teleport_map: nil,
      teleport_x: "5",
      teleport_y: "5",
      # Gift package
      gift_char: nil,
      gift_gold: "0",
      gift_xp: "0",
      gift_item_search: "",
      gift_items: [],
      gift_selected_items: [],
      gift_message: "",
      # System message
      sys_msg_subject: "",
      sys_msg_body: "",
      # Broadcast
      broadcast_message: ""
    ) |> load_player()}
  end

  defp load_player(socket) do
    user_id = socket.assigns.user_id

    player = case Repo.query(
      "SELECT id, username, email, role, currency, is_banned, ban_reason, ban_expires_at, is_muted, mute_expires_at, is_frozen, freeze_reason, email_verified, created_at, last_login, login_streak, last_login_date, invite_code, referred_by, chat_color, warning_level, max_characters FROM users WHERE id=?",
      [user_id]
    ) do
      {:ok, %{rows: [row], columns: cols}} -> Enum.zip(cols, row) |> Map.new()
      _ -> nil
    end

    chars = case Repo.query("""
      SELECT c.id, c.name, c.level, c.experience, c.class_id, c.race_id,
             c.current_hp, c.max_hp, c.current_mp, c.max_mp,
             c.atk, c.def, c.mo, c.md, c.speed, c.luck,
             c.map_id, c.x, c.y, c.limitbreak, c.breaklevel,
             c.death_count, c.profile_bio, c.equipped_title,
             c.sprite_sheet_url, c.sprite_frame_width, c.sprite_frame_height,
             c.sprite_walk_frames, c.sprite_idle_frames,
             c.profile_color, c.profile_banner_emoji, c.presence_status,
             c.max_ap, c.current_ap, c.secondary_class_id,
             gc.name AS class_name, gr.name AS race_name,
             gm.name AS map_name
      FROM characters c
      LEFT JOIN game_classes gc ON gc.id=c.class_id
      LEFT JOIN game_races gr ON gr.id=c.race_id
      LEFT JOIN game_maps gm ON gm.id=c.map_id
      WHERE c.user_id=? ORDER BY c.level DESC
    """, [user_id]) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end

    inventory_counts = case Repo.query("""
      SELECT ci.character_id, COUNT(*) as cnt
      FROM character_items ci
      WHERE ci.character_id IN (SELECT id FROM characters WHERE user_id=?)
      GROUP BY ci.character_id
    """, [user_id]) do
      {:ok, %{rows: rows}} -> Map.new(rows, fn [cid, cnt] -> {cid, cnt} end)
      _ -> %{}
    end

    activity = case Repo.query(
      "SELECT event_type, actor_name, detail_json, created_at FROM game_event_log WHERE actor_id=? OR target_id=? ORDER BY created_at DESC LIMIT 15",
      [user_id, user_id]
    ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [type, actor, detail, ts] -> %{type: type, actor: actor, detail: detail, timestamp: ts} end)
      _ -> []
    end

    player_notes = case Repo.query(
      "SELECT id, body, author_name, created_at FROM player_notes WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
      [user_id]
    ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, body, author, ts] -> %{id: id, body: body, author: author, timestamp: ts} end)
      _ -> []
    end

    player_warnings = case Repo.query(
      "SELECT reason, warning_level AS severity, warned_by_name AS issued_by_name, action_taken, created_at FROM player_warnings WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
      [user_id]
    ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [reason, severity, by, action, ts] ->
          %{reason: reason, severity: severity, issued_by: by, action: action, timestamp: ts}
        end)
      _ -> []
    end

    mod_history = case Repo.query(
      "SELECT action_type, reason, duration_minutes, performed_by_name, expires_at, lifted_at, lifted_by_name, detail_json, created_at FROM moderation_actions WHERE user_id=? ORDER BY created_at DESC LIMIT 30",
      [user_id]
    ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [action, reason, dur, by, exp, lifted, lifted_by, detail, ts] ->
          %{action: action, reason: reason, duration: dur, by: by, expires: exp, lifted: lifted, lifted_by: lifted_by, detail: detail, timestamp: ts}
        end)
      _ -> []
    end

    assign(socket,
      player: player,
      chars: chars,
      inventory_counts: inventory_counts,
      activity: activity,
      player_notes: player_notes,
      player_warnings: player_warnings,
      mod_history: mod_history
    )
  end

  # ── Edit handlers ──────────────────────────────────────────────

  @impl true
  def handle_event("start_edit", %{"field" => field}, socket) do
    current = socket.assigns.player[field] || ""
    {:noreply, assign(socket, editing: field, edit_value: to_string(current))}
  end

  def handle_event("cancel_edit", _params, socket) do
    {:noreply, assign(socket, editing: nil, edit_value: "")}
  end

  def handle_event("save_edit", %{"field" => field}, socket) do
    value = socket.assigns.edit_value
    user_id = socket.assigns.user_id

    safe_fields = ~w(email username chat_color ban_reason max_characters currency warning_level)
    if field not in safe_fields do
      {:noreply, put_flash(socket, :error, "Cannot edit that field.")}
    else
      val = if field in ~w(currency warning_level max_characters), do: to_int(value), else: value
      case Repo.query("UPDATE users SET `#{field}`=? WHERE id=?", [val, user_id]) do
        {:ok, _} ->
          {:noreply, socket |> put_flash(:info, "#{field} updated.") |> assign(editing: nil, edit_value: "") |> load_player()}
        _ ->
          {:noreply, put_flash(socket, :error, "Failed to update.")}
      end
    end
  end

  def handle_event("update_edit_value", %{"value" => value}, socket) do
    {:noreply, assign(socket, edit_value: value)}
  end

  # ── Role / Ban / Gold actions ──────────────────────────────────

  def handle_event("set_role", %{"role" => role}, socket) do
    if role in ~w(PLAYER MOD GM ADMIN OWNER) do
      Repo.query("UPDATE users SET role=? WHERE id=?", [role, socket.assigns.user_id])
      AdminAudit.log("gm_role_change", actor(socket), target(socket), role)
      {:noreply, socket |> put_flash(:info, "Role set to #{role}.") |> load_player()}
    else
      {:noreply, put_flash(socket, :error, "Invalid role.")}
    end
  end

  # ── Timed Ban ──────────────────────────────────────────────────

  def handle_event("update_ban_duration", %{"value" => val}, socket), do: {:noreply, assign(socket, ban_duration: val)}
  def handle_event("update_ban_reason", %{"value" => val}, socket), do: {:noreply, assign(socket, ban_reason: val)}

  def handle_event("ban", _params, socket) do
    uid = socket.assigns.user_id
    duration = socket.assigns.ban_duration
    reason = String.trim(socket.assigns.ban_reason)
    a = actor(socket)
    {expires_at, duration_minutes} = parse_duration(duration)

    if expires_at do
      Repo.query("UPDATE users SET is_banned=1, ban_reason=?, ban_expires_at=? WHERE id=?", [reason, expires_at, uid])
    else
      Repo.query("UPDATE users SET is_banned=1, ban_reason=?, ban_expires_at=NULL WHERE id=?", [reason, uid])
    end

    log_moderation(uid, "ban", reason, duration_minutes, expires_at, a)
    AdminAudit.log("gm_ban", a, target(socket), %{reason: reason, duration: duration})
    kick_player_from_game(uid)
    {:noreply, socket |> put_flash(:info, "Player banned.") |> assign(ban_reason: "", ban_duration: "permanent") |> load_player()}
  end

  def handle_event("unban", _params, socket) do
    uid = socket.assigns.user_id
    a = actor(socket)
    Repo.query("UPDATE users SET is_banned=0, ban_reason=NULL, ban_expires_at=NULL WHERE id=?", [uid])
    log_moderation(uid, "unban", nil, nil, nil, a)
    AdminAudit.log("gm_unban", a, target(socket))
    {:noreply, socket |> put_flash(:info, "Player unbanned.") |> load_player()}
  end

  # ── Timed Mute ─────────────────────────────────────────────────

  def handle_event("update_mute_duration", %{"value" => val}, socket), do: {:noreply, assign(socket, mute_duration: val)}

  def handle_event("mute", _params, socket) do
    uid = socket.assigns.user_id
    duration = socket.assigns.mute_duration
    a = actor(socket)
    {expires_at, duration_minutes} = parse_duration(duration)

    if expires_at do
      Repo.query("UPDATE users SET is_muted=1, mute_expires_at=? WHERE id=?", [expires_at, uid])
    else
      Repo.query("UPDATE users SET is_muted=1, mute_expires_at=NULL WHERE id=?", [uid])
    end

    log_moderation(uid, "mute", nil, duration_minutes, expires_at, a)
    AdminAudit.log("gm_mute", a, target(socket), %{duration: duration})
    {:noreply, socket |> put_flash(:info, "Player muted.") |> assign(mute_duration: "permanent") |> load_player()}
  end

  def handle_event("unmute", _params, socket) do
    uid = socket.assigns.user_id
    a = actor(socket)
    Repo.query("UPDATE users SET is_muted=0, mute_expires_at=NULL WHERE id=?", [uid])
    log_moderation(uid, "unmute", nil, nil, nil, a)
    AdminAudit.log("gm_unmute", a, target(socket))
    {:noreply, socket |> put_flash(:info, "Player unmuted.") |> load_player()}
  end

  # ── Freeze / Unfreeze ─────────────────────────────────────────

  def handle_event("freeze", _params, socket) do
    uid = socket.assigns.user_id
    a = actor(socket)
    Repo.query("UPDATE users SET is_frozen=1 WHERE id=?", [uid])
    for p <- PlayerRegistry.all(), p[:user_id] == uid do
      PlayerRegistry.update(p[:char_id], %{is_frozen: true})
    end
    log_moderation(uid, "freeze", nil, nil, nil, a)
    AdminAudit.log("gm_freeze", a, target(socket))
    {:noreply, socket |> put_flash(:info, "Player frozen.") |> load_player()}
  end

  def handle_event("unfreeze", _params, socket) do
    uid = socket.assigns.user_id
    a = actor(socket)
    Repo.query("UPDATE users SET is_frozen=0 WHERE id=?", [uid])
    for p <- PlayerRegistry.all(), p[:user_id] == uid do
      PlayerRegistry.update(p[:char_id], %{is_frozen: false})
    end
    log_moderation(uid, "unfreeze", nil, nil, nil, a)
    AdminAudit.log("gm_unfreeze", a, target(socket))
    {:noreply, socket |> put_flash(:info, "Player unfrozen.") |> load_player()}
  end

  # ── Force Kick ─────────────────────────────────────────────────

  def handle_event("kick", _params, socket) do
    uid = socket.assigns.user_id
    a = actor(socket)
    kicked = kick_player_from_game(uid)
    log_moderation(uid, "kick", nil, nil, nil, a)
    AdminAudit.log("gm_kick", a, target(socket))
    msg = if kicked > 0, do: "Kicked #{kicked} character(s).", else: "Player is not online."
    {:noreply, socket |> put_flash(:info, msg)}
  end

  # ── Broadcast Popup ────────────────────────────────────────────

  def handle_event("update_broadcast_msg", %{"value" => val}, socket), do: {:noreply, assign(socket, broadcast_message: val)}

  def handle_event("send_broadcast", _params, socket) do
    uid = socket.assigns.user_id
    msg = String.trim(socket.assigns.broadcast_message)
    if msg == "" do
      {:noreply, put_flash(socket, :error, "Message cannot be empty.")}
    else
      a = actor(socket)
      for p <- PlayerRegistry.all(), p[:user_id] == uid do
        TePhoenixWeb.Endpoint.broadcast!("user:#{p[:char_id]}", "admin_popup", %{
          message: msg, from: a.name, timestamp: DateTime.utc_now() |> DateTime.to_iso8601()
        })
      end
      AdminAudit.log("gm_broadcast_player", a, target(socket), msg)
      {:noreply, socket |> put_flash(:info, "Popup sent.") |> assign(broadcast_message: "")}
    end
  end

  # ── System Message ─────────────────────────────────────────────

  def handle_event("update_sys_msg", params, socket) do
    {:noreply, socket
      |> assign(:sys_msg_subject, params["subject"] || socket.assigns.sys_msg_subject)
      |> assign(:sys_msg_body, params["body"] || socket.assigns.sys_msg_body)}
  end

  def handle_event("send_system_message", _params, socket) do
    uid = socket.assigns.user_id
    a = actor(socket)
    subject = String.trim(socket.assigns.sys_msg_subject)
    body = String.trim(socket.assigns.sys_msg_body)

    if body == "" do
      {:noreply, put_flash(socket, :error, "Message body required.")}
    else
      subject = if subject == "", do: "Message from #{a.name}", else: subject
      Repo.query(
        "INSERT INTO system_messages (user_id, sender_name, sender_id, subject, body, message_type) VALUES (?, ?, ?, ?, ?, 'admin')",
        [uid, a.name, a.id, subject, body]
      )

      for p <- PlayerRegistry.all(), p[:user_id] == uid do
        TePhoenixWeb.Endpoint.broadcast!("user:#{p[:char_id]}", "system_message", %{subject: subject, body: body, from: a.name})
      end

      AdminAudit.log("gm_system_message", a, target(socket), %{subject: subject})
      {:noreply, socket |> put_flash(:info, "System message sent.") |> assign(sys_msg_subject: "", sys_msg_body: "")}
    end
  end

  def handle_event("give_gold", %{"amount" => amount}, socket) do
    amt = to_int(amount)
    if amt != 0 do
      Repo.query("UPDATE users SET currency=GREATEST(0, currency+?) WHERE id=?", [amt, socket.assigns.user_id])
      AdminAudit.log("gm_give_gold", actor(socket), target(socket), %{amount: amt})
      {:noreply, socket |> put_flash(:info, "#{if amt > 0, do: "+"}#{amt} gold applied.") |> load_player()}
    else
      {:noreply, put_flash(socket, :error, "Enter an amount.")}
    end
  end

  def handle_event("heal_char", %{"id" => char_id}, socket) do
    Repo.query("UPDATE characters SET current_hp=max_hp, current_mp=max_mp WHERE id=? AND user_id=?", [to_int(char_id), socket.assigns.user_id])
    AdminAudit.log("gm_heal", actor(socket), target(socket), "char ##{char_id}")
    {:noreply, socket |> put_flash(:info, "Character healed.") |> load_player()}
  end

  def handle_event("give_xp", %{"char_id" => char_id, "amount" => amount}, socket) do
    amt = to_int(amount)
    if amt > 0 do
      Repo.query("UPDATE characters SET experience=experience+? WHERE id=? AND user_id=?", [amt, to_int(char_id), socket.assigns.user_id])
      AdminAudit.log("gm_give_xp", actor(socket), target(socket), %{char_id: to_int(char_id), amount: amt})
      {:noreply, socket |> put_flash(:info, "+#{amt} XP granted.") |> load_player()}
    else
      {:noreply, socket}
    end
  end

  # ── Character editing ──────────────────────────────────────────

  @char_safe_fields ~w(name level experience current_hp max_hp current_mp max_mp atk def mo md speed luck map_id x y class_id race_id sprite_sheet_url sprite_frame_width sprite_frame_height sprite_walk_frames sprite_idle_frames profile_bio profile_color profile_banner_emoji equipped_title presence_status max_ap current_ap death_count secondary_class_id)

  @char_int_fields ~w(level experience current_hp max_hp current_mp max_mp atk def mo md speed luck map_id x y class_id race_id sprite_frame_width sprite_frame_height sprite_walk_frames sprite_idle_frames max_ap current_ap death_count secondary_class_id)

  def handle_event("edit_char_field", %{"char_id" => char_id, "field" => field}, socket) do
    char = Enum.find(socket.assigns.chars, & &1["id"] == to_int(char_id))
    value = if char, do: to_string(char[field] || ""), else: ""
    {:noreply, assign(socket, editing_char: to_int(char_id), char_edit_field: field, char_edit_value: value)}
  end

  def handle_event("cancel_char_edit", _params, socket) do
    {:noreply, assign(socket, editing_char: nil, char_edit_field: nil, char_edit_value: "")}
  end

  def handle_event("update_char_edit_value", %{"value" => value}, socket) do
    {:noreply, assign(socket, char_edit_value: value)}
  end

  def handle_event("save_char_field", %{"char_id" => char_id, "field" => field}, socket) do
    if field not in @char_safe_fields do
      {:noreply, put_flash(socket, :error, "Cannot edit that field.")}
    else
      value = socket.assigns.char_edit_value
      val = if field in @char_int_fields, do: to_int(value), else: value

      case Repo.query("UPDATE characters SET `#{field}`=? WHERE id=? AND user_id=?", [val, to_int(char_id), socket.assigns.user_id]) do
        {:ok, _} ->
          {:noreply, socket
            |> put_flash(:info, "Character #{field} updated.")
            |> assign(editing_char: nil, char_edit_field: nil, char_edit_value: "")
            |> load_player()}
        _ ->
          {:noreply, put_flash(socket, :error, "Failed to update.")}
      end
    end
  end

  def handle_event("save_char_dropdown", %{"char_id" => char_id, "field" => field, "value" => value}, socket) do
    if field not in @char_safe_fields do
      {:noreply, put_flash(socket, :error, "Cannot edit that field.")}
    else
      val = if field in @char_int_fields, do: to_int(value), else: value
      case Repo.query("UPDATE characters SET `#{field}`=? WHERE id=? AND user_id=?", [val, to_int(char_id), socket.assigns.user_id]) do
        {:ok, _} ->
          {:noreply, socket |> put_flash(:info, "Character #{field} updated.") |> load_player()}
        _ ->
          {:noreply, put_flash(socket, :error, "Failed to update.")}
      end
    end
  end

  # ── Character Delete ───────────────────────────────────────────

  def handle_event("delete_char", %{"id" => char_id}, socket) do
    cid = to_int(char_id)
    uid = socket.assigns.user_id
    a = actor(socket)

    # Get character name for audit
    char_name = case Repo.query("SELECT name FROM characters WHERE id=? AND user_id=?", [cid, uid]) do
      {:ok, %{rows: [[n]]}} -> n
      _ -> "Unknown"
    end

    # Kick from game if online
    if PlayerRegistry.online?(cid), do: PlayerRegistry.delete(cid)

    # Cascade delete
    Repo.query("DELETE FROM character_items WHERE character_id=?", [cid])
    Repo.query("DELETE FROM character_equipment WHERE character_id=?", [cid])
    Repo.query("DELETE FROM character_status_effects WHERE character_id=?", [cid])
    Repo.query("DELETE FROM characters WHERE id=? AND user_id=?", [cid, uid])

    AdminAudit.log("gm_delete_char", a, target(socket), %{char_id: cid, char_name: char_name})
    {:noreply, socket |> put_flash(:info, "Character '#{char_name}' deleted.") |> load_player()}
  end

  # ── Character Wipe (Reset to Level 1) ─────────────────────────

  def handle_event("wipe_char", %{"id" => char_id}, socket) do
    cid = to_int(char_id)
    uid = socket.assigns.user_id
    a = actor(socket)

    char_name = case Repo.query("SELECT name FROM characters WHERE id=? AND user_id=?", [cid, uid]) do
      {:ok, %{rows: [[n]]}} -> n
      _ -> "Unknown"
    end

    # Reset stats to level 1 defaults, clear inventory
    Repo.query("""
      UPDATE characters SET
        level=1, experience=0,
        current_hp=100, max_hp=100, current_mp=50, max_mp=50,
        atk=10, def=10, mo=10, md=10, speed=10, luck=5,
        current_ap=0, death_count=0, limitbreak=0, breaklevel=0,
        x=5, y=5
      WHERE id=? AND user_id=?
    """, [cid, uid])

    # Clear inventory
    Repo.query("DELETE FROM character_items WHERE character_id=?", [cid])
    Repo.query("DELETE FROM character_equipment WHERE character_id=?", [cid])
    Repo.query("DELETE FROM character_status_effects WHERE character_id=?", [cid])

    log_moderation(uid, "wipe", "Character '#{char_name}' wiped to level 1", nil, nil, a, %{char_id: cid})
    AdminAudit.log("gm_wipe_char", a, target(socket), %{char_id: cid, char_name: char_name})

    # Kick from game if online to force fresh state
    if PlayerRegistry.online?(cid), do: PlayerRegistry.delete(cid)

    {:noreply, socket |> put_flash(:info, "Character '#{char_name}' wiped to level 1.") |> load_player()}
  end

  # ── Character Clone ────────────────────────────────────────────

  def handle_event("clone_char", %{"id" => char_id}, socket) do
    cid = to_int(char_id)
    uid = socket.assigns.user_id
    a = actor(socket)

    case Repo.query("""
      SELECT name, race_id, class_id, gender, level, experience,
             max_hp, current_hp, max_mp, current_mp,
             atk, def, mo, md, speed, luck,
             map_id, x, y, sprite_sheet_url, sprite_frame_width, sprite_frame_height,
             sprite_walk_frames, sprite_idle_frames,
             profile_bio, profile_color, profile_banner_emoji, equipped_title, presence_status,
             max_ap, secondary_class_id
      FROM characters WHERE id=? AND user_id=?
    """, [cid, uid]) do
      {:ok, %{rows: [row], columns: cols}} ->
        data = Enum.zip(cols, row) |> Map.new()
        clone_name = "#{data["name"]} (Clone)"

        case Repo.query("""
          INSERT INTO characters (user_id, name, race_id, class_id, gender, level, experience,
            max_hp, current_hp, max_mp, current_mp,
            atk, def, mo, md, speed, luck,
            map_id, x, y, sprite_sheet_url, sprite_frame_width, sprite_frame_height,
            sprite_walk_frames, sprite_idle_frames,
            profile_bio, profile_color, profile_banner_emoji, equipped_title, presence_status,
            max_ap, secondary_class_id, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())
        """, [
          uid, clone_name, data["race_id"], data["class_id"], data["gender"],
          data["level"], data["experience"],
          data["max_hp"], data["current_hp"], data["max_mp"], data["current_mp"],
          data["atk"], data["def"], data["mo"], data["md"], data["speed"], data["luck"],
          data["map_id"], data["x"], data["y"],
          data["sprite_sheet_url"], data["sprite_frame_width"], data["sprite_frame_height"],
          data["sprite_walk_frames"], data["sprite_idle_frames"],
          data["profile_bio"], data["profile_color"], data["profile_banner_emoji"],
          data["equipped_title"], data["presence_status"],
          data["max_ap"], data["secondary_class_id"]
        ]) do
          {:ok, result} ->
            new_id = result.last_insert_id

            # Clone inventory
            case Repo.query("SELECT item_id, quantity FROM character_items WHERE character_id=?", [cid]) do
              {:ok, %{rows: items}} ->
                for [item_id, qty] <- items do
                  Repo.query("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?, ?, ?)", [new_id, item_id, qty])
                end
              _ -> :ok
            end

            AdminAudit.log("gm_clone_char", a, target(socket), %{source_id: cid, clone_id: new_id, name: clone_name})
            {:noreply, socket |> put_flash(:info, "Character cloned as '#{clone_name}'.") |> load_player()}
          _ ->
            {:noreply, put_flash(socket, :error, "Clone failed.")}
        end
      _ ->
        {:noreply, put_flash(socket, :error, "Character not found.")}
    end
  end

  # ── Teleport ───────────────────────────────────────────────────

  def handle_event("show_teleport", %{"id" => char_id}, socket) do
    {:noreply, assign(socket, teleport_char: to_int(char_id), teleport_map: nil, teleport_x: "5", teleport_y: "5")}
  end

  def handle_event("cancel_teleport", _params, socket) do
    {:noreply, assign(socket, teleport_char: nil)}
  end

  def handle_event("update_teleport", params, socket) do
    {:noreply, socket
      |> assign(:teleport_map, params["map_id"] || socket.assigns.teleport_map)
      |> assign(:teleport_x, params["x"] || socket.assigns.teleport_x)
      |> assign(:teleport_y, params["y"] || socket.assigns.teleport_y)}
  end

  def handle_event("do_teleport", _params, socket) do
    cid = socket.assigns.teleport_char
    map_id = to_int(socket.assigns.teleport_map)
    x = to_int(socket.assigns.teleport_x)
    y = to_int(socket.assigns.teleport_y)
    uid = socket.assigns.user_id
    a = actor(socket)

    if map_id <= 0 do
      {:noreply, put_flash(socket, :error, "Select a map.")}
    else
      # Update DB
      Repo.query("UPDATE characters SET map_id=?, x=?, y=? WHERE id=? AND user_id=?", [map_id, x, y, cid, uid])

      # If online, update registry and broadcast position change
      if PlayerRegistry.online?(cid) do
        old = PlayerRegistry.get(cid)
        old_map = old[:map_id]
        PlayerRegistry.update(cid, %{map_id: map_id, x: x, y: y})

        # Notify old map of departure
        if old_map && old_map != map_id do
          TePhoenixWeb.Endpoint.broadcast!("map:#{old_map}", "player_left", %{char_id: cid})
        end
        # Notify new map of arrival
        TePhoenixWeb.Endpoint.broadcast!("map:#{map_id}", "player_entered", %{char_id: cid, x: x, y: y})
        # Tell the player's client to change map
        TePhoenixWeb.Endpoint.broadcast!("user:#{cid}", "teleport", %{map_id: map_id, x: x, y: y})
      end

      map_name = case Repo.query("SELECT name FROM game_maps WHERE id=?", [map_id]) do
        {:ok, %{rows: [[n]]}} -> n
        _ -> "Map ##{map_id}"
      end

      AdminAudit.log("gm_teleport", a, target(socket), %{char_id: cid, map: map_name, x: x, y: y})
      {:noreply, socket |> put_flash(:info, "Teleported to #{map_name} (#{x},#{y}).") |> assign(teleport_char: nil) |> load_player()}
    end
  end

  # ── Gift Package ───────────────────────────────────────────────

  def handle_event("show_gift", %{"id" => char_id}, socket) do
    {:noreply, assign(socket, gift_char: to_int(char_id), gift_gold: "0", gift_xp: "0", gift_item_search: "", gift_items: [], gift_selected_items: [], gift_message: "")}
  end

  def handle_event("cancel_gift", _params, socket) do
    {:noreply, assign(socket, gift_char: nil)}
  end

  def handle_event("update_gift", params, socket) do
    {:noreply, socket
      |> assign(:gift_gold, params["gold"] || socket.assigns.gift_gold)
      |> assign(:gift_xp, params["xp"] || socket.assigns.gift_xp)
      |> assign(:gift_message, params["message"] || socket.assigns.gift_message)}
  end

  def handle_event("gift_item_search", %{"value" => q}, socket) do
    items = if String.length(q) >= 2 do
      case Repo.query("SELECT id, name, icon, rarity FROM game_items WHERE name LIKE ? ORDER BY name LIMIT 15", ["%#{q}%"]) do
        {:ok, %{rows: rows}} -> Enum.map(rows, fn [id, n, ic, r] -> %{id: id, name: n, icon: ic || "?", rarity: r} end)
        _ -> []
      end
    else
      []
    end
    {:noreply, assign(socket, gift_item_search: q, gift_items: items)}
  end

  def handle_event("gift_add_item", %{"item-id" => item_id, "item-name" => name}, socket) do
    iid = to_int(item_id)
    existing = socket.assigns.gift_selected_items
    # Stack if already added
    updated = case Enum.find_index(existing, fn i -> i.id == iid end) do
      nil -> existing ++ [%{id: iid, name: name, qty: 1}]
      idx -> List.update_at(existing, idx, fn i -> %{i | qty: i.qty + 1} end)
    end
    {:noreply, assign(socket, gift_selected_items: updated, gift_item_search: "", gift_items: [])}
  end

  def handle_event("gift_remove_item", %{"idx" => idx}, socket) do
    {:noreply, assign(socket, gift_selected_items: List.delete_at(socket.assigns.gift_selected_items, to_int(idx)))}
  end

  def handle_event("send_gift", _params, socket) do
    cid = socket.assigns.gift_char
    uid = socket.assigns.user_id
    a = actor(socket)
    gold = to_int(socket.assigns.gift_gold)
    xp = to_int(socket.assigns.gift_xp)
    items = socket.assigns.gift_selected_items
    message = String.trim(socket.assigns.gift_message)

    if gold == 0 && xp == 0 && items == [] do
      {:noreply, put_flash(socket, :error, "Gift package is empty.")}
    else
      # Apply gold to user
      if gold != 0, do: Repo.query("UPDATE users SET currency=GREATEST(0, currency+?) WHERE id=?", [gold, uid])
      # Apply XP to character
      if xp > 0, do: Repo.query("UPDATE characters SET experience=experience+? WHERE id=?", [xp, cid])
      # Give items
      for item <- items do
        case Repo.query("SELECT id FROM character_items WHERE character_id=? AND item_id=?", [cid, item.id]) do
          {:ok, %{rows: [[existing_id]]}} ->
            Repo.query("UPDATE character_items SET quantity=quantity+? WHERE id=?", [item.qty, existing_id])
          _ ->
            Repo.query("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?, ?, ?)", [cid, item.id, item.qty])
        end
      end

      # Log gift package
      items_json = Jason.encode!(Enum.map(items, fn i -> %{id: i.id, name: i.name, qty: i.qty} end))
      Repo.query(
        "INSERT INTO gift_packages (character_id, sent_by_id, sent_by_name, gold_amount, xp_amount, items_json, message) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [cid, a.id, a.name, gold, xp, items_json, message]
      )

      # Send system message if there's a gift message
      if message != "" do
        summary = Enum.join(
          [if(gold > 0, do: "+#{gold} gold"), if(xp > 0, do: "+#{xp} XP")] ++
          Enum.map(items, fn i -> "#{i.qty}x #{i.name}" end)
          |> Enum.reject(&is_nil/1),
          ", "
        )
        Repo.query(
          "INSERT INTO system_messages (user_id, sender_name, sender_id, subject, body, message_type) VALUES (?, ?, ?, ?, ?, 'gift')",
          [uid, a.name, a.id, "Gift Package", "#{message}\n\nContents: #{summary}"]
        )
      end

      AdminAudit.log("gm_gift_package", a, target(socket), %{char_id: cid, gold: gold, xp: xp, items: length(items)})
      {:noreply, socket |> put_flash(:info, "Gift package delivered!") |> assign(gift_char: nil) |> load_player()}
    end
  end

  # ── Inventory viewer ───────────────────────────────────────────

  def handle_event("toggle_inventory", %{"char-id" => char_id}, socket) do
    cid = to_int(char_id)
    if socket.assigns.inventory_open == cid do
      {:noreply, assign(socket, inventory_open: nil, inventory_items: [], inv_search: "")}
    else
      items = load_inventory(cid)
      all_items = if socket.assigns.all_items == [] do
        case Repo.query("SELECT id, name, icon, type, rarity FROM game_items ORDER BY name") do
          {:ok, %{rows: r}} -> Enum.map(r, fn [id, n, ic, t, ra] -> %{id: id, name: n, icon: ic, type: t, rarity: ra} end)
          _ -> []
        end
      else
        socket.assigns.all_items
      end
      {:noreply, assign(socket, inventory_open: cid, inventory_items: items, inv_search: "", all_items: all_items)}
    end
  end

  def handle_event("inv_search_change", %{"value" => q}, socket) do
    {:noreply, assign(socket, inv_search: q)}
  end

  def handle_event("inv_give_item", %{"char-id" => char_id, "item-id" => item_id}, socket) do
    cid = to_int(char_id)
    iid = to_int(item_id)
    if cid > 0 and iid > 0 do
      case Repo.query("SELECT id FROM character_items WHERE character_id=? AND item_id=?", [cid, iid]) do
        {:ok, %{rows: [[existing_id]]}} ->
          Repo.query("UPDATE character_items SET quantity=quantity+1 WHERE id=?", [existing_id])
        _ ->
          Repo.query("INSERT INTO character_items (character_id, item_id, quantity) VALUES (?, ?, 1)", [cid, iid])
      end
      items = load_inventory(cid)
      {:noreply, assign(socket, inventory_items: items, inv_search: "") |> put_flash(:info, "Item given.") |> reload_counts()}
    else
      {:noreply, socket}
    end
  end

  def handle_event("inv_remove_item", %{"ci-id" => ci_id, "char-id" => char_id}, socket) do
    Repo.query("DELETE FROM character_items WHERE id=?", [to_int(ci_id)])
    items = load_inventory(to_int(char_id))
    {:noreply, assign(socket, inventory_items: items) |> put_flash(:info, "Item removed.") |> reload_counts()}
  end

  def handle_event("inv_update_qty", %{"ci-id" => ci_id, "char-id" => char_id, "value" => value}, socket) do
    qty = to_int(value)
    if qty <= 0 do
      Repo.query("DELETE FROM character_items WHERE id=?", [to_int(ci_id)])
    else
      Repo.query("UPDATE character_items SET quantity=? WHERE id=?", [qty, to_int(ci_id)])
    end
    items = load_inventory(to_int(char_id))
    {:noreply, assign(socket, inventory_items: items) |> reload_counts()}
  end

  # ── Player Notes ───────────────────────────────────────────────

  def handle_event("add_player_note", %{"body" => body}, socket) do
    body = String.trim(body)
    if body == "" do
      {:noreply, put_flash(socket, :error, "Note cannot be empty.")}
    else
      a = actor(socket)
      Repo.query(
        "INSERT INTO player_notes (user_id, author_id, author_name, body) VALUES (?, ?, ?, ?)",
        [socket.assigns.user_id, a.id, a.name, body]
      )
      {:noreply, assign(socket, note_input: "") |> put_flash(:info, "Note added.") |> load_player()}
    end
  end

  def handle_event("delete_player_note", %{"id" => id}, socket) do
    Repo.query("DELETE FROM player_notes WHERE id=?", [to_int(id)])
    {:noreply, socket |> put_flash(:info, "Note deleted.") |> load_player()}
  end

  def handle_event("update_note_input", %{"body" => body}, socket) do
    {:noreply, assign(socket, note_input: body)}
  end

  # ── Name style handlers ───────────────────────────────────────

  def handle_event("custom_gradient_colors", params, socket) do
    {:noreply, socket
      |> assign(:custom_color_1, params["c1"] || socket.assigns.custom_color_1)
      |> assign(:custom_color_2, params["c2"] || socket.assigns.custom_color_2)
      |> assign(:custom_color_3, params["c3"] || socket.assigns.custom_color_3)}
  end

  def handle_event("apply_custom_gradient", %{"user_id" => user_id}, socket) do
    c1 = socket.assigns.custom_color_1
    c2 = socket.assigns.custom_color_2
    c3 = socket.assigns.custom_color_3
    gradient = "gradient:linear-gradient(90deg,#{c1},#{c2},#{c3})"
    Repo.query("UPDATE users SET chat_color=? WHERE id=?", [gradient, to_int(user_id)])
    {:noreply, socket |> put_flash(:info, "Custom gradient applied!") |> load_player()}
  end

  def handle_event("set_chat_color", %{"color" => color, "user_id" => user_id}, socket) do
    val = if color == "", do: nil, else: color
    Repo.query("UPDATE users SET chat_color=? WHERE id=?", [val, to_int(user_id)])
    {:noreply, socket |> put_flash(:info, if(val, do: "Name color updated.", else: "Reset to default effect.")) |> load_player()}
  end

  # ── Data helpers ───────────────────────────────────────────────

  defp load_inventory(character_id) do
    case Repo.query("""
      SELECT ci.id, ci.item_id, ci.quantity,
             gi.name, gi.icon, gi.type, gi.rarity, gi.value, gi.slot, gi.level_req
      FROM character_items ci
      LEFT JOIN game_items gi ON gi.id = ci.item_id
      WHERE ci.character_id=?
      ORDER BY gi.type, gi.name
    """, [character_id]) do
      {:ok, %{rows: r}} ->
        Enum.map(r, fn [id, item_id, qty, name, icon, type, rarity, value, slot, lvl] ->
          %{id: id, item_id: item_id, quantity: qty, name: name || "???", icon: icon || "?",
            type: type, rarity: rarity, value: value, slot: slot, level_req: lvl}
        end)
      _ -> []
    end
  end

  defp reload_counts(socket) do
    user_id = socket.assigns.user_id
    counts = case Repo.query("""
      SELECT ci.character_id, COUNT(*) as cnt
      FROM character_items ci
      WHERE ci.character_id IN (SELECT id FROM characters WHERE user_id=?)
      GROUP BY ci.character_id
    """, [user_id]) do
      {:ok, %{rows: rows}} -> Map.new(rows, fn [cid, cnt] -> {cid, cnt} end)
      _ -> %{}
    end
    assign(socket, inventory_counts: counts)
  end

  # ── Render ─────────────────────────────────────────────────────

  @impl true
  def render(assigns) do
    ~H"""
    <div>
      <a href={~p"/sauce/players"} class="text-xs text-zinc-500 hover:text-amber-400 mb-4 inline-block">&lt; Back to Players</a>

      <%= if @player do %>
        <!-- Header -->
        <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 class="text-2xl font-bold"><.styled_name name={@player["username"]} role={@player["role"] || "PLAYER"} chat_color={@player["chat_color"]} class="text-2xl font-bold" /></h2>
            <p class="text-xs text-zinc-500 mt-0.5">User #{@player["id"]} -- Joined {format_date(@player["created_at"])}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class={["px-2.5 py-1 rounded text-xs font-bold uppercase", role_color(@player["role"])]}>{@player["role"] || "PLAYER"}</span>
            <span :if={@player["is_banned"] == 1} class="px-2.5 py-1 rounded text-xs font-bold bg-red-900/50 text-red-400">BANNED</span>
            <span :if={@player["is_muted"] == 1} class="px-2.5 py-1 rounded text-xs font-bold bg-orange-900/50 text-orange-400">MUTED</span>
            <span :if={@player["is_frozen"] == 1} class="px-2.5 py-1 rounded text-xs font-bold bg-cyan-900/50 text-cyan-400">FROZEN</span>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Left: Account Info + Characters -->
          <div class="lg:col-span-2 space-y-6">
            <!-- Account Details -->
            <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4">Account Details</h3>
              <div class="grid grid-cols-2 gap-4">
                <.editable_field field="username" label="Username" value={@player["username"]} editing={@editing} edit_value={@edit_value} />
                <.editable_field field="email" label="Email" value={@player["email"]} editing={@editing} edit_value={@edit_value} />
                <!-- Name Style -->
                <div class="col-span-2 border-t border-zinc-800 pt-4">
                  <span class="text-[10px] text-zinc-500 uppercase tracking-wider block mb-2">Name Style</span>
                  <div class="flex items-center gap-3 mb-3 p-2 bg-zinc-800/50 rounded-lg">
                    <span class="text-[10px] text-zinc-600">Preview:</span>
                    <.styled_name name={@player["username"]} role={@player["role"]} chat_color={@player["chat_color"]} class="text-lg font-bold" />
                  </div>
                  <div class="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5">Solid Colors</div>
                  <div class="flex flex-wrap gap-1.5 mb-3">
                    <button phx-click="set_chat_color" phx-value-color="" phx-value-user_id={@player["id"]}
                      title="Default (role effect)"
                      class={"w-7 h-7 rounded-full border-2 flex items-center justify-center text-[9px] #{if is_nil(@player["chat_color"]) || @player["chat_color"] == "", do: "border-amber-400", else: "border-zinc-700 hover:border-zinc-500"} bg-zinc-800"}>*</button>
                    <button :for={c <- ~w(#f87171 #fb923c #facc15 #4ade80 #2dd4bf #60a5fa #a78bfa #f472b6 #e2e8f0 #ff6b6b #ffd93d #6bcb77 #4d96ff #ff6fff #00d2ff #94a3b8 #c084fc #f97316)}
                      phx-click="set_chat_color" phx-value-color={c} phx-value-user_id={@player["id"]}
                      class={"w-7 h-7 rounded-full border-2 transition-colors #{if @player["chat_color"] == c, do: "border-white scale-110", else: "border-transparent hover:border-zinc-500"}"}
                      style={"background: #{c}"}></button>
                  </div>
                  <div class="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5">Gradients</div>
                  <div class="flex flex-wrap gap-1.5 mb-3">
                    <button :for={{emoji, gradient} <- [
                      {"~", "gradient:linear-gradient(90deg,#60a5fa,#2dd4bf,#4ade80)"},
                      {"!", "gradient:linear-gradient(90deg,#f87171,#fb923c,#facc15)"},
                      {"@", "gradient:linear-gradient(90deg,#a78bfa,#f472b6,#fb923c)"},
                      {"#", "gradient:linear-gradient(90deg,#4ade80,#1a1a1a,#2dd4bf)"},
                      {"$", "gradient:linear-gradient(90deg,#60a5fa,#e2e8f0,#a78bfa)"},
                      {"%", "gradient:linear-gradient(90deg,#f87171,#1a1a1a,#f87171)"},
                      {"^", "gradient:linear-gradient(90deg,#f97316,#facc15,#fb923c)"},
                      {"&", "gradient:linear-gradient(90deg,#1a1a1a,#6b21a8,#1a1a1a)"},
                      {"*", "gradient:linear-gradient(90deg,#f87171,#facc15,#4ade80,#60a5fa,#a78bfa)"},
                      {"+", "gradient:linear-gradient(90deg,#facc15,#60a5fa,#facc15)"}
                    ]}
                      phx-click="set_chat_color" phx-value-color={gradient} phx-value-user_id={@player["id"]}
                      class={"w-7 h-7 rounded-full border-2 text-center text-sm leading-7 transition-colors #{if @player["chat_color"] == gradient, do: "border-white scale-110 bg-zinc-700", else: "border-zinc-700 hover:border-zinc-500 bg-zinc-800"}"}>{emoji}</button>
                  </div>
                  <div class="text-[9px] text-zinc-600 uppercase tracking-wider mb-1">Custom</div>
                  <div class="flex gap-1.5 items-center">
                    <form phx-change="custom_gradient_colors" class="flex gap-1.5 items-center">
                      <input type="color" value={@custom_color_1} name="c1" class="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0" />
                      <input type="color" value={@custom_color_2} name="c2" class="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0" />
                      <input type="color" value={@custom_color_3} name="c3" class="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0" />
                    </form>
                    <div class="w-16 h-5 rounded" style={"background: linear-gradient(90deg,#{@custom_color_1},#{@custom_color_2},#{@custom_color_3})"}></div>
                    <button phx-click="apply_custom_gradient" phx-value-user_id={@player["id"]}
                      class="px-2 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded text-[9px]">Apply</button>
                  </div>
                </div>
                <.editable_field field="max_characters" label="Max Characters" value={@player["max_characters"]} editing={@editing} edit_value={@edit_value} />
                <div>
                  <span class="text-[10px] text-zinc-500 uppercase tracking-wider">Last Login</span>
                  <div class="text-sm text-zinc-300 mt-0.5">{format_date(@player["last_login"])}</div>
                </div>
                <div>
                  <span class="text-[10px] text-zinc-500 uppercase tracking-wider">Login Streak</span>
                  <div class="text-sm text-zinc-300 mt-0.5">{@player["login_streak"] || 0} days</div>
                </div>
                <div>
                  <span class="text-[10px] text-zinc-500 uppercase tracking-wider">Email Verified</span>
                  <div class="text-sm mt-0.5">
                    <span :if={@player["email_verified"] == 1} class="text-green-400">Yes</span>
                    <span :if={@player["email_verified"] != 1} class="text-red-400">No</span>
                  </div>
                </div>
                <div>
                  <span class="text-[10px] text-zinc-500 uppercase tracking-wider">Invite Code</span>
                  <div class="text-sm text-zinc-300 mt-0.5 font-mono">{@player["invite_code"] || "--"}</div>
                </div>
              </div>
            </div>

            <!-- Characters -->
            <div :for={char <- @chars} class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <!-- Header -->
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-3">
                  <div class="w-12 h-12 bg-zinc-800 rounded-lg border border-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
                    <img :if={char["sprite_sheet_url"] && char["sprite_sheet_url"] != ""}
                      src={char["sprite_sheet_url"]} class="w-8 h-8 object-contain" style="image-rendering: pixelated" />
                    <span :if={!char["sprite_sheet_url"] || char["sprite_sheet_url"] == ""} class="text-2xl">X</span>
                  </div>
                  <div>
                    <.char_editable char_id={char["id"]} field="name" value={char["name"]} editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} class="text-lg font-bold text-zinc-200" />
                    <div class="text-xs text-zinc-500">
                      <span :if={@use_classes}>{char["class_name"]}</span>
                      <span :if={@use_classes && @use_races}> -- </span>
                      <span :if={@use_races}>{char["race_name"]}</span>
                      <span :if={@use_classes || @use_races}> -- </span>
                      ID #{char["id"]}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <.char_editable char_id={char["id"]} field="level" value={char["level"]} editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} class="text-amber-400 font-mono font-bold text-lg" prefix="Lv." />
                </div>
              </div>

              <!-- Class / Race / Map dropdowns -->
              <div class={["grid gap-3 mb-4", if(@use_classes && @use_races, do: "grid-cols-3", else: if(@use_classes || @use_races, do: "grid-cols-2", else: "grid-cols-1"))]}>
                <div :if={@use_classes}>
                  <span class="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Class</span>
                  <select phx-change="save_char_dropdown" phx-value-char_id={char["id"]} phx-value-field="class_id" name="value"
                    class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300">
                    <option :for={c <- @classes} value={c["id"]} selected={c["id"] == char["class_id"]}>{c["name"]}</option>
                  </select>
                </div>
                <div :if={@use_races}>
                  <span class="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Race</span>
                  <select phx-change="save_char_dropdown" phx-value-char_id={char["id"]} phx-value-field="race_id" name="value"
                    class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300">
                    <option :for={r <- @races} value={r["id"]} selected={r["id"] == char["race_id"]}>{r["name"]}</option>
                  </select>
                </div>
                <div>
                  <span class="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Map</span>
                  <select phx-change="save_char_dropdown" phx-value-char_id={char["id"]} phx-value-field="map_id" name="value"
                    class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300">
                    <option :for={m <- @maps_list} value={m["id"]} selected={m["id"] == char["map_id"]}>{m["name"]}</option>
                  </select>
                </div>
              </div>

              <!-- Stats -->
              <div class="mb-4">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-[10px] text-zinc-600 uppercase tracking-wider">{stat_mode_label(@stat_mode)}</span>
                </div>
                <div :if={@stat_mode == "single"} class="flex items-center gap-6">
                  <div class="bg-zinc-800 rounded-lg px-8 py-4 text-center border border-zinc-700">
                    <div class="text-[10px] text-amber-400/60 uppercase tracking-wider mb-1">{@primary_stat_name}</div>
                    <.editable_mini_stat char_id={char["id"]} field="atk" label="" value={char["atk"]} color="text-amber-400 text-3xl" editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} />
                  </div>
                  <div :if={@use_hp_mp} class="grid grid-cols-2 gap-3">
                    <.editable_stat char_id={char["id"]} field="current_hp" label="HP" value={char["current_hp"]} max={char["max_hp"]} color="text-green-400" editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} />
                    <.editable_stat char_id={char["id"]} field="current_mp" label="MP" value={char["current_mp"]} max={char["max_mp"]} color="text-blue-400" editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} />
                  </div>
                </div>
                <div :if={@stat_mode != "single"} class="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  <.editable_stat :if={@use_hp_mp} char_id={char["id"]} field="current_hp" label="HP" value={char["current_hp"]} max={char["max_hp"]} color="text-green-400" editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} />
                  <.editable_stat :if={@use_hp_mp} char_id={char["id"]} field="current_mp" label="MP" value={char["current_mp"]} max={char["max_mp"]} color="text-blue-400" editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} />
                  <.editable_mini_stat
                    :for={s <- stat_definitions(@stat_mode)}
                    char_id={char["id"]} field={s.field} label={s.label} value={char[s.field]} color={s.color}
                    editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} />
                </div>
              </div>

              <!-- Location + XP -->
              <div class="flex items-center gap-4 text-xs text-zinc-500 mb-4 flex-wrap">
                <span>@ {char["map_name"] || "Map #{char["map_id"]}"} ({char["x"]},{char["y"]})</span>
                <span>XP: {char["experience"]}</span>
                <span>Deaths: {char["death_count"] || 0}</span>
                <button phx-click="toggle_inventory" phx-value-char-id={char["id"]}
                  class={["hover:text-amber-400 transition-colors cursor-pointer", @inventory_open == char["id"] && "text-amber-400"]}>
                  {if @inventory_open == char["id"], do: "v", else: ">"} Items: {Map.get(@inventory_counts, char["id"], 0)}
                </button>
              </div>

              <!-- Inventory Viewer (unchanged from original - full featured) -->
              <div :if={@inventory_open == char["id"]} class="border border-amber-800/30 bg-zinc-950/50 rounded-lg p-4 mb-4">
                <div class="flex items-center justify-between mb-3">
                  <h4 class="text-xs font-bold uppercase tracking-wider text-amber-400">Inventory</h4>
                  <input type="text" placeholder="Give item..." value={@inv_search} phx-keyup="inv_search_change"
                    class="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 w-48" />
                </div>
                <div :if={@inv_search != "" && String.length(@inv_search) >= 2} class="mb-3 bg-zinc-900 border border-zinc-700 rounded p-2 max-h-40 overflow-y-auto">
                  <div class="text-[10px] text-zinc-500 mb-1">Click to give item:</div>
                  <%= for item <- Enum.filter(@all_items, fn i -> String.contains?(String.downcase(i.name), String.downcase(@inv_search)) end) |> Enum.take(10) do %>
                    <button phx-click="inv_give_item" phx-value-char-id={char["id"]} phx-value-item-id={item.id}
                      class="block w-full text-left px-2 py-1.5 text-xs text-zinc-300 hover:bg-amber-900/30 hover:text-amber-300 rounded transition-colors">
                      <span class="mr-1">{item.icon}</span> <span>{item.name}</span>
                      <span class={"ml-2 text-[10px] #{rarity_color(item.rarity)}"}>{item.rarity}</span>
                      <span :if={item.type} class="ml-1 text-[10px] text-zinc-600">{item.type}</span>
                    </button>
                  <% end %>
                  <div :if={Enum.filter(@all_items, fn i -> String.contains?(String.downcase(i.name), String.downcase(@inv_search)) end) == []}
                    class="text-xs text-zinc-600 italic py-1">No matching items</div>
                </div>
                <div :if={@inventory_items != []} class="space-y-1">
                  <div class="grid grid-cols-[auto_2fr_1fr_1fr_1fr_auto] gap-2 text-[10px] text-zinc-500 uppercase px-2 mb-1">
                    <span></span><span>Item</span><span>Type</span><span>Value</span><span>Qty</span><span></span>
                  </div>
                  <%= for inv <- @inventory_items do %>
                  <div class="grid grid-cols-[auto_2fr_1fr_1fr_1fr_auto] gap-2 items-center px-2 py-1.5 rounded hover:bg-zinc-800/50 group">
                    <span class="text-base">{inv.icon}</span>
                    <div>
                      <span class={"text-xs font-medium #{rarity_color(inv.rarity)}"}>{inv.name}</span>
                      <span :if={inv.slot && inv.slot != ""} class="ml-1 text-[10px] text-zinc-600">[{inv.slot}]</span>
                      <span :if={inv.level_req && inv.level_req > 0} class="ml-1 text-[10px] text-zinc-600">Lv.{inv.level_req}</span>
                    </div>
                    <span class="text-xs text-zinc-500">{inv.type}</span>
                    <span class="text-xs text-amber-500/70">{inv.value}g</span>
                    <input type="number" value={inv.quantity} min="0"
                      phx-blur="inv_update_qty" phx-value-ci-id={inv.id} phx-value-char-id={char["id"]}
                      class="w-14 px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 text-center" />
                    <button phx-click="inv_remove_item" phx-value-ci-id={inv.id} phx-value-char-id={char["id"]}
                      data-confirm="Remove this item?" class="text-red-500 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">x</button>
                  </div>
                  <% end %>
                  <div class="flex gap-4 pt-2 mt-2 border-t border-zinc-800 text-[10px] text-zinc-500">
                    <span>{length(@inventory_items)} unique items</span>
                    <span>{Enum.reduce(@inventory_items, 0, fn i, acc -> acc + (i.quantity || 0) end)} total stacked</span>
                    <span class="text-amber-500/70">{Enum.reduce(@inventory_items, 0, fn i, acc -> acc + (i.value || 0) * (i.quantity || 0) end)}g total value</span>
                  </div>
                </div>
                <div :if={@inventory_items == []} class="text-xs text-zinc-600 italic py-2 text-center">Empty inventory</div>
              </div>

              <!-- Sprite Settings -->
              <div class="border-t border-zinc-800 pt-4 mb-4">
                <h4 class="text-[10px] text-zinc-500 uppercase tracking-wider mb-3">Sprite Settings</h4>
                <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div class="col-span-2 sm:col-span-5">
                    <.char_editable char_id={char["id"]} field="sprite_sheet_url" value={char["sprite_sheet_url"]} editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} class="text-xs text-zinc-400 font-mono" placeholder="Sprite sheet URL..." />
                  </div>
                  <.char_editable char_id={char["id"]} field="sprite_frame_width" value={char["sprite_frame_width"]} editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} class="text-xs text-zinc-400" label="Width" />
                  <.char_editable char_id={char["id"]} field="sprite_frame_height" value={char["sprite_frame_height"]} editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} class="text-xs text-zinc-400" label="Height" />
                  <.char_editable char_id={char["id"]} field="sprite_walk_frames" value={char["sprite_walk_frames"]} editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} class="text-xs text-zinc-400" label="Walk Frames" />
                  <.char_editable char_id={char["id"]} field="sprite_idle_frames" value={char["sprite_idle_frames"]} editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} class="text-xs text-zinc-400" label="Idle Frames" />
                </div>
              </div>

              <!-- Profile Settings -->
              <div class="border-t border-zinc-800 pt-4 mb-4">
                <h4 class="text-[10px] text-zinc-500 uppercase tracking-wider mb-3">Profile</h4>
                <div class="grid grid-cols-2 gap-3">
                  <.char_editable char_id={char["id"]} field="equipped_title" value={char["equipped_title"]} editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} class="text-xs text-zinc-400" label="Title" />
                  <.char_editable char_id={char["id"]} field="profile_color" value={char["profile_color"]} editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} class="text-xs text-zinc-400" label="Color" />
                  <.char_editable char_id={char["id"]} field="profile_banner_emoji" value={char["profile_banner_emoji"]} editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} class="text-xs text-zinc-400" label="Banner Emoji" />
                  <.char_editable char_id={char["id"]} field="presence_status" value={char["presence_status"]} editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} class="text-xs text-zinc-400" label="Status" />
                </div>
              </div>

              <!-- Character Actions -->
              <div class="flex gap-2 flex-wrap border-t border-zinc-800 pt-4">
                <button phx-click="heal_char" phx-value-id={char["id"]}
                  class="px-2.5 py-1.5 bg-green-900/50 text-green-400 border border-green-800 rounded text-xs hover:bg-green-800/50">Heal</button>
                <form phx-submit="give_xp" class="flex gap-1">
                  <input type="hidden" name="char_id" value={char["id"]} />
                  <input type="number" name="amount" value="100" min="1"
                    class="w-20 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300" />
                  <button type="submit" class="px-2.5 py-1.5 bg-blue-900/50 text-blue-400 border border-blue-800 rounded text-xs hover:bg-blue-800/50">+XP</button>
                </form>
                <button phx-click="show_teleport" phx-value-id={char["id"]}
                  class="px-2.5 py-1.5 bg-indigo-900/50 text-indigo-400 border border-indigo-800 rounded text-xs hover:bg-indigo-800/50">Teleport</button>
                <button phx-click="show_gift" phx-value-id={char["id"]}
                  class="px-2.5 py-1.5 bg-amber-900/50 text-amber-400 border border-amber-800 rounded text-xs hover:bg-amber-800/50">Gift Package</button>
                <button phx-click="clone_char" phx-value-id={char["id"]} data-confirm="Clone this character?"
                  class="px-2.5 py-1.5 bg-purple-900/50 text-purple-400 border border-purple-800 rounded text-xs hover:bg-purple-800/50">Clone</button>
                <button phx-click="wipe_char" phx-value-id={char["id"]} data-confirm="WIPE this character to level 1? All items, equipment, and progress will be lost."
                  class="px-2.5 py-1.5 bg-orange-900/50 text-orange-400 border border-orange-800 rounded text-xs hover:bg-orange-800/50">Wipe</button>
                <button phx-click="delete_char" phx-value-id={char["id"]} data-confirm="PERMANENTLY DELETE this character? This cannot be undone."
                  class="px-2.5 py-1.5 bg-red-900/50 text-red-400 border border-red-800 rounded text-xs hover:bg-red-800/50">Delete</button>
              </div>

              <!-- Teleport Panel -->
              <div :if={@teleport_char == char["id"]} class="mt-4 p-4 bg-indigo-900/10 border border-indigo-800/30 rounded-lg">
                <h4 class="text-xs font-bold text-indigo-400 mb-3">Teleport Character</h4>
                <form phx-change="update_teleport" class="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <span class="text-[10px] text-zinc-500 block mb-1">Map</span>
                    <select name="map_id" class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300">
                      <option value="">Select map...</option>
                      <option :for={m <- @maps_list} value={m["id"]} selected={to_string(m["id"]) == to_string(@teleport_map)}>{m["name"]}</option>
                    </select>
                  </div>
                  <div>
                    <span class="text-[10px] text-zinc-500 block mb-1">X</span>
                    <input type="number" name="x" value={@teleport_x} min="0"
                      class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300" />
                  </div>
                  <div>
                    <span class="text-[10px] text-zinc-500 block mb-1">Y</span>
                    <input type="number" name="y" value={@teleport_y} min="0"
                      class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300" />
                  </div>
                </form>
                <div class="flex gap-2">
                  <button phx-click="do_teleport" class="px-3 py-1.5 bg-indigo-700 text-white rounded text-xs hover:bg-indigo-600">Teleport</button>
                  <button phx-click="cancel_teleport" class="px-3 py-1.5 bg-zinc-700 text-zinc-300 rounded text-xs">Cancel</button>
                </div>
              </div>

              <!-- Gift Package Panel -->
              <div :if={@gift_char == char["id"]} class="mt-4 p-4 bg-amber-900/10 border border-amber-800/30 rounded-lg">
                <h4 class="text-xs font-bold text-amber-400 mb-3">Gift Package</h4>
                <form phx-change="update_gift" class="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <span class="text-[10px] text-zinc-500 block mb-1">Gold</span>
                    <input type="number" name="gold" value={@gift_gold}
                      class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300" />
                  </div>
                  <div>
                    <span class="text-[10px] text-zinc-500 block mb-1">XP</span>
                    <input type="number" name="xp" value={@gift_xp} min="0"
                      class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300" />
                  </div>
                  <div>
                    <span class="text-[10px] text-zinc-500 block mb-1">Message</span>
                    <input type="text" name="message" value={@gift_message} placeholder="Optional note..."
                      class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300" />
                  </div>
                </form>
                <!-- Item search -->
                <div class="mb-3">
                  <span class="text-[10px] text-zinc-500 block mb-1">Add Items</span>
                  <input type="text" placeholder="Search items..." value={@gift_item_search} phx-keyup="gift_item_search"
                    class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 mb-1" />
                  <div :if={@gift_items != []} class="bg-zinc-900 border border-zinc-700 rounded p-1 max-h-32 overflow-y-auto">
                    <button :for={item <- @gift_items}
                      phx-click="gift_add_item" phx-value-item-id={item.id} phx-value-item-name={item.name}
                      class="block w-full text-left px-2 py-1 text-xs text-zinc-300 hover:bg-amber-900/30 rounded">
                      {item.icon} {item.name} <span class={"text-[10px] #{rarity_color(item.rarity)}"}>{item.rarity}</span>
                    </button>
                  </div>
                </div>
                <!-- Selected items -->
                <div :if={@gift_selected_items != []} class="space-y-1 mb-3">
                  <div :for={{item, idx} <- Enum.with_index(@gift_selected_items)} class="flex items-center gap-2 text-xs">
                    <span class="text-zinc-300">{item.qty}x {item.name}</span>
                    <button phx-click="gift_remove_item" phx-value-idx={idx} class="text-red-500 text-[10px]">x</button>
                  </div>
                </div>
                <div class="flex gap-2">
                  <button phx-click="send_gift" class="px-3 py-1.5 bg-amber-700 text-white rounded text-xs hover:bg-amber-600">Send Gift</button>
                  <button phx-click="cancel_gift" class="px-3 py-1.5 bg-zinc-700 text-zinc-300 rounded text-xs">Cancel</button>
                </div>
              </div>
            </div>
            <div :if={@chars == []} class="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center text-zinc-600 text-sm">No characters</div>
          </div>

          <!-- Right: Actions + Activity -->
          <div class="space-y-6">
            <!-- Quick Actions -->
            <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4">Actions</h3>

              <!-- Role -->
              <div class="mb-4">
                <span class="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Set Role</span>
                <div class="flex gap-1 flex-wrap">
                  <button :for={r <- ~w(PLAYER MOD GM ADMIN OWNER)}
                    phx-click="set_role" phx-value-role={r}
                    class={["px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors",
                      (@player["role"] || "PLAYER") == r && "ring-1 ring-amber-400", role_color(r)]}>{r}</button>
                </div>
              </div>

              <!-- Gold -->
              <div class="mb-4">
                <span class="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Gold: <span class="text-amber-400 font-mono">{@player["currency"] || 0}</span></span>
                <form phx-submit="give_gold" class="flex gap-1">
                  <input type="number" name="amount" value="1000"
                    class="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300" />
                  <button type="submit" class="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs">Give</button>
                </form>
              </div>

              <!-- Mute -->
              <div class="mb-4">
                <span class="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Mute</span>
                <div :if={@player["is_muted"] != 1} class="flex gap-1">
                  <select phx-change="update_mute_duration" name="value"
                    class="px-1.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300">
                    <option :for={{label, val} <- @duration_options} value={val} selected={@mute_duration == val}>{label}</option>
                  </select>
                  <button phx-click="mute" class="px-3 py-1.5 bg-orange-900/50 text-orange-400 border border-orange-800 rounded text-xs hover:bg-orange-800/50">Mute</button>
                </div>
                <div :if={@player["is_muted"] == 1} class="space-y-1">
                  <div :if={@player["mute_expires_at"]} class="text-[10px] text-orange-400/70">Expires: {format_date(@player["mute_expires_at"])}</div>
                  <button phx-click="unmute" class="px-3 py-1.5 bg-orange-700 text-white rounded text-xs hover:bg-orange-600">Unmute</button>
                </div>
              </div>

              <!-- Freeze -->
              <div class="mb-4">
                <button :if={@player["is_frozen"] != 1} phx-click="freeze"
                  class="w-full px-3 py-2 bg-cyan-900/50 text-cyan-400 border border-cyan-800 rounded text-xs hover:bg-cyan-800/50">Freeze Player</button>
                <button :if={@player["is_frozen"] == 1} phx-click="unfreeze"
                  class="w-full px-3 py-2 bg-cyan-700 text-white rounded text-xs hover:bg-cyan-600">Unfreeze Player</button>
              </div>

              <!-- Kick -->
              <div class="mb-4">
                <button phx-click="kick" data-confirm="Kick this player?"
                  class="w-full px-3 py-2 bg-yellow-900/50 text-yellow-400 border border-yellow-800 rounded text-xs hover:bg-yellow-800/50">Force Kick</button>
              </div>

              <!-- Ban -->
              <div class="mb-4 pt-3 border-t border-zinc-800">
                <span class="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Ban</span>
                <div :if={@player["is_banned"] != 1} class="space-y-1">
                  <div class="flex gap-1">
                    <select phx-change="update_ban_duration" name="value"
                      class="px-1.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300">
                      <option :for={{label, val} <- @duration_options} value={val} selected={@ban_duration == val}>{label}</option>
                    </select>
                    <input type="text" placeholder="Reason..." value={@ban_reason} phx-keyup="update_ban_reason"
                      class="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 min-w-0" />
                  </div>
                  <button phx-click="ban" data-confirm="Ban this player?"
                    class="w-full px-3 py-2 bg-red-900/50 text-red-400 border border-red-800 rounded text-xs hover:bg-red-800/50">Ban Player</button>
                </div>
                <div :if={@player["is_banned"] == 1} class="space-y-1">
                  <div :if={@player["ban_reason"]} class="text-[10px] text-red-400/70 italic">Reason: {@player["ban_reason"]}</div>
                  <div :if={@player["ban_expires_at"]} class="text-[10px] text-red-400/70">Expires: {format_date(@player["ban_expires_at"])}</div>
                  <button phx-click="unban"
                    class="w-full px-3 py-2 bg-green-900/50 text-green-400 border border-green-800 rounded text-xs hover:bg-green-800/50">Unban Player</button>
                </div>
              </div>

              <!-- Broadcast Popup -->
              <div class="mb-4 pt-3 border-t border-zinc-800">
                <span class="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Broadcast Popup</span>
                <div class="flex gap-1">
                  <input type="text" placeholder="Message to show..." value={@broadcast_message} phx-keyup="update_broadcast_msg"
                    class="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 min-w-0" />
                  <button phx-click="send_broadcast" class="px-3 py-1.5 bg-blue-900/50 text-blue-400 border border-blue-800 rounded text-xs hover:bg-blue-800/50">Send</button>
                </div>
              </div>

              <!-- System Message -->
              <div class="pt-3 border-t border-zinc-800">
                <span class="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">System Message (Inbox)</span>
                <form phx-change="update_sys_msg" phx-submit="send_system_message" class="space-y-1">
                  <input type="text" name="subject" placeholder="Subject..." value={@sys_msg_subject}
                    class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300" />
                  <textarea name="body" placeholder="Message body..." rows="2" phx-debounce="300"
                    class="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300">{@sys_msg_body}</textarea>
                  <button type="submit" class="w-full px-3 py-1.5 bg-blue-900/50 text-blue-400 border border-blue-800 rounded text-xs hover:bg-blue-800/50">Send Message</button>
                </form>
              </div>
            </div>

            <!-- Warning History -->
            <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4">Warnings ({length(@player_warnings)})</h3>
              <div class="space-y-2 max-h-48 overflow-y-auto">
                <div :for={w <- @player_warnings} class="flex items-start gap-2 py-1.5 border-b border-zinc-800/50 last:border-0">
                  <span class={["text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
                    w.severity == "critical" && "bg-red-900/50 text-red-400",
                    w.severity == "high" && "bg-orange-900/50 text-orange-400",
                    w.severity == "medium" && "bg-yellow-900/50 text-yellow-400",
                    w.severity == "low" && "bg-zinc-800 text-zinc-400"]}>{w.severity}</span>
                  <span class="text-xs text-zinc-300 flex-1">{w.reason}</span>
                  <div class="text-right shrink-0">
                    <div class="text-[10px] text-zinc-500">{w.issued_by}</div>
                    <div class="text-[10px] text-zinc-600">{format_date(w.timestamp)}</div>
                  </div>
                </div>
                <div :if={@player_warnings == []} class="text-xs text-zinc-600 py-2 text-center">No warnings</div>
              </div>
            </div>

            <!-- Moderation History -->
            <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4">Moderation Log ({length(@mod_history)})</h3>
              <div class="space-y-2 max-h-64 overflow-y-auto">
                <div :for={m <- @mod_history} class="flex items-start gap-2 py-1.5 border-b border-zinc-800/50 last:border-0">
                  <span class={["text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0", mod_action_color(m.action)]}>{m.action}</span>
                  <div class="flex-1 min-w-0">
                    <span :if={m.reason} class="text-xs text-zinc-400 block truncate">{m.reason}</span>
                    <span :if={m.duration} class="text-[10px] text-zinc-600">Duration: {format_duration_minutes(m.duration)}</span>
                  </div>
                  <div class="text-right shrink-0">
                    <div class="text-[10px] text-zinc-500">{m.by}</div>
                    <div class="text-[10px] text-zinc-600">{format_date(m.timestamp)}</div>
                  </div>
                </div>
                <div :if={@mod_history == []} class="text-xs text-zinc-600 py-2 text-center">No moderation actions</div>
              </div>
            </div>

            <!-- Admin Notes -->
            <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4">Admin Notes</h3>
              <form phx-submit="add_player_note" phx-change="update_note_input" class="mb-3">
                <div class="flex gap-2">
                  <input type="text" name="body" value={@note_input} placeholder="Add a private note..."
                    class="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200" />
                  <button type="submit" class="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs">Add</button>
                </div>
              </form>
              <div class="space-y-2 max-h-48 overflow-y-auto">
                <div :for={note <- @player_notes} class="flex items-start gap-2 py-1.5 border-b border-zinc-800/50 last:border-0 group">
                  <div class="flex-1">
                    <div class="text-xs text-zinc-300">{note.body}</div>
                    <div class="text-[10px] text-zinc-600">{note.author} -- {format_date(note.timestamp)}</div>
                  </div>
                  <button phx-click="delete_player_note" phx-value-id={note.id}
                    data-confirm="Delete this note?"
                    class="text-red-500 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0">x</button>
                </div>
                <div :if={@player_notes == []} class="text-xs text-zinc-600 py-2 text-center">No notes yet</div>
              </div>
            </div>

            <!-- Activity Log -->
            <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4">Recent Activity</h3>
              <div class="space-y-2 max-h-64 overflow-y-auto">
                <div :for={event <- @activity} class="flex items-center gap-2 py-1.5 border-b border-zinc-800/50 last:border-0">
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-amber-400/80 font-mono shrink-0">{event.type}</span>
                  <span class="text-xs text-zinc-400 truncate flex-1">{event.actor || "System"}</span>
                  <span class="text-[10px] text-zinc-600 shrink-0">{format_date(event.timestamp)}</span>
                </div>
                <div :if={@activity == []} class="text-sm text-zinc-600 py-4 text-center">No activity</div>
              </div>
            </div>
          </div>
        </div>
      <% else %>
        <div class="text-center py-12 text-zinc-500">Player not found.</div>
      <% end %>
    </div>
    """
  end

  # ── Sub-components ─────────────────────────────────────────────

  attr :field, :string, required: true
  attr :label, :string, required: true
  attr :value, :any, required: true
  attr :editing, :any, required: true
  attr :edit_value, :string, required: true

  defp editable_field(assigns) do
    ~H"""
    <div>
      <span class="text-[10px] text-zinc-500 uppercase tracking-wider">{@label}</span>
      <div :if={@editing == @field} class="flex gap-1 mt-0.5">
        <input type="text" value={@edit_value} phx-keyup="update_edit_value" phx-value-value={@edit_value}
          class="flex-1 px-2 py-1 bg-zinc-800 border border-amber-600 rounded text-sm text-zinc-200 focus:outline-none" autofocus />
        <button phx-click="save_edit" phx-value-field={@field} class="px-2 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-xs">Save</button>
        <button phx-click="cancel_edit" class="px-2 py-1 bg-zinc-700 text-zinc-300 rounded text-xs">x</button>
      </div>
      <div :if={@editing != @field} class="flex items-center gap-1.5 mt-0.5 group">
        <span class="text-sm text-zinc-300">{to_string(@value || "--")}</span>
        <button phx-click="start_edit" phx-value-field={@field}
          class="text-zinc-600 hover:text-amber-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">edit</button>
      </div>
    </div>
    """
  end

  attr :char_id, :any, required: true
  attr :field, :string, required: true
  attr :value, :any, required: true
  attr :editing_char, :any, required: true
  attr :char_edit_field, :any, required: true
  attr :char_edit_value, :string, required: true
  attr :class, :string, default: "text-sm text-zinc-300"
  attr :label, :string, default: nil
  attr :prefix, :string, default: nil
  attr :placeholder, :string, default: "..."

  defp char_editable(assigns) do
    is_editing = assigns.editing_char == assigns.char_id and assigns.char_edit_field == assigns.field
    assigns = assign(assigns, :is_editing, is_editing)

    ~H"""
    <div>
      <span :if={@label} class="text-[10px] text-zinc-500 uppercase tracking-wider block mb-0.5">{@label}</span>
      <div :if={@is_editing} class="flex gap-1">
        <input type="text" value={@char_edit_value} phx-keyup="update_char_edit_value" phx-value-value={@char_edit_value}
          class="flex-1 px-2 py-1 bg-zinc-800 border border-amber-600 rounded text-xs text-zinc-200 focus:outline-none min-w-0" autofocus />
        <button phx-click="save_char_field" phx-value-char_id={@char_id} phx-value-field={@field}
          class="px-1.5 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-xs shrink-0">ok</button>
        <button phx-click="cancel_char_edit"
          class="px-1.5 py-1 bg-zinc-700 text-zinc-300 rounded text-xs shrink-0">x</button>
      </div>
      <div :if={!@is_editing} class="group flex items-center gap-1 cursor-pointer"
        phx-click="edit_char_field" phx-value-char_id={@char_id} phx-value-field={@field}>
        <span class={@class}>{if @prefix, do: @prefix, else: ""}{to_string(@value || @placeholder)}</span>
        <span class="text-zinc-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity">edit</span>
      </div>
    </div>
    """
  end

  attr :char_id, :any, required: true
  attr :field, :string, required: true
  attr :label, :string, required: true
  attr :value, :any, required: true
  attr :max, :any, required: true
  attr :color, :string, required: true
  attr :editing_char, :any, required: true
  attr :char_edit_field, :any, required: true
  attr :char_edit_value, :string, required: true

  defp editable_stat(assigns) do
    is_editing = assigns.editing_char == assigns.char_id and assigns.char_edit_field == assigns.field
    assigns = assign(assigns, :is_editing, is_editing)

    ~H"""
    <div class="text-center">
      <div :if={@is_editing} class="flex gap-0.5">
        <input type="number" value={@char_edit_value}
          phx-keyup="update_char_edit_value" phx-value-value={@char_edit_value}
          class="w-12 px-1 py-0.5 bg-zinc-800 border border-amber-600 rounded text-xs text-center" autofocus />
        <button phx-click="save_char_field" phx-value-char_id={@char_id} phx-value-field={@field}
          class="text-green-400 text-xs">ok</button>
      </div>
      <div :if={!@is_editing}
        class={"text-sm font-mono font-bold #{@color} cursor-pointer hover:underline"}
        phx-click="edit_char_field" phx-value-char_id={@char_id} phx-value-field={@field}>
        {@value}/{@max}
      </div>
      <div class="text-[9px] text-zinc-500 uppercase">{@label}</div>
    </div>
    """
  end

  attr :char_id, :any, required: true
  attr :field, :string, required: true
  attr :label, :string, required: true
  attr :value, :any, required: true
  attr :color, :string, required: true
  attr :editing_char, :any, required: true
  attr :char_edit_field, :any, required: true
  attr :char_edit_value, :string, required: true

  defp editable_mini_stat(assigns) do
    is_editing = assigns.editing_char == assigns.char_id and assigns.char_edit_field == assigns.field
    assigns = assign(assigns, :is_editing, is_editing)

    ~H"""
    <div class="text-center">
      <div :if={@is_editing} class="flex gap-0.5">
        <input type="number" value={@char_edit_value}
          phx-keyup="update_char_edit_value" phx-value-value={@char_edit_value}
          class="w-12 px-1 py-0.5 bg-zinc-800 border border-amber-600 rounded text-xs text-center" autofocus />
        <button phx-click="save_char_field" phx-value-char_id={@char_id} phx-value-field={@field}
          class="text-green-400 text-xs">ok</button>
      </div>
      <div :if={!@is_editing}
        class={"text-sm font-mono font-bold #{@color} cursor-pointer hover:underline"}
        phx-click="edit_char_field" phx-value-char_id={@char_id} phx-value-field={@field}>
        {@value || 0}
      </div>
      <div class="text-[9px] text-zinc-500 uppercase">{@label}</div>
    </div>
    """
  end

  # ── Helpers ────────────────────────────────────────────────────

  defp parse_duration("permanent"), do: {nil, nil}
  defp parse_duration("15m"), do: {minutes_from_now(15), 15}
  defp parse_duration("1h"), do: {minutes_from_now(60), 60}
  defp parse_duration("6h"), do: {minutes_from_now(360), 360}
  defp parse_duration("24h"), do: {minutes_from_now(1440), 1440}
  defp parse_duration("3d"), do: {minutes_from_now(4320), 4320}
  defp parse_duration("7d"), do: {minutes_from_now(10080), 10080}
  defp parse_duration("30d"), do: {minutes_from_now(43200), 43200}
  defp parse_duration(_), do: {nil, nil}

  defp minutes_from_now(minutes) do
    NaiveDateTime.utc_now() |> NaiveDateTime.add(minutes * 60, :second)
  end

  defp log_moderation(user_id, action_type, reason, duration_minutes, expires_at, actor, detail \\ nil) do
    detail_str = if detail, do: Jason.encode!(detail), else: nil
    Repo.query(
      "INSERT INTO moderation_actions (user_id, action_type, reason, duration_minutes, expires_at, performed_by_id, performed_by_name, detail_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [user_id, action_type, reason, duration_minutes, expires_at, actor.id, actor.name, detail_str]
    )
  end

  defp kick_player_from_game(user_id) do
    chars = PlayerRegistry.all() |> Enum.filter(fn p -> p[:user_id] == user_id end)
    for p <- chars do
      TePhoenixWeb.Endpoint.broadcast!("user:#{p[:char_id]}", "force_disconnect", %{reason: "You have been kicked by an administrator."})
      PlayerRegistry.delete(p[:char_id])
    end
    length(chars)
  end

  defp load_toggles do
    settings = case Repo.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('use_classes','use_races','use_hp_mp','stat_mode')") do
      {:ok, %{rows: rows}} -> Map.new(rows, fn [k, v] -> {k, v} end)
      _ -> %{}
    end

    %{
      use_classes: settings["use_classes"] != "false",
      use_races: settings["use_races"] != "false",
      use_hp_mp: settings["use_hp_mp"] != "false"
    }
  end

  defp load_stat_mode do
    case Repo.query("SELECT stat_mode, primary_stat_name, custom_stats_json FROM game_campaign_rulesets WHERE is_active=1 LIMIT 1") do
      {:ok, %{rows: [[mode, primary, custom_json]]}} when not is_nil(mode) ->
        custom = case custom_json do
          j when is_binary(j) and j != "" ->
            case Jason.decode(j) do
              {:ok, list} when is_list(list) -> list
              _ -> []
            end
          _ -> []
        end
        {to_string(mode), to_string(primary || "Power Level"), custom}
      _ ->
        settings = case Repo.query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('stat_mode','primary_stat_name')") do
          {:ok, %{rows: rows}} -> Map.new(rows, fn [k, v] -> {k, v} end)
          _ -> %{}
        end
        {settings["stat_mode"] || "standard", settings["primary_stat_name"] || "Power Level", []}
    end
  end

  @standard_stats [
    %{field: "atk", label: "ATK", color: "text-red-400"},
    %{field: "def", label: "DEF", color: "text-amber-400"},
    %{field: "mo", label: "MO", color: "text-purple-400"},
    %{field: "md", label: "MD", color: "text-cyan-400"},
    %{field: "speed", label: "SPD", color: "text-yellow-400"},
    %{field: "luck", label: "LCK", color: "text-pink-400"},
  ]

  @dnd_stats [
    %{field: "atk", label: "STR", color: "text-red-400"},
    %{field: "def", label: "CON", color: "text-amber-400"},
    %{field: "mo", label: "INT", color: "text-purple-400"},
    %{field: "md", label: "WIS", color: "text-cyan-400"},
    %{field: "speed", label: "DEX", color: "text-yellow-400"},
    %{field: "luck", label: "CHA", color: "text-pink-400"},
  ]

  defp stat_definitions("single"), do: []
  defp stat_definitions("dnd"), do: @dnd_stats
  defp stat_definitions(_), do: @standard_stats

  defp stat_mode_label("single"), do: "Single Stat (Power Level)"
  defp stat_mode_label("dnd"), do: "D&D Ability Scores"
  defp stat_mode_label("custom"), do: "Custom Stats"
  defp stat_mode_label(_), do: "Standard Stats"

  defp query_rows(sql) do
    case Repo.query(sql) do
      {:ok, %{rows: rows, columns: cols}} ->
        Enum.map(rows, fn row -> Enum.zip(cols, row) |> Map.new() end)
      _ -> []
    end
  end

  defp actor(socket), do: %{id: socket.assigns[:session_user_id], name: socket.assigns[:session_username] || "Admin"}
  defp target(socket), do: %{id: socket.assigns.user_id, name: (socket.assigns.player || %{})["username"]}

  defp mod_action_color("ban"), do: "bg-red-900/50 text-red-400"
  defp mod_action_color("unban"), do: "bg-green-900/50 text-green-400"
  defp mod_action_color("mute"), do: "bg-orange-900/50 text-orange-400"
  defp mod_action_color("unmute"), do: "bg-green-900/50 text-green-400"
  defp mod_action_color("kick"), do: "bg-yellow-900/50 text-yellow-400"
  defp mod_action_color("freeze"), do: "bg-cyan-900/50 text-cyan-400"
  defp mod_action_color("unfreeze"), do: "bg-cyan-900/30 text-cyan-500"
  defp mod_action_color("warn"), do: "bg-yellow-900/50 text-yellow-400"
  defp mod_action_color("wipe"), do: "bg-red-900/50 text-red-300"
  defp mod_action_color("item_recall"), do: "bg-red-900/30 text-red-500"
  defp mod_action_color(_), do: "bg-zinc-800 text-zinc-400"

  defp rarity_color(nil), do: "text-zinc-400"
  defp rarity_color(r) when is_binary(r) do
    case String.downcase(r) do
      "common" -> "text-zinc-400"
      "uncommon" -> "text-green-400"
      "rare" -> "text-blue-400"
      "epic" -> "text-purple-400"
      "legendary" -> "text-amber-400"
      "mythic" -> "text-red-400"
      _ -> "text-zinc-400"
    end
  end
  defp rarity_color(_), do: "text-zinc-400"

  defp role_color(role) when role in ["OWNER", "ADMIN"], do: "bg-red-900/50 text-red-400"
  defp role_color("GM"), do: "bg-purple-900/50 text-purple-400"
  defp role_color("MOD"), do: "bg-blue-900/50 text-blue-400"
  defp role_color("STAFF"), do: "bg-cyan-900/50 text-cyan-400"
  defp role_color(_), do: "bg-zinc-800 text-zinc-400"

  defp format_date(nil), do: "--"
  defp format_date(%NaiveDateTime{} = ts), do: Calendar.strftime(ts, "%b %d, %Y %H:%M")
  defp format_date(%DateTime{} = ts), do: Calendar.strftime(ts, "%b %d, %Y %H:%M")
  defp format_date(ts), do: to_string(ts)

  defp format_duration_minutes(nil), do: ""
  defp format_duration_minutes(m) when m < 60, do: "#{m}m"
  defp format_duration_minutes(m) when m < 1440, do: "#{div(m, 60)}h"
  defp format_duration_minutes(m), do: "#{div(m, 1440)}d"

  defp to_int(val) when is_integer(val), do: val
  defp to_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp to_int(_), do: 0
end
