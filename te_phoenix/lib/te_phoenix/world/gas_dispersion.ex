defmodule TePhoenix.World.GasDispersion do
  @moduledoc """
  Chemical Gas & Scent Dispersion Engine (*Scaoileadh Gáis Ceimiceach*).

  Allows tactical deployment of alchemical canisters through open or cracked windows:
    * **Sleeping Gas (Morpheus Mist)**:
      - Lavender vapor; occupants make Constitution saves vs DC 13 or succumb to deep sleep.
    * **Smoke Grenade (Alchemical Smokescreen)**:
      - Dense billow obscuring vision to 1 tile, breaking enemy line of sight.
    * **Skunkweed Tear Gas (Brimstone Acridity)**:
      - Violently irritates eyes and lungs, forcing non-immune occupants to evacuate
        out front doors or vault out windows to fresh air!
  """

  alias TePhoenix.Repo
  alias TePhoenix.World.BuildingManager
  require Logger

  @gas_specs %{
    "sleeping_gas" => %{
      name: "Elixir of Morpheus (Sleep Gas)",
      icon: "💤",
      color: "purple",
      duration_seconds: 60,
      dc: 13,
      effect: :sleep,
      description: "A soothing lavender vapor rolls silently across the floorboards."
    },
    "smoke_grenade" => %{
      name: "Alchemical Smokescreen",
      icon: "💨",
      color: "white",
      duration_seconds: 45,
      dc: 0,
      effect: :smoke,
      description: "Dense white smoke billows explosively, cutting visibility to 1 tile."
    },
    "skunkweed_tear_gas" => %{
      name: "Skunkweed Tear Gas",
      icon: "🦨",
      color: "green",
      duration_seconds: 40,
      dc: 14,
      effect: :evacuate,
      description: "Pungent, stinging yellowish-green fumes fill the room with blinding brimstone stench."
    }
  }

  @doc """
  Throws an alchemical gas canister through an accessible window into the interior room.
  """
  def deploy_gas(player, map_id, window_x, window_y, gas_type \\ "sleeping_gas") do
    BuildingManager.ensure_schema!()
    window = BuildingManager.get_window_at(map_id, window_x, window_y, 2)

    if is_nil(window) do
      {:error, "No window within reach."}
    else
      if window.state in ["closed", "shuttered"] do
        {:error, "The window is #{window.state}! Gas canisters bounce off unless the window is cracked, open, or broken."}
      else
        spec = Map.get(@gas_specs, gas_type, @gas_specs["sleeping_gas"])
        interior_map = window.interior_map_id

        # Evaluate effects on interior occupants
        affected_occupants = process_gas_effects(interior_map, spec, window)

        # Broadcast gas cloud event to both maps
        gas_payload = %{
          gas_type: gas_type,
          gas_name: spec.name,
          icon: spec.icon,
          color: spec.color,
          duration_seconds: spec.duration_seconds,
          building_id: window.building_id,
          building_name: window.building_name,
          interior_map_id: interior_map,
          window_x: window_x,
          window_y: window_y,
          affected_count: length(affected_occupants),
          affected: affected_occupants,
          message: "#{player[:name] || "A rogue"} tossed a canister of #{spec.name} through the #{window.state} window of #{window.building_name}!",
          timestamp: System.system_time(:second)
        }

        TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "gas_cloud_deployed", gas_payload)
        TePhoenixWeb.Endpoint.broadcast("map:#{interior_map}", "gas_cloud_active", gas_payload)

        {:ok, %{
          success: true,
          gas_type: gas_type,
          gas_name: spec.name,
          building_name: window.building_name,
          affected_count: length(affected_occupants),
          affected: affected_occupants,
          message: "TOSS! The canister clatters onto the floorboards inside #{window.building_name}! #{spec.description}"
        }}
      end
    end
  end

  defp process_gas_effects(interior_map, spec, window) do
    case Repo.query(
           "SELECT id, name, role, is_sleeping, base_def FROM game_npcs WHERE map_id = ? AND is_active = 1",
           [interior_map]
         ) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, name, role, is_sleep, con] ->
          case spec.effect do
            :sleep ->
              con_mod = div((con || 10) - 10, 2)
              roll = :rand.uniform(20) + con_mod
              saved = roll >= spec.dc

              if not saved do
                Repo.query("UPDATE game_npcs SET is_sleeping = 1 WHERE id = ?", [id])
              end

              %{id: id, name: name, role: role, saved: saved, asleep: not saved}

            :evacuate ->
              # Flee through door or window to outside street!
              flee_x = window.window_x
              flee_y = window.window_y

              Repo.query(
                "UPDATE game_npcs SET map_id = ?, x = ?, y = ?, is_sleeping = 0 WHERE id = ?",
                [window.building_id |> get_parent_map(1), flee_x, flee_y, id]
              )

              %{id: id, name: name, role: role, evacuated: true, flee_x: flee_x, flee_y: flee_y}

            :smoke ->
              %{id: id, name: name, role: role, blinded: true}
          end
        end)

      _ -> []
    end
  end

  defp get_parent_map(building_id, default) do
    case Repo.query("SELECT map_id FROM game_buildings WHERE id = ? LIMIT 1", [building_id]) do
      {:ok, %{rows: [[m]]}} -> m
      _ -> default
    end
  end
end
