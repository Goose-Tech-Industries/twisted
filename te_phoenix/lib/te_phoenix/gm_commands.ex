defmodule TePhoenix.GmCommands do
  @moduledoc """
  GM/Admin slash commands executed from chat. Returns {:handled, socket} or :not_handled.
  Ported from gm_commands.js.

  Commands: /help, /tp, /goto, /tphere, /heal, /givegold, /givexp, /setflag,
  /npcmood, /killnpc, /weather, /spawnnpc, /setlevel, /kick
  """

  require Logger

  alias TePhoenix.Game.{PlayerRegistry, MapData}
  alias TePhoenix.Repo

  @role_rank %{"OWNER" => 5, "ADMIN" => 4, "GM" => 3, "MOD" => 2, "STAFF" => 1, "PLAYER" => 0}

  defp rank(role), do: Map.get(@role_rank, String.upcase(to_string(role || "")), 0)
  defp is_mod?(role), do: rank(role) >= 2
  defp is_gm?(role), do: rank(role) >= 3
  defp is_admin?(role), do: rank(role) >= 4

  defp sys(socket, text), do: Phoenix.Channel.push(socket, "chat_msg", %{channel: "system", from: "GM", text: text, ts: System.system_time(:millisecond)})
  defp sys_ok(socket, text), do: sys(socket, text)
  defp sys_err(socket, text), do: sys(socket, text)

  @doc "Handle a /command. Returns {:handled, socket} or :not_handled."
  def handle(text, socket, player) do
    if not String.starts_with?(text, "/"), do: :not_handled

    [cmd | args] = text |> String.slice(1..-1//1) |> String.trim() |> String.split(~r/\s+/)
    cmd = String.downcase(cmd)

    if not is_mod?(player.role) do
      sys_err(socket, "Unknown command: /#{cmd}")
      {:handled, socket}
    else
      do_command(cmd, args, socket, player)
    end
  end

  defp do_command("help", _args, socket, _player) do
    lines = """
    <b>Movement</b>
      /tp <mapId> [x] [y] — teleport yourself
      /goto <player> — jump to a player
      /tphere <player> — pull a player to you
    <b>World</b>
      /setflag <key> <value> — set a world flag
      /npcmood <name> <mood> — change NPC mood
      /killnpc <name> — kill an NPC
      /weather <effect> — map screen effect
      /spawnnpc <id> [x] [y] — spawn NPC
    <b>Rewards</b>
      /givegold <amount> [player] — give gold
      /givexp <amount> [player] — give XP
      /heal [player] — fully restore HP & MP
    <b>Admin only</b>
      /setlevel <level> [player] — set level
      /kick <player> — disconnect a player
    """
    sys(socket, lines)
    {:handled, socket}
  end

  defp do_command("tp", args, socket, player) do
    case args do
      [map_id_str | rest] ->
        map_id = parse_int(map_id_str)
        x = Enum.at(rest, 0)
        y = Enum.at(rest, 1)
        teleport_player(player.char_id, map_id, x, y)
        sys_ok(socket, "Teleported to map #{map_id}.")
      _ ->
        sys_err(socket, "Usage: /tp <mapId> [x] [y]")
    end
    {:handled, socket}
  end

  defp do_command("goto", [target_name | _], socket, player) do
    case find_player(target_name) do
      nil -> sys_err(socket, "Player \"#{target_name}\" not found online.")
      target ->
        teleport_player(player.char_id, target.map_id, target.x, target.y)
        sys_ok(socket, "Jumped to #{target.name}.")
    end
    {:handled, socket}
  end

  defp do_command("tphere", [target_name | _], socket, player) do
    case find_player(target_name) do
      nil -> sys_err(socket, "Player \"#{target_name}\" not found online.")
      target ->
        teleport_player(target.char_id, player.map_id, player.x, player.y)
        TePhoenixWeb.Endpoint.broadcast!("user:#{target.char_id}", "notification",
          %{type: "info", message: "A GM has teleported you."})
        sys_ok(socket, "Pulled #{target.name} to your location.")
    end
    {:handled, socket}
  end

  defp do_command("heal", args, socket, player) do
    {target_id, target_name} = resolve_target(args, player)

    case Repo.query("SELECT max_hp, max_mp FROM characters WHERE id=?", [target_id]) do
      {:ok, %{rows: [[max_hp, max_mp]]}} ->
        Repo.query!("UPDATE characters SET current_hp=?, current_mp=? WHERE id=?", [max_hp, max_mp, target_id])
        TePhoenixWeb.Endpoint.broadcast!("user:#{target_id}", "gm_heal",
          %{hp: max_hp, maxHp: max_hp, mp: max_mp, maxMp: max_mp})
        sys_ok(socket, "Fully healed #{target_name}. (#{max_hp} HP / #{max_mp} MP)")
      _ ->
        sys_err(socket, "Character not found.")
    end
    {:handled, socket}
  end

  defp do_command("givegold", args, socket, player) do
    if not is_gm?(player.role), do: (sys_err(socket, "GM+ required."); {:handled, socket})

    case args do
      [amount_str | rest] ->
        amount = parse_int(amount_str)
        if amount <= 0 do
          sys_err(socket, "Usage: /givegold <amount> [player]")
        else
          {target_id, target_name} = resolve_target(rest, player)
          target = PlayerRegistry.get(target_id) || player
          Repo.query!("UPDATE users SET currency=currency+? WHERE id=?", [amount, target.user_id])
          TePhoenixWeb.Endpoint.broadcast!("user:#{target_id}", "gm_gold_update", %{delta: amount})
          sys_ok(socket, "Gave #{amount} gold to #{target_name}.")
        end
      _ ->
        sys_err(socket, "Usage: /givegold <amount> [player]")
    end
    {:handled, socket}
  end

  defp do_command("givexp", args, socket, player) do
    if not is_gm?(player.role), do: (sys_err(socket, "GM+ required."); {:handled, socket})

    case args do
      [amount_str | rest] ->
        amount = parse_int(amount_str)
        if amount <= 0 do
          sys_err(socket, "Usage: /givexp <amount> [player]")
        else
          {target_id, target_name} = resolve_target(rest, player)
          Repo.query!("UPDATE characters SET experience=experience+? WHERE id=?", [amount, target_id])
          TePhoenixWeb.Endpoint.broadcast!("user:#{target_id}", "gm_xp_update", %{delta: amount})
          sys_ok(socket, "Gave #{amount} XP to #{target_name}.")
        end
      _ ->
        sys_err(socket, "Usage: /givexp <amount> [player]")
    end
    {:handled, socket}
  end

  defp do_command("setflag", args, socket, player) do
    if not is_gm?(player.role), do: (sys_err(socket, "GM+ required."); {:handled, socket})

    case args do
      [key | value_parts] when value_parts != [] ->
        value = Enum.join(value_parts, " ")
        try do
          Repo.query!("INSERT INTO world_flags (flag_key, flag_value) VALUES (?,?) ON DUPLICATE KEY UPDATE flag_value=VALUES(flag_value)",
            [key, value])
          sys_ok(socket, "World flag set: #{key} = #{value}")
        rescue
          _ -> sys_err(socket, "setflag failed.")
        end
      _ ->
        sys_err(socket, "Usage: /setflag <key> <value>")
    end
    {:handled, socket}
  end

  @valid_moods ~w(happy fearful angry grieving excited clear)
  defp do_command("npcmood", args, socket, _player) do
    case args do
      [npc_name, mood] when mood in @valid_moods ->
        actual_mood = if mood == "clear", do: nil, else: mood
        try do
          Repo.query!("UPDATE game_npcs SET mood=? WHERE name=?", [actual_mood, npc_name])
          sys_ok(socket, "#{npc_name}'s mood -> #{actual_mood || "neutral"}.")
        rescue
          _ -> sys_err(socket, "npcmood failed.")
        end
      _ ->
        sys_err(socket, "Usage: /npcmood <name> <happy|fearful|angry|grieving|excited|clear>")
    end
    {:handled, socket}
  end

  defp do_command("killnpc", args, socket, player) do
    if not is_gm?(player.role), do: (sys_err(socket, "GM+ required."); {:handled, socket})

    npc_name = Enum.join(args, " ")
    if npc_name == "" do
      sys_err(socket, "Usage: /killnpc <npcName>")
    else
      try do
        Repo.query!("UPDATE game_npcs SET is_dead=1, death_cause=? WHERE name=?",
          ["Slain by GM #{player.name}", npc_name])
        sys_ok(socket, "#{npc_name} has been killed.")
        TePhoenixWeb.Endpoint.broadcast!("map:#{player.map_id}", "chat_msg",
          %{channel: "local", from: "System", text: "#{npc_name} has fallen.", ts: System.system_time(:millisecond)})
      rescue
        _ -> sys_err(socket, "killnpc failed.")
      end
    end
    {:handled, socket}
  end

  defp do_command("weather", [effect | rest], socket, player) do
    duration = parse_int(List.first(rest) || "2000")
    TePhoenixWeb.Endpoint.broadcast!("map:#{player.map_id}", "screen_effect",
      %{effect: effect, duration: duration})
    sys_ok(socket, "Screen effect \"#{effect}\" sent to map #{player.map_id}.")
    {:handled, socket}
  end

  defp do_command("spawnnpc", args, socket, player) do
    if not is_gm?(player.role), do: (sys_err(socket, "GM+ required."); {:handled, socket})

    case args do
      [npc_id_str | rest] ->
        npc_id = parse_int(npc_id_str)
        x = parse_int(Enum.at(rest, 0) || to_string(player.x))
        y = parse_int(Enum.at(rest, 1) || to_string(player.y))

        case Repo.query("SELECT name FROM game_npcs WHERE id=?", [npc_id]) do
          {:ok, %{rows: [[name]]}} ->
            Repo.query("UPDATE game_npcs SET map_id=?, x=?, y=? WHERE id=?", [player.map_id, x, y, npc_id])
            MapData.invalidate(player.map_id)
            TePhoenixWeb.Endpoint.broadcast!("map:#{player.map_id}", "npc_arrived",
              %{npcId: npc_id, name: name, x: x, y: y})
            sys_ok(socket, "Spawned #{name} at (#{x}, #{y}) on map #{player.map_id}.")
          _ ->
            sys_err(socket, "NPC id #{npc_id} not found.")
        end
      _ ->
        sys_err(socket, "Usage: /spawnnpc <npcId> [x] [y]")
    end
    {:handled, socket}
  end

  defp do_command("setlevel", args, socket, player) do
    if not is_admin?(player.role), do: (sys_err(socket, "Admin only."); {:handled, socket})

    case args do
      [level_str | rest] ->
        level = parse_int(level_str)
        if level < 1 or level > 999 do
          sys_err(socket, "Usage: /setlevel <1-999> [player]")
        else
          {target_id, target_name} = resolve_target(rest, player)
          Repo.query!("UPDATE characters SET level=? WHERE id=?", [level, target_id])
          PlayerRegistry.update(target_id, %{level: level})
          TePhoenixWeb.Endpoint.broadcast!("user:#{target_id}", "gm_level_set", %{level: level})
          sys_ok(socket, "Set #{target_name}'s level to #{level}.")
        end
      _ ->
        sys_err(socket, "Usage: /setlevel <level> [player]")
    end
    {:handled, socket}
  end

  defp do_command("kick", [target_name | _], socket, player) do
    if not is_admin?(player.role), do: (sys_err(socket, "Admin only."); {:handled, socket})

    case find_player(target_name) do
      nil ->
        sys_err(socket, "Player \"#{target_name}\" not found.")
      target ->
        TePhoenixWeb.Endpoint.broadcast!("user:#{target.char_id}", "force_disconnect",
          %{reason: "You have been disconnected by a GM."})
        sys_ok(socket, "Kicked #{target.name}.")
    end
    {:handled, socket}
  end

  defp do_command(cmd, _args, socket, _player) do
    sys_err(socket, "Unknown command: /#{cmd}. Type /help for the list.")
    {:handled, socket}
  end

  # ── Helpers ──────────────────────────────────────────────────────

  defp find_player(name) do
    lower = String.downcase(name)
    PlayerRegistry.all()
    |> Enum.find(fn p -> String.downcase(p.name) == lower end)
  end

  defp resolve_target([], player), do: {player.char_id, player.name}
  defp resolve_target([name | _], player) do
    case find_player(name) do
      nil -> {player.char_id, player.name}
      target -> {target.char_id, target.name}
    end
  end

  defp teleport_player(char_id, map_id, x, y) do
    map_data = MapData.get(map_id)
    spawn_x = if x, do: parse_int(x), else: (map_data && map_data.spawn_x) || 10
    spawn_y = if y, do: parse_int(y), else: (map_data && map_data.spawn_y) || 10

    PlayerRegistry.update(char_id, %{map_id: map_id, x: spawn_x, y: spawn_y})
    Repo.query("UPDATE characters SET map_id=?, x=?, y=? WHERE id=?", [map_id, spawn_x, spawn_y, char_id])

    TePhoenixWeb.Endpoint.broadcast!("user:#{char_id}", "event_action",
      %{cmd: "teleport", map_id: map_id, x: spawn_x, y: spawn_y})
  end

  defp parse_int(val) when is_integer(val), do: val
  defp parse_int(val) when is_binary(val) do
    case Integer.parse(val) do
      {n, _} -> n
      :error -> 0
    end
  end
  defp parse_int(_), do: 0
end
