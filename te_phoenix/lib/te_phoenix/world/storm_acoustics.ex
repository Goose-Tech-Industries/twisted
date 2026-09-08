defmodule TePhoenix.World.StormAcoustics do
  @moduledoc """
  Environmental Storm Acoustics & Dynamic Wind Drafts (*Fuaimneach na Stoirme*).

  Simulates realistic atmospheric audio physics and weather interplay:
    * **Rain Noise Floor (Acoustic Mask)**:
      - Heavy rain and blizzards elevate the ambient noise floor (+20-45 dB),
        attenuating footsteps and voices, and cutting sentry hearing range by up to 55%.
    * **Dynamic Thunderclaps**:
      - Periodic 95 dB thunderclaps roar across the map, completely masking sounds
        (shattered windows, lockpicking, door breaches) for 3-second windows.
    * **Gale Drafts & Candle Extinguishment**:
      - Storm winds blowing through open or broken windows create intense drafts.
      - 75% chance to blow out indoor candles and torches, plunging rooms into darkness
        (light level 0.1) and granting infiltrators a +5 Stealth bonus!
  """

  alias TePhoenix.World.{Weather, BuildingManager}
  require Logger

  @weather_sound_masks %{
    "clear" => %{mask_db: 0, hearing_mult: 1.0, is_gale: false},
    "fog" => %{mask_db: 5, hearing_mult: 0.95, is_gale: false},
    "snow" => %{mask_db: 10, hearing_mult: 0.85, is_gale: false},
    "rain" => %{mask_db: 22, hearing_mult: 0.75, is_gale: false},
    "heavy_rain" => %{mask_db: 36, hearing_mult: 0.55, is_gale: true},
    "thunderstorm" => %{mask_db: 48, hearing_mult: 0.45, is_gale: true},
    "blizzard" => %{mask_db: 38, hearing_mult: 0.50, is_gale: true},
    "sandstorm" => %{mask_db: 35, hearing_mult: 0.55, is_gale: true}
  }

  @doc """
  Returns the atmospheric acoustic properties and stealth masks for the map.
  """
  def get_storm_acoustic_mask(map_id) do
    weather = Weather.get_weather(map_id)
    key = (weather && weather.key) || "clear"
    spec = Map.get(@weather_sound_masks, key, @weather_sound_masks["clear"])

    Map.merge(spec, %{
      weather_key: key,
      weather_name: (weather && weather.name) || "Clear",
      weather_icon: (weather && weather.icon) || "☀️"
    })
  end

  @doc """
  Triggers a dynamic thunderclap during thunderstorm weather.
  Masks all sounds made on the map for 3 seconds.
  """
  def trigger_thunderclap(map_id) do
    TePhoenixWeb.Endpoint.broadcast("map:#{map_id}", "weather_thunderclap", %{
      decibels: 95,
      duration_seconds: 3,
      message: "BOOOOM! A deafening thunderclap shatters the sky! All ambient sounds are drowned out!",
      timestamp: System.system_time(:second)
    })

    %{
      active: true,
      decibels: 95,
      masking_duration_seconds: 3,
      message: "Thunder rolls overhead! Your footstep noises and lockpicking are completely concealed!"
    }
  end

  @doc """
  Evaluates whether gale winds from exterior storm weather blow through open/broken windows
  into an interior building room, extinguishing candle/torch light sources.
  """
  def evaluate_indoor_draft(exterior_map_id, building_id_or_key) do
    mask = get_storm_acoustic_mask(exterior_map_id)

    building =
      cond do
        is_integer(building_id_or_key) -> BuildingManager.get_building(building_id_or_key)
        is_binary(building_id_or_key) -> BuildingManager.get_building(exterior_map_id, building_id_or_key)
        true -> nil
      end

    if is_nil(building) do
      {:error, :building_not_found}
    else
      # Check if any window is open or broken
      drafty_window = Enum.find(building.windows, fn win ->
        state = win["state"] || win[:state] || "closed"
        state in ["open", "broken"]
      end)

      if mask.is_gale and not is_nil(drafty_window) do
        # Gale drafts howling through the open/broken window!
        extinguish_roll = :rand.uniform(100)
        extinguished = extinguish_roll <= 75

        interior_map = building.interior_map_id

        if extinguished do
          TePhoenixWeb.Endpoint.broadcast("map:#{interior_map}", "room_draft_extinguished", %{
            building_id: building.id,
            building_name: building.name,
            window_state: drafty_window["state"] || drafty_window[:state],
            light_level: 0.1,
            stealth_bonus: 5,
            message: "WHOOSH! A violent gust of storm wind roars through the open window, snuffed out all the candles! The room is plunged into pitch darkness!",
            timestamp: System.system_time(:second)
          })
        end

        {:ok, %{
          draft_active: true,
          gale_weather: mask.weather_name,
          window_state: drafty_window["state"] || drafty_window[:state],
          candles_extinguished: extinguished,
          light_level: if(extinguished, do: 0.1, else: 0.6),
          stealth_bonus: if(extinguished, do: 5, else: 0),
          message: if(extinguished,
            do: "Storm gales burst through the open window, plunging the room into pitch black! (+5 Stealth)",
            else: "The howling storm wind flickers the candle flames wildly, but the tallow holds.")
        }}
      else
        {:ok, %{
          draft_active: false,
          candles_extinguished: false,
          light_level: 1.0,
          stealth_bonus: 0,
          message: "The interior air remains calm and well-sheltered."
        }}
      end
    end
  end
end
