defmodule TePhoenixWeb.Admin.PlayerProfileLive do
  use TePhoenixWeb, :live_view

  alias TePhoenix.Repo
  alias TePhoenix.Game.AdminAudit

  @impl true
  def mount(%{"id" => id}, _session, socket) do
    user_id = to_int(id)

    classes = query_rows("SELECT id, name FROM game_classes ORDER BY name")
    races = query_rows("SELECT id, name FROM game_races ORDER BY name")
    maps = query_rows("SELECT id, name FROM game_maps WHERE is_active=1 ORDER BY name")

    # Load active stat mode from rulesets (or fall back to system_settings)
    {stat_mode, primary_stat_name, custom_stats} = load_stat_mode()
    toggles = load_toggles()

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
      use_hp_mp: toggles.use_hp_mp
    ) |> load_player()}
  end

  defp load_player(socket) do
    user_id = socket.assigns.user_id

    player = case Repo.query(
      "SELECT id, username, email, role, currency, is_banned, ban_reason, email_verified, created_at, last_login, login_streak, last_login_date, invite_code, referred_by, chat_color, warning_level, max_characters FROM users WHERE id=?",
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

    assign(socket,
      player: player,
      chars: chars,
      inventory_counts: inventory_counts,
      activity: activity,
      player_notes: player_notes,
      player_warnings: player_warnings
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
      col = field
      val = if field in ~w(currency warning_level max_characters), do: to_int(value), else: value

      case Repo.query("UPDATE users SET `#{col}`=? WHERE id=?", [val, user_id]) do
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

  def handle_event("ban", _params, socket) do
    Repo.query("UPDATE users SET is_banned=1 WHERE id=?", [socket.assigns.user_id])
    AdminAudit.log("gm_ban", actor(socket), target(socket))
    {:noreply, socket |> put_flash(:info, "Player banned.") |> load_player()}
  end

  def handle_event("unban", _params, socket) do
    Repo.query("UPDATE users SET is_banned=0, ban_reason=NULL WHERE id=?", [socket.assigns.user_id])
    AdminAudit.log("gm_unban", actor(socket), target(socket))
    {:noreply, socket |> put_flash(:info, "Player unbanned.") |> load_player()}
  end

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

  # ── Inventory viewer ───────────────────────────────────────────

  def handle_event("toggle_inventory", %{"char-id" => char_id}, socket) do
    cid = to_int(char_id)
    if socket.assigns.inventory_open == cid do
      {:noreply, assign(socket, inventory_open: nil, inventory_items: [], inv_search: "")}
    else
      items = load_inventory(cid)
      # Lazy-load item catalog for the picker
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
      # Check if they already have this item — stack it
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
          %{id: id, item_id: item_id, quantity: qty, name: name || "???", icon: icon || "📦",
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
      <!-- Back link -->
      <a href={~p"/sauce/players"} class="text-xs text-zinc-500 hover:text-amber-400 mb-4 inline-block">← Back to Players</a>

      <%= if @player do %>
        <!-- Header -->
        <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 class="text-2xl font-bold"><.styled_name name={@player["username"]} role={@player["role"] || "PLAYER"} chat_color={@player["chat_color"]} class="text-2xl font-bold" /></h2>
            <p class="text-xs text-zinc-500 mt-0.5">User #{@player["id"]} · Joined {format_date(@player["created_at"])}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class={[
              "px-2.5 py-1 rounded text-xs font-bold uppercase",
              role_color(@player["role"])
            ]}>{@player["role"] || "PLAYER"}</span>
            <span :if={@player["is_banned"] == 1} class="px-2.5 py-1 rounded text-xs font-bold bg-red-900/50 text-red-400">BANNED</span>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Left: Account Info -->
          <div class="lg:col-span-2 space-y-6">
            <!-- Account Details -->
            <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4">Account Details</h3>
              <div class="grid grid-cols-2 gap-4">
                <.editable_field field="username" label="Username" value={@player["username"]} editing={@editing} edit_value={@edit_value} />
                <.editable_field field="email" label="Email" value={@player["email"]} editing={@editing} edit_value={@edit_value} />
                <!-- Name Style (full-width) -->
                <div class="col-span-2 border-t border-zinc-800 pt-4">
                  <span class="text-[10px] text-zinc-500 uppercase tracking-wider block mb-2">Name Style</span>
                  <!-- Live preview -->
                  <div class="flex items-center gap-3 mb-3 p-2 bg-zinc-800/50 rounded-lg">
                    <span class="text-[10px] text-zinc-600">Preview:</span>
                    <.styled_name name={@player["username"]} role={@player["role"]} chat_color={@player["chat_color"]} class="text-lg font-bold" />
                  </div>

                  <!-- Row 1: Reset + Solid Colors -->
                  <div class="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5">Solid Colors</div>
                  <div class="flex flex-wrap gap-1.5 mb-3">
                    <button phx-click="set_chat_color" phx-value-color="" phx-value-user_id={@player["id"]}
                      title="Default (role effect)"
                      class={"w-7 h-7 rounded-full border-2 flex items-center justify-center text-[9px] #{if is_nil(@player["chat_color"]) || @player["chat_color"] == "", do: "border-amber-400", else: "border-zinc-700 hover:border-zinc-500"} bg-zinc-800"}>✨</button>
                    <button :for={c <- ~w(#f87171 #fb923c #facc15 #4ade80 #2dd4bf #60a5fa #a78bfa #f472b6)}
                      phx-click="set_chat_color" phx-value-color={c} phx-value-user_id={@player["id"]}
                      class={"w-7 h-7 rounded-full border-2 transition-colors #{if @player["chat_color"] == c, do: "border-white scale-110", else: "border-transparent hover:border-zinc-500"}"}
                      style={"background: #{c}"}></button>
                  </div>
                  <div class="flex flex-wrap gap-1.5 mb-4">
                    <button :for={c <- ~w(#e2e8f0 #ff6b6b #ffd93d #6bcb77 #4d96ff #ff6fff #00d2ff #94a3b8 #c084fc #f97316)}
                      phx-click="set_chat_color" phx-value-color={c} phx-value-user_id={@player["id"]}
                      class={"w-7 h-7 rounded-full border-2 transition-colors #{if @player["chat_color"] == c, do: "border-white scale-110", else: "border-transparent hover:border-zinc-500"}"}
                      style={"background: #{c}"}></button>
                  </div>

                  <!-- Row 2: Gradient Presets (emoji buttons) -->
                  <div class="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5">Gradients</div>
                  <div class="flex flex-wrap gap-1.5 mb-3">
                    <button :for={{emoji, gradient} <- [
                      {"🌊", "gradient:linear-gradient(90deg,#60a5fa,#2dd4bf,#4ade80)"},
                      {"🔥", "gradient:linear-gradient(90deg,#f87171,#fb923c,#facc15)"},
                      {"💜", "gradient:linear-gradient(90deg,#a78bfa,#f472b6,#fb923c)"},
                      {"🖤", "gradient:linear-gradient(90deg,#4ade80,#1a1a1a,#2dd4bf)"},
                      {"❄️", "gradient:linear-gradient(90deg,#60a5fa,#e2e8f0,#a78bfa)"},
                      {"🩸", "gradient:linear-gradient(90deg,#f87171,#1a1a1a,#f87171)"},
                      {"🌅", "gradient:linear-gradient(90deg,#f97316,#facc15,#fb923c)"},
                      {"💀", "gradient:linear-gradient(90deg,#1a1a1a,#6b21a8,#1a1a1a)"},
                      {"🌈", "gradient:linear-gradient(90deg,#f87171,#facc15,#4ade80,#60a5fa,#a78bfa)"},
                      {"⚡", "gradient:linear-gradient(90deg,#facc15,#60a5fa,#facc15)"}
                    ]}
                      phx-click="set_chat_color" phx-value-color={gradient} phx-value-user_id={@player["id"]}
                      class={"w-7 h-7 rounded-full border-2 text-center text-sm leading-7 transition-colors #{if @player["chat_color"] == gradient, do: "border-white scale-110 bg-zinc-700", else: "border-zinc-700 hover:border-zinc-500 bg-zinc-800"}"}>{emoji}</button>
                  </div>

                  <!-- Custom Gradient (compact) -->
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
                  <div class="text-sm text-zinc-300 mt-0.5 font-mono">{@player["invite_code"] || "—"}</div>
                </div>
              </div>
            </div>

            <!-- Characters -->
            <div :for={char <- @chars} class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <!-- Header -->
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-3">
                  <!-- Sprite preview -->
                  <div class="w-12 h-12 bg-zinc-800 rounded-lg border border-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
                    <img :if={char["sprite_sheet_url"] && char["sprite_sheet_url"] != ""}
                      src={char["sprite_sheet_url"]}
                      class="w-8 h-8 object-contain image-rendering-pixelated"
                      style="image-rendering: pixelated" />
                    <span :if={!char["sprite_sheet_url"] || char["sprite_sheet_url"] == ""} class="text-2xl">⚔️</span>
                  </div>
                  <div>
                    <.char_editable char_id={char["id"]} field="name" value={char["name"]} editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} class="text-lg font-bold text-zinc-200" />
                    <div class="text-xs text-zinc-500">
                      <span :if={@use_classes}>{char["class_name"]}</span>
                      <span :if={@use_classes && @use_races}> · </span>
                      <span :if={@use_races}>{char["race_name"]}</span>
                      <span :if={@use_classes || @use_races}> · </span>
                      ID #{char["id"]}
                    </div>
                  </div>
                </div>
                <div class="text-right">
                  <.char_editable char_id={char["id"]} field="level" value={char["level"]} editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} class="text-amber-400 font-mono font-bold text-lg" prefix="Lv." />
                </div>
              </div>

              <!-- Class / Race / Map dropdowns (conditionally shown) -->
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

              <!-- Stats (click to edit) — adapts to stat mode -->
              <div class="mb-4">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-[10px] text-zinc-600 uppercase tracking-wider">
                    {stat_mode_label(@stat_mode)}
                  </span>
                </div>

                <!-- Single stat mode (Power Level — no classes, no HP/MP) -->
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

                <!-- Standard / DnD / Custom stat mode -->
                <div :if={@stat_mode != "single"} class="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  <.editable_stat :if={@use_hp_mp} char_id={char["id"]} field="current_hp" label="HP" value={char["current_hp"]} max={char["max_hp"]} color="text-green-400" editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} />
                  <.editable_stat :if={@use_hp_mp} char_id={char["id"]} field="current_mp" label="MP" value={char["current_mp"]} max={char["max_mp"]} color="text-blue-400" editing_char={@editing_char} char_edit_field={@char_edit_field} char_edit_value={@char_edit_value} />
                  <.editable_mini_stat
                    :for={s <- stat_definitions(@stat_mode)}
                    char_id={char["id"]}
                    field={s.field}
                    label={s.label}
                    value={char[s.field]}
                    color={s.color}
                    editing_char={@editing_char}
                    char_edit_field={@char_edit_field}
                    char_edit_value={@char_edit_value}
                  />
                </div>
              </div>

              <!-- Location + XP -->
              <div class="flex items-center gap-4 text-xs text-zinc-500 mb-4">
                <span>📍 {char["map_name"] || "Map #{char["map_id"]}"} ({char["x"]},{char["y"]})</span>
                <span>⚡ {char["experience"]} XP</span>
                <span>💀 {char["death_count"] || 0} deaths</span>
                <button phx-click="toggle_inventory" phx-value-char-id={char["id"]}
                  class={["hover:text-amber-400 transition-colors cursor-pointer",
                           @inventory_open == char["id"] && "text-amber-400"]}>
                  {if @inventory_open == char["id"], do: "▼", else: "▶"} 📦 {Map.get(@inventory_counts, char["id"], 0)} items
                </button>
              </div>

              <!-- Inventory Viewer -->
              <div :if={@inventory_open == char["id"]} class="border border-amber-800/30 bg-zinc-950/50 rounded-lg p-4 mb-4">
                <div class="flex items-center justify-between mb-3">
                  <h4 class="text-xs font-bold uppercase tracking-wider text-amber-400">Inventory</h4>
                  <div class="flex gap-2 items-center">
                    <input type="text" placeholder="Give item..." value={@inv_search}
                      phx-keyup="inv_search_change"
                      class="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-200 w-48" />
                  </div>
                </div>
                <!-- Item picker dropdown -->
                <div :if={@inv_search != "" && String.length(@inv_search) >= 2} class="mb-3 bg-zinc-900 border border-zinc-700 rounded p-2 max-h-40 overflow-y-auto">
                  <div class="text-[10px] text-zinc-500 mb-1">Click to give item:</div>
                  <%= for item <- Enum.filter(@all_items, fn i -> String.contains?(String.downcase(i.name), String.downcase(@inv_search)) end) |> Enum.take(10) do %>
                    <button phx-click="inv_give_item" phx-value-char-id={char["id"]} phx-value-item-id={item.id}
                      class="block w-full text-left px-2 py-1.5 text-xs text-zinc-300 hover:bg-amber-900/30 hover:text-amber-300 rounded transition-colors">
                      <span class="mr-1">{item.icon}</span>
                      <span>{item.name}</span>
                      <span class={"ml-2 text-[10px] #{rarity_color(item.rarity)}"}>{item.rarity}</span>
                      <span :if={item.type} class="ml-1 text-[10px] text-zinc-600">{item.type}</span>
                    </button>
                  <% end %>
                  <div :if={Enum.filter(@all_items, fn i -> String.contains?(String.downcase(i.name), String.downcase(@inv_search)) end) == []}
                    class="text-xs text-zinc-600 italic py-1">No matching items</div>
                </div>
                <!-- Inventory grid -->
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
                      data-confirm="Remove this item?"
                      class="text-red-500 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                  </div>
                  <% end %>
                  <!-- Inventory summary -->
                  <div class="flex gap-4 pt-2 mt-2 border-t border-zinc-800 text-[10px] text-zinc-500">
                    <span>{length(@inventory_items)} unique items</span>
                    <span>{Enum.reduce(@inventory_items, 0, fn i, acc -> acc + (i.quantity || 0) end)} total stacked</span>
                    <span class="text-amber-500/70">{Enum.reduce(@inventory_items, 0, fn i, acc -> acc + (i.value || 0) * (i.quantity || 0) end)}g total value</span>
                  </div>
                </div>
                <div :if={@inventory_items == []} class="text-xs text-zinc-600 italic py-2 text-center">
                  Empty inventory — search above to give items
                </div>
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

              <!-- Actions -->
              <div class="flex gap-2 flex-wrap border-t border-zinc-800 pt-4">
                <button phx-click="heal_char" phx-value-id={char["id"]}
                  class="px-2.5 py-1.5 bg-green-900/50 text-green-400 border border-green-800 rounded text-xs hover:bg-green-800/50">💚 Heal</button>
                <form phx-submit="give_xp" class="flex gap-1">
                  <input type="hidden" name="char_id" value={char["id"]} />
                  <input type="number" name="amount" value="100" min="1"
                    class="w-20 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300" />
                  <button type="submit"
                    class="px-2.5 py-1.5 bg-blue-900/50 text-blue-400 border border-blue-800 rounded text-xs hover:bg-blue-800/50">⚡ +XP</button>
                </form>
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
                    class={[
                      "px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors",
                      (@player["role"] || "PLAYER") == r && "ring-1 ring-amber-400",
                      role_color(r)
                    ]}>{r}</button>
                </div>
              </div>

              <!-- Gold -->
              <div class="mb-4">
                <span class="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Gold: <span class="text-amber-400 font-mono">{@player["currency"] || 0}</span></span>
                <form phx-submit="give_gold" class="flex gap-1">
                  <input type="number" name="amount" value="1000"
                    class="flex-1 px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300" />
                  <button type="submit"
                    class="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs">Give</button>
                </form>
              </div>

              <!-- Ban -->
              <div>
                <button :if={@player["is_banned"] != 1}
                  phx-click="ban" data-confirm="Ban this player?"
                  class="w-full px-3 py-2 bg-red-900/50 text-red-400 border border-red-800 rounded text-xs hover:bg-red-800/50">Ban Player</button>
                <button :if={@player["is_banned"] == 1}
                  phx-click="unban"
                  class="w-full px-3 py-2 bg-green-900/50 text-green-400 border border-green-800 rounded text-xs hover:bg-green-800/50">Unban Player</button>
              </div>
            </div>

            <!-- Warning History -->
            <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 class="text-sm font-bold uppercase tracking-wider text-zinc-500 mb-4">
                Warnings ({length(@player_warnings)})
              </h3>
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
                    <div class="text-[10px] text-zinc-600">{note.author} · {format_date(note.timestamp)}</div>
                  </div>
                  <button phx-click="delete_player_note" phx-value-id={note.id}
                    data-confirm="Delete this note?"
                    class="text-red-500 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0">✕</button>
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
          class="flex-1 px-2 py-1 bg-zinc-800 border border-amber-600 rounded text-sm text-zinc-200 focus:outline-none"
          autofocus />
        <button phx-click="save_edit" phx-value-field={@field} class="px-2 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-xs">Save</button>
        <button phx-click="cancel_edit" class="px-2 py-1 bg-zinc-700 text-zinc-300 rounded text-xs">✕</button>
      </div>
      <div :if={@editing != @field} class="flex items-center gap-1.5 mt-0.5 group">
        <span class="text-sm text-zinc-300">{to_string(@value || "—")}</span>
        <button phx-click="start_edit" phx-value-field={@field}
          class="text-zinc-600 hover:text-amber-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">✏️</button>
      </div>
    </div>
    """
  end

  # ── Character editable field ────────────────────────────────────

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
          class="flex-1 px-2 py-1 bg-zinc-800 border border-amber-600 rounded text-xs text-zinc-200 focus:outline-none min-w-0"
          autofocus />
        <button phx-click="save_char_field" phx-value-char_id={@char_id} phx-value-field={@field}
          class="px-1.5 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-xs shrink-0">✓</button>
        <button phx-click="cancel_char_edit"
          class="px-1.5 py-1 bg-zinc-700 text-zinc-300 rounded text-xs shrink-0">✕</button>
      </div>
      <div :if={!@is_editing} class="group flex items-center gap-1 cursor-pointer"
        phx-click="edit_char_field" phx-value-char_id={@char_id} phx-value-field={@field}>
        <span class={@class}>
          {if @prefix, do: @prefix, else: ""}{to_string(@value || @placeholder)}
        </span>
        <span class="text-zinc-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity">✏️</span>
      </div>
    </div>
    """
  end

  # ── Editable stat (HP/MP with current/max) ─────────────────────

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
          class="w-12 px-1 py-0.5 bg-zinc-800 border border-amber-600 rounded text-xs text-center"
          autofocus />
        <button phx-click="save_char_field" phx-value-char_id={@char_id} phx-value-field={@field}
          class="text-green-400 text-xs">✓</button>
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

  # ── Editable mini stat (single value) ──────────────────────────

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
          class="w-12 px-1 py-0.5 bg-zinc-800 border border-amber-600 rounded text-xs text-center"
          autofocus />
        <button phx-click="save_char_field" phx-value-char_id={@char_id} phx-value-field={@field}
          class="text-green-400 text-xs">✓</button>
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
    # Try active ruleset first
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
        # Fall back to system_settings
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

  defp format_date(nil), do: "—"
  defp format_date(%NaiveDateTime{} = ts), do: Calendar.strftime(ts, "%b %d, %Y %H:%M")
  defp format_date(%DateTime{} = ts), do: Calendar.strftime(ts, "%b %d, %Y %H:%M")
  defp format_date(ts), do: to_string(ts)

  defp to_int(val) when is_integer(val), do: val
  defp to_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp to_int(_), do: 0
end
