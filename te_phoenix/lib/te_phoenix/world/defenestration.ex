defmodule TePhoenix.World.Defenestration do
  @moduledoc """
  Defenestration Combat Mechanics (*Díchaochadh Trí Fhuinneog*).

  Enables players and brawlers to violently launch combatants through window portals:
    * Contested Athletics/Strength roll (D20 + STR mod).
    * Fortification check: Iron window bars completely block defenestration (target bounces off).
    * Glass Shattering: Closed/cracked windows shatter violently into shards (75 dB crash),
      inflicting 1d6+2 glass puncture damage and Bleeding status.
    * Map Transition: Ejects the victim through the aperture between interior sub-maps and exterior streets!
    * Street Fall Damage: Target impacts cobblestones outside (1d8 bludgeoning) and is knocked Prone.
  """

  alias TePhoenix.Repo
  alias TePhoenix.World.BuildingManager
  alias TePhoenix.Game.PlayerRegistry
  require Logger

  @doc """
  Executes a defenestration attempt by `attacker` against `target` near a window.
  """
  def defenestrate(attacker, target, map_id, window_x, window_y) do
    BuildingManager.ensure_schema!()

    # 1. Verify window exists within reach (dist <= 2)
    window = BuildingManager.get_window_at(map_id, window_x, window_y, 2)

    if is_nil(window) do
      {:error, "No window within reach for defenestration."}
    else
      # Check if window is fortified with iron bars
      if window[:iron_bars] or window["iron_bars"] do
        {:ok, %{
          success: false,
          blocked_by_bars: true,
          damage: 3,
          message: "CLANG! Heavy iron bars block the window! The target slams hard against the iron grate, bruising their ribs (3 bludgeoning damage), but remains inside!"
        }}
      else
        # 2. Contested Strength roll
        atk_str = attacker[:atk] || attacker["atk"] || 10
        atk_mod = div(atk_str - 10, 2)
        atk_d20 = :rand.uniform(20)
        atk_total = atk_d20 + atk_mod

        def_def = target[:def] || target["def"] || 10
        def_mod = div(def_def - 10, 2)
        def_d20 = :rand.uniform(20)
        def_total = def_d20 + def_mod

        attacker_name = attacker[:name] || attacker["name"] || "Attacker"
        target_name = target[:name] || target["name"] || "Target"

        if atk_total >= def_total do
          # Success! Target is defenestrated!
          current_state = window.state

          # Glass shatter check
          {glass_shattered, glass_damage, bleeding} =
            if current_state in ["closed", "cracked"] do
              # Break the window!
              BuildingManager.set_window_state(map_id, window.building_id, window.window_x, window.window_y, "broken")

              TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "window_noise", %{
                window_x: window.window_x,
                window_y: window.window_y,
                decibels: 75,
                radius: 18,
                sound: "glass_shattered",
                description: "CRASH! #{target_name} was thrown violently through the glass window by #{attacker_name}!",
                timestamp: System.system_time(:second)
              })

              {true, :rand.uniform(6) + 2, true}
            else
              {false, :rand.uniform(4), false}
            end

          # Street Fall Damage
          fall_damage = :rand.uniform(8)
          total_damage = glass_damage + fall_damage

          # Map transition: determine destination map and coordinates
          {dest_map, dest_x, dest_y, location_desc} =
            if map_id == window.interior_map_id do
              # Thrown from interior OUT to exterior street
              {window.building_id |> get_parent_map_id(map_id), window.window_x, window.window_y, "the cobblestone street below"}
            else
              # Thrown from exterior IN to interior room
              {window.interior_map_id, window.interior_door_x, window.interior_door_y, "the interior floorboards"}
            end

          # Apply position update to target (player or NPC)
          apply_target_movement(target, dest_map, dest_x, dest_y, total_damage)

          # Broadcast defenestration event to both maps
          event_payload = %{
            attacker_name: attacker_name,
            target_name: target_name,
            origin_map_id: map_id,
            destination_map_id: dest_map,
            dest_x: dest_x,
            dest_y: dest_y,
            glass_shattered: glass_shattered,
            damage: total_damage,
            status: "prone",
            bleeding: bleeding,
            description: "OUT THE WINDOW! #{attacker_name} hoisted #{target_name} and hurled them through the window, crashing into #{location_desc}!",
            timestamp: System.system_time(:second)
          }

          TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "combatant_defenestrated", event_payload)
          TePhoenixWeb.Endpoint.broadcast("map:#{dest_map}", "combatant_defenestrated", event_payload)

          {:ok, %{
            success: true,
            attacker_roll: atk_total,
            defender_roll: def_total,
            glass_shattered: glass_shattered,
            glass_damage: glass_damage,
            fall_damage: fall_damage,
            total_damage: total_damage,
            dest_map_id: dest_map,
            dest_x: dest_x,
            dest_y: dest_y,
            bleeding: bleeding,
            prone: true,
            message: "DEFENESTRATED! With a mighty heave, #{attacker_name} launched #{target_name} through the window! Glass explodes outward as they plunge down onto #{location_desc} for #{total_damage} damage!"
          }}
        else
          {:ok, %{
            success: false,
            attacker_roll: atk_total,
            defender_roll: def_total,
            message: "#{target_name} dug their heels into the floorboards and reversed the grapple, avoiding the window ledge!"
          }}
        end
      end
    end
  end

  defp get_parent_map_id(building_id, current_interior_map_id) do
    case Repo.query("SELECT map_id FROM game_buildings WHERE id = ? LIMIT 1", [building_id]) do
      {:ok, %{rows: [[parent_map]]}} -> parent_map
      _ ->
        case Repo.query("SELECT map_id FROM game_buildings WHERE interior_map_id = ? LIMIT 1", [current_interior_map_id]) do
          {:ok, %{rows: [[parent_map]]}} -> parent_map
          _ -> 1
        end
    end
  end

  defp apply_target_movement(target, dest_map, dest_x, dest_y, damage) do
    target_id = target[:id] || target["id"]

    is_player = target[:is_player] || target["is_player"] || (target_id && is_nil(target[:role]))

    if is_player do
      # Player target
      PlayerRegistry.update_coords(target_id, dest_map, dest_x, dest_y)
      Repo.query("UPDATE characters SET map_id = ?, x = ?, y = ?, current_hp = GREATEST(1, current_hp - ?) WHERE id = ?", [dest_map, dest_x, dest_y, damage, target_id])
    else
      # NPC target
      Repo.query("UPDATE game_npcs SET map_id = ?, x = ?, y = ?, hp = GREATEST(1, hp - ?) WHERE id = ?", [dest_map, dest_x, dest_y, damage, target_id])
    end
  end
end
