defmodule TePhoenixWeb.Game.GodsEyeHandler do
  @moduledoc """
  Channel event handler for the God's Eye Surveillance Grid & Omnipresence Engine (*An tSúil Uile*).

  Allows connected players and DMs to:
    * Request real-time sector sonar sweeps and realm radar updates.
    * Perform active acoustic echolocation pings that detect hidden entities and measure bearings.
    * Wiretap conscious minds (reading live emotional/subconscious state via Sovereign Soul Engine).
    * Call down orbital strikes, celestial supply drops, and divine whispers.
  """

  import Phoenix.Channel
  require Logger

  alias TePhoenix.Game.PlayerRegistry
  alias TePhoenix.World.GodsEye

  @doc "Performs a full realm radar scan across all active maps and entities."
  def handle("gods_eye_scan", _payload, socket) do
    data = GodsEye.scan_realm()
    push(socket, "gods_eye_scan_result", data)
    {:noreply, socket}
  end

  @doc "Dispatches a localized tactical sonar echolocation ping centered on the player."
  def handle("gods_eye_sonar_ping", payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])

    map_id = (p && p.map_id) || payload["map_id"] || 1
    x = (p && p.x) || payload["x"] || 10
    y = (p && p.y) || payload["y"] || 10
    radius = payload["radius"] || 15

    case GodsEye.sonar_ping_map(map_id, x, y, radius) do
      {:ok, ping_data} ->
        push(socket, "gods_eye_sonar_result", ping_data)
        {:noreply, socket}

      {:error, reason} ->
        push(socket, "gods_eye_sonar_result", %{error: to_string(reason)})
        {:noreply, socket}
    end
  end

  @doc "Wiretaps an entity's conscious thoughts and biometric telemetry."
  def handle("gods_eye_wiretap", %{"type" => type, "id" => id}, socket) do
    case GodsEye.wiretap_entity(type, id) do
      {:ok, wiretap} ->
        push(socket, "gods_eye_wiretap_result", wiretap)
        {:noreply, socket}

      {:error, reason} ->
        push(socket, "gods_eye_wiretap_result", %{error: to_string(reason)})
        {:noreply, socket}
    end
  end

  @doc "Triggers an orbital lightning strike on target coordinates."
  def handle("gods_eye_orbital_strike", payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    map_id = payload["map_id"] || (p && p.map_id) || 1
    x = payload["x"] || (p && p.x) || 10
    y = payload["y"] || (p && p.y) || 10
    damage = payload["damage"] || 750

    result = GodsEye.orbital_strike(map_id, x, y, damage: damage)
    push(socket, "gods_eye_strike_result", result)
    {:noreply, socket}
  end

  @doc "Deploys a celestial supply cache to target coordinates."
  def handle("gods_eye_supply_drop", payload, socket) do
    p = PlayerRegistry.get(socket.assigns[:char_id])
    map_id = payload["map_id"] || (p && p.map_id) || 1
    x = payload["x"] || (p && p.x) || 10
    y = payload["y"] || (p && p.y) || 10

    result = GodsEye.orbital_supply_drop(map_id, x, y)
    push(socket, "gods_eye_supply_result", result)
    {:noreply, socket}
  end

  @doc "Transmits an omniscient direct whisper into a target player's consciousness."
  def handle("gods_eye_whisper", payload, socket) do
    target_id = payload["target_char_id"] || payload["char_id"]
    message = payload["message"] || "Uile sees all."

    if target_id do
      result = GodsEye.orbital_whisper(target_id, message)
      push(socket, "gods_eye_whisper_result", result)
    else
      push(socket, "gods_eye_whisper_result", %{error: "Target character ID required"})
    end

    {:noreply, socket}
  end
end
